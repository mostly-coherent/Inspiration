#!/usr/bin/env python3
"""
Direct database connection to create HNSW index with extended timeout.

This bypasses Supabase's API timeout limit by connecting directly to PostgreSQL.

Usage:
    python3 engine/scripts/create_hnsw_index_direct.py

You'll be prompted for your database password (found in Supabase Dashboard → Settings → Database)
"""

import getpass
import sys

try:
    import psycopg2
except ImportError:
    print("Installing psycopg2-binary...")
    import subprocess
    subprocess.check_call([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"])
    import psycopg2

# Supabase project details (from your .env.local)
PROJECT_REF = "lefeqopprdhajweyzemz"
# Use session pooler (us-west-2 region) for direct connections with extended timeout
HOST = "aws-0-us-west-2.pooler.supabase.com"
PORT = 5432  # Session mode (not transaction mode 6543)
DATABASE = "postgres"
USER = f"postgres.{PROJECT_REF}"  # Pooler format

# Force IPv4 by resolving hostname
import socket
def get_ipv4_address(hostname):
    """Resolve hostname to IPv4 address to avoid IPv6 issues."""
    try:
        # Get all addresses and prefer IPv4
        addrs = socket.getaddrinfo(hostname, PORT, socket.AF_INET, socket.SOCK_STREAM)
        if addrs:
            return addrs[0][4][0]
    except Exception:
        pass
    return hostname

def main():
    print("=" * 60)
    print("HNSW Index Creator - Direct Connection")
    print("=" * 60)
    print()
    print(f"Connecting to: {HOST}")
    print()

    # Get password
    password = getpass.getpass("Enter your Supabase database password: ")

    if not password:
        print("❌ Password required. Find it in Supabase Dashboard → Settings → Database")
        sys.exit(1)

    try:
        # Connect with extended timeout via session pooler
        print(f"\n🔌 Connecting via session pooler ({HOST}:{PORT})...")
        conn = psycopg2.connect(
            host=HOST,
            port=PORT,
            database=DATABASE,
            user=USER,
            password=password,
            connect_timeout=30,
            sslmode="require",
            options="-c statement_timeout=600000"  # 10 minute timeout
        )
        conn.autocommit = True
        cursor = conn.cursor()
        print("✅ Connected!")

        # Step 1: Check existing indexes
        print("\n📊 Checking existing indexes...")
        cursor.execute("""
            SELECT indexname, indexdef
            FROM pg_indexes
            WHERE tablename = 'kg_entities'
            AND indexdef LIKE '%hnsw%'
        """)
        existing = cursor.fetchall()
        if existing:
            print(f"   Found existing HNSW index: {existing[0][0]}")
        else:
            print("   No existing HNSW index found")

        # Step 2: Drop existing index
        print("\n🗑️  Dropping existing HNSW index (if any)...")
        cursor.execute("DROP INDEX IF EXISTS idx_kg_entities_embedding")
        print("   Done")

        # Step 3: Create new HNSW index
        print("\n🔨 Creating new HNSW index (this may take 2-5 minutes)...")
        print("   Parameters: m=32, ef_construction=128")
        cursor.execute("""
            CREATE INDEX idx_kg_entities_embedding ON kg_entities
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 32, ef_construction = 128)
        """)
        print("✅ HNSW index created successfully!")

        # Step 4: Verify
        print("\n📊 Verifying index...")
        cursor.execute("""
            SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass)) as size
            FROM pg_indexes
            WHERE tablename = 'kg_entities'
            AND indexdef LIKE '%hnsw%'
        """)
        result = cursor.fetchone()
        if result:
            print(f"   Index: {result[0]}")
            print(f"   Size: {result[1]}")

        # Step 5: Create relation indexes
        print("\n🔨 Creating relation indexes...")
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_kg_relations_source_type
            ON kg_relations(source_entity_id, relation_type)
        """)
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS idx_kg_relations_target_type
            ON kg_relations(target_entity_id, relation_type)
        """)
        print("✅ Relation indexes created!")

        # Close connection
        cursor.close()
        conn.close()

        print("\n" + "=" * 60)
        print("✅ ALL INDEXES CREATED SUCCESSFULLY!")
        print("=" * 60)
        print("\nNext: Run the test to verify embedding queries work:")
        print("  python3 -c \"from engine.common.vector_db import get_supabase_client; ...")

    except psycopg2.OperationalError as e:
        if "password authentication failed" in str(e):
            print("\n❌ Wrong password. Check Supabase Dashboard → Settings → Database")
        elif "timeout" in str(e).lower():
            print("\n❌ Connection timeout. Check your network or Supabase status.")
        else:
            print(f"\n❌ Connection error: {e}")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
