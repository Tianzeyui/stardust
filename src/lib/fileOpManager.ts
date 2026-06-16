/**
 * 文件操作管理器：写/删文件时需用户确认（工作区外）
 */
export interface FileOpRequest {
  id: string
  type: 'write' | 'delete'
  path: string
  content?: string   // write 时用
  status: 'pending_confirm' | 'approved' | 'rejected' | 'done' | 'error'
  error?: string
  size?: number       // 写入的字符数
}

const ops = new Map<string, FileOpRequest>()
const resolvers = new Map<string, (confirmed: boolean, persist?: boolean) => void>()

export function createFileOp(id: string, type: 'write' | 'delete', path: string, content?: string): FileOpRequest {
  const op: FileOpRequest = { id, type, path, content, status: 'pending_confirm' }
  ops.set(id, op)
  return op
}

export function getFileOp(id: string): FileOpRequest | undefined { return ops.get(id) }
export function updateFileOp(id: string, patch: Partial<FileOpRequest>): void {
  const o = ops.get(id); if (o) Object.assign(o, patch)
}

export function setFileOpResolver(id: string, resolve: (c: boolean) => void): void {
  resolvers.set(id, resolve)
}

export function confirmFileOp(id: string, persist?: boolean): void {
  resolvers.get(id)?.(true, persist); resolvers.delete(id)
}

export function rejectFileOp(id: string): void {
  resolvers.get(id)?.(false); resolvers.delete(id)
}
