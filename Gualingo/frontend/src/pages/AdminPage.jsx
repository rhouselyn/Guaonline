import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { auth } from '../utils/auth'

const navItems = [
  { to: '/admin', label: '仪表盘', end: true },
  { to: '/admin/api-keys', label: 'API Key' },
  { to: '/admin/global-settings', label: '全局设置' },
  { to: '/admin/users', label: '用户管理' },
  { to: '/admin/quota', label: '额度管理' },
  { to: '/admin/blacklist', label: '黑名单' },
  { to: '/admin/costs', label: 'Token 成本' },
]

export default function AdminPage() {
  const navigate = useNavigate()

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
    <div className="min-h-screen bg-[#1a1a2e] flex">
      <aside className="w-56 bg-[#16213e] border-r border-[#c9a96e]/20 flex flex-col">
        <div className="p-4 border-b border-[#c9a96e]/20">
          <h1 className="text-[#c9a96e] font-bold text-lg">Gualingo Admin</h1>
          <p className="text-[#e8d5b7]/50 text-xs mt-1">管理面板</p>
        </div>
        <nav className="flex-1 p-2">
          {navItems.map(item => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
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
      <main className="flex-1 overflow-auto">
        <div className="p-6 max-w-6xl mx-auto">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
