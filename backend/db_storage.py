"""基于 SQLite 的数据库存储，兼容文件存储过渡。

优先从数据库读写，读取时若数据库无数据则回退到文件存储。
所有写入操作同时写入数据库（可选双写文件以便回退）。
"""

import json
import sqlite3
import datetime
import threading
from pathlib import Path
from typing import List, Dict, Any, Optional

from config import DATA_DIR


class DatabaseStorage:
    def __init__(self, db_path: str = None):
        self.db_path = db_path or str(DATA_DIR / "gualingo.db")

        # SQLite 连接（每个线程独立连接）
        self._local = threading.local()
        self._init_db()

    def _get_conn(self) -> sqlite3.Connection:
        if not hasattr(self._local, 'conn') or self._local.conn is None:
            self._local.conn = sqlite3.connect(self.db_path)
            self._local.conn.row_factory = sqlite3.Row
            self._local.conn.execute("PRAGMA journal_mode=WAL")
            self._local.conn.execute("PRAGMA foreign_keys=ON")
        return self._local.conn

    def _init_db(self):
        conn = self._get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS pipeline_data (
                file_id TEXT NOT NULL,
                data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS vocab (
                file_id TEXT NOT NULL,
                vocab TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS cleaned_text (
                file_id TEXT NOT NULL,
                text TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS word_cache (
                file_id TEXT NOT NULL,
                word TEXT NOT NULL,
                word_info TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id, word)
            );

            CREATE TABLE IF NOT EXISTS language_word_index (
                source_lang TEXT NOT NULL,
                word_lower TEXT NOT NULL,
                file_id TEXT NOT NULL,
                PRIMARY KEY (source_lang, word_lower)
            );

            CREATE TABLE IF NOT EXISTS language_settings (
                file_id TEXT NOT NULL,
                source_lang TEXT NOT NULL DEFAULT 'en',
                target_lang TEXT NOT NULL DEFAULT 'zh',
                original_text TEXT,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS learning_progress (
                file_id TEXT NOT NULL,
                current_index INTEGER NOT NULL DEFAULT 0,
                max_index INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS shuffled_order (
                file_id TEXT NOT NULL,
                shuffled_indices TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS learning_plan (
                file_id TEXT NOT NULL,
                plan TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS phase_progress (
                file_id TEXT NOT NULL,
                phase INTEGER NOT NULL,
                current_unit INTEGER NOT NULL DEFAULT 0,
                current_exercise INTEGER NOT NULL DEFAULT 0,
                current_exercise_type_index INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id, phase)
            );

            CREATE TABLE IF NOT EXISTS sentence_order (
                file_id TEXT NOT NULL,
                phase INTEGER NOT NULL,
                shuffled_indices TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id, phase)
            );

            CREATE TABLE IF NOT EXISTS phase2_exercise_cache (
                file_id TEXT NOT NULL,
                exercise_id TEXT NOT NULL,
                cache_data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id, exercise_id)
            );

            CREATE TABLE IF NOT EXISTS exercise_order (
                file_id TEXT NOT NULL,
                phase INTEGER NOT NULL,
                exercise_order TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id, phase)
            );

            CREATE TABLE IF NOT EXISTS phase2_progress (
                file_id TEXT NOT NULL,
                current_exercise_index INTEGER NOT NULL DEFAULT 0,
                max_exercise_index INTEGER NOT NULL DEFAULT 0,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS used_sentences (
                file_id TEXT NOT NULL,
                used_sentences TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS history (
                file_id TEXT NOT NULL PRIMARY KEY,
                user_id TEXT,
                title TEXT NOT NULL DEFAULT '',
                source_lang TEXT NOT NULL DEFAULT 'en',
                target_lang TEXT NOT NULL DEFAULT 'zh',
                text_preview TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL,
                updated_at TEXT
            );

            CREATE TABLE IF NOT EXISTS unit_stars (
                file_id TEXT NOT NULL,
                stars_data TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS learned_words (
                file_id TEXT NOT NULL,
                words TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (file_id)
            );

            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id TEXT NOT NULL,
                prefs TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id)
            );

            CREATE TABLE IF NOT EXISTS favorite_words (
                user_id TEXT NOT NULL,
                word TEXT NOT NULL,
                source_lang TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (user_id, word, source_lang)
            );

            CREATE TABLE IF NOT EXISTS ui_translations (
                lang_code TEXT NOT NULL,
                translations TEXT NOT NULL,
                updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                PRIMARY KEY (lang_code)
            );
        """)
        conn.commit()

    # ── pipeline_data ──────────────────────────────────────

    def save_pipeline_data(self, file_id: str, data: Any):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO pipeline_data (file_id, data, updated_at) VALUES (?, ?, datetime('now'))",
            (file_id, json.dumps(data, ensure_ascii=False))
        )
        conn.commit()

    def load_pipeline_data(self, file_id: str) -> Any:
        conn = self._get_conn()
        row = conn.execute("SELECT data FROM pipeline_data WHERE file_id = ?", (file_id,)).fetchone()
        if row:
            return json.loads(row["data"])
        return {}

    # ── vocab ──────────────────────────────────────────────

    def save_vocab(self, file_id: str, vocab: List[Dict]):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO vocab (file_id, vocab, updated_at) VALUES (?, ?, datetime('now'))",
            (file_id, json.dumps(vocab, ensure_ascii=False))
        )
        conn.commit()

    def load_vocab(self, file_id: str) -> List[Dict]:
        conn = self._get_conn()
        row = conn.execute("SELECT vocab FROM vocab WHERE file_id = ?", (file_id,)).fetchone()
        if row:
            return json.loads(row["vocab"])
        return []

    # ── cleaned_text ───────────────────────────────────────

    def save_text(self, file_id: str, text: str):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO cleaned_text (file_id, text, updated_at) VALUES (?, ?, datetime('now'))",
            (file_id, text)
        )
        conn.commit()

    # ── word_cache ─────────────────────────────────────────

    def save_word_cache(self, file_id: str, word: str, word_info: Dict, overwrite_index: bool = False):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO word_cache (file_id, word, word_info, updated_at) VALUES (?, ?, ?, datetime('now'))",
            (file_id, word.lower(), json.dumps(word_info, ensure_ascii=False))
        )
        conn.commit()
        # 更新语言级索引
        try:
            settings = self.load_language_settings(file_id)
            source_lang = settings.get("source_lang", "en")
            self.add_word_to_language_index(source_lang, word, file_id, overwrite=overwrite_index)
        except Exception:
            pass
        conn.commit()

    def load_word_cache(self, file_id: str, word: str) -> Optional[Dict]:
        conn = self._get_conn()
        row = conn.execute("SELECT word_info FROM word_cache WHERE file_id = ? AND word = ?",
                           (file_id, word.lower())).fetchone()
        if row:
            return json.loads(row["word_info"])
        return None

    def load_word_cache_batch(self, file_id: str) -> Dict[str, Dict]:
        """一次取回指定 file_id 下所有 word_cache 条目，返回 {word_lower: word_info}。

        ponytail: 替代 get_vocab 等端点里逐词 load_word_cache 的 N 次 DB 往返，
        把 N 次同步 SQLite 压成 1 次。"""
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT word, word_info FROM word_cache WHERE file_id = ?",
            (file_id,)
        ).fetchall()
        result = {}
        for row in rows:
            try:
                result[row["word"]] = json.loads(row["word_info"])
            except (json.JSONDecodeError, KeyError):
                continue
        return result

    def delete_word_cache(self, file_id: str, word: str):
        conn = self._get_conn()
        conn.execute("DELETE FROM word_cache WHERE file_id = ? AND word = ?",
                     (file_id, word.lower()))
        conn.commit()

    def clear_word_cache(self, file_id: str):
        conn = self._get_conn()
        conn.execute("DELETE FROM word_cache WHERE file_id = ?", (file_id,))
        conn.commit()

    # ── language_word_index ────────────────────────────────

    def load_language_word_index(self, source_lang: str) -> Dict[str, str]:
        conn = self._get_conn()
        rows = conn.execute("SELECT word_lower, file_id FROM language_word_index WHERE source_lang = ?",
                            (source_lang,)).fetchall()
        if rows:
            return {row["word_lower"]: row["file_id"] for row in rows}
        return {}

    def _save_language_word_index_batch(self, source_lang: str, index: Dict[str, str]):
        conn = self._get_conn()
        conn.execute("DELETE FROM language_word_index WHERE source_lang = ?", (source_lang,))
        conn.executemany(
            "INSERT INTO language_word_index (source_lang, word_lower, file_id) VALUES (?, ?, ?)",
            [(source_lang, w, fid) for w, fid in index.items()]
        )
        conn.commit()

    def save_language_word_index(self, source_lang: str, index: Dict[str, str]):
        self._save_language_word_index_batch(source_lang, index)

    def add_word_to_language_index(self, source_lang: str, word: str, file_id: str, overwrite: bool = False):
        if not word or not source_lang:
            return
        word_lower = word.lower()
        conn = self._get_conn()
        if overwrite:
            conn.execute(
                "INSERT OR REPLACE INTO language_word_index (source_lang, word_lower, file_id) VALUES (?, ?, ?)",
                (source_lang, word_lower, file_id)
            )
        else:
            conn.execute(
                "INSERT OR IGNORE INTO language_word_index (source_lang, word_lower, file_id) VALUES (?, ?, ?)",
                (source_lang, word_lower, file_id)
            )
        conn.commit()

    def find_global_word_cache(self, word: str, source_lang: str) -> Optional[Dict]:
        word_lower = word.lower()
        conn = self._get_conn()
        # 先通过索引查找
        row = conn.execute(
            "SELECT wc.word_info FROM word_cache wc "
            "JOIN language_word_index lwi ON wc.file_id = lwi.file_id AND wc.word = lwi.word_lower "
            "WHERE lwi.source_lang = ? AND lwi.word_lower = ?",
            (source_lang, word_lower)
        ).fetchone()
        if row:
            data = json.loads(row["word_info"])
            cached_word = data.get("word", "").lower()
            if cached_word == word_lower:
                return data
            # 索引过期，清理
            conn.execute("DELETE FROM language_word_index WHERE source_lang = ? AND word_lower = ?",
                         (source_lang, word_lower))
            conn.commit()

        # 索引未命中或过期，直接搜索 word_cache 表（通过 language_settings 关联 source_lang）
        row = conn.execute(
            "SELECT wc.word_info FROM word_cache wc "
            "JOIN language_settings ls ON wc.file_id = ls.file_id "
            "WHERE ls.source_lang = ? AND wc.word = ?",
            (source_lang, word_lower)
        ).fetchone()
        if row:
            data = json.loads(row["word_info"])
            cached_word = data.get("word", "").lower()
            if cached_word == word_lower:
                # 修复索引：将找到的 file_id 更新到索引中
                file_id = None
                fid_row = conn.execute(
                    "SELECT wc.file_id FROM word_cache wc "
                    "JOIN language_settings ls ON wc.file_id = ls.file_id "
                    "WHERE ls.source_lang = ? AND wc.word = ? LIMIT 1",
                    (source_lang, word_lower)
                ).fetchone()
                if fid_row:
                    file_id = fid_row["file_id"]
                    self.add_word_to_language_index(source_lang, word, file_id, overwrite=True)
                return data

        return None

    # ── language_settings ──────────────────────────────────

    def save_language_settings(self, file_id: str, source_lang: str, target_lang: str, original_text: str = None):
        conn = self._get_conn()
        # 获取已有记录的 original_text
        existing = conn.execute("SELECT original_text FROM language_settings WHERE file_id = ?",
                                (file_id,)).fetchone()
        if original_text is None and existing and existing["original_text"]:
            original_text = existing["original_text"]
        conn.execute(
            "INSERT OR REPLACE INTO language_settings (file_id, source_lang, target_lang, original_text, updated_at) "
            "VALUES (?, ?, ?, ?, datetime('now'))",
            (file_id, source_lang, target_lang, original_text)
        )
        conn.commit()

    def load_language_settings(self, file_id: str) -> Dict[str, str]:
        conn = self._get_conn()
        row = conn.execute("SELECT source_lang, target_lang, original_text FROM language_settings WHERE file_id = ?",
                           (file_id,)).fetchone()
        if row:
            result = {"source_lang": row["source_lang"], "target_lang": row["target_lang"]}
            if row["original_text"]:
                result["original_text"] = row["original_text"]
            return result
        return {"source_lang": "en", "target_lang": "zh"}

    # ── learning_progress ──────────────────────────────────

    def save_learning_progress(self, file_id: str, current_index: int):
        conn = self._get_conn()
        existing = conn.execute("SELECT max_index FROM learning_progress WHERE file_id = ?",
                                (file_id,)).fetchone()
        max_index = max(existing["max_index"] if existing else 0, current_index)
        conn.execute(
            "INSERT OR REPLACE INTO learning_progress (file_id, current_index, max_index, updated_at) "
            "VALUES (?, ?, ?, datetime('now'))",
            (file_id, current_index, max_index)
        )
        conn.commit()

    def load_learning_progress(self, file_id: str) -> int:
        conn = self._get_conn()
        row = conn.execute("SELECT current_index FROM learning_progress WHERE file_id = ?",
                           (file_id,)).fetchone()
        if row is not None:
            return row["current_index"]
        return 0

    def load_learning_max_progress(self, file_id: str) -> int:
        conn = self._get_conn()
        row = conn.execute("SELECT max_index, current_index FROM learning_progress WHERE file_id = ?",
                           (file_id,)).fetchone()
        if row is not None:
            return row["max_index"] if row["max_index"] is not None else row["current_index"]
        return 0

    # ── shuffled_order ─────────────────────────────────────

    def save_shuffled_order(self, file_id: str, shuffled_indices: List[int]):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO shuffled_order (file_id, shuffled_indices, updated_at) VALUES (?, ?, datetime('now'))",
            (file_id, json.dumps(shuffled_indices))
        )
        conn.commit()

    def load_shuffled_order(self, file_id: str) -> Optional[List[int]]:
        conn = self._get_conn()
        row = conn.execute("SELECT shuffled_indices FROM shuffled_order WHERE file_id = ?",
                           (file_id,)).fetchone()
        if row:
            return json.loads(row["shuffled_indices"])
        return None

    # ── learning_plan ──────────────────────────────────────

    def save_learning_plan(self, file_id: str, plan: List[Dict]):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO learning_plan (file_id, plan, updated_at) VALUES (?, ?, datetime('now'))",
            (file_id, json.dumps(plan, ensure_ascii=False))
        )
        conn.commit()

    def load_learning_plan(self, file_id: str) -> Optional[List[Dict]]:
        conn = self._get_conn()
        row = conn.execute("SELECT plan FROM learning_plan WHERE file_id = ?",
                           (file_id,)).fetchone()
        if row:
            return json.loads(row["plan"])
        return None

    # ── phase_progress ─────────────────────────────────────

    def save_phase_progress(self, file_id: str, phase: int, unit_id: int, exercise_index: int,
                            exercise_type_index: int = 0):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO phase_progress "
            "(file_id, phase, current_unit, current_exercise, current_exercise_type_index, updated_at) "
            "VALUES (?, ?, ?, ?, ?, datetime('now'))",
            (file_id, phase, unit_id, exercise_index, exercise_type_index)
        )
        conn.commit()

    def load_phase_progress(self, file_id: str, phase: int):
        conn = self._get_conn()
        row = conn.execute(
            "SELECT current_unit, current_exercise, current_exercise_type_index FROM phase_progress "
            "WHERE file_id = ? AND phase = ?",
            (file_id, phase)
        ).fetchone()
        if row:
            return {
                "current_unit": row["current_unit"],
                "current_exercise": row["current_exercise"],
                "current_exercise_type_index": row["current_exercise_type_index"]
            }
        return {"current_unit": 0, "current_exercise": 0, "current_exercise_type_index": 0}

    # ── sentence_order ─────────────────────────────────────

    def save_sentence_order(self, file_id: str, phase: int, shuffled_indices: List[int]):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO sentence_order (file_id, phase, shuffled_indices, updated_at) "
            "VALUES (?, ?, ?, datetime('now'))",
            (file_id, phase, json.dumps(shuffled_indices))
        )
        conn.commit()

    def load_sentence_order(self, file_id: str, phase: int):
        conn = self._get_conn()
        row = conn.execute("SELECT shuffled_indices FROM sentence_order WHERE file_id = ? AND phase = ?",
                           (file_id, phase)).fetchone()
        if row:
            return json.loads(row["shuffled_indices"])
        return None

    # ── phase2_exercise_cache ──────────────────────────────

    def save_phase2_exercise_cache(self, file_id: str, exercise_id: str, cache_data: Dict):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO phase2_exercise_cache (file_id, exercise_id, cache_data, updated_at) "
            "VALUES (?, ?, ?, datetime('now'))",
            (file_id, exercise_id, json.dumps(cache_data, ensure_ascii=False))
        )
        conn.commit()

    def load_phase2_exercise_cache(self, file_id: str, exercise_id: str):
        conn = self._get_conn()
        row = conn.execute("SELECT cache_data FROM phase2_exercise_cache WHERE file_id = ? AND exercise_id = ?",
                           (file_id, exercise_id)).fetchone()
        if row:
            return json.loads(row["cache_data"])
        return None

    # ── exercise_order ─────────────────────────────────────

    def save_exercise_order(self, file_id: str, phase: int, exercise_order: List):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO exercise_order (file_id, phase, exercise_order, updated_at) "
            "VALUES (?, ?, ?, datetime('now'))",
            (file_id, phase, json.dumps(exercise_order, ensure_ascii=False))
        )
        conn.commit()

    def load_exercise_order(self, file_id: str, phase: int):
        conn = self._get_conn()
        row = conn.execute("SELECT exercise_order FROM exercise_order WHERE file_id = ? AND phase = ?",
                           (file_id, phase)).fetchone()
        if row:
            return json.loads(row["exercise_order"])
        return None

    # ── phase2_progress ────────────────────────────────────

    def save_phase2_progress(self, file_id: str, current_exercise_index: int):
        conn = self._get_conn()
        existing = conn.execute("SELECT max_exercise_index FROM phase2_progress WHERE file_id = ?",
                                (file_id,)).fetchone()
        max_index = max(existing["max_exercise_index"] if existing else 0, current_exercise_index)
        conn.execute(
            "INSERT OR REPLACE INTO phase2_progress (file_id, current_exercise_index, max_exercise_index, updated_at) "
            "VALUES (?, ?, ?, datetime('now'))",
            (file_id, current_exercise_index, max_index)
        )
        conn.commit()

    def load_phase2_progress(self, file_id: str) -> int:
        conn = self._get_conn()
        row = conn.execute("SELECT current_exercise_index FROM phase2_progress WHERE file_id = ?",
                           (file_id,)).fetchone()
        if row is not None:
            return row["current_exercise_index"]
        return 0

    def load_phase2_max_progress(self, file_id: str) -> int:
        conn = self._get_conn()
        row = conn.execute("SELECT max_exercise_index, current_exercise_index FROM phase2_progress WHERE file_id = ?",
                           (file_id,)).fetchone()
        if row is not None:
            return row["max_exercise_index"] if row["max_exercise_index"] is not None else row["current_exercise_index"]
        return 0

    # ── used_sentences ─────────────────────────────────────

    def save_used_sentences(self, file_id: str, used_sentences: List[str]):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO used_sentences (file_id, used_sentences, updated_at) VALUES (?, ?, datetime('now'))",
            (file_id, json.dumps(used_sentences, ensure_ascii=False))
        )
        conn.commit()

    def load_used_sentences(self, file_id: str) -> Optional[List[str]]:
        conn = self._get_conn()
        row = conn.execute("SELECT used_sentences FROM used_sentences WHERE file_id = ?",
                           (file_id,)).fetchone()
        if row:
            return json.loads(row["used_sentences"])
        return None

    # ── history ────────────────────────────────────────────

    def load_history(self, user_id: str = None) -> List[Dict]:
        conn = self._get_conn()
        # 确保 user_id 列存在（兼容旧数据库）
        try:
            cursor = conn.execute("PRAGMA table_info(history)")
            columns = {row[1] for row in cursor.fetchall()}
            if "user_id" not in columns:
                conn.execute("ALTER TABLE history ADD COLUMN user_id TEXT")
                conn.commit()
        except Exception:
            pass

        if user_id:
            rows = conn.execute(
                "SELECT * FROM history WHERE user_id = ? ORDER BY created_at DESC",
                (user_id,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT * FROM history ORDER BY created_at DESC").fetchall()
        if rows:
            return [dict(row) for row in rows]
        return []

    def save_history(self, records: List[Dict]):
        conn = self._get_conn()
        conn.execute("DELETE FROM history")
        for record in records:
            conn.execute(
                "INSERT INTO history (file_id, title, source_lang, target_lang, text_preview, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?)",
                (record.get("file_id"), record.get("title", ""), record.get("source_lang", "en"),
                 record.get("target_lang", "zh"), record.get("text_preview", ""),
                 record.get("created_at", ""), record.get("updated_at"))
            )
        conn.commit()

    def add_history_record(self, file_id: str, title: str, source_lang: str, target_lang: str, text_preview: str, user_id: str = None):
        now = datetime.datetime.now().isoformat()
        conn = self._get_conn()
        # 确保 user_id 列存在
        try:
            cursor = conn.execute("PRAGMA table_info(history)")
            columns = {row[1] for row in cursor.fetchall()}
            if "user_id" not in columns:
                conn.execute("ALTER TABLE history ADD COLUMN user_id TEXT")
                conn.commit()
        except Exception:
            pass

        conn.execute(
            "INSERT OR IGNORE INTO history (file_id, user_id, title, source_lang, target_lang, text_preview, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (file_id, user_id, title, source_lang, target_lang, text_preview, now)
        )
        # 如果记录已存在，更新标题和语言
        conn.execute(
            "UPDATE history SET title = ?, source_lang = ?, target_lang = ?, text_preview = ? WHERE file_id = ?",
            (title, source_lang, target_lang, text_preview, file_id)
        )
        conn.commit()
        record = {
            "file_id": file_id, "user_id": user_id, "title": title, "source_lang": source_lang,
            "target_lang": target_lang, "text_preview": text_preview, "created_at": now
        }
        return record

    def delete_history_record(self, file_id: str) -> bool:
        conn = self._get_conn()
        cursor = conn.execute("DELETE FROM history WHERE file_id = ?", (file_id,))
        deleted = cursor.rowcount > 0
        # 同时清理该 file_id 的所有关联数据
        if deleted:
            self._delete_file_data(conn, file_id)
        conn.commit()
        return deleted

    def _delete_file_data(self, conn: sqlite3.Connection, file_id: str):
        """删除某个 file_id 的所有关联数据"""
        tables = [
            "pipeline_data", "vocab", "cleaned_text", "word_cache",
            "language_settings", "learning_progress", "shuffled_order",
            "learning_plan", "phase_progress", "sentence_order",
            "phase2_exercise_cache", "exercise_order", "phase2_progress",
            "used_sentences", "unit_stars", "learned_words"
        ]
        for table in tables:
            conn.execute(f"DELETE FROM {table} WHERE file_id = ?", (file_id,))

    def rename_history_record(self, file_id: str, new_title: str) -> bool:
        conn = self._get_conn()
        cursor = conn.execute("UPDATE history SET title = ? WHERE file_id = ?", (new_title, file_id))
        conn.commit()
        return cursor.rowcount > 0

    def touch_history_record(self, file_id: str):
        now = datetime.datetime.now().isoformat()
        conn = self._get_conn()
        conn.execute("UPDATE history SET updated_at = ? WHERE file_id = ?", (now, file_id))
        conn.commit()

    # ── unit_stars ─────────────────────────────────────────

    def save_unit_stars(self, file_id: str, stars_data: Dict):
        conn = self._get_conn()
        existing = {}
        row = conn.execute("SELECT stars_data FROM unit_stars WHERE file_id = ?", (file_id,)).fetchone()
        if row:
            existing = json.loads(row["stars_data"])
        for key, count in stars_data.items():
            existing[key] = count
        conn.execute(
            "INSERT OR REPLACE INTO unit_stars (file_id, stars_data, updated_at) VALUES (?, ?, datetime('now'))",
            (file_id, json.dumps(existing, ensure_ascii=False))
        )
        conn.commit()

    def load_unit_stars(self, file_id: str) -> Dict:
        conn = self._get_conn()
        row = conn.execute("SELECT stars_data FROM unit_stars WHERE file_id = ?", (file_id,)).fetchone()
        if row:
            return json.loads(row["stars_data"])
        return {}

    # ── learned_words ──────────────────────────────────────

    def save_learned_words(self, file_id: str, words: List[str]):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO learned_words (file_id, words, updated_at) VALUES (?, ?, datetime('now'))",
            (file_id, json.dumps(words, ensure_ascii=False))
        )
        conn.commit()

    def load_learned_words(self, file_id: str) -> set:
        conn = self._get_conn()
        row = conn.execute("SELECT words FROM learned_words WHERE file_id = ?", (file_id,)).fetchone()
        if row:
            return set(w.lower() for w in json.loads(row["words"]) if w)
        return set()

    # ── user_preferences ───────────────────────────────────

    def save_user_preferences(self, prefs: Dict, user_id: str = None):
        conn = self._get_conn()
        # 兼容旧表结构
        self._ensure_prefs_user_id(conn)
        if user_id:
            conn.execute(
                "INSERT OR REPLACE INTO user_preferences (user_id, prefs, updated_at) VALUES (?, ?, datetime('now'))",
                (user_id, json.dumps(prefs, ensure_ascii=False))
            )
        else:
            conn.execute(
                "INSERT OR REPLACE INTO user_preferences (user_id, prefs, updated_at) VALUES ('__default__', ?, datetime('now'))",
                (json.dumps(prefs, ensure_ascii=False),)
            )
        conn.commit()

    def load_user_preferences(self, user_id: str = None) -> Dict:
        conn = self._get_conn()
        self._ensure_prefs_user_id(conn)
        uid = user_id or "__default__"
        row = conn.execute("SELECT prefs FROM user_preferences WHERE user_id = ?", (uid,)).fetchone()
        if row:
            return json.loads(row["prefs"])
        return {"source_lang": "auto", "target_lang": "zh", "skip_listening": False, "only_new_words": False}

    def _ensure_prefs_user_id(self, conn):
        """兼容旧表：如果 user_preferences 没有 user_id 列则迁移。"""
        try:
            cursor = conn.execute("PRAGMA table_info(user_preferences)")
            columns = {row[1] for row in cursor.fetchall()}
            if "user_id" not in columns:
                conn.execute("ALTER TABLE user_preferences RENAME TO user_preferences_old")
                conn.execute("""CREATE TABLE user_preferences (
                    user_id TEXT NOT NULL,
                    prefs TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
                    PRIMARY KEY (user_id)
                )""")
                conn.execute("INSERT OR IGNORE INTO user_preferences (user_id, prefs, updated_at) SELECT '__default__', prefs, updated_at FROM user_preferences_old")
                conn.execute("DROP TABLE user_preferences_old")
                conn.commit()
        except Exception:
            pass

    # ── favorite_words ─────────────────────────────────────

    def add_favorite_word(self, word: str, source_lang: str, user_id: str = None):
        conn = self._get_conn()
        self._ensure_fav_user_id(conn)
        uid = user_id or "__default__"
        conn.execute(
            "INSERT OR IGNORE INTO favorite_words (user_id, word, source_lang) VALUES (?, ?, ?)",
            (uid, word, source_lang)
        )
        conn.commit()

    def remove_favorite_word(self, word: str, source_lang: str, user_id: str = None):
        conn = self._get_conn()
        self._ensure_fav_user_id(conn)
        uid = user_id or "__default__"
        conn.execute(
            "DELETE FROM favorite_words WHERE user_id = ? AND word = ? AND source_lang = ?",
            (uid, word, source_lang)
        )
        conn.commit()

    def get_favorite_words(self, source_lang: str = None, user_id: str = None) -> List[str]:
        conn = self._get_conn()
        self._ensure_fav_user_id(conn)
        uid = user_id or "__default__"
        if source_lang:
            rows = conn.execute(
                "SELECT word FROM favorite_words WHERE user_id = ? AND source_lang = ? ORDER BY created_at DESC",
                (uid, source_lang)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT word FROM favorite_words WHERE user_id = ? ORDER BY created_at DESC",
                (uid,)
            ).fetchall()
        return [row["word"] for row in rows]

    def is_favorite_word(self, word: str, source_lang: str, user_id: str = None) -> bool:
        conn = self._get_conn()
        self._ensure_fav_user_id(conn)
        uid = user_id or "__default__"
        row = conn.execute(
            "SELECT 1 FROM favorite_words WHERE user_id = ? AND word = ? AND source_lang = ?",
            (uid, word, source_lang)
        ).fetchone()
        return row is not None

    def _ensure_fav_user_id(self, conn):
        """兼容旧表：如果 favorite_words 没有 user_id 列则迁移。"""
        try:
            cursor = conn.execute("PRAGMA table_info(favorite_words)")
            columns = {row[1] for row in cursor.fetchall()}
            if "user_id" not in columns:
                conn.execute("ALTER TABLE favorite_words RENAME TO favorite_words_old")
                conn.execute("""CREATE TABLE favorite_words (
                    user_id TEXT NOT NULL,
                    word TEXT NOT NULL,
                    source_lang TEXT NOT NULL,
                    created_at TEXT NOT NULL DEFAULT (datetime('now')),
                    PRIMARY KEY (user_id, word, source_lang)
                )""")
                conn.execute("INSERT OR IGNORE INTO favorite_words (user_id, word, source_lang, created_at) SELECT '__default__', word, source_lang, created_at FROM favorite_words_old")
                conn.execute("DROP TABLE favorite_words_old")
                conn.commit()
        except Exception:
            pass

    # ── ui_translations ───────────────────────────────────

    def save_ui_translations(self, lang_code: str, translations: dict):
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO ui_translations (lang_code, translations, updated_at) VALUES (?, ?, datetime('now'))",
            (lang_code, json.dumps(translations, ensure_ascii=False))
        )
        conn.commit()

    def load_ui_translations(self, lang_code: str) -> Optional[dict]:
        conn = self._get_conn()
        row = conn.execute("SELECT translations FROM ui_translations WHERE lang_code = ?", (lang_code,)).fetchone()
        if row:
            return json.loads(row["translations"])
        return None

    def get_all_ui_translation_langs(self) -> List[str]:
        conn = self._get_conn()
        rows = conn.execute("SELECT lang_code FROM ui_translations ORDER BY lang_code").fetchall()
        return [row["lang_code"] for row in rows]



