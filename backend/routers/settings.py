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
        storage.save_user_preferences(current, user_id=current_user.user_id)
        return current
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/translate_ui/{lang_code}")
async def translate_ui(lang_code: str):
    from db_storage import DatabaseStorage
    db_storage = DatabaseStorage()

    # 1. 查数据库缓存
    cached = db_storage.load_ui_translations(lang_code)
    if cached:
        return cached

    # 2. 对于 zh 和 en，从 schema 生成并存入数据库
    if lang_code in ('zh', 'en'):
        result = {}
        for key, val in UI_TRANSLATION_SCHEMA.items():
            result[key] = val.get(lang_code, val.get('en', ''))
        result["_lang_code"] = lang_code
        db_storage.save_ui_translations(lang_code, result)
        return result

    # 3. 用 LLM 生成（同步等待，不再用后台任务）
    return await _do_translate_ui(lang_code, db_storage)


async def _do_translate_ui(lang_code: str, db_storage):
    """通过 LLM 翻译 UI 字符串。"""
    from llm_api import get_lang_name
    from utils.llm_gateway import gateway

    lang_name = get_lang_name(lang_code)

    strings_for_prompt = {}
    for key, val in UI_TRANSLATION_SCHEMA.items():
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
            temperature=0, max_tokens=4096, request_type="ui_translation"
        )

        if result and result.get("choices"):
            content = result["choices"][0]["message"]["content"]
            if "```json" in content:
                content = content.split("```json")[1].split("```")[0]
            elif "```" in content:
                content = content.split("```")[1].split("```")[0]

            translated = json.loads(content.strip())
            translated["_lang_code"] = lang_code

            # 存入数据库
            db_storage.save_ui_translations(lang_code, translated)
            return translated
    except Exception as e:
        print(f"UI translation error: {e}")

    raise HTTPException(status_code=500, detail="UI 翻译生成失败，请稍后重试")



