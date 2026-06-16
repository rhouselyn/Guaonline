# LLM Gateway 重构实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构 LLM 调用链路为生产级 LLMGateway，实现始终轮换+批量并发 Key 管理、成本追踪、删除旧代码和用户自带 Key 逻辑。

**Architecture:** 新建 `LLMGateway` + `TierKeyPool` 替代旧的 `LLMAPI` 类。所有 LLM 调用统一通过 `gateway.call(user_id, tier, ...)` 入口。删除 `llm_settings.json`、用户 API Key、桌面部署代码。

**Tech Stack:** Python 3 + FastAPI + httpx + asyncio + threading + SQLite

---

## 文件结构

### 新建文件
- `backend/utils/llm_gateway.py` — LLMGateway + TierKeyPool 类

### 删除文件
- `desktop/` 整个目录
- `Gualingo.spec`

### 重写文件
- `backend/llm_api.py` — 只保留 tier_keys 管理函数，删除所有旧代码

### 修改文件
- `backend/routers/text_processing.py` — 传 user_id + tier，用 gateway
- `backend/utils/exercise_generators.py` — 传 user_id + tier，用 gateway
- `backend/routers/vocabulary.py` — 传 user_id + tier，用 gateway
- `backend/routers/settings.py` — UI 翻译改用全局缓存
- `backend/routers/admin.py` — 添加 batch_size 到全局设置，UI 翻译管理
- `backend/auth/router.py` — 删除用户 API Key 端点
- `backend/config.py` — 删除 LLM_SETTINGS_FILE
- `backend/main.py` — 删除旧 llm_api 初始化
- `frontend/src/components/SettingsModal.jsx` — 删除 API Key 区域
- `frontend/src/pages/LearningApp.jsx` — 删除 API Key 检查
- `frontend/src/utils/api.js` — 删除 updateApiKey
- `frontend/src/pages/LoginPage.jsx` — 删除"自带 Key"文案
- `frontend/src/utils/translations.js` — 删除 apiKey 相关翻译
- `frontend/src/components/admin/AdminGlobalSettings.jsx` — 添加 batch_size
- `frontend/src/utils/adminApi.js` — 添加 UI 翻译管理方法

---

### Task 1: 创建 LLMGateway + TierKeyPool

**Files:**
- Create: `backend/utils/llm_gateway.py`

- [ ] **Step 1: 创建 llm_gateway.py**

```python
"""统一 LLM 调用网关。"""

import time
import json
import threading
import asyncio
import httpx
from typing import Optional, List, Dict
from config import DATA_DIR

TIER_KEYS_FILE = str(DATA_DIR / "tier_keys.json")
GLOBAL_SETTINGS_FILE = str(DATA_DIR / "global_settings.json")


def _load_tier_keys() -> dict:
    try:
        with open(TIER_KEYS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"tier_keys": {}}


def _load_global_settings() -> dict:
    try:
        with open(GLOBAL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"request_interval": 1.0, "batch_size": 3}


class TierKeyPool:
    """单个 Tier 的 Key 池，支持始终轮换 + 批量并发。"""

    def __init__(self, tier: str, configs: list, batch_size: int = 3, interval: float = 1.0):
        self.tier = tier
        self.configs = configs
        self.current_index = 0
        self.lock = threading.Lock()
        self.rate_limited_until = {}
        self.batch_size = batch_size
        self.interval = interval
        self.active_count = 0
        self.last_switch_time = 0
        self.consecutive_fail_start = None

    def get_current(self) -> Optional[tuple]:
        """获取当前活跃 Key，返回 (config, index) 或 None。"""
        with self.lock:
            now = time.time()
            for _ in range(len(self.configs)):
                idx = self.current_index % len(self.configs)
                if idx in self.rate_limited_until and now < self.rate_limited_until[idx]:
                    self.current_index += 1
                    continue
                self.active_count += 1
                return self.configs[idx], idx
            return None

    def mark_rate_limited(self, idx: int, retry_after: float = None):
        """标记 Key 被限速，立即切换。"""
        with self.lock:
            wait = retry_after or 60
            self.rate_limited_until[idx] = time.time() + wait
            self.active_count = 0
            self.current_index += 1

    def mark_invalid(self, idx: int):
        """标记 Key 无效（401），5 分钟后恢复。"""
        with self.lock:
            self.rate_limited_until[idx] = time.time() + 300
            self.active_count = 0
            self.current_index += 1

    def mark_complete(self, idx: int):
        """单个请求完成。batch 全部完成时切换到下一个 Key。"""
        with self.lock:
            self.active_count -= 1
            self.consecutive_fail_start = None
            if self.active_count <= 0:
                self.active_count = 0
                self.last_switch_time = time.time()
                self.current_index += 1

    def mark_server_error(self, idx: int):
        """服务端错误，切换 Key。"""
        with self.lock:
            self.active_count -= 1
            if self.consecutive_fail_start is None:
                self.consecutive_fail_start = time.time()
            if self.active_count <= 0:
                self.active_count = 0
                self.last_switch_time = time.time()
                self.current_index += 1

    def is_all_failed_too_long(self) -> bool:
        """检查是否连续 10 分钟无有效输出。"""
        with self.lock:
            if self.consecutive_fail_start is None:
                return False
            return (time.time() - self.consecutive_fail_start) >= 600

    async def wait_for_interval(self):
        """等待 interval（batch 切换间隔）。"""
        with self.lock:
            elapsed = time.time() - self.last_switch_time
            remaining = self.interval - elapsed
        if remaining > 0:
            await asyncio.sleep(remaining)


class LLMGateway:
    """统一 LLM 调用网关。"""

    _instance = None
    _instance_lock = threading.Lock()

    def __new__(cls):
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.pools: Dict[str, TierKeyPool] = {}
        self._reload_pools()

    def _reload_pools(self):
        """从配置文件重新加载所有 Key 池。"""
        data = _load_tier_keys()
        settings = _load_global_settings()
        batch_size = settings.get("batch_size", 3)
        interval = settings.get("request_interval", 1.0)

        new_pools = {}
        for tier, pool_data in data.get("tier_keys", {}).items():
            configs = pool_data.get("configs", [])
            if configs:
                new_pools[tier] = TierKeyPool(tier, configs, batch_size, interval)

        self.pools = new_pools

    def reload(self):
        """手动刷新配置。"""
        self._reload_pools()

    async def call(self, user_id: str, tier: str, messages: List[Dict],
                   temperature: float = 0.0, max_tokens: int = 4096,
                   request_type: str = "llm_call") -> dict:
        """
        统一 LLM 调用入口。

        流程：
        1. 获取 tier 对应的 Key 池
        2. 等待 interval（如果上一个 batch 刚完成）
        3. 获取当前 Key
        4. 发请求
        5. 记录 token 使用量和成本
        6. 错误处理
        """
        pool = self.pools.get(tier)
        if not pool:
            raise Exception(f"No API Key configured for tier: {tier}")

        # 等待 batch 切换间隔
        await pool.wait_for_interval()

        # 检查是否连续失败太久
        if pool.is_all_failed_too_long():
            raise Exception("服务暂时不可用，请稍后重试")

        # 获取当前 Key
        result = pool.get_current()
        if not result:
            raise Exception("服务暂时不可用，所有 Key 均不可用")

        config, idx = result
        api_key = config.get("api_key", "")
        base_url = config.get("base_url", "https://api.openai.com/v1")
        model = config.get("model", "gpt-4o-mini")
        input_price = config.get("input_price_per_million", 0)
        output_price = config.get("output_price_per_million", 0)

        # 发请求
        url = f"{base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            **({"temperature": temperature} if temperature is not None else {}),
            **({"max_tokens": max_tokens} if max_tokens is not None else {}),
        }

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, headers=headers, json=payload)

            if resp.status_code == 200:
                result_data = resp.json()
                pool.mark_complete(idx)
                # 记录 token 使用量
                if user_id and result_data.get("usage"):
                    try:
                        from utils.token_tracker import record_token_usage
                        record_token_usage(user_id, model, result_data["usage"], request_type, input_price, output_price)
                    except Exception:
                        pass
                return result_data

            elif resp.status_code == 429:
                retry_after = None
                try:
                    ra = resp.headers.get("retry-after")
                    if ra:
                        retry_after = float(ra)
                except Exception:
                    pass
                pool.mark_rate_limited(idx, retry_after)
                # 重试一次
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type)

            elif resp.status_code == 401:
                pool.mark_invalid(idx)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type)

            elif resp.status_code >= 500:
                pool.mark_server_error(idx)
                # 重试一次
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type)

            else:
                pool.mark_complete(idx)
                raise Exception(f"LLM API error: {resp.status_code} - {resp.text[:200]}")

        except httpx.TimeoutException:
            pool.mark_server_error(idx)
            return await self.call(user_id, tier, messages, temperature, max_tokens, request_type)
        except Exception as e:
            if "No API Key" in str(e) or "服务暂时不可用" in str(e):
                raise
            pool.mark_complete(idx)
            raise


# 全局单例
gateway = LLMGateway()
```

- [ ] **Step 2: 提交**

```bash
git add backend/utils/llm_gateway.py
git commit -m "feat: add LLMGateway with tier-based key rotation and batch concurrency"
```

---

### Task 2: 重写 llm_api.py — 只保留 tier_keys 管理

**Files:**
- Rewrite: `backend/llm_api.py`

- [ ] **Step 1: 重写 llm_api.py**

删除所有旧代码（`_DEFAULT_CONFIGS`、`_load_settings`、`_save_settings`、`update_config`、`add_config`、`save_configs_list`、`set_active_config_index`、`call_with_rotation`、`LLMAPI` 类等），只保留 tier_keys 管理函数：

```python
"""LLM API Key 池管理（Tier-based）。"""

import json
from config import DATA_DIR

TIER_KEYS_FILE = str(DATA_DIR / "tier_keys.json")


def _load_tier_keys() -> dict:
    try:
        with open(TIER_KEYS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"tier_keys": {}}


def _save_tier_keys(data: dict):
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
                "input_price_per_million": cfg.get("input_price_per_million", 0),
                "output_price_per_million": cfg.get("output_price_per_million", 0),
            })
        masked[tier] = {"configs": configs, "active_index": pool.get("active_index", 0)}
    return masked


def update_tier_keys(tier: str, configs: list, active_index: int = 0):
    """更新指定 tier 的 API Key 配置。"""
    data = _load_tier_keys()
    if "tier_keys" not in data:
        data["tier_keys"] = {}
    existing = data["tier_keys"].get(tier, {}).get("configs", [])
    new_configs = []
    for i, cfg in enumerate(configs):
        key = cfg.get("api_key", "")
        if "*" in key and i < len(existing):
            key = existing[i].get("api_key", key)
        new_configs.append({
            "api_key": key,
            "base_url": cfg.get("base_url", ""),
            "model": cfg.get("model", ""),
            "input_price_per_million": cfg.get("input_price_per_million", 0),
            "output_price_per_million": cfg.get("output_price_per_million", 0),
        })
    data["tier_keys"][tier] = {"configs": new_configs, "active_index": active_index}
    _save_tier_keys(data)
    # 通知 gateway 刷新
    try:
        from utils.llm_gateway import gateway
        gateway.reload()
    except Exception:
        pass


# 保留语言列表供其他模块使用
LANGUAGE_MAP = {
    "auto": "Auto Detect", "zh": "Chinese", "en": "English", "ja": "Japanese",
    "ko": "Korean", "fr": "French", "de": "German", "es": "Spanish",
    "pt": "Portuguese", "ru": "Russian", "ar": "Arabic", "hi": "Hindi",
    "it": "Italian", "nl": "Dutch", "pl": "Polish", "tr": "Turkish",
    "vi": "Vietnamese", "th": "Thai", "id": "Indonesian", "ms": "Malay",
    "uk": "Ukrainian", "sv": "Swedish", "da": "Danish", "fi": "Finnish",
    "no": "Norwegian", "cs": "Czech", "ro": "Romanian", "hu": "Hungarian",
    "el": "Greek", "he": "Hebrew", "bg": "Bulgarian", "hr": "Croatian",
    "sk": "Slovak", "sl": "Slovenian", "et": "Estonian", "lv": "Latvian",
    "lt": "Lithuanian",
}
```

- [ ] **Step 2: 提交**

```bash
git add backend/llm_api.py
git commit -m "refactor: rewrite llm_api.py to only keep tier key management, remove all legacy code"
```

---

### Task 3: 更新所有 LLM 调用点使用 gateway

**Files:**
- Modify: `backend/routers/text_processing.py`
- Modify: `backend/utils/exercise_generators.py`
- Modify: `backend/routers/vocabulary.py`

- [ ] **Step 1: 修改 text_processing.py**

读取文件，找到所有 `llm_api.call_llm` 或 `llm_api.call_with_rotation` 调用，替换为：

```python
from utils.llm_gateway import gateway
```

所有调用改为：
```python
response = await gateway.call(user_id, tier, messages, temperature, max_tokens, request_type)
```

其中 `tier` 从 `current_user.tier` 获取（需要从 `require_auth` 依赖获取 `current_user`）。

在 `_preprocess_and_run` 函数签名中确保有 `user_id` 和 `tier` 参数。在 `process_text` 路由中从 `current_user` 传递这两个值。

删除所有 `from llm_api import ...` 的旧 import（除了 `LANGUAGE_MAP` 如果用到的话）。

- [ ] **Step 2: 修改 exercise_generators.py**

同样替换所有 LLM 调用为 `gateway.call(user_id, tier, ...)`。

确保 `process_text_background`、`background_word_gen`、`process_single_word_gen` 都接收 `user_id` 和 `tier` 参数并传递给 gateway。

- [ ] **Step 3: 修改 vocabulary.py**

同样替换所有 LLM 调用。确保 `regenerate_word_detail` 和 `get_word_detail` 传递 `user_id` 和 `tier`。

- [ ] **Step 4: 提交**

```bash
git add backend/routers/text_processing.py backend/utils/exercise_generators.py backend/routers/vocabulary.py
git commit -m "refactor: update all LLM call sites to use LLMGateway with user_id and tier"
```

---

### Task 4: UI 翻译全局缓存

**Files:**
- Modify: `backend/routers/settings.py`
- Modify: `backend/routers/admin.py`
- Modify: `backend/db_storage.py`

- [ ] **Step 1: 在 db_storage.py 中添加 ui_translations 表**

在 `DatabaseStorage` 类的 `__init__` 中添加：

```python
    self._ensure_ui_translations_table()
```

添加方法：

```python
    def _ensure_ui_translations_table(self):
        conn = self._get_conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ui_translations (
                lang TEXT PRIMARY KEY,
                translations TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT (datetime('now')),
                updated_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        conn.commit()
        conn.close()

    def load_ui_translation(self, lang: str) -> dict | None:
        conn = self._get_conn()
        row = conn.execute("SELECT translations FROM ui_translations WHERE lang = ?", (lang,)).fetchone()
        conn.close()
        if row:
            return json.loads(row["translations"])
        return None

    def save_ui_translation(self, lang: str, translations: dict):
        conn = self._get_conn()
        conn.execute("""
            INSERT INTO ui_translations (lang, translations, updated_at)
            VALUES (?, ?, datetime('now'))
            ON CONFLICT(lang) DO UPDATE SET translations = ?, updated_at = datetime('now')
        """, (lang, json.dumps(translations, ensure_ascii=False), json.dumps(translations, ensure_ascii=False)))
        conn.commit()
        conn.close()

    def list_ui_translations(self) -> list:
        conn = self._get_conn()
        rows = conn.execute("SELECT lang, updated_at FROM ui_translations ORDER BY lang").fetchall()
        conn.close()
        return [dict(r) for r in rows]

    def delete_ui_translation(self, lang: str):
        conn = self._get_conn()
        conn.execute("DELETE FROM ui_translations WHERE lang = ?", (lang,))
        conn.commit()
        conn.close()
```

- [ ] **Step 2: 修改 settings.py 的 translate_ui 端点**

改为缓存优先：先查 DB，命中则直接返回；未命中则 LLM 生成后存入 DB。

```python
@router.post("/translate-ui/{lang}")
async def translate_ui(lang: str, current_user: TokenData = Depends(require_auth)):
    storage = DatabaseStorage()
    # 先查缓存
    cached = storage.load_ui_translation(lang)
    if cached:
        return cached
    # 未命中，LLM 生成
    from utils.llm_gateway import gateway
    messages = [{"role": "user", "content": f"Generate UI translations for language: {lang}..."}]
    # ... 生成逻辑（保留原有的 prompt）
    response = await gateway.call(current_user.user_id, current_user.tier, messages, request_type="ui_translate")
    # 解析并存入缓存
    translations = parse_translations(response)
    storage.save_ui_translation(lang, translations)
    return translations
```

- [ ] **Step 3: 在 admin.py 添加 UI 翻译管理端点**

```python
@router.get("/ui-translations")
async def list_ui_translations(admin: AdminTokenData = Depends(require_admin)):
    from db_storage import DatabaseStorage
    storage = DatabaseStorage()
    return {"translations": storage.list_ui_translations()}

@router.delete("/ui-translations/{lang}")
async def delete_ui_translation(lang: str, admin: AdminTokenData = Depends(require_admin)):
    from db_storage import DatabaseStorage
    storage = DatabaseStorage()
    storage.delete_ui_translation(lang)
    _log_action("delete_ui_translation", "lang", lang)
    return {"status": "ok"}
```

- [ ] **Step 4: 提交**

```bash
git add backend/db_storage.py backend/routers/settings.py backend/routers/admin.py
git commit -m "feat: add UI translation global cache with DB storage"
```

---

### Task 5: 删除用户自带 API Key 逻辑

**Files:**
- Modify: `backend/auth/router.py`
- Modify: `backend/routers/admin.py`
- Modify: `frontend/src/components/SettingsModal.jsx`
- Modify: `frontend/src/pages/LearningApp.jsx`
- Modify: `frontend/src/utils/api.js`
- Modify: `frontend/src/pages/LoginPage.jsx`
- Modify: `frontend/src/utils/translations.js`

- [ ] **Step 1: 删除后端 API Key 端点**

在 `backend/auth/router.py` 中，删除 `/api/auth/me/api-key` 端点（如果存在）。

在 `backend/routers/admin.py` 的 `get_user_detail` 中，删除 api_key 脱敏逻辑（不再返回 api_key 字段）。

- [ ] **Step 2: 删除前端 SettingsModal 中的 API Key 区域**

在 `frontend/src/components/SettingsModal.jsx` 中：
- 从 SECTIONS 数组中删除 'api' 项
- 删除 `renderApiSection` 函数
- 删除 configs/maskedConfigs 等相关 state 和逻辑
- 删除 Key 图标 import

- [ ] **Step 3: 删除 LearningApp 中的 API Key 检查**

在 `frontend/src/pages/LearningApp.jsx` 中：
- 删除 `noApiKey` 和 `apiKeyInvalid` 相关的 alert 逻辑
- 删除 401/403 错误中检查 API Key 的分支

- [ ] **Step 4: 删除 api.js 中的 updateApiKey**

在 `frontend/src/utils/api.js` 中删除 `updateApiKey` 方法。

- [ ] **Step 5: 删除 LoginPage 中的"自带 Key"文案**

在 `frontend/src/pages/LoginPage.jsx` 中删除 "无需注册，自带 Key 即可使用全部功能" 文案。

- [ ] **Step 6: 删除 translations.js 中的 apiKey 相关翻译**

在 `frontend/src/utils/translations.js` 中删除 `apiKeyError` 和 `apiKeyInvalid` 条目（所有语言）。

- [ ] **Step 7: 提交**

```bash
git add backend/auth/router.py backend/routers/admin.py frontend/src/components/SettingsModal.jsx frontend/src/pages/LearningApp.jsx frontend/src/utils/api.js frontend/src/pages/LoginPage.jsx frontend/src/utils/translations.js
git commit -m "refactor: remove user API key logic from frontend and backend"
```

---

### Task 6: 删除桌面部署代码和旧配置

**Files:**
- Delete: `desktop/` 目录
- Delete: `Gualingo.spec`
- Modify: `backend/config.py`

- [ ] **Step 1: 删除 desktop 目录和 Gualingo.spec**

```bash
rm -rf /workspace/desktop
rm -f /workspace/Gualingo.spec
```

- [ ] **Step 2: 清理 config.py**

在 `backend/config.py` 中删除 `LLM_SETTINGS_FILE` 定义，只保留：

```python
import os

DATA_DIR = os.path.dirname(os.path.abspath(__file__)).replace("backend", "data")
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend", "dist")
HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", 8000))
```

- [ ] **Step 3: 删除旧的 llm_settings.json**

```bash
rm -f /workspace/data/llm_settings.json
```

- [ ] **Step 4: 提交**

```bash
git add -A
git commit -m "chore: remove desktop deployment code and legacy config"
```

---

### Task 7: 更新 Admin 全局设置（添加 batch_size）

**Files:**
- Modify: `backend/routers/admin.py`
- Modify: `frontend/src/components/admin/AdminGlobalSettings.jsx`
- Modify: `frontend/src/utils/adminApi.js`

- [ ] **Step 1: 在 admin.py 的全局设置中添加 batch_size**

修改 `GlobalSettingsUpdate` 模型：

```python
class GlobalSettingsUpdate(BaseModel):
    request_interval: Optional[float] = None
    batch_size: Optional[int] = None
```

修改 `update_global_settings`：

```python
@router.put("/global-settings")
async def update_global_settings(req: GlobalSettingsUpdate, admin: AdminTokenData = Depends(require_admin)):
    settings = _load_global_settings()
    if req.request_interval is not None:
        settings["request_interval"] = req.request_interval
    if req.batch_size is not None:
        settings["batch_size"] = req.batch_size
    _save_global_settings(settings)
    _log_action("update_global_settings", details=settings)
    # 通知 gateway 刷新
    try:
        from utils.llm_gateway import gateway
        gateway.reload()
    except Exception:
        pass
    return settings
```

同时更新 `_load_global_settings` 的默认值：

```python
def _load_global_settings() -> dict:
    try:
        with open(GLOBAL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"request_interval": 1.0, "batch_size": 3}
```

- [ ] **Step 2: 更新 AdminGlobalSettings.jsx**

添加 batch_size 设置：

```jsx
import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'

export default function AdminGlobalSettings() {
  const [settings, setSettings] = useState(null)
  const [interval, setInterval_] = useState(1.0)
  const [batchSize, setBatchSize] = useState(3)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    adminApi.getGlobalSettings().then(data => {
      setSettings(data)
      setInterval_(data.request_interval || 1.0)
      setBatchSize(data.batch_size || 3)
    })
  }, [])

  const save = async () => {
    await adminApi.updateGlobalSettings({ request_interval: interval, batch_size: batchSize })
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  if (!settings) return <div className="text-[#e8d5b7]">加载中...</div>

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">全局设置</h2>

      <div className="bg-[#16213e] rounded-lg p-6 border border-[#c9a96e]/20 max-w-lg">
        <div className="space-y-6">
          <div>
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">请求间隔（秒）</label>
            <p className="text-[#e8d5b7]/40 text-xs mb-2">每个 Key 批次完成后切换到下一个 Key 的等待时间</p>
            <div className="flex items-center gap-3">
              <input type="range" min={0.1} max={20} step={0.1} value={interval}
                onChange={e => setInterval_(Number(e.target.value))}
                className="flex-1" />
              <span className="text-[#c9a96e] font-bold text-sm w-12 text-right">{interval.toFixed(1)}s</span>
            </div>
            <div className="flex justify-between text-[#e8d5b7]/30 text-xs mt-1">
              <span>0.1s</span><span>20s</span>
            </div>
          </div>

          <div>
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">每 Key 并发数</label>
            <p className="text-[#e8d5b7]/40 text-xs mb-2">每个 Key 同时处理的请求数量，完成后切换下一个 Key</p>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={20} step={1} value={batchSize}
                onChange={e => setBatchSize(Number(e.target.value))}
                className="flex-1" />
              <span className="text-[#c9a96e] font-bold text-sm w-12 text-right">{batchSize}</span>
            </div>
            <div className="flex justify-between text-[#e8d5b7]/30 text-xs mt-1">
              <span>1</span><span>20</span>
            </div>
          </div>

          <button onClick={save} className="w-full py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">
            保存
          </button>

          {saved && <p className="text-green-400 text-sm text-center">已保存</p>}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: 提交**

```bash
git add backend/routers/admin.py frontend/src/components/admin/AdminGlobalSettings.jsx
git commit -m "feat: add batch_size to global settings for key rotation"
```

---

### Task 8: 集成测试

**Files:**
- None (manual testing)

- [ ] **Step 1: 重启后端**

```bash
lsof -ti:8000 | xargs kill -9 2>/dev/null
rm -f /workspace/data/*.db
cd /workspace/backend && python -m uvicorn main:app --host 0.0.0.0 --port 8000 &
```

- [ ] **Step 2: 测试 admin 登录和全局设置**

```bash
# Admin 登录
ADMIN_TOKEN=$(curl -s -X POST http://localhost:8000/api/admin/login -H "Content-Type: application/json" -d '{"email":"admin@mail.com","password":"123456"}' | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# 获取全局设置
curl -s http://localhost:8000/api/admin/global-settings -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool

# 设置 API Key
curl -s -X PUT http://localhost:8000/api/admin/api-keys/free -H "Authorization: Bearer $ADMIN_TOKEN" -H "Content-Type: application/json" -d '{"configs":[{"api_key":"sk-test","base_url":"https://api.openai.com/v1","model":"gpt-4o-mini","input_price_per_million":0.15,"output_price_per_million":0.60}],"active_index":0}'
```

- [ ] **Step 3: 注册用户并测试文本处理**

```bash
# 注册用户
REG=$(curl -s -X POST http://localhost:8000/api/auth/register -H "Content-Type: application/json" -d '{"email":"test@test.com","password":"test1234","name":"Test"}')
USER_TOKEN=$(echo $REG | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
USER_ID=$(echo $REG | python3 -c "import sys,json; print(json.load(sys.stdin)['user']['id'])")

# 检查成本（应为空）
curl -s http://localhost:8000/api/admin/costs -H "Authorization: Bearer $ADMIN_TOKEN" | python3 -m json.tool
```

- [ ] **Step 4: 构建前端**

```bash
cd /workspace/frontend && npm run build
```

- [ ] **Step 5: 提交**

```bash
git add -A
git commit -m "feat: complete LLM gateway refactor with integration tests"
```
