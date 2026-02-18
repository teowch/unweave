import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.jsx'

// Electron loads via file:// protocol — BrowserRouter can't handle that
// (routes like /settings would try to load a real file and 404).
// HashRouter uses #/settings which works with any protocol.
const Router = window.electronAPI ? HashRouter : BrowserRouter;

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router>
      <App />
    </Router>
  </StrictMode>,
)
