export interface AIModel {
  id: string
  name: string
  url: string
  icon: string
  description?: string
}

export interface ToolboxCategory {
  id: string
  user_id: string
  name: string
  icon: string
  sort_order: number
  created_at: string
}

export interface ToolboxItem {
  id: string
  user_id: string
  category_id: string | null
  name: string
  url: string
  icon: string
  description: string
  sort_order: number
  created_at: string
}
