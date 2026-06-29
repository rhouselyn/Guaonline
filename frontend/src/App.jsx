import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import LandingPage from './pages/LandingPage'

// ponytail: 非首屏页面 lazy 化，避免其依赖（framer-motion 等）阻塞首屏 LandingPage
const LoginPage = lazy(() => import('./pages/LoginPage'))
const LearningApp = lazy(() => import('./pages/LearningApp'))
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'))

const AdminPage = lazy(() => import('./pages/AdminPage'))
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'))
const AdminApiKeys = lazy(() => import('./components/admin/AdminApiKeys'))
const AdminUsers = lazy(() => import('./components/admin/AdminUsers'))
const AdminUserDetail = lazy(() => import('./components/admin/AdminUserDetail'))
const AdminCosts = lazy(() => import('./components/admin/AdminCosts'))
const AdminGlobalVocab = lazy(() => import('./components/admin/AdminGlobalVocab'))

// 复用首屏 loading 视觉，避免页面切换时白屏/闪烁
// ponytail: 内联 SVG（vs gualingo-72.webp），无额外 HTTP 请求 + 任意分辨率清晰
function FrogSpinner({ size = 56 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <ellipse cx="100" cy="120" rx="70" ry="55" fill="#B5AE8E" stroke="#8B7E5E" strokeWidth="3"/>
      <ellipse cx="100" cy="115" rx="62" ry="48" fill="#D8D4BF"/>
      <circle cx="68" cy="72" r="30" fill="#B5AE8E" stroke="#8B7E5E" strokeWidth="3"/>
      <circle cx="68" cy="72" r="24" fill="#FFF" stroke="#8B7E5E" strokeWidth="2"/>
      <circle cx="72" cy="68" r="10" fill="#524D3C"/>
      <circle cx="75" cy="65" r="3" fill="#FFF"/>
      <circle cx="132" cy="72" r="30" fill="#B5AE8E" stroke="#8B7E5E" strokeWidth="3"/>
      <circle cx="132" cy="72" r="24" fill="#FFF" stroke="#8B7E5E" strokeWidth="2"/>
      <circle cx="136" cy="68" r="10" fill="#524D3C"/>
      <circle cx="139" cy="65" r="3" fill="#FFF"/>
      <ellipse cx="100" cy="130" rx="32" ry="14" fill="#E8C985" stroke="#8B7E5E" strokeWidth="2"/>
      <path d="M74 126 Q100 146 126 126" stroke="#524D3C" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <ellipse cx="55" cy="110" rx="12" ry="8" fill="#D4A853" opacity="0.4"/>
      <ellipse cx="145" cy="110" rx="12" ry="8" fill="#D4A853" opacity="0.4"/>
    </svg>
  )
}

function PageSuspense({ children, dark = false }) {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={dark ? { background: '#1a1a2e', color: '#e8d5b7' } : { background: '#faf8f0', color: '#8b7e5e' }}>
        <div className="flex flex-col items-center gap-4">
          <div style={{ width: 56, height: 56, opacity: 0.9 }}><FrogSpinner size={56} /></div>
          <div style={{ width: 28, height: 28, border: '3px solid #d4c9a8', borderTopColor: '#d4a853', borderRadius: '50%', animation: 'bs-spin 0.8s linear infinite' }} />
        </div>
      </div>
    }>
      {children}
    </Suspense>
  )
}

function AdminSuspense({ children }) {
  return <PageSuspense dark>{children}</PageSuspense>
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<PageSuspense><LoginPage /></PageSuspense>} />
      <Route path="/oauth-callback" element={<PageSuspense><OAuthCallback /></PageSuspense>} />
      <Route path="/learn" element={<PageSuspense><LearningApp /></PageSuspense>} />
      <Route path="/learn/:fileId" element={<PageSuspense><LearningApp /></PageSuspense>} />
      <Route path="/admin" element={<AdminSuspense><AdminPage /></AdminSuspense>}>
        <Route index element={<AdminSuspense><AdminDashboard /></AdminSuspense>} />
        <Route path="api-keys" element={<AdminSuspense><AdminApiKeys /></AdminSuspense>} />
        <Route path="users" element={<AdminSuspense><AdminUsers /></AdminSuspense>} />
        <Route path="users/:id" element={<AdminSuspense><AdminUserDetail /></AdminSuspense>} />
        <Route path="costs" element={<AdminSuspense><AdminCosts /></AdminSuspense>} />
        <Route path="global-vocab" element={<AdminSuspense><AdminGlobalVocab /></AdminSuspense>} />
      </Route>
    </Routes>
  )
}

export default App
