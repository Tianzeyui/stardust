/**
 * 文件转换服务
 * .docx → mammoth (Node.js, 零依赖)
 * .xlsx/.pptx/.pdf 等 → uv + markitdown
 */
import { execFile, execSync } from 'child_process'
import path from 'path'

export const CONVERTIBLE_EXTS = new Set([
  'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'pdf', 'csv', 'xml', 'html', 'htm',
])

const WORD_EXTS = new Set(['doc', 'docx'])

export function isConvertible(filePath: string): boolean {
  return CONVERTIBLE_EXTS.has(path.extname(filePath).toLowerCase().replace('.', ''))
}

function isWord(filePath: string): boolean {
  return WORD_EXTS.has(path.extname(filePath).toLowerCase().replace('.', ''))
}

const IMAGE_EXTS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'ico'])

export function isImageFile(filePath: string): boolean {
  return IMAGE_EXTS.has(path.extname(filePath).toLowerCase().replace('.', ''))
}

export interface ConvertResult {
  success: boolean
  content?: string
  error?: string
}

function hasCmd(cmd: string): boolean {
  try { execSync(`which ${cmd}`, { stdio: 'ignore' }); return true } catch { return false }
}

function run(cmd: string, args: string[], timeout: number): Promise<{
  success: boolean; stdout: string; stderr: string; killed?: boolean
}> {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        resolve({ success: false, stdout: stdout.trim(), stderr: stderr.trim(), killed: (err as any).killed })
      } else {
        resolve({ success: true, stdout: stdout.trim(), stderr: stderr.trim() })
      }
    })
  })
}

export async function convertWithMarkitdown(
  filePath: string,
  onProgress?: (msg: string) => void,
): Promise<ConvertResult> {
  // Word 文件用 mammoth（纯 Node.js，不需要 Python）
  if (isWord(filePath)) {
    return convertWithMammoth(filePath, onProgress)
  }

  // 其他文件用 uv + markitdown
  if (!hasCmd('uv')) {
    return {
      success: false,
      error: '未检测到 uv。\n安装: curl -LsSf https://astral.sh/uv/install.sh | sh',
    }
  }

  onProgress?.('uv + markitdown 转换中...')
  const r = await run(
    'uv',
    ['run', '--with', 'markitdown', 'python', '-m', 'markitdown', filePath],
    120000,
  )

  if (r.success && r.stdout) return { success: true, content: r.stdout }
  if (r.killed) return { success: false, error: '转换超时 (120s)' }

  const err = r.stderr || r.stdout || '未知错误'
  console.error('[fileConvert] uv 失败:', err.slice(0, 300))
  return { success: false, error: err }
}

/** Word → Markdown via mammoth (Node.js) */
async function convertWithMammoth(
  filePath: string,
  onProgress?: (msg: string) => void,
): Promise<ConvertResult> {
  try {
    onProgress?.('mammoth 转换 Word...')
    // 动态 import ES module
    const mammoth = await import('mammoth')
    const result = await mammoth.convertToMarkdown({ path: filePath })
    if (result.value) {
      // 收集警告
      const warnings = result.messages
        .filter((m: any) => m.type === 'warning')
        .map((m: any) => m.message)
      if (warnings.length > 0) {
        console.warn('[fileConvert] mammoth 警告:', warnings.slice(0, 3).join('; '))
      }
      return { success: true, content: result.value }
    }
    return { success: false, error: 'mammoth 返回空内容' }
  } catch (e: any) {
    console.error('[fileConvert] mammoth 失败:', e.message)
    return { success: false, error: `Word 转换失败: ${e.message}` }
  }
}
