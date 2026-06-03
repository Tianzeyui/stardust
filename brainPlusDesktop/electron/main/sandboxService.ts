/**
 * 沙箱服务 - 支持多语言
 * JS/TS → Node.js Worker Threads（含超时保护）
 * JS + npm 包 → 持久化 npm 项目（包缓存，避免每次下载）
 * Python → child_process（系统 python3 / uv run）
 */
import { Worker } from 'worker_threads'
import { execFile } from 'child_process'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { getWorkspacePaths } from './workspace.js'

// ====== 持久化 npm 项目（userData/sandbox-npm/） ======

function getNpmProjectDir(): string {
  return path.join(app.getPath('userData'), 'sandbox-npm')
}

function ensureNpmProject(): void {
  const dir = getNpmProjectDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  const pkgJson = path.join(dir, 'package.json')
  if (!fs.existsSync(pkgJson)) {
    fs.writeFileSync(pkgJson, JSON.stringify({
      name: 'brainplus-sandbox',
      private: true,
      dependencies: {},
    }, null, 2))
  }
}

// 缓存已安装的包名
let installedNpmPackages: Set<string> | null = null

function getInstalledPackages(): Set<string> {
  if (installedNpmPackages) return installedNpmPackages
  const nodeModules = path.join(getNpmProjectDir(), 'node_modules')
  if (!fs.existsSync(nodeModules)) {
    installedNpmPackages = new Set()
    return installedNpmPackages
  }
  try {
    // 读 package.json 中的 dependencies
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(getNpmProjectDir(), 'package.json'), 'utf-8'),
    )
    installedNpmPackages = new Set(Object.keys(pkgJson.dependencies || {}))
  } catch {
    installedNpmPackages = new Set()
  }
  return installedNpmPackages
}

function addToInstalledPackages(pkgName: string): void {
  getInstalledPackages().add(pkgName)
  // 同步更新 package.json
  try {
    const pkgJson = JSON.parse(
      fs.readFileSync(path.join(getNpmProjectDir(), 'package.json'), 'utf-8'),
    )
    pkgJson.dependencies = pkgJson.dependencies || {}
    pkgJson.dependencies[pkgName] = '*'
    fs.writeFileSync(
      path.join(getNpmProjectDir(), 'package.json'),
      JSON.stringify(pkgJson, null, 2),
    )
  } catch { /* 静默失败 */ }
}

async function installNpmPackages(packages: string[]): Promise<{ success: boolean; error?: string }> {
  const installed = getInstalledPackages()
  const missing = packages.filter(p => !installed.has(p))

  if (missing.length === 0) return { success: true }

  return new Promise(resolve => {
    const args = ['install', '--no-save', ...missing]
    execFile(
      'npm', args,
      { cwd: getNpmProjectDir(), timeout: 120000, maxBuffer: 10 * 1024 * 1024 },
      (err, _stdout, stderr) => {
        if (err) {
          if ((err as any).killed) {
            resolve({ success: false, error: 'npm install 超时 (120s)，请重试' })
          } else {
            // 提取关键错误信息，过滤 npm 警告噪音
            const cleanErr = stderr
              .split('\n')
              .filter(l => l.includes('ERR') || l.includes('error'))
              .slice(0, 3)
              .join('\n')
            resolve({ success: false, error: cleanErr || err.message })
          }
          return
        }
        // 安装成功，更新缓存
        for (const p of missing) addToInstalledPackages(p)
        resolve({ success: true })
      },
    )
  })
}

// ====== 预初始化 ======

export async function preInit() {
  ensureNpmProject()
}

// ====== 类型 ======

export interface SandboxResult {
  success: boolean
  result?: string
  error?: string
}

// ====== JS Worker 线程执行（无包，快速） ======

function runInWorker(code: string, timeout = 10000): Promise<SandboxResult> {
  return new Promise((resolve) => {
    const worker = new Worker(
      `const { parentPort } = require('worker_threads');
      parentPort.on('message', ({ code, timeout }) => {
        const timer = setTimeout(() => { process.exit(1) }, timeout);
        const logs = [];
        const fakeConsole = { log: (...a) => logs.push(a.map(String).join(' ')), error: (...a) => logs.push(a.map(String).join(' ')) };
        try {
          const fn = new Function('console', 'return (function() { ' + code + ' })()');
          const result = fn(fakeConsole);
          clearTimeout(timer);
          const output = logs.join('\\n');
          const val = result != null ? String(result) : '';
          parentPort.postMessage({ success: true, result: output + (val ? (output ? '\\n' : '') + val : '') || 'undefined' });
        } catch (e) {
          clearTimeout(timer);
          parentPort.postMessage({ success: false, error: e.message });
        }
        process.exit(0);
      });`,
      { eval: true },
    )

    const timer = setTimeout(() => {
      worker.terminate()
      resolve({ success: false, error: `JS 执行超时 (${timeout}ms)` })
    }, timeout + 1000)

    worker.on('message', (msg: SandboxResult) => {
      clearTimeout(timer)
      resolve(msg)
    })

    worker.on('error', (e) => {
      clearTimeout(timer)
      resolve({ success: false, error: e.message })
    })

    worker.on('exit', (code) => {
      if (code === 1) {
        clearTimeout(timer)
        resolve({ success: false, error: `JS 执行超时 (${timeout}ms)` })
      }
    })

    worker.postMessage({ code, timeout })
  })
}

// ====== TS → JS 转译 ======

function transpileTS(code: string): string {
  return code
    .replace(/:\s*\w+(\[\])?\s*=/g, ' =')
    .replace(/:\s*\w+(\[\])?\s*;/g, ';')
    .replace(/function\s+(\w+)\(([^)]*)\):\s*\w+/g, 'function $1($2)')
    .replace(/\(([^)]*)\):\s*\w+\s*=>/g, '($1) =>')
    .replace(/interface\s+\w+\s*\{[^}]*\}/g, '')
    .replace(/type\s+\w+\s*=\s*[^;]+;/g, '')
    .replace(/\bas\s+\w+/g, '')
}

/** 扫描 CWD 中生成的输出文件并复制到工作区 output 目录 */
let preExecFiles: Set<string> | null = null

/** 执行前拍快照，记录 CWD 中已存在的文件（避免复制项目静态文件） */
function snapshotBeforeExec(cwd: string): void {
  try {
    preExecFiles = new Set(fs.readdirSync(cwd))
  } catch { preExecFiles = new Set() }
}

function collectOutputFiles(cwd: string): string[] {
  try {
    if (!preExecFiles) return []
    const outputDir = getWorkspacePaths().output
    const exts = ['.pptx', '.docx', '.xlsx', '.pdf', '.png', '.jpg', '.jpeg', '.svg', '.csv', '.json', '.txt', '.md']
    const files = fs.readdirSync(cwd)
    const collected: string[] = []
    if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true })
    for (const f of files) {
      if (!preExecFiles.has(f) && exts.includes(path.extname(f).toLowerCase())) {
        const src = path.join(cwd, f)
        const dest = path.join(outputDir, f)
        try { fs.copyFileSync(src, dest); collected.push(dest) } catch {}
      }
    }
    preExecFiles = null
    return collected
  } catch { preExecFiles = null; return [] }
}

// ====== JS 执行（核心） ======

export async function executeJS(code: string, packages?: string[]): Promise<SandboxResult> {
  // 有 npm 包需求 → 持久化 npm 项目 + node 执行（包缓存，避免每次下载）
  if (packages && packages.length > 0) {
    // 1. 确保依赖已安装
    snapshotBeforeExec(getNpmProjectDir())
    const installResult = await installNpmPackages(packages)
    if (!installResult.success) {
      return { success: false, error: `npm 包安装失败: ${installResult.error}` }
    }

    // 2. 从持久化项目目录执行代码
    return new Promise(resolve => {
      execFile(
        'node', ['-e', code],
        {
          cwd: getNpmProjectDir(),
          timeout: 120000,
          maxBuffer: 10 * 1024 * 1024,
        },
        (err, stdout, stderr) => {
          if (err) {
            if ((err as any).killed) {
              resolve({ success: false, error: 'JS 执行超时 (120s)' })
            } else {
              // 合并 stdout 和 stderr 看是否有有用输出
              const output = (stdout + '\n' + stderr).trim()
              resolve({ success: false, error: output || err.message })
            }
            return
          }
          // 成功：返回 stdout，如果有 stderr 也附上（可能是 console.warn）
          let result = stdout.trim() || stderr.trim() || '(无输出)'
          // 扫描并复制生成的文件到工作区 output
          const outFiles = collectOutputFiles(getNpmProjectDir())
          if (outFiles.length > 0) {
            result += '\n\n📁 输出文件:\n' + outFiles.map(f => `- ${f}`).join('\n')
          }
          resolve({ success: true, result })
        },
      )
    })
  }
  // 无包 → Worker 线程（快速启动）
  return runInWorker(transpileTS(code))
}

// ====== Python ======

function commandExists(cmd: string): Promise<boolean> {
  return new Promise(resolve => {
    execFile('which', [cmd], (err) => resolve(!err))
  })
}

let pythonCmd: string | null = null

async function getPythonCmd(): Promise<string> {
  if (pythonCmd) return pythonCmd
  if (await commandExists('uv')) { pythonCmd = 'uv'; return pythonCmd }
  if (await commandExists('python3')) { pythonCmd = 'python3'; return pythonCmd }
  if (await commandExists('python')) { pythonCmd = 'python'; return pythonCmd }
  throw new Error('未检测到 uv / Python 3。安装 uv: curl -LsSf https://astral.sh/uv/install.sh | sh')
}

export async function executePython(code: string, packages?: string[]): Promise<SandboxResult> {
  return new Promise(resolve => {
    snapshotBeforeExec(process.cwd())
    getPythonCmd().then(cmd => {
      let args: string[]
      if (cmd === 'uv' && packages && packages.length > 0) {
        const withFlags = packages.flatMap(p => ['--with', p])
        args = ['run', ...withFlags, 'python', '-c', code]
      } else if (cmd === 'uv') {
        args = ['run', 'python', '-c', code]
      } else {
        args = ['-c', code]
      }
      execFile(cmd, args, { timeout: 120000, maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (err) {
          if ((err as any).killed) {
            resolve({ success: false, error: 'Python 执行超时 (120s)。首次安装依赖包较慢，请重试。' })
          } else {
            resolve({ success: false, error: stderr || err.message })
          }
          return
        }
        let result = stdout.trim() || stderr.trim() || '(无输出)'
        const outFiles = collectOutputFiles(process.cwd())
        if (outFiles.length > 0) {
          result += '\n\n📁 输出文件:\n' + outFiles.map(f => `- ${f}`).join('\n')
        }
        resolve({ success: true, result })
      })
    }).catch(e => resolve({ success: false, error: e.message }))
  })
}
