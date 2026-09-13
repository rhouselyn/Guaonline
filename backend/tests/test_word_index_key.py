"""单词表索引键自检：CJK 词按音标排序而非 token 首字；拉丁词按词形；变音符折叠。"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from utils.helpers import word_index_key


def test_cjk_sorts_by_ipa():
    # 中文"中"（U+4E2D）按字码排在拉丁后；按拼音 zhōng 应排在 z 区
    assert word_index_key("中", "zhōng")[0] < word_index_key("zzz", "")[0], "拼音 zhōng 折叠后应按 z 排序"
    # 拼音变音符折叠：zhōng 与 zhong 同组
    assert word_index_key("中", "zhōng")[0] == word_index_key("众", "zhòng")[0]


def test_latin_sorts_by_word():
    assert word_index_key("Apple", "")[0] == "apple"
    assert word_index_key("naïve", "")[0] == "naive"


def test_cjk_without_ipa_falls_back():
    # 无音标 CJK 词：退回字码排序（排在拉丁字母后，见 helpers.py ponytail 注释）
    assert word_index_key("日", "")[0] > word_index_key("zzz", "")[0]


def test_ipa_slash_prefix_stripped():
    assert word_index_key("你", "/nǐ/")[0][0] == "n"


if __name__ == "__main__":
    test_cjk_sorts_by_ipa()
    print("✅ CJK 按音标排序")
    test_latin_sorts_by_word()
    print("✅ 拉丁词按词形排序")
    test_cjk_without_ipa_falls_back()
    print("✅ 无音标 CJK 回退字码排序")
    test_ipa_slash_prefix_stripped()
    print("✅ 音标前缀剥离")
    print("\n全部自检通过 ✅")
