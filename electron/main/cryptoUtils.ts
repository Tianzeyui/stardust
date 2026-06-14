/**
 * API Key 加密工具
 * 使用 Electron safeStorage（OS 级别加密：macOS Keychain / Windows DPAPI / Linux libsecret）
 * 加密数据仅本机本用户可解密
 */
import { safeStorage } from 'electron'

/**
 * 加密 API Key
 * @returns base64 编码的加密数据
 */
export function encryptApiKey(apiKey: string): string {
  if (!apiKey) return apiKey
  if (!safeStorage.isEncryptionAvailable()) return apiKey
  return safeStorage.encryptString(apiKey).toString('base64')
}

/**
 * 解密 API Key
 * @param encoded base64 编码的加密数据
 * @returns 原始 API Key，解密失败返回原值（兼容明文旧数据）
 */
export function decryptApiKey(encoded: string): string {
  if (!encoded) return encoded
  if (!safeStorage.isEncryptionAvailable()) return encoded
  try {
    return safeStorage.decryptString(Buffer.from(encoded, 'base64'))
  } catch {
    return encoded // 旧数据或加密不可用时返回原值
  }
}
