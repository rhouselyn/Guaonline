"""测试用户隔离和额度初始化。"""

import os
import sys
import tempfile
import pytest

# 确保能 import backend 模块
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

# 覆盖 DATA_DIR 到临时目录，避免污染真实数据
_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp

# 必须在 import 之后生效，重新加载 config
import importlib
import config
importlib.reload(config)


class TestQuotaInit:
    """Bug2: 注册后额度应初始化为 50。"""

    def test_init_quota_sets_50(self):
        """注册新用户后，额度应为 used=0, max=50, available=50。"""
        from auth.quota import init_quota, check_and_refill_quota
        from auth.router import _get_conn, _hash_password
        from datetime import datetime, timezone
        import uuid

        # 创建一个测试用户
        conn = _get_conn()
        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        conn.execute(
            "INSERT INTO users (id, email, name, password_hash, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, "test@example.com", "test", _hash_password("pass"), "free", now)
        )
        conn.commit()
        conn.close()

        # 初始化额度
        init_quota(user_id)

        # 验证额度
        quota = check_and_refill_quota(user_id)
        assert quota["used"] == 0, f"期望 used=0，实际 {quota['used']}"
        assert quota["max"] == 50, f"期望 max=50，实际 {quota['max']}"
        assert quota["available"] == 50, f"期望 available=50，实际 {quota['available']}"

    def test_init_quota_columns_exist(self):
        """users 表应该有 quota_used, quota_max, quota_reset_at 列。"""
        from auth.router import _get_conn
        conn = _get_conn()
        # 查询表结构
        cursor = conn.execute("PRAGMA table_info(users)")
        columns = {row[1] for row in cursor.fetchall()}
        conn.close()
        assert "quota_used" in columns, f"缺少 quota_used 列，现有列: {columns}"
        assert "quota_max" in columns, f"缺少 quota_max 列，现有列: {columns}"
        assert "quota_reset_at" in columns, f"缺少 quota_reset_at 列，现有列: {columns}"


class TestHistoryUserScoping:
    """Bug1: 历史记录应按用户隔离。"""

    def test_history_has_user_id_column(self):
        """history 表应该有 user_id 列。"""
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        conn = storage._get_conn()
        cursor = conn.execute("PRAGMA table_info(history)")
        columns = {row[1] for row in cursor.fetchall()}
        conn.close()
        assert "user_id" in columns, f"缺少 user_id 列，现有列: {columns}"

    def test_add_history_record_stores_user_id(self):
        """add_history_record 应该存储 user_id。"""
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        record = storage.add_history_record("file_1", "Test", "en", "zh", "hello", user_id="user_abc")
        assert record.get("user_id") == "user_abc", f"期望 user_id='user_abc'，实际 {record.get('user_id')}"

    def test_load_history_filters_by_user(self):
        """load_history 应该只返回指定用户的记录。"""
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        # 添加两个用户的记录
        storage.add_history_record("file_a", "Title A", "en", "zh", "hello", user_id="user_1")
        storage.add_history_record("file_b", "Title B", "en", "zh", "world", user_id="user_2")
        storage.add_history_record("file_c", "Title C", "en", "zh", "foo", user_id="user_1")

        # user_1 应该只看到 file_a 和 file_c
        records = storage.load_history(user_id="user_1")
        file_ids = {r["file_id"] for r in records}
        assert file_ids == {"file_a", "file_c"}, f"期望 {{file_a, file_c}}，实际 {file_ids}"

        # user_2 应该只看到 file_b
        records = storage.load_history(user_id="user_2")
        file_ids = {r["file_id"] for r in records}
        assert file_ids == {"file_b"}, f"期望 {{file_b}}，实际 {file_ids}"

    def test_load_history_no_user_returns_all(self):
        """不传 user_id 时返回所有记录（兼容旧逻辑）。"""
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        storage.add_history_record("file_x", "Title X", "en", "zh", "test", user_id="user_1")
        storage.add_history_record("file_y", "Title Y", "en", "zh", "test2", user_id="user_2")

        records = storage.load_history()
        assert len(records) >= 2
