import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'

export default function AdminBlacklist() {
  const [blacklist, setBlacklist] = useState([])
  const [email, setEmail] = useState('')
  const [reason, setReason] = useState('')

  const load = () => {
    adminApi.getBlacklist().then(d => setBlacklist(d.users || []))
  }

  useEffect(() => { load() }, [])

  const add = async (e) => {
    e.preventDefault()
    try {
      await adminApi.addToBlacklist(email, reason)
      setEmail('')
      setReason('')
      load()
    } catch (err) {
      alert('添加失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const remove = async (userId) => {
    if (!confirm('确认解封该用户？')) return
    await adminApi.removeFromBlacklist(userId)
    load()
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">黑名单</h2>

      <form onSubmit={add} className="flex gap-2 mb-6">
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="用户邮箱" required
          className="flex-1 bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm" />
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="封禁原因"
          className="flex-1 bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm" />
        <button type="submit" className="px-4 py-2 bg-red-600 text-white rounded font-bold text-sm">封禁</button>
      </form>

      <div className="bg-[#16213e] rounded-lg border border-[#c9a96e]/20 overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
              <th className="text-left py-2 px-3">邮箱</th>
              <th className="text-left py-2 px-3">名称</th>
              <th className="text-left py-2 px-3">封禁原因</th>
              <th className="text-left py-2 px-3">注册时间</th>
              <th className="text-center py-2 px-3">操作</th>
            </tr>
          </thead>
          <tbody>
            {blacklist.map(user => (
              <tr key={user.id} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                <td className="py-2 px-3">{user.email}</td>
                <td className="py-2 px-3">{user.name}</td>
                <td className="py-2 px-3">{user.banned_reason || '-'}</td>
                <td className="py-2 px-3 text-xs">{user.created_at?.slice(0, 10)}</td>
                <td className="text-center py-2 px-3">
                  <button onClick={() => remove(user.id)} className="text-green-400 text-sm hover:underline">解封</button>
                </td>
              </tr>
            ))}
            {blacklist.length === 0 && (
              <tr><td colSpan={5} className="text-center py-4 text-[#e8d5b7]/40">暂无封禁用户</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
