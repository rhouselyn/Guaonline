import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { BookOpen, ArrowLeft, Settings, Loader2, Home, User, ListChecks, LogOut, Zap, KeyRound, RefreshCw } from 'lucide-react'
import { api } from '../utils/api'
import { translations } from '../utils/translations'
import { warmupSpeech } from '../utils/speech'
import { auth } from '../utils/auth'
import { useMediaQuery } from '../utils/useMediaQuery'
import ConfirmDialog from '../components/ConfirmDialog'
import AlertDialog from '../components/AlertDialog'
import AccountMenu from '../components/AccountMenu'

import InputStep from '../components/InputStep'
import DictionaryStep from '../components/DictionaryStep'
import LearningStep from '../components/LearningStep'
import ProgressStep from '../components/ProgressStep'
import SentenceQuizStep from '../components/SentenceQuizStep'
import ListeningQuizStep from '../components/ListeningQuizStep'
import PhaseSelectorStep from '../components/PhaseSelectorStep'
import PhaseProgressStep from '../components/PhaseProgressStep'
import MaskedSentenceExerciseStep from '../components/MaskedSentenceExerciseStep'
import TranslationReconstructionStep from '../components/TranslationReconstructionStep'
import AllUnitsStep from '../components/AllUnitsStep'
import UnitCompleteStep from '../components/UnitCompleteStep'
import VocabListStep from '../components/VocabListStep'
import HistorySidebar from '../components/HistorySidebar'
import WordListPanel from '../components/WordListPanel'
import SettingsModal from '../components/SettingsModal'
import ChangePasswordModal from '../components/ChangePasswordModal'

function FrogLogo({ size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="50" cy="58" rx="38" ry="32" fill="#B5AE8E" />
      <ellipse cx="50" cy="55" rx="34" ry="28" fill="#D8D4BF" />
      <circle cx="34" cy="38" r="16" fill="#B5AE8E" />
      <circle cx="66" cy="38" r="16" fill="#B5AE8E" />
      <circle cx="34" cy="38" r="13" fill="#fff" />
      <circle cx="66" cy="38" r="13" fill="#fff" />
      <circle cx="36" cy="37" r="6" fill="#524D3C" />
      <circle cx="68" cy="37" r="6" fill="#524D3C" />
      <circle cx="38" cy="35" r="2" fill="#fff" />
      <circle cx="70" cy="35" r="2" fill="#fff" />
      <ellipse cx="50" cy="62" rx="18" ry="8" fill="#E8C985" />
      <path d="M38 60 Q50 70 62 60" stroke="#524D3C" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  )
}

function App() {
  const navigate = useNavigate()
  const [currentUser, setCurrentUser] = useState(null)
  const [step, setStep] = useState('input')
  const [text, setText] = useState('')
  const [sourceLang, setSourceLang] = useState('auto')
  const [detectedLang, setDetectedLang] = useState(null)
  const [targetLang, setTargetLang] = useState('zh')
  const [uiLang, setUiLang] = useState('zh')
  const [customTranslations, setCustomTranslations] = useState({})
  const [translatingUI, setTranslatingUI] = useState(false)
  const [loadedLangs, setLoadedLangs] = useState(new Set())
  const [pageSize, setPageSize] = useState(50)
  const [loading, setLoading] = useState(false)
  const [fileId, setFileId] = useState(null)
  const [originalText, setOriginalText] = useState('')
  const [entryPrompt, setEntryPrompt] = useState('')
  const [vocab, setVocab] = useState([])
  const [displayVocab, setDisplayVocab] = useState([])
  const [sortOrder, setSortOrder] = useState('asc') // 'asc' 或 'desc'
  const [sentenceTranslations, setSentenceTranslations] = useState([])
  // ponytail: 生成进度长度信号——DictionaryStep 按页自取，长度变化触发 refetch 当前页
  const [vocabLength, setVocabLength] = useState(0)
  const [sentenceLength, setSentenceLength] = useState(0)
  const [selectedWord, setSelectedWord] = useState(null)
  const [selectedSentence, setSelectedSentence] = useState(null)
  const [progress, setProgress] = useState(0)
  const [processingInfo, setProcessingInfo] = useState(null)
  const [currentFileId, setCurrentFileId] = useState(null)
  const [skipPolling, setSkipPolling] = useState(false)
  const [learningData, setLearningData] = useState(null)
  const [showWordCard, setShowWordCard] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [selectedOption, setSelectedOption] = useState(null)
  const [isCorrect, setIsCorrect] = useState(null)
  const [units, setUnits] = useState([])
  const [currentUnit, setCurrentUnit] = useState(0)
  const [totalUnits, setTotalUnits] = useState(0)
  const [allUnitsCompleted, setAllUnitsCompleted] = useState(false)
  const [quizData, setQuizData] = useState(null)
  const [listeningQuizData, setListeningQuizData] = useState(null)
  const [learningMode, setLearningMode] = useState('word')
  const [unitErrorCount, setUnitErrorCount] = useState(0)
  const [wrongItems, setWrongItems] = useState([])
  const [reviewMode, setReviewMode] = useState(false)
  const [reviewIndex, setReviewIndex] = useState(0)
  const [reviewRound, setReviewRound] = useState(0)
  
  // New states for phases
  const [phases, setPhases] = useState([])
  const [currentPhase, setCurrentPhase] = useState(null)
  const [phaseUnits, setPhaseUnits] = useState([])
  const [currentPhaseUnit, setCurrentPhaseUnit] = useState(0)
  const [currentExerciseData, setCurrentExerciseData] = useState(null)
  const [exerciseType, setExerciseType] = useState(null)
  // New state for all units
  const [phase1Units, setPhase1Units] = useState([])
  const [phase2Units, setPhase2Units] = useState([])
  const [currentPhase1Unit, setCurrentPhase1Unit] = useState(0)
  const [currentPhase2Unit, setCurrentPhase2Unit] = useState(0)
  const [unitEndIndex, setUnitEndIndex] = useState(null)
  const [completedUnitId, setCompletedUnitId] = useState(null)
  const [completedPhase, setCompletedPhase] = useState(1)
  const [unitStarCounts, setUnitStarCounts] = useState({})
  const unitErrorCountRef = useRef(0)
  const isFetchingNextRef = useRef(false)
  // ponytail: 预加载下一道题——做题时后台拉取下一题并缓存，点击"下一题"时直接命中缓存
  // prefetchedNextRef: { gen, promise, bundle } | null
  const prefetchedNextRef = useRef(null)
  const prefetchGenRef = useRef(0)
  const isPrefetchingRef = useRef(false)
  const [skipListening, setSkipListening] = useState(false)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [onlyNewWords, setOnlyNewWords] = useState(false)
  const [generatingUnits, setGeneratingUnits] = useState(new Set())
  const [lastActiveTab, setLastActiveTab] = useState(0)
  const [recentLanguages, setRecentLanguages] = useState([])
  const [wordListLang, setWordListLang] = useState(null)
  const [favoriteLang, setFavoriteLang] = useState(null)
  const [confirmDialog, setConfirmDialog] = useState({ isOpen: false, onConfirm: null })
  const [alertDialog, setAlertDialog] = useState({ open: false, title: '', message: '' })
  // 字体缩放：移动端 / 桌面端分别保存，学习页基础字号 14px
  const [fontScaleMobile, setFontScaleMobile] = useState(1)
  const [fontScaleDesktop, setFontScaleDesktop] = useState(1)
  const isDesktop = useMediaQuery('(min-width: 768px)')
  // 移动端底部导航 tab：home/details/quiz/profile
  const [mobileTab, setMobileTab] = useState('home')

  // === 浏览器历史导航：每个 step 变化压入历史栈，支持回退/前进 ===
  const isPopstateRef = useRef(false)
  const lastHistoryStepRef = useRef('input')

  const showAlert = useCallback((message, title) => {
    setAlertDialog({ open: true, title: title || '', message })
  }, [])
  const [inputMode, setInputMode] = useState('direct')
  const [preprocessStatus, setPreprocessStatus] = useState(null)
  const [showVocabList, setShowVocabList] = useState(false)
  const [fileTitle, setFileTitle] = useState('')
  const learningContainerRef = useRef(null)
  const dictStateRef = useRef({ vocabPage: 1, sentencePage: 1, globalVocabPage: 1, vocabScrollPos: 0, sentenceTranslationScrollPos: 0, sentenceOriginalScrollPos: 0, globalVocabScrollPos: 0, vocabDisplayMode: 0, sentenceDisplayMode: 0, showOriginal: false, showGlobalVocab: false, vocabSearch: '', sentenceSearch: '' })
  const wrongItemsRef = useRef([])
  const reviewIndexRef = useRef(0)

  const learningSteps = ['dictionary', 'all-units', 'learning', 'sentence-quiz', 'listening-quiz', 'progress', 'phase-progress', 'phase-exercise', 'unit-complete']

  useEffect(() => {
    warmupSpeech()
    auth.fetchUser().then(user => {
      if (user) setCurrentUser(user)
    }).catch(() => {})
    api.getUserPreferences().then(prefs => {
      if (prefs.target_lang) setTargetLang(prefs.target_lang)
      if (prefs.ui_lang) setUiLang(prefs.ui_lang)
      else if (prefs.target_lang) setUiLang(prefs.target_lang)
      if (prefs.skip_listening !== undefined) setSkipListening(prefs.skip_listening)
      if (prefs.only_new_words !== undefined) setOnlyNewWords(prefs.only_new_words)
      if (prefs.recent_languages) {
        setRecentLanguages(prefs.recent_languages)
      }
      if (prefs.page_size) setPageSize(prefs.page_size)
      if (prefs.font_scale_mobile !== undefined && prefs.font_scale_mobile !== null) setFontScaleMobile(prefs.font_scale_mobile)
      if (prefs.font_scale_desktop !== undefined && prefs.font_scale_desktop !== null) setFontScaleDesktop(prefs.font_scale_desktop)
    }).catch(() => {})
  }, [])

  // === 字体缩放：应用到 documentElement ===
  // ponytail: 移动端基础字号 15px（原 12.6px）——更贴近原生 App 的正文字号（iOS 17pt / Material 16sp），
  // 同时所有 rem-based 间距（px-4、py-2 等）会按比例放大，整体更"有呼吸感"。
  // 桌面端保持 14px。fontScaleMobile / fontScaleDesktop 用户可调。
  // 依赖 showSettings：设置弹窗关闭时重新应用已保存值，撤销弹窗内的实时预览
  useEffect(() => {
    const scale = isDesktop ? fontScaleDesktop : fontScaleMobile
    document.documentElement.style.fontSize = `${(isDesktop ? 14 : 15) * scale}px`
    return () => {
      // 离开学习页时恢复浏览器默认 16px
      document.documentElement.style.fontSize = ''
    }
  }, [isDesktop, fontScaleMobile, fontScaleDesktop, showSettings])

  // === 浏览器历史导航：popstate 监听（回退/前进）===
  useEffect(() => {
    const handlePopState = (event) => {
      const targetStep = event.state?.step
      if (targetStep && targetStep !== lastHistoryStepRef.current) {
        isPopstateRef.current = true
        lastHistoryStepRef.current = targetStep
        // 关闭可能打开的弹窗，避免历史导航后残留
        setConfirmDialog({ isOpen: false, onConfirm: null })
        setAlertDialog({ open: false, title: '', message: '' })
        setStep(targetStep)
      }
    }
    window.addEventListener('popstate', handlePopState)
    // 初始化当前历史条目的 state，使 popstate 能读到 step
    window.history.replaceState({ step: 'input' }, '')
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // === 浏览器历史导航：step 变化时压入历史栈 ===
  useEffect(() => {
    // 来自 popstate 的变化不重复压栈
    if (isPopstateRef.current) {
      isPopstateRef.current = false
      lastHistoryStepRef.current = step
      return
    }
    if (step !== lastHistoryStepRef.current) {
      lastHistoryStepRef.current = step
      window.history.pushState({ step }, '')
    }
  }, [step])

  useEffect(() => {
    if (!currentFileId) return
    if (learningSteps.includes(step)) {
      api.startWordGen(currentFileId).catch(() => {})
    } else if (step === 'input') {
      api.stopWordGen(currentFileId).catch(() => {})
    }
  }, [step, currentFileId])

  useEffect(() => {
    if (learningContainerRef.current) {
      learningContainerRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }, [step, currentExerciseData, learningData, quizData, listeningQuizData])

  // ponytail: 预加载缓存失效——切条目/切跳过听力/切只学新词/进入或退出复习模式时，旧缓存不再有效
  useEffect(() => {
    prefetchGenRef.current++
    prefetchedNextRef.current = null
  }, [currentFileId, skipListening, onlyNewWords, reviewMode])

  const updateUnitStars = (key, starCount) => {
    setUnitStarCounts(prev => {
      const updated = { ...prev, [key]: starCount }
      if (currentFileId) {
        api.saveUnitStars(currentFileId, { [key]: updated[key] }).catch(err => {
          console.error('Failed to save stars:', err)
        })
      }
      return updated
    })
  }
  
  // 获取当前语言的翻译 - 保持上一个语言作为过渡，不回退到中文
  const lastValidTRef = useRef(translations.zh)

  const zhBase = customTranslations.zh || translations.zh
  // ponytail: 内置语言直接用，不走LLM翻译
  const builtinT = translations[uiLang]
  let t
  if (customTranslations[uiLang]) {
    t = { ...zhBase, ...customTranslations[uiLang] }
    lastValidTRef.current = t
  } else if (builtinT) {
    t = { ...zhBase, ...builtinT }
    lastValidTRef.current = t
  } else {
    // 新语言还没加载完，保持上一个已加载的语言
    t = lastValidTRef.current
  }

  // Fetch translations when uiLang changes (all languages go through API for consistency)
  useEffect(() => {
    // ponytail: 内置语言不需要LLM翻译
    if (translations[uiLang]) return
    if (loadedLangs.has(uiLang)) return
    
    setLoadedLangs(prev => new Set([...prev, uiLang]))
    setTranslatingUI(true)
    
    // Poll for translations (backend may return pending status while LLM is generating)
    const pollTranslation = async () => {
      try {
        const data = await api.translateUI(uiLang)
        
        if (data._status === 'pending') {
          // LLM still generating, poll again in 2 seconds
          setTimeout(pollTranslation, 2000)
          return
        }
        
        if (data._error || data._lang_code === null) {
          // Translation failed, allow retry
          setLoadedLangs(prev => { const next = new Set(prev); next.delete(uiLang); return next })
          setTranslatingUI(false)
          return
        }
        
        // Translation succeeded
        setCustomTranslations(prev => ({ ...prev, [uiLang]: data }))
        setTranslatingUI(false)
      } catch (err) {
        console.error('[i18n] Failed to fetch translations for:', uiLang, err)
        setLoadedLangs(prev => { const next = new Set(prev); next.delete(uiLang); return next })
        setTranslatingUI(false)
      }
    }
    
    pollTranslation()
  }, [uiLang])

  useEffect(() => {
    if (vocab.length > 0) {
      sortVocab()
    }
  }, [vocab, sortOrder])

  useEffect(() => {
    if (generatingUnits.size === 0 || !currentFileId) return

    const interval = setInterval(async () => {
      try {
        const phase1UnitsData = await api.getPhaseUnits(currentFileId, 1)
        const newGenUnits = new Set()
        phase1UnitsData.units.forEach((u, i) => { if (u.generating) newGenUnits.add(i) })
        setGeneratingUnits(newGenUnits)
        if (newGenUnits.size === 0) {
          setPhase1Units(phase1UnitsData.units)
          setCurrentPhase1Unit(phase1UnitsData.current_unit)
        }
      } catch (e) {}
    }, 3000)

    return () => clearInterval(interval)
  }, [generatingUnits, currentFileId])

  // Keep refs in sync with state for use in goToNextReviewItem
  useEffect(() => {
    wrongItemsRef.current = wrongItems
  }, [wrongItems])

  useEffect(() => {
    reviewIndexRef.current = reviewIndex
  }, [reviewIndex])

  // 轮询处理状态
  useEffect(() => {
    // 退出条目（回到 input 步骤）时不轮询：只有当前条目内才继续 LLM 生成标题/语言/句子/单词等
    if (!currentFileId || skipPolling || step === 'input') return

    console.log('开始轮询，文件ID:', currentFileId)

    let pollCount = 0
    const maxPolls = 300 // 10分钟
    let pollingInterval = null

    const pollStatus = async () => {
      pollCount++
      console.log(`第${pollCount}次轮询，文件ID: ${currentFileId}`)

      try {
        const status = await api.getStatus(currentFileId)
        console.log('状态响应:', status)

        // 用 total_sentences + current_sentence 作为 refetch 触发信号。
        // 后端句子分割后立即写 DB，total_sentences > 0 即触发首次 refetch 显示句子列表；
        // current_sentence 增加表示有新翻译完成，触发 refetch 补充翻译结果。
        if (status.total_sentences !== undefined && status.total_sentences > 0) {
          const signal = status.total_sentences * 1000 + (status.current_sentence || 0)
          if (signal !== sentenceLength) {
            setSentenceLength(signal)
          }
        }
        if (status.vocab) {
          setVocabLength(status.vocab.length)
        }

        // 更新进度
        if (status.progress !== undefined) {
          setProgress(status.progress)
        }

        // 更新预处理状态
        if (status.preprocess === 'translating') {
          setPreprocessStatus('translating')
        } else if (status.preprocess === 'generating') {
          setPreprocessStatus('generating')
        } else if (status.preprocess === 'detecting') {
          setPreprocessStatus('detecting')
        } else if (status.preprocess === 'refilling') {
          setPreprocessStatus('refilling')
        } else {
          setPreprocessStatus(null)
        }

        // 更新标题（后台任务生成后）
        if (status.title) {
          setFileTitle(status.title)
        }

        // 更新检测到的语言（auto模式检测完成后）
        if (status.source_lang && status.source_lang !== 'auto') {
          setDetectedLang(status.source_lang)
          // 非auto模式下也更新 sourceLang
          if (sourceLang !== 'auto') {
            setSourceLang(status.source_lang)
          }
        }

        // 更新完整原文（LLM翻译/生成后的文本）
        if (status.original_text) {
          setOriginalText(status.original_text)
        }

        // 更新处理信息
        if (status.current_sentence !== undefined && status.total_sentences !== undefined) {
          setProcessingInfo({
            current: status.current_sentence,
            total: status.total_sentences
          })
        }

        if (status.status === 'completed') {
          console.log('处理完成，词汇表长度:', status.vocab ? status.vocab.length : 0)
          setVocabLength(status.vocab ? status.vocab.length : 0)
          // 最终触发一次 refetch 确保拿到完整翻译结果
          if (status.total_sentences) {
            setSentenceLength(status.total_sentences * 1000 + (status.total_sentences + 1))
          }
          setProgress(100)
          setProcessingInfo(null)
          setLoading(false)
          setSkipPolling(true)
          setHistoryRefresh(v => v + 1)
          // 停止轮询
          if (pollingInterval) {
            clearInterval(pollingInterval)
          }
        } else if (status.status === 'error') {
          console.error('处理错误:', status.error)
          setLoading(false)
          setSkipPolling(true)
          setPreprocessStatus(null)
          // 停止轮询
          if (pollingInterval) {
            clearInterval(pollingInterval)
          }
          const errMsg = status.error || ''
          // 单句失败（partial）：自动触发重试并恢复轮询，避免必须重新进入条目
          if (status.partial && status.failed_sentences && status.failed_sentences.length > 0) {
            const failedList = status.failed_sentences.map(f => `#${f.index + 1}`).join(', ')
            showAlert(`${status.error || ''}\n失败句子：${failedList}\n已自动重试失败句子。`)
            api.retryFailedSentences(currentFileId).catch(() => {})
            // 恢复轮询，等待重试完成
            setSkipPolling(false)
            pollCount = 0  // 重置计数，给重试新一轮 10 分钟
          } else if (errMsg.includes('API Key') || errMsg.includes('Key')) {
            setStep('input')
            showAlert(t.processFailed || '处理失败，请重试')
          } else {
            setStep('input')
            showAlert(t.processFailed || '处理失败，请重试')
          }
        } else if (pollCount >= maxPolls) {
          console.error('轮询超时')
          showAlert(t.processTimeout || '处理超时，请重试')
          setLoading(false)
          setSkipPolling(true)
          // 停止轮询
          if (pollingInterval) {
            clearInterval(pollingInterval)
          }
        }
      } catch (error) {
        console.error('轮询错误:', error)
        if (error.response && error.response.status === 404) {
          // 后端重启或状态丢失，立即停止轮询
          console.log('状态丢失(404)，停止轮询')
          setLoading(false)
          setSkipPolling(true)
          if (pollingInterval) {
            clearInterval(pollingInterval)
          }
        } else if (error.response && (error.response.status === 504 || error.response.status === 502 || error.response.status === 503)) {
          console.log('后端繁忙，继续轮询...')
        } else if (pollCount >= maxPolls) {
          showAlert(t.networkError || '网络错误，请重试')
          setLoading(false)
          setSkipPolling(true)
          if (pollingInterval) {
            clearInterval(pollingInterval)
          }
        }
      }
    }

    // 设置轮询间隔：1 秒。注意 handleNavigateToRecord 已在进入条目时手动拉过一次 status，
    // 这里不再立即调用 pollStatus()，避免 1 秒内重复请求。
    pollingInterval = setInterval(pollStatus, 1000)
    // 若不是从历史记录进入（如刚提交文本），则手动拉一次首次状态
    if (!skipPolling) pollStatus()

    // 清理函数
    return () => {
      if (pollingInterval) {
        clearInterval(pollingInterval)
      }
    }
  }, [currentFileId, skipPolling, step])

  const sortVocab = () => {
    const sorted = [...vocab].sort((a, b) => {
      const wordA = a.word.toLowerCase()
      const wordB = b.word.toLowerCase()
      return sortOrder === 'asc' ? wordA.localeCompare(wordB) : wordB.localeCompare(wordA)
    })
    setDisplayVocab(sorted)
  }

  const toggleSortOrder = () => {
    setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')
  }

  const handleSentenceClick = (index) => {
    setSelectedSentence(prev => prev === index ? null : index)
  }

  const handleCloseSentenceDetail = () => {
    setSelectedSentence(null)
  }

  const handleProcess = async () => {
    if (!text.trim()) return

    setSkipPolling(false)
    setLoading(true)
    setDetectedLang(null)
    setProgress(0)
    setProcessingInfo(null)
    setVocab([])
    setDisplayVocab([])
    setSentenceTranslations([])
    setSelectedWord(null)
    setSelectedSentence(null)
    setSelectedOption(null)
    setIsCorrect(null)
    setCurrentFileId(null)
    setFileId(null)
    setFileTitle('')
    setOriginalText('')
    setEntryPrompt('')
    // 重置字典状态，避免显示上一个条目的残留
    dictStateRef.current = { vocabPage: 1, sentencePage: 1, globalVocabPage: 1, vocabScrollPos: 0, sentenceTranslationScrollPos: 0, sentenceOriginalScrollPos: 0, globalVocabScrollPos: 0, vocabDisplayMode: 0, sentenceDisplayMode: 0, showOriginal: false, showGlobalVocab: false, vocabSearch: '', sentenceSearch: '' }

    if (inputMode === 'translate') {
      setPreprocessStatus('translating')
    } else if (inputMode === 'generate') {
      setPreprocessStatus('generating')
    } else if (sourceLang === 'auto') {
      setPreprocessStatus('detecting')
    } else {
      setPreprocessStatus(null)
    }
    
    setStep('dictionary')
    
    try {
      // 所有模式统一调用 processText，翻译/生成/语言检测在后台执行，不会超时
      const response = await api.processText(text.trim(), sourceLang, targetLang, inputMode)
      
      if (response && response.file_id) {
        const fileId = response.file_id
        setFileId(fileId)
        setCurrentFileId(fileId)
        if (response.title) setFileTitle(response.title)
        // 直接输入模式：原文就是用户输入的文本，立即设置
        if (inputMode === 'direct') {
          setOriginalText(text.trim())
        } else {
          // translate/generate 模式：用户输入即为 prompt
          setEntryPrompt(text.trim())
        }
        // 刷新额度信息
        auth.fetchUser().catch(() => {})
        api.getUserPreferences().then(prefs => {
          if (prefs.recent_languages) setRecentLanguages(prefs.recent_languages)
        }).catch(() => {})
        // 立即刷新历史记录，让用户可以退出后重新进入
        setHistoryRefresh(v => v + 1)
      } else {
        throw new Error('无效的API响应')
      }
    } catch (error) {
      console.error('处理文本错误:', error)
      setPreprocessStatus(null)
      setStep('input')
      if (error.response && error.response.status === 400) {
        showAlert(t.badRequest || '请求参数错误')
      } else if (error.response && error.response.status === 402) {
        const detail = error.response?.data?.detail || '额度不足'
        showAlert(detail, '额度不足')
      } else if (error.response && error.response.status === 429) {
        const detail = error.response.data?.detail
        const msg = (detail && t?.[detail]) || t?.rateLimitExceeded || '请求过于频繁，请稍后再试'
        showAlert(msg)
      } else if (error.response && error.response.status === 504) {
        showAlert(t.networkTimeout || '网络连接超时，请检查网络连接后重试')
      } else if (error.message && error.message.includes('timeout')) {
        showAlert(t.processTimeout || '处理超时，请稍后重试')
      } else {
        showAlert(t.processFailed || '处理失败，请重试')
      }
      setLoading(false)
    }
  }

  const startLearning = async () => {
    if (!currentFileId) return
    
    setLoading(true)
    try {
      // 获取学习进度和分组信息
      const progressData = await api.getLearningProgress(currentFileId)
      setUnits(progressData.units)
      setCurrentUnit(progressData.current_unit)
      setTotalUnits(progressData.total_units)
      setAllUnitsCompleted(progressData.all_units_completed)
      setStep('progress')
    } catch (error) {
      console.error('开始学习错误:', error)
      showAlert(t.cannotStartLearning || '无法开始学习，请重试')
    } finally {
      setLoading(false)
    }
  }

  const startLearningPhases = async () => {
    if (!currentFileId) return
    
    setLoading(true)
    try {
      const [phase1UnitsData, phase2UnitsData, starsData] = await Promise.all([
        api.getPhaseUnits(currentFileId, 1),
        api.getPhaseUnits(currentFileId, 2),
        api.getUnitStars(currentFileId)
      ])
      
      setPhase1Units(phase1UnitsData.units)
      setPhase2Units(phase2UnitsData.units)
      setCurrentPhase1Unit(phase1UnitsData.current_unit)
      setCurrentPhase2Unit(phase2UnitsData.current_unit)
      setUnitStarCounts(starsData.stars || {})
      const genUnits = new Set()
      phase1UnitsData.units.forEach((u, i) => { if (u.generating) genUnits.add(i) })
      setGeneratingUnits(genUnits)
      setStep('all-units')
    } catch (error) {
      console.error('获取单元错误:', error)
      showAlert(t.cannotGetUnits || '无法获取学习单元，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handlePhaseSelect = async (phaseNumber) => {
    if (!currentFileId) return
    
    setLoading(true)
    try {
      setCurrentPhase(phaseNumber)
      if (phaseNumber === 1) {
        // Phase1 is original word learning
        const progressData = await api.getLearningProgress(currentFileId)
        setUnits(progressData.units)
        setCurrentUnit(progressData.current_unit)
        setTotalUnits(progressData.total_units)
        setAllUnitsCompleted(progressData.all_units_completed)
        setStep('progress')
      } else {
        const phaseUnitsData = await api.getPhaseUnits(currentFileId, phaseNumber)
        setPhaseUnits(phaseUnitsData.units)
        setCurrentPhaseUnit(phaseUnitsData.current_unit)
        setStep('phase-progress')
      }
    } catch (error) {
      console.error('选择阶段错误:', error)
      showAlert(t.cannotSelectPhase || '无法选择阶段，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handlePhase1UnitClick = async (unitId) => {
    if (!currentFileId) return

    setUnitErrorCount(0)
    unitErrorCountRef.current = 0
    setWrongItems([])
    setReviewMode(false)
    setReviewIndex(0)
    setReviewRound(0)
    // 直接进入某单元起点：旧预加载缓存对应的索引已失效，必须清空
    clearPrefetchCache()

    setLoading(true)
    try {
      const unit = phase1Units[unitId]
      const startIndex = unit?.start_index ?? unitId * 10
      await api.setProgress(currentFileId, startIndex)
      const response = await api.getRandomWord(currentFileId)
      if (response.type === 'sentence_quiz') {
        setQuizData(response)
        setUnitEndIndex(response.unit_end_index)
        setLearningMode('sentence')
        setStep('sentence-quiz')
      } else if (response.type === 'listening_quiz') {
        if (skipListening) {
          setLoading(false)
          return getNextWord(0)
        }
        setListeningQuizData(response)
        setUnitEndIndex(response.unit_end_index)
        setLearningMode('listening')
        setStep('listening-quiz')
      } else if (response.type === 'unit_complete' || response.type === 'all_complete') {
        const [phase1UnitsData, phase2UnitsData] = await Promise.all([
          api.getPhaseUnits(currentFileId, 1),
          api.getPhaseUnits(currentFileId, 2)
        ])
        setPhase1Units(phase1UnitsData.units)
        const genUnits = new Set()
        phase1UnitsData.units.forEach((u, i) => { if (u.generating) genUnits.add(i) })
        setGeneratingUnits(genUnits)
        setPhase2Units(phase2UnitsData.units)
        setCurrentPhase1Unit(phase1UnitsData.current_unit)
        setCurrentPhase2Unit(phase2UnitsData.current_unit)
        setCompletedUnitId(unitId)
        setCompletedPhase(1)
        const starCount = Math.max(0, 3 - Math.floor(unitErrorCountRef.current / 3))
        updateUnitStars(`1-${unitId}`, starCount)
        setStep('unit-complete')
      } else {
        setLearningData(response)
        setUnitEndIndex(response.unit_end_index)
        setShowWordCard(false)
        setSelectedOption(null)
        setIsCorrect(null)
        setLearningMode('word')
        setStep('learning')
      }
      // 展示单元首题后，后台预加载下一题（单元完成页除外）
      if (response.type !== 'unit_complete' && response.type !== 'all_complete') {
        schedulePrefetch()
      }
    } catch (error) {
      console.error('获取单元单词错误:', error)
      showAlert(t.cannotGetWords || '无法获取单元单词，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handlePhase2UnitClick = async (unitId) => {
    if (!currentFileId) return
    
    setUnitErrorCount(0)
    unitErrorCountRef.current = 0
    setWrongItems([])
    setReviewMode(false)
    setReviewIndex(0)
    setReviewRound(0)

    setLoading(true)
    try {
      setCurrentPhase(2)
      setCurrentPhaseUnit(unitId)
      await api.setPhaseProgress(currentFileId, 2, unitId, unitId * 10)
      const exerciseData = await api.getPhaseUnitExercise(currentFileId, 2, unitId)
      if (exerciseData.unit_complete) {
        const [phase1UnitsData, phase2UnitsData] = await Promise.all([
          api.getPhaseUnits(currentFileId, 1),
          api.getPhaseUnits(currentFileId, 2)
        ])
        setPhase1Units(phase1UnitsData.units)
        const genUnits = new Set()
        phase1UnitsData.units.forEach((u, i) => { if (u.generating) genUnits.add(i) })
        setGeneratingUnits(genUnits)
        setPhase2Units(phase2UnitsData.units)
        setCurrentPhase1Unit(phase1UnitsData.current_unit)
        setCurrentPhase2Unit(phase2UnitsData.current_unit)
        setCompletedUnitId(unitId)
        setCompletedPhase(2)
        const starCount = Math.max(0, 3 - Math.floor(unitErrorCountRef.current / 3))
        updateUnitStars(`2-${unitId}`, starCount)
        setStep('unit-complete')
      } else {
        setExerciseType(exerciseData.exercise_type)
        setCurrentExerciseData({
          ...exerciseData.data,
          mask_version: exerciseData.mask_version,
          total_masks: exerciseData.total_masks,
          exercise_type_index: exerciseData.exercise_type_index,
          exercise_index_in_unit: exerciseData.exercise_index_in_unit,
          total_exercises_in_unit: exerciseData.total_exercises_in_unit,
          sentence_preview: exerciseData.sentence_preview
        })
        setStep('phase-exercise')
      }
    } catch (error) {
      console.error('获取单元练习错误:', error)
      showAlert(t.cannotGetExercise || '无法获取练习，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handlePhaseUnitClick = async (unitId) => {
    if (!currentFileId || !currentPhase) return
    
    setLoading(true)
    try {
      setCurrentPhaseUnit(unitId)
      const exerciseData = await api.getPhaseUnitExercise(currentFileId, currentPhase, unitId)
      if (exerciseData.unit_complete) {
        setStep('phase-progress')
      } else if (exerciseData.redirect_to_phase1) {
        setStep('progress')
      } else {
        setExerciseType(exerciseData.exercise_type)
        setCurrentExerciseData({
          ...exerciseData.data,
          mask_version: exerciseData.mask_version,
          total_masks: exerciseData.total_masks,
          exercise_type_index: exerciseData.exercise_type_index,
          exercise_index_in_unit: exerciseData.exercise_index_in_unit,
          total_exercises_in_unit: exerciseData.total_exercises_in_unit,
          sentence_preview: exerciseData.sentence_preview
        })
        setStep('phase-exercise')
      }
    } catch (error) {
      console.error('获取单元练习错误:', error)
      showAlert(t.cannotGetExercise || '无法获取练习，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleNextPhaseExercise = async () => {
    if (!currentFileId || !currentPhase) return

    if (reviewMode) {
      goToNextReviewItem()
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const nextRes = await api.nextPhaseExercise(currentFileId, currentPhase, currentPhaseUnit)
      
      if (nextRes.unit_complete || nextRes.all_complete) {
        const [phase1UnitsData, phase2UnitsData] = await Promise.all([
          api.getPhaseUnits(currentFileId, 1),
          api.getPhaseUnits(currentFileId, 2)
        ])
        setPhase1Units(phase1UnitsData.units)
        const genUnits = new Set()
        phase1UnitsData.units.forEach((u, i) => { if (u.generating) genUnits.add(i) })
        setGeneratingUnits(genUnits)
        setPhase2Units(phase2UnitsData.units)
        setCurrentPhase1Unit(phase1UnitsData.current_unit)
        setCurrentPhase2Unit(phase2UnitsData.current_unit)
        setCompletedUnitId(currentPhaseUnit)
        setCompletedPhase(currentPhase)
        const starCount = Math.max(0, 3 - Math.floor(unitErrorCountRef.current / 3))
        updateUnitStars(`${currentPhase}-${currentPhaseUnit}`, starCount)
        setStep('unit-complete')
      } else if (nextRes.exercise_type) {
        setExerciseType(nextRes.exercise_type)
        setCurrentExerciseData({
          ...nextRes.data,
          mask_version: nextRes.mask_version,
          total_masks: nextRes.total_masks,
          exercise_type_index: nextRes.exercise_type_index,
          exercise_index_in_unit: nextRes.exercise_index_in_unit,
          total_exercises_in_unit: nextRes.total_exercises_in_unit,
          sentence_preview: nextRes.sentence_preview
        })
      }
    } catch (error) {
      console.error('下一个练习错误:', error)
      showAlert(t.cannotGetNextExercise || '无法获取下一个练习，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleUnitClick = async (unitIndex) => {
    setLoading(true)
    // 直接进入某单元起点：旧预加载缓存对应的索引已失效，必须清空
    clearPrefetchCache()
    try {
      // 计算该单元的起始学习索引
      const startIndex = unitIndex * 10
      // 设置学习进度到该单元的起始位置
      await api.setProgress(currentFileId, startIndex)
      // 获取第一个单词
      const response = await api.getRandomWord(currentFileId)
      setLearningData(response)
      setShowWordCard(false)
      setSelectedOption(null)
      setIsCorrect(null)
      setLearningMode('word')
      setStep('learning')
      // 展示单元首题后，后台预加载下一题
      schedulePrefetch()
    } catch (error) {
      console.error('获取单元单词错误:', error)
      showAlert(t.cannotGetWords || '无法获取单元单词，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleOptionSelect = (index) => {
    if (selectedOption !== null) {
      if (isCorrect) return
      setSelectedOption(index)
      const isCorrectAnswer = index === learningData.correct_index
      setIsCorrect(isCorrectAnswer)
      if (isCorrectAnswer) {
        setShowWordCard(true)
        if (reviewMode) {
          // After a wrong answer, the item was moved to the end of wrongItems,
          // so reviewIndex may point to a different item now.
          // Find the current item by its data to remove the correct one.
          setWrongItems(prev => {
            const idx = prev.findIndex(item => item.type === 'word' && item.data === learningData)
            if (idx !== -1) {
              return prev.filter((_, i) => i !== idx)
            }
            return prev.filter((_, i) => i !== reviewIndex)
          })
          setReviewIndex(prev => prev)
        }
      }
      return
    }
    setSelectedOption(index)
    const isCorrectAnswer = index === learningData.correct_index
    setIsCorrect(isCorrectAnswer)
    if (isCorrectAnswer) {
      setShowWordCard(true)
      if (reviewMode) {
        setWrongItems(prev => prev.filter((_, i) => i !== reviewIndex))
        setReviewIndex(prev => prev)
      }
    } else {
      if (!reviewMode) {
        setUnitErrorCount(prev => {
          const newCount = prev + 1
          unitErrorCountRef.current = newCount
          return newCount
        })
      }
      if (reviewMode) {
        const currentItem = wrongItems[reviewIndex]
        if (currentItem) {
          setWrongItems(prev => [...prev.filter((_, i) => i !== reviewIndex), currentItem])
          setReviewIndex(prev => prev)
        }
      } else {
        setWrongItems(prev => [...prev, { type: 'word', data: learningData }])
      }
    }
  }

  const handleSentenceQuizAnswer = (isCorrect) => {
    if (!isCorrect) {
      if (!reviewMode) {
        setUnitErrorCount(prev => {
          const newCount = prev + 1
          unitErrorCountRef.current = newCount
          return newCount
        })
      }
      if (reviewMode) {
        const currentItem = wrongItems[reviewIndex]
        if (currentItem) {
          setWrongItems(prev => [...prev.filter((_, i) => i !== reviewIndex), currentItem])
          setReviewIndex(prev => prev)
        }
      } else {
        setWrongItems(prev => [...prev, { type: 'sentence_quiz', data: quizData }])
      }
    } else {
      if (reviewMode) {
        setWrongItems(prev => prev.filter((_, i) => i !== reviewIndex))
        setReviewIndex(prev => prev)
      }
    }
  }

  const handleListeningQuizAnswer = (isCorrect) => {
    if (!isCorrect) {
      if (!reviewMode) {
        setUnitErrorCount(prev => {
          const newCount = prev + 1
          unitErrorCountRef.current = newCount
          return newCount
        })
      }
      if (reviewMode) {
        const currentItem = wrongItems[reviewIndex]
        if (currentItem) {
          setWrongItems(prev => [...prev.filter((_, i) => i !== reviewIndex), currentItem])
          setReviewIndex(prev => prev)
        }
      } else {
        setWrongItems(prev => [...prev, { type: 'listening_quiz', data: listeningQuizData }])
      }
    } else {
      if (reviewMode) {
        setWrongItems(prev => prev.filter((_, i) => i !== reviewIndex))
        setReviewIndex(prev => prev)
      }
    }
  }

  const handlePhase2Answer = (isCorrect) => {
    if (!isCorrect) {
      if (!reviewMode) {
        setUnitErrorCount(prev => {
          const newCount = prev + 1
          unitErrorCountRef.current = newCount
          return newCount
        })
      }
      if (reviewMode) {
        const currentItem = wrongItems[reviewIndex]
        if (currentItem) {
          setWrongItems(prev => [...prev.filter((_, i) => i !== reviewIndex), currentItem])
          setReviewIndex(prev => prev)
        }
      } else {
        setWrongItems(prev => [...prev, { type: exerciseType, data: currentExerciseData }])
      }
    } else {
      if (reviewMode) {
        setWrongItems(prev => prev.filter((_, i) => i !== reviewIndex))
        setReviewIndex(prev => prev)
      }
    }
  }

  const goToNextReviewItem = () => {
    // Use refs to avoid stale closure values when this function is called
    // after state updates that haven't been committed yet
    const currentWrongItems = wrongItemsRef.current
    const currentReviewIndex = reviewIndexRef.current

    if (currentWrongItems.length === 0) {
      setReviewMode(false)
      setReviewIndex(0)
      setReviewRound(0)
      setStep('unit-complete')
      return
    }
    const nextIdx = Math.min(currentReviewIndex, currentWrongItems.length - 1)
    setReviewIndex(nextIdx)
    setReviewRound(prev => prev + 1)
    const nextItem = currentWrongItems[nextIdx]
    if (nextItem?.type === 'word') {
      setLearningData(nextItem.data)
      setShowWordCard(false)
      setSelectedOption(null)
      setIsCorrect(null)
      setStep('learning')
    } else if (nextItem?.type === 'sentence_quiz') {
      setQuizData(nextItem.data)
      setStep('sentence-quiz')
    } else if (nextItem?.type === 'listening_quiz') {
      setListeningQuizData(nextItem.data)
      setStep('listening-quiz')
    } else if (nextItem?.type === 'masked_sentence' || nextItem?.type === 'translation_reconstruction') {
      setExerciseType(nextItem.type)
      setCurrentExerciseData(nextItem.data)
      setStep('phase-exercise')
    }
  }

  // ponytail: 预加载下一道题——核心实现
  // fetchNextBundle: 推进服务端索引并拉取下一题内容，返回统一的 bundle（不触发任何 setState）
  const fetchNextBundle = async () => {
    const nextWordResponse = await api.nextWord(currentFileId)

    if (nextWordResponse.type === 'unit_complete') {
      const [phase1UnitsData, phase2UnitsData] = await Promise.all([
        api.getPhaseUnits(currentFileId, 1),
        api.getPhaseUnits(currentFileId, 2)
      ])
      return {
        type: 'unit_complete',
        completedUnitId: nextWordResponse.completed_unit_id ?? phase1UnitsData.current_unit,
        unitEndIndex: nextWordResponse.unit_end_index,
        phase1UnitsData, phase2UnitsData
      }
    }

    if (nextWordResponse.sentence_quiz) {
      return {
        type: 'sentence_quiz',
        quizData: nextWordResponse.sentence_quiz,
        unitEndIndex: nextWordResponse.unit_end_index || unitEndIndex
      }
    }

    if (nextWordResponse.listening_quiz) {
      if (skipListening) {
        // 跳过听力题：继续推进到下一道（与原递归 getNextWord 行为一致）
        return fetchNextBundle()
      }
      return {
        type: 'listening_quiz',
        listeningQuizData: nextWordResponse.listening_quiz,
        unitEndIndex: nextWordResponse.unit_end_index || unitEndIndex
      }
    }

    // 普通单词：拉取完整内容
    const response = await api.getRandomWord(currentFileId)
    if (response.type === 'sentence_quiz') {
      return { type: 'sentence_quiz', quizData: response, unitEndIndex: response.unit_end_index }
    }
    if (response.type === 'listening_quiz') {
      if (skipListening) {
        return fetchNextBundle()
      }
      return { type: 'listening_quiz', listeningQuizData: response, unitEndIndex: response.unit_end_index }
    }
    if (response.type === 'unit_complete' || response.type === 'all_complete') {
      const [phase1UnitsData, phase2UnitsData] = await Promise.all([
        api.getPhaseUnits(currentFileId, 1),
        api.getPhaseUnits(currentFileId, 2)
      ])
      return {
        type: 'unit_complete',
        completedUnitId: nextWordResponse?.completed_unit_id ?? phase1UnitsData.current_unit,
        unitEndIndex: response.unit_end_index,
        phase1UnitsData, phase2UnitsData
      }
    }
    return { type: 'word', learningData: response, unitEndIndex: response.unit_end_index }
  }

  // applyBundle: 把 bundle 应用到 React state（展示题目）
  const applyBundle = (bundle) => {
    if (!bundle) return false
    if (bundle.type === 'unit_complete') {
      setPhase1Units(bundle.phase1UnitsData.units)
      const genUnits = new Set()
      bundle.phase1UnitsData.units.forEach((u, i) => { if (u.generating) genUnits.add(i) })
      setGeneratingUnits(genUnits)
      setPhase2Units(bundle.phase2UnitsData.units)
      setCurrentPhase1Unit(bundle.phase1UnitsData.current_unit)
      setCurrentPhase2Unit(bundle.phase2UnitsData.current_unit)
      setCompletedUnitId(bundle.completedUnitId)
      setCompletedPhase(1)
      const starCount = Math.max(0, 3 - Math.floor(unitErrorCountRef.current / 3))
      updateUnitStars(`1-${bundle.completedUnitId}`, starCount)
      setStep('unit-complete')
    } else if (bundle.type === 'sentence_quiz') {
      setQuizData(bundle.quizData)
      setUnitEndIndex(bundle.unitEndIndex)
      setLearningMode('sentence')
      setStep('sentence-quiz')
    } else if (bundle.type === 'listening_quiz') {
      setListeningQuizData(bundle.listeningQuizData)
      setUnitEndIndex(bundle.unitEndIndex)
      setLearningMode('listening')
      setStep('listening-quiz')
    } else {
      setLearningData(bundle.learningData)
      setUnitEndIndex(bundle.unitEndIndex)
      setShowWordCard(false)
      setSelectedOption(null)
      setIsCorrect(null)
      setLearningMode('word')
      setStep('learning')
    }
    return true
  }

  // applyRandomWordResponse: 用 getRandomWord 读取"当前索引"内容并展示（不推进索引，用于预加载失败时的安全兜底）
  const applyRandomWordResponse = async (response) => {
    if (response.type === 'sentence_quiz') {
      setQuizData(response)
      setUnitEndIndex(response.unit_end_index)
      setLearningMode('sentence')
      setStep('sentence-quiz')
    } else if (response.type === 'listening_quiz') {
      if (skipListening) return false // 交由调用方继续推进
      setListeningQuizData(response)
      setUnitEndIndex(response.unit_end_index)
      setLearningMode('listening')
      setStep('listening-quiz')
    } else if (response.type === 'unit_complete' || response.type === 'all_complete') {
      const [phase1UnitsData, phase2UnitsData] = await Promise.all([
        api.getPhaseUnits(currentFileId, 1),
        api.getPhaseUnits(currentFileId, 2)
      ])
      setPhase1Units(phase1UnitsData.units)
      const genUnits = new Set()
      phase1UnitsData.units.forEach((u, i) => { if (u.generating) genUnits.add(i) })
      setGeneratingUnits(genUnits)
      setPhase2Units(phase2UnitsData.units)
      setCurrentPhase1Unit(phase1UnitsData.current_unit)
      setCurrentPhase2Unit(phase2UnitsData.current_unit)
      setCompletedUnitId(phase1UnitsData.current_unit)
      setCompletedPhase(1)
      const starCount = Math.max(0, 3 - Math.floor(unitErrorCountRef.current / 3))
      updateUnitStars(`1-${phase1UnitsData.current_unit}`, starCount)
      setStep('unit-complete')
    } else {
      setLearningData(response)
      setUnitEndIndex(response.unit_end_index)
      setShowWordCard(false)
      setSelectedOption(null)
      setIsCorrect(null)
      setLearningMode('word')
      setStep('learning')
    }
    return true
  }

  // clearPrefetchCache: 失效缓存的预加载（切条目/切设置/直接进入某题时调用）
  const clearPrefetchCache = () => {
    prefetchGenRef.current++
    prefetchedNextRef.current = null
  }

  // schedulePrefetch: 在后台预加载下一题，存入缓存（不显示 loading、不阻塞 UI）
  const schedulePrefetch = () => {
    if (!currentFileId) return
    if (isPrefetchingRef.current) return
    if (reviewMode) return
    const gen = ++prefetchGenRef.current
    const entry = { gen, promise: null, bundle: null }
    prefetchedNextRef.current = entry
    isPrefetchingRef.current = true
    const promise = (async () => {
      try {
        const b = await fetchNextBundle()
        if (prefetchedNextRef.current && prefetchedNextRef.current.gen === gen) {
          prefetchedNextRef.current.bundle = b
        }
        return b
      } catch (e) {
        // 预加载失败：静默处理，getNextWord 会走兜底逻辑
        return null
      } finally {
        isPrefetchingRef.current = false
      }
    })()
    if (prefetchedNextRef.current && prefetchedNextRef.current.gen === gen) {
      prefetchedNextRef.current.promise = promise
    }
  }

  const getNextWord = async (retryCount = 0) => {
    if (!currentFileId) return
    if (isFetchingNextRef.current) return
    isFetchingNextRef.current = true

    setLoading(true)
    try {
      let bundle = null
      // 1) 命中已完成的预加载缓存
      const cached = prefetchedNextRef.current
      if (cached && cached.gen === prefetchGenRef.current) {
        if (cached.bundle) {
          bundle = cached.bundle
          prefetchedNextRef.current = null
        } else if (cached.promise) {
          // 预加载仍在进行中——等待它完成（避免重复推进索引）
          const awaited = await cached.promise
          prefetchedNextRef.current = null
          if (awaited) {
            bundle = awaited
          } else {
            // 预加载失败：用 getRandomWord 读取"已推进到的当前索引"内容，安全兜底（不会重复推进、不会跳词）
            try {
              const resp = await api.getRandomWord(currentFileId)
              const ok = await applyRandomWordResponse(resp)
              if (!ok && skipListening) {
                // 当前是需跳过的听力题：继续推进一次
                bundle = await fetchNextBundle()
              }
            } catch (e) {
              throw e
            }
            // 兜底展示后也尝试预加载下一题
            schedulePrefetch()
            return
          }
        }
      }

      // 2) 无缓存：同步拉取
      if (!bundle) {
        bundle = await fetchNextBundle()
      }

      applyBundle(bundle)

      // 3) 展示当前题后，后台预加载下一题（unit_complete 不预加载：用户还在单元完成页，未决定下一步）
      if (bundle.type !== 'unit_complete') {
        schedulePrefetch()
      }
    } catch (error) {
      console.error('获取下一个单词错误:', error)
      if (error.response && error.response.status === 401 && retryCount < 2) {
        isFetchingNextRef.current = false
        setTimeout(() => getNextWord(retryCount + 1), 1000)
        return
      }
      if (error.response && (error.response.status === 401 || error.response.status === 502 || error.response.status === 503 || error.response.status === 504)) {
        isFetchingNextRef.current = false
        setTimeout(() => getNextWord(retryCount + 1), 2000)
        return
      }
    } finally {
      isFetchingNextRef.current = false
      setLoading(false)
    }
  }

  const getWordDetails = async (word) => {
    if (!currentFileId) return
    
    // 如果点击的是当前选中的单词，则取消选中
    if (selectedWord && selectedWord.word === word) {
      setSelectedWord(null)
      return
    }
    
    try {
      const response = await api.getWordDetails(currentFileId, word)
      setSelectedWord(response)
    } catch (error) {
      console.error('获取单词详情错误:', error)
    }
  }

  const handleStudyWord = (wordData) => {
    // 直接学习某个单词（不走索引推进）：旧预加载缓存与当前展示内容不匹配，清空
    clearPrefetchCache()
    setLearningData(wordData)
    setShowWordCard(false)
    setSelectedOption(null)
    setIsCorrect(null)
    setStep('learning')
  }

  const handleOpenVocabList = () => {
    setShowVocabList(true)
  }

  const handleConfirmBack = (targetStep) => {
    setConfirmDialog({
      isOpen: true,
      onConfirm: () => {
        setConfirmDialog({ isOpen: false, onConfirm: null })
        if (typeof targetStep === 'function') {
          targetStep()
        } else {
          setStep(targetStep || 'all-units')
        }
      }
    })
  }

  const handleNavigateToRecord = async (fileId, srcLang, tgtLang, title) => {
    setLoading(true)
    // 先清空上一个条目的数据，避免显示旧内容
    setVocab([])
    setDisplayVocab([])
    setSentenceTranslations([])
    setSelectedSentence(null)
    setSelectedWord(null)
    setProgress(0)
    setProcessingInfo(null)
    setOriginalText('')
    setEntryPrompt('')
    try {
      setCurrentFileId(fileId)
      setFileId(fileId)
      if (title) setFileTitle(title)
      // ponytail: 不再全量加载 vocab/sentences——DictionaryStep 改为按页自取（/vocab、/sentences 带 offset/limit/q）。
      // 入口只需 /info（原文、提示词、has_failed、sentence_count），大幅减少首屏传输与反序列化。
      let infoData = {}
      try {
        const infoResp = await fetch(`/api/file/${fileId}/info`)
        infoData = await infoResp.json()
        if (infoData.original_text) {
          setOriginalText(infoData.original_text)
        }
        setEntryPrompt(infoData.prompt || '')
      } catch (e) {
        // /info 失败不阻塞，原文留空
      }
      try {
        const [phase1UnitsData, phase2UnitsData, starsData] = await Promise.all([
          api.getPhaseUnits(fileId, 1),
          api.getPhaseUnits(fileId, 2),
          api.getUnitStars(fileId)
        ])
        setPhase1Units(phase1UnitsData.units)
        setPhase2Units(phase2UnitsData.units)
        setCurrentPhase1Unit(phase1UnitsData.current_unit)
        setCurrentPhase2Unit(phase2UnitsData.current_unit)
        setUnitStarCounts(starsData.stars || {})
        const genUnits = new Set()
        phase1UnitsData.units.forEach((u, i) => { if (u.generating) genUnits.add(i) })
        setGeneratingUnits(genUnits)
      } catch (e) {
        console.error('Failed to load phase units:', e)
      }

      // ponytail: 进入条目时检查并补漏缺词。在启动轮询前调用——有漏词则后端置 refilling 状态，
      // 轮询拿到 refilling 不停止，实时更新句子与词汇表；无漏词则后端置 completed，轮询正常停止。
      // 正在处理中的条目后端会跳过（skipping），不干扰主流程。
      try {
        const refillResp = await api.refillMissingWords(fileId)
        if (refillResp.needs_refill) {
          // 有漏词——保持 loading 让用户看到补漏进度，轮询会在 completed 时清掉 loading
          setLoading(true)
        }
      } catch (e) {
        // 补漏检查失败不阻塞，按已有数据展示
        console.error('refill check failed:', e)
      }

      setSkipPolling(false)

      api.startWordGen(fileId).catch(() => {})
      setStep('dictionary')
    } catch (error) {
      console.error('Failed to load record:', error)
      showAlert(t.cannotLoadHistory || '无法加载学习记录，请重试')
    } finally {
      setLoading(false)
    }
  }

  const handleSkipListeningChange = (value) => {
    setSkipListening(value)
    api.saveUserPreferences({ skip_listening: value }).catch(() => {})
  }

  const handleOnlyNewWordsChange = (value) => {
    setOnlyNewWords(value)
    api.saveUserPreferences({ only_new_words: value }).catch(() => {})
  }

  const handleOpenWordList = (lang) => {
    setFavoriteLang(null)
    setWordListLang(prev => prev === lang ? null : lang)
    // ponytail: 移动端从 Profile 点开单词表/收藏时切回主页显示
    if (!isDesktop) { setStep('input'); setMobileTab('home') }
  }

  const handleOpenFavorites = (lang) => {
    setWordListLang(null)
    setFavoriteLang(prev => prev === lang ? null : lang)
    if (!isDesktop) { setStep('input'); setMobileTab('home') }
  }

  // ponytail: 移动端点 Details/Quiz tab 时加载最近条目（无 currentFileId 时从历史取第一条）
  const handleLoadMostRecent = async () => {
    try {
      const data = await api.getHistory()
      const recent = (data.records || [])[0]
      if (recent) {
        await handleNavigateToRecord(recent.file_id, recent.source_lang, recent.target_lang, recent.title)
      }
    } catch (e) {
      console.error('Failed to load recent record:', e)
    }
  }

  const handleMobileTab = (tab) => {
    setMobileTab(tab)
    if (tab === 'home') {
      setStep('input')
    } else if (tab === 'profile') {
      setStep('profile')
    } else if (tab === 'details') {
      // ponytail: 不再自动加载最近条目。若无当前条目则进入空默认态
      // （auto 语言 / 无标题 / 开始学习禁用 / 句子与单词为空）；单词总表切换仍可显示完整聚合词表。
      setStep('dictionary')
    } else if (tab === 'quiz') {
      if (currentFileId) setStep('all-units')
      else handleLoadMostRecent().then(() => setStep('all-units'))
    }
  }

  const handleNextSentenceQuiz = async () => {
    if (reviewMode) {
      goToNextReviewItem()
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      await getNextWord()
    } catch (error) {
      console.error('获取下一个句子翻译题错误:', error)
      const response = await api.getRandomWord(currentFileId)
      setLearningData(response)
      setShowWordCard(false)
      setSelectedOption(null)
      setIsCorrect(null)
      setLearningMode('word')
      setStep('learning')
    } finally {
      setLoading(false)
    }
  }

  // ponytail: step 变化时同步移动端底部 nav 高亮（历史条目点击/开始学习等路径也会触发）
  useEffect(() => {
    if (step === 'input') setMobileTab('home')
    else if (step === 'dictionary') setMobileTab('details')
    else if (step === 'all-units') setMobileTab('quiz')
    else if (step === 'profile') setMobileTab('profile')
  }, [step])

  // 移动端底部 nav 仅在非练习 step 显示；做题时只有返回，无 nav
  const showMobileNav = !isDesktop && ['input', 'dictionary', 'all-units', 'profile'].includes(step)

  return (
    <div className="h-screen h-[100svh] overflow-hidden bg-parchment-50 bg-paper-grain relative">
      {/* 装饰性波点背景 */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03] z-0"
        style={{ backgroundImage: 'radial-gradient(circle, #8b7e5e 1px, transparent 1px)', backgroundSize: '24px 24px' }}
      />
      <main className="h-full relative z-10">
        {step === 'input' && isDesktop ? (
          <div className="flex h-full">
            <HistorySidebar onNavigateToRecord={handleNavigateToRecord} t={t} onOpenWordList={handleOpenWordList} activeWordListLang={wordListLang} onOpenFavorites={handleOpenFavorites} activeFavoriteLang={favoriteLang} refreshTrigger={historyRefresh} />
            <div className="flex-1 min-w-0 relative h-full px-4 sm:px-6 lg:px-8 py-4">
              {wordListLang ? (
                <WordListPanel
                  sourceLang={wordListLang}
                  t={t}
                  onBack={() => setWordListLang(null)}
                  pageSize={pageSize}
                />
              ) : favoriteLang ? (
                <WordListPanel
                  sourceLang={favoriteLang}
                  t={t}
                  onBack={() => setFavoriteLang(null)}
                  pageSize={pageSize}
                  favoritesMode={true}
                />
              ) : (
                <>
                  <div className="absolute top-3 right-4 z-10 flex items-center gap-2">
                    <AccountMenu t={t} onOpenSettings={() => setShowSettings(true)} onOpenChangePassword={() => setShowChangePassword(true)} />
                  </div>
                  {translatingUI && (
                    <div className="absolute inset-0 bg-parchment-50/80 backdrop-blur-sm z-20 flex items-center justify-center">
                      <div className="flex items-center gap-3 bg-parchment-50 border-2 border-aged-200 rounded-sm px-6 py-4 shadow-retro">
                        <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                        <span className="text-sm text-ink-600">{
                          (customTranslations[uiLang]?.translatingUI)
                          || (customTranslations[Array.from(loadedLangs).filter(l => l !== uiLang).pop()]?.translatingUI)
                          || t.translatingUI
                          || '正在切换界面语言...'
                        }</span>
                      </div>
                    </div>
                  )}
                  <AnimatePresence mode="wait">
                    <InputStep
                      key="input"
                      text={text}
                      setText={setText}
                      sourceLang={sourceLang}
                      setSourceLang={setSourceLang}
                      uiLang={uiLang}
                      loading={loading}
                      onProcess={handleProcess}
                      t={t}
                      inputMode={inputMode}
                      setInputMode={setInputMode}
                      recentLanguages={recentLanguages}
                    />
                  </AnimatePresence>
                </>
              )}
            </div>
          </div>
        ) : step === 'input' ? (
          // 移动端主页 — 输入框固定顶部不滚动，历史记录区域独立滚动
          <div className="h-full flex flex-col pb-nav-safe">
            {wordListLang ? (
              <div className="h-full overflow-y-auto">
                <WordListPanel sourceLang={wordListLang} t={t} onBack={() => setWordListLang(null)} pageSize={pageSize} />
              </div>
            ) : favoriteLang ? (
              <div className="h-full overflow-y-auto">
                <WordListPanel sourceLang={favoriteLang} t={t} onBack={() => setFavoriteLang(null)} pageSize={pageSize} favoritesMode={true} />
              </div>
            ) : (
              <>
                {translatingUI && (
                  <div className="absolute inset-0 bg-parchment-50/80 backdrop-blur-sm z-20 flex items-center justify-center">
                    <div className="flex items-center gap-3 bg-parchment-50 border-2 border-aged-200 rounded-sm px-6 py-4 shadow-retro">
                      <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
                      <span className="text-sm text-ink-600">{t.translatingUI || '正在切换界面语言...'}</span>
                    </div>
                  </div>
                )}
                <div className="shrink-0 safe-top">
                  <InputStep
                    text={text}
                    setText={setText}
                    sourceLang={sourceLang}
                    setSourceLang={setSourceLang}
                    uiLang={uiLang}
                    loading={loading}
                    onProcess={handleProcess}
                    t={t}
                    inputMode={inputMode}
                    setInputMode={setInputMode}
                    recentLanguages={recentLanguages}
                  />
                </div>
                <div className="flex-1 overflow-y-auto px-5 mt-1 min-h-0">
                  <HistorySidebar inline onNavigateToRecord={handleNavigateToRecord} t={t} onOpenWordList={handleOpenWordList} activeWordListLang={wordListLang} onOpenFavorites={handleOpenFavorites} activeFavoriteLang={favoriteLang} refreshTrigger={historyRefresh} />
                </div>
              </>
            )}
          </div>
        ) : step === 'profile' ? (
          // ponytail: 移动端个人页 — 头像/账号/设置/退出 + 学习记录（最近/语言/进度/单词表/收藏）
          // App 化：顶部留安全区+页标题，更大的头像与卡片留白，按钮触控区加大
          <div className="h-full overflow-y-auto pb-nav-safe px-5 pt-5 safe-top">
            {(() => {
              const user = auth.getUser()
              const q = auth.getQuota()
              const available = q?.available ?? 0
              const max = q?.tier_max ?? q?.max ?? 200
              const isUnlimited = max === -1
              const isLow = !isUnlimited && typeof available === 'number' && available <= 10
              const tierLabel = { free: t.freeTier || '免费版', basic: t.basicTier || '基础版', pro: t.proTier || '专业版' }[user?.tier] || user?.tier || ''
              // ponytail: App 化个人页 — 头像居中置顶 / 邮箱 / 付费计划 / 额度内联（不单独成块） / 菜单列表（设置·修改密码·切换账号·退出）
              const menuItem = (Icon, label, onClick, danger = false) => (
                <button onClick={onClick} className={`w-full flex items-center gap-3 px-4 py-3.5 bg-parchment-50 border-2 border-aged-200 rounded-md text-sm transition-colors ${danger ? 'text-rust-500 hover:bg-rust-50' : 'text-ink-700 hover:bg-parchment-100'}`}>
                  <Icon className="w-4 h-4 shrink-0" />
                  {label}
                </button>
              )
              return (
                <div className="max-w-md mx-auto">
                  {/* 头像居中置顶 */}
                  <div className="flex flex-col items-center pt-2 pb-6">
                    <div className="w-20 h-20 rounded-full bg-amber-500 text-white flex items-center justify-center text-2xl font-bold shadow-retro-sm">
                      {user ? (user.name || user.email)[0].toUpperCase() : '?'}
                    </div>
                    <p className="mt-3 text-base font-medium text-ink-800 text-center break-all px-4">{user?.email || ''}</p>
                    <span className="inline-block mt-2 px-3 py-0.5 rounded-full bg-amber-100/80 text-amber-600 text-xs font-bold">
                      {tierLabel}
                    </span>
                    {/* 额度内联展示：不单独成块，与付费计划下方一行紧凑呈现 */}
                    {!isUnlimited && (
                      <div className="mt-3 flex items-center gap-2">
                        <Zap className={`w-3.5 h-3.5 ${isLow ? 'text-rust-500' : 'text-amber-500'}`} />
                        <span className="text-xs text-ink-500">{t.remainingQuota || '剩余额度'}</span>
                        <span className={`text-xs font-bold tabular-nums ${isLow ? 'text-rust-500' : 'text-amber-600'}`}>{available} / {max}</span>
                      </div>
                    )}
                  </div>
                  {/* 菜单列表 */}
                  <div className="space-y-3">
                    {menuItem(Settings, t.settings || '设置', () => setShowSettings(true))}
                    {menuItem(KeyRound, t.changePassword || '修改密码', () => setShowChangePassword(true))}
                    {menuItem(RefreshCw, t.switchAccount || '切换账号', () => { navigate('/login?switch=1') })}
                    {menuItem(LogOut, t.logout || '退出登录', () => { auth.logout(); navigate('/') }, true)}
                  </div>
                </div>
              )
            })()}
          </div>
        ) : (
          <div ref={learningContainerRef} className={`h-full overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 ${showMobileNav ? 'pb-nav-safe' : ''}`}>
            <AnimatePresence mode="wait">
          {step === 'dictionary' && (
            <DictionaryStep
              key="dictionary"
              vocab={displayVocab}
              onToggleSort={toggleSortOrder}
              sortOrder={sortOrder}
              progress={progress}
              processingInfo={processingInfo}
              sentenceTranslations={sentenceTranslations}
              selectedSentence={selectedSentence}
              selectedWord={selectedWord}
              onSentenceClick={handleSentenceClick}
              onCloseSentenceDetail={handleCloseSentenceDetail}
              onWordClick={getWordDetails}
              onStartLearning={startLearningPhases}
              loading={loading}
              t={t}
              currentFileId={currentFileId}
              sourceLang={sourceLang}
              detectedLang={detectedLang}
              preprocessStatus={preprocessStatus}
              onBack={() => { dictStateRef.current = { vocabPage: 1, sentencePage: 1, globalVocabPage: 1, vocabScrollPos: 0, sentenceTranslationScrollPos: 0, sentenceOriginalScrollPos: 0, globalVocabScrollPos: 0, vocabDisplayMode: 0, sentenceDisplayMode: 0, showOriginal: false, showGlobalVocab: false, vocabSearch: '', sentenceSearch: '' }; setStep('input') }}
              fileTitle={fileTitle}
              onTitleChange={(newTitle) => setFileTitle(newTitle)}
              pageSize={pageSize}
              dictStateRef={dictStateRef}
              originalText={originalText}
              entryPrompt={entryPrompt}
              vocabLength={vocabLength}
              sentenceLength={sentenceLength}
            />
          )}
          
          {step === 'progress' && (
            <ProgressStep
              key="progress"
              units={units}
              currentUnit={currentUnit}
              onUnitClick={handleUnitClick}
              onBack={() => setStep('dictionary')}
              loading={loading}
              t={t}
              allUnitsCompleted={allUnitsCompleted}
            />
          )}
          
          {step === 'learning' && (
            <LearningStep
              key={`learning-${reviewMode ? reviewRound : 0}`}
              learningData={learningData}
              showWordCard={showWordCard}
              selectedOption={selectedOption}
              isCorrect={isCorrect}
              onOptionSelect={handleOptionSelect}
              onNextWord={reviewMode ? goToNextReviewItem : getNextWord}
              onBack={() => handleConfirmBack('all-units')}
              onOpenVocabList={handleOpenVocabList}
              loading={loading}
              t={t}
              sourceLang={sourceLang}
              skipListening={skipListening}
              reviewMode={reviewMode}
              reviewIndex={reviewIndex}
              wrongItemsCount={wrongItems.length}
            />
          )}

          {step === 'sentence-quiz' && (
            <SentenceQuizStep
              key={`sentence-quiz-${quizData?.flat_index ?? quizData?.original_sentence}-${reviewMode ? reviewRound : 0}`}
              quizData={quizData}
              onNextQuestion={handleNextSentenceQuiz}
              onBack={() => handleConfirmBack('all-units')}
              onComplete={async () => {
                if (currentFileId && currentPhase) {
                  const phase1UnitsData = await api.getPhaseUnits(currentFileId, 1)
                  const nextUnit = phase1UnitsData.current_unit + 1
                  await api.setPhaseProgress(currentFileId, 1, nextUnit, 0)
                }
                setCompletedUnitId(currentPhase1Unit)
                setCompletedPhase(1)
                setStep('unit-complete')
              }}
              loading={loading}
              t={t}
              onOpenVocabList={handleOpenVocabList}
              sourceLang={sourceLang}
              onAnswer={handleSentenceQuizAnswer}
              skipListening={skipListening}
              reviewMode={reviewMode}
              reviewIndex={reviewIndex}
              wrongItemsCount={wrongItems.length}
            />
          )}

          {step === 'listening-quiz' && (
            <ListeningQuizStep
              key={`listening-quiz-${listeningQuizData?.flat_index ?? listeningQuizData?.original_sentence}-${reviewMode ? reviewRound : 0}`}
              quizData={listeningQuizData}
              onNextQuestion={handleNextSentenceQuiz}
              onBack={() => handleConfirmBack('all-units')}
              loading={loading}
              t={t}
              onOpenVocabList={handleOpenVocabList}
              sourceLang={sourceLang}
              onAnswer={handleListeningQuizAnswer}
              skipListening={skipListening}
              onSkipListeningChange={handleSkipListeningChange}
              reviewMode={reviewMode}
              reviewIndex={reviewIndex}
              wrongItemsCount={wrongItems.length}
            />
          )}

          {step === 'unit-complete' && (
            <UnitCompleteStep
              key="unit-complete"
              unitNumber={completedUnitId || 0}
              totalUnits={completedPhase === 2 ? (phase2Units.length || 1) : (phase1Units.length || 1)}
              phase={completedPhase}
              onContinue={() => {
                setUnitErrorCount(0)
                unitErrorCountRef.current = 0
                setWrongItems([])
                setReviewMode(false)
                setReviewIndex(0)
                setReviewRound(0)
                setStep('all-units')
              }}
              onReview={() => {
                setReviewMode(true)
                setReviewIndex(0)
                setReviewRound(0)
                const firstWrong = wrongItems[0]
                if (firstWrong?.type === 'word') {
                  setLearningData(firstWrong.data)
                  setShowWordCard(false)
                  setSelectedOption(null)
                  setIsCorrect(null)
                  setStep('learning')
                } else if (firstWrong?.type === 'sentence_quiz') {
                  setQuizData(firstWrong.data)
                  setStep('sentence-quiz')
                } else if (firstWrong?.type === 'listening_quiz') {
                  setListeningQuizData(firstWrong.data)
                  setStep('listening-quiz')
                } else if (firstWrong?.type === 'masked_sentence' || firstWrong?.type === 'translation_reconstruction') {
                  setExerciseType(firstWrong.type)
                  setCurrentExerciseData(firstWrong.data)
                  setStep('phase-exercise')
                }
              }}
              errorCount={unitErrorCount}
              hasWrongItems={wrongItems.length > 0}
              wrongItemsCount={wrongItems.length}
              t={t}
              onSkipReview={() => {
                setReviewMode(false)
                setReviewIndex(0)
                setReviewRound(0)
                setWrongItems([])
                setUnitErrorCount(0)
                unitErrorCountRef.current = 0
                setStep('all-units')
              }}
            />
          )}
          
          {step === 'all-units' && (
            <AllUnitsStep
              key="all-units"
              phase1Units={phase1Units}
              phase2Units={phase2Units}
              currentPhase1Unit={currentPhase1Unit}
              currentPhase2Unit={currentPhase2Unit}
              onPhase1UnitClick={handlePhase1UnitClick}
              onPhase2UnitClick={handlePhase2UnitClick}
              onBack={() => setStep('dictionary')}
              onHome={() => setStep('input')}
              loading={loading}
              t={t}
              unitStarCounts={unitStarCounts}
              skipListening={skipListening}
              onSkipListeningChange={handleSkipListeningChange}
              onlyNewWords={onlyNewWords}
              onOnlyNewWordsChange={handleOnlyNewWordsChange}
              generatingUnits={generatingUnits}
              fileTitle={fileTitle}
              currentFileId={currentFileId}
              lastActiveTab={lastActiveTab}
              onTabChange={setLastActiveTab}
            />
          )}
          
          {step === 'phase-selector' && (
            <PhaseSelectorStep
              key="phase-selector"
              phases={phases}
              currentFileId={currentFileId}
              onPhaseSelect={handlePhaseSelect}
              onBack={() => setStep('dictionary')}
              loading={loading}
              t={t}
            />
          )}
          
          {step === 'phase-progress' && (
            <PhaseProgressStep
              key="phase-progress"
              units={phaseUnits}
              currentUnit={currentPhaseUnit}
              phaseNumber={currentPhase}
              onUnitClick={handlePhaseUnitClick}
              onBack={() => setStep('all-units')}
              loading={loading}
              t={t}
            />
          )}
          
          {step === 'phase-exercise' && exerciseType === 'masked_sentence' && (
            <MaskedSentenceExerciseStep
              key={`masked-exercise-${currentExerciseData?.exercise_index_in_unit}-${currentExerciseData?.mask_version}-${reviewMode ? reviewRound : 0}`}
              data={currentExerciseData}
              onNext={handleNextPhaseExercise}
              onBack={() => handleConfirmBack('all-units')}
              onComplete={async () => {
                const [phase1UnitsData, phase2UnitsData] = await Promise.all([
                  api.getPhaseUnits(currentFileId, 1),
                  api.getPhaseUnits(currentFileId, 2)
                ])
                setPhase1Units(phase1UnitsData.units)
                const genUnits = new Set()
                phase1UnitsData.units.forEach((u, i) => { if (u.generating) genUnits.add(i) })
                setGeneratingUnits(genUnits)
                setPhase2Units(phase2UnitsData.units)
                setCurrentPhase1Unit(phase1UnitsData.current_unit)
                setCurrentPhase2Unit(phase2UnitsData.current_unit)
                setCompletedUnitId(currentPhaseUnit)
                setCompletedPhase(currentPhase)
                const starCount = Math.max(0, 3 - Math.floor(unitErrorCountRef.current / 3))
                updateUnitStars(`${currentPhase}-${currentPhaseUnit}`, starCount)
                setStep('unit-complete')
              }}
              loading={loading}
              t={t}
              onOpenVocabList={handleOpenVocabList}
              maskVersion={currentExerciseData?.mask_version}
              totalMasks={currentExerciseData?.total_masks}
              exerciseIndexInUnit={currentExerciseData?.exercise_index_in_unit}
              totalExercisesInUnit={currentExerciseData?.total_exercises_in_unit}
              sentencePreview={currentExerciseData?.sentence_preview}
              sourceLang={sourceLang}
              onAnswer={handlePhase2Answer}
              reviewMode={reviewMode}
              reviewIndex={reviewIndex}
              wrongItemsCount={wrongItems.length}
            />
          )}

          {step === 'phase-exercise' && exerciseType === 'translation_reconstruction' && (
            <TranslationReconstructionStep
              key={`reconstruction-exercise-${currentExerciseData?.exercise_index_in_unit}-${reviewMode ? reviewRound : 0}`}
              data={currentExerciseData}
              onNext={handleNextPhaseExercise}
              onBack={() => handleConfirmBack('all-units')}
              onComplete={async () => {
                const [phase1UnitsData, phase2UnitsData] = await Promise.all([
                  api.getPhaseUnits(currentFileId, 1),
                  api.getPhaseUnits(currentFileId, 2)
                ])
                setPhase1Units(phase1UnitsData.units)
                const genUnits = new Set()
                phase1UnitsData.units.forEach((u, i) => { if (u.generating) genUnits.add(i) })
                setGeneratingUnits(genUnits)
                setPhase2Units(phase2UnitsData.units)
                setCurrentPhase1Unit(phase1UnitsData.current_unit)
                setCurrentPhase2Unit(phase2UnitsData.current_unit)
                setCompletedUnitId(currentPhaseUnit)
                setCompletedPhase(currentPhase)
                const starCount = Math.max(0, 3 - Math.floor(unitErrorCountRef.current / 3))
                updateUnitStars(`${currentPhase}-${currentPhaseUnit}`, starCount)
                setStep('unit-complete')
              }}
              loading={loading}
              t={t}
              onOpenVocabList={handleOpenVocabList}
              exerciseIndexInUnit={currentExerciseData?.exercise_index_in_unit}
              totalExercisesInUnit={currentExerciseData?.total_exercises_in_unit}
              sentencePreview={currentExerciseData?.sentence_preview}
              sourceLang={sourceLang}
              onAnswer={handlePhase2Answer}
              reviewMode={reviewMode}
              reviewIndex={reviewIndex}
              wrongItemsCount={wrongItems.length}
            />
          )}
        </AnimatePresence>
          </div>
        )}
      </main>
      {/* ponytail: 移动端底部导航 — 纯图标（无文字）。
          关键防抖：内层固定高度 h-14 + 图标恒定 w-6 h-6 + 顶部指示条始终渲染（仅颜色过渡），
          彻底消除切换 tab 时因图标尺寸 transition 导致的"先下后上"浮动。 */}
      {showMobileNav && (
        <nav className="fixed bottom-0 left-0 right-0 z-30 md:hidden bg-parchment-50/95 backdrop-blur-md border-t border-aged-200 nav-safe-bottom">
          <div className="flex h-14">
            {[
              { key: 'home', icon: Home },
              { key: 'details', icon: BookOpen },
              { key: 'quiz', icon: ListChecks },
              { key: 'profile', icon: User },
            ].map(({ key, icon: Icon }) => {
              const active = mobileTab === key
              return (
                <button
                  key={key}
                  onClick={() => handleMobileTab(key)}
                  className="flex-1 flex items-center justify-center relative"
                >
                  {/* 顶部指示条：始终存在，仅颜色/透明度变化，不触发 reflow */}
                  <span className={`absolute top-0 left-1/2 -translate-x-1/2 h-0.5 w-6 rounded-full transition-colors duration-200 ${active ? 'bg-amber-500' : 'bg-transparent'}`} />
                  <Icon className={`w-6 h-6 transition-colors duration-200 ${active ? 'text-amber-600' : 'text-aged-300'}`} />
                </button>
              )
            })}
          </div>
        </nav>
      )}
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} uiLang={uiLang} onUiLangChange={(lang) => { setUiLang(lang); setTargetLang(lang) }} pageSize={pageSize} onPageSizeChange={setPageSize} t={t} recentLangs={recentLanguages} onRecentLangsChange={setRecentLanguages} fontScaleMobile={fontScaleMobile} fontScaleDesktop={fontScaleDesktop} onFontScaleMobileChange={setFontScaleMobile} onFontScaleDesktopChange={setFontScaleDesktop} />
      <ChangePasswordModal isOpen={showChangePassword} onClose={() => setShowChangePassword(false)} t={t} />
      {showVocabList && <VocabListStep onClose={() => setShowVocabList(false)} vocab={vocab} loading={loading} t={t} currentFileId={currentFileId} sourceLang={sourceLang} pageSize={pageSize} />}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        title={confirmDialog.title || t.confirmExit || '确认退出'}
        message={confirmDialog.message || t.exitMessage || '你确定要退出当前练习吗？退出后进度将不会保存。'}
        confirmText={confirmDialog.confirmText || t.exitAction || '退出'}
        cancelText={confirmDialog.cancelText || t.continueLearning || '继续练习'}
        onConfirm={confirmDialog.onConfirm}
        onCancel={() => setConfirmDialog({ isOpen: false, onConfirm: null })}
      />
      <AlertDialog
        open={alertDialog.open}
        title={alertDialog.title}
        message={alertDialog.message}
        onClose={() => setAlertDialog({ open: false, title: '', message: '' })}
        t={t}
      />
    </div>
  )
}

export default App