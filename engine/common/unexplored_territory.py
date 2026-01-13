"""
Unexplored Territory Detection — Find topics discussed in Memory but missing from Library.

Layer 1 (MVP): Memory vs. Library Mismatch
- Cluster conversations by topic (embeddings)
- Cluster Library items by topic (embeddings)
- Find topics with high conversation count but low Library coverage

Threshold Rules:
| Conversations | Library Items | Severity |
|--------------|---------------|----------|
| 20+          | 0-1           | High     |
| 10-19        | 0-1           | Medium   |
| 5-9          | 0             | Low      |
"""

import json
import os
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional
from dataclasses import dataclass

# Add parent to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False
    Client = None

from common.config import load_env_file
from common.semantic_search import cosine_similarity


def load_dismissed_topics() -> set[str]:
    """Load dismissed topics from JSON file."""
    dismissed_file = Path(__file__).parent.parent.parent / "data" / "dismissed_topics.json"
    
    if not dismissed_file.exists():
        return set()
    
    try:
        with open(dismissed_file) as f:
            data = json.load(f)
            return {t["topic"].lower() for t in data.get("topics", [])}
    except Exception as e:
        print(f"⚠️  Error loading dismissed topics: {e}", file=sys.stderr)
        return set()


@dataclass
class ConversationCluster:
    """A cluster of related conversations."""
    id: str
    topic: str  # Representative topic/title
    conversation_count: int
    conversation_ids: list[str]  # List of chat_ids
    representative_embedding: list[float]
    sample_texts: list[str]  # First few messages for context


@dataclass
class UnexploredArea:
    """An area discussed in Memory but missing from Library."""
    id: str
    severity: str  # "high" | "medium" | "low"
    title: str
    description: str
    conversation_count: int
    library_item_count: int
    sample_conversations: list[str]  # Preview of conversation snippets
    layer: int  # 1 = Memory vs Library mismatch


def get_supabase_client() -> Optional[Client]:
    """Get Supabase client."""
    if not SUPABASE_AVAILABLE:
        return None
    
    load_env_file()
    supabase_url = os.environ.get("SUPABASE_URL")
    supabase_key = os.environ.get("SUPABASE_ANON_KEY")
    
    if not supabase_url or not supabase_key:
        return None
    
    return create_client(supabase_url, supabase_key)


def cluster_by_similarity(
    items: list[dict],
    embedding_key: str,
    threshold: float = 0.75,
) -> list[list[dict]]:
    """
    Cluster items by embedding similarity.
    
    Args:
        items: List of dicts with embeddings
        embedding_key: Key to access embedding in each dict
        threshold: Similarity threshold for clustering
    
    Returns:
        List of clusters (each cluster is a list of items)
    """
    clusters: list[list[dict]] = []
    
    for item in items:
        embedding = item.get(embedding_key)
        if not embedding or not isinstance(embedding, list):
            continue
        
        best_cluster_idx = None
        best_similarity = 0
        
        # Find best matching cluster
        for idx, cluster in enumerate(clusters):
            representative = cluster[0]
            rep_embedding = representative.get(embedding_key)
            if rep_embedding:
                similarity = cosine_similarity(embedding, rep_embedding)
                if similarity >= threshold and similarity > best_similarity:
                    best_similarity = similarity
                    best_cluster_idx = idx
        
        if best_cluster_idx is not None:
            clusters[best_cluster_idx].append(item)
        else:
            # Create new cluster
            clusters.append([item])
    
    return clusters


def parse_embedding(embedding_data) -> Optional[list[float]]:
    """Parse embedding from various formats (list, string, etc.)."""
    import json
    
    if embedding_data is None:
        return None
    
    if isinstance(embedding_data, list) and len(embedding_data) > 0:
        return embedding_data
    
    if isinstance(embedding_data, str):
        try:
            parsed = json.loads(embedding_data)
            if isinstance(parsed, list) and len(parsed) > 0:
                return parsed
        except (json.JSONDecodeError, TypeError):
            pass
    
    return None


def get_conversation_topics(
    client: Client,
    days_back: int = 90,
    min_messages: int = 3,
) -> list[dict]:
    """
    Get conversations with their representative embeddings.
    
    For each conversation, we use the first user message's embedding as representative.
    """
    # Calculate date range
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days_back)
    start_ts = int(start_date.timestamp() * 1000)
    end_ts = int(end_date.timestamp() * 1000)
    
    # Fetch conversations with embeddings
    # We'll get the first user message per chat_id as representative
    try:
        # Get distinct chat_ids first
        chat_result = client.table("cursor_messages")\
            .select("chat_id, workspace, chat_type, message_type, text, embedding, timestamp")\
            .gte("timestamp", start_ts)\
            .lt("timestamp", end_ts)\
            .eq("message_type", "user")\
            .order("timestamp", desc=False)\
            .execute()
        
        if not chat_result.data:
            return []
        
        # Group by chat_id, keeping first message with embedding as representative
        conversations: dict[str, dict] = {}
        chat_message_counts: dict[str, int] = {}
        
        for msg in chat_result.data:
            chat_id = msg.get("chat_id")
            if not chat_id:
                continue
            
            # Count messages per chat
            chat_message_counts[chat_id] = chat_message_counts.get(chat_id, 0) + 1
            
            # Use first message with embedding as representative
            if chat_id not in conversations:
                embedding = parse_embedding(msg.get("embedding"))
                if embedding:
                    conversations[chat_id] = {
                        "chat_id": chat_id,
                        "workspace": msg.get("workspace", "Unknown"),
                        "chat_type": msg.get("chat_type", "unknown"),
                        "text": msg.get("text", "")[:200],  # First 200 chars
                        "embedding": embedding,
                        "timestamp": msg.get("timestamp", 0),
                    }
        
        # Filter conversations with minimum messages and add message counts
        result = []
        for chat_id, conv in conversations.items():
            msg_count = chat_message_counts.get(chat_id, 0)
            if msg_count >= min_messages:
                conv["message_count"] = msg_count
                result.append(conv)
        
        return result
        
    except Exception as e:
        print(f"⚠️  Failed to get conversation topics: {e}", file=sys.stderr)
        return []


def get_library_topics(client: Client) -> list[dict]:
    """
    Get Library items with embeddings.
    """
    try:
        result = client.table("library_items")\
            .select("id, title, description, item_type, embedding")\
            .execute()
        
        if not result.data:
            return []
        
        # Filter items with embeddings
        items = []
        for item in result.data:
            embedding = parse_embedding(item.get("embedding"))
            if embedding:
                items.append({
                    "id": item.get("id"),
                    "title": item.get("title", ""),
                    "description": item.get("description", ""),
                    "item_type": item.get("item_type", "idea"),
                    "embedding": embedding,
                })
        
        return items
        
    except Exception as e:
        print(f"⚠️  Failed to get library topics: {e}", file=sys.stderr)
        return []


def generate_cluster_title(conversations: list[dict]) -> str:
    """Generate a title for a conversation cluster from sample texts."""
    if not conversations:
        return "Unknown Topic"
    
    # Get sample texts
    texts = [c.get("text", "")[:100] for c in conversations[:5]]
    
    # Find common words (simple approach)
    stop_words = {"the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
                  "have", "has", "had", "do", "does", "did", "will", "would", "could",
                  "should", "may", "might", "must", "can", "i", "you", "we", "they",
                  "it", "this", "that", "these", "those", "my", "your", "our", "their",
                  "what", "which", "who", "whom", "how", "when", "where", "why", "to",
                  "for", "with", "from", "about", "into", "through", "during", "before",
                  "after", "above", "below", "between", "under", "again", "further",
                  "then", "once", "here", "there", "all", "each", "few", "more", "most",
                  "other", "some", "such", "no", "not", "only", "same", "so", "than",
                  "too", "very", "just", "also", "now", "and", "but", "or", "if", "of",
                  "at", "by", "in", "on", "as", "up", "out", "off", "over", "any"}
    
    word_counts: dict[str, int] = {}
    for text in texts:
        words = text.lower().split()
        for word in words:
            # Clean word
            word = ''.join(c for c in word if c.isalnum())
            if len(word) > 3 and word not in stop_words:
                word_counts[word] = word_counts.get(word, 0) + 1
    
    # Get top words
    top_words = sorted(word_counts.items(), key=lambda x: x[1], reverse=True)[:3]
    
    if top_words:
        title_words = [w[0].capitalize() for w in top_words]
        return " & ".join(title_words)
    
    # Fallback: use first conversation's text
    first_text = texts[0] if texts else "Unknown"
    return first_text[:50] + ("..." if len(first_text) > 50 else "")


def detect_memory_library_mismatch(
    days_back: int = 90,
    conversation_threshold: float = 0.70,  # For clustering conversations
    library_threshold: float = 0.75,  # For clustering Library items
    coverage_threshold: float = 0.65,  # For checking if Library covers a topic
    min_conversations: int = 5,  # Minimum conversations to consider a topic
    include_low_severity: bool = False,  # Whether to include 5-9 conversation topics
) -> list[UnexploredArea]:
    """
    Detect topics discussed in Memory but missing from Library.
    
    Layer 1 Algorithm:
    1. Cluster recent conversations by topic (embedding similarity)
    2. Cluster Library items by topic
    3. For each conversation cluster, check if there's similar coverage in Library
    4. Surface clusters with high conversation count but low Library coverage
    
    Args:
        days_back: How many days of conversations to analyze
        conversation_threshold: Similarity threshold for clustering conversations
        library_threshold: Similarity threshold for clustering Library items
        coverage_threshold: How similar a Library cluster must be to "cover" a topic
        min_conversations: Minimum conversations in a cluster to consider
        include_low_severity: Whether to include low severity (5-9 conversations)
    
    Returns:
        List of UnexploredArea objects
    """
    client = get_supabase_client()
    if not client:
        print("⚠️  Supabase not configured", file=sys.stderr)
        return []
    
    print(f"🔍 Analyzing {days_back} days of conversations...", file=sys.stderr)
    
    # Step 1: Get and cluster conversations
    conversations = get_conversation_topics(client, days_back)
    print(f"   Found {len(conversations)} conversations with embeddings", file=sys.stderr)
    
    if not conversations:
        return []
    
    conversation_clusters = cluster_by_similarity(
        conversations, "embedding", conversation_threshold
    )
    print(f"   Grouped into {len(conversation_clusters)} topic clusters", file=sys.stderr)
    
    # Step 2: Get and cluster Library items
    library_items = get_library_topics(client)
    print(f"   Found {len(library_items)} Library items with embeddings", file=sys.stderr)
    
    library_clusters = cluster_by_similarity(
        library_items, "embedding", library_threshold
    ) if library_items else []
    print(f"   Grouped into {len(library_clusters)} Library themes", file=sys.stderr)
    
    # Step 3: Check coverage
    unexplored_areas: list[UnexploredArea] = []
    
    for idx, conv_cluster in enumerate(conversation_clusters):
        if len(conv_cluster) < min_conversations:
            continue
        
        # Get representative embedding
        rep_embedding = conv_cluster[0].get("embedding")
        if not rep_embedding:
            continue
        
        # Check if any Library cluster covers this topic
        best_library_coverage = 0
        library_items_covering = 0
        
        for lib_cluster in library_clusters:
            lib_rep_embedding = lib_cluster[0].get("embedding")
            if lib_rep_embedding:
                similarity = cosine_similarity(rep_embedding, lib_rep_embedding)
                if similarity > best_library_coverage:
                    best_library_coverage = similarity
                    library_items_covering = len(lib_cluster)
        
        # Determine if this is unexplored
        is_covered = best_library_coverage >= coverage_threshold and library_items_covering >= 2
        
        if not is_covered:
            conv_count = len(conv_cluster)
            
            # Determine severity based on conversation count
            # Adjusted thresholds for realistic data (most clusters are small)
            if conv_count >= 15:
                severity = "high"
            elif conv_count >= 8:
                severity = "medium"
            elif conv_count >= min_conversations:
                # Only include if severity filter allows
                if not include_low_severity:
                    continue
                severity = "low"
            else:
                continue  # Skip clusters below minimum
            
            # Generate title and description
            title = generate_cluster_title(conv_cluster)
            description = f"You discuss this topic frequently ({conv_count} conversations) but haven't extracted ideas or insights about it yet."
            
            # Get sample conversation snippets
            samples = [c.get("text", "")[:100] for c in conv_cluster[:3]]
            
            unexplored_areas.append(UnexploredArea(
                id=f"unexplored-{idx}",
                severity=severity,
                title=title,
                description=description,
                conversation_count=conv_count,
                library_item_count=library_items_covering,
                sample_conversations=samples,
                layer=1,
            ))
    
    # Filter out dismissed topics
    dismissed = load_dismissed_topics()
    if dismissed:
        before_filter = len(unexplored_areas)
        unexplored_areas = [
            area for area in unexplored_areas 
            if area.title.lower() not in dismissed
        ]
        filtered_count = before_filter - len(unexplored_areas)
        if filtered_count > 0:
            print(f"   Filtered out {filtered_count} dismissed topics", file=sys.stderr)
    
    # Sort by severity (high first) then by conversation count
    severity_order = {"high": 0, "medium": 1, "low": 2}
    unexplored_areas.sort(
        key=lambda x: (severity_order.get(x.severity, 3), -x.conversation_count)
    )
    
    print(f"   Found {len(unexplored_areas)} unexplored areas", file=sys.stderr)
    
    return unexplored_areas


def unexplored_area_to_dict(area: UnexploredArea) -> dict:
    """Convert UnexploredArea to JSON-serializable dict."""
    return {
        "id": area.id,
        "severity": area.severity,
        "title": area.title,
        "description": area.description,
        "stats": {
            "conversationCount": area.conversation_count,
            "libraryItemCount": area.library_item_count,
        },
        "sampleConversations": area.sample_conversations,
        "layer": area.layer,
    }


# CLI for testing
if __name__ == "__main__":
    import argparse
    import json
    
    parser = argparse.ArgumentParser(description="Detect unexplored territories in Memory")
    parser.add_argument("--days", type=int, default=90, help="Days of history to analyze")
    parser.add_argument("--min-convs", type=int, default=5, help="Minimum conversations per topic")
    parser.add_argument("--include-low", action="store_true", help="Include low severity topics")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    args = parser.parse_args()
    
    areas = detect_memory_library_mismatch(
        days_back=args.days,
        min_conversations=args.min_convs,
        include_low_severity=args.include_low,
    )
    
    if args.json:
        print(json.dumps([unexplored_area_to_dict(a) for a in areas], indent=2))
    else:
        if not areas:
            print("\n✅ No unexplored territories found! Your Library covers your discussions well.")
        else:
            print(f"\n🧭 Found {len(areas)} unexplored territories:\n")
            for area in areas:
                severity_icon = {"high": "🔴", "medium": "🟡", "low": "🟢"}.get(area.severity, "⚪")
                print(f"{severity_icon} {area.title}")
                print(f"   {area.conversation_count} conversations • {area.library_item_count} Library items")
                print(f"   {area.description}")
                if area.sample_conversations:
                    print(f"   Sample: \"{area.sample_conversations[0][:80]}...\"")
                print()
