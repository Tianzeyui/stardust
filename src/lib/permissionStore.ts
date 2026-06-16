/**
 * 权限存储：记录用户已授权的操作，下次自动放行
 * 两级：工作区级 (.brainplus/settings.local.json) + 全局 (~/.brainplus/permissions.json)
 */
import { app } from 'electron' // 仅 Electron 端用

export interface PermissionEntry {
  type: 'terminal' | 'file_write' | 'file_delete' | 'git_commit'
  pattern: string       // 匹配模式：命令前缀 或 文件路径前缀
  approvedAt: number    // 授权时间戳
  expiresAt?: number    // 过期时间（可选）
}

export interface PermissionsFile {
  version: 1
  allow: PermissionEntry[]
  deny: PermissionEntry[]
}

const WORKSPACE_FILE = '.brainplus/settings.local.json'
const GLOBAL_FILE = 'permissions.json' // 在 app.getPath('userData') 下

function readPermissions(filePath: string): PermissionsFile {
  try {
    const fs = require('fs')
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch {}
  return { version: 1, allow: [], deny: [] }
}

function writePermissions(filePath: string, data: PermissionsFile): void {
  try {
    const fs = require('fs')
    const path = require('path')
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
  } catch {}
}

/** 检查操作是否已被授权 */
export function isAllowed(workspaceRoot: string, type: PermissionEntry['type'], value: string): boolean {
  // 先查工作区
  const wsFile = `${workspaceRoot}/${WORKSPACE_FILE}`
  const wsPerms = readPermissions(wsFile)
  if (matchPermission(wsPerms.deny, type, value)) return false
  if (matchPermission(wsPerms.allow, type, value)) return true

  // 再查全局
  try {
    const { app } = require('electron')
    const globalFile = `${app.getPath('userData')}/${GLOBAL_FILE}`
    const globalPerms = readPermissions(globalFile)
    if (matchPermission(globalPerms.deny, type, value)) return false
    if (matchPermission(globalPerms.allow, type, value)) return true
  } catch {}

  return false
}

/** 记录授权 */
export function grantPermission(workspaceRoot: string, entry: Omit<PermissionEntry, 'approvedAt'>): void {
  const file = `${workspaceRoot}/${WORKSPACE_FILE}`
  const perms = readPermissions(file)
  perms.allow.push({ ...entry, approvedAt: Date.now() })
  writePermissions(file, perms)
}

/** 拒绝授权 */
export function denyPermission(workspaceRoot: string, entry: Omit<PermissionEntry, 'approvedAt'>): void {
  const file = `${workspaceRoot}/${WORKSPACE_FILE}`
  const perms = readPermissions(file)
  perms.deny.push({ ...entry, approvedAt: Date.now() })
  writePermissions(file, perms)
}

function matchPermission(entries: PermissionEntry[], type: string, value: string): boolean {
  return entries.some(e => {
    if (e.type !== type) return false
    if (e.expiresAt && Date.now() > e.expiresAt) return false
    return value.startsWith(e.pattern)
  })
}

/** 生成终端命令的授权模式（去参数只保留命令本体） */
export function terminalPattern(command: string): string {
  return command.split(/\s+/)[0] || command
}
