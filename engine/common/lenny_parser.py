"""
Lenny Podcast Transcript Parser — Parse transcripts into speaker-turn chunks.

Supports two formats:
1. GitHub repo format (YAML frontmatter + markdown): data/lenny-transcripts/episodes/*/transcript.md
2. Legacy Dropbox format (plain .txt files): Lennys Podcast Public Archive/*.txt

The GitHub format provides rich metadata (guest, title, youtube_url, description).
"""

import re
import hashlib
import yaml
from dataclasses import dataclass
from pathlib import Path


@dataclass
class TranscriptChunk:
    """A single chunk from a podcast transcript."""
    speaker: str
    timestamp: str  # "HH:MM:SS" format
    content: str
    word_count: int
    chunk_index: int  # Position in episode


@dataclass  
class EpisodeMetadata:
    """Rich metadata from YAML frontmatter (GitHub format)."""
    guest: str
    title: str
    youtube_url: str | None
    video_id: str | None
    description: str | None
    duration_seconds: float | None
    duration: str | None  # Human-readable "1:23:45"
    view_count: int | None
    channel: str | None


@dataclass  
class ParsedEpisode:
    """A fully parsed podcast episode."""
    filename: str
    guest_name: str
    full_transcript: str  # Lossless: complete original content
    chunks: list[TranscriptChunk]
    word_count: int
    file_hash: str
    # Rich metadata (GitHub format only)
    metadata: EpisodeMetadata | None = None


# Regex to match speaker turns: "Name (HH:MM:SS):" at start of line
# Handles names with spaces, periods, apostrophes
SPEAKER_PATTERN = re.compile(
    r'^([\w\s\.\'\-\+]+?)\s*\((\d{2}:\d{2}:\d{2})\):\s*',
    re.MULTILINE
)


def compute_file_hash(filepath: Path) -> str:
    """Compute MD5 hash of file for change detection."""
    with open(filepath, 'rb') as f:
        return hashlib.md5(f.read()).hexdigest()


def extract_guest_name(filename: str) -> str:
    """
    Extract guest name from filename (legacy format).
    
    "Brian Chesky.txt" -> "Brian Chesky"
    "Elena Verna 2.0.txt" -> "Elena Verna 2.0"
    """
    return filename.replace('.txt', '').strip()


def parse_yaml_frontmatter(content: str) -> tuple[EpisodeMetadata | None, str]:
    """
    Parse YAML frontmatter from markdown content.
    
    Returns:
        (metadata, transcript_content) tuple
    """
    if not content.startswith('---'):
        return None, content
    
    # Find the closing ---
    parts = content.split('---', 2)
    if len(parts) < 3:
        return None, content
    
    try:
        yaml_content = parts[1]
        frontmatter = yaml.safe_load(yaml_content)
        
        metadata = EpisodeMetadata(
            guest=frontmatter.get('guest', 'Unknown'),
            title=frontmatter.get('title', ''),
            youtube_url=frontmatter.get('youtube_url'),
            video_id=frontmatter.get('video_id'),
            description=frontmatter.get('description'),
            duration_seconds=frontmatter.get('duration_seconds'),
            duration=frontmatter.get('duration'),
            view_count=frontmatter.get('view_count'),
            channel=frontmatter.get('channel'),
        )
        
        # Content after frontmatter
        transcript_content = parts[2].strip()
        
        return metadata, transcript_content
        
    except yaml.YAMLError:
        return None, content


def strip_markdown_header(content: str) -> str:
    """
    Remove markdown headers like "# Title" and "## Transcript" from content.
    """
    lines = content.split('\n')
    cleaned_lines = []
    
    for line in lines:
        # Skip markdown headers
        if line.startswith('#'):
            continue
        cleaned_lines.append(line)
    
    return '\n'.join(cleaned_lines).strip()


def parse_transcript(content: str) -> list[TranscriptChunk]:
    """
    Parse transcript content into speaker-turn chunks.
    
    Args:
        content: Full transcript text (after frontmatter removal)
        
    Returns:
        List of TranscriptChunk objects
    """
    # Strip markdown headers
    content = strip_markdown_header(content)
    
    chunks = []
    
    # Find all speaker turn matches
    matches = list(SPEAKER_PATTERN.finditer(content))
    
    if not matches:
        # No speaker pattern found - treat entire content as one chunk
        word_count = len(content.split())
        if word_count > 0:
            chunks.append(TranscriptChunk(
                speaker="Unknown",
                timestamp="00:00:00",
                content=content.strip(),
                word_count=word_count,
                chunk_index=0
            ))
        return chunks
    
    # Process each speaker turn
    for i, match in enumerate(matches):
        speaker = match.group(1).strip()
        timestamp = match.group(2)
        
        # Content starts after the match
        start_pos = match.end()
        
        # Content ends at next speaker turn or end of file
        if i + 1 < len(matches):
            end_pos = matches[i + 1].start()
        else:
            end_pos = len(content)
        
        chunk_content = content[start_pos:end_pos].strip()
        word_count = len(chunk_content.split())
        
        # Skip empty chunks
        if word_count == 0:
            continue
            
        chunks.append(TranscriptChunk(
            speaker=speaker,
            timestamp=timestamp,
            content=chunk_content,
            word_count=word_count,
            chunk_index=len(chunks)
        ))
    
    return chunks


def split_long_chunks(chunks: list[TranscriptChunk], max_words: int = 600) -> list[TranscriptChunk]:
    """
    Split chunks that exceed max_words into smaller pieces.
    
    Splits at paragraph boundaries when possible.
    
    Args:
        chunks: List of TranscriptChunks
        max_words: Maximum words per chunk (default 600 ≈ 800 tokens)
        
    Returns:
        List of chunks with long ones split
    """
    result = []
    
    for chunk in chunks:
        if chunk.word_count <= max_words:
            result.append(chunk)
            continue
        
        # Split by paragraphs (double newline)
        paragraphs = chunk.content.split('\n\n')
        
        current_content = []
        current_words = 0
        sub_index = 0
        
        for para in paragraphs:
            para_words = len(para.split())
            
            if current_words + para_words > max_words and current_content:
                # Save current chunk
                result.append(TranscriptChunk(
                    speaker=chunk.speaker,
                    timestamp=chunk.timestamp,
                    content='\n\n'.join(current_content),
                    word_count=current_words,
                    chunk_index=len(result)
                ))
                current_content = [para]
                current_words = para_words
                sub_index += 1
            else:
                current_content.append(para)
                current_words += para_words
        
        # Don't forget the last piece
        if current_content:
            result.append(TranscriptChunk(
                speaker=chunk.speaker,
                timestamp=chunk.timestamp,
                content='\n\n'.join(current_content),
                word_count=current_words,
                chunk_index=len(result)
            ))
    
    # Re-index all chunks
    for i, chunk in enumerate(result):
        chunk.chunk_index = i
    
    return result


def parse_episode_file(filepath: Path, max_chunk_words: int = 600) -> ParsedEpisode:
    """
    Parse a single episode transcript file.
    
    Handles both:
    - GitHub format (.md with YAML frontmatter)
    - Legacy format (.txt plain text)
    
    Args:
        filepath: Path to transcript file
        max_chunk_words: Maximum words per chunk
        
    Returns:
        ParsedEpisode with full transcript and chunks
    """
    # Read full content (lossless)
    full_content = filepath.read_text(encoding='utf-8')
    
    # Try to parse YAML frontmatter (GitHub format)
    metadata, transcript_content = parse_yaml_frontmatter(full_content)
    
    # Parse into chunks
    chunks = parse_transcript(transcript_content)
    
    # Split long chunks
    chunks = split_long_chunks(chunks, max_words=max_chunk_words)
    
    # Compute metadata
    filename = filepath.name
    
    # Get guest name from metadata or filename
    if metadata:
        guest_name = metadata.guest
    else:
        guest_name = extract_guest_name(filename)
    
    word_count = len(transcript_content.split())
    file_hash = compute_file_hash(filepath)
    
    return ParsedEpisode(
        filename=filename,
        guest_name=guest_name,
        full_transcript=full_content,  # Keep original with frontmatter
        chunks=chunks,
        word_count=word_count,
        file_hash=file_hash,
        metadata=metadata,
    )


def find_transcript_files_github(archive_path: Path) -> list[Path]:
    """
    Find all transcript files in the GitHub repo format.
    
    Structure: archive_path/episodes/guest-name/transcript.md
    
    Args:
        archive_path: Path to cloned repo (e.g., data/lenny-transcripts)
        
    Returns:
        List of transcript.md file paths
    """
    episodes_dir = archive_path / "episodes"
    if not episodes_dir.exists():
        return []
    
    # Find all transcript.md files in subdirectories
    transcript_files = sorted(episodes_dir.glob('*/transcript.md'))
    
    return transcript_files


def find_transcript_files_legacy(archive_path: Path) -> list[Path]:
    """
    Find all transcript files in the legacy Dropbox format.
    
    Structure: archive_path/*.txt
    
    Args:
        archive_path: Path to Lenny's Podcast archive folder
        
    Returns:
        List of .txt file paths (excluding README)
    """
    if not archive_path.exists():
        return []
    
    txt_files = sorted(archive_path.glob('*.txt'))
    
    # Filter out non-transcript files
    excluded = {'README.md', 'readme.md', 'README.txt'}
    txt_files = [f for f in txt_files if f.name not in excluded]
    
    return txt_files


def find_transcript_files(archive_path: Path) -> list[Path]:
    """
    Find all transcript files in the archive folder.
    
    Auto-detects format:
    - GitHub format: archive_path/episodes/*/transcript.md
    - Legacy format: archive_path/*.txt
    
    Args:
        archive_path: Path to archive folder
        
    Returns:
        List of transcript file paths
    """
    # Try GitHub format first (preferred)
    github_files = find_transcript_files_github(archive_path)
    if github_files:
        return github_files
    
    # Fall back to legacy format
    return find_transcript_files_legacy(archive_path)


def detect_archive_format(archive_path: Path) -> str:
    """
    Detect which format the archive is in.
    
    Returns:
        "github" | "legacy" | "unknown"
    """
    if (archive_path / "episodes").exists():
        return "github"
    
    txt_files = list(archive_path.glob('*.txt'))
    if txt_files:
        return "legacy"
    
    return "unknown"


def parse_all_episodes(archive_path: Path, max_chunk_words: int = 600) -> list[ParsedEpisode]:
    """
    Parse all episode transcripts in the archive.
    
    Args:
        archive_path: Path to archive folder
        max_chunk_words: Maximum words per chunk
        
    Returns:
        List of ParsedEpisode objects
    """
    transcript_files = find_transcript_files(archive_path)
    
    episodes = []
    for filepath in transcript_files:
        try:
            episode = parse_episode_file(filepath, max_chunk_words)
            episodes.append(episode)
        except Exception as e:
            print(f"⚠️  Failed to parse {filepath.name}: {e}")
            continue
    
    return episodes


# For testing
if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python lenny_parser.py <archive_path>")
        print("Example: python lenny_parser.py 'data/lenny-transcripts'")
        sys.exit(1)
    
    archive_path = Path(sys.argv[1])
    
    print(f"📂 Parsing transcripts from: {archive_path}")
    
    # Detect format
    format_type = detect_archive_format(archive_path)
    print(f"📋 Detected format: {format_type}")
    
    episodes = parse_all_episodes(archive_path)
    
    total_chunks = sum(len(ep.chunks) for ep in episodes)
    total_words = sum(ep.word_count for ep in episodes)
    
    # Count episodes with rich metadata
    with_metadata = sum(1 for ep in episodes if ep.metadata)
    
    print(f"\n📊 Summary:")
    print(f"   Episodes: {len(episodes)}")
    print(f"   With rich metadata: {with_metadata}")
    print(f"   Total chunks: {total_chunks}")
    print(f"   Total words: {total_words:,}")
    print(f"   Avg chunks/episode: {total_chunks / len(episodes):.1f}")
    print(f"   Avg words/chunk: {total_words / total_chunks:.1f}")
    
    # Show first episode as sample
    if episodes:
        ep = episodes[0]
        print(f"\n📝 Sample episode: {ep.guest_name}")
        print(f"   Chunks: {len(ep.chunks)}")
        print(f"   Words: {ep.word_count:,}")
        if ep.metadata:
            print(f"   Title: {ep.metadata.title}")
            print(f"   YouTube: {ep.metadata.youtube_url}")
            print(f"   Duration: {ep.metadata.duration}")
        if ep.chunks:
            print(f"   First chunk speaker: {ep.chunks[0].speaker}")
            print(f"   First chunk preview: {ep.chunks[0].content[:200]}...")
