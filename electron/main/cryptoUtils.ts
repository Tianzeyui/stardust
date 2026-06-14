/**
 * API Key 加密工具
 * 使用用户邮箱 + PBKDF2 派生密钥，AES-256-GCM 加密
 */
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const SALT_PREFIX = 'brainplus_salt_'
const KEY_LENGTH = 32
const IV_LENGTH = 16
const TAG_LENGTH = 16
const ITERATIONS = 100000

/**
 * 从邮箱派生加密密钥
 */
function deriveKey(email: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(email, salt, ITERATIONS, KEY_LENGTH, 'sha256')
}

/**
 * 加密 API Key
 * @returns base64 编码的加密数据 (salt + iv + tag + ciphertext)
 */
export function encryptApiKey(apiKey: string, email: string): string {
  if (!apiKey || !email) return apiKey

  const salt = crypto.randomBytes(16)
  const key = deriveKey(email, salt)
  const iv = crypto.randomBytes(IV_LENGTH)

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const encrypted = Buffer.concat([cipher.update(apiKey, 'utf-8'), cipher.final()])
  const tag = cipher.getAuthTag()

  // salt + iv + tag + ciphertext
  return Buffer.concat([salt, iv, tag, encrypted]).toString('base64')
}

/**
 * 解密 API Key
 * @param encoded base64 编码的加密数据
 * @returns 原始 API Key，如果不是加密数据则原样返回
 */
export function decryptApiKey(encoded: string, email: string): string {
  if (!encoded || !email) return encoded

  try {
    const data = Buffer.from(encoded, 'base64')
    // 最小长度: salt(16) + iv(16) + tag(16) = 48
    if (data.length < 48) return encoded

    const salt = data.subarray(0, 16)
    const iv = data.subarray(16, 32)
    const tag = data.subarray(32, 48)
    const ciphertext = data.subarray(48)

    const key = deriveKey(email, salt)
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv)
    decipher.setAuthTag(tag)

    return decipher.update(ciphertext) + decipher.final('utf-8')
  } catch {
    // 解密失败（非加密数据或密钥不匹配），返回原值
    return encoded
  }
}
