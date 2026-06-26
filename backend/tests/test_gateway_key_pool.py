"""验证 gateway Key 池的新行为：

1. disabled Key 被 get_current 跳过，不参与轮询。
2. 所有 Key 处于阻塞期时 get_current 返回 None，但 is_all_failed_too_long 仍为 False（未满 10 分钟），
   且 has_any_usable_key / next_available_time 正确——call() 此时应等待而非立刻报错。
3. 满足 10 分钟后才 is_all_failed_too_long=True。
4. gateway.call 用 per-key max_tokens 封顶（free 默认 16384，调用方传更大值时被截断）。
5. mark_complete 清除 last_error（实时状态恢复“正常”）。
6. update_tier_keys 在拖拽重排序后仍能按脱敏形式正确还原原始 Key（与位置无关）。
"""

import os
import sys
import json
import tempfile
import asyncio
from unittest.mock import patch

_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import importlib
import config
importlib.reload(config)


def _reload_gateway_with(configs, tier="free"):
    """写入指定 configs 并重载 gateway 模块，返回新单例。"""
    with open(os.path.join(_tmp, "tier_keys.json"), "w", encoding="utf-8") as f:
        json.dump({"tier_keys": {tier: {"configs": configs, "active_index": 0}}}, f)
    import utils.llm_gateway as gw
    importlib.reload(gw)
    return gw


def test_disabled_key_is_skipped():
    gw = _reload_gateway_with([
        {"api_key": "sk-disabled", "base_url": "https://x/v1", "model": "m", "disabled": True},
        {"api_key": "sk-good", "base_url": "https://x/v1", "model": "m", "disabled": False},
    ])
    pool = gw.gateway.pools["free"]
    cfg, idx = pool.get_current()
    assert idx == 1, f"应跳过 disabled 的 key0，落到 key1，实际 idx={idx}"
    assert cfg["api_key"] == "sk-good"
    assert pool.has_any_usable_key() is True


def test_all_disabled_has_no_usable_key():
    gw = _reload_gateway_with([
        {"api_key": "sk-a", "disabled": True},
        {"api_key": "sk-b", "disabled": True},
    ])
    pool = gw.gateway.pools["free"]
    assert pool.get_current() is None
    assert pool.has_any_usable_key() is False
    assert pool.next_available_time() is None


def test_all_blocked_not_failed_too_long_before_10min():
    """所有 Key 401 阻塞后，10 分钟内不应判定为“失败太久”。"""
    gw = _reload_gateway_with([{"api_key": "sk-a"}, {"api_key": "sk-b"}])
    pool = gw.gateway.pools["free"]
    pool.mark_invalid(0)
    pool.mark_invalid(1)
    # get_current 应返回 None（都在阻塞期）
    assert pool.get_current() is None
    # 但未满 10 分钟，不应放弃
    assert pool.is_all_failed_too_long() is False
    assert pool.has_any_usable_key() is True
    # 最近恢复时间在未来
    nxt = pool.next_available_time()
    assert nxt is not None and nxt > pool.consecutive_fail_start


def test_failed_too_long_after_10min():
    gw = _reload_gateway_with([{"api_key": "sk-a"}])
    pool = gw.gateway.pools["free"]
    pool.mark_invalid(0)
    # 手动把失败起点拨到 601 秒前，模拟满 10 分钟
    import time as _t
    pool.consecutive_fail_start = _t.time() - 601
    assert pool.is_all_failed_too_long() is True


def test_mark_complete_clears_error_state():
    """成功调用后该 Key 的 last_error 应被清除（实时恢复“正常”）。"""
    gw = _reload_gateway_with([{"api_key": "sk-a"}])
    pool = gw.gateway.pools["free"]
    pool.mark_server_error(0)  # 5xx 会阻塞 5min 并写 last_error
    assert pool.configs[0]["last_error"] == "5xx Server Error"
    pool.mark_complete(0)
    assert pool.configs[0]["last_error"] is None
    assert pool.configs[0]["is_valid"] is True
    assert 0 not in pool.rate_limited_until
    assert pool.consecutive_fail_start is None


class _FakeResp:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text
    def json(self):
        return {"choices": [{"message": {"content": "ok"}}], "usage": {}}


class _RecordingClient:
    """记录发出的 payload，并按 Authorization 返回 200/500。"""
    def __init__(self, *a, **kw):
        self.last_payload = None
        self.last_url = None
    async def __aenter__(self):
        return self
    async def __aexit__(self, *a):
        return False
    async def post(self, url, headers=None, json=None):
        self.last_url = url
        self.last_payload = json
        key = (headers or {}).get("Authorization", "")
        if key.endswith("sk-500"):
            return _FakeResp(500, "boom")
        return _FakeResp(200, '{"ok":1}')


def test_call_caps_max_tokens_to_free_default():
    """free tier 默认封顶 16384，调用方传 65536 应被截到 16384。"""
    gw = _reload_gateway_with([
        {"api_key": "sk-good", "base_url": "https://x/v1", "model": "m"},
    ], tier="free")
    # patch 临时把 batch interval 设 0，避免 wait_for_interval 阻塞
    gw.gateway.pools["free"].interval = 0
    captured = {}
    class _C(_RecordingClient):
        async def post(self, url, headers=None, json=None):
            captured["payload"] = json
            return _FakeResp(200, '{"ok":1}')
    with patch("httpx.AsyncClient", _C):
        asyncio.run(gw.gateway.call("u", "free", [{"role": "user", "content": "hi"}], max_tokens=65536))
    assert captured["payload"]["max_tokens"] == 16384, captured["payload"]


def test_call_caps_max_tokens_to_per_key_value():
    """per-key max_tokens=8000 时，调用方传 65536 应被截到 8000。"""
    gw = _reload_gateway_with([
        {"api_key": "sk-good", "base_url": "https://x/v1", "model": "m", "max_tokens": 8000},
    ], tier="basic")
    gw.gateway.pools["basic"].interval = 0
    captured = {}
    class _C(_RecordingClient):
        async def post(self, url, headers=None, json=None):
            captured["payload"] = json
            return _FakeResp(200, '{"ok":1}')
    with patch("httpx.AsyncClient", _C):
        asyncio.run(gw.gateway.call("u", "basic", [{"role": "user", "content": "hi"}], max_tokens=65536))
    assert captured["payload"]["max_tokens"] == 8000, captured["payload"]


def test_call_keeps_smaller_caller_max_tokens():
    """调用方传更小值（如语言检测 16）时不被 key 封顶抬高。"""
    gw = _reload_gateway_with([
        {"api_key": "sk-good", "base_url": "https://x/v1", "model": "m", "max_tokens": 16384},
    ], tier="free")
    gw.gateway.pools["free"].interval = 0
    captured = {}
    class _C(_RecordingClient):
        async def post(self, url, headers=None, json=None):
            captured["payload"] = json
            return _FakeResp(200, '{"ok":1}')
    with patch("httpx.AsyncClient", _C):
        asyncio.run(gw.gateway.call("u", "free", [{"role": "user", "content": "hi"}], max_tokens=16))
    assert captured["payload"]["max_tokens"] == 16, captured["payload"]


def test_update_tier_keys_matches_masked_after_reorder():
    """拖拽重排序后，脱敏 Key 应按 masked 形式正确还原（与位置无关）。"""
    import llm_api
    importlib.reload(llm_api)
    # 初始：两个真实 key
    llm_api.update_tier_keys("free", [
        {"api_key": "sk-AAAA1111BBBB", "base_url": "u1", "model": "m1"},
        {"api_key": "sk-CCCC3333DDDD", "base_url": "u2", "model": "m2"},
    ], 0)
    masked = llm_api.get_tier_keys()["free"]["configs"]
    # masked[0] = sk-A****BBBB, masked[1] = sk-C****DDDD
    # 模拟前端拖拽重排序：把第 2 个移到第 1 个前面，且 key 仍是脱敏形式
    reordered = [masked[1], masked[0]]
    llm_api.update_tier_keys("free", reordered, 0)
    saved = llm_api._load_tier_keys()["tier_keys"]["free"]["configs"]
    # 重排后第 0 个应是原 key2，第 1 个应是原 key1（按脱敏形式匹配，而非按 index）
    assert saved[0]["api_key"] == "sk-CCCC3333DDDD", saved[0]
    assert saved[1]["api_key"] == "sk-AAAA1111BBBB", saved[1]
    # base_url 也跟着 key 走
    assert saved[0]["base_url"] == "u2"
    assert saved[1]["base_url"] == "u1"


def test_call_halves_max_tokens_on_400():
    """provider 返回 max_tokens 非法的 400 时，gateway 应折半重试直到成功或触底。"""
    gw = _reload_gateway_with([
        {"api_key": "sk-x", "base_url": "https://x/v1", "model": "m", "max_tokens": 16384},
    ], tier="free")
    gw.gateway.pools["free"].interval = 0
    attempts = []

    class _C(_RecordingClient):
        async def post(self, url, headers=None, json=None):
            mt = json["max_tokens"]
            attempts.append(mt)
            if mt > 4096:
                return _FakeResp(400, '{"error":{"message":"max_tokens参数非法：限制数值范围[1,16384]"}}')
            return _FakeResp(200, '{"choices":[{"message":{"content":"ok"}}],"usage":{}}')

    with patch("httpx.AsyncClient", _C):
        res = asyncio.run(gw.gateway.call("u", "free", [{"role": "user", "content": "hi"}], max_tokens=16384))
    assert res["choices"][0]["message"]["content"] == "ok"
    # 应经历 16384 -> 8192 -> 4096 三次尝试，第三次成功
    assert attempts == [16384, 8192, 4096], attempts


def test_429_does_not_block_key():
    """429 不阻塞 Key——下次轮到该 Key 时直接可用。"""
    gw = _reload_gateway_with([
        {"api_key": "sk-a", "base_url": "https://x/v1", "model": "m"},
        {"api_key": "sk-b", "base_url": "https://x/v1", "model": "m"},
    ])
    pool = gw.gateway.pools["free"]
    # mark_rate_limited 切换 Key 但不阻塞
    cfg0, idx0 = pool.get_current()
    pool.mark_rate_limited(idx0)
    # idx0 不应在 rate_limited_until 中
    assert idx0 not in pool.rate_limited_until
    # 仍有可用 Key
    cfg1, idx1 = pool.get_current()
    assert idx1 != idx0  # 切换到另一个 Key


def test_5xx_blocks_key_5min():
    """5xx 阻塞 Key 5 分钟。"""
    gw = _reload_gateway_with([
        {"api_key": "sk-a", "base_url": "https://x/v1", "model": "m"},
        {"api_key": "sk-b", "base_url": "https://x/v1", "model": "m"},
    ])
    pool = gw.gateway.pools["free"]
    cfg0, idx0 = pool.get_current()
    pool.mark_server_error(idx0)
    # idx0 应在 rate_limited_until 中，约 5 分钟后恢复
    assert idx0 in pool.rate_limited_until
    assert pool.rate_limited_until[idx0] > _t_time() + 290  # 约 300s
    # idx0 不可用，get_current 跳到另一个 Key
    cfg1, idx1 = pool.get_current()
    assert idx1 != idx0


def _t_time():
    import time as _t
    return _t.time()


def test_call_does_not_halve_unrelated_400():
    """非 max_tokens 的 4xx 不折半 max_tokens，而是阻塞 5min 重试（由 10min 阈值兜底）。"""
    gw = _reload_gateway_with([
        {"api_key": "sk-x", "base_url": "https://x/v1", "model": "m"},
    ], tier="free")
    pool = gw.gateway.pools["free"]
    pool.interval = 0
    # 把失败起点拨到 601s 前，让 10min 阈值立刻触发
    pool.consecutive_fail_start = _t_time() - 601
    attempts = []

    class _C(_RecordingClient):
        async def post(self, url, headers=None, json=None):
            attempts.append(json["max_tokens"])
            return _FakeResp(400, '{"error":{"message":"invalid model"}}')

    import pytest
    with patch("httpx.AsyncClient", _C):
        with pytest.raises(Exception, match="10 分钟"):
            asyncio.run(gw.gateway.call("u", "free", [{"role": "user", "content": "hi"}], max_tokens=16384))
    # max_tokens 不应被折半（非 max_tokens 错误）
    assert all(a == 16384 for a in attempts), attempts


if __name__ == "__main__":
    test_disabled_key_is_skipped()
    test_all_disabled_has_no_usable_key()
    test_all_blocked_not_failed_too_long_before_10min()
    test_failed_too_long_after_10min()
    test_mark_complete_clears_error_state()
    test_429_does_not_block_key()
    test_5xx_blocks_key_5min()
    test_call_caps_max_tokens_to_free_default()
    test_call_caps_max_tokens_to_per_key_value()
    test_call_keeps_smaller_caller_max_tokens()
    test_update_tier_keys_matches_masked_after_reorder()
    test_call_halves_max_tokens_on_400()
    test_call_does_not_halve_unrelated_400()
    print("\n全部测试通过 ✅")
