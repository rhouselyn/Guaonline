import { useState, useEffect, useMemo } from 'react'
import { adminApi } from '../../utils/adminApi'
import { RefreshCw, Search, ChevronLeft, ChevronRight, Trash2, Eye, X } from 'lucide-react'

// 从 InputStep 的 LANGUAGES 列表中提取语言
const LANGUAGES = [
  { value: 'en', native: 'English', en: 'English' },
  { value: 'fr', native: 'Français', en: 'French' },
  { value: 'pt', native: 'Português', en: 'Portuguese' },
  { value: 'de', native: 'Deutsch', en: 'German' },
  { value: 'ru', native: 'Русский', en: 'Russian' },
  { value: 'es', native: 'Español', en: 'Spanish' },
  { value: 'it', native: 'Italiano', en: 'Italian' },
  { value: 'ja', native: '日本語', en: 'Japanese' },
  { value: 'ko', native: '한국어', en: 'Korean' },
  { value: 'zh', native: '简体中文', en: 'Chinese (Simplified)' },
  { value: 'zh-TW', native: '繁體中文', en: 'Chinese (Traditional)' },
  { value: 'ar', native: 'العربية', en: 'Arabic' },
  { value: 'hi', native: 'हिन्दी', en: 'Hindi' },
  { value: 'nl', native: 'Nederlands', en: 'Dutch' },
  { value: 'sv', native: 'Svenska', en: 'Swedish' },
  { value: 'pl', native: 'Polski', en: 'Polish' },
  { value: 'tr', native: 'Türkçe', en: 'Turkish' },
  { value: 'uk', native: 'Українська', en: 'Ukrainian' },
  { value: 'vi', native: 'Tiếng Việt', en: 'Vietnamese' },
  { value: 'th', native: 'ไทย', en: 'Thai' },
  { value: 'cs', native: 'Čeština', en: 'Czech' },
  { value: 'da', native: 'Dansk', en: 'Danish' },
  { value: 'el', native: 'Ελληνικά', en: 'Greek' },
  { value: 'fi', native: 'Suomi', en: 'Finnish' },
  { value: 'he', native: 'עברית', en: 'Hebrew' },
  { value: 'hu', native: 'Magyar', en: 'Hungarian' },
  { value: 'id', native: 'Bahasa Indonesia', en: 'Indonesian' },
  { value: 'ms', native: 'Bahasa Melayu', en: 'Malay' },
  { value: 'no', native: 'Norsk', en: 'Norwegian' },
  { value: 'ro', native: 'Română', en: 'Romanian' },
  { value: 'sk', native: 'Slovenčina', en: 'Slovak' },
  { value: 'bg', native: 'Български', en: 'Bulgarian' },
  { value: 'hr', native: 'Hrvatski', en: 'Croatian' },
  { value: 'lt', native: 'Lietuvių', en: 'Lithuanian' },
  { value: 'lv', native: 'Latviešu', en: 'Latvian' },
  { value: 'sr', native: 'Српски', en: 'Serbian' },
  { value: 'sl', native: 'Slovenščina', en: 'Slovenian' },
  { value: 'fa', native: 'فارسی', en: 'Persian' },
  { value: 'bn', native: 'বাংলা', en: 'Bengali' },
  { value: 'ta', native: 'தமிழ்', en: 'Tamil' },
  { value: 'yue', native: '粵語', en: 'Cantonese' },
]

const LANG_MAP = Object.fromEntries(LANGUAGES.map(l => [l.value, l]))

function getLangLabel(code) {
  return LANG_MAP[code]?.native || LANG_MAP[code]?.en || code?.toUpperCase() || '?'
}

function getLangShort(code) {
  if (code === 'zh-TW') return '繁'
  return code?.substring(0, 2).toUpperCase() || '?'
}

// 热力图组件 - 使用全部语言列表作为行列
function Heatmap({ pairs, onCellClick }) {
  const [hovered, setHovered] = useState(null)

  // 使用全部语言列表作为行列
  const allLangs = useMemo(() => LANGUAGES.map(l => l.value), [])
  const sourceLangs = allLangs
  const targetLangs = allLangs

  // 构建查找表
  const pairMap = useMemo(() => {
    const m = {}
    for (const p of pairs) {
      m[`${p.source_lang}-${p.target_lang}`] = p.cnt
    }
    return m
  }, [pairs])

  const maxCnt = useMemo(() => Math.max(...pairs.map(p => p.cnt), 1), [pairs])

  if (pairs.length === 0) {
    return <div className="text-[#e8d5b7]/30 text-sm text-center py-4">暂无语言对数据</div>
  }

  const cellSize = 22
  const labelW = 50
  const labelH = 60
  const w = labelW + targetLangs.length * cellSize
  const h = labelH + sourceLangs.length * cellSize

  return (
    <div className="overflow-auto max-h-[600px]">
      <svg width={w} height={h} className="select-none">
        {/* 列标题（target_lang） */}
        {targetLangs.map((tl, i) => (
          <text key={tl} x={labelW + i * cellSize + cellSize / 2} y={labelH - 6}
            textAnchor="start" fill="rgba(201,169,110,0.5)" fontSize="8"
            transform={`rotate(-90, ${labelW + i * cellSize + cellSize / 2}, ${labelH - 6})`}>
            {getLangShort(tl)}
          </text>
        ))}
        {/* 行标题（source_lang）+ 单元格 */}
        {sourceLangs.map((sl, ri) => (
          <g key={sl}>
            <text x={labelW - 4} y={labelH + ri * cellSize + cellSize / 2 + 3}
              textAnchor="end" fill="rgba(201,169,110,0.5)" fontSize="8">
              {getLangShort(sl)}
            </text>
            {targetLangs.map((tl, ci) => {
              const cnt = pairMap[`${sl}-${tl}`] || 0
              const intensity = cnt / maxCnt
              const key = `${sl}-${tl}`
              return (
                <g key={key}
                  onMouseEnter={() => cnt > 0 && setHovered({ sl, tl, cnt, x: labelW + ci * cellSize, y: labelH + ri * cellSize })}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => cnt > 0 && onCellClick(sl, tl)}
                  style={{ cursor: cnt > 0 ? 'pointer' : 'default' }}>
                  <rect
                    x={labelW + ci * cellSize + 1} y={labelH + ri * cellSize + 1}
                    width={cellSize - 2} height={cellSize - 2}
                    rx={2}
                    fill={cnt > 0 ? `rgba(201,169,110,${0.15 + intensity * 0.85})` : 'rgba(201,169,110,0.03)'}
                  />
                  {cnt > 0 && (
                    <text x={labelW + ci * cellSize + cellSize / 2} y={labelH + ri * cellSize + cellSize / 2 + 3}
                      textAnchor="middle" fill={intensity > 0.5 ? '#1a1a2e' : 'rgba(232,213,183,0.8)'} fontSize="7">
                      {cnt >= 1000 ? `${(cnt / 1000).toFixed(1)}k` : cnt}
                    </text>
                  )}
                </g>
              )
            })}
          </g>
        ))}
      </svg>
      {/* Tooltip */}
      {hovered && (
        <div className="absolute pointer-events-none bg-[#1a1a2e] border border-[#c9a96e]/30 rounded px-2 py-1 text-xs z-10"
          style={{ left: hovered.x + 30, top: hovered.y + 30 }}>
          <div className="text-[#c9a96e] font-bold">{getLangLabel(hovered.sl)} → {getLangLabel(hovered.tl)}</div>
          <div className="text-[#e8d5b7]/70">{hovered.cnt} 条词条</div>
        </div>
      )}
    </div>
  )
}

export default function AdminGlobalVocab() {
  const [stats, setStats] = useState(null)
  const [words, setWords] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sourceLang, setSourceLang] = useState('')
  const [targetLang, setTargetLang] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailWord, setDetailWord] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refreshing, setRefreshing] = useState({})
  const pageSize = 50

  const loadStats = () => adminApi.getGlobalVocabStats().then(setStats).catch(() => {})

  useEffect(() => { loadStats() }, [])

  useEffect(() => {
    setLoading(true)
    adminApi.getGlobalVocabList({
      source_lang: sourceLang || undefined,
      target_lang: targetLang || undefined,
      search: search || undefined,
      page, page_size: pageSize
    }).then(data => {
      setWords(data.words || [])
      setTotal(data.total || 0)
    }).finally(() => setLoading(false))
  }, [sourceLang, targetLang, search, page])

  const handleRefresh = async (wordId) => {
    setRefreshing(prev => ({ ...prev, [wordId]: true }))
    try {
      await adminApi.refreshGlobalVocab(wordId)
      adminApi.getGlobalVocabList({
        source_lang: sourceLang || undefined, target_lang: targetLang || undefined,
        search: search || undefined, page, page_size: pageSize
      }).then(data => { setWords(data.words || []); setTotal(data.total || 0) })
      loadStats()
      if (detailWord?.id === wordId) {
        adminApi.getGlobalVocabDetail(wordId).then(setDetailWord)
      }
    } catch (err) {
      alert('刷新失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setRefreshing(prev => ({ ...prev, [wordId]: false }))
    }
  }

  const handleDelete = async (wordId, word) => {
    if (!confirm(`确定删除词条 "${word}" 吗？`)) return
    try {
      await adminApi.deleteGlobalVocab(wordId)
      setWords(prev => prev.filter(w => w.id !== wordId))
      setTotal(prev => prev - 1)
      if (detailWord?.id === wordId) setDetailWord(null)
      loadStats()
    } catch (err) {
      alert('删除失败: ' + (err.response?.data?.detail || err.message))
    }
  }

  const handleViewDetail = async (wordId) => {
    setDetailLoading(true)
    try {
      const data = await adminApi.getGlobalVocabDetail(wordId)
      setDetailWord(data)
    } catch (err) {
      alert('加载失败: ' + (err.response?.data?.detail || err.message))
    } finally {
      setDetailLoading(false)
    }
  }

  const handleHeatmapClick = (sl, tl) => {
    setSourceLang(sl)
    setTargetLang(tl)
    setPage(1)
  }

  const totalPages = Math.ceil(total / pageSize)

  return (
    <div>
      <h2 className="text-[#c9a96e] font-bold text-xl mb-4">全局词汇管理</h2>

      {/* 统计卡片 */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <div className="bg-[#16213e] rounded-lg p-3 border border-[#c9a96e]/10">
            <div className="text-[#e8d5b7]/50 text-xs">总词条数</div>
            <div className="text-[#c9a96e] font-bold text-lg">{stats.total}</div>
          </div>
          <div className="bg-[#16213e] rounded-lg p-3 border border-[#c9a96e]/10">
            <div className="text-[#e8d5b7]/50 text-xs">学习语言数</div>
            <div className="text-[#c9a96e] font-bold text-lg">{stats.by_lang?.length || 0}</div>
          </div>
          <div className="bg-[#16213e] rounded-lg p-3 border border-[#c9a96e]/10">
            <div className="text-[#e8d5b7]/50 text-xs">语言对数</div>
            <div className="text-[#c9a96e] font-bold text-lg">{stats.pairs?.length || 0}</div>
          </div>
          {stats.by_lang?.slice(0, 1).map(item => (
            <div key={item.source_lang} className="bg-[#16213e] rounded-lg p-3 border border-[#c9a96e]/10">
              <div className="text-[#e8d5b7]/50 text-xs">最多: {getLangLabel(item.source_lang)}</div>
              <div className="text-[#c9a96e] font-bold text-lg">{item.cnt}</div>
            </div>
          ))}
        </div>
      )}

      {/* 语言对热力图 */}
      <div className="bg-[#16213e] rounded-lg p-4 border border-[#c9a96e]/10 mb-6">
        <h3 className="text-[#c9a96e] font-bold mb-3">语言对热力图</h3>
        <p className="text-[#e8d5b7]/30 text-xs mb-2">行=学习语言(source)，列=母语(target)，颜色越深词条越多，点击可筛选</p>
        <div className="relative">
          <Heatmap pairs={stats?.pairs || []} onCellClick={handleHeatmapClick} />
        </div>
      </div>

      {/* 筛选 */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#e8d5b7]/30" />
          <input
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
            placeholder="搜索单词或释义..."
            className="w-full pl-9 pr-3 py-2 bg-[#16213e] border border-[#c9a96e]/20 rounded text-[#e8d5b7] text-sm placeholder-[#e8d5b7]/30 focus:outline-none focus:border-[#c9a96e]/50"
          />
        </div>
        <select
          value={sourceLang}
          onChange={e => { setSourceLang(e.target.value); setPage(1) }}
          className="px-3 py-2 bg-[#16213e] border border-[#c9a96e]/20 rounded text-[#e8d5b7] text-sm focus:outline-none focus:border-[#c9a96e]/50"
        >
          <option value="">全部学习语言</option>
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.native} ({l.en})</option>
          ))}
        </select>
        <select
          value={targetLang}
          onChange={e => { setTargetLang(e.target.value); setPage(1) }}
          className="px-3 py-2 bg-[#16213e] border border-[#c9a96e]/20 rounded text-[#e8d5b7] text-sm focus:outline-none focus:border-[#c9a96e]/50"
        >
          <option value="">全部母语</option>
          {LANGUAGES.map(l => (
            <option key={l.value} value={l.value}>{l.native} ({l.en})</option>
          ))}
        </select>
        {(sourceLang || targetLang) && (
          <button onClick={() => { setSourceLang(''); setTargetLang(''); setPage(1) }}
            className="px-3 py-2 text-[#e8d5b7]/50 hover:text-[#c9a96e] text-sm">
            清除筛选
          </button>
        )}
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-[#e8d5b7]/50 text-center py-8">加载中...</div>
      ) : words.length === 0 ? (
        <div className="text-[#e8d5b7]/50 text-center py-8">
          {stats?.total === 0 ? '全局词汇库为空，用户学习后词条会自动积累' : '当前筛选条件下没有词条'}
        </div>
      ) : (
        <div className="bg-[#16213e] rounded-lg border border-[#c9a96e]/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#c9a96e]/10">
                <th className="text-left px-3 py-2 text-[#e8d5b7]/50 font-normal">单词</th>
                <th className="text-left px-3 py-2 text-[#e8d5b7]/50 font-normal">学习语言</th>
                <th className="text-left px-3 py-2 text-[#e8d5b7]/50 font-normal">母语</th>
                <th className="text-left px-3 py-2 text-[#e8d5b7]/50 font-normal">释义</th>
                <th className="text-left px-3 py-2 text-[#e8d5b7]/50 font-normal">命中</th>
                <th className="text-right px-3 py-2 text-[#e8d5b7]/50 font-normal">操作</th>
              </tr>
            </thead>
            <tbody>
              {words.map(w => (
                <tr key={w.id} className="border-b border-[#c9a96e]/5 hover:bg-[#c9a96e]/5">
                  <td className="px-3 py-2 text-[#e8d5b7] font-medium">{w.word}</td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 bg-[#c9a96e]/10 text-[#c9a96e] rounded text-xs">{getLangShort(w.source_lang)}</span>
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 bg-[#e8d5b7]/5 text-[#e8d5b7]/60 rounded text-xs">{getLangShort(w.target_lang)}</span>
                  </td>
                  <td className="px-3 py-2 text-[#e8d5b7]/70 max-w-[300px] truncate">{w.enriched_meaning || w.meaning || '-'}</td>
                  <td className="px-3 py-2 text-[#e8d5b7]/50">{w.hit_count}</td>
                  <td className="px-3 py-2 text-right">
                    <div className="inline-flex gap-1">
                      <button onClick={() => handleViewDetail(w.id)} className="p-1.5 text-[#e8d5b7]/50 hover:text-[#c9a96e] rounded transition-colors" title="查看详情">
                        <Eye className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleRefresh(w.id)} disabled={refreshing[w.id]} className="p-1.5 text-[#e8d5b7]/50 hover:text-[#c9a96e] rounded transition-colors disabled:opacity-50" title="刷新">
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshing[w.id] ? 'animate-spin' : ''}`} />
                      </button>
                      <button onClick={() => handleDelete(w.id, w.word)} className="p-1.5 text-[#e8d5b7]/50 hover:text-red-400 rounded transition-colors" title="删除">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 分页 */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="p-1.5 text-[#e8d5b7]/50 hover:text-[#c9a96e] disabled:opacity-30">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-[#e8d5b7]/50 text-sm">{page} / {totalPages}</span>
          <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="p-1.5 text-[#e8d5b7]/50 hover:text-[#c9a96e] disabled:opacity-30">
            <ChevronRight className="w-4 h-4" />
          </button>
          <span className="text-[#e8d5b7]/30 text-xs ml-2">共 {total} 条</span>
        </div>
      )}

      {/* 详情弹窗 */}
      {detailWord && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setDetailWord(null)}>
          <div className="bg-[#1a1a2e] border border-[#c9a96e]/20 rounded-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <h3 className="text-[#c9a96e] font-bold text-lg">{detailWord.word}</h3>
                <span className="px-1.5 py-0.5 bg-[#c9a96e]/10 text-[#c9a96e] rounded text-xs">{getLangLabel(detailWord.source_lang)} → {getLangLabel(detailWord.target_lang)}</span>
                <span className="text-[#e8d5b7]/30 text-xs">命中 {detailWord.hit_count}</span>
              </div>
              <div className="flex gap-2">
                <button onClick={() => handleRefresh(detailWord.id)} disabled={refreshing[detailWord.id]} className="p-1.5 text-[#e8d5b7]/50 hover:text-[#c9a96e] rounded transition-colors disabled:opacity-50" title="刷新">
                  <RefreshCw className={`w-4 h-4 ${refreshing[detailWord.id] ? 'animate-spin' : ''}`} />
                </button>
                <button onClick={() => setDetailWord(null)} className="p-1.5 text-[#e8d5b7]/50 hover:text-[#e8d5b7] rounded transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {detailLoading ? (
              <div className="text-[#e8d5b7]/50 text-center py-4">加载中...</div>
            ) : (
              <div className="space-y-3 text-sm">
                {detailWord.enriched_meaning && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">详细释义</div>
                    <div className="text-[#e8d5b7]">{detailWord.enriched_meaning}</div>
                  </div>
                )}
                {detailWord.morphology && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">词性/形态</div>
                    <div className="text-[#e8d5b7]">{detailWord.morphology}</div>
                  </div>
                )}
                {detailWord.phonetic && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">音标</div>
                    <div className="text-[#e8d5b7]">{detailWord.phonetic}</div>
                  </div>
                )}
                {detailWord.memory_hint && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">记忆提示</div>
                    <div className="text-[#e8d5b7]">{detailWord.memory_hint}</div>
                  </div>
                )}
                {detailWord.examples?.length > 0 && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">例句</div>
                    <div className="space-y-1">
                      {detailWord.examples.map((ex, i) => (
                        <div key={i} className="text-[#e8d5b7] pl-3 border-l-2 border-[#c9a96e]/20">
                          <div>{ex.sentence || ex}</div>
                          {ex.translation && <div className="text-[#e8d5b7]/50 text-xs">{ex.translation}</div>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detailWord.variants_detail?.length > 0 && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">变形</div>
                    <div className="space-y-1">
                      {detailWord.variants_detail.map((v, i) => (
                        <div key={i} className="text-[#e8d5b7] pl-3 border-l-2 border-[#c9a96e]/10">
                          <span className="font-medium">{v.form || v.variant}</span>
                          {v.explanation && <span className="text-[#e8d5b7]/50 ml-2">- {v.explanation}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detailWord.multiple_choice && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">选择题</div>
                    <div className="text-[#e8d5b7]">{detailWord.multiple_choice.question}</div>
                    <div className="mt-1 space-y-0.5">
                      {(detailWord.multiple_choice.options || []).map((opt, i) => (
                        <div key={i} className={`pl-3 ${i === detailWord.multiple_choice.correct_index ? 'text-green-400' : 'text-[#e8d5b7]/50'}`}>
                          {String.fromCharCode(65 + i)}. {opt}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="text-[#e8d5b7]/30 text-xs pt-2 border-t border-[#c9a96e]/10">
                  ID: {detailWord.id} | 创建: {detailWord.created_at}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
