# Gualingo LLM 调用网关重构设计

## 概述

重构 LLM 调用链路，实现生产级 Key 轮换、成本追踪和错误处理。同时清理所有旧代码。

## 1. 核心架构：LLMGateway

### 统一入口

删除所有旧的 `llm_settings.json` 相关代码和 `LLMAPI` 类，替换为 `LLMGateway` 类：

```python
class LLMGateway:
    """统一 LLM 调用网关。"""
    
    async def call(self, user_id: str, tier: str, messages: list,
                   temperature: float = 0.0, max_tokens: int = 4096,
                   request_type: str = "llm_call") -> dict:
        """
        所有 LLM 调用的唯一入口。
        
        流程：
        1. 从 tier_keys 获取该 tier 的 Key 池
        2. 用原子计数器选 Key
        3. 发请求
        4. 记录 token 使用量和成本
        5. 错误处理：429→换 Key / 401→标记无效 / 5xx→换 Key / 全失败→报错
        """
```

### Key 轮换策略：顺序限速

不是简单的 round-robin，而是**顺序使用直到限速再换**：

```
Free 池: [KeyA, KeyB]

1. 使用 KeyA 发请求
2. 成功 → 继续用 KeyA
3. 收到 429 (Rate Limit) → 等待 request_interval 秒
4. 再试 KeyA → 还是 429 → 切换到 KeyB
5. 使用 KeyB 发请求
6. 成功 → 继续用 KeyB
7. KeyB 也 429 → 等待 → 切换回 KeyA
8. 所有 Key 连续 10 分钟无有效输出 → 返回错误
```

### 原子计数器

```python
import threading

class TierKeyPool:
    def __init__(self, tier: str, configs: list):
        self.tier = tier
        self.configs = configs  # [{api_key, base_url, model, input_price, output_price}]
        self.current_index = 0
        self.lock = threading.Lock()
        self.rate_limited_until = {}  # key_index -> timestamp（限速到什么时候）
        self.fail_counts = {}  # key_index -> 连续失败次数
    
    def get_current(self) -> dict | None:
        """获取当前活跃 Key（跳过限速中的）。"""
        with self.lock:
            now = time.time()
            for _ in range(len(self.configs)):
                idx = self.current_index % len(self.configs)
                # 检查是否在限速期
                if idx in self.rate_limited_until and now < self.rate_limited_until[idx]:
                    self.current_index += 1
                    continue
                return self.configs[idx], idx
            return None  # 所有 Key 都在限速
    
    def mark_rate_limited(self, idx: int, retry_after: float = None):
        """标记 Key 被限速。"""
        with self.lock:
            wait = retry_after or 60  # 默认等60秒
            self.rate_limited_until[idx] = time.time() + wait
            self.current_index += 1  # 切换到下一个
    
    def mark_success(self, idx: int):
        """标记 Key 成功。"""
        with self.lock:
            self.fail_counts[idx] = 0
            # 不切换，继续用同一个 Key
```

### 错误处理

| 错误 | 处理 |
|------|------|
| 429 Rate Limit | 标记当前 Key 限速，切换下一个 Key |
| 401 Unauthorized | 标记 Key 无效（5分钟），切换下一个 |
| 500/502/503 | 等待 interval，重试同一 Key 一次，再失败切换 |
| 超时 | 等待 interval，重试一次，再失败切换 |
| 所有 Key 失败 | 返回 503 "服务暂时不可用" |
| 连续 10 分钟无有效输出 | 返回 503 "服务暂时不可用，请稍后重试" |

### 成本追踪

每次 LLM 调用成功后，从响应的 `usage` 字段提取 token 数据：

```python
# 从 API 响应获取
usage = response.get("usage", {})
prompt_tokens = usage.get("prompt_tokens", 0)
completion_tokens = usage.get("completion_tokens", 0)

# 用该 Key 的定价计算成本
cost = (prompt_tokens / 1_000_000 * key.input_price) + (completion_tokens / 1_000_000 * key.output_price)

# 记录到 token_usage 表
record_token_usage(user_id, model, usage, request_type, key.input_price, key.output_price)
```

## 2. 删除用户自带 API Key

### 后端删除
- `users` 表的 `api_key`、`base_url`、`model` 列（保留列但不使用）
- `auth/router.py` 中的 `/api/auth/me/api-key` 端点
- `routers/admin.py` 中用户详情的 api_key 脱敏逻辑
- `llm_api.py` 中所有检查用户 API Key 的逻辑

### 前端删除
- `SettingsModal.jsx` 中的 API Key 设置区域（SECTIONS 中的 'api'）
- `api.js` 中的 `updateApiKey` 方法
- `LearningApp.jsx` 中的 API Key 检查和错误提示
- `translations.js` 中的 apiKeyError/apiKeyInvalid 翻译
- `LoginPage.jsx` 中的"自带 Key 即可使用"文案

### LLM 调用逻辑简化
所有用户统一走平台 Key 池，不再有"用户自带 Key"分支。

## 3. UI 翻译全局缓存

### 当前问题
- UI 翻译在 `config.py` 中硬编码
- 每次切换语言都要 LLM 生成

### 新方案
- 新增 `ui_translations` 表，按语言缓存
- 用户选择语言时，先查缓存，命中则直接返回
- 未命中则 LLM 生成，存入缓存，下次直接用
- Admin 可查看各语言的翻译缓存状态

### 数据存储
```sql
CREATE TABLE IF NOT EXISTS ui_translations (
    lang TEXT PRIMARY KEY,
    translations TEXT NOT NULL,  -- JSON
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### API
```
GET  /api/ui-translations/{lang}     — 获取翻译（缓存优先）
POST /api/ui-translations/{lang}     — 强制重新生成
GET  /api/admin/ui-translations      — Admin 查看所有缓存状态
DELETE /api/admin/ui-translations/{lang} — Admin 删除缓存
```

### 删除 config.py 中的翻译相关代码
翻译不再依赖 config.py，完全由 DB 缓存 + LLM 生成。

## 4. 删除桌面部署相关代码

### 删除文件
- `desktop/` 整个目录
- `Gualingo.spec`（PyInstaller 打包配置）

### 保留
- `config.py` 中的 `DATA_DIR`、`FRONTEND_DIR`、`HOST`、`PORT` 配置（Web 部署仍需要）

## 5. 删除旧 LLM 配置代码

### 删除
- `llm_api.py` 中的 `_DEFAULT_CONFIGS`、`_load_settings`、`_save_settings`、`update_config`、`add_config`、`save_configs_list`、`set_active_config_index`
- `config.py` 中的 `LLM_SETTINGS_FILE`
- 模块级 `call_with_rotation` 函数
- `LLMAPI` 类的 `_reload` 方法中加载 `llm_settings.json` 的逻辑
- `data/llm_settings.json` 文件

### 替换为
- `LLMGateway` 类（新文件 `backend/utils/llm_gateway.py`）
- `TierKeyPool` 类（同文件）
- `tier_keys.json` 作为唯一配置源

## 6. 所有调用点统一传参

### 修改清单

| 文件 | 函数 | 需要添加的参数 |
|------|------|---------------|
| `text_processing.py` | `_preprocess_and_run` | 传 `user_id`, `tier` 给 gateway |
| `text_processing.py` | `process_text` | 从 `current_user` 获取 tier |
| `exercise_generators.py` | `process_text_background` | 传 `user_id`, `tier` |
| `exercise_generators.py` | `background_word_gen` | 传 `user_id`, `tier` |
| `exercise_generators.py` | `process_single_word_gen` | 传 `user_id`, `tier` |
| `vocabulary.py` | `regenerate_word_detail` | 传 `user_id`, `tier` |
| `vocabulary.py` | `get_word_detail` | 传 `user_id`, `tier` |
| `settings.py` | `translate_ui` | 传 `user_id`, `tier`（或用全局缓存替代） |

### 调用方式统一

所有调用从：
```python
response = await llm_api.call_llm(messages, temperature, max_tokens)
```
改为：
```python
gateway = LLMGateway()
response = await gateway.call(user_id, tier, messages, temperature, max_tokens, request_type)
```

## 7. 全局设置集成

`global_settings.json` 中的 `request_interval` 被 `LLMGateway` 读取，用于：
- 429 后等待时间
- 5xx 后重试间隔
- 请求之间的最小间隔

Gateway 启动时加载一次，Admin 更新时通知 Gateway 刷新。
