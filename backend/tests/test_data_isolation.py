"""测试所有用户数据的隔离性。"""

import os
import sys
import tempfile
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp

import importlib
import config
importlib.reload(config)


class TestPreferencesIsolation:
    """用户偏好设置应按用户隔离。"""

    def test_save_and_load_per_user(self):
        """不同用户保存不同偏好，各自读到自己的。"""
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        storage.save_user_preferences({"target_lang": "ja", "retry_interval": 2.0}, user_id="user_a")
        storage.save_user_preferences({"target_lang": "fr", "retry_interval": 5.0}, user_id="user_b")

        prefs_a = storage.load_user_preferences(user_id="user_a")
        prefs_b = storage.load_user_preferences(user_id="user_b")

        assert prefs_a["target_lang"] == "ja", f"user_a 应该是 ja，实际 {prefs_a.get('target_lang')}"
        assert prefs_a["retry_interval"] == 2.0
        assert prefs_b["target_lang"] == "fr", f"user_b 应该是 fr，实际 {prefs_b.get('target_lang')}"
        assert prefs_b["retry_interval"] == 5.0

    def test_no_user_id_returns_default(self):
        """不传 user_id 时返回默认值。"""
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        prefs = storage.load_user_preferences()
        assert "target_lang" in prefs


class TestFavoritesIsolation:
    """收藏单词应按用户隔离。"""

    def test_favorites_per_user(self):
        """不同用户收藏不同单词，各自只看到自己的。"""
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        storage.add_favorite_word("hello", "en", user_id="user_a")
        storage.add_favorite_word("world", "en", user_id="user_a")
        storage.add_favorite_word("bonjour", "fr", user_id="user_b")

        words_a = storage.get_favorite_words("en", user_id="user_a")
        words_b = storage.get_favorite_words("fr", user_id="user_b")

        assert "hello" in words_a, f"user_a 应该有 hello，实际 {words_a}"
        assert "world" in words_a
        assert "bonjour" not in words_a, f"user_a 不应该有 bonjour"

        assert "bonjour" in words_b, f"user_b 应该有 bonjour，实际 {words_b}"
        assert "hello" not in words_b

    def test_remove_favorite_per_user(self):
        """用户取消收藏不影响其他用户。"""
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        storage.add_favorite_word("hello", "en", user_id="user_a")
        storage.add_favorite_word("hello", "en", user_id="user_b")

        storage.remove_favorite_word("hello", "en", user_id="user_a")

        words_a = storage.get_favorite_words("en", user_id="user_a")
        words_b = storage.get_favorite_words("en", user_id="user_b")

        assert "hello" not in words_a, "user_a 已取消收藏"
        assert "hello" in words_b, "user_b 的收藏不受影响"


class TestHistoryIsolation:
    """历史记录应按用户隔离。"""

    def test_history_per_user(self):
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        storage.add_history_record("file_a1", "Title A1", "en", "zh", "hello", user_id="user_a")
        storage.add_history_record("file_b1", "Title B1", "fr", "zh", "bonjour", user_id="user_b")

        records_a = storage.load_history(user_id="user_a")
        records_b = storage.load_history(user_id="user_b")

        ids_a = {r["file_id"] for r in records_a}
        ids_b = {r["file_id"] for r in records_b}

        assert ids_a == {"file_a1"}, f"user_a 应该只有 file_a1，实际 {ids_a}"
        assert ids_b == {"file_b1"}, f"user_b 应该只有 file_b1，实际 {ids_b}"


class TestQuotaIsolation:
    """额度应按用户隔离。"""

    def test_quota_per_user(self):
        from auth.quota import init_quota, check_and_refill_quota, consume_quota
        from auth.router import _get_conn, _hash_password
        from datetime import datetime, timezone
        import uuid

        # 创建两个用户
        conn = _get_conn()
        users = []
        for i in range(2):
            uid = str(uuid.uuid4())
            now = datetime.now(timezone.utc).isoformat()
            conn.execute(
                "INSERT INTO users (id, email, name, password_hash, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (uid, f"user{i}@test.com", f"user{i}", _hash_password("pass"), "free", now)
            )
            users.append(uid)
        conn.commit()
        conn.close()

        init_quota(users[0])
        init_quota(users[1])

        # user0 消费 10 句
        consume_quota(users[0], 10)

        q0 = check_and_refill_quota(users[0])
        q1 = check_and_refill_quota(users[1])

        assert q0["used"] == 10, f"user0 应该已用 10，实际 {q0['used']}"
        assert q0["available"] == 40, f"user0 应该剩余 40，实际 {q0['available']}"
        assert q1["used"] == 0, f"user1 应该未使用，实际 {q1['used']}"
        assert q1["available"] == 50, f"user1 应该剩余 50，实际 {q1['available']}"
