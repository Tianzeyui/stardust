export interface InspirationFolder {
  id: string
  name: string
  user_id: string
  created_at: string
  updated_at: string
}

export interface Inspiration {
  id: string
  title: string
  description: string | null
  folder_id: string | null
  images: string[]
  tags: string[]
  user_id: string
  created_at: string
  updated_at: string
}

export interface InspirationInsert {
  title: string
  description?: string | null
  folder_id?: string | null
  images?: string[]
  tags?: string[]
}

export interface InspirationUpdate {
  title?: string
  description?: string | null
  folder_id?: string | null
  images?: string[]
  tags?: string[]
}
