"""ponytail 自检：验证生成路径的完整性检查兜底。运行后删除。"""
import sys, asyncio, types
sys.path.insert(0, "/workspace/backend")

# stub 掉重型依赖，只测逻辑
sys.modules["fastapi"] = types.ModuleType("fastapi")
sys.modules["fastapi"].HTTPException = type("HTTPException", (Exception,), {"__init__": lambda s, status_code=0, detail="": None})
sys.modules["fastapi"].APIRouter = lambda **kw: None
sys.modules["fastapi"].Depends = lambda *a, **kw: None

from utils.helpers import is_word_cache_complete


def _complete_cache():
    return {
        "enriched_meaning": "释义", "memory_hint": "提示",
        "variants_detail": [{"pos": "n"}],
        "examples": [{"sentence": "s", "translation": "t"}],
        "multiple_choice": {"options": [{"text": "a", "is_correct": True}, {"text": "b", "is_correct": False}]},
    }


# 验证 is_word_cache_complete 对各类残缺的拦截（这是生成路径的 gate）
complete = _complete_cache()
assert is_word_cache_complete(complete) is True

# 模拟 LLM 漏生成各字段 → 应被完整性检查拦截（重试或跳过写入）
for field, empty in [
    ("enriched_meaning", ""), ("memory_hint", ""), ("variants_detail", []), ("examples", []),
]:
    c = _complete_cache(); c[field] = empty
    assert is_word_cache_complete(c) is False, f"LLM 漏 {field} 应被拦截"

# 模拟 LLM 漏生成 MC options → fix_llm_options_result 兜底后仍应通过
# （fix_llm_options_result 保证 MC ≥4 选项，这里直接验证完整性检查认可 fix 后的结构）
c = _complete_cache()
c["multiple_choice"]["options"] = [
    {"text": "correct", "is_correct": True},
    {"text": "d1", "is_correct": False},
    {"text": "d2", "is_correct": False},
    {"text": "d3", "is_correct": False},
]
assert is_word_cache_complete(c) is True

# is_word_cache_complete 只管结构完整性，不检查内容质量（占位符由 fix_llm_options_result 负责）
# 生成路径都过 fix，写入缓存的不会是纯占位符。这里验证职责分离：
c = _complete_cache()
c["multiple_choice"]["options"] = [
    {"text": "释义1", "is_correct": True},
    {"text": "释义2", "is_correct": False},
]
# 结构上完整（非空 text + 有 correct），is_word_cache_complete 认可通过——占位符是 fix 的职责
assert is_word_cache_complete(c) is True, "结构完整性检查不查内容占位符（职责分离）"

# 验证 fix_llm_options_result 的 MC 兜底链：漏生成 options 时用 fallback 补齐
# （fix 只管 MC，不管其它字段；其它字段缺失由 process_single_word_gen 的完整性检查 + 重试兜底）
from utils.helpers import fix_llm_options_result
# 完全无 multiple_choice → fix 用 correct_meaning + fallback 补齐
res = fix_llm_options_result({"enriched_meaning": "正确释义", "meaning": "正确释义"}, "en", "fake_file_id")
mc = res.get("multiple_choice", {})
opts = mc.get("options", [])
assert len(opts) >= 2, f"无 MC 时 fix 应补齐 ≥2 选项, got {len(opts)}"
assert any(o.get("is_correct") for o in opts), "fix 后必须有正确项"

# MC 干扰项含占位符 → fix 过滤占位符干扰项后用 fallback 补齐
# monkeypatch get_fallback_options 返回真实干扰项（避免 fake_file_id 下 fallback 返回占位符干扰测试）
import utils.helpers as _h
_orig_gfo = _h.get_fallback_options
_h.get_fallback_options = lambda correct, fid, count=3: [f"干扰项{i}" for i in range(count)]
try:
    res = fix_llm_options_result({
        "enriched_meaning": "正确释义",
        "multiple_choice": {"options": [
            {"text": "正确释义", "is_correct": True},
            {"text": "释义1", "is_correct": False},
            {"text": "meaning2", "is_correct": False},
        ]},
    }, "en", "fake_file_id")
    opts = res["multiple_choice"]["options"]
    assert any(o.get("is_correct") for o in opts), "fix 后必须有正确项"
    assert len(opts) >= 2, f"fix 后必须 ≥2 选项, got {len(opts)}"
    # 正确项应是真实释义
    correct_opts = [o for o in opts if o.get("is_correct")]
    assert correct_opts and correct_opts[0]["text"] == "正确释义", "正确项应保留为真实释义"
    # 原始占位符干扰项应被过滤，用真实干扰项补齐
    placeholder_kept = [o for o in opts if not o.get("is_correct") and o["text"] in ("释义1", "meaning2")]
    assert len(placeholder_kept) == 0, "原始占位符干扰项应被过滤"
    real_distractors = [o for o in opts if not o.get("is_correct") and "干扰项" in o["text"]]
    assert len(real_distractors) >= 1, "应用 fallback 补真实干扰项"
finally:
    _h.get_fallback_options = _orig_gfo

print("ALL ASSERTS PASSED")
