import { useState, useEffect } from 'react'
import { adminApi } from '../../utils/adminApi'
import { RefreshCw, Search, ChevronLeft, ChevronRight, Trash2, Eye, X } from 'lucide-react'

const LANG_LABELS = {
  en: 'English', ja: '日本語', fr: 'Français', de: 'Deutsch', es: 'Español',
  ko: '한국어', pt: 'Português', ru: 'Русский', it: 'Italiano', zh: '中文',
  ar: 'العربية', hi: 'हिन्दी', nl: 'Nederlands', sv: 'Svenska', pl: 'Polski',
  tr: 'Türkçe', uk: 'Українська', vi: 'Tiếng Việt', th: 'ไทย', cs: 'Čeština',
}

function getLangLabel(code) {
  return LANG_LABELS[code] || code?.toUpperCase() || '?'
}

export default function AdminGlobalVocab() {
  const [stats, setStats] = useState(null)
  const [words, setWords] = useState([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [sourceLang, setSourceLang] = useState('')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [detailWord, setDetailWord] = useState(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [refreshing, setRefreshing] = useState({})
  const pageSize = 50

  useEffect(() => {
    adminApi.getGlobalVocabStats().then(setStats).catch(() => {})
  }, [])

  useEffect(() => {
    setLoading(true)
    adminApi.getGlobalVocabList({ source_lang: sourceLang || undefined, search: search || undefined, page, page_size: pageSize })
      .then(data => {
        setWords(data.words || [])
        setTotal(data.total || 0)
      })
      .finally(() => setLoading(false))
  }, [sourceLang, search, page])

  const handleRefresh = async (wordId) => {
    setRefreshing(prev => ({ ...prev, [wordId]: true }))
    try {
      await adminApi.refreshGlobalVocab(wordId)
      // 刷新后重新加载列表
      adminApi.getGlobalVocabList({ source_lang: sourceLang || undefined, search: search || undefined, page, page_size: pageSize })
        .then(data => { setWords(data.words || []); setTotal(data.total || 0) })
      adminApi.getGlobalVocabStats().then(setStats)
      // 如果详情打开，也刷新
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
      adminApi.getGlobalVocabStats().then(setStats)
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
            <div className="text-[#e8d5b7]/50 text-xs">语言数</div>
            <div className="text-[#c9a96e] font-bold text-lg">{stats.by_lang?.length || 0}</div>
          </div>
          {stats.by_lang?.slice(0, 2).map(item => (
            <div key={item.source_lang} className="bg-[#16213e] rounded-lg p-3 border border-[#c9a96e]/10">
              <div className="text-[#e8d5b7]/50 text-xs">{getLangLabel(item.source_lang)}</div>
              <div className="text-[#c9a96e] font-bold text-lg">{item.cnt}</div>
            </div>
          ))}
        </div>
      )}

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
          <option value="">全部语言</option>
          {stats?.by_lang?.map(item => (
            <option key={item.source_lang} value={item.source_lang}>
              {getLangLabel(item.source_lang)} ({item.cnt})
            </option>
          ))}
        </select>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="text-[#e8d5b7]/50 text-center py-8">加载中...</div>
      ) : words.length === 0 ? (
        <div className="text-[#e8d5b7]/50 text-center py-8">暂无词条</div>
      ) : (
        <div className="bg-[#16213e] rounded-lg border border-[#c9a96e]/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[#c9a96e]/10">
                <th className="text-left px-3 py-2 text-[#e8d5b7]/50 font-normal">单词</th>
                <th className="text-left px-3 py-2 text-[#e8d5b7]/50 font-normal">语言</th>
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
                    <span className="px-1.5 py-0.5 bg-[#c9a96e]/10 text-[#c9a96e] rounded text-xs">{getLangLabel(w.source_lang)}</span>
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
                <span className="px-1.5 py-0.5 bg-[#c9a96e]/10 text-[#c9a96e] rounded text-xs">{getLangLabel(detailWord.source_lang)}</span>
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
