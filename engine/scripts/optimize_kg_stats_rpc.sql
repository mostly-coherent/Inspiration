-- Optimized RPC Functions for KG Stats with Source Filtering
-- This replaces the need for multiple client-side queries
-- Run this in Supabase SQL Editor

-- ============================================================================
-- Optimized RPC: Get KG Stats by Source Type
-- ============================================================================

CREATE OR REPLACE FUNCTION get_kg_stats_by_source_type(p_source_type TEXT DEFAULT 'all')
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result JSON;
    v_total_entities INT;
    v_total_mentions INT;
    v_total_relations INT;
    v_by_type JSON;
    v_indexed BOOLEAN;
BEGIN
    -- Count entities based on source_type
    CASE p_source_type
        WHEN 'user' THEN
            SELECT COUNT(*)::int INTO v_total_entities FROM kg_entities WHERE source_type = 'user';
        WHEN 'expert' THEN
            SELECT COUNT(*)::int INTO v_total_entities FROM kg_entities WHERE source_type = 'expert';
        WHEN 'both' THEN
            SELECT COUNT(*)::int INTO v_total_entities FROM kg_entities WHERE source_type = 'both';
        ELSE
            SELECT COUNT(*)::int INTO v_total_entities FROM kg_entities;
    END CASE;

    -- Count mentions based on source_type
    -- Use entity source_type (more reliable than mentions.source column)
    CASE p_source_type
        WHEN 'user' THEN
            -- Count mentions for user entities
            -- Try source column first, then fallback to entity source_type
            SELECT COUNT(*)::int INTO v_total_mentions
            FROM kg_entity_mentions m
            WHERE m.source = 'user'
               OR EXISTS (
                   SELECT 1 FROM kg_entities e 
                   WHERE e.id = m.entity_id AND e.source_type = 'user'
               );
        WHEN 'expert' THEN
            -- Count mentions for expert/Lenny sources
            -- Include 'lenny', 'expert', and 'unknown' (likely from Lenny's data)
            -- Also include mentions linked to expert entities if source is not 'user'
            SELECT COUNT(*)::int INTO v_total_mentions
            FROM kg_entity_mentions m
            WHERE m.source IN ('expert', 'lenny', 'unknown')
               OR EXISTS (
                   SELECT 1 FROM kg_entities e 
                   WHERE e.id = m.entity_id 
                     AND e.source_type = 'expert'
                     AND (m.source IS NULL OR m.source NOT IN ('user'))
               );
        WHEN 'both' THEN
            -- Count mentions for entities with source_type = 'both'
            SELECT COUNT(*)::int INTO v_total_mentions
            FROM kg_entity_mentions m
            INNER JOIN kg_entities e ON m.entity_id = e.id
            WHERE e.source_type = 'both';
        ELSE
            SELECT COUNT(*)::int INTO v_total_mentions FROM kg_entity_mentions;
    END CASE;

    -- Count relations based on source_type
    -- Use entity source_type (more reliable than relations.source column)
    CASE p_source_type
        WHEN 'user' THEN
            -- Count relations for user entities
            -- Try source column first, then fallback to entity source_type
            SELECT COUNT(DISTINCT r.id)::int INTO v_total_relations
            FROM kg_relations r
            WHERE r.source = 'user'
               OR EXISTS (
                   SELECT 1 FROM kg_entities e1, kg_entities e2
                   WHERE e1.id = r.source_entity_id 
                     AND e2.id = r.target_entity_id
                     AND (e1.source_type = 'user' OR e2.source_type = 'user')
               );
        WHEN 'expert' THEN
            -- Count relations for expert/Lenny sources
            -- Include 'lenny', 'expert', and 'unknown' (likely from Lenny's data)
            -- Also include relations linked to expert entities if source is not 'user'
            SELECT COUNT(DISTINCT r.id)::int INTO v_total_relations
            FROM kg_relations r
            WHERE r.source IN ('expert', 'lenny', 'unknown')
               OR EXISTS (
                   SELECT 1 FROM kg_entities e1, kg_entities e2
                   WHERE e1.id = r.source_entity_id 
                     AND e2.id = r.target_entity_id
                     AND (e1.source_type = 'expert' OR e2.source_type = 'expert')
                     AND (r.source IS NULL OR r.source NOT IN ('user'))
               );
        WHEN 'both' THEN
            -- Count relations where either source or target entity is "both"
            SELECT COUNT(DISTINCT r.id)::int INTO v_total_relations
            FROM kg_relations r
            INNER JOIN kg_entities e1 ON r.source_entity_id = e1.id
            INNER JOIN kg_entities e2 ON r.target_entity_id = e2.id
            WHERE e1.source_type = 'both' OR e2.source_type = 'both';
        ELSE
            SELECT COUNT(*)::int INTO v_total_relations FROM kg_relations;
    END CASE;

    -- Get byType breakdown
    CASE p_source_type
        WHEN 'user' THEN
            SELECT COALESCE(json_object_agg(entity_type::text, count), '{}'::json) INTO v_by_type
            FROM (
                SELECT entity_type, COUNT(*)::int as count
                FROM kg_entities
                WHERE source_type = 'user'
                GROUP BY entity_type
            ) sub;
        WHEN 'expert' THEN
            SELECT COALESCE(json_object_agg(entity_type::text, count), '{}'::json) INTO v_by_type
            FROM (
                SELECT entity_type, COUNT(*)::int as count
                FROM kg_entities
                WHERE source_type = 'expert'
                GROUP BY entity_type
            ) sub;
        WHEN 'both' THEN
            SELECT COALESCE(json_object_agg(entity_type::text, count), '{}'::json) INTO v_by_type
            FROM (
                SELECT entity_type, COUNT(*)::int as count
                FROM kg_entities
                WHERE source_type = 'both'
                GROUP BY entity_type
            ) sub;
        ELSE
            SELECT COALESCE(json_object_agg(entity_type::text, count), '{}'::json) INTO v_by_type
            FROM (
                SELECT entity_type, COUNT(*)::int as count
                FROM kg_entities
                GROUP BY entity_type
            ) sub;
    END CASE;

    -- Check if indexed
    v_indexed := v_total_entities > 0;

    -- Build result JSON
    SELECT json_build_object(
        'totalEntities', v_total_entities,
        'totalMentions', v_total_mentions,
        'totalRelations', v_total_relations,
        'byType', v_by_type,
        'indexed', v_indexed
    ) INTO result;
    
    RETURN result;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_kg_stats_by_source_type(TEXT) TO anon;
GRANT EXECUTE ON FUNCTION get_kg_stats_by_source_type(TEXT) TO authenticated;

-- ============================================================================
-- Verification
-- ============================================================================

-- Test the function:
-- SELECT get_kg_stats_by_source_type('all');
-- SELECT get_kg_stats_by_source_type('user');
-- SELECT get_kg_stats_by_source_type('expert');
-- SELECT get_kg_stats_by_source_type('both');
