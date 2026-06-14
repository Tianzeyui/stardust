import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getSupabaseConfig, saveSupabaseConfig, clearSupabaseConfig } from '@/lib/supabase'
import { getCloudinaryConfig, saveCloudinaryConfig, clearCloudinaryConfig } from '@/lib/config'

export function GeneralTab() {
  const sc = getSupabaseConfig()
  const cc = getCloudinaryConfig()
  const [saved, setSaved] = useState(false)
  const [supabaseUrl, setSupabaseUrl] = useState(sc?.url || '')
  const [supabaseKey, setSupabaseKey] = useState(sc?.anonKey || '')
  const [cloudName, setCloudName] = useState(cc.cloudName)
  const [uploadPreset, setUploadPreset] = useState(cc.uploadPreset)

  const flash = () => { setSaved(true); setTimeout(() => setSaved(false), 1500) }

  const save = async () => {
    await saveSupabaseConfig(supabaseUrl, supabaseKey)
    await saveCloudinaryConfig({ cloudName, uploadPreset })
    flash()
  }

  const clear = async () => {
    await clearSupabaseConfig()
    await clearCloudinaryConfig()
    setSupabaseUrl(''); setSupabaseKey(''); setCloudName(''); setUploadPreset('')
    flash()
  }

  return (
    <div className="w-full space-y-6">
      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-2 text-sm font-semibold">Supabase</legend>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Project URL</Label><Input placeholder="https://xxxxx.supabase.co" value={supabaseUrl} onChange={e => setSupabaseUrl(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Anon Key</Label><Input placeholder="eyJhbGciOiJIUzI1NiIs..." value={supabaseKey} onChange={e => setSupabaseKey(e.target.value)} /><p className="text-xs text-muted-foreground">Dashboard → Settings → API，使用 anon/public 密钥</p></div>
        </div>
      </fieldset>
      <fieldset className="rounded-lg border border-border p-4">
        <legend className="px-2 text-sm font-semibold">Cloudinary（图片上传）</legend>
        <div className="grid gap-3">
          <div className="grid gap-1.5"><Label>Cloud Name</Label><Input placeholder="your-cloud-name" value={cloudName} onChange={e => setCloudName(e.target.value)} /></div>
          <div className="grid gap-1.5"><Label>Upload Preset</Label><Input placeholder="ml_default" value={uploadPreset} onChange={e => setUploadPreset(e.target.value)} /></div>
        </div>
      </fieldset>
      <div className="flex items-center justify-between pt-2">
        <Button variant="ghost" size="sm" onClick={clear}>清除全部配置</Button>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-muted-foreground">已保存</span>}
          <Button size="sm" onClick={save}>保存</Button>
        </div>
      </div>
    </div>
  )
}
