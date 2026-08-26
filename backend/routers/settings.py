"""设置与UI翻译相关路由：user-preferences, translate_ui"""

import json

from fastapi import APIRouter, HTTPException, Depends
from typing import List, Optional
from pydantic import BaseModel
from auth.deps import require_auth, TokenData

from ui_translations import UI_TRANSLATION_SCHEMA, TRANSLATION_PROMPT
from utils.state import storage

router = APIRouter(prefix="/api", tags=["settings"])


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

    # ponytail: schema 版本签名 = 全部 key 的英文基准拼接的指纹。
    # 新增 key 或缺 key → 补译缺失部分；修改既有文案(英文基准变化) → 整包重译刷新，
    # 保证已缓存的多语言 UI 也能拿到 autoTranslateHint 等最新文案，而不只是新上线的语言。
    schema_sig = _ui_schema_sig()

    # 1. 查数据库缓存
    cached = db_storage.load_ui_translations(lang_code)
    if cached:
        missing = [k for k in UI_TRANSLATION_SCHEMA if k not in cached]
        stale = cached.get("_schema_sig") != schema_sig
        if not missing and not stale:
            return cached
        # zh/en 不调 LLM，直接从 schema 重建最新值
        if lang_code in ('zh', 'en'):
            result = {k: UI_TRANSLATION_SCHEMA[k].get(lang_code, UI_TRANSLATION_SCHEMA[k].get('en', '')) for k in UI_TRANSLATION_SCHEMA}
            result["_lang_code"] = lang_code
            result["_schema_sig"] = schema_sig
            db_storage.save_ui_translations(lang_code, result)
            return result
        try:
            # stale（文案更新）时全量重译；否则只补缺失 key
            refresh_keys = list(UI_TRANSLATION_SCHEMA.keys()) if stale else missing
            patched = await _do_translate_ui(lang_code, db_storage, keys=refresh_keys)
            merged = {**cached, **{k: v for k, v in patched.items() if k in refresh_keys}}
            merged["_lang_code"] = lang_code
            merged["_schema_sig"] = schema_sig
            db_storage.save_ui_translations(lang_code, merged)
            return merged
        except Exception as e:
            print(f"UI translation patch error ({lang_code}): {e}")
            return cached  # 补译失败退回旧缓存，前端有 zhBase 兜底

    # 2. 对于 zh 和 en，从 schema 生成并存入数据库
    if lang_code in ('zh', 'en'):
        result = {}
        for key, val in UI_TRANSLATION_SCHEMA.items():
            result[key] = val.get(lang_code, val.get('en', ''))
        result["_lang_code"] = lang_code
        result["_schema_sig"] = schema_sig
        db_storage.save_ui_translations(lang_code, result)
        return result

    # 3. 用 LLM 生成（同步等待，不再用后台任务）
    return await _do_translate_ui(lang_code, db_storage)


def _ui_schema_sig():
    """UI_TRANSLATION_SCHEMA 的英文基准指纹，用于判断文案基准是否更新过。"""
    import hashlib
    payload = json.dumps(
        {k: v.get("en", "") for k, v in UI_TRANSLATION_SCHEMA.items()},
        ensure_ascii=False, sort_keys=True,
    )
    return hashlib.md5(payload.encode("utf-8")).hexdigest()[:16]


async def _do_translate_ui(lang_code: str, db_storage, keys=None):
    """通过 LLM 翻译 UI 字符串。keys 传入时只翻译 schema 的子集（用于补译缺失 key）。"""
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

    try:
        result = await gateway.call(
            user_id="system", tier="free", messages=messages,
            temperature=0, request_type="ui_translation"
        )

        if result and result.get("choices"):
            content = result["choices"][0]["message"]["content"]
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            translated = json.loads(content.strip())
            translated["_lang_code"] = lang_code
            translated["_schema_sig"] = _ui_schema_sig()

            # 存入数据库
            db_storage.save_ui_translations(lang_code, translated)
            return translated
    except Exception as e:
        print(f"UI translation error: {e}")

    raise HTTPException(status_code=500, detail="UI 翻译生成失败，请稍后重试")



