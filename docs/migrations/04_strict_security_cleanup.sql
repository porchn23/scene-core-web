-- Hard Reset: Drop ALL policies on tenants, users, and tenant_members to ensure no rogue policies leak data
DO $$ 
DECLARE
    pol record;
BEGIN
    FOR pol IN SELECT policyname, tablename 
             FROM pg_policies 
             WHERE schemaname = 'public' AND tablename IN ('tenants', 'users', 'tenant_members')
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

-- 1. Enforce RLS is ENABLED (If it was turned off, anyone could read)
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- 2. Define strict RLS using our security definer functions (from step 02)
-- Tenants RLS
CREATE POLICY "Tenants owner manage" 
ON public.tenants FOR ALL 
USING (auth.uid() = owner_id) 
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Tenants member view" 
ON public.tenants FOR SELECT 
USING ( public.is_tenant_member(id) );

-- Users RLS 
CREATE POLICY "Users edit own profile"
ON public.users FOR ALL
USING (auth_id = auth.uid())
WITH CHECK (auth_id = auth.uid());

CREATE POLICY "Users view team profiles"
ON public.users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = id AND (public.is_tenant_member(tm.tenant_id) OR public.is_tenant_owner(tm.tenant_id))
  )
);

-- tenant_members RLS
CREATE POLICY "Tenant owners manage members"
ON public.tenant_members FOR ALL
USING ( public.is_tenant_owner(tenant_id) )
WITH CHECK ( public.is_tenant_owner(tenant_id) );

CREATE POLICY "Tenant members view members"
ON public.tenant_members FOR SELECT
USING ( public.is_tenant_member(tenant_id) OR public.is_tenant_owner(tenant_id) );
