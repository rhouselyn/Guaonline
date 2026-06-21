"""JWT token 生成与验证。"""

import os
from datetime import datetime, timedelta, timezone
from jose import jwt, JWTError
from auth.models import UserTier, TokenData, AdminTokenData

SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-secret-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 7 * 24 * 60  # 7天
REFRESH_TOKEN_EXPIRE_DAYS = 7


def create_access_token(user_id: str, tier: UserTier) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": user_id, "tier": tier.value, "exp": expire, "type": "access"}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(user_id: str, tier: UserTier) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {"sub": user_id, "tier": tier.value, "exp": expire, "type": "refresh"}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> TokenData | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        tier: str = payload.get("tier", "free")
        if user_id is None:
            return None
        return TokenData(user_id=user_id, tier=UserTier(tier))
    except (JWTError, ValueError):
        return None


def create_tokens(user_id: str, tier: UserTier) -> dict:
    return {
        "access_token": create_access_token(user_id, tier),
        "refresh_token": create_refresh_token(user_id, tier),
        "token_type": "bearer",
    }


def create_admin_access_token() -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {"sub": "admin", "role": "admin", "exp": expire, "type": "access"}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def create_admin_tokens() -> dict:
    refresh_expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    refresh_payload = {"sub": "admin", "role": "admin", "exp": refresh_expire, "type": "refresh"}
    return {
        "access_token": create_admin_access_token(),
        "refresh_token": jwt.encode(refresh_payload, SECRET_KEY, algorithm=ALGORITHM),
        "token_type": "bearer",
    }


def decode_admin_token(token: str) -> AdminTokenData | None:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        if payload.get("role") != "admin":
            return None
        return AdminTokenData(role="admin")
    except (JWTError, ValueError):
        return None
