"""认证依赖注入。"""

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from auth.jwt_utils import decode_token
from auth.models import TokenData, UserTier, AdminTokenData

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
    # 封禁检查
    from auth.router import _get_conn
    try:
        conn = _get_conn()
        row = conn.execute("SELECT banned FROM users WHERE id = ?", (current_user.user_id,)).fetchone()
        conn.close()
        if row and row["banned"]:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="账号已被封禁")
    except HTTPException:
        raise
    except Exception:
        pass
    return current_user


async def require_admin(credentials: HTTPAuthorizationCredentials = Depends(security)) -> AdminTokenData:
    """要求 admin 角色。"""
    if credentials is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="请先登录")
    from auth.jwt_utils import decode_admin_token, decode_token
    admin_data = decode_admin_token(credentials.credentials)
    if admin_data is None:
        # 区分：token 无效/过期 -> 401（让前端拦截器刷新）；token 有效但非 admin -> 403
        if decode_token(credentials.credentials) is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="登录已过期，请重新登录")
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="需要管理员权限")
    return admin_data
