import { useState, useEffect, useRef } from 'react'
import { adminApi } from '../../utils/adminApi'

const TIERS = ['free', 'basic', 'pro']
const SUB_POOLS = [
  { key: 'title', label: '标题+语言', hint: '生成标题 + 语言检测（轻量、低延迟）' },
  { key: 'sentence', label: '句子处理', hint: '翻译/生成/分词/语法解释（默认）' },
  { key: 'word', label: '单词详情', hint: '单词多选/例句/记忆辅助' },
]
const defaultMaxTokens = (tier) => tier === 'free' ? 16384 : 65536

// 模块级引用配置剪贴板（复制 = 复制 {key_id, max_tokens, disabled}，粘贴 = 在目标 pool 追加引用）
let _refClipboard = null

export default function AdminApiKeys() {
  const [keys, setKeys] = useState({})          // 全局 key 仓库（脱敏）：{id: {id, api_key, has_key, base_url, model, prices}}
  const [tierKeys, setTierKeys] = useState({})  // 引用表：{tier: {sub: {configs:[{key_id,max_tokens,disabled}], active_index}}}
  const [activeTier, setActiveTier] = useState('free')
  const [activeSub, setActiveSub] = useState('sentence')
  const [keyStatuses, setKeyStatuses] = useState({})  // {sig: [{index, key_id, status, ...}]}
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [interval, setInterval_] = useState(0.1)
  const [batchSize, setBatchSize] = useState(5)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const esRef = useRef(null)
  const [dragIndex, setDragIndex] = useState(null)
  const [copiedSig, setCopiedSig] = useState(null)
  // 编辑 key 全局属性的弹窗
  const [editModal, setEditModal] = useState({ open: false, keyId: null, form: null, refCount: 0, saving: false })
  // 添加 key 的弹窗（mode: 'choose' | 'new' | 'existing'）
  const [addModal, setAddModal] = useState({ open: false, mode: 'choose', newForm: null, selectedKeyId: null })
  // 删除引用的确认弹窗（防止误点）
  const [confirmDelete, setConfirmDelete] = useState(null)  // {tier, sub, idx}

  const poolSig = (tier, sub) => `${tier}:${sub}`

  const reloadAll = async () => {
    const data = await adminApi.getApiKeys()
    setKeys(data.keys || {})
    setTierKeys(data.tier_keys || {})
  }

  const loadKeyStatuses = async (tier, sub) => {
    try {
      const data = await adminApi.getKeyStatuses(tier, sub)
      setKeyStatuses(prev => ({ ...prev, [poolSig(tier, sub)]: data.statuses || [] }))
    } catch (e) { /* ignore */ }
  }

  useEffect(() => {
    reloadAll()
    adminApi.getGlobalSettings().then(data => {
      setInterval_(data.request_interval ?? 0.1)
      setBatchSize(data.batch_size ?? 5)
    })
  }, [])

  useEffect(() => {
    if (esRef.current) { esRef.current.close(); esRef.current = null }
    const es = new EventSource(adminApi.keyStatusStreamUrl(activeTier, activeSub))
    esRef.current = es
    const sig = poolSig(activeTier, activeSub)
    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        if (data.statuses) setKeyStatuses(prev => ({ ...prev, [sig]: data.statuses }))
      } catch { /* ignore */ }
    }
    return () => { es.close(); if (esRef.current === es) esRef.current = null }
  }, [activeTier, activeSub])

  const saveSettings = async () => {
    await adminApi.updateGlobalSettings({ request_interval: interval, batch_size: batchSize })
    setSettingsSaved(true)
    setTimeout(() => setSettingsSaved(false), 2000)
  }

  // 计算某 key 被多少个 pool（唯一 tier/sub）引用（供"共享 N 处"标记）。
  // 同一个 pool 内重复引用同一 key 只算 1 处，避免 paste 重复条目导致计数虚高。
  const countKeyRefs = (keyId) => {
    const seen = new Set()
    for (const tier in tierKeys) for (const sub in tierKeys[tier]) {
      if ((tierKeys[tier][sub].configs || []).some(r => r.key_id === keyId)) {
        seen.add(`${tier}:${sub}`)
      }
    }
    return seen.size
  }

  // 持久化某 pool 的引用列表（结构性操作：增删/排序/粘贴/字段改动都走这里）
  const persistRefs = async (tier, sub, refs, activeIndex = 0) => {
    try {
      await adminApi.updateApiKeys(tier, sub, refs, activeIndex)
      await reloadAll()
      loadKeyStatuses(tier, sub)
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message))
    }
  }

  // 行内改 per-pool 配置（max_tokens/disabled）
  const updateRefField = (tier, sub, idx, field, value) => {
    const pool = tierKeys[tier]?.[sub]
    if (!pool) return
    const newConfigs = pool.configs.map((r, i) => i === idx ? { ...r, [field]: value } : r)
    setTierKeys(prev => ({
      ...prev,
      [tier]: { ...prev[tier], [sub]: { ...prev[tier][sub], configs: newConfigs } }
    }))
  }
  // max_tokens 失焦时持久化（避免输入过程中频繁请求）
  const commitRefField = (tier, sub) => {
    const pool = tierKeys[tier]?.[sub]
    if (pool) persistRefs(tier, sub, pool.configs, pool.active_index || 0)
  }

  // 拖拽重排序
  const moveRef = (tier, sub, from, to) => {
    if (from === to) return
    const pool = tierKeys[tier][sub]
    const configs = [...pool.configs]
    const [moved] = configs.splice(from, 1)
    configs.splice(to, 0, moved)
    setTierKeys(prev => ({ ...prev, [tier]: { ...prev[tier], [sub]: { ...prev[tier][sub], configs } } }))
    persistRefs(tier, sub, configs, pool.active_index || 0)
  }

  // 删除引用（不删全局 key）
  const removeRef = (tier, sub, idx) => {
    const pool = tierKeys[tier][sub]
    const newConfigs = pool.configs.filter((_, i) => i !== idx)
    setTierKeys(prev => ({ ...prev, [tier]: { ...prev[tier], [sub]: { ...prev[tier][sub], configs: newConfigs } } }))
    persistRefs(tier, sub, newConfigs, pool.active_index || 0)
  }

  // 复制引用配置到剪贴板（key_id + max_tokens + disabled + weight）
  const copyRef = (tier, sub, idx) => {
    const ref = tierKeys[tier][sub].configs[idx]
    if (!ref) return
    _refClipboard = { ...ref }
    const sig = `${poolSig(tier, sub)}#${idx}`
    setCopiedSig(sig)
    setTimeout(() => setCopiedSig(null), 1500)
  }

  // 粘贴引用配置到当前 pool（追加引用同一个 key_id）
  const pasteRef = (tier, sub) => {
    if (!_refClipboard) { alert('剪贴板为空，先在某行点"复制"'); return }
    const pool = tierKeys[tier][sub]
    if (!pool) return
    const newRef = { key_id: _refClipboard.key_id, max_tokens: _refClipboard.max_tokens ?? defaultMaxTokens(tier), disabled: false, weight: _refClipboard.weight ?? 1 }
    const newConfigs = [...pool.configs, newRef]
    setTierKeys(prev => ({ ...prev, [tier]: { ...prev[tier], [sub]: { ...prev[tier][sub], configs: newConfigs } } }))
    persistRefs(tier, sub, newConfigs, pool.active_index || 0)
  }

  // ── 编辑 key 全局属性弹窗 ──
  const openEditModal = (keyId) => {
    const k = keys[keyId]
    if (!k) return
    setEditModal({
      open: true, keyId, refCount: countKeyRefs(keyId), saving: false,
      form: {
        title: k.title || '',
        api_key: k.api_key || '',          // 脱敏值；用户改写才提交新值
        base_url: k.base_url || '',
        model: k.model || '',
        input_price_per_million: k.input_price_per_million ?? 0,
        output_price_per_million: k.output_price_per_million ?? 0,
      }
    })
  }
  const saveEditModal = async () => {
    const { keyId, form } = editModal
    setEditModal(m => ({ ...m, saving: true }))
    try {
      // 带 * 的 api_key 视为未修改（后端会忽略）
      const payload = { ...form }
      if (form.api_key && form.api_key.includes('*')) delete payload.api_key
      await adminApi.updateKeyDef(keyId, payload)
      await reloadAll()
      setEditModal(m => ({ ...m, open: false }))
    } catch (e) {
      alert('保存失败: ' + (e.response?.data?.detail || e.message))
    } finally {
      setEditModal(m => ({ ...m, saving: false }))
    }
  }

  // ── 添加 key 弹窗 ──
  const openAddModal = () => setAddModal({ open: true, mode: 'choose', newForm: { title: '', api_key: '', base_url: '', model: '', input_price_per_million: 0, output_price_per_million: 0 }, selectedKeyId: null })
  const createNewKeyAndAdd = async () => {
    const f = addModal.newForm
    if (!f.api_key || !f.model) { alert('api_key 和 model 不能为空'); return }
    try {
      const res = await adminApi.createKeyDef(f.api_key, f.base_url, f.model, f.input_price_per_million, f.output_price_per_million, f.title)
      await appendRefToPool(res.id)
      setAddModal({ open: false, mode: 'choose', newForm: null, selectedKeyId: null })
    } catch (e) {
      alert('创建失败: ' + (e.response?.data?.detail || e.message))
    }
  }
  const addExistingKey = async (keyId) => {
    await appendRefToPool(keyId)
    setAddModal({ open: false, mode: 'choose', newForm: null, selectedKeyId: null })
  }
  const appendRefToPool = async (keyId) => {
    const pool = tierKeys[activeTier][activeSub]
    const newRef = { key_id: keyId, max_tokens: defaultMaxTokens(activeTier), disabled: false, weight: 1 }
    const newConfigs = [...pool.configs, newRef]
    setTierKeys(prev => ({ ...prev, [activeTier]: { ...prev[activeTier], [activeSub]: { ...prev[activeTier][activeSub], configs: newConfigs } } }))
    await persistRefs(activeTier, activeSub, newConfigs, pool.active_index || 0)
  }

  // 测试：先持久化当前 pool 引用（确保当前页改动被测到），再测所有 key（每个 key_id 只测一次），
  // 测完重载所有 pool 状态，所有页面都更新。
  const testAll = async () => {
    const pool = tierKeys[activeTier]?.[activeSub]
    if (pool) await persistRefs(activeTier, activeSub, pool.configs, pool.active_index || 0)
    setTesting(true)
    setTestResult(null)
    try {
      const result = await adminApi.testAllKeys()
      setTestResult({ results: result.results || [], count: result.count || 0 })
      // 重载所有 pool 的状态，让所有 tier/sub 页面都更新到最新测试结果
      for (const tier of TIERS) {
        const tierData = tierKeys[tier]
        if (!tierData) continue
        for (const sp of SUB_POOLS) {
          if ((tierData[sp.key]?.configs || []).length > 0) {
            await loadKeyStatuses(tier, sp.key)
          }
        }
      }
    } catch (e) {
      setTestResult({ results: [], count: 0, error: e.message })
    } finally {
      setTesting(false)
    }
  }

  if (!tierKeys.free) return <div className="text-[#e8d5b7]">加载中...</div>

  const currentSig = poolSig(activeTier, activeSub)
  const currentStatuses = keyStatuses[currentSig] || []
  const currentPool = tierKeys[activeTier]?.[activeSub] || { configs: [], active_index: 0 }
  const activeSubMeta = SUB_POOLS.find(s => s.key === activeSub)
  const unusedKeyIds = Object.keys(keys).filter(kid => !currentPool.configs.some(r => r.key_id === kid))

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
              <input type="range" min={0.01} max={10} step={0.01} value={interval} onChange={e => setInterval_(Number(e.target.value))} className="flex-1" />
              <span className="text-[#c9a96e] font-bold text-sm w-16 text-right">{interval.toFixed(2)}s</span>
            </div>
          </div>
          <div className="flex-1">
            <label className="text-[#e8d5b7]/60 text-sm block mb-1">并发批大小</label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={100} step={1} value={batchSize} onChange={e => setBatchSize(Number(e.target.value))} className="flex-1" />
              <span className="text-[#c9a96e] font-bold text-sm w-16 text-right">{batchSize}</span>
            </div>
          </div>
          <button onClick={saveSettings} className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">
            {settingsSaved ? '已保存' : '保存设置'}
          </button>
        </div>
      </div>

      {/* tier tab */}
      <div className="flex gap-2 mb-3">
        {TIERS.map(tier => (
          <button key={tier} onClick={() => setActiveTier(tier)}
            className={`px-4 py-2 rounded font-bold text-sm ${activeTier === tier ? 'bg-[#c9a96e] text-[#1a1a2e]' : 'bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/30'}`}>
            {tier.toUpperCase()}
          </button>
        ))}
      </div>

      {/* sub tab */}
      <div className="flex gap-2 mb-4">
        {SUB_POOLS.map(sp => (
          <button key={sp.key} onClick={() => setActiveSub(sp.key)} title={sp.hint}
            className={`px-3 py-1.5 rounded text-sm ${activeSub === sp.key ? 'bg-[#c9a96e]/30 text-[#c9a96e] border border-[#c9a96e]/50' : 'bg-[#16213e] text-[#e8d5b7]/60 border border-[#c9a96e]/10'}`}>
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
            <button onClick={pasteRef.bind(null, activeTier, activeSub)} disabled={!_refClipboard}
              className="px-3 py-1 bg-[#16213e] text-[#e8d5b7] border border-[#c9a96e]/40 rounded text-sm hover:bg-[#1a1a2e] disabled:opacity-40"
              title={_refClipboard ? `剪贴板有引用配置` : '剪贴板为空'}>
              粘贴引用
            </button>
            <button onClick={testAll} disabled={testing}
              className="px-3 py-1 bg-[#c9a96e]/20 text-[#c9a96e] rounded text-sm hover:bg-[#c9a96e]/30 disabled:opacity-50"
              title="测试所有 tier/sub 出现过的所有 Key（每个 key 只测一次，结果同步到所有页面）">
              {testing ? '测试中...' : '测试所有'}
            </button>
            <button onClick={openAddModal} className="px-3 py-1 bg-[#c9a96e] text-[#1a1a2e] rounded text-sm font-bold">+ 添加</button>
          </div>
        </div>

        {testResult && (
          <div className="mb-4 p-2 rounded text-sm bg-[#1a1a2e] border border-[#c9a96e]/20 space-y-1">
            <div className="text-[#e8d5b7]/60 text-xs">
              测试结果（共 {testResult.count} 个 Key，结果已同步到所有 tier/sub 页面）：
            </div>
            {testResult.error && <div className="text-red-400">测试失败：{testResult.error}</div>}
            {testResult.results.map(r => {
              const k = keys[r.key_id] || {}
              const label = k.title || (k.api_key ? (k.api_key.slice(0, 12) + '...') : '(未配置)')
              const color = r.status === 'ok' ? 'text-green-400'
                : r.status === 'empty' ? 'text-gray-400'
                : r.status === 'rate_limited' ? 'text-yellow-400'
                : 'text-red-400'
              return (
                <div key={r.key_id} className={color}>
                  <span className="font-bold">{label}</span> · {k.model || '-'}：{r.message}
                </div>
              )
            })}
          </div>
        )}

        {currentPool.configs.length === 0 && (
          <div className="text-[#e8d5b7]/40 text-sm py-8 text-center">该池暂无 Key 引用，点"+ 添加"新建或引用一个</div>
        )}

        {currentPool.configs.map((ref, i) => {
          const kdef = keys[ref.key_id] || {}
          const status = currentStatuses[i]
          const refCount = countKeyRefs(ref.key_id)
          const copiedKey = `${currentSig}#${i}`
          return (
            <div key={`${ref.key_id}_${i}`}
              draggable onDragStart={() => setDragIndex(i)} onDragOver={e => e.preventDefault()}
              onDrop={() => { moveRef(activeTier, activeSub, dragIndex, i); setDragIndex(null) }}
              className={`flex gap-2 mb-2 items-end p-1 rounded ${dragIndex === i ? 'opacity-50' : ''} ${ref.disabled ? 'opacity-60' : ''}`}>
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
                    status?.status === 'circuit_open' ? 'bg-red-900/40 text-red-300' :
                    status?.status === 'circuit_half_open' ? 'bg-purple-900/40 text-purple-300 animate-pulse' :
                    'bg-gray-700/30 text-gray-400'}`}>
                    {status?.status_text || '未知'}
                  </span>
                  {status?.is_busy && !ref.disabled && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-cyan-900/30 text-cyan-300 flex items-center gap-1 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping"></span>占用中
                    </span>
                  )}
                  {status?.fail_count > 0 && (
                    <span className="px-2 py-0.5 rounded text-xs font-bold bg-orange-900/20 text-orange-300/80" title="连续失败次数（达 3 次触发熔断）">
                      失败 ×{status.fail_count}
                    </span>
                  )}
                </div>
              </div>
              {/* key 核心属性：只读预览（点"编辑"改全局属性，含 title） - 手机端隐藏 */}
              <div className="hidden sm:block flex-1 min-w-0">
                <label className="text-[#e8d5b7]/60 text-xs">标题 / API Key（只读 · 改属性点"编辑"）</label>
                <div className="bg-[#1a1a2e] text-[#e8d5b7]/80 border border-[#c9a96e]/20 rounded px-2 py-1 text-sm truncate">
                  {kdef.title && <span className="text-[#c9a96e] font-bold mr-1.5">{kdef.title}</span>}
                  <span className={kdef.title ? 'text-[#e8d5b7]/60' : ''}>{kdef.api_key || '(未配置)'}</span>
                  {refCount > 1 && <span className="text-[#c9a96e]/60 text-xs">🔗 共享 {refCount} 处</span>}
                </div>
              </div>
              <div className="hidden sm:block flex-1 min-w-0">
                <label className="text-[#e8d5b7]/60 text-xs">Model</label>
                <div className="bg-[#1a1a2e] text-[#e8d5b7]/80 border border-[#c9a96e]/20 rounded px-2 py-1 text-sm truncate">{kdef.model || '-'}</div>
              </div>
              {/* per-pool 配置：行内可改 - 手机端隐藏 */}
              <div className="hidden sm:block w-24">
                <label className="text-[#e8d5b7]/60 text-xs">最大输出</label>
                <input type="number" step="1" value={ref.max_tokens ?? defaultMaxTokens(activeTier)}
                  onChange={e => updateRefField(activeTier, activeSub, i, 'max_tokens', Number(e.target.value))}
                  onBlur={() => commitRefField(activeTier, activeSub)}
                  className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="hidden sm:block w-16">
                <label className="text-[#e8d5b7]/60 text-xs" title="SWRR 平滑加权轮询的权重，数值越大被选中概率越高">权重</label>
                <input type="number" step="1" min="1" value={ref.weight ?? 1}
                  onChange={e => updateRefField(activeTier, activeSub, i, 'weight', Math.max(1, Number(e.target.value) || 1))}
                  onBlur={() => commitRefField(activeTier, activeSub)}
                  className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm"
                  title="SWRR 权重：数值越大被选中概率越高（默认 1）" />
              </div>
              <button onClick={() => {
                // 直接计算新 configs 并传给 persistRefs，避免 commitRefField 读到 setTierKeys 之前的旧状态
                const newConfigs = currentPool.configs.map((r, j) => j === i ? { ...r, disabled: !ref.disabled } : r)
                setTierKeys(prev => ({
                  ...prev,
                  [activeTier]: { ...prev[activeTier], [activeSub]: { ...prev[activeTier][activeSub], configs: newConfigs } }
                }))
                persistRefs(activeTier, activeSub, newConfigs, currentPool.active_index || 0)
              }}
                className={`px-2 py-1 rounded text-xs font-bold ${ref.disabled ? 'bg-blue-900/40 text-blue-400' : 'bg-gray-700/40 text-gray-300'}`}
                title={ref.disabled ? '点击启用' : '点击禁用（仅此池，不影响其它池）'}>
                {ref.disabled ? '已禁用' : '启用中'}
              </button>
              {/* 复制引用配置（key_id+max_tokens+disabled）到剪贴板，可粘贴到任意 pool */}
              <button onClick={() => copyRef(activeTier, activeSub, i)}
                className={`px-2 py-1 rounded text-xs font-bold ${copiedSig === copiedKey ? 'bg-green-900/40 text-green-400' : 'bg-[#c9a96e]/20 text-[#c9a96e] hover:bg-[#c9a96e]/30'}`}
                title="复制引用配置（key+max_tokens），可粘贴到任意 tier/sub">
                {copiedSig === copiedKey ? '已复制' : '复制'}
              </button>
              {/* 编辑全局 key 属性（改一处全处生效） */}
              <button onClick={() => openEditModal(ref.key_id)}
                className="px-2 py-1 rounded text-xs font-bold bg-[#c9a96e]/20 text-[#c9a96e] hover:bg-[#c9a96e]/30"
                title="编辑此 Key 的全局属性（api_key/base_url/model/价格），改动会同步到所有引用处">
                编辑
              </button>
              <button onClick={() => setConfirmDelete({ tier: activeTier, sub: activeSub, idx: i })}
                className="text-red-400 text-sm px-2 py-1 hover:bg-red-900/20 rounded" title="移除此池对该 key 的引用（不删除全局 key）">删除引用</button>
            </div>
          )
        })}
      </div>

      {/* 编辑 key 全局属性弹窗 */}
      {editModal.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4" onClick={() => setEditModal(m => ({ ...m, open: false }))}>
          <div className="bg-[#16213e] rounded-none sm:rounded-md p-6 border border-[#c9a96e]/30 w-full max-w-[480px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-[#c9a96e] font-bold mb-1">编辑 Key 全局属性</h3>
            <p className="text-[#e8d5b7]/60 text-xs mb-4">
              改动将同步到所有引用此 Key 的池（当前共享 {editModal.refCount} 处）。
              API Key 字段显示为脱敏值，仅在输入新值时才更新。
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[#e8d5b7]/60 text-xs block mb-1">标题（自定义名称，方便区分 Key）</label>
                <input value={editModal.form.title} onChange={e => setEditModal(m => ({ ...m, form: { ...m.form, title: e.target.value } }))}
                  placeholder="例如：主账号 / 备用 / 客户A" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="text-[#e8d5b7]/60 text-xs block mb-1">API Key</label>
                <input value={editModal.form.api_key} onChange={e => setEditModal(m => ({ ...m, form: { ...m.form, api_key: e.target.value } }))}
                  placeholder="留空或保持脱敏值则不修改" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="text-[#e8d5b7]/60 text-xs block mb-1">Base URL</label>
                <input value={editModal.form.base_url} onChange={e => setEditModal(m => ({ ...m, form: { ...m.form, base_url: e.target.value } }))}
                  className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div>
                <label className="text-[#e8d5b7]/60 text-xs block mb-1">Model</label>
                <input value={editModal.form.model} onChange={e => setEditModal(m => ({ ...m, form: { ...m.form, model: e.target.value } }))}
                  className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="text-[#e8d5b7]/60 text-xs block mb-1">输入价格/$1M</label>
                  <input type="number" step="0.01" value={editModal.form.input_price_per_million}
                    onChange={e => setEditModal(m => ({ ...m, form: { ...m.form, input_price_per_million: Number(e.target.value) } }))}
                    className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
                </div>
                <div className="flex-1">
                  <label className="text-[#e8d5b7]/60 text-xs block mb-1">输出价格/$1M</label>
                  <input type="number" step="0.01" value={editModal.form.output_price_per_million}
                    onChange={e => setEditModal(m => ({ ...m, form: { ...m.form, output_price_per_million: Number(e.target.value) } }))}
                    className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setEditModal(m => ({ ...m, open: false }))} className="px-4 py-2 text-[#e8d5b7]/60 text-sm">取消</button>
              <button onClick={saveEditModal} disabled={editModal.saving}
                className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm disabled:opacity-50">
                {editModal.saving ? '保存中...' : '保存（同步到所有引用处）'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 添加 key 弹窗 */}
      {addModal.open && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4" onClick={() => setAddModal(m => ({ ...m, open: false }))}>
          <div className="bg-[#16213e] rounded-none sm:rounded-md p-6 border border-[#c9a96e]/30 w-full max-w-[480px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-[#c9a96e] font-bold mb-4">添加 Key 到 {activeTier}/{activeSub}</h3>
            {addModal.mode === 'choose' && (
              <div className="space-y-2">
                <button onClick={() => setAddModal(m => ({ ...m, mode: 'new' }))}
                  className="w-full text-left px-4 py-3 bg-[#1a1a2e] border border-[#c9a96e]/20 rounded hover:border-[#c9a96e]/50">
                  <div className="text-[#c9a96e] font-bold text-sm">新建 Key</div>
                  <div className="text-[#e8d5b7]/50 text-xs">创建一个全局新 Key 并引用到此池</div>
                </button>
                <button onClick={() => setAddModal(m => ({ ...m, mode: 'existing' }))} disabled={unusedKeyIds.length === 0}
                  className="w-full text-left px-4 py-3 bg-[#1a1a2e] border border-[#c9a96e]/20 rounded hover:border-[#c9a96e]/50 disabled:opacity-40">
                  <div className="text-[#c9a96e] font-bold text-sm">引用已有 Key</div>
                  <div className="text-[#e8d5b7]/50 text-xs">{unusedKeyIds.length > 0 ? `从 ${unusedKeyIds.length} 个未引用的 Key 中选择` : '所有 Key 已被此池引用'}</div>
                </button>
              </div>
            )}
            {addModal.mode === 'new' && (
              <div className="space-y-3">
                <div>
                  <label className="text-[#e8d5b7]/60 text-xs block mb-1">标题（自定义名称，方便区分 Key）</label>
                  <input value={addModal.newForm.title} onChange={e => setAddModal(m => ({ ...m, newForm: { ...m.newForm, title: e.target.value } }))}
                    placeholder="例如：主账号 / 备用 / 客户A" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-[#e8d5b7]/60 text-xs block mb-1">API Key</label>
                  <input value={addModal.newForm.api_key} onChange={e => setAddModal(m => ({ ...m, newForm: { ...m.newForm, api_key: e.target.value } }))}
                    placeholder="sk-..." className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-[#e8d5b7]/60 text-xs block mb-1">Base URL</label>
                  <input value={addModal.newForm.base_url} onChange={e => setAddModal(m => ({ ...m, newForm: { ...m.newForm, base_url: e.target.value } }))}
                    placeholder="https://api.openai.com/v1" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
                </div>
                <div>
                  <label className="text-[#e8d5b7]/60 text-xs block mb-1">Model</label>
                  <input value={addModal.newForm.model} onChange={e => setAddModal(m => ({ ...m, newForm: { ...m.newForm, model: e.target.value } }))}
                    placeholder="gpt-4o-mini" className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="text-[#e8d5b7]/60 text-xs block mb-1">输入价格/$1M</label>
                    <input type="number" step="0.01" value={addModal.newForm.input_price_per_million}
                      onChange={e => setAddModal(m => ({ ...m, newForm: { ...m.newForm, input_price_per_million: Number(e.target.value) } }))}
                      className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
                  </div>
                  <div className="flex-1">
                    <label className="text-[#e8d5b7]/60 text-xs block mb-1">输出价格/$1M</label>
                    <input type="number" step="0.01" value={addModal.newForm.output_price_per_million}
                      onChange={e => setAddModal(m => ({ ...m, newForm: { ...m.newForm, output_price_per_million: Number(e.target.value) } }))}
                      className="w-full bg-[#1a1a2e] text-[#e8d5b7] border border-[#c9a96e]/20 rounded px-2 py-1 text-sm" />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setAddModal(m => ({ ...m, mode: 'choose' }))} className="px-4 py-2 text-[#e8d5b7]/60 text-sm">返回</button>
                  <button onClick={createNewKeyAndAdd} className="px-4 py-2 bg-[#c9a96e] text-[#1a1a2e] rounded font-bold text-sm">创建并添加</button>
                </div>
              </div>
            )}
            {addModal.mode === 'existing' && (
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {unusedKeyIds.map(kid => {
                  const k = keys[kid]
                  return (
                    <button key={kid} onClick={() => addExistingKey(kid)}
                      className="w-full text-left px-3 py-2 bg-[#1a1a2e] border border-[#c9a96e]/20 rounded hover:border-[#c9a96e]/50">
                      {k.title && <div className="text-[#c9a96e] font-bold text-sm">{k.title}</div>}
                      <div className="text-[#e8d5b7] text-sm font-mono">{k.api_key}</div>
                      <div className="text-[#e8d5b7]/50 text-xs">{k.model} · {k.base_url || '(默认 base_url)'}</div>
                    </button>
                  )
                })}
                <button onClick={() => setAddModal(m => ({ ...m, mode: 'choose' }))} className="px-4 py-2 text-[#e8d5b7]/60 text-sm">返回</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 删除引用确认弹窗 */}
      {confirmDelete && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-0 sm:p-4" onClick={() => setConfirmDelete(null)}>
          <div className="bg-[#16213e] rounded-none sm:rounded-md p-6 border border-red-500/40 w-full max-w-[420px]" onClick={e => e.stopPropagation()}>
            <h3 className="text-red-400 font-bold mb-2">确认删除引用</h3>
            <p className="text-[#e8d5b7]/80 text-sm mb-1">确定要移除此池对该 Key 的引用吗？</p>
            <p className="text-[#e8d5b7]/50 text-xs mb-5">此操作只移除当前池的引用，不会删除全局 Key 定义。可随时重新添加。</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-4 py-2 text-[#e8d5b7]/60 text-sm hover:text-[#e8d5b7]">取消</button>
              <button onClick={() => { removeRef(confirmDelete.tier, confirmDelete.sub, confirmDelete.idx); setConfirmDelete(null) }}
                className="px-4 py-2 bg-red-500 text-white rounded font-bold text-sm hover:bg-red-600">删除引用</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
