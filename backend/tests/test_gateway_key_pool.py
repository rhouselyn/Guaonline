"""验证 gateway Key 池的引用语义模型 + SWRR + 熔断器 + Retry-After 行为。

覆盖要点：
1. SWRR 平滑加权轮询（等权/加权/跳过 disabled/跳过熔断 open）
2. 熔断器状态机（5xx 阈值 / half_open 探测 / half_open 成功复位 / half_open 失败重开 / 401 直接 open）
3. Retry-After 尊重（带 retry_after 阻塞 / 无 retry_after 不阻塞）
4. 引用语义：运行时状态全局共享 / per-pool disabled 独立 / 重排引用保留 key_id
5. max_tokens 封顶（free 默认 16384 / per-pool 覆盖 / 折半重试）
6. sub-pool 路由
"""

import os
import sys
import json
import time
import tempfile
import asyncio
import importlib
from unittest.mock import patch

# 独立临时目录，避免与其他测试文件共享 tier_keys.json 造成状态污染
_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp
os.environ.pop("HEALTH_CHECK_ENABLED", None)  # 确保健康检查关闭，不发真实请求
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import config
importlib.reload(config)
import llm_api
importlib.reload(llm_api)
import utils.llm_gateway  # 触发初始化


# ── 数据构造辅助 ────────────────────────────────────────────

def _kdef(kid, api_key="sk-x", base_url="https://x/v1", model="m"):
    """构造一个全局 key 定义。"""
    return {"id": kid, "api_key": api_key, "base_url": base_url, "model": model,
            "input_price_per_million": 0, "output_price_per_million": 0}


def _ref(kid, max_tokens=None, disabled=False, weight=1):
    """构造一个 pool 引用。"""
    return {"key_id": kid, "max_tokens": max_tokens, "disabled": disabled, "weight": weight}


def _build_data(keys, sentence_refs, tier="free"):
    """构造新格式数据：keys 为 {kid: kdef}，sentence_refs 为 [ref,...]。"""
    return {"keys": keys, "tier_keys": {tier: {
        "title": {"configs": [], "active_index": 0},
        "sentence": {"configs": sentence_refs, "active_index": 0},
        "word": {"configs": [], "active_index": 0},
    }}}


def _setup(data):
    """写入新格式数据并完全重载 gateway 链，返回 gw 模块。

    每次调用：
    - 重载 config/llm_api（确保 TIER_KEYS_FILE 指向本目录）
    - 写入新格式数据
    - 重载 utils.llm_gateway（重建 gateway 单例）
    - 防御性清空 key_runtime + 重新加载 pools，避免单例残留污染
    """
    os.environ["DATA_DIR"] = _tmp
    importlib.reload(config)
    importlib.reload(llm_api)
    with open(llm_api.TIER_KEYS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    import utils.llm_gateway as gw
    importlib.reload(gw)
    # 防御：清空运行时状态并重建 pools，确保无残留
    gw.gateway.key_runtime.clear()
    gw.gateway._reload_all()
    return gw


def _rt(gw, pool, idx):
    """取 pool 第 idx 个引用对应 key 的运行时状态。"""
    key_id = pool.refs[idx]["key_id"]
    return gw.gateway.key_runtime[key_id]


class _FakeResp:
    """模拟 httpx 响应，支持 headers（用于 429 retry-after）。"""
    def __init__(self, status_code, text="", headers=None):
        self.status_code = status_code
        self.text = text
        self.headers = headers or {}

    def json(self):
        return {"choices": [{"message": {"content": "ok"}}], "usage": {}}


class _FakeAsyncClient:
    """按 Authorization 中的 key 后缀返回不同状态码。"""
    def __init__(self, *a, **kw):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def post(self, url, headers=None, json=None):
        key = (headers or {}).get("Authorization", "")
        if key.endswith("sk-500"):
            return _FakeResp(500, "boom")
        return _FakeResp(200, '{"ok":1}')


# ── 1. SWRR 平滑加权轮询 ────────────────────────────────────

def test_swrr_equal_weights_distribute_evenly():
    """两个 key weight=1，SWRR 应交替选中，分布约 50%/50%。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    pool = gw.gateway.pools["free"]["sentence"]
    counts = {0: 0, 1: 0}
    for _ in range(8):
        cfg, idx = pool.get_current(gw.gateway)
        counts[idx] += 1
        pool.mark_complete(gw.gateway, idx)
    assert counts == {0: 4, 1: 4}, counts


def test_swrr_weighted_distribution():
    """key1 weight=3, key2 weight=1，SWRR 应按 75%/25% 分布。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1", weight=3), _ref("k2", weight=1)]))
    pool = gw.gateway.pools["free"]["sentence"]
    counts = {0: 0, 1: 0}
    for _ in range(8):
        cfg, idx = pool.get_current(gw.gateway)
        counts[idx] += 1
        pool.mark_complete(gw.gateway, idx)
    assert counts[0] == 6 and counts[1] == 2, counts


def test_swrr_skips_disabled_ref():
    """disabled 的 ref 不参与 SWRR，始终选可用 key。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1", disabled=True), _ref("k2")]))
    pool = gw.gateway.pools["free"]["sentence"]
    for _ in range(4):
        cfg, idx = pool.get_current(gw.gateway)
        assert idx == 1, idx
        assert cfg["api_key"] == "sk-2"
        pool.mark_complete(gw.gateway, idx)
    assert pool.has_any_usable_key(gw.gateway) is True


def test_swrr_skips_circuit_open_key():
    """熔断 open 且在阻塞期内的 key 不参与 SWRR。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    g = gw.gateway
    # 把 k1 设为熔断 open 且在阻塞期内
    rt1 = g._ensure_runtime("k1")
    rt1["circuit_state"] = "open"
    rt1["rate_limited_until"] = time.time() + 60
    pool = g.pools["free"]["sentence"]
    for _ in range(4):
        cfg, idx = pool.get_current(g)
        assert idx == 1, idx  # 只能选 k2
        assert cfg["api_key"] == "sk-2"
        pool.mark_complete(g, idx)


# ── 2. 熔断器状态机 ─────────────────────────────────────────

def test_circuit_5xx_threshold_three_failures():
    """连续 3 次 5xx 才进 open（前两次仅累加 fail_count）。"""
    keys = {"k1": _kdef("k1", "sk-1")}
    gw = _setup(_build_data(keys, [_ref("k1")]))
    g = gw.gateway
    pool = g.pools["free"]["sentence"]
    rt = g._ensure_runtime("k1")

    pool.mark_server_error(g, 0)
    assert rt["circuit_state"] == "closed", rt
    assert rt["fail_count"] == 1, rt

    pool.mark_server_error(g, 0)
    assert rt["circuit_state"] == "closed", rt
    assert rt["fail_count"] == 2, rt

    # 第三次达阈值 → open，阻塞 60s
    pool.mark_server_error(g, 0)
    assert rt["circuit_state"] == "open", rt
    assert rt["rate_limited_until"] > time.time() + 50, rt
    assert rt["fail_count"] == 0  # 进 open 后清零


def test_circuit_half_open_allows_single_probe():
    """open 到期后转 half_open，只放 1 个探测请求。"""
    keys = {"k1": _kdef("k1", "sk-1")}
    gw = _setup(_build_data(keys, [_ref("k1")]))
    g = gw.gateway
    pool = g.pools["free"]["sentence"]
    rt = g._ensure_runtime("k1")
    # 设为 open 且已过期 → 下次 pick 应转 half_open
    rt["circuit_state"] = "open"
    rt["rate_limited_until"] = time.time() - 1

    # 第一次 get_current：转 half_open 并放行探测
    r1 = pool.get_current(g)
    assert r1 is not None
    cfg, idx = r1
    assert idx == 0
    assert rt["circuit_state"] == "half_open", rt
    assert rt["half_open_probed"] is True, rt

    # 第二次 get_current：half_open 已探测 → 跳过 → None
    r2 = pool.get_current(g)
    assert r2 is None

    # 释放第一次占用
    pool.mark_complete(g, idx)


def test_circuit_half_open_success_resets_to_closed():
    """half_open 时 mark_complete → 复位 closed。"""
    keys = {"k1": _kdef("k1", "sk-1")}
    gw = _setup(_build_data(keys, [_ref("k1")]))
    g = gw.gateway
    pool = g.pools["free"]["sentence"]
    rt = g._ensure_runtime("k1")
    rt["circuit_state"] = "open"
    rt["rate_limited_until"] = time.time() - 1

    cfg, idx = pool.get_current(g)  # 转 half_open
    assert rt["circuit_state"] == "half_open"
    pool.mark_complete(g, idx)  # 成功 → closed

    assert rt["circuit_state"] == "closed", rt
    assert rt["fail_count"] == 0
    assert rt["half_open_probed"] is False
    assert rt["last_error"] is None


def test_circuit_half_open_failure_reopens():
    """half_open 时 mark_server_error → 重新 open。"""
    keys = {"k1": _kdef("k1", "sk-1")}
    gw = _setup(_build_data(keys, [_ref("k1")]))
    g = gw.gateway
    pool = g.pools["free"]["sentence"]
    rt = g._ensure_runtime("k1")
    rt["circuit_state"] = "open"
    rt["rate_limited_until"] = time.time() - 1

    cfg, idx = pool.get_current(g)  # 转 half_open
    assert rt["circuit_state"] == "half_open"
    pool.mark_server_error(g, idx)  # 探测失败 → 重新 open

    assert rt["circuit_state"] == "open", rt
    assert rt["rate_limited_until"] > time.time() + 50, rt  # 60s 阻塞


def test_circuit_401_directly_opens():
    """401 一次 mark_invalid 就进 open（不等 3 次），阻塞 300s。"""
    keys = {"k1": _kdef("k1", "sk-1")}
    gw = _setup(_build_data(keys, [_ref("k1")]))
    g = gw.gateway
    pool = g.pools["free"]["sentence"]
    rt = g._ensure_runtime("k1")

    pool.mark_invalid(g, 0)

    assert rt["circuit_state"] == "open", rt
    assert rt["is_valid"] is False
    assert rt["rate_limited_until"] > time.time() + 290, rt  # 300s


def test_circuit_401_escalates_on_repeated_failures():
    """连续 401 升级封禁时长：5min → 10min → 20min → 40min，封顶 1h。

    欠费 key 不会自愈，反复每 5min 探测是浪费，故每次 401 翻倍 cooldown。
    成功一次后 invalid_streak 清零，回到 5min。
    """
    keys = {"k1": _kdef("k1", "sk-1")}
    gw = _setup(_build_data(keys, [_ref("k1")]))
    g = gw.gateway
    pool = g.pools["free"]["sentence"]
    rt = g._ensure_runtime("k1")

    pool.mark_invalid(g, 0)
    assert rt["invalid_streak"] == 1
    assert 290 < rt["rate_limited_until"] - time.time() < 305  # 5min

    pool.mark_invalid(g, 0)
    assert rt["invalid_streak"] == 2
    assert 590 < rt["rate_limited_until"] - time.time() < 605  # 10min

    pool.mark_invalid(g, 0)
    assert rt["invalid_streak"] == 3
    assert 1190 < rt["rate_limited_until"] - time.time() < 1205  # 20min

    pool.mark_invalid(g, 0)
    assert rt["invalid_streak"] == 4
    assert 2390 < rt["rate_limited_until"] - time.time() < 2405  # 40min

    # 第 5 次本应 80min，被 1h 上限截断
    pool.mark_invalid(g, 0)
    assert rt["invalid_streak"] == 5
    assert 3590 < rt["rate_limited_until"] - time.time() < 3605  # cap 1h

    # 成功一次 → streak 清零，下次 401 回到 5min
    pool.mark_complete(g, 0)
    assert rt["invalid_streak"] == 0
    pool.mark_invalid(g, 0)
    assert rt["invalid_streak"] == 1
    assert 290 < rt["rate_limited_until"] - time.time() < 305


# ── 3. Retry-After 尊重 ─────────────────────────────────────

def test_rate_limited_with_retry_after_blocks():
    """mark_rate_limited(retry_after=30) → 阻塞 30s 且熔断 open。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    g = gw.gateway
    pool = g.pools["free"]["sentence"]
    cfg, idx = pool.get_current(g)
    pool.mark_rate_limited(g, idx, retry_after=30)

    rt = g.key_runtime[pool.refs[idx]["key_id"]]
    assert rt["circuit_state"] == "open", rt
    assert rt["rate_limited_until"] > time.time() + 25, rt

    # 阻塞期内 get_current 应跳过该 key，只选另一个
    blocked_idx = idx
    for _ in range(4):
        r = pool.get_current(g)
        assert r is not None
        assert r[1] != blocked_idx, r
        pool.mark_complete(g, r[1])


def test_rate_limited_without_retry_after_does_not_block():
    """mark_rate_limited() 无 retry_after → 不阻塞，仍可被选中。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    g = gw.gateway
    pool = g.pools["free"]["sentence"]
    cfg, idx = pool.get_current(g)
    pool.mark_rate_limited(g, idx)  # 无 retry_after

    rt = g.key_runtime[pool.refs[idx]["key_id"]]
    assert rt["rate_limited_until"] is None, rt
    assert rt["circuit_state"] == "closed", rt  # 不阻塞，保持原状态

    # 该 key 仍可被 SWRR 正常调度选中
    seen = set()
    for _ in range(4):
        r = pool.get_current(g)
        seen.add(r[1])
        pool.mark_complete(g, r[1])
    assert idx in seen, seen


# ── 4. 引用语义模型 ─────────────────────────────────────────

def test_runtime_state_is_global_across_pools():
    """同一 key 被多个 pool 引用时，运行时状态全局共享。"""
    keys = {"k1": _kdef("k1", "sk-shared")}
    data = {"keys": keys, "tier_keys": {"free": {
        "title": {"configs": [_ref("k1")], "active_index": 0},
        "sentence": {"configs": [_ref("k1")], "active_index": 0},
        "word": {"configs": [], "active_index": 0},
    }}}
    gw = _setup(data)
    g = gw.gateway
    p_sent = g.pools["free"]["sentence"]
    p_title = g.pools["free"]["title"]

    # sentence 池标记 k1 invalid
    cfg, idx = p_sent.get_current(g)
    assert cfg["api_key"] == "sk-shared"
    p_sent.mark_invalid(g, idx)

    # k1 全局状态：is_valid=False / circuit open
    rt = g.key_runtime["k1"]
    assert rt["is_valid"] is False
    assert rt["circuit_state"] == "open"
    assert rt["last_error"] == "401 Unauthorized"

    # title 池里的 k1 也被阻塞（rate_limited_until 全局共享）
    assert p_title.get_current(g) is None


def test_per_pool_disabled_is_independent():
    """per-pool disabled 独立：free:sentence 禁用 k1 不影响 free:title 用 k1。"""
    keys = {"k1": _kdef("k1", "sk-shared")}
    data = {"keys": keys, "tier_keys": {"free": {
        "title": {"configs": [_ref("k1", disabled=False)], "active_index": 0},
        "sentence": {"configs": [_ref("k1", disabled=True)], "active_index": 0},
        "word": {"configs": [], "active_index": 0},
    }}}
    gw = _setup(data)
    g = gw.gateway

    # sentence 池：k1 disabled → 不可用
    p_sent = g.pools["free"]["sentence"]
    assert p_sent.get_current(g) is None
    assert p_sent.has_any_usable_key(g) is False

    # title 池：k1 未 disabled → 可用
    p_title = g.pools["free"]["title"]
    cfg, idx = p_title.get_current(g)
    assert cfg["api_key"] == "sk-shared"
    p_title.mark_complete(g, idx)


def test_reorder_refs_preserves_key_id_mapping():
    """拖拽重排引用顺序后，key_id 正确对应（引用不丢失，key 定义不变）。"""
    keys = {"k1": _kdef("k1", "sk-AAAA1111BBBB"),
            "k2": _kdef("k2", "sk-CCCC3333DDDD")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    import llm_api
    # 模拟前端拖拽重排：把 k2 移到 k1 前面
    llm_api.update_tier_keys("free", "sentence", [
        {"key_id": "k2", "max_tokens": None, "disabled": False, "weight": 1},
        {"key_id": "k1", "max_tokens": None, "disabled": False, "weight": 1},
    ], 0)

    saved = llm_api._load_data()["tier_keys"]["free"]["sentence"]["configs"]
    assert saved[0]["key_id"] == "k2", saved[0]
    assert saved[1]["key_id"] == "k1", saved[1]
    # key 定义不受引用重排影响
    keys_loaded = llm_api._load_data()["keys"]
    assert keys_loaded["k1"]["api_key"] == "sk-AAAA1111BBBB"
    assert keys_loaded["k2"]["api_key"] == "sk-CCCC3333DDDD"


# ── 5. max_tokens 封顶 ──────────────────────────────────────

def test_call_caps_max_tokens_to_free_default():
    """free tier 默认封顶 16384，调用方传 65536 应被截到 16384。"""
    keys = {"k1": _kdef("k1", "sk-good")}
    gw = _setup(_build_data(keys, [_ref("k1")]))
    gw.gateway.pools["free"]["sentence"].interval = 0
    captured = {}

    class _C(_FakeAsyncClient):
        async def post(self, url, headers=None, json=None):
            captured["payload"] = json
            return _FakeResp(200, '{"ok":1}')

    with patch("httpx.AsyncClient", _C):
        asyncio.run(gw.gateway.call("u", "free", [{"role": "user", "content": "hi"}], max_tokens=65536))
    assert captured["payload"]["max_tokens"] == 16384, captured["payload"]


def test_call_caps_max_tokens_to_per_pool_value():
    """per-pool max_tokens=8000 时，调用方传 65536 应被截到 8000。"""
    keys = {"k1": _kdef("k1", "sk-good")}
    gw = _setup(_build_data(keys, [_ref("k1", max_tokens=8000)], tier="basic"))
    gw.gateway.pools["basic"]["sentence"].interval = 0
    captured = {}

    class _C(_FakeAsyncClient):
        async def post(self, url, headers=None, json=None):
            captured["payload"] = json
            return _FakeResp(200, '{"ok":1}')

    with patch("httpx.AsyncClient", _C):
        asyncio.run(gw.gateway.call("u", "basic", [{"role": "user", "content": "hi"}], max_tokens=65536))
    assert captured["payload"]["max_tokens"] == 8000, captured["payload"]


def test_call_keeps_smaller_caller_max_tokens():
    """调用方传更小值时不被 key 封顶抬高。"""
    keys = {"k1": _kdef("k1", "sk-good")}
    gw = _setup(_build_data(keys, [_ref("k1", max_tokens=16384)]))
    gw.gateway.pools["free"]["sentence"].interval = 0
    captured = {}

    class _C(_FakeAsyncClient):
        async def post(self, url, headers=None, json=None):
            captured["payload"] = json
            return _FakeResp(200, '{"ok":1}')

    with patch("httpx.AsyncClient", _C):
        asyncio.run(gw.gateway.call("u", "free", [{"role": "user", "content": "hi"}], max_tokens=16))
    assert captured["payload"]["max_tokens"] == 16, captured["payload"]


def test_call_halves_max_tokens_on_400():
    """provider 返回 max_tokens 非法的 400 时，gateway 折半重试直到成功。"""
    keys = {"k1": _kdef("k1", "sk-x")}
    gw = _setup(_build_data(keys, [_ref("k1", max_tokens=16384)]))
    gw.gateway.pools["free"]["sentence"].interval = 0
    attempts = []

    class _C(_FakeAsyncClient):
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


# ── 6. sub-pool 路由 ────────────────────────────────────────

def test_sub_pool_routing_by_request_type():
    """不同 request_type 路由到不同 sub-pool；sub 为空时回退到 sentence。"""
    keys = {"kt": _kdef("kt", "sk-title"), "ks": _kdef("ks", "sk-sentence")}
    data = {"keys": keys, "tier_keys": {"free": {
        "title": {"configs": [_ref("kt")], "active_index": 0},
        "sentence": {"configs": [_ref("ks")], "active_index": 0},
        "word": {"configs": [], "active_index": 0},
    }}}
    gw = _setup(data)
    g = gw.gateway

    # generate_title → title sub
    p_title = g._resolve_pool("free", "generate_title")
    assert p_title is not None
    cfg, idx = p_title.get_current(g); p_title.mark_complete(g, idx)
    assert cfg["api_key"] == "sk-title"

    # generate_multiple_choice → word sub（空）回退到 sentence
    p_word = g._resolve_pool("free", "generate_multiple_choice")
    assert p_word is not None
    cfg, idx = p_word.get_current(g); p_word.mark_complete(g, idx)
    assert cfg["api_key"] == "sk-sentence"

    # process_text → sentence sub
    p_sent = g._resolve_pool("free", "process_text")
    cfg, idx = p_sent.get_current(g); p_sent.mark_complete(g, idx)
    assert cfg["api_key"] == "sk-sentence"


# ── 辅助回归：disabled/全部阻塞 ─────────────────────────────

def test_all_disabled_has_no_usable_key():
    """所有 ref 都 disabled 时 get_current 返回 None。"""
    keys = {"k1": _kdef("k1", "sk-a"), "k2": _kdef("k2", "sk-b")}
    gw = _setup(_build_data(keys, [_ref("k1", disabled=True), _ref("k2", disabled=True)]))
    pool = gw.gateway.pools["free"]["sentence"]
    assert pool.get_current(gw.gateway) is None
    assert pool.has_any_usable_key(gw.gateway) is False
    assert pool.next_available_time(gw.gateway) is None


def test_all_blocked_not_failed_too_long_before_10min():
    """所有 key 熔断阻塞后，10 分钟内不应判定为"失败太久"。"""
    keys = {"k1": _kdef("k1", "sk-a"), "k2": _kdef("k2", "sk-b")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    pool = gw.gateway.pools["free"]["sentence"]
    pool.mark_invalid(gw.gateway, 0)
    pool.mark_invalid(gw.gateway, 1)
    assert pool.get_current(gw.gateway) is None
    assert pool.is_all_failed_too_long() is False
    assert pool.has_any_usable_key(gw.gateway) is True
    nxt = pool.next_available_time(gw.gateway)
    assert nxt is not None and nxt > pool.consecutive_fail_start


def test_failed_too_long_after_10min():
    """连续失败满 10 分钟后应判定为失败太久。"""
    keys = {"k1": _kdef("k1", "sk-a")}
    gw = _setup(_build_data(keys, [_ref("k1")]))
    pool = gw.gateway.pools["free"]["sentence"]
    pool.mark_invalid(gw.gateway, 0)
    pool.consecutive_fail_start = time.time() - 601
    assert pool.is_all_failed_too_long() is True


def test_mark_complete_clears_error_state():
    """成功调用后该 key 全局 last_error 应被清除，熔断复位 closed。"""
    keys = {"k1": _kdef("k1", "sk-a")}
    gw = _setup(_build_data(keys, [_ref("k1")]))
    pool = gw.gateway.pools["free"]["sentence"]
    pool.mark_server_error(gw.gateway, 0)
    rt = _rt(gw, pool, 0)
    assert rt["last_error"] == "5xx Server Error"
    pool.mark_complete(gw.gateway, 0)
    assert rt["last_error"] is None
    assert rt["is_valid"] is True
    assert rt["rate_limited_until"] is None
    assert rt["circuit_state"] == "closed"
    assert pool.consecutive_fail_start is None


if __name__ == "__main__":
    import inspect, sys
    _self = sys.modules[__name__]
    for _name, _fn in sorted(vars(_self).items()):
        if _name.startswith("test_") and inspect.isfunction(_fn):
            _fn()
            print(f"  ok: {_name}")
    print("\n全部测试通过 ✅")