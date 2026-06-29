import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  server: {
    host: '0.0.0.0',
    port: parseInt(process.env.VITE_PORT || '5173', 10),
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:8000',
        changeOrigin: true,
        timeout: 600000,
      }
    }
  },
  // ponytail: 分离重依赖到独立 chunk，浏览器并行加载 + 长缓存（依赖不变时不重新下载）
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'framer-motion': ['framer-motion'],
          'lucide': ['lucide-react'],
        },
      },
    },
    // ponytail: 关键修复——Vite 默认会把 manualChunks 中声明的所有 chunk 都 modulepreload，
    // 包括 framer-motion。但 LandingPage 已不再依赖 framer-motion（仅 lazy-loaded 页面用），
    // 预加载它会浪费 38 KiB（gzip）网络与解析时间，拖慢 LCP。
    // 通过 resolveDependencies 过滤掉非首屏 chunk（framer-motion），
    // 只保留 react-vendor + lucide 两个 LandingPage 真正需要的 chunk。
    modulePreload: {
      polyfill: true,
      resolveDependencies: (filename, deps, { hostId, hostType }) => {
        // 只为入口（hostType === 'html'）过滤；lazy chunk 的依赖照常预加载
        if (hostType !== 'html') return deps
        return deps.filter(dep => !dep.includes('framer-motion'))
      },
    },
  },
})
