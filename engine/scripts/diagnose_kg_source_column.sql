-- Diagnostic query to check source column values in mentions and relations
-- Run this in Supabase SQL Editor to see what values are actually stored

-- Check mentions source column distribution
SELECT 
    COALESCE(source, 'NULL') as source_value,
    COUNT(*) as count
FROM kg_entity_mentions
GROUP BY source
ORDER BY count DESC;

-- Check relations source column distribution  
SELECT 
    COALESCE(source, 'NULL') as source_value,
    COUNT(*) as count
FROM kg_relations
GROUP BY source
ORDER BY count DESC;

-- Check expert entity mentions count (by entity source_type)
SELECT COUNT(*) as mentions_via_entity_source_type
FROM kg_entity_mentions m
INNER JOIN kg_entities e ON m.entity_id = e.id
WHERE e.source_type = 'expert';

-- Check expert relations count (by entity source_type)
SELECT COUNT(DISTINCT r.id) as relations_via_entity_source_type
FROM kg_relations r
INNER JOIN kg_entities e1 ON r.source_entity_id = e1.id
INNER JOIN kg_entities e2 ON r.target_entity_id = e2.id
WHERE e1.source_type = 'expert' OR e2.source_type = 'expert';

-- Check mentions with source column filter
SELECT COUNT(*) as mentions_via_source_column
FROM kg_entity_mentions
WHERE source IN ('expert', 'lenny');

-- Check relations with source column filter
SELECT COUNT(*) as relations_via_source_column
FROM kg_relations
WHERE source IN ('expert', 'lenny');

-- Total counts (for comparison)
SELECT 
    (SELECT COUNT(*) FROM kg_entity_mentions) as total_mentions,
    (SELECT COUNT(*) FROM kg_relations) as total_relations,
    (SELECT COUNT(*) FROM kg_entities WHERE source_type = 'expert') as expert_entities;
