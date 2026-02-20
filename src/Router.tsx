import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import AgentsHome from './pages/AgentsHome'

export default function Router() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AgentsHome />} />
        <Route path="/new" element={<App />} />
        <Route path="/agent/:id" element={<App />} />
      </Routes>
    </BrowserRouter>
  )
}
