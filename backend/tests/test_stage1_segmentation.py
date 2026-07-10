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
