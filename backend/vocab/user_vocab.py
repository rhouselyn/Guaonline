"""用户单词库 CRUD。"""

import uuid
import json
import sqlite3
from datetime import datetime, timezone
from config import DATA_DIR

USER_VOCAB_DB = str(DATA_DIR / "user_vocab.db")


def _get_conn():
    conn = sqlite3.connect(USER_VOCAB_DB)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS user_vocab (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL,
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
            UNIQUE(user_id, word, source_lang, target_lang)
        )
    """)
    conn.execute("""
        CREATE INDEX IF NOT EXISTS idx_user_vocab_lookup
        ON user_vocab(user_id, word, source_lang, target_lang)
    """)
    conn.commit()
    return conn


def lookup(user_id: str, word: str, source_lang: str, target_lang: str) -> dict | None:
    """查询用户单词库。"""
    conn = _get_conn()
    row = conn.execute(
        "SELECT * FROM user_vocab WHERE user_id = ? AND word = ? AND source_lang = ? AND target_lang = ?",
        (user_id, word, source_lang, target_lang)
    ).fetchone()
    if row:
        result = dict(row)
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


def upsert(user_id: str, word: str, source_lang: str, target_lang: str, data: dict):
    """写入或更新用户单词。"""
    conn = _get_conn()

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
        "SELECT id FROM user_vocab WHERE user_id = ? AND word = ? AND source_lang = ? AND target_lang = ?",
        (user_id, word, source_lang, target_lang)
    ).fetchone()

    if existing:
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
            conn.execute(f"UPDATE user_vocab SET {', '.join(updates)} WHERE id = ?", params)
            conn.commit()
    else:
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            """INSERT INTO user_vocab
            (id, user_id, word, source_lang, target_lang, phonetic, morphology, meaning,
             enriched_meaning, variants_detail, examples, memory_hint, multiple_choice, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (str(uuid.uuid4()), user_id, word, source_lang, target_lang,
             data.get("phonetic"), data.get("morphology"), data.get("meaning"),
             data.get("enriched_meaning"), variants, examples,
             data.get("memory_hint"), multiple_choice, now)
        )
        conn.commit()
    conn.close()


def batch_upsert(user_id: str, words: list[dict], source_lang: str, target_lang: str):
    """批量写入用户单词列表。"""
    for w in words:
        if "word" in w:
            # 映射字段名：vocab 条目用 ipa，user_vocab 用 phonetic
            data = dict(w)
            if "ipa" in data and "phonetic" not in data:
                data["phonetic"] = data["ipa"]
            upsert(user_id, w["word"], source_lang, target_lang, data)
