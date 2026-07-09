"""文本处理相关路由：process-text, status, detect-language, translate-text, generate-text"""

import re
import time
import asyncio
import datetime

import json
from fastapi import APIRouter, HTTPException, BackgroundTasks, Depends, Query
from starlette.responses import StreamingResponse

from llm_api import detect_language, get_lang_name
from utils.llm_gateway import gateway
from utils.state import storage, processing_status
from utils.exercise_generators import process_text_background, generate_title, retry_failed_sentences, refill_missing_words_background, _detect_missing_and_bold
from auth.deps import get_current_user, require_auth, TokenData
from auth.jwt_utils import decode_token
from auth.quota import check_and_refill_quota, consume_quota
from utils.state import text_processor
from vocab import global_vocab, user_vocab

router = APIRouter(prefix="/api", tags=["text-processing"])


async def _preprocess_and_run(file_id: str, text: str, source_lang: str, target_lang: str, mode: str, original_text: str, user_id: str = None, tier: str = "free", consumed_quota: int = 0):
    """后台任务：先做翻译/生成/语言检测，再执行文本处理。"""
    try:
        # 直接输入模式：原文就是用户输入的文本，立即保存
        if mode == "direct":
            if file_id in processing_status:
                processing_status[file_id]["original_text"] = text

        # 1. 翻译/生成预处理
        generation_succeeded = False  # ponytail: 跟踪 LLM 是否产出有效结果，决定额度按结果扣还是退预扣
        if mode == "translate":
            _preserve_tr = {k: processing_status[file_id][k] for k in ("original_text", "title") if k in processing_status.get(file_id, {})}
            processing_status[file_id] = {"status": "processing", "progress": 0, "current_sentence": 0, "total_sentences": 0, "preprocess": "translating", **_preserve_tr}
            # 翻译模式：用户输入母语文本，翻译成学习语言(source_lang)
            # 翻译方向是 target_lang(母语) → source_lang(学习语言)
            source_lang_name = get_lang_name(source_lang)
            target_lang_name = get_lang_name(target_lang)
            gateway.reload()
            messages = [
                {
                    "role": "system",
                    "content": f"You are a professional translator. Translate the following text from {target_lang_name} to {source_lang_name}. Output ONLY the translated text, nothing else. Do not add any explanations, notes, or commentary. The translation should be natural and fluent. CRITICAL: Output must be plain text only. Do NOT use any markdown formatting (no bold, italic, headers, lists, code blocks, etc.), no emojis, no special symbols. Output pure plain text only."
                },
                {"role": "user", "content": text}
            ]
            response = await gateway.call(user_id, tier, messages, temperature=0.3, request_type="translate")
            if "choices" in response and len(response["choices"]) > 0:
                translated = response["choices"][0].get("message", {}).get("content", "").strip()
                if translated:
                    text = translated
                    generation_succeeded = True
            # 翻译完成后立即保存原文
            if file_id in processing_status:
                processing_status[file_id]["original_text"] = text
                processing_status[file_id]["preprocess"] = None
        elif mode == "generate":
            _preserve_gen = {k: processing_status[file_id][k] for k in ("original_text", "title") if k in processing_status.get(file_id, {})}
            processing_status[file_id] = {"status": "processing", "progress": 0, "current_sentence": 0, "total_sentences": 0, "preprocess": "generating", **_preserve_gen}
            source_lang_name = get_lang_name(source_lang)
            gateway.reload()
            messages = [
                {
                    "role": "system",
                    "content": f"You are a text generator. Generate a text in {source_lang_name} based on the user's description. CRITICAL RULES: 1. Generate text content that can include articles, stories, essays, descriptions, dialogues, conversations, or any other natural text form. 2. If the user requests dialogue or conversation content, generate natural exchanges between speakers with clear speaker labels (e.g. A:, B:, or names). 3. Do NOT include any meta-commentary, explanations, or notes about the text itself. 4. The text should be natural, coherent, and suitable for language learning. 5. The text should be at least 3-5 sentences long (or 3-5 exchanges for dialogue). 6. Output ONLY the generated text, nothing else. 7. CRITICAL: Output must be plain text only. Do NOT use any markdown formatting (no bold, italic, headers, lists, code blocks, etc.), no emojis, no special symbols. Output pure plain text only."
                },
                {"role": "user", "content": text}
            ]
            response = await gateway.call(user_id, tier, messages, temperature=0.7, request_type="generate")
            if "choices" in response and len(response["choices"]) > 0:
                generated = response["choices"][0].get("message", {}).get("content", "").strip()
                if generated:
                    text = generated
                    generation_succeeded = True
            # 生成完成后立即保存原文
            if file_id in processing_status:
                processing_status[file_id]["original_text"] = text
                processing_status[file_id]["preprocess"] = None

        # 额度按实际处理句子数补扣：translate/generate 模式下，输入文本不等于最终处理文本，
        # 需要按生成/翻译后的实际句子数计算并补扣差额。
        # ponytail: 仅当生成成功才按结果句数扣；生成失败则退还预扣，不扣提示词。
        if mode in ("translate", "generate") and user_id:
            try:
                if generation_succeeded:
                    actual_sentences = text_processor.split_sentences(text.strip())
                    actual_count = max(1, min(len(actual_sentences), 50))
                    # consumed_quota 是 process-text 阶段预扣的额度，按结果句数补差额
                    extra = actual_count - consumed_quota
                    if extra > 0:
                        from auth.quota import consume_quota, check_and_refill_quota
                        qi = check_and_refill_quota(user_id)
                        if qi.get("max") != -1 and qi.get("available", 0) < extra:
                            # 额度不足以补扣，按可用额度扣减即可（不阻断已完成的处理）
                            extra = max(0, qi.get("available", 0))
                        if extra > 0:
                            consume_quota(user_id, extra)
                            consumed_quota += extra
                else:
                    # 生成失败：退还预扣的额度，提示词不计费
                    from auth.quota import refund_quota
                    refund_quota(user_id, consumed_quota)
                    consumed_quota = 0
            except Exception as e:
                print(f"[WARN] 额度补扣失败: {e}")

        # 2. 语言检测
        if source_lang == "auto":
            _preserve_lang = {k: processing_status[file_id][k] for k in ("original_text", "title") if k in processing_status.get(file_id, {})}
            processing_status[file_id] = {"status": "processing", "progress": 0, "current_sentence": 0, "total_sentences": 0, "preprocess": "detecting", **_preserve_lang}
            try:
                source_lang = await detect_language(text)
            except Exception as e:
                print(f"[WARN] Language detection failed: {e}")
                source_lang = "en"

        # 3. 更新语言设置和历史记录
        # ponytail: translate/generate 模式保存用户提示词（original_text 入参即用户原始输入），
        # direct 模式无提示词。prompt 单独存储，不覆盖 original_text（已存为生成/翻译结果）。
        user_prompt = original_text if mode in ("translate", "generate") else None
        storage.save_language_settings(file_id, source_lang, target_lang, original_text=text, prompt=user_prompt)
        # 同步更新 processing_status 中的 source_lang，让前端轮询能拿到
        if file_id in processing_status:
            processing_status[file_id]["source_lang"] = source_lang
        app_settings = storage.load_user_preferences(user_id=user_id)
        recent_langs = app_settings.get("recent_languages", [])
        if source_lang in recent_langs:
            recent_langs.remove(source_lang)
        recent_langs.insert(0, source_lang)
        recent_langs = recent_langs[:10]
        app_settings["recent_languages"] = recent_langs
        storage.save_user_preferences(app_settings, user_id=user_id)

        # 4. 生成标题
        title = await generate_title(text, source_lang, user_id=user_id, tier=tier)
        # 更新 processing_status 中的标题
        if file_id in processing_status:
            processing_status[file_id]["title"] = title

        # 5. 更新历史记录（记录已在 process-text API 中创建，source_lang 初始为 "auto"）。
        # 必须用检测到的 source_lang 更新历史记录，否则标题生成失败时记录会永远停留在 "auto"，
        # 导致 HistorySidebar 语言分组错乱、单词总表按语言过滤时取不到 vocab。
        text_preview = text.strip()[:100]
        storage.add_history_record(file_id, title or "", source_lang, target_lang, text_preview, user_id=user_id)

        # 6. 执行文本处理
        await process_text_background(file_id, text, source_lang, target_lang, user_id=user_id, tier=tier)

        # 7. 写入词汇缓存（从处理结果中提取）
        try:
            vocab_list = storage.load_vocab(file_id)
            if vocab_list:
                if isinstance(vocab_list, dict) and "vocab" in vocab_list:
                    vocab_list = vocab_list["vocab"]
                user_vocab.batch_upsert(user_id, vocab_list, source_lang, target_lang)
                global_vocab.batch_upsert(vocab_list, source_lang, target_lang)
        except Exception as e:
            print(f"[WARN] 词汇缓存写入失败: {e}")
    except Exception as e:
        print(f"[ERROR] 预处理或处理出错: {str(e)}")
        import traceback
        traceback.print_exc()
        error_msg = str(e)
        # 提供更友好的错误信息
        if "401" in error_msg or "Unauthorized" in error_msg or "authentication" in error_msg.lower():
            error_msg = "API Key 无效或已过期，请检查设置中的 API Key"
        elif "429" in error_msg or "rate_limit" in error_msg.lower() or "too many requests" in error_msg.lower():
            error_msg = "API 请求频率超限，请稍后重试或降低 LLM 速率"
        elif "402" in error_msg or "payment" in error_msg.lower() or "quota" in error_msg.lower() or "balance" in error_msg.lower():
            error_msg = "API 余额不足，请充值后重试"
        elif "ConnectError" in error_msg or "ConnectionError" in error_msg or "ConnectionRefused" in error_msg:
            error_msg = "无法连接到 API 服务，请检查网络或 API 地址"
        processing_status[file_id] = {
            "status": "error",
            "error": error_msg
        }
        # 处理失败：删除历史记录，退还额度
        try:
            storage.delete_history_record(file_id)
        except Exception:
            pass
        if consumed_quota > 0 and user_id:
            try:
                from auth.quota import refund_quota
                refund_quota(user_id, consumed_quota)
            except Exception:
                pass


# 每用户每分钟最高请求数
_RATE_LIMIT_MAX = 3
_rate_limit_store: dict = {}  # user_id -> [timestamp, ...]


def _check_rate_limit(user_id: str) -> bool:
    """检查用户是否超过限流。返回 True 表示允许，False 表示拒绝。"""
    import time
    now = time.time()
    window = 60  # 60秒窗口
    if user_id not in _rate_limit_store:
        _rate_limit_store[user_id] = []
    # 清理过期记录
    _rate_limit_store[user_id] = [t for t in _rate_limit_store[user_id] if now - t < window]
    if len(_rate_limit_store[user_id]) >= _RATE_LIMIT_MAX:
        return False
    _rate_limit_store[user_id].append(now)
    return True


@router.post("/process-text")
async def process_text(request: dict, background_tasks: BackgroundTasks, current_user: TokenData = Depends(require_auth)):
    try:
        # 限流检查
        if not _check_rate_limit(current_user.user_id):
            raise HTTPException(status_code=429, detail="rateLimitExceeded")

        text = request.get("text", "")
        source_lang = request.get("source_language", "en")
        target_lang = request.get("target_language", "en")
        mode = request.get("mode", "direct")

        if not text:
            raise HTTPException(status_code=400, detail="Text is required")

        now = datetime.datetime.now()
        file_id = f"text_{now.strftime('%Y%m%d_%H%M%S_%f')[:-3]}"

        # 预估句子数并检查额度
        consumed_quota = 0
        from auth.quota import check_and_refill_quota
        quota_info = check_and_refill_quota(current_user.user_id)
        if quota_info["max"] != -1:  # 非无限额度
            if mode == "direct":
                # 直接输入模式：按输入文本的句子数预估
                estimated_sentences = text_processor.split_sentences(text.strip())
                sentence_count = max(1, len(estimated_sentences))
                sentence_count = min(sentence_count, 50)
            else:
                # translate/generate 模式：输入只是提示词，实际处理句子数未知
                # 先按最小预扣值检查（保证至少有额度），实际差额在生成完成后补扣
                sentence_count = 1

            if quota_info["available"] < sentence_count:
                # 获取用户界面语言对应的翻译
                from db_storage import DatabaseStorage
                db = DatabaseStorage()
                prefs = db.load_user_preferences(user_id=current_user.user_id)
                ui_lang = prefs.get("ui_lang", prefs.get("target_lang", "zh"))

                # 从 UI 翻译缓存获取 quotaInsufficient 翻译
                template = None
                translations = db.load_ui_translations(ui_lang)
                if translations:
                    template = translations.get("quotaInsufficient")
                # 回退到中文
                if not template:
                    from ui_translations import UI_TRANSLATION_SCHEMA
                    schema = UI_TRANSLATION_SCHEMA.get("quotaInsufficient", {})
                    template = schema.get(ui_lang) or schema.get("zh", "额度不足：需要 {0} 句，剩余 {1} 句")

                detail = template.replace("{0}", str(sentence_count)).replace("{1}", str(quota_info["available"]))
                raise HTTPException(status_code=402, detail=detail)

            # 额度足够，立即扣减（translate/generate 模式只预扣最小值，差额稍后补扣）
            from auth.quota import consume_quota
            consume_quota(current_user.user_id, sentence_count)
            consumed_quota = sentence_count

        # 立即设置初始状态
        preprocess_label = ""
        if mode == "translate":
            preprocess_label = "translating"
        elif mode == "generate":
            preprocess_label = "generating"
        elif source_lang == "auto":
            preprocess_label = "detecting"

        processing_status[file_id] = {
            "status": "processing",
            "progress": 0,
            "current_sentence": 0,
            "total_sentences": 0,
            "preprocess": preprocess_label if preprocess_label else None
        }

        # 如果语言已知（非auto），立即保存，避免前端轮询时拿到默认值 "en"
        if source_lang != "auto":
            storage.save_language_settings(file_id, source_lang, target_lang, original_text=text)

        # 立即写入历史记录（标题稍后更新），让用户可以退出后重新进入
        text_preview = text.strip()[:100]
        storage.add_history_record(file_id, "", source_lang, target_lang, text_preview, user_id=current_user.user_id)

        # 所有耗时操作（翻译/生成/语言检测/标题生成/文本处理）全部在后台执行
        background_tasks.add_task(_preprocess_and_run, file_id, text, source_lang, target_lang, mode, text, current_user.user_id, current_user.tier.value, consumed_quota)

        return {
            "file_id": file_id,
            "status": "processing",
            "title": ""
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/process-text/{file_id}/retry-sentences")
async def retry_sentences(file_id: str, background_tasks: BackgroundTasks, current_user: TokenData = Depends(require_auth)):
    """重试此前失败的句子。

    ponytail: 原实现要求 processing_status 内存态存在且为 error+partial，否则 404/400。
    问题：后端重启后 processing_status 全部丢失，用户重进条目无法触发续生成（与单词详情
    的"无缓存即触发后台生成"行为不一致）。改为：内存态缺失时从 pipeline_data 检测 __failed
    标记，命中则恢复 processing 状态并启动后台重试。这样句子重进即可像单词详情一样自动续生成。
    """
    st = processing_status.get(file_id)
    if st:
        if st.get("status") == "processing":
            # 已在重试中，避免重复触发
            return {"file_id": file_id, "status": "processing", "preprocess": st.get("preprocess")}
        if st.get("status") != "error" or not st.get("partial"):
            raise HTTPException(status_code=400, detail="当前状态不支持重试失败句子")
        total = st.get("total_sentences", 0)
        _preserve = {k: st[k] for k in ("original_text", "title") if k in st}
    else:
        # 内存态丢失（如后端重启）：从 pipeline_data 检测 __failed 标记
        pipeline = storage.load_pipeline_data(file_id) or []
        failed_indices = [i for i, sd in enumerate(pipeline) if isinstance(sd, dict) and sd.get("__failed")]
        if not failed_indices:
            raise HTTPException(status_code=404, detail="File not found")
        total = len(pipeline)
        # 从 language_settings 恢复原文/标题，供 retry_failed_sentences 使用
        settings = storage.load_language_settings(file_id) or {}
        _preserve = {}
        if settings.get("original_text"):
            _preserve["original_text"] = settings["original_text"]
        # 标题从 history 取
        try:
            history = storage.load_history(user_id=current_user.user_id)
            for r in history:
                if r.get("file_id") == file_id:
                    if r.get("title"):
                        _preserve["title"] = r["title"]
                    break
        except Exception:
            pass
    # 立即置为处理中，避免前端重复触发
    processing_status[file_id] = {"status": "processing", "progress": 0, "current_sentence": 0,
                                  "total_sentences": total, "preprocess": "retrying", **_preserve}
    background_tasks.add_task(retry_failed_sentences, file_id, current_user.user_id, current_user.tier.value)
    return {"file_id": file_id, "status": "processing", "preprocess": "retrying"}


@router.post("/process-text/{file_id}/refill-missing-words")
async def refill_missing_words(file_id: str, background_tasks: BackgroundTasks,
                               current_user: TokenData = Depends(require_auth)):
    """进入条目时检查并补漏缺词。快速检测（不调 LLM）→ 有漏词则后台补漏 → 返回 needs_refill。

    无漏词返回 needs_refill=false；有漏词则把状态置为 refilling 并启动后台任务，
    前端通过轮询 status 拿 preprocess=refilling 进度，实时更新句子与词汇表。
    """
    # 正在处理/重试中的条目不干预——主流程本身已含补漏
    st = processing_status.get(file_id)
    if st and st.get("status") == "processing":
        return {"file_id": file_id, "needs_refill": False, "skipping": True}

    pipeline = storage.load_pipeline_data(file_id) or []
    settings = storage.load_language_settings(file_id) or {}
    source_lang = settings.get("source_lang", "en")

    # 快速检测：只跑 _detect_missing_and_bold（纯 CPU，不调 LLM）
    needs_refill = 0
    for sd in pipeline:
        if not isinstance(sd, dict):
            continue
        sentence = sd.get("sentence", "")
        tr = sd.get("translation_result", {})
        if not sentence or not isinstance(tr, dict):
            continue
        words = text_processor.extract_words(sentence, source_lang)
        missing_spans, _ = _detect_missing_and_bold(sentence, words, tr, source_lang)
        if missing_spans:
            needs_refill += 1

    _preserve = {k: st.get(k) for k in ("original_text", "title") if st and k in st}
    if needs_refill == 0:
        # 无漏词：确保 status 为 completed（处理后端重启后 status 丢失的 404 场景）
        processing_status[file_id] = {"status": "completed", "progress": 100, **_preserve}
        return {"file_id": file_id, "needs_refill": False}

    processing_status[file_id] = {
        "status": "processing", "progress": 0,
        "current_sentence": 0, "total_sentences": needs_refill,
        "preprocess": "refilling", **_preserve
    }
    background_tasks.add_task(refill_missing_words_background, file_id, current_user.user_id, current_user.tier.value)
    return {"file_id": file_id, "needs_refill": True, "missing_count": needs_refill}


@router.get("/status/{file_id}")
async def get_status(file_id: str):
    if file_id not in processing_status:
        raise HTTPException(status_code=404, detail="File not found")
    return processing_status[file_id]


def _require_auth_for_sse(token: str = Query(None)):
    """SSE 专用认证：EventSource 不能设置自定义 header，所以接受 ?token=xxx。复用 admin.py 同款范式。"""
    if not token:
        raise HTTPException(status_code=401, detail="缺少 token")
    token_data = decode_token(token)
    if token_data is None:
        raise HTTPException(status_code=401, detail="token 无效或已过期")
    return token_data


@router.get("/status/{file_id}/stream")
async def stream_status(file_id: str, current_user: TokenData = Depends(_require_auth_for_sse)):
    """SSE 实时推送处理状态。处理流程 0 改动——这里读同一个 processing_status dict，sig 去重后推送。

    ponytail: 用服务端内部 0.3s 轮询内存 dict（无 HTTP/认证开销）替代前端 1s HTTP 轮询。
    终态(completed/error)推送后发 event:end 关闭连接，避免长连接挂着。
    """
    async def event_stream():
        last_sig = None
        while True:
            st = processing_status.get(file_id)
            if st is not None:
                # 排除不可序列化的 sentence_translations（可能很大），前端轮询本就不依赖它
                st_clean = {k: v for k, v in st.items() if k != "sentence_translations"}
                sig = json.dumps(st_clean, ensure_ascii=False, sort_keys=True, default=str)
                if sig != last_sig:
                    last_sig = sig
                    yield f"data: {json.dumps(st_clean, ensure_ascii=False, default=str)}\n\n"
                    if st.get("status") in ("completed", "error"):
                        yield 'event: end\ndata: done\n\n'
                        return
            try:
                await asyncio.sleep(0.3)
            except asyncio.CancelledError:
                return

    return StreamingResponse(event_stream(), media_type="text/event-stream",
                            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@router.post("/detect-language")
async def detect_language_endpoint(request: dict):
    try:
        text = request.get("text", "")
        if not text:
            raise HTTPException(status_code=400, detail="Text is required")
        lang = await detect_language(text)
        return {"detected_language": lang}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/translate-text")
async def translate_text(request: dict, current_user: TokenData = Depends(require_auth)):
    try:
        text = request.get("text", "")
        source_lang = request.get("source_language", "zh")
        target_lang = request.get("target_language", "en")

        if not text:
            raise HTTPException(status_code=400, detail="Text is required")

        source_lang_name = get_lang_name(source_lang)
        target_lang_name = get_lang_name(target_lang)

        gateway.reload()
        messages = [
            {
                "role": "system",
                "content": f"You are a professional translator. Translate the following text from {source_lang_name} to {target_lang_name}. Output ONLY the translated text, nothing else. Do not add any explanations, notes, or commentary. The translation should be natural and fluent. CRITICAL: Output must be plain text only. Do NOT use any markdown formatting (no bold, italic, headers, lists, code blocks, etc.), no emojis, no special symbols. Output pure plain text only."
            },
            {
                "role": "user",
                "content": text
            }
        ]
        response = await gateway.call(current_user.user_id, current_user.tier.value, messages, temperature=0.3, request_type="translate")

        translated_text = ""
        if "choices" in response and len(response["choices"]) > 0:
            translated_text = response["choices"][0].get("message", {}).get("content", "").strip()

        if not translated_text:
            raise HTTPException(status_code=500, detail="Translation failed")

        return {"translated_text": translated_text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-text")
async def generate_text(request: dict, current_user: TokenData = Depends(require_auth)):
    try:
        prompt = request.get("prompt", "")
        source_lang = request.get("source_language", "en")
        target_lang = request.get("target_language", "zh")

        if not prompt:
            raise HTTPException(status_code=400, detail="Prompt is required")

        source_lang_name = get_lang_name(source_lang)

        gateway.reload()
        messages = [
            {
                "role": "system",
                "content": f"You are a text generator. Generate a text in {source_lang_name} based on the user's description. CRITICAL RULES: 1. Generate text content that can include articles, stories, essays, descriptions, dialogues, conversations, or any other natural text form. 2. If the user requests dialogue or conversation content, generate natural exchanges between speakers with clear speaker labels (e.g. A:, B:, or names). 3. Do NOT include any meta-commentary, explanations, or notes about the text itself. 4. The text should be natural, coherent, and suitable for language learning. 5. The text should be at least 3-5 sentences long (or 3-5 exchanges for dialogue). 6. Output ONLY the generated text, nothing else. 7. CRITICAL: Output must be plain text only. Do NOT use any markdown formatting (no bold, italic, headers, lists, code blocks, etc.), no emojis, no special symbols. Output pure plain text only."
            },
            {
                "role": "user",
                "content": prompt
            }
        ]
        response = await gateway.call(current_user.user_id, current_user.tier.value, messages, temperature=0.7, request_type="generate")

        generated_text = ""
        if "choices" in response and len(response["choices"]) > 0:
            generated_text = response["choices"][0].get("message", {}).get("content", "").strip()

        if not generated_text:
            raise HTTPException(status_code=500, detail="Text generation failed")

        return {"generated_text": generated_text}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
