import { useEffect } from 'react'
import { AuthPage } from '@/components/auth/AuthPage'
import { AppLayout } from '@/components/layout/AppLayout'
import { useAuth } from '@/contexts/AuthContext'
import { isSupabaseConfigured } from '@/lib/supabase'
import { setEncryptionKey, loadAIModelsFromDisk } from '@/lib/config'

function App() {
  const { user, loading } = useAuth()
  const hasConfig = isSupabaseConfigured()

  // 登录后设置 API Key 加密密钥，重新加载解密后的模型
  useEffect(() => {
    if (user?.email) {
      setEncryptionKey(user.email)
      loadAIModelsFromDisk()
    }
  }, [user?.email])

  // 加载中
  if (loading && hasConfig) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    )
  }

  // 未登录或未配置 → 显示认证页
  if (!user) {
    return <AuthPage />
  }

  // 已登录 → 显示主应用布局
  return <AppLayout />
}

export default App
