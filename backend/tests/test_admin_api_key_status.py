"""验证 admin API Key 测试/状态端点的关键回归点：

1. 测试端点不再因 ImportError（旧版 import 了不存在的 get_tier_llm_config）报 500。
2. 测试端点会把每个 Key 的状态回写到 gateway pool。
3. 状态端点对非 429 错误（如 5xx）分类为 'error'，不再误显示为 '正常'。
4. 多个 Key 时分别返回各自结果。
"""

import os
import sys
import json
import tempfile
from unittest.mock import patch

# 覆盖 DATA_DIR 到临时目录，避免污染真实数据
_tmp = tempfile.mkdtemp()
os.environ["DATA_DIR"] = _tmp
os.environ["BASE_DIR"] = _tmp
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

import importlib
import config
importlib.reload(config)

# 写入测试用 tier_keys.json：4 个配置，分别对应
# empty / normal / invalid(401) / error(500, is_valid=True)
_tier_keys = {
    "tier_keys": {
        "free": {
            "configs": [
                {"api_key": "", "base_url": "https://example.com/v1", "model": "m"},
                {"api_key": "sk-good", "base_url": "https://example.com/v1", "model": "m"},
                {"api_key": "sk-bad", "base_url": "https://example.com/v1", "model": "m",
                 "is_valid": False, "last_error": "401 Unauthorized",
                 "last_error_time": "2026-01-01T00:00:00+00:00"},
                {"api_key": "sk-500", "base_url": "https://example.com/v1", "model": "m",
                 "is_valid": True, "last_error": "500 Internal Server Error",
                 "last_error_time": "2026-01-01T00:00:00+00:00"},
            ],
            "active_index": 0,
        }
    }
}
with open(os.path.join(_tmp, "tier_keys.json"), "w", encoding="utf-8") as f:
    json.dump(_tier_keys, f)

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


# ── httpx 替身：按 Authorization 中的 key 后缀返回不同状态码 ──
class _FakeResp:
    def __init__(self, status_code, text=""):
        self.status_code = status_code
        self.text = text


class _FakeAsyncClient:
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


def test_status_classifies_500_as_error_not_normal():
    """状态端点应把 500 错误分类为 'error'，不再误显示为 '正常'。"""
    resp = client.get("/api/admin/api-keys/free/status")
    assert resp.status_code == 200, resp.text
    statuses = resp.json()["statuses"]
    assert statuses[0]["status"] == "empty", statuses[0]
    assert statuses[1]["status"] == "normal", statuses[1]
    assert statuses[2]["status"] == "invalid", statuses[2]
    assert statuses[3]["status"] == "error", statuses[3]      # ← 关键回归点
    assert statuses[3]["status_text"] == "异常", statuses[3]


def test_test_endpoint_no_500_and_writes_back_per_key():
    """测试端点不再 ImportError 报 500，并发返回每个 Key 的结果并回写 pool。"""
    with patch("httpx.AsyncClient", _FakeAsyncClient):
        resp = client.post("/api/admin/api-keys/free/test")
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "results" in data, data
    by_idx = {r["index"]: r for r in data["results"]}
    # 多个 Key 分别返回各自结果
    assert by_idx[0]["status"] == "empty", by_idx[0]
    assert by_idx[1]["status"] == "ok", by_idx[1]
    assert by_idx[2]["status"] == "invalid", by_idx[2]
    assert by_idx[3]["status"] == "error", by_idx[3]

    # pool config 已被回写
    pool = gw_mod.gateway.pools["free"]
    assert pool.configs[1]["last_error"] is None, pool.configs[1]
    assert pool.configs[1]["is_valid"] is True, pool.configs[1]
    assert pool.configs[2]["is_valid"] is False, pool.configs[2]
    assert "500" in pool.configs[3]["last_error"], pool.configs[3]

    # 再次查询状态，应反映测试结果（不再卡在“正常”）
    resp2 = client.get("/api/admin/api-keys/free/status")
    s = resp2.json()["statuses"]
    assert s[1]["status"] == "normal", s[1]
    assert s[2]["status"] == "invalid", s[2]
    assert s[3]["status"] == "error", s[3]


def test_test_endpoint_rejects_unknown_tier():
    """未知 tier 返回 400，不报 500。"""
    resp = client.post("/api/admin/api-keys/unknown/test")
    assert resp.status_code == 400, resp.text


def test_status_includes_is_busy_reflecting_active_per_key():
    """状态端点应返回 is_busy 字段，并反映 active_per_key 的实时占用情况。

    get_current 后 is_busy=True；mark_complete 后 is_busy=False。
    """
    pool = gw_mod.gateway.pools["free"]
    # 清空 active_per_key，避免之前测试残留
    pool.active_per_key.clear()
    pool.active_count = 0
    pool.current_index = 0
    # 清掉所有 rate_limited_until 防止跳过
    pool.rate_limited_until.clear()

    # get_current 返回第一个未禁用、未阻塞的 Key（此处 index 0，虽然 api_key 为空也会被选）
    cfg, idx = pool.get_current()
    assert idx == 0, idx
    assert pool.is_busy(idx) is True

    resp = client.get("/api/admin/api-keys/free/status")
    statuses = resp.json()["statuses"]
    by_idx = {s["index"]: s for s in statuses}
    assert by_idx[0]["is_busy"] is True, by_idx[0]
    assert by_idx[1]["is_busy"] is False, by_idx[1]

    # 释放后应回 False
    pool.mark_complete(idx)
    assert pool.is_busy(idx) is False
    resp2 = client.get("/api/admin/api-keys/free/status")
    s2 = {s["index"]: s for s in resp2.json()["statuses"]}
    assert s2[0]["is_busy"] is False, s2[0]


def test_sse_requires_token():
    """SSE 端点无 token 时应返回 401，避免未认证的实时状态泄露。"""
    resp = client.get("/api/admin/api-keys/free/status/stream")
    assert resp.status_code == 401, resp.status_code


def test_sse_rejects_bad_token():
    """SSE 端点对无效 token 返回 401。"""
    resp = client.get("/api/admin/api-keys/free/status/stream?token=invalid")
    assert resp.status_code == 401, resp.status_code


def test_sse_dependency_accepts_valid_token():
    """SSE 鉴权依赖对有效 admin token 应放行（返回 AdminTokenData）。

    SSE 端点本身是 StreamingResponse，generator 永不退出，无法用 TestClient 直接
    验证响应体。所以单独验证鉴权依赖 + 已有的 _build_key_statuses 单元覆盖即可。
    """
    from auth.jwt_utils import create_admin_tokens
    from routers.admin import _require_admin_for_sse
    token = create_admin_tokens()["access_token"]

    # 直接调用依赖函数：token 校验通过应返回 AdminTokenData 实例
    admin_data = _require_admin_for_sse(tier="free", token=token)
    assert admin_data is not None
    # 无 token / 无效 token 已由 test_sse_requires_token / test_sse_rejects_bad_token 覆盖


if __name__ == "__main__":
    test_status_classifies_500_as_error_not_normal()
    test_test_endpoint_no_500_and_writes_back_per_key()
    test_test_endpoint_rejects_unknown_tier()
    test_status_includes_is_busy_reflecting_active_per_key()
    test_sse_requires_token()
    test_sse_rejects_bad_token()
    test_sse_dependency_accepts_valid_token()
    print("\n全部测试通过 ✅")
