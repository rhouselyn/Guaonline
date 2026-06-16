import { useState, useEffect, useMemo } from 'react'
import { adminApi } from '../../utils/adminApi'
import { RefreshCw, Search, ChevronLeft, ChevronRight, Trash2, Eye, X } from 'lucide-react'

// 与 InputStep.jsx 完全同步的语言列表
const LANGUAGES = [
  { value: 'en', native: 'English', en: 'English' },
  { value: 'fr', native: 'Français', en: 'French' },
  { value: 'pt', native: 'Português', en: 'Portuguese' },
  { value: 'de', native: 'Deutsch', en: 'German' },
  { value: 'ro', native: 'Română', en: 'Romanian' },
  { value: 'sv', native: 'Svenska', en: 'Swedish' },
  { value: 'da', native: 'Dansk', en: 'Danish' },
  { value: 'bg', native: 'Български', en: 'Bulgarian' },
  { value: 'ru', native: 'Русский', en: 'Russian' },
  { value: 'cs', native: 'Čeština', en: 'Czech' },
  { value: 'el', native: 'Ελληνικά', en: 'Greek' },
  { value: 'uk', native: 'Українська', en: 'Ukrainian' },
  { value: 'es', native: 'Español', en: 'Spanish' },
  { value: 'nl', native: 'Nederlands', en: 'Dutch' },
  { value: 'sk', native: 'Slovenčina', en: 'Slovak' },
  { value: 'hr', native: 'Hrvatski', en: 'Croatian' },
  { value: 'pl', native: 'Polski', en: 'Polish' },
  { value: 'lt', native: 'Lietuvių', en: 'Lithuanian' },
  { value: 'nb', native: 'Norsk Bokmål', en: 'Norwegian Bokmål' },
  { value: 'nn', native: 'Norsk Nynorsk', en: 'Norwegian Nynorsk' },
  { value: 'fa', native: 'فارسی', en: 'Persian' },
  { value: 'sl', native: 'Slovenščina', en: 'Slovenian' },
  { value: 'gu', native: 'ગુજરાતી', en: 'Gujarati' },
  { value: 'lv', native: 'Latviešu', en: 'Latvian' },
  { value: 'it', native: 'Italiano', en: 'Italian' },
  { value: 'oc', native: 'Occitan', en: 'Occitan' },
  { value: 'ne', native: 'नेपाली', en: 'Nepali' },
  { value: 'mr', native: 'मराठी', en: 'Marathi' },
  { value: 'be', native: 'Беларуская', en: 'Belarusian' },
  { value: 'sr', native: 'Српски', en: 'Serbian' },
  { value: 'lb', native: 'Lëtzebuergesch', en: 'Luxembourgish' },
  { value: 'vec', native: 'Vèneto', en: 'Venetian' },
  { value: 'as', native: 'অসমীয়া', en: 'Assamese' },
  { value: 'cy', native: 'Cymraeg', en: 'Welsh' },
  { value: 'szl', native: 'Ślōnski', en: 'Silesian' },
  { value: 'ast', native: 'Asturianu', en: 'Asturian' },
  { value: 'hne', native: 'छत्तीसगढ़ी', en: 'Chhattisgarhi' },
  { value: 'awa', native: 'अवधी', en: 'Awadhi' },
  { value: 'mai', native: 'मैथिली', en: 'Maithili' },
  { value: 'bho', native: 'भोजपुरी', en: 'Bhojpuri' },
  { value: 'sd', native: 'سنڌي', en: 'Sindhi' },
  { value: 'ga', native: 'Gaeilge', en: 'Irish' },
  { value: 'fo', native: 'Føroyskt', en: 'Faroese' },
  { value: 'hi', native: 'हिन्दी', en: 'Hindi' },
  { value: 'pa', native: 'ਪੰਜਾਬੀ', en: 'Punjabi' },
  { value: 'bn', native: 'বাংলা', en: 'Bengali' },
  { value: 'or', native: 'ଓଡ଼ିଆ', en: 'Odia' },
  { value: 'tg', native: 'Тоҷикӣ', en: 'Tajik' },
  { value: 'yi', native: 'ייִדיש', en: 'Yiddish' },
  { value: 'lmo', native: 'Lombard', en: 'Lombard' },
  { value: 'lij', native: 'Lìgure', en: 'Ligurian' },
  { value: 'scn', native: 'Sicilianu', en: 'Sicilian' },
  { value: 'fur', native: 'Furlan', en: 'Friulian' },
  { value: 'sc', native: 'Sardu', en: 'Sardinian' },
  { value: 'gl', native: 'Galego', en: 'Galician' },
  { value: 'ca', native: 'Català', en: 'Catalan' },
  { value: 'is', native: 'Íslenska', en: 'Icelandic' },
  { value: 'sq', native: 'Shqip', en: 'Albanian' },
  { value: 'li', native: 'Limburgs', en: 'Limburgish' },
  { value: 'prs', native: 'دری', en: 'Dari' },
  { value: 'af', native: 'Afrikaans', en: 'Afrikaans' },
  { value: 'mk', native: 'Македонски', en: 'Macedonian' },
  { value: 'si', native: 'සිංහල', en: 'Sinhala' },
  { value: 'ur', native: 'اردو', en: 'Urdu' },
  { value: 'mag', native: 'मगही', en: 'Magahi' },
  { value: 'bs', native: 'Bosanski', en: 'Bosnian' },
  { value: 'hy', native: 'Հայերեն', en: 'Armenian' },
  { value: 'zh', native: '简体中文', en: 'Chinese (Simplified)' },
  { value: 'zh-TW', native: '繁體中文', en: 'Chinese (Traditional)' },
  { value: 'yue', native: '粵語', en: 'Cantonese' },
  { value: 'my', native: 'မြန်မာ', en: 'Burmese' },
  { value: 'ar', native: 'العربية', en: 'Arabic (Standard)' },
  { value: 'ars', native: 'نجدي', en: 'Arabic (Najdi)' },
  { value: 'apc', native: 'شامي', en: 'Arabic (Levantine)' },
  { value: 'arz', native: 'مصري', en: 'Arabic (Egyptian)' },
  { value: 'ary', native: 'الدارجة', en: 'Arabic (Moroccan)' },
  { value: 'acm', native: 'العراقية', en: 'Arabic (Mesopotamian)' },
  { value: 'acq', native: 'يمني', en: "Arabic (Ta'izzi-Adeni)" },
  { value: 'aeb', native: 'تونسي', en: 'Arabic (Tunisian)' },
  { value: 'he', native: 'עברית', en: 'Hebrew' },
  { value: 'mt', native: 'Malti', en: 'Maltese' },
  { value: 'id', native: 'Bahasa Indonesia', en: 'Indonesian' },
  { value: 'ms', native: 'Bahasa Melayu', en: 'Malay' },
  { value: 'tl', native: 'Tagalog', en: 'Tagalog' },
  { value: 'ceb', native: 'Cebuano', en: 'Cebuano' },
  { value: 'jv', native: 'Basa Jawa', en: 'Javanese' },
  { value: 'su', native: 'Basa Sunda', en: 'Sundanese' },
  { value: 'min', native: 'Baso Minangkabau', en: 'Minangkabau' },
  { value: 'ban', native: 'Basa Bali', en: 'Balinese' },
  { value: 'bjn', native: 'Bahasa Banjar', en: 'Banjar' },
  { value: 'pag', native: 'Pangasinan', en: 'Pangasinan' },
  { value: 'ilo', native: 'Ilokano', en: 'Ilokano' },
  { value: 'war', native: 'Waray', en: 'Waray' },
  { value: 'ta', native: 'தமிழ்', en: 'Tamil' },
  { value: 'te', native: 'తెలుగు', en: 'Telugu' },
  { value: 'kn', native: 'ಕನ್ನಡ', en: 'Kannada' },
  { value: 'ml', native: 'മലയാളം', en: 'Malayalam' },
  { value: 'tr', native: 'Türkçe', en: 'Turkish' },
  { value: 'az', native: 'Azərbaycan', en: 'Azerbaijani' },
  { value: 'uz', native: "Oʻzbek", en: 'Uzbek' },
  { value: 'kk', native: 'Қазақ', en: 'Kazakh' },
  { value: 'ba', native: 'Башҡорт', en: 'Bashkir' },
  { value: 'tt', native: 'Татар', en: 'Tatar' },
  { value: 'th', native: 'ไทย', en: 'Thai' },
  { value: 'lo', native: 'ລາວ', en: 'Lao' },
  { value: 'fi', native: 'Suomi', en: 'Finnish' },
  { value: 'et', native: 'Eesti', en: 'Estonian' },
  { value: 'hu', native: 'Magyar', en: 'Hungarian' },
  { value: 'vi', native: 'Tiếng Việt', en: 'Vietnamese' },
  { value: 'km', native: 'ភាសាខ្មែរ', en: 'Khmer' },
  { value: 'ja', native: '日本語', en: 'Japanese' },
  { value: 'ko', native: '한국어', en: 'Korean' },
  { value: 'ka', native: 'ქართული', en: 'Georgian' },
  { value: 'eu', native: 'Euskara', en: 'Basque' },
  { value: 'ht', native: 'Kreyòl Ayisyen', en: 'Haitian Creole' },
  { value: 'pap', native: 'Papiamentu', en: 'Papiamento' },
  { value: 'kea', native: 'Kabuverdianu', en: 'Kabuverdianu' },
  { value: 'tpi', native: 'Tok Pisin', en: 'Tok Pisin' },
  { value: 'sw', native: 'Kiswahili', en: 'Swahili' },
]

const LANG_MAP = Object.fromEntries(LANGUAGES.map(l => [l.value, l]))

function getLangLabel(code) {
  return LANG_MAP[code]?.native || LANG_MAP[code]?.en || code?.toUpperCase() || '?'
}

function getLangShort(code) {
  if (code === 'zh-TW') return '繁'
  return code?.substring(0, 2).toUpperCase() || '?'
}

// 热力图组件 - 只显示有数据的语言对
function Heatmap({ pairs, onCellClick }) {
  const [hovered, setHovered] = useState(null)

  // 只收集有数据的语言
  const sourceLangs = useMemo(() => [...new Set(pairs.map(p => p.source_lang))].sort(), [pairs])
  const targetLangs = useMemo(() => [...new Set(pairs.map(p => p.target_lang))].sort(), [pairs])

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

  const cellSize = 14
  const labelW = 36
  const labelH = 40
  const w = labelW + targetLangs.length * cellSize
  const h = labelH + sourceLangs.length * cellSize

  return (
    <div className="overflow-auto max-h-[600px]">
      <svg width={w} height={h} className="select-none">
        {/* 列标题（target_lang） */}
        {targetLangs.map((tl, i) => (
          <text key={tl} x={labelW + i * cellSize + cellSize / 2} y={labelH - 4}
            textAnchor="start" fill="rgba(201,169,110,0.5)" fontSize="7"
            transform={`rotate(-90, ${labelW + i * cellSize + cellSize / 2}, ${labelH - 4})`}>
            {getLangShort(tl)}
          </text>
        ))}
        {/* 行标题（source_lang）+ 单元格 */}
        {sourceLangs.map((sl, ri) => (
          <g key={sl}>
            <text x={labelW - 3} y={labelH + ri * cellSize + cellSize / 2 + 2}
              textAnchor="end" fill="rgba(201,169,110,0.5)" fontSize="7">
              {getLangShort(sl)}
            </text>
            {targetLangs.map((tl, ci) => {
              const cnt = pairMap[`${sl}-${tl}`] || 0
              const intensity = cnt / maxCnt
              const key = `${sl}-${tl}`
              const cx = labelW + ci * cellSize
              const cy = labelH + ri * cellSize
              return (
                <g key={key}
                  onMouseEnter={() => cnt > 0 && setHovered({ sl, tl, cnt, x: cx, y: cy })}
                  onMouseLeave={() => setHovered(null)}
                  onClick={() => cnt > 0 && onCellClick(sl, tl)}
                  style={{ cursor: cnt > 0 ? 'pointer' : 'default' }}>
                  <rect
                    x={cx + 1} y={cy + 1}
                    width={cellSize - 2} height={cellSize - 2}
                    rx={1}
                    fill={cnt > 0 ? `rgba(201,169,110,${0.15 + intensity * 0.85})` : 'rgba(201,169,110,0.03)'}
                  />
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
  const pageSize = 10

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
                {/* 释义 - 与学习界面一致 */}
                {(detailWord.enriched_meaning || detailWord.meaning || detailWord.context_meaning) && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">释义</div>
                    <div className="text-[#e8d5b7] leading-relaxed">
                      {detailWord.enriched_meaning || detailWord.meaning || detailWord.context_meaning}
                    </div>
                  </div>
                )}
                {/* 变形 - 与学习界面一致 */}
                {detailWord.variants_detail?.length > 0 && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">变形</div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1">
                      {detailWord.variants_detail.map((v, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          {v.type && <span className="px-1.5 py-0.5 bg-[#c9a96e]/10 text-[#c9a96e] rounded text-xs">{v.type}</span>}
                          <span className="text-[#e8d5b7]">{v.form || v.variant}</span>
                          {v.explanation && <span className="text-[#e8d5b7]/50 text-xs">- {v.explanation}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* 例句 - 与学习界面一致 */}
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
                {/* 记忆辅助 - 与学习界面一致 */}
                {detailWord.memory_hint && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">记忆辅助</div>
                    <div className="text-[#e8d5b7] leading-relaxed bg-[#c9a96e]/5 px-3 py-2 rounded border border-[#c9a96e]/10">
                      {detailWord.memory_hint}
                    </div>
                  </div>
                )}
                {/* 词性/形态 */}
                {detailWord.morphology && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">词性/形态</div>
                    <div className="text-[#e8d5b7]">{detailWord.morphology}</div>
                  </div>
                )}
                {/* 音标 */}
                {detailWord.phonetic && (
                  <div>
                    <div className="text-[#e8d5b7]/50 mb-1">音标</div>
                    <div className="text-[#e8d5b7]">{detailWord.phonetic}</div>
                  </div>
                )}
                {/* 选择题 */}
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
