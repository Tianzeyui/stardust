/**
 * 项目规则多层发现系统
 *
 * - 从项目根向上遍历到 /，每层读取 stardustRules.md + .stardust/rules.md
 * - 支持 .stardust/rules/*.md 条件规则（frontmatter paths: glob）
 * - 越靠近项目根的规则优先级越高（后加载 > 先加载）
 */

interface RuleFile {
  path: string
  level: 'global' | 'parent' | 'project' | 'local'
  content: string
  priority: number  // 越大越靠近项目根
}

/** 条件规则：仅在操作匹配 glob 的文件时注入 */
export interface ConditionalRule {
  glob: string
  content: string
  path: string
}

export interface DiscoveredRules {
  /** 无条件规则（始终注入），按优先级排序 */
  unconditional: string
  /** 条件规则列表 */
  conditional: ConditionalRule[]
  /** 发现的所有规则文件路径 */
  files: string[]
}

/**
 * 从项目根向上遍历，发现所有规则文件。
 * 读取顺序：从 / 向下到项目根（父目录优先，项目根最后加载覆盖）
 */
export async function discoverRules(projectRoot: string): Promise<DiscoveredRules> {
  const fsApi = (window as any).electronAPI?.fs
  if (!fsApi) return { unconditional: '', conditional: [], files: [] }

  const parts = projectRoot.replace(/\/$/, '').split('/').filter(Boolean)
  const ruleFiles: RuleFile[] = []
  const conditionalRules: ConditionalRule[] = []

  // 从根 / 向下遍历（越后面越靠近项目，优先级越高）
  for (let i = 1; i <= parts.length; i++) {
    const dir = '/' + parts.slice(0, i).join('/')

    // stardustRules.md（新名称）
    const rules1 = await fsApi.readFile(`${dir}/stardustRules.md`).catch(() => null)
    if (rules1?.success && rules1.content) {
      ruleFiles.push({
        path: `${dir}/stardustRules.md`,
        level: i === parts.length ? 'project' : 'parent',
        content: rules1.content,
        priority: i,
      })
    }

    // .stardust/rules.md（项目本地规则）
    const dotRules = await fsApi.readFile(`${dir}/.stardust/rules.md`).catch(() => null)
    if (dotRules?.success && dotRules.content) {
      ruleFiles.push({
        path: `${dir}/.stardust/rules.md`,
        level: i === parts.length ? 'project' : 'parent',
        content: dotRules.content,
        priority: i,
      })
    }

    // .stardust/rules/*.md（条件规则）
    const rulesDir = await fsApi.listDir(`${dir}/.stardust/rules`).catch(() => null)
    if (rulesDir?.success && rulesDir.files) {
      for (const name of rulesDir.files) {
        if (!name.endsWith('.md')) continue
        const file = await fsApi.readFile(`${dir}/.stardust/rules/${name}`).catch(() => null)
        if (!file?.success || !file.content) continue

        // 解析 frontmatter 中的 paths: glob
        const pathsMatch = file.content.match(/^---\s*\npaths:\s*(.+?)\n---/m)
        if (pathsMatch) {
          const globs = pathsMatch[1].split(',').map((g: string) => g.trim()).filter(Boolean)
          const body = file.content.replace(/^---[\s\S]*?---\n*/, '').trim()
          for (const glob of globs) {
            conditionalRules.push({
              glob,
              content: body,
              path: `${dir}/.stardust/rules/${name}`,
            })
          }
        } else {
          // 无 paths: → 无条件规则
          ruleFiles.push({
            path: `${dir}/.stardust/rules/${name}`,
            level: 'project',
            content: file.content,
            priority: i + 0.5, // 略高于同级 rules.md
          })
        }
      }
    }
  }

  // stardustRules.local.md（gitignored 个人私有规则）
  const localRules = await fsApi.readFile(`${projectRoot}/stardustRules.local.md`).catch(() => null)
  if (localRules?.success && localRules.content) {
    ruleFiles.push({
      path: `${projectRoot}/stardustRules.local.md`,
      level: 'local',
      content: localRules.content,
      priority: parts.length + 1, // 最高优先级
    })
  }

  // 按优先级排序 + 去重路径
  ruleFiles.sort((a, b) => a.priority - b.priority)
  const seen = new Set<string>()
  const unique = ruleFiles.filter(f => {
    if (seen.has(f.path)) return false
    seen.add(f.path)
    return true
  })

  const unconditional = unique
    .map(f => `[规则: ${f.path}]\n${f.content}`)
    .join('\n\n')

  return {
    unconditional,
    conditional: conditionalRules,
    files: unique.map(f => f.path),
  }
}

/**
 * 根据当前操作涉及的文件，匹配条件规则
 */
export function matchConditionalRules(
  rules: ConditionalRule[],
  accessedFiles: string[],
): string {
  if (rules.length === 0 || accessedFiles.length === 0) return ''

  const matched: string[] = []
  for (const rule of rules) {
    for (const file of accessedFiles) {
      if (globMatch(rule.glob, file)) {
        matched.push(`[条件规则: ${rule.path} — 匹配 ${file}]\n${rule.content}`)
        break
      }
    }
  }
  return matched.join('\n\n')
}

/** 简单 glob 匹配（支持 ** 和 *） */
function globMatch(pattern: string, filePath: string): boolean {
  const re = new RegExp(
    '^' +
    pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*\//g, '<<<ANYDIR>>>')
      .replace(/\*/g, '[^/]*')
      .replace(/<<<ANYDIR>>>/g, '(?:.+/)*') +
    '$',
    'i',
  )
  return re.test(filePath)
}
