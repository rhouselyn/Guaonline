"""LLM API Key 池管理（Tier-based + sub-pool）。

每个 tier 下分 3 个 sub-pool，允许不同任务用不同 key：
- title:   生成标题 + 语言检测（轻量、低延迟任务）
- sentence: 句子处理（翻译/生成/分词/语法解释）
- word:    单词详情生成（多选/例句/记忆辅助）

数据格式（tier_keys.json）：
{
  "tier_keys": {
    "free": {
      "title":    {"configs": [...], "active_index": 0},
      "sentence": {"configs": [...], "active_index": 0},
      "word":     {"configs": [...], "active_index": 0}
    },
    ...
  }
}

向后兼容：老格式（tier 直接是 {configs, active_index}）会被自动迁移到 3 个 sub-pool 各一份副本。
"""

import json
from config import DATA_DIR

TIER_KEYS_FILE = str(DATA_DIR / "tier_keys.json")

# sub-pool 标识。暴露给 gateway / admin 共用。
SUB_POOLS = ("title", "sentence", "word")


def _load_tier_keys() -> dict:
    try:
        with open(TIER_KEYS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"tier_keys": {}}


def _save_tier_keys(data: dict):
    with open(TIER_KEYS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _mask_key(key: str) -> str:
    """脱敏单个 API Key，供 get_tier_keys 展示与 update_tier_keys 反查使用。"""
    if key and len(key) > 8:
        return key[:4] + "*" * (len(key) - 8) + key[-4:]
    return "****" if key else ""


def _normalize_tier_data(raw: dict) -> dict:
    """把单 tier 的数据归一化为 {sub: {configs, active_index}} 结构。

    老格式（tier 直接是 {configs, active_index}）→ 复制到 3 个 sub-pool。
    新格式（tier 是 {title/sentence/word: {...}}）→ 缺失的 sub 用空 configs 补齐。
    """
    # 新格式：tier 下有 sub-pool 字段
    if any(sub in raw for sub in SUB_POOLS):
        result = {}
        for sub in SUB_POOLS:
            sub_data = raw.get(sub) or {}
            result[sub] = {
                "configs": sub_data.get("configs", []),
                "active_index": sub_data.get("active_index", 0),
            }
        return result
    # 老格式：tier 直接是 {configs, active_index}，迁移到 3 个 sub 各一份副本
    configs = raw.get("configs", [])
    active_index = raw.get("active_index", 0)
    return {sub: {"configs": list(configs), "active_index": active_index} for sub in SUB_POOLS}


def get_tier_keys() -> dict:
    """获取所有 tier 的 API Key 配置（脱敏）。

    返回结构：{tier: {sub: {configs: [...], active_index: int}}}
    """
    data = _load_tier_keys()
    masked = {}
    for tier, raw in data.get("tier_keys", {}).items():
        norm = _normalize_tier_data(raw)
        masked[tier] = {}
        for sub, pool in norm.items():
            configs = []
            for cfg in pool.get("configs", []):
                key = cfg.get("api_key", "")
                masked_key = _mask_key(key)
                configs.append({
                    "api_key": masked_key,
                    "base_url": cfg.get("base_url", ""),
                    "model": cfg.get("model", ""),
                    "has_key": bool(key),
                    "disabled": cfg.get("disabled", False),
                    "max_tokens": cfg.get("max_tokens", None),
                    "input_price_per_million": cfg.get("input_price_per_million", 0),
                    "output_price_per_million": cfg.get("output_price_per_million", 0),
                })
            masked[tier][sub] = {"configs": configs, "active_index": pool.get("active_index", 0)}
    return masked


def update_tier_keys(tier: str, sub: str, configs: list, active_index: int = 0):
    """更新指定 tier 的某个 sub-pool 的 API Key 配置。

    sub ∈ title/sentence/word。其它 sub-pool 保持不变。
    """
    if sub not in SUB_POOLS:
        raise ValueError(f"Invalid sub: {sub}, expected one of {SUB_POOLS}")
    data = _load_tier_keys()
    if "tier_keys" not in data:
        data["tier_keys"] = {}
    # 归一化现有 tier 数据为 sub 结构（兼容老格式）
    existing_norm = _normalize_tier_data(data["tier_keys"].get(tier, {}))
    # 建立 masked -> real 映射，用于识别未修改的脱敏 key（与位置无关，支持拖拽重排序）
    existing_pool = existing_norm.get(sub, {})
    masked_to_real = {}
    for cfg in existing_pool.get("configs", []):
        k = cfg.get("api_key", "")
        if k:
            masked_to_real[_mask_key(k)] = k
    new_configs = []
    for cfg in configs:
        key = cfg.get("api_key", "")
        if "*" in key:
            # 未修改的脱敏 key：按 masked 形式找回原始 key
            key = masked_to_real.get(key, key)
        new_configs.append({
            "api_key": key,
            "base_url": cfg.get("base_url", ""),
            "model": cfg.get("model", ""),
            "disabled": cfg.get("disabled", False),
            "max_tokens": cfg.get("max_tokens", None),
            "input_price_per_million": cfg.get("input_price_per_million", 0),
            "output_price_per_million": cfg.get("output_price_per_million", 0),
        })
    existing_norm[sub] = {"configs": new_configs, "active_index": active_index}
    data["tier_keys"][tier] = existing_norm
    _save_tier_keys(data)
    # 通知 gateway 刷新
    try:
        from utils.llm_gateway import gateway
        gateway.reload()
    except Exception:
        pass


# 保留语言列表供其他模块使用
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
    """根据语言代码返回语言名称。"""
    return LANGUAGE_MAP.get(code, code)


async def detect_language(text: str) -> str:
    """使用 LLM 检测文本语言。"""
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
