export interface DiaryEntry {
  id: string
  user_id: string
  title: string
  content: string
  mood: string | null
  tags: string[]
  entry_date: string // YYYY-MM-DD
  created_at: string
  updated_at: string
}

export interface DiaryEntryInsert {
  title?: string
  content: string
  mood?: string | null
  tags?: string[]
  entry_date: string
}

export interface DiaryEntryUpdate {
  title?: string
  content?: string
  mood?: string | null
  tags?: string[]
}

export interface Profile {
  id: string
  username: string | null
  avatar_url: string | null
  role: string
  created_at: string
  updated_at: string
}
