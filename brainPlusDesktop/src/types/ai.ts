export interface AIModel {
  id: string
  name: string
  url: string
  icon: string
}

export interface AIModelFavorite {
  id: string
  user_id: string
  model_id: string
  model_name: string
  model_url: string
  model_icon: string
  sort_order: number
  created_at: string
}
