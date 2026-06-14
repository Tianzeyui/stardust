import React from 'react'
import ReactDOM from 'react-dom/client'
import { AuthProvider } from './contexts/AuthContext'
import { NotificationProvider } from './contexts/NotificationContext'
import { ToastProvider } from './hooks/useToast'
import { ToastViewport } from './components/ui/toast'
import { useToast } from './hooks/useToast'
import { initConfig } from './lib/config'
import { initSupabaseConfig } from './lib/supabase'
import App from './App'
import './index.css'

// 启动时从磁盘加载配置
Promise.all([initConfig(), initSupabaseConfig()]).catch(() => {})

function ToastContainer() {
  const { toasts, dismiss } = useToast()
  return <ToastViewport toasts={toasts} onDismiss={dismiss} />
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ToastProvider>
      <AuthProvider>
        <NotificationProvider>
          <App />
          <ToastContainer />
        </NotificationProvider>
      </AuthProvider>
    </ToastProvider>
  </React.StrictMode>,
)
