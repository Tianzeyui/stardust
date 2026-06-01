import { useState } from 'react'
import { Brain, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { LoginForm } from './LoginForm'
import { RegisterForm } from './RegisterForm'
import { SettingsDialog } from './SettingsDialog'
import { isSupabaseConfigured } from '@/lib/supabase'

type AuthView = 'login' | 'register'

export function AuthPage() {
  const [view, setView] = useState<AuthView>('login')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const hasConfig = isSupabaseConfigured()

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-50 to-slate-100 px-4 dark:from-slate-950 dark:to-slate-900">
      {/* 头部 */}
      <div className="flex items-center gap-3">
        <Brain className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">BrainPlus</h1>
      </div>

      {/* 设置按钮 */}
      <div className="absolute right-4 top-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setSettingsOpen(true)}
          title="Supabase 设置"
        >
          <Settings className="h-5 w-5" />
          <span className="sr-only">设置</span>
        </Button>
      </div>

      {/* 未配置提示 */}
      {!hasConfig && (
        <Card className="w-full max-w-md border-yellow-300 bg-yellow-50 dark:border-yellow-800 dark:bg-yellow-950/30">
          <CardContent className="p-4">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">
              ⚠️ 尚未配置 Supabase 连接信息。请点击右上角的{' '}
              <Settings className="inline h-4 w-4" /> 设置按钮进行配置。
            </p>
          </CardContent>
        </Card>
      )}

      {/* 认证卡片 */}
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>
            {view === 'login' ? '欢迎回来' : '创建账号'}
          </CardTitle>
          <CardDescription>
            {view === 'login'
              ? '使用邮箱和密码登录您的 BrainPlus 账号'
              : '注册一个新的 BrainPlus 账号'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {view === 'login' ? (
            <LoginForm onSwitchToRegister={() => setView('register')} />
          ) : (
            <RegisterForm onSwitchToLogin={() => setView('login')} />
          )}
        </CardContent>
      </Card>

      {/* 设置弹窗 */}
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </div>
  )
}
