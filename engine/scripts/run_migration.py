#!/usr/bin/env python3
"""
Run SQL migrations in Supabase.

This script attempts to run migrations using psql if available,
otherwise it prints instructions for manual execution.
"""
import sys
import subprocess
from pathlib import Path
import os

def run_migration(migration_file: Path):
    """Run a SQL migration file."""
    print(f"📄 Migration file: {migration_file}")
    
    # Check if psql is available
    psql_check = subprocess.run(['which', 'psql'], capture_output=True, text=True)
    if psql_check.returncode != 0:
        print("\n⚠️  psql not found. Please run this migration manually in Supabase SQL Editor.")
        print("\n📋 Instructions:")
        print("1. Open Supabase Dashboard → SQL Editor")
        print(f"2. Copy contents of: {migration_file}")
        print("3. Paste and execute")
        print("\nAlternatively, install PostgreSQL client tools to enable automatic migration.")
        return False
    
    # Check for Supabase connection string
    load_env_file()
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_ANON_KEY")
    
    if not supabase_url:
        print("\n⚠️  SUPABASE_URL not found in environment.")
        print("Please run this migration manually in Supabase SQL Editor.")
        return False
    
    # Extract database connection details from Supabase URL
    # Supabase URL format: https://xxxxx.supabase.co
    # We need to construct psql connection string
    # Format: postgresql://postgres:[PASSWORD]@db.xxxxx.supabase.co:5432/postgres
    print("\n⚠️  Automatic migration requires database password.")
    print("Please run this migration manually in Supabase SQL Editor:")
    print(f"   File: {migration_file}")
    return False


def load_env_file():
    """Load environment variables from .env.local"""
    env_path = Path(__file__).parent.parent.parent / ".env.local"
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    os.environ[key.strip()] = value.strip().strip('"').strip("'")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python3 run_migration.py <migration_file.sql>")
        sys.exit(1)
    
    migration_file = Path(sys.argv[1])
    if not migration_file.exists():
        print(f"❌ Migration file not found: {migration_file}")
        sys.exit(1)
    
    success = run_migration(migration_file)
    sys.exit(0 if success else 1)
