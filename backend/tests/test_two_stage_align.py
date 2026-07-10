"""ponytail 自检：两阶段处理的对齐逻辑。
验证 _align_translation_to_tokens 强制把 translation text 对齐到阶段1 分词结果。
无框架，纯 assert，直接跑：python3 backend/tests/test_two_stage_align.py
"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# 只测纯函数，绕开模块级全局单例初始化——直接 import 函数定义
from utils.exercise_generators import _align_translation_to_tokens


def test_align_preserves_order_and_count():
    """LLM 正常返回时，对齐后 text 严格等于 prefill_tokens（顺序+数量）。"""
    prefill = ["hi", "man", "yo"]
    result = {
        "translation": [
            {"text": "hi", "phonetic": "haɪ", "morphology": "interj", "meaning": "嗨"},
            {"text": "man", "phonetic": "mæn", "morphology": "n", "meaning": "男人"},
            {"text": "yo", "phonetic": "joʊ", "morphology": "interj", "meaning": "哟"},
        ],
        "tokenized_translation": "Hi man, yo!",
    }
    out = _align_translation_to_tokens(result, prefill)
    texts = [t["text"] for t in out["translation"]]
    assert texts == prefill, f"text 未对齐: {texts}"
    # 释义保留
    assert out["translation"][0]["meaning"] == "嗨"
    print("[PASS] 正常返回时顺序与数量对齐")


def test_align_fixes_llm_modified_text():
    """LLM 擅自改了 text 形式（如 man→men），对齐后强制用 prefill_tokens，
    且因形式不匹配不复用 LLM 的释义（避免把 men 的释义套到 man 上）。"""
    prefill = ["hi", "man"]
    result = {
        "translation": [
            {"text": "Hi", "phonetic": "haɪ", "morphology": "interj", "meaning": "嗨"},  # 大小写差异，仍匹配
            {"text": "men", "phonetic": "mɛn", "morphology": "n", "meaning": "男人们"},  # 形式变了，不匹配
        ]
    }
    out = _align_translation_to_tokens(result, prefill)
    texts = [t["text"] for t in out["translation"]]
    assert texts == ["hi", "man"], f"未强制对齐: {texts}"
    assert out["translation"][0]["meaning"] == "嗨", "大小写差异应仍匹配释义"
    assert out["translation"][1]["meaning"] == "", "形式变了不应套用释义"
    print("[PASS] LLM 改 text 形式时强制纠正，形式不匹配则留空")


def test_align_handles_missing_entries():
    """LLM 漏了条目，对齐后按 prefill_tokens 补空壳。"""
    prefill = ["hi", "man", "yo"]
    result = {
        "translation": [
            {"text": "hi", "phonetic": "haɪ", "morphology": "interj", "meaning": "嗨"},
            # man 漏了
            {"text": "yo", "phonetic": "joʊ", "morphology": "interj", "meaning": "哟"},
        ]
    }
    out = _align_translation_to_tokens(result, prefill)
    texts = [t["text"] for t in out["translation"]]
    assert texts == ["hi", "man", "yo"], f"未补齐: {texts}"
    assert out["translation"][1]["meaning"] == "", "补的空壳应为空释义"
    assert out["translation"][0]["meaning"] == "嗨"
    print("[PASS] LLM 漏条目时补空壳")


def test_align_handles_extra_entries():
    """LLM 多加了条目，对齐后只保留 prefill_tokens 对应的。"""
    prefill = ["hi", "man"]
    result = {
        "translation": [
            {"text": "hi", "phonetic": "haɪ", "morphology": "interj", "meaning": "嗨"},
            {"text": "man", "phonetic": "mæn", "morphology": "n", "meaning": "男人"},
            {"text": "yo", "phonetic": "joʊ", "morphology": "interj", "meaning": "哟"},  # 多余
        ]
    }
    out = _align_translation_to_tokens(result, prefill)
    texts = [t["text"] for t in out["translation"]]
    assert texts == ["hi", "man"], f"未剔除多余: {texts}"
    print("[PASS] LLM 多条目时剔除")


def test_align_no_prefill_returns_unchanged():
    """无 prefill_tokens 时原样返回。"""
    result = {"translation": [{"text": "hi"}]}
    out = _align_translation_to_tokens(result, None)
    assert out is result
    print("[PASS] 无 prefill 时原样返回")


def test_partial_result_structure():
    """验证阶段1 半成品 translation_result 结构：text 有，释义空。"""
    tokens = ["hi", "man"]
    partial = {
        "original": "hi man",
        "translation": [{"text": t, "phonetic": "", "morphology": "", "meaning": ""} for t in tokens],
    }
    for t, tok in zip(tokens, partial["translation"]):
        assert tok["text"] == t
        assert tok["phonetic"] == "" and tok["morphology"] == "" and tok["meaning"] == ""
    # 对齐后能正确填入
    filled = _align_translation_to_tokens(
        {"translation": [{"text": "hi", "phonetic": "haɪ", "morphology": "interj", "meaning": "嗨"},
                          {"text": "man", "phonetic": "mæn", "morphology": "n", "meaning": "男人"}]},
        tokens,
    )
    assert [t["text"] for t in filled["translation"]] == tokens
    assert filled["translation"][0]["meaning"] == "嗨"
    print("[PASS] 半成品结构 + 对齐填充")


if __name__ == "__main__":
    test_align_preserves_order_and_count()
    test_align_fixes_llm_modified_text()
    test_align_handles_missing_entries()
    test_align_handles_extra_entries()
    test_align_no_prefill_returns_unchanged()
    test_partial_result_structure()
    print("\n全部通过 ✓")
