import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Library from './pages/Library'
import Reader from './pages/Reader'
import Settings from './pages/Settings'
import Models from './pages/Models'
import { Toast } from './components/Toast'
import { waitForBackend } from './api/client'

function App() {
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const isDev = import.meta.env.DEV
    if (isDev) {
      // 开发环境：后端已经在运行，直接就绪
      setReady(true)
      return
    }

    // 生产环境：等待后端启动
    waitForBackend().then(setReady)
  }, [])

  if (!ready) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a2e]">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-400 text-lg">PaperLens 正在启动...</p>
        </div>
      </div>
    )
  }

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Library />} />
        <Route path="/reader/:id" element={<Reader />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/models" element={<Models />} />
      </Routes>
      <Toast />
    </BrowserRouter>
  )
}

export default App
