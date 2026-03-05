-- Bypass RLS with SECURITY DEFINER functions to break all infinite loops
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

-- Drop old looping policies
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
USING ( public.is_tenant_member(id) );


DROP POLICY IF EXISTS "Users tenant policy" ON public.users;
DROP POLICY IF EXISTS "Owners can manage users in their tenants" ON public.users;
DROP POLICY IF EXISTS "Members can view users in same tenant" ON public.users;
DROP POLICY IF EXISTS "Users can view and edit their own profile" ON public.users;
DROP POLICY IF EXISTS "Users can view profiles in same tenant" ON public.users;

CREATE POLICY "Users can view and edit their own profile"
ON public.users FOR ALL
USING (auth_id = auth.uid())
WITH CHECK (auth_id = auth.uid());

CREATE POLICY "Users can view profiles in same tenant"
ON public.users FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = id AND (public.is_tenant_member(tm.tenant_id) OR public.is_tenant_owner(tm.tenant_id))
  )
);

DROP POLICY IF EXISTS "Owners can manage tenant members" ON public.tenant_members;
DROP POLICY IF EXISTS "Members can view their tenant members" ON public.tenant_members;

CREATE POLICY "Owners can manage tenant members"
ON public.tenant_members FOR ALL
USING ( public.is_tenant_owner(tenant_id) )
WITH CHECK ( public.is_tenant_owner(tenant_id) );

CREATE POLICY "Members can view their tenant members"
ON public.tenant_members FOR SELECT
USING ( public.is_tenant_member(tenant_id) OR public.is_tenant_owner(tenant_id) );
