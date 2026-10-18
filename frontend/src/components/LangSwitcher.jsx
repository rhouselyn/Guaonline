import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Globe } from 'lucide-react'
import { COMMON_LANGUAGES } from '../utils/commonLanguages'

// 公共页面右上角的母语切换按钮：仅影响落地页/登录页自身，不触发全屏阻塞。
export default function LangSwitcher({ lang, onChange, className = '' }) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const current = COMMON_LANGUAGES.find(l => l.value === lang)
  const filtered = COMMON_LANGUAGES.filter(l => {
    if (!search) return true
    const s = search.toLowerCase()
    return l.native.toLowerCase().includes(s) || l.en.toLowerCase().includes(s) || l.zh.includes(search) || l.value.toLowerCase().includes(s)
  })

  const pick = (v) => { onChange(v); setOpen(false); setSearch('') }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-[#d4c9a8] bg-[#faf8f0]/80 hover:bg-[#f0ead6] text-[#524d3c] text-sm transition-colors"
      >
        <Globe className="w-4 h-4 text-[#8b7e5e]" />
        <span className="max-w-[7rem] truncate">{current?.native || lang}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-[#8b7e5e] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-56 bg-[#faf8f0] rounded border-2 border-[#d4c9a8] shadow-xl overflow-hidden">
          <div className="p-2 border-b border-[#e6dfc8]">
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoFocus
              className="w-full px-2 py-1.5 rounded bg-white border border-[#e6dfc8] text-xs text-[#3d3929] focus:outline-none focus:border-[#d4a853]"
            />
          </div>
          <div className="max-h-64 overflow-y-auto py-1">
            {filtered.map(l => (
              <button
                key={l.value}
                type="button"
                onClick={() => pick(l.value)}
                className={`w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs transition-colors ${
                  lang === l.value ? 'bg-[#f0ead6] text-[#3d3929] font-medium' : 'text-[#524d3c] hover:bg-[#f0ead6]/60'
                }`}
              >
                <span>{l.native}</span>
                <span className="text-[10px] text-[#b5ae8e]">{l.zh}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
