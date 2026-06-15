# Gualingo Admin 管理面板设计

## 概述

为 Gualingo SaaS 平台添加 Admin 管理面板，支持全局 API Key 配置、用户管理、额度批量调整和数据统计。Admin 作为独立路由 `/admin` 嵌入现有 React SPA，后端新增 admin router 模块。

## 1. 认证机制

### Admin 登录
- 登录页检测 email=`admin` + password=`123456`
- 密码可通过环境变量 `ADMIN_PASSWORD` 覆盖（默认 `123456`）
- 登录成功后签发 admin 专用 JWT，payload 包含 `role: "admin"`
- 前端检测到 admin 登录后跳转到 `/admin`

### 后端守卫
- 新增 `require_admin` 依赖：验证 JWT 中 `role == "admin"`，否则返回 403
- 所有 `/api/admin/*` 端点使用 `require_admin` 守卫

### JWT Payload 差异
```python
# 普通用户
{"sub": "user-uuid", "tier": "free", "type": "access"}

# Admin
{"sub": "admin", "role": "admin", "type": "access"}
```

## 2. 页面布局

侧边栏导航 + 主内容区，复古风格与主站一致。

### 侧边栏项目

| 模块 | 路由 | 图标 | 功能 |
|------|------|------|------|
| 仪表盘 | `/admin` | 📊 | 总览数据 |
| 全局 API Key | `/admin/api-keys` | 🔑 | 配置平台级 LLM API Key |
| 用户管理 | `/admin/users` | 👥 | 用户列表、搜索、查看详情 |
| 额度管理 | `/admin/quota` | ⚡ | 批量调整额度 |
| 黑名单 | `/admin/blacklist` | 🚫 | 封禁/解封用户 |
| Token 成本 | `/admin/costs` | 💰 | LLM Token 成本追踪 |

## 3. 仪表盘 `/admin`

### 指标卡片
- **总用户数** / 今日新增
- **活跃用户**（7天内有请求）
- **全局额度消耗**（今日/本月）
- **LLM Token 成本**（今日/本月，美元估算）
- **API 调用统计**（今日成功/失败次数）

### 用户分布
- **Tier 分布**：free / basic / pro 各多少人
- **学习语言分布**：source_lang 统计（用户主要学什么语言）
- **目标语言分布**：target_lang 统计（用户翻译成什么语言）

### 成本概览
- **平均每用户成本**（本月）
- **Top 10 成本用户**（本月，显示邮箱和 token 消耗量）

### 数据来源
- 从 users 表聚合用户统计
- 从 history 表聚合语言分布
- 从 admin_logs 表聚合额度消耗
- 从 token_usage 表聚合成本数据

## 4. 全局 API Key `/admin/api-keys`

### 功能
- 配置多个 API Key（复用现有 `llm_api.py` 的多配置机制）
- 设置活跃配置索引
- 测试 API Key 是否可用（发一个简单请求验证连通性）
- 显示每个 Key 的配置信息（base_url、model、是否活跃）

### 关键逻辑
用户提交文本时，如果用户自己没设 API Key，则使用 admin 配置的全局 Key 调用 LLM。用户消耗自己的额度计数，但 LLM 调用走平台 Key。这就是「有额度的用户直接消耗全局的」——额度是用户的，API Key 是平台的。

### 数据存储
复用现有 `llm_api.py` 的 JSON 配置文件（`data/llm_settings.json`）。

## 5. 用户管理 `/admin/users`

### 用户列表
- **分页**：每页 20 条
- **显示字段**：邮箱、名称、tier、额度使用（used/max）、注册时间、最近活跃
- **搜索**：按邮箱/名称模糊搜索
- **排序**：按注册时间、额度使用量、最近活跃时间
- **Tier 筛选**：按 free/basic/pro 筛选

### 用户详情页 `/admin/users/:id`
点击用户行进入详情页，展示：

**基本信息卡片**：
- 邮箱、名称、tier、注册时间
- 修改 tier（free ↔ basic ↔ pro 下拉选择）

**额度状态卡片**：
- 当前 used/max/available
- 手动调整额度（增加/减少/设为）

**学习数据只读查看**：
- 历史记录列表（标题、语言对、创建时间）
- 收藏单词列表
- 偏好设置
- 单词总览

## 6. 额度管理 `/admin/quota`

### 批量调整
- **目标范围**：选择 free / basic / pro / 全部用户
- **操作类型**：
  - 增加 N 句（`quota_max += N`，上限 MAX_QUOTA）
  - 减少 N 句（`quota_max -= N`，下限 0）
  - 设为 N 句（`quota_max = N`）
- **确认弹窗**：显示影响范围（"将影响 X 名 free 用户"）
- **操作日志**：记录每次批量调整

### 操作日志
新增 `admin_logs` 表记录所有 admin 操作：
- 操作类型（quota_batch_adjust、user_tier_change、user_quota_adjust 等）
- 操作者（admin）
- 目标范围（tier 或 user_id）
- 详情（调整前后值）
- 时间戳

## 7. 黑名单 `/admin/blacklist`

### 功能
- **黑名单列表**：显示所有被封禁用户（邮箱、名称、封禁原因、封禁时间）
- **添加到黑名单**：输入用户邮箱或从用户列表中点击「封禁」，填写封禁原因
- **移出黑名单**：点击「解封」按钮，确认后移出
- **封禁效果**：黑名单用户登录后无法调用任何需要额度的 API（process-text 等），返回 403 "账号已被封禁"

### 数据存储
在 users 表新增 `banned` 和 `banned_reason` 列：
```sql
ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN banned_reason TEXT;
```

### 封禁检查
在 `require_auth` 依赖中增加封禁检查：如果用户 `banned == 1`，返回 403。

## 8. Token 成本追踪 `/admin/costs`

### 功能
- **成本概览卡片**：今日 Token 成本、本月 Token 成本（美元估算）
- **平均每用户成本**：本月总成本 / 活跃用户数
- **Top 10 成本用户**：表格显示邮箱、prompt tokens、completion tokens、总 tokens、估算成本
- **成本趋势图**：最近 7 天/30 天的每日成本折线图
- **按模型分布**：各模型的 token 消耗占比

### 数据采集
每次 LLM API 调用后，记录 token 使用量到 `token_usage` 表。从 LLM API 响应的 `usage` 字段提取：
- `prompt_tokens`
- `completion_tokens`
- `total_tokens`

### 成本估算
使用模型对应的价格表估算美元成本（内置常见模型价格，admin 可在设置中自定义价格）：
```
gpt-4o:        $2.50/1M input, $10.00/1M output
gpt-4o-mini:   $0.15/1M input, $0.60/1M output
claude-sonnet:  $3.00/1M input, $15.00/1M output
...
```

### 数据存储
新增 `token_usage` 表：
```sql
CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    request_type TEXT,              -- 'process_text', 'translate', 'generate', 'word_detail' 等
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 采集时机
在以下位置插入 token 记录逻辑：
- `text_processing.py` 的 `_preprocess_and_run`：翻译/生成/文本处理
- `vocabulary.py` 的单词详情生成
- `settings.py` 的 UI 翻译

每次 LLM 调用后，从响应的 `usage` 字段提取 token 数据并写入 `token_usage` 表。

## 9. 后端 API

新增 `backend/routers/admin.py`，所有端点使用 `require_admin` 守卫：

```
POST /api/admin/login              — admin 登录
GET  /api/admin/dashboard          — 仪表盘数据
GET  /api/admin/api-keys           — 获取全局 API Key 配置
PUT  /api/admin/api-keys           — 更新全局 API Key 配置
POST /api/admin/api-keys/test      — 测试 API Key 可用性
GET  /api/admin/users              — 用户列表（分页、搜索、排序、筛选）
GET  /api/admin/users/:id          — 用户详情
PUT  /api/admin/users/:id          — 修改用户（tier）
PUT  /api/admin/users/:id/quota    — 调整单个用户额度
GET  /api/admin/users/:id/history  — 用户历史记录
GET  /api/admin/users/:id/favorites — 用户收藏单词
GET  /api/admin/users/:id/preferences — 用户偏好
GET  /api/admin/users/:id/word-list — 用户单词总览
POST /api/admin/quota/batch        — 批量调整额度
GET  /api/admin/blacklist          — 黑名单列表
POST /api/admin/blacklist          — 添加到黑名单（email + reason）
DELETE /api/admin/blacklist/:user_id — 移出黑名单
GET  /api/admin/costs              — Token 成本概览（今日/本月/avg/top10）
GET  /api/admin/costs/trend        — 成本趋势（7天/30天每日）
GET  /api/admin/costs/by-model     — 按模型分布
GET  /api/admin/logs               — 操作日志（分页）
```

## 10. 数据存储

### 新增表：admin_logs
```sql
CREATE TABLE IF NOT EXISTS admin_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    action TEXT NOT NULL,          -- 操作类型
    target_type TEXT,              -- 'tier' 或 'user'
    target_id TEXT,                -- tier 名称 或 user_id
    details TEXT,                  -- JSON 详情
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### 新增表：token_usage
```sql
CREATE TABLE IF NOT EXISTS token_usage (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    model TEXT NOT NULL,
    prompt_tokens INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    total_tokens INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    request_type TEXT,              -- 'process_text', 'translate', 'generate', 'word_detail' 等
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
```

### users 表新增列
```sql
ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN banned_reason TEXT;
```

### 复用存储
- 全局 API Key：复用 `llm_api.py` 的 JSON 配置
- 用户数据：从 users.db 和 gualingo.db 聚合查询
- 语言统计：从 history 表的 source_lang / target_lang 聚合

## 9. 前端组件结构

```
frontend/src/
├── pages/
│   └── AdminPage.jsx          — Admin 主布局（侧边栏 + 路由出口）
├── components/admin/
│   ├── AdminDashboard.jsx     — 仪表盘
│   ├── AdminApiKeys.jsx       — 全局 API Key 管理
│   ├── AdminUsers.jsx         — 用户列表
│   ├── AdminUserDetail.jsx    — 用户详情
│   ├── AdminQuota.jsx         — 额度批量管理
│   ├── AdminBlacklist.jsx     — 黑名单管理
│   ├── AdminCosts.jsx         — Token 成本追踪
│   └── AdminLogs.jsx          — 操作日志
```

### 路由配置
```jsx
// App.jsx 新增
<Route path="/admin" element={<AdminPage />}>
  <Route index element={<AdminDashboard />} />
  <Route path="api-keys" element={<AdminApiKeys />} />
  <Route path="users" element={<AdminUsers />} />
  <Route path="users/:id" element={<AdminUserDetail />} />
  <Route path="quota" element={<AdminQuota />} />
  <Route path="blacklist" element={<AdminBlacklist />} />
  <Route path="costs" element={<AdminCosts />} />
</Route>
```

Admin 页面使用 `React.lazy` 懒加载，不影响主应用包体积。

## 10. 安全考虑

- Admin JWT 与普通用户 JWT 使用相同密钥但 payload 含 `role: "admin"`，易于区分
- 所有 admin API 端点强制 `require_admin` 守卫
- Admin 密码通过环境变量配置，不硬编码在生产环境
- 批量操作有确认弹窗和操作日志
- 用户详情页为只读查看，不能代替用户操作
- 黑名单用户在 `require_auth` 层即被拦截，无法调用任何受保护 API
- Token 成本数据只记录使用全局 API Key 的调用，用户自带 Key 的调用不记录
