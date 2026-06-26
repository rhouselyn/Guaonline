import { useState, useEffect, useRef } from 'react'
import { adminApi } from '../../utils/adminApi'

const TIERS = ['free', 'basic', 'pro']

export default function AdminApiKeys() {
  const [keys, setKeys] = useState({})
  const [activeTier, setActiveTier] = useState('free')
  const [editing, setEditing] = useState({})
  const [testing, setTesting] = useState(null)
  const [testResult, setTestResult] = useState(null)
  const [interval, setInterval_] = useState(0.1)
  const [batchSize, setBatchSize] = useState(5)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [keyStatuses, setKeyStatuses] = useState({})
  const refreshRef = useRef(null)

  const loadKeyStatuses = async (tier) => {
    try {
      const data = await adminApi.getKeyStatuses(tier)
      setKeyStatuses(prev => ({ ...prev, [tier]: data.statuses || [] }))
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    adminApi.getApiKeys().then(data => {
      setKeys(data)
      const ed = {}
      for (const tier of TIERS) {
        const pool = data[tier] || { configs: [], active_index: 0 }
        ed[tier] = {
          configs: pool.configs.length > 0 ? pool.configs : [{ api_key: '', base_url: '', model: '', input_price_per_million: 0, output_price_per_million: 0 }],
          active_index: pool.active_index || 0,
        }
      }
      setEditing(ed)
    })
    adminApi.getGlobalSettings().then(data => {
      setInterval_(data.request_interval ?? 0.1)
      setBatchSize(data.batch_size ?? 5)
    })
  }, [])

  // 加载当前 tier 的 key 状态，并每 30 秒刷新
  useEffect(() => {
    loadKeyStatuses(activeTier)
    if (refreshRef.current) clearInterval(refreshRef.current)
    refreshRef.current = setInterval(() => {
      loadKeyStatuses(activeTier)
    }, 30000)
    return () => {
      if (refreshRef.current) clearInterval(refreshRef.current)
    }
  }, [activeTier])

  const saveSettings = async () => {
    await adminApi.updateGlobalSettings({ request_interval: interval, batch_size: batchSize })
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  const addConfig = (tier) => {
    setEditing(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        configs: [...prev[tier].configs, { api_key: '', base_url: '', model: '', input_price_per_million: 0, output_price_per_million: 0 }],
      }
    }))
  }

  const removeConfig = (tier, index) => {
    setEditing(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        configs: prev[tier].configs.filter((_, i) => i !== index),
      }
    }))
  }

  const updateConfig = (tier, index, field, value) => {
    setEditing(prev => {
      const newConfigs = [...prev[tier].configs]
      newConfigs[index] = { ...newConfigs[index], [field]: value }
      return { ...prev, [tier]: { ...prev[tier], configs: newConfigs } }
    })
  }

  const saveTier = async (tier) => {
    try {
      await adminApi.updateApiKeys(tier, editing[tier].configs, editing[tier].active_index)
      const data = await adminApi.getApiKeys()
      setKeys(data)
      alert(`${tier} Key 已保存`)
      loadKeyStatuses(tier)
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message))
    }
  }

  const testTier = async (tier) => {
    setTesting(tier)
    setTestResult(null)
    try {
      const result = await adminApi.testApiKey(tier)
      // 后端返回 {results: [{index, status, message}, ...]}
      const results = result.results || [result]
      setTestResult({ tier, results })
      // 立即刷新状态徽章，让“正常/异常”反映测试结果
      loadKeyStatuses(tier)
    } catch (e) {
      setTestResult({ tier, results: [{ index: 0, status: 'error', message: e.message }] })
    } finally {
      setTesting(null)
    }
  }

  if (!editing.free) return <div className="text-[#e8d5b7]">加载中...</div>

  const currentStatuses = keyStatuses[activeTier] || []

  return (
    <div>
      <h2 className="text-2xl font-bold text-[#c9a96e] mb-6">全局 API Key 管理</h2>

      {/* 全局设置 */}
      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20 mb-6">
        <h3 className="text-[#c9a96e] font-bold mb-3">全局设置</h3>
        <div className="flex gap-8 items-end">
          <div className="flex-1">
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">请求间隔（秒）</label>
            <div className="flex items-center gap-3">
              <input type="range" min={0.01} max={10} step={0.01} value={interval}
                onChange={e => setInterval_(Number(e.target.value))} className="flex-1" />
              <span className="text-[#c9a96e] font-bold text-sm w-16 text-right">{interval.toFixed(2)}s</span>
            </div>
            <div className="flex justify-between text-[#e8d5b7]/30 text-xs mt-1">
              <span>0.01s</span><span>10s</span>
            </div>
          </div>
          <div className="flex-1">
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">并发批大小</label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={100} step={1} value={batchSize}
                onChange={e => setBatchSize(Number(e.target.value))} className="flex-1" />
              <span className="text-[#c9a96e] font-bold text-sm w-16 text-right">{batchSize}</span>
            </div>
            <div className="flex justify-between text-[#e8d5b7]/30 text-xs mt-1">
              <span>1</span><span>100</span>
            </div>
          </div>
          <button onClick={saveSettings} className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">
            {settingsSaved ? '已保存' : '保存设置'}
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {TIERS.map(tier => (
          <button
            key={tier}
            onClick={() => setActiveTier(tier)}
            className={`px-4 py-2 rounded font-bold text-sm ${
              activeTier === tier ? 'bg-[#c9a96e] text-[#1a1a2e]' : 'bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/30'
            }`}
          >
            {tier.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-[#c9a96e] font-bold">{activeTier.toUpperCase()} Key 池</h3>
          <div className="flex gap-2">
            <button onClick={() => testTier(activeTier)} disabled={testing === activeTier}
              className="px-3 py-1 bg-[#c9a96e]/20 text-[#c9a96e] rounded text-sm hover:bg-[#c9a96e]/30 disabled:opacity-50">
              {testing === activeTier ? '测试中...' : '测试'}
            </button>
            <button onClick={() => addConfig(activeTier)}
              className="px-3 py-1 bg-[#c9a96e] text-[#1a1a2e] rounded text-sm font-bold">+ 添加</button>
          </div>
        </div>

        {testResult && testResult.tier === activeTier && (
          <div className="mb-4 p-2 rounded text-sm bg-[#1a1a2e] border border-[#c9a96e]/20 space-y-1">
            <div className="text-[#e8d5b7]/60 text-xs">测试结果（共 {testResult.results.length} 个 Key）：</div>
            {testResult.results.map(r => (
              <div key={r.index} className={
                r.status === 'ok' ? 'text-green-400' :
                r.status === 'empty' ? 'text-gray-400' :
                'text-red-400'
              }>
                Key #{r.index + 1}：{r.message}
              </div>
            ))}
          </div>
        )}

        {editing[activeTier]?.configs.map((cfg, i) => {
          const status = currentStatuses[i]
          return (
            <div key={i} className="flex gap-2 mb-2 items-end">
              <div className="w-20 flex-shrink-0">
                <label className="text-[#e8d5b7]/60 text-xs">状态</label>
                <div className="py-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    status?.status === 'normal' ? 'bg-green-900/30 text-green-400' :
                    status?.status === 'rate_limited' ? 'bg-yellow-900/30 text-yellow-400' :
                    status?.status === 'invalid' ? 'bg-red-900/30 text-red-400' :
                    status?.status === 'error' ? 'bg-orange-900/30 text-orange-400' :
                    'bg-gray-700/30 text-gray-400'
                  }`}>
                    {status?.status_text || '未知'}
                  </span>
                </div>
              </div>
              <div className="flex-1">
                <label className="text-[#e8d5b7]/60 text-xs">API Key</label>
                <input type="password" value={cfg.api_key || ''} onChange={e => updateConfig(activeTier, i, 'api_key', e.target.value)}
                  placeholder="sk-..." className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-[#e8d5b7]/60 text-xs">Base URL</label>
                <input value={cfg.base_url || ''} onChange={e => updateConfig(activeTier, i, 'base_url', e.target.value)}
                  placeholder="https://api.openai.com/v1" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-[#e8d5b7]/60 text-xs">Model</label>
                <input value={cfg.model || ''} onChange={e => updateConfig(activeTier, i, 'model', e.target.value)}
                  placeholder="gpt-4o-mini" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="w-24">
                <label className="text-[#e8d5b7]/60 text-xs">输入价格/$1M</label>
                <input type="number" step="0.01" value={cfg.input_price_per_million || 0} onChange={e => updateConfig(activeTier, i, 'input_price_per_million', Number(e.target.value))}
                  placeholder="0.00" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="w-24">
                <label className="text-[#e8d5b7]/60 text-xs">输出价格/$1M</label>
                <input type="number" step="0.01" value={cfg.output_price_per_million || 0} onChange={e => updateConfig(activeTier, i, 'output_price_per_million', Number(e.target.value))}
                  placeholder="0.00" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <button onClick={() => removeConfig(activeTier, i)} className="text-red-400 text-sm px-2 py-1">删除</button>
            </div>
          )
        })}

        <div className="flex justify-end mt-4">
          <button onClick={() => saveTier(activeTier)}
            className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">保存</button>
        </div>
      </div>
    </div>
  )
}
