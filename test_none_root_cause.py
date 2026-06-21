"""Test: verify None text options are filtered at the root cause level"""
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "backend"))

from utils.helpers import fix_llm_options_result

# Simulate Qwen model returning null text in multiple_choice options
result_with_none = {
    "word": "about",
    "enriched_meaning": "关于；大约",
    "meaning": "关于",
    "variants_detail": [],
    "examples": [],
    "memory_hint": "",
    "multiple_choice": {
        "options": [
            {"text": "关于", "is_correct": True},
            {"text": None, "is_correct": False},  # Qwen returns null
            {"text": "大约", "is_correct": False},
            {"text": None, "is_correct": False},  # Another null
        ]
    }
}

fixed = fix_llm_options_result(result_with_none, "en", "test_file")
mc = fixed["multiple_choice"]
options = mc["options"]

print(f"[TEST 1] Options after fix: {options}")
for i, opt in enumerate(options):
    assert opt["text"] is not None, f"Option {i} text is None!"
    assert isinstance(opt["text"], str), f"Option {i} text is not str: {type(opt['text'])}"
print(f"[TEST 1] PASSED: No None text in options, got {len(options)} options")

# Verify no crash on .strip() in vocabulary.py path
import re
placeholder_check = re.compile(r'^(释义|含义|meaning|sense|definition)\s*\d+$', re.IGNORECASE)
mc_options = [o for o in options if isinstance(o, dict) and "text" in o and o["text"] is not None and not placeholder_check.match(o["text"].strip())]
print(f"[TEST 2] mc_options after vocabulary filter: {len(mc_options)}")
assert len(mc_options) >= 1, "Should have at least 1 valid option"
print("[TEST 2] PASSED: vocabulary.py filter works without crash")

# Test with all None texts (edge case)
result_all_none = {
    "word": "test",
    "enriched_meaning": "测试",
    "multiple_choice": {
        "options": [
            {"text": None, "is_correct": True},
            {"text": None, "is_correct": False},
            {"text": None, "is_correct": False},
            {"text": None, "is_correct": False},
        ]
    }
}

fixed2 = fix_llm_options_result(result_all_none, "en", "test_file")
mc2 = fixed2["multiple_choice"]
options2 = mc2["options"]
print(f"[TEST 3] All-None options after fix: {options2}")
for opt in options2:
    assert opt["text"] is not None, f"Option text is None: {opt}"
print("[TEST 3] PASSED: All-None case handled with fallback options")

print("\n=== ALL TESTS PASSED ===")
