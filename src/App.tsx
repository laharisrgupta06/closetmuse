import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'

function Home() {
  return <h1>ClosetMuse</h1>
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App