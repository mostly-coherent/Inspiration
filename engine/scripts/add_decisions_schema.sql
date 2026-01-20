-- Migration: Add kg_decisions table for storing decision points
-- Purpose: Phase 1b - Store decision points extracted from user chat history
-- Date: 2026-01-18

-- ============================================================================
-- kg_decisions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS kg_decisions (
    id TEXT PRIMARY KEY,
    
    -- Decision content
    decision_text TEXT NOT NULL,
    decision_type TEXT NOT NULL, -- "TECHNOLOGY_CHOICE", "ARCHITECTURE", "DEPENDENCY", "ASSUMPTION"
    confidence FLOAT NOT NULL DEFAULT 1.0,
    
    -- Context
    context_snippet TEXT,
    alternatives_considered TEXT[], -- Array of alternative options considered
    rationale TEXT,
    
    -- Source tracking
    source_chat_id TEXT NOT NULL, -- Which conversation this decision came from
    message_timestamp BIGINT NOT NULL, -- When the decision was made
    
    -- Trace ID linking (for code connections)
    trace_ids TEXT[], -- Array of trace IDs from code comments (# @trace-id: ...)
    
    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for kg_decisions
CREATE INDEX IF NOT EXISTS idx_kg_decisions_chat ON kg_decisions(source_chat_id);
CREATE INDEX IF NOT EXISTS idx_kg_decisions_type ON kg_decisions(decision_type);
CREATE INDEX IF NOT EXISTS idx_kg_decisions_timestamp ON kg_decisions(message_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_kg_decisions_trace_ids ON kg_decisions USING GIN(trace_ids);

-- Trigger for updated_at
CREATE TRIGGER update_kg_decisions_updated_at
    BEFORE UPDATE ON kg_decisions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Enable Row Level Security (RLS)
-- ============================================================================

ALTER TABLE kg_decisions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow anon read kg_decisions"
ON kg_decisions FOR SELECT TO anon USING (true);

CREATE POLICY "Allow anon insert kg_decisions"
ON kg_decisions FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Allow anon update kg_decisions"
ON kg_decisions FOR UPDATE TO anon WITH CHECK (true);

CREATE POLICY "Allow anon delete kg_decisions"
ON kg_decisions FOR DELETE TO anon USING (true);

CREATE POLICY "Allow authenticated read kg_decisions"
ON kg_decisions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Allow authenticated insert kg_decisions"
ON kg_decisions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated update kg_decisions"
ON kg_decisions FOR UPDATE TO authenticated WITH CHECK (true);

CREATE POLICY "Allow authenticated delete kg_decisions"
ON kg_decisions FOR DELETE TO authenticated USING (true);
