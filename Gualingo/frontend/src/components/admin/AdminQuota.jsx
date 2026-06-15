import { useState } from 'react'
import { adminApi } from '../../utils/adminApi'

export default function AdminQuota() {
  const [tier, setTier] = useState('free')
  const [action, setAction] = useState('add')
  const [value, setValue] = useState(10)
  const [result, setResult] = useState(null)
  const [confirming, setConfirming] = useState(false)

  const execute = async () => {
    try {
      const res = await adminApi.batchAdjustQuota(tier || null, action, value)
      setResult(res)
      setConfirming(false)
    } catch (e) {
      alert('操作失败: ' + (e.response?.data?.detail || e.message))
    }
  }

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">额度批量管理</h2>

      <div className="bg-[#16213e] rounded-lg p-6 border border-[#c9a96e]/20 max-w-lg">
        <div className="space-y-4">
          <div>
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">目标范围</label>
            <select value={tier} onChange={e => setTier(e.target.value)}
              className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm">
              <option value="free">Free 用户</option>
              <option value="basic">Basic 用户</option>
              <option value="pro">Pro 用户</option>
              <option value="">全部用户</option>
            </select>
          </div>

          <div>
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">操作类型</label>
            <select value={action} onChange={e => setAction(e.target.value)}
              className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm">
              <option value="add">增加 N 句</option>
              <option value="subtract">减少 N 句</option>
              <option value="set">设为 N 句</option>
            </select>
          </div>

          <div>
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">数量</label>
            <input type="number" value={value} onChange={e => setValue(Number(e.target.value))}
              className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-3 py-2 text-sm" />
          </div>

          {!confirming ? (
            <button onClick={() => setConfirming(true)}
              className="w-full py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold">执行</button>
          ) : (
            <div className="space-y-2">
              <p className="text-[#e8d5b7] text-sm">确认要对 <span className="text-[#c9a96e] font-bold">{tier || '全部'}</span> 用户执行 <span className="text-[#c9a96e] font-bold">{action === 'add' ? '增加' : action === 'subtract' ? '减少' : '设为'} {value}</span> 句？</p>
              <div className="flex gap-2">
                <button onClick={execute} className="flex-1 py-2 bg-red-600 text-white rounded font-bold text-sm">确认执行</button>
                <button onClick={() => setConfirming(false)} className="flex-1 py-2 bg-[#1a1a2e] text-[#e8d5b7] rounded text-sm border border-[#c9a96e]/20">取消</button>
              </div>
            </div>
          )}
        </div>

        {result && (
          <div className="mt-4 p-3 bg-green-900/30 text-green-400 rounded text-sm">
            操作成功，影响了 {result.affected} 名用户
          </div>
        )}
      </div>
    </div>
  )
}
