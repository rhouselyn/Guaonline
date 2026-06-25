"""复现并验证免费用户每日恢复50额度（上限200）的逻辑。

绕过 router/fastapi，直接用 sqlite 建表来测试 quota 模块本身。
"""

import os
import sys
import tempfile
import uuid
import sqlite3
from datetime import datetime, timezone, timedelta

# 覆盖 DATA_DIR 到临时目录，避免污染真实数据
_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import importlib
import config
importlib.reload(config)

import auth.quota as quota


def _create_free_user():
    """在临时 users.db 中创建一个 free 用户。"""
    conn = sqlite3.connect(quota.USER_DB_PATH)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT,
            tier TEXT DEFAULT 'free',
            quota_used INTEGER DEFAULT 0,
            quota_max INTEGER DEFAULT 200,
            quota_reset_at TEXT
        )
    """)
    conn.commit()
    user_id = str(uuid.uuid4())
    conn.execute(
        "INSERT INTO users (id, email, tier) VALUES (?, ?, 'free')",
        (user_id, f"{user_id}@example.com")
    )
    conn.commit()
    conn.close()
    quota.init_quota(user_id, "free")
    return user_id


def _set_reset_at(user_id, dt):
    conn = sqlite3.connect(quota.USER_DB_PATH)
    conn.execute("UPDATE users SET quota_reset_at = ? WHERE id = ?", (dt.isoformat(), user_id))
    conn.commit()
    conn.close()


def _set_quota(user_id, used, max_q):
    conn = sqlite3.connect(quota.USER_DB_PATH)
    conn.execute("UPDATE users SET quota_used = ?, quota_max = ? WHERE id = ?", (used, max_q, user_id))
    conn.commit()
    conn.close()


def test_initial_quota():
    user_id = _create_free_user()
    q = quota.check_and_refill_quota(user_id)
    print("initial:", q)
    assert q["used"] == 0, q
    assert q["max"] == 200, q
    assert q["available"] == 200, q


def test_refill_after_one_day_when_used_up():
    """用完200后，跨1天，应该恢复50：available=50, used=150。"""
    user_id = _create_free_user()
    _set_quota(user_id, used=200, max_q=200)
    yesterday = datetime.now(timezone.utc) - timedelta(days=1, hours=1)
    _set_reset_at(user_id, yesterday)

    q = quota.check_and_refill_quota(user_id)
    print("after 1 day, used=200 ->", q)
    assert q["available"] == 50, f"期望 available=50，实际 {q}"
    assert q["used"] == 150, f"期望 used=150，实际 {q}"
    assert q["max"] == 200, f"期望 max=200，实际 {q}"


def test_refill_after_three_days():
    """用完200后，跨3天，恢复150：available=150, used=50。"""
    user_id = _create_free_user()
    _set_quota(user_id, used=200, max_q=200)
    three_days_ago = datetime.now(timezone.utc) - timedelta(days=3, hours=1)
    _set_reset_at(user_id, three_days_ago)

    q = quota.check_and_refill_quota(user_id)
    print("after 3 days, used=200 ->", q)
    assert q["available"] == 150, f"期望 available=150，实际 {q}"
    assert q["used"] == 50, f"期望 used=50，实际 {q}"


def test_refill_capped_at_200():
    """用完200后，跨5天，恢复封顶200：available=200, used=0。"""
    user_id = _create_free_user()
    _set_quota(user_id, used=200, max_q=200)
    five_days_ago = datetime.now(timezone.utc) - timedelta(days=5, hours=1)
    _set_reset_at(user_id, five_days_ago)

    q = quota.check_and_refill_quota(user_id)
    print("after 5 days, used=200 ->", q)
    assert q["available"] == 200, f"期望 available=200，实际 {q}"
    assert q["used"] == 0, f"期望 used=0，实际 {q}"
    assert q["max"] == 200, f"期望 max=200，实际 {q}"


def test_no_refill_same_day():
    """同一天内不恢复：available=0, used=200。"""
    user_id = _create_free_user()
    _set_quota(user_id, used=200, max_q=200)
    recent = datetime.now(timezone.utc) - timedelta(hours=1)
    _set_reset_at(user_id, recent)

    q = quota.check_and_refill_quota(user_id)
    print("same day ->", q)
    assert q["available"] == 0, f"期望 available=0，实际 {q}"
    assert q["used"] == 200, f"期望 used=200，实际 {q}"


def test_partial_used_refill():
    """用了120，跨1天，恢复50后 used=70，available=130。"""
    user_id = _create_free_user()
    _set_quota(user_id, used=120, max_q=200)
    yesterday = datetime.now(timezone.utc) - timedelta(days=1, hours=1)
    _set_reset_at(user_id, yesterday)

    q = quota.check_and_refill_quota(user_id)
    print("after 1 day, used=120 ->", q)
    assert q["available"] == 130, f"期望 available=130，实际 {q}"
    assert q["used"] == 70, f"期望 used=70，实际 {q}"


def test_consume_after_refill():
    """恢复后再消费，额度应正确扣减。"""
    user_id = _create_free_user()
    _set_quota(user_id, used=200, max_q=200)
    yesterday = datetime.now(timezone.utc) - timedelta(days=1, hours=1)
    _set_reset_at(user_id, yesterday)

    # 先恢复（应 available=50, used=150）
    q = quota.check_and_refill_quota(user_id)
    assert q["available"] == 50, q
    assert q["used"] == 150, q

    # 消费 30 -> used=180, available=20
    ok = quota.consume_quota(user_id, 30)
    assert ok is True
    q = quota.check_and_refill_quota(user_id)
    print("after refill+consume 30 ->", q)
    assert q["used"] == 180, f"期望 used=180，实际 {q}"
    assert q["available"] == 20, f"期望 available=20，实际 {q}"


if __name__ == "__main__":
    test_initial_quota()
    test_refill_after_one_day_when_used_up()
    test_refill_after_three_days()
    test_refill_capped_at_200()
    test_no_refill_same_day()
    test_partial_used_refill()
    test_consume_after_refill()
    print("\n全部测试通过 ✅")
