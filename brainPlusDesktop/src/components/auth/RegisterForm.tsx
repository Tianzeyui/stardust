import { useState, FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/contexts/AuthContext'

interface RegisterFormProps {
  onSwitchToLogin: () => void
}

export function RegisterForm({ onSwitchToLogin }: RegisterFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const { signUp, error } = useAuth()

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!email.trim() || !password.trim()) return

    if (password !== confirmPassword) {
      return
    }

    setSubmitting(true)
    setSuccessMsg('')
    try {
      await signUp(email, password)
      setSuccessMsg('注册成功！请检查邮箱中的确认邮件。')
    } catch {
      // 错误由 hook 统一处理
    } finally {
      setSubmitting(false)
    }
  }

  const passwordMismatch = confirmPassword && password !== confirmPassword

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="reg-email">邮箱</Label>
        <Input
          id="reg-email"
          type="email"
          placeholder="your@email.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="reg-password">密码</Label>
        <Input
          id="reg-password"
          type="password"
          placeholder="至少 6 位字符"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="new-password"
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="reg-confirm-password">确认密码</Label>
        <Input
          id="reg-confirm-password"
          type="password"
          placeholder="再次输入密码"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          autoComplete="new-password"
        />
        {passwordMismatch && (
          <p className="text-sm text-destructive">两次输入的密码不一致</p>
        )}
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {successMsg && (
        <div className="rounded-md bg-green-50 p-3 text-sm text-green-700 dark:bg-green-900/20 dark:text-green-400">
          {successMsg}
        </div>
      )}

      <Button
        type="submit"
        disabled={submitting || !!passwordMismatch}
        className="w-full"
      >
        {submitting ? '注册中...' : '注册'}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        已有账号？{' '}
        <button
          type="button"
          onClick={onSwitchToLogin}
          className="font-medium text-primary underline underline-offset-4 hover:opacity-80"
        >
          返回登录
        </button>
      </p>
    </form>
  )
}
