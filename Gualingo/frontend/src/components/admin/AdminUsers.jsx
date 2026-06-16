import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Shield, ShieldOff, Trash2 } from 'lucide-react'
import { adminApi } from '../../utils/adminApi'

export default function AdminUsers() {
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [tier, setTier] = useState('')
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState(new Set())
  const [banModal, setBanModal] = useState(null) // null | { userIds: [], type: 'single' | 'batch' }
  const [banReason, setBanReason] = useState('')
  const [confirmModal, setConfirmModal] = useState(null) // null | { userIds: [], action: 'delete' | 'batchBan' | 'batchUnban' | 'batchDelete' }
  const [quotaModal, setQuotaModal] = useState(false)
  const [quotaAction, setQuotaAction] = useState('add')
  const [quotaValue, setQuotaValue] = useState(10)
  const [quotaConfirming, setQuotaConfirming] = useState(false)

  const load = () => {
    setLoading(true)
    adminApi.getUsers(page, search, tier, status).then(setData).finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [page, tier, status])

  const handleSearch = (e) => {
    e.preventDefault()
    setPage(1)
    load()
  }

  const toggleSelect = (userId) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  const toggleSelectAll = () => {
    if (!data?.users) return
    const allIds = data.users.map(u => u.id)
    if (selected.size === allIds.length && allIds.every(id => selected.has(id))) {
      setSelected(new Set())
    } else {
      setSelected(new Set(allIds))
    }
  }

  const handleBan = (userId) => {
    setBanModal({ userIds: [userId], type: 'single' })
    setBanReason('')
  }

  const handleUnban = async (userId) => {
    try {
      await adminApi.unbanUser(userId)
      load()
    } catch (e) {
      alert('解封失败: ' + (e.response?.data?.detail || e.message))
    }
  }

  const handleDelete = (userId) => {
    setConfirmModal({ userIds: [userId], action: 'delete' })
  }

  const confirmBan = async () => {
    try {
      if (banModal.type === 'single') {
        await adminApi.banUser(banModal.userIds[0], banReason)
      } else {
        await adminApi.batchBan(banModal.userIds, banReason)
      }
      setBanModal(null)
      setBanReason('')
      setSelected(new Set())
      load()
    } catch (e) {
      alert('封禁失败: ' + (e.response?.data?.detail || e.message))
    }
  }

  const confirmAction = async () => {
    try {
      const { userIds, action } = confirmModal
      if (action === 'delete') {
        await adminApi.deleteUser(userIds[0])
      } else if (action === 'batchBan') {
        await adminApi.batchBan(userIds, banReason)
      } else if (action === 'batchUnban') {
        await adminApi.batchUnban(userIds)
      } else if (action === 'batchDelete') {
        await adminApi.batchDelete(userIds)
      }
      setConfirmModal(null)
      setSelected(new Set())
      load()
    } catch (e) {
      alert('操作失败: ' + (e.response?.data?.detail || e.message))
    }
  }

  const handleBatchBan = () => {
    setBanModal({ userIds: [...selected], type: 'batch' })
    setBanReason('')
  }

  const handleBatchUnban = () => {
    setConfirmModal({ userIds: [...selected], action: 'batchUnban' })
  }

  const handleBatchDelete = () => {
    setConfirmModal({ userIds: [...selected], action: 'batchDelete' })
  }

  const handleBatchQuota = () => {
    setQuotaModal(true)
    setQuotaAction('add')
    setQuotaValue(10)
    setQuotaConfirming(false)
  }

  const confirmQuotaAdjust = async () => {
    try {
      await adminApi.batchAdjustQuotaByUserIds([...selected], quotaAction, quotaValue)
      setQuotaModal(false)
      setQuotaConfirming(false)
      setSelected(new Set())
      load()
    } catch (e) {
      alert('额度调整失败: ' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">用户管理</h2>

      {/* 筛选区 */}
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
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm">
          <option value="">全部状态</option>
          <option value="active">正常</option>
          <option value="banned">已封禁</option>
        </select>
        <button type="submit" className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">搜索</button>
      </form>

      {/* 表格 */}
      {loading ? <div className="text-[#e8d5b7]">加载中...</div> : (
        <div className="bg-[#16213e] rounded-lg border border-[#c9a96e]/20 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
                <th className="py-2 px-3 w-10">
                  <input type="checkbox" checked={data?.users?.length > 0 && data.users.every(u => selected.has(u.id))}
                    onChange={toggleSelectAll} className="accent-[#c9a96e]" />
                </th>
                <th className="text-left py-2 px-3">邮箱</th>
                <th className="text-left py-2 px-3">名称</th>
                <th className="text-center py-2 px-3">Tier</th>
                <th className="text-center py-2 px-3">剩余额度</th>
                <th className="text-center py-2 px-3">状态</th>
                <th className="text-left py-2 px-3">注册时间</th>
                <th className="text-center py-2 px-3">操作</th>
              </tr>
            </thead>
            <tbody>
              {data?.users?.map(user => (
                <tr key={user.id}
                  className="text-[#e8d5b7] border-b border-[#c9a96e]/5 hover:bg-[#c9a96e]/10">
                  <td className="py-2 px-3" onClick={e => e.stopPropagation()}>
                    <input type="checkbox" checked={selected.has(user.id)}
                      onChange={() => toggleSelect(user.id)} className="accent-[#c9a96e]" />
                  </td>
                  <td className="py-2 px-3 cursor-pointer" onClick={() => navigate(`/admin/users/${user.id}`)}>{user.email}</td>
                  <td className="py-2 px-3 cursor-pointer" onClick={() => navigate(`/admin/users/${user.id}`)}>{user.name}</td>
                  <td className="text-center py-2 px-3">
                    <span className={`px-2 py-0.5 rounded text-xs font-bold ${user.tier === 'pro' ? 'bg-purple-900/30 text-purple-400' : user.tier === 'basic' ? 'bg-blue-900/30 text-blue-400' : 'bg-gray-700/30 text-gray-400'}`}>{user.tier}</span>
                  </td>
                  <td className="text-center py-2 px-3">{user.quota_max - user.quota_used}</td>
                  <td className="text-center py-2 px-3">
                    {user.banned
                      ? <span className="px-2 py-0.5 rounded text-xs font-bold bg-red-900/30 text-red-400">已封禁</span>
                      : <span className="px-2 py-0.5 rounded text-xs font-bold bg-green-900/30 text-green-400">正常</span>
                    }
                  </td>
                  <td className="py-2 px-3 text-xs">{user.created_at?.slice(0, 10)}</td>
                  <td className="py-2 px-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center justify-center gap-1">
                      {user.banned ? (
                        <button onClick={() => handleUnban(user.id)} title="解封"
                          className="p-1 text-green-400 hover:bg-green-900/30 rounded">
                          <ShieldOff size={16} />
                        </button>
                      ) : (
                        <button onClick={() => handleBan(user.id)} title="封禁"
                          className="p-1 text-orange-400 hover:bg-orange-900/30 rounded">
                          <Shield size={16} />
                        </button>
                      )}
                      <button onClick={() => handleDelete(user.id)} title="注销账号"
                        className="p-1 text-red-400 hover:bg-red-900/30 rounded">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
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

      {/* 批量操作栏 */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-56 right-0 bg-[#16213e] border-t border-[#c9a96e]/20 p-3 flex items-center justify-between z-50">
          <span className="text-[#e8d5b7] text-sm">已选中 {selected.size} 个用户</span>
          <div className="flex gap-2">
            <button onClick={handleBatchBan}
              className="px-3 py-1 bg-orange-900/50 text-orange-400 rounded text-sm font-bold hover:bg-orange-900/70">
              批量封禁
            </button>
            <button onClick={handleBatchUnban}
              className="px-3 py-1 bg-green-900/50 text-green-400 rounded text-sm font-bold hover:bg-green-900/70">
              批量解封
            </button>
            <button onClick={handleBatchDelete}
              className="px-3 py-1 bg-red-900/50 text-red-400 rounded text-sm font-bold hover:bg-red-900/70">
              批量注销
            </button>
            <button onClick={handleBatchQuota}
              className="px-3 py-1 bg-[#c9a96e]/20 text-[#c9a96e] rounded text-sm font-bold hover:bg-[#c9a96e]/30">
              额度调整
            </button>
          </div>
        </div>
      )}

      {/* 封禁原因模态框 */}
      {banModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setBanModal(null)}>
          <div className="bg-[#16213e] rounded-lg p-6 border border-[#c9a96e]/20 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-[#c9a96e] font-bold mb-4">
              {banModal.type === 'batch' ? `批量封禁 (${banModal.userIds.length} 人)` : '封禁用户'}
            </h3>
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">封禁原因</label>
            <textarea value={banReason} onChange={e => setBanReason(e.target.value)}
              placeholder="请输入封禁原因..."
              className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm h-24 resize-none" />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setBanModal(null)}
                className="px-4 py-2 bg-[#1a1a2e] text-[#e8d5b7] rounded text-sm">取消</button>
              <button onClick={confirmBan}
                className="px-4 py-2 bg-orange-600 text-white rounded text-sm font-bold">确认封禁</button>
            </div>
          </div>
        </div>
      )}

      {/* 确认操作模态框 */}
      {confirmModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => setConfirmModal(null)}>
          <div className="bg-[#16213e] rounded-lg p-6 border border-[#c9a96e]/20 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-[#c9a96e] font-bold mb-4">确认操作</h3>
            <p className="text-[#e8d5b7] text-sm mb-4">
              {confirmModal.action === 'delete' && '确认注销该账号？此操作不可恢复，将删除该用户的所有数据。'}
              {confirmModal.action === 'batchBan' && `确认批量封禁 ${confirmModal.userIds.length} 个用户？`}
              {confirmModal.action === 'batchUnban' && `确认批量解封 ${confirmModal.userIds.length} 个用户？`}
              {confirmModal.action === 'batchDelete' && `确认批量注销 ${confirmModal.userIds.length} 个用户？此操作不可恢复，将删除这些用户的所有数据。`}
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmModal(null)}
                className="px-4 py-2 bg-[#1a1a2e] text-[#e8d5b7] rounded text-sm">取消</button>
              <button onClick={confirmAction}
                className={`px-4 py-2 rounded text-sm font-bold ${
                  confirmModal.action === 'batchUnban' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
                }`}>
                确认
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 额度调整模态框 */}
      {quotaModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={() => { setQuotaModal(false); setQuotaConfirming(false) }}>
          <div className="bg-[#16213e] rounded-lg p-6 border border-[#c9a96e]/20 w-96" onClick={e => e.stopPropagation()}>
            <h3 className="text-[#c9a96e] font-bold mb-4">额度调整 ({selected.size} 个用户)</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[#e8d5b7]/60 text-sm block mb-1">操作类型</label>
                <select value={quotaAction} onChange={e => { setQuotaAction(e.target.value); setQuotaConfirming(false) }}
                  className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm">
                  <option value="add">增加</option>
                  <option value="subtract">减少</option>
                  <option value="set">设为</option>
                </select>
              </div>
              <div>
                <label className="text-[#e8d5b7]/60 text-sm block mb-1">数量</label>
                <input type="number" min={0} value={quotaValue} onChange={e => { setQuotaValue(Number(e.target.value)); setQuotaConfirming(false) }}
                  className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm" />
              </div>
              {!quotaConfirming ? (
                <button onClick={() => setQuotaConfirming(true)}
                  className="w-full py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">执行</button>
              ) : (
                <div className="space-y-2">
                  <p className="text-[#e8d5b7] text-sm">
                    确认对选中的 <span className="text-[#c9a96e] font-bold">{selected.size}</span> 个用户执行
                    <span className="text-[#c9a96e] font-bold"> {quotaAction === 'add' ? '增加' : quotaAction === 'subtract' ? '减少' : '设为'} {quotaValue} </span>句？
                  </p>
                  <div className="flex gap-2">
                    <button onClick={confirmQuotaAdjust}
                      className="flex-1 py-2 bg-red-600 text-white rounded font-bold text-sm">确认执行</button>
                    <button onClick={() => setQuotaConfirming(false)}
                      className="flex-1 py-2 bg-[#1a1a2e] text-[#e8d5b7] rounded text-sm border border-[#c9a96e]/20">取消</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
