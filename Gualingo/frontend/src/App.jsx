import { Routes, Route } from 'react-router-dom'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import LearningApp from './pages/LearningApp'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/learn" element={<LearningApp />} />
      <Route path="/learn/:fileId" element={<LearningApp />} />
    </Routes>
  )
}

export default App
