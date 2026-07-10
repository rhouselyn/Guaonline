# 两阶段分词处理 实施计划（ponytail 精简版）

**Goal:** 句子处理拆两阶段：Stage1 只分词（链接/单词表立即可见，仅词形）→ Stage2 用固定词表充实（结构性防漏词）→ 走原有 word_gen。句子点进单词的上下文释义从详情面板移到条目行。

**原则:** 最短可工作 diff。复用现有 `_gateway_process_text_with_dictionary`（加一个可选参数注入强制词表，零提示词复制）。砍掉 stage 前端文案（YAGNI，进度条 Stage1 0-50%/Stage2 50-100% 不回退即可）。只新增 2 个必要函数。

---

## 改动清单

### 后端 `backend/utils/exercise_generators.py`

**1. `_gateway_process_text_with_dictionary` 加可选 `fixed_words=None` 参数**（约 L38）
- 函数签名加 `fixed_words=None`。
- 若 `fixed_words` 非空，在 system_prompt 末尾追加「强制词表」约束段（列出词表，要求 translation 数组严格等于它）。
- 其余完全不动。Stage2 复用此函数传 `fixed_words`，零提示词复制。

**2. 新增 `_gateway_stage1_segment`**（`_gateway_process_text_with_dictionary` 之后）
- 最小 tool call：只输出 `words` 数组。复用现有分词原则核心段（精简）。
- 返回清洗后词列表（复刻 `process_translation` 的纯标点过滤 + strip 边缘标点）。
- 不可省略：用户明确要 Stage1 单独分词。

**3. 新增 `_enforce_word_list(llm_result, fixed_words, sentence)`**
- 以 Stage1 词表为准，把 LLM 返回的 phonetic/morphology/meaning 按 lower(text) 回填，缺失留空壳。
- 结构性保证 translation 数组 == 固定词表（与 prompt 约束双保险，prompt 偏了也不漏词）。
- 透传 tokenized_translation 等其它字段。

**4. 重写 `process_text_background`（L828-L986）+ 删 `_process_single_sentence_impl`（L867-L917）**
- 保留初始化（分割句子、存初始 pipeline）。
- 提取一个内联小 helper `_flush(file_id, results_dict, done, total, sentences, prog)`：构建 vocab + 更新 processing_status + 增量存 pipeline（复刻现有 L938-L984 内联逻辑）。Stage1/2 两个循环共用，避免 20 行重复两遍。
- Stage1 循环：`_stage1_single` 调 `_gateway_stage1_segment` → `tr={original, translation:[{text:w}]}`。每完成调 `_flush`，progress = `done/total*50`。
- Stage2 循环：`_stage2_single` 取 Stage1 词表 → 调 `_gateway_process_text_with_dictionary(..., fixed_words=words)` → `_enforce_word_list` → `validate_and_complete_translation`。每完成调 `_flush`，progress = `50 + done/total*50`。
- 末尾调现有 `_finalize_pipeline`（不动）。
- `_fill_missing_words`/`_detect_missing_and_bold`/`refill_missing_words_background`/`retry_failed_sentences` 全部不动（旧条目补漏向后兼容）。

### 前端 `frontend/src/components/DictionaryStep.jsx`

**5. ctx 覆盖从详情面板移到条目行**
- 条目行（L1431-L1443）：ctx 激活时 ipa/morphology/meaning 用 ctx 字段。
- 详情面板（L1475-L1500）：移除 ctx 三元与「本句上下文」标签，始终显示全局释义。删 `{ctx && (ctx.morphology||ctx.phonetic) && ...}` 整块。
- `ctx` 变量定义（L1411）保留（条目行用）。

---

## 自检（ponytail: 留一个 runnable check）

`_enforce_word_list` 是核心新增逻辑，留 assert demo：
```python
# backend/tests/test_enforce_word_list.py
from utils.exercise_generators import _enforce_word_list
llm = {"translation":[{"text":"Take","phonetic":"teɪk","morphology":"v","meaning":"拿"},
                       {"text":"off","phonetic":"ɒf","morphology":"adv","meaning":"离开"}],
       "tokenized_translation":"x","redundant_tokens":[]}
r = _enforce_word_list(llm, ["take","off","yo"], "take off yo")
assert [t["text"] for t in r["translation"]] == ["take","off","yo"]  # 严格等于固定词表
assert r["translation"][0]["meaning"] == "拿"  # 属性回填
assert r["translation"][2]["meaning"] == ""    # 缺失留空壳
assert r["tokenized_translation"] == "x"       # 其它字段透传
print("enforce_word_list ok")
```

---

## 为什么这样最省

| 原计划 | ponytail 版 |
|---|---|
| 复制完整 Stage2 提示词（~80 行） | 加 1 个参数 + 1 段约束，复用现有函数 |
| 新增 `_build_vocab_from_results` + `_update_status_and_save` 两个 helper | 合并成 1 个内联 `_flush` |
| stage 前端文案 + LearningApp 改动 | 砍掉，进度条不回退即可 |
| 7 个 Task | 5 处改动，1 个自检 |

**风险:** Stage1 分词失败 → `fixed_words` 空 → Stage2 跳过保留词形-only，不阻塞。旧条目无 stage 走 refill，向后兼容。
