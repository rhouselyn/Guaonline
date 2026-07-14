import { useState, useRef, useCallback, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Shuffle, Loader2, Languages, BookOpen, Search, Volume2, ArrowLeft, Pencil, ChevronLeft, ChevronRight, RefreshCw, Brain } from 'lucide-react'
import WordDetail from './WordDetail'
import SentenceDetail from './SentenceDetail'
import FavoriteButton from './FavoriteButton'
import { groupVocab } from '../utils/vocab'
import { useMediaQuery } from '../utils/useMediaQuery'
import { speakText } from '../utils/speech'
import { LangIcon, LANGUAGES } from './InputStep'
import { api } from '../utils/api'

function DictionaryStep({ vocab, onToggleSort, sortOrder, progress, processingInfo, sentenceTranslations, selectedSentence, selectedWord, onSentenceClick, onCloseSentenceDetail, onWordClick, onStartLearning, loading, t, currentFileId, sourceLang, detectedLang, preprocessStatus, onBack, fileTitle, onTitleChange, pageSize = 50, dictStateRef, originalText = '', entryPrompt = '', vocabLength = 0, sentenceLength = 0 }) {
  const saved = dictStateRef?.current || {}
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const [activePanel, setActivePanel] = useState(0) // 0=句子翻译, 1=词汇表
  const scrollContainerRef = useRef(null)
  // 滑动状态
  const touchState = useRef({ x: 0, y: 0, t: 0, scrolling: false })
  const panelScrollRaf = useRef(null)

  // 切换到指定面板（快速动画，移动端追求即切即到）
  const switchPanel = useCallback((idx) => {
    const container = scrollContainerRef.current
    if (!container) return
    const pageWidth = container.clientWidth
    const target = idx * pageWidth
    if (panelScrollRaf.current) cancelAnimationFrame(panelScrollRaf.current)
    const start = container.scrollLeft
    const dist = target - start
    if (dist === 0) { setActivePanel(idx); return }
    const duration = 160
    const t0 = performance.now()
    const easeOut = (p) => 1 - Math.pow(1 - p, 3)
    const step = (now) => {
      const p = Math.min(1, (now - t0) / duration)
      container.scrollLeft = start + dist * easeOut(p)
      if (p < 1) panelScrollRaf.current = requestAnimationFrame(step)
      else panelScrollRaf.current = null
    }
    panelScrollRaf.current = requestAnimationFrame(step)
    setActivePanel(idx)
  }, [])
  const [expandedWord, setExpandedWord] = useState(null)
  const [wordDetailCache, setWordDetailCache] = useState({})
  const [loadingWords, setLoadingWords] = useState({})
  const [wordDetails, setWordDetails] = useState({})
  // ponytail: 从句子点击单词时，记录该句 token 的上下文释义/词性/音标，覆盖全局释义展示。
  // { wordKey, meaning, morphology, phonetic } | null。直接点单词表时清空（用全局）。
  const [activeSentenceContext, setActiveSentenceContext] = useState(null)
  const [sentenceSearch, setSentenceSearch] = useState(saved.sentenceSearch || '')
  const [vocabSearch, setVocabSearch] = useState(saved.vocabSearch || '')
  const [sentenceDisplayMode, setSentenceDisplayMode] = useState(saved.sentenceDisplayMode || 0)
  const [vocabDisplayMode, setVocabDisplayMode] = useState(saved.vocabDisplayMode || 0)
  const [showOriginal, setShowOriginal] = useState(saved.showOriginal || false)
  const [showGlobalVocab, setShowGlobalVocab] = useState(saved.showGlobalVocab || false)
  const [globalVocab, setGlobalVocab] = useState([])
  const [globalVocabLoading, setGlobalVocabLoading] = useState(false)
  const [actualSourceLang, setActualSourceLang] = useState(sourceLang === 'auto' ? null : sourceLang)
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleInput, setTitleInput] = useState('')
  const [vocabPage, setVocabPage] = useState(saved.vocabPage || 1)
  const [sentencePage, setSentencePage] = useState(saved.sentencePage || 1)
  const [globalVocabPage, setGlobalVocabPage] = useState(saved.globalVocabPage || 1)
  const [wordGenProgress, setWordGenProgress] = useState(null)
  const [meaningOverrides, setMeaningOverrides] = useState({})
  const [favoriteWords, setFavoriteWords] = useState([])
  // ponytail: 按页自取的词汇/句子数据（替代全量 prop）。page/搜索/排序/生成进度变化时 refetch 当前页。
  const [pagedVocab, setPagedVocab] = useState([])
  const [vocabTotal, setVocabTotal] = useState(0)
  const [vocabFetching, setVocabFetching] = useState(false)
  const [pagedSent, setPagedSent] = useState([])
  const [sentTotal, setSentTotal] = useState(0)
  const [sentFetching, setSentFetching] = useState(false)
  const [vocabSearchDebounced, setVocabSearchDebounced] = useState(vocabSearch)
  const [sentenceSearchDebounced, setSentenceSearchDebounced] = useState(sentenceSearch)
  // 全量词表（仅词字符串，轻量），用于构建字母→页、单词→页索引，支持跨页跳转
  const [allWords, setAllWords] = useState([])
  const allWordsSeq = useRef(0)
  const vocabFetchSeq = useRef(0)
  const vocabListRef = useRef(null)
  const sentenceListRef = useRef(null)
  const wordRefs = useRef({})
  const sentenceRefs = useRef({})
  const titleInputRef = useRef(null)
  const pendingScrollWord = useRef(null)
  const localVocabScrollPos = useRef(saved.vocabScrollPos || 0)
  const globalVocabScrollPos = useRef(saved.globalVocabScrollPos || 0)
  const sentenceTranslationScrollPos = useRef(saved.sentenceTranslationScrollPos || 0)
  const sentenceOriginalScrollPos = useRef(saved.sentenceOriginalScrollPos || 0)
  const filteredVocabRef = useRef([])
  const vocabPageRef = useRef(saved.vocabPage || 1)
  const pageSizeRef = useRef(pageSize)
  const showGlobalVocabRef = useRef(showGlobalVocab)
  const showOriginalRef = useRef(showOriginal)

  useEffect(() => { showGlobalVocabRef.current = showGlobalVocab }, [showGlobalVocab])
  useEffect(() => { showOriginalRef.current = showOriginal }, [showOriginal])

  useEffect(() => {
    const lang = actualSourceLang && actualSourceLang !== 'auto' ? actualSourceLang : sourceLang
    if (!lang) return
    api.getFavorites(lang).then(data => {
      setFavoriteWords((data.words || []).map(w => w.toLowerCase()))
    }).catch(() => {})
  }, [actualSourceLang, sourceLang])

  const handleFavoriteChange = useCallback((word, favorited) => {
    const lower = word.toLowerCase()
    setFavoriteWords(prev => {
      if (favorited) {
        return prev.includes(lower) ? prev : [...prev, lower]
      } else {
        return prev.filter(w => w !== lower)
      }
    })
  }, [])

  const saveState = () => {
    if (dictStateRef) {
      dictStateRef.current = {
        vocabPage, sentencePage, globalVocabPage,
        vocabScrollPos: localVocabScrollPos.current,
        sentenceTranslationScrollPos: sentenceTranslationScrollPos.current,
        sentenceOriginalScrollPos: sentenceOriginalScrollPos.current,
        globalVocabScrollPos: globalVocabScrollPos.current,
        vocabDisplayMode, sentenceDisplayMode,
        showOriginal, showGlobalVocab,
        vocabSearch, sentenceSearch
      }
    }
  }

  useEffect(() => {
    saveState()
  }, [vocabPage, sentencePage, globalVocabPage, vocabDisplayMode, sentenceDisplayMode, showOriginal, showGlobalVocab, vocabSearch, sentenceSearch])

  useEffect(() => {
    if (currentFileId) {
      // 不同条目切换时清空状态
      if (dictStateRef && dictStateRef.current?._lastFileId && dictStateRef.current._lastFileId !== currentFileId) {
        dictStateRef.current = {
          vocabPage: 1, sentencePage: 1, globalVocabPage: 1,
          vocabScrollPos: 0, sentenceTranslationScrollPos: 0, sentenceOriginalScrollPos: 0,
          globalVocabScrollPos: 0, vocabDisplayMode: 0, sentenceDisplayMode: 0,
          showOriginal: false, showGlobalVocab: false, vocabSearch: '', sentenceSearch: '',
          _lastFileId: currentFileId
        }
        setVocabPage(1)
        setSentencePage(1)
        setGlobalVocabPage(1)
        setVocabDisplayMode(0)
        setSentenceDisplayMode(0)
        setShowOriginal(false)
        setShowGlobalVocab(false)
        setVocabSearch('')
        setSentenceSearch('')
        localVocabScrollPos.current = 0
        globalVocabScrollPos.current = 0
        sentenceTranslationScrollPos.current = 0
        sentenceOriginalScrollPos.current = 0
      } else if (dictStateRef) {
        dictStateRef.current._lastFileId = currentFileId
      }
      // 始终拉取 file info 设置 actualSourceLang。
      // 即使 sourceLang='auto'（从历史记录进入已处理完的条目），language_settings 里
      // 也已保存检测到的真实语言，必须取回否则 FavoriteButton 收到 sourceLang=null，
      // 导致收藏写入因 NOT NULL 约束静默失败、无法取消收藏。
      fetch(`/api/file/${currentFileId}/info`)
        .then(r => r.json())
        .then(data => {
          const lang = data.source_lang
          if (lang && lang !== 'auto') {
            setActualSourceLang(lang)
          }
        })
        .catch(() => {})
    }
    if (sourceLang && sourceLang !== 'auto') {
      setActualSourceLang(sourceLang)
    }
  }, [currentFileId, sourceLang])

  // detectedLang 更新时设置 actualSourceLang（auto模式语言检测完成）
  useEffect(() => {
    if (detectedLang && detectedLang !== 'auto') {
      setActualSourceLang(detectedLang)
    }
  }, [detectedLang])

  useEffect(() => {
    if (!showGlobalVocab) return
    const lang = actualSourceLang && actualSourceLang !== 'auto' ? actualSourceLang : sourceLang
    // ponytail: auto/空语言 → 不按语言过滤，返回全部语言的聚合词表（单词总表"完整"展示）。
    // 后端 /word-list 无 source_lang 时聚合所有 record，传 'auto' 反而会过滤成空。
    const queryLang = (lang && lang !== 'auto') ? lang : null
    let cancelled = false
    setGlobalVocabLoading(true)
    api.getWordList(queryLang).then(data => {
      if (!cancelled) {
        setGlobalVocab(data.words || [])
        setGlobalVocabLoading(false)
      }
    }).catch(() => {
      if (!cancelled) setGlobalVocabLoading(false)
    })
    return () => { cancelled = true }
  }, [showGlobalVocab, actualSourceLang, sourceLang])

  useEffect(() => {
    if (!currentFileId) return
    let interval = null
    let cancelled = false
    const poll = async () => {
      try {
        const data = await api.getWordGenProgress(currentFileId)
        if (cancelled) return
        setWordGenProgress(data)
        // 完成则停止轮询
        if (data.completed >= data.total && data.total > 0) {
          if (interval) { clearInterval(interval); interval = null }
        }
      } catch {
        // 网络错误：保持原 interval 继续重试，不重复创建
      }
    }
    // 单一 interval：原代码 poll() + setInterval 同时启动两个，导致每 3 秒发 2 次请求
    poll()  // 立即首次拉取
    interval = setInterval(poll, 3000)
    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [currentFileId])

  const safeSentenceTranslations = Array.isArray(sentenceTranslations) ? sentenceTranslations : []
  const safeProcessingInfo = processingInfo || { current: 0, total: 1 }

  // ponytail: 搜索去抖——输入停 300ms 后才触发后端 fetch，避免每个按键都请求。
  useEffect(() => {
    const id = setTimeout(() => { setVocabSearchDebounced(vocabSearch); setVocabPage(1) }, 300)
    return () => clearTimeout(id)
  }, [vocabSearch])
  useEffect(() => {
    const id = setTimeout(() => { setSentenceSearchDebounced(sentenceSearch); setSentencePage(1) }, 300)
    return () => clearTimeout(id)
  }, [sentenceSearch])

  // ponytail: 按页拉取词汇表（仅当前页 + total）。依赖 currentFileId/page/pageSize/搜索/排序/生成进度。
  useEffect(() => {
    if (!currentFileId || showGlobalVocab) return
    let cancelled = false
    const seq = ++vocabFetchSeq.current
    setVocabFetching(true)
    api.getVocab(currentFileId, {
      offset: (vocabPage - 1) * pageSize,
      limit: pageSize,
      q: vocabSearchDebounced,
      sort: sortOrder,
      include_total: true
    }).then(data => {
      if (cancelled || seq !== vocabFetchSeq.current) return
      setPagedVocab(Array.isArray(data.vocab) ? data.vocab : [])
      setVocabTotal(typeof data.total === 'number' ? data.total : (Array.isArray(data.vocab) ? data.vocab.length : 0))
    }).catch(() => {
      if (cancelled || seq !== vocabFetchSeq.current) return
      setPagedVocab([]); setVocabTotal(0)
    }).finally(() => { if (!cancelled && seq === vocabFetchSeq.current) setVocabFetching(false) })
    return () => { cancelled = true }
  }, [currentFileId, vocabPage, pageSize, vocabSearchDebounced, sortOrder, showGlobalVocab, vocabLength])

  // ponytail: 按页拉取句子翻译（仅当前页 + total）。
  const sentFetchSeq = useRef(0)
  useEffect(() => {
    if (!currentFileId) return
    let cancelled = false
    const seq = ++sentFetchSeq.current
    setSentFetching(true)
    api.getSentences(currentFileId, {
      offset: (sentencePage - 1) * pageSize,
      limit: pageSize,
      q: sentenceSearchDebounced,
      include_total: true
    }).then(data => {
      if (cancelled || seq !== sentFetchSeq.current) return
      setPagedSent(Array.isArray(data.sentences) ? data.sentences : [])
      setSentTotal(typeof data.total === 'number' ? data.total : (Array.isArray(data.sentences) ? data.sentences.length : 0))
    }).catch(() => {
      if (cancelled || seq !== sentFetchSeq.current) return
      setPagedSent([]); setSentTotal(0)
    }).finally(() => { if (!cancelled && seq === sentFetchSeq.current) setSentFetching(false) })
    return () => { cancelled = true }
  }, [currentFileId, sentencePage, pageSize, sentenceSearchDebounced, sentenceLength])

  // 拉取全量词表（仅词字符串，轻量 words_only），用于构建字母→页、单词→页索引。
  // 依赖文件/排序/搜索/生成进度（vocabLength 变化时 Stage1/2 新增词需补入索引）。
  useEffect(() => {
    if (!currentFileId) return
    let cancelled = false
    const seq = ++allWordsSeq.current
    api.getVocab(currentFileId, { words_only: true, sort: sortOrder, q: vocabSearchDebounced }).then(data => {
      if (cancelled || seq !== allWordsSeq.current) return
      setAllWords(Array.isArray(data.words) ? data.words : [])
    }).catch(() => {
      if (cancelled || seq !== allWordsSeq.current) return
      setAllWords([])
    })
    return () => { cancelled = true }
  }, [currentFileId, sortOrder, vocabSearchDebounced, vocabLength])

  filteredVocabRef.current = pagedVocab
  vocabPageRef.current = vocabPage
  pageSizeRef.current = pageSize

  const pagedFilteredVocab = pagedVocab
  const pagedFilteredSentences = pagedSent

  // 分表字母→页、单词→页索引（基于全量词表 + 当前排序/搜索）
  const allLetters = useMemo(() => {
    const letters = []
    const seen = new Set()
    for (const w of allWords) {
      const letter = (w[0] || '#').toUpperCase()
      if (!seen.has(letter)) { seen.add(letter); letters.push(letter) }
    }
    return letters
  }, [allWords])

  const letterToPage = useMemo(() => {
    const m = new Map()
    allWords.forEach((w, i) => {
      const letter = (w[0] || '#').toUpperCase()
      const page = Math.floor(i / pageSize) + 1
      if (!m.has(letter)) m.set(letter, page)
    })
    return m
  }, [allWords, pageSize])

  const wordToPage = useMemo(() => {
    const m = new Map()
    allWords.forEach((w, i) => {
      m.set(w.toLowerCase(), Math.floor(i / pageSize) + 1)
    })
    return m
  }, [allWords, pageSize])

  const filteredGlobalVocab = useMemo(() => {
    if (!vocabSearch.trim()) return globalVocab
    const q = vocabSearch.toLowerCase()
    return globalVocab.filter(w =>
      w.word.toLowerCase().includes(q) ||
      (w.meaning && w.meaning.toLowerCase().includes(q))
    )
  }, [globalVocab, vocabSearch])

  const pagedFilteredGlobalVocab = useMemo(() => {
    const start = (globalVocabPage - 1) * pageSize
    return filteredGlobalVocab.slice(start, start + pageSize)
  }, [filteredGlobalVocab, globalVocabPage, pageSize])

  const groupedVocab = useMemo(() => {
    return groupVocab(pagedFilteredVocab)
  }, [pagedFilteredVocab])

  const letterIndex = useMemo(() => {
    return groupedVocab.map(([letter]) => letter)
  }, [groupedVocab])

  const groupedGlobalVocab = useMemo(() => {
    return groupVocab(pagedFilteredGlobalVocab)
  }, [pagedFilteredGlobalVocab])

  const globalLetterIndex = useMemo(() => {
    return groupedGlobalVocab.map(([letter]) => letter)
  }, [groupedGlobalVocab])

  // 分表字母索引=全量字母（来自 allWords），点击跳转到对应页；总表同理（全量客户端分页）
  const allLetterIndex = allLetters
  const allGlobalLetterIndex = useMemo(() => groupVocab(filteredGlobalVocab).map(([letter]) => letter), [filteredGlobalVocab])

  // 总表字母→页索引（客户端分页，基于全量 filteredGlobalVocab）
  const globalLetterToPage = useMemo(() => {
    const m = new Map()
    filteredGlobalVocab.forEach((w, i) => {
      const letter = (w.word[0] || '#').toUpperCase()
      const page = Math.floor(i / pageSize) + 1
      if (!m.has(letter)) m.set(letter, page)
    })
    return m
  }, [filteredGlobalVocab, pageSize])

  const vocabTotalPages = useMemo(() => Math.max(1, Math.ceil(vocabTotal / pageSize)), [vocabTotal, pageSize])
  const sentenceTotalPages = useMemo(() => Math.max(1, Math.ceil(sentTotal / pageSize)), [sentTotal, pageSize])
  const globalVocabTotalPages = useMemo(() => Math.max(1, Math.ceil(filteredGlobalVocab.length / pageSize)), [filteredGlobalVocab, pageSize])

  useEffect(() => {
    setVocabPage(1)
    setSentencePage(1)
    setGlobalVocabPage(1)
  }, [pageSize])

  useEffect(() => {
    if (vocabPage > vocabTotalPages) setVocabPage(vocabTotalPages)
  }, [vocabPage, vocabTotalPages])

  useEffect(() => {
    if (sentencePage > sentenceTotalPages) setSentencePage(sentenceTotalPages)
  }, [sentencePage, sentenceTotalPages])

  useEffect(() => {
    if (globalVocabPage > globalVocabTotalPages) setGlobalVocabPage(globalVocabTotalPages)
  }, [globalVocabPage, globalVocabTotalPages])

  // 切换页数时滚动条置顶
  useEffect(() => {
    if (vocabListRef.current) vocabListRef.current.scrollTop = 0
  }, [vocabPage, globalVocabPage])

  useEffect(() => {
    if (sentenceListRef.current) sentenceListRef.current.scrollTop = 0
  }, [sentencePage])

  const handleToggleGlobalVocab = useCallback(() => {
    if (vocabListRef.current) {
      if (showGlobalVocab) {
        globalVocabScrollPos.current = vocabListRef.current.scrollTop
      } else {
        localVocabScrollPos.current = vocabListRef.current.scrollTop
      }
    }
    setShowGlobalVocab(v => !v)
  }, [showGlobalVocab])

  useEffect(() => {
    if (vocabListRef.current && !globalVocabLoading) {
      if (!showGlobalVocab && pendingScrollWord.current) return
      const targetPos = showGlobalVocab ? globalVocabScrollPos.current : localVocabScrollPos.current
      vocabListRef.current.scrollTop = targetPos
    }
  }, [showGlobalVocab, globalVocabLoading])

  // 切换句子翻译/显示原文时保存/恢复滚动位置
  const handleToggleShowOriginal = useCallback(() => {
    // 保存当前模式的滚动位置
    if (sentenceListRef.current) {
      if (showOriginal) {
        sentenceOriginalScrollPos.current = sentenceListRef.current.scrollTop
      } else {
        sentenceTranslationScrollPos.current = sentenceListRef.current.scrollTop
      }
    }
    setShowOriginal(v => !v)
  }, [showOriginal])

  // 切换 showOriginal 后恢复滚动位置
  useEffect(() => {
    if (!sentenceListRef.current) return
    const targetPos = showOriginal ? sentenceOriginalScrollPos.current : sentenceTranslationScrollPos.current
    if (typeof targetPos === 'number' && targetPos > 0) {
      requestAnimationFrame(() => {
        if (sentenceListRef.current) sentenceListRef.current.scrollTop = targetPos
      })
    }
  }, [showOriginal])

  // 初始恢复句子面板和词汇面板滚动位置（内容渲染后）
  const initialRestoreDone = useRef(false)
  useEffect(() => {
    if (initialRestoreDone.current) return
    if (!pagedVocab.length && !pagedSent.length) return
    initialRestoreDone.current = true
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (sentenceListRef.current) {
          const sentenceTarget = showOriginal ? sentenceOriginalScrollPos.current : sentenceTranslationScrollPos.current
          if (typeof sentenceTarget === 'number' && sentenceTarget > 0) {
            sentenceListRef.current.scrollTop = sentenceTarget
          }
        }
        if (vocabListRef.current) {
          const vocabTarget = showGlobalVocab ? globalVocabScrollPos.current : localVocabScrollPos.current
          if (typeof vocabTarget === 'number' && vocabTarget > 0) {
            vocabListRef.current.scrollTop = vocabTarget
          }
        }
      })
    })
  }, [pagedVocab, pagedSent])

  const scrollToLetter = (letter) => {
    // 分表：用 letterToPage 跳到对应页再滚动；总表：用 globalLetterToPage 跳页
    if (showGlobalVocab) {
      const page = globalLetterToPage.get(letter)
      if (page && page !== globalVocabPage) {
        pendingScrollWord.current = `letter-${letter}`
        setGlobalVocabPage(page)
      } else {
        _scrollToLetterEl(letter)
      }
    } else {
      const page = letterToPage.get(letter)
      if (page && page !== vocabPage) {
        pendingScrollWord.current = `letter-${letter}`
        setVocabPage(page)
      } else {
        _scrollToLetterEl(letter)
      }
    }
  }

  const _scrollToLetterEl = (letter) => {
    const el = document.getElementById(`dict-group-${letter}`)
    if (el && vocabListRef.current) {
      const container = vocabListRef.current
      const containerRect = container.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const stickyOffset = 32
      const scrollOffset = elRect.top - containerRect.top + container.scrollTop - stickyOffset
      container.scrollTo({ top: scrollOffset, behavior: 'smooth' })
    }
  }

  // 页面切换后滚动到目标字母
  useEffect(() => {
    if (pendingScrollWord.current && typeof pendingScrollWord.current === 'string' && pendingScrollWord.current.startsWith('letter-')) {
      const letter = pendingScrollWord.current.replace('letter-', '')
      pendingScrollWord.current = null
      setTimeout(() => {
        const el = document.getElementById(`dict-group-${letter}`)
        if (el && vocabListRef.current) {
          const container = vocabListRef.current
          const containerRect = container.getBoundingClientRect()
          const elRect = el.getBoundingClientRect()
          const stickyOffset = 32
          const scrollOffset = elRect.top - containerRect.top + container.scrollTop - stickyOffset
          container.scrollTo({ top: scrollOffset, behavior: 'smooth' })
        }
      }, 200)
    }
  }, [vocabPage, globalVocabPage])

  const fetchWordDetail = useCallback(async (wordKey) => {
    if (wordDetails[wordKey]) return wordDetails[wordKey]
    if (wordDetailCache[wordKey]) {
      setWordDetails(prev => ({ ...prev, [wordKey]: wordDetailCache[wordKey] }))
      return wordDetailCache[wordKey]
    }

    setLoadingWords(prev => ({ ...prev, [wordKey]: true }))
    try {
      // 先尝试直接获取缓存数据
      try {
        const data = await api.getWordDetails(currentFileId, wordKey)
        if (data && (data.enriched_meaning || data.meaning || data.multiple_choice)) {
          setWordDetails(prev => ({ ...prev, [wordKey]: data }))
          setWordDetailCache(prev => ({ ...prev, [wordKey]: data }))
          return data
        }
      } catch (e) {
        // 缓存未命中，触发生成
      }

      // 触发后台生成
      try {
        await api.priorityWordGen(currentFileId, wordKey)
      } catch (_) {}

      // 轮询等待生成完成
      const waitForDetail = async (retries = 30) => {
        try {
          const data = await api.getWordDetails(currentFileId, wordKey)
          if (data && (data.enriched_meaning || data.meaning || data.multiple_choice)) {
            return data
          }
        } catch (_) {}
        if (retries > 0) {
          await new Promise(r => setTimeout(r, 2000))
          return waitForDetail(retries - 1)
        }
        return null
      }

      const data = await waitForDetail()
      if (data) {
        setWordDetails(prev => ({ ...prev, [wordKey]: data }))
        setWordDetailCache(prev => ({ ...prev, [wordKey]: data }))
      }
      return data
    } catch (e) {
      console.error('Failed to load word details:', e)
      return null
    } finally {
      setLoadingWords(prev => ({ ...prev, [wordKey]: false }))
    }
  }, [currentFileId, wordDetails, wordDetailCache])

  const scrollToWord = useCallback((wordKey, delay = 50) => {
    const doScroll = () => {
      let el = wordRefs.current[wordKey]
      if (!el && vocabListRef.current) {
        el = vocabListRef.current.querySelector(`[data-word-key="${CSS.escape(wordKey)}"]`)
      }
      if (el && vocabListRef.current) {
        const container = vocabListRef.current
        const containerRect = container.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const stickyOffset = 36
        const scrollOffset = elRect.top - containerRect.top + container.scrollTop - stickyOffset
        container.scrollTo({ top: Math.max(0, scrollOffset), behavior: 'instant' })
      }
    }
    if (delay <= 0) {
      requestAnimationFrame(doScroll)
    } else {
      setTimeout(() => requestAnimationFrame(doScroll), delay)
    }
  }, [])

  useEffect(() => {
    if (!showGlobalVocab && pendingScrollWord.current) {
      const wordKey = pendingScrollWord.current
      pendingScrollWord.current = null
      scrollToWord(wordKey, 200)
    }
  }, [showGlobalVocab, scrollToWord, vocabPage])

  useEffect(() => {
    if (expandedWord && !expandedWord.startsWith('global-') && !showGlobalVocab) {
      scrollToWord(expandedWord, 200)
    }
  }, [expandedWord, showGlobalVocab, scrollToWord, vocabPage])

  const handleTokenClick = useCallback(async (sourceWord, sentenceToken) => {
    const sourceLower = sourceWord.toLowerCase()
    const sourceNoHyphen = sourceLower.replace(/-/g, ' ')
    const sourceStripped = stripEdgePunct(sourceLower)
    // 在全量词表中匹配（不再仅限当前页），获取规范 wordKey
    const matchedWordStr = allWords.find(w => {
      const wLower = w.toLowerCase()
      if (wLower === sourceLower) return true
      if (wLower === sourceNoHyphen) return true
      if (wLower.replace(/-/g, ' ') === sourceLower) return true
      if (sourceStripped && sourceStripped !== sourceLower && wLower === sourceStripped) return true
      return false
    })

    if (!matchedWordStr) return

    const wordKey = matchedWordStr
    if (expandedWord === wordKey) {
      setExpandedWord(null)
      return
    }

    // 从句子点击——记录该句 token 的上下文释义/词性/音标，覆盖条目行展示。
    const ctx = (sentenceToken && (sentenceToken.meaning || sentenceToken.morphology || sentenceToken.phonetic))
      ? { wordKey, meaning: sentenceToken.meaning || '', morphology: sentenceToken.morphology || '', phonetic: sentenceToken.phonetic || '' }
      : null

    // 从总表切到分表
    if (showGlobalVocab) {
      if (vocabListRef.current) {
        globalVocabScrollPos.current = vocabListRef.current.scrollTop
      }
      setShowGlobalVocab(false)
    }

    // 跳转到该词所在页（基于全量词表索引），再滚动定位
    const page = wordToPage.get(wordKey.toLowerCase())
    if (page && page !== vocabPage) {
      setVocabPage(page)
      pendingScrollWord.current = wordKey
    } else {
      scrollToWord(wordKey, 0)
    }

    setTimeout(() => {
      setExpandedWord(wordKey)
      setActiveSentenceContext(ctx)
      speakText(wordKey, sourceLang)
      fetchWordDetail(wordKey)
    }, 150)

    // 手机端：点击句子中的单词后自动滑动到词汇表面板
    if (!isDesktop) switchPanel(1)
  }, [allWords, wordToPage, vocabPage, expandedWord, scrollToWord, fetchWordDetail, showGlobalVocab, isDesktop, switchPanel])

  const handleVocabWordClick = useCallback(async (word) => {
    const wordKey = word.word
    if (expandedWord === wordKey) {
      setExpandedWord(null)
      return
    }
    setActiveSentenceContext(null) // 直接点单词表——用全局释义
    speakText(word.word, actualSourceLang)
    scrollToWord(wordKey, 0)
    setTimeout(() => {
      setExpandedWord(wordKey)
      fetchWordDetail(wordKey)
    }, 50)
  }, [expandedWord, fetchWordDetail, scrollToWord])

  const scrollToGlobalWord = useCallback((wordKey, delay = 50) => {
    const doScroll = () => {
      if (!vocabListRef.current) return
      const el = vocabListRef.current.querySelector(`[data-global-word-key="${CSS.escape(wordKey)}"]`)
      if (el) {
        const container = vocabListRef.current
        const containerRect = container.getBoundingClientRect()
        const elRect = el.getBoundingClientRect()
        const stickyOffset = 36
        const scrollOffset = elRect.top - containerRect.top + container.scrollTop - stickyOffset
        container.scrollTo({ top: Math.max(0, scrollOffset), behavior: 'instant' })
      }
    }
    if (delay <= 0) {
      requestAnimationFrame(doScroll)
    } else {
      setTimeout(() => requestAnimationFrame(doScroll), delay)
    }
  }, [])

  const handleGlobalVocabWordClick = useCallback(async (word) => {
    const globalKey = `global-${word.word}`
    if (expandedWord === globalKey) {
      setExpandedWord(null)
      return
    }
    setActiveSentenceContext(null) // 全局词表——无句子上下文
    speakText(word.word, actualSourceLang)
    scrollToGlobalWord(word.word, 0)
    setTimeout(async () => {
      setExpandedWord(globalKey)

      const hasDetail = word && (word.examples?.length > 0 || word.memory_hint || word.variants_detail?.length > 0)
      if (hasDetail) {
        setWordDetails(prev => ({ ...prev, [globalKey]: word }))
        return
      }

      if (!wordDetails[globalKey] && !loadingWords[globalKey]) {
        setLoadingWords(prev => ({ ...prev, [globalKey]: true }))
        try {
          const detail = await api.getWordDetail(word.word, actualSourceLang)
          setWordDetails(prev => ({ ...prev, [globalKey]: detail }))
        } catch (err) {
          console.error('Failed to load global word detail:', err)
        } finally {
          setLoadingWords(prev => ({ ...prev, [globalKey]: false }))
        }
      }
    }, 50)
  }, [expandedWord, wordDetails, loadingWords, actualSourceLang])

  const handleSentenceJump = useCallback((sentenceIndex) => {
    onSentenceClick(sentenceIndex)
    setTimeout(() => {
      const el = sentenceRefs.current[sentenceIndex]
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
    }, 300)
  }, [onSentenceClick])

  const speakWord = useCallback((text, e) => {
    if (e) e.stopPropagation()
    speakText(text, sourceLang)
  }, [sourceLang])

  const handleRegenerateWord = useCallback(async (wordKey, isGlobal = false) => {
    const localKey = wordKey
    const globalKey = `global-${wordKey}`
    setWordDetails(prev => {
      const next = { ...prev }
      delete next[localKey]
      delete next[globalKey]
      return next
    })
    setWordDetailCache(prev => {
      const next = { ...prev }
      delete next[wordKey]
      return next
    })
    setLoadingWords(prev => ({ ...prev, [localKey]: true, [globalKey]: true }))
    try {
      const data = await api.regenerateWordDetailByFile(currentFileId, wordKey)
      if (data) {
        setWordDetails(prev => ({ ...prev, [localKey]: data, [globalKey]: data }))
        setWordDetailCache(prev => ({ ...prev, [wordKey]: data }))
      }
    } catch (e) {
      console.error('Failed to regenerate word:', e)
    } finally {
      setLoadingWords(prev => ({ ...prev, [localKey]: false, [globalKey]: false }))
    }
  }, [currentFileId])

  const handleTitleClick = useCallback(() => {
    setTitleInput(fileTitle)
    setEditingTitle(true)
    setTimeout(() => titleInputRef.current?.focus(), 50)
  }, [fileTitle])

  const handleTitleSave = useCallback(() => {
    const trimmed = titleInput.trim()
    if (trimmed && trimmed !== fileTitle && currentFileId) {
      api.renameHistory(currentFileId, trimmed)
      if (onTitleChange) onTitleChange(trimmed)
    }
    setEditingTitle(false)
  }, [titleInput, fileTitle, currentFileId, onTitleChange])

  const handleTitleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') handleTitleSave()
    if (e.key === 'Escape') setEditingTitle(false)
  }, [handleTitleSave])

  const stripEdgePunct = (text) => {
    return text.replace(/^[^\w\u00C0-\u024F\u0400-\u052F\u0370-\u03FF\u0600-\u06FF\u0900-\u0D7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u1000-\u109F\u10A0-\u10FF\u1100-\u11FF]+|[^\w\u00C0-\u024F\u0400-\u052F\u0370-\u03FF\u0600-\u06FF\u0900-\u0D7F\u4E00-\u9FFF\u3040-\u30FF\uAC00-\uD7AF\u1000-\u109F\u10A0-\u10FF\u1100-\u11FF]+$/g, '')
  }

  const findVocabWordBySourceText = useCallback((sourceText) => {
    const sourceLower = sourceText.toLowerCase()
    const sourceNoHyphen = sourceLower.replace(/-/g, ' ')
    const sourceStripped = stripEdgePunct(sourceLower)
    // 先在当前页 pagedFilteredVocab 找（含 tokens），再在全量 allWords 词字符串里找（跨页）
    const inPage = pagedFilteredVocab.some(w => {
      const wordLower = w.word.toLowerCase()
      if (wordLower === sourceLower) return true
      if (wordLower === sourceNoHyphen) return true
      if (wordLower.replace(/-/g, ' ') === sourceLower) return true
      if (w.tokens && w.tokens.some(t => t.toLowerCase() === sourceLower)) return true
      if (sourceStripped && sourceStripped !== sourceLower && wordLower === sourceStripped) return true
      if (sourceStripped && sourceStripped !== sourceLower && w.tokens && w.tokens.some(t => t.toLowerCase() === sourceStripped)) return true
      return false
    })
    if (inPage) return true
    return allWords.some(w => {
      const wordLower = w.toLowerCase()
      if (wordLower === sourceLower) return true
      if (wordLower === sourceNoHyphen) return true
      if (wordLower.replace(/-/g, ' ') === sourceLower) return true
      if (sourceStripped && sourceStripped !== sourceLower && wordLower === sourceStripped) return true
      return false
    })
  }, [pagedFilteredVocab, allWords])

  // ponytail: 在当前句子的 token 数组里找出与可点击文本对应的那个 token（含其上下文释义/词性/音标）。
  const findTokenForPart = useCallback((tokens, part) => {
    if (!tokens || !part) return null
    const partLower = part.toLowerCase()
    const partStripped = stripEdgePunct(partLower)
    return tokens.find(tk => {
      if (!tk || typeof tk.text !== 'string') return false
      const tLower = tk.text.toLowerCase()
      if (tLower === partLower) return true
      const tStripped = stripEdgePunct(tLower)
      if (tStripped && tStripped === partStripped) return true
      return false
    }) || null
  }, [])

  const renderOriginalSentence = (item) => {
    const sentence = item.sentence || ''
    const tr = item.translation_result
    const tokens = (tr && tr.translation && Array.isArray(tr.translation)) ? tr.translation : null

    const tokenTexts = tokens
      ? tokens.filter(t => typeof t === 'object' && t.text).flatMap(t => {
          const raw = t.text
          const stripped = stripEdgePunct(raw)
          return stripped && stripped !== raw ? [raw, stripped] : [raw]
        })
      : []

    const vocabTexts = pagedFilteredVocab.map(w => w.word).filter(Boolean)

    // 用全局 allWords（words_only 全量）+ 当前句 token，保证跨页单词也能匹配上链接
    const matchWords = [...new Set([...tokenTexts, ...allWords, ...vocabTexts])]
    if (matchWords.length === 0) {
      return <div className="font-medium text-[15px] text-ink-800 mb-1.5 sentence-text">{sentence}</div>
    }

    matchWords.sort((a, b) => b.length - a.length)

    const escapedWords = matchWords.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const pattern = new RegExp(`(${escapedWords.join('|')})`, 'gi')
    const parts = sentence.split(pattern)

    return (
      <div className="font-medium text-[15px] text-ink-800 mb-1.5 leading-relaxed sentence-text">
        {parts.map((part, i) => {
          if (!part) return null
          const clickable = findVocabWordBySourceText(part)
          if (clickable) {
            return (
              <span
                key={i}
                onClick={(e) => { e.stopPropagation(); handleTokenClick(part, findTokenForPart(tokens, part)) }}
                className="cursor-pointer rounded px-0.5 -mx-0.5 hover:bg-amber-100 hover:text-amber-800 transition-colors duration-150 border-b border-amber-300/50"
              >
                {part}
              </span>
            )
          }
          return <span key={i}>{part}</span>
        })}
      </div>
    )
  }

  const renderTranslation = (item) => {
    const tr = item.translation_result
    const text = tr?.tokenized_translation || ''
    if (!text) return null
    return <div className={`text-ink-600 text-[14px] ${sentenceDisplayMode === 1 ? 'invisible' : ''}`}>{text}</div>
  }

  const renderPagination = (currentPage, totalPages, onPageChange) => {
    if (totalPages <= 1) return null
    // 手机端：简化分页器（上一页/页码/下一页），占满一行
    if (!isDesktop) {
      return (
        <div className="flex items-center justify-between gap-2 py-1.5 px-3 border-t border-aged-200/60 bg-parchment-50/40">
          <button
            onClick={() => onPageChange(p => Math.max(1, p - 1))}
            disabled={currentPage <= 1}
            className={`flex items-center gap-1 text-[12px] px-2 py-1 rounded-sm transition-colors ${currentPage <= 1 ? 'text-aged-200 cursor-not-allowed' : 'text-ink-500 hover:text-ink-700 active:bg-parchment-100'}`}
          >
            <ChevronLeft className="w-3.5 h-3.5" />
            <span>{t.prevPage || '上一页'}</span>
          </button>
          <span className="text-[11px] text-ink-400 tabular-nums">{currentPage} / {totalPages}</span>
          <button
            onClick={() => onPageChange(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className={`flex items-center gap-1 text-[12px] px-2 py-1 rounded-sm transition-colors ${currentPage >= totalPages ? 'text-aged-200 cursor-not-allowed' : 'text-ink-500 hover:text-ink-700 active:bg-parchment-100'}`}
          >
            <span>{t.nextPage || '下一页'}</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )
    }
    // 桌面端：原有数字分页器
    return (
      <div className="flex items-center justify-center gap-1 py-1.5 border-t border-aged-200/60 bg-parchment-50/40">
        <button
          onClick={() => onPageChange(p => Math.max(1, p - 1))}
          disabled={currentPage <= 1}
          className={`p-1 rounded-sm transition-colors ${currentPage <= 1 ? 'text-aged-200 cursor-not-allowed' : 'text-ink-400 hover:text-ink-600 hover:bg-parchment-100'}`}
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        {Array.from({ length: totalPages }, (_, i) => i + 1).filter(p => {
          if (totalPages <= 7) return true
          if (p === 1 || p === totalPages) return true
          if (Math.abs(p - currentPage) <= 1) return true
          return false
        }).reduce((acc, p, i, arr) => {
          if (i > 0 && p - arr[i - 1] > 1) acc.push('...')
          acc.push(p)
          return acc
        }, []).map((p, i) =>
          p === '...' ? (
            <span key={`dots-${i}`} className="text-[10px] text-aged-300 px-0.5">...</span>
          ) : (
            <button
              key={p}
              onClick={() => onPageChange(p)}
              className={`min-w-[22px] h-[22px] flex items-center justify-center text-[10px] rounded-sm transition-colors ${
                currentPage === p
                  ? 'bg-amber-100 text-amber-700 font-bold'
                  : 'text-ink-400 hover:text-ink-600 hover:bg-parchment-100'
              }`}
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPageChange(p => Math.min(totalPages, p + 1))}
          disabled={currentPage >= totalPages}
          className={`p-1 rounded-sm transition-colors ${currentPage >= totalPages ? 'text-aged-200 cursor-not-allowed' : 'text-ink-400 hover:text-ink-600 hover:bg-parchment-100'}`}
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  useEffect(() => {
    // 卸载时保存当前滚动位置（不覆盖已有的页码等状态，因为saveState已经保存了）
    return () => {
      if (dictStateRef) {
        const vocabScrollTop = vocabListRef.current?.scrollTop || 0
        const sentenceScrollTop = sentenceListRef.current?.scrollTop || 0
        const isGlobal = showGlobalVocabRef.current
        const isOriginal = showOriginalRef.current
        dictStateRef.current = {
          ...dictStateRef.current,
          vocabScrollPos: isGlobal ? dictStateRef.current.vocabScrollPos : vocabScrollTop,
          globalVocabScrollPos: isGlobal ? vocabScrollTop : dictStateRef.current.globalVocabScrollPos,
          sentenceTranslationScrollPos: isOriginal ? dictStateRef.current.sentenceTranslationScrollPos : sentenceScrollTop,
          sentenceOriginalScrollPos: isOriginal ? sentenceScrollTop : dictStateRef.current.sentenceOriginalScrollPos,
        }
      }
    }
  }, [])

  // 手机端去掉 tab-warm 滑块样式（shadow/border），改用简洁文字
  const tabActiveCls = isDesktop ? 'tab-warm-active' : 'text-ink-700 font-bold'
  const tabInactiveCls = isDesktop ? 'tab-warm-inactive' : 'text-ink-400'

  // ponytail: 进度条渲染。桌面端内联在标题行（shrink-0）；
  // 移动端单独占满一行（flex-1 的 bar 撑满），显示在标题行与"开始学习"下方。
  const renderProgress = (fullWidth = false) => {
    const active = preprocessStatus || (currentFileId && ((processingInfo && safeProcessingInfo.total > 0 && progress < 100) || (wordGenProgress && wordGenProgress.completed < wordGenProgress.total)))
    if (!active) return null
    const barCls = fullWidth ? 'progress-warm flex-1' : 'progress-warm w-16 md:w-24'
    const rowCls = fullWidth ? 'flex items-center gap-2 w-full px-1' : 'flex items-center gap-2.5 shrink-0'
    const innerCls = fullWidth ? 'flex items-center gap-2 w-full' : 'flex items-center gap-2'
    return (
      <div className={rowCls}>
        {preprocessStatus ? (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-none bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-none h-1.5 w-1.5 bg-blue-500"></span>
            </span>
            <span className="text-[11px] text-blue-500 font-medium truncate">
              {preprocessStatus === 'detecting' ? (t.detectingLanguage || '识别语言中...') :
               preprocessStatus === 'translating' ? (t.translating || '翻译中...') :
               preprocessStatus === 'refilling' ? (t.refillingWords || '补全漏词中...') :
               (t.generating || '生成文本中...')}
            </span>
          </div>
        ) : processingInfo && safeProcessingInfo.total > 0 && progress < 100 ? (
          <div className={innerCls}>
            <span className="text-[10px] text-ink-400 tabular-nums whitespace-nowrap">
              {Math.round(safeProcessingInfo.current / safeProcessingInfo.total * 100)}%
            </span>
            <div className={barCls}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="progress-warm-bar"
              />
            </div>
            <span className="text-[10px] text-ink-400 whitespace-nowrap">
              {t.processingSentences || '处理句子中...'}
            </span>
          </div>
        ) : wordGenProgress && wordGenProgress.completed < wordGenProgress.total ? (
          <div className={innerCls}>
            <span className="text-[10px] text-amber-500 tabular-nums whitespace-nowrap">
              {Math.round(wordGenProgress.completed / wordGenProgress.total * 100)}%
            </span>
            <div className={barCls}>
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${wordGenProgress.total > 0 ? (wordGenProgress.completed / wordGenProgress.total * 100) : 0}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
                className="progress-warm-bar"
              />
            </div>
            <span className="text-[10px] text-amber-500 whitespace-nowrap">
              {t.generatingWordDetails || '生成单词详情中...'}
            </span>
          </div>
        ) : null}
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex flex-col gap-3 w-full"
      style={{ height: '100%' }}
    >
      <div className="flex items-center gap-2 md:gap-3 flex-wrap px-1">
        <button
          onClick={onBack}
          className="btn-ghost p-2 -ml-1.5 hidden md:flex"
          title={t.backToHome || '返回主页'}
        >
          <ArrowLeft className="w-5 h-5" />
        </button>

        {actualSourceLang && actualSourceLang !== 'auto' && (
          <div className="flex items-center gap-2 shrink-0 order-last md:order-none">
            <LangIcon langCode={actualSourceLang} size="md" />
            <span className="text-sm font-bold text-ink-700">
              {LANGUAGES.find(l => l.value === actualSourceLang)?.native || actualSourceLang?.toUpperCase()}
            </span>
          </div>
        )}

        {fileTitle && !editingTitle && (
          <button
            onClick={handleTitleClick}
            className="flex items-center gap-1.5 min-w-0 flex-1 md:flex-none md:max-w-[300px] group"
          >
            <span className="truncate text-base font-bold text-ink-600 group-hover:text-ink-800 transition-colors">{fileTitle}</span>
            <Pencil className="w-2.5 h-2.5 text-aged-300 group-hover:text-ink-400 shrink-0 transition-colors" />
          </button>
        )}

        {editingTitle && (
          <input
            ref={titleInputRef}
            value={titleInput}
            onChange={e => setTitleInput(e.target.value)}
            onBlur={handleTitleSave}
            onKeyDown={handleTitleKeyDown}
            className="text-[13px] font-bold text-ink-600 bg-transparent border-b border-aged-300 px-1 py-0.5 min-w-0 flex-1 md:flex-none md:max-w-[300px] focus:outline-none focus:border-amber-400 transition-colors"
          />
        )}

        <div className="flex-1 min-w-0 hidden md:block" />

        {isDesktop && renderProgress(false)}

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
          onClick={onStartLearning}
          disabled={loading || !!preprocessStatus || vocabTotal === 0 || (processingInfo && processingInfo.total > 0 && progress < 100)}
          className="btn-primary hidden md:flex items-center gap-2 shrink-0 py-2 px-4 md:py-3 md:px-6"
        >
          {(loading || preprocessStatus) ? (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t.preparing}
            </>
          ) : (
            <>
              <Shuffle className="w-3.5 h-3.5" />
              <span>{t.startLearning || '开始学习'}</span>
            </>
          )}
        </motion.button>
      </div>

      {!isDesktop && renderProgress(true)}

      <div
        ref={scrollContainerRef}
        onScroll={(e) => {
          if (isDesktop) return
          const idx = Math.round(e.target.scrollLeft / e.target.clientWidth)
          if (idx !== activePanel) setActivePanel(idx)
        }}
        onTouchStart={(e) => {
          if (isDesktop) return
          const t = e.touches[0]
          touchState.current = { x: t.clientX, y: t.clientY, t: Date.now(), scrolling: false }
        }}
        onTouchEnd={(e) => {
          if (isDesktop || touchState.current.scrolling) return
          const t = e.changedTouches[0]
          const dx = t.clientX - touchState.current.x
          const dy = t.clientY - touchState.current.y
          const dt = Date.now() - touchState.current.t
          // 横向位移必须明显大于纵向，避免误触垂直滚动
          if (Math.abs(dx) < Math.abs(dy) * 1.5) return
          const container = scrollContainerRef.current
          if (!container) return
          const pageWidth = container.clientWidth
          const currentIdx = Math.round(container.scrollLeft / pageWidth)
          // 更灵敏的触发：距离 15% 或速度 0.3px/ms
          const isSwipe = Math.abs(dx) > pageWidth * 0.15 || (dt > 0 && Math.abs(dx) / dt > 0.3)
          if (!isSwipe) return
          const targetIdx = dx < 0 ? Math.min(1, currentIdx + 1) : Math.max(0, currentIdx - 1)
          if (targetIdx === currentIdx) return
          touchState.current.scrolling = true
          switchPanel(targetIdx)
          setTimeout(() => { touchState.current.scrolling = false }, 180)
        }}
        className="flex gap-0 md:gap-6 flex-1 min-h-0 md:overflow-hidden touch-scroll-x"
      >
        <div className="w-full md:w-1/2 snap-item flex flex-col min-h-0 md:overflow-hidden">
          <div className="bg-parchment-50 border-2 border-aged-200 rounded-md shadow-retro-sm overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="px-3 py-2 md:px-5 md:py-3.5 border-b border-aged-200/80 bg-parchment-50/60">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="flex items-center gap-2 shrink-0 md:min-w-[140px]">
                  <div
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-aged-200 bg-parchment-100/60 cursor-pointer active:bg-amber-100 active:border-amber-400 transition-colors duration-150"
                    onClick={(e) => { e.stopPropagation(); setSentenceDisplayMode(v => (v + 1) % 3) }}
                    title={sentenceDisplayMode === 0 ? t.showAll : sentenceDisplayMode === 1 ? t.hideTranslation : t.hideOriginal}
                  >
                    <Languages className="w-4 h-4 text-ink-500" />
                  </div>
                  <h3 className="text-sm font-bold text-ink-700 font-display">
                    <span className="cursor-pointer select-none" onClick={handleToggleShowOriginal}>
                      <span className={!showOriginal ? tabActiveCls : tabInactiveCls}>{t.sentTranslation}</span>
                      <span className="text-aged-300 mx-1.5">/</span>
                      <span className={showOriginal ? tabActiveCls : tabInactiveCls}>{t.showOriginal}</span>
                    </span>
                  </h3>
                  <span className="badge-amber ml-1">
                    {sentTotal}
                  </span>
                </div>
                <div className="relative w-1/2 ml-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-aged-300" />
                  <input
                    type="text"
                    value={sentenceSearch}
                    onChange={e => setSentenceSearch(e.target.value)}
                    placeholder={t.searchWordOrMeaning || '搜索单词或释义...'}
                    className="input-warm w-full pl-9 pr-3 text-[13px]"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-scroll min-h-0" ref={sentenceListRef} style={{ scrollbarGutter: 'stable' }}>
              {showOriginal ? (
                <div className="p-4">
                  {entryPrompt && (
                    <div className="mb-3 rounded-lg border border-amber-300/60 bg-amber-50/80 p-3">
                      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-amber-700">
                        {t.prompt || '提示词'}
                      </div>
                      <pre className="text-[13px] text-amber-900 leading-relaxed whitespace-pre-wrap font-sans">{entryPrompt}</pre>
                    </div>
                  )}
                  <pre className="text-sm text-ink-700 leading-relaxed whitespace-pre-wrap font-sans">{originalText || pagedFilteredSentences.map(item => item.sentence || '').join('\n')}</pre>
                </div>
              ) : pagedFilteredSentences.length > 0 ? (
                <div className="divide-y divide-aged-200/60">
                  {pagedFilteredSentences.map((item, index) => {
                    const originalIndex = (sentencePage - 1) * pageSize + index
                    return (
                      <div key={originalIndex} ref={el => { sentenceRefs.current[originalIndex] = el }}>
                        <motion.div
                          initial={{ opacity: 0, y: -5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.02 }}
                          className={`p-4 cursor-pointer transition-colors ${
                            selectedSentence === originalIndex ? 'bg-amber-50/60' : 'hover:bg-amber-50/30'
                          }`}
                          onClick={() => {
                            const isCollapsing = selectedSentence === originalIndex
                            onSentenceClick(originalIndex)
                          }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <div className={sentenceDisplayMode === 2 && selectedSentence !== originalIndex ? 'invisible' : ''}>
                                {renderOriginalSentence(item)}
                              </div>
                              <div className={`text-ink-600 text-[14px] sentence-text ${sentenceDisplayMode === 1 && selectedSentence !== originalIndex ? 'invisible' : ''}`}>
                                {item.translation_result?.tokenized_translation || ''}
                              </div>
                            </div>
                            <Volume2 className="w-3.5 h-3.5 text-aged-300 hover:text-amber-500 shrink-0 mt-1 transition-colors" onClick={(e) => speakWord(item.sentence || '', e)} />
                          </div>
                        </motion.div>
                        <AnimatePresence>
                          {selectedSentence === originalIndex && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
                              className="overflow-hidden"
                            >
                              <div className="border-t border-aged-200/60 p-4 bg-parchment-50/50">
                                <SentenceDetail
                                  sentenceTranslation={item}
                                  t={t}
                                />
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="py-16 text-center">
                  {sentFetching ? (
                    <Loader2 className="w-7 h-7 mx-auto mb-3 text-aged-300 animate-spin" />
                  ) : (
                    <Languages className="w-10 h-10 mx-auto mb-3 text-aged-200" />
                  )}
                  <p className="text-ink-400 text-sm">{sentFetching ? t.loading : (sentenceSearch ? (t.noMatchingSentences || '没有找到匹配的句子') : (t.noSentencesYetHint || '暂无句子'))}</p>
                </div>
              )}
            </div>
            {renderPagination(sentencePage, sentenceTotalPages, setSentencePage)}
          </div>
        </div>

        <div className="w-full md:w-1/2 snap-item flex flex-col min-h-0 md:overflow-hidden">
          <div className="bg-parchment-50 border-2 border-aged-200 rounded-md shadow-retro-sm overflow-hidden flex flex-col flex-1 min-h-0">
            <div className="px-3 py-2 md:px-5 md:py-3.5 border-b border-aged-200/80 bg-parchment-50/60">
              <div className="flex items-center gap-2 md:gap-3">
                <div className="flex items-center gap-2 shrink-0 md:min-w-[140px]">
                  <div
                    className="flex items-center justify-center w-7 h-7 rounded-md border border-aged-200 bg-parchment-100/60 cursor-pointer active:bg-amber-100 active:border-amber-400 transition-colors duration-150"
                    onClick={(e) => { e.stopPropagation(); setVocabDisplayMode(v => (v + 1) % 3) }}
                    title={vocabDisplayMode === 0 ? t.showAll : vocabDisplayMode === 1 ? t.hideMeaning : vocabDisplayMode === 2 ? t.hideWord : t.showAll}
                  >
                    <BookOpen className="w-4 h-4 text-ink-500" />
                  </div>
                  <h3 className="text-sm font-bold text-ink-700 font-display">
                    <span className="cursor-pointer select-none" onClick={handleToggleGlobalVocab}>
                      <span className={!showGlobalVocab ? tabActiveCls : tabInactiveCls}>{t.vocabList}</span>
                      <span className="text-aged-300 mx-1.5">/</span>
                      <span className={showGlobalVocab ? tabActiveCls : tabInactiveCls}>{t.globalVocabList}</span>
                    </span>
                  </h3>
                  <span className="badge-amber ml-1">
                    {showGlobalVocab ? filteredGlobalVocab.length : vocabTotal}
                  </span>
                </div>
                <div className="relative w-1/2 ml-auto">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-aged-300" />
                  <input
                    type="text"
                    value={vocabSearch}
                    onChange={e => setVocabSearch(e.target.value)}
                    placeholder={t.searchWordOrMeaning || '搜索单词或释义...'}
                    className="input-warm w-full pl-9 pr-3 text-[13px]"
                  />
                </div>
              </div>
            </div>
            <div className="flex-1 flex min-h-0">
              {((!showGlobalVocab && allLetterIndex.length > 1) || (showGlobalVocab && allGlobalLetterIndex.length > 1)) && (
                <div className="flex flex-col items-center gap-px py-1 border-r border-aged-200/60 bg-parchment-50/40 w-5 shrink-0 overflow-y-auto">
                  {(showGlobalVocab ? allGlobalLetterIndex : allLetterIndex).map(letter => {
                    const currentIdx = showGlobalVocab ? globalLetterIndex : letterIndex
                    const onCurrentPage = currentIdx.includes(letter)
                    return (
                      <button
                        key={letter}
                        onClick={() => scrollToLetter(letter)}
                        className={`w-4 h-4 flex items-center justify-center text-[8px] font-bold rounded transition-colors shrink-0 ${
                          onCurrentPage
                            ? 'text-ink-600 hover:text-amber-500 hover:bg-amber-50'
                            : 'text-aged-300/60 hover:text-amber-500 hover:bg-amber-50/50'
                        }`}
                      >
                        {letter}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="flex-1 overflow-y-scroll min-h-0" ref={vocabListRef} style={{ scrollbarGutter: 'stable' }}>
              {showGlobalVocab ? (
                globalVocabLoading ? (
                  <div className="py-16 text-center">
                    <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-amber-400" />
                    <p className="text-ink-400 text-sm">{t.loading}</p>
                  </div>
                ) : groupedGlobalVocab.length === 0 ? (
                  <div className="py-16 text-center">
                    <BookOpen className="w-10 h-10 mx-auto mb-3 text-aged-200" />
                    <p className="text-ink-400 text-sm">{vocabSearch ? (t.noMatchFound || '没有找到匹配的单词') : (t.noWordsYetHint || '暂无单词')}</p>
                  </div>
                ) : (
                <div className="space-y-3">
                  {groupedGlobalVocab.map(([letter, words], groupIdx) => (
                    <div key={letter} id={`dict-group-${letter}`}>
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: groupIdx * 0.04 }}
                        className="sticky top-0 z-10 backdrop-blur-sm bg-parchment-50/80 px-4 py-1.5 border-b border-aged-200/40 mb-1"
                      >
                        <span className="text-xs font-bold text-amber-500/80 tracking-widest">{letter}</span>
                      </motion.div>
                      <div className="space-y-px">
                        {words.map((word, index) => {
                          const wordKey = word.word
                          const isExpanded = expandedWord === `global-${wordKey}`
                          const isLoading = loadingWords[`global-${wordKey}`]
                          const detail = wordDetails[`global-${wordKey}`]
                          return (
                            <motion.div
                              key={wordKey}
                              data-global-word-key={wordKey}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: groupIdx * 0.03 + index * 0.015 }}
                              className="bg-parchment-50"
                            >
                              <button
                                onClick={() => handleGlobalVocabWordClick(word)}
                                className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-amber-50/40 transition-colors group"
                              >
                                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap select-text">
                                  <span className={`text-[14px] font-bold text-ink-800 tracking-tight shrink-0 ${vocabDisplayMode === 2 && !isExpanded ? 'invisible' : ''}`}>
                                    {word.word}
                                  </span>
                                  {word.ipa && (
                                    <span className={`text-[11px] text-ink-400 ipa-font shrink-0 ${vocabDisplayMode === 2 && !isExpanded ? 'invisible' : ''}`}>
                                      {word.ipa.startsWith('/') ? word.ipa : `/${word.ipa}/`}
                                    </span>
                                  )}
                                  {word.part_of_speech && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-parchment-100 text-ink-500 rounded font-medium tracking-wide shrink-0">
                                      {word.part_of_speech}
                                    </span>
                                  )}
                                  <span className={`text-[12px] text-ink-500 truncate ${vocabDisplayMode === 1 && !isExpanded ? 'invisible' : ''}`}>
                                    {meaningOverrides[wordKey] || word.meaning}
                                  </span>
                                </div>
                                {isExpanded && (
                                  <RefreshCw
                                    className="w-3.5 h-3.5 text-aged-300 hover:text-amber-500 shrink-0 transition-colors"
                                    onClick={(e) => { e.stopPropagation(); handleRegenerateWord(wordKey, true) }}
                                  />
                                )}
                                <FavoriteButton word={word.word} sourceLang={actualSourceLang} t={t} initialFavorited={favoriteWords.includes(word.word.toLowerCase())} onFavoriteChange={handleFavoriteChange} />
                                <Volume2
                                  className="w-3.5 h-3.5 text-aged-300 hover:text-amber-500 shrink-0 transition-colors"
                                  onClick={(e) => speakWord(word.word, e)}
                                />
                              </button>
                              <AnimatePresence>
                                {isExpanded && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    transition={{ duration: 0.2 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="px-4 pb-3.5 border-t border-parchment-100/80">
                                      {isLoading ? (
                                        <div className="pt-4 flex flex-col items-center justify-center gap-3">
                                          <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                                          <p className="text-[12px] text-ink-400">{t.generatingWordDetails || '正在生成单词详解...'}</p>
                                        </div>
                                      ) : detail ? (
                                        <div className="pt-3">
                                          <div className="mb-2">
                                            <h3 className="label-warm mb-0.5 flex items-center gap-1">
                                              <Brain className="w-3 h-3 text-amber-500" />
                                              {t.definition || '释义'}
                                            </h3>
                                            <p className="text-[13px] text-ink-700 leading-relaxed">
                                              {detail.enriched_meaning || detail.meaning || detail.context_meaning}
                                            </p>
                                          </div>
                                          <WordDetail word={detail} t={t} onSentenceClick={handleSentenceJump} sourceLang={actualSourceLang} hideContextSentences={showGlobalVocab} hideDefinition />
                                        </div>
                                      ) : (
                                        <div className="pt-3 text-center text-ink-400 text-[12px]">
                                          {t.noDetails || '暂无详情'}
                                        </div>
                                      )}
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </motion.div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
                )
              ) : (
              <>
              {groupedVocab.length === 0 ? (
                <div className="py-16 text-center">
                  {vocabFetching ? (
                    <Loader2 className="w-7 h-7 mx-auto mb-3 text-aged-300 animate-spin" />
                  ) : (
                    <BookOpen className="w-10 h-10 mx-auto mb-3 text-aged-200" />
                  )}
                  <p className="text-ink-400 text-sm">{vocabFetching ? t.loading : (vocabSearch ? (t.noMatchFound || '没有找到匹配的单词') : (t.noWordsYetHint || '暂无单词'))}</p>
                </div>
              ) : (
              <div className="space-y-3">
                {groupedVocab.map(([letter, words], groupIdx) => (
                  <div key={letter} id={`dict-group-${letter}`}>
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: groupIdx * 0.04 }}
                      className="sticky top-0 z-10 backdrop-blur-sm bg-parchment-50/80 px-4 py-1.5 border-b border-aged-200/40 mb-1"
                    >
                      <span className="text-xs font-bold text-amber-500/80 tracking-widest">{letter}</span>
                    </motion.div>
                    <div className="space-y-px">
                      {words.map((word, index) => {
                        const wordKey = word.word
                        const isExpanded = expandedWord === wordKey
                        const isLoading = loadingWords[wordKey]
                        const detail = wordDetails[wordKey]
                        // 两阶段：若是从句子点击进来的，用该句 token 的释义/词性/音标覆盖条目行展示。
                        // 详情区（WordDetail）不受影响，始终用全局 detail。
                        const ctx = (activeSentenceContext && activeSentenceContext.wordKey === wordKey) ? activeSentenceContext : null
                        const displayMeaning = ctx ? (ctx.meaning || meaningOverrides[word.word] || word.meaning || word.context_meaning) : (meaningOverrides[word.word] || word.meaning || word.context_meaning)
                        const displayMorphology = ctx ? (ctx.morphology || word.morphology) : word.morphology
                        const displayIpa = ctx ? (ctx.phonetic || word.ipa) : word.ipa

                        return (
                          <motion.div
                            key={wordKey}
                            ref={el => { wordRefs.current[wordKey] = el }}
                            data-word-key={wordKey}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: groupIdx * 0.03 + index * 0.015 }}
                            className="bg-parchment-50"
                            >
                              <button
                                onClick={() => handleVocabWordClick(word)}
                                className="w-full text-left px-4 py-2.5 flex items-center gap-2 hover:bg-amber-50/40 transition-colors group"
                            >
                              <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap select-text">
                                <span className={`text-[14px] font-bold text-ink-800 tracking-tight shrink-0 ${vocabDisplayMode === 2 && !isExpanded ? 'invisible' : ''}`}>
                                  {word.word}
                                </span>
                                {displayIpa && (
                                  <span className={`text-[11px] text-ink-400 ipa-font shrink-0 ${vocabDisplayMode === 2 && !isExpanded ? 'invisible' : ''}`}>
                                    {displayIpa.startsWith('/') ? displayIpa : `/${displayIpa}/`}
                                  </span>
                                )}
                                {displayMorphology && (
                                  <span className="text-[10px] px-1.5 py-0.5 bg-parchment-100 text-ink-500 rounded font-medium tracking-wide shrink-0">
                                    {displayMorphology}
                                  </span>
                                )}
                                <span className={`text-[12px] text-ink-500 truncate ${vocabDisplayMode === 1 && !isExpanded ? 'invisible' : ''}`}>
                                  {displayMeaning}
                                </span>
                              </div>
                              {isExpanded && (
                                <RefreshCw
                                  className="w-3.5 h-3.5 text-aged-300 hover:text-amber-500 shrink-0 transition-colors"
                                  onClick={(e) => { e.stopPropagation(); handleRegenerateWord(wordKey, false) }}
                                />
                              )}
                              <FavoriteButton word={word.word} sourceLang={actualSourceLang} t={t} initialFavorited={favoriteWords.includes(word.word.toLowerCase())} onFavoriteChange={handleFavoriteChange} />
                              <Volume2
                                className="w-3.5 h-3.5 text-aged-300 hover:text-amber-500 shrink-0 transition-colors"
                                onClick={(e) => speakWord(word.word, e)}
                              />
                            </button>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  transition={{ duration: 0.2 }}
                                  className="overflow-hidden"
                                >
                                  <div className="px-4 pb-3.5 border-t border-parchment-100/80">
                                    {isLoading ? (
                                      <div className="pt-4 flex flex-col items-center justify-center gap-3">
                                        <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                                        <p className="text-[12px] text-ink-400">{t.generatingWordDetails || '正在生成单词详解...'}</p>
                                      </div>
                                    ) : detail ? (
                                      <div className="pt-3">
                                        <div className="mb-2">
                                          <h3 className="label-warm mb-0.5 flex items-center gap-1">
                                            <Brain className="w-3 h-3 text-amber-500" />
                                            {t.definition || '释义'}
                                          </h3>
                                          <p className="text-[13px] text-ink-700 leading-relaxed">
                                            {detail.enriched_meaning || detail.meaning || detail.context_meaning}
                                          </p>
                                        </div>
                                        <WordDetail word={detail} t={t} onSentenceClick={handleSentenceJump} sourceLang={sourceLang} hideDefinition />
                                      </div>
                                    ) : (
                                      <div className="pt-3 text-center text-ink-400 text-[12px]">
                                        {t.noDetails || '暂无详情'}
                                      </div>
                                    )}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </motion.div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
              )}
              </>
              )}
              </div>
            </div>
            {showGlobalVocab
              ? renderPagination(globalVocabPage, globalVocabTotalPages, setGlobalVocabPage)
              : renderPagination(vocabPage, vocabTotalPages, setVocabPage)
            }
          </div>
        </div>
      </div>

      {/* 手机端底部窄横杠分段指示器：左=句子翻译 右=单词分表，点击切换 */}
      {!isDesktop && (
        <div className="flex gap-1 px-2 py-1 bg-parchment-50 border-t border-aged-200 md:hidden">
          <button
            onClick={() => switchPanel(0)}
            aria-label={t.sentTranslation || '句子翻译'}
            className={`h-1 flex-1 rounded-full transition-colors ${activePanel === 0 ? 'bg-amber-500' : 'bg-aged-200'}`}
          />
          <button
            onClick={() => switchPanel(1)}
            aria-label={t.vocabList || '单词分表'}
            className={`h-1 flex-1 rounded-full transition-colors ${activePanel === 1 ? 'bg-amber-500' : 'bg-aged-200'}`}
          />
        </div>
      )}
    </motion.div>
  )
}

export default DictionaryStep
