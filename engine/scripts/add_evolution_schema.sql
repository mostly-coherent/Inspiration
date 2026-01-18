-- Evolution Timeline Schema for Knowledge Graph
-- This script adds functions to aggregate entity mentions over time
-- Run this in Supabase SQL Editor

-- =============================================================================
-- RPC Functions for Temporal Aggregation
-- =============================================================================

-- Get entity mention counts aggregated by time period (day, week, month)
-- Returns: array of {period, count} for a given entity
CREATE OR REPLACE FUNCTION get_entity_evolution(
  p_entity_id TEXT,
  p_granularity TEXT DEFAULT 'month', -- 'day', 'week', 'month'
  p_limit INT DEFAULT 12
)
RETURNS TABLE (
  period TEXT,
  period_start TIMESTAMPTZ,
  mention_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE p_granularity
      WHEN 'day' THEN TO_CHAR(DATE_TRUNC('day', to_timestamp(m.message_timestamp / 1000)), 'YYYY-MM-DD')
      WHEN 'week' THEN TO_CHAR(DATE_TRUNC('week', to_timestamp(m.message_timestamp / 1000)), 'YYYY-"W"IW')
      WHEN 'month' THEN TO_CHAR(DATE_TRUNC('month', to_timestamp(m.message_timestamp / 1000)), 'YYYY-MM')
      ELSE TO_CHAR(DATE_TRUNC('month', to_timestamp(m.message_timestamp / 1000)), 'YYYY-MM')
    END AS period,
    DATE_TRUNC(
      CASE p_granularity
        WHEN 'day' THEN 'day'
        WHEN 'week' THEN 'week'
        WHEN 'month' THEN 'month'
        ELSE 'month'
      END,
      to_timestamp(m.message_timestamp / 1000)
    ) AS period_start,
    COUNT(*)::BIGINT AS mention_count
  FROM kg_entity_mentions m
  WHERE m.entity_id = p_entity_id
    AND m.message_timestamp IS NOT NULL
  GROUP BY period, period_start
  ORDER BY period_start DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get evolution for multiple entities (for comparison charts)
CREATE OR REPLACE FUNCTION get_entities_evolution(
  p_entity_ids TEXT[],
  p_granularity TEXT DEFAULT 'month',
  p_limit INT DEFAULT 12
)
RETURNS TABLE (
  entity_id TEXT,
  entity_name TEXT,
  entity_type TEXT,
  period TEXT,
  period_start TIMESTAMPTZ,
  mention_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    e.id AS entity_id,
    e.canonical_name AS entity_name,
    e.entity_type::TEXT AS entity_type,
    CASE p_granularity
      WHEN 'day' THEN TO_CHAR(DATE_TRUNC('day', to_timestamp(m.message_timestamp / 1000)), 'YYYY-MM-DD')
      WHEN 'week' THEN TO_CHAR(DATE_TRUNC('week', to_timestamp(m.message_timestamp / 1000)), 'YYYY-"W"IW')
      WHEN 'month' THEN TO_CHAR(DATE_TRUNC('month', to_timestamp(m.message_timestamp / 1000)), 'YYYY-MM')
      ELSE TO_CHAR(DATE_TRUNC('month', to_timestamp(m.message_timestamp / 1000)), 'YYYY-MM')
    END AS period,
    DATE_TRUNC(
      CASE p_granularity
        WHEN 'day' THEN 'day'
        WHEN 'week' THEN 'week'
        WHEN 'month' THEN 'month'
        ELSE 'month'
      END,
      to_timestamp(m.message_timestamp / 1000)
    ) AS period_start,
    COUNT(*)::BIGINT AS mention_count
  FROM kg_entity_mentions m
  JOIN kg_entities e ON e.id = m.entity_id
  WHERE m.entity_id = ANY(p_entity_ids)
    AND m.message_timestamp IS NOT NULL
  GROUP BY e.id, e.canonical_name, e.entity_type, period, period_start
  ORDER BY period_start DESC, e.canonical_name
  LIMIT p_limit * ARRAY_LENGTH(p_entity_ids, 1);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get trending entities (rising mentions over recent periods)
CREATE OR REPLACE FUNCTION get_trending_entities(
  p_entity_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 10,
  p_recent_periods INT DEFAULT 3, -- Compare recent N periods
  p_historical_periods INT DEFAULT 6 -- Against historical N periods
)
RETURNS TABLE (
  entity_id TEXT,
  entity_name TEXT,
  entity_type TEXT,
  recent_mentions BIGINT,
  historical_mentions BIGINT,
  trend_score FLOAT,
  trend_direction TEXT -- 'rising', 'stable', 'declining'
) AS $$
DECLARE
  recent_cutoff_ms BIGINT;
  historical_cutoff_ms BIGINT;
BEGIN
  -- Calculate time boundaries (using months as periods)
  -- Convert to milliseconds since epoch for comparison with BIGINT timestamp
  recent_cutoff_ms := EXTRACT(EPOCH FROM (DATE_TRUNC('month', NOW()) - (p_recent_periods || ' months')::INTERVAL))::BIGINT * 1000;
  historical_cutoff_ms := EXTRACT(EPOCH FROM (DATE_TRUNC('month', NOW()) - ((p_recent_periods + p_historical_periods) || ' months')::INTERVAL))::BIGINT * 1000;

  RETURN QUERY
  WITH mention_counts AS (
    SELECT
      e.id,
      e.canonical_name,
      e.entity_type,
      COUNT(*) FILTER (WHERE m.message_timestamp >= recent_cutoff_ms) AS recent_count,
      COUNT(*) FILTER (WHERE m.message_timestamp >= historical_cutoff_ms AND m.message_timestamp < recent_cutoff_ms) AS historical_count
    FROM kg_entities e
    LEFT JOIN kg_entity_mentions m ON e.id = m.entity_id
    WHERE (p_entity_type IS NULL OR e.entity_type = p_entity_type::entity_type)
    GROUP BY e.id, e.canonical_name, e.entity_type
    HAVING COUNT(*) > 0
  )
  SELECT
    mc.id::TEXT AS entity_id,
    mc.canonical_name AS entity_name,
    mc.entity_type::TEXT AS entity_type,
    mc.recent_count::BIGINT AS recent_mentions,
    mc.historical_count::BIGINT AS historical_mentions,
    -- Trend score: (recent - historical) / max(historical, 1) * 100
    -- Positive = rising, negative = declining
    CASE 
      WHEN mc.historical_count = 0 AND mc.recent_count > 0 THEN 100.0
      WHEN mc.historical_count = 0 THEN 0.0
      ELSE ((mc.recent_count::FLOAT - mc.historical_count::FLOAT) / mc.historical_count::FLOAT) * 100.0
    END::FLOAT AS trend_score,
    CASE
      WHEN mc.recent_count > mc.historical_count * 1.2 THEN 'rising'
      WHEN mc.recent_count < mc.historical_count * 0.8 THEN 'declining'
      ELSE 'stable'
    END::TEXT AS trend_direction
  FROM mention_counts mc
  ORDER BY 
    -- Prioritize rising entities with significant recent activity
    CASE WHEN mc.recent_count > mc.historical_count * 1.2 THEN 0 ELSE 1 END,
    trend_score DESC,
    mc.recent_count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get overall activity timeline (all entities aggregated)
CREATE OR REPLACE FUNCTION get_kg_activity_timeline(
  p_granularity TEXT DEFAULT 'month',
  p_limit INT DEFAULT 12
)
RETURNS TABLE (
  period TEXT,
  period_start TIMESTAMPTZ,
  total_mentions BIGINT,
  unique_entities BIGINT,
  new_entities BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH periods AS (
    SELECT
      CASE p_granularity
        WHEN 'day' THEN TO_CHAR(DATE_TRUNC('day', to_timestamp(m.message_timestamp / 1000)), 'YYYY-MM-DD')
        WHEN 'week' THEN TO_CHAR(DATE_TRUNC('week', to_timestamp(m.message_timestamp / 1000)), 'YYYY-"W"IW')
        WHEN 'month' THEN TO_CHAR(DATE_TRUNC('month', to_timestamp(m.message_timestamp / 1000)), 'YYYY-MM')
        ELSE TO_CHAR(DATE_TRUNC('month', to_timestamp(m.message_timestamp / 1000)), 'YYYY-MM')
      END AS period,
      DATE_TRUNC(
        CASE p_granularity
          WHEN 'day' THEN 'day'
          WHEN 'week' THEN 'week'
          WHEN 'month' THEN 'month'
          ELSE 'month'
        END,
        to_timestamp(m.message_timestamp / 1000)
      ) AS period_start,
      COUNT(*) AS total_mentions,
      COUNT(DISTINCT m.entity_id) AS unique_entities
    FROM kg_entity_mentions m
    WHERE m.message_timestamp IS NOT NULL
    GROUP BY period, period_start
  ),
  new_entity_counts AS (
    SELECT
      CASE p_granularity
        WHEN 'day' THEN TO_CHAR(DATE_TRUNC('day', e.first_seen), 'YYYY-MM-DD')
        WHEN 'week' THEN TO_CHAR(DATE_TRUNC('week', e.first_seen), 'YYYY-"W"IW')
        WHEN 'month' THEN TO_CHAR(DATE_TRUNC('month', e.first_seen), 'YYYY-MM')
        ELSE TO_CHAR(DATE_TRUNC('month', e.first_seen), 'YYYY-MM')
      END AS period,
      COUNT(*) AS new_entities
    FROM kg_entities e
    WHERE e.first_seen IS NOT NULL
    GROUP BY period
  )
  SELECT
    p.period,
    p.period_start,
    p.total_mentions,
    p.unique_entities,
    COALESCE(n.new_entities, 0)::BIGINT AS new_entities
  FROM periods p
  LEFT JOIN new_entity_counts n ON p.period = n.period
  ORDER BY p.period_start DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_entity_evolution(TEXT, TEXT, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_entities_evolution(TEXT[], TEXT, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_trending_entities(TEXT, INT, INT, INT) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION get_kg_activity_timeline(TEXT, INT) TO authenticated, anon;
