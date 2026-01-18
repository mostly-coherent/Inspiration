#!/usr/bin/env python3
"""
Load episode metadata from Lenny's podcast transcripts into Supabase.

This script:
1. Parses all transcript YAML frontmatter
2. Extracts episode metadata (YouTube URLs, titles, guest names, etc.)
3. Populates kg_episode_metadata table in Supabase
4. Enables provenance tracking (clickable YouTube links)

Usage:
    python3 engine/scripts/load_episode_metadata.py
    python3 engine/scripts/load_episode_metadata.py --dry-run
"""

import sys
import re
from pathlib import Path
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from engine.common.lenny_parser import parse_all_episodes, ParsedEpisode
from engine.common.vector_db import get_supabase_client


def slugify(text: str) -> str:
    """
    Convert guest name to episode slug.
    
    Examples:
        "Ada Chen Rekhi" → "ada-chen-rekhi"
        "Lenny Rachitsky" → "lenny-rachitsky"
        "Dr. Emily Chang" → "dr-emily-chang"
    """
    # Lowercase and replace non-alphanumeric with hyphens
    slug = re.sub(r'[^a-z0-9]+', '-', text.lower())
    # Remove leading/trailing hyphens
    slug = slug.strip('-')
    return slug


def parse_duration(duration_str: str) -> tuple[int | None, str | None]:
    """
    Parse duration string to seconds and human-readable format.
    
    Examples:
        "1:23:45" → (5025, "1:23:45")
        "45:30" → (2730, "45:30")
        "PT1H23M45S" → (5025, "1:23:45")
    
    Returns:
        (duration_seconds, duration_human)
    """
    if not duration_str:
        return None, None
    
    # Already in H:MM:SS or MM:SS format
    if ':' in duration_str:
        parts = duration_str.split(':')
        if len(parts) == 3:  # H:MM:SS
            hours, minutes, seconds = map(int, parts)
            total_seconds = hours * 3600 + minutes * 60 + seconds
        elif len(parts) == 2:  # MM:SS
            minutes, seconds = map(int, parts)
            total_seconds = minutes * 60 + seconds
        else:
            return None, duration_str
        
        return total_seconds, duration_str
    
    # ISO 8601 duration format (PT1H23M45S)
    if duration_str.startswith('PT'):
        pattern = r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?'
        match = re.match(pattern, duration_str)
        if match:
            hours = int(match.group(1) or 0)
            minutes = int(match.group(2) or 0)
            seconds = int(match.group(3) or 0)
            total_seconds = hours * 3600 + minutes * 60 + seconds
            
            # Convert to H:MM:SS or MM:SS
            if hours > 0:
                human = f"{hours}:{minutes:02d}:{seconds:02d}"
            else:
                human = f"{minutes}:{seconds:02d}"
            
            return total_seconds, human
    
    # Unknown format
    return None, duration_str


def _parse_view_count(value) -> int | None:
    """
    Parse view_count, handling spaces and invalid values.
    
    Examples:
        "72 864" -> 72864
        "72864" -> 72864
        None -> None
        "invalid" -> None
    """
    if value is None:
        return None
    
    # Convert to string and remove spaces
    if isinstance(value, (int, float)):
        return int(value)
    
    if isinstance(value, str):
        # Remove spaces and commas
        cleaned = value.replace(' ', '').replace(',', '')
        try:
            return int(cleaned)
        except ValueError:
            return None
    
    return None


def extract_metadata(episode: ParsedEpisode) -> dict:
    """
    Extract metadata from episode for database insertion.
    
    Returns:
        dict with keys: episode_slug, guest_name, episode_title, youtube_url, etc.
    """
    # Generate slug from guest name (simple, matches indexing script format)
    if not episode.guest_name:
        raise ValueError(f"Episode missing guest_name: {episode.filename}")
    slug = slugify(episode.guest_name)
    
    # Parse duration
    duration_seconds, duration_human = None, None
    if episode.metadata:
        # Use duration_seconds if available, otherwise parse from duration string
        if episode.metadata.duration_seconds:
            duration_seconds = int(episode.metadata.duration_seconds)
            duration_human = episode.metadata.duration
        elif episode.metadata.duration:
            duration_seconds, duration_human = parse_duration(episode.metadata.duration)
    
    # Parse published date (not available in current metadata structure)
    # TODO: Add date field to EpisodeMetadata if needed
    published_date = None
    
    return {
        'episode_slug': slug,
        'guest_name': episode.guest_name,
        'episode_title': episode.metadata.title if episode.metadata else None,
        'description': episode.metadata.description if episode.metadata else None,
        'youtube_url': episode.metadata.youtube_url if episode.metadata else None,
        'video_id': episode.metadata.video_id if episode.metadata else None,
        'channel': 'Lenny\'s Podcast',
        'duration_seconds': duration_seconds,
        'duration_human': duration_human,
        'view_count': _parse_view_count(episode.metadata.view_count if episode.metadata and hasattr(episode.metadata, 'view_count') else None),
        'published_date': published_date.isoformat() if published_date else None,
    }


def load_metadata(dry_run: bool = False):
    """
    Load episode metadata from transcripts into Supabase.
    
    Args:
        dry_run: If True, only print what would be loaded (don't insert)
    """
    print("=" * 70)
    print("📚 Loading Episode Metadata for Provenance Tracking")
    print("=" * 70)
    print()
    
    # Find transcript directory
    transcript_dir = Path(__file__).parent.parent.parent / 'data' / 'lenny-transcripts'
    
    if not transcript_dir.exists():
        print(f"❌ Error: Transcript directory not found: {transcript_dir}")
        print(f"   Expected: data/lenny-transcripts/")
        sys.exit(1)
    
    print(f"📂 Transcript directory: {transcript_dir}")
    print()
    
    # Parse all episodes
    print("🔍 Parsing transcripts...")
    episodes = parse_all_episodes(transcript_dir)
    print(f"   Found {len(episodes)} episodes")
    print()
    
    # Extract metadata
    print("📝 Extracting metadata...")
    metadata_list = []
    skipped = []
    
    for episode in episodes:
        try:
            metadata = extract_metadata(episode)
            metadata_list.append(metadata)
        except Exception as e:
            skipped.append((episode.guest_name, str(e)))
            print(f"   ⚠️ Skipped {episode.guest_name}: {e}")
    
    print(f"   Extracted: {len(metadata_list)} episodes")
    if skipped:
        print(f"   Skipped: {len(skipped)} episodes (errors)")
    print()
    
    # Show sample
    if metadata_list:
        print("📋 Sample metadata (first 3 episodes):")
        for i, meta in enumerate(metadata_list[:3], 1):
            print(f"\n   {i}. {meta['guest_name']}")
            print(f"      Slug: {meta['episode_slug']}")
            print(f"      Title: {meta['episode_title']}")
            print(f"      YouTube: {meta['youtube_url']}")
            print(f"      Duration: {meta['duration_human']}")
    print()
    
    # Dry run - stop here
    if dry_run:
        print("✅ DRY RUN - No data inserted")
        print(f"   Would insert {len(metadata_list)} episodes into kg_episode_metadata")
        return
    
    # Insert into Supabase
    print("💾 Inserting into Supabase...")
    client = get_supabase_client()
    if not client:
        print("❌ Error: Supabase client not configured. Check SUPABASE_URL and SUPABASE_ANON_KEY environment variables.")
        sys.exit(1)
    
    # Deduplicate by slug (keep first occurrence for duplicate guests)
    seen_slugs = {}
    unique_metadata = []
    for metadata in metadata_list:
        slug = metadata['episode_slug']
        if slug not in seen_slugs:
            seen_slugs[slug] = metadata
            unique_metadata.append(metadata)
        else:
            # Log duplicate but keep first occurrence
            print(f"   ℹ️  Duplicate guest '{metadata['guest_name']}' (slug: {slug}), keeping first episode")
    
    print(f"   Unique episodes: {len(unique_metadata)} (removed {len(metadata_list) - len(unique_metadata)} duplicates)")
    
    # Batch insert unique episodes
    try:
        result = client.table('kg_episode_metadata').upsert(unique_metadata, on_conflict='episode_slug').execute()
        print(f"   ✅ Inserted/updated {len(unique_metadata)} episodes")
    except Exception as e:
        print(f"   ❌ Error inserting: {e}")
        sys.exit(1)
    
    print()
    print("=" * 70)
    print("✅ Episode Metadata Loading Complete")
    print("=" * 70)
    print()
    print(f"📊 Summary:")
    print(f"   Episodes processed: {len(episodes)}")
    print(f"   Metadata extracted: {len(metadata_list)}")
    print(f"   Inserted/updated: {len(metadata_list)}")
    if skipped:
        print(f"   Skipped (errors): {len(skipped)}")
    print()
    print("🔍 Verify:")
    print("   SELECT COUNT(*) FROM kg_episode_metadata;")
    print("   SELECT * FROM kg_episode_metadata LIMIT 5;")
    print()


if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Load episode metadata into Supabase')
    parser.add_argument('--dry-run', action='store_true', help='Print what would be loaded without inserting')
    args = parser.parse_args()
    
    load_metadata(dry_run=args.dry_run)
