-- 1. RPC for securely Inviting a User without needing weak RLS policies
CREATE OR REPLACE FUNCTION public.invite_user_to_tenant(_email text, _tenant_id uuid, _role text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _profile_data json;
BEGIN
  -- 1. Check if the caller is the owner of the tenant
  IF NOT public.is_tenant_owner(_tenant_id) THEN
    RAISE EXCEPTION 'Unauthorized: Only tenant owners can invite members';
  END IF;

  -- 2. Find or create user placeholder
  SELECT id INTO _user_id FROM public.users WHERE email ILIKE _email;
  
  IF _user_id IS NULL THEN
    INSERT INTO public.users (email) VALUES (LOWER(_email)) RETURNING id INTO _user_id;
  END IF;

  -- 3. Add to tenant_members
  INSERT INTO public.tenant_members (tenant_id, user_id, role)
  VALUES (_tenant_id, _user_id, _role)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  -- 4. Return the user info for the UI
  SELECT row_to_json(u) INTO _profile_data FROM public.users u WHERE u.id = _user_id;
  
  RETURN _profile_data;
END;
$$;
GRANT EXECUTE ON FUNCTION public.invite_user_to_tenant(text, uuid, text) TO authenticated;

-- 2. RPC for Claiming Profile securely
CREATE OR REPLACE FUNCTION public.claim_or_create_profile(_email text, _display_name text, _avatar_url text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _user_id uuid;
  _profile_data json;
BEGIN
  -- Prevent unauthenticated calls
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  -- Prioritize finding existing claimed profile
  SELECT id INTO _user_id FROM public.users WHERE auth_id = auth.uid();

  IF _user_id IS NULL THEN
    -- Find an existing placeholder by email
    SELECT id INTO _user_id FROM public.users WHERE email ILIKE _email AND auth_id IS NULL;

    IF _user_id IS NOT NULL THEN
      -- Claim the placeholder
      UPDATE public.users 
      SET auth_id = auth.uid(), 
          display_name = COALESCE(_display_name, display_name), 
          avatar_url = COALESCE(_avatar_url, avatar_url)
      WHERE id = _user_id;
    ELSE
      -- Create brand new profile
      INSERT INTO public.users (email, auth_id, display_name, avatar_url)
      VALUES (LOWER(_email), auth.uid(), _display_name, _avatar_url)
      RETURNING id INTO _user_id;
    END IF;
  END IF;

  SELECT row_to_json(u) INTO _profile_data FROM public.users u WHERE u.id = _user_id;
  RETURN _profile_data;
END;
$$;
GRANT EXECUTE ON FUNCTION public.claim_or_create_profile(text, text, text) TO authenticated;

-- RELOAD SCHEMA CACHE
NOTIFY pgrst, 'reload schema';
