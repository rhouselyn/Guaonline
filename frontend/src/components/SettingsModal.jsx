import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Check, Loader2, Languages, ChevronDown, BookOpen, ToggleLeft, ToggleRight, AlertCircle, Volume2, Type } from 'lucide-react'
import { api } from '../utils/api'
import { LangIcon, LANGUAGES } from './InputStep'
import { setTtsEngine, getTtsEngine } from '../utils/speech'
import { useMediaQuery } from '../utils/useMediaQuery'

function NativeLangSelector({ value, onChange, recentLangs = [] }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef(null)

  useEffect(() => {
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedLang = LANGUAGES.find(l => l.value === value)
  const filtered = LANGUAGES.filter(l => {
    if (!search) return true
    const s = search.toLowerCase()
    return l.native.toLowerCase().includes(s) || l.en.toLowerCase().includes(s) || l.zh.includes(search) || l.value.toLowerCase().includes(s)
  })

  const recentFiltered = recentLangs
    .filter(code => code !== value)
    .map(code => LANGUAGES.find(l => l.value === code))
    .filter(Boolean)
    .filter(l => {
      if (!search) return true
      const s = search.toLowerCase()
      return l.native.toLowerCase().includes(s) || l.en.toLowerCase().includes(s) || l.zh.includes(search)
    })

  const commonLangs = ['zh', 'en', 'ja', 'ko', 'fr', 'de', 'es', 'ru', 'pt', 'it', 'ar', 'hi', 'th', 'vi', 'id']
  const commonFiltered = filtered.filter(l => commonLangs.includes(l.value))
  const otherFiltered = filtered.filter(l => !commonLangs.includes(l.value))

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-3 py-2 rounded-sm border-2 border-aged-200 bg-parchment-50 hover:bg-parchment-100 transition-colors text-sm"
      >
        <LangIcon langCode={value} size="sm" />
        <span className="text-ink-800 flex-1 text-left">{selectedLang?.native || value}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-aged-300 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-parchment-50 rounded-sm border-2 border-aged-200 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-parchment-100">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search..."
              className="w-full px-2 py-1.5 rounded-sm bg-parchment-50 border-2 border-parchment-100 text-xs text-ink-700 placeholder-ink-400 focus:outline-none focus:border-amber-300"
              autoFocus
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {recentFiltered.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] text-ink-400 font-bold uppercase">Recent</div>
                {recentFiltered.map(l => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => { onChange(l.value); setOpen(false); setSearch('') }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                      value === l.value ? 'bg-amber-50 text-amber-600' : 'text-ink-600 hover:bg-parchment-50'
                    }`}
                  >
                    <LangIcon langCode={l.value} size="sm" />
                    <span>{l.native}</span>
                  </button>
                ))}
              </>
            )}
            {commonFiltered.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] text-ink-400 font-bold uppercase">Common</div>
                {commonFiltered.map(l => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => { onChange(l.value); setOpen(false); setSearch('') }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                      value === l.value ? 'bg-amber-50 text-amber-600' : 'text-ink-600 hover:bg-parchment-50'
                    }`}
                  >
                    <LangIcon langCode={l.value} size="sm" />
                    <span>{l.native}</span>
                  </button>
                ))}
              </>
            )}
            {otherFiltered.length > 0 && (
              <>
                <div className="px-3 py-1 text-[10px] text-ink-400 font-bold uppercase border-t border-parchment-100">All Languages</div>
                {otherFiltered.map(l => (
                  <button
                    key={l.value}
                    type="button"
                    onClick={() => { onChange(l.value); setOpen(false); setSearch('') }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
                      value === l.value ? 'bg-amber-50 text-amber-600' : 'text-ink-600 hover:bg-parchment-50'
                    }`}
                  >
                    <LangIcon langCode={l.value} size="sm" />
                    <span>{l.native}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const SECTIONS = ['general', 'nativeLang']

const slideVariants = {
  enter: (dir) => ({ x: dir > 0 ? 80 : -80, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir) => ({ x: dir > 0 ? -80 : 80, opacity: 0 }),
}

function SettingsModal({ isOpen, onClose, uiLang, onUiLangChange, pageSize, onPageSizeChange, t, recentLangs, onRecentLangsChange, fontScaleMobile, fontScaleDesktop, onFontScaleMobileChange, onFontScaleDesktopChange }) {
  const [direction, setDirection] = useState(0)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loading, setLoading] = useState(true)
  const [localUiLang, setLocalUiLang] = useState(uiLang || 'zh')
  const [localPageSize, setLocalPageSize] = useState(50)
  const [activeSection, setActiveSection] = useState('general')
  const [saveError, setSaveError] = useState('')

  // Learning options state
  const [skipListening, setSkipListening] = useState(false)
  const [onlyNewWords, setOnlyNewWords] = useState(false)
  const [ttsEngine, setLocalTtsEngine] = useState(getTtsEngine())

  // 字体缩放：移动端 / 桌面端分别保存，默认 1.0
  const [localFontScaleMobile, setLocalFontScaleMobile] = useState(fontScaleMobile ?? 1)
  const [localFontScaleDesktop, setLocalFontScaleDesktop] = useState(fontScaleDesktop ?? 1)
  const isDesktop = useMediaQuery('(min-width: 768px)')

  useEffect(() => {
    if (isOpen) {
      setLoading(true)
      setSaved(false)
      setSaveError('')
      setActiveSection('general')
      setLocalTtsEngine(getTtsEngine())
      api.getUserPreferences().catch(() => ({})).then(prefs => {
        if (prefs.ui_lang) setLocalUiLang(prefs.ui_lang)
        else if (prefs.target_lang) setLocalUiLang(prefs.target_lang)
        if (prefs.page_size) setLocalPageSize(prefs.page_size)
        if (prefs.skip_listening !== undefined) setSkipListening(prefs.skip_listening)
        if (prefs.only_new_words !== undefined) setOnlyNewWords(prefs.only_new_words)
        if (prefs.tts_engine) {
          setLocalTtsEngine(prefs.tts_engine)
          setTtsEngine(prefs.tts_engine)
        }
        if (prefs.font_scale_mobile !== undefined && prefs.font_scale_mobile !== null) setLocalFontScaleMobile(prefs.font_scale_mobile)
        if (prefs.font_scale_desktop !== undefined && prefs.font_scale_desktop !== null) setLocalFontScaleDesktop(prefs.font_scale_desktop)
        setLoading(false)
      }).catch(() => {
        setLoading(false)
      })
    }
  }, [isOpen])

  // 实时预览：拖动滑块时立即应用当前设备对应的缩放到 documentElement
  // 移动端基础 12.6px（桌面的 90%），与 LearningApp 保持一致
  useEffect(() => {
    if (!isOpen) return
    const scale = isDesktop ? localFontScaleDesktop : localFontScaleMobile
    document.documentElement.style.fontSize = `${(isDesktop ? 14 : 12.6) * scale}px`
  }, [isOpen, isDesktop, localFontScaleMobile, localFontScaleDesktop])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const handleSave = async () => {
    setSaving(true)
    setSaved(false)
    setSaveError('')
    try {
      const updatedRecentLangs = [localUiLang, ...recentLangs.filter(code => code !== localUiLang)].slice(0, 5)
      await api.saveUserPreferences({
        target_lang: localUiLang,
        ui_lang: localUiLang,
        page_size: localPageSize,
        recent_languages: updatedRecentLangs,
        skip_listening: skipListening,
        only_new_words: onlyNewWords,
        tts_engine: ttsEngine,
        font_scale_mobile: localFontScaleMobile,
        font_scale_desktop: localFontScaleDesktop,
      })

      if (onRecentLangsChange) {
        onRecentLangsChange(updatedRecentLangs)
      }

      if (onUiLangChange && localUiLang !== uiLang) {
        onUiLangChange(localUiLang)
      }

      if (onPageSizeChange && localPageSize !== pageSize) {
        onPageSizeChange(localPageSize)
      }

      if (onFontScaleMobileChange && localFontScaleMobile !== fontScaleMobile) {
        onFontScaleMobileChange(localFontScaleMobile)
      }

      if (onFontScaleDesktopChange && localFontScaleDesktop !== fontScaleDesktop) {
        onFontScaleDesktopChange(localFontScaleDesktop)
      }

      setSaved(true)
      setTimeout(() => {
        setSaved(false)
        onClose()
      }, 300)
    } catch (e) {
      console.error('Failed to save settings:', e)
      setSaveError(t.saveFailedDesc || '设置保存失败，请重试')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const sectionLabels = {
    general: t.settingsGeneral || '通用',
    nativeLang: t.settingsNativeLang || '母语',
  }

  const renderGeneralSection = () => (
    <div className="space-y-5">
      {/* TTS Engine */}
      <div>
        <label className="label-warm flex items-center gap-1.5 text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1.5">
          <Volume2 className="w-3 h-3" />
          {t.ttsEngine || '发音引擎'}
        </label>
        <div className="space-y-2">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => { setLocalTtsEngine('edge'); setTtsEngine('edge') }}
              className={`flex-1 px-3 py-2 rounded-sm border-2 text-xs font-medium transition-colors text-left ${
                ttsEngine === 'edge'
                  ? 'border-amber-400 bg-amber-50/80 text-amber-600'
                  : 'border-aged-200 bg-parchment-50 text-ink-500 hover:bg-parchment-100'
              }`}
            >
              <div className="font-bold">Edge TTS</div>
              <div className="text-[10px] text-ink-400 mt-0.5">{t.ttsEdgeDesc || '效果好，需联网'}</div>
            </button>
            <button
              type="button"
              onClick={() => { setLocalTtsEngine('webspeech'); setTtsEngine('webspeech') }}
              className={`flex-1 px-3 py-2 rounded-sm border-2 text-xs font-medium transition-colors text-left ${
                ttsEngine === 'webspeech'
                  ? 'border-amber-400 bg-amber-50/80 text-amber-600'
                  : 'border-aged-200 bg-parchment-50 text-ink-500 hover:bg-parchment-100'
              }`}
            >
              <div className="font-bold">Web Speech API</div>
              <div className="text-[10px] text-ink-400 mt-0.5">{t.ttsWebSpeechDesc || '实时发音，取决于设备'}</div>
            </button>
          </div>
        </div>
      </div>

      {/* Items Per Page */}
      <div>
        <label className="label-warm flex items-center gap-1.5 text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1.5">
          <BookOpen className="w-3 h-3" />
          {t.itemsPerPage || '每页数量'}
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-ink-400">{t.wordsPerPage || '每页显示单词数'}</span>
            <span className="text-[11px] font-bold text-amber-500">{localPageSize}</span>
          </div>
          <div className="relative">
            <input
              type="range"
              min={10}
              max={200}
              step={10}
              value={localPageSize}
              onChange={e => setLocalPageSize(Number(e.target.value))}
              className="w-full h-2 rounded-none appearance-none cursor-pointer bg-parchment-100"
              style={{
                background: `linear-gradient(to right, #C08A3A 0%, #C08A3A ${((localPageSize - 10) / (200 - 10)) * 100}%, #F5ECD7 ${((localPageSize - 10) / (200 - 10)) * 100}%, #F5ECD7 100%)`
              }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-aged-300">10</span>
              <span className="text-[10px] text-aged-300">200</span>
            </div>
          </div>
        </div>
      </div>

      {/* Font Size - 单滑块自适应当前设备，后端按设备分别保存，用户无感知 */}
      <div>
        <label className="label-warm flex items-center gap-1.5 text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1.5">
          <Type className="w-3 h-3" />
          {t.fontSize || '字体大小'}
        </label>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-ink-400">{t.fontScaleDesc || '调整学习页面字号'}</span>
            <span className="text-[11px] font-bold text-amber-500 tabular-nums">{Math.round((isDesktop ? localFontScaleDesktop : localFontScaleMobile) * 100)}%</span>
          </div>
          <div className="relative">
            <input
              type="range"
              min={0.8}
              max={1.4}
              step={0.05}
              value={isDesktop ? localFontScaleDesktop : localFontScaleMobile}
              onChange={e => {
                const v = Number(e.target.value)
                if (isDesktop) setLocalFontScaleDesktop(v)
                else setLocalFontScaleMobile(v)
              }}
              className="w-full h-2 rounded-none appearance-none cursor-pointer bg-parchment-100"
              style={{
                background: `linear-gradient(to right, #C08A3A 0%, #C08A3A ${(((isDesktop ? localFontScaleDesktop : localFontScaleMobile) - 0.8) / (1.4 - 0.8)) * 100}%, #F5ECD7 ${(((isDesktop ? localFontScaleDesktop : localFontScaleMobile) - 0.8) / (1.4 - 0.8)) * 100}%, #F5ECD7 100%)`
              }}
            />
            <div className="flex justify-between mt-1">
              <span className="text-[10px] text-aged-300">{t.fontScaleSmall || '小'}</span>
              <span className="text-[10px] text-aged-300">{t.fontScaleLarge || '大'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Learning Options */}
      <div className="space-y-3 pt-2 border-t border-aged-200/60">
        <label className="label-warm flex items-center gap-1.5 text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1.5">
          <BookOpen className="w-3 h-3" />
          {t.learningOptions || '学习选项'}
        </label>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-xs font-medium text-ink-700">{t.onlyNewWords || '只学新词'}</p>
            <p className="text-[10px] text-ink-400">{t.onlyNewWordsDesc || '跳过已学过的单词'}</p>
          </div>
          <button onClick={() => setOnlyNewWords(v => !v)} className="transition-colors">
            {onlyNewWords ? (
              <svg className="w-8 h-5 text-amber-500" viewBox="0 0 32 20" fill="currentColor"><rect x="12" y="0" width="20" height="20" rx="10" fill="currentColor"/><circle cx="22" cy="10" r="7" fill="white"/></svg>
            ) : (
              <svg className="w-8 h-5 text-aged-300" viewBox="0 0 32 20" fill="currentColor"><rect x="0" y="0" width="20" height="20" rx="10" fill="currentColor"/><circle cx="10" cy="10" r="7" fill="white"/></svg>
            )}
          </button>
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-xs font-medium text-ink-700">{t.skipListening || '跳过听力'}</p>
            <p className="text-[10px] text-ink-400">{t.skipListeningDesc || '跳过听力练习'}</p>
          </div>
          <button onClick={() => setSkipListening(v => !v)} className="transition-colors">
            {skipListening ? (
              <svg className="w-8 h-5 text-amber-500" viewBox="0 0 32 20" fill="currentColor"><rect x="12" y="0" width="20" height="20" rx="10" fill="currentColor"/><circle cx="22" cy="10" r="7" fill="white"/></svg>
            ) : (
              <svg className="w-8 h-5 text-aged-300" viewBox="0 0 32 20" fill="currentColor"><rect x="0" y="0" width="20" height="20" rx="10" fill="currentColor"/><circle cx="10" cy="10" r="7" fill="white"/></svg>
            )}
          </button>
        </div>
      </div>
    </div>
  )

  const renderNativeLangSection = () => (
    <div className="space-y-4">
      <div>
        <label className="label-warm flex items-center gap-1.5 text-[10px] font-bold text-ink-400 uppercase tracking-widest mb-1.5">
          <Languages className="w-3 h-3" />
          {t.nativeLang || '母语'}
        </label>
        <NativeLangSelector value={localUiLang} onChange={setLocalUiLang} recentLangs={recentLangs} />
        <p className="text-[10px] text-ink-400 mt-1.5">
          {t.retryIntervalDesc ? 'UI language and translation target language' : '界面语言和翻译目标语言'}
        </p>
      </div>
    </div>
  )

  const renderContent = () => {
    switch (activeSection) {
      case 'general': return renderGeneralSection()
      case 'nativeLang': return renderNativeLangSection()
      default: return null
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-ink-800/40 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15 }}
          className="bg-parchment-50 border-0 sm:border-2 border-aged-200 rounded-none sm:rounded-md shadow-retro-xl w-full h-full sm:w-[580px] sm:h-[520px] overflow-hidden flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-aged-200/80 bg-parchment-50/60 shrink-0">
            <h2 className="font-display text-sm font-bold text-ink-800">{t.settings || '设置'}</h2>
            <button
              onClick={onClose}
              className="btn-ghost p-1 text-ink-400 hover:text-ink-600 rounded-md transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body: Sidebar + Content */}
          <div className="flex flex-1 min-h-0 flex-row">
            {/* Left Sidebar */}
            <div className="flex flex-col w-[110px] sm:w-[130px] shrink-0 border-r border-aged-200/60 bg-parchment-100/40 py-2">
              {SECTIONS.map(key => {
                const isActive = activeSection === key
                return (
                  <button
                    key={key}
                    onClick={() => setActiveSection(key)}
                    className={`w-full flex items-center px-4 py-2.5 text-xs font-medium transition-colors text-left ${
                      isActive
                        ? 'bg-amber-50/80 text-amber-600 border-r-2 border-amber-400 shrink-0'
                        : 'text-ink-500 hover:text-ink-700 hover:bg-parchment-50/60 shrink-0'
                    }`}
                  >
                    <span>{sectionLabels[key]}</span>
                  </button>
                )
              })}
            </div>

            {/* Right Content */}
            <div className="flex-1 min-w-0 overflow-y-auto p-5">
              {loading ? (
                <div className="py-12 flex justify-center">
                  <Loader2 className="w-5 h-5 animate-spin text-aged-300" />
                </div>
              ) : (
                <AnimatePresence mode="wait">
                  <motion.div
                    key={activeSection}
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                  >
                    {renderContent()}
                  </motion.div>
                </AnimatePresence>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="shrink-0 border-t border-aged-200/80 bg-parchment-50/60 px-5 py-3">
            {/* Save Error */}
            {saveError && (
              <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-rust-50 border-2 border-rust-200 rounded-sm">
                <AlertCircle className="w-3.5 h-3.5 text-rust-500 shrink-0" />
                <span className="text-[11px] text-rust-500">{saveError}</span>
              </div>
            )}
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={onClose}
                className="btn-ghost px-4 py-2 text-xs"
              >
                {t.cancel || '取消'}
              </button>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleSave}
                disabled={saving}
                className="btn-primary px-5 py-2 text-xs flex items-center gap-2"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : saved ? (
                  <Check className="w-3.5 h-3.5" />
                ) : null}
                {saving ? (t.saving || '保存中...') : saved ? (t.saved || '已保存') : (t.save || '保存')}
              </motion.button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}

export default SettingsModal
