import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import { ToastProvider } from './hooks/useToast'
import { ToastViewport } from './components/ui/toast'
import { useToast } from './hooks/useToast'
import App from './App'
import './index.css'

function ToastContainer() {
  const { toasts, dismiss } = useToast()
  return <ToastViewport toasts={toasts} onDismiss={dismiss} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <App />
        <ToastContainer />
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>,
)
