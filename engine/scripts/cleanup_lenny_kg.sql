-- Cleanup Lenny's KG Data Before Restarting Indexing
-- Run this in Supabase SQL Editor
-- 
-- This script deletes:
-- 1. All entity mentions where message_id LIKE 'lenny-%'
-- 2. All relations where source_message_id LIKE 'lenny-%'
-- 3. Entities that only have expert mentions (no user mentions)

BEGIN;

-- Step 1: Delete Lenny's entity mentions
-- This will CASCADE to update entity mention_count
DELETE FROM kg_entity_mentions
WHERE message_id LIKE 'lenny-%';

-- Step 2: Delete Lenny's relations
DELETE FROM kg_relations
WHERE source_message_id LIKE 'lenny-%';

-- Step 3: Delete entities that only have expert mentions
-- (entities with user mentions will be kept)
DELETE FROM kg_entities
WHERE id IN (
    SELECT e.id
    FROM kg_entities e
    LEFT JOIN kg_entity_mentions m ON m.entity_id = e.id
    WHERE (e.source_breakdown->>'lenny')::int > 0
      AND (e.source_breakdown->>'user')::int = 0
      AND NOT EXISTS (
          SELECT 1 FROM kg_entity_mentions m2 
          WHERE m2.entity_id = e.id 
          AND m2.message_id NOT LIKE 'lenny-%'
      )
);

-- Step 4: Update source_breakdown for entities that had both user and expert mentions
-- Remove 'lenny' count, keep 'user' count
UPDATE kg_entities
SET source_breakdown = jsonb_build_object(
    'user', COALESCE((source_breakdown->>'user')::int, 0)
)
WHERE source_breakdown->>'lenny' IS NOT NULL
  AND (source_breakdown->>'user')::int > 0;

COMMIT;

-- Verify cleanup
SELECT 
    (SELECT COUNT(*) FROM kg_entity_mentions WHERE message_id LIKE 'lenny-%') as remaining_mentions,
    (SELECT COUNT(*) FROM kg_relations WHERE source_message_id LIKE 'lenny-%') as remaining_relations,
    (SELECT COUNT(*) FROM kg_entities WHERE (source_breakdown->>'lenny')::int > 0) as remaining_expert_entities;
