-- Migration: Enable RLS for builder_assessments
-- Purpose: Resolve Supabase linter error 0013_rls_disabled_in_public
-- Date: 2026-03-11

-- This migration is intentionally safe to run multiple times.
-- It updates an existing table created by 007_builder_assessments.sql.

ALTER TABLE IF EXISTS public.builder_assessments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'builder_assessments'
  ) THEN
    -- Recreate policies to keep this migration idempotent.
    DROP POLICY IF EXISTS "Allow anon read builder_assessments" ON public.builder_assessments;
    DROP POLICY IF EXISTS "Allow anon insert builder_assessments" ON public.builder_assessments;
    DROP POLICY IF EXISTS "Allow anon update builder_assessments" ON public.builder_assessments;
    DROP POLICY IF EXISTS "Allow anon delete builder_assessments" ON public.builder_assessments;
    DROP POLICY IF EXISTS "Allow authenticated read builder_assessments" ON public.builder_assessments;
    DROP POLICY IF EXISTS "Allow authenticated insert builder_assessments" ON public.builder_assessments;
    DROP POLICY IF EXISTS "Allow authenticated update builder_assessments" ON public.builder_assessments;
    DROP POLICY IF EXISTS "Allow authenticated delete builder_assessments" ON public.builder_assessments;

    CREATE POLICY "Allow anon read builder_assessments"
      ON public.builder_assessments FOR SELECT TO anon USING (true);

    CREATE POLICY "Allow anon insert builder_assessments"
      ON public.builder_assessments FOR INSERT TO anon WITH CHECK (true);

    CREATE POLICY "Allow anon update builder_assessments"
      ON public.builder_assessments FOR UPDATE TO anon USING (true) WITH CHECK (true);

    CREATE POLICY "Allow anon delete builder_assessments"
      ON public.builder_assessments FOR DELETE TO anon USING (true);

    CREATE POLICY "Allow authenticated read builder_assessments"
      ON public.builder_assessments FOR SELECT TO authenticated USING (true);

    CREATE POLICY "Allow authenticated insert builder_assessments"
      ON public.builder_assessments FOR INSERT TO authenticated WITH CHECK (true);

    CREATE POLICY "Allow authenticated update builder_assessments"
      ON public.builder_assessments FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

    CREATE POLICY "Allow authenticated delete builder_assessments"
      ON public.builder_assessments FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- Verification (optional):
-- SELECT schemaname, tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public' AND tablename = 'builder_assessments';
--
-- SELECT policyname, permissive, roles, cmd
-- FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'builder_assessments'
-- ORDER BY policyname;
