#!/bin/bash

# Monitor Lenny KG Indexing Progress
# Usage: ./monitor_lenny_kg.sh

echo "🔍 Lenny KG Indexing Monitor"
echo "==========================================="
echo ""

# Check if indexing process is running
if pgrep -f "index_lenny_kg_parallel.py" > /dev/null; then
    echo "✅ Status: RUNNING"
    
    # Show log file location
    LOG_FILE=$(ls -t /tmp/lenny_kg_full_build_*.log 2>/dev/null | head -1)
    if [ -n "$LOG_FILE" ]; then
        echo "📄 Log: $LOG_FILE"
        echo ""
        echo "📊 Latest log entries:"
        tail -20 "$LOG_FILE"
    fi
else
    echo "⏸️  Status: NOT RUNNING"
    echo ""
    echo "To start indexing:"
    echo "  cd <project-root>"
    echo "  caffeinate -s python3 engine/scripts/index_lenny_kg_parallel.py --with-relations --workers 4 > /tmp/lenny_kg_full_build_\$(date +%Y%m%d_%H%M%S).log 2>&1 &"
fi

echo ""
echo "==========================================="
echo ""
echo "📈 Current KG Stats:"
python3 check_kg_progress.py

echo ""
echo "To check again: ./monitor_lenny_kg.sh"
echo "To stop indexing: pkill -f index_lenny_kg_parallel.py"
