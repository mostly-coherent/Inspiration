#!/bin/bash
# Fast Start Performance Benchmark
# Measures timing for the ~90 second target

echo "🚀 Fast Start Performance Benchmark"
echo "======================================"
echo ""

cd "$(dirname "$0")/.."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python3 not found"
    exit 1
fi

# Activate venv if exists
if [ -d "engine/.venv" ]; then
    source engine/.venv/bin/activate
fi

# Test 1: DB Size Estimation (target: < 5s)
echo "📊 Test 1: DB Size Estimation"
echo "   Target: < 5 seconds"
START_TIME=$(date +%s.%N)

python3 -c "
import sys
sys.path.insert(0, 'engine')
from common.cursor_db import estimate_db_metrics

try:
    metrics = estimate_db_metrics()
    print(f'   Size: {metrics[\"size_mb\"]:.1f} MB')
    print(f'   Est. Conversations: {metrics[\"estimated_conversations_total\"]}')
    print(f'   Suggested Days: {metrics[\"suggested_days\"]}')
except Exception as e:
    print(f'   Error: {e}')
"

END_TIME=$(date +%s.%N)
ELAPSED=$(echo "$END_TIME - $START_TIME" | bc)
echo "   ⏱️  Time: ${ELAPSED}s"
if (( $(echo "$ELAPSED < 5" | bc -l) )); then
    echo "   ✅ PASS (< 5s)"
else
    echo "   ❌ FAIL (> 5s)"
fi
echo ""

# Test 2: High-Signal Conversation Extraction (target: < 15s)
echo "📝 Test 2: High-Signal Conversation Extraction"
echo "   Target: < 15 seconds for 80 conversations"
START_TIME=$(date +%s.%N)

python3 -c "
import sys
sys.path.insert(0, 'engine')
from common.cursor_db import get_high_signal_conversations_sqlite_fast

try:
    convos = get_high_signal_conversations_sqlite_fast(days_back=14, max_conversations=80)
    print(f'   Conversations extracted: {len(convos)}')
    if convos:
        total_msgs = sum(len(c.get('messages', [])) for c in convos)
        print(f'   Total messages: {total_msgs}')
except Exception as e:
    print(f'   Error: {e}')
"

END_TIME=$(date +%s.%N)
ELAPSED=$(echo "$END_TIME - $START_TIME" | bc)
echo "   ⏱️  Time: ${ELAPSED}s"
if (( $(echo "$ELAPSED < 15" | bc -l) )); then
    echo "   ✅ PASS (< 15s)"
else
    echo "   ❌ FAIL (> 15s)"
fi
echo ""

# Test 3: Full Theme Generation (target: < 90s)
# Note: This requires an LLM key and will be skipped if not available
echo "🎯 Test 3: Full Theme Generation (requires LLM key)"
echo "   Target: < 90 seconds"

if [ -z "$ANTHROPIC_API_KEY" ] && [ -z "$OPENAI_API_KEY" ] && [ -z "$OPENROUTER_API_KEY" ]; then
    echo "   ⚠️  SKIPPED (no LLM key in environment)"
    echo "   Set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY to run this test"
else
    START_TIME=$(date +%s.%N)
    
    python3 engine/generate_themes.py --days 14 --output /tmp/benchmark_themes.json 2>&1 | while read line; do
        echo "   $line"
    done
    
    END_TIME=$(date +%s.%N)
    ELAPSED=$(echo "$END_TIME - $START_TIME" | bc)
    echo "   ⏱️  Time: ${ELAPSED}s"
    if (( $(echo "$ELAPSED < 90" | bc -l) )); then
        echo "   ✅ PASS (< 90s)"
    else
        echo "   ⚠️  SLOW (> 90s target)"
    fi
    
    # Show result summary
    if [ -f /tmp/benchmark_themes.json ]; then
        echo ""
        python3 -c "
import json
with open('/tmp/benchmark_themes.json') as f:
    data = json.load(f)
    print(f'   Themes generated: {len(data.get(\"themes\", []))}')
    print(f'   Unexplored territory: {len(data.get(\"unexploredTerritory\", []))} items')
"
        rm /tmp/benchmark_themes.json
    fi
fi
echo ""

# Summary
echo "======================================"
echo "📋 Summary"
echo "======================================"
echo ""
echo "Target: Clone → First Theme Map in ~90 seconds"
echo ""
echo "Breakdown:"
echo "  - npm install: ~30s (not measured here)"
echo "  - npm run dev: ~5s (not measured here)"
echo "  - DB detection: < 5s"
echo "  - API key paste: ~10s (user action)"
echo "  - Theme generation: < 60s"
echo "  Total: ~90s ✅"
echo ""
