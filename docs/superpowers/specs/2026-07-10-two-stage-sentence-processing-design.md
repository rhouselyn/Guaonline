# 两阶段句子处理设计

日期：2026-07-10
状态：待评审

## 背景与目标

当前每个句子由单次 LLM 调用（`_gateway_process_text_with_dictionary`）一次性产出所有内容：单词 token（音标/词性/释义）、`tokenized_translation`（完整翻译）、`grammar_explanation`、`translation_phrases`、`redundant_tokens`。问题：用户必须等待整句处理完才能看到任何结果——句子原文里的单词跳转链接、单词分表条目都不可用。

目标：拆成两阶段，让前端更早可见。

- **Stage 1（纯分词）**：LLM 只做分词，输出一行一词。完成后立即更新前端——句子原文里的单词跳转链接可用，单词分表显示纯单词（无释义/词性/音标）。
- **Stage 2（填充）**：用 Stage 1 的词构造固定 JSON 模板，LLM 只填充释义/词性/音标 + 翻译/语法/短语/冗余词。完成后单词分表条目从"纯单词"渐变为"完整条目"。

### 附带改动

- **进度条改百分比**：`current/total` 文本改为 `30%` 形式。
- **从句子点单词 → 替换条目行释义**：点句子里的单词时，用该句 token 的上下文释义/词性/音标替换**条目行本身**的展示（不是展开区），`WordDetail` 详情区不变。
- **不使用 `extract_words` 兜底**：Stage 1 校验失败时重试一次，仍失败则 best-effort 落库，不回退到程序分词。

## 方案选择

选定 **方案 A**：

- Stage 1：LLM 输出纯文本（一行一词），无 tool call 开销，解析简单。
- Stage 2：tool call 模式，`translation` 数组的 `text` 字段硬编码为 Stage 1 的词，LLM 只填充空字段。词边界由 Stage 1 锁定。

已否决：方案 B（两阶段都用 tool call，Stage 1 开销大且边界锁定弱）、方案 C（单次调用两次解析，无法真正分阶段）。

## 详细设计

### Stage 1 — 纯分词

**调用**：每句一次，句子间并发（`asyncio.as_completed`，与现有 `process_text_background` 一致）。

**输出格式**：一行一词，多词表达（如 `take off`）整行内用空格。无标点、无编号、无引号、无解释、无空行。

**解析**：
1. 按 `\n` 切分
2. 每行 `strip()`
3. 用现有 `strip_edge_punctuation` 去首尾标点
4. 过滤空行
5. 得到 `words: List[str]`

**校验（无 `extract_words` 兜底）**：
1. `words` 拼接去标点去空格小写化，与原句同样归一化（复用 `_normalize_text_for_compare`）后比较
2. 匹配 → 直接用
3. 不匹配 → Stage 1 重试一次（temperature 不变，提示词追加："上次输出与原句不一致，请严格按原文词序"）
4. 仍不匹配 → 用当前 `words` best-effort 落库（不抛错、不标 `__failed`，不阻塞整句处理）

**完成后立即更新**：
- 把该句 `translation_result.translation` 写成空壳：`[{text: w, phonetic: "", morphology: "", meaning: ""}, ...]`
- 增量存 `pipeline_data`
- 重建 `vocab`（纯单词，无释义/词性/音标）
- 推 `processing_status`

前端 refetch 后即可看到：句子原文里的单词跳转链接 + 单词分表的纯单词条目。

### Stage 2 — 填充

**调用**：每句一次，跟在 Stage 1 之后（同一句内部串行）。

**模板构造**：tool call schema 复用现有 `_gateway_process_text_with_dictionary` 的 tools 定义（`original`/`translation`/`tokenized_translation`/`translation_phrases`/`grammar_explanation`/`redundant_tokens` 全部保留）。`translation` 数组每个条目的 `text` 硬编码为 Stage 1 的词（顺序、拼写锁定），`phonetic`/`morphology`/`meaning` 留空。`tokenized_translation`/`grammar_explanation`/`translation_phrases`/`redundant_tokens` 也留空。

**回填逻辑**：
1. LLM 返回的 `translation` 数组，`phonetic`/`morphology`/`meaning` 按相同下标回填到该句 `translation` 数组
2. `text` 始终以 Stage 1 为准（防止 LLM 偷改边界）
3. 若返回数组长度 ≠ Stage 1 词数，或某 `text` 被改动 → 按位置回填，忽略 LLM 的 `text` 变更
4. `tokenized_translation`/`grammar_explanation`/`translation_phrases`/`redundant_tokens` 直接覆盖

**校验**：
- 若 `tokenized_translation` 等关键字段为空 → Stage 2 重试一次
- 仍空 → best-effort 落库（不标 `__failed`）

**完成后再次更新**：
- 增量存 `pipeline_data` + 重建 `vocab`（这次词汇带释义/词性/音标）
- 推 `processing_status`

前端 refetch 后单词分表条目从"纯单词"渐变为"完整条目"。

### 并发与进度

- 句子间并发（`asyncio.as_completed`），每句内部 Stage 1 → Stage 2 串行
- `processing_status.current_sentence`/`total_sentences` 按"完成 Stage 2 的句子数"计（进度语义一致）
- `vocab` 在 Stage 1 完成时就开始增长，让用户立刻看到单词分表填充

### 现有逻辑的复用与删除

**复用**：
- `_gateway_process_text_with_dictionary` 的 tool schema（Stage 2 直接用）
- `_normalize_text_for_compare`（Stage 1 校验）
- `strip_edge_punctuation`（Stage 1 解析）
- `validate_and_complete_translation`（Stage 2 后仍调用，对齐 token 与原文）
- `_extract_vocab_from_sentences`（Stage 1/2 完成后重建 vocab）
- `_finalize_pipeline`（全部句子 Stage 2 完成后收尾）

**删除**：
- `_fill_missing_words` / `_gateway_process_remaining_words` / `_detect_missing_and_bold`：补漏机制——两阶段锁定词边界后不再需要
- `refill_missing_words_background` 路由 + `/refill-missing-words` 端点：进入条目补漏
- Stage 2 的 system_prompt 中所有分词相关段落（归 Stage 1）

### 前端改动

#### 1. 进度条改百分比

`DictionaryStep.jsx` 的 `renderProgress`：把 `current/total` 文本（如 `3/10`）改为百分比 `30%`。两个进度（句子处理 `processingInfo`、单词详情 `wordGenProgress`）都改。条本身已是 `width: ${progress}%`，只需把旁边数字文案换成 `Math.round(current/total*100) + '%'`。

#### 2. 从句子点单词 → 替换条目行释义，详情不变

当前 `DictionaryStep.jsx#L1473-L1500` 展开区：点句子单词时 `activeSentenceContext` 记录该句 token 的 `meaning/morphology/phonetic`，只在展开区释义处覆盖。

改为：用这些上下文值替换**条目行本身**的释义/词性/音标展示（上方 `button` 里的 `word.meaning`/`word.morphology`/`word.ipa`），展开区里的 `WordDetail` 保持原样（始终用全局 `detail`）。

具体逻辑：
- 条目行渲染时，若 `activeSentenceContext.wordKey === wordKey`：
  - `meaning` 显示 `ctx.meaning`（无则回退原值）
  - `morphology` 显示 `ctx.morphology`
  - `ipa` 显示 `ctx.phonetic`
- 直接点单词分表（`handleVocabWordClick`）时 `activeSentenceContext` 置空，条目行回退全局释义
- "本句上下文"小标签保留作为视觉提示，但释义源从"展开区覆盖"改为"条目行覆盖"

#### 3. 句子阶段一就打跳转链接 + 单词分表显示纯单词

前端零改动——由后端 Stage 1 完成时写入空壳 `translation` 驱动：
- `renderOriginalSentence`（`DictionaryStep.jsx#L781-L827`）用 `translation_result.translation` 的 token 文本做高亮链接，空壳也有 `text`，链接可点
- 单词分表（`DictionaryStep.jsx#L1405-L1516`）渲染 `word.word`（纯单词始终显示），`word.ipa`/`word.morphology`/`word.meaning` 为空时不显示对应 span——空壳阶段就是"只显示单词"
- Stage 2 完成后 refetch，这些字段被填上，span 自动出现

## 完整提示词

### Stage 1 提示词（纯分词，一行一词）

```
处理以下 {source_lang_name} 文本。

【任务】
把句子分成一个个词，每行输出一个词，不要输出其他任何内容。

【分词原则】
1. 遵循 {source_lang_name} 自身的自然词边界，你是精通该语言正字法和语法规则的语言专家
2. 一个"词"是该语言词典中可查到的最小意义单位（变位/屈折形式是单个词，不拆词干+词缀）
3. 标点符号完全丢弃，绝不附着在任何词上（. , ! ? : ; 等全部去掉）
4. 词内部的连字符(-)和撇号(')保留（如它们是该语言的词内组成部分）
5. 固定搭配/多词表达（语义不可组合、词典有独立词条、替换任一词含义即变）整行输出，内部用空格
6. 输出条目按原文顺序，去掉标点后拼接必须等于原文去掉标点后的内容，不得增减

【输出格式】
- 每行一个词
- 不要编号、引号、解释、空行
- 多词表达在同一行内用空格分隔

【待处理文本】
{text}
```

若有上下文，在【待处理文本】前插入：
```
【上下文】
前文：
{before}

后文：
{after}
```

### Stage 2 提示词（填充 + 翻译/语法/短语/冗余词，tool call）

tool schema 复用现有 `_gateway_process_text_with_dictionary` 的 tools 定义。system_prompt 去掉所有分词相关段落，改为"填充已给定模板"指令：

```
处理以下 {source_lang_name} 文本，并翻译成 {target_lang_name}。

【非常非常重要的说明！！！】
1. 所有翻译和解释都必须使用 {target_lang_name}（目标语言）
2. 不要单独给每个词语法解释 - 只给整个句子一个完整的语法解释
3. 词性标注（morphology）只能使用以下缩写，不要加其他文字：
   - n (名词), v (动词), adj (形容词), adv (副词), pron (代词), prep (介词), conj (连词), interj (感叹词), det (限定词)
4. morphology 字段必须只包含缩写，不要有其他内容！
5. 【输出约束】除了工具调用的JSON输出外，不要添加任何其他文本、解释或说明。直接生成工具调用所需的JSON参数即可
6. 【极其重要·保留说话人标签】如果原文以说话人标签开头（如 "A:" "B:" "John:" 等），tokenized_translation 必须在开头保留同样的说话人标签，冒号使用目标语言习惯的全角或半角形式，不得省略

【核心约束·已给定模板】
translation 数组已经预填好——每个条目的 text 字段是原文的词（顺序、拼写已锁定），你只能填充以下空字段：
- phonetic: 该词的发音标注，使用 {source_lang_name} 最常用、最被广泛认可的注音系统（IPA/拼音/罗马字等），声调语言需标声调
- morphology: 词性缩写（仅限第3条列出的缩写）
- meaning: 基于上下文的 {target_lang_name} 释义，简洁的几个独立词，不要完整句子解释

【极其重要·禁止改动模板】
1. 不得修改任何条目的 text
2. 不得增加、删除、重排任何条目
3. 不得修改条目顺序或数量
4. 只填充 phonetic / morphology / meaning 三个字段

【其他字段】
- tokenized_translation: 完整自然的 {target_lang_name} 翻译
- translation_phrases: 将 tokenized_translation 按目标语言的词分词，至少拆为2个片段
- grammar_explanation: 整个文本的一个完整语法解释，用 {target_lang_name}
- redundant_tokens: 4个与原文相关的合理冗余词，用于测验，必须全部使用 {target_lang_name}，每个必须是单个独立的词

【极其重要·禁止空白字段】translation 数组中每个条目的 phonetic、morphology、meaning 字段都必须有实际内容，绝对不能留空！
```

user_content（Stage 1 的词预填进模板，作为 LLM 必须遵守的约束）：

```
{context_section}
【待处理文本】
{text}

【translation 数组预填模板·必须严格遵循】
[
  {{"text": "{word1}", "phonetic": "", "morphology": "", "meaning": ""}},
  {{"text": "{word2}", "phonetic": "", "morphology": "", "meaning": ""}},
  ...
]
```

其中 `{word1}`、`{word2}`… 是 Stage 1 解析出的词，按顺序填入。

## 不在范围内

- 单词详情生成（`background_word_gen` / `_gateway_generate_multiple_choice`）：不受影响，Stage 2 完成后照常触发
- 学习计划生成（`generate_and_save_learning_plan`）：不受影响
- 失败句子重试（`retry_failed_sentences`）：保留，但内部改为两阶段
- 无空格语言（中文/日文等）：Stage 1 同样适用，LLM 按字符/词分，校验用归一化比较
