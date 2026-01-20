-- Entity Degree (Relationship Count) Function for Knowledge Graph
-- This function computes the degree centrality (number of relationships) for each entity
-- Run this in Supabase SQL Editor

-- =============================================================================
-- RPC Function: Get Entity Degrees
-- =============================================================================

-- Get degree (relationship count) for all entities
-- Returns: array of {entity_id, degree} where degree = number of relationships
CREATE OR REPLACE FUNCTION get_entity_degrees()
RETURNS TABLE (
  entity_id TEXT,
  degree BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH source_counts AS (
    SELECT source_entity_id AS entity_id, COUNT(*)::BIGINT AS cnt
    FROM kg_relations
    WHERE source_entity_id IS NOT NULL
    GROUP BY source_entity_id
  ),
  target_counts AS (
    SELECT target_entity_id AS entity_id, COUNT(*)::BIGINT AS cnt
    FROM kg_relations
    WHERE target_entity_id IS NOT NULL
    GROUP BY target_entity_id
  ),
  combined_counts AS (
    SELECT 
      COALESCE(s.entity_id, t.entity_id) AS entity_id,
      COALESCE(s.cnt, 0) + COALESCE(t.cnt, 0) AS total_degree
    FROM source_counts s
    FULL OUTER JOIN target_counts t ON s.entity_id = t.entity_id
  )
  SELECT 
    entity_id,
    total_degree AS degree
  FROM combined_counts
  WHERE total_degree > 0
  ORDER BY total_degree DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_entity_degrees() TO authenticated, anon;
