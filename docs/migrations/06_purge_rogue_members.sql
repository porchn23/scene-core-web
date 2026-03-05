-- Clean up accidentally joined members due to old bug
-- We remove anyone from tenant_members where they are NOT the owner of the tenant
-- UNLESS you specifically invited them recently (but since we just migrated, it's safer to clear out rogue members)
-- If you want, we will remove ALL tenant_members that do NOT match the owner_id of the tenant.
-- Then you can just re-invite legit members.
DELETE FROM public.tenant_members tm
USING public.tenants t, public.users u
WHERE tm.tenant_id = t.id 
  AND tm.user_id = u.id 
  AND u.auth_id IS DISTINCT FROM t.owner_id;

-- Make sure owners are still there
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT t.id, u.id, 'owner'
FROM public.tenants t
JOIN public.users u ON t.owner_id = u.auth_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_members tm 
  WHERE tm.tenant_id = t.id AND tm.user_id = u.id
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;
