"""全局单词库 CRUD。"""

import uuid
import json
import sqlite3
from datetime import datetime, timezone
from config import DATA_DIR

GLOBAL_VOCAB_DB = str(DATA_DIR / "global_vocab.db")


def _get_conn():
    conn = sqlite3.connect(GLOBAL_VOCAB_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS global_vocab (
            id TEXT PRIMARY KEY,
            word TEXT NOT NULL,
            source_lang TEXT NOT NULL,
            target_lang TEXT NOT NULL,
            phonetic TEXT,
            morphology TEXT,
            meaning TEXT,
            enriched_meaning TEXT,
            variants_detail TEXT,
            examples TEXT,
            memory_hint TEXT,
            multiple_choice TEXT,
            created_at TEXT NOT NULL,
            hit_count INTEGER DEFAULT 1,
            UNIQUE(word, source_lang, target_lang)
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_global_vocab_lookup
        ON global_vocab(word, source_lang, target_lang)
    """)
    conn.commit()
    return conn


def lookup(word: str, source_lang: str, target_lang: str) -> dict | None:
    """查询单词，命中时 hit_count++。"""
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM global_vocab WHERE word = ? AND source_lang = ? AND target_lang = ?",
        (word, source_lang, target_lang)
    ).fetchone()
    if row:
        conn.execute(
            "UPDATE global_vocab SET hit_count = hit_count + 1 WHERE id = ?",
            (row["id"],)
        )
        conn.commit()
        result = dict(row)
        # 解析 JSON 字段
        for field in ("variants_detail", "examples", "multiple_choice"):
            if result.get(field):
                try:
                    result[field] = json.loads(result[field])
                except (json.JSONDecodeError, TypeError):
                    pass
        conn.close()
        return result
    conn.close()
    return None


def upsert(word: str, source_lang: str, target_lang: str, data: dict):
    """写入或更新单词。data 可含 phonetic, morphology, meaning, enriched_meaning, variants_detail, examples, memory_hint。"""
    conn = _get_conn()

    # 序列化 JSON 字段
    variants = data.get("variants_detail")
    if variants is not None and not isinstance(variants, str):
        variants = json.dumps(variants, ensure_ascii=False)
    examples = data.get("examples")
    if examples is not None and not isinstance(examples, str):
        examples = json.dumps(examples, ensure_ascii=False)
    multiple_choice = data.get("multiple_choice")
    if multiple_choice is not None and not isinstance(multiple_choice, str):
        multiple_choice = json.dumps(multiple_choice, ensure_ascii=False)

    existing = conn.execute(
        "SELECT id FROM global_vocab WHERE word = ? AND source_lang = ? AND target_lang = ?",
        (word, source_lang, target_lang)
    ).fetchone()

    if existing:
        # 更新：只更新非空字段
        updates, params = [], []
        for key, val in [
            ("phonetic", data.get("phonetic")),
            ("morphology", data.get("morphology")),
            ("meaning", data.get("meaning")),
            ("enriched_meaning", data.get("enriched_meaning")),
            ("variants_detail", variants),
            ("examples", examples),
            ("memory_hint", data.get("memory_hint")),
            ("multiple_choice", multiple_choice),
        ]:
            if val is not None:
                updates.append(f"{key} = ?")
                params.append(val)
        if updates:
            params.append(existing["id"])
            conn.execute(f"UPDATE global_vocab SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
    else:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """INSERT INTO global_vocab
            (id, word, source_lang, target_lang, phonetic, morphology, meaning,
             enriched_meaning, variants_detail, examples, memory_hint, multiple_choice, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), word, source_lang, target_lang,
             data.get("phonetic"), data.get("morphology"), data.get("meaning"),
             data.get("enriched_meaning"), variants, examples,
             data.get("memory_hint"), multiple_choice, now)
        )
        conn.commit()
    conn.close()


def batch_upsert(words: list[dict], source_lang: str, target_lang: str):
    """批量写入单词列表。每个 dict 需含 word 字段。"""
    for w in words:
        if "word" in w:
            # 映射字段名：vocab 条目用 ipa，global_vocab 用 phonetic
            data = dict(w)
            if "ipa" in data and "phonetic" not in data:
                data["phonetic"] = data["ipa"]
            upsert(w["word"], source_lang, target_lang, data)
