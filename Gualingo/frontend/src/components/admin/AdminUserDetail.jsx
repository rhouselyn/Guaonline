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
  const [wordList, setWordList] = useState([])
  const [wordPage, setWordPage] = useState(1)
  const [wordTotal, setWordTotal] = useState(0)
  const WORD_PAGE_SIZE = 20
  const [historyPage, setHistoryPage] = useState(1)
  const [favPage, setFavPage] = useState(1)
  const PAGE_SIZE = 20

  useEffect(() => {
    adminApi.getUserDetail(id).then(setUser)
    adminApi.getUserHistory(id).then(d => setHistory(d.records || []))
    adminApi.getUserFavorites(id).then(d => setFavorites(d.words || []))
    adminApi.getUserPreferences(id).then(setPrefs)
    adminApi.getUserWordList(id).then(d => {
      const words = d.words || []
      setWordList(words)
      setWordTotal(words.length)
    })
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
            <div className="flex justify-between"><span>剩余额度</span><span className="text-[#c9a96e] font-bold text-lg">{user.quota_max - user.quota_used}</span></div>
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
            {history.slice((historyPage - 1) * PAGE_SIZE, historyPage * PAGE_SIZE).map(r => (
              <div key={r.file_id} className="text-[#e8d5b7] text-sm flex justify-between">
                <span>{r.title}</span>
                <span className="text-[#e8d5b7]/40 text-xs">{r.source_lang}→{r.target_lang}</span>
              </div>
            ))}
            {history.length === 0 && <p className="text-[#e8d5b7]/40 text-sm">暂无</p>}
          </div>
          {history.length > PAGE_SIZE && (
            <div className="flex justify-between items-center mt-2 text-xs text-[#e8d5b7]/60">
              <span>共 {history.length} 条</span>
              <div className="flex gap-1">
                <button disabled={historyPage <= 1} onClick={() => setHistoryPage(p => p - 1)} className="px-2 py-1 bg-[#1a1a2e] rounded disabled:opacity-30">上一页</button>
                <span className="px-2 py-1">{historyPage}</span>
                <button disabled={historyPage * PAGE_SIZE >= history.length} onClick={() => setHistoryPage(p => p + 1)} className="px-2 py-1 bg-[#1a1a2e] rounded disabled:opacity-30">下一页</button>
              </div>
            </div>
          )}
        </div>

        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">收藏单词 ({favorites.length})</h3>
          <div className="max-h-60 overflow-y-auto flex flex-wrap gap-1">
            {favorites.slice((favPage - 1) * PAGE_SIZE, favPage * PAGE_SIZE).map(w => (
              <span key={w} className="bg-[#c9a96e]/10 text-[#c9a96e] px-2 py-0.5 rounded text-xs">{w}</span>
            ))}
            {favorites.length === 0 && <p className="text-[#e8d5b7]/40 text-sm">暂无</p>}
          </div>
          {favorites.length > PAGE_SIZE && (
            <div className="flex justify-between items-center mt-2 text-xs text-[#e8d5b7]/60">
              <span>共 {favorites.length} 个</span>
              <div className="flex gap-1">
                <button disabled={favPage <= 1} onClick={() => setFavPage(p => p - 1)} className="px-2 py-1 bg-[#1a1a2e] rounded disabled:opacity-30">上一页</button>
                <span className="px-2 py-1">{favPage}</span>
                <button disabled={favPage * PAGE_SIZE >= favorites.length} onClick={() => setFavPage(p => p + 1)} className="px-2 py-1 bg-[#1a1a2e] rounded disabled:opacity-30">下一页</button>
              </div>
            </div>
          )}
        </div>

        {prefs && (
          <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
            <h3 className="text-[#c9a96e] font-bold mb-3">偏好设置</h3>
            <pre className="text-[#e8d5b7] text-xs overflow-auto">{JSON.stringify(prefs, null, 2)}</pre>
          </div>
        )}

        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">单词总览 ({wordTotal})</h3>
          <div className="max-h-60 overflow-y-auto space-y-1">
            {wordList.slice((wordPage - 1) * WORD_PAGE_SIZE, wordPage * WORD_PAGE_SIZE).map((w, i) => (
              <div key={i} className="text-[#e8d5b7] text-sm flex justify-between">
                <span>{w.word}</span>
                <span className="text-[#e8d5b7]/40 text-xs max-w-[60%] truncate">{w.meaning}</span>
              </div>
            ))}
            {wordTotal === 0 && <p className="text-[#e8d5b7]/40 text-sm">暂无</p>}
          </div>
          {wordTotal > WORD_PAGE_SIZE && (
            <div className="flex justify-between items-center mt-2 text-xs text-[#e8d5b7]/60">
              <span>共 {wordTotal} 个</span>
              <div className="flex gap-1">
                <button disabled={wordPage <= 1} onClick={() => setWordPage(p => p - 1)} className="px-2 py-1 bg-[#1a1a2e] rounded disabled:opacity-30">上一页</button>
                <span className="px-2 py-1">{wordPage}</span>
                <button disabled={wordPage * WORD_PAGE_SIZE >= wordTotal} onClick={() => setWordPage(p => p + 1)} className="px-2 py-1 bg-[#1a1a2e] rounded disabled:opacity-30">下一页</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
