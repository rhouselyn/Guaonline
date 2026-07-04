"""统一 LLM 调用网关（引用语义模型 + SWRR + 熔断器 + Retry-After）。

key 是全局对象（有 id），不同 tier/sub 通过引用复用同一个 key。
- key 核心属性（api_key/base_url/model/价格）全局共享
- 运行时状态（熔断状态/限速/调用计数/is_busy）按 per-pool per-ref 独立，同一 key_id 在不同
  sub-pool（title/sentence/word）中互不影响——句子处理的熔断不会拖累单词详情生成。
- per-pool 独立：max_tokens / disabled / weight / 顺序 / active_index / consecutive_fail_start

调度算法：平滑加权轮询 SWRR（Nginx 经典算法），不可用的 key（disabled/熔断 open）不参与本轮。
熔断器：closed → 连续失败 N 次 → open（阻塞 cooldown）→ 到期 → half_open（放 1 个探测）→ 成功 closed / 失败 open。
Retry-After：429 带 Retry-After 头时按其值阻塞，否则只切 key 不阻塞。
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
CIRCUIT_COOLDOWN_401 = 300      # 401 首次阻塞 5min（key 失效，直接 open）
CIRCUIT_COOLDOWN_401_MAX = 3600 # 401 升级封禁上限 1h（欠费 key 不会自愈，逐次翻倍到上限）
CIRCUIT_COOLDOWN_5XX = 60       # 5xx 阻塞 60s（临时故障）
CIRCUIT_COOLDOWN_NET = 30       # 网络错阻塞 30s

# HTTP 调用超时（秒）。成功调用通常 30-50s 内返回，超过此值视为 provider 挂起，立即切下一 key。
# 提高失败检测速度：原 120s 会让单次超时拖到 2 分钟才轮询，60s 能让一次失败+重试控制在 100s 内。
HTTP_TIMEOUT = 60.0


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
    """单个 tier/sub 的引用池。持有引用 + per-pool 配置 + per-ref 运行时状态（熔断器）。"""

    FAIL_DEADLINE = 600  # 连续失败 10 分钟才放弃

    def __init__(self, tier: str, sub: str, refs: list, batch_size: int = 3, interval: float = 1.0):
        self.tier = tier
        self.sub = sub
        self.refs = refs  # [{key_id, max_tokens, disabled, weight}]
        self.current_index = 0
        self.lock = threading.RLock()  # RLock: admin status 端点持锁调用 is_key_busy 会再次获取同池锁
        self.batch_size = batch_size
        self.interval = interval
        self.active_count = 0  # per-pool 在途并发（用于 batch 切换判断）
        self.last_switch_time = 0
        self.consecutive_fail_start = None  # per-pool 连续失败起点
        # SWRR 状态：每个 ref 的 current_weight
        self.swrr_weights: List[int] = []
        # per-ref 运行时状态（与 refs 平行，不持久化）
        self.ref_runtime: List[dict] = []

    def _new_runtime(self) -> dict:
        return {
            "is_valid": True,
            "last_error": None,
            "last_error_time": None,
            "total_calls": 0,
            "active_in_flight": 0,
            "rate_limited_until": None,
            "circuit_state": "closed",   # closed | open | half_open
            "fail_count": 0,              # 连续失败次数（成功清零）
            "half_open_probed": False,    # half-open 阶段是否已放过探测请求
            "invalid_streak": 0,          # 连续 401 次数（成功清零，用于升级封禁时长）
        }

    def _sync_runtime(self):
        """保持 ref_runtime 与 refs 长度一致。"""
        while len(self.ref_runtime) < len(self.refs):
            self.ref_runtime.append(self._new_runtime())
        while len(self.ref_runtime) > len(self.refs):
            self.ref_runtime.pop()

    def reset_ref_runtime(self, key_id: str = None):
        """重置 per-ref 运行时状态。指定 key_id 时只重置该 key 的所有 ref。"""
        with self.lock:
            self._sync_runtime()
            for i, ref in enumerate(self.refs):
                if key_id is None or ref.get("key_id") == key_id:
                    self.ref_runtime[i] = self._new_runtime()

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

    def _is_ref_available(self, idx, now) -> bool:
        """per-ref 熔断器判断：closed 可用 / open 未到期不可用 / half_open 只放 1 个探测。"""
        rt = self.ref_runtime[idx]
        state = rt.get("circuit_state", "closed")
        if state == "closed":
            return True
        if state == "open":
            rlu = rt.get("rate_limited_until")
            if rlu and now < rlu:
                return False
            rt["circuit_state"] = "half_open"
            rt["half_open_probed"] = False
            return True
        if state == "half_open":
            return not rt.get("half_open_probed", False)
        return True

    def get_current(self, gateway) -> Optional[tuple]:
        """SWRR 选一个可用 key，返回 (resolved_config, idx) 或 None。

        跳过：per-pool disabled、熔断 open（未到期）、half-open 已有探测在途的 key。
        """
        with self.lock:
            self._sync_swrr()
            self._sync_runtime()
            now = time.time()
            # 收集可用 idx（带 weight）
            usable = []
            for i, ref in enumerate(self.refs):
                if ref.get("disabled"):
                    continue
                if not self._is_ref_available(i, now):
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
            rt = self.ref_runtime[idx]
            # 占用
            self.active_count += 1
            rt["active_in_flight"] += 1
            if rt.get("circuit_state") == "half_open":
                rt["half_open_probed"] = True  # half-open 时记录"已放过探测"
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
        """成功：per-pool 释放占用 + 该 ref 熔断器复位为 closed。"""
        with self.lock:
            self._sync_runtime()
            self.active_count -= 1
            self.consecutive_fail_start = None
            if self.active_count <= 0:
                self.active_count = 0
                self.last_switch_time = time.time()
                self.current_index += 1
            if idx < len(self.ref_runtime):
                rt = self.ref_runtime[idx]
                rt["active_in_flight"] = max(0, rt.get("active_in_flight", 0) - 1)
                rt["total_calls"] += 1
                rt["is_valid"] = True
                rt["last_error"] = None
                rt["last_error_time"] = None
                rt["rate_limited_until"] = None
                rt["circuit_state"] = "closed"
                rt["fail_count"] = 0
                rt["half_open_probed"] = False
                rt["invalid_streak"] = 0
        gateway._notify()

    def _mark_fail(self, gateway, idx, fail_type: str, retry_after: Optional[int] = None):
        """失败：per-pool 切换 + 该 ref 熔断器状态推进。"""
        with self.lock:
            self._sync_runtime()
            self.active_count -= 1
            if self.active_count < 0:
                self.active_count = 0
            if self.consecutive_fail_start is None:
                self.consecutive_fail_start = time.time()
            self.current_index += 1
            if idx < len(self.ref_runtime):
                rt = self.ref_runtime[idx]
                rt["active_in_flight"] = max(0, rt.get("active_in_flight", 0) - 1)
                now_iso = datetime.now(timezone.utc).isoformat()
                if fail_type == "rate_limited":
                    rt["is_valid"] = True
                    rt["last_error"] = "429 Rate Limited"
                    rt["last_error_time"] = now_iso
                    if retry_after is not None and retry_after > 0:
                        rt["rate_limited_until"] = time.time() + retry_after
                        rt["circuit_state"] = "open"
                        rt["fail_count"] = 0
                        rt["half_open_probed"] = False
                elif fail_type == "invalid":
                    rt["invalid_streak"] = rt.get("invalid_streak", 0) + 1
                    cooldown = CIRCUIT_COOLDOWN_401 * (2 ** (rt["invalid_streak"] - 1))
                    cooldown = min(cooldown, CIRCUIT_COOLDOWN_401_MAX)
                    rt["rate_limited_until"] = time.time() + cooldown
                    rt["is_valid"] = False
                    rt["last_error"] = "401 Unauthorized"
                    rt["last_error_time"] = now_iso
                    rt["circuit_state"] = "open"
                    rt["fail_count"] = 0
                    rt["half_open_probed"] = False
                elif fail_type == "server_error":
                    rt["is_valid"] = True
                    rt["last_error"] = "5xx Server Error"
                    rt["last_error_time"] = now_iso
                    rt["fail_count"] = rt.get("fail_count", 0) + 1
                    if rt["circuit_state"] == "half_open":
                        rt["rate_limited_until"] = time.time() + CIRCUIT_COOLDOWN_5XX
                        rt["circuit_state"] = "open"
                        rt["fail_count"] = 0
                        rt["half_open_probed"] = False
                    elif rt["fail_count"] >= CIRCUIT_FAIL_THRESHOLD:
                        rt["rate_limited_until"] = time.time() + CIRCUIT_COOLDOWN_5XX
                        rt["circuit_state"] = "open"
                        rt["fail_count"] = 0
                        rt["half_open_probed"] = False
                elif fail_type == "network":
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
        gateway._notify()

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
        """最近一个被阻塞 ref 的恢复时间戳。"""
        now = time.time()
        candidates = []
        for i, ref in enumerate(self.refs):
            if ref.get("disabled"):
                continue
            if i < len(self.ref_runtime):
                rt = self.ref_runtime[i]
                rlu = rt.get("rate_limited_until")
                if rlu and rlu > now:
                    candidates.append(rlu)
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
        self._status_event = None
        self._reload_all()

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

    def is_key_busy(self, key_id) -> bool:
        """该 key_id 是否在任意 pool 中有在途请求。用于 admin "占用中"徽章。"""
        for tier_pools in self.pools.values():
            for pool in tier_pools.values():
                with pool.lock:
                    pool._sync_runtime()
                    for i, ref in enumerate(pool.refs):
                        if ref.get("key_id") == key_id:
                            if pool.ref_runtime[i].get("active_in_flight", 0) > 0:
                                return True
        return False

    def reset_key_runtime(self, key_id: str = None):
        """重置所有 pool 中指定 key_id（或全部）的 per-ref 运行时状态。

        当 admin 更新了 api_key 或测试 key 后调用，使新 key 立即可用。
        """
        for tier_pools in self.pools.values():
            for pool in tier_pools.values():
                pool.reset_ref_runtime(key_id)
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
            # 所有 key 都在熔断阻塞期 → 等到最近一个 key 恢复时刻，而不是每秒空转重试。
            # 单次等待上限 60s：长封禁时仍能周期性回到 is_all_failed_too_long() 截止判定，
            # 保证 10 分钟总截止兜底生效。
            nxt = pool.next_available_time(self)
            now = time.time()
            if nxt is None or nxt <= now:
                # 没有会自动恢复的 key（全部为永久/无恢复时间封禁）→ 停止尝试，等管理员解封
                raise Exception("服务暂时不可用，所有 Key 均已熔断且无自动恢复时间，请在管理面板测试/解封后重试")
            wait = min(nxt - now, 60)
            print(f"[GATEWAY] --- all keys blocked, wait {wait:.1f}s until next recovery tier={tier} type={request_type}")
            if wait > 0:
                await asyncio.sleep(wait)
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
            _title = self.key_defs.get(key_id, {}).get("title", "") or "-"
            print(f"[GATEWAY] >>> START user={user_id} tier={tier} type={request_type} key_id={key_id} title={_title}")
            async with httpx.AsyncClient(timeout=HTTP_TIMEOUT) as client:
                resp = await client.post(url, headers=headers, json=payload)

            if resp.status_code == 200:
                result_data = resp.json()
                pool.mark_complete(self, idx)
                _elapsed = _t.time() - _t0
                _usage = result_data.get("usage", {})
                print(f"[GATEWAY] <<< OK user={user_id} tier={tier} type={request_type} key_id={key_id} title={_title} elapsed={_elapsed:.1f}s tokens={_usage.get('total_tokens','?')}")
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
                print(f"[GATEWAY] <<< 429 key_id={key_id} title={_title} retry_after={retry_after} → 切换 key 重试 tier={tier} type={request_type}")
                pool.mark_rate_limited(self, idx, retry_after=retry_after)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

            elif resp.status_code == 401:
                print(f"[GATEWAY] <<< 401 key_id={key_id} title={_title} → 切换 key 重试 tier={tier} type={request_type}")
                pool.mark_invalid(self, idx)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

            elif resp.status_code >= 500:
                print(f"[GATEWAY] <<< {resp.status_code} key_id={key_id} title={_title} → 切换 key 重试 tier={tier} type={request_type}")
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
                print(f"[GATEWAY] <<< {resp.status_code} key_id={key_id} title={_title} body={body!r} → 切换 key 重试 tier={tier} type={request_type}")
                pool.mark_server_error(self, idx)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

        except httpx.TimeoutException:
            _elapsed = _t.time() - _t0
            print(f"[GATEWAY] <<< TIMEOUT key_id={key_id} title={_title} elapsed={_elapsed:.1f}s (>{HTTP_TIMEOUT}s) → 切换 key 重试 tier={tier} type={request_type}")
            pool.mark_network_error(self, idx)
            return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)
        except httpx.HTTPError as e:
            # 其他网络错（连接失败、DNS 等）
            print(f"[GATEWAY] network error key_id={key_id} title={_title}: {e} → 切换 key 重试 tier={tier} type={request_type}")
            pool.mark_network_error(self, idx)
            return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)
        except Exception as e:
            if "No API Key" in str(e) or "服务暂时不可用" in str(e):
                raise
            pool.mark_complete(self, idx)
            raise


# 全局单例
gateway = LLMGateway()
