-- 1. DROP ALL OLD POLICIES that might be leaking data
DROP POLICY IF EXISTS "Enable read access for all users" ON public.tenants;
DROP POLICY IF EXISTS "Users can manage their owned tenants" ON public.tenants;
DROP POLICY IF EXISTS "Users can view tenants they are members of" ON public.tenants;
DROP POLICY IF EXISTS "Tenants owner policy" ON public.tenants;
DROP POLICY IF EXISTS "Tenants member policy" ON public.tenants;
DROP POLICY IF EXISTS "Tenants owner manage" ON public.tenants;
DROP POLICY IF EXISTS "Tenants member view" ON public.tenants;

DROP POLICY IF EXISTS "Users tenant policy" ON public.users;
DROP POLICY IF EXISTS "Owners can manage users in their tenants" ON public.users;
DROP POLICY IF EXISTS "Members can view users in same tenant" ON public.users;
DROP POLICY IF EXISTS "Users can view and edit their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view profiles in same tenant" ON public.users;
DROP POLICY IF EXISTS "Users edit own profile" ON public.users;
DROP POLICY IF EXISTS "Users view team profiles" ON public.users;

DROP POLICY IF EXISTS "Owners can manage tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Members can view their tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_owner_all" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_member_select" ON public.tenant_members;
DROP POLICY IF EXISTS "Tenant owners manage members" ON public.tenant_members;
DROP POLICY IF EXISTS "Tenant members view members" ON public.tenant_members;

-- 2. ENABLE RLS
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_members ENABLE ROW LEVEL SECURITY;

-- 3. FIX THE TEAM MEMBER LEAK
-- Delete all members where the user is NOT the owner of the tenant.
-- This forcefully removes EVERYONE from spaces they shouldn't be in.
DELETE FROM public.tenant_members tm
USING public.tenants t, public.users u
WHERE tm.tenant_id = t.id 
  AND tm.user_id = u.id 
  AND t.owner_id IS DISTINCT FROM u.auth_id;

-- Make sure every owner is in their own team
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT t.id, u.id, 'owner'
FROM public.tenants t
JOIN public.users u ON t.owner_id = u.auth_id
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 4. CREATE NEW BULLETPROOF PROTECTIONS
CREATE OR REPLACE FUNCTION public.is_tenant_member(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenant_members tm
    JOIN public.users u ON u.id = tm.user_id
    WHERE tm.tenant_id = _tenant_id AND u.auth_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_tenant_owner(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.tenants
    WHERE id = _tenant_id AND owner_id = auth.uid()
  );
$$;

-- 5. RE-APPLY POLICIES 
DROP POLICY IF EXISTS "Tenants owner access" ON public.tenants;
CREATE POLICY "Tenants owner access" ON public.tenants FOR ALL USING (auth.uid() = owner_id) WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Tenants member access" ON public.tenants;
CREATE POLICY "Tenants member access" ON public.tenants FOR SELECT USING ( public.is_tenant_member(id) );

DROP POLICY IF EXISTS "Users edit own profile" ON public.users;
CREATE POLICY "Users edit own profile" ON public.users FOR ALL USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS "Users view team profiles" ON public.users;
CREATE POLICY "Users view team profiles" ON public.users FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = id AND (public.is_tenant_member(tm.tenant_id) OR public.is_tenant_owner(tm.tenant_id))
  )
);

DROP POLICY IF EXISTS "Tenant owners manage members" ON public.tenant_members;
CREATE POLICY "Tenant owners manage members" ON public.tenant_members FOR ALL USING ( public.is_tenant_owner(tenant_id) ) WITH CHECK ( public.is_tenant_owner(tenant_id) );

DROP POLICY IF EXISTS "Tenant members view members" ON public.tenant_members;
CREATE POLICY "Tenant members view members" ON public.tenant_members FOR SELECT USING ( public.is_tenant_member(tenant_id) OR public.is_tenant_owner(tenant_id) );

-- 6. GRANT PERMISSIONS
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenants TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.users TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_members TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO anon, authenticated, service_role;
