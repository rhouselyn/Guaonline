"""认证依赖注入。"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth.jwt_utils import decode_token
from auth.models import TokenData, UserTier

security = HTTPBearer(auto_error=False)


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> TokenData | None:
    """从 JWT 获取当前用户，未登录返回 None（允许匿名访问社区版）。"""
    if credentials is None:
        return None
    token_data = decode_token(credentials.credentials)
    if token_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="无效的认证凭据",
        )
    return token_data


async def require_auth(current_user: TokenData = Depends(get_current_user)) -> TokenData:
    """要求用户必须登录。"""
    if current_user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="请先登录",
        )
    return current_user
