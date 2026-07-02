"""验证 admin API Key 测试/状态端点（引用语义模型 + per-pool per-ref 熔断器 + weight）：

1. test 端点按 key_id 测试，结果回写到所有 pool 中该 key 的 per-ref 运行时状态。
2. status 端点暴露 circuit_state（open/half_open）。
3. status 端点暴露 per-pool weight。
4. is_busy 反映全局 active_in_flight。
5. test 端点跨 pool 同步状态（admin 诊断工具行为）。
6. SSE 鉴权（无 token 401 / 无效 token 401 / 有效 token 放行）。
7. 未知 tier 400。
"""

import os
import sys
import json
import time
import tempfile
import importlib
from unittest.mock import patch

_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp
os.environ.pop("HEALTH_CHECK_ENABLED", None)  # 关闭健康检查
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import config
importlib.reload(config)
import llm_api
importlib.reload(llm_api)
import utils.llm_gateway as gw_mod
importlib.reload(gw_mod)
import routers.admin as admin_mod
importlib.reload(admin_mod)

from fastapi import FastAPI
from fastapi.testclient import TestClient
from auth.deps import require_admin
from auth.models import AdminTokenData

app = FastAPI()
app.include_router(admin_mod.router)


async def _fake_admin():
    return AdminTokenData()


app.dependency_overrides[require_admin] = _fake_admin
client = TestClient(app)


# ── 数据构造辅助 ────────────────────────────────────────────

def _kdef(kid, api_key="sk-x", base_url="https://example.com/v1", model="m"):
    return {"id": kid, "api_key": api_key, "base_url": base_url, "model": model,
            "input_price_per_million": 0, "output_price_per_million": 0}


def _ref(kid, max_tokens=None, disabled=False, weight=1):
    return {"key_id": kid, "max_tokens": max_tokens, "disabled": disabled, "weight": weight}


def _build(keys, sentence_refs, title_refs=None):
    """构造新格式数据。title_refs 默认空。"""
    return {"keys": keys, "tier_keys": {"free": {
        "title": {"configs": title_refs or [], "active_index": 0},
        "sentence": {"configs": sentence_refs, "active_index": 0},
        "word": {"configs": [], "active_index": 0},
    }}}


def _setup(data):
    """写入新格式数据并让 gateway 重新加载。返回 gateway 实例。

    不重载 gw_mod 模块（避免破坏 TestClient portal）；admin 端点在调用时
    import gateway，能拿到同一单例。per-pool per-ref 运行时状态由 _reload_all 重建。
    """
    os.environ["DATA_DIR"] = _tmp
    importlib.reload(config)
    importlib.reload(llm_api)
    with open(llm_api.TIER_KEYS_FILE, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False)
    gw_mod.gateway._reload_all()
    return gw_mod.gateway


def _rt(pool, idx):
    """取 pool 第 idx 个引用的 per-ref 运行时状态（先确保已 sync）。"""
    with pool.lock:
        pool._sync_runtime()
        return pool.ref_runtime[idx]


class _FakeResp:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text

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
        if key.endswith("sk-good"):
            return _FakeResp(200, '{"ok":1}')
        if key.endswith("sk-bad"):
            return _FakeResp(401, '{"error":"invalid api key"}')
        if key.endswith("sk-500"):
            return _FakeResp(500, "Internal Server Error")
        return _FakeResp(200, "")


# ── 1. test 端点按 key_id 测试，回写 key_runtime ───────────

def test_test_endpoint_writes_back_per_key_runtime():
    keys = {
        "k_empty": _kdef("k_empty", ""),
        "k_good": _kdef("k_good", "sk-good"),
        "k_bad": _kdef("k_bad", "sk-bad"),
        "k_500": _kdef("k_500", "sk-500"),
    }
    data = _build(keys, [_ref("k_empty"), _ref("k_good"), _ref("k_bad"), _ref("k_500")])
    g = _setup(data)
    with patch("httpx.AsyncClient", _FakeAsyncClient):
        resp = client.post("/api/admin/api-keys/free/test?sub=sentence")
    assert resp.status_code == 200, resp.text
    by_idx = {r["index"]: r for r in resp.json()["results"]}
    assert by_idx[0]["status"] == "empty", by_idx[0]
    assert by_idx[1]["status"] == "ok", by_idx[1]
    assert by_idx[2]["status"] == "invalid", by_idx[2]
    assert by_idx[3]["status"] == "error", by_idx[3]

    # 回写到 sentence pool 的 per-ref 运行时状态（_test_key 经 _apply_to_refs 同步到所有 pool）
    sent_pool = g.pools["free"]["sentence"]
    # idx: 0=k_empty, 1=k_good, 2=k_bad, 3=k_500
    rt_good = _rt(sent_pool, 1)
    assert rt_good["last_error"] is None, rt_good
    assert rt_good["is_valid"] is True, rt_good
    rt_bad = _rt(sent_pool, 2)
    assert rt_bad["is_valid"] is False, rt_bad
    rt_500 = _rt(sent_pool, 3)
    assert "500" in rt_500["last_error"], rt_500


# ── 2. status 端点暴露 circuit_state ─────────────────────────

def test_status_exposes_circuit_state():
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    data = _build(keys, [_ref("k1"), _ref("k2")])
    g = _setup(data)
    sent_pool = g.pools["free"]["sentence"]
    # k1(idx=0) 设为 open，k2(idx=1) 设为 half_open
    rt1 = _rt(sent_pool, 0)
    rt1["circuit_state"] = "open"
    rt1["rate_limited_until"] = time.time() + 60
    rt2 = _rt(sent_pool, 1)
    rt2["circuit_state"] = "half_open"
    rt2["half_open_probed"] = False

    resp = client.get("/api/admin/api-keys/free/status?sub=sentence")
    statuses = {s["key_id"]: s for s in resp.json()["statuses"]}
    assert statuses["k1"]["circuit_state"] == "open"
    assert statuses["k1"]["status"] == "circuit_open"
    assert statuses["k1"]["status_text"] == "熔断中"
    assert statuses["k2"]["circuit_state"] == "half_open"
    assert statuses["k2"]["status"] == "circuit_half_open"
    assert statuses["k2"]["status_text"] == "探测中"


# ── 3. status 端点暴露 per-pool weight ──────────────────────

def test_status_exposes_weight():
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    data = _build(keys, [_ref("k1", weight=3), _ref("k2", weight=1)])
    _setup(data)
    resp = client.get("/api/admin/api-keys/free/status?sub=sentence")
    statuses = {s["key_id"]: s for s in resp.json()["statuses"]}
    assert statuses["k1"]["weight"] == 3
    assert statuses["k2"]["weight"] == 1


# ── 4. is_busy 反映全局 active_in_flight ────────────────────

def test_status_is_busy_reflects_global_active():
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    data = _build(keys, [_ref("k1"), _ref("k2")])
    g = _setup(data)
    pool = g.pools["free"]["sentence"]
    cfg, idx = pool.get_current(g)
    busy_id = pool.refs[idx]["key_id"]
    assert g.is_key_busy(busy_id) is True

    resp = client.get("/api/admin/api-keys/free/status?sub=sentence")
    statuses = {s["key_id"]: s for s in resp.json()["statuses"]}
    assert statuses[busy_id]["is_busy"] is True
    other = "k2" if busy_id == "k1" else "k1"
    assert statuses[other]["is_busy"] is False

    # 释放后回 False
    pool.mark_complete(g, idx)
    resp2 = client.get("/api/admin/api-keys/free/status?sub=sentence")
    s2 = {s["key_id"]: s for s in resp2.json()["statuses"]}
    assert s2[busy_id]["is_busy"] is False


# ── 5. test 端点跨 pool 同步状态 ───────────────────────────

def test_test_endpoint_syncs_state_across_pools():
    """admin test 端点对同一 key_id 的测试结果会同步到所有引用它的 pool。

    k_good 同时被 free:title 和 free:sentence 引用。测 title 时 _test_key 经
    _apply_to_refs 把结果回写到所有 pool 的 per-ref 运行时，故 sentence 池也能
    拿到 is_valid=True。注意：这是 admin 诊断工具的跨 pool 同步行为，与运行时
    熔断器 per-pool 独立（test_runtime_state_is_per_pool_independent）互不矛盾。
    """
    keys = {"k_good": _kdef("k_good", "sk-good")}
    data = _build(keys, [_ref("k_good")], title_refs=[_ref("k_good")])
    g = _setup(data)
    with patch("httpx.AsyncClient", _FakeAsyncClient):
        client.post("/api/admin/api-keys/free/test?sub=title")

    s_sent = {s["key_id"]: s for s in client.get("/api/admin/api-keys/free/status?sub=sentence").json()["statuses"]}
    s_title = {s["key_id"]: s for s in client.get("/api/admin/api-keys/free/status?sub=title").json()["statuses"]}
    assert s_sent["k_good"]["status"] == "normal"
    assert s_title["k_good"]["status"] == "normal"
    assert s_sent["k_good"]["is_valid"] is True
    assert s_title["k_good"]["is_valid"] is True


# ── 6. SSE 鉴权 ─────────────────────────────────────────────

def test_sse_requires_token():
    """SSE 端点无 token 返回 401。"""
    resp = client.get("/api/admin/api-keys/free/status/stream")
    assert resp.status_code == 401, resp.status_code


def test_sse_rejects_bad_token():
    """SSE 端点对无效 token 返回 401。"""
    resp = client.get("/api/admin/api-keys/free/status/stream?token=invalid")
    assert resp.status_code == 401, resp.status_code


def test_sse_accepts_valid_token():
    """SSE 鉴权依赖对有效 admin token 应放行。"""
    from auth.jwt_utils import create_admin_tokens
    from routers.admin import _require_admin_for_sse
    token = create_admin_tokens()["access_token"]
    admin_data = _require_admin_for_sse(tier="free", token=token)
    assert admin_data is not None


# ── 7. 未知 tier 400 ────────────────────────────────────────

def test_test_endpoint_rejects_unknown_tier():
    """test 端点对未知 tier 返回 400。"""
    resp = client.post("/api/admin/api-keys/unknown/test")
    assert resp.status_code == 400, resp.text


# ── 8. test-all 端点：所有 key 各测一次 ─────────────────────

def test_test_all_endpoint_tests_each_key_once():
    """test-all 端点测试所有 pool 出现过的 key，每个 key_id 只测一次。

    构造 2 个 key（k_good/k_bad），k_good 被 free:sentence 和 free:title 两个 pool
    共同引用，k_bad 只在 free:sentence。test-all 应只测 2 次（不是 3 次）。
    """
    keys = {
        "k_good": _kdef("k_good", "sk-good"),
        "k_bad": _kdef("k_bad", "sk-bad"),
    }
    data = {"keys": keys, "tier_keys": {"free": {
        "title": {"configs": [_ref("k_good")], "active_index": 0},
        "sentence": {"configs": [_ref("k_good"), _ref("k_bad")], "active_index": 0},
        "word": {"configs": [], "active_index": 0},
    }}}
    _setup(data)
    with patch("httpx.AsyncClient", _FakeAsyncClient):
        resp = client.post("/api/admin/api-keys/test-all")
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["count"] == 2, body  # k_good + k_bad，去重后只 2 个
    by_id = {r["key_id"]: r for r in body["results"]}
    assert set(by_id.keys()) == {"k_good", "k_bad"}, by_id
    assert by_id["k_good"]["status"] == "ok", by_id["k_good"]
    assert by_id["k_bad"]["status"] == "invalid", by_id["k_bad"]


def test_test_all_endpoint_route_not_swallowed_by_tier_param():
    """POST /api-keys/test-all 不能被 /api-keys/{tier}/test 拦截成 tier=test-all。

    若路由顺序错，会返回 400 (Invalid tier)。这里应返回 200。
    """
    keys = {"k_good": _kdef("k_good", "sk-good")}
    data = _build(keys, [_ref("k_good")])
    _setup(data)
    with patch("httpx.AsyncClient", _FakeAsyncClient):
        resp = client.post("/api/admin/api-keys/test-all")
    assert resp.status_code == 200, resp.text


if __name__ == "__main__":
    import inspect, sys
    _self = sys.modules[__name__]
    for _name, _fn in sorted(vars(_self).items()):
        if _name.startswith("test_") and inspect.isfunction(_fn):
            _fn()
            print(f"  ok: {_name}")
    print("\n全部测试通过 ✅")
