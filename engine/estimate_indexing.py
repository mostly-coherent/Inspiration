#!/usr/bin/env python3
"""
Estimate indexing time and cost without actually indexing.

Usage:
    python estimate_indexing.py --size-mb 3000
"""

import argparse
import json
import sys
from pathlib import Path
from datetime import datetime, timedelta

sys.path.insert(0, str(Path(__file__).parent))

from common.cursor_db import get_cursor_db_path, _open_db_safe, _close_db_safe
import sqlite3


def estimate_indexing(size_mb: float) -> dict:
    """
    Estimate indexing time and cost without actually indexing.
    
    Returns:
        {
            "time_minutes": int,
            "cost_usd": float,
            "messages": int,
            "date_range": str,
            "coverage_months": int
        }
    """
    try:
        db_path = get_cursor_db_path()
        conn = _open_db_safe(db_path)
        cursor = conn.cursor()
        
        # Get total message count
        cursor.execute("""
            SELECT COUNT(*) FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%' OR key LIKE 'chatData:%'
        """)
        total_conversations = cursor.fetchone()[0]
        
        # Estimate average size per conversation
        cursor.execute("""
            SELECT SUM(LENGTH(value)) FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%' OR key LIKE 'chatData:%'
        """)
        total_size_result = cursor.fetchone()[0]
        total_size_mb = (total_size_result or 0) / (1024 * 1024)
        
        _close_db_safe(conn)
        
        if total_size_mb == 0:
            return {
                "error": "Could not estimate total size",
                "time_minutes": 0,
                "cost_usd": 0.0,
                "messages": 0,
                "date_range": "Unknown",
                "coverage_months": 0
            }
        
        # Calculate target message count based on size_mb
        # Approximate: messages_per_mb = total_conversations / total_size_mb
        messages_per_mb = total_conversations / total_size_mb if total_size_mb > 0 else 0
        target_messages = int(messages_per_mb * size_mb)
        
        # Estimate time (based on embedding throughput)
        # OpenAI API: ~1000 messages/second in batches
        embedding_rate = 1000  # messages/sec
        indexing_time_sec = target_messages / embedding_rate if target_messages > 0 else 0
        
        # Add overhead for DB operations (20%)
        indexing_time_sec *= 1.2
        
        # Estimate cost (OpenAI embeddings)
        # text-embedding-3-small: $0.00002 per 1K tokens
        # Assume avg 200 tokens per message
        avg_tokens_per_message = 200
        total_tokens = target_messages * avg_tokens_per_message
        cost_per_1k_tokens = 0.00002
        cost = (total_tokens / 1000) * cost_per_1k_tokens
        
        # Estimate date coverage (rough approximation)
        # Assume relatively even distribution over time
        coverage_ratio = size_mb / total_size_mb if total_size_mb > 0 else 0
        # Get date range from DB
        conn = _open_db_safe(db_path)
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT value FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%' OR key LIKE 'chatData:%'
            ORDER BY key DESC
            LIMIT 1
        """)
        latest_row = cursor.fetchone()
        
        cursor.execute("""
            SELECT value FROM cursorDiskKV 
            WHERE key LIKE 'composerData:%' OR key LIKE 'chatData:%'
            ORDER BY key ASC
            LIMIT 1
        """)
        earliest_row = cursor.fetchone()
        
        _close_db_safe(conn)
        
        # Parse timestamps
        import re
        ts_pattern = re.compile(r'"(?:lastUpdatedAt|createdAt|timestamp)":\s*(\d{10,13})')
        
        latest_ts = 0
        earliest_ts = 0
        
        if latest_row and latest_row[0]:
            val_str = latest_row[0]
            if isinstance(val_str, bytes):
                val_str = val_str.decode('utf-8', errors='ignore')
            match = ts_pattern.search(val_str)
            if match:
                latest_ts = int(match.group(1))
                if latest_ts < 10000000000:
                    latest_ts *= 1000
        
        if earliest_row and earliest_row[0]:
            val_str = earliest_row[0]
            if isinstance(val_str, bytes):
                val_str = val_str.decode('utf-8', errors='ignore')
            match = ts_pattern.search(val_str)
            if match:
                earliest_ts = int(match.group(1))
                if earliest_ts < 10000000000:
                    earliest_ts *= 1000
        
        if latest_ts > 0 and earliest_ts > 0:
            # Ensure timestamps are in correct order (earliest < latest)
            if earliest_ts > latest_ts:
                earliest_ts, latest_ts = latest_ts, earliest_ts
            
            total_days = (latest_ts - earliest_ts) / (1000 * 60 * 60 * 24)
            coverage_days = total_days * coverage_ratio
            
            # Get base dates
            latest_date = datetime.fromtimestamp(latest_ts / 1000)
            earliest_date = datetime.fromtimestamp(earliest_ts / 1000)
            
            # Ensure dates are valid (not in future, not before 2020)
            now = datetime.now()
            min_date = datetime(2020, 1, 1)
            
            # Clamp latest_date to now if needed
            if latest_date > now:
                latest_date = now
            
            # Clamp earliest_date to min_date if needed
            if earliest_date < min_date:
                earliest_date = min_date
            
            # Calculate date range based on coverage
            if coverage_ratio >= 0.99:  # 100% coverage (with small tolerance for rounding)
                # Use full range
                start_date = earliest_date
                end_date = latest_date
            else:
                # Partial coverage: from (latest - coverage_days) to latest
                end_date = latest_date
                start_date = end_date - timedelta(days=coverage_days)
                
                # Ensure start_date doesn't go before earliest_date
                if start_date < earliest_date:
                    start_date = earliest_date
                
                # Ensure start_date doesn't go before min_date
                if start_date < min_date:
                    start_date = min_date
            
            # Calculate coverage_months from actual date range
            actual_days = (end_date - start_date).days
            coverage_months = max(1, int(actual_days / 30))
            
            # Format date range (start to end)
            date_range = f"{start_date.strftime('%b %Y')} - {end_date.strftime('%b %Y')}"
        else:
            coverage_months = max(1, int((size_mb / 400)))  # Rough estimate: 400MB per month
            date_range = "Unknown"
        
        return {
            "time_minutes": max(1, int(indexing_time_sec / 60)),
            "cost_usd": round(cost, 2),
            "messages": target_messages,
            "date_range": date_range,
            "coverage_months": coverage_months
        }
        
    except Exception as e:
        return {
            "error": str(e),
            "time_minutes": 0,
            "cost_usd": 0.0,
            "messages": 0,
            "date_range": "Unknown",
            "coverage_months": 0
        }


def main():
    parser = argparse.ArgumentParser(description="Estimate indexing time and cost")
    parser.add_argument("--size-mb", type=float, required=True, help="Size to index in MB")
    args = parser.parse_args()

    result = estimate_indexing(args.size_mb)
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
