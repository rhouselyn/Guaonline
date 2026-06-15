"""Token 使用量追踪与成本估算。"""

import sqlite3
from datetime import datetime, timezone
from config import DATA_DIR

TOKEN_DB_PATH = str(DATA_DIR / "token_usage.db")

# 常见模型价格表（$/1M tokens）
MODEL_PRICING = {
    "gpt-4o": {"input": 2.50, "output": 10.00},
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4-turbo": {"input": 10.00, "output": 30.00},
    "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
    "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
    "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    "deepseek-chat": {"input": 0.14, "output": 0.28},
    "deepseek-reasoner": {"input": 0.55, "output": 2.19},
}

DEFAULT_PRICING = {"input": 1.00, "output": 4.00}


def _get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(TOKEN_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS token_usage (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id TEXT NOT NULL,
            model TEXT NOT NULL,
            prompt_tokens INTEGER NOT NULL DEFAULT 0,
            completion_tokens INTEGER NOT NULL DEFAULT 0,
            total_tokens INTEGER NOT NULL DEFAULT 0,
            cost_usd REAL NOT NULL DEFAULT 0,
            request_type TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    return conn


def estimate_cost(model: str, prompt_tokens: int, completion_tokens: int) -> float:
    """估算单次调用的美元成本。"""
    pricing = MODEL_PRICING.get(model, DEFAULT_PRICING)
    input_cost = (prompt_tokens / 1_000_000) * pricing["input"]
    output_cost = (completion_tokens / 1_000_000) * pricing["output"]
    return round(input_cost + output_cost, 8)


def record_token_usage(user_id: str, model: str, usage: dict, request_type: str = None):
    """记录一次 LLM 调用的 token 使用量。usage 来自 API 响应的 usage 字段。"""
    prompt_tokens = usage.get("prompt_tokens", 0)
    completion_tokens = usage.get("completion_tokens", 0)
    total_tokens = usage.get("total_tokens", prompt_tokens + completion_tokens)
    cost = estimate_cost(model, prompt_tokens, completion_tokens)

    conn = _get_conn()
    conn.execute(
        "INSERT INTO token_usage (user_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, request_type) "
        "VALUES (?, ?, ?, ?, ?, ?, ?)",
        (user_id, model, prompt_tokens, completion_tokens, total_tokens, cost, request_type)
    )
    conn.commit()
    conn.close()


def get_cost_summary(days: int = 30) -> dict:
    """获取成本概览。"""
    conn = _get_conn()
    now = datetime.now(timezone.utc)

    # 今日
    today = now.strftime("%Y-%m-%d")
    row_today = conn.execute(
        "SELECT COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(cost_usd), 0) as cost "
        "FROM token_usage WHERE date(created_at) = ?",
        (today,)
    ).fetchone()

    # 本月
    month_start = now.strftime("%Y-%m-01")
    row_month = conn.execute(
        "SELECT COALESCE(SUM(total_tokens), 0) as tokens, COALESCE(SUM(cost_usd), 0) as cost, "
        "COUNT(DISTINCT user_id) as active_users "
        "FROM token_usage WHERE date(created_at) >= ?",
        (month_start,)
    ).fetchone()

    # Top 10 成本用户（跨库查询）
    from auth.router import USER_DB_PATH
    try:
        conn.execute(f"ATTACH DATABASE '{USER_DB_PATH}' AS users_db")
        top_users = conn.execute(
            "SELECT tu.user_id, u.email, u.name, "
            "SUM(tu.prompt_tokens) as prompt_tokens, SUM(tu.completion_tokens) as completion_tokens, "
            "SUM(tu.total_tokens) as total_tokens, SUM(tu.cost_usd) as cost "
            "FROM token_usage tu LEFT JOIN users_db.users u ON tu.user_id = u.id "
            "WHERE date(tu.created_at) >= ? "
            "GROUP BY tu.user_id ORDER BY cost DESC LIMIT 10",
            (month_start,)
        ).fetchall()
        conn.execute("DETACH DATABASE users_db")
    except Exception:
        top_users = []

    # 每日趋势
    trend = conn.execute(
        "SELECT date(created_at) as date, SUM(total_tokens) as tokens, SUM(cost_usd) as cost "
        "FROM token_usage WHERE date(created_at) >= date('now', ?) "
        "GROUP BY date(created_at) ORDER BY date",
        (f"-{days} days",)
    ).fetchall()

    # 按模型分布
    by_model = conn.execute(
        "SELECT model, SUM(total_tokens) as tokens, SUM(cost_usd) as cost "
        "FROM token_usage WHERE date(created_at) >= ? "
        "GROUP BY model ORDER BY cost DESC",
        (month_start,)
    ).fetchall()

    conn.close()

    month_cost = row_month["cost"] if row_month else 0
    active_users = row_month["active_users"] if row_month else 0
    avg_cost = round(month_cost / active_users, 6) if active_users > 0 else 0

    return {
        "today": {"tokens": row_today["tokens"] if row_today else 0, "cost": row_today["cost"] if row_today else 0},
        "month": {"tokens": row_month["tokens"] if row_month else 0, "cost": month_cost, "active_users": active_users},
        "avg_cost_per_user": avg_cost,
        "top_users": [dict(r) for r in top_users],
        "trend": [dict(r) for r in trend],
        "by_model": [dict(r) for r in by_model],
    }
