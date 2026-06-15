import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Library from './pages/Library'
import Reader from './pages/Reader'
import Settings from './pages/Settings'
import Models from './pages/Models'
import { Toast } from './components/Toast'

function App() {
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
