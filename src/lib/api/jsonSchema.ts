/**
 * jsonSchema — 替代 AI SDK 的同名函数
 * 本质是透传 JSON Schema 对象，加了类型标记
 * 所有工具文件无需改动，只需改 import 来源
 */
export interface JSONSchema<T = Record<string, unknown>> {
  type: string
  properties?: Record<string, unknown>
  required?: string[]
  items?: JSONSchema
  enum?: unknown[]
  description?: string
  [key: string]: unknown
  // Phantom type parameter for inference — never read at runtime
  _type?: T
}

export function jsonSchema<T = Record<string, unknown>>(
  schema: JSONSchema<T>,
): JSONSchema<T> {
  return schema
}
