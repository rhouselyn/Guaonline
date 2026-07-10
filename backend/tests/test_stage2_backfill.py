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
