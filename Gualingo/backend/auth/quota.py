"""额度检查与恢复逻辑。"""

import sqlite3
from datetime import datetime, timezone, timedelta
from config import DATA_DIR

USER_DB_PATH = str(DATA_DIR / "users.db")

# Free: 200句初始，每日恢复50句，上限200
FREE_INITIAL_QUOTA = 200
FREE_DAILY_REFILL = 50
FREE_MAX_QUOTA = 200

# Basic: 2000句/月
BASIC_MONTHLY_QUOTA = 2000


def _get_conn():
    conn = sqlite3.connect(USER_DB_PATH)
    conn.row_factory = sqlite3.Row
    _ensure_quota_columns(conn)
    return conn


def _ensure_quota_columns(conn):
    """确保 users 表有额度字段。"""
    cursor = conn.execute("PRAGMA table_info(users)")
    columns = {row[1] for row in cursor.fetchall()}
    if "quota_used" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN quota_used INTEGER DEFAULT 0")
    if "quota_max" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN quota_max INTEGER DEFAULT 200")
    if "quota_reset_at" not in columns:
        conn.execute("ALTER TABLE users ADD COLUMN quota_reset_at TEXT")
    conn.commit()


def init_quota(user_id: str, tier: str = "free"):
    """注册时初始化额度。"""
    conn = _get_conn()
    now = datetime.now(timezone.utc).isoformat()
    if tier == "free":
        max_q = FREE_INITIAL_QUOTA
    elif tier == "basic":
        max_q = BASIC_MONTHLY_QUOTA
    else:  # pro
        max_q = 999999
    conn.execute(
        "UPDATE users SET quota_used = 0, quota_max = ?, quota_reset_at = ? WHERE id = ?",
        (max_q, now, user_id)
    )
    conn.commit()
    conn.close()


def check_and_refill_quota(user_id: str) -> dict:
    """检查额度，自动每日恢复（free）/每月重置（basic）。返回 {used, max, available}。"""
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
    max_q = row["quota_max"] or FREE_INITIAL_QUOTA
    reset_at = row["quota_reset_at"]
    tier = row["tier"]

    now = datetime.now(timezone.utc)

    if tier == "pro":
        conn.close()
        return {"used": used, "max": -1, "available": -1}

    elif tier == "basic":
        # Basic: 每月重置额度
        if reset_at:
            try:
                last_reset = datetime.fromisoformat(reset_at)
                if last_reset.tzinfo is None:
                    last_reset = last_reset.replace(tzinfo=timezone.utc)
                # 跨月了
                if now.month != last_reset.month or now.year != last_reset.year:
                    conn.execute(
                        "UPDATE users SET quota_used = 0, quota_max = ?, quota_reset_at = ? WHERE id = ?",
                        (BASIC_MONTHLY_QUOTA, now.isoformat(), user_id)
                    )
                    conn.commit()
                    used = 0
                    max_q = BASIC_MONTHLY_QUOTA
            except (ValueError, TypeError):
                pass
        else:
            conn.execute(
                "UPDATE users SET quota_reset_at = ? WHERE id = ?",
                (now.isoformat(), user_id)
            )
            conn.commit()
        conn.close()
        available = max(max_q - used, 0)
        return {"used": used, "max": max_q, "available": available}

    else:  # free
        # Free: 每日恢复50句，上限200
        if reset_at:
            try:
                last_reset = datetime.fromisoformat(reset_at)
                if last_reset.tzinfo is None:
                    last_reset = last_reset.replace(tzinfo=timezone.utc)
                # 跨天了
                days_passed = (now - last_reset).days
                if days_passed >= 1:
                    refill = days_passed * FREE_DAILY_REFILL
                    max_q = min(max_q + refill, FREE_MAX_QUOTA)
                    # 确保额度不低于已用
                    max_q = max(max_q, used)
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
        available = max(max_q - used, 0)
        return {"used": used, "max": max_q, "available": available}


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
    if tier == "pro":
        conn.close()
        return True

    used = row["quota_used"] or 0
    max_q = row["quota_max"] or FREE_INITIAL_QUOTA

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


def get_quota_info(user_id: str) -> dict:
    """获取额度信息（含恢复逻辑）。"""
    return check_and_refill_quota(user_id)
