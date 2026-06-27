"""验证 admin API Key 测试/状态端点（引用语义模型）：

1. test 端点按 key_id 测试，结果回写到 gateway 全局 key_runtime。
2. status 端点对非 429 错误（如 5xx）分类为 'error'，不再误显示为'正常'。
3. 多个引用分别返回各自 key 的结果。
4. is_busy 反映 key 全局 active_in_flight。
5. SSE 鉴权不变。
"""

import os
import sys
import json
import tempfile
from unittest.mock import patch

_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import importlib
import config
importlib.reload(config)

# 用新格式写入 4 个 key（empty/normal/invalid/error），全部引用到 free:sentence
_data = {"keys": {
    "k_empty": {"id": "k_empty", "api_key": "", "base_url": "https://example.com/v1", "model": "m", "input_price_per_million": 0, "output_price_per_million": 0},
    "k_good":  {"id": "k_good",  "api_key": "sk-good", "base_url": "https://example.com/v1", "model": "m", "input_price_per_million": 0, "output_price_per_million": 0},
    "k_bad":   {"id": "k_bad",   "api_key": "sk-bad",  "base_url": "https://example.com/v1", "model": "m", "input_price_per_million": 0, "output_price_per_million": 0},
    "k_500":   {"id": "k_500",   "api_key": "sk-500", "base_url": "https://example.com/v1", "model": "m", "input_price_per_million": 0, "output_price_per_million": 0},
}, "tier_keys": {"free": {
    "title":    {"configs": [], "active_index": 0},
    "sentence": {"configs": [
        {"key_id": "k_empty", "max_tokens": None, "disabled": False},
        {"key_id": "k_good",  "max_tokens": None, "disabled": False},
        {"key_id": "k_bad",   "max_tokens": None, "disabled": False},
        {"key_id": "k_500",   "max_tokens": None, "disabled": False},
    ], "active_index": 0},
    "word":     {"configs": [], "active_index": 0},
}}}
with open(os.path.join(_tmp, "tier_keys.json"), "w", encoding="utf-8") as f:
    json.dump(_data, f)

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


class _FakeResp:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text


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


def test_test_endpoint_writes_back_per_key_runtime():
    """test 端点按 key_id 测试，结果回写到 gateway 全局 key_runtime。"""
    with patch("httpx.AsyncClient", _FakeAsyncClient):
        resp = client.post("/api/admin/api-keys/free/test?sub=sentence")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "results" in data, data
    by_idx = {r["index"]: r for r in data["results"]}
    assert by_idx[0]["status"] == "empty", by_idx[0]
    assert by_idx[1]["status"] == "ok", by_idx[1]
    assert by_idx[2]["status"] == "invalid", by_idx[2]
    assert by_idx[3]["status"] == "error", by_idx[3]

    # key_runtime 已被回写（全局，按 key_id）
    g = gw_mod.gateway
    assert g.key_runtime["k_good"]["last_error"] is None
    assert g.key_runtime["k_good"]["is_valid"] is True
    assert g.key_runtime["k_bad"]["is_valid"] is False
    assert "500" in g.key_runtime["k_500"]["last_error"], g.key_runtime["k_500"]


def test_status_classifies_500_as_error_not_normal():
    """状态端点应把 500 错误分类为 'error'（依赖上一步 test 写入的 runtime）。"""
    resp = client.get("/api/admin/api-keys/free/status?sub=sentence")
    assert resp.status_code == 200, resp.text
    statuses = resp.json()["statuses"]
    by_idx = {s["index"]: s for s in statuses}
    assert by_idx[0]["status"] == "empty", by_idx[0]
    assert by_idx[1]["status"] == "normal", by_idx[1]
    assert by_idx[2]["status"] == "invalid", by_idx[2]
    assert by_idx[3]["status"] == "error", by_idx[3]      # ← 关键回归点
    assert by_idx[3]["status_text"] == "异常", by_idx[3]


def test_test_endpoint_rejects_unknown_tier():
    """未知 tier 返回 400，不报 500。"""
    resp = client.post("/api/admin/api-keys/unknown/test")
    assert resp.status_code == 400, resp.text


def test_status_includes_is_busy_reflecting_global_active():
    """is_busy 反映 key 全局 active_in_flight：get_current 后 True，mark_complete 后 False。"""
    g = gw_mod.gateway
    pool = g.pools["free"]["sentence"]
    # 清空所有 key 的 active_in_flight 和 rate_limited_until
    for kid in g.key_runtime:
        g.key_runtime[kid]["active_in_flight"] = 0
        g.key_runtime[kid]["rate_limited_until"] = None
    pool.active_count = 0
    pool.current_index = 0
    pool.consecutive_fail_start = None

    # get_current 占用第一个可用 key（k_empty，虽然 api_key 空也会被选）
    cfg, idx = pool.get_current(g)
    assert idx == 0, idx
    busy_key = pool.refs[idx]["key_id"]
    assert g.is_key_busy(busy_key) is True

    resp = client.get("/api/admin/api-keys/free/status?sub=sentence")
    statuses = resp.json()["statuses"]
    by_idx = {s["index"]: s for s in statuses}
    assert by_idx[0]["is_busy"] is True, by_idx[0]
    assert by_idx[1]["is_busy"] is False, by_idx[1]

    # 释放后应回 False
    pool.mark_complete(g, idx)
    assert g.is_key_busy(busy_key) is False
    resp2 = client.get("/api/admin/api-keys/free/status?sub=sentence")
    s2 = {s["index"]: s for s in resp2.json()["statuses"]}
    assert s2[0]["is_busy"] is False, s2[0]


def test_sse_requires_token():
    """SSE 端点无 token 时应返回 401。"""
    resp = client.get("/api/admin/api-keys/free/status/stream")
    assert resp.status_code == 401, resp.status_code


def test_sse_rejects_bad_token():
    """SSE 端点对无效 token 返回 401。"""
    resp = client.get("/api/admin/api-keys/free/status/stream?token=invalid")
    assert resp.status_code == 401, resp.status_code


def test_sse_dependency_accepts_valid_token():
    """SSE 鉴权依赖对有效 admin token 应放行。"""
    from auth.jwt_utils import create_admin_tokens
    from routers.admin import _require_admin_for_sse
    token = create_admin_tokens()["access_token"]
    admin_data = _require_admin_for_sse(tier="free", token=token)
    assert admin_data is not None


def test_runtime_state_global_across_pools_in_status():
    """同一 key 被多个 pool 引用时，status 端点在两个 pool 都显示同一全局状态。

    把 k_good 同时引用到 free:sentence 和 free:title，test 后两处状态一致。
    """
    import llm_api
    # 把 k_good 也引用到 free:title
    llm_api.update_tier_keys("free", "title", [
        {"key_id": "k_good", "max_tokens": None, "disabled": False},
    ], 0)
    # 触发 reload
    importlib.reload(gw_mod)

    with patch("httpx.AsyncClient", _FakeAsyncClient):
        client.post("/api/admin/api-keys/free/test?sub=title")

    # 两个 pool 的 k_good 状态应一致（都是 normal，last_error=None）
    s_sent = {s["key_id"]: s for s in client.get("/api/admin/api-keys/free/status?sub=sentence").json()["statuses"]}
    s_title = {s["key_id"]: s for s in client.get("/api/admin/api-keys/free/status?sub=title").json()["statuses"]}
    assert s_sent["k_good"]["status"] == "normal"
    assert s_title["k_good"]["status"] == "normal"
    assert s_sent["k_good"]["is_valid"] is True
    assert s_title["k_good"]["is_valid"] is True


if __name__ == "__main__":
    test_test_endpoint_writes_back_per_key_runtime()
    test_status_classifies_500_as_error_not_normal()
    test_test_endpoint_rejects_unknown_tier()
    test_status_includes_is_busy_reflecting_global_active()
    test_sse_requires_token()
    test_sse_rejects_bad_token()
    test_sse_dependency_accepts_valid_token()
    test_runtime_state_global_across_pools_in_status()
    print("\n全部测试通过 ✅")
