import { useState, useEffect } from 'react'

/**
 * 响应式媒体查询 hook。
 * 初值取 matchMedia().matches 避免首帧闪烁（FOUC）。
 * 本项目是 Vite SPA（main.jsx 客户端渲染），无 SSR，window 在渲染时一定存在。
 */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia(query).matches
  )
  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])
  return matches
}
