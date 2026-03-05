-- 1. DELETE ALL STALE MEMBERS
-- This completely empties the tenant_members table to kick EVERYONE out of EVERY studio
TRUNCATE TABLE public.tenant_members;

-- 2. ADD BACK ONLY THE REAL OWNERS
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT t.id, u.id, 'owner'
FROM public.tenants t
JOIN public.users u ON t.owner_id = u.auth_id
ON CONFLICT (tenant_id, user_id) DO NOTHING;

-- 3. REFRESH SUPABASE API SCHEMA CACHE
-- This fixes the "PGRST204 Could not find the 'role' column" error for new users!
NOTIFY pgrst, 'reload schema';
