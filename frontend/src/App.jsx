import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import LearningApp from './pages/LearningApp'
import OAuthCallback from './pages/OAuthCallback'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'))
const AdminApiKeys = lazy(() => import('./components/admin/AdminApiKeys'))
const AdminUsers = lazy(() => import('./components/admin/AdminUsers'))
const AdminUserDetail = lazy(() => import('./components/admin/AdminUserDetail'))
const AdminCosts = lazy(() => import('./components/admin/AdminCosts'))
const AdminGlobalVocab = lazy(() => import('./components/admin/AdminGlobalVocab'))

function AdminSuspense({ children }) {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#1a1a2e] flex items-center justify-center text-[#e8d5b7]">加载中...</div>}>
      {children}
    </Suspense>
  )
}

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/oauth-callback" element={<OAuthCallback />} />
      <Route path="/learn" element={<LearningApp />} />
      <Route path="/learn/:fileId" element={<LearningApp />} />
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
