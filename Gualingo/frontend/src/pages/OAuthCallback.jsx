import { useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { auth } from '../utils/auth'

export default function OAuthCallback() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()

  useEffect(() => {
    const accessToken = searchParams.get('access_token')
    const refreshToken = searchParams.get('refresh_token')

    if (accessToken) {
      auth.setTokens({ access_token: accessToken, refresh_token: refreshToken })
      // 获取用户信息后跳转
      auth.fetchUser().then(() => {
        navigate('/learn', { replace: true })
      }).catch(() => {
        navigate('/learn', { replace: true })
      })
    } else {
      // OAuth 失败，跳转回登录页
      navigate('/login', { replace: true })
    }
  }, [searchParams, navigate])

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#faf8f0]">
      <div className="text-center">
        <div className="w-8 h-8 border-2 border-[#d4a853] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-[#8b7e5e] text-sm">正在登录...</p>
      </div>
    </div>
  )
}
