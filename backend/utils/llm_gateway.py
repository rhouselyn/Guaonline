"""统一 LLM 调用网关。"""

import time
import json
import threading
import asyncio
import httpx
from datetime import datetime, timezone
from typing import Optional, List, Dict
from config import DATA_DIR

TIER_KEYS_FILE = str(DATA_DIR / "tier_keys.json")
GLOBAL_SETTINGS_FILE = str(DATA_DIR / "global_settings.json")


def _load_tier_keys() -> dict:
    try:
        with open(TIER_KEYS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"tier_keys": {}}


def _load_global_settings() -> dict:
    try:
        with open(GLOBAL_SETTINGS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"request_interval": 0.1, "batch_size": 5}


class TierKeyPool:
    """单个 Tier 的 Key 池，支持始终轮换 + 批量并发。"""

    # 连续失败多久后判定服务不可用（用户要求：满 10 分钟才放弃）
    FAIL_DEADLINE = 600

    def __init__(self, tier: str, configs: list, batch_size: int = 3, interval: float = 1.0):
        self.tier = tier
        self.configs = configs
        self.current_index = 0
        self.lock = threading.Lock()
        self.rate_limited_until = {}
        self.batch_size = batch_size
        self.interval = interval
        self.active_count = 0
        self.active_per_key: Dict[int, int] = {}  # 每个 Key 当前在途并发请求数（用于状态显示“占用中”）
        self.last_switch_time = 0
        self.consecutive_fail_start = None
        self.total_calls: Dict[int, int] = {}
        self.last_error: Dict[int, str] = {}
        self.last_error_time: Dict[int, str] = {}
        # SSE 订阅通知：mark_* 时 set，stream 端点 wait 后推送。懒初始化（需事件循环）。
        self._status_event = None

    def _notify(self):
        """通知 SSE 订阅者状态已变化。事件循环线程内调用，安全。"""
        if self._status_event is not None:
            try:
                self._status_event.set()
            except Exception:
                pass

    def get_status_event(self):
        """获取（或懒创建）状态变化事件，供 SSE 端点等待。"""
        if self._status_event is None:
            self._status_event = asyncio.Event()
        return self._status_event

    def _mark_fail_start(self):
        """任何失败类型都要启动“连续失败”计时，保证 10 分钟阈值对 401/429/5xx 都生效。"""
        if self.consecutive_fail_start is None:
            self.consecutive_fail_start = time.time()

    def get_current(self) -> Optional[tuple]:
        """获取当前活跃 Key，返回 (config, index) 或 None。

        跳过：被禁用的 Key（disabled=True）和仍在阻塞期（rate_limited_until）的 Key。
        """
        with self.lock:
            now = time.time()
            for _ in range(len(self.configs)):
                idx = self.current_index % len(self.configs)
                cfg = self.configs[idx]
                if cfg.get("disabled"):
                    self.current_index += 1
                    continue
                if idx in self.rate_limited_until and now < self.rate_limited_until[idx]:
                    self.current_index += 1
                    continue
                self.active_count += 1
                self.active_per_key[idx] = self.active_per_key.get(idx, 0) + 1
                self._notify()
                return cfg, idx
            return None

    def is_busy(self, idx: int) -> bool:
        """该 Key 是否正被至少一个在途并发请求占用。"""
        with self.lock:
            return self.active_per_key.get(idx, 0) > 0

    def next_available_time(self) -> Optional[float]:
        """最近一个被阻塞 Key 的恢复时间戳；无阻塞返回 None。"""
        with self.lock:
            now = time.time()
            candidates = [t for idx, t in self.rate_limited_until.items()
                          if t > now and not self.configs[idx].get("disabled")]
            return min(candidates) if candidates else None

    def mark_rate_limited(self, idx: int, retry_after: float = None):
        """429 限速：不阻塞 Key，只切换到下一个 Key，靠 wait_for_interval 按 admin 间隔重试。

        不设 rate_limited_until——429 是瞬时限速，下次轮到这个 Key 时直接重试即可。
        """
        with self.lock:
            self.active_count = 0
            self.active_per_key[idx] = 0
            self.current_index += 1
            self.last_error[idx] = "429 Rate Limited"
            self.last_error_time[idx] = datetime.now(timezone.utc).isoformat()
            self.configs[idx]["is_valid"] = True
            self.configs[idx]["last_error"] = "429 Rate Limited"
            self.configs[idx]["last_error_time"] = self.last_error_time[idx]
            self._mark_fail_start()
            self._notify()

    def mark_invalid(self, idx: int):
        """标记 Key 无效（401），5 分钟后恢复。"""
        with self.lock:
            self.rate_limited_until[idx] = time.time() + 300
            self.active_count = 0
            self.active_per_key[idx] = 0
            self.current_index += 1
            self.last_error[idx] = "401 Unauthorized"
            self.last_error_time[idx] = datetime.now(timezone.utc).isoformat()
            self.configs[idx]["is_valid"] = False
            self.configs[idx]["last_error"] = "401 Unauthorized"
            self.configs[idx]["last_error_time"] = self.last_error_time[idx]
            self._mark_fail_start()
            self._notify()

    def mark_complete(self, idx: int):
        """单个请求完成。batch 全部完成时切换到下一个 Key，并清除该 Key 的错误状态。"""
        with self.lock:
            self.active_count -= 1
            self.active_per_key[idx] = max(0, self.active_per_key.get(idx, 0) - 1)
            self.consecutive_fail_start = None
            self.total_calls[idx] = self.total_calls.get(idx, 0) + 1
            # 成功即恢复：清掉旧的错误标记，让状态徽章实时变回“正常”
            self.last_error.pop(idx, None)
            self.last_error_time.pop(idx, None)
            self.configs[idx]["is_valid"] = True
            self.configs[idx]["last_error"] = None
            self.configs[idx]["last_error_time"] = None
            self.rate_limited_until.pop(idx, None)
            if self.active_count <= 0:
                self.active_count = 0
                self.last_switch_time = time.time()
                self.current_index += 1
            self._notify()

    def mark_server_error(self, idx: int):
        """服务端错误（5xx）及其它非 429 错误：阻塞 5 分钟后恢复。"""
        with self.lock:
            self.rate_limited_until[idx] = time.time() + 300
            self.active_count = 0
            self.active_per_key[idx] = 0
            now_iso = datetime.now(timezone.utc).isoformat()
            self.last_error[idx] = "5xx Server Error"
            self.last_error_time[idx] = now_iso
            self.configs[idx]["is_valid"] = True
            self.configs[idx]["last_error"] = "5xx Server Error"
            self.configs[idx]["last_error_time"] = now_iso
            self._mark_fail_start()
            self.current_index += 1
            self._notify()

    def is_all_failed_too_long(self) -> bool:
        """检查是否连续 10 分钟无有效输出。"""
        with self.lock:
            if self.consecutive_fail_start is None:
                return False
            return (time.time() - self.consecutive_fail_start) >= self.FAIL_DEADLINE

    def has_any_usable_key(self) -> bool:
        """是否存在未被禁用的 Key（用于区分“全禁用”和“全阻塞”）。"""
        with self.lock:
            return any(not c.get("disabled") for c in self.configs)

    async def wait_for_interval(self):
        """等待 interval（batch 切换间隔）。"""
        with self.lock:
            elapsed = time.time() - self.last_switch_time
            remaining = self.interval - elapsed
        if remaining > 0:
            await asyncio.sleep(remaining)


class LLMGateway:
    """统一 LLM 调用网关。"""

    # max_tokens 非法时折半重试的最大次数（16384→8192→...→512，足够覆盖输入占位）
    MAX_TOKEN_HALVINGS = 5

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
        self.pools: Dict[str, TierKeyPool] = {}
        self._reload_pools()

    def _reload_pools(self):
        """从配置文件重新加载所有 Key 池。"""
        data = _load_tier_keys()
        settings = _load_global_settings()
        batch_size = settings.get("batch_size", 3)
        interval = settings.get("request_interval", 1.0)

        new_pools = {}
        for tier, pool_data in data.get("tier_keys", {}).items():
            configs = pool_data.get("configs", [])
            if configs:
                new_pools[tier] = TierKeyPool(tier, configs, batch_size, interval)

        self.pools = new_pools

    def reload(self):
        """手动刷新配置。"""
        self._reload_pools()

    async def call(self, user_id: str, tier: str, messages: List[Dict],
                   temperature: float = 0.0, max_tokens: int = 65536,
                   request_type: str = "llm_call", tools: List[Dict] = None,
                   _max_tokens_eff: int = None) -> dict:
        """
        统一 LLM 调用入口。

        _max_tokens_eff: 内部参数，max_tokens 在跨重试间的“当前有效值”。
        当遇到 max_tokens 非法的 400 时，会折半重试（最多折半 MAX_TOKEN_HALVINGS 次）。
        """
        # 首次进入时，由调用方传入的 max_tokens 决定有效值
        if _max_tokens_eff is None:
            _max_tokens_eff = max_tokens
        # 查找对应 tier 的 Key 池，无则回退到 free
        pool = self.pools.get(tier)
        if not pool and tier != "free":
            pool = self.pools.get("free")
        if not pool:
            raise Exception(f"No API Key configured for tier: {tier}")

        # 等待 batch 切换间隔
        await pool.wait_for_interval()

        # 检查是否连续失败太久（满 10 分钟才放弃）
        if pool.is_all_failed_too_long():
            raise Exception("服务暂时不可用，连续 10 分钟无有效输出，请检查 API Key 或稍后重试")

        # 获取当前 Key
        result = pool.get_current()
        if not result:
            # 所有可用 Key 暂时处于阻塞期：按 admin 配置的间隔重试，满 10 分钟才放弃。
            if not pool.has_any_usable_key():
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

        # per-key 最高输出封顶：free 默认 16384，其它默认 65536；调用方传更小值时取更小
        key_cap = config.get("max_tokens")
        if not key_cap:
            key_cap = 16384 if pool.tier == "free" else 65536
        # 用本次重试的有效值（可能已被 400 折半过），再受 key_cap 约束
        eff = _max_tokens_eff
        if eff is None or eff > key_cap:
            eff = key_cap
        max_tokens = eff

        # 发请求
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
            # 禁用 Qwen3 等模型的思考模式，避免 reasoning_content 消耗 token
            "enable_thinking": False,
        }

        try:
            import time as _t
            _t0 = _t.time()
            print(f"[GATEWAY] >>> START user={user_id} tier={tier} type={request_type} key_idx={idx}")
            async with httpx.AsyncClient(timeout=120.0) as client:
                resp = await client.post(url, headers=headers, json=payload)

            if resp.status_code == 200:
                result_data = resp.json()
                pool.mark_complete(idx)
                _elapsed = _t.time() - _t0
                _usage = result_data.get("usage", {})
                print(f"[GATEWAY] <<< OK user={user_id} tier={tier} type={request_type} key_idx={idx} elapsed={_elapsed:.1f}s tokens={_usage.get('total_tokens','?')}")
                # 记录 token 使用量
                if user_id and result_data.get("usage"):
                    try:
                        from utils.token_tracker import record_token_usage
                        # 只有配置了非零价格才传入自定义价格，否则让 estimate_cost 用模型价格表
                        custom_input = input_price if input_price else None
                        custom_output = output_price if output_price else None
                        record_token_usage(user_id, model, result_data["usage"], request_type, custom_input, custom_output)
                    except Exception:
                        pass
                return result_data

            elif resp.status_code == 429:
                pool.mark_rate_limited(idx)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

            elif resp.status_code == 401:
                pool.mark_invalid(idx)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

            elif resp.status_code >= 500:
                pool.mark_server_error(idx)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

            else:
                # 4xx 非 401/429
                body = resp.text[:300]
                low = body.lower()
                if "max_tokens" in low and ("非法" in body or "invalid" in low or "range" in low or "exceed" in low or "maximum" in low):
                    halved = max(eff // 2, 256)
                    if halved < eff:
                        print(f"[GATEWAY] max_tokens 非法({eff})，折半为 {halved} 后重试 tier={tier} type={request_type}")
                        pool.mark_complete(idx)
                        return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=halved)
                # 其它 4xx（402/403/404/400 等）：阻塞 5min 后重试，由 10min 阈值兜底
                pool.mark_server_error(idx)
                return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)

        except httpx.TimeoutException:
            pool.mark_server_error(idx)
            return await self.call(user_id, tier, messages, temperature, max_tokens, request_type, tools, _max_tokens_eff=eff)
        except Exception as e:
            if "No API Key" in str(e) or "服务暂时不可用" in str(e):
                raise
            pool.mark_complete(idx)
            raise


# 全局单例
gateway = LLMGateway()
