-- Intelligence Features Schema for Knowledge Graph
-- This script adds functions for pattern detection, missing links, and path finding
-- Run this in Supabase SQL Editor

-- =============================================================================
-- Pattern Detection: Find Recurring Problem+Solution Pairs
-- =============================================================================

-- Detect patterns where a problem is repeatedly solved by the same tool/pattern
CREATE OR REPLACE FUNCTION detect_problem_solution_patterns(
  p_min_occurrences INT DEFAULT 2,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  problem_id TEXT,
  problem_name TEXT,
  solution_id TEXT,
  solution_name TEXT,
  solution_type TEXT,
  occurrence_count BIGINT,
  confidence FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH problem_solutions AS (
    SELECT
      r.source_entity_id as problem_id,
      r.target_entity_id as solution_id,
      COUNT(*) as occurrence_count
    FROM kg_relations r
    JOIN kg_entities pe ON pe.id = r.source_entity_id
    JOIN kg_entities se ON se.id = r.target_entity_id
    WHERE r.relation_type = 'SOLVES'
      AND pe.entity_type = 'problem'
      AND se.entity_type IN ('tool', 'pattern')
    GROUP BY r.source_entity_id, r.target_entity_id
    HAVING COUNT(*) >= p_min_occurrences
  )
  SELECT
    ps.problem_id,
    pe.canonical_name as problem_name,
    ps.solution_id,
    se.canonical_name as solution_name,
    se.entity_type::TEXT as solution_type,
    ps.occurrence_count::BIGINT,
    -- Confidence: higher occurrence = higher confidence (capped at 1.0)
    LEAST(ps.occurrence_count::FLOAT / 5.0, 1.0)::FLOAT as confidence
  FROM problem_solutions ps
  JOIN kg_entities pe ON pe.id = ps.problem_id
  JOIN kg_entities se ON se.id = ps.solution_id
  ORDER BY ps.occurrence_count DESC, confidence DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Missing Link Detection: Find Entities That Should Connect But Don't
-- =============================================================================

-- Find entities that co-occur in messages but don't have explicit relations
CREATE OR REPLACE FUNCTION detect_missing_links(
  p_min_cooccurrences INT DEFAULT 3,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  entity_a_id TEXT,
  entity_a_name TEXT,
  entity_a_type TEXT,
  entity_b_id TEXT,
  entity_b_name TEXT,
  entity_b_type TEXT,
  cooccurrence_count BIGINT,
  suggested_relation TEXT,
  confidence FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH cooccurrences AS (
    SELECT
      m1.entity_id as entity_a_id,
      m2.entity_id as entity_b_id,
      COUNT(DISTINCT m1.message_id) as cooccurrence_count
    FROM kg_entity_mentions m1
    JOIN kg_entity_mentions m2 ON m1.message_id = m2.message_id
    WHERE m1.entity_id < m2.entity_id  -- Avoid duplicates
    GROUP BY m1.entity_id, m2.entity_id
    HAVING COUNT(DISTINCT m1.message_id) >= p_min_cooccurrences
  ),
  existing_relations AS (
    SELECT DISTINCT
      LEAST(source_entity_id, target_entity_id) as entity_a_id,
      GREATEST(source_entity_id, target_entity_id) as entity_b_id
    FROM kg_relations
  )
  SELECT
    c.entity_a_id,
    e1.canonical_name as entity_a_name,
    e1.entity_type::TEXT as entity_a_type,
    c.entity_b_id,
    e2.canonical_name as entity_b_name,
    e2.entity_type::TEXT as entity_b_type,
    c.cooccurrence_count::BIGINT,
    -- Suggest relation type based on entity types
    CASE
      WHEN e1.entity_type = 'problem' AND e2.entity_type IN ('tool', 'pattern') THEN 'SOLVES'
      WHEN e1.entity_type IN ('tool', 'pattern') AND e2.entity_type = 'problem' THEN 'SOLVES'
      WHEN e1.entity_type = 'tool' AND e2.entity_type = 'tool' THEN 'USED_WITH'
      WHEN e1.entity_type = 'pattern' AND e2.entity_type = 'pattern' THEN 'USED_WITH'
      WHEN e1.entity_type = 'concept' AND e2.entity_type IN ('tool', 'pattern') THEN 'IMPLEMENTS'
      ELSE 'USED_WITH'
    END::TEXT as suggested_relation,
    -- Confidence based on cooccurrence frequency
    LEAST(c.cooccurrence_count::FLOAT / 10.0, 1.0)::FLOAT as confidence
  FROM cooccurrences c
  JOIN kg_entities e1 ON e1.id = c.entity_a_id
  JOIN kg_entities e2 ON e2.id = c.entity_b_id
  LEFT JOIN existing_relations er ON 
    er.entity_a_id = LEAST(c.entity_a_id, c.entity_b_id) AND
    er.entity_b_id = GREATEST(c.entity_a_id, c.entity_b_id)
  WHERE er.entity_a_id IS NULL  -- Only entities without existing relations
  ORDER BY c.cooccurrence_count DESC, confidence DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Path Finding: Find Shortest Path Between Two Entities
-- =============================================================================

-- Find shortest path between two entities (max 5 hops)
CREATE OR REPLACE FUNCTION find_entity_path(
  p_source_entity_id TEXT,
  p_target_entity_id TEXT,
  p_max_depth INT DEFAULT 5
)
RETURNS TABLE (
  path_length INT,
  path_entities TEXT[],
  path_entity_names TEXT[],
  path_relations TEXT[],
  path_relation_types TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE paths AS (
    -- Base case: direct connections from source
    SELECT
      r.source_entity_id,
      r.target_entity_id,
      r.relation_type,
      ARRAY[r.source_entity_id, r.target_entity_id] as path_entities,
      ARRAY[r.relation_type] as path_relations,
      1 as depth
    FROM kg_relations r
    WHERE r.source_entity_id = p_source_entity_id
    
    UNION ALL
    
    -- Recursive case: extend paths
    SELECT
      p.source_entity_id,
      r.target_entity_id,
      r.relation_type,
      p.path_entities || r.target_entity_id,
      p.path_relations || r.relation_type,
      p.depth + 1
    FROM paths p
    JOIN kg_relations r ON r.source_entity_id = p.target_entity_id
    WHERE p.depth < p_max_depth
      AND NOT r.target_entity_id = ANY(p.path_entities)  -- Prevent cycles
      AND r.target_entity_id != p_source_entity_id  -- Don't loop back to start
  )
  SELECT
    p.depth as path_length,
    p.path_entities,
    -- Get entity names for path
    ARRAY(
      SELECT canonical_name FROM kg_entities WHERE id = ANY(p.path_entities)
    ) as path_entity_names,
    p.path_relations,
    p.path_relations as path_relation_types
  FROM paths p
  WHERE p.target_entity_id = p_target_entity_id
  ORDER BY p.depth ASC
  LIMIT 10;  -- Return up to 10 shortest paths
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =============================================================================
-- Entity Clusters: Find Communities of Related Entities
-- =============================================================================

-- Find entities that share many relations (communities/clusters)
CREATE OR REPLACE FUNCTION find_entity_clusters(
  p_min_shared_relations INT DEFAULT 2,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  entity_a_id TEXT,
  entity_a_name TEXT,
  entity_b_id TEXT,
  entity_b_name TEXT,
  shared_relations_count BIGINT,
  cluster_strength FLOAT
) AS $$
BEGIN
  RETURN QUERY
  WITH shared_relations AS (
    SELECT
      r1.source_entity_id as entity_a_id,
      r2.source_entity_id as entity_b_id,
      COUNT(DISTINCT r1.target_entity_id) as shared_relations_count
    FROM kg_relations r1
    JOIN kg_relations r2 ON r1.target_entity_id = r2.target_entity_id
    WHERE r1.source_entity_id < r2.source_entity_id  -- Avoid duplicates
    GROUP BY r1.source_entity_id, r2.source_entity_id
    HAVING COUNT(DISTINCT r1.target_entity_id) >= p_min_shared_relations
  )
  SELECT
    sr.entity_a_id,
    e1.canonical_name as entity_a_name,
    sr.entity_b_id,
    e2.canonical_name as entity_b_name,
    sr.shared_relations_count::BIGINT,
    -- Cluster strength: normalized by max possible shared relations
    LEAST(sr.shared_relations_count::FLOAT / 10.0, 1.0)::FLOAT as cluster_strength
  FROM shared_relations sr
  JOIN kg_entities e1 ON e1.id = sr.entity_a_id
  JOIN kg_entities e2 ON e2.id = sr.entity_b_id
  ORDER BY sr.shared_relations_count DESC, cluster_strength DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION detect_problem_solution_patterns(INT, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION detect_missing_links(INT, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION find_entity_path(UUID, UUID, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION find_entity_clusters(INT, INT) TO authenticated, anon;
