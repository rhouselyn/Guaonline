import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { adminApi } from '../../utils/adminApi'

export default function AdminUserDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [user, setUser] = useState(null)
  const [history, setHistory] = useState([])
  const [favorites, setFavorites] = useState([])
  const [prefs, setPrefs] = useState(null)
  const [quotaAction, setQuotaAction] = useState('add')
  const [quotaValue, setQuotaValue] = useState(10)

  useEffect(() => {
    adminApi.getUserDetail(id).then(setUser)
    adminApi.getUserHistory(id).then(d => setHistory(d.records || []))
    adminApi.getUserFavorites(id).then(d => setFavorites(d.words || []))
    adminApi.getUserPreferences(id).then(setPrefs)
  }, [id])

  const changeTier = async (newTier) => {
    await adminApi.updateUser(id, { tier: newTier })
    setUser(prev => ({ ...prev, tier: newTier }))
  }

  const adjustQuota = async () => {
    const result = await adminApi.adjustUserQuota(id, quotaAction, quotaValue)
    setUser(prev => ({ ...prev, quota_max: result.new_max }))
  }

  if (!user) return <div className="text-[#e8d5b7]">加载中...</div>

  return (
    <div>
      <button onClick={() => navigate(-1)} className="text-[#c9a96e] text-sm mb-4 inline-block">&larr; 返回</button>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">用户详情</h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">基本信息</h3>
          <div className="space-y-2 text-sm text-[#e8d5b7]">
            <div className="flex justify-between"><span className="text-[#e8d5b7]/60">邮箱</span><span>{user.email}</span></div>
            <div className="flex justify-between"><span className="text-[#e8d5b7]/60">名称</span><span>{user.name}</span></div>
            <div className="flex justify-between items-center">
              <span className="text-[#e8d5b7]/60">Tier</span>
              <select value={user.tier} onChange={e => changeTier(e.target.value)}
                className="bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm">
                <option value="free">Free</option>
                <option value="basic">Basic</option>
                <option value="pro">Pro</option>
              </select>
            </div>
            <div className="flex justify-between"><span className="text-[#e8d5b7]/60">注册时间</span><span>{user.created_at?.slice(0, 10)}</span></div>
            <div className="flex justify-between"><span className="text-[#e8d5b7]/60">封禁</span><span>{user.banned ? <span className="text-red-400">是 ({user.banned_reason})</span> : '否'}</span></div>
          </div>
        </div>

        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">额度状态</h3>
          <div className="text-[#e8d5b7] text-sm mb-4">
            <div className="flex justify-between mb-1"><span>已使用</span><span>{user.quota_used}</span></div>
            <div className="flex justify-between mb-1"><span>上限</span><span>{user.quota_max}</span></div>
            <div className="flex justify-between"><span>可用</span><span className="text-[#c9a96e] font-bold">{user.quota_max - user.quota_used}</span></div>
          </div>
          <div className="flex gap-2 items-end">
            <select value={quotaAction} onChange={e => setQuotaAction(e.target.value)}
              className="bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm">
              <option value="add">增加</option>
              <option value="subtract">减少</option>
              <option value="set">设为</option>
            </select>
            <input type="number" value={quotaValue} onChange={e => setQuotaValue(Number(e.target.value))}
              className="w-20 bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
            <button onClick={adjustQuota} className="px-3 py-1 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">调整</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">历史记录 ({history.length})</h3>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {history.map(r => (
              <div key={r.file_id} className="text-[#e8d5b7] text-sm flex justify-between">
                <span>{r.title}</span>
                <span className="text-[#e8d5b7]/40 text-xs">{r.source_lang}→{r.target_lang}</span>
              </div>
            ))}
            {history.length === 0 && <p className="text-[#e8d5b7]/40 text-sm">暂无</p>}
          </div>
        </div>

        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">收藏单词 ({favorites.length})</h3>
          <div className="max-h-60 overflow-y-auto flex flex-wrap gap-1">
            {favorites.map(w => (
              <span key={w} className="bg-[#c9a96e]/10 text-[#c9a96e] px-2 py-0.5 rounded text-xs">{w}</span>
            ))}
            {favorites.length === 0 && <p className="text-[#e8d5b7]/40 text-sm">暂无</p>}
          </div>
        </div>

        {prefs && (
          <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
            <h3 className="text-[#c9a96e] font-bold mb-3">偏好设置</h3>
            <pre className="text-[#e8d5b7] text-xs overflow-auto">{JSON.stringify(prefs, null, 2)}</pre>
          </div>
        )}
      </div>
    </div>
  )
}
