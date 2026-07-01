# Key 轮换重写 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 LLM Gateway 的 key 调度从 SWRR+batch/interval 重写为纯轮询+熔断器,支持多用户并发,删除废弃的 weight/batch_size/interval 配置字段。

**Architecture:** `TierKeyPool.get_current` 用原子 counter 轮询 + 向前扫描跳过不可用 key 替换 SWRR;删除 batch_size/interval/active_count 协调逻辑;保留熔断器状态机、Retry-After、能力探测、max_tokens 折半、引用模型、sub-pool 分离;数据层删除 weight/active_index 字段,前端删除对应 UI。

**Tech Stack:** Python 3.10 / FastAPI / httpx / React 18 / Vite

**Spec:** [docs/superpowers/specs/2026-07-02-key-rotation-rewrite-design.md](file:///workspace/docs/superpowers/specs/2026-07-02-key-rotation-rewrite-design.md)

---

## File Structure

| 文件 | 责任 | 操作 |
|------|------|------|
| `backend/utils/llm_gateway.py` | LLM 调用网关:轮询调度 + 熔断器 | 重写 `TierKeyPool`,改 `call()` |
| `backend/llm_api.py` | key 仓库 + tier_keys 持久化 + 迁移 | 删 weight/active_index 生成 |
| `backend/routers/admin.py` | admin API 路由 | 删 weight status、GlobalSettingsUpdate 字段、TierKeyUpdate.active_index |
| `backend/tests/test_gateway_key_pool.py` | gateway 测试 | 重写 helpers + 轮询测试,改写保留测试 |
| `frontend/src/utils/adminApi.js` | admin 前端 API 封装 | updateApiKeys 不传 weight/active_index |
| `frontend/src/components/admin/AdminApiKeys.jsx` | admin key 管理 UI | 删全局设置区、weight 列 |

---

## Task 1: 重写测试 helpers + 新增轮询测试(TDD 先写失败测试)

测试 helper 签名变更会破坏所有现有测试调用点,所以本任务一次性更新所有 helper + 所有 `_ref(...)` 调用点(去掉 weight 参数)+ 新增轮询测试。测试此时会 FAIL(get_current 还是 SWRR,断言 counter 行为不通过)。

**Files:**
- Modify: `backend/tests/test_gateway_key_pool.py`

- [ ] **Step 1: 更新文件头注释 + helper 函数**

替换 `backend/tests/test_gateway_key_pool.py` 第 1-54 行(文件头注释 + `_kdef`/`_ref`/`_build_data`):

```python
"""验证 gateway Key 池的引用语义模型 + 纯轮询 + 熔断器 + Retry-After 行为。

覆盖要点：
1. 纯轮询（原子 counter 推进 / 跳过 disabled / 跳过熔断 open / reload 保留 counter）
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


def _ref(kid, max_tokens=None, disabled=False):
    """构造一个 pool 引用（不再含 weight）。"""
    return {"key_id": kid, "max_tokens": max_tokens, "disabled": disabled}


def _build_data(keys, sentence_refs, tier="free"):
    """构造新格式数据：keys 为 {kid: kdef}，sentence_refs 为 [ref,...]（不再含 active_index）。"""
    return {"keys": keys, "tier_keys": {tier: {
        "title": {"configs": []},
        "sentence": {"configs": sentence_refs},
        "word": {"configs": []},
    }}}
```

- [ ] **Step 2: 替换 SWRR 测试为轮询测试**

找到文件中 `# ── 1. SWRR 平滑加权轮询` 章节标题到 `# ── 2. 熔断器状态机` 之前(原 `test_swrr_equal_weights_distribute_evenly`、`test_swrr_weighted_distribution`、`test_swrr_skips_disabled_ref`、`test_swrr_skips_circuit_open_key` 四个函数),整段替换为:

```python
# ── 1. 纯轮询 ──────────────────────────────────────────────

def test_rotation_distributes_evenly():
    """两个等权 key，8 次 pick 应 4/4 交替分布（counter 每次推进 1）。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    pool = gw.gateway.pools["free"]["sentence"]
    counts = {0: 0, 1: 0}
    for _ in range(8):
        cfg, idx = pool.get_current(gw.gateway)
        counts[idx] += 1
        pool.mark_complete(gw.gateway, idx)
    assert counts == {0: 4, 1: 4}, counts


def test_rotation_skips_disabled():
    """disabled 的 ref 不参与轮询，始终选可用 key。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1", disabled=True), _ref("k2")]))
    pool = gw.gateway.pools["free"]["sentence"]
    for _ in range(4):
        cfg, idx = pool.get_current(gw.gateway)
        assert idx == 1, idx
        assert cfg["api_key"] == "sk-2"
        pool.mark_complete(gw.gateway, idx)
    assert pool.has_any_usable_key(gw.gateway) is True


def test_rotation_skips_circuit_open_key():
    """熔断 open 且在阻塞期内的 key 不参与轮询。"""
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


def test_rotation_advances_counter_each_pick():
    """每次 pick 都推进 counter，连续 pick 不重复同一 key（n=2 时交替）。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    pool = gw.gateway.pools["free"]["sentence"]
    seq = []
    for _ in range(6):
        cfg, idx = pool.get_current(gw.gateway)
        seq.append(idx)
        pool.mark_complete(gw.gateway, idx)
    # 交替：0,1,0,1,0,1
    assert seq == [0, 1, 0, 1, 0, 1], seq
    assert pool.counter == 6, pool.counter
```

- [ ] **Step 3: 替换 reload 相关测试(SWRR → counter)**

找到 `# ── 7. reload() 不再重置 SWRR 状态` 章节到 `# ── 8.` 之前(原 `test_reload_preserves_swrr_state_when_refs_unchanged`、`test_reload_preserves_swrr_state_when_refs_reordered`、`test_reload_preserves_swrr_state_when_refs_shrink`、`test_reload_preserves_active_count_and_consecutive_fail` 四个函数),整段替换为:

```python
# ── 7. reload() 不再重置 counter ──────────────────────────

def test_reload_preserves_counter_when_refs_unchanged():
    """reload() 时若 refs 内容未变，应保留旧 pool 对象（包括 counter）。

    回归：之前每次 admin 改配置都重置轮询状态，导致每次都从第一个 key 开始（不轮换）。
    """
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    pool = gw.gateway.pools["free"]["sentence"]
    # 制造 counter 状态：pick 一次 → counter=1
    cfg, idx = pool.get_current(gw.gateway); pool.mark_complete(gw.gateway, idx)
    assert pool.counter == 1, pool.counter
    # reload（refs 未变）
    gw.gateway.reload()
    new_pool = gw.gateway.pools["free"]["sentence"]
    # 同一对象引用 + counter 保留
    assert new_pool is pool, "refs 未变时应保留旧 pool 对象"
    assert new_pool.counter == 1, new_pool.counter


def test_reload_preserves_counter_when_refs_reordered():
    """reload() 时若 refs 顺序变了（拖拽重排），应保留 counter。

    refs 内容变化时按 _rebuild_preserving_state 复用 counter，避免重置轮询位置。
    counter 是纯整数，不受 refs 内容变化影响（只受长度影响，见下个测试）。
    """
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    pool = gw.gateway.pools["free"]["sentence"]
    cfg, idx = pool.get_current(gw.gateway); pool.mark_complete(gw.gateway, idx)
    assert pool.counter == 1
    # 拖拽重排：把 k2 移到 k1 前面
    import llm_api
    llm_api.update_tier_keys("free", "sentence", [
        {"key_id": "k2", "max_tokens": None, "disabled": False},
        {"key_id": "k1", "max_tokens": None, "disabled": False},
    ])
    # reload 后 counter 应保留
    new_pool = gw.gateway.pools["free"]["sentence"]
    assert new_pool.counter == 1, new_pool.counter


def test_reload_wraps_counter_when_refs_shrink():
    """reload() 时若 refs 变少（删除引用），counter 对新长度取模。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2"), "k3": _kdef("k3", "sk-3")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2"), _ref("k3")]))
    pool = gw.gateway.pools["free"]["sentence"]
    # pick 5 次 → counter=5（5 % 3 = 2）
    for _ in range(5):
        cfg, idx = pool.get_current(gw.gateway)
        pool.mark_complete(gw.gateway, idx)
    assert pool.counter == 5
    # 删除 k3 引用，新长度=2 → counter % 2 = 1
    import llm_api
    llm_api.update_tier_keys("free", "sentence", [
        {"key_id": "k1", "max_tokens": None, "disabled": False},
        {"key_id": "k2", "max_tokens": None, "disabled": False},
    ])
    new_pool = gw.gateway.pools["free"]["sentence"]
    assert new_pool.counter == 1, new_pool.counter  # 5 % 2 = 1


def test_reload_preserves_consecutive_fail():
    """reload() 时若 refs 变了，应保留 consecutive_fail_start（避免重置失败计时）。"""
    keys = {"k1": _kdef("k1", "sk-1"), "k2": _kdef("k2", "sk-2")}
    gw = _setup(_build_data(keys, [_ref("k1"), _ref("k2")]))
    pool = gw.gateway.pools["free"]["sentence"]
    # 制造 consecutive_fail_start：mark_server_error
    pool.mark_server_error(gw.gateway, 0)
    assert pool.consecutive_fail_start is not None
    fail_start = pool.consecutive_fail_start
    # 修改 refs 触发 reload
    import llm_api
    llm_api.update_tier_keys("free", "sentence", [
        {"key_id": "k1", "max_tokens": 8192, "disabled": False},
        {"key_id": "k2", "max_tokens": 8192, "disabled": False},
    ])
    new_pool = gw.gateway.pools["free"]["sentence"]
    assert new_pool.consecutive_fail_start == fail_start, "consecutive_fail_start 应保留"
```

- [ ] **Step 4: 运行测试验证新轮询测试失败**

Run: `cd backend && python -m pytest tests/test_gateway_key_pool.py -v 2>&1 | head -60`
Expected: 多个 `test_rotation_*` 和 `test_reload_preserves_counter*` FAIL（get_current 还是 SWRR，counter 属性不存在；_build_data 不传 active_index 时旧 _normalize_old_tier 可能报错）。熔断器/Retry-After/引用语义/max_tokens 等保留测试应仍能通过或仅因 helper 改动小范围失败。

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_gateway_key_pool.py
git commit -m "test: rewrite gateway tests for counter-based rotation (failing)
```

---

## Task 2: 重写 TierKeyPool + LLMGateway.call(实现,使测试通过)

**Files:**
- Modify: `backend/utils/llm_gateway.py`

- [ ] **Step 1: 重写 TierKeyPool 类**

替换 `backend/utils/llm_gateway.py` 第 66-244 行(整个 `TierKeyPool` 类,从 `class TierKeyPool:` 到 `wait_for_interval` 方法结束)为:

```python
class TierKeyPool:
    """单个 tier/sub 的引用池。只持有引用 + per-pool 配置，不持有 key 定义。

    调度算法：原子 counter 轮询 + 向前扫描跳过不可用 key。
    - 每次 get_current 都 counter+=1，从新位置向前扫描，跳过 disabled/熔断 open
    - 多用户并发时每个 pick 拿到不同起始位置，天然均匀分布到不同 key，互不阻塞
    熔断器：closed → 连续失败 N 次 → open（阻塞 cooldown）→ 到期 → half_open（放 1 个探测）→ 成功 closed / 失败 open。
    Retry-After：429 带 Retry-After 头时按其值阻塞，否则只切 key 不阻塞。
    """

    FAIL_DEADLINE = 600  # 连续失败 10 分钟才放弃

    def __init__(self, tier: str, sub: str, refs: list):
        self.tier = tier
        self.sub = sub
        self.refs = refs  # [{key_id, max_tokens, disabled}]
        self.lock = threading.Lock()
        self.counter = 0  # 轮询计数器（每次 pick 推进 1）
        self.consecutive_fail_start = None  # per-pool 连续失败起点

    @classmethod
    def _rebuild_preserving_state(cls, old_pool: "TierKeyPool", refs: list) -> "TierKeyPool":
        """构造新 pool 但保留旧 counter/consecutive_fail_start 状态。

        refs 长度变化时 counter 对新长度取模，避免越界。
        """
        new_pool = cls(old_pool.tier, old_pool.sub, refs)
        # 保留 counter：长度变化时取模，避免越界
        if refs:
            new_pool.counter = old_pool.counter % len(refs)
        else:
            new_pool.counter = 0
        new_pool.consecutive_fail_start = old_pool.consecutive_fail_start
        return new_pool

    def _key_def(self, gateway, key_id) -> dict:
        return gateway.key_defs.get(key_id, {})

    def _runtime(self, gateway, key_id) -> dict:
        return gateway.key_runtime.get(key_id) or gateway._ensure_runtime(key_id)

    def get_current(self, gateway) -> Optional[tuple]:
        """轮询选一个可用 key，返回 (resolved_config, idx) 或 None。

        每次 pick 都 counter+=1，从新位置向前扫描，跳过：
        per-pool disabled、熔断 open（未到期）、half-open 已有探测在途的 key。
        """
        with self.lock:
            n = len(self.refs)
            if n == 0:
                return None
            start = self.counter
            self.counter += 1
            now = time.time()
            for offset in range(n):
                idx = (start + offset) % n
                ref = self.refs[idx]
                if ref.get("disabled"):
                    continue
                key_id = ref.get("key_id")
                if not gateway._is_key_available_for_pick(key_id, now):
                    continue
                # 命中：占用 + 标记 half_open 探测 + 返回
                gateway._inc_active(key_id)
                gateway._mark_key_picked(key_id)
                kdef = gateway.key_defs.get(key_id, {})
                config = {
                    "id": key_id,
                    "api_key": kdef.get("api_key", ""),
                    "base_url": kdef.get("base_url", ""),
                    "model": kdef.get("model", ""),
                    "input_price_per_million": kdef.get("input_price_per_million", 0),
                    "output_price_per_million": kdef.get("output_price_per_million", 0),
                }
                gateway._notify()
                return config, idx
            return None

    def mark_complete(self, gateway, idx):
        """成功：该 key 熔断器复位为 closed。"""
        key_id = self.refs[idx].get("key_id")
        with self.lock:
            self.consecutive_fail_start = None
        gateway._mark_key_complete(key_id)

    def _mark_fail(self, gateway, idx, fail_type: str, retry_after: Optional[int] = None):
        """失败：该 key 熔断器状态推进。"""
        key_id = self.refs[idx].get("key_id")
        with self.lock:
            if self.consecutive_fail_start is None:
                self.consecutive_fail_start = time.time()
        if fail_type == "rate_limited":
            gateway._mark_key_rate_limited(key_id, retry_after=retry_after)
        elif fail_type == "invalid":
            gateway._mark_key_invalid(key_id)
        elif fail_type == "server_error":
            gateway._mark_key_server_error(key_id)
        elif fail_type == "network":
            gateway._mark_key_network_error(key_id)

    def mark_rate_limited(self, gateway, idx, retry_after: Optional[int] = None):
        self._mark_fail(gateway, idx, "rate_limited", retry_after=retry_after)

    def mark_invalid(self, gateway, idx):
        self._mark_fail(gateway, idx, "invalid")

    def mark_server_error(self, gateway, idx):
        self._mark_fail(gateway, idx, "server_error")

    def mark_network_error(self, gateway, idx):
        self._mark_fail(gateway, idx, "network")

    def is_all_failed_too_long(self) -> bool:
        with self.lock:
            if self.consecutive_fail_start is None:
                return False
            return (time.time() - self.consecutive_fail_start) >= self.FAIL_DEADLINE

    def has_any_usable_key(self, gateway) -> bool:
        """是否存在未被 disabled 的引用（且 key 定义存在）。"""
        with self.lock:
            return any(
                not r.get("disabled") and r.get("key_id") in gateway.key_defs
                for r in self.refs
            )

    def next_available_time(self, gateway) -> Optional[float]:
        """最近一个被阻塞 key 的恢复时间戳。"""
        now = time.time()
        candidates = []
        for ref in self.refs:
            if ref.get("disabled"):
                continue
            rt = gateway.key_runtime.get(ref.get("key_id"))
            if rt and rt.get("rate_limited_until") and rt["rate_limited_until"] > now:
                candidates.append(rt["rate_limited_until"])
        return min(candidates) if candidates else None
```

- [ ] **Step 2: 重写 LLMGateway._reload_all(去掉 batch_size/interval)**

替换 `backend/utils/llm_gateway.py` 中 `_reload_all` 方法(原第 462-495 行)为:

```python
    def _reload_all(self):
        """增量重载：refs 未变的 pool 完全保留旧对象；refs 变了的 pool 用
        _rebuild_preserving_state 保留 counter/consecutive_fail_start，
        避免 admin 改配置（禁用/排序/增删引用）就重置轮询位置。

        key_defs 总是刷新（不影响 counter 状态）。
        """
        data = _load_data()
        self.key_defs = data.get("keys", {})
        old_pools = self.pools or {}
        new_pools = {}
        for tier, raw_tier in data.get("tier_keys", {}).items():
            tier_pools = {}
            old_tier = old_pools.get(tier, {})
            for sub in SUB_POOLS:
                sub_data = raw_tier.get(sub) or {}
                refs = sub_data.get("configs", [])
                old_pool = old_tier.get(sub)
                if old_pool is not None and old_pool.refs is refs:
                    # 同一引用对象（理论上不会发生，但留作快速路径）
                    tier_pools[sub] = old_pool
                elif old_pool is not None and old_pool.refs == refs:
                    # refs 内容完全没变 → 保留旧 pool（包括 counter 状态）
                    tier_pools[sub] = old_pool
                elif old_pool is not None:
                    # refs 变了 → 重建但保留状态
                    tier_pools[sub] = TierKeyPool._rebuild_preserving_state(old_pool, refs)
                else:
                    tier_pools[sub] = TierKeyPool(tier, sub, refs)
            new_pools[tier] = tier_pools
        self.pools = new_pools
```

- [ ] **Step 3: 确认 __init__ 无需改动 + 标记 _load_global_settings 为死代码**

`LLMGateway.__init__` 本身不加载 settings(它只调用 `_reload_all()`),Step 2 已重写 `_reload_all` 不再读 settings,故 `__init__` 无需改动。

模块级 `_load_global_settings` 函数(原第 35-40 行)在 Step 2 后不再被任何代码调用,变为死代码。本步骤**保留它**以降低风险(避免删函数触发其他引用),后续可在独立清理任务删除。`_parse_retry_after` 仍被 `call()` 使用,必须保留。

运行快速验证:

Run: `cd backend && grep -n "_load_global_settings" utils/llm_gateway.py`
Expected: 只剩函数定义本身(1 处),无其他调用点。

- [ ] **Step 4: 去掉 call() 中的 wait_for_interval 调用**

在 `backend/utils/llm_gateway.py` 的 `call` 方法中(原第 537 行附近),删除:

```python
        await pool.wait_for_interval()

```

这一行(含其上方空行)。删除后 `call` 流程为:`_resolve_pool` → `is_all_failed_too_long` 检查 → `get_current` → 发请求。

- [ ] **Step 5: 运行测试验证通过**

Run: `cd backend && python -m pytest tests/test_gateway_key_pool.py -v 2>&1 | tail -40`
Expected: 所有测试 PASS,包括新轮询测试和保留的熔断器/Retry-After/引用语义/max_tokens/sub-pool/capabilities 测试。

- [ ] **Step 6: Commit**

```bash
git add backend/utils/llm_gateway.py
git commit -m "refactor: rewrite TierKeyPool to counter-based rotation

- get_current 用原子 counter 轮询 + 向前扫描跳过不可用 key 替换 SWRR
- 删除 batch_size/interval/active_count/last_switch_time/wait_for_interval
- _rebuild_preserving_state 用 counter 替代 swrr_weights
- call() 去掉 wait_for_interval 调用
- 保留熔断器/Retry-After/能力探测/max_tokens 折半/引用模型/sub-pool"
```

---

## Task 3: 更新 llm_api.py(删 weight/active_index 生成)

**Files:**
- Modify: `backend/llm_api.py`

- [ ] **Step 1: _migrate_old 不再生成 weight 字段**

在 `backend/llm_api.py` 的 `_migrate_old` 函数中(原第 112-117 行),找到构造 new_refs 的代码:

```python
                new_refs.append({
                    "key_id": kid,
                    "max_tokens": cfg.get("max_tokens"),
                    "disabled": cfg.get("disabled", False),
                    "weight": cfg.get("weight", 1),
                })
```

替换为(删 weight):

```python
                new_refs.append({
                    "key_id": kid,
                    "max_tokens": cfg.get("max_tokens"),
                    "disabled": cfg.get("disabled", False),
                })
```

- [ ] **Step 2: _normalize_old_tier 不再保留 active_index**

在 `backend/llm_api.py` 的 `_normalize_old_tier` 函数中(原第 64-77 行),原代码:

```python
def _normalize_old_tier(raw: dict) -> dict:
    """把单 tier 的老数据归一化为 {sub: {configs, active_index}}。"""
    if any(sub in raw for sub in SUB_POOLS):
        result = {}
        for sub in SUB_POOLS:
            sub_data = raw.get(sub) or {}
            result[sub] = {
                "configs": sub_data.get("configs", []),
                "active_index": sub_data.get("active_index", 0),
            }
        return result
    configs = raw.get("configs", [])
    active_index = raw.get("active_index", 0)
    return {sub: {"configs": list(configs), "active_index": active_index} for sub in SUB_POOLS}
```

替换为(归一化为 {sub: {configs}},不再保留 active_index;向后兼容老数据中的 active_index 被忽略):

```python
def _normalize_old_tier(raw: dict) -> dict:
    """把单 tier 的老数据归一化为 {sub: {configs}}。active_index 字段忽略（轮询不依赖）。"""
    if any(sub in raw for sub in SUB_POOLS):
        return {sub: {"configs": (raw.get(sub) or {}).get("configs", [])} for sub in SUB_POOLS}
    configs = raw.get("configs", [])
    return {sub: {"configs": list(configs)} for sub in SUB_POOLS}
```

- [ ] **Step 3: _migrate_old 的 new_tier_keys 构造去掉 active_index**

在 `backend/llm_api.py` 的 `_migrate_old` 中(原第 118 行),找到:

```python
            new_tier_keys[tier][sub] = {"configs": new_refs, "active_index": pool.get("active_index", 0)}
```

替换为:

```python
            new_tier_keys[tier][sub] = {"configs": new_refs}
```

- [ ] **Step 4: get_tier_keys 返回去掉 active_index**

在 `backend/llm_api.py` 的 `get_tier_keys` 函数中(原第 247-258 行),原代码:

```python
    # tier_keys 补齐所有 tier/sub（即使为空）
    tier_keys = {}
    for tier in ("free", "basic", "pro"):
        tier_data = data.get("tier_keys", {}).get(tier, {})
        tier_keys[tier] = {}
        for sub in SUB_POOLS:
            pool = tier_data.get(sub) or {"configs": [], "active_index": 0}
            tier_keys[tier][sub] = {
                "configs": pool.get("configs", []),
                "active_index": pool.get("active_index", 0),
            }
    return {"keys": keys, "tier_keys": tier_keys}
```

替换为:

```python
    # tier_keys 补齐所有 tier/sub（即使为空）
    tier_keys = {}
    for tier in ("free", "basic", "pro"):
        tier_data = data.get("tier_keys", {}).get(tier, {})
        tier_keys[tier] = {}
        for sub in SUB_POOLS:
            pool = tier_data.get(sub) or {"configs": []}
            tier_keys[tier][sub] = {"configs": pool.get("configs", [])}
    return {"keys": keys, "tier_keys": tier_keys}
```

- [ ] **Step 5: update_tier_keys 签名去掉 active_index**

在 `backend/llm_api.py` 的 `update_tier_keys` 函数中(原第 261-280 行),原签名和实现:

```python
def update_tier_keys(tier: str, sub: str, refs: list, active_index: int = 0):
    """更新指定 tier/sub 的引用列表（结构性操作：增删/排序/粘贴引用）。

    refs = [{key_id, max_tokens, disabled}, ...]
    """
    if sub not in SUB_POOLS:
        raise ValueError(f"Invalid sub: {sub}, expected one of {SUB_POOLS}")
    if tier not in ("free", "basic", "pro"):
        raise ValueError(f"Invalid tier: {tier}")
    data = _load_data()
    tier_keys = data.setdefault("tier_keys", {})
    tier_data = tier_keys.setdefault(tier, {})
    # 校验所有 key_id 存在
    existing_keys = set(data.get("keys", {}).keys())
    for ref in refs:
        if ref.get("key_id") not in existing_keys:
            raise ValueError(f"key_id {ref.get('key_id')} 不存在")
    tier_data[sub] = {"configs": refs, "active_index": active_index}
    _save_data(data)
    _reload_gateway()
```

替换为(去掉 active_index 参数;保存时 strip 掉 refs 中可能残留的 weight 字段,保证向后兼容):

```python
def update_tier_keys(tier: str, sub: str, refs: list):
    """更新指定 tier/sub 的引用列表（结构性操作：增删/排序/粘贴引用）。

    refs = [{key_id, max_tokens, disabled}, ...]  (weight 字段被忽略并丢弃)
    """
    if sub not in SUB_POOLS:
        raise ValueError(f"Invalid sub: {sub}, expected one of {SUB_POOLS}")
    if tier not in ("free", "basic", "pro"):
        raise ValueError(f"Invalid tier: {tier}")
    data = _load_data()
    tier_keys = data.setdefault("tier_keys", {})
    tier_data = tier_keys.setdefault(tier, {})
    # 校验所有 key_id 存在；strip 掉残留的 weight 字段
    existing_keys = set(data.get("keys", {}).keys())
    clean_refs = []
    for ref in refs:
        kid = ref.get("key_id")
        if kid not in existing_keys:
            raise ValueError(f"key_id {kid} 不存在")
        clean_refs.append({
            "key_id": kid,
            "max_tokens": ref.get("max_tokens"),
            "disabled": ref.get("disabled", False),
        })
    tier_data[sub] = {"configs": clean_refs}
    _save_data(data)
    _reload_gateway()
```

- [ ] **Step 6: 运行测试验证仍通过**

Run: `cd backend && python -m pytest tests/test_gateway_key_pool.py -v 2>&1 | tail -15`
Expected: 全部 PASS。

- [ ] **Step 7: Commit**

```bash
git add backend/llm_api.py
git commit -m "refactor: drop weight/active_index from llm_api data model

- _migrate_old 不再生成 weight 字段
- _normalize_old_tier/get_tier_keys 不再保留 active_index
- update_tier_keys 去掉 active_index 参数,strip 残留 weight"
```

---

## Task 4: 更新 admin.py(删 weight status、GlobalSettingsUpdate 字段、TierKeyUpdate.active_index)

**Files:**
- Modify: `backend/routers/admin.py`

- [ ] **Step 1: _build_key_statuses 去掉 weight 行**

在 `backend/routers/admin.py` 的 `_build_key_statuses` 函数中(原第 514 行附近),删除这一行:

```python
            "weight": ref.get("weight", 1),  # per-pool
```

删除后该 status_info 字典不再含 weight 键。

- [ ] **Step 2: TierKeyUpdate 去掉 active_index 字段**

在 `backend/routers/admin.py`(原第 269-273 行),原代码:

```python
class TierKeyUpdate(BaseModel):
    configs: List[dict]  # refs: [{key_id, max_tokens, disabled}]
    active_index: int = 0
    sub: str = "sentence"
```

替换为:

```python
class TierKeyUpdate(BaseModel):
    configs: List[dict]  # refs: [{key_id, max_tokens, disabled}]
    sub: str = "sentence"
```

- [ ] **Step 3: update_api_keys 路由不再传 active_index**

在 `backend/routers/admin.py` 的 `update_api_keys`(原第 275-286 行),原代码:

```python
@router.put("/api-keys/{tier}")
async def update_api_keys(tier: str, req: TierKeyUpdate, admin: AdminTokenData = Depends(require_admin)):
    if tier not in ("free", "basic", "pro"):
        raise HTTPException(status_code=400, detail="Invalid tier")
    if req.sub not in ("title", "sentence", "word"):
        raise HTTPException(status_code=400, detail="Invalid sub")
    try:
        update_tier_keys(tier, req.sub, req.configs, req.active_index)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _log_action("update_api_keys", "tier", tier, {"sub": req.sub, "ref_count": len(req.configs)})
    return {"status": "ok"}
```

替换为(去掉 req.active_index 实参):

```python
@router.put("/api-keys/{tier}")
async def update_api_keys(tier: str, req: TierKeyUpdate, admin: AdminTokenData = Depends(require_admin)):
    if tier not in ("free", "basic", "pro"):
        raise HTTPException(status_code=400, detail="Invalid tier")
    if req.sub not in ("title", "sentence", "word"):
        raise HTTPException(status_code=400, detail="Invalid sub")
    try:
        update_tier_keys(tier, req.sub, req.configs)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    _log_action("update_api_keys", "tier", tier, {"sub": req.sub, "ref_count": len(req.configs)})
    return {"status": "ok"}
```

- [ ] **Step 4: GlobalSettingsUpdate 去掉 request_interval/batch_size**

在 `backend/routers/admin.py`(原第 1142-1162 行),原代码:

```python
class GlobalSettingsUpdate(BaseModel):
    request_interval: Optional[float] = None
    batch_size: Optional[int] = None


@router.put("/global-settings")
async def update_global_settings(req: GlobalSettingsUpdate, admin: AdminTokenData = Depends(require_admin)):
    settings = _load_global_settings()
    if req.request_interval is not None:
        settings["request_interval"] = req.request_interval
    if req.batch_size is not None:
        settings["batch_size"] = req.batch_size
    _save_global_settings(settings)
    # 通知 gateway 刷新配置
    try:
        from utils.llm_gateway import gateway
        gateway.reload()
    except Exception:
        pass
    _log_action("update_global_settings", details=settings)
    return settings
```

替换为(空模型,endpoint 保留以兼容前端可能残留的调用,但不再写任何字段):

```python
class GlobalSettingsUpdate(BaseModel):
    """已废弃：gateway 不再使用 batch_size/request_interval。保留空模型以兼容前端调用。"""
    pass


@router.put("/global-settings")
async def update_global_settings(req: GlobalSettingsUpdate, admin: AdminTokenData = Depends(require_admin)):
    """已废弃：不再有可配置字段。保留 endpoint 以兼容前端，返回空对象。"""
    settings = {}
    _save_global_settings(settings)
    _log_action("update_global_settings", details=settings)
    return settings
```

- [ ] **Step 5: _load_global_settings 默认值改 {}**

在 `backend/routers/admin.py`(原第 1124-1129 行),原代码:

```python
def _load_global_settings() -> dict:
    try:
        with open(GLOBAL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"request_interval": 0.1, "batch_size": 5}
```

替换为:

```python
def _load_global_settings() -> dict:
    try:
        with open(GLOBAL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
```

- [ ] **Step 6: 运行测试验证仍通过**

Run: `cd backend && python -m pytest tests/test_gateway_key_pool.py tests/test_admin_api_key_status.py -v 2>&1 | tail -20`
Expected: 全部 PASS。

- [ ] **Step 7: 启动后端冒烟测试**

Run: `cd backend && timeout 8 python -c "import main; print('import OK')" 2>&1 | tail -5`
Expected: 输出 `import OK`,无异常。

- [ ] **Step 8: Commit**

```bash
git add backend/routers/admin.py
git commit -m "refactor: drop weight/active_index/batch_size from admin API

- _build_key_statuses 去掉 weight 字段
- TierKeyUpdate 去掉 active_index
- GlobalSettingsUpdate 清空(废弃,保留 endpoint 兼容前端)
- _load_global_settings 默认值改 {}"
```

---

## Task 5: 更新前端(adminApi.js + AdminApiKeys.jsx)

**Files:**
- Modify: `frontend/src/utils/adminApi.js`
- Modify: `frontend/src/components/admin/AdminApiKeys.jsx`

- [ ] **Step 1: adminApi.js — updateApiKeys 去掉 activeIndex 参数**

在 `frontend/src/utils/adminApi.js`(原第 21-25 行),原代码:

```javascript
  // pool 引用管理：refs = [{key_id, max_tokens, disabled}]
  updateApiKeys: async (tier, sub, refs, activeIndex = 0) => {
    const response = await axios.put(`${baseUrl}/api/admin/api-keys/${tier}`, { configs: refs, active_index: activeIndex, sub });
    return response.data;
  },
```

替换为:

```javascript
  // pool 引用管理：refs = [{key_id, max_tokens, disabled}]
  updateApiKeys: async (tier, sub, refs) => {
    const response = await axios.put(`${baseUrl}/api/admin/api-keys/${tier}`, { configs: refs, sub });
    return response.data;
  },
```

- [ ] **Step 2: AdminApiKeys.jsx — 删除 interval/batchSize state + useEffect 加载**

在 `frontend/src/components/admin/AdminApiKeys.jsx` 中,删除第 23-24 行的 state 声明:

```javascript
  const [interval, setInterval_] = useState(0.1)
  const [batchSize, setBatchSize] = useState(5)
```

和第 25 行的 `settingsSaved` state(若 saveSettings 也删,则一并删):

```javascript
  const [settingsSaved, setSettingsSaved] = useState(false)
```

删除第 51-57 行 useEffect 中加载 global settings 的逻辑,原:

```javascript
  useEffect(() => {
    reloadAll()
    adminApi.getGlobalSettings().then(data => {
      setInterval_(data.request_interval ?? 0.1)
      setBatchSize(data.batch_size ?? 5)
    })
  }, [])
```

替换为:

```javascript
  useEffect(() => {
    reloadAll()
  }, [])
```

删除 `saveSettings` 函数(原第 73-77 行):

```javascript
  const saveSettings = async () => {
    await adminApi.updateGlobalSettings({ request_interval: interval, batch_size: batchSize })
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }
```

- [ ] **Step 3: AdminApiKeys.jsx — 删除"全局设置"UI 区块**

删除第 255-277 行整个"全局设置"区块:

```jsx
      {/* 全局设置 */}
      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20 mb-6">
        <h3 className="text-[#c9a96e] font-bold mb-3">全局设置</h3>
        <div className="flex gap-8 items-end">
          <div className="flex-1">
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">请求间隔（秒）</label>
            <div className="flex items-center gap-3">
              <input type="range" min={0.01} max={10} step={0.01} value={interval} onChange={e => setInterval_(Number(e.target.value))} className="flex-1" />
              <span className="text-[#c9a96e] font-bold text-sm w-16 text-right">{interval.toFixed(2)}s</span>
            </div>
          </div>
          <div className="flex-1">
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">并发批大小</label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={100} step={1} value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} className="flex-1" />
              <span className="text-[#c9a96e] font-bold text-sm w-16 text-right">{batchSize}</span>
            </div>
          </div>
          <button onClick={saveSettings} className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">
            {settingsSaved ? '已保存' : '保存设置'}
          </button>
        </div>
      </div>
```

- [ ] **Step 4: AdminApiKeys.jsx — 删除 weight 输入列**

删除第 404-411 行 weight 输入区块:

```jsx
              <div className="w-16">
                <label className="text-[#e8d5b7]/60 text-xs" title="SWRR 平滑加权轮询的权重，数值越大被选中概率越高">权重</label>
                <input type="number" step="1" min="1" value={ref.weight ?? 1}
                  onChange={e => updateRefField(activeTier, activeSub, i, 'weight', Math.max(1, Number(e.target.value) || 1))}
                  onBlur={() => commitRefField(activeTier, activeSub)}
                  className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm"
                  title="SWRR 权重：数值越大被选中概率越高（默认 1）" />
              </div>
```

- [ ] **Step 5: AdminApiKeys.jsx — pasteRef/appendRefToPool 的 newRef 去掉 weight**

在 `pasteRef` 函数(原第 148-156 行),原:

```javascript
  const pasteRef = (tier, sub) => {
    if (!_refClipboard) { alert('剪贴板为空，先在某行点"复制"'); return }
    const pool = tierKeys[tier][sub]
    if (!pool) return
    const newRef = { key_id: _refClipboard.key_id, max_tokens: _refClipboard.max_tokens ?? defaultMaxTokens(tier), disabled: false, weight: _refClipboard.weight ?? 1 }
    const newConfigs = [...pool.configs, newRef]
    setTierKeys(prev => ({ ...prev, [tier]: { ...prev[tier], [sub]: { ...prev[tier][sub], configs: newConfigs } } }))
    persistRefs(tier, sub, newConfigs, pool.active_index || 0)
  }
```

替换为(去掉 weight,去掉 active_index 实参):

```javascript
  const pasteRef = (tier, sub) => {
    if (!_refClipboard) { alert('剪贴板为空，先在某行点"复制"'); return }
    const pool = tierKeys[tier][sub]
    if (!pool) return
    const newRef = { key_id: _refClipboard.key_id, max_tokens: _refClipboard.max_tokens ?? defaultMaxTokens(tier), disabled: false }
    const newConfigs = [...pool.configs, newRef]
    setTierKeys(prev => ({ ...prev, [tier]: { ...prev[tier], [sub]: { ...prev[tier][sub], configs: newConfigs } } }))
    persistRefs(tier, sub, newConfigs)
  }
```

在 `appendRefToPool` 函数(原第 208-214 行),原:

```javascript
  const appendRefToPool = async (keyId) => {
    const pool = tierKeys[activeTier][activeSub]
    const newRef = { key_id: keyId, max_tokens: defaultMaxTokens(activeTier), disabled: false, weight: 1 }
    const newConfigs = [...pool.configs, newRef]
    setTierKeys(prev => ({ ...prev, [activeTier]: { ...prev[activeTier], [activeSub]: { ...prev[activeTier][activeSub], configs: newConfigs } } }))
    await persistRefs(activeTier, activeSub, newConfigs, pool.active_index || 0)
  }
```

替换为:

```javascript
  const appendRefToPool = async (keyId) => {
    const pool = tierKeys[activeTier][activeSub]
    const newRef = { key_id: keyId, max_tokens: defaultMaxTokens(activeTier), disabled: false }
    const newConfigs = [...pool.configs, newRef]
    setTierKeys(prev => ({ ...prev, [activeTier]: { ...prev[activeTier], [activeSub]: { ...prev[activeTier][activeSub], configs: newConfigs } } }))
    await persistRefs(activeTier, activeSub, newConfigs)
  }
```

- [ ] **Step 6: AdminApiKeys.jsx — 其他 persistRefs/moveRef/removeRef/commitRefField/testAll 调用去掉 active_index 实参**

`persistRefs` 函数定义(原第 92-100 行),原:

```javascript
  const persistRefs = async (tier, sub, refs, activeIndex = 0) => {
    try {
      await adminApi.updateApiKeys(tier, sub, refs, activeIndex)
      await reloadAll()
      loadKeyStatuses(tier, sub)
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message))
    }
  }
```

替换为:

```javascript
  const persistRefs = async (tier, sub, refs) => {
    try {
      await adminApi.updateApiKeys(tier, sub, refs)
      await reloadAll()
      loadKeyStatuses(tier, sub)
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message))
    }
  }
```

`commitRefField` 函数(原第 113-116 行),原:

```javascript
  const commitRefField = (tier, sub) => {
    const pool = tierKeys[tier]?.[sub]
    if (pool) persistRefs(tier, sub, pool.configs, pool.active_index || 0)
  }
```

替换为:

```javascript
  const commitRefField = (tier, sub) => {
    const pool = tierKeys[tier]?.[sub]
    if (pool) persistRefs(tier, sub, pool.configs)
  }
```

`moveRef` 函数(原第 119-127 行),把末行 `persistRefs(tier, sub, configs, pool.active_index || 0)` 改为 `persistRefs(tier, sub, configs)`。

`removeRef` 函数(原第 130-135 行),把末行 `persistRefs(tier, sub, newConfigs, pool.active_index || 0)` 改为 `persistRefs(tier, sub, newConfigs)`。

`testAll` 函数(原第 218-241 行),把 `await persistRefs(activeTier, activeSub, pool.configs, pool.active_index || 0)` 改为 `await persistRefs(activeTier, activeSub, pool.configs)`。

禁用按钮 onClick(原第 412-420 行),把 `persistRefs(activeTier, activeSub, newConfigs, currentPool.active_index || 0)` 改为 `persistRefs(activeTier, activeSub, newConfigs)`。

- [ ] **Step 7: AdminApiKeys.jsx — copyRef 注释去掉 weight 提及**

`copyRef` 函数上方注释(原第 137 行)原:

```javascript
  // 复制引用配置到剪贴板（key_id + max_tokens + disabled + weight）
```

改为:

```javascript
  // 复制引用配置到剪贴板（key_id + max_tokens + disabled）
```

- [ ] **Step 8: 前端构建验证**

Run: `cd frontend && npm run build 2>&1 | tail -15`
Expected: 构建成功,无编译错误(无 undefined 变量引用)。

- [ ] **Step 9: Commit**

```bash
git add frontend/src/utils/adminApi.js frontend/src/components/admin/AdminApiKeys.jsx
git commit -m "refactor: remove weight/batch_size/interval from admin UI

- 删除全局设置区块(interval/batchSize 滑块 + 保存按钮)
- 删除 weight 输入列
- updateApiKeys/persistRefs/pasteRef/appendRefToPool 去掉 weight/active_index"
```

---

## Task 6: 全量测试 + 手动验证

**Files:** 无(验证任务)

- [ ] **Step 1: 运行全部后端测试**

Run: `cd backend && python -m pytest tests/ -v 2>&1 | tail -30`
Expected: 全部 PASS。重点关注 `test_gateway_key_pool.py` 和 `test_admin_api_key_status.py`。

- [ ] **Step 2: 启动后端冒烟测试**

Run: `cd backend && timeout 8 python -c "import main; print('import OK')" 2>&1 | tail -5`
Expected: `import OK`,无异常。

- [ ] **Step 3: 前端构建**

Run: `cd frontend && npm run build 2>&1 | tail -10`
Expected: 构建成功。

- [ ] **Step 4: 手动验证清单(若有运行环境)**

启动后端 `uvicorn backend.main:app`,登录 admin 面板,验证:
- [ ] API Key 管理页不再显示"全局设置"区块
- [ ] 每个 key 行不再有"权重"输入列
- [ ] 添加 key / 禁用 key / 删除引用 / 拖拽排序 / 复制粘贴引用均正常工作
- [ ] 多次调用 LLM(如翻译)观察日志 `[GATEWAY]` 行的 key_id 是否在多个 key 间轮换
- [ ] 禁用某 key 后,下一次 LLM 调用立即跳到下一个可用 key(不卡在禁用 key)

- [ ] **Step 5: 最终 Commit(如有遗留改动)**

```bash
git add -A
git status
# 若有遗留改动
git commit -m "chore: cleanup after key rotation rewrite"
```

---

## 完成标准

- [ ] 所有后端测试通过
- [ ] 前端构建成功
- [ ] admin 面板无 weight/全局设置 UI
- [ ] LLM 调用日志显示 key 在多 key 间轮换
- [ ] 禁用 key 后立即跳到下一个可用 key
