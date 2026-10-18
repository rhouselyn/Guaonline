"""设置与UI翻译相关路由：user-preferences, translate_ui"""

import asyncio
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

    # ponytail: 软配对——缓存命中就直接换；只有缺 key 时才补译缺少的那部分，
    # 不再因英文基准变化整包重译（旧行为会让已缓存语言每次都跑一次全量 LLM，很慢）。
    schema_sig = _ui_schema_sig()

    def save_merged(partial: dict):
        """把已翻译部分合并进当前缓存并落库（分批翻译的断点续翻）。"""
        current = db_storage.load_ui_translations(lang_code) or {}
        merged = {**current, **partial, "_lang_code": lang_code, "_schema_sig": schema_sig}
        db_storage.save_ui_translations(lang_code, merged)
        return merged

    # 1. 查数据库缓存，算出缺失的 key
    cached = db_storage.load_ui_translations(lang_code)
    missing = [k for k in UI_TRANSLATION_SCHEMA if not cached or k not in cached]
    if not missing:
        return cached

    # zh/en 不调 LLM，直接从 schema 重建最新值
    if lang_code in ('zh', 'en'):
        result = {k: UI_TRANSLATION_SCHEMA[k].get(lang_code, UI_TRANSLATION_SCHEMA[k].get('en', '')) for k in UI_TRANSLATION_SCHEMA}
        result["_lang_code"] = lang_code
        result["_schema_sig"] = schema_sig
        db_storage.save_ui_translations(lang_code, result)
        return result

    # 2. 分批翻译（首次全量与补缺失 key 同一条路），逐批落库：
    #    中途失败时已成功的批次已缓存，下次请求只补剩下的（断点续翻）；
    #    一批都没成功则抛 500，由前端保留旧语言兜底。
    translated, err = await _translate_keys(lang_code, missing, save_progress=save_merged)
    if translated:
        return save_merged(translated)
    if err:
        raise HTTPException(status_code=500, detail="UI 翻译生成失败，请稍后重试")
    return cached  # 理论上不可达（missing 非空必有 err），保守返回旧缓存


def _ui_schema_sig():
    """UI_TRANSLATION_SCHEMA 的英文基准指纹，写入缓存用于记录基准版本。"""
    import hashlib
    payload = json.dumps(
        {k: v.get("en", "") for k, v in UI_TRANSLATION_SCHEMA.items()},
        ensure_ascii=False, sort_keys=True,
    )
    return hashlib.md5(payload.encode("utf-8")).hexdigest()[:16]


# 单次 LLM 调用翻 400+ 条易被 max_tokens 截断（free 档输出上限 16384）且耗时常超前端 60s 超时，
# 因此分批：每批 80 条，单批独立超时；每批成功即落库。
UI_TRANSLATION_BATCH_SIZE = 80
UI_TRANSLATION_BATCH_TIMEOUT = 150  # 单批秒数上限


def _chunked(seq, size):
    for i in range(0, len(seq), size):
        yield seq[i:i + size]


def _is_chinese_echo(raw: dict, lang_code: str) -> bool:
    """翻译结果大半与中文原文相同 → 模型回显了中文源，判失败（防中毒缓存）。
    zh 系语言（yue 等与中文大量同文）豁免。返回条数太少时不算，靠缺失 key 补译自愈。"""
    if lang_code.startswith('zh') or lang_code == 'yue':
        return False
    if len(raw) < 16:
        return False
    same = sum(1 for k, v in raw.items() if isinstance(v, str) and v.strip() == UI_TRANSLATION_SCHEMA[k]["zh"].strip())
    return same / len(raw) > 0.5


async def _translate_batch(lang_code: str, keys: list) -> dict:
    """单批翻译：调一次 LLM，返回 {key: 译文}（只含本次请求的 key）。失败抛异常。"""
    from llm_api import get_lang_name
    from utils.llm_gateway import gateway

    strings_for_prompt = {
        k: {
            "description": UI_TRANSLATION_SCHEMA[k]["desc"],
            "chinese": UI_TRANSLATION_SCHEMA[k]["zh"],
            "english": UI_TRANSLATION_SCHEMA[k]["en"],
        }
        for k in keys
    }
    prompt = TRANSLATION_PROMPT.format(
        target_lang_name=get_lang_name(lang_code),
        target_lang_code=lang_code,
        strings_json=json.dumps(strings_for_prompt, ensure_ascii=False, indent=2)
    )
    messages = [
        {"role": "system", "content": "You are a professional UI translator. Always respond with valid JSON only."},
        {"role": "user", "content": prompt}
    ]

    call = gateway.call(
        user_id="system", tier="free", messages=messages,
        temperature=0, request_type="ui_translation"
    )
    result = await asyncio.wait_for(call, timeout=UI_TRANSLATION_BATCH_TIMEOUT)

    if not (result and result.get("choices")):
        raise ValueError("empty LLM response")
    content = result["choices"][0]["message"]["content"] or ""
    if "```json" in content:
        content = content.split("```json")[1].split("```")[0]
    elif "```" in content:
        content = content.split("```")[1].split("```")[0]

    raw = json.loads(content.strip())
    if not isinstance(raw, dict):
        raise ValueError("LLM response is not a JSON object")
    # 只保留本次请求的 key 和字符串值，多余内容一律丢弃
    batch = {k: v for k, v in raw.items() if k in keys and isinstance(v, str)}
    if not batch:
        raise ValueError("no usable keys in LLM response")
    if _is_chinese_echo(batch, lang_code):
        raise ValueError("translation echoes Chinese source")
    return batch


async def _translate_keys(lang_code: str, keys: list, save_progress=None):
    """分批翻译 keys，每批成功即通过 save_progress 落库（断点续翻）。
    返回 (accumulated, error)：某批失败时停止后续批次，返回已成功部分和错误描述。"""
    accumulated = {}
    error = None
    for chunk in _chunked(list(keys), UI_TRANSLATION_BATCH_SIZE):
        try:
            accumulated.update(await _translate_batch(lang_code, chunk))
            if save_progress and accumulated:
                save_progress(accumulated)
        except asyncio.TimeoutError:
            print(f"UI translation batch timeout ({lang_code}, {len(chunk)} keys)")
            error = "timeout"
            break
        except Exception as e:
            print(f"UI translation batch error ({lang_code}): {e}")
            error = str(e)
            break
    return accumulated, error



