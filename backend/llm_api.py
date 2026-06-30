"""LLM API Key 管理（引用语义模型）。

数据模型：
- 全局 key 仓库：每个 key 是独立对象，有唯一 id。核心属性（api_key/base_url/model/价格）
  全局共享，改一处所有引用处同步生效。
- tier/sub 引用表：每个 pool 只存"引用了哪些 key + 怎么用"。max_tokens/disabled/顺序/active_index
  按 pool 独立。运行时状态（限速/无效/调用计数/is_busy）按 key_id 全局共享。

数据格式（tier_keys.json）：
{
  "keys": {
    "k1": {"id":"k1","api_key":"sk-...","base_url":"...","model":"...",
           "input_price_per_million":0,"output_price_per_million":0}
  },
  "tier_keys": {
    "free": {
      "title":    {"configs":[{"key_id":"k1","max_tokens":8192,"disabled":false}], "active_index":0},
      "sentence": {"configs":[{"key_id":"k1","max_tokens":16384,"disabled":false}], "active_index":0},
      "word":     {"configs":[], "active_index":0}
    }
  }
}

向后兼容：老格式（无 "keys" 字段，tier 下直接是 configs）会被自动迁移——
按 (api_key,base_url,model) 去重生成全局 key，configs 转成引用。
"""

import json
import time
from config import DATA_DIR

TIER_KEYS_FILE = str(DATA_DIR / "tier_keys.json")

# sub-pool 标识。暴露给 gateway / admin 共用。
SUB_POOLS = ("title", "sentence", "word")


# ── 持久化 ───────────────────────────────────────────────

def _load_data() -> dict:
    """读取完整数据并自动迁移老格式。返回 {keys: {...}, tier_keys: {...}}。"""
    try:
        with open(TIER_KEYS_FILE, 'r', encoding='utf-8') as f:
            raw = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"keys": {}, "tier_keys": {}}
    return _migrate_old(raw)


def _save_data(data: dict):
    with open(TIER_KEYS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _mask_key(key: str) -> str:
    """脱敏单个 API Key。"""
    if key and len(key) > 8:
        return key[:4] + "*" * (len(key) - 8) + key[-4:]
    return "****" if key else ""


# ── 老格式迁移 ─────────────────────────────────────────────

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


def _migrate_old(raw: dict) -> dict:
    """把老格式（无 keys 字段）迁移到引用模型。新格式原样返回。"""
    if "keys" in raw:
        return raw
    old_tier_keys = raw.get("tier_keys", {})
    new_keys = {}
    key_map = {}  # (api_key, base_url, model) -> key_id
    new_tier_keys = {}
    counter = 0
    for tier, raw_tier in old_tier_keys.items():
        norm = _normalize_old_tier(raw_tier)
        new_tier_keys[tier] = {}
        for sub, pool in norm.items():
            new_refs = []
            for cfg in pool.get("configs", []):
                api_key = cfg.get("api_key", "")
                base_url = cfg.get("base_url", "")
                model = cfg.get("model", "")
                sig = (api_key, base_url, model)
                if sig not in key_map:
                    counter += 1
                    kid = f"k{counter}"
                    key_map[sig] = kid
                    new_keys[kid] = {
                        "id": kid,
                        "api_key": api_key,
                        "base_url": base_url,
                        "model": model,
                        "input_price_per_million": cfg.get("input_price_per_million", 0),
                        "output_price_per_million": cfg.get("output_price_per_million", 0),
                    }
                kid = key_map[sig]
                new_refs.append({
                    "key_id": kid,
                    "max_tokens": cfg.get("max_tokens"),
                    "disabled": cfg.get("disabled", False),
                    "weight": cfg.get("weight", 1),
                })
            new_tier_keys[tier][sub] = {"configs": new_refs, "active_index": pool.get("active_index", 0)}
    return {"keys": new_keys, "tier_keys": new_tier_keys}


# ── key id 生成 ───────────────────────────────────────────

_key_counter = 0  # 模块级计数器，避免 import 时冲突


def gen_key_id() -> str:
    global _key_counter
    _key_counter += 1
    return f"k{int(time.time() * 1000)}_{_key_counter}"


# ── key 定义 CRUD（全局 key 仓库） ──────────────────────────

def get_key_defs_internal() -> dict:
    """返回真实（未脱敏）的 key 定义，供 gateway 内部使用。"""
    return _load_data().get("keys", {})


def list_key_defs() -> list:
    """列出所有 key 定义（脱敏），供前端展示。"""
    keys = _load_data().get("keys", {})
    result = []
    for kid, kdef in keys.items():
        k = kdef.get("api_key", "")
        result.append({
            "id": kid,
            "title": kdef.get("title", ""),
            "api_key": _mask_key(k),
            "has_key": bool(k),
            "base_url": kdef.get("base_url", ""),
            "model": kdef.get("model", ""),
            "input_price_per_million": kdef.get("input_price_per_million", 0),
            "output_price_per_million": kdef.get("output_price_per_million", 0),
        })
    return result


def create_key_def(api_key: str, base_url: str, model: str,
                   input_price_per_million: float = 0,
                   output_price_per_million: float = 0,
                   title: str = "",
                   capabilities: dict = None) -> str:
    """新建全局 key，返回 id。capabilities 存该 key 支持的可选参数（探测后写入）。"""
    data = _load_data()
    kid = gen_key_id()
    data.setdefault("keys", {})[kid] = {
        "id": kid,
        "title": title,
        "api_key": api_key,
        "base_url": base_url,
        "model": model,
        "input_price_per_million": input_price_per_million,
        "output_price_per_million": output_price_per_million,
        "capabilities": capabilities or {},
    }
    _save_data(data)
    _reload_gateway()
    return kid


def update_key_def(key_id: str, **fields):
    """修改全局 key 属性。改一处，所有引用处同步生效。"""
    data = _load_data()
    keys = data.setdefault("keys", {})
    if key_id not in keys:
        raise ValueError(f"key {key_id} not found")
    kdef = keys[key_id]
    for f in ("title", "api_key", "base_url", "model", "input_price_per_million",
              "output_price_per_million", "capabilities"):
        if f in fields and fields[f] is not None:
            # 脱敏形式（带 *）的 api_key 视为未修改，保留原值
            if f == "api_key" and "*" in str(fields[f]):
                continue
            kdef[f] = fields[f]
    _save_data(data)
    _reload_gateway()


def delete_key_def(key_id: str) -> bool:
    """删除全局 key。若被任何 pool 引用则拒绝。"""
    data = _load_data()
    if key_id not in data.get("keys", {}):
        return False
    # 检查是否被引用
    for tier, subs in data.get("tier_keys", {}).items():
        for sub, pool in subs.items():
            for ref in pool.get("configs", []):
                if ref.get("key_id") == key_id:
                    raise ValueError(f"key {key_id} 仍被 {tier}/{sub} 引用，请先移除引用")
    del data["keys"][key_id]
    _save_data(data)
    _reload_gateway()
    return True


def count_key_refs(key_id: str) -> list:
    """返回该 key 被哪些 pool 引用，供前端显示"共享到 N 处"。"""
    data = _load_data()
    refs = []
    for tier, subs in data.get("tier_keys", {}).items():
        for sub, pool in subs.items():
            for ref in pool.get("configs", []):
                if ref.get("key_id") == key_id:
                    refs.append({"tier": tier, "sub": sub})
    return refs


# ── pool 引用管理 ─────────────────────────────────────────

def get_tier_keys() -> dict:
    """返回 keys（脱敏）+ tier_keys（引用表），供前端渲染。"""
    data = _load_data()
    keys = {}
    for kid, kdef in data.get("keys", {}).items():
        k = kdef.get("api_key", "")
        keys[kid] = {
            "id": kid,
            "title": kdef.get("title", ""),
            "api_key": _mask_key(k),
            "has_key": bool(k),
            "base_url": kdef.get("base_url", ""),
            "model": kdef.get("model", ""),
            "input_price_per_million": kdef.get("input_price_per_million", 0),
            "output_price_per_million": kdef.get("output_price_per_million", 0),
        }
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


def _reload_gateway():
    try:
        from utils.llm_gateway import gateway
        gateway.reload()
    except Exception:
        pass


# ── 语言工具（保留供其它模块使用） ──────────────────────────

LANGUAGE_MAP = {
    "auto": "Auto Detect", "zh": "Chinese", "en": "English", "ja": "Japanese",
    "ko": "Korean", "fr": "French", "de": "German", "es": "Spanish",
    "pt": "Portuguese", "ru": "Russian", "ar": "Arabic", "hi": "Hindi",
    "it": "Italian", "nl": "Dutch", "pl": "Polish", "tr": "Turkish",
    "vi": "Vietnamese", "th": "Thai", "id": "Indonesian", "ms": "Malay",
    "uk": "Ukrainian", "sv": "Swedish", "da": "Danish", "fi": "Finnish",
    "no": "Norwegian", "cs": "Czech", "ro": "Romanian", "hu": "Hungarian",
    "el": "Greek", "he": "Hebrew", "bg": "Bulgarian", "hr": "Croatian",
    "sk": "Slovak", "sl": "Slovenian", "et": "Estonian", "lv": "Latvian",
    "lt": "Lithuanian",
}


def get_lang_name(code: str) -> str:
    return LANGUAGE_MAP.get(code, code)


async def detect_language(text: str) -> str:
    import asyncio
    from utils.llm_gateway import gateway
    lang_codes = ", ".join(k for k in LANGUAGE_MAP if k != "auto")
    messages = [
        {
            "role": "system",
            "content": (
                f"You are a language detection expert. Identify the language of the given text. "
                f"You must respond with ONLY the language code from this exact list: [{lang_codes}]. "
                f"Do not output anything else. Pick the single most matching code."
            ),
        },
        {"role": "user", "content": text},
    ]
    response = await gateway.call(
        user_id="system", tier="free", messages=messages,
        temperature=0.0, max_tokens=16, request_type="detect_language",
    )
    if "choices" in response and len(response["choices"]) > 0:
        result = response["choices"][0].get("message", {}).get("content", "").strip().lower()
        if result in LANGUAGE_MAP:
            return result
    return "en"
