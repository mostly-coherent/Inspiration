-- Migration: Add 'other' entity type for emergent/uncategorized entities
-- Run this in Supabase SQL Editor
--
-- Purpose: Allow the KG to capture entities that don't fit predefined categories
-- This enables the knowledge graph to evolve and surface new patterns

-- ============================================================================
-- Add 'other' to entity_type enum
-- ============================================================================

-- PostgreSQL doesn't allow direct ALTER TYPE ... ADD VALUE in a transaction
-- So we need to use this workaround or run outside a transaction

ALTER TYPE entity_type ADD VALUE IF NOT EXISTS 'other';

-- ============================================================================
-- Update extraction prompt guidance (for reference)
-- ============================================================================
-- The LLM extraction prompt should be updated to include:
-- - 'other': Entities that don't fit tool/pattern/problem/concept/person/project/workflow
--            but are still specific, named, and worth tracking
--
-- Examples of 'other' entities:
-- - Events: "YC Demo Day", "WWDC 2024"
-- - Organizations: "Sequoia Capital", "a]j team"
-- - Metrics/KPIs: "NPS score", "DAU/MAU ratio"
-- - Documents/Artifacts: "RFC 7231", "Design Doc"
-- - Domains/Categories: "Developer Experience", "Growth Hacking"

-- ============================================================================
-- Verify the change
-- ============================================================================

-- Check enum values:
-- SELECT enum_range(NULL::entity_type);
-- Should now include: tool, pattern, problem, concept, person, project, workflow, other

-- ============================================================================
-- Success Message
-- ============================================================================

DO $$
BEGIN
    RAISE NOTICE 'Added "other" to entity_type enum successfully!';
    RAISE NOTICE 'New enum values: tool, pattern, problem, concept, person, project, workflow, other';
END $$;
