"""
Database Health Check & Schema Diagnostics

Detects Cursor database schema changes and provides actionable diagnostics.
Helps the app gracefully handle architecture changes like "The Bubble Problem".

Key Features:
- Schema version detection
- Extraction strategy validation
- Clear error reporting with remediation steps
- Diagnostic data collection for bug reports
"""

import json
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List, Any


@dataclass
class SchemaHealth:
    """Database schema health check results."""
    is_healthy: bool
    schema_version: str  # e.g., "v2-bubbles", "v1-direct", "unknown"
    detected_tables: List[str]
    detected_keys_sample: List[str]
    extraction_strategies: Dict[str, bool]  # Which strategies are viable
    issues: List[str]  # List of issues found
    diagnostics: Dict[str, Any]  # Full diagnostic data for reporting
    timestamp: str


def detect_schema_version(db_path: Path) -> SchemaHealth:
    """
    Detect Cursor database schema version and validate extraction compatibility.
    
    Returns:
        SchemaHealth object with full diagnostic information
    """
    issues = []
    extraction_strategies = {
        "composerData_direct": False,
        "composerData_bubbles": False,
        "fullConversationHeadersOnly": False,
        "conversationWithMessages": False,
    }
    
    try:
        conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
        cursor = conn.cursor()
        
        # 1. Check tables
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in cursor.fetchall()]
        
        if "cursorDiskKV" not in tables:
            issues.append("CRITICAL: cursorDiskKV table not found. Database structure has changed significantly.")
            return SchemaHealth(
                is_healthy=False,
                schema_version="unknown-no-kv-table",
                detected_tables=tables,
                detected_keys_sample=[],
                extraction_strategies=extraction_strategies,
                issues=issues,
                diagnostics={"tables": tables, "error": "cursorDiskKV table missing"},
                timestamp=datetime.now().isoformat(),
            )
        
        # 2. Sample keys to understand data structure
        cursor.execute("SELECT key FROM cursorDiskKV LIMIT 1000")
        keys = [row[0] for row in cursor.fetchall()]
        
        if not keys:
            issues.append("WARNING: cursorDiskKV table is empty. No chat history found.")
        
        # 3. Detect extraction patterns
        composer_keys = [k for k in keys if k.startswith("composerData:")]
        bubble_keys = [k for k in keys if k.startswith("bubbleId:")]
        conversation_keys = [k for k in keys if "conversation" in k.lower()]
        
        # 4. Validate extraction strategies
        schema_version = "unknown"
        
        # Check for composerData entries
        if composer_keys:
            # Sample one composerData entry to check structure
            cursor.execute("SELECT value FROM cursorDiskKV WHERE key = ? LIMIT 1", (composer_keys[0],))
            sample_row = cursor.fetchone()
            if sample_row:
                try:
                    sample_value = sample_row[0]
                    if isinstance(sample_value, bytes):
                        sample_value = sample_value.decode('utf-8')
                    sample_data = json.loads(sample_value)
                    
                    # Check if it's bubble-based or direct
                    if "fullConversationHeadersOnly" in sample_data:
                        extraction_strategies["fullConversationHeadersOnly"] = True
                        if bubble_keys:
                            extraction_strategies["composerData_bubbles"] = True
                            schema_version = "v2-bubbles"
                        else:
                            issues.append("WARNING: fullConversationHeadersOnly found but no bubble keys. Extraction may fail.")
                            schema_version = "v2-bubbles-incomplete"
                    
                    if "conversationWithMessages" in sample_data:
                        extraction_strategies["conversationWithMessages"] = True
                        if schema_version == "unknown":
                            schema_version = "v1-direct"
                    
                    if "messages" in sample_data:
                        extraction_strategies["composerData_direct"] = True
                        if schema_version == "unknown":
                            schema_version = "v1-direct"
                    
                except (json.JSONDecodeError, UnicodeDecodeError) as e:
                    issues.append(f"ERROR: Failed to parse composerData sample: {e}")
        
        # 5. Determine overall health
        any_strategy_viable = any(extraction_strategies.values())
        is_healthy = any_strategy_viable and not any(i.startswith("CRITICAL") for i in issues)
        
        if not is_healthy and schema_version == "unknown":
            issues.append(
                "CRITICAL: No known extraction strategy viable. "
                "Cursor database schema may have changed. "
                "Please report this issue with diagnostic data."
            )
        
        # 6. Build diagnostics for reporting
        diagnostics = {
            "tables": tables,
            "total_keys": len(keys),
            "key_patterns": {
                "composerData": len(composer_keys),
                "bubbleId": len(bubble_keys),
                "conversation": len(conversation_keys),
                "other": len(keys) - len(composer_keys) - len(bubble_keys) - len(conversation_keys),
            },
            "sample_keys": keys[:20],  # First 20 keys for pattern analysis
            "cursor_version": detect_cursor_version(db_path),
        }
        
        conn.close()
        
        return SchemaHealth(
            is_healthy=is_healthy,
            schema_version=schema_version,
            detected_tables=tables,
            detected_keys_sample=keys[:20],
            extraction_strategies=extraction_strategies,
            issues=issues,
            diagnostics=diagnostics,
            timestamp=datetime.now().isoformat(),
        )
        
    except sqlite3.Error as e:
        return SchemaHealth(
            is_healthy=False,
            schema_version="error",
            detected_tables=[],
            detected_keys_sample=[],
            extraction_strategies=extraction_strategies,
            issues=[f"CRITICAL: Database error: {e}"],
            diagnostics={"error": str(e), "error_type": type(e).__name__},
            timestamp=datetime.now().isoformat(),
        )


def detect_cursor_version(db_path: Path) -> Optional[str]:
    """
    Attempt to detect Cursor version from nearby files.
    
    Returns:
        Version string like "0.45.0" or None if not found
    """
    # Try to read version from package.json or similar
    cursor_dir = db_path.parent.parent.parent  # Go up from globalStorage/state.vscdb
    
    possible_version_files = [
        cursor_dir / "package.json",
        cursor_dir / "resources" / "app" / "package.json",
    ]
    
    for version_file in possible_version_files:
        if version_file.exists():
            try:
                with open(version_file) as f:
                    data = json.load(f)
                    if "version" in data:
                        return data["version"]
            except (json.JSONDecodeError, IOError):
                continue
    
    return None


def generate_issue_report(health: SchemaHealth, db_path: Path) -> str:
    """
    Generate a formatted issue report for GitHub.
    
    Returns:
        Markdown-formatted issue report
    """
    report = f"""## Database Schema Compatibility Issue

**Detected:** {health.timestamp}
**Schema Version:** {health.schema_version}
**Database Path:** `{db_path}`
**Cursor Version:** {health.diagnostics.get('cursor_version', 'Unknown')}

### Health Status: {'✅ Healthy' if health.is_healthy else '❌ Unhealthy'}

### Issues Found:
"""
    for issue in health.issues:
        report += f"- {issue}\n"
    
    report += f"""
### Extraction Strategies:
"""
    for strategy, viable in health.extraction_strategies.items():
        status = "✅" if viable else "❌"
        report += f"- {status} {strategy}\n"
    
    report += f"""
### Diagnostics:

**Tables:** {', '.join(health.detected_tables)}

**Key Patterns:**
"""
    patterns = health.diagnostics.get('key_patterns', {})
    for pattern, count in patterns.items():
        report += f"- {pattern}: {count}\n"
    
    report += f"""
**Sample Keys:**
```
{chr(10).join(health.detected_keys_sample[:10])}
```

### Remediation Steps:

"""
    if health.is_healthy:
        report += "No action required. Schema is compatible with current extraction strategies.\n"
    else:
        report += """1. **Report this issue:** Copy this report to https://github.com/mostly-coherent/Inspiration/issues
2. **Check Cursor version:** Update to latest Cursor if possible
3. **Temporary workaround:** Use previous version of Inspiration until fix is available
4. **Help wanted:** Share sample anonymized data structure to help diagnose

**Do not share** actual message content, only the data structure/schema.
"""
    
    return report


def save_diagnostic_report(health: SchemaHealth, db_path: Path, output_path: Optional[Path] = None) -> Path:
    """
    Save diagnostic report to file.
    
    Args:
        health: SchemaHealth object
        db_path: Path to Cursor database
        output_path: Optional path to save report (defaults to ./db_diagnostic_report.txt)
    
    Returns:
        Path to saved report
    """
    if output_path is None:
        output_path = Path.cwd() / f"db_diagnostic_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.md"
    
    report = generate_issue_report(health, db_path)
    
    with open(output_path, 'w') as f:
        f.write(report)
    
    return output_path


if __name__ == "__main__":
    """Run health check and generate diagnostic report."""
    from cursor_db import get_cursor_db_path
    
    try:
        db_path = get_cursor_db_path()
        print(f"Checking database: {db_path}")
        print()
        
        health = detect_schema_version(db_path)
        
        print(f"Schema Version: {health.schema_version}")
        print(f"Health Status: {'✅ Healthy' if health.is_healthy else '❌ Unhealthy'}")
        print()
        
        if health.issues:
            print("Issues:")
            for issue in health.issues:
                print(f"  - {issue}")
            print()
        
        print("Extraction Strategies:")
        for strategy, viable in health.extraction_strategies.items():
            status = "✅" if viable else "❌"
            print(f"  {status} {strategy}")
        print()
        
        if not health.is_healthy:
            report_path = save_diagnostic_report(health, db_path)
            print(f"⚠️  Database schema issue detected!")
            print(f"📄 Diagnostic report saved to: {report_path}")
            print()
            print("Please report this issue at:")
            print("https://github.com/mostly-coherent/Inspiration/issues")
        else:
            print("✅ Database schema is compatible!")
        
    except Exception as e:
        print(f"❌ Error running health check: {e}")
