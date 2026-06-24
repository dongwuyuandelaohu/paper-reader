import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Library from './pages/Library'
import Reader from './pages/Reader'
import Settings from './pages/Settings'
import Models from './pages/Models'
import { Toast } from './components/Toast'
import { waitForBackend } from './api/client'

function App() {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')

  useEffect(() => {
    const isDev = import.meta.env.DEV
    if (isDev) {
      setState('ready')
      return
    }

    waitForBackend().then(ok => setState(ok ? 'ready' : 'failed'))
  }, [])

  const handleRetry = () => {
    setState('loading')
    waitForBackend().then(ok => setState(ok ? 'ready' : 'failed'))
  }

  if (state !== 'ready') {
    return (
      <div className="flex items-center justify-center h-screen bg-[#1a1a2e]">
        <div className="text-center">
          {state === 'loading' ? (
            <>
              <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-gray-400 text-lg">PaperLens 正在启动...</p>
            </>
          ) : (
            <>
              <div className="w-12 h-12 mx-auto mb-4 text-red-400 text-4xl leading-none">!</div>
              <p className="text-red-400 text-lg font-medium mb-2">启动失败</p>
              <p className="text-gray-500 text-sm mb-4 max-w-xs mx-auto">
                后端服务未能响应。请确保已安装 Visual C++ Redistributable 后重试。
              </p>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm transition-colors"
              >
                重试
              </button>
            </>
          )}
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
