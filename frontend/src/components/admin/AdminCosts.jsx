import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'

const LineChart = ({ data }) => {
  const [hovered, setHovered] = useState(null)

  if (!data.length) return <div className="text-[#e8d5b7]/40 text-sm">暂无数据</div>
  const maxCost = Math.max(...data.map(d => d.cost || 0), 0.001)
  const width = 100
  const height = 40

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48" preserveAspectRatio="none"
        onMouseLeave={() => setHovered(null)}>
        {/* 网格线 */}
        {[0.25, 0.5, 0.75].map(frac => {
          const y = height * (1 - frac)
          return <line key={frac} x1="0" y1={y} x2={width} y2={y} stroke="rgba(201,169,110,0.1)" strokeWidth="0.2" />
        })}
        {/* 区域填充 */}
        <polygon points={`0,${height} ${data.map((d, i) => {
          const x = (i / Math.max(data.length - 1, 1)) * width
          const y = height - ((d.cost || 0) / maxCost) * height
          return `${x},${y}`
        }).join(' ')} ${width},${height}`} fill="rgba(201,169,110,0.1)" />
        {/* 折线 */}
        <polyline points={data.map((d, i) => {
          const x = (i / Math.max(data.length - 1, 1)) * width
          const y = height - ((d.cost || 0) / maxCost) * height
          return `${x},${y}`
        }).join(' ')} fill="none" stroke="#c9a96e" strokeWidth="0.5" />
        {/* 数据点（透明，用于 hover 检测） */}
        {data.map((d, i) => {
          const x = (i / Math.max(data.length - 1, 1)) * width
          const y = height - ((d.cost || 0) / maxCost) * height
          return (
            <circle key={i} cx={x} cy={y} r={hovered === i ? "1.5" : "1"}
              fill={hovered === i ? "#fff" : "#c9a96e"} stroke="#c9a96e" strokeWidth="0.3"
              onMouseEnter={() => setHovered(i)} />
          )
        })}
      </svg>
      {/* Tooltip */}
      {hovered !== null && data[hovered] && (
        <div className="absolute pointer-events-none bg-[#1a1a2e] border border-[#c9a96e]/30 rounded px-2 py-1 text-xs z-10"
          style={{
            left: `${(hovered / Math.max(data.length - 1, 1)) * 100}%`,
            top: `${(1 - (data[hovered].cost || 0) / maxCost) * 100}%`,
            transform: 'translate(-50%, -120%)',
          }}>
          <div className="text-[#e8d5b7]/60">{data[hovered].date}</div>
          <div className="text-[#c9a96e] font-bold">${(data[hovered].cost || 0).toFixed(4)}</div>
          <div className="text-[#e8d5b7]/40">{(data[hovered].tokens || 0).toLocaleString()} tokens</div>
        </div>
      )}
      {/* X轴标签 */}
      <div className="flex justify-between text-[#e8d5b7]/30 text-xs mt-1">
        <span>{data[0]?.date?.slice(5)}</span>
        <span>{data[data.length - 1]?.date?.slice(5)}</span>
      </div>
    </div>
  )
}

export default function AdminCosts() {
  const [data, setData] = useState(null)
  const [trendDays, setTrendDays] = useState(30)
  const [trend, setTrend] = useState([])
  const [byModel, setByModel] = useState([])
  const [topUsers, setTopUsers] = useState([])
  const [topPeriod, setTopPeriod] = useState('month')
  const [topPage, setTopPage] = useState(1)
  const trendOptions = [
    { days: 7, label: '7天' },
    { days: 14, label: '14天' },
    { days: 30, label: '30天' },
    { days: 90, label: '90天' },
    { days: 9999, label: '有史以来' },
  ]

  useEffect(() => {
    adminApi.getCosts().then(setData)
  }, [])

  useEffect(() => {
    adminApi.getCostTrend(trendDays).then(d => setTrend(d.trend || []))
    adminApi.getCostByModel().then(d => setByModel(d.by_model || []))
  }, [trendDays])

  useEffect(() => {
    adminApi.getTopCostUsers(topPeriod, topPage).then(d => setTopUsers(d.users || []))
  }, [topPeriod, topPage])

  if (!data) return <div className="text-[#e8d5b7]">加载中...</div>

  const cards = [
    { label: '今日成本', value: `$${(data.today?.cost || 0).toFixed(4)}`, sub: `${(data.today?.tokens || 0).toLocaleString()} tokens` },
    { label: '有史以来总成本', value: `$${(data.all_time?.cost || 0).toFixed(4)}`, sub: `${(data.all_time?.tokens || 0).toLocaleString()} tokens` },
    { label: '本月成本', value: `$${(data.month?.cost || 0).toFixed(4)}`, sub: `${(data.month?.tokens || 0).toLocaleString()} tokens` },
    { label: '平均每用户', value: `$${(data.avg_cost_per_user || 0).toFixed(4)}`, sub: `${data.month?.active_users || 0} 活跃用户` },
  ]

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">Token 成本追踪</h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
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
            {trendOptions.map(opt => (
              <button key={opt.days} onClick={() => setTrendDays(opt.days)}
                className={`px-2 py-1 rounded text-xs ${trendDays === opt.days ? 'bg-[#c9a96e] text-[#1a1a2e]' : 'bg-[#1a1a2e] text-[#e8d5b7]'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <LineChart data={trend} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20 overflow-x-auto">
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

        <div className="hidden md:block bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
          <div className="flex justify-between items-center mb-3">
            <h3 className="text-[#c9a96e] font-bold">Top 成本用户</h3>
            <div className="flex gap-1">
              {[{p:'today',l:'本日'},{p:'week',l:'本周'},{p:'month',l:'本月'},{p:'all',l:'有史以来'}].map(opt => (
                <button key={opt.p} onClick={() => { setTopPeriod(opt.p); setTopPage(1) }}
                  className={`px-2 py-1 rounded text-xs ${topPeriod === opt.p ? 'bg-[#c9a96e] text-[#1a1a2e]' : 'bg-[#1a1a2e] text-[#e8d5b7]'}`}>
                  {opt.l}
                </button>
              ))}
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[#e8d5b7]/60 border-b border-[#c9a96e]/10">
                <th className="text-left py-1">用户</th>
                <th className="text-right py-1">输入</th>
                <th className="text-right py-1">输出</th>
                <th className="text-right py-1">句子数</th>
                <th className="text-right py-1">成本</th>
              </tr>
            </thead>
            <tbody>
              {topUsers.map((u, i) => (
                <tr key={i} className="text-[#e8d5b7] border-b border-[#c9a96e]/5">
                  <td className="py-1 truncate max-w-[160px]" title={u.email}>{u.email}</td>
                  <td className="text-right">{(u.prompt_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">{(u.completion_tokens || 0).toLocaleString()}</td>
                  <td className="text-right">{(u.request_count || 0).toLocaleString()}</td>
                  <td className="text-right">${(u.cost || 0).toFixed(4)}</td>
                </tr>
              ))}
              {topUsers.length === 0 && (
                <tr><td colSpan={5} className="text-[#e8d5b7]/30 text-center py-4">暂无数据</td></tr>
              )}
            </tbody>
          </table>
          <div className="flex justify-center gap-2 mt-3">
            <button onClick={() => setTopPage(p => Math.max(1, p - 1))} disabled={topPage <= 1}
              className="px-2 py-1 rounded text-xs bg-[#1a1a2e] text-[#e8d5b7] disabled:opacity-30">上一页</button>
            <span className="text-[#e8d5b7]/40 text-xs py-1">第 {topPage} 页</span>
            <button onClick={() => setTopPage(p => p + 1)} disabled={topUsers.length < 20}
              className="px-2 py-1 rounded text-xs bg-[#1a1a2e] text-[#e8d5b7] disabled:opacity-30">下一页</button>
          </div>
        </div>

        {/* 手机卡片列表 */}
        <div className="md:hidden space-y-3">
          {topUsers.map((u, idx) => (
            <div key={idx} className="bg-[#16213e] rounded-lg border border-[#c9a96e]/20 p-4 text-[#e8d5b7]">
              <div className="font-bold text-sm mb-2 truncate">{u.email || `用户 ${idx+1}`}</div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div>输入：<span className="text-[#c9a96e]">{(u.prompt_tokens || 0).toLocaleString()}</span></div>
                <div>输出：<span className="text-[#c9a96e]">{(u.completion_tokens || 0).toLocaleString()}</span></div>
                <div>句子数：<span className="text-[#c9a96e]">{(u.request_count || 0).toLocaleString()}</span></div>
                <div>成本：<span className="text-[#c9a96e]">${(u.cost || 0).toFixed(4)}</span></div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
