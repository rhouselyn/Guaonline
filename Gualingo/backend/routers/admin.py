"""Admin 管理面板 API 路由。"""

import os
import json
import sqlite3
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from auth.deps import require_admin
from auth.models import AdminTokenData
from auth.jwt_utils import create_admin_tokens
from auth.router import _get_conn as get_user_conn, USER_DB_PATH
from auth.quota import check_and_refill_quota
from config import DATA_DIR
from utils.token_tracker import get_cost_summary
from llm_api import get_tier_keys, update_tier_keys

router = APIRouter(prefix="/api/admin", tags=["admin"])

ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "123456")

# ── Admin 操作日志 ──────────────────────────────────────────

ADMIN_DB_PATH = str(DATA_DIR / "admin.db")


def _get_admin_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(ADMIN_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS admin_logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            action TEXT NOT NULL,
            target_type TEXT,
            target_id TEXT,
            details TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    return conn


def _log_action(action: str, target_type: str = None, target_id: str = None, details: dict = None):
    conn = _get_admin_conn()
    conn.execute(
        "INSERT INTO admin_logs (action, target_type, target_id, details) VALUES (?, ?, ?, ?)",
        (action, target_type, target_id, json.dumps(details, ensure_ascii=False) if details else None)
    )
    conn.commit()
    conn.close()


# ── 登录 ────────────────────────────────────────────────────

class AdminLoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
async def admin_login(req: AdminLoginRequest):
    if req.email != "admin@mail.com" or req.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="管理员账号或密码错误")
    return create_admin_tokens()


# ── 仪表盘 ──────────────────────────────────────────────────

@router.get("/dashboard")
async def get_dashboard(admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")

    # 总用户数 / 今日新增
    total_users = conn.execute("SELECT COUNT(*) as c FROM users").fetchone()["c"]
    new_today = conn.execute("SELECT COUNT(*) as c FROM users WHERE date(created_at) = ?", (today,)).fetchone()["c"]

    # Tier 分布
    tier_dist = {}
    for row in conn.execute("SELECT tier, COUNT(*) as c FROM users GROUP BY tier"):
        tier_dist[row["tier"]] = row["c"]

    conn.close()

    # 语言分布（从 gualingo.db 的 history 表）
    from db_storage import DatabaseStorage
    storage = DatabaseStorage()
    source_lang_dist = {}
    target_lang_dist = {}
    try:
        rows = storage._get_conn().execute(
            "SELECT source_lang, target_lang, COUNT(*) as c FROM history GROUP BY source_lang, target_lang"
        ).fetchall()
        for row in rows:
            sl = row["source_lang"] or "unknown"
            tl = row["target_lang"] or "unknown"
            source_lang_dist[sl] = source_lang_dist.get(sl, 0) + row["c"]
            target_lang_dist[tl] = target_lang_dist.get(tl, 0) + row["c"]
    except Exception:
        pass

    # Token 成本概览
    cost_summary = get_cost_summary()

    return {
        "total_users": total_users,
        "new_today": new_today,
        "tier_distribution": tier_dist,
        "source_lang_distribution": source_lang_dist,
        "target_lang_distribution": target_lang_dist,
        "token_cost_today": cost_summary["today"],
        "token_cost_month": cost_summary["month"],
        "avg_cost_per_user": cost_summary["avg_cost_per_user"],
        "top_cost_users": cost_summary["top_users"],
    }


# ── API Key 管理 ────────────────────────────────────────────

@router.get("/api-keys")
async def get_api_keys(admin: AdminTokenData = Depends(require_admin)):
    return get_tier_keys()


class TierKeyUpdate(BaseModel):
    configs: List[dict]
    active_index: int = 0


@router.put("/api-keys/{tier}")
async def update_api_keys(tier: str, req: TierKeyUpdate, admin: AdminTokenData = Depends(require_admin)):
    if tier not in ("free", "basic", "pro"):
        raise HTTPException(status_code=400, detail="Invalid tier")
    update_tier_keys(tier, req.configs, req.active_index)
    _log_action("update_api_keys", "tier", tier, {"active_index": req.active_index, "config_count": len(req.configs)})
    return {"status": "ok"}


@router.post("/api-keys/{tier}/test")
async def test_api_key(tier: str, admin: AdminTokenData = Depends(require_admin)):
    if tier not in ("free", "basic", "pro"):
        raise HTTPException(status_code=400, detail="Invalid tier")
    from llm_api import get_tier_llm_config
    config = get_tier_llm_config(tier)
    if not config or not config.get("api_key"):
        raise HTTPException(status_code=400, detail="该 Tier 没有配置 API Key")
    import httpx
    base_url = config.get("base_url", "https://api.openai.com/v1")
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Authorization": f"Bearer {config['api_key']}", "Content-Type": "application/json"}
    payload = {"model": config.get("model", "gpt-4o-mini"), "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 5}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
            if resp.status_code == 200:
                return {"status": "ok", "message": "API Key 可用"}
            else:
                return {"status": "error", "message": f"API 返回 {resp.status_code}: {resp.text[:200]}"}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── 用户管理 ────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    tier: Optional[str] = None,
    sort: str = Query("created_at", pattern="^(created_at|quota_used|name)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    admin: AdminTokenData = Depends(require_admin),
):
    conn = get_user_conn()
    conditions = []
    params = []
    if search:
        conditions.append("(email LIKE ? OR name LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%"])
    if tier:
        conditions.append("tier = ?")
        params.append(tier)

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    order_clause = f"ORDER BY {sort} {order.upper()}"

    total = conn.execute(f"SELECT COUNT(*) as c FROM users {where}", params).fetchone()["c"]
    offset = (page - 1) * page_size
    rows = conn.execute(
        f"SELECT id, email, name, tier, quota_used, quota_max, banned, created_at FROM users {where} {order_clause} LIMIT ? OFFSET ?",
        params + [page_size, offset]
    ).fetchall()
    conn.close()

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "users": [dict(r) for r in rows],
    }


@router.get("/users/{user_id}")
async def get_user_detail(user_id: str, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    row = conn.execute(
        "SELECT id, email, name, tier, api_key, base_url, model, quota_used, quota_max, banned, banned_reason, created_at FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="用户不存在")
    result = dict(row)
    if result.get("api_key") and len(result["api_key"]) > 8:
        result["api_key"] = result["api_key"][:4] + "****" + result["api_key"][-4:]
    return result


class UserUpdateRequest(BaseModel):
    tier: Optional[str] = None


@router.put("/users/{user_id}")
async def update_user(user_id: str, req: UserUpdateRequest, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    if req.tier:
        if req.tier not in ("free", "basic", "pro"):
            raise HTTPException(status_code=400, detail="Invalid tier")
        conn.execute("UPDATE users SET tier = ? WHERE id = ?", (req.tier, user_id))
        _log_action("user_tier_change", "user", user_id, {"new_tier": req.tier})
    conn.commit()
    conn.close()
    return {"status": "ok"}


class QuotaAdjustRequest(BaseModel):
    action: str
    value: int


@router.put("/users/{user_id}/quota")
async def adjust_user_quota(user_id: str, req: QuotaAdjustRequest, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    row = conn.execute("SELECT quota_max FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="用户不存在")
    current = row["quota_max"] or 50
    if req.action == "add":
        new_max = min(current + req.value, 10000)
    elif req.action == "subtract":
        new_max = max(current - req.value, 0)
    elif req.action == "set":
        new_max = req.value
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid action")
    conn.execute("UPDATE users SET quota_max = ? WHERE id = ?", (new_max, user_id))
    conn.commit()
    conn.close()
    _log_action("user_quota_adjust", "user", user_id, {"action": req.action, "value": req.value, "new_max": new_max})
    return {"status": "ok", "new_max": new_max}


@router.get("/users/{user_id}/history")
async def get_user_history(user_id: str, admin: AdminTokenData = Depends(require_admin)):
    from db_storage import DatabaseStorage
    storage = DatabaseStorage()
    records = storage.load_history(user_id=user_id)
    return {"records": records}


@router.get("/users/{user_id}/favorites")
async def get_user_favorites(user_id: str, source_lang: Optional[str] = None, admin: AdminTokenData = Depends(require_admin)):
    from db_storage import DatabaseStorage
    storage = DatabaseStorage()
    words = storage.get_favorite_words(source_lang, user_id=user_id)
    return {"words": words}


@router.get("/users/{user_id}/preferences")
async def get_user_preferences(user_id: str, admin: AdminTokenData = Depends(require_admin)):
    from db_storage import DatabaseStorage
    storage = DatabaseStorage()
    prefs = storage.load_user_preferences(user_id=user_id)
    return prefs


@router.get("/users/{user_id}/word-list")
async def get_user_word_list(user_id: str, source_lang: Optional[str] = None, admin: AdminTokenData = Depends(require_admin)):
    from db_storage import DatabaseStorage
    storage = DatabaseStorage()
    records = storage.load_history(user_id=user_id)
    if source_lang:
        records = [r for r in records if r.get("source_lang") == source_lang]
    merged = {}
    for record in records:
        file_id = record.get("file_id")
        if not file_id:
            continue
        vocab = storage.load_vocab(file_id)
        if not vocab:
            continue
        if isinstance(vocab, dict) and "vocab" in vocab:
            vocab = vocab["vocab"]
        for entry in vocab:
            word_key = entry.get("word", "").lower()
            if word_key and word_key not in merged:
                merged[word_key] = entry.get("meaning", "")
    return {"words": [{"word": w, "meaning": m} for w, m in merged.items()]}


# ── 额度批量管理 ────────────────────────────────────────────

class BatchQuotaRequest(BaseModel):
    target_tier: Optional[str] = None
    action: str
    value: int


@router.post("/quota/batch")
async def batch_adjust_quota(req: BatchQuotaRequest, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    conditions = []
    params = []
    if req.target_tier:
        conditions.append("tier = ?")
        params.append(req.target_tier)
    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""

    count = conn.execute(f"SELECT COUNT(*) as c FROM users {where}", params).fetchone()["c"]
    if count == 0:
        conn.close()
        return {"status": "ok", "affected": 0}

    if req.action == "add":
        conn.execute(f"UPDATE users SET quota_max = MIN(quota_max + ?, 10000) {where}", [req.value] + params)
    elif req.action == "subtract":
        conn.execute(f"UPDATE users SET quota_max = MAX(quota_max - ?, 0) {where}", [req.value] + params)
    elif req.action == "set":
        conn.execute(f"UPDATE users SET quota_max = ? {where}", [req.value] + params)
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid action")

    conn.commit()
    conn.close()
    _log_action("quota_batch_adjust", "tier", req.target_tier or "all",
                {"action": req.action, "value": req.value, "affected": count})
    return {"status": "ok", "affected": count}


# ── 黑名单 ──────────────────────────────────────────────────

@router.get("/blacklist")
async def get_blacklist(admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    rows = conn.execute("SELECT id, email, name, banned_reason, created_at FROM users WHERE banned = 1").fetchall()
    conn.close()
    return {"users": [dict(r) for r in rows]}


class BlacklistAddRequest(BaseModel):
    email: str
    reason: str = ""


@router.post("/blacklist")
async def add_to_blacklist(req: BlacklistAddRequest, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    row = conn.execute("SELECT id FROM users WHERE email = ?", (req.email,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="用户不存在")
    conn.execute("UPDATE users SET banned = 1, banned_reason = ? WHERE id = ?", (req.reason, row["id"]))
    conn.commit()
    conn.close()
    _log_action("blacklist_add", "user", row["id"], {"email": req.email, "reason": req.reason})
    return {"status": "ok"}


@router.delete("/blacklist/{user_id}")
async def remove_from_blacklist(user_id: str, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    conn.execute("UPDATE users SET banned = 0, banned_reason = NULL WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    _log_action("blacklist_remove", "user", user_id)
    return {"status": "ok"}


# ── Token 成本 ──────────────────────────────────────────────

@router.get("/costs")
async def get_costs(admin: AdminTokenData = Depends(require_admin)):
    return get_cost_summary()


@router.get("/costs/trend")
async def get_cost_trend(days: int = Query(30, ge=1, le=90), admin: AdminTokenData = Depends(require_admin)):
    summary = get_cost_summary(days)
    return {"trend": summary["trend"]}


@router.get("/costs/by-model")
async def get_cost_by_model(admin: AdminTokenData = Depends(require_admin)):
    summary = get_cost_summary()
    return {"by_model": summary["by_model"]}


# ── 操作日志 ────────────────────────────────────────────────

@router.get("/logs")
async def get_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: AdminTokenData = Depends(require_admin),
):
    conn = _get_admin_conn()
    total = conn.execute("SELECT COUNT(*) as c FROM admin_logs").fetchone()["c"]
    offset = (page - 1) * page_size
    rows = conn.execute(
        "SELECT * FROM admin_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (page_size, offset)
    ).fetchall()
    conn.close()
    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "logs": [dict(r) for r in rows],
    }
