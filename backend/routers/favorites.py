"""收藏单词路由"""
from fastapi import APIRouter, HTTPException, Depends
from utils.state import storage
from auth.deps import require_auth, TokenData

router = APIRouter(prefix="/api/favorites", tags=["favorites"])

@router.post("/toggle")
async def toggle_favorite(request: dict, current_user: TokenData = Depends(require_auth)):
    word = request.get("word", "")
    # request.get("source_lang", "en") 在 source_lang=null 时返回 None（key 存在），
    # 而 favorite_words.source_lang 有 NOT NULL 约束，NULL 会让 INSERT OR IGNORE 静默失败，
    # 导致 is_favorite_word 永远返回 False、toggle 永远返回 favorited=True（无法取消收藏）。
    source_lang = request.get("source_lang") or "en"
    if not word:
        raise HTTPException(status_code=400, detail="Word is required")
    is_fav = storage.is_favorite_word(word, source_lang, user_id=current_user.user_id)
    if is_fav:
        storage.remove_favorite_word(word, source_lang, user_id=current_user.user_id)
        return {"favorited": False}
    else:
        storage.add_favorite_word(word, source_lang, user_id=current_user.user_id)
        return {"favorited": True}

@router.get("")
async def get_favorites(source_lang: str = None, current_user: TokenData = Depends(require_auth)):
    words = storage.get_favorite_words(source_lang, user_id=current_user.user_id)
    return {"words": words}

@router.get("/check")
async def check_favorite(word: str, source_lang: str = "en", current_user: TokenData = Depends(require_auth)):
    is_fav = storage.is_favorite_word(word, source_lang, user_id=current_user.user_id)
    return {"favorited": is_fav}
