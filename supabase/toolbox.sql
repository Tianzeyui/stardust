-- ============================================
-- BrainPlus 工具箱 v2 — 分类 + 自定义工具
-- 在 Supabase SQL Editor 中执行升级
-- ============================================

-- === 分类表 ===
CREATE TABLE IF NOT EXISTS public.toolbox_categories (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  icon        TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_toolbox_cat_user_id ON public.toolbox_categories(user_id);

ALTER TABLE public.toolbox_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own categories" ON public.toolbox_categories;
CREATE POLICY "Users can manage their own categories"
  ON public.toolbox_categories FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- === 工具表 ===
CREATE TABLE IF NOT EXISTS public.toolbox_items (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id UUID REFERENCES public.toolbox_categories(id) ON DELETE SET NULL,
  name        TEXT NOT NULL,
  url         TEXT NOT NULL DEFAULT '',
  icon        TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_toolbox_item_user_id ON public.toolbox_items(user_id);
CREATE INDEX IF NOT EXISTS idx_toolbox_item_cat_id  ON public.toolbox_items(category_id);

ALTER TABLE public.toolbox_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own items" ON public.toolbox_items;
CREATE POLICY "Users can manage their own items"
  ON public.toolbox_items FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- === 迁移旧数据（如有） ===
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_model_favorites') THEN
    -- 创建默认"AI模型"分类
    INSERT INTO public.toolbox_categories (id, user_id, name, icon, sort_order)
    SELECT gen_random_uuid(), user_id, 'AI模型', 'Bot', 0
    FROM (SELECT DISTINCT user_id FROM public.ai_model_favorites) u
    ON CONFLICT DO NOTHING;

    -- 迁移旧收藏数据
    INSERT INTO public.toolbox_items (user_id, category_id, name, url, icon, sort_order, created_at)
    SELECT
      f.user_id,
      c.id,
      f.model_name,
      f.model_url,
      f.model_icon,
      f.sort_order,
      f.created_at
    FROM public.ai_model_favorites f
    JOIN public.toolbox_categories c ON c.user_id = f.user_id AND c.name = 'AI模型'
    ON CONFLICT DO NOTHING;
  END IF;
END $$;
