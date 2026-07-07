import { useState, useEffect } from 'react'
import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { auth } from '../utils/auth'
import { useMediaQuery } from '../utils/useMediaQuery'

const navItems = [
  { to: '/admin', label: '仪表盘', end: true },
  { to: '/admin/api-keys', label: 'API Key' },
  { to: '/admin/users', label: '用户管理' },
  { to: '/admin/costs', label: 'Token 成本' },
  { to: '/admin/global-vocab', label: '全局词汇' },
]

export default function AdminPage() {
  const navigate = useNavigate()
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  useEffect(() => {
    if (!sidebarOpen) return
    const handler = (e) => { if (e.key === 'Escape') setSidebarOpen(false) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [sidebarOpen])

  if (!auth.isAdmin()) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1a1a2e]">
        <div className="text-center">
          <p className="text-[#e8d5b7] text-lg mb-4">需要管理员权限</p>
          <button onClick={() => navigate('/login')} className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold">去登录</button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen bg-[#1a1a2e] flex">
      {/* 手机遮罩 */}
      {!isDesktop && sidebarOpen && (
        <div className="mobile-drawer-overlay md:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      <aside className={`bg-[#16213e] border-r border-[#c9a96e]/20 flex flex-col flex-shrink-0 ${
        isDesktop
          ? 'w-56'
          : `fixed left-0 top-0 h-full z-50 w-56 transform transition-transform duration-200 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`
      }`}>
        <div className="p-4 border-b border-[#c9a96e]/20 flex items-center justify-between">
          <div>
            <h1 className="text-[#c9a96e] font-bold text-lg">Gualingo Admin</h1>
            <p className="text-[#e8d5b7]/50 text-xs mt-1">管理面板</p>
          </div>
          {!isDesktop && (
            <button onClick={() => setSidebarOpen(false)} className="text-[#e8d5b7] p-1">
              <X size={20} />
            </button>
          )}
        </div>
        <nav className="flex-1 p-2 overflow-y-auto">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => { if (!isDesktop) setSidebarOpen(false) }}
              className={({ isActive }) =>
                `block px-3 py-2 rounded text-sm mb-1 transition-colors ${
                  isActive ? 'bg-[#c9a96e]/20 text-[#c9a96e] font-bold' : 'text-[#e8d5b7]/70 hover:bg-[#c9a96e]/10 hover:text-[#e8d5b7]'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 border-t border-[#c9a96e]/20">
          <button onClick={() => { auth.logout(); navigate('/login'); }} className="text-[#e8d5b7]/50 text-sm hover:text-[#e8d5b7]">退出</button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {/* 手机顶栏 */}
        {!isDesktop && (
          <div className="md:hidden flex items-center gap-3 p-4 border-b border-[#c9a96e]/20 bg-[#16213e]">
            <button onClick={() => setSidebarOpen(true)} className="text-[#c9a96e] p-1">
              <Menu size={24} />
            </button>
            <h1 className="text-[#c9a96e] font-bold">Admin</h1>
          </div>
        )}
        <div className="p-4 md:p-6 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
