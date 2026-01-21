-- Remove User Conversations Manually
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/YOUR_PROJECT/sql

-- Option 1: Delete all user conversations (recommended)
DELETE FROM kg_conversations 
WHERE source_type = 'user';

-- Option 2: Verify first, then delete
-- Step 1: Check what will be deleted
SELECT id, conversation_id, source_type, created_at 
FROM kg_conversations 
WHERE source_type = 'user'
LIMIT 10;

-- Step 2: Count how many will be deleted
SELECT COUNT(*) as user_conversations_count
FROM kg_conversations 
WHERE source_type = 'user';

-- Step 3: Delete (only run after verifying above)
DELETE FROM kg_conversations 
WHERE source_type = 'user';

-- Option 3: Delete in batches (if RLS policies block bulk delete)
-- Run this multiple times until COUNT returns 0
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    WITH deleted AS (
        DELETE FROM kg_conversations 
        WHERE id IN (
            SELECT id FROM kg_conversations 
            WHERE source_type = 'user' 
            LIMIT 100
        )
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;
    
    RAISE NOTICE 'Deleted % user conversations', deleted_count;
END $$;
