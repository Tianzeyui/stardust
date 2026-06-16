/**
 * 文件操作追踪器
 * 独立模块，避免 chatService ↔ workspace tools 循环依赖
 * 供压缩后上下文恢复使用
 */

let _recentFiles: string[] = []

/** 记录文件操作 */
export function trackFileOp(path: string) {
  _recentFiles = [path, ..._recentFiles.filter(f => f !== path)].slice(0, 10)
}

/** 获取最近操作的文件列表 */
export function getRecentFiles(): string[] {
  return [..._recentFiles]
}

/** 清空追踪 */
export function clearRecentFiles() {
  _recentFiles = []
}
