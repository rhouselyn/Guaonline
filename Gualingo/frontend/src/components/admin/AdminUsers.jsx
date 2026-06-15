import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { adminApi } from '../../utils/adminApi'

export default function AdminUsers() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState('')
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    adminApi.getUsers(page, search, tier).then(setData).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [page, tier])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    load()
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">用户管理</h2>

      <form onSubmit={handleSearch} className="flex gap-2 mb-4">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索邮箱或名称..."
          className="flex-1 bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm" />
        <select value={tier} onChange={e => { setTier(e.target.value); setPage(1); }}
          className="bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm">
          <option value="">全部 Tier</option>
          <option value="free">Free</option>
          <option value="basic">Basic</option>
          <option value="pro">Pro</option>
        </select>
        <button type="submit" className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">搜索</button>
      </form>

      {loading ? <div className="text-[#e8d5b7]">加载中...</div> : (
        <div className="bg-[#16213e] rounded-lg border border-[#c9a96e]/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
                <th className="text-left py-2 px-3">邮箱</th>
                <th className="text-left py-2 px-3">名称</th>
                <th className="text-center py-2 px-3">Tier</th>
                <th className="text-center py-2 px-3">剩余额度</th>
                <th className="text-center py-2 px-3">封禁</th>
                <th className="text-left py-2 px-3">注册时间</th>
              </tr>
            </thead>
            <tbody>
              {data?.users?.map(user => (
                <tr key={user.id} onClick={() => navigate(`/admin/users/${user.id}`)}
                  className="text-[#e8d5b7] border-b border-[#c9a96e]/5 cursor-pointer hover:bg-[#c9a96e]/10">
                  <td className="py-2 px-3">{user.email}</td>
                  <td className="py-2 px-3">{user.name}</td>
                  <td className="text-center py-2 px-3"><span className={`px-2 py-0.5 rounded text-xs font-bold ${user.tier === 'pro' ? 'bg-purple-900/30 text-purple-400' : user.tier === 'basic' ? 'bg-blue-900/30 text-blue-400' : 'bg-gray-700/30 text-gray-400'}`}>{user.tier}</span></td>
                  <td className="text-center py-2 px-3">{user.quota_max - user.quota_used}</td>
                  <td className="text-center py-2 px-3">{user.banned ? <span className="text-red-400">是</span> : <span className="text-green-400">否</span>}</td>
                  <td className="py-2 px-3 text-xs">{user.created_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="flex justify-between items-center p-3 text-sm text-[#e8d5b7]/60">
            <span>共 {data?.total} 条</span>
            <div className="flex gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="px-3 py-1 bg-[#1a1a2e] rounded disabled:opacity-30">上一页</button>
              <span className="px-3 py-1">{page}</span>
              <button disabled={!data || page * 20 >= data.total} onClick={() => setPage(p => p + 1)} className="px-3 py-1 bg-[#1a1a2e] rounded disabled:opacity-30">下一页</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
