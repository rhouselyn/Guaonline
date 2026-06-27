import { useState, useEffect, useRef } from 'react'
import { adminApi } from '../../utils/adminApi'

const TIERS = ['free', 'basic', 'pro']
// 每个 tier 下分 3 个 sub-pool，允许不同任务用不同 key。
// label：管理员可见的中文名；hint：用途说明
const SUB_POOLS = [
  { key: 'title', label: '标题+语言', hint: '生成标题 + 语言检测（轻量、低延迟）' },
  { key: 'sentence', label: '句子处理', hint: '翻译/生成/分词/语法解释（默认）' },
  { key: 'word', label: '单词详情', hint: '单词多选/例句/记忆辅助' },
]

// per-key 最高输出默认值：free 16384，其它 65536
const defaultMaxTokens = (tier) => tier === 'free' ? 16384 : 65536

// 生成稳定的唯一 id，作为 React key，避免用数组 index 导致拖拽时字段错位
let _uidCounter = 0
const genUid = () => `cfg_${Date.now().toString(36)}_${(_uidCounter++).toString(36)}`
// 清理用于后端保存：剥离前端-only 的 uid 字段
const stripUid = (cfg) => {
  const { _uid, ...rest } = cfg
  return rest
}

// 复制/粘贴缓冲区：模块级变量，跨 tier/sub 共享，刷新页面后清空（符合"复制粘贴"语义）
let _clipboard = null

export default function AdminApiKeys() {
  const [keys, setKeys] = useState({})
  const [activeTier, setActiveTier] = useState('free')
  const [activeSub, setActiveSub] = useState('sentence')
  const [editing, setEditing] = useState({})
  const [testing, setTesting] = useState(null)  // `${tier}:${sub}` 标识正在测试的池
  const [testResult, setTestResult] = useState(null)
  const [interval, setInterval_] = useState(0.1)
  const [batchSize, setBatchSize] = useState(5)
  const [settingsSaved, setSettingsSaved] = useState(false)
  // keyStatuses 用 `${tier}:${sub}` 作为 key，避免不同 sub 状态串扰
  const [keyStatuses, setKeyStatuses] = useState({})
  const esRef = useRef(null)
  // 拖拽排序：当前拖动的源 index
  const [dragIndex, setDragIndex] = useState(null)
  // 复制提示：触发短暂"已复制"反馈
  const [copiedSig, setCopiedSig] = useState(null)
  // 跟踪有未保存字段改动的条目（按 _uid）。只有这些条目会渲染"保存"按钮。
  // 结构性操作（删除/交换/粘贴）会立即持久化，不进这个集合。
  const [dirtyUids, setDirtyUids] = useState(() => new Set())

  const poolSig = (tier, sub) => `${tier}:${sub}`

  const loadKeyStatuses = async (tier, sub) => {
    try {
      const data = await adminApi.getKeyStatuses(tier, sub)
      setKeyStatuses(prev => ({ ...prev, [poolSig(tier, sub)]: data.statuses || [] }))
    } catch (e) {
      // ignore
    }
  }

  useEffect(() => {
    adminApi.getApiKeys().then(data => {
      setKeys(data)
      const ed = {}
      for (const tier of TIERS) {
        const tierData = data[tier] || {}
        ed[tier] = {}
        for (const sub of SUB_POOLS) {
          const pool = tierData[sub.key] || { configs: [], active_index: 0 }
          const cap = defaultMaxTokens(tier)
          const configs = (pool.configs.length > 0 ? pool.configs : [{ api_key: '', base_url: '', model: '' }])
            .map(c => ({
              _uid: genUid(),
              api_key: c.api_key || '',
              base_url: c.base_url || '',
              model: c.model || '',
              disabled: c.disabled ?? false,
              max_tokens: c.max_tokens ?? cap,
              input_price_per_million: c.input_price_per_million ?? 0,
              output_price_per_million: c.output_price_per_million ?? 0,
            }))
          ed[tier][sub.key] = { configs, active_index: pool.active_index || 0 }
        }
      }
      setEditing(ed)
    })
    adminApi.getGlobalSettings().then(data => {
      setInterval_(data.request_interval ?? 0.1)
      setBatchSize(data.batch_size ?? 5)
    })
  }, [])

  // 实时订阅当前 tier:sub 的 Key 状态（SSE 事件驱动，无 30s 轮询）
  useEffect(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
    const es = new EventSource(adminApi.keyStatusStreamUrl(activeTier, activeSub))
    esRef.current = es
    const sig = poolSig(activeTier, activeSub)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.statuses) {
          setKeyStatuses(prev => ({ ...prev, [sig]: data.statuses }))
        }
      } catch { /* 忽略心跳/坏包 */ }
    }
    es.onerror = () => {
      // EventSource 浏览器内置会自动重连，这里只关闭避免重复创建
    }
    return () => {
      es.close()
      if (esRef.current === es) esRef.current = null
    }
  }, [activeTier, activeSub])

  const saveSettings = async () => {
    await adminApi.updateGlobalSettings({ request_interval: interval, batch_size: batchSize })
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  // 内部：把指定 configs 持久化到后端，并刷新 keys/statuses。
  // 结构性操作（删除/交换/粘贴）和单条目保存都走这里。
  const persistConfigs = async (tier, sub, configs, activeIndex) => {
    try {
      const cleanConfigs = configs.map(stripUid)
      await adminApi.updateApiKeys(tier, sub, cleanConfigs, activeIndex)
      const data = await adminApi.getApiKeys()
      setKeys(data)
      loadKeyStatuses(tier, sub)
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message))
    }
  }

  const addConfig = (tier, sub) => {
    const newUid = genUid()
    setEditing(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [sub]: {
          ...prev[tier][sub],
          configs: [...prev[tier][sub].configs, {
            _uid: newUid,
            api_key: '', base_url: '', model: '',
            disabled: false, max_tokens: defaultMaxTokens(tier),
            input_price_per_million: 0, output_price_per_million: 0,
          }],
        }
      }
    }))
    // 新增的空条目需要用户填写后点保存，所以标记为 dirty
    setDirtyUids(prev => new Set(prev).add(newUid))
  }

  const removeConfig = (tier, sub, index) => {
    const pool = editing[tier][sub]
    if (!pool) return
    const removedUid = pool.configs[index]?._uid
    const newConfigs = pool.configs.filter((_, i) => i !== index)
    setEditing(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [sub]: { ...prev[tier][sub], configs: newConfigs }
      }
    }))
    // 删除是结构性操作：立即持久化，不需要保存按钮
    persistConfigs(tier, sub, newConfigs, pool.active_index)
    // 清掉该条目的 dirty 标记（已不存在）
    if (removedUid) {
      setDirtyUids(prev => {
        const next = new Set(prev)
        next.delete(removedUid)
        return next
      })
    }
  }

  const updateConfig = (tier, sub, index, field, value) => {
    const cfg = editing[tier]?.[sub]?.configs[index]
    setEditing(prev => {
      const newConfigs = [...prev[tier][sub].configs]
      newConfigs[index] = { ...newConfigs[index], [field]: value }
      return { ...prev, [tier]: { ...prev[tier], [sub]: { ...prev[tier][sub], configs: newConfigs } } }
    })
    // 字段被修改：标记为 dirty，显示保存按钮
    if (cfg) {
      setDirtyUids(prev => new Set(prev).add(cfg._uid))
    }
  }

  // 拖拽重排序：把 from 移到 to 的位置
  const moveConfig = (tier, sub, from, to) => {
    if (from === to) return
    const pool = editing[tier][sub]
    if (!pool) return
    const configs = [...pool.configs]
    const [moved] = configs.splice(from, 1)
    configs.splice(to, 0, moved)
    setEditing(prev => ({
      ...prev,
      [tier]: { ...prev[tier], [sub]: { ...prev[tier][sub], configs } }
    }))
    // 交换是结构性操作：立即持久化，不需要保存按钮
    persistConfigs(tier, sub, configs, pool.active_index)
  }

  // 复制单个 config 到剪贴板（跨 tier/sub 通用）
  const copyConfig = (tier, sub, index) => {
    const cfg = editing[tier][sub].configs[index]
    if (!cfg) return
    // ponytail: 浅拷贝即可，剥离 _uid 让粘贴时生成新 uid
    // 所有字段都是基本类型，浅拷贝等价于深拷贝，源条目不会被后续修改影响
    const { _uid, ...rest } = cfg
    _clipboard = { ...rest }
    const sig = poolSig(tier, sub)
    setCopiedSig(`${sig}#${index}`)
    setTimeout(() => setCopiedSig(null), 1500)
  }

  // 把剪贴板里的 config 粘贴到当前 tier:sub（追加到末尾）
  const pasteConfig = (tier, sub) => {
    if (!_clipboard) {
      alert('剪贴板为空，先在某行点"复制"')
      return
    }
    const newUid = genUid()
    const pool = editing[tier][sub]
    if (!pool) return
    // 新对象 + 新 _uid，源 _clipboard 不被修改
    const newConfigs = [...pool.configs, { ..._clipboard, _uid: newUid }]
    setEditing(prev => ({
      ...prev,
      [tier]: {
        ...prev[tier],
        [sub]: { ...prev[tier][sub], configs: newConfigs }
      }
    }))
    // 粘贴是结构性操作：立即持久化，不需要保存按钮
    // 后端会自动把脱敏 key 还原成真实 key（跨 tier/sub 也支持）
    persistConfigs(tier, sub, newConfigs, pool.active_index)
  }

  // 单条目保存：后端按 tier:sub 整体更新，但只清除该条目的 dirty 标记
  const saveEntry = async (tier, sub, uid) => {
    const pool = editing[tier][sub]
    if (!pool) return
    await persistConfigs(tier, sub, pool.configs, pool.active_index)
    setDirtyUids(prev => {
      const next = new Set(prev)
      next.delete(uid)
      return next
    })
  }

  const testTier = async (tier, sub) => {
    const sig = poolSig(tier, sub)
    // 测试前先持久化当前编辑器内容，确保测试针对的是用户看到的内容
    // 而不是后端可能过时的旧状态
    const pool = editing[tier][sub]
    if (pool) {
      await persistConfigs(tier, sub, pool.configs, pool.active_index)
    }
    setTesting(sig)
    setTestResult(null)
    try {
      const result = await adminApi.testApiKey(tier, sub)
      const results = result.results || [result]
      setTestResult({ sig, results })
      loadKeyStatuses(tier, sub)
    } catch (e) {
      setTestResult({ sig, results: [{ index: 0, status: 'error', message: e.message }] })
    } finally {
      setTesting(null)
    }
  }

  if (!editing.free) return <div className="text-[#e8d5b7]">加载中...</div>

  const currentSig = poolSig(activeTier, activeSub)
  const currentStatuses = keyStatuses[currentSig] || []
  const activeSubMeta = SUB_POOLS.find(s => s.key === activeSub)

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

      {/* 一级 tab：tier */}
      <div className="flex gap-2 mb-3">
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

      {/* 二级 tab：sub-pool（标题/句子/单词） */}
      <div className="flex gap-2 mb-4">
        {SUB_POOLS.map(sp => (
          <button
            key={sp.key}
            onClick={() => setActiveSub(sp.key)}
            className={`px-3 py-1.5 rounded text-sm ${
              activeSub === sp.key ? 'bg-[#c9a96e]/30 text-[#c9a96e] border border-[#c9a96e]/50' : 'bg-[#16213e] text-[#e8d5b7]/60 border border-[#c9a96e]/10'
            }`}
            title={sp.hint}
          >
            {sp.label}
          </button>
        ))}
      </div>

      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/20">
        <div className="flex justify-between items-center mb-2">
          <div>
            <h3 className="text-[#c9a96e] font-bold">{activeTier.toUpperCase()} / {activeSubMeta.label}</h3>
            <p className="text-[#e8d5b7]/40 text-xs mt-0.5">{activeSubMeta.hint}</p>
          </div>
          <div className="flex gap-2">
            {/* 粘贴：把剪贴板里的 config 追加到当前 sub-pool，跨 tier/sub 都可粘贴 */}
            <button onClick={() => pasteConfig(activeTier, activeSub)}
              className="px-3 py-1 bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/40 rounded text-sm hover:bg-[#1a1a2e] disabled:opacity-40"
              disabled={!_clipboard}
              title={_clipboard ? `剪贴板有内容：${_clipboard.model || '(无 model)'}` : '剪贴板为空'}>
              粘贴
            </button>
            <button onClick={() => testTier(activeTier, activeSub)} disabled={testing === currentSig}
              className="px-3 py-1 bg-[#c9a96e]/20 text-[#c9a96e] rounded text-sm hover:bg-[#c9a96e]/30 disabled:opacity-50">
              {testing === currentSig ? '测试中...' : '测试'}
            </button>
            <button onClick={() => addConfig(activeTier, activeSub)}
              className="px-3 py-1 bg-[#c9a96e] text-[#1a1a2e] rounded text-sm font-bold">+ 添加</button>
          </div>
        </div>

        {testResult && testResult.sig === currentSig && (
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

        {editing[activeTier]?.[activeSub]?.configs.map((cfg, i) => {
          const status = currentStatuses[i]
          const isDisabled = cfg.disabled
          const copiedKey = `${currentSig}#${i}`
          const isDirty = dirtyUids.has(cfg._uid)
          return (
            <div key={cfg._uid}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={e => e.preventDefault()}
              onDrop={() => { moveConfig(activeTier, activeSub, dragIndex, i); setDragIndex(null) }}
              className={`flex gap-2 mb-2 items-end p-1 rounded ${dragIndex === i ? 'opacity-50' : ''} ${isDisabled ? 'opacity-60' : ''} ${isDirty ? 'ring-1 ring-[#c9a96e]/40 bg-[#c9a96e]/5' : ''}`}
            >
              <div className="w-6 flex-shrink-0 flex flex-col items-center justify-end pb-1 cursor-grab text-[#e8d5b7]/30 hover:text-[#c9a96e]" title="拖动排序">⠿</div>
              <div className="w-20 flex-shrink-0">
                <label className="text-[#e8d5b7]/60 text-xs">状态</label>
                <div className="py-1 flex flex-col gap-1">
                  <span className={`px-2 py-0.5 rounded text-xs font-bold ${
                    status?.status === 'normal' ? 'bg-green-900/30 text-green-400' :
                    status?.status === 'rate_limited' ? 'bg-yellow-900/30 text-yellow-400' :
                    status?.status === 'invalid' ? 'bg-red-900/30 text-red-400' :
                    status?.status === 'error' ? 'bg-orange-900/30 text-orange-400' :
                    status?.status === 'disabled' ? 'bg-blue-900/30 text-blue-400' :
                    'bg-gray-700/30 text-gray-400'
                  }`}>
                    {status?.status_text || '未知'}
                  </span>
                  {status?.is_busy && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-900/30 text-cyan-300 flex items-center gap-1 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                      占用中
                    </span>
                  )}
                </div>
              </div>
              <div className="flex-1">
                <label className="text-[#e8d5b7]/60 text-xs">API Key</label>
                <input type="password" value={cfg.api_key || ''} onChange={e => updateConfig(activeTier, activeSub, i, 'api_key', e.target.value)}
                  placeholder="sk-..." className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-[#e8d5b7]/60 text-xs">Base URL</label>
                <input value={cfg.base_url || ''} onChange={e => updateConfig(activeTier, activeSub, i, 'base_url', e.target.value)}
                  placeholder="https://api.openai.com/v1" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="flex-1">
                <label className="text-[#e8d5b7]/60 text-xs">Model</label>
                <input value={cfg.model || ''} onChange={e => updateConfig(activeTier, activeSub, i, 'model', e.target.value)}
                  placeholder="gpt-4o-mini" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="w-24">
                <label className="text-[#e8d5b7]/60 text-xs">最大输出</label>
                <input type="number" step="1" value={cfg.max_tokens ?? defaultMaxTokens(activeTier)} onChange={e => updateConfig(activeTier, activeSub, i, 'max_tokens', Number(e.target.value))}
                  placeholder={String(defaultMaxTokens(activeTier))} className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="w-24">
                <label className="text-[#e8d5b7]/60 text-xs">输入价格/$1M</label>
                <input type="number" step="0.01" value={cfg.input_price_per_million || 0} onChange={e => updateConfig(activeTier, activeSub, i, 'input_price_per_million', Number(e.target.value))}
                  placeholder="0.00" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="w-24">
                <label className="text-[#e8d5b7]/60 text-xs">输出价格/$1M</label>
                <input type="number" step="0.01" value={cfg.output_price_per_million || 0} onChange={e => updateConfig(activeTier, activeSub, i, 'output_price_per_million', Number(e.target.value))}
                  placeholder="0.00" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <button onClick={() => updateConfig(activeTier, activeSub, i, 'disabled', !cfg.disabled)}
                className={`px-2 py-1 rounded text-xs font-bold ${isDisabled ? 'bg-blue-900/40 text-blue-400' : 'bg-gray-700/40 text-gray-300'}`}
                title={isDisabled ? '点击启用' : '点击禁用（不参与轮询）'}>
                {isDisabled ? '已禁用' : '启用中'}
              </button>
              {/* 复制：把该行 config 写入剪贴板，可在任意 tier/sub 粘贴 */}
              <button onClick={() => copyConfig(activeTier, activeSub, i)}
                className={`px-2 py-1 rounded text-xs font-bold ${copiedSig === copiedKey ? 'bg-green-900/40 text-green-400' : 'bg-[#c9a96e]/20 text-[#c9a96e] hover:bg-[#c9a96e]/30'}`}
                title="复制此 Key 到剪贴板（可粘贴到任意 tier/sub）">
                {copiedSig === copiedKey ? '已复制' : '复制'}
              </button>
              {/* 单条目保存：仅在该条目有未保存改动时显示。
                  结构性操作（删除/交换/粘贴）已自动持久化，不需要这个按钮。 */}
              {isDirty && (
                <button onClick={() => saveEntry(activeTier, activeSub, cfg._uid)}
                  className="px-3 py-1 rounded text-xs font-bold bg-green-700/50 text-green-300 hover:bg-green-700/70"
                  title="保存该条目的改动">
                  保存
                </button>
              )}
              <button onClick={() => removeConfig(activeTier, activeSub, i)} className="text-red-400 text-sm px-2 py-1">删除</button>
            </div>
          )
        })}
      </div>
    </div>
  )
}
