"""用户认证路由。"""

import uuid
import httpx
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
import bcrypt
from auth.models import UserCreate, UserLogin, User, Token, UserTier
from auth.jwt_utils import create_tokens, decode_token
from auth.deps import require_auth, get_current_user, TokenData
from auth.quota import init_quota, check_and_refill_quota, consume_quota
from config import DATA_DIR, HOST, PORT
import sqlite3
import os

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
    # 先尝试 admin refresh token
    from auth.jwt_utils import decode_admin_token, create_admin_tokens
    admin_data = decode_admin_token(refresh_token)
    if admin_data is not None:
        return create_admin_tokens()
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


# ── OAuth 配置 ──────────────────────────────────────────

def _get_oauth_config(provider: str) -> dict:
    """从环境变量读取 OAuth 配置。"""
    prefix = provider.upper()
    client_id = os.getenv(f"{prefix}_CLIENT_ID", "")
    client_secret = os.getenv(f"{prefix}_CLIENT_SECRET", "")
    if not client_id or not client_secret:
        return None
    if provider == "google":
        auth_url = "https://accounts.google.com/o/oauth2/v2/auth"
        token_url = "https://oauth2.googleapis.com/token"
        userinfo_url = "https://www.googleapis.com/oauth2/v3/userinfo"
        scope = "openid email profile"
    elif provider == "github":
        auth_url = "https://github.com/login/oauth/authorize"
        token_url = "https://github.com/login/oauth/access_token"
        userinfo_url = "https://api.github.com/user"
        scope = "user:email"
    else:
        return None
    return {
        "client_id": client_id,
        "client_secret": client_secret,
        "auth_url": auth_url,
        "token_url": token_url,
        "userinfo_url": userinfo_url,
        "scope": scope,
    }


def _get_callback_url(provider: str) -> str:
    base = os.getenv("OAUTH_CALLBACK_BASE", f"http://localhost:{PORT}")
    return f"{base}/api/auth/oauth/{provider}/callback"


@router.get("/oauth/{provider}")
async def oauth_login(provider: str):
    """发起 OAuth 登录，重定向到提供商授权页面。"""
    config = _get_oauth_config(provider)
    if not config:
        raise HTTPException(status_code=400, detail=f"OAuth {provider} 未配置")
    import urllib.parse
    params = {
        "client_id": config["client_id"],
        "redirect_uri": _get_callback_url(provider),
        "response_type": "code",
        "scope": config["scope"],
    }
    url = f"{config['auth_url']}?{urllib.parse.urlencode(params)}"
    return RedirectResponse(url)


@router.get("/oauth/{provider}/callback")
async def oauth_callback(provider: str, code: str = Query(...)):
    """OAuth 回调，用 code 换 token，获取用户信息，登录或注册。"""
    config = _get_oauth_config(provider)
    if not config:
        raise HTTPException(status_code=400, detail=f"OAuth {provider} 未配置")

    async with httpx.AsyncClient() as client:
        # 用 code 换 access_token
        token_resp = await client.post(config["token_url"], data={
            "client_id": config["client_id"],
            "client_secret": config["client_secret"],
            "code": code,
            "redirect_uri": _get_callback_url(provider),
            "grant_type": "authorization_code",
        }, headers={"Accept": "application/json"})
        token_data = token_resp.json()
        access_token = token_data.get("access_token")
        if not access_token:
            raise HTTPException(status_code=400, detail="OAuth 授权失败")

        # 获取用户信息
        if provider == "google":
            resp = await client.get(config["userinfo_url"], headers={"Authorization": f"Bearer {access_token}"})
            info = resp.json()
            email = info.get("email", "")
            name = info.get("name", info.get("given_name", email.split("@")[0]))
        elif provider == "github":
            resp = await client.get(config["userinfo_url"], headers={"Authorization": f"Bearer {access_token}"})
            info = resp.json()
            email = info.get("email", "")
            name = info.get("name", info.get("login", ""))
            # GitHub 可能不返回 email，需要额外请求
            if not email:
                email_resp = await client.get("https://api.github.com/user/emails", headers={"Authorization": f"Bearer {access_token}"})
                emails = email_resp.json()
                for e in emails:
                    if isinstance(e, dict) and e.get("primary"):
                        email = e.get("email", "")
                        break
        else:
            raise HTTPException(status_code=400, detail=f"不支持的 OAuth 提供商: {provider}")

    if not email:
        raise HTTPException(status_code=400, detail="无法获取邮箱地址")

    # 查找或创建用户
    conn = _get_conn()
    row = conn.execute("SELECT id, tier, banned, banned_reason FROM users WHERE email = ?", (email,)).fetchone()

    if row:
        # 已有用户，检查封禁
        if row["banned"]:
            conn.close()
            reason = row["banned_reason"] or "账号已被封禁"
            raise HTTPException(status_code=403, detail=f"账号已被封禁：{reason}")
        user_id = row["id"]
        tier = UserTier(row["tier"])
    else:
        # 新用户，自动注册
        user_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        # OAuth 用户用随机密码
        random_pw = uuid.uuid4().hex
        conn.execute(
            "INSERT INTO users (id, email, name, password_hash, tier, created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (user_id, email, name, _hash_password(random_pw), UserTier.free.value, now)
        )
        conn.commit()
        tier = UserTier.free
        init_quota(user_id, "free")

    conn.close()

    # 生成 JWT
    tokens = create_tokens(user_id, tier)
    import urllib.parse
    # 重定向前端页面，携带 token
    base = os.getenv("OAUTH_FRONTEND_URL", f"http://localhost:{PORT}")
    redirect_url = f"{base}/oauth-callback?{urllib.parse.urlencode(tokens)}"
    return RedirectResponse(redirect_url)



