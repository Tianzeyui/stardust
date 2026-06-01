-- ============================================
-- BrainPlus 灵感记录 - 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 创建文件夹表
CREATE TABLE IF NOT EXISTS public.inspiration_folders (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name        TEXT NOT NULL,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 创建灵感表
CREATE TABLE IF NOT EXISTS public.inspirations (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  folder_id   UUID REFERENCES inspiration_folders(id) ON DELETE SET NULL,
  images      TEXT[] DEFAULT '{}',
  tags        TEXT[] DEFAULT '{}',
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 索引
CREATE INDEX IF NOT EXISTS idx_inspiration_folders_user_id        ON inspiration_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_inspirations_user_id    ON inspirations(user_id);
CREATE INDEX IF NOT EXISTS idx_inspirations_folder_id  ON inspirations(folder_id);
CREATE INDEX IF NOT EXISTS idx_inspirations_tags       ON inspirations USING GIN(tags);

-- 4. RLS
ALTER TABLE public.inspiration_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inspirations ENABLE ROW LEVEL SECURITY;

-- 5. 文件夹 RLS
DROP POLICY IF EXISTS "Users manage own folders" ON inspiration_folders;
CREATE POLICY "Users manage own folders"
  ON inspiration_folders FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. 灵感 RLS
DROP POLICY IF EXISTS "Users manage own inspirations" ON inspirations;
CREATE POLICY "Users manage own inspirations"
  ON inspirations FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. 更新时间戳函数（如已存在则跳过）
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$;

-- 8. 更新触发器
DROP TRIGGER IF EXISTS update_inspiration_folders_updated_at ON inspiration_folders;
CREATE TRIGGER update_inspiration_folders_updated_at
  BEFORE UPDATE ON inspiration_folders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_inspirations_updated_at ON inspirations;
CREATE TRIGGER update_inspirations_updated_at
  BEFORE UPDATE ON inspirations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 9. 全文搜索函数
CREATE OR REPLACE FUNCTION search_inspirations(search_query TEXT, user_uuid UUID)
RETURNS TABLE(
  id UUID, title TEXT, description TEXT, folder_id UUID,
  images TEXT[], tags TEXT[], user_id UUID,
  created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ, rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT i.*,
    ts_rank(
      to_tsvector('simple', coalesce(i.title,'') || ' ' || coalesce(i.description,'') || ' ' || coalesce(array_to_string(i.tags,' '),'')),
      plainto_tsquery('simple', search_query)
    ) AS rank
  FROM inspirations i
  WHERE i.user_id = user_uuid
    AND (
      to_tsvector('simple', coalesce(i.title,'') || ' ' || coalesce(i.description,'') || ' ' || coalesce(array_to_string(i.tags,' '),''))
      @@ plainto_tsquery('simple', search_query)
      OR i.title ILIKE '%' || search_query || '%'
      OR i.description ILIKE '%' || search_query || '%'
      OR EXISTS (SELECT 1 FROM unnest(i.tags) tag WHERE tag ILIKE '%' || search_query || '%')
    )
  ORDER BY rank DESC, i.created_at DESC;
END;
$$ LANGUAGE plpgsql;
