/**
 * Neo4j 图数据库服务
 * 管理连接，执行 Cypher 查询，以插件名隔离数据
 */
import neo4j, { type Driver, type Session } from 'neo4j-driver'
import { safeStorage } from 'electron'
import fs from 'fs'
import path from 'path'
import { app } from 'electron'

interface GraphConfig {
  uri: string
  username: string
  password: string  // 加密存储
}

let driver: Driver | null = null

function configPath() {
  return path.join(app.getPath('userData'), 'config', 'graph.json')
}

function loadConfig(): GraphConfig | null {
  try {
    const p = configPath()
    if (!fs.existsSync(p)) return null
    const raw = JSON.parse(fs.readFileSync(p, 'utf-8'))
    if (raw.password && safeStorage.isEncryptionAvailable()) {
      raw.password = safeStorage.decryptString(Buffer.from(raw.password, 'base64'))
    }
    return raw
  } catch { return null }
}

function saveConfig(cfg: GraphConfig): void {
  const dir = path.dirname(configPath())
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const toSave = { ...cfg }
  if (safeStorage.isEncryptionAvailable()) {
    toSave.password = safeStorage.encryptString(cfg.password).toString('base64')
  }
  fs.writeFileSync(configPath(), JSON.stringify(toSave, null, 2), 'utf-8')
}

export function getGraphConfig(): GraphConfig | null {
  return loadConfig()
}

export function configureGraph(uri: string, username: string, password: string): { success: boolean; error?: string } {
  try {
    const old = loadConfig()
    const pwd = password || old?.password || ''  // 空密码时保留旧密码
    if (!pwd) return { success: false, error: '密码不能为空' }
    saveConfig({ uri, username, password: pwd })
    // 重建连接
    if (driver) { driver.close(); driver = null }
    driver = neo4j.driver(uri, neo4j.auth.basic(username, pwd))
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

function getDriver(): Driver | null {
  if (driver) return driver
  const cfg = loadConfig()
  if (!cfg) return null
  try {
    driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.username, cfg.password))
    return driver
  } catch { return null }
}

/**
 * 执行 Cypher 查询（以插件名隔离数据）
 * @param cypher Cypher 语句
 * @param pluginId 插件 ID（用于数据隔离）
 */
export async function graphQuery(
  cypher: string,
  pluginId: string,
): Promise<{ success: boolean; data?: any; error?: string }> {
  const d = getDriver()
  if (!d) return { success: false, error: '图数据库未配置' }

  const session: Session = d.session()
  try {
    // 数据隔离：注入插件标签
    const isolated = isolateQuery(cypher, pluginId)
    const result = await session.run(isolated)
    const records = result.records.map(r => {
      const obj: Record<string, any> = {}
      r.keys.forEach(k => { obj[k] = r.get(k) })
      return obj
    })
    return { success: true, data: records }
  } catch (e: any) {
    return { success: false, error: e.message }
  } finally {
    await session.close()
  }
}

/**
 * 查询隔离：在 CREATE/MERGE 节点上自动附加 _plugin 属性
 */
function isolateQuery(cypher: string, pluginId: string): string {
  const safe = pluginId.replace(/[^a-zA-Z0-9_]/g, '_')
  // 简化处理：CREATE/MERGE 节点时自动加上 _plugin 属性
  return cypher.replace(
    /(CREATE|MERGE)\s*\((\w*)(:\w+)?\s*\{([^}]*)\}\)/gi,
    (_, op, alias, label, props) => {
      const hasPlugin = /_plugin\s*:/.test(props)
      const newProps = hasPlugin ? props : `${props}, _plugin: '${safe}'`
      return `${op} (${alias}${label || ''} {${newProps}})`
    }
  )
}

/**
 * 测试连接
 */
export async function testGraphConnection(): Promise<{ success: boolean; error?: string }> {
  const d = getDriver()
  if (!d) return { success: false, error: '图数据库未配置' }
  try {
    await d.verifyConnectivity()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

/**
 * 断开连接（应用退出时调用）
 */
export function closeGraphDriver(): void {
  if (driver) { driver.close(); driver = null }
}
