"""设置与UI翻译相关路由：user-preferences, translate_ui"""

import asyncio
import json
import time

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from auth.deps import require_auth, TokenData

from ui_translations import UI_TRANSLATION_SCHEMA, TRANSLATION_PROMPT
from utils.state import storage

router = APIRouter(prefix="/api", tags=["settings"])

# UI 翻译单次输出 12K–16K tokens，150s 内没能生成完就判失败（前端同步放宽到 150s）。
UI_TRANSLATE_TIMEOUT = 150
# 失败冷却：刚失败过的语言在这段时间内直接返回已缓存的部分，避免每次切换都整包重翻、反复打满超时。
UI_TRANSLATE_FAIL_COOLDOWN = 60


class UserPreferencesUpdate(BaseModel):
    source_lang: Optional[str] = None
    target_lang: Optional[str] = None
    ui_lang: Optional[str] = None

    skip_listening: Optional[bool] = None
    recent_languages: Optional[List[str]] = None
    page_size: Optional[int] = None
    only_new_words: Optional[bool] = None
    auto_update: Optional[bool] = None
    tts_engine: Optional[str] = None
    # 字体缩放：移动端 / 桌面端分别保存，默认 1.0（学习页基础字号 14px）
    font_scale_mobile: Optional[float] = None
    font_scale_desktop: Optional[float] = None


@router.get("/user-preferences")
async def get_user_preferences(current_user: TokenData = Depends(require_auth)):
    try:
        prefs = storage.load_user_preferences(user_id=current_user.user_id)
        return prefs
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/user-preferences")
async def update_user_preferences(req: UserPreferencesUpdate, current_user: TokenData = Depends(require_auth)):
    try:
        current = storage.load_user_preferences(user_id=current_user.user_id)
        if req.source_lang is not None:
            current["source_lang"] = req.source_lang
        if req.target_lang is not None:
            current["target_lang"] = req.target_lang
        if req.ui_lang is not None:
            current["ui_lang"] = req.ui_lang

        if req.skip_listening is not None:
            current["skip_listening"] = req.skip_listening
        if req.recent_languages is not None:
            current["recent_languages"] = req.recent_languages
        if req.page_size is not None:
            current["page_size"] = req.page_size
        if req.only_new_words is not None:
            current["only_new_words"] = req.only_new_words
        if req.auto_update is not None:
            current["auto_update"] = req.auto_update
        if req.tts_engine is not None:
            current["tts_engine"] = req.tts_engine
        if req.font_scale_mobile is not None:
            current["font_scale_mobile"] = req.font_scale_mobile
        if req.font_scale_desktop is not None:
            current["font_scale_desktop"] = req.font_scale_desktop
        storage.save_user_preferences(current, user_id=current_user.user_id)
        return current
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/translate_ui/{lang_code}")
async def translate_ui(lang_code: str):
    from db_storage import DatabaseStorage
    db_storage = DatabaseStorage()

    # ponytail: 软配对——缓存命中就直接换；只有缺 key 时才补译缺少的那部分，
    # 不再因英文基准变化整包重译（旧行为会让已缓存语言每次都跑一次全量 LLM，很慢）。
    schema_sig = _ui_schema_sig()

    # zh/en 是内置字典，直接从 schema 重建，不调 LLM
    if lang_code in ('zh', 'en'):
        result = {k: UI_TRANSLATION_SCHEMA[k].get(lang_code, UI_TRANSLATION_SCHEMA[k].get('en', '')) for k in UI_TRANSLATION_SCHEMA}
        result["_lang_code"] = lang_code
        result["_schema_sig"] = schema_sig
        db_storage.save_ui_translations(lang_code, result)
        return result

    cached = db_storage.load_ui_translations(lang_code) or {}
    missing = [k for k in UI_TRANSLATION_SCHEMA if k not in cached]
    if not missing:
        return cached

    # 失败冷却：刚失败过就别再打 LLM（否则每次切换都整包重翻、反复失败）。
    # 已有部分译文就先给出去（缺失 key 前端用 zhBase 兜底），一条都没有则快速失败让前端稍后重试。
    fail_at = cached.get("_fail_at") or 0
    fail_count = cached.get("_fail_count") or 0
    if fail_at and time.time() - fail_at < UI_TRANSLATE_FAIL_COOLDOWN:
        if _ui_key_count(cached):
            return cached
        raise HTTPException(status_code=500, detail="UI 翻译生成失败，请稍后重试")

    try:
        # 只把缺失的 key 交给 LLM（首次即全量），150s 封顶
        translated = await _do_translate_ui(lang_code, keys=missing, timeout=UI_TRANSLATE_TIMEOUT)
    except _UITranslateFailed as e:
        # 失败缓存：本次已翻译出来的部分落库，下次只补剩下的 key，不再整包重翻
        merged = _save_partial(db_storage, lang_code, cached, e.partial, schema_sig, fail_count)
        if _ui_key_count(merged):
            return merged
        raise HTTPException(status_code=500, detail="UI 翻译生成失败，请稍后重试")

    merged = {**cached, **translated}
    merged["_lang_code"] = lang_code
    merged["_schema_sig"] = schema_sig
    merged.pop("_fail_at", None)
    merged.pop("_fail_count", None)
    db_storage.save_ui_translations(lang_code, merged)
    return merged


def _ui_key_count(translations: dict) -> int:
    """缓存里真正有译文的 key 数（忽略 _lang_code 这类元数据）。"""
    return sum(1 for k in UI_TRANSLATION_SCHEMA if k in translations)


def _save_partial(db_storage, lang_code, cached, partial, schema_sig, fail_count):
    """把失败前已生成的译文并入缓存并打上失败标记，返回合并结果。"""
    merged = {**cached, **partial}
    merged["_lang_code"] = lang_code
    merged["_schema_sig"] = schema_sig
    merged["_fail_at"] = time.time()
    merged["_fail_count"] = fail_count + 1
    db_storage.save_ui_translations(lang_code, merged)
    return merged


def _ui_schema_sig():
    """UI_TRANSLATION_SCHEMA 的英文基准指纹，写入缓存用于记录基准版本。"""
    import hashlib
    payload = json.dumps(
        {k: v.get("en", "") for k, v in UI_TRANSLATION_SCHEMA.items()},
        ensure_ascii=False, sort_keys=True,
    )
    return hashlib.md5(payload.encode("utf-8")).hexdigest()[:16]


class _UITranslateFailed(Exception):
    """翻译失败，携带本次已经抢救出来的部分译文，供调用方写入失败缓存。"""

    def __init__(self, partial: dict = None):
        self.partial = partial or {}
        super().__init__("UI translation failed")


def _strip_fence(content: str) -> str:
    if "```json" in content:
        return content.split("```json")[1].split("```")[0]
    if "```" in content:
        return content.split("```")[1].split("```")[0]
    return content


def _parse_translation_json(content: str) -> dict:
    """解析 LLM 返回的 JSON。输出被 max_tokens 截断时，退回到最后一个完整键值对，
    抢救出已经翻好的部分（下次只补剩下的 key），而不是整包丢弃。"""
    text = _strip_fence(content).strip()
    try:
        data = json.loads(text)
    except json.JSONDecodeError:
        idx = text.rfind('",')
        while idx > 0:
            try:
                data = json.loads(text[:idx + 1] + "\n}")
                break
            except json.JSONDecodeError:
                idx = text.rfind('",', 0, idx)
        else:
            raise
    return data if isinstance(data, dict) else {}


def _filter_untranslated(translated: dict, lang_code: str) -> dict:
    """丢弃模型原样回显的中文（目标语言不是中文时），否则“没翻”会被当成成功永久缓存。"""
    if lang_code == 'zh':
        return translated
    cleaned = {}
    for key, val in translated.items():
        if not isinstance(val, str) or not val.strip():
            continue
        src = UI_TRANSLATION_SCHEMA.get(key) or {}
        zh = (src.get("zh") or "").strip()
        if zh and zh != (src.get("en") or "").strip() and val.strip() == zh:
            continue
        cleaned[key] = val
    return cleaned


async def _do_translate_ui(lang_code: str, keys=None, timeout=None):
    """通过 LLM 翻译 UI 字符串。keys 传入时只翻译 schema 的子集（用于补译缺失 key）。

    timeout 传入时以 asyncio.wait_for 封顶单次调用（150s）；
    失败抛 _UITranslateFailed（带已生成的部分），由调用方写入失败缓存。
    """
    from llm_api import get_lang_name
    from utils.llm_gateway import gateway

    lang_name = get_lang_name(lang_code)

    strings_for_prompt = {}
    for key, val in UI_TRANSLATION_SCHEMA.items():
        if keys is not None and key not in keys:
            continue
        strings_for_prompt[key] = {
            "description": val["desc"],
            "chinese": val["zh"],
            "english": val["en"]
        }

    prompt = TRANSLATION_PROMPT.format(
        target_lang_name=lang_name,
        target_lang_code=lang_code,
        strings_json=json.dumps(strings_for_prompt, ensure_ascii=False, indent=2)
    )

    messages = [
        {"role": "system", "content": "You are a professional UI translator. Always respond with valid JSON only."},
        {"role": "user", "content": prompt}
    ]

    partial = {}
    try:
        call = gateway.call(
            user_id="system", tier="free", messages=messages,
            temperature=0, max_tokens=65536, request_type="ui_translation"
        )
        result = await (asyncio.wait_for(call, timeout=timeout) if timeout else call)

        if result and result.get("choices"):
            content = result["choices"][0]["message"]["content"]
            translated = _filter_untranslated(_parse_translation_json(content), lang_code)
            # 只保留 schema 里真实存在的 key
            partial = {k: v for k, v in translated.items() if k in strings_for_prompt}
            if partial:
                partial["_lang_code"] = lang_code
                partial["_schema_sig"] = _ui_schema_sig()
                return partial
    except asyncio.TimeoutError:
        print(f"UI translation timeout ({lang_code}, {timeout}s, keys={'all' if keys is None else len(keys)})")
        raise _UITranslateFailed(partial)
    except Exception as e:
        print(f"UI translation error ({lang_code}): {e}")
        raise _UITranslateFailed(partial)

    raise _UITranslateFailed(partial)



