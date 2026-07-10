# 两阶段句子处理实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把单次 LLM 句子处理拆成 Stage 1（纯分词）+ Stage 2（填充释义/翻译/语法），让前端更早可见单词链接与纯单词条目，并附带进度条百分比化和"从句子点单词替换条目行释义"两项前端改动。

**Architecture:** 后端在 `exercise_generators.py` 新增 `_gateway_segment_sentence`（Stage 1）和 `_gateway_fill_sentence`（Stage 2），改造 `process_text_background` 为两阶段串行、句子间并发。Stage 1 完成立即落库空壳 + 重建 vocab；Stage 2 完成回填字段 + 再次重建 vocab。删除补漏机制（`_fill_missing_words` 等）与 `/refill-missing-words` 端点。前端 `DictionaryStep.jsx` 改进度条为百分比、把句子上下文释义从展开区移到条目行。

**Tech Stack:** Python (FastAPI, asyncio), React (Vite, Tailwind, framer-motion), pytest

参考 spec：[docs/superpowers/specs/2026-07-10-two-stage-sentence-processing-design.md](file:///workspace/docs/superpowers/specs/2026-07-10-two-stage-sentence-processing-design.md)

---

## 文件结构

**后端修改：**
- `backend/utils/exercise_generators.py` — 新增 Stage 1/2 函数，改造 `process_text_background` 与 `retry_failed_sentences`，删除补漏函数
- `backend/utils/llm_gateway.py` — 新增 `segment_sentence` 到 `_SUB_BY_REQUEST_TYPE`（走 sentence pool）
- `backend/routers/text_processing.py` — 删除 `/refill-missing-words` 端点与 `refill_missing_words_background` 引用
- `backend/text_processor.py` — 新增 `parse_segmentation_output`（Stage 1 解析）与 `validate_segmentation`（校验）

**后端测试：**
- `backend/tests/test_stage1_segmentation.py` — Stage 1 解析与校验
- `backend/tests/test_stage2_backfill.py` — Stage 2 回填逻辑

**前端修改：**
- `frontend/src/components/DictionaryStep.jsx` — 进度条百分比、条目行上下文释义

---

### Task 1: Stage 1 解析与校验函数

**Files:**
- Modify: `backend/text_processor.py`（在 `TextProcessor` 类内新增方法）
- Test: `backend/tests/test_stage1_segmentation.py`

- [ ] **Step 1: 写失败测试**

Create `backend/tests/test_stage1_segmentation.py`:

```python
"""Stage 1 分词输出解析与校验。"""
import os
import sys
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import importlib
import config
importlib.reload(config)

from text_processor import TextProcessor


def test_parse_basic():
    tp = TextProcessor()
    output = "hi\nman\nhow\nare\nyou"
    assert tp.parse_segmentation_output(output) == ["hi", "man", "how", "are", "you"]


def test_parse_strips_punctuation():
    tp = TextProcessor()
    output = "1. hi\n2. man,\n\"you?\""
    assert tp.parse_segmentation_output(output) == ["hi", "man", "you"]


def test_parse_filters_empty_lines():
    tp = TextProcessor()
    output = "hi\n\n\nman\n"
    assert tp.parse_segmentation_output(output) == ["hi", "man"]


def test_parse_multiword_expression():
    tp = TextProcessor()
    output = "take\noff\ntake off"
    assert tp.parse_segmentation_output(output) == ["take", "off", "take off"]


def test_validate_matches_after_normalization():
    tp = TextProcessor()
    sentence = "Hi, man! How are you?"
    words = ["hi", "man", "how", "are", "you"]
    assert tp.validate_segmentation(sentence, words, "en") is True


def test_validate_mismatch_missing_word():
    tp = TextProcessor()
    sentence = "Hi man how are you"
    words = ["hi", "man", "are", "you"]  # missing "how"
    assert tp.validate_segmentation(sentence, words, "en") is False


def test_validate_mismatch_extra_word():
    tp = TextProcessor()
    sentence = "Hi man"
    words = ["hi", "man", "extra"]
    assert tp.validate_segmentation(sentence, words, "en") is False


def test_validate_no_space_language():
    """无空格语言（中文）按字符归一化比较。"""
    tp = TextProcessor()
    sentence = "你好世界"
    words = ["你", "好", "世", "界"]
    assert tp.validate_segmentation(sentence, words, "zh") is True


def test_validate_hyphen_internal():
    """词内部连字符保留，归一化时连字符不计入比较字符。"""
    tp = TextProcessor()
    sentence = "well-known fact"
    words = ["well-known", "fact"]
    assert tp.validate_segmentation(sentence, words, "en") is True
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /workspace/backend && python -m pytest tests/test_stage1_segmentation.py -v`
Expected: FAIL — `AttributeError: 'TextProcessor' object has no attribute 'parse_segmentation_output'`

- [ ] **Step 3: 实现解析与校验方法**

在 `backend/text_processor.py` 的 `TextProcessor` 类内（建议放在 `tokenize_sentence` 方法之后）新增：

```python
    def parse_segmentation_output(self, output: str) -> List[str]:
        """解析 Stage 1 LLM 输出（一行一词）。

        - 按 \\n 切分
        - 每行 strip()
        - 用 strip_edge_punctuation 去首尾标点（处理 LLM 可能附加的编号/引号/逗号等）
        - 过滤空行
        """
        if not output or not isinstance(output, str):
            return []
        words = []
        for line in output.split('\n'):
            cleaned = strip_edge_punctuation(line.strip())
            if cleaned:
                words.append(cleaned)
        return words

    def validate_segmentation(self, sentence: str, words: List[str], source_lang: str) -> bool:
        """校验分词结果是否覆盖原句（归一化比较，无 extract_words 兜底）。

        把 words 拼接后与原句同样归一化（去标点、去空格、小写）后比较。
        匹配返回 True，否则 False。
        """
        if not words:
            return False
        sentence_normalized = self._normalize_text_for_compare(sentence)
        words_normalized = self._normalize_text_for_compare(''.join(words))
        return sentence_normalized == words_normalized and bool(sentence_normalized)
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /workspace/backend && python -m pytest tests/test_stage1_segmentation.py -v`
Expected: PASS — 9 passed

- [ ] **Step 5: 提交**

```bash
cd /workspace
git add backend/text_processor.py backend/tests/test_stage1_segmentation.py
git commit -m "feat: Stage 1 分词解析与校验函数"
```

---

### Task 2: 注册 Stage 1 的 request_type

**Files:**
- Modify: `backend/utils/llm_gateway.py:361-372`

- [ ] **Step 1: 添加 segment_sentence 到 request_type 映射**

在 `backend/utils/llm_gateway.py` 的 `_SUB_BY_REQUEST_TYPE` 字典中，在 `"process_text": "sentence",` 行之后新增一行：

```python
        "segment_sentence": "sentence",
```

修改后的字典（完整上下文）：

```python
    _SUB_BY_REQUEST_TYPE = {
        "generate_title": "title",
        "detect_language": "title",
        "generate_multiple_choice": "word",
        "admin_vocab_refresh": "word",
        "process_text": "sentence",
        "segment_sentence": "sentence",
        "process_remaining_words": "sentence",
        "translate": "sentence",
        "generate": "sentence",
        "ui_translation": "sentence",
        "llm_call": "sentence",
    }
```

- [ ] **Step 2: 验证 import 无误**

Run: `cd /workspace/backend && python -c "from utils.llm_gateway import gateway; print('ok')"`
Expected: 输出 `ok`

- [ ] **Step 3: 提交**

```bash
cd /workspace
git add backend/utils/llm_gateway.py
git commit -m "feat: 注册 segment_sentence request_type"
```

---

### Task 3: Stage 1 LLM 调用函数

**Files:**
- Modify: `backend/utils/exercise_generators.py`（在 `_gateway_process_text_with_dictionary` 之前新增）
- Test: `backend/tests/test_stage2_backfill.py`（此 task 先建文件骨架，Task 4 填充回填测试）

- [ ] **Step 1: 实现 `_gateway_segment_sentence`**

在 `backend/utils/exercise_generators.py` 的 `_gateway_process_text_with_dictionary` 函数**之前**新增：

```python
async def _gateway_segment_sentence(user_id, tier, text, source_lang, context_sentences=None):
    """Stage 1：纯分词。LLM 输出一行一词，解析为 List[str]。

    无 tool call 开销，纯 content 解析。失败时返回空列表（调用方负责重试/兜底）。
    """
    source_lang_name = get_lang_name(source_lang)

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

    system_prompt = f"""处理以下 {source_lang_name} 文本。

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
- 多词表达在同一行内用空格分隔"""

    user_content = f"{context_section}\n【待处理文本】\n{text}" if context_section else f"【待处理文本】\n{text}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    response = await gateway.call(
        user_id, tier, messages,
        temperature=0.0,
        request_type="segment_sentence",
    )

    try:
        choice = response.get("choices", [{}])[0]
        content = choice.get("message", {}).get("content", "")
        if content:
            return text_processor.parse_segmentation_output(content)
    except Exception as e:
        print(f"[WARN] segment_sentence parse failed: {e}")
    return []
```

- [ ] **Step 2: 验证 import 无误**

Run: `cd /workspace/backend && python -c "from utils.exercise_generators import _gateway_segment_sentence; print('ok')"`
Expected: 输出 `ok`

- [ ] **Step 3: 提交**

```bash
cd /workspace
git add backend/utils/exercise_generators.py
git commit -m "feat: Stage 1 纯分词 LLM 调用"
```

---

### Task 4: Stage 2 回填逻辑

**Files:**
- Modify: `backend/text_processor.py`（新增 `backfill_stage2_result` 方法）
- Test: `backend/tests/test_stage2_backfill.py`

- [ ] **Step 1: 写失败测试**

Create `backend/tests/test_stage2_backfill.py`:

```python
"""Stage 2 回填逻辑：LLM 填充结果回写到 Stage 1 锁定的 translation 数组。"""
import os
import sys
import tempfile

_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import importlib
import config
importlib.reload(config)

from text_processor import TextProcessor


def test_backfill_basic():
    """LLM 正常返回，按位置回填字段，text 不变。"""
    tp = TextProcessor()
    stage1_words = ["hi", "man"]
    llm_result = {
        "translation": [
            {"text": "hi", "phonetic": "/haɪ/", "morphology": "interj", "meaning": "你好"},
            {"text": "man", "phonetic": "/mæn/", "morphology": "n", "meaning": "男人"},
        ],
        "tokenized_translation": "你好，男人",
        "grammar_explanation": "问候语",
        "translation_phrases": ["你好", "男人"],
        "redundant_tokens": ["女人", "小孩"],
    }
    result = tp.backfill_stage2_result(stage1_words, llm_result)
    assert result["translation"][0]["text"] == "hi"
    assert result["translation"][0]["phonetic"] == "/haɪ/"
    assert result["translation"][1]["text"] == "man"
    assert result["translation"][1]["meaning"] == "男人"
    assert result["tokenized_translation"] == "你好，男人"
    assert result["grammar_explanation"] == "问候语"


def test_backfill_ignores_llm_text_changes():
    """LLM 改了 text，仍以 Stage 1 为准。"""
    tp = TextProcessor()
    stage1_words = ["hi", "man"]
    llm_result = {
        "translation": [
            {"text": "HI", "phonetic": "/haɪ/", "morphology": "interj", "meaning": "你好"},
            {"text": "MAN", "phonetic": "/mæn/", "morphology": "n", "meaning": "男人"},
        ],
        "tokenized_translation": "你好，男人",
        "grammar_explanation": "",
        "translation_phrases": [],
        "redundant_tokens": [],
    }
    result = tp.backfill_stage2_result(stage1_words, llm_result)
    assert result["translation"][0]["text"] == "hi"
    assert result["translation"][1]["text"] == "man"


def test_backfill_length_mismatch_positional():
    """LLM 返回数组长度不符，按位置回填，多出的词保留空壳。"""
    tp = TextProcessor()
    stage1_words = ["hi", "man", "yo"]
    llm_result = {
        "translation": [
            {"text": "hi", "phonetic": "/haɪ/", "morphology": "interj", "meaning": "你好"},
            {"text": "man", "phonetic": "/mæn/", "morphology": "n", "meaning": "男人"},
        ],
        "tokenized_translation": "你好，男人",
        "grammar_explanation": "",
        "translation_phrases": [],
        "redundant_tokens": [],
    }
    result = tp.backfill_stage2_result(stage1_words, llm_result)
    assert len(result["translation"]) == 3
    assert result["translation"][2]["text"] == "yo"
    assert result["translation"][2]["phonetic"] == ""
    assert result["translation"][2]["meaning"] == ""


def test_backfill_empty_llm_result():
    """LLM 返回空，保留 Stage 1 空壳 + 其它字段空。"""
    tp = TextProcessor()
    stage1_words = ["hi", "man"]
    result = tp.backfill_stage2_result(stage1_words, {})
    assert len(result["translation"]) == 2
    assert result["translation"][0] == {"text": "hi", "phonetic": "", "morphology": "", "meaning": ""}
    assert result["tokenized_translation"] == ""
    assert result["grammar_explanation"] == ""


def test_backfill_preserves_other_fields():
    """translation_phrases / redundant_tokens 直接覆盖。"""
    tp = TextProcessor()
    stage1_words = ["hi"]
    llm_result = {
        "translation": [
            {"text": "hi", "phonetic": "/haɪ/", "morphology": "interj", "meaning": "你好"},
        ],
        "translation_phrases": ["你好", "啊"],
        "redundant_tokens": ["再见", "嘿"],
        "tokenized_translation": "你好",
        "grammar_explanation": "问候",
    }
    result = tp.backfill_stage2_result(stage1_words, llm_result)
    assert result["translation_phrases"] == ["你好", "啊"]
    assert result["redundant_tokens"] == ["再见", "嘿"]
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /workspace/backend && python -m pytest tests/test_stage2_backfill.py -v`
Expected: FAIL — `AttributeError: 'TextProcessor' object has no attribute 'backfill_stage2_result'`

- [ ] **Step 3: 实现回填方法**

在 `backend/text_processor.py` 的 `TextProcessor` 类内（紧接 `validate_segmentation` 之后）新增：

```python
    def backfill_stage2_result(self, stage1_words: List[str], llm_result: dict) -> dict:
        """把 Stage 2 LLM 结果回填到 Stage 1 锁定的 translation 数组。

        - text 始终以 Stage 1 为准（防止 LLM 偷改边界）
        - phonetic/morphology/meaning 按位置回填
        - 若 LLM 返回数组短于 Stage 1，多出的词保留空壳
        - tokenized_translation/grammar_explanation/translation_phrases/redundant_tokens 直接覆盖
        """
        llm_translation = []
        if isinstance(llm_result, dict):
            t = llm_result.get("translation", [])
            if isinstance(t, list):
                llm_translation = t

        translation = []
        for i, word in enumerate(stage1_words):
            entry = {"text": word, "phonetic": "", "morphology": "", "meaning": ""}
            if i < len(llm_translation) and isinstance(llm_translation[i], dict):
                src = llm_translation[i]
                for field in ("phonetic", "morphology", "meaning"):
                    val = src.get(field, "")
                    if val:
                        entry[field] = val
            translation.append(entry)

        return {
            "translation": translation,
            "tokenized_translation": (llm_result or {}).get("tokenized_translation", "") if isinstance(llm_result, dict) else "",
            "grammar_explanation": (llm_result or {}).get("grammar_explanation", "") if isinstance(llm_result, dict) else "",
            "translation_phrases": (llm_result or {}).get("translation_phrases", []) if isinstance(llm_result, dict) else [],
            "redundant_tokens": (llm_result or {}).get("redundant_tokens", []) if isinstance(llm_result, dict) else [],
        }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `cd /workspace/backend && python -m pytest tests/test_stage2_backfill.py -v`
Expected: PASS — 5 passed

- [ ] **Step 5: 提交**

```bash
cd /workspace
git add backend/text_processor.py backend/tests/test_stage2_backfill.py
git commit -m "feat: Stage 2 回填逻辑"
```

---

### Task 5: Stage 2 LLM 调用函数

**Files:**
- Modify: `backend/utils/exercise_generators.py`（在 `_gateway_segment_sentence` 之后新增）

- [ ] **Step 1: 实现 `_gateway_fill_sentence`**

在 `backend/utils/exercise_generators.py` 的 `_gateway_segment_sentence` 函数**之后**新增：

```python
async def _gateway_fill_sentence(user_id, tier, text, source_lang, target_lang, stage1_words, context_sentences=None):
    """Stage 2：填充。用 Stage 1 的词构造固定 JSON 模板，LLM 只填充空字段。

    tool schema 复用 _gateway_process_text_with_dictionary 的定义。
    返回 LLM 原始结果 dict（调用方用 text_processor.backfill_stage2_result 回填）。
    """
    source_lang_name = get_lang_name(source_lang)
    target_lang_name = get_lang_name(target_lang)

    tools = [{
        "type": "function",
        "function": {
            "name": "process_text_with_dictionary",
            "description": "填充已给定模板的空字段",
            "parameters": {
                "type": "object",
                "properties": {
                    "original": {"type": "string", "description": "原文文本"},
                    "translation": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "text": {"type": "string", "description": "已锁定的词，不得修改"},
                                "phonetic": {"type": "string", "description": "发音标注"},
                                "morphology": {"type": "string", "description": "词性缩写"},
                                "meaning": {"type": "string", "description": "上下文释义"},
                            },
                            "required": ["text", "phonetic", "morphology", "meaning"],
                        },
                    },
                    "tokenized_translation": {"type": "string", "description": "完整自然翻译"},
                    "translation_phrases": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "分词结果，至少2个片段",
                    },
                    "grammar_explanation": {"type": "string", "description": "语法解释"},
                    "redundant_tokens": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "4个冗余词",
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

    # 构造预填模板——Stage 1 的词硬编码进 translation 数组
    import json as _json
    template_entries = ",\n  ".join(
        _json.dumps({"text": w, "phonetic": "", "morphology": "", "meaning": ""}, ensure_ascii=False)
        for w in stage1_words
    )
    template_str = f"[\n  {template_entries}\n]"

    system_prompt = f"""处理以下 {source_lang_name} 文本，并翻译成 {target_lang_name}。

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

【极其重要·禁止空白字段】translation 数组中每个条目的 phonetic、morphology、meaning 字段都必须有实际内容，绝对不能留空！"""

    user_content = f"""{context_section}
【待处理文本】
{text}

【translation 数组预填模板·必须严格遵循】
{template_str}"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    response = await gateway.call(
        user_id, tier, messages,
        temperature=0.0,
        request_type="process_text", tools=tools,
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
        print(f"[WARN] fill_sentence tool call parse failed: {e}")
    return {}
```

- [ ] **Step 2: 验证 import 无误**

Run: `cd /workspace/backend && python -c "from utils.exercise_generators import _gateway_fill_sentence; print('ok')"`
Expected: 输出 `ok`

- [ ] **Step 3: 提交**

```bash
cd /workspace
git add backend/utils/exercise_generators.py
git commit -m "feat: Stage 2 填充 LLM 调用"
```

---

### Task 6: 改造 process_text_background 为两阶段

**Files:**
- Modify: `backend/utils/exercise_generators.py`（`process_text_background` 函数，约 L828-L1063）

- [ ] **Step 1: 替换 `_process_single_sentence_impl` 为两阶段**

在 `backend/utils/exercise_generators.py` 的 `process_text_background` 函数内，找到 `_process_single_sentence_impl` 内部函数（约 L867-L917），整体替换为两阶段实现：

```python
        async def _process_single_sentence_impl(idx, sentence):

            before_indices = [i for i in range(max(0, idx - 2), idx)]
            after_indices = [i for i in range(idx + 1, min(len(sentences), idx + 3))]
            before_sentences = [sentences[i] for i in before_indices if sentences[i].strip()]
            after_sentences = [sentences[i] for i in after_indices if sentences[i].strip()]
            context_sentences = {"before": before_sentences, "after": after_sentences} if (before_sentences or after_sentences) else None

            t_sentence_start = time.time()

            # ── Stage 1：纯分词 ──
            t_seg_start = time.time()
            print(f"[DEBUG] 句子 {idx+1}/{total_sentences} Stage 1 分词: {repr(sentence)}")
            stage1_words = await _gateway_segment_sentence(
                user_id, tier, sentence, source_lang, context_sentences
            )
            # 校验 + 重试一次
            if not text_processor.validate_segmentation(sentence, stage1_words, source_lang):
                print(f"[DEBUG] 句子 {idx+1} Stage 1 校验失败，重试一次")
                stage1_words = await _gateway_segment_sentence(
                    user_id, tier, sentence, source_lang, context_sentences
                )
                if not text_processor.validate_segmentation(sentence, stage1_words, source_lang):
                    print(f"[WARN] 句子 {idx+1} Stage 1 仍不匹配，best-effort 落库: {stage1_words}")
            t_seg_end = time.time()
            print(f"[TIMING] 句子 {idx+1} Stage 1 分词: {t_seg_end - t_seg_start:.3f}s, 词数: {len(stage1_words)}")

            # Stage 1 完成 → 立即落库空壳 + 重建 vocab（让前端看到单词链接与纯单词条目）
            if stage1_words:
                shell_translation = {
                    "translation": [
                        {"text": w, "phonetic": "", "morphology": "", "meaning": ""}
                        for w in stage1_words
                    ],
                    "tokenized_translation": "",
                    "grammar_explanation": "",
                    "translation_phrases": [],
                    "redundant_tokens": [],
                }
                stage1_data = {
                    "sentence": sentence,
                    "source_lang": source_lang,
                    "translation_result": shell_translation,
                }
                results_dict[idx] = stage1_data
                completed_stage1.add(idx)
                _persist_partial_and_update_status(
                    file_id, results_dict, sentences, total_sentences,
                    completed_stage2, stage2_count, source_lang, _preserve_base
                )

            # ── Stage 2：填充 ──
            t_fill_start = time.time()
            print(f"[DEBUG] 句子 {idx+1} Stage 2 填充")
            llm_result = await _gateway_fill_sentence(
                user_id, tier, sentence, source_lang, target_lang, stage1_words, context_sentences
            )
            # 关键字段为空 → 重试一次
            if not (isinstance(llm_result, dict) and llm_result.get("tokenized_translation")):
                print(f"[DEBUG] 句子 {idx+1} Stage 2 关键字段为空，重试一次")
                llm_result = await _gateway_fill_sentence(
                    user_id, tier, sentence, source_lang, target_lang, stage1_words, context_sentences
                )
            t_fill_end = time.time()
            print(f"[TIMING] 句子 {idx+1} Stage 2 填充: {t_fill_end - t_fill_start:.3f}s")

            # 回填（text 以 Stage 1 为准）
            translation_result = text_processor.backfill_stage2_result(stage1_words, llm_result)
            translation_result = text_processor.validate_and_complete_translation(
                sentence, translation_result, source_lang
            )

            sentence_data = {
                "sentence": sentence,
                "source_lang": source_lang,
                "translation_result": translation_result,
            }
            t_sentence_end = time.time()
            print(f"[TIMING] 句子 {idx+1} 总耗时: {t_sentence_end - t_sentence_start:.3f}s")
            return idx, sentence_data, True  # 第三个元素标记 Stage 2 完成
```

- [ ] **Step 2: 新增 `_persist_partial_and_update_status` 辅助函数**

在 `process_text_background` 函数**之前**新增：

```python
def _persist_partial_and_update_status(file_id, results_dict, sentences, total_sentences,
                                        completed_stage2, stage2_count, source_lang, preserve_base):
    """增量存 pipeline_data + 重建 vocab + 更新 processing_status。

    供 Stage 1 完成和 Stage 2 完成两个时点复用，让前端渐变可见。
    """
    # 构建 pipeline（未处理的句子保留空 translation_result）
    incremental_pipeline = []
    for si in range(total_sentences):
        if si in results_dict:
            incremental_pipeline.append(results_dict[si])
        else:
            incremental_pipeline.append({"sentence": sentences[si], "translation_result": {}})
    storage.save_pipeline_data(file_id, incremental_pipeline)

    # 重建 vocab（从所有已处理句子提取，空壳也含 text，Stage 2 完成的带释义）
    all_vocab = _extract_vocab_from_sentences(incremental_pipeline, source_lang)

    # 进度按 Stage 2 完成数计
    progress = int(stage2_count / total_sentences * 100) if total_sentences > 0 else 0
    processing_status[file_id] = {
        "status": "processing",
        "progress": progress,
        "current_sentence": stage2_count,
        "total_sentences": total_sentences,
        "vocab": all_vocab,
        "sentence_translations": incremental_pipeline,
        **preserve_base,
    }
```

- [ ] **Step 3: 改造 `process_single_sentence` 与主循环**

在 `process_text_background` 内，找到 `process_single_sentence` 和 `for coro in asyncio.as_completed(tasks)` 循环（约 L855-L984），整体替换为：

```python
        completed_stage1 = set()
        completed_stage2 = set()
        stage2_count = 0
        _preserve_base = {k: processing_status[file_id][k] for k in ("original_text", "title") if k in processing_status[file_id]}

        async def process_single_sentence(idx, sentence):
            """处理单句（两阶段）。失败时返回失败哨兵。"""
            if not sentence.strip():
                return idx, None, False
            try:
                return await _process_single_sentence_impl(idx, sentence)
            except Exception as e:
                import traceback as _tb
                print(f"[ERROR] 句子 {idx+1} 处理失败，将标记为待重试: {e}")
                _tb.print_exc()
                return idx, {"__failed__": True, "sentence": sentence, "error": str(e)}, False

        tasks = [asyncio.create_task(process_single_sentence(i, s)) for i, s in enumerate(sentences)]

        for coro in asyncio.as_completed(tasks):
            idx, sentence_data, stage2_done = await coro
            if sentence_data is not None and not (isinstance(sentence_data, dict) and sentence_data.get("__failed__")):
                results_dict[idx] = sentence_data
                if stage2_done:
                    completed_stage2.add(idx)
                    stage2_count = len(completed_stage2)
                    _persist_partial_and_update_status(
                        file_id, results_dict, sentences, total_sentences,
                        completed_stage2, stage2_count, source_lang, _preserve_base
                    )
                    print(f"[DEBUG] 更新状态: 进度 {int(stage2_count / total_sentences * 100)}%, Stage 2 完成 {stage2_count}/{total_sentences}")
```

- [ ] **Step 4: 验证语法无误**

Run: `cd /workspace/backend && python -c "from utils.exercise_generators import process_text_background; print('ok')"`
Expected: 输出 `ok`

- [ ] **Step 5: 提交**

```bash
cd /workspace
git add backend/utils/exercise_generators.py
git commit -m "feat: process_text_background 改造为两阶段"
```

---

### Task 7: 删除补漏机制

**Files:**
- Modify: `backend/utils/exercise_generators.py` — 删除 `_fill_missing_words`、`_gateway_process_remaining_words`、`_detect_missing_and_bold`、`refill_missing_words_background`
- Modify: `backend/routers/text_processing.py` — 删除 `/refill-missing-words` 端点与相关 import

- [ ] **Step 1: 删除 exercise_generators.py 中的补漏函数**

在 `backend/utils/exercise_generators.py` 中删除以下函数（完整删除，不留桩）：
- `_detect_missing_and_bold`（约 L397-L456）
- `_fill_missing_words`（约 L459-L502）
- `_gateway_process_remaining_words`（约 L310-L394）
- `refill_missing_words_background`（约 L570-L645）

同时删除文件顶部 import 中对已删函数的引用（若有）。检查 `from utils.exercise_generators import` 的引用处（`text_processing.py` L15）。

- [ ] **Step 2: 删除 text_processing.py 中的端点与 import**

在 `backend/routers/text_processing.py` 中：
1. 修改 L15 的 import，移除 `refill_missing_words_background` 和 `_detect_missing_and_bold`：

```python
from utils.exercise_generators import process_text_background, generate_title, retry_failed_sentences
```

2. 删除 `refill_missing_words` 端点函数（约 L358-L401，整个 `@router.post("/process-text/{file_id}/refill-missing-words")` 路由）

- [ ] **Step 3: 检查是否有其它引用**

Run: `cd /workspace/backend && grep -rn "refill_missing_words_background\|_fill_missing_words\|_detect_missing_and_bold\|_gateway_process_remaining_words\|refill-missing-words" --include="*.py"`
Expected: 无输出（或仅注释/文档中的提及）

- [ ] **Step 4: 验证 import 无误**

Run: `cd /workspace/backend && python -c "from routers import text_processing; print('ok')"`
Expected: 输出 `ok`

- [ ] **Step 5: 提交**

```bash
cd /workspace
git add backend/utils/exercise_generators.py backend/routers/text_processing.py
git commit -m "refactor: 删除补漏机制（两阶段锁定词边界后不再需要）"
```

---

### Task 8: 改造 retry_failed_sentences 为两阶段

**Files:**
- Modify: `backend/utils/exercise_generators.py`（`retry_failed_sentences` 函数内 `_retry_one`，约 L750-L763）

- [ ] **Step 1: 替换 `_retry_one` 为两阶段**

在 `retry_failed_sentences` 函数内，找到 `_retry_one` 内部函数（约 L750-L763），替换为：

```python
        async def _retry_one(idx, sentence):
            before_indices = [i for i in range(max(0, idx - 2), idx)]
            after_indices = [i for i in range(idx + 1, min(len(sentences), idx + 3))]
            before_sentences = [sentences[i] for i in before_indices if sentences[i].strip()]
            after_sentences = [sentences[i] for i in after_indices if sentences[i].strip()]
            context_sentences = {"before": before_sentences, "after": after_sentences} if (before_sentences or after_sentences) else None

            # Stage 1
            stage1_words = await _gateway_segment_sentence(
                user_id, tier, sentence, source_lang, context_sentences
            )
            if not text_processor.validate_segmentation(sentence, stage1_words, source_lang):
                stage1_words = await _gateway_segment_sentence(
                    user_id, tier, sentence, source_lang, context_sentences
                )

            # Stage 2
            llm_result = await _gateway_fill_sentence(
                user_id, tier, sentence, source_lang, target_lang, stage1_words, context_sentences
            )
            if not (isinstance(llm_result, dict) and llm_result.get("tokenized_translation")):
                llm_result = await _gateway_fill_sentence(
                    user_id, tier, sentence, source_lang, target_lang, stage1_words, context_sentences
                )

            sentence_translation_result = text_processor.backfill_stage2_result(stage1_words, llm_result)
            sentence_translation_result = text_processor.validate_and_complete_translation(
                sentence, sentence_translation_result, source_lang
            )
            return {"sentence": sentence, "translation_result": sentence_translation_result}
```

- [ ] **Step 2: 验证语法无误**

Run: `cd /workspace/backend && python -c "from utils.exercise_generators import retry_failed_sentences; print('ok')"`
Expected: 输出 `ok`

- [ ] **Step 3: 提交**

```bash
cd /workspace
git add backend/utils/exercise_generators.py
git commit -m "feat: retry_failed_sentences 改造为两阶段"
```

---

### Task 9: 前端进度条改百分比

**Files:**
- Modify: `frontend/src/components/DictionaryStep.jsx`（`renderProgress` 函数，约 L934-L992）

- [ ] **Step 1: 改句子处理进度的数字文案**

在 `frontend/src/components/DictionaryStep.jsx` 的 `renderProgress` 函数中，找到句子处理进度分支（约 L955-L971），把：

```jsx
            <span className="text-[10px] text-ink-400 tabular-nums whitespace-nowrap">
              {safeProcessingInfo.current}/{safeProcessingInfo.total}
            </span>
```

改为：

```jsx
            <span className="text-[10px] text-ink-400 tabular-nums whitespace-nowrap">
              {Math.round(safeProcessingInfo.current / safeProcessingInfo.total * 100)}%
            </span>
```

- [ ] **Step 2: 改单词详情生成进度的数字文案**

在同一函数的 wordGenProgress 分支（约 L972-L989），把：

```jsx
            <span className="text-[10px] text-amber-500 tabular-nums whitespace-nowrap">
              {wordGenProgress.completed}/{wordGenProgress.total}
            </span>
```

改为：

```jsx
            <span className="text-[10px] text-amber-500 tabular-nums whitespace-nowrap">
              {Math.round(wordGenProgress.completed / wordGenProgress.total * 100)}%
            </span>
```

- [ ] **Step 3: 提交**

```bash
cd /workspace
git add frontend/src/components/DictionaryStep.jsx
git commit -m "feat: 进度条改百分比"
```

---

### Task 10: 前端条目行上下文释义

**Files:**
- Modify: `frontend/src/components/DictionaryStep.jsx`（单词分表条目行渲染，约 L1405-L1516）

- [ ] **Step 1: 条目行用上下文值替换释义/词性/音标**

在 `frontend/src/components/DictionaryStep.jsx` 的单词分表渲染区（非全局词表，约 L1405-L1516），找到条目渲染的 `words.map` 块。当前已有 `const ctx = ...`（约 L1411）。在 `ctx` 定义之后，计算显示值：

找到这段（约 L1410-L1412）：

```jsx
                        // ponytail: 若是从句子点击进来的，用该句 token 的释义/词性/音标覆盖全局释义。
                        const ctx = (activeSentenceContext && activeSentenceContext.wordKey === wordKey) ? activeSentenceContext : null

                        return (
```

替换为：

```jsx
                        // 两阶段：若是从句子点击进来的，用该句 token 的释义/词性/音标覆盖条目行展示。
                        // 详情区（WordDetail）不受影响，始终用全局 detail。
                        const ctx = (activeSentenceContext && activeSentenceContext.wordKey === wordKey) ? activeSentenceContext : null
                        const displayMeaning = ctx ? (ctx.meaning || meaningOverrides[word.word] || word.meaning || word.context_meaning) : (meaningOverrides[word.word] || word.meaning || word.context_meaning)
                        const displayMorphology = ctx ? (ctx.morphology || word.morphology) : word.morphology
                        const displayIpa = ctx ? (ctx.phonetic || word.ipa) : word.ipa

                        return (
```

- [ ] **Step 2: 条目行渲染处用 display* 变量**

在同一个 `words.map` 内，找到三个渲染处（约 L1428-L1443），把 `word.ipa` → `displayIpa`，`word.morphology` → `displayMorphology`，释义处的 `meaningOverrides[word.word] || word.meaning || word.context_meaning` → `displayMeaning`：

原 ipa（约 L1431-L1435）：

```jsx
                                {word.ipa && (
                                  <span className={`text-[11px] text-ink-400 ipa-font shrink-0 ${vocabDisplayMode === 2 && !isExpanded ? 'invisible' : ''}`}>
                                    {word.ipa.startsWith('/') ? word.ipa : `/${word.ipa}/`}
                                  </span>
                                )}
```

改为：

```jsx
                                {displayIpa && (
                                  <span className={`text-[11px] text-ink-400 ipa-font shrink-0 ${vocabDisplayMode === 2 && !isExpanded ? 'invisible' : ''}`}>
                                    {displayIpa.startsWith('/') ? displayIpa : `/${displayIpa}/`}
                                  </span>
                                )}
```

原 morphology（约 L1436-L1440）：

```jsx
                                {word.morphology && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-parchment-100 text-ink-500 rounded font-medium tracking-wide shrink-0">
                                    {word.morphology}
                                  </span>
                                )}
```

改为：

```jsx
                                {displayMorphology && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-parchment-100 text-ink-500 rounded font-medium tracking-wide shrink-0">
                                    {displayMorphology}
                                  </span>
                                )}
```

原释义（约 L1441-L1443）：

```jsx
                                <span className={`text-[12px] text-ink-500 truncate ${vocabDisplayMode === 1 && !isExpanded ? 'invisible' : ''}`}>
                                  {meaningOverrides[word.word] || word.meaning || word.context_meaning}
                                </span>
```

改为：

```jsx
                                <span className={`text-[12px] text-ink-500 truncate ${vocabDisplayMode === 1 && !isExpanded ? 'invisible' : ''}`}>
                                  {displayMeaning}
                                </span>
```

- [ ] **Step 3: 简化展开区释义（不再重复上下文覆盖）**

展开区当前在释义处用 `ctx` 覆盖（约 L1479-L1498）。改为：释义直接用 `detail` 全局值，不再用 `ctx`；保留"本句上下文"小标签作为视觉提示（因为条目行已展示上下文值）。

找到展开区释义块（约 L1479-L1498）：

```jsx
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
                                                {ctx.morphology && (
                                                  <span className="text-[10px] px-1.5 py-0.5 bg-parchment-100 text-ink-500 rounded font-medium tracking-wide">{ctx.morphology}</span>
                                                )}
                                                {ctx.phonetic && (
                                                  <span className="text-[11px] text-ink-400 ipa-font">{ctx.phonetic.startsWith('/') ? ctx.phonetic : `/${ctx.phonetic}/`}</span>
                                                )}
                                              </div>
                                            )}
```

改为：

```jsx
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
                                              {detail.enriched_meaning || detail.meaning || detail.context_meaning}
                                            </p>
```

（删除展开区里 `ctx.morphology`/`ctx.phonetic` 的额外展示块——这些已在条目行展示）

- [ ] **Step 4: 验证前端构建**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功无报错

- [ ] **Step 5: 提交**

```bash
cd /workspace
git add frontend/src/components/DictionaryStep.jsx
git commit -m "feat: 从句子点单词替换条目行释义（详情不变）"
```

---

### Task 11: 删除 process_translation 中已废弃的补漏调用

**Files:**
- Modify: `backend/text_processor.py`（`process_translation` 方法，约 L459-L482）

- [ ] **Step 1: 检查 process_translation 是否仍被调用**

Run: `cd /workspace/backend && grep -rn "process_translation" --include="*.py"`
Expected: 仅 `text_processor.py` 定义处 + `exercise_generators.py` 的 `_LLMApiShim` 委托处

- [ ] **Step 2: 保留 process_translation（_LLMApiShim 仍引用，但不走补漏）**

`process_translation` 方法本身不删（`_LLMApiShim` 仍引用它作为旧接口兼容），但其内部的"只过滤纯标点 token"逻辑已是单次处理，无补漏调用——无需改动。确认 L459-L482 无 `_fill_missing_words` 调用即可。

Run: `cd /workspace/backend && grep -n "_fill_missing_words\|_detect_missing" text_processor.py`
Expected: 无输出

- [ ] **Step 3: 提交（如有改动）**

若 Step 2 确认无需改动，跳过提交。若发现遗留引用则清理后提交：

```bash
cd /workspace
git add backend/text_processor.py
git commit -m "refactor: 清理 process_translation 遗留补漏引用"
```

---

### Task 12: 端到端验证

**Files:**
- 无文件改动，仅验证

- [ ] **Step 1: 运行全部后端测试**

Run: `cd /workspace/backend && python -m pytest tests/ -v`
Expected: 全部 PASS

- [ ] **Step 2: 启动后端确认无启动错误**

Run: `cd /workspace/backend && timeout 5 python -c "import main; print('startup ok')" || true`
Expected: 输出 `startup ok`（timeout 仅防止 server 阻塞）

- [ ] **Step 3: 前端构建确认**

Run: `cd /workspace/frontend && npm run build`
Expected: 构建成功

- [ ] **Step 4: 人工验证清单（如可启动服务）**

- [ ] 输入一段英文文本，观察：Stage 1 完成后句子原文单词可点、单词分表显示纯单词
- [ ] Stage 2 完成后单词分表条目出现释义/词性/音标
- [ ] 进度条显示百分比（如 `40%`）而非 `4/10`
- [ ] 从句子点单词后，条目行的释义/词性/音标变为该句上下文值；展开区详情不变
- [ ] 直接点单词分表条目，条目行回退全局释义

---

## Self-Review

**Spec coverage:**
- Stage 1 纯分词 → Task 1（解析校验）、Task 3（LLM 调用）
- Stage 2 填充 → Task 4（回填）、Task 5（LLM 调用）
- 两阶段编排 → Task 6（process_text_background）、Task 8（retry_failed_sentences）
- 删除补漏 → Task 7、Task 11
- 进度条百分比 → Task 9
- 条目行上下文释义 → Task 10
- 不使用 extract_words 兜底 → Task 1 校验逻辑 + Task 6 best-effort 落库
- request_type 注册 → Task 2
- 无遗漏

**Placeholder scan:** 无 TBD/TODO，每步含完整代码。

**Type consistency:** `parse_segmentation_output` / `validate_segmentation` / `backfill_stage2_result` 在 Task 1/4 定义，Task 3/5/6/8 调用，签名一致。`_gateway_segment_sentence` / `_gateway_fill_sentence` 在 Task 3/5 定义，Task 6/8 调用，参数一致。`_persist_partial_and_update_status` 在 Task 6 定义并调用，参数一致。
