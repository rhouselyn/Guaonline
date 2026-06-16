"""用户与订阅数据模型。"""

from datetime import datetime
from pydantic import BaseModel
from typing import Optional
from enum import Enum


class UserTier(str, Enum):
    free = "free"
    basic = "basic"
    pro = "pro"


class UserBase(BaseModel):
    email: str
    name: Optional[str] = None


class UserCreate(UserBase):
    password: str


class UserLogin(BaseModel):
    email: str
    password: str


class User(UserBase):
    id: str
    tier: UserTier = UserTier.free
    created_at: Optional[str] = None
    quota_used: int = 0
    quota_max: int = 50

    class Config:
        from_attributes = True


class Token(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    user_id: str
    tier: UserTier = UserTier.free


class AdminTokenData(BaseModel):
    role: str = "admin"
