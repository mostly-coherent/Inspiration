-- Migration: Builder Assessments table for v7
-- Purpose: Store assessment results and user responses for longitudinal comparison
-- Date: 2026-02-23

-- ============================================================================
-- Create builder_assessments table
-- ============================================================================

CREATE TABLE IF NOT EXISTS builder_assessments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  weaknesses JSONB NOT NULL,
  data_sources_summary TEXT,
  user_responses JSONB DEFAULT '{}'::jsonb,
  responded_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_builder_assessments_generated_at
  ON builder_assessments(generated_at DESC);
