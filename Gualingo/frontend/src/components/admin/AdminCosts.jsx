import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'

export default function AdminCosts() {
  const [data, setData] = useState(null)
  const [trendDays, setTrendDays] = useState(30)
  const [trend, setTrend] = useState([])
  const [byModel, setByModel] = useState([])

  useEffect(() => {
    adminApi.getCosts().then(setData)
  }, [])

  useEffect(() => {
    adminApi.getCostTrend(trendDays).then(d => setTrend(d.trend || []))
    adminApi.getCostByModel().then(d => setByModel(d.by_model || []))
  }, [trendDays])

  if (!data) return <div className="text-[#e8d5b7]">加载中...</div>

  const cards = [
    { label: '今日成本', value: `$${(data.today?.cost || 0).toFixed(4)}`, sub: `${(data.today?.tokens || 0).toLocaleString()} tokens` },
    { label: '本月成本', value: `$${(data.month?.cost || 0).toFixed(4)}`, sub: `${(data.month?.tokens || 0).toLocaleString()} tokens` },
    { label: '平均每用户', value: `$${(data.avg_cost_per_user || 0).toFixed(4)}`, sub: `${data.month?.active_users || 0} 活跃用户` },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">Token 成本追踪</h2>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {cards.map((card, i) => (
          <div key={i} className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
            <p className="text-[#e8d5b7]/60 text-sm">{card.label}</p>
            <p className="text-[#c9a96e] text-2xl font-bold mt-1">{card.value}</p>
            <p className="text-[#e8d5b7]/40 text-xs mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20 mb-6">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[#c9a96e] font-bold">成本趋势</h3>
          <div className="flex gap-1">
            {[7, 14, 30].map(d => (
              <button key={d} onClick={() => setTrendDays(d)}
                className={`px-2 py-1 rounded text-xs ${trendDays === d ? 'bg-[#c9a96e] text-[#1a1a2e]' : 'bg-[#1a1a2e] text-[#e8d5b7]'}`}>
                {d}天
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-48 overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
                <th className="text-left py-1">日期</th>
                <th className="text-right py-1">Tokens</th>
                <th className="text-right py-1">成本</th>
              </tr>
            </thead>
            <tbody>
              {trend.map((r, i) => (
                <tr key={i} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                  <td className="py-1">{r.date}</td>
                  <td className="text-right">{(r.tokens || 0).toLocaleString()}</td>
                  <td className="text-right">${(r.cost || 0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20 mb-6">
        <h3 className="text-[#c9a96e] font-bold mb-3">按模型分布</h3>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
              <th className="text-left py-1">模型</th>
              <th className="text-right py-1">Tokens</th>
              <th className="text-right py-1">成本</th>
            </tr>
          </thead>
          <tbody>
            {byModel.map((r, i) => (
              <tr key={i} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                <td className="py-1">{r.model}</td>
                <td className="text-right">{(r.tokens || 0).toLocaleString()}</td>
                <td className="text-right">${(r.cost || 0).toFixed(4)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {data.top_users?.length > 0 && (
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">Top 10 成本用户（本月）</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
                <th className="text-left py-1">邮箱</th>
                <th className="text-right py-1">Prompt</th>
                <th className="text-right py-1">Completion</th>
                <th className="text-right py-1">Total</th>
                <th className="text-right py-1">成本</th>
              </tr>
            </thead>
            <tbody>
              {data.top_users.map((u, i) => (
                <tr key={i} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                  <td className="py-1">{u.email || u.user_id}</td>
                  <td className="text-right">{(u.prompt_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">{(u.completion_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">{(u.total_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">${(u.cost || 0).toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
