"""额度检查与恢复逻辑。"""

import sqlite3
from datetime import datetime, timezone, timedelta
from config import DATA_DIR

USER_DB_PATH = str(DATA_DIR / "users.db")

INITIAL_QUOTA = 50
DAILY_REFILL = 10
MAX_QUOTA = 100


def _get_conn():
    conn = sqlite3.connect(USER_DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def _ensure_quota_columns(conn):
    """确保 users 表有额度字段。"""
    conn.executescript("""
        ALTER TABLE users ADD COLUMN quota_used INTEGER DEFAULT 0;
        ALTER TABLE users ADD COLUMN quota_max INTEGER DEFAULT 50;
        ALTER TABLE users ADD COLUMN quota_reset_at TEXT;
    """)
    # 忽略已存在的列错误
    conn.commit()


def init_quota(user_id: str):
    """注册时初始化额度。"""
    conn = _get_conn()
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "UPDATE users SET quota_used = 0, quota_max = ?, quota_reset_at = ? WHERE id = ?",
        (INITIAL_QUOTA, now, user_id)
    )
    conn.commit()
    conn.close()


def check_and_refill_quota(user_id: str) -> dict:
    """检查额度，自动每日恢复。返回 {used, max, available}。"""
    conn = _get_conn()
    try:
        _ensure_quota_columns(conn)
    except Exception:
        pass

    row = conn.execute(
        "SELECT quota_used, quota_max, quota_reset_at, tier FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

    if not row:
        conn.close()
        return {"used": 0, "max": 0, "available": 0}

    used = row["quota_used"] or 0
    max_q = row["quota_max"] or INITIAL_QUOTA
    reset_at = row["quota_reset_at"]
    tier = row["tier"]

    # 基础版/专业版无限额度
    if tier in ("basic", "pro"):
        conn.close()
        return {"used": used, "max": -1, "available": -1}

    # 每日恢复
    now = datetime.now(timezone.utc)
    if reset_at:
        try:
            last_reset = datetime.fromisoformat(reset_at)
            if last_reset.tzinfo is None:
                last_reset = last_reset.replace(tzinfo=timezone.utc)
            # 跨天了
            if (now - last_reset) >= timedelta(days=1):
                max_q = min(max_q + DAILY_REFILL, MAX_QUOTA)
                conn.execute(
                    "UPDATE users SET quota_max = ?, quota_reset_at = ? WHERE id = ?",
                    (max_q, now.isoformat(), user_id)
                )
                conn.commit()
        except (ValueError, TypeError):
            pass
    else:
        conn.execute(
            "UPDATE users SET quota_reset_at = ? WHERE id = ?",
            (now.isoformat(), user_id)
        )
        conn.commit()

    conn.close()
    return {"used": used, "max": max_q, "available": max_q - used}


def consume_quota(user_id: str, count: int) -> bool:
    """消费额度。返回是否成功。"""
    conn = _get_conn()
    row = conn.execute(
        "SELECT quota_used, quota_max, tier FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()

    if not row:
        conn.close()
        return False

    tier = row["tier"]
    if tier in ("basic", "pro"):
        conn.close()
        return True

    used = row["quota_used"] or 0
    max_q = row["quota_max"] or INITIAL_QUOTA

    if used + count > max_q:
        conn.close()
        return False

    conn.execute(
        "UPDATE users SET quota_used = ? WHERE id = ?",
        (used + count, user_id)
    )
    conn.commit()
    conn.close()
    return True
