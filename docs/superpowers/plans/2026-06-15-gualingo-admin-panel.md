# Gualingo Admin 管理面板实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Gualingo SaaS 平台添加 Admin 管理面板，支持按 Tier 分离的 API Key 管理、用户管理、黑名单、额度批量调整、Token 成本追踪和仪表盘统计。

**Architecture:** 后端新增 `admin.py` router + `token_tracker.py` 工具模块，修改 `jwt_utils.py`/`deps.py` 支持 admin 角色，修改 `llm_api.py` 支持 tier-based Key 路由。前端新增 `/admin` 路由下的独立 SPA 页面，lazy load 加载。

**Tech Stack:** FastAPI + SQLite (后端), React + react-router-dom + Tailwind CSS (前端), JWT (认证)

---

## 文件结构

### 后端新建文件
- `backend/routers/admin.py` — Admin API 路由（所有 admin 端点）
- `backend/utils/token_tracker.py` — Token 使用量记录与成本估算

### 后端修改文件
- `backend/auth/jwt_utils.py` — 新增 admin JWT 创建/解析
- `backend/auth/deps.py` — 新增 `require_admin` 依赖 + 封禁检查
- `backend/auth/models.py` — 新增 `AdminTokenData` 模型
- `backend/auth/router.py` — users 表新增 banned/banned_reason 列
- `backend/auth/quota.py` — `_ensure_quota_columns` 兼容新列
- `backend/llm_api.py` — 新增 tier-based Key 池加载/轮换
- `backend/routers/text_processing.py` — LLM 调用后记录 token 使用量
- `backend/main.py` — 注册 admin router

### 前端新建文件
- `frontend/src/pages/AdminPage.jsx` — Admin 主布局（侧边栏 + Outlet）
- `frontend/src/components/admin/AdminDashboard.jsx` — 仪表盘
- `frontend/src/components/admin/AdminApiKeys.jsx` — API Key 管理
- `frontend/src/components/admin/AdminUsers.jsx` — 用户列表
- `frontend/src/components/admin/AdminUserDetail.jsx` — 用户详情
- `frontend/src/components/admin/AdminQuota.jsx` — 额度批量管理
- `frontend/src/components/admin/AdminBlacklist.jsx` — 黑名单
- `frontend/src/components/admin/AdminCosts.jsx` — Token 成本
- `frontend/src/utils/adminApi.js` — Admin API 调用封装

### 前端修改文件
- `frontend/src/App.jsx` — 新增 /admin 路由
- `frontend/src/pages/LoginPage.jsx` — admin 登录检测与跳转
- `frontend/src/utils/auth.js` — admin token 管理

---

### Task 1: 后端 — Admin JWT 与认证守卫

**Files:**
- Modify: `backend/auth/models.py`
- Modify: `backend/auth/jwt_utils.py`
- Modify: `backend/auth/deps.py`

- [ ] **Step 1: 在 `auth/models.py` 新增 AdminTokenData**

在文件末尾添加：

```python
class AdminTokenData(BaseModel):
    role: str = "admin"
```

- [ ] **Step 2: 在 `auth/jwt_utils.py` 新增 admin token 创建函数**

在文件末尾添加：

```python
def create_admin_access_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": "admin", "role": "admin", "exp": expire, "type": "access"}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_admin_tokens() -> dict:
    refresh_expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_payload = {"sub": "admin", "role": "admin", "exp": refresh_expire, "type": "refresh"}
    return {
        "access_token": create_admin_access_token(),
        "refresh_token": jwt.encode(refresh_payload, SECRET_KEY, algorithm=ALGORITHM),
        "token_type": "bearer",
    }


def decode_admin_token(token: str) -> AdminTokenData | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "admin":
            return None
        return AdminTokenData(role="admin")
    except (JWTError, ValueError):
        return None
```

同时在文件顶部 import 中添加 `AdminTokenData`：
```python
from auth.models import UserTier, TokenData, AdminTokenData
```

- [ ] **Step 3: 在 `auth/deps.py` 新增 `require_admin` 依赖**

在文件末尾添加：

```python
async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> AdminTokenData:
    """要求 admin 角色。"""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    from auth.jwt_utils import decode_admin_token
    admin_data = decode_admin_token(credentials.credentials)
    if admin_data is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return admin_data
```

同时在文件顶部 import 中添加 `AdminTokenData`：
```python
from auth.models import TokenData, UserTier, AdminTokenData
```

- [ ] **Step 4: 在 `require_auth` 中增加封禁检查**

修改 `backend/auth/deps.py` 的 `require_auth` 函数：

```python
async def require_auth(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """要求用户必须登录。"""
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录",
        )
    # 封禁检查
    from auth.router import _get_conn
    try:
        conn = _get_conn()
        row = conn.execute("SELECT banned FROM users WHERE id = ?", (current_user.user_id,)).fetchone()
        conn.close()
        if row and row["banned"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被封禁")
    except HTTPException:
        raise
    except Exception:
        pass
    return current_user
```

- [ ] **Step 5: 在 `auth/router.py` 的 `_get_conn` 中确保 banned 列存在**

在 `_get_conn` 函数的 `_ensure_quota_columns(conn)` 调用后添加：

```python
    # 确保 banned 列存在
    try:
        cursor = conn.execute("PRAGMA table_info(users)")
        columns = {row[1] for row in cursor.fetchall()}
        if "banned" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0")
        if "banned_reason" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN banned_reason TEXT")
        conn.commit()
    except Exception:
        pass
```

- [ ] **Step 6: 提交**

```bash
git add backend/auth/models.py backend/auth/jwt_utils.py backend/auth/deps.py backend/auth/router.py
git commit -m "feat: add admin JWT, require_admin guard, and banned user check"
```

---

### Task 2: 后端 — Token 使用量追踪模块

**Files:**
- Create: `backend/utils/token_tracker.py`

- [ ] **Step 1: 创建 `token_tracker.py`**

```python
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

    # Top 10 成本用户
    top_users = conn.execute(
        "SELECT tu.user_id, u.email, u.name, "
        "SUM(tu.prompt_tokens) as prompt_tokens, SUM(tu.completion_tokens) as completion_tokens, "
        "SUM(tu.total_tokens) as total_tokens, SUM(tu.cost_usd) as cost "
        "FROM token_usage tu LEFT JOIN (SELECT id, email, name FROM users) u ON tu.user_id = u.id "
        "WHERE date(tu.created_at) >= ? "
        "GROUP BY tu.user_id ORDER BY cost DESC LIMIT 10",
        (month_start,)
    ).fetchall()

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
```

注意：`get_cost_summary` 中的 `users` 表 JOIN 需要跨数据库。由于 `token_usage.db` 和 `users.db` 是不同的 SQLite 文件，需要用 `ATTACH DATABASE` 来关联。修改 `get_cost_summary` 中的 top_users 查询：

```python
    # Top 10 成本用户（跨库查询）
    from auth.router import USER_DB_PATH
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
```

- [ ] **Step 2: 提交**

```bash
git add backend/utils/token_tracker.py
git commit -m "feat: add token usage tracking and cost estimation module"
```

---

### Task 3: 后端 — Tier-based API Key 池

**Files:**
- Modify: `backend/llm_api.py`

- [ ] **Step 1: 在 `llm_api.py` 中新增 tier-based Key 池管理函数**

在文件末尾（`LLMAPI` 类之后）添加：

```python
# ── Tier-based Key 池管理 ──────────────────────────────────

TIER_KEYS_FILE = str(DATA_DIR / "tier_keys.json")


def _load_tier_keys() -> dict:
    """加载按 tier 分组的 API Key 配置。"""
    try:
        with open(TIER_KEYS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"tier_keys": {}}


def _save_tier_keys(data: dict):
    """保存按 tier 分组的 API Key 配置。"""
    with open(TIER_KEYS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_tier_keys() -> dict:
    """获取所有 tier 的 API Key 配置（脱敏）。"""
    data = _load_tier_keys()
    masked = {}
    for tier, pool in data.get("tier_keys", {}).items():
        configs = []
        for cfg in pool.get("configs", []):
            key = cfg.get("api_key", "")
            if key and len(key) > 8:
                masked_key = key[:4] + "*" * (len(key) - 8) + key[-4:]
            else:
                masked_key = "****" if key else ""
            configs.append({
                "api_key": masked_key,
                "base_url": cfg.get("base_url", ""),
                "model": cfg.get("model", ""),
                "has_key": bool(key),
            })
        masked[tier] = {"configs": configs, "active_index": pool.get("active_index", 0)}
    return masked


def update_tier_keys(tier: str, configs: list, active_index: int = 0):
    """更新指定 tier 的 API Key 配置。"""
    data = _load_tier_keys()
    if "tier_keys" not in data:
        data["tier_keys"] = {}
    # 保留已有未脱敏的 key
    existing = data["tier_keys"].get(tier, {}).get("configs", [])
    new_configs = []
    for i, cfg in enumerate(configs):
        key = cfg.get("api_key", "")
        # 如果 key 是脱敏的（包含 *），保留原有的
        if "*" in key and i < len(existing):
            key = existing[i].get("api_key", key)
        new_configs.append({
            "api_key": key,
            "base_url": cfg.get("base_url", ""),
            "model": cfg.get("model", ""),
        })
    data["tier_keys"][tier] = {"configs": new_configs, "active_index": active_index}
    _save_tier_keys(data)


def get_tier_llm_config(tier: str) -> dict | None:
    """获取指定 tier 的当前活跃 LLM 配置（未脱敏）。用于实际 API 调用。"""
    data = _load_tier_keys()
    pool = data.get("tier_keys", {}).get(tier)
    if not pool or not pool.get("configs"):
        return None
    idx = pool.get("active_index", 0)
    configs = pool["configs"]
    if idx >= len(configs):
        idx = 0
    # 轮换：更新 active_index
    next_idx = (idx + 1) % len(configs)
    pool["active_index"] = next_idx
    _save_tier_keys(data)
    return configs[idx]
```

- [ ] **Step 2: 修改 `call_with_rotation` 支持 tier 参数**

在 `llm_api.py` 的 `call_with_rotation` 函数签名中添加 `tier: str = None` 参数，在函数开头添加 tier-based 路由逻辑：

找到 `async def call_with_rotation` 函数，在函数体最前面（获取 settings 之前）添加：

```python
    # Tier-based Key 路由
    if tier:
        tier_config = get_tier_llm_config(tier)
        if tier_config and tier_config.get("api_key"):
            headers = {
                "Authorization": f"Bearer {tier_config['api_key']}",
                "Content-Type": "application/json",
            }
            base_url = tier_config.get("base_url", "https://api.openai.com/v1")
            model = tier_config.get("model", "gpt-4o-mini")
            url = f"{base_url.rstrip('/')}/chat/completions"
            payload = {
                "model": model,
                "messages": messages,
                **({"temperature": temperature} if temperature is not None else {}),
                **({"max_tokens": max_tokens} if max_tokens is not None else {}),
            }
            import httpx
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, headers=headers, json=payload)
                if resp.status_code == 200:
                    return resp.json()
                # 失败则 fallback 到默认配置
    # 原有逻辑...
```

- [ ] **Step 3: 提交**

```bash
git add backend/llm_api.py
git commit -m "feat: add tier-based API key pool with rotation"
```

---

### Task 4: 后端 — 在 LLM 调用点记录 token 使用量

**Files:**
- Modify: `backend/routers/text_processing.py`

- [ ] **Step 1: 在 `_preprocess_and_run` 中记录 token 使用量**

在 `backend/routers/text_processing.py` 顶部添加 import：

```python
from utils.token_tracker import record_token_usage
```

在 `_preprocess_and_run` 函数中，每次 LLM 调用成功后添加 token 记录。找到翻译部分的 `response = await llm_api.call_llm(messages, ...)` 调用，在 `if "choices" in response` 块内添加：

```python
                    # 记录 token 使用量
                    if user_id and response.get("usage"):
                        record_token_usage(user_id, llm_api._current_model or "unknown", response["usage"], "translate")
```

对生成（generate）部分同理添加：

```python
                    # 记录 token 使用量
                    if user_id and response.get("usage"):
                        record_token_usage(user_id, llm_api._current_model or "unknown", response["usage"], "generate")
```

在 `process_text_background` 调用之后（标题生成后），也需要记录。但由于 `process_text_background` 内部有多次 LLM 调用，最简单的方式是在 `llm_api.py` 的 `call_llm` 方法中统一记录。修改 `LLMAPI.call_llm` 方法：

在 `backend/llm_api.py` 的 `LLMAPI` 类的 `call_llm` 方法末尾，return 之前添加：

```python
        # 记录 token 使用量（如果有 user_id 在上下文中）
        if result and result.get("usage"):
            try:
                from utils.token_tracker import record_token_usage
                # user_id 通过 thread-local 或参数传递
                model_name = self._current_model or "unknown"
                record_token_usage("__platform__", model_name, result["usage"], "llm_call")
            except Exception:
                pass
```

注意：更精确的方式是将 user_id 传入 call_llm。但为了最小化改动，先记录为 `__platform__`，后续在 admin API 中按 user_id 聚合时使用 token_usage 表中已有的 user_id（从 text_processing 传入的）。

实际上更好的方式是在 `text_processing.py` 的 `_preprocess_and_run` 中统一记录。在函数末尾（`consume_quota` 之后）添加：

```python
        # 记录本次处理的 token 使用量（从 processing_status 获取）
        # 注意：实际 token 记录在各 LLM 调用点完成
```

由于 `call_llm` 是所有 LLM 调用的统一入口，最简洁的方式是在 `call_llm` 中添加可选的 `user_id` 参数。修改 `LLMAPI.call_llm` 签名：

```python
    async def call_llm(self, messages, temperature=None, max_tokens=None, user_id=None):
```

在 `call_llm` 的 return 之前添加：

```python
        if user_id and result and result.get("usage"):
            try:
                from utils.token_tracker import record_token_usage
                record_token_usage(user_id, self._current_model or "unknown", result["usage"], "llm_call")
            except Exception:
                pass
```

然后在 `text_processing.py` 的所有 `llm_api.call_llm` 调用中传入 `user_id=user_id`。

- [ ] **Step 2: 提交**

```bash
git add backend/routers/text_processing.py backend/llm_api.py
git commit -m "feat: record token usage on LLM calls"
```

---

### Task 5: 后端 — Admin API 路由

**Files:**
- Create: `backend/routers/admin.py`
- Modify: `backend/main.py`

- [ ] **Step 1: 创建 `backend/routers/admin.py`**

```python
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
    if req.email != "admin" or req.password != ADMIN_PASSWORD:
        raise HTTPException(status_code=401, detail="管理员账号或密码错误")
    return create_admin_tokens()


# ── 仪表盘 ──────────────────────────────────────────────────

@router.get("/dashboard")
async def get_dashboard(admin: AdminTokenData = Depends(require_admin)):
    conn = get_user_conn()
    now = datetime.now(timezone.utc)
    today = now.strftime("%Y-%m-%d")
    month_start = now.strftime("%Y-%m-01")

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
    from llm_api import _load_tier_keys, get_tier_llm_config
    config = get_tier_llm_config(tier)
    if not config or not config.get("api_key"):
        raise HTTPException(status_code=400, detail="该 Tier 没有配置 API Key")
    # 发一个简单请求测试
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
    # 脱敏 api_key
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
    action: str  # "add", "subtract", "set"
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
    target_tier: Optional[str] = None  # None = 全部
    action: str  # "add", "subtract", "set"
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

    # 先统计影响数量
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
```

- [ ] **Step 2: 在 `main.py` 注册 admin router**

在 `backend/main.py` 的 import 区域添加：

```python
from routers.admin import router as admin_router
```

在路由注册区域添加：

```python
app.include_router(admin_router)
```

- [ ] **Step 3: 提交**

```bash
git add backend/routers/admin.py backend/main.py
git commit -m "feat: add admin API routes (dashboard, api-keys, users, quota, blacklist, costs, logs)"
```

---

### Task 6: 前端 — Admin API 封装与认证

**Files:**
- Create: `frontend/src/utils/adminApi.js`
- Modify: `frontend/src/utils/auth.js`
- Modify: `frontend/src/pages/LoginPage.jsx`

- [ ] **Step 1: 创建 `frontend/src/utils/adminApi.js`**

```javascript
import axios from 'axios';

const baseUrl = '';

export const adminApi = {
  // 登录
  login: async (email, password) => {
    const response = await axios.post(`${baseUrl}/api/admin/login`, { email, password });
    return response.data;
  },

  // 仪表盘
  getDashboard: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/dashboard`);
    return response.data;
  },

  // API Key 管理
  getApiKeys: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/api-keys`);
    return response.data;
  },

  updateApiKeys: async (tier, configs, activeIndex = 0) => {
    const response = await axios.put(`${baseUrl}/api/admin/api-keys/${tier}`, { configs, active_index: activeIndex });
    return response.data;
  },

  testApiKey: async (tier) => {
    const response = await axios.post(`${baseUrl}/api/admin/api-keys/${tier}/test`);
    return response.data;
  },

  // 用户管理
  getUsers: async (page = 1, search = '', tier = '', sort = 'created_at', order = 'desc') => {
    const params = { page, page_size: 20, sort, order };
    if (search) params.search = search;
    if (tier) params.tier = tier;
    const response = await axios.get(`${baseUrl}/api/admin/users`, { params });
    return response.data;
  },

  getUserDetail: async (userId) => {
    const response = await axios.get(`${baseUrl}/api/admin/users/${userId}`);
    return response.data;
  },

  updateUser: async (userId, data) => {
    const response = await axios.put(`${baseUrl}/api/admin/users/${userId}`, data);
    return response.data;
  },

  adjustUserQuota: async (userId, action, value) => {
    const response = await axios.put(`${baseUrl}/api/admin/users/${userId}/quota`, { action, value });
    return response.data;
  },

  getUserHistory: async (userId) => {
    const response = await axios.get(`${baseUrl}/api/admin/users/${userId}/history`);
    return response.data;
  },

  getUserFavorites: async (userId, sourceLang) => {
    const params = {};
    if (sourceLang) params.source_lang = sourceLang;
    const response = await axios.get(`${baseUrl}/api/admin/users/${userId}/favorites`, { params });
    return response.data;
  },

  getUserPreferences: async (userId) => {
    const response = await axios.get(`${baseUrl}/api/admin/users/${userId}/preferences`);
    return response.data;
  },

  getUserWordList: async (userId, sourceLang) => {
    const params = {};
    if (sourceLang) params.source_lang = sourceLang;
    const response = await axios.get(`${baseUrl}/api/admin/users/${userId}/word-list`, { params });
    return response.data;
  },

  // 额度批量管理
  batchAdjustQuota: async (targetTier, action, value) => {
    const response = await axios.post(`${baseUrl}/api/admin/quota/batch`, {
      target_tier: targetTier || null, action, value,
    });
    return response.data;
  },

  // 黑名单
  getBlacklist: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/blacklist`);
    return response.data;
  },

  addToBlacklist: async (email, reason = '') => {
    const response = await axios.post(`${baseUrl}/api/admin/blacklist`, { email, reason });
    return response.data;
  },

  removeFromBlacklist: async (userId) => {
    const response = await axios.delete(`${baseUrl}/api/admin/blacklist/${userId}`);
    return response.data;
  },

  // Token 成本
  getCosts: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/costs`);
    return response.data;
  },

  getCostTrend: async (days = 30) => {
    const response = await axios.get(`${baseUrl}/api/admin/costs/trend`, { params: { days } });
    return response.data;
  },

  getCostByModel: async () => {
    const response = await axios.get(`${baseUrl}/api/admin/costs/by-model`);
    return response.data;
  },

  // 操作日志
  getLogs: async (page = 1) => {
    const response = await axios.get(`${baseUrl}/api/admin/logs`, { params: { page, page_size: 20 } });
    return response.data;
  },
};
```

- [ ] **Step 2: 修改 `frontend/src/utils/auth.js`，添加 admin token 管理**

在 `auth` 对象中添加：

```javascript
  isAdmin() {
    try {
      const tokens = this.getTokens();
      if (!tokens?.access_token) return false;
      // 解析 JWT payload 判断是否 admin
      const payload = JSON.parse(atob(tokens.access_token.split('.')[1]));
      return payload.role === 'admin';
    } catch {
      return false;
    }
  },
```

- [ ] **Step 3: 修改 `frontend/src/pages/LoginPage.jsx`，admin 登录检测与跳转**

在登录成功后，检查是否是 admin 并跳转。找到登录成功的处理逻辑，添加 admin 检测：

```javascript
  // 在登录成功后添加
  if (auth.isAdmin()) {
    window.location.href = '/admin';
    return;
  }
```

- [ ] **Step 4: 提交**

```bash
git add frontend/src/utils/adminApi.js frontend/src/utils/auth.js frontend/src/pages/LoginPage.jsx
git commit -m "feat: add admin API client, admin token detection, and login redirect"
```

---

### Task 7: 前端 — Admin 主布局与路由

**Files:**
- Create: `frontend/src/pages/AdminPage.jsx`
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: 创建 `frontend/src/pages/AdminPage.jsx`**

```jsx
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { auth } from '../utils/auth'

const navItems = [
  { to: '/admin', label: '仪表盘', end: true },
  { to: '/admin/api-keys', label: 'API Key' },
  { to: '/admin/users', label: '用户管理' },
  { to: '/admin/quota', label: '额度管理' },
  { to: '/admin/blacklist', label: '黑名单' },
  { to: '/admin/costs', label: 'Token 成本' },
]

export default function AdminPage() {
  const navigate = useNavigate()

  if (!auth.isAdmin()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a2e]">
        <div className="text-center">
          <p className="text-[#e8d5b7] text-lg mb-4">需要管理员权限</p>
          <button onClick={() => navigate('/login')} className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold">去登录</button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#1a1a2e] flex">
      {/* 侧边栏 */}
      <aside className="w-56 bg-[#16213e] border-r border-[#c9a96e]/20 flex flex-col">
        <div className="p-4 border-b border-[#c9a96e]/20">
          <h1 className="text-[#c9a96e] font-bold text-lg">Gualingo Admin</h1>
          <p className="text-[#e8d5b7]/50 text-xs mt-1">管理面板</p>
        </div>
        <nav className="flex-1 p-2">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm mb-1 transition-colors ${
                  isActive ? 'bg-[#c9a96e]/20 text-[#c9a96e] font-bold' : 'text-[#e8d5b7]/70 hover:bg-[#c9a96e]/10 hover:text-[#e8d5b7]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-[#c9a96e]/20">
          <button onClick={() => { auth.logout(); navigate('/login'); }} className="text-[#e8d5b7]/50 text-sm hover:text-[#e8d5b7]">退出</button>
        </div>
      </aside>

      {/* 主内容区 */}
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
```

- [ ] **Step 2: 修改 `frontend/src/App.jsx`，添加 Admin 路由**

```jsx
import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import LearningApp from './pages/LearningApp'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'))
const AdminApiKeys = lazy(() => import('./components/admin/AdminApiKeys'))
const AdminUsers = lazy(() => import('./components/admin/AdminUsers'))
const AdminUserDetail = lazy(() => import('./components/admin/AdminUserDetail'))
const AdminQuota = lazy(() => import('./components/admin/AdminQuota'))
const AdminBlacklist = lazy(() => import('./components/admin/AdminBlacklist'))
const AdminCosts = lazy(() => import('./components/admin/AdminCosts'))

function AdminSuspense({ children }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center text-[#e8d5b7]">加载中...</div>}>
      {children}
    </Suspense>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/learn" element={<LearningApp />} />
      <Route path="/learn/:fileId" element={<LearningApp />} />
      <Route path="/admin" element={<AdminSuspense><AdminPage /></AdminSuspense>}>
        <Route index element={<AdminSuspense><AdminDashboard /></AdminSuspense>} />
        <Route path="api-keys" element={<AdminSuspense><AdminApiKeys /></AdminSuspense>} />
        <Route path="users" element={<AdminSuspense><AdminUsers /></AdminSuspense>} />
        <Route path="users/:id" element={<AdminSuspense><AdminUserDetail /></AdminSuspense>} />
        <Route path="quota" element={<AdminSuspense><AdminQuota /></AdminSuspense>} />
        <Route path="blacklist" element={<AdminSuspense><AdminBlacklist /></AdminSuspense>} />
        <Route path="costs" element={<AdminSuspense><AdminCosts /></AdminSuspense>} />
      </Route>
    </Routes>
  )
}

export default App
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/pages/AdminPage.jsx frontend/src/App.jsx
git commit -m "feat: add admin page layout with sidebar navigation and lazy-loaded routes"
```

---

### Task 8: 前端 — Admin 各页面组件

**Files:**
- Create: `frontend/src/components/admin/AdminDashboard.jsx`
- Create: `frontend/src/components/admin/AdminApiKeys.jsx`
- Create: `frontend/src/components/admin/AdminUsers.jsx`
- Create: `frontend/src/components/admin/AdminUserDetail.jsx`
- Create: `frontend/src/components/admin/AdminQuota.jsx`
- Create: `frontend/src/components/admin/AdminBlacklist.jsx`
- Create: `frontend/src/components/admin/AdminCosts.jsx`

- [ ] **Step 1: 创建 `AdminDashboard.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.getDashboard().then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-[#e8d5b7]">加载中...</div>
  if (!data) return <div className="text-red-400">加载失败</div>

  const cards = [
    { label: '总用户数', value: data.total_users, sub: `今日新增 ${data.new_today}` },
    { label: '今日 Token 成本', value: `$${(data.token_cost_today?.cost || 0).toFixed(4)}`, sub: `${(data.token_cost_today?.tokens || 0).toLocaleString()} tokens` },
    { label: '本月 Token 成本', value: `$${(data.token_cost_month?.cost || 0).toFixed(4)}`, sub: `${(data.token_cost_month?.tokens || 0).toLocaleString()} tokens` },
    { label: '平均每用户成本', value: `$${data.avg_cost_per_user.toFixed(4)}`, sub: `${data.token_cost_month?.active_users || 0} 活跃用户` },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">仪表盘</h2>

      {/* 指标卡片 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card, i) => (
          <div key={i} className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
            <p className="text-[#e8d5b7]/60 text-sm">{card.label}</p>
            <p className="text-[#c9a96e] text-2xl font-bold mt-1">{card.value}</p>
            <p className="text-[#e8d5b7]/40 text-xs mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* Tier 分布 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">Tier 分布</h3>
          {Object.entries(data.tier_distribution || {}).map(([tier, count]) => (
            <div key={tier} className="flex justify-between text-[#e8d5b7] text-sm mb-1">
              <span>{tier}</span><span>{count}</span>
            </div>
          ))}
        </div>
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">学习语言分布</h3>
          {Object.entries(data.source_lang_distribution || {}).slice(0, 8).map(([lang, count]) => (
            <div key={lang} className="flex justify-between text-[#e8d5b7] text-sm mb-1">
              <span>{lang}</span><span>{count}</span>
            </div>
          ))}
        </div>
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">目标语言分布</h3>
          {Object.entries(data.target_lang_distribution || {}).slice(0, 8).map(([lang, count]) => (
            <div key={lang} className="flex justify-between text-[#e8d5b7] text-sm mb-1">
              <span>{lang}</span><span>{count}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Top 10 成本用户 */}
      {data.top_cost_users?.length > 0 && (
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">Top 10 成本用户（本月）</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
                <th className="text-left py-2">邮箱</th>
                <th className="text-right py-2">Prompt</th>
                <th className="text-right py-2">Completion</th>
                <th className="text-right py-2">Total</th>
                <th className="text-right py-2">成本</th>
              </tr>
            </thead>
            <tbody>
              {data.top_cost_users.map((u, i) => (
                <tr key={i} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                  <td className="py-2">{u.email}</td>
                  <td className="text-right">{(u.prompt_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">{(u.completion_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">{(u.total_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">${(u.cost || 0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 `AdminApiKeys.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'

const TIERS = ['free', 'basic', 'pro']

export default function AdminApiKeys() {
  const [keys, setKeys] = useState({})
  const [activeTier, setActiveTier] = useState('free')
  const [editing, setEditing] = useState({})
  const [testing, setTesting] = useState(null)
  const [testResult, setTestResult] = useState(null)

  useEffect(() => {
    adminApi.getApiKeys().then(data => {
      setKeys(data)
      // 初始化编辑状态
      const ed = {}
      for (const tier of TIERS) {
        const pool = data[tier] || { configs: [], active_index: 0 }
        ed[tier] = {
          configs: pool.configs.length > 0 ? pool.configs : [{ api_key: '', base_url: '', model: '' }],
          active_index: pool.active_index || 0,
        }
      }
      setEditing(ed)
    })
  }, [])

  const addConfig = (tier) => {
    setEditing(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        configs: [...prev[tier].configs, { api_key: '', base_url: '', model: '' }],
      }
    }))
  }

  const removeConfig = (tier, index) => {
    setEditing(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        configs: prev[tier].configs.filter((_, i) => i !== index),
      }
    }))
  }

  const updateConfig = (tier, index, field, value) => {
    setEditing(prev => {
      const newConfigs = [...prev[tier].configs]
      newConfigs[index] = { ...newConfigs[index], [field]: value }
      return { ...prev, [tier]: { ...prev[tier], configs: newConfigs } }
    })
  }

  const saveTier = async (tier) => {
    try {
      await adminApi.updateApiKeys(tier, editing[tier].configs, editing[tier].active_index)
      // 刷新
      const data = await adminApi.getApiKeys()
      setKeys(data)
      alert(`${tier} Key 已保存`)
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message))
    }
  }

  const testTier = async (tier) => {
    setTesting(tier)
    setTestResult(null)
    try {
      const result = await adminApi.testApiKey(tier)
      setTestResult(result)
    } catch (e) {
      setTestResult({ status: 'error', message: e.message })
    } finally {
      setTesting(null)
    }
  }

  if (!editing.free) return <div className="text-[#e8d5b7]">加载中...</div>

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">全局 API Key 管理</h2>

      {/* Tier 标签页 */}
      <div className="flex gap-2 mb-6">
        {TIERS.map(tier => (
          <button
            key={tier}
            onClick={() => setActiveTier(tier)}
            className={`px-4 py-2 rounded font-bold text-sm ${
              activeTier === tier ? 'bg-[#c9a96e] text-[#1a1a2e]' : 'bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/30'
            }`}
          >
            {tier.toUpperCase()}
          </button>
        ))}
      </div>

      {/* 当前 Tier 的配置 */}
      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[#c9a96e] font-bold">{activeTier.toUpperCase()} Key 池</h3>
          <div className="flex gap-2">
            <button onClick={() => testTier(activeTier)} disabled={testing === activeTier}
              className="px-3 py-1 bg-[#c9a96e]/20 text-[#c9a96e] rounded text-sm hover:bg-[#c9a96e]/30 disabled:opacity-50">
              {testing === activeTier ? '测试中...' : '测试'}
            </button>
            <button onClick={() => addConfig(activeTier)}
              className="px-3 py-1 bg-[#c9a96e] text-[#1a1a2e] rounded text-sm font-bold">+ 添加</button>
          </div>
        </div>

        {testResult && (
          <div className={`mb-4 p-2 rounded text-sm ${testResult.status === 'ok' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
            {testResult.message}
          </div>
        )}

        {editing[activeTier]?.configs.map((cfg, i) => (
          <div key={i} className="flex gap-2 mb-2 items-end">
            <div className="flex-1">
              <label className="text-[#e8d5b7]/60 text-xs">API Key</label>
              <input type="password" value={cfg.api_key || ''} onChange={e => updateConfig(activeTier, i, 'api_key', e.target.value)}
                placeholder="sk-..." className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-[#e8d5b7]/60 text-xs">Base URL</label>
              <input value={cfg.base_url || ''} onChange={e => updateConfig(activeTier, i, 'base_url', e.target.value)}
                placeholder="https://api.openai.com/v1" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
            </div>
            <div className="flex-1">
              <label className="text-[#e8d5b7]/60 text-xs">Model</label>
              <input value={cfg.model || ''} onChange={e => updateConfig(activeTier, i, 'model', e.target.value)}
                placeholder="gpt-4o-mini" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
            </div>
            <button onClick={() => removeConfig(activeTier, i)} className="text-red-400 text-sm px-2 py-1">删除</button>
          </div>
        ))}

        <div className="flex justify-end mt-4">
          <button onClick={() => saveTier(activeTier)}
            className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">保存</button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 创建 `AdminUsers.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../utils/adminApi'

export default function AdminUsers() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    adminApi.getUsers(page, search, tier).then(setData).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [page, tier])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    load()
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">用户管理</h2>

      {/* 搜索与筛选 */}
      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索邮箱或名称..."
          className="flex-1 bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm" />
        <select value={tier} onChange={e => { setTier(e.target.value); setPage(1); }}
          className="bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm">
          <option value="">全部 Tier</option>
          <option value="free">Free</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
        </select>
        <button type="submit" className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">搜索</button>
      </form>

      {/* 用户列表 */}
      {loading ? <div className="text-[#e8d5b7]">加载中...</div> : (
        <div className="bg-[#16213e] rounded-lg border border-[#c9a96e]/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
                <th className="text-left py-2 px-3">邮箱</th>
                <th className="text-left py-2 px-3">名称</th>
                <th className="text-center py-2 px-3">Tier</th>
                <th className="text-center py-2 px-3">额度</th>
                <th className="text-center py-2 px-3">封禁</th>
                <th className="text-left py-2 px-3">注册时间</th>
              </tr>
            </thead>
            <tbody>
              {data?.users?.map(user => (
                <tr key={user.id} onClick={() => navigate(`/admin/users/${user.id}`)}
                  className="text-[#e8d5b7] border-b border-[#c9a96e]/5 cursor-pointer hover:bg-[#c9a96e]/10">
                  <td className="py-2 px-3">{user.email}</td>
                  <td className="py-2 px-3">{user.name}</td>
                  <td className="text-center py-2 px-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${user.tier === 'pro' ? 'bg-purple-900/30 text-purple-400' : user.tier === 'basic' ? 'bg-blue-900/30 text-blue-400' : 'bg-gray-700/30 text-gray-400'}`}>{user.tier}</span></td>
                  <td className="text-center py-2 px-3">{user.quota_used}/{user.quota_max}</td>
                  <td className="text-center py-2 px-3">{user.banned ? <span className="text-red-400">是</span> : <span className="text-green-400">否</span>}</td>
                  <td className="py-2 px-3 text-xs">{user.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* 分页 */}
          <div className="flex justify-between items-center p-3 text-sm text-[#e8d5b7]/60">
            <span>共 {data?.total} 条</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-[#1a1a2e] rounded disabled:opacity-30">上一页</button>
              <span className="px-3 py-1">{page}</span>
              <button disabled={!data || page * 20 >= data.total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-[#1a1a2e] rounded disabled:opacity-30">下一页</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: 创建 `AdminUserDetail.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi } from '../../utils/adminApi'

export default function AdminUserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [history, setHistory] = useState([])
  const [favorites, setFavorites] = useState([])
  const [prefs, setPrefs] = useState(null)
  const [quotaAction, setQuotaAction] = useState('add')
  const [quotaValue, setQuotaValue] = useState(10)

  useEffect(() => {
    adminApi.getUserDetail(id).then(setUser)
    adminApi.getUserHistory(id).then(d => setHistory(d.records || []))
    adminApi.getUserFavorites(id).then(d => setFavorites(d.words || []))
    adminApi.getUserPreferences(id).then(setPrefs)
  }, [id])

  const changeTier = async (newTier) => {
    await adminApi.updateUser(id, { tier: newTier })
    setUser(prev => ({ ...prev, tier: newTier }))
  }

  const adjustQuota = async () => {
    const result = await adminApi.adjustUserQuota(id, quotaAction, quotaValue)
    setUser(prev => ({ ...prev, quota_max: result.new_max }))
  }

  if (!user) return <div className="text-[#e8d5b7]">加载中...</div>

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-[#c9a96e] text-sm mb-4 inline-block">&larr; 返回</button>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">用户详情</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        {/* 基本信息 */}
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">基本信息</h3>
          <div className="space-y-2 text-sm text-[#e8d5b7]">
            <div className="flex justify-between"><span className="text-[#e8d5b7]/60">邮箱</span><span>{user.email}</span></div>
            <div className="flex justify-between"><span className="text-[#e8d5b7]/60">名称</span><span>{user.name}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-[#e8d5b7]/60">Tier</span>
              <select value={user.tier} onChange={e => changeTier(e.target.value)}
                className="bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm">
                <option value="free">Free</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div className="flex justify-between"><span className="text-[#e8d5b7]/60">注册时间</span><span>{user.created_at?.slice(0, 10)}</span></div>
            <div className="flex justify-between"><span className="text-[#e8d5b7]/60">封禁</span><span>{user.banned ? <span className="text-red-400">是 ({user.banned_reason})</span> : '否'}</span></div>
          </div>
        </div>

        {/* 额度状态 */}
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">额度状态</h3>
          <div className="text-[#e8d5b7] text-sm mb-4">
            <div className="flex justify-between mb-1"><span>已使用</span><span>{user.quota_used}</span></div>
            <div className="flex justify-between mb-1"><span>上限</span><span>{user.quota_max}</span></div>
            <div className="flex justify-between"><span>可用</span><span className="text-[#c9a96e] font-bold">{user.quota_max - user.quota_used}</span></div>
          </div>
          <div className="flex gap-2 items-end">
            <select value={quotaAction} onChange={e => setQuotaAction(e.target.value)}
              className="bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm">
              <option value="add">增加</option>
              <option value="subtract">减少</option>
              <option value="set">设为</option>
            </select>
            <input type="number" value={quotaValue} onChange={e => setQuotaValue(Number(e.target.value))}
              className="w-20 bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
            <button onClick={adjustQuota} className="px-3 py-1 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">调整</button>
          </div>
        </div>
      </div>

      {/* 学习数据 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">历史记录 ({history.length})</h3>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {history.map(r => (
              <div key={r.file_id} className="text-[#e8d5b7] text-sm flex justify-between">
                <span>{r.title}</span>
                <span className="text-[#e8d5b7]/40 text-xs">{r.source_lang}→{r.target_lang}</span>
              </div>
            ))}
            {history.length === 0 && <p className="text-[#e8d5b7]/40 text-sm">暂无</p>}
          </div>
        </div>

        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">收藏单词 ({favorites.length})</h3>
          <div className="max-h-60 overflow-y-auto flex flex-wrap gap-1">
            {favorites.map(w => (
              <span key={w} className="bg-[#c9a96e]/10 text-[#c9a96e] px-2 py-0.5 rounded text-xs">{w}</span>
            ))}
            {favorites.length === 0 && <p className="text-[#e8d5b7]/40 text-sm">暂无</p>}
          </div>
        </div>

        {prefs && (
          <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
            <h3 className="text-[#c9a96e] font-bold mb-3">偏好设置</h3>
            <pre className="text-[#e8d5b7] text-xs overflow-auto">{JSON.stringify(prefs, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 创建 `AdminQuota.jsx`**

```jsx
import { useState } from 'react'
import { adminApi } from '../../utils/adminApi'

export default function AdminQuota() {
  const [tier, setTier] = useState('free')
  const [action, setAction] = useState('add')
  const [value, setValue] = useState(10)
  const [result, setResult] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const execute = async () => {
    try {
      const res = await adminApi.batchAdjustQuota(tier || null, action, value)
      setResult(res)
      setConfirming(false)
    } catch (e) {
      alert('操作失败: ' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">额度批量管理</h2>

      <div className="bg-[#16213e] rounded-lg p-6 border border-[#c9a96e]/20 max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">目标范围</label>
            <select value={tier} onChange={e => setTier(e.target.value)}
              className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm">
              <option value="free">Free 用户</option>
              <option value="basic">Basic 用户</option>
              <option value="pro">Pro 用户</option>
              <option value="">全部用户</option>
            </select>
          </div>

          <div>
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">操作类型</label>
            <select value={action} onChange={e => setAction(e.target.value)}
              className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm">
              <option value="add">增加 N 句</option>
              <option value="subtract">减少 N 句</option>
              <option value="set">设为 N 句</option>
            </select>
          </div>

          <div>
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">数量</label>
            <input type="number" value={value} onChange={e => setValue(Number(e.target.value))}
              className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm" />
          </div>

          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className="w-full py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold">执行</button>
          ) : (
            <div className="space-y-2">
              <p className="text-[#e8d5b7] text-sm">确认要对 <span className="text-[#c9a96e] font-bold">{tier || '全部'}</span> 用户执行 <span className="text-[#c9a96e] font-bold">{action === 'add' ? '增加' : action === 'subtract' ? '减少' : '设为'} {value}</span> 句？</p>
              <div className="flex gap-2">
                <button onClick={execute} className="flex-1 py-2 bg-red-600 text-white rounded font-bold text-sm">确认执行</button>
                <button onClick={() => setConfirming(false)} className="flex-1 py-2 bg-[#1a1a2e] text-[#e8d5b7] rounded text-sm border border-[#c9a96e]/20">取消</button>
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="mt-4 p-3 bg-green-900/30 text-green-400 rounded text-sm">
            操作成功，影响了 {result.affected} 名用户
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 6: 创建 `AdminBlacklist.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'

export default function AdminBlacklist() {
  const [blacklist, setBlacklist] = useState([])
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')

  const load = () => {
    adminApi.getBlacklist().then(d => setBlacklist(d.users || []))
  }

  useEffect(() => { load() }, [])

  const add = async (e) => {
    e.preventDefault()
    try {
      await adminApi.addToBlacklist(email, reason)
      setEmail('')
      setReason('')
      load()
    } catch (err) {
      alert('添加失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const remove = async (userId) => {
    if (!confirm('确认解封该用户？')) return
    await adminApi.removeFromBlacklist(userId)
    load()
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">黑名单</h2>

      {/* 添加封禁 */}
      <form onSubmit={add} className="flex gap-2 mb-6">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="用户邮箱" required
          className="flex-1 bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm" />
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="封禁原因"
          className="flex-1 bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm" />
        <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded font-bold text-sm">封禁</button>
      </form>

      {/* 黑名单列表 */}
      <div className="bg-[#16213e] rounded-lg border border-[#c9a96e]/20 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
              <th className="text-left py-2 px-3">邮箱</th>
              <th className="text-left py-2 px-3">名称</th>
              <th className="text-left py-2 px-3">封禁原因</th>
              <th className="text-left py-2 px-3">注册时间</th>
              <th className="text-center py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {blacklist.map(user => (
              <tr key={user.id} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                <td className="py-2 px-3">{user.email}</td>
                <td className="py-2 px-3">{user.name}</td>
                <td className="py-2 px-3">{user.banned_reason || '-'}</td>
                <td className="py-2 px-3 text-xs">{user.created_at?.slice(0, 10)}</td>
                <td className="text-center py-2 px-3">
                  <button onClick={() => remove(user.id)} className="text-green-400 text-sm hover:underline">解封</button>
                </td>
              </tr>
            ))}
            {blacklist.length === 0 && (
              <tr><td colSpan={5} className="text-center py-4 text-[#e8d5b7]/40">暂无封禁用户</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 创建 `AdminCosts.jsx`**

```jsx
import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'

export default function AdminCosts() {
  const [data, setData] = useState(null)
  const [trendDays, setTrendDays] = useState(30)
  const [trend, setTrend] = useState([])
  const [byModel, setByModel] = useState([])

  useEffect(() => {
    adminApi.getCosts().then(setData)
  }, [])

  useEffect(() => {
    adminApi.getCostTrend(trendDays).then(d => setTrend(d.trend || []))
    adminApi.getCostByModel().then(d => setByModel(d.by_model || []))
  }, [trendDays])

  if (!data) return <div className="text-[#e8d5b7]">加载中...</div>

  const cards = [
    { label: '今日成本', value: `$${(data.today?.cost || 0).toFixed(4)}`, sub: `${(data.today?.tokens || 0).toLocaleString()} tokens` },
    { label: '本月成本', value: `$${(data.month?.cost || 0).toFixed(4)}`, sub: `${(data.month?.tokens || 0).toLocaleString()} tokens` },
    { label: '平均每用户', value: `$${(data.avg_cost_per_user || 0).toFixed(4)}`, sub: `${data.month?.active_users || 0} 活跃用户` },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">Token 成本追踪</h2>

      {/* 概览卡片 */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {cards.map((card, i) => (
          <div key={i} className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
            <p className="text-[#e8d5b7]/60 text-sm">{card.label}</p>
            <p className="text-[#c9a96e] text-2xl font-bold mt-1">{card.value}</p>
            <p className="text-[#e8d5b7]/40 text-xs mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      {/* 成本趋势 */}
      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[#c9a96e] font-bold">成本趋势</h3>
          <div className="flex gap-1">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setTrendDays(d)}
                className={`px-2 py-1 rounded text-xs ${trendDays === d ? 'bg-[#c9a96e] text-[#1a1a2e]' : 'bg-[#1a1a2e] text-[#e8d5b7]'}`}>
                {d}天
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
                <th className="text-left py-1">日期</th>
                <th className="text-right py-1">Tokens</th>
                <th className="text-right py-1">成本</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((r, i) => (
                <tr key={i} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                  <td className="py-1">{r.date}</td>
                  <td className="text-right">{(r.tokens || 0).toLocaleString()}</td>
                  <td className="text-right">${(r.cost || 0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 按模型分布 */}
      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20 mb-6">
        <h3 className="text-[#c9a96e] font-bold mb-3">按模型分布</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
              <th className="text-left py-1">模型</th>
              <th className="text-right py-1">Tokens</th>
              <th className="text-right py-1">成本</th>
            </tr>
          </thead>
          <tbody>
            {byModel.map((r, i) => (
              <tr key={i} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                <td className="py-1">{r.model}</td>
                <td className="text-right">{(r.tokens || 0).toLocaleString()}</td>
                <td className="text-right">${(r.cost || 0).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top 10 成本用户 */}
      {data.top_users?.length > 0 && (
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">Top 10 成本用户（本月）</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
                <th className="text-left py-1">邮箱</th>
                <th className="text-right py-1">Prompt</th>
                <th className="text-right py-1">Completion</th>
                <th className="text-right py-1">Total</th>
                <th className="text-right py-1">成本</th>
              </tr>
            </thead>
            <tbody>
              {data.top_users.map((u, i) => (
                <tr key={i} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                  <td className="py-1">{u.email || u.user_id}</td>
                  <td className="text-right">{(u.prompt_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">{(u.completion_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">{(u.total_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">${(u.cost || 0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 8: 提交**

```bash
git add frontend/src/components/admin/ frontend/src/pages/AdminPage.jsx frontend/src/App.jsx frontend/src/utils/adminApi.js frontend/src/utils/auth.js frontend/src/pages/LoginPage.jsx
git commit -m "feat: add all admin frontend pages (dashboard, api-keys, users, quota, blacklist, costs)"
```

---

### Task 9: 集成测试与验证

**Files:**
- None (manual testing)

- [ ] **Step 1: 重启后端，清空数据库**

```bash
pkill -f "uvicorn main:app"
rm -f /workspace/data/*.db
cd /workspace/backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 &
```

- [ ] **Step 2: 测试 admin 登录**

```bash
curl -s -X POST http://localhost:8000/api/admin/login -H "Content-Type: application/json" -d '{"email":"admin","password":"123456"}' | python3 -m json.tool
```

预期：返回 `access_token` 和 `refresh_token`

- [ ] **Step 3: 测试 admin 仪表盘**

```bash
ADMIN_TOKEN="<从上一步获取>"
curl -s http://localhost:8000/api/admin/dashboard -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool
```

预期：返回用户统计、tier 分布、语言分布等

- [ ] **Step 4: 测试 API Key 管理**

```bash
curl -s -X PUT http://localhost:8000/api/admin/api-keys/free -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"configs":[{"api_key":"sk-test","base_url":"https://api.openai.com/v1","model":"gpt-4o-mini"}],"active_index":0}' | python3 -m json.tool
```

预期：`{"status": "ok"}`

- [ ] **Step 5: 测试用户管理**

```bash
# 先注册一个普通用户
curl -s -X POST http://localhost:8000/api/auth/register -H "Content-Type: application/json" -d '{"email":"test@example.com","password":"test1234","name":"Test"}'

# 获取用户列表
curl -s "http://localhost:8000/api/admin/users" -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool
```

预期：返回用户列表

- [ ] **Step 6: 测试黑名单**

```bash
curl -s -X POST http://localhost:8000/api/admin/blacklist -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"email":"test@example.com","reason":"测试封禁"}' | python3 -m json.tool
```

预期：`{"status": "ok"}`

验证被封禁用户无法调用 API：

```bash
USER_TOKEN="<从注册获取>"
curl -s http://localhost:8000/api/process-text -X POST -H "Authorization: Bearer $USER_TOKEN" -H "Content-Type: application/json" -d '{"text":"hello"}' -w "\nHTTP: %{http_code}\n"
```

预期：403 "账号已被封禁"

- [ ] **Step 7: 构建前端并验证**

```bash
cd /workspace/frontend && npm run build
```

在浏览器中访问 `/login`，输入 admin/123456，应跳转到 `/admin` 仪表盘。

- [ ] **Step 8: 提交**

```bash
git add -A
git commit -m "feat: complete admin panel with all features tested"
```
