import { useCallback, useEffect, useRef, useState } from 'react'
import { translations } from './translations'
import { api } from './api'

// 公共页面（落地页/登录页）的界面语言。
// 与登录后的界面语言设置相互独立：这里只存在 localStorage 里，也只影响这两个页面；
// 后台会顺带调一次 /api/translate_ui 让学习界面那份词典按后端缓存规则静默生成好。
const LANG_KEY = 'gualingo_public_lang'
const CACHE_KEY = 'gualingo_public_translations'

const memCache = (() => {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)) || {} } catch { return {} }
})()

export function getPublicLang() {
  try { return localStorage.getItem(LANG_KEY) || 'zh' } catch { return 'zh' }
}

// 内置语言（zh/en）直接用本地字典
function builtinDict(code) {
  if (!translations[code]) return null
  return translations[code]
}

function persistCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(memCache)) } catch { /* ignore */ }
}

export function usePublicI18n() {
  const [lang, setLang] = useState(getPublicLang)
  const [dict, setDict] = useState(() => {
    const code = getPublicLang()
    return builtinDict(code) || memCache[code] || null
  })
  // 上一份可用字典：目标语言尚未就绪时先沿用它兜底（软配对，不阻塞、不空屏）
  const lastDictRef = useRef(dict)
  if (dict) lastDictRef.current = dict

  useEffect(() => {
    const builtin = builtinDict(lang)
    if (builtin) { setDict(builtin); return }
    // 命中本地缓存 → 立刻切换
    if (memCache[lang]) setDict(memCache[lang])
    // 无论是否命中，都在后台按后端缓存规则拉一次（命中则秒回，缺失则补译）
    let cancelled = false
    api.translateUI(lang).then(data => {
      if (cancelled || !data || data._error) return
      memCache[lang] = data
      persistCache()
      setDict(data)
    }).catch(() => { /* 静默失败，保留旧字典兜底 */ })
    return () => { cancelled = true }
  }, [lang])

  const changeLang = useCallback((code) => {
    try { localStorage.setItem(LANG_KEY, code) } catch { /* ignore */ }
    setLang(code)
  }, [])

  // 缺失的 key 一律退回中文基准（软配对）
  const base = dict || lastDictRef.current || translations.zh
  const t = { ...translations.zh, ...base }

  return { lang, t, changeLang }
}
