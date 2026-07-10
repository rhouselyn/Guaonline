"""只学新词去重自检：跨文件 vocab 去重 + 过滤函数 + 偏好按 user_id 读取。

覆盖 _finalize_pipeline 的去重数据源（find_word_in_other_files_vocab）与
helpers 的过滤函数，以及 load_user_preferences(user_id=...) 必须返回真实偏好而非 __default__。
任一环节断裂都会让"只学新词"开关失效（历史回归 bug）。
"""

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

from utils.state import storage
from utils.helpers import (
    get_filtered_unit_total, get_filtered_step_in_unit, _is_word_item_learned,
)


def test_cross_file_vocab_dedup():
    """文件2 的词出现在文件1 vocab 中 → 应被识别为已学。"""
    # 文件1：先有 hi/man
    storage.save_language_settings("file1", "en", "zh")
    storage.save_vocab("file1", [{"word": "hi"}, {"word": "man"}])

    # 文件2：yo/hi/man，去重应命中 hi/man
    assert storage.find_word_in_other_files_vocab("hi", "en", "file2") is True
    assert storage.find_word_in_other_files_vocab("man", "en", "file2") is True
    # yo 是新词
    assert storage.find_word_in_other_files_vocab("yo", "en", "file2") is False
    # 排除自身：file1 查 hi 时不应命中自己（无其它文件）→ False
    assert storage.find_word_in_other_files_vocab("hi", "en", "file1") is False


def test_filter_skips_learned_words():
    """开关开启时，已学 word 项被过滤，sentence/listening 永不过滤。"""
    vocab = [{"word": "yo"}, {"word": "hi"}, {"word": "man"}]
    learned = {"hi", "man"}
    items = [
        {"type": "word", "vocab_index": 1},   # hi → 已学，跳过
        {"type": "word", "vocab_index": 0},   # yo → 新，保留
        {"type": "word", "vocab_index": 2},   # man → 已学，跳过
        {"type": "listening_quiz"},
        {"type": "sentence_quiz"},
    ]
    # 开启：5 → 3
    assert get_filtered_unit_total(items, vocab, learned, True) == 3
    # 关闭：原样 5
    assert get_filtered_unit_total(items, vocab, learned, False) == 5
    # 已学项确实被判定为 learned
    assert _is_word_item_learned(items[0], vocab, learned) is True
    assert _is_word_item_learned(items[1], vocab, learned) is False
    # 非词项永不过滤
    assert _is_word_item_learned(items[3], vocab, learned) is False


def test_preferences_scoped_by_user_id():
    """load_user_preferences(user_id=...) 必须返回该用户的偏好，而非 __default__。"""
    uid = "user-abc-only-new-words"
    storage.save_user_preferences({"only_new_words": True, "source_lang": "en"}, user_id=uid)
    # 按真实 user_id 读 → True
    assert storage.load_user_preferences(user_id=uid).get("only_new_words") is True
    # 无参读 __default__ → 不应泄漏到默认（默认为 False）
    assert storage.load_user_preferences().get("only_new_words") is False


if __name__ == "__main__":
    test_cross_file_vocab_dedup()
    test_filter_skips_learned_words()
    test_preferences_scoped_by_user_id()
    print("OK: 只学新词去重链路自检通过")
