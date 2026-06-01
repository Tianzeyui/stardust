const STORAGE_KEY_CLOUD_NAME = 'brainplus_cloudinary_cloud_name'
const STORAGE_KEY_UPLOAD_PRESET = 'brainplus_cloudinary_upload_preset'

export interface CloudinaryConfig {
  cloudName: string
  uploadPreset: string
}

export function getCloudinaryConfig(): CloudinaryConfig {
  return {
    cloudName: localStorage.getItem(STORAGE_KEY_CLOUD_NAME) || '',
    uploadPreset: localStorage.getItem(STORAGE_KEY_UPLOAD_PRESET) || '',
  }
}

export function saveCloudinaryConfig(config: CloudinaryConfig): void {
  localStorage.setItem(STORAGE_KEY_CLOUD_NAME, config.cloudName)
  localStorage.setItem(STORAGE_KEY_UPLOAD_PRESET, config.uploadPreset)
}

export function clearCloudinaryConfig(): void {
  localStorage.removeItem(STORAGE_KEY_CLOUD_NAME)
  localStorage.removeItem(STORAGE_KEY_UPLOAD_PRESET)
}

export function isCloudinaryConfigured(): boolean {
  const c = getCloudinaryConfig()
  return !!(c.cloudName && c.uploadPreset)
}

/** 上传图片到 Cloudinary，返回 URL */
export async function uploadToCloudinary(file: File): Promise<string> {
  const { cloudName, uploadPreset } = getCloudinaryConfig()
  if (!cloudName || !uploadPreset) {
    throw new Error('请先在设置中配置 Cloudinary')
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('upload_preset', uploadPreset)

  const res = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    { method: 'POST', body: formData },
  )

  if (!res.ok) {
    throw new Error(`上传失败 (${res.status})`)
  }

  const data = await res.json()
  if (!data.secure_url) {
    throw new Error(data.error?.message || '上传失败')
  }

  return data.secure_url as string
}
