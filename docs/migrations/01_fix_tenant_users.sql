-- 01_fix_tenant_users.sql
-- Run this in Supabase SQL Editor to refactor the database to proper Multi-Tenant structure.

-- 1. Create the intersection table for tenant membership
CREATE TABLE IF NOT EXISTS public.tenant_members (
    id uuid NOT NULL DEFAULT uuid_generate_v4(),
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL, -- references the public.users table (id)
    role text DEFAULT 'member'::text,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT tenant_members_pkey PRIMARY KEY (id),
    CONSTRAINT tenant_members_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.tenants(id) ON DELETE CASCADE,
    CONSTRAINT tenant_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE,
    CONSTRAINT tenant_members_unique_user_tenant UNIQUE(tenant_id, user_id)
);

-- 2. Migrate existing user associations into tenant_members
-- People who have a tenant_id will become owners or members of that tenant.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='users' AND column_name='tenant_id') THEN
    EXECUTE '
      INSERT INTO public.tenant_members (tenant_id, user_id, role)
      SELECT u.tenant_id, u.id, u.role
      FROM public.users u
      WHERE u.tenant_id IS NOT NULL
      ON CONFLICT (tenant_id, user_id) DO NOTHING;
    ';
  END IF;
END $$;

-- Also add owners implicitly if they are missing in the users table / tenant_members table
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT t.id, u.id, 'owner'
FROM public.tenants t
JOIN public.users u ON t.owner_id = u.auth_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_members tm WHERE tm.tenant_id = t.id AND tm.user_id = u.id
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;


-- 3. Modify public.users to act solely as a global User Profile
-- Drop all dependent policies first
DROP POLICY IF EXISTS "Users see own tenants" ON public.tenants;
DROP POLICY IF EXISTS "Users see own tenant members" ON public.users;
DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_insert" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "users_delete" ON public.users;

ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_tenant_id_fkey;
ALTER TABLE public.users DROP COLUMN IF EXISTS tenant_id CASCADE;
ALTER TABLE public.users DROP COLUMN IF EXISTS role CASCADE;

-- 4. Set up Row Level Security (RLS) properly to avoid Infinite Recursion
-- We use a SECURITY DEFINER function to get the profile ID for the current auth.uid()
-- This avoids querying the 'users' table directly in policies, which causes circular dependencies.
CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.users WHERE auth_id = auth.uid() LIMIT 1;
$$;

-- Enable RLS on new table
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- Tenants RLS
DROP POLICY IF EXISTS "Users can manage their owned tenants" ON public.tenants;
DROP POLICY IF EXISTS "Users can view tenants they are members of" ON public.tenants;
DROP POLICY IF EXISTS "Tenants owner policy" ON public.tenants;
DROP POLICY IF EXISTS "Tenants member policy" ON public.tenants;

CREATE POLICY "Users can manage their owned tenants" 
ON public.tenants FOR ALL 
USING (auth.uid() = owner_id) 
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Users can view tenants they are members of" 
ON public.tenants FOR SELECT 
USING (
  id IN (
    SELECT tenant_id FROM public.tenant_members 
    WHERE user_id = public.get_current_profile_id()
  )
);

-- Users RLS 
DROP POLICY IF EXISTS "Users tenant policy" ON public.users;
DROP POLICY IF EXISTS "Owners can manage users in their tenants" ON public.users;
DROP POLICY IF EXISTS "Members can view users in same tenant" ON public.users;
DROP POLICY IF EXISTS "Users can view and edit their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view profiles in same tenant" ON public.users;

-- Users can view and edit their own global profile
CREATE POLICY "Users can view and edit their own profile"
ON public.users FOR ALL
USING (auth_id = auth.uid())
WITH CHECK (auth_id = auth.uid());

-- Users can view profiles of people in the same tenant
CREATE POLICY "Users can view profiles in same tenant"
ON public.users FOR SELECT
USING (
  id IN (
    SELECT user_id FROM public.tenant_members
    WHERE tenant_id IN (
      SELECT tenant_id FROM public.tenant_members 
      WHERE user_id = public.get_current_profile_id()
    )
  )
);

-- tenant_members RLS
DROP POLICY IF EXISTS "Owners can manage tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Members can view their tenant members" ON public.tenant_members;

CREATE POLICY "Owners can manage tenant members"
ON public.tenant_members FOR ALL
USING (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT id FROM public.tenants WHERE owner_id = auth.uid()
  )
);

CREATE POLICY "Members can view their tenant members"
ON public.tenant_members FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.tenant_members 
    WHERE user_id = public.get_current_profile_id()
  )
);

-- Done!
