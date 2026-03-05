-- SQL Migration to support detailed Render Jobs
-- Please run this in your Supabase SQL Editor

-- 1. Add new columns to render_jobs
ALTER TABLE public.render_jobs 
ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS scene_id UUID REFERENCES public.scenes(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS actor_id UUID REFERENCES public.actors(id) ON DELETE CASCADE,
ADD COLUMN IF NOT EXISTS job_type TEXT DEFAULT 'render_video';

-- 2. Make shot_id optional (nullable)
ALTER TABLE public.render_jobs ATER COLUMN shot_id DROP NOT NULL;

-- 3. Update existing rows (optional, but good for consistency)
UPDATE public.render_jobs SET job_type = 'render_video' WHERE job_type IS NULL;
