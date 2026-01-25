-- Check why we're missing ~8,134 mentions (47,466 expected vs 39,332 in DB)
-- Run this in Supabase SQL Editor

-- Total mentions in database
SELECT COUNT(*) as total_mentions_in_db FROM kg_entity_mentions;

-- Check if there are mentions with invalid entity_id (orphaned mentions)
SELECT COUNT(*) as orphaned_mentions
FROM kg_entity_mentions m
LEFT JOIN kg_entities e ON m.entity_id = e.id
WHERE e.id IS NULL;

-- Check mentions by source (should match diagnostic query)
SELECT 
    COALESCE(source, 'NULL') as source_value,
    COUNT(*) as count
FROM kg_entity_mentions
GROUP BY source
ORDER BY count DESC;

-- Check if mentions are being filtered out by entity source_type
-- (mentions that exist but their entity doesn't have source_type='expert')
SELECT COUNT(*) as mentions_with_non_expert_entities
FROM kg_entity_mentions m
INNER JOIN kg_entities e ON m.entity_id = e.id
WHERE m.source IN ('lenny', 'unknown')
  AND e.source_type != 'expert';

-- Check relations source distribution
SELECT 
    COALESCE(source, 'NULL') as source_value,
    COUNT(*) as count
FROM kg_relations
GROUP BY source
ORDER BY count DESC;

-- Total relations in database
SELECT COUNT(*) as total_relations_in_db FROM kg_relations;
