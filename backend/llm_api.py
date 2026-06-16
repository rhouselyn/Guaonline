"""LLM API Key 池管理（Tier-based）。"""

import json
from config import DATA_DIR

TIER_KEYS_FILE = str(DATA_DIR / "tier_keys.json")


def _load_tier_keys() -> dict:
    try:
        with open(TIER_KEYS_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return {"tier_keys": {}}


def _save_tier_keys(data: dict):
    with open(TIER_KEYS_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def get_tier_keys() -> dict:
    """获取所有 tier 的 API Key 配置（脱敏）。"""
    data = _load_tier_keys()
    masked = {}
    for tier, pool in data.get("tier_keys", {}).items():
        configs = []
        for cfg in pool.get("configs", []):
            key = cfg.get("api_key", "")
            if key and len(key) > 8:
                masked_key = key[:4] + "*" * (len(key) - 8) + key[-4:]
            else:
                masked_key = "****" if key else ""
            configs.append({
                "api_key": masked_key,
                "base_url": cfg.get("base_url", ""),
                "model": cfg.get("model", ""),
                "has_key": bool(key),
                "input_price_per_million": cfg.get("input_price_per_million", 0),
                "output_price_per_million": cfg.get("output_price_per_million", 0),
            })
        masked[tier] = {"configs": configs, "active_index": pool.get("active_index", 0)}
    return masked


def update_tier_keys(tier: str, configs: list, active_index: int = 0):
    """更新指定 tier 的 API Key 配置。"""
    data = _load_tier_keys()
    if "tier_keys" not in data:
        data["tier_keys"] = {}
    existing = data["tier_keys"].get(tier, {}).get("configs", [])
    new_configs = []
    for i, cfg in enumerate(configs):
        key = cfg.get("api_key", "")
        if "*" in key and i < len(existing):
            key = existing[i].get("api_key", key)
        new_configs.append({
            "api_key": key,
            "base_url": cfg.get("base_url", ""),
            "model": cfg.get("model", ""),
            "input_price_per_million": cfg.get("input_price_per_million", 0),
            "output_price_per_million": cfg.get("output_price_per_million", 0),
        })
    data["tier_keys"][tier] = {"configs": new_configs, "active_index": active_index}
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
