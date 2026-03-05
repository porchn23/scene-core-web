-- 1. Wipe out ALL messy team memberships that were accidentally carried over from the old buggy database
TRUNCATE TABLE public.tenant_members;

-- 2. Add ONLY the true Owner of each studio back into their own studio
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT t.id, u.id, 'owner'
FROM public.tenants t
JOIN public.users u ON t.owner_id = u.auth_id
ON CONFLICT (tenant_id, user_id) DO NOTHING;
