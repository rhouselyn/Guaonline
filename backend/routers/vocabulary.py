"""词汇相关路由：vocab/*, word/*, word-detail/*, word-list"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
from auth.deps import require_auth, TokenData

from utils.llm_gateway import gateway
from utils.state import storage
from utils.helpers import fix_llm_options_result, is_word_cache_complete, extract_mc_options, build_context_sentences
from utils.exercise_generators import _gateway_generate_multiple_choice

router = APIRouter(prefix="/api", tags=["vocabulary"])


@router.get("/vocab/{file_id}")
async def get_vocab(file_id: str):
    try:
        vocab = storage.load_vocab(file_id)
        if isinstance(vocab, dict) and "vocab" in vocab:
            vocab_list = vocab["vocab"]
        elif isinstance(vocab, list):
            vocab_list = vocab
        else:
            vocab_list = []

        language_settings = storage.load_language_settings(file_id)
        source_lang = language_settings.get("source_lang", "en")

        enriched_list = []
        for entry in vocab_list:
            enriched_entry = dict(entry)
            word = entry.get("word", "")
            cached = storage.load_word_cache(file_id, word)
            if not cached and word:
                # 当前文件无缓存，查全局缓存
                cached = storage.find_global_word_cache(word, source_lang)
            if cached:
                if cached.get("enriched_meaning"):
                    enriched_entry["enriched_meaning"] = cached["enriched_meaning"]
                if cached.get("ipa"):
                    enriched_entry["ipa"] = cached["ipa"]
                if cached.get("morphology"):
                    enriched_entry["morphology"] = cached["morphology"]
                if cached.get("variants_detail"):
                    enriched_entry["variants_detail"] = cached["variants_detail"]
                if cached.get("examples"):
                    enriched_entry["examples"] = cached["examples"]
                if cached.get("memory_hint"):
                    enriched_entry["memory_hint"] = cached["memory_hint"]
            enriched_list.append(enriched_entry)

        return {"vocab": enriched_list}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Vocab not found: {str(e)}")


@router.get("/sentences/{file_id}")
async def get_sentences(file_id: str):
    try:
        sentences = storage.load_pipeline_data(file_id)
        return {"sentences": sentences}
    except Exception as e:
        raise HTTPException(status_code=404, detail=f"Sentences not found: {str(e)}")


@router.get("/word/{file_id}/{word}")
async def get_word_details(file_id: str, word: str, current_user: TokenData = Depends(require_auth)):
    try:
        print(f"[DEBUG] 获取单词详情: {word}")
        language_settings = storage.load_language_settings(file_id)
        source_lang = language_settings.get("source_lang", "en")
        target_lang = language_settings["target_lang"]

        # 1. 先检查当前文件的缓存
        cached_word = storage.load_word_cache(file_id, word)
        if not cached_word:
            # 2. 当前文件无缓存，查全局缓存
            global_cached = storage.find_global_word_cache(word, source_lang)
            if global_cached:
                print(f"[DEBUG] 从全局缓存获取单词信息: {word}")
                import copy
                cached_word = copy.deepcopy(global_cached)
                # 补充当前文件的 context_sentences
                context_sents = build_context_sentences(storage.load_pipeline_data(file_id), word)
                if context_sents:
                    cached_word["context_sentences"] = context_sents
                    cached_word["context"] = context_sents[0]["sentence"]
                # 保存到当前文件的缓存
                storage.save_word_cache(file_id, word, cached_word)

        if cached_word:
            # 缓存完整性检查：不完整则当作无缓存，走重新生成流程
            if not is_word_cache_complete(cached_word):
                print(f"[DEBUG] 缓存不完整，将重新生成: {word}")
                cached_word = None
                storage.delete_word_cache(file_id, word)
            else:
                print(f"[DEBUG] 从缓存中获取单词信息: {word}")
                cached_word = fix_llm_options_result(cached_word, source_lang, file_id)
                if "options" not in cached_word:
                    options, correct_index = extract_mc_options(cached_word)
                    if options:
                        cached_word["options"] = options
                        cached_word["correct_index"] = correct_index

                context_sents = cached_word.get("context_sentences", [])
                needs_rebuild = any(
                    isinstance(cs, str) or (isinstance(cs, dict) and "sentence_index" not in cs)
                    for cs in context_sents
                )
                if needs_rebuild or not context_sents:
                    rebuilt = build_context_sentences(storage.load_pipeline_data(file_id), word)
                    if rebuilt:
                        cached_word["context_sentences"] = rebuilt
                        storage.save_word_cache(file_id, word, cached_word)

                return cached_word

        # 无缓存：判断是否所有单词已生成完
        print(f"[DEBUG] 单词详情无缓存: {word}")
        from utils.state import word_gen_state
        from utils.exercise_generators import process_single_word_gen, background_word_gen
        import asyncio

        vocab = storage.load_vocab(file_id)
        if isinstance(vocab, dict) and "vocab" in vocab:
            vocab = vocab["vocab"]

        # 检查所有单词是否已生成完（含完整性检查）
        all_completed = all(
            (lambda c: c is not None and is_word_cache_complete(c))(storage.load_word_cache(file_id, w.get("word", "")))
            for w in vocab if w.get("word")
        )

        if all_completed:
            # 所有单词都已生成完，但这个单词缓存无效/被清除了，直接重新生成
            print(f"[DEBUG] 所有单词已生成完，直接重新生成: {word}")
            if file_id not in word_gen_state:
                word_gen_state[file_id] = {
                    "running": False,
                    "vocab": vocab,
                    "priority_queue": [],
                    "task": None,
                    "processing_words": set(),
                    "user_id": current_user.user_id,
                    "tier": current_user.tier.value,
                }
            state = word_gen_state[file_id]
            state["vocab"] = vocab
            if "processing_words" not in state:
                state["processing_words"] = set()
            if "plan_position" not in state:
                state["plan_position"] = 0

            await process_single_word_gen(file_id, word, vocab, source_lang, target_lang, user_id=current_user.user_id, tier=current_user.tier.value)

            cached_word = storage.load_word_cache(file_id, word)
            if cached_word:
                cached_word = fix_llm_options_result(cached_word, source_lang, file_id)
                options, correct_index = extract_mc_options(cached_word)
                if options:
                    cached_word["options"] = options
                    cached_word["correct_index"] = correct_index
                    return cached_word

            raise HTTPException(status_code=404, detail="Word detail generation failed")
        else:
            # 还有单词未生成完，加入优先队列等待后台任务处理
            print(f"[DEBUG] 单词生成未完成，加入优先队列: {word}")
            state = word_gen_state.get(file_id)
            if state:
                state["priority_queue"] = [w for w in state.get("priority_queue", []) if w.lower() != word.lower()]
                state["priority_queue"].insert(0, word)
                if not state.get("running"):
                    state["running"] = True
                    state["task"] = asyncio.create_task(background_word_gen(file_id))
            else:
                word_gen_state[file_id] = {
                    "running": True,
                    "vocab": vocab,
                    "priority_queue": [word],
                    "task": asyncio.create_task(background_word_gen(file_id)),
                    "processing_words": set(),
                    "user_id": current_user.user_id,
                    "tier": current_user.tier.value,
                }

            for _ in range(60):
                await asyncio.sleep(1)
                cached_word = storage.load_word_cache(file_id, word)
                if cached_word and is_word_cache_complete(cached_word):
                    break

            if cached_word and is_word_cache_complete(cached_word):
                cached_word = fix_llm_options_result(cached_word, source_lang, file_id)
                options, correct_index = extract_mc_options(cached_word)
                if options:
                    cached_word["options"] = options
                    cached_word["correct_index"] = correct_index
                    return cached_word

            raise HTTPException(status_code=404, detail="Word detail generation timed out")
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] 获取单词详情失败: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error getting word details: {str(e)}")


@router.post("/word-detail/regenerate")
async def regenerate_word_detail(request: dict, current_user: TokenData = Depends(require_auth)):
    try:
        word = request.get("word", "")
        source_lang = request.get("source_lang", "en")
        target_lang = request.get("target_lang", "zh")
        if not word:
            raise HTTPException(status_code=400, detail="Word is required")

        records = storage.load_history(user_id=current_user.user_id)
        matching = [r for r in records if r.get("source_lang") == source_lang]

        for record in matching:
            file_id = record.get("file_id")
            if file_id:
                storage.delete_word_cache(file_id, word)

        options_result = await _gateway_generate_multiple_choice(
            current_user.user_id, current_user.tier.value,
            word, "", "", target_lang, source_lang, 0.7
        )
        file_id = matching[0].get("file_id") if matching else None
        if file_id:
            options_result = fix_llm_options_result(options_result, source_lang, file_id)

        result = {
            "word": options_result.get("word", word),
            "ipa": "",
            "meaning": options_result.get("enriched_meaning", ""),
            "enriched_meaning": options_result.get("enriched_meaning", ""),
            "part_of_speech": options_result.get("morphology", ""),
            "examples": options_result.get("examples", []),
            "memory_hint": options_result.get("memory_hint", ""),
            "variants_detail": options_result.get("variants_detail", []),
        }

        if file_id:
            cache_data = dict(options_result)
            cache_data["word"] = options_result.get("word", word)
            cache_data["meaning"] = options_result.get("enriched_meaning", "")
            cache_data["context"] = ""
            cache_data["context_sentences"] = []
            cache_data["morphology"] = options_result.get("morphology", "")
            cache_data["multiple_choice"] = options_result.get("multiple_choice", {})
            storage.save_word_cache(file_id, word, cache_data, overwrite_index=True)

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/word/{file_id}/{word}/regenerate")
async def regenerate_word_detail_by_file(file_id: str, word: str, current_user: TokenData = Depends(require_auth)):
    try:
        language_settings = storage.load_language_settings(file_id)
        source_lang = language_settings.get("source_lang", "en")
        target_lang = language_settings["target_lang"]

        # Delete the existing word cache
        storage.delete_word_cache(file_id, word)

        # Load vocab to find the word entry
        vocab = storage.load_vocab(file_id)
        if isinstance(vocab, dict) and "vocab" in vocab:
            vocab = vocab["vocab"]
        word_entry = None
        for v in vocab:
            if v.get("word", "").lower() == word.lower():
                word_entry = v
                break
        if not word_entry:
            raise HTTPException(status_code=404, detail=f"Word '{word}' not found in vocab")

        # Load pipeline data to find context sentences
        sentences = storage.load_pipeline_data(file_id)
        context_sentences = build_context_sentences(sentences, word)
        context = context_sentences[0]["sentence"] if context_sentences else (sentences[0].get("sentence", "") if sentences else "")

        correct_meaning = word_entry.get("meaning", "")
        if not correct_meaning:
            if "translation" in word_entry:
                correct_meaning = word_entry["translation"]
            elif "context_meaning" in word_entry:
                correct_meaning = word_entry["context_meaning"]

        # Generate with temperature 0.7
        options_result = await _gateway_generate_multiple_choice(
            current_user.user_id, current_user.tier.value,
            word,
            correct_meaning,
            context,
            target_lang,
            source_lang,
            0.7
        )
        options_result = fix_llm_options_result(options_result, source_lang, file_id)

        # Save to cache with all the same fields as process_single_word_gen
        cache_data = dict(options_result)
        cache_data["word"] = options_result.get("word", word)
        cache_data["ipa"] = word_entry.get("ipa", "")
        cache_data["meaning"] = correct_meaning
        cache_data["examples"] = options_result.get("examples", [])
        cache_data["context"] = context
        cache_data["context_sentences"] = context_sentences
        cache_data["morphology"] = word_entry.get("morphology", "")
        cache_data["variants_detail"] = options_result.get("variants_detail", [])
        cache_data["memory_hint"] = options_result.get("memory_hint", "")
        cache_data["enriched_meaning"] = options_result.get("enriched_meaning", correct_meaning)
        cache_data["multiple_choice"] = options_result.get("multiple_choice", {})
        if "context_translations" in cache_data:
            del cache_data["context_translations"]
        storage.save_word_cache(file_id, word, cache_data, overwrite_index=True)

        # Compute options and correct_index from multiple_choice
        options, correct_index = extract_mc_options(options_result)
        cache_data["options"] = options
        cache_data["correct_index"] = correct_index
        return cache_data
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] Regenerate word detail by file failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error regenerating word detail: {str(e)}")


@router.get("/word-detail")
async def get_word_detail(word: str, source_lang: str = "en", target_lang: str = "en", current_user: TokenData = Depends(require_auth)):
    try:
        # 1. 先查当前用户的个人缓存
        records = storage.load_history(user_id=current_user.user_id)
        matching = [r for r in records if r.get("source_lang") == source_lang]

        for record in matching:
            file_id = record.get("file_id")
            if not file_id:
                continue
            cached = storage.load_word_cache(file_id, word)
            if cached:
                return {
                    "word": cached.get("word", word),
                    "ipa": cached.get("ipa", ""),
                    "meaning": cached.get("enriched_meaning", "") or cached.get("meaning", ""),
                    "enriched_meaning": cached.get("enriched_meaning", ""),
                    "part_of_speech": cached.get("morphology", ""),
                    "examples": cached.get("examples", []),
                    "memory_hint": cached.get("memory_hint", ""),
                    "variants_detail": cached.get("variants_detail", []),
                }

        # 2. 个人缓存未命中，查全局缓存
        global_cached = storage.find_global_word_cache(word, source_lang)
        if global_cached:
            return {
                "word": global_cached.get("word", word),
                "ipa": global_cached.get("ipa", ""),
                "meaning": global_cached.get("enriched_meaning", "") or global_cached.get("meaning", ""),
                "enriched_meaning": global_cached.get("enriched_meaning", ""),
                "part_of_speech": global_cached.get("morphology", ""),
                "examples": global_cached.get("examples", []),
                "memory_hint": global_cached.get("memory_hint", ""),
                "variants_detail": global_cached.get("variants_detail", []),
            }

        # 3. 均未命中，调用 LLM 生成
        options_result = await _gateway_generate_multiple_choice(
            current_user.user_id, current_user.tier.value,
            word, "", "", target_lang, source_lang, 0
        )

        # 保存到当前用户的第一个匹配文件缓存
        save_file_id = matching[0].get("file_id") if matching else None
        if save_file_id:
            options_result = fix_llm_options_result(options_result, source_lang, save_file_id)

        result = {
            "word": options_result.get("word", word),
            "ipa": "",
            "meaning": options_result.get("enriched_meaning", ""),
            "enriched_meaning": options_result.get("enriched_meaning", ""),
            "part_of_speech": options_result.get("morphology", ""),
            "examples": options_result.get("examples", []),
            "memory_hint": options_result.get("memory_hint", ""),
            "variants_detail": options_result.get("variants_detail", []),
        }

        if save_file_id:
            cache_data = dict(options_result)
            cache_data["word"] = options_result.get("word", word)
            cache_data["meaning"] = options_result.get("enriched_meaning", "")
            cache_data["context"] = ""
            cache_data["context_sentences"] = []
            cache_data["morphology"] = options_result.get("morphology", "")
            cache_data["multiple_choice"] = options_result.get("multiple_choice", {})
            storage.save_word_cache(save_file_id, word, cache_data)

        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/file/{file_id}/info")
async def get_file_info(file_id: str):
    try:
        settings = storage.load_language_settings(file_id)
        return {
            "source_lang": settings.get("source_lang", "en"),
            "target_lang": settings.get("target_lang", "zh"),
            "original_text": settings.get("original_text", "")
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/word-list")
async def get_word_list(source_lang: Optional[str] = None, target_lang: Optional[str] = None, current_user: TokenData = Depends(require_auth)):
    try:
        records = storage.load_history(user_id=current_user.user_id)
        if source_lang:
            filtered = []
            for r in records:
                rlang = r.get("source_lang", "")
                if rlang == source_lang:
                    filtered.append(r)
                    continue
                if rlang == "auto" or not rlang:
                    file_id = r.get("file_id")
                    if file_id:
                        settings = storage.load_language_settings(file_id)
                        if settings and settings.get("source_lang") == source_lang:
                            filtered.append(r)
                            continue
            records = filtered
        if target_lang:
            records = [r for r in records if r.get("target_lang") == target_lang]

        merged = {}
        for record in records:
            file_id = record.get("file_id")
            if not file_id:
                continue
            vocab = storage.load_vocab(file_id)
            if not vocab:
                continue
            for entry in vocab:
                word_key = entry.get("word", "").lower()
                if not word_key:
                    continue
                if word_key not in merged:
                    merged[word_key] = {"entry": dict(entry), "file_id": file_id}

        result = []
        for word_key, data in merged.items():
            entry = data["entry"]
            file_id = data["file_id"]
            word = entry.get("word", word_key)

            cached = storage.load_word_cache(file_id, word)

            ipa = entry.get("ipa", "")
            meaning = entry.get("meaning", "") or entry.get("context_meaning", "")
            part_of_speech = entry.get("morphology", "")
            examples = []
            memory_hint = ""
            variants_detail = []

            if cached:
                if cached.get("ipa"):
                    ipa = cached["ipa"]
                meaning = cached.get("enriched_meaning", "") or cached.get("meaning", "") or meaning
                if cached.get("meaning") and not meaning:
                    meaning = cached["meaning"]
                if cached.get("examples"):
                    examples = cached["examples"]
                if cached.get("memory_hint"):
                    memory_hint = cached["memory_hint"]
                if cached.get("variants_detail"):
                    variants_detail = cached["variants_detail"]

            result.append({
                "word": word,
                "ipa": ipa,
                "meaning": meaning,
                "enriched_meaning": cached.get("enriched_meaning", "") or meaning if cached else meaning,
                "part_of_speech": part_of_speech,
                "examples": examples,
                "memory_hint": memory_hint,
                "variants_detail": variants_detail,
                "context_sentences": cached.get("context_sentences", []) if cached else [],
            })

        result.sort(key=lambda x: x["word"].lower())
        return {"words": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
