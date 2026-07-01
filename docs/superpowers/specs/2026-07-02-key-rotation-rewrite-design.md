# Key 轮换重写设计

## 概述

将 LLM Gateway 的 key 调度算法从 SWRR(平滑加权轮询)+ batch/interval 节流,重写为 Gualingo 风格的**纯轮询 + 熔断器**模型,并支持多用户并发。同时删除废弃的 `weight` / `batch_size` / `interval` 配置字段。

### 背景与动机

当前实现 [llm_gateway.py](file:///workspace/backend/utils/llm_gateway.py) 使用 SWRR 加权轮询 + batch_size 限并发 + interval 切换等待。这套机制在多用户并发下有结构性缺陷:`active_count` 在连续流量下永远不会归零,"batch 完成 → 等 interval → 切换 key" 的触发条件永远不满足,导致所有请求集中在第一个 key,轮换形同虚设。

参考 [Gualingo 仓库](https://github.com/rhouselyn/Gualingo)的简单轮询思路:每个请求原子取 `keys[counter++ % n]`,天然把并发请求均匀分布到不同 key,无需 batch/interval 协调。

### 设计目标

1. **真正轮换起来** — 多用户并发时请求均匀分布到所有可用 key
2. **禁用立即生效** — 禁用一个 key 后下一个请求立即跳过它,轮换到下一个可用 key
3. **保留有价值特性** — 熔断器、Retry-After、能力探测、max_tokens 折半、引用模型、sub-pool 分离
4. **清理死配置** — weight/batch_size/interval 不再使用,从数据结构和前端删除

---

## 1. 轮换算法 + 并发模型

### 新 `get_current` 算法

`TierKeyPool.get_current` 用**原子计数器轮询 + 向前扫描跳过不可用 key** 替换 SWRR:

```python
def get_current(self, gateway) -> Optional[tuple]:
    """轮询选一个可用 key。每次 pick 都推进 counter,保证多用户并发时
    请求均匀分布到不同 key。禁用/熔断的 key 在扫描中被跳过。"""
    with self.lock:
        n = len(self.refs)
        if n == 0:
            return None
        start = self.counter
        self.counter += 1          # 原子推进,保证每次 pick 都轮换
        now = time.time()
        for offset in range(n):    # 从 start 位置向前扫描最多 n 个
            idx = (start + offset) % n
            ref = self.refs[idx]
            if ref.get("disabled"):
                continue
            key_id = ref.get("key_id")
            if not gateway._is_key_available_for_pick(key_id, now):
                continue
            # 命中:占用 + 标记 half_open 探测 + 返回
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
        return None  # 全部不可用
```

### 并发安全性

- `self.counter` 在 `lock` 内自增 → 多用户并发 pick 时每个拿到不同的起始位置,天然均匀分布到不同 key,互不阻塞
- 删除 `active_count` / `batch_size` / `interval` / `wait_for_interval()` → 多用户间无协调开销
- `mark_complete` / `mark_rate_limited` / `mark_invalid` / `mark_server_error` / `mark_network_error` 只推进熔断器状态,不再做 batch 切换判断

### "禁用 key 立即跳过"

扫描循环遇到 `disabled` 或熔断 open 的 key 直接 `continue`,落到下一个可用 key。禁用后下一个请求立即生效,无需等待任何周期。

### counter 持久化策略

reload 时若 refs 未变,保留旧 counter(避免 admin 改配置就重置轮换位置);refs 变了则 `counter % 新长度` 截断。复用现有 `_rebuild_preserving_state` 模式,只是把 `swrr_weights` 换成 `counter`。

### 保留不动的特性

- 熔断器完整状态机(closed / open / half_open + 探测)
- Retry-After 解析(429 带 header 阻塞,不带只切 key)
- 401 升级封禁(5min→10min→20min→…封顶 1h)
- 5xx / 网络错阈值熔断(连续 3 次)
- `is_all_failed_too_long()` 10 分钟兜底
- `next_available_time()` + 60s 等待恢复
- tier / sub 路由回退
- enable_thinking 探测 + 运行时回退
- max_tokens 折半重试
- 引用语义模型(全局 key_defs / key_runtime 按 key_id 共享)
- SSE 状态推送

---

## 2. 数据模型迁移

### tier_keys.json ref 结构变更

旧:
```json
{"key_id": "k1", "max_tokens": 16384, "disabled": false, "weight": 1}
```

新:
```json
{"key_id": "k1", "max_tokens": 16384, "disabled": false}
```

- `weight` 字段删除
- `active_index` 字段已是历史遗留(轮询逻辑不依赖),一并从 ref/pool 结构删除

### global_settings.json 变更

旧:
```json
{"request_interval": 0.1, "batch_size": 5}
```

新:文件保留(避免删文件触发迁移问题),但 `_load_global_settings` 默认返回 `{}`,gateway 不再读取 `request_interval` / `batch_size`。已有文件中的旧字段在下次 `_save_global_settings` 时被自然覆盖消失。

### 迁移逻辑(在 llm_api._migrate_old 中)

- 已有 ref 中的 `weight` 字段 → 读取时忽略,保存时不写
- 老格式迁移时不再生成 `weight` 字段
- 向后兼容:读到带 `weight` 的旧数据不报错,只是丢弃该字段;下次保存时自然消失

### TierKeyPool 构造函数签名变更

```python
# 旧
def __init__(self, tier, sub, refs, batch_size=3, interval=1.0)

# 新
def __init__(self, tier, sub, refs)
```

`_rebuild_preserving_state` 同步去掉 `batch_size` / `interval` 参数,只保留 `counter`(替代 `swrr_weights`)。

---

## 3. 改动范围

### 后端

| 文件 | 改动 |
|------|------|
| [llm_gateway.py](file:///workspace/backend/utils/llm_gateway.py) | `TierKeyPool`: 删 SWRR(`swrr_weights`/`_sync_swrr`/`_ref_weight`)、删 `batch_size`/`interval`/`active_count`/`last_switch_time`/`wait_for_interval`。新增 `counter` 字段 + 新 `get_current` 扫描算法。`mark_complete`/`mark_*` 去掉 batch 切换判断。`_rebuild_preserving_state` 用 `counter` 替代 `swrr_weights`。`LLMGateway.__init__` 不再读 batch_size/interval。`call()` 去掉 `await pool.wait_for_interval()` |
| [llm_api.py](file:///workspace/backend/llm_api.py) | `_migrate_old` 不再生成 `weight` 字段。`update_tier_keys` 接受的 refs 不再含 weight(读到则丢弃)。`get_tier_keys` 返回时不再带 `active_index` 字段 |
| [admin.py](file:///workspace/backend/routers/admin.py) | `_build_key_statuses` 去掉 `"weight": ref.get("weight", 1)` 行。`GlobalSettingsUpdate` 去掉 `request_interval`/`batch_size` 字段。`_load_global_settings`/`_save_global_settings` 默认值改 `{}`。`TierKeyUpdate` 去掉 `active_index` 字段 |

### 前端

| 文件 | 改动 |
|------|------|
| [AdminApiKeys.jsx](file:///workspace/frontend/src/components/admin/AdminApiKeys.jsx) | 删除整个"全局设置"区块(interval/batchSize 滑块 + 保存按钮)。删除 weight 输入列。`pasteRef`/`appendRefToPool` 的 newRef 去掉 `weight`。删 `interval`/`batchSize` state + useEffect 加载 + `saveSettings`。`persistRefs`/`moveRef`/`removeRef`/`commitRefField` 不再传 `active_index` 参数 |
| [adminApi.js](file:///workspace/frontend/src/utils/adminApi.js) | `updateApiKeys` 的 refs 不再带 weight,不再传 `active_index` 参数 |

### 测试

| 文件 | 改动 |
|------|------|
| [test_gateway_key_pool.py](file:///workspace/backend/tests/test_gateway_key_pool.py) | 删 `test_swrr_*`(3 个 SWRR 权重测试)。新增:轮询均匀分布、跳过 disabled、跳过熔断 open、reload 保留 counter、多"用户"并发 pick 拿到不同 key。保留:熔断器状态机、Retry-After、引用语义、max_tokens、sub-pool 路由、capabilities 探测测试(只改 setup helper 去掉 weight/batch_size/interval 参数) |

### 不动的部分

熔断器常量(CIRCUIT_*)、Retry-After 解析、401 升级、half_open 探测、enable_thinking 运行时回退、max_tokens 折半、SSE 状态推送、tier/sub 路由回退、引用模型全局 key_defs/key_runtime 共享。

---

## 4. 错误处理(不变)

沿用现有熔断器策略,仅去掉 batch 切换逻辑:

| 错误 | 处理 |
|------|------|
| 429 + Retry-After | 阻塞到 retry_after 时刻,熔断 open |
| 429 无 Retry-After | 只切 key,不阻塞 |
| 401 | 熔断 open,升级封禁(5min→1h 翻倍) |
| 5xx | 连续 3 次熔断 open,阻塞 60s |
| 网络错 | 连续 3 次熔断 open,阻塞 30s |
| 所有 key 不可用 | 等最近一个恢复(上限 60s),或报错 |
| 连续 10 分钟无有效输出 | 报错兜底 |

---

## 5. 测试策略

### 新增测试

1. **`test_rotation_distributes_evenly`** — 两个等权 key,8 次 pick 应 4/4 分布
2. **`test_rotation_skips_disabled`** — 禁用 key 0,所有 pick 落到 key 1
3. **`test_rotation_skips_circuit_open`** — key 0 熔断 open,所有 pick 落到 key 1
4. **`test_reload_preserves_counter`** — reload(refs 未变)后 counter 保留,不从 0 开始
5. **`test_concurrent_picks_get_different_keys`** — 模拟多用户并发 pick,验证 counter 推进使不同 pick 拿到不同 key

### 保留测试(改 setup helper)

熔断器状态机(6 个)、Retry-After(2 个)、引用语义(3 个)、max_tokens(4 个)、sub-pool 路由(1 个)、capabilities 探测(4 个)、reload 通知(1 个)、禁用切换(1 个)。setup helper `_build_data` / `_ref` / `_setup` 去掉 weight / batch_size / interval 参数。

### 删除测试

`test_swrr_equal_weights_distribute_evenly`、`test_swrr_weighted_distribution`、`test_swrr_skips_disabled_ref`、`test_swrr_skips_circuit_open_key`(后两个改为新的轮询版本)、`test_reload_preserves_swrr_state_*`(3 个,改为 counter 版本)、`test_reload_preserves_active_count_and_consecutive_fail`(active_count 已删,改测 consecutive_fail 保留)。
