/**
 * 统一配置存储 — 所有应用配置存到 userData/ JSON 文件
 * 替代 localStorage，保证数据不丢失
 */
import { app } from 'electron'
import fs from 'fs'
import path from 'path'

const configDir = path.join(app.getPath('userData'), 'config')

function ensureDir() {
  if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true })
}

function readJSON<T>(file: string, fallback: T): T {
  try {
    ensureDir()
    const p = path.join(configDir, file)
    if (!fs.existsSync(p)) return fallback
    return JSON.parse(fs.readFileSync(p, 'utf-8'))
  } catch { return fallback }
}

function writeJSON(file: string, data: unknown): void {
  ensureDir()
  fs.writeFileSync(path.join(configDir, file), JSON.stringify(data, null, 2), 'utf-8')
}

// ====== Supabase ======

export interface SupabaseConfig {
  url: string
  anonKey: string
}

export function getSupabase(): SupabaseConfig {
  return readJSON<SupabaseConfig>('supabase.json', { url: '', anonKey: '' })
}

export function saveSupabase(config: SupabaseConfig): void {
  writeJSON('supabase.json', config)
}

export function clearSupabase(): void {
  writeJSON('supabase.json', { url: '', anonKey: '' })
}

// ====== Cloudinary ======

export interface CloudinaryConfig {
  cloudName: string
  uploadPreset: string
}

export function getCloudinary(): CloudinaryConfig {
  return readJSON<CloudinaryConfig>('cloudinary.json', { cloudName: '', uploadPreset: '' })
}

export function saveCloudinary(config: CloudinaryConfig): void {
  writeJSON('cloudinary.json', config)
}

export function clearCloudinary(): void {
  writeJSON('cloudinary.json', { cloudName: '', uploadPreset: '' })
}

// ====== AI Models ======

export function getAIModels(): any[] {
  return readJSON<any[]>('ai-models.json', [])
}

export function saveAIModels(models: any[]): void {
  writeJSON('ai-models.json', models)
}
