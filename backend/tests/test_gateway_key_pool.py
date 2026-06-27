"""验证 gateway Key 池的引用语义模型行为：

1. disabled 引用被 get_current 跳过，不参与轮询。
2. 所有引用处于阻塞期时 get_current 返回 None，但 is_all_failed_too_long 仍为 False（未满 10 分钟）。
3. 满足 10 分钟后才 is_all_failed_too_long=True。
4. gateway.call 用 per-pool max_tokens 封顶（free 默认 16384）。
5. mark_complete 清除 key 全局错误状态（实时恢复"正常"）。
6. 拖拽重排引用顺序后，key_id 正确对应（引用不丢失）。
7. 429 不阻塞 key；5xx 阻塞 5min；401 阻塞 5min。
8. 运行时状态全局共享：同一 key 在不同 pool 状态一致。
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
    """写入老格式（gateway 加载时自动迁移到引用模型），返回新 gateway 单例。

    老格式 {tier: {configs, active_index}} 会被 _load_data 迁移为：
    {keys: {k1:{...}}, tier_keys: {tier: {title/sentence/word: {configs: refs}}}}
    """
    with open(os.path.join(_tmp, "tier_keys.json"), "w", encoding="utf-8") as f:
        json.dump({"tier_keys": {tier: {"configs": configs, "active_index": 0}}}, f)
    import utils.llm_gateway as gw
    importlib.reload(gw)
    return gw


def _rt(gw, pool, idx):
    """取 pool 第 idx 个引用对应 key 的运行时状态。"""
    key_id = pool.refs[idx]["key_id"]
    return gw.gateway.key_runtime[key_id]


def test_disabled_key_is_skipped():
    gw = _reload_gateway_with([
        {"api_key": "sk-disabled", "base_url": "https://x/v1", "model": "m", "disabled": True},
        {"api_key": "sk-good", "base_url": "https://x/v1", "model": "m", "disabled": False},
    ])
    pool = gw.gateway.pools["free"]["sentence"]
    cfg, idx = pool.get_current(gw.gateway)
    assert idx == 1, f"应跳过 disabled 的 key0，落到 key1，实际 idx={idx}"
    assert cfg["api_key"] == "sk-good"
    assert pool.has_any_usable_key(gw.gateway) is True


def test_all_disabled_has_no_usable_key():
    gw = _reload_gateway_with([
        {"api_key": "sk-a", "disabled": True},
        {"api_key": "sk-b", "disabled": True},
    ])
    pool = gw.gateway.pools["free"]["sentence"]
    assert pool.get_current(gw.gateway) is None
    assert pool.has_any_usable_key(gw.gateway) is False
    assert pool.next_available_time(gw.gateway) is None


def test_all_blocked_not_failed_too_long_before_10min():
    """所有 Key 401 阻塞后，10 分钟内不应判定为"失败太久"。"""
    gw = _reload_gateway_with([{"api_key": "sk-a"}, {"api_key": "sk-b"}])
    pool = gw.gateway.pools["free"]["sentence"]
    pool.mark_invalid(gw.gateway, 0)
    pool.mark_invalid(gw.gateway, 1)
    assert pool.get_current(gw.gateway) is None
    assert pool.is_all_failed_too_long() is False
    assert pool.has_any_usable_key(gw.gateway) is True
    nxt = pool.next_available_time(gw.gateway)
    assert nxt is not None and nxt > pool.consecutive_fail_start


def test_failed_too_long_after_10min():
    gw = _reload_gateway_with([{"api_key": "sk-a"}])
    pool = gw.gateway.pools["free"]["sentence"]
    pool.mark_invalid(gw.gateway, 0)
    import time as _t
    pool.consecutive_fail_start = _t.time() - 601
    assert pool.is_all_failed_too_long() is True


def test_mark_complete_clears_error_state():
    """成功调用后该 key 的全局 last_error 应被清除。"""
    gw = _reload_gateway_with([{"api_key": "sk-a"}])
    pool = gw.gateway.pools["free"]["sentence"]
    pool.mark_server_error(gw.gateway, 0)
    rt = _rt(gw, pool, 0)
    assert rt["last_error"] == "5xx Server Error"
    pool.mark_complete(gw.gateway, 0)
    assert rt["last_error"] is None
    assert rt["is_valid"] is True
    assert rt["rate_limited_until"] is None
    assert pool.consecutive_fail_start is None


class _FakeResp:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text
    def json(self):
        return {"choices": [{"message": {"content": "ok"}}], "usage": {}}


class _RecordingClient:
    def __init__(self, *a, **kw):
        self.last_payload = None
    async def __aenter__(self):
        return self
    async def __aexit__(self, *a):
        return False
    async def post(self, url, headers=None, json=None):
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
    gw.gateway.pools["free"]["sentence"].interval = 0
    captured = {}
    class _C(_RecordingClient):
        async def post(self, url, headers=None, json=None):
            captured["payload"] = json
            return _FakeResp(200, '{"ok":1}')
    with patch("httpx.AsyncClient", _C):
        asyncio.run(gw.gateway.call("u", "free", [{"role": "user", "content": "hi"}], max_tokens=65536))
    assert captured["payload"]["max_tokens"] == 16384, captured["payload"]


def test_call_caps_max_tokens_to_per_key_value():
    """per-pool max_tokens=8000 时，调用方传 65536 应被截到 8000。"""
    gw = _reload_gateway_with([
        {"api_key": "sk-good", "base_url": "https://x/v1", "model": "m", "max_tokens": 8000},
    ], tier="basic")
    gw.gateway.pools["basic"]["sentence"].interval = 0
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
    gw.gateway.pools["free"]["sentence"].interval = 0
    captured = {}
    class _C(_RecordingClient):
        async def post(self, url, headers=None, json=None):
            captured["payload"] = json
            return _FakeResp(200, '{"ok":1}')
    with patch("httpx.AsyncClient", _C):
        asyncio.run(gw.gateway.call("u", "free", [{"role": "user", "content": "hi"}], max_tokens=16))
    assert captured["payload"]["max_tokens"] == 16, captured["payload"]


def test_reorder_refs_preserves_key_id_mapping():
    """拖拽重排引用顺序后，key_id 正确对应（引用不丢失）。

    引用语义模型下，引用只存 key_id，重排不影响 key 定义。
    """
    import llm_api
    importlib.reload(llm_api)
    kid1 = llm_api.create_key_def("sk-AAAA1111BBBB", "u1", "m1")
    kid2 = llm_api.create_key_def("sk-CCCC3333DDDD", "u2", "m2")
    llm_api.update_tier_keys("free", "sentence", [
        {"key_id": kid1, "max_tokens": None, "disabled": False},
        {"key_id": kid2, "max_tokens": None, "disabled": False},
    ], 0)
    # 模拟前端拖拽重排：把第 2 个移到第 1 个前面
    llm_api.update_tier_keys("free", "sentence", [
        {"key_id": kid2, "max_tokens": None, "disabled": False},
        {"key_id": kid1, "max_tokens": None, "disabled": False},
    ], 0)
    saved = llm_api._load_data()["tier_keys"]["free"]["sentence"]["configs"]
    assert saved[0]["key_id"] == kid2, saved[0]
    assert saved[1]["key_id"] == kid1, saved[1]
    # key 定义不受引用重排影响
    keys = llm_api._load_data()["keys"]
    assert keys[kid1]["api_key"] == "sk-AAAA1111BBBB"
    assert keys[kid2]["api_key"] == "sk-CCCC3333DDDD"


def test_call_halves_max_tokens_on_400():
    """provider 返回 max_tokens 非法的 400 时，gateway 应折半重试直到成功或触底。"""
    gw = _reload_gateway_with([
        {"api_key": "sk-x", "base_url": "https://x/v1", "model": "m", "max_tokens": 16384},
    ], tier="free")
    gw.gateway.pools["free"]["sentence"].interval = 0
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
    assert attempts == [16384, 8192, 4096], attempts


def test_429_does_not_block_key():
    """429 不阻塞 Key——下次轮到该 Key 时直接可用。"""
    gw = _reload_gateway_with([
        {"api_key": "sk-a", "base_url": "https://x/v1", "model": "m"},
        {"api_key": "sk-b", "base_url": "https://x/v1", "model": "m"},
    ])
    pool = gw.gateway.pools["free"]["sentence"]
    cfg0, idx0 = pool.get_current(gw.gateway)
    pool.mark_rate_limited(gw.gateway, idx0)
    rt0 = _rt(gw, pool, idx0)
    assert rt0.get("rate_limited_until") is None  # 429 不阻塞
    cfg1, idx1 = pool.get_current(gw.gateway)
    assert idx1 != idx0


def test_5xx_blocks_key_5min():
    """5xx 阻塞 Key 5 分钟。"""
    import time as _t
    gw = _reload_gateway_with([
        {"api_key": "sk-a", "base_url": "https://x/v1", "model": "m"},
        {"api_key": "sk-b", "base_url": "https://x/v1", "model": "m"},
    ])
    pool = gw.gateway.pools["free"]["sentence"]
    cfg0, idx0 = pool.get_current(gw.gateway)
    pool.mark_server_error(gw.gateway, idx0)
    rt0 = _rt(gw, pool, idx0)
    assert rt0["rate_limited_until"] > _t.time() + 290
    cfg1, idx1 = pool.get_current(gw.gateway)
    assert idx1 != idx0


def test_call_does_not_halve_unrelated_400():
    """非 max_tokens 的 4xx 不折半 max_tokens，而是阻塞 5min 重试（由 10min 阈值兜底）。"""
    import time as _t
    gw = _reload_gateway_with([
        {"api_key": "sk-x", "base_url": "https://x/v1", "model": "m"},
    ], tier="free")
    pool = gw.gateway.pools["free"]["sentence"]
    pool.interval = 0
    pool.consecutive_fail_start = _t.time() - 601
    attempts = []
    class _C(_RecordingClient):
        async def post(self, url, headers=None, json=None):
            attempts.append(json["max_tokens"])
            return _FakeResp(400, '{"error":{"message":"invalid model"}}')
    import pytest
    with patch("httpx.AsyncClient", _C):
        with pytest.raises(Exception, match="10 分钟"):
            asyncio.run(gw.gateway.call("u", "free", [{"role": "user", "content": "hi"}], max_tokens=16384))
    assert all(a == 16384 for a in attempts), attempts


def test_sub_pool_routing_by_request_type():
    """不同 request_type 应路由到不同 sub-pool；sub 为空时回退到 sentence。"""
    # 用新格式直接写：free:title 配 key A，free:sentence 配 key B，free:word 留空
    data = {"keys": {
        "kt": {"id": "kt", "api_key": "sk-title", "base_url": "", "model": "m", "input_price_per_million": 0, "output_price_per_million": 0},
        "ks": {"id": "ks", "api_key": "sk-sentence", "base_url": "", "model": "m", "input_price_per_million": 0, "output_price_per_million": 0},
    }, "tier_keys": {"free": {
        "title": {"configs": [{"key_id": "kt", "max_tokens": None, "disabled": False}], "active_index": 0},
        "sentence": {"configs": [{"key_id": "ks", "max_tokens": None, "disabled": False}], "active_index": 0},
        "word": {"configs": [], "active_index": 0},
    }}}
    with open(os.path.join(_tmp, "tier_keys.json"), "w", encoding="utf-8") as f:
        json.dump(data, f)
    import utils.llm_gateway as gw
    importlib.reload(gw)
    g = gw.gateway
    # title 任务路由到 title sub
    p_title = g._resolve_pool("free", "generate_title")
    assert p_title is not None
    cfg, idx = p_title.get_current(g); p_title.mark_complete(g, idx)
    assert cfg["api_key"] == "sk-title"
    # word 任务无 key，回退到 sentence sub
    p_word = g._resolve_pool("free", "generate_multiple_choice")
    assert p_word is not None
    cfg, idx = p_word.get_current(g); p_word.mark_complete(g, idx)
    assert cfg["api_key"] == "sk-sentence"
    # sentence 任务路由到 sentence sub
    p_sent = g._resolve_pool("free", "process_text")
    cfg, idx = p_sent.get_current(g); p_sent.mark_complete(g, idx)
    assert cfg["api_key"] == "sk-sentence"


def test_runtime_state_is_global_across_pools():
    """同一 key 被多个 pool 引用时，运行时状态全局共享。

    free:sentence 把 k1 标记 401 → free:title 里的 k1 也显示 invalid。
    """
    data = {"keys": {
        "k1": {"id": "k1", "api_key": "sk-shared", "base_url": "", "model": "m", "input_price_per_million": 0, "output_price_per_million": 0},
    }, "tier_keys": {"free": {
        "title": {"configs": [{"key_id": "k1", "max_tokens": None, "disabled": False}], "active_index": 0},
        "sentence": {"configs": [{"key_id": "k1", "max_tokens": None, "disabled": False}], "active_index": 0},
        "word": {"configs": [], "active_index": 0},
    }}}
    with open(os.path.join(_tmp, "tier_keys.json"), "w", encoding="utf-8") as f:
        json.dump(data, f)
    import utils.llm_gateway as gw
    importlib.reload(gw)
    g = gw.gateway
    p_sent = g.pools["free"]["sentence"]
    p_title = g.pools["free"]["title"]
    # sentence 池标记 k1 invalid
    cfg, idx = p_sent.get_current(g)
    assert cfg["api_key"] == "sk-shared"
    p_sent.mark_invalid(g, idx)
    # k1 全局状态：is_valid=False
    assert g.key_runtime["k1"]["is_valid"] is False
    assert g.key_runtime["k1"]["last_error"] == "401 Unauthorized"
    # title 池里的 k1 也被阻塞（rate_limited_until 全局共享）
    assert p_title.get_current(g) is None  # k1 仍在阻塞期
    assert g.is_key_busy("k1") is True  # sentence 池占用未释放（get_current 占用，未 mark_complete）


def test_per_pool_disabled_is_independent():
    """per-pool disabled 独立：free:sentence 禁用 k1 不影响 free:title 用 k1。"""
    data = {"keys": {
        "k1": {"id": "k1", "api_key": "sk-shared", "base_url": "", "model": "m", "input_price_per_million": 0, "output_price_per_million": 0},
    }, "tier_keys": {"free": {
        "title": {"configs": [{"key_id": "k1", "max_tokens": None, "disabled": False}], "active_index": 0},
        "sentence": {"configs": [{"key_id": "k1", "max_tokens": None, "disabled": True}], "active_index": 0},
        "word": {"configs": [], "active_index": 0},
    }}}
    with open(os.path.join(_tmp, "tier_keys.json"), "w", encoding="utf-8") as f:
        json.dump(data, f)
    import utils.llm_gateway as gw
    importlib.reload(gw)
    g = gw.gateway
    # sentence 池：k1 disabled → 不可用
    p_sent = g.pools["free"]["sentence"]
    assert p_sent.get_current(g) is None
    assert p_sent.has_any_usable_key(g) is False
    # title 池：k1 未 disabled → 可用
    p_title = g.pools["free"]["title"]
    cfg, idx = p_title.get_current(g)
    assert cfg["api_key"] == "sk-shared"


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
    test_reorder_refs_preserves_key_id_mapping()
    test_call_halves_max_tokens_on_400()
    test_call_does_not_halve_unrelated_400()
    test_sub_pool_routing_by_request_type()
    test_runtime_state_is_global_across_pools()
    test_per_pool_disabled_is_independent()
    print("\n全部测试通过 ✅")
