-- ============================================
-- BrainPlus Agents - A2A v1.0 对齐
-- 在 Supabase SQL Editor 中执行此脚本
-- ============================================

-- 1. Agents 表（A2A Agent Card 对齐）
CREATE TABLE IF NOT EXISTS public.agents (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                           -- Agent Card: name
  description   TEXT DEFAULT '',                        -- Agent Card: description
  url           TEXT DEFAULT '',                        -- Agent Card: url (remote endpoint)
  type          TEXT DEFAULT 'remote',                  -- 'local' | 'remote'
  version       TEXT DEFAULT '1.0.0',                   -- Agent Card: version
  capabilities  JSONB DEFAULT '{"streaming":true,"pushNotifications":false}'::jsonb,
  status        TEXT DEFAULT 'draft',                   -- 'draft' | 'active' | 'paused'
  system_prompt TEXT DEFAULT '',                        -- 自定义系统提示词
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Agent Skills 表（A2A Skill 对齐）
CREATE TABLE IF NOT EXISTS public.agent_skills (
  id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id      UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,                          -- Skill: name
  description   TEXT DEFAULT '',                       -- Skill: description
  tags          TEXT[] DEFAULT '{}',                    -- Skill: tags (如 ['code-review','python'])
  examples      TEXT[] DEFAULT '{}',                   -- Skill: examples
  input_modes   TEXT[] DEFAULT '{text}',               -- Skill: inputModes ('text'|'file'|'image')
  output_modes  TEXT[] DEFAULT '{text}',               -- Skill: outputModes ('text'|'file')
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Agent Tasks 表（A2A Task 对齐，Milestone 5 使用）
CREATE TABLE IF NOT EXISTS public.agent_tasks (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_id        UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  conversation_id TEXT,                                 -- 关联对话 ID
  status          TEXT DEFAULT 'pending',              -- pending | running | completed | failed | cancelled
  input           TEXT,                                 -- 任务输入
  output          TEXT,                                 -- 任务输出
  error           TEXT,                                 -- 错误信息
  metadata        JSONB DEFAULT '{}'::jsonb,            -- 额外元数据
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 4. 索引
CREATE INDEX IF NOT EXISTS idx_agents_user_id ON public.agents(user_id);
CREATE INDEX IF NOT EXISTS idx_agents_status ON public.agents(status);
CREATE INDEX IF NOT EXISTS idx_agent_skills_agent_id ON public.agent_skills(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_agent_id ON public.agent_tasks(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tasks_status ON public.agent_tasks(status);

-- 5. RLS
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_tasks ENABLE ROW LEVEL SECURITY;

-- 6. RLS 策略
DROP POLICY IF EXISTS "Users manage own agents" ON public.agents;
CREATE POLICY "Users manage own agents" ON public.agents
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users manage own agent skills" ON public.agent_skills;
CREATE POLICY "Users manage own agent skills" ON public.agent_skills
  USING (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = agent_skills.agent_id AND agents.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = agent_skills.agent_id AND agents.user_id = auth.uid()));

DROP POLICY IF EXISTS "Users manage own agent tasks" ON public.agent_tasks;
CREATE POLICY "Users manage own agent tasks" ON public.agent_tasks
  USING (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = agent_tasks.agent_id AND agents.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.agents WHERE agents.id = agent_tasks.agent_id AND agents.user_id = auth.uid()));
