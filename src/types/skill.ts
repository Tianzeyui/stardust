/** 段落索引 */
export interface SectionIndex {
  title: string
  level: number       // 1=#, 2=##, 3=###
  startLine: number
  endLine: number
}

/** 代码块 */
export interface CodeBlock {
  language: string
  startLine: number
  endLine: number
  code: string        // 前200字符
}

/** 依赖摘要 */
export interface DepsSummary {
  pip: string[]       // Python packages
  npm: string[]       // Node.js packages
  commands: string[]  // shell commands (python scripts/xxx.py, etc.)
}

/** 安装验证结果 */
export interface SkillInstallValidation {
  pathExists: boolean
  isDirectory: boolean
  hasSkillMd: boolean
  alreadyInstalled: boolean
  errors: string[]
}

/** 已安装的 Skill */
export interface InstalledSkill {
  id: string
  name: string
  description: string
  path: string
  installedAt: string
  /** 文件树 */
  fileTree: string
  /** 文件数量 */
  fileCount: number
  /** 文件相对路径列表 */
  fileList: string[]
  /** SKILL.md 段落索引 */
  sections: SectionIndex[]
  /** 所有代码块 */
  codeBlocks: CodeBlock[]
  /** 依赖摘要 */
  deps: DepsSummary
}

/** SKILL.md 解析结果（内联使用） */
export interface SkillMeta {
  name: string
  description: string
}
