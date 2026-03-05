-- =============================================
-- SCENE CORE — Enable Row Level Security
-- =============================================
-- วิธีใช้: รัน SQL นี้ใน Supabase Dashboard → SQL Editor
-- หลังจากรันแล้ว ทุก table จะถูก isolate ตาม tenant อัตโนมัติ
-- =============================================

-- ── HELPER FUNCTION ──────────────────────────────────────────────
-- ฟังก์ชันนี้ return list ของ tenant_id ที่ user ปัจจุบัน access ได้
-- อยู่ใน public schema (auth schema ไม่ให้สร้าง function ใหม่ใน Supabase)
-- SECURITY DEFINER = รันด้วย permissions ของ owner (bypass RLS ของ function itself)
-- ป้องกัน circular dependency ระหว่าง tenants ↔ users policies

CREATE OR REPLACE FUNCTION public.accessible_tenant_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  -- Tenants ที่ user เป็น owner
  SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  UNION
  -- Tenants ที่ user เป็น member (via users table)
  SELECT tenant_id FROM public.users
  WHERE auth_id = auth.uid() AND tenant_id IS NOT NULL
$$;

-- อนุญาตให้ authenticated users เรียกใช้ function นี้ได้
GRANT EXECUTE ON FUNCTION public.accessible_tenant_ids() TO authenticated;


-- ── TENANTS ──────────────────────────────────────────────────────
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenants_select" ON public.tenants;
DROP POLICY IF EXISTS "tenants_insert" ON public.tenants;
DROP POLICY IF EXISTS "tenants_update" ON public.tenants;
DROP POLICY IF EXISTS "tenants_delete" ON public.tenants;

-- อ่านได้เฉพาะ tenant ที่ตัวเองเป็น owner หรือ member
CREATE POLICY "tenants_select" ON public.tenants
  FOR SELECT TO authenticated
  USING (id IN (SELECT public.accessible_tenant_ids()));

-- สร้าง tenant ได้เฉพาะ authenticated users (owner_id ต้องเป็นตัวเอง)
CREATE POLICY "tenants_insert" ON public.tenants
  FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());

-- แก้ไขได้เฉพาะ tenant ที่ตัวเองเป็น owner
CREATE POLICY "tenants_update" ON public.tenants
  FOR UPDATE TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

-- ลบได้เฉพาะ tenant ที่ตัวเองเป็น owner
CREATE POLICY "tenants_delete" ON public.tenants
  FOR DELETE TO authenticated
  USING (owner_id = auth.uid());


-- ── USERS ────────────────────────────────────────────────────────
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_insert" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_delete" ON public.users;

-- อ่านได้: profile ตัวเอง + สมาชิกใน tenant เดียวกัน
CREATE POLICY "users_select" ON public.users
  FOR SELECT TO authenticated
  USING (
    auth_id = auth.uid() OR
    tenant_id IN (SELECT public.accessible_tenant_ids())
  );

-- INSERT: สร้าง profile ตัวเอง (auth callback) หรือ owner เพิ่ม member
CREATE POLICY "users_insert" ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    auth_id = auth.uid() OR
    (
      auth_id IS NULL AND
      tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
    )
  );

-- UPDATE: แก้ profile ตัวเอง, claim profile ที่ยังไม่มี auth_id (email match), หรือ owner จัดการสมาชิก
CREATE POLICY "users_update" ON public.users
  FOR UPDATE TO authenticated
  USING (
    auth_id = auth.uid() OR
    (auth_id IS NULL AND email = auth.email()) OR
    tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  )
  WITH CHECK (true);

-- DELETE: เฉพาะ owner ลบสมาชิกใน tenant ตัวเอง
CREATE POLICY "users_delete" ON public.users
  FOR DELETE TO authenticated
  USING (
    tenant_id IN (SELECT id FROM public.tenants WHERE owner_id = auth.uid())
  );


-- ── PROJECTS ─────────────────────────────────────────────────────
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_all" ON public.projects;

CREATE POLICY "projects_all" ON public.projects
  FOR ALL TO authenticated
  USING   (tenant_id IN (SELECT public.accessible_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.accessible_tenant_ids()));


-- ── EPISODES ─────────────────────────────────────────────────────
ALTER TABLE public.episodes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "episodes_all" ON public.episodes;

CREATE POLICY "episodes_all" ON public.episodes
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  );


-- ── SCENES ───────────────────────────────────────────────────────
ALTER TABLE public.scenes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "scenes_all" ON public.scenes;

CREATE POLICY "scenes_all" ON public.scenes
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  );


-- ── SHOTS ────────────────────────────────────────────────────────
ALTER TABLE public.shots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shots_all" ON public.shots;

CREATE POLICY "shots_all" ON public.shots
  FOR ALL TO authenticated
  USING (
    scene_id IN (
      SELECT sc.id FROM public.scenes sc
      JOIN public.projects p ON sc.project_id = p.id
      WHERE p.tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  )
  WITH CHECK (
    scene_id IN (
      SELECT sc.id FROM public.scenes sc
      JOIN public.projects p ON sc.project_id = p.id
      WHERE p.tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  );


-- ── CHARACTERS ───────────────────────────────────────────────────
ALTER TABLE public.characters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "characters_all" ON public.characters;

CREATE POLICY "characters_all" ON public.characters
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  );


-- ── LOCATIONS ────────────────────────────────────────────────────
ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "locations_all" ON public.locations;

CREATE POLICY "locations_all" ON public.locations
  FOR ALL TO authenticated
  USING (
    project_id IN (
      SELECT id FROM public.projects
      WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  )
  WITH CHECK (
    project_id IN (
      SELECT id FROM public.projects
      WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  );


-- ── ACTORS ───────────────────────────────────────────────────────
ALTER TABLE public.actors ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "actors_select" ON public.actors;
DROP POLICY IF EXISTS "actors_insert" ON public.actors;
DROP POLICY IF EXISTS "actors_update" ON public.actors;
DROP POLICY IF EXISTS "actors_delete" ON public.actors;

-- อ่านได้: actor ของ tenant ตัวเอง + public actors
CREATE POLICY "actors_select" ON public.actors
  FOR SELECT TO authenticated
  USING (
    tenant_id IN (SELECT public.accessible_tenant_ids()) OR
    visibility = 'public'
  );

-- เขียนได้เฉพาะ actor ของ tenant ตัวเอง
CREATE POLICY "actors_insert" ON public.actors
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT public.accessible_tenant_ids()));

CREATE POLICY "actors_update" ON public.actors
  FOR UPDATE TO authenticated
  USING   (tenant_id IN (SELECT public.accessible_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.accessible_tenant_ids()));

CREATE POLICY "actors_delete" ON public.actors
  FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT public.accessible_tenant_ids()));


-- ── SHOT_DIALOGUES ───────────────────────────────────────────────
ALTER TABLE public.shot_dialogues ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shot_dialogues_all" ON public.shot_dialogues;

CREATE POLICY "shot_dialogues_all" ON public.shot_dialogues
  FOR ALL TO authenticated
  USING (
    shot_id IN (
      SELECT sh.id FROM public.shots sh
      JOIN public.scenes sc ON sh.scene_id = sc.id
      JOIN public.projects p ON sc.project_id = p.id
      WHERE p.tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  )
  WITH CHECK (
    shot_id IN (
      SELECT sh.id FROM public.shots sh
      JOIN public.scenes sc ON sh.scene_id = sc.id
      JOIN public.projects p ON sc.project_id = p.id
      WHERE p.tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  );


-- ── SHOT_GENERATIONS ─────────────────────────────────────────────
ALTER TABLE public.shot_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "shot_generations_all" ON public.shot_generations;

CREATE POLICY "shot_generations_all" ON public.shot_generations
  FOR ALL TO authenticated
  USING (
    shot_id IN (
      SELECT sh.id FROM public.shots sh
      JOIN public.scenes sc ON sh.scene_id = sc.id
      JOIN public.projects p ON sc.project_id = p.id
      WHERE p.tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  )
  WITH CHECK (
    shot_id IN (
      SELECT sh.id FROM public.shots sh
      JOIN public.scenes sc ON sh.scene_id = sc.id
      JOIN public.projects p ON sc.project_id = p.id
      WHERE p.tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  );


-- ── RENDER_JOBS ──────────────────────────────────────────────────
ALTER TABLE public.render_jobs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "render_jobs_all" ON public.render_jobs;

-- render_video/render_image: project_id ต้องอยู่ใน accessible tenants
-- train_lora: ไม่มี project_id แต่มี actor_id ของ tenant ตัวเอง
CREATE POLICY "render_jobs_all" ON public.render_jobs
  FOR ALL TO authenticated
  USING (
    (
      project_id IS NOT NULL AND
      project_id IN (
        SELECT id FROM public.projects
        WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
      )
    ) OR (
      project_id IS NULL AND
      actor_id IS NOT NULL AND
      actor_id IN (
        SELECT id FROM public.actors
        WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
      )
    )
  )
  WITH CHECK (
    (
      project_id IS NOT NULL AND
      project_id IN (
        SELECT id FROM public.projects
        WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
      )
    ) OR (
      project_id IS NULL AND
      actor_id IS NOT NULL AND
      actor_id IN (
        SELECT id FROM public.actors
        WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
      )
    )
  );


-- ── TRANSACTIONS ─────────────────────────────────────────────────
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "transactions_all" ON public.transactions;

CREATE POLICY "transactions_all" ON public.transactions
  FOR ALL TO authenticated
  USING   (tenant_id IN (SELECT public.accessible_tenant_ids()))
  WITH CHECK (tenant_id IN (SELECT public.accessible_tenant_ids()));


-- ── ACTOR_MODELS ─────────────────────────────────────────────────
ALTER TABLE public.actor_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "actor_models_all" ON public.actor_models;

CREATE POLICY "actor_models_all" ON public.actor_models
  FOR ALL TO authenticated
  USING (
    actor_id IN (
      SELECT id FROM public.actors
      WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  )
  WITH CHECK (
    actor_id IN (
      SELECT id FROM public.actors
      WHERE tenant_id IN (SELECT public.accessible_tenant_ids())
    )
  );


-- ── ตรวจสอบผลลัพธ์ ──────────────────────────────────────────────
-- รัน query นี้เพื่อ verify ว่า RLS enabled ทุกตาราง
SELECT
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;
