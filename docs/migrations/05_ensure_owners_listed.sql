-- Make sure to run this in SQL Editor
-- This script ensures that every Studio Owner is correctly listed as 'owner' in their own tenant's member list
INSERT INTO public.tenant_members (tenant_id, user_id, role)
SELECT t.id, u.id, 'owner'
FROM public.tenants t
JOIN public.users u ON t.owner_id = u.auth_id
WHERE NOT EXISTS (
  SELECT 1 FROM public.tenant_members tm 
  WHERE tm.tenant_id = t.id AND tm.user_id = u.id
)
ON CONFLICT (tenant_id, user_id) DO NOTHING;
