import { useState, useEffect } from 'react'
import { Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import {
  getSupabaseConfig,
  saveSupabaseConfig,
  clearSupabaseConfig,
} from '@/lib/supabase'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [url, setUrl] = useState('')
  const [anonKey, setAnonKey] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (open) {
      const config = getSupabaseConfig()
      if (config) {
        setUrl(config.url)
        setAnonKey(config.anonKey)
      }
      setSaved(false)
    }
  }, [open])

  const handleSave = () => {
    if (!url.trim() || !anonKey.trim()) return
    saveSupabaseConfig(url.trim(), anonKey.trim())
    setSaved(true)
    // 关闭弹窗前短暂显示"已保存"
    setTimeout(() => {
      onOpenChange(false)
    }, 800)
  }

  const handleClear = () => {
    clearSupabaseConfig()
    setUrl('')
    setAnonKey('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Supabase 设置
          </DialogTitle>
          <DialogDescription>
            配置 Supabase 后端服务的连接信息。这些信息将保存在本地浏览器中。
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="supabase-url">Supabase URL</Label>
            <Input
              id="supabase-url"
              placeholder="https://xxxxx.supabase.co"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              在 Supabase 控制台的 Settings → API 中找到 Project URL
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="supabase-anon-key">Anon Key（匿名密钥）</Label>
            <Input
              id="supabase-anon-key"
              placeholder="eyJhbGciOiJIUzI1NiIs..."
              value={anonKey}
              onChange={(e) => setAnonKey(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              在 Supabase 控制台的 Settings → API 中找到 anon/public key
            </p>
          </div>
        </div>

        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <Button variant="ghost" size="sm" onClick={handleClear} type="button">
            清除配置
          </Button>
          <div className="flex gap-2">
            {saved && (
              <span className="flex items-center text-sm text-green-600">
                ✓ 已保存
              </span>
            )}
            <Button onClick={handleSave} disabled={!url.trim() || !anonKey.trim()}>
              保存配置
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
