-- ============================================
-- Stardust 用户记忆 - 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 0. 启用 pgvector 扩展（语义向量检索）
--    注意：Supabase 需要在 Dashboard → Database → Extensions 中手动启用 pgvector
--    如果已经启用，此行跳过
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. 创建用户记忆表
CREATE TABLE IF NOT EXISTS public.user_memories (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  category    TEXT DEFAULT 'general',     -- preference / fact / project / general
  importance  INTEGER DEFAULT 0,          -- 0-10，越高越重要
  source      TEXT DEFAULT 'extracted',   -- extracted / manual
  embedding   vector(384),                -- 语义向量（384 维，兼容 bge-small-zh / text-embedding-3-small）
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_user_memories_user_id
  ON public.user_memories(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memories_importance
  ON public.user_memories(user_id, importance DESC);
CREATE INDEX IF NOT EXISTS idx_user_memories_updated
  ON public.user_memories(user_id, updated_at DESC);

-- 3. 向量索引（IVFFlat，适合 1000-100000 条数据。超过 10 万条后升级为 HNSW）
-- 注意：表为空时无法创建 IVFFlat 索引，先用注释保留，插入一批数据后再执行
-- CREATE INDEX IF NOT EXISTS idx_user_memories_embedding
--   ON public.user_memories
--   USING ivfflat (embedding public.vector_cosine_ops)
--   WITH (lists = 100);

-- 4. 语义搜索函数（v3 使用）
-- 按向量余弦相似度检索最相关的 Top-N 记忆
CREATE OR REPLACE FUNCTION search_memories(
  query_embedding vector(384),
  match_user_id UUID,
  match_limit INTEGER DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.7
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  category TEXT,
  importance INTEGER,
  similarity FLOAT
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    m.id,
    m.content,
    m.category,
    m.importance,
    1 - (m.embedding <=> query_embedding) AS similarity
  FROM public.user_memories m
  WHERE m.user_id = match_user_id
    AND m.embedding IS NOT NULL
    AND 1 - (m.embedding <=> query_embedding) > match_threshold
  ORDER BY m.embedding <=> query_embedding
  LIMIT match_limit;
END;
$$;

-- 5. 启用 RLS
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

-- 6. RLS 策略
DROP POLICY IF EXISTS "Users can view their own memories" ON public.user_memories;
CREATE POLICY "Users can view their own memories"
  ON public.user_memories FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own memories" ON public.user_memories;
CREATE POLICY "Users can insert their own memories"
  ON public.user_memories FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own memories" ON public.user_memories;
CREATE POLICY "Users can update their own memories"
  ON public.user_memories FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own memories" ON public.user_memories;
CREATE POLICY "Users can delete their own memories"
  ON public.user_memories FOR DELETE
  USING (auth.uid() = user_id);
