# 两阶段分词处理 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把句子处理拆成「快速分词」+「强制词表充实」两阶段：第一阶段只让 LLM 输出无标点分词列表，立即更新前端句子→单词链接和单词分表（仅词形）；第二阶段用每句的固定词表强制生成完整词典 JSON（不再让 LLM 自由发挥分词），再走原有单词详情生成。同时把「从句子点进的单词」的上下文释义从详情面板移到条目行替换。

**Architecture:**
- **Stage 1（分词）**：每句一次轻量 LLM 调用，只输出词列表（无标点）。结果存为 `translation_result.translation = [{text: w}, ...]`（仅 text）。增量更新 `processing_status.vocab`（词形-only）与 `sentence_translations`。前端 `renderOriginalSentence` 已按 `tr.translation[].text` + vocab 匹配原句建链接，词形-only 即可让链接和单词分表立即可见。
- **Stage 2（充实）**：所有句子分词完成后，每句用「Stage 1 的固定词表」做一次完整 LLM 调用，复用现有完整提示词并强制 `translation` 数组必须等于该词表。结构上以 Stage 1 词表为准、把 LLM 返回的 phonetic/morphology/meaning 按 lower(text) 回填——**结构性保证无漏词**。再填 tokenized_translation/translation_phrases/grammar_explanation/redundant_tokens。随后 `validate_and_complete_translation` 兜底，`_finalize_pipeline` + `background_word_gen` 不变。
- **条目上下文替换**：`DictionaryStep` 中 `activeSentenceContext`（ctx）的覆盖从展开详情面板移到折叠条目行——条目行的 ipa/morphology/meaning 用 ctx 覆盖；详情面板始终显示全局释义。

**Tech Stack:** Python/FastAPI 后端（`utils/llm_gateway.gateway.call` tool-call 模式），React 前端。

---

## 文件结构

- **修改** `backend/utils/exercise_generators.py`
  - 新增 `_gateway_stage1_segment(...)` —— Stage 1 分词 LLM 调用（tool call，仅输出词列表）
  - 新增 `_gateway_stage2_enrich(...)` —— Stage 2 充实 LLM 调用（复用现有完整提示词 + 强制词表）
  - 新增 `_build_stage1_translation_result(...)` —— 把词列表构造成 text-only translation_result（含纯标点过滤/strip，复刻 `process_translation` 的清洗）
  - 新增 `_enforce_word_list(translation_result, fixed_words)` —— 以固定词表为准，回填 LLM 属性
  - 新增 `_build_vocab_from_results(results_dict)` —— 从 results_dict 构建 vocab（提取自现有 as_completed 内联逻辑，Stage1/2 共用）
  - 新增 `_update_status_and_save(...)` —— 更新 processing_status + 增量保存 pipeline（提取自现有内联逻辑，Stage1/2 共用）
  - 重写 `process_text_background` —— 先并发跑 Stage 1 全部分词，再并发跑 Stage 2 全部充实，分别增量更新
  - `_process_single_sentence_impl` 改造为 `_stage1_single` + `_stage2_single` 两个内部函数
  - `_fill_missing_words` / `_detect_missing_and_bold` / `refill_missing_words_background` **保留不动**（旧条目补漏向后兼容）
- **修改** `frontend/src/components/DictionaryStep.jsx`
  - 条目行（折叠态）：ctx 激活时用 ctx.ipa/morphology/meaning 覆盖
  - 详情面板（展开态）：移除 ctx 覆盖与「本句上下文」标签，始终显示全局释义
  - 新增 `stage` 状态文案：`segmenting`→「分词中...」、`enriching`→「生成释义中...」（复用现有 preprocessStatus 机制）

---

## Task 1: Stage 1 分词 LLM 网关函数

**Files:**
- Modify: `backend/utils/exercise_generators.py`（在 `_gateway_process_text_with_dictionary` 之后，约 L174 后插入）

- [ ] **Step 1: 实现 `_gateway_stage1_segment`**

在 `_gateway_process_text_with_dictionary` 函数之后插入。复用现有分词原则提示词（现有 system_prompt L106-L140 的「translation 数组的分词原则」段），精简为只输出词列表。

```python
async def _gateway_stage1_segment(user_id, tier, sentence, source_lang, context_sentences=None):
    """Stage 1：仅让 LLM 输出无标点分词列表（不生成释义/音标/翻译）。
    返回去标点、去纯标点、strip 边缘标点后的词列表（保持原句顺序）。
    复用现有分词原则提示词，仅要求输出 words 数组，更快更省。
    """
    source_lang_name = get_lang_name(source_lang)

    tools = [{
        "type": "function",
        "function": {
            "name": "segment_words",
            "description": "将原文按源语言自然词边界分词，输出无标点的词列表",
            "parameters": {
                "type": "object",
                "properties": {
                    "words": {
                        "type": "array",
                        "items": {"type": "string", "description": "原文中的一个词，MUST NOT contain any punctuation. 遵循源语言自然词边界"},
                    },
                },
                "required": ["words"],
            },
        },
    }]

    context_section = ""
    if context_sentences:
        before = context_sentences.get("before", [])
        after = context_sentences.get("after", [])
        parts = []
        if before:
            parts.append("前文：\n" + "\n".join(before))
        if after:
            parts.append("后文：\n" + "\n".join(after))
        if parts:
            context_section = "\n【上下文】\n" + "\n".join(parts) + "\n"

    # 复用现有「分词原则」提示词核心段（见 _gateway_process_text_with_dictionary L106-L130）
    system_prompt = f"""将以下 {source_lang_name} 文本按该语言的自然词边界分词，输出无标点的词列表。

═══════════════════════════════════════════════════════════
【分词原则】
═══════════════════════════════════════════════════════════
你是一个语言专家，精通所有语言的正字法和语法规则。请根据 {source_lang_name} 自身的语言规则判断什么是"一个词"。

【什么是一个"词"？】
一个"词"是原文中连续出现的、在该语言的词典中可以查到的最小意义单位。

【关键规则】
1. 遵循该语言的正字法惯例
2. 变位/屈折形式是单个词：不要将变位形式拆分为词干+词缀
3. 尊重该语言的自然词边界
4. 【固定搭配与多词表达】只有当整体含义无法从组成部分字面推导、在词典中作为独立词条存在、替换任一词都会改变含义时，才合并为一个词
5. 【标点禁令】每个词绝对禁止包含任何标点符号
6. 所有词按原文顺序拼接（去标点后）必须等于原文去标点后的内容
7. 禁止将一个完整的词拆分成字符、音节或语素

【输出约束】只输出 words 数组，不要任何其他文本或解释。"""

    user_content = f"{context_section}\n【待处理文本】\n{sentence}" if context_section else f"【待处理文本】\n{sentence}"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    response = await gateway.call(
        user_id, tier, messages,
        temperature=0.0,
        request_type="stage1_segment", tools=tools,
    )

    words = []
    try:
        choice = response.get("choices", [{}])[0]
        message = choice.get("message", {})
        tool_calls = message.get("tool_calls", [])
        if tool_calls:
            arguments_str = tool_calls[0].get("function", {}).get("arguments", "{}")
            result = json.loads(arguments_str)
            words = result.get("words", [])
        else:
            content = message.get("content", "")
            if content:
                result = json.loads(content)
                words = result.get("words", [])
    except Exception as e:
        print(f"[WARN] stage1_segment parse failed: {e}")

    # 复刻 process_translation 的清洗：过滤纯标点 + strip 边缘标点
    cleaned = []
    for w in words:
        if not isinstance(w, str):
            continue
        t = w.strip()
        if not t or is_punctuation_only(t):
            continue
        c = strip_edge_punctuation(t)
        if c:
            cleaned.append(c)
    return cleaned
```

- [ ] **Step 2: 验证导入与函数可调用**

```bash
cd /workspace/backend && python -c "from utils.exercise_generators import _gateway_stage1_segment; print('ok')"
```
Expected: `ok`（无语法错误）

- [ ] **Step 3: Commit**

```bash
git add backend/utils/exercise_generators.py
git commit -m "feat: Stage1 分词 LLM 网关函数"
```

---

## Task 2: Stage 2 充实 LLM 网关函数 + 强制词表回填

**Files:**
- Modify: `backend/utils/exercise_generators.py`（在 Task 1 插入的函数之后）

- [ ] **Step 1: 实现 `_gateway_stage2_enrich`**

复用 `_gateway_process_text_with_dictionary` 的完整 tool schema 与 system_prompt（L43-L140），追加「强制词表」约束段。返回完整 translation_result（含 translation 数组 + tokenized_translation 等）。

```python
async def _gateway_stage2_enrich(user_id, tier, sentence, fixed_words, source_lang, target_lang, context_sentences=None):
    """Stage 2：用 Stage 1 的固定词表强制生成完整词典 JSON。
    复用现有完整提示词，但强制 translation 数组必须且只能包含 fixed_words（按序）。
    返回 LLM 原始 result（translation 数组可能含 phonetic/morphology/meaning + 其它字段）。
    """
    source_lang_name = get_lang_name(source_lang)
    target_lang_name = get_lang_name(target_lang)

    # 复用 _gateway_process_text_with_dictionary 的 tools 与 system_prompt（见 L43-L140）
    # 为避免重复维护，直接调用它，再在调用前用追加约束的方式注入词表
    # —— 但该函数不接受额外约束，故这里复制其 tool schema 与 prompt 并追加强制词表段

    tools = [{
        "type": "function",
        "function": {
            "name": "process_text_with_dictionary",
            "description": "同时处理文本拆解翻译和单词词典条目生成",
            "parameters": {
                "type": "object",
                "properties": {
                    "original": {"type": "string", "description": "原文文本（完全保留原始空格）"},
                    "translation": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "text": {"type": "string", "description": "A single word or fixed multi-word expression from the source text. MUST NOT contain any punctuation marks. TOKENIZATION PRINCIPLE: Follow the natural word boundaries of the source language."},
                                "phonetic": {"type": "string", "description": "Pronunciation of this word. Use the most commonly used and widely recognized pronunciation notation for the source language — IPA, pinyin, romaji, or any other standard system. For tonal languages, include tone information."},
                                "morphology": {"type": "string", "description": "Meaning in TARGET_LANG based on the context - concise, just a few independent words, not a full sentence explanation"},
                                "meaning": {"type": "string", "description": "Meaning in TARGET_LANG based on the context - concise, just a few independent words, not a full sentence explanation"},
                            },
                            "required": ["text", "phonetic", "morphology", "meaning"],
                        },
                    },
                    "tokenized_translation": {"type": "string", "description": "完整自然的 TARGET_LANG 翻译，正常句子格式"},
                    "translation_phrases": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "将 tokenized_translation 按目标语言的词分词后的结果，用于翻译排序练习。必须至少拆分为2个片段",
                    },
                    "grammar_explanation": {"type": "string", "description": "整个文本的一个完整语法解释，用 TARGET_LANG"},
                    "redundant_tokens": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "4个与原文相关的合理冗余tokens，用于测验，必须全部使用TARGET_LANG，每个必须是单个独立的词",
                    },
                },
                "required": ["original", "translation", "tokenized_translation", "translation_phrases", "grammar_explanation", "redundant_tokens"],
            },
        },
    }]

    context_section = ""
    if context_sentences:
        before = context_sentences.get("before", [])
        after = context_sentences.get("after", [])
        parts = []
        if before:
            parts.append("前文：\n" + "\n".join(before))
        if after:
            parts.append("后文：\n" + "\n".join(after))
        if parts:
            context_section = "\n【上下文】\n" + "\n".join(parts) + "\n"

    words_list_str = "\n".join(f"{i+1}. {w}" for i, w in enumerate(fixed_words))

    # 复用现有完整 system_prompt（L95-L140），追加强制词表约束段
    system_prompt = f"""处理以下 {source_lang_name} 文本，并翻译成 {target_lang_name}。

【非常非常重要的说明！！！】
1. 所有翻译和解释都必须使用 {target_lang_name}（目标语言）。
2. 不要单独给每个词语法解释 - 只给整个句子一个完整的语法解释。
3. 词性标注（morphology）只能使用以下缩写，不要加其他文字：
   - n (名词), v (动词), adj (形容词), adv (副词), pron (代词), prep (介词), conj (连词), interj (感叹词), det (限定词)
4. morphology 字段必须只包含缩写，不要有其他内容！
5. 【输出约束】除了工具调用的JSON输出外，不要添加任何其他文本、解释或说明。
6. 【保留说话人标签】如果原文以说话人标签开头（如 "A:" "B:"），tokenized_translation 必须在开头保留同样的标签。

═══════════════════════════════════════════════════════════
【极其重要·强制词表！！！translation 数组必须严格等于以下词表】
═══════════════════════════════════════════════════════════
本次处理的分词已预先确定，translation 数组必须且只能包含以下单词，按此顺序，数量一致，不得增减、合并或拆分：
{words_list_str}

你必须为上表中的每一个词填写 phonetic / morphology / meaning，禁止留空。text 字段必须与上表完全一致。

═══════════════════════════════════════════════════════════
按照以下结构处理文本：
- original: 原文文本
- translation: 对象数组（必须严格等于上方强制词表，每项含 text/phonetic/morphology/meaning）
- tokenized_translation: 完整自然的 {target_lang_name} 翻译
- translation_phrases: 分词结果
- grammar_explanation: 语法解释
- redundant_tokens: 冗余词

【极其重要·禁止空白字段】translation 数组中每个条目的 phonetic、morphology、meaning 字段都必须有实际内容，绝对不能留空！"""

    user_content = f"{context_section}\n【待处理文本】\n{sentence}" if context_section else f"【待处理文本】\n{sentence}"
    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    response = await gateway.call(
        user_id, tier, messages,
        temperature=0.0,
        request_type="stage2_enrich", tools=tools,
    )

    try:
        choice = response.get("choices", [{}])[0]
        message = choice.get("message", {})
        tool_calls = message.get("tool_calls", [])
        if tool_calls:
            arguments_str = tool_calls[0].get("function", {}).get("arguments", "{}")
            return json.loads(arguments_str)
        content = message.get("content", "")
        if content:
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                pass
    except Exception as e:
        print(f"[WARN] stage2_enrich parse failed: {e}")
    return {}
```

- [ ] **Step 2: 实现 `_enforce_word_list` 结构性回填**

在 `_gateway_stage2_enrich` 之后插入。以 Stage 1 固定词表为准，把 LLM 返回的属性按 lower(text) 回填，缺失留空壳。**结构性保证 translation 数组 == 固定词表，无漏词**。

```python
def _enforce_word_list(llm_result, fixed_words, sentence):
    """以 Stage 1 固定词表为准，把 LLM 返回的 phonetic/morphology/meaning 按 lower(text) 回填。
    返回最终 translation_result：translation 数组严格等于 fixed_words（顺序、数量一致），
    缺失属性留空字符串。其余字段（tokenized_translation 等）透传 LLM 结果。
    结构性保证无漏词——不信任 LLM 的分词，只取其属性。
    """
    if not isinstance(llm_result, dict):
        llm_result = {}

    # LLM 返回的 translation 条目按 lower(text) 建索引（含 strip 边缘标点兜底）
    llm_trans = llm_result.get("translation", []) if isinstance(llm_result.get("translation"), list) else []
    info_by_key = {}
    for tok in llm_trans:
        if not isinstance(tok, dict) or not tok.get("text"):
            continue
        key = strip_edge_punctuation(str(tok["text"])).lower()
        if key:
            info_by_key[key] = tok

    enforced_translation = []
    for w in fixed_words:
        key = w.lower()
        info = info_by_key.get(key)
        enforced_translation.append({
            "text": w,
            "phonetic": (info.get("phonetic", "") if info else "") or "",
            "morphology": (info.get("morphology", "") if info else "") or "",
            "meaning": (info.get("meaning", "") if info else "") or "",
        })

    result = dict(llm_result)
    result["original"] = llm_result.get("original", sentence)
    result["translation"] = enforced_translation
    return result
```

- [ ] **Step 3: 验证导入**

```bash
cd /workspace/backend && python -c "from utils.exercise_generators import _gateway_stage2_enrich, _enforce_word_list; print('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/utils/exercise_generators.py
git commit -m "feat: Stage2 充实 LLM 网关 + 强制词表回填"
```

---

## Task 3: 提取 vocab 构建 / 状态更新公共helper

**Files:**
- Modify: `backend/utils/exercise_generators.py`（`process_text_background` 内联逻辑提取为模块级函数）

- [ ] **Step 1: 实现 `_build_vocab_from_results`**

提取自现有 `process_text_background` L938-L962 内联逻辑，Stage 1（词形-only）与 Stage 2（充实）共用。

```python
def _build_vocab_from_results(results_dict):
    """从 results_dict {idx: sentence_data} 构建去重排序的 vocab 列表。
    词形-only token（无 ipa/meaning）与充实 token 均适用——缺字段即为空串。
    提取自原 process_text_background as_completed 内联逻辑。
    """
    partial_vocab = []
    for si in sorted(results_dict.keys()):
        sd = results_dict[si]
        tr = sd.get("translation_result", {}) if isinstance(sd, dict) else {}
        if isinstance(tr, dict) and "translation" in tr:
            for ti, token in enumerate(tr["translation"]):
                if isinstance(token, dict) and "text" in token:
                    entry = {
                        "word": token["text"],
                        "ipa": token.get("phonetic", ""),
                        "meaning": token.get("meaning", "") or token.get("context_meaning", ""),
                        "tokens": [token["text"]],
                        "morphology": token.get("morphology", ""),
                        "sentence_index": si,
                        "token_index": ti
                    }
                    partial_vocab.append(entry)

    seen = set()
    unique_partial = []
    for entry in partial_vocab:
        word = entry.get("word", "").lower()
        if word not in seen and word:
            seen.add(word)
            unique_partial.append(entry)
    unique_partial.sort(key=vocab_sort_key)
    return unique_partial
```

- [ ] **Step 2: 实现 `_update_status_and_save`**

提取自现有 L964-L984 内联逻辑。Stage 1/2 共用，支持传入 `stage` 标记。

```python
def _update_status_and_save(file_id, results_dict, completed_indices, total_sentences, sentences, stage=None):
    """更新 processing_status（vocab/sentence_translations/进度）+ 增量保存 pipeline。
    提取自原 process_text_background as_completed 内联逻辑。stage ∈ {None,'segmenting','enriching'}。
    """
    all_completed_translations = [results_dict[si] for si in sorted(results_dict.keys())]
    unique_partial = _build_vocab_from_results(results_dict)

    progress = int(len(completed_indices) / total_sentences * 100)
    _preserve = {k: processing_status.get(file_id, {}).get(k) for k in ("original_text", "title") if k in processing_status.get(file_id, {})}
    status = {
        "status": "processing",
        "progress": progress,
        "current_sentence": len(completed_indices),
        "total_sentences": total_sentences,
        "vocab": unique_partial,
        "sentence_translations": all_completed_translations,
        **_preserve,
    }
    if stage:
        status["stage"] = stage
    processing_status[file_id] = status

    # 增量 pipeline：已处理用 results_dict，未处理用空 translation_result
    incremental_pipeline = []
    for si in range(total_sentences):
        if si in results_dict:
            incremental_pipeline.append(results_dict[si])
        else:
            incremental_pipeline.append({"sentence": sentences[si], "translation_result": {}})
    storage.save_pipeline_data(file_id, incremental_pipeline)
```

- [ ] **Step 3: 验证导入**

```bash
cd /workspace/backend && python -c "from utils.exercise_generators import _build_vocab_from_results, _update_status_and_save; print('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/utils/exercise_generators.py
git commit -m "refactor: 提取 vocab 构建/状态更新公共 helper"
```

---

## Task 4: 重写 process_text_background 为两阶段

**Files:**
- Modify: `backend/utils/exercise_generators.py`（`process_text_background` L828-L986，`_process_single_sentence_impl` L867-L917）

- [ ] **Step 1: 用两阶段重写 `process_text_background`**

替换 L828 起的函数体到 L986（`sentence_translations = [...]` 之前）。保留 L829-L852 的初始化（分割句子、保存初始 pipeline、初始化 results_dict/completed_indices）。新增 Stage 1 并发循环 + Stage 2 并发循环，最后调用现有 `_finalize_pipeline`。

替换 `_process_single_sentence_impl`（L867-L917）为 `_stage1_single` + `_stage2_single`。关键代码：

```python
async def process_text_background(file_id: str, text: str, source_lang: str, target_lang: str, user_id: str = None, tier: str = "free"):
    try:
        t_total_start = time.time()
        app_prefs = storage.load_user_preferences(user_id=user_id)
        print(f"[DEBUG] 开始处理文件 {file_id}（两阶段）")
        _preserve = {k: processing_status[file_id][k] for k in ("original_text", "title") if k in processing_status[file_id]}
        processing_status[file_id] = {"status": "processing", "progress": 0, "current_sentence": 0, "total_sentences": 0, "stage": "segmenting", **_preserve}

        storage.save_language_settings(file_id, source_lang, target_lang)

        sentences = text_processor.split_sentences(text)
        total_sentences = len(sentences)
        print(f"[DEBUG] 共 {total_sentences} 个句子")

        initial_pipeline = [{"sentence": s, "translation_result": {}} for s in sentences]
        storage.save_pipeline_data(file_id, initial_pipeline)

        _preserve2 = {k: processing_status[file_id][k] for k in ("original_text", "title") if k in processing_status[file_id]}
        processing_status[file_id] = {"status": "processing", "progress": 0, "current_sentence": 0, "total_sentences": total_sentences, "stage": "segmenting", **_preserve2}

        results_dict = {}  # idx -> sentence_data（Stage1 为词形-only，Stage2 覆盖为充实）

        # ── Stage 1：分词（并发，仅词列表）──
        async def _stage1_single(idx, sentence):
            if not sentence.strip():
                return idx, None
            try:
                before = [sentences[i] for i in range(max(0, idx - 2), idx) if sentences[i].strip()]
                after = [sentences[i] for i in range(idx + 1, min(len(sentences), idx + 3)) if sentences[i].strip()]
                ctx = {"before": before, "after": after} if (before or after) else None
                words = await _gateway_stage1_segment(user_id, tier, sentence, source_lang, ctx)
                tr = {"original": sentence, "translation": [{"text": w} for w in words]}
                return idx, {"sentence": sentence, "source_lang": source_lang, "translation_result": tr}
            except Exception as e:
                import traceback as _tb
                print(f"[ERROR] 句子 {idx+1} 分词失败: {e}")
                _tb.print_exc()
                return idx, {"sentence": sentence, "translation_result": {"original": sentence, "translation": []}}

        stage1_tasks = [asyncio.create_task(_stage1_single(i, s)) for i, s in enumerate(sentences)]
        for coro in asyncio.as_completed(stage1_tasks):
            idx, sd = await coro
            if sd is not None:
                results_dict[idx] = sd
            _update_status_and_save(file_id, results_dict, set(results_dict.keys()), total_sentences, sentences, stage="segmenting")
        print(f"[DEBUG] Stage1 分词完成，{len(results_dict)} 句")

        # ── Stage 2：充实（并发，强制词表）──
        processing_status[file_id]["stage"] = "enriching"
        async def _stage2_single(idx, sentence):
            stage1_sd = results_dict.get(idx) or {"sentence": sentence, "translation_result": {"translation": []}}
            fixed_words = [t["text"] for t in stage1_sd.get("translation_result", {}).get("translation", []) if isinstance(t, dict) and t.get("text")]
            if not fixed_words:
                return idx, stage1_sd  # 空句/分词失败：保持词形-only
            try:
                before = [sentences[i] for i in range(max(0, idx - 2), idx) if sentences[i].strip()]
                after = [sentences[i] for i in range(idx + 1, min(len(sentences), idx + 3)) if sentences[i].strip()]
                ctx = {"before": before, "after": after} if (before or after) else None
                llm_result = await _gateway_stage2_enrich(user_id, tier, sentence, fixed_words, source_lang, target_lang, ctx)
                tr = _enforce_word_list(llm_result, fixed_words, sentence)
                tr = text_processor.validate_and_complete_translation(sentence, tr, source_lang)
                return idx, {"sentence": sentence, "source_lang": source_lang, "translation_result": tr}
            except Exception as e:
                import traceback as _tb
                print(f"[ERROR] 句子 {idx+1} 充实失败，保留 Stage1 词形: {e}")
                _tb.print_exc()
                return idx, stage1_sd

        stage2_tasks = [asyncio.create_task(_stage2_single(i, s)) for i, s in enumerate(sentences)]
        completed2 = set()
        for coro in asyncio.as_completed(stage2_tasks):
            idx, sd = await coro
            results_dict[idx] = sd
            completed2.add(idx)
            _update_status_and_save(file_id, results_dict, completed2, total_sentences, sentences, stage="enriching")
        print(f"[DEBUG] Stage2 充实完成")

        sentence_translations = [results_dict.get(i, {"sentence": sentences[i], "translation_result": {}}) for i in range(total_sentences)]
        _finalize_pipeline(file_id, sentence_translations, total_sentences, source_lang, target_lang, user_id, tier, t_total_start)
    except Exception as e:
        import traceback as _tb
        print(f"[ERROR] process_text_background 失败: {e}")
        _tb.print_exc()
        _preserve = {k: processing_status.get(file_id, {}).get(k) for k in ("original_text", "title") if k in processing_status.get(file_id, {})}
        processing_status[file_id] = {"status": "failed", "error": str(e), **_preserve}
```

注意：删除原 `_process_single_sentence_impl`、`process_single_sentence`、原 as_completed 循环（L855-L986）以及原 `tasks` 构建。保留 `retry_failed_sentences` 等其它函数不动。

- [ ] **Step 2: 验证语法与导入**

```bash
cd /workspace/backend && python -c "from utils.exercise_generators import process_text_background; print('ok')"
```
Expected: `ok`

- [ ] **Step 3: 验证旧路径未受影响（retry/refill 仍引用 _fill_missing_words 等）**

```bash
cd /workspace/backend && python -c "from utils.exercise_generators import _fill_missing_words, _detect_missing_and_bold, refill_missing_words_background, retry_failed_sentences; print('ok')"
```
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add backend/utils/exercise_generators.py
git commit -m "feat: process_text_background 改为两阶段（分词→强制词表充实）"
```

---

## Task 5: 前端条目上下文替换（从详情移到条目行）

**Files:**
- Modify: `frontend/src/components/DictionaryStep.jsx`（条目行 L1428-L1443，详情面板 L1473-L1500 区域）

- [ ] **Step 1: 条目行用 ctx 覆盖 ipa/morphology/meaning**

定位 L1431-L1443 区域（折叠条目行的 ipa / morphology / meaning 渲染）。当 `ctx` 激活时用 ctx 字段覆盖。

修改前（L1431-L1443）：
```jsx
{word.ipa && (
  <span className={`text-[11px] text-ink-400 ipa-font shrink-0 ${vocabDisplayMode === 2 && !isExpanded ? 'invisible' : ''}`}>
    {word.ipa.startsWith('/') ? word.ipa : `/${word.ipa}/`}
  </span>
)}
{word.morphology && (
  <span className="text-[10px] px-1.5 py-0.5 bg-parchment-100 text-ink-500 rounded font-medium tracking-wide shrink-0">
    {word.morphology}
  </span>
)}
<span className={`text-[12px] text-ink-500 truncate ${vocabDisplayMode === 1 && !isExpanded ? 'invisible' : ''}`}>
  {meaningOverrides[word.word] || word.meaning || word.context_meaning}
</span>
```

修改后：
```jsx
{(() => {
  const ipa = ctx?.phonetic || word.ipa
  const morph = ctx?.morphology || word.morphology
  const meaning = ctx?.meaning || meaningOverrides[word.word] || word.meaning || word.context_meaning
  return (
    <>
      {ipa && (
        <span className={`text-[11px] text-ink-400 ipa-font shrink-0 ${vocabDisplayMode === 2 && !isExpanded ? 'invisible' : ''}`}>
          {ipa.startsWith('/') ? ipa : `/${ipa}/`}
        </span>
      )}
      {morph && (
        <span className="text-[10px] px-1.5 py-0.5 bg-parchment-100 text-ink-500 rounded font-medium tracking-wide shrink-0">
          {morph}
        </span>
      )}
      <span className={`text-[12px] text-ink-500 truncate ${vocabDisplayMode === 1 && !isExpanded ? 'invisible' : ''}`}>
        {meaning}
      </span>
    </>
  )
})()}
```

- [ ] **Step 2: 详情面板移除 ctx 覆盖与「本句上下文」标签**

定位 L1473-L1500 区域（展开详情面板的「释义」块）。移除 `ctx ?` 三元与 `ctx &&` 标签，始终显示全局释义。

修改前（L1475-L1500 区域，释义块）：
```jsx
<div className="mb-2">
  <h3 className="label-warm mb-0.5 flex items-center gap-1">
    <Brain className="w-3 h-3 text-amber-500" />
    {t.definition || '释义'}
    {ctx && (
      <span className="ml-1 text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded font-medium tracking-wide">
        {t.thisSentenceContext || '本句上下文'}
      </span>
    )}
  </h3>
  <p className="text-[13px] text-ink-700 leading-relaxed">
    {ctx ? (ctx.meaning || detail.enriched_meaning || detail.meaning || detail.context_meaning) : (detail.enriched_meaning || detail.meaning || detail.context_meaning)}
  </p>
  {ctx && (ctx.morphology || ctx.phonetic) && (
    <div className="flex items-center gap-2 mt-1 flex-wrap">
      ...（ctx.morphology / ctx.phonetic 展示）
    </div>
  )}
```

修改后（详情面板始终显示全局，移除整个 ctx 相关块）：
```jsx
<div className="mb-2">
  <h3 className="label-warm mb-0.5 flex items-center gap-1">
    <Brain className="w-3 h-3 text-amber-500" />
    {t.definition || '释义'}
  </h3>
  <p className="text-[13px] text-ink-700 leading-relaxed">
    {detail.enriched_meaning || detail.meaning || detail.context_meaning}
  </p>
```
（删除 `{ctx && (ctx.morphology || ctx.phonetic) && (...)}` 整块）

注意：`ctx` 变量定义（L1411）仍保留——条目行需要它。只是详情面板不再使用。

- [ ] **Step 3: 验证前端无语法错误**

```bash
cd /workspace/frontend && npx vite build 2>&1 | tail -20
```
Expected: 构建成功无报错

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/DictionaryStep.jsx
git commit -m "feat: 句子上下文释义从详情面板移到条目行替换"
```

---

## Task 6: 前端 stage 状态文案

**Files:**
- Modify: `frontend/src/components/DictionaryStep.jsx`（preprocessStatus 文案，L951 附近）

- [ ] **Step 1: 增加 segmenting/enriching 文案**

定位 L951 附近 `preprocessStatus === 'refilling' ? ...` 的三元链，增加对新 `stage` 字段的展示。`processing_status` 现含 `stage: 'segmenting'|'enriching'`。

确认 `LearningApp.jsx` 如何把 `stage` 传到 DictionaryStep（通过 preprocessStatus 或新 prop）。最简方案：在 `LearningApp.jsx` 读取 `status.stage`，映射为 preprocessStatus 值 `segmenting`/`enriching`，复用现有 preprocessStatus 机制。

在 `DictionaryStep.jsx` L951 三元链追加：
```jsx
preprocessStatus === 'segmenting' ? (t.segmentingWords || '分词中...') :
preprocessStatus === 'enriching' ? (t.generatingDict || '生成释义中...') :
preprocessStatus === 'refilling' ? (t.refillingWords || '补全漏词中...') :
```

在 `LearningApp.jsx` 状态读取处（约 L415 附近 `preprocess === 'refilling'` 分支）增加：
```jsx
} else if (status.stage === 'segmenting') {
  setPreprocessStatus('segmenting')
} else if (status.stage === 'enriching') {
  setPreprocessStatus('enriching')
}
```
（具体位置实施时按现有结构插入，保留 refilling 分支）

- [ ] **Step 2: 验证构建**

```bash
cd /workspace/frontend && npx vite build 2>&1 | tail -20
```
Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add frontend/src/components/DictionaryStep.jsx frontend/src/pages/LearningApp.jsx
git commit -m "feat: 两阶段 stage 状态文案（分词中/生成释义中）"
```

---

## Task 7: 端到端自检与清理

**Files:**
- 检查：`backend/utils/exercise_generators.py`、`frontend/src/components/DictionaryStep.jsx`

- [ ] **Step 1: 检查 `_LLMApiShim` / `process_translation` 是否仍被引用**

```bash
cd /workspace/backend && grep -rn "_LLMApiShim\|process_translation" --include="*.py" .
```
若仅 `exercise_generators.py` 内定义且已无调用方，保留（refill/retry 可能间接用到）——不删除，避免误伤。若确认无用再删。

- [ ] **Step 2: 启动后端冒烟测试**

```bash
cd /workspace/backend && python -c "
from utils.exercise_generators import (
    _gateway_stage1_segment, _gateway_stage2_enrich, _enforce_word_list,
    _build_vocab_from_results, _update_status_and_save,
    process_text_background, _finalize_pipeline, _fill_missing_words,
    refill_missing_words_background, retry_failed_sentences
)
print('all imports ok')
"
```
Expected: `all imports ok`

- [ ] **Step 3: 前端构建**

```bash
cd /workspace/frontend && npx vite build 2>&1 | tail -5
```
Expected: 构建成功

- [ ] **Step 4: 最终提交（如有清理改动）**

```bash
git add -A
git commit -m "chore: 两阶段处理自检与清理"
```

---

## 自检（Self-Review）

**Spec 覆盖：**
- ✅ 两阶段处理（Stage1 分词 / Stage2 强制词表充实）→ Task 1-4
- ✅ Stage1 后预先更新前端句子→单词链接和单词分表（仅词形）→ Task 3/4（vocab 词形-only 增量更新，前端 renderOriginalSentence 已支持）
- ✅ 每句固定为包含所有单词的 JSON（结构性 `_enforce_word_list`）→ Task 2
- ✅ 再生成现有内容（background_word_gen 不变）→ Task 4 末尾 `_finalize_pipeline` 仍启动 word_gen
- ✅ 句子点进单词：条目替换上下文释义，详情不变 → Task 5
- ✅ 提示词复用现有 → Task 1/2 均复刻现有分词原则/完整提示词

**风险点：**
- Stage1 分词失败时 `fixed_words` 为空 → Stage2 直接保留词形-only，validate 兜底空壳，不阻塞（Task 4 已处理）
- 旧条目（无 stage）走 refill → `_fill_missing_words` 保留，向后兼容（Task 4 Step 3 验证）
- `progress` 在两阶段分别从 0 重算 → 前端看 stage 文案区分，可接受

**类型一致性：** `results_dict` 始终为 `{idx: {"sentence", "source_lang", "translation_result"}}`，`_build_vocab_from_results` / `_update_status_and_save` / `_finalize_pipeline` 均按此结构读取，一致。
