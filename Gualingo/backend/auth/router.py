"""用户认证路由。"""

import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
import bcrypt
from auth.models import UserCreate, UserLogin, User, Token, UserTier
from auth.jwt_utils import create_tokens, decode_token
from auth.deps import require_auth, get_current_user, TokenData
from auth.quota import init_quota, check_and_refill_quota, consume_quota
from config import DATA_DIR
import sqlite3

router = APIRouter(prefix="/api/auth", tags=["auth"])

USER_DB_PATH = str(DATA_DIR / "users.db")


def _get_conn():
    conn = sqlite3.connect(USER_DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            name TEXT,
            password_hash TEXT NOT NULL,
            tier TEXT NOT NULL DEFAULT 'free',
            api_key TEXT,
            base_url TEXT,
            model TEXT,
            quota_used INTEGER DEFAULT 0,
            quota_max INTEGER DEFAULT 200,
            quota_reset_at TEXT,
            created_at TEXT NOT NULL
        )
    """)
    conn.commit()
    # 确保旧表也有新列
    from auth.quota import _ensure_quota_columns
    _ensure_quota_columns(conn)
    # 确保 banned 列存在
    try:
        cursor = conn.execute("PRAGMA table_info(users)")
        columns = {row[1] for row in cursor.fetchall()}
        if "banned" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN banned INTEGER DEFAULT 0")
        if "banned_reason" not in columns:
            conn.execute("ALTER TABLE users ADD COLUMN banned_reason TEXT")
        conn.commit()
    except Exception:
        pass
    return conn


def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def _verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))


@router.post("/register", response_model=Token)
async def register(user_data: UserCreate):
    conn = _get_conn()
    existing = conn.execute("SELECT id FROM users WHERE email = ?", (user_data.email,)).fetchone()
    if existing:
        conn.close()
        raise HTTPException(status_code=400, detail="该邮箱已注册")
    user_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    conn.execute(
        "INSERT INTO users (id, email, name, password_hash, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
        (user_id, user_data.email, user_data.name or user_data.email.split("@")[0],
         _hash_password(user_data.password), UserTier.free.value, now)
    )
    conn.commit()
    conn.close()
    init_quota(user_id, "free")
    return create_tokens(user_id, UserTier.free)


@router.post("/login", response_model=Token)
async def login(user_data: UserLogin):
    conn = _get_conn()
    row = conn.execute("SELECT id, password_hash, tier, banned, banned_reason FROM users WHERE email = ?", (user_data.email,)).fetchone()
    conn.close()
    if not row or not _verify_password(user_data.password, row["password_hash"]):
        raise HTTPException(status_code=401, detail="邮箱或密码错误")
    if row["banned"]:
        reason = row["banned_reason"] or "账号已被封禁"
        raise HTTPException(status_code=403, detail=f"账号已被封禁：{reason}")
    return create_tokens(row["id"], UserTier(row["tier"]))


@router.post("/refresh", response_model=Token)
async def refresh_token(refresh_token: str):
    token_data = decode_token(refresh_token)
    if token_data is None:
        raise HTTPException(status_code=401, detail="无效的刷新令牌")
    conn = _get_conn()
    row = conn.execute("SELECT tier, banned, banned_reason FROM users WHERE id = ?", (token_data.user_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=401, detail="用户不存在")
    if row["banned"]:
        reason = row["banned_reason"] or "账号已被封禁"
        raise HTTPException(status_code=403, detail=f"账号已被封禁：{reason}")
    return create_tokens(token_data.user_id, UserTier(row["tier"]))


@router.get("/me", response_model=User)
async def get_me(current_user: TokenData = Depends(require_auth)):
    conn = _get_conn()
    row = conn.execute(
        "SELECT id, email, name, tier, created_at, quota_used, quota_max FROM users WHERE id = ?",
        (current_user.user_id,)
    ).fetchone()
    conn.close()
    if not row:
        raise HTTPException(status_code=404, detail="用户不存在")
    return User(
        id=row["id"], email=row["email"], name=row["name"],
        tier=UserTier(row["tier"]),
        created_at=row["created_at"],
        quota_used=row["quota_used"] or 0, quota_max=row["quota_max"] or 200
    )


@router.get("/quota")
async def get_quota(current_user: TokenData = Depends(require_auth)):
    return check_and_refill_quota(current_user.user_id)



