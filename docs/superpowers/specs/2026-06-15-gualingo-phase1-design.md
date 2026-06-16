# 呱邻国 Phase 1 设计文档：免费额度 + 全局单词库

**日期:** 2026-06-15
**状态:** 已确认

---

## 目标

1. 免费版改为限量额度（注册50句，每日+10，上限100），不再自带 API Key
2. 全局单词库：所有用户的单词自动收录，减少重复 LLM 调用
3. 用户单词库：优先从用户自身缓存读取

## 免费额度系统

### users 表新增字段
- `quota_used` INT DEFAULT 0 — 已用句子数
- `quota_max` INT DEFAULT 50 — 当前上限
- `quota_reset_at` TEXT — 上次重置时间（ISO格式）

### 额度逻辑
- 注册：quota_used=0, quota_max=50
- 每次处理文本（`process-text`）前检查：未登录→拒绝，已登录→quota_used < quota_max?
- 处理成功后 quota_used += 本次处理的句子数
- 每日恢复：请求时检查 `quota_reset_at`，若跨天则 quota_max = min(quota_max + 10, 100), quota_reset_at = now
- 基础版/专业版：不检查额度（无限）

### API 变更
- `GET /api/auth/me` 返回 quota_used, quota_max
- `GET /api/auth/quota` 返回额度详情
- `POST /api/text-processing/process-text` 增加额度检查中间件

## 全局单词库

### global_vocab 表
```sql
CREATE TABLE IF NOT EXISTS global_vocab (
    id TEXT PRIMARY KEY,
    word TEXT NOT NULL,
    source_lang TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    phonetic TEXT,
    morphology TEXT,
    meaning TEXT,
    enriched_meaning TEXT,
    variants_detail TEXT,  -- JSON
    examples TEXT,         -- JSON
    memory_hint TEXT,
    created_at TEXT NOT NULL,
    hit_count INTEGER DEFAULT 1,
    UNIQUE(word, source_lang, target_lang)
);
CREATE INDEX idx_global_vocab_lookup ON global_vocab(word, source_lang, target_lang);
```

### 写入时机
- `process_text_with_dictionary` 返回时 upsert 每个词
- `generate_multiple_choice` 返回时 upsert
- `process_remaining_words` 返回时 upsert

### 查询优先级
1. user_vocab（用户自身缓存）
2. global_vocab（全局缓存）
3. LLM 调用（无缓存时）

## 用户单词库

### user_vocab 表
```sql
CREATE TABLE IF NOT EXISTS user_vocab (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    word TEXT NOT NULL,
    source_lang TEXT NOT NULL,
    target_lang TEXT NOT NULL,
    phonetic TEXT,
    morphology TEXT,
    meaning TEXT,
    enriched_meaning TEXT,
    variants_detail TEXT,
    examples TEXT,
    memory_hint TEXT,
    created_at TEXT NOT NULL,
    UNIQUE(user_id, word, source_lang, target_lang)
);
CREATE INDEX idx_user_vocab_lookup ON user_vocab(user_id, word, source_lang, target_lang);
```

## API Key 设置变更

### 前端
- SettingsModal 隐藏 API Key 配置区域（免费版用户不可见）
- 基础版/专业版用户可配置自己的 Key（未来功能）

### 后端
- `llm_api.py` 平台级 Key 从环境变量 `PLATFORM_API_KEY` / `PLATFORM_BASE_URL` / `PLATFORM_MODEL` 读取
- 保留多 Key 轮询机制，但 Key 来源改为环境变量而非用户配置
- 现有 settings 路由保留，仅管理员可用

## 数据流

```
用户提交文本
  → 检查登录状态（未登录→401）
  → 检查额度（quota_used < quota_max？）
  → 每日恢复检查
  → process_text_with_dictionary
    → 遍历每个词：
      → 查 user_vocab？有→用缓存
      → 查 global_vocab？有→用缓存，hit_count++
      → 无缓存→LLM调用→结果写入 user_vocab + global_vocab
  → 扣减额度（quota_used += 句子数）
```

## 文件变更清单

### 新增
- `backend/auth/quota.py` — 额度检查与恢复逻辑
- `backend/vocab/global_vocab.py` — 全局单词库 CRUD
- `backend/vocab/user_vocab.py` — 用户单词库 CRUD

### 修改
- `backend/auth/models.py` — User 模型加 quota 字段
- `backend/auth/router.py` — 注册时初始化额度，/me 返回额度
- `backend/routers/text_processing.py` — 加额度检查 + 单词缓存查询/写入
- `backend/llm_api.py` — 平台 Key 从环境变量读取
- `backend/main.py` — 启动时初始化 global_vocab 表
- `frontend/src/components/SettingsModal.jsx` — 隐藏 API Key 区域
- `frontend/src/pages/LandingPage.jsx` — 更新免费版说明
- `frontend/src/utils/auth.js` — 登录后获取额度信息
