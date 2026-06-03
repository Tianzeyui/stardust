/**
 * 轻量级工具注册中心
 * 各模块往同一个 Record 里塞工具定义，统一转为 AI SDK format
 */
export type ToolDef = Record<string, any>
export type ToolMap = Record<string, ToolDef>
