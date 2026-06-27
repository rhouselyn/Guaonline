"""统一 LLM 调用网关（引用语义模型）。

key 是全局对象（有 id），不同 tier/sub 通过引用复用同一个 key。
- key 核心属性（api_key/base_url/model/价格）全局共享
- 运行时状态（限速/无效/调用计数/is_busy）按 key_id 全局共享
- per-pool 独立：max_tokens / disabled / 顺序 / active_index / consecutive_fail_start
"""

import time
import json
import threading
import asyncio
import httpx
from datetime import datetime, timezone
from typing import Optional, List, Dict

import llm_api
from llm_api import SUB_POOLS, _load_data

GLOBAL_SETTINGS_FILE = str(__import__('config').DATA_DIR / "global_settings.json")


def _load_global_settings() -> dict:
    try:
        with open(GLOBAL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"request_interval": 0.1, "batch_size": 5}


class TierKeyPool:
    """单个 tier/sub 的引用池。只持有引用 + per-pool 配置，不持有 key 定义。"""

    FAIL_DEADLINE = 600  # 连续失败 10 分钟才放弃

    def __init__(self, tier: str, sub: str, refs: list, batch_size: int = 3, interval: float = 1.0):
        self.tier = tier
        self.sub = sub
        self.refs = refs  # [{key_id, max_tokens, disabled}]
        self.current_index = 0
        self.lock = threading.Lock()
        self.batch_size = batch_size
        self.interval = interval
        self.active_count = 0  # per-pool 在途并发（用于 batch 切换判断）
        self.last_switch_time = 0
        self.consecutive_fail_start = None  # per-pool 连续失败起点

    def _key_def(self, gateway, key_id) -> dict:
        return gateway.key_defs.get(key_id, {})

    def _runtime(self, gateway, key_id) -> dict:
        return gateway.key_runtime.get(key_id) or gateway._ensure_runtime(key_id)

    def get_current(self, gateway) -> Optional[tuple]:
        """获取当前可用 Key，返回 (resolved_config, idx) 或 None。

        跳过：per-pool disabled 的引用、全局仍在阻塞期（rate_limited_until）的 key。
        """
        with self.lock:
            now = time.time()
            for _ in range(len(self.refs)):
                idx = self.current_index % len(self.refs)
                ref = self.refs[idx]
                key_id = ref.get("key_id")
                if ref.get("disabled"):
                    self.current_index += 1
                    continue
                rt = gateway.key_runtime.get(key_id)
                if rt and rt.get("rate_limited_until") and now < rt["rate_limited_until"]:
                    self.current_index += 1
                    continue
                # 占用
                self.active_count += 1
                gateway._inc_active(key_id)
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
        """成功：per-pool 释放占用 + 清除该 key 全局错误状态。"""
        key_id = self.refs[idx].get("key_id")
        with self.lock:
            self.active_count -= 1
            self.consecutive_fail_start = None
            if self.active_count <= 0:
                self.active_count = 0
                self.last_switch_time = time.time()
                self.current_index += 1
        gateway._mark_key_complete(key_id)

    def _mark_fail(self, gateway, idx, fail_type: str):
        """失败：per-pool 切换 + 该 key 全局状态更新。"""
        key_id = self.refs[idx].get("key_id")
        with self.lock:
            self.active_count = 0
            if self.consecutive_fail_start is None:
                self.consecutive_fail_start = time.time()
            self.current_index += 1
        if fail_type == "rate_limited":
            gateway._mark_key_rate_limited(key_id)
        elif fail_type == "invalid":
            gateway._mark_key_invalid(key_id)
        elif fail_type == "server_error":
            gateway._mark_key_server_error(key_id)

    def mark_rate_limited(self, gateway, idx):
        self._mark_fail(gateway, idx, "rate_limited")

    def mark_invalid(self, gateway, idx):
        self._mark_fail(gateway, idx, "invalid")

    def mark_server_error(self, gateway, idx):
        self._mark_fail(gateway, idx, "server_error")

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
        self._runtime_lock = threading.RLock()  # 可重入：_inc_active 持锁时调 _ensure_runtime
        self._status_event = None
        self._reload_all()

    def _ensure_runtime(self, key_id) -> dict:
        """懒创建某 key 的运行时状态。"""
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
                }
                self.key_runtime[key_id] = rt
            return rt

    def _inc_active(self, key_id):
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["active_in_flight"] += 1

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

    # ── key 全局状态操作 ──────────────────────────────────

    def _mark_key_complete(self, key_id):
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["active_in_flight"] = max(0, rt["active_in_flight"] - 1)
            rt["total_calls"] += 1
            rt["is_valid"] = True
            rt["last_error"] = None
            rt["last_error_time"] = None
            rt["rate_limited_until"] = None
        self._notify()

    def _mark_key_rate_limited(self, key_id):
        # 429 不阻塞，只切 key。下次轮到直接重试。
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["is_valid"] = True
            rt["last_error"] = "429 Rate Limited"
            rt["last_error_time"] = now_iso
        self._notify()

    def _mark_key_invalid(self, key_id):
        # 401 阻塞 5 分钟
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["rate_limited_until"] = time.time() + 300
            rt["is_valid"] = False
            rt["last_error"] = "401 Unauthorized"
            rt["last_error_time"] = now_iso
        self._notify()

    def _mark_key_server_error(self, key_id):
        # 5xx 阻塞 5 分钟
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._runtime_lock:
            rt = self._ensure_runtime(key_id)
            rt["rate_limited_until"] = time.time() + 300
            rt["is_valid"] = True
            rt["last_error"] = "5xx Server Error"
            rt["last_error_time"] = now_iso
        self._notify()

    def is_key_busy(self, key_id) -> bool:
        with self._runtime_lock:
            rt = self.key_runtime.get(key_id)
            return bool(rt and rt.get("active_in_flight", 0) > 0)

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
                pool.mark_rate_limited(self, idx)
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
            pool.mark_server_error(self, idx)
            return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)
        except Exception as e:
            if "No API Key" in str(e) or "服务暂时不可用" in str(e):
                raise
            pool.mark_complete(self, idx)
            raise


# 全局单例
gateway = LLMGateway()
