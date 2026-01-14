#!/bin/bash
# Quick status checker for Lenny indexing

echo "🎙️ Lenny Indexing Status"
echo "========================"
echo ""

# Check if running
if pgrep -f "index_lenny_local.py" > /dev/null; then
    echo "Status: ✅ Running"
else
    echo "Status: ❌ Stopped"
fi

echo ""

# Show recent progress
echo "Recent progress:"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
tail -5 "$SCRIPT_DIR/data/lenny_index.log" 2>/dev/null | grep "Batch" | tail -3 || echo "No log file found"

echo ""

# Calculate ETA
current=$(tail -10 "$SCRIPT_DIR/data/lenny_index.log" 2>/dev/null | grep "Batch" | tail -1 | grep -o "Batch [0-9]*" | awk '{print $2}' | cut -d'/' -f1)

if [ ! -z "$current" ]; then
    remaining=$((888 - current))
    echo "Progress: $current/888 batches"
    echo "Remaining: $remaining batches"
    
    if [ $current -lt 758 ]; then
        echo "Phase: Cached (fast)"
        to_problem=$((758 - current))
        eta_min=$(($to_problem / 20 + 65))
        echo "ETA: ~$eta_min minutes"
    else
        echo "Phase: API rate-limited (slow)"
        eta_min=$(($remaining / 2))
        echo "ETA: ~$eta_min minutes"
    fi
fi

echo ""
echo "Commands:"
echo "  Pause:  pkill -TERM -f 'index_lenny_local.py'"
echo "  Resume: cd engine && caffeinate -i python3 scripts/index_lenny_local.py --batch-size 50 > ../data/lenny_index.log 2>&1 &"
