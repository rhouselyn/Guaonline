import { Routes, Route } from 'react-router-dom'
import { lazy, Suspense } from 'react'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import LearningApp from './pages/LearningApp'

const AdminPage = lazy(() => import('./pages/AdminPage'))
const AdminDashboard = lazy(() => import('./components/admin/AdminDashboard'))
const AdminApiKeys = lazy(() => import('./components/admin/AdminApiKeys'))
const AdminUsers = lazy(() => import('./components/admin/AdminUsers'))
const AdminUserDetail = lazy(() => import('./components/admin/AdminUserDetail'))
const AdminQuota = lazy(() => import('./components/admin/AdminQuota'))
const AdminBlacklist = lazy(() => import('./components/admin/AdminBlacklist'))
const AdminCosts = lazy(() => import('./components/admin/AdminCosts'))
const AdminGlobalSettings = lazy(() => import('./components/admin/AdminGlobalSettings'))

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
      <Route path="/learn" element={<LearningApp />} />
      <Route path="/learn/:fileId" element={<LearningApp />} />
      <Route path="/admin" element={<AdminSuspense><AdminPage /></AdminSuspense>}>
        <Route index element={<AdminSuspense><AdminDashboard /></AdminSuspense>} />
        <Route path="api-keys" element={<AdminSuspense><AdminApiKeys /></AdminSuspense>} />
        <Route path="global-settings" element={<AdminSuspense><AdminGlobalSettings /></AdminSuspense>} />
        <Route path="users" element={<AdminSuspense><AdminUsers /></AdminSuspense>} />
        <Route path="users/:id" element={<AdminSuspense><AdminUserDetail /></AdminSuspense>} />
        <Route path="quota" element={<AdminSuspense><AdminQuota /></AdminSuspense>} />
        <Route path="blacklist" element={<AdminSuspense><AdminBlacklist /></AdminSuspense>} />
        <Route path="costs" element={<AdminSuspense><AdminCosts /></AdminSuspense>} />
      </Route>
    </Routes>
  )
}

export default App
