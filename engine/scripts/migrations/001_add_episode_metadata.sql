-- Migration: Add Episode Metadata for Provenance Tracking
-- Purpose: Store YouTube URLs, episode titles, guest names for KG mention sources
-- Date: 2026-01-16
-- Part of: KG Hardening Plan Phase 2 (Provenance)

-- ============================================================================
-- Create kg_episode_metadata table
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_episode_metadata (
    -- Primary key: slug derived from guest name
    episode_slug TEXT PRIMARY KEY,
    
    -- Episode details
    guest_name TEXT NOT NULL,
    episode_title TEXT,
    description TEXT,
    
    -- Video metadata
    youtube_url TEXT,
    video_id TEXT,
    channel TEXT DEFAULT 'Lenny''s Podcast',
    
    -- Duration
    duration_seconds INT,
    duration_human TEXT,  -- e.g., "1:23:45"
    
    -- Engagement metrics (optional)
    view_count BIGINT,
    published_date DATE,
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- Indexes for fast lookups
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_kg_episode_slug 
    ON kg_episode_metadata(episode_slug);

CREATE INDEX IF NOT EXISTS idx_kg_episode_guest 
    ON kg_episode_metadata(guest_name);

CREATE INDEX IF NOT EXISTS idx_kg_episode_published 
    ON kg_episode_metadata(published_date DESC);

-- ============================================================================
-- Row Level Security (RLS)
-- ============================================================================

ALTER TABLE kg_episode_metadata ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to read episode metadata
CREATE POLICY "Allow anon read kg_episode_metadata"
    ON kg_episode_metadata 
    FOR SELECT 
    TO anon 
    USING (true);

-- Allow anonymous users to insert episode metadata
CREATE POLICY "Allow anon insert kg_episode_metadata"
    ON kg_episode_metadata 
    FOR INSERT 
    TO anon 
    WITH CHECK (true);

-- Allow anonymous users to update episode metadata
CREATE POLICY "Allow anon update kg_episode_metadata"
    ON kg_episode_metadata 
    FOR UPDATE 
    TO anon 
    USING (true);

-- ============================================================================
-- Trigger for updated_at timestamp
-- ============================================================================

-- Create trigger function if it doesn't exist
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to kg_episode_metadata
DROP TRIGGER IF EXISTS update_kg_episode_metadata_updated_at ON kg_episode_metadata;

CREATE TRIGGER update_kg_episode_metadata_updated_at
    BEFORE UPDATE ON kg_episode_metadata
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Helper RPC Function: Get Mention Sources with Metadata
-- ============================================================================

CREATE OR REPLACE FUNCTION get_mention_sources_enriched(mention_ids TEXT[])
RETURNS TABLE (
    mention_id TEXT,
    entity_id TEXT,
    message_id TEXT,
    context_snippet TEXT,
    message_timestamp BIGINT,
    
    -- Episode metadata
    episode_slug TEXT,
    guest_name TEXT,
    episode_title TEXT,
    youtube_url TEXT,
    duration_human TEXT,
    published_date DATE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        m.id as mention_id,
        m.entity_id,
        m.message_id,
        m.context_snippet,
        m.message_timestamp,
        
        -- Extract slug from message_id: "lenny-ada-chen-rekhi-142" → "ada-chen-rekhi"
        substring(m.message_id from 'lenny-(.+)-\d+$') as episode_slug,
        e.guest_name,
        e.episode_title,
        e.youtube_url,
        e.duration_human,
        e.published_date
    FROM kg_entity_mentions m
    LEFT JOIN kg_episode_metadata e
        ON substring(m.message_id from 'lenny-(.+)-\d+$') = e.episode_slug
    WHERE m.id = ANY(mention_ids);
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION get_mention_sources_enriched(TEXT[]) TO anon;
GRANT EXECUTE ON FUNCTION get_mention_sources_enriched(TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_mention_sources_enriched(TEXT[]) TO service_role;

-- ============================================================================
-- Verification Queries
-- ============================================================================

-- After running this migration, verify with:
-- 
-- 1. Check table exists:
--    SELECT * FROM kg_episode_metadata LIMIT 1;
--
-- 2. Check RPC function works:
--    SELECT * FROM get_mention_sources_enriched(ARRAY['mention-id-here']);
--
-- 3. Check indexes exist:
--    SELECT indexname FROM pg_indexes WHERE tablename = 'kg_episode_metadata';

-- ============================================================================
-- Rollback (if needed)
-- ============================================================================

-- To rollback this migration:
-- 
-- DROP FUNCTION IF EXISTS get_mention_sources_enriched(TEXT[]);
-- DROP TRIGGER IF EXISTS update_kg_episode_metadata_updated_at ON kg_episode_metadata;
-- DROP TABLE IF EXISTS kg_episode_metadata CASCADE;
