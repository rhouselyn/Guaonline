"""Admin 管理面板 API 路由。"""

import os
import json
import asyncio
import sqlite3
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional, List
from auth.deps import require_admin
from auth.models import AdminTokenData
from auth.jwt_utils import create_admin_tokens
from auth.router import _get_conn as get_user_conn, USER_DB_PATH
from auth.quota import check_and_refill_quota
from config import DATA_DIR
from utils.token_tracker import get_cost_summary
from llm_api import (
    get_tier_keys, update_tier_keys,
    list_key_defs, create_key_def, update_key_def, delete_key_def, count_key_refs,
)

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


@router.get("/user-growth")
async def get_user_growth(days: int = Query(30, ge=1, le=3650), admin: AdminTokenData = Depends(require_admin)):
    """获取用户增长趋势数据。返回每天的累计用户数和新增用户数。"""
    conn = get_user_conn()
    now = datetime.now(timezone.utc)

    # 获取所有用户的注册日期
    rows = conn.execute(
        "SELECT date(created_at) as d, COUNT(*) as c FROM users GROUP BY date(created_at) ORDER BY d"
    ).fetchall()
    conn.close()

    # 构建日期->新增映射
    daily_new = {}
    for row in rows:
        daily_new[row["d"]] = row["c"]

    # 生成指定天数的数据
    result = []
    total = 0
    from datetime import timedelta
    start_date = (now - timedelta(days=days)).strftime("%Y-%m-%d")

    # 先计算 start_date 之前的累计
    for d, c in daily_new.items():
        if d < start_date:
            total += c

    for i in range(days + 1):
        d = (now - timedelta(days=days - i)).strftime("%Y-%m-%d")
        new_count = daily_new.get(d, 0)
        total += new_count
        result.append({
            "date": d,
            "new_users": new_count,
            "total_users": total,
        })

    return {"growth": result}


# ── API Key 管理（引用语义模型） ────────────────────────────

@router.get("/api-keys")
async def get_api_keys(admin: AdminTokenData = Depends(require_admin)):
    """返回全局 key 仓库（脱敏）+ tier_keys 引用表。"""
    return get_tier_keys()


# ── 全局 key 定义 CRUD ──────────────────────────────────────

@router.get("/api-keys/defs")
async def list_key_defs_endpoint(admin: AdminTokenData = Depends(require_admin)):
    """列出所有全局 key 定义（脱敏）。"""
    return {"keys": list_key_defs()}


class KeyDefCreate(BaseModel):
    api_key: str = ""
    base_url: str = ""
    model: str = ""
    title: str = ""
    input_price_per_million: float = 0
    output_price_per_million: float = 0


@router.post("/api-keys/defs")
async def create_key_def_endpoint(req: KeyDefCreate, admin: AdminTokenData = Depends(require_admin)):
    """新建全局 key。返回 id，可被任意 tier/sub 引用。"""
    kid = create_key_def(req.api_key, req.base_url, req.model,
                         req.input_price_per_million, req.output_price_per_million,
                         title=req.title)
    _log_action("create_key_def", "key", kid, {"model": req.model, "title": req.title})
    return {"status": "ok", "id": kid}


class KeyDefUpdate(BaseModel):
    api_key: Optional[str] = None
    base_url: Optional[str] = None
    model: Optional[str] = None
    title: Optional[str] = None
    input_price_per_million: Optional[float] = None
    output_price_per_million: Optional[float] = None


@router.put("/api-keys/defs/{key_id}")
async def update_key_def_endpoint(key_id: str, req: KeyDefUpdate, admin: AdminTokenData = Depends(require_admin)):
    """修改全局 key 属性。改一处，所有引用处同步生效。"""
    try:
        update_key_def(key_id, **req.dict(exclude_none=True))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    _log_action("update_key_def", "key", key_id)
    return {"status": "ok"}


@router.delete("/api-keys/defs/{key_id}")
async def delete_key_def_endpoint(key_id: str, admin: AdminTokenData = Depends(require_admin)):
    """删除全局 key。若被任何 pool 引用则拒绝。"""
    try:
        ok = delete_key_def(key_id)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail="key 不存在")
    _log_action("delete_key_def", "key", key_id)
    return {"status": "ok"}


@router.get("/api-keys/defs/{key_id}/refs")
async def get_key_refs_endpoint(key_id: str, admin: AdminTokenData = Depends(require_admin)):
    """返回该 key 被哪些 pool 引用（供前端显示"共享到 N 处"）。"""
    return {"refs": count_key_refs(key_id)}


# ── pool 引用管理 ───────────────────────────────────────────

class TierKeyUpdate(BaseModel):
    configs: List[dict]  # refs: [{key_id, max_tokens, disabled}]
    active_index: int = 0
    sub: str = "sentence"


@router.put("/api-keys/{tier}")
async def update_api_keys(tier: str, req: TierKeyUpdate, admin: AdminTokenData = Depends(require_admin)):
    if tier not in ("free", "basic", "pro"):
        raise HTTPException(status_code=400, detail="Invalid tier")
    if req.sub not in ("title", "sentence", "word"):
        raise HTTPException(status_code=400, detail="Invalid sub")
    try:
        update_tier_keys(tier, req.sub, req.configs, req.active_index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _log_action("update_api_keys", "tier", tier, {"sub": req.sub, "ref_count": len(req.configs)})
    return {"status": "ok"}


async def _test_key(gateway, key_id: str) -> dict:
    """按 key_id 测试一个全局 key，结果回写所有 pool 中该 key 的 per-ref 运行时状态。

    测试只更新 key 的 is_valid/last_error/circuit_state（200 时复位），
    不切换 active_index，避免干扰真实流量。返回 {key_id, status, message}。
    """
    import httpx
    from datetime import datetime, timezone

    kdef = gateway.key_defs.get(key_id, {})
    api_key = kdef.get("api_key", "")
    now_iso = datetime.now(timezone.utc).isoformat()

    def _apply_to_refs(update_fn):
        """把测试结果同步到所有 pool 中该 key_id 的 per-ref 运行时状态。"""
        for tier_pools in gateway.pools.values():
            for pool in tier_pools.values():
                with pool.lock:
                    pool._sync_runtime()
                    for i, ref in enumerate(pool.refs):
                        if ref.get("key_id") == key_id:
                            update_fn(pool.ref_runtime[i])

    if not api_key:
        _apply_to_refs(lambda rt: rt.update({
            "is_valid": True, "last_error": None, "last_error_time": None,
            "rate_limited_until": None,
        }))
        return {"key_id": key_id, "status": "empty", "message": "未配置 Key"}
    base_url = kdef.get("base_url", "https://api.openai.com/v1")
    url = f"{base_url.rstrip('/')}/chat/completions"
    headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
    payload = {"model": kdef.get("model", "gpt-4o-mini"),
               "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 5}
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(url, headers=headers, json=payload)
        body = resp.text[:160]
        if resp.status_code == 200:
            _apply_to_refs(lambda rt: rt.update({
                "is_valid": True, "last_error": None, "last_error_time": None,
                "rate_limited_until": None, "circuit_state": "closed",
                "fail_count": 0, "half_open_probed": False, "invalid_streak": 0,
            }))
            return {"key_id": key_id, "status": "ok", "message": "API Key 可用"}
        if resp.status_code == 401:
            _apply_to_refs(lambda rt: rt.update({
                "is_valid": False, "last_error": "401 Unauthorized",
                "last_error_time": now_iso, "rate_limited_until": None,
            }))
            return {"key_id": key_id, "status": "invalid", "message": f"Key 无效/欠费: {body}"}
        if resp.status_code == 429:
            _apply_to_refs(lambda rt: rt.update({
                "is_valid": True, "last_error": "429 Rate Limited",
                "last_error_time": now_iso, "rate_limited_until": None,
            }))
            return {"key_id": key_id, "status": "rate_limited", "message": f"限速中: {body}"}
        _apply_to_refs(lambda rt: rt.update({
            "is_valid": True, "last_error": f"{resp.status_code} {body}",
            "last_error_time": now_iso, "rate_limited_until": None,
        }))
        return {"key_id": key_id, "status": "error",
                "message": f"API 返回 {resp.status_code}: {body}"}
    except httpx.TimeoutException:
        _apply_to_refs(lambda rt: rt.update({
            "is_valid": True, "last_error": "network: timeout",
            "last_error_time": now_iso, "rate_limited_until": None,
        }))
        return {"key_id": key_id, "status": "error", "message": "请求超时（30s）"}
    except Exception as e:
        msg = str(e)[:160]
        _apply_to_refs(lambda rt: rt.update({
            "is_valid": True, "last_error": f"network: {msg}",
            "last_error_time": now_iso, "rate_limited_until": None,
        }))
        return {"key_id": key_id, "status": "error", "message": f"请求失败: {msg}"}


@router.post("/api-keys/test-all")
async def test_all_api_keys(admin: AdminTokenData = Depends(require_admin)):
    """测试所有 pool（所有 tier/sub）出现过的所有 key，每个 key_id 只测一次。

    结果按 key_id 回写全局运行时状态，所有 tier/sub 页面都会拿到最新状态。
    注意：此路由必须声明在 /api-keys/{tier}/test 之前，否则 test-all 会被当成 tier 参数。
    """
    import asyncio
    from utils.llm_gateway import gateway

    # 收集所有 pool 出现过的 key_id（保持发现顺序，去重）
    seen = []
    seen_set = set()
    for tier in ("free", "basic", "pro"):
        tier_pools = gateway.pools.get(tier)
        if not tier_pools:
            continue
        for sub in ("title", "sentence", "word"):
            pool = tier_pools.get(sub)
            if not pool:
                continue
            for ref in pool.refs:
                kid = ref.get("key_id")
                if kid and kid not in seen_set:
                    seen_set.add(kid)
                    seen.append(kid)
    if not seen:
        return {"results": [], "count": 0}

    tested = await asyncio.gather(*[_test_key(gateway, kid) for kid in seen])
    gateway._notify()
    _log_action("test_all_api_keys", "all", None, {"count": len(tested)})
    return {"results": tested, "count": len(tested)}


@router.post("/api-keys/{tier}/test")
async def test_api_key(tier: str, sub: str = "sentence", admin: AdminTokenData = Depends(require_admin)):
    """逐个测试该 pool 引用的所有 key，结果回写到 gateway 全局运行时状态（按 key_id）。

    测试只更新 key 的 is_valid/last_error，不切换 active_index，避免干扰真实流量。
    """
    if tier not in ("free", "basic", "pro"):
        raise HTTPException(status_code=400, detail="Invalid tier")
    if sub not in ("title", "sentence", "word"):
        raise HTTPException(status_code=400, detail="Invalid sub")
    import asyncio
    from utils.llm_gateway import gateway

    tier_pools = gateway.pools.get(tier)
    pool = tier_pools.get(sub) if tier_pools else None
    if not pool or not pool.refs:
        raise HTTPException(status_code=400, detail="该 Tier/Sub 没有配置 API Key")

    # 同一 pool 内重复引用的 key 只测一次（按 key_id 去重），结果按 ref 顺序展开
    keys_in_order: list = []
    seen_set = set()
    for ref in pool.refs:
        kid = ref.get("key_id")
        if kid and kid not in seen_set:
            seen_set.add(kid)
            keys_in_order.append(kid)
    tested = await asyncio.gather(*[_test_key(gateway, kid) for kid in keys_in_order])
    by_id = {r["key_id"]: r for r in tested}
    results = []
    for i, ref in enumerate(pool.refs):
        r = by_id[ref.get("key_id")]
        results.append({"index": i, **r})
    gateway._notify()
    _log_action("test_api_keys", "tier", tier, {"results": results})
    return {"results": results}


def _build_key_statuses(pool, gateway) -> list:
    """构建 pool 内每个引用的状态：per-pool per-ref 熔断/运行时状态。"""
    with pool.lock:
        pool._sync_runtime()
        statuses = []
        for i, ref in enumerate(pool.refs):
            key_id = ref.get("key_id")
            kdef = gateway.key_defs.get(key_id, {})
            rt = pool.ref_runtime[i] if i < len(pool.ref_runtime) else {}
            api_key = kdef.get("api_key", "")
            is_valid = rt.get("is_valid", True)
            last_error = rt.get("last_error")
            status_info = {
                "index": i,
                "key_id": key_id,
                "title": kdef.get("title", ""),
                "api_key_preview": api_key[:8] + "..." if api_key else "未配置",
                "model": kdef.get("model", ""),
                "max_tokens": ref.get("max_tokens"),
                "weight": ref.get("weight", 1),  # per-pool
                "disabled": ref.get("disabled", False),  # per-pool
                "is_valid": is_valid,  # per-ref
                "is_busy": gateway.is_key_busy(key_id),  # 全局在途
                "circuit_state": rt.get("circuit_state", "closed"),  # per-ref 熔断状态
                "fail_count": rt.get("fail_count", 0),  # per-ref 连续失败次数
                "last_error": last_error,  # per-ref
                "last_error_time": rt.get("last_error_time"),
                "total_calls": rt.get("total_calls", 0),  # per-ref
            }
            if ref.get("disabled"):
                status_info["status"] = "disabled"
                status_info["status_text"] = "已禁用"
            elif not api_key:
                status_info["status"] = "empty"
                status_info["status_text"] = "未配置"
            elif not is_valid:
                status_info["status"] = "invalid"
                status_info["status_text"] = "无效/欠费"
            elif rt.get("circuit_state") == "open":
                status_info["status"] = "circuit_open"
                status_info["status_text"] = "熔断中"
            elif rt.get("circuit_state") == "half_open":
                status_info["status"] = "circuit_half_open"
                status_info["status_text"] = "探测中"
            elif last_error and "429" in str(last_error):
                status_info["status"] = "rate_limited"
                status_info["status_text"] = "限速中"
            elif last_error:
                status_info["status"] = "error"
                status_info["status_text"] = "异常"
            else:
                status_info["status"] = "normal"
                status_info["status_text"] = "正常"
            statuses.append(status_info)
        return statuses


@router.get("/api-keys/{tier}/status")
async def get_api_key_statuses(tier: str, sub: str = "sentence", admin: AdminTokenData = Depends(require_admin)):
    from utils.llm_gateway import gateway
    tier_pools = gateway.pools.get(tier)
    pool = tier_pools.get(sub) if tier_pools else None
    if not pool:
        return {"statuses": []}
    return {"statuses": _build_key_statuses(pool, gateway)}


def _require_admin_for_sse(tier: str, token: Optional[str] = Query(None)):
    """SSE 专用认证：EventSource 不能设置自定义 header，所以接受 ?token=xxx。"""
    from auth.jwt_utils import decode_admin_token
    if not token:
        raise HTTPException(status_code=401, detail="缺少 token")
    admin_data = decode_admin_token(token)
    if admin_data is None:
        raise HTTPException(status_code=401, detail="token 无效或已过期")
    return admin_data


@router.get("/api-keys/{tier}/status/stream")
async def stream_api_key_statuses(tier: str, sub: str = "sentence", admin: AdminTokenData = Depends(_require_admin_for_sse)):
    """SSE 实时推送 Key 状态。订阅 gateway 全局状态事件（key 状态变化时所有相关 pool 都会收到通知）。"""
    from utils.llm_gateway import gateway
    tier_pools = gateway.pools.get(tier)
    pool = tier_pools.get(sub) if tier_pools else None
    if not pool:
        async def _empty():
            yield 'event: end\ndata: no pool\n\n'
        return StreamingResponse(_empty(), media_type="text/event-stream")

    async def event_stream():
        event = gateway.get_status_event()
        last_sig = None
        while True:
            statuses = _build_key_statuses(pool, gateway)
            sig = json.dumps(statuses, ensure_ascii=False, sort_keys=True)
            if sig != last_sig:
                last_sig = sig
                yield f"data: {json.dumps({'statuses': statuses}, ensure_ascii=False)}\n\n"
            try:
                event.clear()
                await asyncio.wait_for(event.wait(), timeout=15)
            except asyncio.TimeoutError:
                yield ': heartbeat\n\n'

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


# ── 用户管理 ────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    tier: Optional[str] = None,
    status: Optional[str] = None,
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
    if status == "banned":
        conditions.append("banned = 1")
    elif status == "active":
        conditions.append("banned = 0")

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


# ── 批量用户操作（必须在 /users/{user_id} 之前注册） ────────

class BanRequest(BaseModel):
    reason: str = ""


class BatchBanRequest(BaseModel):
    user_ids: List[str]
    reason: str = ""


class BatchUnbanRequest(BaseModel):
    user_ids: List[str]


class BatchDeleteRequest(BaseModel):
    user_ids: List[str]


@router.post("/users/batch-ban")
async def batch_ban_users(req: BatchBanRequest, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    for uid in req.user_ids:
        conn.execute("UPDATE users SET banned = 1, banned_reason = ? WHERE id = ?", (req.reason, uid))
    conn.commit()
    conn.close()
    _log_action("batch_ban", "user", None, {"count": len(req.user_ids), "reason": req.reason})
    return {"status": "ok", "affected": len(req.user_ids)}


@router.post("/users/batch-unban")
async def batch_unban_users(req: BatchUnbanRequest, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    for uid in req.user_ids:
        conn.execute("UPDATE users SET banned = 0, banned_reason = NULL WHERE id = ?", (uid,))
    conn.commit()
    conn.close()
    _log_action("batch_unban", "user", None, {"count": len(req.user_ids)})
    return {"status": "ok", "affected": len(req.user_ids)}


@router.post("/users/batch-delete")
async def batch_delete_users(req: BatchDeleteRequest, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    for uid in req.user_ids:
        conn.execute("DELETE FROM users WHERE id = ?", (uid,))
    conn.commit()
    conn.close()
    # 清理用户数据
    try:
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        for uid in req.user_ids:
            records = storage.load_history(user_id=uid)
            for record in records:
                file_id = record.get("file_id")
                if file_id:
                    storage.delete_history_record(file_id)
            conn2 = storage._get_conn()
            conn2.execute("DELETE FROM user_preferences WHERE user_id = ?", (uid,))
            conn2.execute("DELETE FROM favorite_words WHERE user_id = ?", (uid,))
            conn2.commit()
    except Exception as e:
        print(f"[WARN] 批量清理用户主数据失败: {e}")
    # 清理用户词汇缓存
    try:
        from vocab.user_vocab import _get_conn as get_uv_conn
        uv_conn = get_uv_conn()
        for uid in req.user_ids:
            uv_conn.execute("DELETE FROM user_vocab WHERE user_id = ?", (uid,))
        uv_conn.commit()
        uv_conn.close()
    except Exception as e:
        print(f"[WARN] 批量清理用户词汇缓存失败: {e}")
    # 清理用户 Token 使用记录
    try:
        from utils.token_tracker import _get_conn as get_token_conn
        tk_conn = get_token_conn()
        for uid in req.user_ids:
            tk_conn.execute("DELETE FROM token_usage WHERE user_id = ?", (uid,))
        tk_conn.commit()
        tk_conn.close()
    except Exception as e:
        print(f"[WARN] 批量清理用户Token记录失败: {e}")
    _log_action("batch_delete", "user", None, {"count": len(req.user_ids)})
    return {"status": "ok", "affected": len(req.user_ids)}


@router.post("/users/{user_id}/ban")
async def ban_user(user_id: str, req: BanRequest, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    row = conn.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="用户不存在")
    conn.execute("UPDATE users SET banned = 1, banned_reason = ? WHERE id = ?", (req.reason, user_id))
    conn.commit()
    conn.close()
    _log_action("ban_user", "user", user_id, {"reason": req.reason})
    return {"status": "ok"}


@router.post("/users/{user_id}/unban")
async def unban_user(user_id: str, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    conn.execute("UPDATE users SET banned = 0, banned_reason = NULL WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    _log_action("unban_user", "user", user_id)
    return {"status": "ok"}


@router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    row = conn.execute("SELECT id, email FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="用户不存在")
    # 删除用户记录
    conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    # 删除用户相关数据
    try:
        from db_storage import DatabaseStorage
        storage = DatabaseStorage()
        # 删除该用户的历史记录及关联数据
        records = storage.load_history(user_id=user_id)
        for record in records:
            file_id = record.get("file_id")
            if file_id:
                storage.delete_history_record(file_id)
        # 删除用户偏好、收藏
        conn2 = storage._get_conn()
        conn2.execute("DELETE FROM user_preferences WHERE user_id = ?", (user_id,))
        conn2.execute("DELETE FROM favorite_words WHERE user_id = ?", (user_id,))
        conn2.commit()
    except Exception as e:
        print(f"[WARN] 清理用户主数据失败: {e}")
    # 删除用户词汇缓存
    try:
        from vocab.user_vocab import _get_conn as get_uv_conn
        uv_conn = get_uv_conn()
        uv_conn.execute("DELETE FROM user_vocab WHERE user_id = ?", (user_id,))
        uv_conn.commit()
        uv_conn.close()
    except Exception as e:
        print(f"[WARN] 清理用户词汇缓存失败: {e}")
    # 删除用户 Token 使用记录
    try:
        from utils.token_tracker import _get_conn as get_token_conn
        tk_conn = get_token_conn()
        tk_conn.execute("DELETE FROM token_usage WHERE user_id = ?", (user_id,))
        tk_conn.commit()
        tk_conn.close()
    except Exception as e:
        print(f"[WARN] 清理用户Token记录失败: {e}")
    _log_action("delete_user", "user", user_id, {"email": row["email"]})
    return {"status": "ok"}


@router.get("/users/{user_id}")
async def get_user_detail(user_id: str, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    row = conn.execute(
        "SELECT id, email, name, tier, quota_used, quota_max, banned, banned_reason, created_at FROM users WHERE id = ?",
        (user_id,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="用户不存在")
    result = dict(row)
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
    row = conn.execute("SELECT quota_used, quota_max FROM users WHERE id = ?", (user_id,)).fetchone()
    if not row:
        conn.close()
        raise HTTPException(status_code=404, detail="用户不存在")
    current = row["quota_max"] or 200
    used = row["quota_used"] or 0
    if req.action == "add":
        new_max = min(current + req.value, 10000)
    elif req.action == "subtract":
        new_max = max(current - req.value, used)
    elif req.action == "set":
        new_max = used + req.value
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


class BatchQuotaByIdsRequest(BaseModel):
    user_ids: List[str]
    action: str  # add / subtract / set
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
        conn.execute(f"UPDATE users SET quota_max = quota_used + ? {where}", [req.value] + params)
    else:
        conn.close()
        raise HTTPException(status_code=400, detail="Invalid action")

    conn.commit()
    conn.close()
    _log_action("quota_batch_adjust", "tier", req.target_tier or "all",
                {"action": req.action, "value": req.value, "affected": count})
    return {"status": "ok", "affected": count}


@router.post("/quota/batch-by-ids")
async def batch_adjust_quota_by_ids(req: BatchQuotaByIdsRequest, admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    affected = 0
    for uid in req.user_ids:
        row = conn.execute("SELECT quota_used, quota_max FROM users WHERE id = ?", (uid,)).fetchone()
        if not row:
            continue
        if req.action == "add":
            new_max = row["quota_max"] + req.value
        elif req.action == "subtract":
            new_max = max(row["quota_used"], row["quota_max"] - req.value)
        elif req.action == "set":
            new_max = row["quota_used"] + req.value
        else:
            continue
        conn.execute("UPDATE users SET quota_max = ? WHERE id = ?", (new_max, uid))
        affected += 1
    conn.commit()
    conn.close()
    _log_action("batch_adjust_quota_by_ids", "quota", None, {"count": affected, "action": req.action, "value": req.value})
    return {"status": "ok", "affected": affected}


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
    summary = get_cost_summary()
    # 添加 all_time 统计
    from utils.token_tracker import _get_conn as get_token_conn
    conn = get_token_conn()
    all_time_row = conn.execute("SELECT SUM(prompt_tokens) as pt, SUM(completion_tokens) as ct, SUM(total_tokens) as tt, SUM(cost_usd) as c FROM token_usage").fetchone()
    summary["all_time"] = {"tokens": all_time_row["tt"] or 0, "cost": float(all_time_row["c"] or 0)}
    conn.close()
    return summary


@router.get("/costs/trend")
async def get_cost_trend(days: int = Query(30, ge=1, le=90), admin: AdminTokenData = Depends(require_admin)):
    summary = get_cost_summary(days)
    return {"trend": summary["trend"]}


@router.get("/costs/by-model")
async def get_cost_by_model(admin: AdminTokenData = Depends(require_admin)):
    summary = get_cost_summary()
    return {"by_model": summary["by_model"]}


@router.get("/costs/top-users")
async def get_top_cost_users(
    period: str = Query("month", pattern="^(today|week|month|all)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    admin: AdminTokenData = Depends(require_admin),
):
    from utils.token_tracker import _get_conn as get_token_conn

    if period == "today":
        date_filter = "date(created_at) = date('now')"
    elif period == "week":
        date_filter = "date(created_at) >= date('now', '-7 days')"
    elif period == "month":
        date_filter = "date(created_at) >= date('now', '-30 days')"
    else:  # all
        date_filter = "1=1"

    conn = get_token_conn()
    # 获取总数
    count_row = conn.execute(f"SELECT COUNT(DISTINCT user_id) as cnt FROM token_usage WHERE {date_filter} AND user_id != 'system'").fetchone()
    total = count_row["cnt"] if count_row else 0

    # 最多返回 Top 100
    total = min(total, 100)
    offset = (page - 1) * page_size
    if offset >= 100:
        return {"users": [], "total": total, "page": page, "page_size": page_size}

    # 分页查询
    effective_limit = min(page_size, 100 - offset)
    rows = conn.execute(f"""
        SELECT user_id,
               SUM(prompt_tokens) as prompt_tokens,
               SUM(completion_tokens) as completion_tokens,
               SUM(total_tokens) as total_tokens,
               COUNT(*) as request_count,
               SUM(cost_usd) as cost
        FROM token_usage
        WHERE {date_filter} AND user_id != 'system' AND (request_type IS NULL OR request_type != 'admin_vocab_refresh')
        GROUP BY user_id
        ORDER BY cost DESC
        LIMIT ? OFFSET ?
    """, (effective_limit, offset)).fetchall()

    # 获取用户邮箱
    user_conn = get_user_conn()
    result = []
    for row in rows:
        user_row = user_conn.execute("SELECT email FROM users WHERE id = ?", (row["user_id"],)).fetchone()
        result.append({
            "user_id": row["user_id"],
            "email": user_row["email"] if user_row else row["user_id"],
            "prompt_tokens": row["prompt_tokens"],
            "completion_tokens": row["completion_tokens"],
            "total_tokens": row["total_tokens"],
            "request_count": row["request_count"],
            "cost": float(row["cost"] or 0),
        })
    user_conn.close()

    return {"users": result, "total": total, "page": page, "page_size": page_size}


# ── 全局设置 ──────────────────────────────────────────────

GLOBAL_SETTINGS_FILE = str(DATA_DIR / "global_settings.json")


def _load_global_settings() -> dict:
    try:
        with open(GLOBAL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"request_interval": 0.1, "batch_size": 5}


def _save_global_settings(data: dict):
    with open(GLOBAL_SETTINGS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


@router.get("/global-settings")
async def get_global_settings(admin: AdminTokenData = Depends(require_admin)):
    return _load_global_settings()


class GlobalSettingsUpdate(BaseModel):
    request_interval: Optional[float] = None
    batch_size: Optional[int] = None


@router.put("/global-settings")
async def update_global_settings(req: GlobalSettingsUpdate, admin: AdminTokenData = Depends(require_admin)):
    settings = _load_global_settings()
    if req.request_interval is not None:
        settings["request_interval"] = req.request_interval
    if req.batch_size is not None:
        settings["batch_size"] = req.batch_size
    _save_global_settings(settings)
    # 通知 gateway 刷新配置
    try:
        from utils.llm_gateway import gateway
        gateway.reload()
    except Exception:
        pass
    _log_action("update_global_settings", details=settings)
    return settings


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


# ── UI 翻译管理 ────────────────────────────────────────────

@router.get("/ui-translations")
async def get_ui_translations(admin: AdminTokenData = Depends(require_admin)):
    from db_storage import DatabaseStorage
    storage = DatabaseStorage()
    langs = storage.get_all_ui_translation_langs()
    return {"languages": langs}


@router.delete("/ui-translations/{lang_code}")
async def delete_ui_translation(lang_code: str, admin: AdminTokenData = Depends(require_admin)):
    if lang_code in ('zh', 'en'):
        raise HTTPException(status_code=400, detail="不能删除内置语言")
    from db_storage import DatabaseStorage
    storage = DatabaseStorage()
    conn = storage._get_conn()
    conn.execute("DELETE FROM ui_translations WHERE lang_code = ?", (lang_code,))
    conn.commit()
    _log_action("delete_ui_translation", "lang", lang_code)
    return {"status": "ok"}


# ── 全局词汇管理 ──────────────────────────────────────────

@router.get("/global-vocab/stats")
async def get_global_vocab_stats(admin: AdminTokenData = Depends(require_admin)):
    """获取全局词汇统计：按语言分组的词条数，以及语言对热力图数据。"""
    from vocab.global_vocab import _get_conn as get_gv_conn
    conn = get_gv_conn()
    rows = conn.execute(
        "SELECT source_lang, COUNT(*) as cnt FROM global_vocab GROUP BY source_lang ORDER BY cnt DESC"
    ).fetchall()
    total = conn.execute("SELECT COUNT(*) as c FROM global_vocab").fetchone()["c"]
    # 语言对热力图数据
    pairs = conn.execute(
        "SELECT source_lang, target_lang, COUNT(*) as cnt FROM global_vocab GROUP BY source_lang, target_lang ORDER BY cnt DESC"
    ).fetchall()
    conn.close()
    return {"total": total, "by_lang": [dict(r) for r in rows], "pairs": [dict(r) for r in pairs]}


@router.get("/global-vocab/list")
async def list_global_vocab(
    source_lang: Optional[str] = None,
    target_lang: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    sort: str = Query("hit_count", pattern="^(hit_count|word|created_at)$"),
    order: str = Query("desc", pattern="^(asc|desc)$"),
    admin: AdminTokenData = Depends(require_admin),
):
    """列出全局词汇，支持按语言筛选和搜索。"""
    from vocab.global_vocab import _get_conn as get_gv_conn
    conn = get_gv_conn()
    conditions = []
    params = []
    if source_lang:
        conditions.append("source_lang = ?")
        params.append(source_lang)
    if target_lang:
        conditions.append("target_lang = ?")
        params.append(target_lang)
    if search:
        conditions.append("(word LIKE ? OR meaning LIKE ? OR enriched_meaning LIKE ?)")
        params.extend([f"%{search}%", f"%{search}%", f"%{search}%"])

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    total = conn.execute(f"SELECT COUNT(*) as c FROM global_vocab {where}", params).fetchone()["c"]
    offset = (page - 1) * page_size
    order_clause = f"ORDER BY {sort} {order.upper()}"
    rows = conn.execute(
        f"SELECT id, word, source_lang, target_lang, meaning, enriched_meaning, morphology, hit_count, created_at "
        f"FROM global_vocab {where} {order_clause} LIMIT ? OFFSET ?",
        params + [page_size, offset]
    ).fetchall()
    conn.close()
    return {"total": total, "page": page, "page_size": page_size, "words": [dict(r) for r in rows]}


@router.get("/global-vocab/{word_id}")
async def get_global_vocab_detail(word_id: str, admin: AdminTokenData = Depends(require_admin)):
    """获取全局词汇条目详情。"""
    from vocab.global_vocab import _get_conn as get_gv_conn
    import json as _json
    conn = get_gv_conn()
    row = conn.execute("SELECT * FROM global_vocab WHERE id = ?", (word_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="词条不存在")
    result = dict(row)
    for field in ("variants_detail", "examples", "multiple_choice"):
        if result.get(field):
            try:
                result[field] = _json.loads(result[field])
            except (_json.JSONDecodeError, TypeError):
                pass
    return result


@router.post("/global-vocab/{word_id}/refresh")
async def refresh_global_vocab_detail(word_id: str, admin: AdminTokenData = Depends(require_admin)):
    """重新生成全局词汇条目详情。"""
    from vocab.global_vocab import _get_conn as get_gv_conn, upsert as gv_upsert
    from utils.llm_gateway import gateway
    from auth.deps import TokenData
    conn = get_gv_conn()
    row = conn.execute("SELECT * FROM global_vocab WHERE id = ?", (word_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="词条不存在")

    word = row["word"]
    source_lang = row["source_lang"]
    target_lang = row["target_lang"]

    from llm_api import get_lang_name
    source_lang_name = get_lang_name(source_lang)
    target_lang_name = get_lang_name(target_lang)

    gateway.reload()
    messages = [
        {
            "role": "system",
            "content": f"You are a {source_lang_name} language expert. Generate a detailed word entry for the {source_lang_name} word/expression below. "
                       f"Explain in {target_lang_name}. Return a JSON object with these fields:\n"
                       f"- word: the word/expression\n"
                       f"- enriched_meaning: detailed meaning explanation in {target_lang_name}\n"
                       f"- morphology: part of speech and morphological info\n"
                       f"- examples: array of 3 example sentences in {source_lang_name}, each with {target_lang_name} translation\n"
                       f"- memory_hint: a mnemonic tip in {target_lang_name}\n"
                       f"- variants_detail: array of variant forms with explanations\n"
                       f"- multiple_choice: object with 'question' and 'options' array for a quiz"
        },
        {"role": "user", "content": word}
    ]

    try:
        response = await gateway.call("system", "free", messages, temperature=0.7, request_type="admin_vocab_refresh")
        if "choices" in response and len(response["choices"]) > 0:
            content = response["choices"][0].get("message", {}).get("content", "")
            # 尝试解析 JSON
            import re
            json_match = re.search(r'\{[\s\S]*\}', content)
            if json_match:
                import json
                parsed = json.loads(json_match.group())
                gv_upsert(word, source_lang, target_lang, parsed)
                _log_action("refresh_global_vocab", "vocab", word_id, {"word": word})
                return {"status": "ok", "data": parsed}
        raise Exception("Failed to parse LLM response")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/global-vocab/{word_id}")
async def delete_global_vocab_entry(word_id: str, admin: AdminTokenData = Depends(require_admin)):
    """删除全局词汇条目。"""
    from vocab.global_vocab import _get_conn as get_gv_conn
    conn = get_gv_conn()
    cursor = conn.execute("DELETE FROM global_vocab WHERE id = ?", (word_id,))
    conn.commit()
    deleted = cursor.rowcount > 0
    conn.close()
    if not deleted:
        raise HTTPException(status_code=404, detail="词条不存在")
    _log_action("delete_global_vocab", "vocab", word_id)
    return {"status": "ok"}
