import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'

const BarChart = ({ title, data, colors = {} }) => {
  const maxVal = Math.max(...Object.values(data), 1)
  return (
    <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
      <h3 className="text-[#c9a96e] font-bold mb-3">{title}</h3>
      <div className="space-y-2">
        {Object.entries(data).map(([key, val]) => (
          <div key={key} className="flex items-center gap-2">
            <span className="text-[#e8d5b7] text-sm w-16 text-right">{key}</span>
            <div className="flex-1 bg-[#1a1a2e] rounded h-5 overflow-hidden">
              <div className="h-full rounded" style={{ width: `${(val/maxVal)*100}%`, backgroundColor: colors[key] || '#c9a96e' }} />
            </div>
            <span className="text-[#e8d5b7] text-sm w-8">{val}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    adminApi.getDashboard().then(setData).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="text-[#e8d5b7]">加载中...</div>
  if (!data) return <div className="text-red-400">加载失败</div>

  const cards = [
    { label: '总用户数', value: data.total_users, sub: `今日新增 ${data.new_today}` },
    { label: '今日 Token 成本', value: `$${(data.token_cost_today?.cost || 0).toFixed(4)}`, sub: `${(data.token_cost_today?.tokens || 0).toLocaleString()} tokens` },
    { label: '本月 Token 成本', value: `$${(data.token_cost_month?.cost || 0).toFixed(4)}`, sub: `${(data.token_cost_month?.tokens || 0).toLocaleString()} tokens` },
    { label: '平均每用户成本', value: `$${data.avg_cost_per_user.toFixed(4)}`, sub: `${data.token_cost_month?.active_users || 0} 活跃用户` },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">仪表盘</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {cards.map((card, i) => (
          <div key={i} className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
            <p className="text-[#e8d5b7]/60 text-sm">{card.label}</p>
            <p className="text-[#c9a96e] text-2xl font-bold mt-1">{card.value}</p>
            <p className="text-[#e8d5b7]/40 text-xs mt-1">{card.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-8">
        <BarChart title="Tier 分布" data={data.tier_distribution || {}} colors={{ free: '#6b7280', basic: '#3b82f6', pro: '#a855f7' }} />
        <BarChart title="学习语言分布" data={data.source_lang_distribution || {}} />
        <BarChart title="目标语言分布" data={data.target_lang_distribution || {}} />
      </div>

      {data.top_cost_users?.length > 0 && (
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <h3 className="text-[#c9a96e] font-bold mb-3">Top 10 成本用户（本月）</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
                <th className="text-left py-2">邮箱</th>
                <th className="text-right py-2">Prompt</th>
                <th className="text-right py-2">Completion</th>
                <th className="text-right py-2">Total</th>
                <th className="text-right py-2">成本</th>
              </tr>
            </thead>
            <tbody>
              {data.top_cost_users.map((u, i) => (
                <tr key={i} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                  <td className="py-2">{u.email}</td>
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
