-- ============================================
-- Database Functions for Real-time Render Jobs
-- Run these in Supabase SQL Editor
-- ============================================

-- Drop old functions if exist
DROP FUNCTION IF EXISTS deduct_credits(UUID, INTEGER);
DROP FUNCTION IF EXISTS deduct_credits(INTEGER, UUID);
DROP FUNCTION IF EXISTS add_credits(UUID, INTEGER);
DROP FUNCTION IF EXISTS add_credits(INTEGER, UUID);
DROP FUNCTION IF EXISTS notify_new_job(UUID);

-- 1. Deduct credits function
CREATE OR REPLACE FUNCTION deduct_credits(p_amount INTEGER, p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tenants
  SET credit_balance = credit_balance - p_amount
  WHERE id = p_tenant_id AND credit_balance >= p_amount;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient credits or tenant not found';
  END IF;
END;
$$;

-- 2. Add credits function (for rollback)
CREATE OR REPLACE FUNCTION add_credits(p_amount INTEGER, p_tenant_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE tenants
  SET credit_balance = credit_balance + p_amount
  WHERE id = p_tenant_id;
END;
$$;

-- 3. Notify new job function (triggers LISTEN/NOTIFY)
CREATE OR REPLACE FUNCTION notify_new_job(p_job_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM pg_notify('render_jobs', json_build_object(
    'event', 'new_job',
    'job_id', p_job_id
  )::text);
END;
$$;

-- 4. Add provider column to render_jobs (if not exists)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'render_jobs' AND column_name = 'provider'
  ) THEN
    ALTER TABLE render_jobs ADD COLUMN provider VARCHAR(50) DEFAULT 'runway';
  END IF;
END $$;

-- ============================================
-- Test the functions
-- ============================================
-- SELECT deduct_credits(10, 'your-tenant-id-uuid');
-- SELECT add_credits(10, 'your-tenant-id-uuid');
-- SELECT notify_new_job('your-job-id-uuid');
