-- ============================================
-- BrainPlus AI 模型收藏 - 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 创建 AI 模型收藏表
CREATE TABLE IF NOT EXISTS public.ai_model_favorites (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  model_id    TEXT NOT NULL,
  model_name  TEXT NOT NULL,
  model_url   TEXT NOT NULL DEFAULT '',
  model_icon  TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, model_id)
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_ai_model_fav_user_id
  ON public.ai_model_favorites(user_id);

-- 3. 启用 RLS
ALTER TABLE public.ai_model_favorites ENABLE ROW LEVEL SECURITY;

-- 4. RLS 策略
DROP POLICY IF EXISTS "Users can view their own favorites" ON public.ai_model_favorites;
CREATE POLICY "Users can view their own favorites"
  ON public.ai_model_favorites FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own favorites" ON public.ai_model_favorites;
CREATE POLICY "Users can insert their own favorites"
  ON public.ai_model_favorites FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own favorites" ON public.ai_model_favorites;
CREATE POLICY "Users can delete their own favorites"
  ON public.ai_model_favorites FOR DELETE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own favorites" ON public.ai_model_favorites;
CREATE POLICY "Users can update their own favorites"
  ON public.ai_model_favorites FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
