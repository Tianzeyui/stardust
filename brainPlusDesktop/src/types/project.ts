export interface ProjectSettings {
  prompt: string         // PROMPT.md 内容，注入到 system prompt
  agents: string[]       // 启用的 agent ID
  skills: string[]       // 启用的 skill ID
  mcpServers: string[]   // 启用的 MCP 服务器 ID
  mcpTools: string[]     // 启用的具体 MCP 工具（全名），空数组=服务器下全部可用
  pluginTools: string[]  // 启用的插件工具名（plugin__xxx_yyy），空数组=全部可用
}

export interface Project {
  id: string
  name: string
  description: string
  path: string           // 项目工作区路径
  createdAt: string
  updatedAt: string
  settings: ProjectSettings
}

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  prompt: '',
  agents: [],
  skills: [],
  mcpServers: [],
  mcpTools: [],
  pluginTools: [],
}
