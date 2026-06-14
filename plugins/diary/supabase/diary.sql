-- ============================================
-- BrainPlus Diary 模块 - 数据库初始化脚本
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. 创建日记条目表
CREATE TABLE IF NOT EXISTS public.diary_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL DEFAULT '',
  mood        TEXT,                          -- 心情标签，如 happy/sad/calm/excited
  tags        TEXT[] DEFAULT '{}',           -- 标签数组，如 {"技术","思考"}
  entry_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- 每个用户每天只能有一篇日记
  UNIQUE(user_id, entry_date)
);

-- 2. 创建索引
CREATE INDEX IF NOT EXISTS idx_diary_entries_user_id    ON public.diary_entries(user_id);
CREATE INDEX IF NOT EXISTS idx_diary_entries_entry_date ON public.diary_entries(entry_date);
CREATE INDEX IF NOT EXISTS idx_diary_entries_user_date  ON public.diary_entries(user_id, entry_date DESC);

-- 3. updated_at 自动更新触发器
CREATE OR REPLACE FUNCTION public.update_diary_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_diary_updated_at ON public.diary_entries;
CREATE TRIGGER trigger_diary_updated_at
  BEFORE UPDATE ON public.diary_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_diary_updated_at();

-- 4. 启用 Row Level Security
ALTER TABLE public.diary_entries ENABLE ROW LEVEL SECURITY;

-- 5. RLS 策略：用户只能读取自己的日记
DROP POLICY IF EXISTS "Users can view own diary entries" ON public.diary_entries;
CREATE POLICY "Users can view own diary entries"
  ON public.diary_entries
  FOR SELECT
  USING (auth.uid() = user_id);

-- 6. RLS 策略：用户只能插入自己的日记
DROP POLICY IF EXISTS "Users can insert own diary entries" ON public.diary_entries;
CREATE POLICY "Users can insert own diary entries"
  ON public.diary_entries
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 7. RLS 策略：用户只能更新自己的日记
DROP POLICY IF EXISTS "Users can update own diary entries" ON public.diary_entries;
CREATE POLICY "Users can update own diary entries"
  ON public.diary_entries
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. RLS 策略：用户只能删除自己的日记
DROP POLICY IF EXISTS "Users can delete own diary entries" ON public.diary_entries;
CREATE POLICY "Users can delete own diary entries"
  ON public.diary_entries
  FOR DELETE
  USING (auth.uid() = user_id);

-- 9. 创建用户资料表（扩展 auth.users）
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username    TEXT UNIQUE,
  avatar_url  TEXT,
  role        TEXT DEFAULT 'Creator',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. profiles RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- 11. 新用户注册时自动创建 profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'username', split_part(NEW.email, '@', 1)),
    'Creator'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
