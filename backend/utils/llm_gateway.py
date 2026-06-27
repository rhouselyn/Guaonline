"""统一 LLM 调用网关（引用语义模型 + SWRR + 熔断器 + Retry-After + 主动健康检查）。

key 是全局对象（有 id），不同 tier/sub 通过引用复用同一个 key。
- key 核心属性（api_key/base_url/model/价格）全局共享
- 运行时状态（熔断状态/限速/调用计数/is_busy）按 key_id 全局共享
- per-pool 独立：max_tokens / disabled / weight / 顺序 / active_index / consecutive_fail_start

调度算法：平滑加权轮询 SWRR（Nginx 经典算法），不可用的 key（disabled/熔断 open）不参与本轮。
熔断器：closed → 连续失败 N 次 → open（阻塞 cooldown）→ 到期 → half_open（放 1 个探测）→ 成功 closed / 失败 open。
Retry-After：429 带 Retry-After 头时按其值阻塞，否则只切 key 不阻塞。
主动健康检查：后台线程定时探针，默认关闭（HEALTH_CHECK_ENABLED=1 开启）。
"""

import time
import json
import threading
import asyncio
import httpx
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from typing import Optional, List, Dict

import llm_api
from llm_api import SUB_POOLS, _load_data

GLOBAL_SETTINGS_FILE = str(__import__('config').DATA_DIR / "global_settings.json")

# 熔断器参数
CIRCUIT_FAIL_THRESHOLD = 3      # 连续失败 N 次进 open
CIRCUIT_COOLDOWN_401 = 300      # 401 阻塞 5min（key 失效，直接 open）
CIRCUIT_COOLDOWN_5XX = 60       # 5xx 阻塞 60s（临时故障）
CIRCUIT_COOLDOWN_NET = 30       # 网络错阻塞 30s

# 健康检查
HEALTH_CHECK_ENABLED = __import__('os').environ.get("HEALTH_CHECK_ENABLED", "") == "1"
HEALTH_CHECK_INTERVAL = 60      # 每 60s 探针一轮
HEALTH_CHECK_TIMEOUT = 15.0


def _load_global_settings() -> dict:
    try:
        with open(GLOBAL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"request_interval": 0.1, "batch_size": 5}


def _parse_retry_after(header_value: Optional[str]) -> Optional[int]:
    """解析 Retry-After 头：可能是秒数或 HTTP-date。返回秒数（None 表示无/无效）。"""
    if not header_value:
        return None
    # 尝试整数秒
    try:
        secs = int(header_value.strip())
        return max(0, min(secs, 3600))  # 上限 1h，避免极端值
    except (ValueError, TypeError):
        pass
    # 尝试 HTTP-date
    try:
        dt = parsedate_to_datetime(header_value)
        if dt is not None:
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            delta = (dt - datetime.now(timezone.utc)).total_seconds()
            return max(0, int(min(delta, 3600)))
    except (ValueError, TypeError, OverflowError):
        pass
    return None


class TierKeyPool:
    """单个 tier/sub 的引用池。只持有引用 + per-pool 配置，不持有 key 定义。"""

    FAIL_DEADLINE = 600  # 连续失败 10 分钟才放弃

    def __init__(self, tier: str, sub: str, refs: list, batch_size: int = 3, interval: float = 1.0):
        self.tier = tier
        self.sub = sub
        self.refs = refs  # [{key_id, max_tokens, disabled, weight}]
        self.current_index = 0
        self.lock = threading.Lock()
        self.batch_size = batch_size
        self.interval = interval
        self.active_count = 0  # per-pool 在途并发（用于 batch 切换判断）
        self.last_switch_time = 0
        self.consecutive_fail_start = None  # per-pool 连续失败起点
        # SWRR 状态：每个 ref 的 current_weight
        self.swrr_weights: List[int] = []

    def _ref_weight(self, ref) -> int:
        w = ref.get("weight")
        try:
            w = int(w) if w is not None else 1
        except (ValueError, TypeError):
            w = 1
        return max(1, w)

    def _sync_swrr(self):
        """refs 长度变化时重置 swrr_weights。"""
        if len(self.swrr_weights) != len(self.refs):
            self.swrr_weights = [0] * len(self.refs)

    def _key_def(self, gateway, key_id) -> dict:
        return gateway.key_defs.get(key_id, {})

    def _runtime(self, gateway, key_id) -> dict:
        return gateway.key_runtime.get(key_id) or gateway._ensure_runtime(key_id)

    def get_current(self, gateway) -> Optional[tuple]:
        """SWRR 选一个可用 key，返回 (resolved_config, idx) 或 None。

        跳过：per-pool disabled、熔断 open（未到期）、half-open 已有探测在途的 key。
        """
        with self.lock:
            self._sync_swrr()
            now = time.time()
            # 收集可用 idx（带 weight）
            usable = []
            for i, ref in enumerate(self.refs):
                if ref.get("disabled"):
                    continue
                key_id = ref.get("key_id")
                if not gateway._is_key_available_for_pick(key_id, now):
                    continue
                usable.append(i)
            if not usable:
                return None
            # SWRR：current += weight，选最大，减 total
            total = 0
            best = None
            best_cw = None
            for i in usable:
                w = self._ref_weight(self.refs[i])
                self.swrr_weights[i] += w
                total += w
                if best_cw is None or self.swrr_weights[i] > best_cw:
                    best_cw = self.swrr_weights[i]
                    best = i
            self.swrr_weights[best] -= total
            idx = best
            ref = self.refs[idx]
            key_id = ref.get("key_id")
            # 占用
            self.active_count += 1
            gateway._inc_active(key_id)
            gateway._mark_key_picked(key_id)  # half-open 时记录"已放过探测"
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

    def mark_complete(self, gateway, idx):
        """成功：per-pool 释放占用 + 该 key 熔断器复位为 closed。"""
        key_id = self.refs[idx].get("key_id")
        with self.lock:
            self.active_count -= 1
            self.consecutive_fail_start = None
            if self.active_count <= 0:
                self.active_count = 0
                self.last_switch_time = time.time()
                self.current_index += 1
        gateway._mark_key_complete(key_id)

    def _mark_fail(self, gateway, idx, fail_type: str, retry_after: Optional[int] = None):
        """失败：per-pool 切换 + 该 key 熔断器状态推进。"""
        key_id = self.refs[idx].get("key_id")
        with self.lock:
            self.active_count -= 1
            if self.active_count < 0:
                self.active_count = 0
            if self.consecutive_fail_start is None:
                self.consecutive_fail_start = time.time()
            self.current_index += 1
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

    async def wait_for_interval(self):
        with self.lock:
            elapsed = time.time() - self.last_switch_time
            remaining = self.interval - elapsed
        if remaining > 0:
            await asyncio.sleep(remaining)


class LLMGateway:
    """统一 LLM 调用网关。"""

    MAX_TOKEN_HALVINGS = 5

    _SUB_BY_REQUEST_TYPE = {
        "generate_title": "title",
        "detect_language": "title",
        "generate_multiple_choice": "word",
        "admin_vocab_refresh": "word",
        "process_text": "sentence",
        "process_remaining_words": "sentence",
        "translate": "sentence",
        "generate": "sentence",
        "ui_translation": "sentence",
        "llm_call": "sentence",
    }
    _DEFAULT_SUB = "sentence"

    _instance = None
    _instance_lock = threading.Lock()

    def __new__(cls):
        with cls._instance_lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._initialized = False
            return cls._instance

    def __init__(self):
        if self._initialized:
            return
        self._initialized = True
        self.pools: Dict[str, Dict[str, TierKeyPool]] = {}
        self.key_defs: Dict[str, dict] = {}
        self.key_runtime: Dict[str, dict] = {}
        self._runtime_lock = threading.RLock()  # 可重入
        self._status_event = None
        self._health_thread = None
        self._health_stop = threading.Event()
        self._reload_all()
        if HEALTH_CHECK_ENABLED:
            self.start_health_check()

    def _ensure_runtime(self, key_id) -> dict:
        """懒创建某 key 的运行时状态（含熔断器字段）。"""
        with self._runtime_lock:
            rt = self.key_runtime.get(key_id)
            if rt is None:
                rt = {
                    "is_valid": True,
                    "last_error": None,
                    "last_error_time": None,
                    "total_calls": 0,
                    "active_in_flight": 0,
                    "rate_limited_until": None,
                    # 熔断器
                    "circuit_state": "closed",   # closed | open | half_open
                    "fail_count": 0,              # 连续失败次数（成功清零）
                    "half_open_probed": False,    # half-open 阶段是否已放过探测请求
                }
                self.key_runtime[key_id] = rt
            return rt

    def _inc_active(self, key_id):
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["active_in_flight"] += 1

    def _mark_key_picked(self, key_id):
        """key 被选中时：half_open 状态标记已放过探测。"""
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            if rt.get("circuit_state") == "half_open":
                rt["half_open_probed"] = True

    def _notify(self):
        if self._status_event is not None:
            try:
                self._status_event.set()
            except Exception:
                pass

    def get_status_event(self):
        if self._status_event is None:
            self._status_event = asyncio.Event()
        return self._status_event

    # ── key 可用性判断（熔断器核心） ──────────────────────

    def _is_key_available_for_pick(self, key_id, now) -> bool:
        """选 key 时判断是否可用：考虑 disabled / 熔断 open / half-open 探测中。"""
        rt = self.key_runtime.get(key_id)
        if not rt:
            return True  # 无运行时状态 = 全新 key，可用
        state = rt.get("circuit_state", "closed")
        if state == "closed":
            return True
        if state == "open":
            rlu = rt.get("rate_limited_until")
            if rlu and now < rlu:
                return False  # 仍在阻塞期
            # 到期 → 转 half_open，允许探测
            with self._runtime_lock:
                rt["circuit_state"] = "half_open"
                rt["half_open_probed"] = False
            return True
        if state == "half_open":
            # 只允许 1 个探测请求
            return not rt.get("half_open_probed", False)
        return True

    # ── key 全局状态操作（熔断器推进） ─────────────────────

    def _mark_key_complete(self, key_id):
        """成功：熔断器复位 closed，清错误。"""
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["active_in_flight"] = max(0, rt["active_in_flight"] - 1)
            rt["total_calls"] += 1
            rt["is_valid"] = True
            rt["last_error"] = None
            rt["last_error_time"] = None
            rt["rate_limited_until"] = None
            rt["circuit_state"] = "closed"
            rt["fail_count"] = 0
            rt["half_open_probed"] = False
        self._notify()

    def _mark_key_rate_limited(self, key_id, retry_after: Optional[int] = None):
        """429：有 Retry-After 则阻塞（熔断 open），否则只切 key。"""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["is_valid"] = True
            rt["last_error"] = "429 Rate Limited"
            rt["last_error_time"] = now_iso
            if retry_after is not None and retry_after > 0:
                # provider 明确告诉要等多久 → 阻塞
                rt["rate_limited_until"] = time.time() + retry_after
                rt["circuit_state"] = "open"
                rt["fail_count"] = 0
                rt["half_open_probed"] = False
            # 否则不阻塞，只切 key（保持 closed/原状态）
        self._notify()

    def _mark_key_invalid(self, key_id):
        """401：key 失效，直接熔断 open 阻塞 5min。"""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["rate_limited_until"] = time.time() + CIRCUIT_COOLDOWN_401
            rt["is_valid"] = False
            rt["last_error"] = "401 Unauthorized"
            rt["last_error_time"] = now_iso
            rt["circuit_state"] = "open"
            rt["fail_count"] = 0
            rt["half_open_probed"] = False
        self._notify()

    def _mark_key_server_error(self, key_id):
        """5xx：连续失败计数，达阈值才熔断 open 阻塞 60s。"""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["is_valid"] = True
            rt["last_error"] = "5xx Server Error"
            rt["last_error_time"] = now_iso
            rt["fail_count"] = rt.get("fail_count", 0) + 1
            if rt["circuit_state"] == "half_open":
                # 探测失败 → 重新 open
                rt["rate_limited_until"] = time.time() + CIRCUIT_COOLDOWN_5XX
                rt["circuit_state"] = "open"
                rt["fail_count"] = 0
                rt["half_open_probed"] = False
            elif rt["fail_count"] >= CIRCUIT_FAIL_THRESHOLD:
                rt["rate_limited_until"] = time.time() + CIRCUIT_COOLDOWN_5XX
                rt["circuit_state"] = "open"
                rt["fail_count"] = 0
                rt["half_open_probed"] = False
        self._notify()

    def _mark_key_network_error(self, key_id):
        """网络错：连续失败计数，达阈值熔断 open 阻塞 30s。"""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["is_valid"] = True
            rt["last_error"] = "network error"
            rt["last_error_time"] = now_iso
            rt["fail_count"] = rt.get("fail_count", 0) + 1
            if rt["circuit_state"] == "half_open":
                rt["rate_limited_until"] = time.time() + CIRCUIT_COOLDOWN_NET
                rt["circuit_state"] = "open"
                rt["fail_count"] = 0
                rt["half_open_probed"] = False
            elif rt["fail_count"] >= CIRCUIT_FAIL_THRESHOLD:
                rt["rate_limited_until"] = time.time() + CIRCUIT_COOLDOWN_NET
                rt["circuit_state"] = "open"
                rt["fail_count"] = 0
                rt["half_open_probed"] = False
        self._notify()

    def is_key_busy(self, key_id) -> bool:
        with self._runtime_lock:
            rt = self.key_runtime.get(key_id)
            return bool(rt and rt.get("active_in_flight", 0) > 0)

    # ── 主动健康检查 ──────────────────────────────────────

    def start_health_check(self):
        """启动后台健康检查线程（幂等）。"""
        with self._runtime_lock:
            if self._health_thread is not None and self._health_thread.is_alive():
                return
            self._health_stop.clear()
            t = threading.Thread(target=self._health_check_loop, daemon=True, name="llm-health")
            self._health_thread = t
            t.start()

    def stop_health_check(self):
        self._health_stop.set()

    def _health_check_loop(self):
        while not self._health_stop.is_set():
            # 启动后先等一个周期，避免与启动并发
            if self._health_stop.wait(HEALTH_CHECK_INTERVAL):
                break
            try:
                self._run_health_checks()
            except Exception as e:
                print(f"[HEALTH] check loop error: {e}")

    def _run_health_checks(self):
        """对所有 key 发探针。探针失败更新 last_error，401/429+Retry-After 触发熔断。"""
        for key_id, kdef in list(self.key_defs.items()):
            try:
                self._probe_key(key_id, kdef)
            except Exception as e:
                print(f"[HEALTH] probe {key_id} error: {e}")

    def _probe_key(self, key_id, kdef):
        api_key = kdef.get("api_key", "")
        if not api_key:
            return
        base_url = kdef.get("base_url", "https://api.openai.com/v1")
        url = f"{base_url.rstrip('/')}/chat/completions"
        headers = {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        payload = {"model": kdef.get("model", "gpt-4o-mini"),
                   "messages": [{"role": "user", "content": "Hi"}], "max_tokens": 1}
        now_iso = datetime.now(timezone.utc).isoformat()
        try:
            with httpx.Client(timeout=HEALTH_CHECK_TIMEOUT) as client:
                resp = client.post(url, headers=headers, json=payload)
            with self._runtime_lock:
                rt = self._ensure_runtime(key_id)
                if resp.status_code == 200:
                    # 探针成功：清 last_error，但不强行复位熔断（让真实请求管理状态机）
                    rt["last_error"] = None
                    rt["last_error_time"] = None
                    rt["is_valid"] = True
                elif resp.status_code == 401:
                    rt["is_valid"] = False
                    rt["last_error"] = "401 Unauthorized (probe)"
                    rt["last_error_time"] = now_iso
                    rt["rate_limited_until"] = time.time() + CIRCUIT_COOLDOWN_401
                    rt["circuit_state"] = "open"
                    rt["fail_count"] = 0
                    rt["half_open_probed"] = False
                elif resp.status_code == 429:
                    retry_after = _parse_retry_after(resp.headers.get("retry-after"))
                    rt["last_error"] = "429 Rate Limited (probe)"
                    rt["last_error_time"] = now_iso
                    if retry_after and retry_after > 0:
                        rt["rate_limited_until"] = time.time() + retry_after
                        rt["circuit_state"] = "open"
                        rt["fail_count"] = 0
                        rt["half_open_probed"] = False
                elif resp.status_code >= 500:
                    rt["last_error"] = f"{resp.status_code} (probe)"
                    rt["last_error_time"] = now_iso
                    # 探针 5xx 不直接熔断，只记录（避免探针误判）
                else:
                    rt["last_error"] = f"{resp.status_code} (probe)"
                    rt["last_error_time"] = now_iso
        except httpx.TimeoutException:
            with self._runtime_lock:
                rt = self._ensure_runtime(key_id)
                rt["last_error"] = "network: timeout (probe)"
                rt["last_error_time"] = now_iso
        except Exception as e:
            with self._runtime_lock:
                rt = self._ensure_runtime(key_id)
                rt["last_error"] = f"network: {str(e)[:80]} (probe)"
                rt["last_error_time"] = now_iso
        self._notify()

    # ── 加载/重载 ─────────────────────────────────────────

    def _reload_all(self):
        data = _load_data()
        self.key_defs = data.get("keys", {})
        settings = _load_global_settings()
        batch_size = settings.get("batch_size", 3)
        interval = settings.get("request_interval", 1.0)
        new_pools = {}
        for tier, raw_tier in data.get("tier_keys", {}).items():
            tier_pools = {}
            for sub in SUB_POOLS:
                sub_data = raw_tier.get(sub) or {}
                refs = sub_data.get("configs", [])
                tier_pools[sub] = TierKeyPool(tier, sub, refs, batch_size, interval)
            new_pools[tier] = tier_pools
        self.pools = new_pools

    def reload(self):
        self._reload_all()

    def _resolve_pool(self, tier: str, request_type: str) -> Optional[TierKeyPool]:
        sub = self._SUB_BY_REQUEST_TYPE.get(request_type, self._DEFAULT_SUB)
        tier_pools = self.pools.get(tier)
        if tier_pools:
            pool = tier_pools.get(sub)
            if pool and pool.has_any_usable_key(self):
                return pool
            fallback = tier_pools.get(self._DEFAULT_SUB)
            if fallback and fallback.has_any_usable_key(self) and fallback is not pool:
                return fallback
        if tier != "free":
            free_pools = self.pools.get("free")
            if free_pools:
                pool = free_pools.get(sub)
                if pool and pool.has_any_usable_key(self):
                    return pool
                fallback = free_pools.get(self._DEFAULT_SUB)
                if fallback and fallback.has_any_usable_key(self):
                    return fallback
        for t, subs in self.pools.items():
            for s, p in subs.items():
                if p.has_any_usable_key(self):
                    return p
        return None

    async def call(self, user_id: str, tier: str, messages: List[Dict],
                   temperature: float = 0.0, max_tokens: int = 65536,
                   request_type: str = "llm_call", tools: List[Dict] = None,
                   _max_tokens_eff: int = None) -> dict:
        if _max_tokens_eff is None:
            _max_tokens_eff = max_tokens
        pool = self._resolve_pool(tier, request_type)
        if not pool:
            raise Exception(f"No API Key configured for tier: {tier} (request_type={request_type})")

        await pool.wait_for_interval()

        if pool.is_all_failed_too_long():
            raise Exception("服务暂时不可用，连续 10 分钟无有效输出，请检查 API Key 或稍后重试")

        result = pool.get_current(self)
        if not result:
            if not pool.has_any_usable_key(self):
                raise Exception("服务暂时不可用，所有 Key 均已禁用，请在管理面板启用至少一个 Key")
            print(f"[GATEWAY] --- all keys blocked, wait {pool.interval}s (admin interval) then retry tier={tier} type={request_type}")
            await asyncio.sleep(pool.interval)
            return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=_max_tokens_eff)

        config, idx = result
        api_key = config.get("api_key", "")
        base_url = config.get("base_url", "https://api.openai.com/v1")
        model = config.get("model", "gpt-4o-mini")
        input_price = config.get("input_price_per_million", 0)
        output_price = config.get("output_price_per_million", 0)
        key_id = config.get("id")

        ref = pool.refs[idx]
        key_cap = ref.get("max_tokens")
        if not key_cap:
            key_cap = 16384 if pool.tier == "free" else 65536
        eff = _max_tokens_eff
        if eff is None or eff > key_cap:
            eff = key_cap
        max_tokens = eff

        url = f"{base_url.rstrip('/')}/chat/completions"
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": model,
            "messages": messages,
            **({"temperature": temperature} if temperature is not None else {}),
            **({"max_tokens": max_tokens} if max_tokens is not None else {}),
            **({"tools": tools} if tools is not None else {}),
            "enable_thinking": False,
        }

        try:
            import time as _t
            _t0 = _t.time()
            print(f"[GATEWAY] >>> START user={user_id} tier={tier} type={request_type} key_id={key_id}")
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, headers=headers, json=payload)

            if resp.status_code == 200:
                result_data = resp.json()
                pool.mark_complete(self, idx)
                _elapsed = _t.time() - _t0
                _usage = result_data.get("usage", {})
                print(f"[GATEWAY] <<< OK user={user_id} tier={tier} type={request_type} key_id={key_id} elapsed={_elapsed:.1f}s tokens={_usage.get('total_tokens','?')}")
                if user_id and result_data.get("usage"):
                    try:
                        from utils.token_tracker import record_token_usage
                        custom_input = input_price if input_price else None
                        custom_output = output_price if output_price else None
                        record_token_usage(user_id, model, result_data["usage"], request_type, custom_input, custom_output)
                    except Exception:
                        pass
                return result_data

            elif resp.status_code == 429:
                retry_after = _parse_retry_after(resp.headers.get("retry-after"))
                pool.mark_rate_limited(self, idx, retry_after=retry_after)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

            elif resp.status_code == 401:
                pool.mark_invalid(self, idx)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

            elif resp.status_code >= 500:
                pool.mark_server_error(self, idx)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

            else:
                body = resp.text[:300]
                low = body.lower()
                if "max_tokens" in low and ("非法" in body or "invalid" in low or "range" in low or "exceed" in low or "maximum" in low):
                    halved = max(eff // 2, 256)
                    if halved < eff:
                        print(f"[GATEWAY] max_tokens 非法({eff})，折半为 {halved} 后重试 tier={tier} type={request_type}")
                        pool.mark_complete(self, idx)
                        return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=halved)
                pool.mark_server_error(self, idx)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

        except httpx.TimeoutException:
            pool.mark_network_error(self, idx)
            return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)
        except httpx.HTTPError as e:
            # 其他网络错（连接失败、DNS 等）
            print(f"[GATEWAY] network error key_id={key_id}: {e}")
            pool.mark_network_error(self, idx)
            return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)
        except Exception as e:
            if "No API Key" in str(e) or "服务暂时不可用" in str(e):
                raise
            pool.mark_complete(self, idx)
            raise


# 全局单例
gateway = LLMGateway()
