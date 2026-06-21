"""后台处理与练习生成相关函数。"""

import re
import json
import random
import asyncio
import time

from llm_api import get_lang_name
from text_processor import TextProcessor, BACKUP_VOCAB, BACKUP_VOCAB_BY_LANG, is_punctuation_only, is_source_lang_text, strip_edge_punctuation, NO_SPACE_LANGUAGES
from utils.llm_gateway import gateway
from utils.state import text_processor, storage, processing_status, word_gen_state
from vocab import global_vocab, user_vocab
from utils.helpers import (
    RateLimiter, vocab_sort_key, is_speaker_label, is_punctuation_only as _is_punct,
    get_translation_phrases, split_translation_to_phrases, select_key_tokens,
    fix_llm_options_result, get_fallback_options, get_listening_correct_words,
    get_listening_distractors_from_sentences, filter_eligible_sentences,
    find_item_in_plan, get_unit_flat_range, _is_word_item_learned,
    get_filtered_unit_total, get_filtered_step_in_unit, find_next_non_learned_position,
    MAX_SENTENCE_WORDS_FOR_QUIZ, ZH_FUNCTION_WORDS,
)


class _LLMApiShim:
    """兼容旧 text_processor.process_translation(llm_api) 签名的适配器。"""
    def __init__(self, user_id: str, tier: str):
        self._user_id = user_id
        self._tier = tier

    async def process_text_with_dictionary(self, text, source_lang, target_lang, context_sentences=None):
        return await _gateway_process_text_with_dictionary(
            self._user_id, self._tier, text, source_lang, target_lang, context_sentences
        )


async def _gateway_process_text_with_dictionary(user_id, tier, text, source_lang, target_lang, context_sentences=None):
    """通过 gateway.call() 实现文本翻译+词典生成（tool call 模式）。"""
    source_lang_name = get_lang_name(source_lang)
    target_lang_name = get_lang_name(target_lang)

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
                                "text": {"type": "string", "description": "A single word or fixed multi-word expression from the source text. MUST NOT contain any punctuation marks (periods, commas, question marks, exclamation marks, colons, semicolons, or any language-specific punctuation). Punctuation does NOT belong to any token — it is completely discarded. Hyphens(-) and apostrophes(') must be preserved if they are internal parts of a word in that language. TOKENIZATION PRINCIPLE: Follow the natural word boundaries of the source language."},
                                "phonetic": {"type": "string", "description": "Pronunciation of this word. Use the most commonly used and widely recognized pronunciation notation for the source language — this may be IPA, pinyin, romaji, or any other standard system that native speakers and learners would expect. For tonal languages, include tone information."},
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
                        "description": "将 tokenized_translation 按目标语言的词（token）进行分词后的结果，用于翻译排序练习。必须至少拆分为2个片段",
                    },
                    "grammar_explanation": {"type": "string", "description": "整个文本的一个完整语法解释，用 TARGET_LANG"},
                    "redundant_tokens": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "4个与原文相关的合理冗余tokens，用于测验目的，必须全部使用TARGET_LANG。每个冗余token必须是单个独立的词",
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

    system_prompt = f"""处理以下 {source_lang_name} 文本，并翻译成 {target_lang_name}。

【非常非常重要的说明！！！】
1. 所有翻译和解释都必须使用 {target_lang_name}（目标语言）。
2. 不要单独给每个词语法解释 - 只给整个句子一个完整的语法解释。
3. 词性标注（morphology）只能使用以下缩写，不要加其他文字：
   - n (名词), v (动词), adj (形容词), adv (副词), pron (代词), prep (介词), conj (连词), interj (感叹词), det (限定词)
4. morphology 字段必须只包含缩写，不要有其他内容！
5. 【输出约束】除了工具调用的JSON输出外，不要添加任何其他文本、解释或说明。直接生成工具调用所需的JSON参数即可。

═══════════════════════════════════════════════════════════
【最最最重要！！！translation 数组的分词原则！！！】
═══════════════════════════════════════════════════════════

translation 数组中每个条目的 text 字段代表原文中的一个"词"。

【核心原则：遵循源语言的自然词边界】
你是一个语言专家，你精通所有语言的正字法和语法规则。请根据 {source_lang_name} 自身的语言规则来判断什么是"一个词"，而不是套用其他语言的分词标准。

【什么是一个"词"？】
一个"词"是原文中连续出现的、在该语言的词典中可以查到的最小意义单位。
判断标准：这个形式能否作为独立条目出现在该语言的词典中？

【关键规则】
1. 遵循该语言的正字法惯例
2. 变位/屈折形式是单个词：不要将变位形式拆分为词干+词缀
3. 尊重该语言的自然词边界
4. 【极其重要·固定搭配与多词表达】只有当满足以下全部条件时，才将多个词合并为一个 token：
   - 整体含义无法从各组成部分的字面含义推导出来（即语义不可组合）
   - 在词典中作为独立词条存在（如习语、固定搭配）
   - 替换其中任何一个词都会导致整体含义改变或表达不自然
5. 【极其重要·标点禁令】text 字段绝对禁止包含任何标点符号
6. 所有条目的 text 去除标点后按顺序拼接必须等于原文去除标点后的内容
7. 【极其重要·禁止增减原则】translation 数组中的 text 条目必须与原文中的词语一一对应
8. 绝对禁止将一个完整的词拆分成字符、音节或语素

按照以下结构处理文本：
- original: 原文文本
- translation: 对象数组，每个对象包含 text, phonetic, morphology, meaning
- tokenized_translation: 完整自然的 {target_lang_name} 翻译
- translation_phrases: 分词结果
- grammar_explanation: 语法解释
- redundant_tokens: 冗余词

【极其重要·禁止空白字段】translation 数组中每个条目的 phonetic、morphology、meaning 字段都必须有实际内容，绝对不能留空！"""

    user_content = f"{context_section}\n【待处理文本】\n{text}" if context_section else f"【待处理文本】\n{text}"

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_content},
    ]

    response = await gateway.call(
        user_id, tier, messages,
        temperature=0.0, max_tokens=4096,
        request_type="process_text", tools=tools,
    )

    # 解析 tool call 响应
    try:
        choice = response.get("choices", [{}])[0]
        message = choice.get("message", {})
        tool_calls = message.get("tool_calls", [])
        if tool_calls:
            arguments_str = tool_calls[0].get("function", {}).get("arguments", "{}")
            result = json.loads(arguments_str)
            return result
        # 如果没有 tool_calls，尝试从 content 解析 JSON
        content = message.get("content", "")
        if content:
            try:
                return json.loads(content)
            except json.JSONDecodeError:
                pass
    except Exception as e:
        print(f"[WARN] process_text_with_dictionary tool call parse failed: {e}")
    return {}


async def _gateway_generate_multiple_choice(user_id, tier, word, correct_meaning, context, target_lang, source_lang, temperature):
    """通过 gateway.call() 实现单词多选生成（tool call 模式）。"""
    source_lang_name = get_lang_name(source_lang)
    target_lang_name = get_lang_name(target_lang)

    tools = [{
        "type": "function",
        "function": {
            "name": "generate_multiple_choice",
            "description": "Generate enriched word information with multiple choice options",
            "parameters": {
                "type": "object",
                "properties": {
                    "word": {"type": "string"},
                    "enriched_meaning": {"type": "string", "description": "单词的完整释义，包含多个母语单词的常见含义"},
                    "variants_detail": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "form": {"type": "string"},
                                "type": {"type": "string"},
                            },
                        },
                        "description": "词形变化 + 类型说明，只包含确实存在的词形变化",
                    },
                    "examples": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "sentence": {"type": "string"},
                                "translation": {"type": "string"},
                            },
                        },
                        "minItems": 2,
                        "maxItems": 2,
                        "description": "两个全新的例句（绝不能复用原文句子，必须是不同的句子。尽量使用简单常见的词汇组成例句，不需要与原文中的意思相同）",
                    },
                    "memory_hint": {"type": "string", "description": "记忆辅助（联想/对比母语）"},
                    "multiple_choice": {
                        "type": "object",
                        "properties": {
                            "options": {
                                "type": "array",
                                "items": {
                                    "type": "object",
                                    "properties": {
                                        "text": {"type": "string", "description": "A concrete, meaningful translation or definition. MUST NOT be a placeholder like 'meaning 1', '释义1', '含义1', etc."},
                                        "is_correct": {"type": "boolean"},
                                    },
                                },
                            },
                        },
                    },
                },
                "required": ["word", "enriched_meaning", "variants_detail", "examples", "memory_hint", "multiple_choice"],
            },
        },
    }]

    system_prompt = f"""为单词 '{word}' 生成丰富的信息，使用 {target_lang_name} 输出。

【极其重要】这个单词属于 {source_lang_name}（学习语言）：
- 词形变化（variants_detail）必须是 {source_lang_name} 语法规则下的词形变化
- 例句（examples）必须使用 {source_lang_name} 编写
- 所有语言相关的内容都必须遵循 {source_lang_name} 的语法和用法规范

上下文释义：{correct_meaning}

上下文：{context}

请生成以下信息：

1. enriched_meaning: 单词的完整释义，包含多个常见含义，用分号分隔。每个含义必须是具体的、有意义的翻译，不能是占位符（如"释义1"、"含义1"等）
2. variants_detail: {source_lang_name} 词形变化列表，带类型说明。对于派生词，必须列出其词根/原形作为词形变化。对于基础词，列出其常见的屈折变化（如名词的复数、动词的变位形式、形容词的比较级/最高级等，必须遵循 {source_lang_name} 语法规则）。只包含确实存在的词形变化，如果没有则返回空数组
3. examples: 两个全新的例句。【极其重要】例句本身必须使用 {source_lang_name}（学习语言）编写，翻译必须使用 {target_lang_name}（用户的母语）。绝不能反过来用母语写例句再用学习语言翻译。尽量使用简单常见的词汇组成例句，不需要与原文中的意思相同
4. memory_hint: 记忆辅助（与用户母语的联想或对比）
5. multiple_choice: 选择题，包含：
   - options: 4个选项，【极其重要】第一个选项必须是正确答案，其余3个是错误答案

要求：
- 所有输出必须使用 {target_lang_name}
- 【极其重要】例句必须使用 {source_lang_name} 编写，翻译使用 {target_lang_name}。绝不能用母语写例句再用学习语言翻译
- 例句要自然，尽量使用简单常见的词汇，不需要与原文中的意思相同
- 记忆辅助对语言学习者要有帮助
- 选择题选项要清晰且合理
- 【重要】正确答案必须是单词的常见、正常释义，不是上下文特定释义
- 【重要】错误答案必须是该单词所没有的意思，而不是非句子中的意思
- 【重要】选项必须是纯单词或短语，不能是完整句子
- 【重要】选项必须与单词本身的意思无关，不能包含单词的任何含义
- 【重要】词形变化必须是 {source_lang_name} 中确实存在的，不要硬加不存在的词形
- 【重要】四个选项的格式和词性必须保持一致：如果正确答案包含两个释义，错误选项也必须各包含两个释义；如果正确答案只有一个释义，错误选项也各只有一个释义。所有选项的词性范围应尽量一致
- 【极其重要】enriched_meaning 中不能包含占位符文本（如"释义1"、"含义1"、"meaning 1"等），必须全部是具体的、有意义的翻译内容
- 【输出约束】除了工具调用的JSON输出外，不要添加任何其他文本、解释或说明。直接生成工具调用所需的JSON参数即可。"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Word: {word}"},
    ]

    response = await gateway.call(
        user_id, tier, messages,
        temperature=temperature, max_tokens=4096,
        request_type="generate_multiple_choice", tools=tools,
    )

    # 解析 tool call 响应
    try:
        choice = response.get("choices", [{}])[0]
        message = choice.get("message", {})
        tool_calls = message.get("tool_calls", [])
        if tool_calls:
            arguments_str = tool_calls[0].get("function", {}).get("arguments", "{}")
            result = json.loads(arguments_str)
            result["word"] = result.get("word", word)
            return result
        # 如果没有 tool_calls，尝试从 content 解析 JSON
        content = message.get("content", "")
        if content:
            try:
                result = json.loads(content)
                result["word"] = result.get("word", word)
                return result
            except json.JSONDecodeError:
                pass
    except Exception as e:
        print(f"[WARN] generate_multiple_choice tool call parse failed: {e}")
    return {"word": word, "enriched_meaning": correct_meaning, "multiple_choice": {"options": [{"text": correct_meaning, "is_correct": True}]}}


async def _gateway_process_remaining_words(user_id, tier, words, source_lang, target_lang, context):
    """通过 gateway.call() 实现遗漏单词处理（tool call 模式）。"""
    target_lang_name = get_lang_name(target_lang)

    tools = [{
        "type": "function",
        "function": {
            "name": "generate_remaining_words",
            "description": "为遗漏的单词生成词信息",
            "parameters": {
                "type": "object",
                "properties": {
                    "words": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "text": {"type": "string"},
                                "phonetic": {"type": "string", "description": "Pronunciation of this word. Use the most commonly used and widely recognized pronunciation notation for the source language — this may be IPA, pinyin, romaji, or any other standard system that native speakers and learners would expect. For tonal languages, include tone information."},
                                "morphology": {"type": "string", "description": "Meaning in TARGET_LANG based on the context - concise, just a few independent words, not a full sentence explanation"},
                                "meaning": {"type": "string", "description": "Meaning in TARGET_LANG based on the context - concise, just a few independent words, not a full sentence explanation"},
                            },
                            "required": ["text", "phonetic", "morphology", "meaning"],
                        },
                    },
                },
                "required": ["words"],
            },
        },
    }]

    words_str = ", ".join(words)
    system_prompt = f"""以下单词在之前的处理中被遗漏了，请为它们生成词信息，使用 {target_lang_name} 输出。

遗漏的单词：
{words_str}

上下文句子：
{context}

请为每个单词提供：
1. text: 单词本身
2. phonetic: 发音标注。使用该语言最常用、最被广泛认可的注音系统——可以是 IPA、拼音、罗马字或其他母语者和学习者期望的标准注音方式。声调语言需标注声调信息
3. morphology: 词性缩写（如 n, v, adj, adv, prep, conj, pron, det 等）
4. meaning: 基于上下文的 {target_lang_name} 释义，简洁的几个独立词，不需要用完整句子解释

【重要】必须为每一个遗漏的单词都生成条目，不要遗漏任何一个！
【输出约束】除了工具调用的JSON输出外，不要添加任何其他文本、解释或说明。"""

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": f"Generate info for these words: {words_str}"},
    ]

    response = await gateway.call(
        user_id, tier, messages,
        temperature=0.0, max_tokens=4096,
        request_type="process_remaining_words", tools=tools,
    )

    # 解析 tool call 响应
    try:
        choice = response.get("choices", [{}])[0]
        message = choice.get("message", {})
        tool_calls = message.get("tool_calls", [])
        if tool_calls:
            arguments_str = tool_calls[0].get("function", {}).get("arguments", "{}")
            result = json.loads(arguments_str)
            entries = result.get("words", [])
            if isinstance(entries, list):
                print(f"[DEBUG] process_remaining_words returned {len(entries)} valid entries")
                return entries
        # 如果没有 tool_calls，尝试从 content 解析 JSON
        content = message.get("content", "")
        if content:
            try:
                result = json.loads(content)
                entries = result.get("words", [])
                if isinstance(entries, list):
                    return entries
            except json.JSONDecodeError:
                pass
    except Exception as e:
        print(f"Process remaining words failed: {e}")
    return []


async def process_text_background(file_id: str, text: str, source_lang: str, target_lang: str, user_id: str = None, tier: str = "free"):
    try:
        t_total_start = time.time()
        app_prefs = storage.load_user_preferences(user_id=user_id)
        retry_interval = 1.0  # Admin 全局设置，暂固定为 1.0
        print(f"[DEBUG] 开始处理文件 {file_id}, 请求间隔={retry_interval}s")
        _preserve = {k: processing_status[file_id][k] for k in ("original_text", "title") if k in processing_status[file_id]}
        processing_status[file_id] = {"status": "processing", "progress": 0, "current_sentence": 0, "total_sentences": 0, **_preserve}

        storage.save_language_settings(file_id, source_lang, target_lang)

        t_split_start = time.time()
        sentences = text_processor.split_sentences(text)
        total_sentences = len(sentences)
        t_split_end = time.time()
        print(f"[TIMING] 句子分割: {t_split_end - t_split_start:.3f}s, 共 {total_sentences} 个句子")

        _preserve2 = {k: processing_status[file_id][k] for k in ("original_text", "title") if k in processing_status[file_id]}
        processing_status[file_id] = {"status": "processing", "progress": 0, "current_sentence": 0, "total_sentences": total_sentences, **_preserve2}

        results_dict = {}
        completed_indices = set()

        async def process_single_sentence(idx, sentence):
            if not sentence.strip():
                return idx, None

            before_indices = [i for i in range(max(0, idx - 2), idx)]
            after_indices = [i for i in range(idx + 1, min(len(sentences), idx + 3))]
            before_sentences = [sentences[i] for i in before_indices if sentences[i].strip()]
            after_sentences = [sentences[i] for i in after_indices if sentences[i].strip()]
            context_sentences = {"before": before_sentences, "after": after_sentences} if (before_sentences or after_sentences) else None

            t_sentence_start = time.time()

            t_llm_start = time.time()
            print(f"[DEBUG] 正在翻译句子 {idx+1}/{total_sentences}: {repr(sentence)}")
            llm_shim = _LLMApiShim(user_id, tier)
            sentence_translation_result = await text_processor.process_translation(
                sentence,
                source_lang,
                target_lang,
                llm_shim,
                context_sentences
            )
            t_llm_end = time.time()
            print(f"[TIMING] 句子 {idx+1} LLM翻译调用: {t_llm_end - t_llm_start:.3f}s")

            t_validate_start = time.time()
            sentence_translation_result = text_processor.validate_and_complete_translation(
                sentence, sentence_translation_result, source_lang
            )
            t_validate_end = time.time()
            print(f"[TIMING] 句子 {idx+1} 验证补全: {t_validate_end - t_validate_start:.3f}s")

            t_extract_start = time.time()
            sentence_words = text_processor.extract_words(sentence, source_lang)
            t_extract_end = time.time()
            print(f"[TIMING] 句子 {idx+1} 单词提取: {t_extract_end - t_extract_start:.3f}s")

            translation_words = set()
            if isinstance(sentence_translation_result, dict) and "translation" in sentence_translation_result:
                for token in sentence_translation_result["translation"]:
                    if isinstance(token, dict) and "text" in token:
                        translation_words.add(token["text"].lower())

            if source_lang in NO_SPACE_LANGUAGES:
                def _norm(text):
                    return re.sub(r'[\s\u3000]+', '', re.sub(r'[^\w\u00C0-\u024F\u0400-\u052F\u0370-\u03FF\u0600-\u06FF\u0900-\u0D7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u1000-\u109F\u10A0-\u10FF\u1100-\u11FF]', '', text)).lower()
                sentence_norm = _norm(sentence)
                tokens_norm = _norm(''.join(translation_words))
                missing_words = [] if tokens_norm == sentence_norm else []
            else:
                multiword_components = set()
                for tw in translation_words:
                    if ' ' in tw:
                        for part in tw.split():
                            multiword_components.add(part.lower())

                missing_words = []
                for w in sentence_words:
                    w_clean = strip_edge_punctuation(w).lower()
                    if w_clean and w_clean not in translation_words and w_clean not in multiword_components and not is_punctuation_only(w):
                        missing_words.append(strip_edge_punctuation(w))

            if missing_words:
                print(f"[DEBUG] 发现遗漏单词: {missing_words}, 正在补充处理...")
                t_missing_start = time.time()
                remaining_entries = await _gateway_process_remaining_words(
                    user_id, tier, missing_words, source_lang, target_lang, sentence
                )
                t_missing_end = time.time()
                print(f"[TIMING] 句子 {idx+1} 遗漏单词补充LLM调用: {t_missing_end - t_missing_start:.3f}s")
                if remaining_entries:
                    if isinstance(sentence_translation_result, dict) and "translation" in sentence_translation_result:
                        translation_text_lower = []
                        for token in sentence_translation_result["translation"]:
                            if isinstance(token, dict) and "text" in token:
                                translation_text_lower.append(token["text"].lower())

                        for entry in remaining_entries:
                            if isinstance(entry, dict) and "text" in entry:
                                word = entry["text"]
                                if word.lower() not in translation_text_lower:
                                    sentence_translation_result["translation"].append(entry)
                                    translation_text_lower.append(word.lower())

                    print(f"[DEBUG] 补充了 {len(remaining_entries)} 个遗漏单词")

            sentence_data = {
                "sentence": sentence,
                "source_lang": source_lang,
                "translation_result": sentence_translation_result
            }
            t_sentence_end = time.time()
            print(f"[TIMING] 句子 {idx+1} 总耗时: {t_sentence_end - t_sentence_start:.3f}s")
            return idx, sentence_data

        tasks = [asyncio.create_task(process_single_sentence(i, s)) for i, s in enumerate(sentences)]

        for coro in asyncio.as_completed(tasks):
            idx, sentence_data = await coro
            if sentence_data is not None:
                results_dict[idx] = sentence_data
            completed_indices.add(idx)

            max_sequential = -1
            for ci in sorted(completed_indices):
                if ci == max_sequential + 1:
                    max_sequential = ci
                else:
                    break

            all_completed_translations = []
            for si in sorted(results_dict.keys()):
                all_completed_translations.append(results_dict[si])

            partial_vocab = []
            for si, sd in enumerate(all_completed_translations):
                tr = sd.get("translation_result", {})
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

            progress = int(len(completed_indices) / total_sentences * 100)
            _preserve3 = {k: processing_status[file_id][k] for k in ("original_text", "title") if k in processing_status[file_id]}
            processing_status[file_id] = {
                "status": "processing",
                "progress": progress,
                "current_sentence": len(completed_indices),
                "total_sentences": total_sentences,
                "vocab": unique_partial,
                "sentence_translations": all_completed_translations,
                **_preserve3
            }
            print(f"[DEBUG] 更新状态: 进度 {progress}%, 已处理 {len(completed_indices)} 个句子, 词汇 {len(unique_partial)} 个")

        sentence_translations = [results_dict.get(i, {"sentence": sentences[i], "translation_result": {}}) for i in range(total_sentences)]

        all_vocab = []
        for i, sentence_data in enumerate(sentence_translations):
            translation_result = sentence_data.get("translation_result", {})
            if isinstance(translation_result, dict) and "translation" in translation_result:
                for ti, token in enumerate(translation_result["translation"]):
                    if isinstance(token, dict) and "text" in token:
                        word = token["text"]
                        if not word or is_punctuation_only(word):
                            continue
                        entry = {
                            "word": word,
                            "ipa": token.get("phonetic", ""),
                            "meaning": token.get("meaning", "") or token.get("context_meaning", ""),
                            "tokens": [word],
                            "morphology": token.get("morphology", ""),
                            "sentence_index": i,
                            "token_index": ti
                        }
                        all_vocab.append(entry)

        seen = set()
        unique_vocab = []
        for entry in all_vocab:
            word = entry.get("word", "")
            cleaned = strip_edge_punctuation(word)
            if cleaned != word:
                entry["word"] = cleaned
                tokens = entry.get("tokens", [])
                if tokens:
                    entry["tokens"] = [cleaned if t == word else t for t in tokens]
            word = cleaned.lower()
            if word not in seen and word:
                seen.add(word)
                unique_vocab.append(entry)
        all_vocab = unique_vocab

        all_words_lower = set(entry.get("word", "").lower() for entry in all_vocab)
        deduplicated = []
        for entry in all_vocab:
            tokens = entry.get("tokens", [])
            if tokens and len(tokens) >= 2:
                all_tokens_covered = all(
                    any(t.lower() == w.lower() for w in all_words_lower if w != entry.get("word", "").lower())
                    for t in tokens
                )
                if all_tokens_covered:
                    continue
            deduplicated.append(entry)
        all_vocab = deduplicated

        all_vocab.sort(key=vocab_sort_key)
        print(f"[DEBUG] 从所有句子中提取词典条目，共 {len(all_vocab)} 个单词: {[word['word'] for word in all_vocab]}")

        learned_words_set = set()
        for entry in all_vocab:
            word = entry.get("word", "").lower()
            if word and storage.find_global_word_cache(word, source_lang):
                learned_words_set.add(word)
        if learned_words_set:
            storage.save_learned_words(file_id, sorted(learned_words_set))
            print(f"[DEBUG] 已识别 {len(learned_words_set)} 个已学单词: {sorted(learned_words_set)}")

        storage.save_pipeline_data(file_id, sentence_translations)
        storage.save_vocab(file_id, all_vocab)

        if all_vocab:
            generate_and_save_learning_plan(file_id, all_vocab, sentence_translations)

        _preserve4 = {k: processing_status[file_id][k] for k in ("original_text", "title") if k in processing_status[file_id]}
        processing_status[file_id] = {
            "status": "completed",
            "progress": 100,
            "vocab": all_vocab,
            "sentence_translations": sentence_translations,
            **_preserve4
        }
        t_total_end = time.time()
        print(f"[TIMING] ========== 全部处理完成 ==========")
        print(f"[TIMING] 总耗时: {t_total_end - t_total_start:.3f}s")
        print(f"[TIMING] 句子数: {total_sentences}, 单词数: {len(all_vocab)}")

        if file_id not in word_gen_state:
            word_gen_state[file_id] = {
                "running": False,
                "vocab": all_vocab,
                "priority_queue": [],
                "task": None,
                "processing_words": set(),
                "user_id": user_id,
                "tier": tier,
            }
        state = word_gen_state[file_id]
        state["vocab"] = all_vocab
        if user_id:
            state["user_id"] = user_id
        if tier:
            state["tier"] = tier
        if "processing_words" not in state:
            state["processing_words"] = set()
        if "plan_position" not in state:
            state["plan_position"] = 0
        if not state["running"]:
            state["running"] = True
            state["task"] = asyncio.create_task(background_word_gen(file_id))
            print(f"[DEBUG] 自动启动单词详情生成")
    except Exception as e:
        print(f"[ERROR] 处理出错: {str(e)}")
        import traceback
        traceback.print_exc()
        error_msg = str(e)
        if "401" in error_msg or "Unauthorized" in error_msg or "authentication" in error_msg.lower():
            error_msg = "API Key 无效或已过期，请检查设置中的 API Key"
        elif "429" in error_msg or "rate_limit" in error_msg.lower() or "too many requests" in error_msg.lower():
            error_msg = "API 请求频率超限，请稍后重试或降低 LLM 速率"
        elif "402" in error_msg or "payment" in error_msg.lower() or "quota" in error_msg.lower() or "balance" in error_msg.lower():
            error_msg = "API 余额不足，请充值后重试"
        elif "ConnectionError" in error_msg or "ConnectionRefused" in error_msg:
            error_msg = "无法连接到 API 服务，请检查网络或 API 地址"
        processing_status[file_id] = {
            "status": "error",
            "error": error_msg
        }
        raise  # ponytail: 让调用方也知道失败了，避免写入历史


async def process_single_word_gen(file_id, word_to_gen, vocab, source_lang, target_lang, temperature=0, user_id=None, tier="free"):
    state = word_gen_state.get(file_id)
    if not state:
        return
    processing = state.get("processing_words", set())
    if word_to_gen.lower() in {w.lower() for w in processing}:
        return
    processing.add(word_to_gen)
    try:
        max_retries = 3
        for attempt in range(max_retries):
            try:
                if storage.load_word_cache(file_id, word_to_gen):
                    return
                word_entry = None
                for v in vocab:
                    if v.get("word", "").lower() == word_to_gen.lower():
                        word_entry = v
                        break
                if not word_entry:
                    return
                sentences = storage.load_pipeline_data(file_id)
                context = ""
                context_sentences = []
                if sentences:
                    has_cjk = any('\u4e00' <= c <= '\u9fff' or '\u3040' <= c <= '\u309f' or '\u30a0' <= c <= '\u30ff' or '\uac00' <= c <= '\ud7af' for c in word_to_gen[:10])
                    if has_cjk:
                        word_pattern = re.compile(re.escape(word_to_gen), re.IGNORECASE)
                    else:
                        word_pattern = re.compile(r'\b' + re.escape(word_to_gen) + r'\b', re.IGNORECASE)
                    for sent_idx, sentence_data in enumerate(sentences):
                        if "sentence" in sentence_data:
                            if word_pattern.search(sentence_data["sentence"]):
                                context = sentence_data["sentence"]
                                translation = ""
                                if "translation_result" in sentence_data:
                                    translation = sentence_data["translation_result"].get("tokenized_translation", "")
                                context_sentences.append({
                                    "sentence": sentence_data["sentence"],
                                    "translation": translation,
                                    "sentence_index": sent_idx
                                })
                    if not context and sentences:
                        context = sentences[0].get("sentence", "")
                correct_meaning = word_entry.get("meaning", "")
                if not correct_meaning:
                    if "translation" in word_entry:
                        correct_meaning = word_entry["translation"]
                    elif "context_meaning" in word_entry:
                        correct_meaning = word_entry["context_meaning"]

                # --- 词汇缓存查询：优先 user_vocab → global_vocab，命中则跳过 LLM ---
                vocab_hit = None
                if user_id:
                    vocab_hit = user_vocab.lookup(user_id, word_to_gen, source_lang, target_lang)
                if not vocab_hit:
                    vocab_hit = global_vocab.lookup(word_to_gen, source_lang, target_lang)

                if vocab_hit:
                    print(f"[CACHE] 词汇缓存命中: {word_to_gen}，跳过 LLM 调用")
                    cache_data = {
                        "word": word_to_gen,
                        "ipa": word_entry.get("ipa", "") or vocab_hit.get("phonetic", ""),
                        "meaning": correct_meaning or vocab_hit.get("meaning", ""),
                        "enriched_meaning": vocab_hit.get("enriched_meaning") or correct_meaning,
                        "variants_detail": vocab_hit.get("variants_detail", []),
                        "examples": vocab_hit.get("examples", []),
                        "memory_hint": vocab_hit.get("memory_hint", ""),
                        "multiple_choice": vocab_hit.get("multiple_choice", {}),
                        "context": context,
                        "context_sentences": context_sentences,
                        "morphology": word_entry.get("morphology", "") or vocab_hit.get("morphology", ""),
                    }
                    if "context_translations" in cache_data:
                        del cache_data["context_translations"]
                    storage.save_word_cache(file_id, word_to_gen, cache_data)
                    return
                # --- 缓存未命中，走 LLM ---

                print(f"[DEBUG] Background word gen: {word_to_gen} (attempt {attempt + 1})")
                options_result = await _gateway_generate_multiple_choice(
                    user_id, tier, word_to_gen,
                    correct_meaning,
                    context,
                    target_lang,
                    source_lang,
                    temperature
                )

                placeholder_pattern = re.compile(r'(释义|含义|意思|meaning|definition)\s*\d', re.IGNORECASE)
                enriched = options_result.get("enriched_meaning", "")
                if placeholder_pattern.search(enriched):
                    print(f"[WARN] Detected placeholder text in word gen for '{word_to_gen}', retrying...")
                    options_result = await _gateway_generate_multiple_choice(
                        user_id, tier, word_to_gen,
                        correct_meaning,
                        context,
                        target_lang,
                        source_lang,
                        temperature
                    )
                    enriched = options_result.get("enriched_meaning", "")
                    if placeholder_pattern.search(enriched):
                        print(f"[WARN] Still placeholder text after retry for '{word_to_gen}', using fallback")
                        if placeholder_pattern.search(enriched):
                            options_result["enriched_meaning"] = correct_meaning

                options_result = fix_llm_options_result(options_result, source_lang, file_id)
                cache_data = dict(options_result)
                cache_data["word"] = options_result.get("word", word_to_gen)
                cache_data["ipa"] = word_entry.get("ipa", "")
                cache_data["meaning"] = correct_meaning
                cache_data["examples"] = options_result.get("examples", [])
                cache_data["context"] = context
                cache_data["context_sentences"] = context_sentences
                cache_data["morphology"] = word_entry.get("morphology", "")
                cache_data["variants_detail"] = options_result.get("variants_detail", [])
                cache_data["memory_hint"] = options_result.get("memory_hint", "")
                cache_data["enriched_meaning"] = options_result.get("enriched_meaning", correct_meaning)
                cache_data["multiple_choice"] = options_result.get("multiple_choice", {})
                if "context_translations" in cache_data:
                    del cache_data["context_translations"]
                storage.save_word_cache(file_id, word_to_gen, cache_data)
                print(f"[DEBUG] Cached word gen: {word_to_gen}")
                return
            except Exception as e:
                print(f"[ERROR] Word gen failed for {word_to_gen} (attempt {attempt + 1}/{max_retries}): {e}")
                if attempt < max_retries - 1:
                    app_prefs = storage.load_user_preferences()
                    retry_delay = app_prefs.get("retry_interval", 1.0)
                    print(f"[DEBUG] Retrying {word_to_gen} in {retry_delay}s...")
                    await asyncio.sleep(retry_delay)
                else:
                    print(f"[ERROR] Word gen permanently failed for {word_to_gen} after {max_retries} attempts")
    finally:
        processing.discard(word_to_gen)


async def background_word_gen(file_id: str):
    state = word_gen_state.get(file_id)
    if not state:
        return
    language_settings = storage.load_language_settings(file_id)
    target_lang = language_settings["target_lang"]
    source_lang = language_settings.get("source_lang", "en")
    vocab = state["vocab"]
    uid = state.get("user_id")
    tier = state.get("tier", "free")

    plan = storage.load_learning_plan(file_id)
    plan_word_order = []
    if plan:
        seen_vocab_indices = set()
        for unit in plan:
            items = unit.get("items", [])
            for item in items:
                vi = item.get("vocab_index")
                if vi is not None and vi not in seen_vocab_indices:
                    seen_vocab_indices.add(vi)
                    plan_word_order.append(vi)
        for i in range(len(vocab)):
            if i not in seen_vocab_indices:
                plan_word_order.append(i)

    if not plan_word_order:
        plan_word_order = list(range(len(vocab)))

    first_uncached = None
    for pi, vi in enumerate(plan_word_order):
        if vi < len(vocab):
            w = vocab[vi].get("word", "")
            if w and not storage.load_word_cache(file_id, w):
                first_uncached = pi
                break
    if first_uncached is not None:
        state["plan_position"] = min(state.get("plan_position", 0), first_uncached)
    elif "plan_position" not in state:
        state["plan_position"] = len(plan_word_order)

    while state["running"]:
        word_to_gen = None
        if state["priority_queue"]:
            word_to_gen = state["priority_queue"].pop(0)
        elif state["plan_position"] < len(plan_word_order):
            vocab_idx = plan_word_order[state["plan_position"]]
            state["plan_position"] += 1
            if vocab_idx < len(vocab):
                word_to_gen = vocab[vocab_idx].get("word", "")

        if not word_to_gen:
            await asyncio.sleep(1)
            continue

        if storage.load_word_cache(file_id, word_to_gen):
            continue

        # 词汇缓存查询：user_vocab → global_vocab → 旧 find_global_word_cache
        uid = state.get("user_id")
        vocab_hit = None
        if uid:
            vocab_hit = user_vocab.lookup(uid, word_to_gen, source_lang, target_lang)
        if not vocab_hit:
            vocab_hit = global_vocab.lookup(word_to_gen, source_lang, target_lang)

        if vocab_hit:
            import copy
            cached = copy.deepcopy(vocab_hit)
            # 补充 context_sentences
            context_sents = []
            all_sentences = storage.load_pipeline_data(file_id)
            if all_sentences:
                try:
                    word_pattern = re.compile(r'\b' + re.escape(word_to_gen) + r'\b', re.IGNORECASE)
                except re.error:
                    word_pattern = re.compile(re.escape(word_to_gen), re.IGNORECASE)
                for sent_idx, sentence_data in enumerate(all_sentences):
                    if "sentence" in sentence_data:
                        if word_pattern.search(sentence_data["sentence"]):
                            translation = ""
                            if "translation_result" in sentence_data:
                                translation = sentence_data["translation_result"].get("tokenized_translation", "")
                            context_sents.append({
                                "sentence": sentence_data["sentence"],
                                "translation": translation,
                                "sentence_index": sent_idx
                            })
            if context_sents:
                cached["context_sentences"] = context_sents
                cached["context"] = context_sents[0]["sentence"]
            storage.save_word_cache(file_id, word_to_gen, cached)
            print(f"[CACHE] background_word_gen: 词汇缓存命中 {word_to_gen}")
            continue

        existing_cache = storage.find_global_word_cache(word_to_gen, source_lang)
        if existing_cache:
            import copy
            cached = copy.deepcopy(existing_cache)
            context_sents = []
            all_sentences = storage.load_pipeline_data(file_id)
            if all_sentences:
                word_pattern = re.compile(r'\b' + re.escape(word_to_gen) + r'\b', re.IGNORECASE)
                for sent_idx, sentence_data in enumerate(all_sentences):
                    if "sentence" in sentence_data:
                        if word_pattern.search(sentence_data["sentence"]):
                            translation = ""
                            if "translation_result" in sentence_data:
                                translation = sentence_data["translation_result"].get("tokenized_translation", "")
                            context_sents.append({
                                "sentence": sentence_data["sentence"],
                                "translation": translation,
                                "sentence_index": sent_idx
                            })
            if context_sents:
                cached["context_sentences"] = context_sents
                cached["context"] = context_sents[0]["sentence"]
            storage.save_word_cache(file_id, word_to_gen, cached)
            continue

        processing = state.get("processing_words", set())
        if word_to_gen.lower() in {w.lower() for w in processing}:
            continue

        asyncio.create_task(process_single_word_gen(file_id, word_to_gen, vocab, source_lang, target_lang, user_id=uid, tier=tier))
        await asyncio.sleep(0.1)

    state["task"] = None


def generate_and_save_learning_plan(file_id: str, vocab, sentences):
    language_settings = storage.load_language_settings(file_id)
    source_lang = language_settings.get("source_lang", "en")

    random.seed(42)
    shuffled_indices = list(range(len(vocab)))
    random.shuffle(shuffled_indices)
    storage.save_shuffled_order(file_id, shuffled_indices)

    max_items_per_unit = 10

    word_to_shuffled_pos = {}
    for pos, idx in enumerate(shuffled_indices):
        word_to_shuffled_pos[idx] = pos

    sentence_quiz_info = []
    for sent_idx, sentence_data in enumerate(sentences):
        if "sentence" not in sentence_data:
            continue

        sentence = sentence_data["sentence"]
        if source_lang in NO_SPACE_LANGUAGES:
            word_count = len(sentence.replace(' ', ''))
        else:
            word_count = len(sentence.split())
        if word_count > MAX_SENTENCE_WORDS_FOR_QUIZ:
            continue

        tr = sentence_data.get("translation_result", {})
        if "translation" not in tr:
            continue

        translation_tokens = tr.get("translation", [])
        if not translation_tokens:
            continue

        covering_vocab_indices = []
        for vi, v in enumerate(vocab):
            v_tokens = v.get("tokens", [v["word"]])
            word_covers = False
            for wt in v_tokens:
                for token in translation_tokens:
                    if isinstance(token, dict) and "text" in token:
                        if wt.lower() == token["text"].lower() or wt.lower() in token["text"].lower() or token["text"].lower() in wt.lower():
                            word_covers = True
                            break
                if word_covers:
                    break
            if word_covers:
                covering_vocab_indices.append(vi)

        if not covering_vocab_indices:
            continue

        all_covered = True
        for token in translation_tokens:
            if isinstance(token, dict) and "text" in token:
                token_text = token["text"]
                token_translation = token.get("meaning", "")
                token_morphology = token.get("morphology", "")
                if len(token_text) <= 2 and not token_translation and not token_morphology:
                    continue
                token_text_lower = token_text.lower()
                token_covered = False
                for vi in covering_vocab_indices:
                    w = vocab[vi]
                    w_tokens = w.get("tokens", [w["word"]])
                    for wt in w_tokens:
                        if wt.lower() == token_text_lower or wt.lower() in token_text_lower or token_text_lower in wt.lower():
                            token_covered = True
                            break
                    if token_covered:
                        break
                if not token_covered:
                    all_covered = False
                    break

        if not all_covered:
            continue

        last_covering_shuffled_pos = max(word_to_shuffled_pos.get(vi, len(shuffled_indices)) for vi in covering_vocab_indices)

        sentence_quiz_info.append({
            "sentence": sentence,
            "sentence_data": sentence_data,
            "covering_vocab_indices": covering_vocab_indices,
            "last_covering_shuffled_pos": last_covering_shuffled_pos
        })

    sentence_quiz_info.sort(key=lambda x: x["last_covering_shuffled_pos"])

    plan = []
    unit_start_shuffled_pos = 0
    quiz_insertion_pointer = 0

    while unit_start_shuffled_pos < len(shuffled_indices):
        unit_end_shuffled_pos = min(unit_start_shuffled_pos + max_items_per_unit, len(shuffled_indices))

        unit_word_items = []
        for sp in range(unit_start_shuffled_pos, unit_end_shuffled_pos):
            vocab_idx = shuffled_indices[sp]
            unit_word_items.append({
                "type": "word",
                "vocab_index": vocab_idx,
                "_shuffled_pos": sp
            })

        unit_quiz_items = []
        while quiz_insertion_pointer < len(sentence_quiz_info):
            sqi = sentence_quiz_info[quiz_insertion_pointer]
            last_pos = sqi["last_covering_shuffled_pos"]

            if last_pos < unit_end_shuffled_pos:
                quiz_insertion_pointer += 1

                sentence = sqi["sentence"]
                sentence_data = sqi["sentence_data"]
                covering_vocab_indices = sqi["covering_vocab_indices"]
                tr = sentence_data.get("translation_result", {})
                translation_tokens = tr.get("translation", [])

                raw_translation = tr.get("tokenized_translation", "")
                correct_translation = raw_translation.strip() if raw_translation else ""

                correct_tokens = get_translation_phrases(tr, max_phrases=6)
                correct_tokens = [ct for ct in correct_tokens if not is_punctuation_only(ct)]

                if len(correct_tokens) >= 2 and len(correct_tokens) <= 8:
                    redundant_tokens = tr.get("redundant_tokens", [])
                    cleaned_redundant = []
                    correct_has_source_lang = any(is_source_lang_text(ct, source_lang) for ct in correct_tokens)
                    for rt in redundant_tokens:
                        rt_stripped = rt.strip()
                        if rt_stripped and rt_stripped not in correct_tokens and not is_punctuation_only(rt_stripped):
                            if correct_has_source_lang or not is_source_lang_text(rt_stripped, source_lang):
                                cleaned_redundant.append(rt_stripped)

                    selected_distractors = list(dict.fromkeys(cleaned_redundant))[:4]

                    if len(selected_distractors) < 4:
                        existing_set = set(correct_tokens) | set(selected_distractors)
                        for other_sent in sentences:
                            if other_sent.get("sentence") == sentence:
                                continue
                            other_tr = other_sent.get("translation_result", {})
                            other_phrases = get_translation_phrases(other_tr, max_phrases=10)
                            for op in other_phrases:
                                if op not in existing_set:
                                    if correct_has_source_lang or not is_source_lang_text(op, source_lang):
                                        selected_distractors.append(op)
                                        existing_set.add(op)
                                        if len(selected_distractors) >= 4:
                                            break
                            if len(selected_distractors) >= 4:
                                break

                    all_tokens = correct_tokens + selected_distractors

                    if not correct_translation.strip():
                        correct_translation = "".join(correct_tokens)

                    unit_quiz_items.append({
                        "type": "sentence_quiz",
                        "sentence": sentence,
                        "correct_translation": correct_translation,
                        "correct_tokens": correct_tokens,
                        "tokens": all_tokens,
                        "_last_covering_shuffled_pos": last_pos
                    })

                sentence_words_display = get_listening_correct_words(sentence, sentence_data)

                correct_lower_set = set(w.lower() for w in sentence_words_display)
                distractor_words, distractor_set = get_listening_distractors_from_sentences(sentence, sentences, correct_lower_set)

                for v in vocab:
                    v_tokens = v.get("tokens", [v["word"]])
                    for vt in v_tokens:
                        if vt.lower() not in correct_lower_set and vt.lower() not in distractor_set:
                            distractor_words.append(vt)
                            distractor_set.add(vt.lower())
                    if len(v_tokens) == 1 and v["word"].lower() not in correct_lower_set and v["word"].lower() not in distractor_set:
                        distractor_words.append(v["word"])
                        distractor_set.add(v["word"].lower())

                random.shuffle(distractor_words)
                num_distractors = max(2, len(sentence_words_display) // 2)
                distractor_words = distractor_words[:num_distractors]

                if len(distractor_words) < 2:
                    backup_vocab_list = BACKUP_VOCAB_BY_LANG.get(source_lang, BACKUP_VOCAB_BY_LANG["en"])
                    backup_distractors = list(backup_vocab_list)
                    random.shuffle(backup_distractors)
                    idx = 0
                    while len(distractor_words) < 2:
                        bd = backup_distractors[idx % len(backup_distractors)]
                        if bd.lower() not in correct_lower_set and bd.lower() not in distractor_set:
                            distractor_words.append(bd)
                            distractor_set.add(bd.lower())
                        idx += 1

                if sentence_words_display and len(sentence_words_display) >= 2:
                    unit_quiz_items.append({
                        "type": "listening_quiz",
                        "sentence": sentence,
                        "clean_sentence": re.sub(r'^[A-Za-z\u0410-\u042F\u0430-\u044F]\s*[:：]\s*', '', sentence),
                        "correct_words": sentence_words_display,
                        "distractor_words": distractor_words,
                        "_last_covering_shuffled_pos": last_pos
                    })
            else:
                break

        final_items = list(unit_word_items)

        quizzes_with_anchor = []
        for quiz in unit_quiz_items:
            last_pos = quiz.pop("_last_covering_shuffled_pos", 0)
            anchor_pos = 0
            for i, item in enumerate(final_items):
                if item.get("type") == "word" and item.get("_shuffled_pos", -1) >= last_pos:
                    anchor_pos = i + 1
                    break
            else:
                anchor_pos = len(final_items)
            quizzes_with_anchor.append((quiz, anchor_pos))

        random.shuffle(quizzes_with_anchor)

        for _ in range(len(quizzes_with_anchor)):
            min_anchor = min(a for _, a in quizzes_with_anchor)
            candidates = [(q, a) for q, a in quizzes_with_anchor if a == min_anchor]
            chosen = random.choice(candidates)
            quizzes_with_anchor.remove(chosen)
            quiz, anchor_pos = chosen
            insert_pos = random.randint(anchor_pos, max(anchor_pos, len(final_items)))
            final_items.insert(insert_pos, quiz)
            for i in range(len(quizzes_with_anchor)):
                q, a = quizzes_with_anchor[i]
                if a >= insert_pos:
                    quizzes_with_anchor[i] = (q, a + 1)

        for item in final_items:
            item.pop("_shuffled_pos", None)

        if final_items:
            plan.append({
                "unit_id": len(plan),
                "items": final_items
            })

        unit_start_shuffled_pos = unit_end_shuffled_pos

    final_plan = []
    flat_items = []
    for unit in plan:
        flat_items.extend(unit["items"])

    for i in range(0, len(flat_items), max_items_per_unit):
        chunk = flat_items[i:i + max_items_per_unit]
        final_plan.append({
            "unit_id": len(final_plan),
            "items": chunk
        })

    storage.save_learning_plan(file_id, final_plan)


async def generate_title(text: str, source_lang: str, user_id: str = None, tier: str = "free") -> str:
    try:
        messages = [
            {"role": "system", "content": "You are a title generator. Generate a very short title (max 20 characters) that summarizes the given text. If the text already has a clear title in the first line, use that as the title. Output ONLY the title, nothing else."},
            {"role": "user", "content": f"Generate a short title for this text (language: {get_lang_name(source_lang)}):\n\n{text[:500]}"}
        ]
        result = await gateway.call(user_id or "system", tier, messages, temperature=0.3, max_tokens=64, request_type="generate_title")
        title = result.get("choices", [{}])[0].get("message", {}).get("content", "").strip()
        if title and len(title) <= 50:
            return title
    except Exception as e:
        print(f"[WARN] Title generation failed: {e}")
    first_line = text.strip().split('\n')[0].strip()
    return first_line[:20] + "..." if len(first_line) > 20 else first_line


async def pre_generate_next_word(file_id: str, vocab, next_index: int):
    try:
        language_settings = storage.load_language_settings(file_id)
        target_lang = language_settings["target_lang"]
        source_lang = language_settings.get("source_lang", "en")

        state = word_gen_state.get(file_id, {})
        uid = state.get("user_id")
        tier = state.get("tier", "free")

        plan = storage.load_learning_plan(file_id)
        if not plan:
            return

        unit_id, step_in_unit = find_item_in_plan(plan, next_index)
        if unit_id is None:
            return

        items = plan[unit_id].get("items", [])
        if step_in_unit >= len(items):
            return

        next_item = items[step_in_unit]
        if next_item["type"] == "sentence_quiz":
            return

        vocab_idx = next_item["vocab_index"]
        random_word = vocab[vocab_idx]
        word = random_word["word"]

        if storage.load_word_cache(file_id, word):
            print(f"[DEBUG] 预生成单词已缓存: {word}")
            return

        sentences = storage.load_pipeline_data(file_id)
        context = ""
        context_sentences = []
        if sentences:
            word_pattern = re.compile(r'\b' + re.escape(word) + r'\b', re.IGNORECASE)
            for sent_idx, sentence_data in enumerate(sentences):
                if "sentence" in sentence_data:
                    if word_pattern.search(sentence_data["sentence"]):
                        context = sentence_data["sentence"]
                        translation = ""
                        if "translation_result" in sentence_data:
                            translation = sentence_data["translation_result"].get("tokenized_translation", "")
                        context_sentences.append({
                            "sentence": sentence_data["sentence"],
                            "translation": translation,
                            "sentence_index": sent_idx
                        })
            if not context and sentences:
                context = sentences[0].get("sentence", "")

        correct_meaning = random_word.get("meaning", "")

        if not correct_meaning:
            if "context_meaning" in random_word:
                correct_meaning = random_word["context_meaning"]
            elif "translation" in random_word:
                correct_meaning = random_word["translation"]

        print(f"[DEBUG] 后台预生成单词信息: {word}")

        options_result = await _gateway_generate_multiple_choice(
            uid, tier, word,
            correct_meaning,
            context,
            target_lang,
            source_lang,
            0
        )
        options_result = fix_llm_options_result(options_result, source_lang, file_id)

        cache_data = dict(options_result)
        cache_data["word"] = options_result.get("word", word)
        cache_data["ipa"] = random_word.get("ipa", "")
        cache_data["meaning"] = correct_meaning
        cache_data["examples"] = options_result.get("examples", [])
        cache_data["context"] = context
        cache_data["context_sentences"] = context_sentences
        cache_data["morphology"] = random_word.get("morphology", "")
        cache_data["variants_detail"] = options_result.get("variants_detail", [])
        cache_data["memory_hint"] = options_result.get("memory_hint", "")
        cache_data["enriched_meaning"] = options_result.get("enriched_meaning", correct_meaning)
        cache_data["multiple_choice"] = options_result.get("multiple_choice", {})
        if "context_translations" in cache_data:
            del cache_data["context_translations"]

        storage.save_word_cache(file_id, word, cache_data)
        print(f"[DEBUG] 缓存预生成单词信息: {word}")

    except Exception as e:
        print(f"[ERROR] 预生成单词信息失败: {str(e)}")
