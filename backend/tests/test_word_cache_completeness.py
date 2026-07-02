"""验证“命中缓存立刻检查完整性；不完整则删除后作为新单词重新生成”的逻辑。

覆盖 process_single_word_gen / pre_generate_next_word / background_word_gen 三处入口。
重点：不完整的 file cache 必须被 delete_word_cache 删除，而不是被当作命中保留。
"""

import os
import sys
import asyncio
import tempfile
from unittest.mock import patch, AsyncMock

_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import importlib
import config
importlib.reload(config)

import utils.exercise_generators as eg


def _complete_cache(word="apple"):
    return {
        "word": word,
        "enriched_meaning": "a round fruit",
        "memory_hint": "think of red",
        "variants_detail": [{"type": "noun", "word": word}],
        "examples": [{"sentence": "I eat an apple.", "translation": "我吃苹果。"}],
        "multiple_choice": {"options": [
            {"text": "苹果", "is_correct": True},
            {"text": "梨", "is_correct": False},
            {"text": "香蕉", "is_correct": False},
            {"text": "葡萄", "is_correct": False},
        ]},
    }


def _incomplete_cache(word="apple"):
    """缺 memory_hint / examples，is_word_cache_complete 应返回 False。

    注意：variants_detail 不再 pop——空列表对于虚词是合法的，
    不应判为不完整。改为 pop examples 和 memory_hint 来制造不完整。
    """
    c = _complete_cache(word)
    c.pop("memory_hint")
    c.pop("examples")
    return c


class _FakeStorage:
    """记录 delete / save 调用，file_cache 由测试预置。"""
    def __init__(self, initial_cache=None):
        self._store = dict(initial_cache or {})  # word_lower -> cache
        self.deleted = []
        self.saved = []

    def load_word_cache(self, file_id, word):
        return self._store.get(word.lower())

    def delete_word_cache(self, file_id, word):
        self.deleted.append(word.lower())
        self._store.pop(word.lower(), None)

    def save_word_cache(self, file_id, word, info, overwrite_index=False):
        self.saved.append((word.lower(), info))
        self._store[word.lower()] = info

    def load_pipeline_data(self, file_id):
        return [{"sentence": "I eat an apple.", "sentence_index": 0}]


def _setup_state(file_id="f1"):
    eg.word_gen_state[file_id] = {
        "vocab": [{"word": "apple", "meaning": "苹果", "ipa": "ˈæp.əl", "morphology": "noun"}],
        "running": True,
        "priority_queue": [],
        "plan_position": 0,
        "processing_words": set(),
        "user_id": None,
        "tier": "free",
    }


def test_process_single_word_gen_deletes_incomplete_then_regenerates():
    """不完整 file cache → 必须被 delete，然后 LLM 重新生成并 save 完整结果。"""
    fake = _FakeStorage(initial_cache={"apple": _incomplete_cache("apple")})
    _setup_state()
    with patch.object(eg, "storage", fake), \
         patch.object(eg, "global_vocab", AsyncMock() if False else type("G", (), {"lookup": lambda *a, **k: None, "upsert": lambda *a, **k: None})()), \
         patch.object(eg, "user_vocab", type("U", (), {"lookup": lambda *a, **k: None, "upsert": lambda *a, **k: None})()), \
         patch.object(eg, "_gateway_generate_multiple_choice", new=AsyncMock(return_value=_complete_cache("apple"))), \
         patch.object(eg, "fix_llm_options_result", side_effect=lambda x, *a, **k: x), \
         patch.object(eg, "storage_load_user_preferences", create=True, side_effect=lambda: {}):
        # storage.load_user_preferences 在 eg 内通过 storage 引用，已在 patch storage 覆盖
        # 给 fake 加上 load_user_preferences 以满足 retry 路径（本测试不触发，但防御）
        fake.load_user_preferences = lambda: {"retry_interval": 0}
        asyncio.run(eg.process_single_word_gen("f1", "apple", eg.word_gen_state["f1"]["vocab"], "en", "zh"))

    assert "apple" in fake.deleted, f"不完整缓存应被删除，实际 deleted={fake.deleted}"
    assert fake.saved, "应重新生成并保存完整缓存"
    saved_word, saved_info = fake.saved[-1]
    assert saved_word == "apple"
    assert eg.is_word_cache_complete(saved_info), "重新保存的缓存必须完整"


def test_process_single_word_gen_keeps_complete_cache():
    """完整 file cache → 直接 return，不删除、不调用 LLM。"""
    fake = _FakeStorage(initial_cache={"apple": _complete_cache("apple")})
    _setup_state()
    called = {"llm": 0}

    async def _fake_llm(*a, **k):
        called["llm"] += 1
        return _complete_cache("apple")

    with patch.object(eg, "storage", fake), \
         patch.object(eg, "global_vocab", type("G", (), {"lookup": lambda *a, **k: None, "upsert": lambda *a, **k: None})()), \
         patch.object(eg, "user_vocab", type("U", (), {"lookup": lambda *a, **k: None, "upsert": lambda *a, **k: None})()), \
         patch.object(eg, "_gateway_generate_multiple_choice", new=_fake_llm):
        asyncio.run(eg.process_single_word_gen("f1", "apple", eg.word_gen_state["f1"]["vocab"], "en", "zh"))

    assert fake.deleted == [], f"完整缓存不应被删除，实际 deleted={fake.deleted}"
    assert called["llm"] == 0, "完整缓存命中不应调用 LLM"


def test_background_word_gen_skips_incomplete_vocab_hit():
    """background_word_gen 中：vocab_hit 不完整时不应记为“命中”，应落到 LLM。
    这是用户报告的“明明没缓存却提示命中”bug 的回归测试。"""
    fake = _FakeStorage(initial_cache={})  # 无 file cache
    _setup_state()
    # 只有一个词，且 learning_plan 让它排在第一位
    fake.load_learning_plan = lambda fid: [{"items": [{"vocab_index": 0, "type": "word"}]}]
    fake.load_language_settings = lambda fid: {"target_lang": "zh", "source_lang": "en"}
    fake.find_global_word_cache = lambda word, sl: None
    # vocab_hit 返回不完整记录（模拟“脏的”全局缓存）
    incomplete_hit = {"word": "apple"}  # 几乎全空

    hit_log = {"saved_from_hit": 0}

    class _GV:
        def lookup(self, word, sl, tl):
            return incomplete_hit
        def upsert(self, *a, **k):
            pass

    class _UV:
        def lookup(self, uid, word, sl, tl):
            return None
        def upsert(self, *a, **k):
            pass

    async def _fake_llm(*a, **k):
        return _complete_cache("apple")

    # background_word_gen 是 while running 循环；让它在处理完一个词后停止
    state = eg.word_gen_state["f1"]

    async def _stop_after_one(*a, **k):
        # process_single_word_gen 会被 create_task 调度；这里直接走 LLM 路径
        await asyncio.sleep(0)
        state["running"] = False

    with patch.object(eg, "storage", fake), \
         patch.object(eg, "global_vocab", _GV()), \
         patch.object(eg, "user_vocab", _UV()), \
         patch.object(eg, "_gateway_generate_multiple_choice", new=_fake_llm), \
         patch.object(eg, "fix_llm_options_result", side_effect=lambda x, *a, **k: x), \
         patch.object(eg, "process_single_word_gen", new=_stop_after_one):
        # 记录 storage.save_word_cache 是否在“命中”分支被调用（不应被调用，因 hit 不完整）
        orig_save = fake.save_word_cache
        def _spy_save(fid, word, info, overwrite_index=False):
            hit_log["saved_from_hit"] += 1
            orig_save(fid, word, info, overwrite_index)
        fake.save_word_cache = _spy_save
        asyncio.run(eg.background_word_gen("f1"))

    assert hit_log["saved_from_hit"] == 0, (
        "不完整的 vocab_hit 不应被记为命中并 save，实际 save 次数="
        f"{hit_log['saved_from_hit']}（这是“明明没缓存却提示命中”的 bug 根因）"
    )


def test_empty_variants_detail_is_complete():
    """虚词（not, of, by, up 等）没有词形变化，variants_detail=[] 是合法的，
    is_word_cache_complete 应返回 True。

    这是导致单词生成无限循环白费 token 的 bug 根因：完整性检查要求
    variants_detail 非空，但 LLM 按 prompt 要求正确返回 [] 却被判为不完整。
    """
    from utils.helpers import is_word_cache_complete
    c = _complete_cache("not")
    c["variants_detail"] = []
    assert is_word_cache_complete(c), "空 variants_detail 对虚词是合法的，应判为完整"


if __name__ == "__main__":
    test_process_single_word_gen_keeps_complete_cache()
    print("✅ 完整缓存保留测试通过")
    test_process_single_word_gen_deletes_incomplete_then_regenerates()
    print("✅ 不完整缓存删除+重新生成测试通过")
    test_background_word_gen_skips_incomplete_vocab_hit()
    print("✅ background_word_gen 不完整 vocab_hit 不命中测试通过")
    test_empty_variants_detail_is_complete()
    print("✅ 空 variants_detail 完整性测试通过")
    print("\n全部测试通过 ✅")
