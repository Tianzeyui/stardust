-- =====================================================
-- Brain Plus Web - 数据库表结构
-- 表名前缀规范: bp_ (brainplus)
-- 执行方式：Supabase Dashboard -> SQL Editor
-- =====================================================

-- =====================================================
-- 💡 灵感捕获模块 (bp_inspiration)
-- =====================================================

-- 1. 创建文件夹表
CREATE TABLE IF NOT EXISTS bp_folders (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 创建灵感表
CREATE TABLE IF NOT EXISTS bp_inspirations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  folder_id UUID REFERENCES bp_folders(id) ON DELETE SET NULL,
  images TEXT[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 创建索引（提升查询性能）
CREATE INDEX IF NOT EXISTS idx_bp_folders_user_id ON bp_folders(user_id);
CREATE INDEX IF NOT EXISTS idx_bp_inspirations_user_id ON bp_inspirations(user_id);
CREATE INDEX IF NOT EXISTS idx_bp_inspirations_folder_id ON bp_inspirations(folder_id);
CREATE INDEX IF NOT EXISTS idx_bp_inspirations_tags ON bp_inspirations USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_bp_inspirations_title ON bp_inspirations USING GIN(to_tsvector('simple', title));

-- 4. 启用 Row Level Security (RLS)
ALTER TABLE bp_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE bp_inspirations ENABLE ROW LEVEL SECURITY;

-- 5. 文件夹表策略
CREATE POLICY "用户只能操作自己的文件夹"
  ON bp_folders
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 6. 灵感表策略
CREATE POLICY "用户只能操作自己的灵感"
  ON bp_inspirations
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 7. 创建更新时间戳的函数
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 8. 为表添加更新时间戳触发器
DROP TRIGGER IF EXISTS update_bp_folders_updated_at ON bp_folders;
CREATE TRIGGER update_bp_folders_updated_at
  BEFORE UPDATE ON bp_folders
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_bp_inspirations_updated_at ON bp_inspirations;
CREATE TRIGGER update_bp_inspirations_updated_at
  BEFORE UPDATE ON bp_inspirations
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- 9. 创建全文搜索函数（用于标题搜索）
CREATE OR REPLACE FUNCTION search_bp_inspirations(search_query TEXT, user_uuid UUID)
RETURNS TABLE(
  id UUID,
  title TEXT,
  description TEXT,
  folder_id UUID,
  images TEXT[],
  tags TEXT[],
  user_id UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  rank REAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    i.*,
    ts_rank(to_tsvector('simple', coalesce(i.title, '') || ' ' || coalesce(i.description, '') || ' ' || coalesce(array_to_string(i.tags, ' '), '')), plainto_tsquery('simple', search_query)) as rank
  FROM bp_inspirations i
  WHERE i.user_id = user_uuid
    AND (
      to_tsvector('simple', coalesce(i.title, '') || ' ' || coalesce(i.description, '') || ' ' || coalesce(array_to_string(i.tags, ' '), '')) @@ plainto_tsquery('simple', search_query)
      OR i.title ILIKE '%' || search_query || '%'
      OR i.description ILIKE '%' || search_query || '%'
      OR EXISTS (SELECT 1 FROM unnest(i.tags) tag WHERE tag ILIKE '%' || search_query || '%')
    )
  ORDER BY rank DESC, i.created_at DESC;
END;
$$ LANGUAGE plpgsql;
