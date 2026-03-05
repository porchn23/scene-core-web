-- Fix Permissions: Grant basic access to the web roles so they can query the table
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.tenant_members TO anon, authenticated, service_role;

-- We also make sure the SECURITY DEFINER functions are accessible
GRANT EXECUTE ON FUNCTION public.is_tenant_member(uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_tenant_owner(uuid) TO anon, authenticated, service_role;

-- To make absolutely sure there's no infinite recursion anywhere, we just explicitly define these
-- simple policies. 
DROP POLICY IF EXISTS "tenant_members_owner_all" ON public.tenant_members;
DROP POLICY IF EXISTS "tenant_members_member_select" ON public.tenant_members;
DROP POLICY IF EXISTS "Owners can manage tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Members can view their tenant members" ON public.tenant_members;

CREATE POLICY "tenant_members_owner_all"
ON public.tenant_members FOR ALL
USING ( public.is_tenant_owner(tenant_id) )
WITH CHECK ( public.is_tenant_owner(tenant_id) );

CREATE POLICY "tenant_members_member_select"
ON public.tenant_members FOR SELECT
USING ( public.is_tenant_member(tenant_id) OR public.is_tenant_owner(tenant_id) );

-- Let's also ensure user profile access relies on these functions for safety
DROP POLICY IF EXISTS "Users can view profiles in same tenant" ON public.users;

CREATE POLICY "Users can view profiles in same tenant"
ON public.users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = id AND (public.is_tenant_member(tm.tenant_id) OR public.is_tenant_owner(tm.tenant_id))
  )
);
