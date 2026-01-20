"""
Temporal Tracker — Track temporal chains between chat conversations.

Phase 1b: User's Chat KG — Tracks "Chat A → followed by → Chat B" relationships
to prevent confusion from deprecated code and understand conversation flow.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class TemporalChain:
    """A temporal relationship between two conversations."""
    
    source_chat_id: str
    target_chat_id: str
    relationship_type: str  # "FOLLOWED_BY", "REFERENCED_BY", "OBSOLETES"
    confidence: float = 1.0
    evidence_snippet: Optional[str] = None
    timestamp: Optional[datetime] = None


def infer_temporal_chain(
    chat_a_id: str,
    chat_a_timestamp: int,
    chat_b_id: str,
    chat_b_timestamp: int,
    chat_b_text: Optional[str] = None,
) -> Optional[TemporalChain]:
    """
    Infer temporal chain between two chats based on timestamps and content.
    
    Args:
        chat_a_id: ID of first chat
        chat_a_timestamp: Timestamp of first chat (Unix milliseconds)
        chat_b_id: ID of second chat
        chat_b_timestamp: Timestamp of second chat (Unix milliseconds)
        chat_b_text: Optional text from chat B to check for references
        
    Returns:
        TemporalChain if relationship inferred, None otherwise
    """
    # Calculate time difference
    time_diff_ms = chat_b_timestamp - chat_a_timestamp
    
    # If chat B happens after chat A (within reasonable window)
    if time_diff_ms > 0:
        # Check if chat B references chat A (simple heuristic)
        relationship_type = "FOLLOWED_BY"
        
        # If chat B text mentions "previous" or "earlier" or similar, mark as REFERENCED_BY
        if chat_b_text:
            reference_keywords = ["previous", "earlier", "before", "last time", "mentioned"]
            if any(keyword in chat_b_text.lower() for keyword in reference_keywords):
                relationship_type = "REFERENCED_BY"
        
        return TemporalChain(
            source_chat_id=chat_a_id,
            target_chat_id=chat_b_id,
            relationship_type=relationship_type,
            confidence=0.8 if relationship_type == "FOLLOWED_BY" else 0.9,
            timestamp=datetime.fromtimestamp(chat_b_timestamp / 1000),
        )
    
    return None


def build_temporal_chains(
    conversations: list[dict],
    max_gap_hours: int = 24,
) -> list[TemporalChain]:
    """
    Build temporal chains from a list of conversations.
    
    Args:
        conversations: List of conversation dicts with 'chat_id' and 'timestamp' keys
        max_gap_hours: Maximum time gap (hours) to consider for temporal chains
        
    Returns:
        List of TemporalChain objects
    """
    chains = []
    
    # Sort conversations by timestamp
    sorted_conversations = sorted(
        conversations,
        key=lambda c: c.get("timestamp", 0)
    )
    
    # Build chains between consecutive conversations
    for i in range(len(sorted_conversations) - 1):
        chat_a = sorted_conversations[i]
        chat_b = sorted_conversations[i + 1]
        
        chat_a_id = chat_a.get("chat_id", "")
        chat_a_ts = chat_a.get("timestamp", 0)
        chat_b_id = chat_b.get("chat_id", "")
        chat_b_ts = chat_b.get("timestamp", 0)
        chat_b_text = chat_b.get("combined_text", "")
        
        if not chat_a_id or not chat_b_id or not chat_a_ts or not chat_b_ts:
            continue
        
        # Check if gap is reasonable (within max_gap_hours)
        time_diff_hours = (chat_b_ts - chat_a_ts) / (1000 * 60 * 60)
        if time_diff_hours > max_gap_hours:
            continue  # Gap too large, probably not related
        
        chain = infer_temporal_chain(
            chat_a_id=chat_a_id,
            chat_a_timestamp=chat_a_ts,
            chat_b_id=chat_b_id,
            chat_b_timestamp=chat_b_ts,
            chat_b_text=chat_b_text,
        )
        
        if chain:
            chains.append(chain)
    
    return chains
