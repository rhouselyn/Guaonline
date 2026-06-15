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

const GrowthChart = ({ data }) => {
  const [hovered, setHovered] = useState(null)

  if (!data.length) return <div className="text-[#e8d5b7]/40 text-sm">暂无数据</div>

  const maxTotal = Math.max(...data.map(d => d.total_users || 0), 1)
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
        {/* 区域填充 - 总用户数 */}
        <polygon points={`0,${height} ${data.map((d, i) => {
          const x = (i / Math.max(data.length - 1, 1)) * width
          const y = height - ((d.total_users || 0) / maxTotal) * height
          return `${x},${y}`
        }).join(' ')} ${width},${height}`} fill="rgba(201,169,110,0.1)" />
        {/* 折线 - 总用户数 */}
        <polyline points={data.map((d, i) => {
          const x = (i / Math.max(data.length - 1, 1)) * width
          const y = height - ((d.total_users || 0) / maxTotal) * height
          return `${x},${y}`
        }).join(' ')} fill="none" stroke="#c9a96e" strokeWidth="0.5" />
        {/* 新增用户柱状（底部） */}
        {data.map((d, i) => {
          const x = (i / Math.max(data.length - 1, 1)) * width
          const newH = d.new_users > 0 ? Math.max((d.new_users / maxTotal) * height, 0.3) : 0
          if (newH === 0) return null
          return <rect key={i} x={x - 0.15} y={height - newH} width="0.3" height={newH}
            fill="rgba(59,130,246,0.5)" />
        })}
        {/* 数据点 */}
        {data.map((d, i) => {
          const x = (i / Math.max(data.length - 1, 1)) * width
          const y = height - ((d.total_users || 0) / maxTotal) * height
          return (
            <circle key={i} cx={x} cy={y} r={hovered === i ? "1.5" : "0.8"}
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
            top: `${(1 - (data[hovered].total_users || 0) / maxTotal) * 100}%`,
            transform: 'translate(-50%, -120%)',
          }}>
          <div className="text-[#e8d5b7]/60">{data[hovered].date}</div>
          <div className="text-[#c9a96e] font-bold">总用户: {data[hovered].total_users}</div>
          <div className="text-blue-400">新增: +{data[hovered].new_users}</div>
        </div>
      )}
      {/* X轴标签 */}
      <div className="flex justify-between text-[#e8d5b7]/30 text-xs mt-1">
        <span>{data[0]?.date?.slice(5)}</span>
        <span>{data[data.length - 1]?.date?.slice(5)}</span>
      </div>
      {/* 图例 */}
      <div className="flex gap-4 mt-2 text-xs">
        <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-[#c9a96e] inline-block" /> 总用户数</span>
        <span className="flex items-center gap-1"><span className="w-3 h-2 bg-blue-500/50 inline-block" /> 新增用户</span>
      </div>
    </div>
  )
}

export default function AdminDashboard() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [growthDays, setGrowthDays] = useState(30)
  const [growth, setGrowth] = useState([])

  const growthOptions = [
    { days: 1, label: '本日' },
    { days: 7, label: '本周' },
    { days: 30, label: '本月' },
    { days: 9999, label: '有史以来' },
  ]

  useEffect(() => {
    adminApi.getDashboard().then(setData).finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    adminApi.getUserGrowth(growthDays).then(d => setGrowth(d.growth || []))
  }, [growthDays])

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

      {/* 用户增长折线图 */}
      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20 mb-8">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-[#c9a96e] font-bold">用户增长趋势</h3>
          <div className="flex gap-1">
            {growthOptions.map(opt => (
              <button key={opt.days} onClick={() => setGrowthDays(opt.days)}
                className={`px-2 py-1 rounded text-xs ${growthDays === opt.days ? 'bg-[#c9a96e] text-[#1a1a2e]' : 'bg-[#1a1a2e] text-[#e8d5b7]'}`}>
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <GrowthChart data={growth} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <BarChart title="Tier 分布" data={data.tier_distribution || {}} colors={{ free: '#6b7280', basic: '#3b82f6', pro: '#a855f7' }} />
        <BarChart title="学习语言分布" data={data.source_lang_distribution || {}} />
        <BarChart title="目标语言分布" data={data.target_lang_distribution || {}} />
      </div>
    </div>
  )
}
