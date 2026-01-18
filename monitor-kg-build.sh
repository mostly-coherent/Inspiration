#!/bin/bash

# Monitor Lenny's KG Baseline Build
# Usage: ./monitor-kg-build.sh

echo "=" * 70
echo "🔍 Monitoring Lenny's KG Baseline Build"
echo "=" * 70
echo ""

# Check if process is running
if ps aux | grep "index_lenny_kg_parallel.py" | grep -v grep > /dev/null; then
    echo "✅ Process Status: RUNNING"
    PID=$(ps aux | grep "index_lenny_kg_parallel.py" | grep -v grep | awk '{print $2}')
    echo "   PID: $PID"
else
    echo "❌ Process Status: NOT RUNNING"
    echo "   Check logs for completion or errors"
fi

echo ""
echo "📊 Database Status:"
# Use script's directory as base (works from any location)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
python3 engine/scripts/check_kg_status_simple.py

echo ""
echo "📝 Recent Log Lines:"
tail -15 /tmp/lenny_kg_baseline_20260116_142004.log

echo ""
echo "=" * 70
echo "💡 Commands:"
echo "=" * 70
echo "  Watch logs:  tail -f /tmp/lenny_kg_baseline_20260116_142004.log"
echo "  Check status: python3 engine/scripts/check_kg_status_simple.py"
echo "  Kill process: kill $(cat /tmp/lenny_kg_job.pid)"
echo ""
