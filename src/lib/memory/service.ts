/**
 * MemoryService — Claude Code 风格记忆服务
 * 替换旧的 MemoryManager，去掉自动提取、分层、Supabase
 */
import type { MemoryEntry, MemoryIndex, MemoryStore } from './types'
import { createMemoryStore } from './store'

let _store: MemoryStore | null = null
let _projectPath: string | null = null

/** 初始化/切换项目的记忆存储 */
export function initMemoryStore(getProjectPath: () => string | null): MemoryStore {
  _store = createMemoryStore(getProjectPath)
  return _store
}

function store(): MemoryStore {
  if (!_store) throw new Error('MemoryStore 未初始化，请先调用 initMemoryStore')
  return _store
}

export function getCurrentProjectPath(): string | null {
  return _projectPath
}

export function setCurrentProjectPath(path: string | null) {
  _projectPath = path
}

// ====== CRUD ======

export async function listMemories(): Promise<MemoryIndex[]> {
  return store().list()
}

export async function readMemory(name: string): Promise<MemoryEntry | null> {
  return store().read(name)
}

export async function writeMemory(
  name: string,
  description: string,
  body: string,
  type: MemoryEntry['metadata']['type'] = 'user',
): Promise<void> {
  await store().write({ name, description, metadata: { type }, body })
}

export async function deleteMemory(name: string): Promise<void> {
  await store().delete(name)
}

/** 获取注入系统提示的记忆文本（MEMORY.md 内容） */
export async function getInjectionText(): Promise<string | null> {
  return store().getInjectionText()
}

/** 检查指定 slug 是否已存在（用于工具去重提示） */
export async function memoryExists(name: string): Promise<boolean> {
  const entry = await store().read(name)
  return entry !== null
}

/** 列出所有 slug（用于工具校验） */
export async function listMemorySlugs(): Promise<string[]> {
  const entries = await store().list()
  return entries.map(e => e.name)
}
