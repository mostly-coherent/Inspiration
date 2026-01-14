#!/usr/bin/env python3
"""
Theme Map Generation — Fast Start feature for Inspiration.

Generates a "Theme Map" from local Cursor chat history without requiring
Vector DB setup. Uses SQLite-local extraction and a single LLM call.

Usage:
    python generate_themes.py --days 14 --output data/theme_map.json
    python generate_themes.py --days 7 --provider openai
"""

import argparse
import json
import os
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from common.cursor_db import (
    get_cursor_db_path,
    get_high_signal_conversations_sqlite_fast,
    estimate_db_metrics,
)
from common.llm import call_llm
from common.cost_estimator import estimate_cost, format_cost_display
from common.lenny_search import search_lenny_archive, is_lenny_indexed
from common.semantic_search import is_openai_configured


def search_lenny_for_theme(theme_title: str, theme_summary: str, top_k: int = 2) -> list[dict]:
    """
    Search Lenny's archive for expert perspectives on a theme.
    
    Returns list of quote dicts with guest_name, content, youtube_url, etc.
    """
    if not is_lenny_indexed():
        return []
    
    if not is_openai_configured():
        return []
    
    try:
        # Search with theme title + summary for better context
        query = f"{theme_title}: {theme_summary}"
        results = search_lenny_archive(query, top_k=top_k, min_similarity=0.3)
        
        return [
            {
                "guestName": r.guest_name,
                "speaker": r.speaker,
                "content": r.content[:400] + "..." if len(r.content) > 400 else r.content,
                "episodeTitle": r.episode_title,
                "youtubeUrl": r.youtube_url,
                "timestamp": r.timestamp,
                "similarity": round(r.similarity, 3),
            }
            for r in results
        ]
    except Exception as e:
        print(f"⚠️  Lenny search failed for '{theme_title}': {e}", file=sys.stderr)
        return []


def enhance_themes_with_lenny(theme_map: dict) -> dict:
    """
    Enhance theme map with expert perspectives from Lenny's podcast.
    
    Adds 'expertPerspectives' to each theme, counter-intuitive item, and unexplored territory.
    """
    if not is_lenny_indexed():
        print("ℹ️  Lenny archive not indexed, skipping expert perspectives", file=sys.stderr)
        theme_map["lennyAvailable"] = False
        return theme_map
    
    if not is_openai_configured():
        print("ℹ️  OpenAI not configured, skipping expert perspectives (need embedding for search)", file=sys.stderr)
        theme_map["lennyAvailable"] = True
        theme_map["lennyUnlocked"] = False
        return theme_map
    
    print("🎙️ Searching Lenny's archive for expert perspectives...", file=sys.stderr)
    theme_map["lennyAvailable"] = True
    theme_map["lennyUnlocked"] = True
    
    # Enhance themes
    for theme in theme_map.get("themes", []):
        quotes = search_lenny_for_theme(
            theme.get("title", ""),
            theme.get("summary", ""),
            top_k=2
        )
        theme["expertPerspectives"] = quotes
        if quotes:
            print(f"   ✓ {theme.get('title', 'Theme')}: {len(quotes)} expert quotes", file=sys.stderr)
    
    # Enhance counter-intuitive items
    for item in theme_map.get("counterIntuitive", []):
        quotes = search_lenny_for_theme(
            item.get("title", ""),
            item.get("perspective", ""),
            top_k=1
        )
        item["expertChallenge"] = quotes[0] if quotes else None
        if quotes:
            print(f"   ✓ Counter-intuitive '{item.get('title', '')}': expert challenge found", file=sys.stderr)
    
    # Enhance unexplored territory items
    for item in theme_map.get("unexploredTerritory", []):
        quotes = search_lenny_for_theme(
            item.get("title", ""),
            item.get("why", ""),
            top_k=1
        )
        item["expertInsight"] = quotes[0] if quotes else None
        if quotes:
            print(f"   ✓ Unexplored '{item.get('title', '')}': expert insight found", file=sys.stderr)
    
    expert_count = sum(len(t.get("expertPerspectives", [])) for t in theme_map.get("themes", []))
    print(f"✅ Added {expert_count} expert perspectives from Lenny's podcast", file=sys.stderr)
    
    return theme_map


def create_conversation_cards(conversations: list[dict], max_cards: int = 60) -> list[dict]:
    """
    Create compact "conversation cards" for LLM synthesis.
    
    Each card contains:
    - Brief summary (first user message, truncated)
    - Key snippet (most interesting exchange)
    - Metadata (workspace, date, chat_type)
    
    Args:
        conversations: List of conversation dicts from SQLite extraction
        max_cards: Maximum number of cards to create
        
    Returns:
        List of card dicts for prompt inclusion
    """
    cards = []
    
    for convo in conversations[:max_cards]:
        messages = convo.get("messages", [])
        if not messages:
            continue
        
        # Get first user message as summary
        first_user_msg = next(
            (m["text"] for m in messages if m["type"] == "user"),
            ""
        )
        summary = first_user_msg[:200] + "..." if len(first_user_msg) > 200 else first_user_msg
        
        # Get a representative snippet (prefer exchanges with code or errors)
        snippet = _extract_best_snippet(messages)
        
        # Get date from first message timestamp
        first_ts = messages[0].get("timestamp", 0)
        date_str = datetime.fromtimestamp(first_ts / 1000).strftime("%Y-%m-%d") if first_ts else "Unknown"
        
        cards.append({
            "workspace": convo.get("workspace", "Unknown"),
            "chat_id": convo.get("chat_id", "unknown"),
            "chat_type": convo.get("chat_type", "unknown"),
            "date": date_str,
            "summary": summary,
            "snippet": snippet,
            "message_count": len(messages),
            "signal_score": convo.get("signal_score", 0),
        })
    
    return cards


def _extract_best_snippet(messages: list[dict], max_length: int = 300) -> str:
    """Extract the most interesting snippet from a conversation."""
    # Prefer messages with code blocks or errors
    for msg in messages:
        text = msg.get("text", "")
        if "```" in text or "error" in text.lower() or "exception" in text.lower():
            # Truncate to max_length
            if len(text) > max_length:
                return text[:max_length] + "..."
            return text
    
    # Fallback: first assistant response
    for msg in messages:
        if msg.get("type") == "assistant":
            text = msg.get("text", "")
            if len(text) > max_length:
                return text[:max_length] + "..."
            return text
    
    # Last resort: first message
    if messages:
        text = messages[0].get("text", "")
        if len(text) > max_length:
            return text[:max_length] + "..."
        return text
    
    return ""


def format_cards_for_prompt(cards: list[dict]) -> str:
    """Format conversation cards into a string for the LLM prompt."""
    lines = []
    
    for i, card in enumerate(cards, 1):
        lines.append(f"--- Conversation {i} ---")
        lines.append(f"Workspace: {card['workspace']}")
        lines.append(f"Date: {card['date']}")
        lines.append(f"Type: {card['chat_type']}")
        lines.append(f"Messages: {card['message_count']}")
        lines.append(f"Summary: {card['summary']}")
        if card['snippet']:
            lines.append(f"Snippet: {card['snippet']}")
        lines.append("")
    
    return "\n".join(lines)


def generate_theme_map(
    days: int = 14,
    max_conversations: int = 80,
    provider: str = "anthropic",
    model: str | None = None,
) -> dict:
    """
    Generate a Theme Map from local Cursor chat history.
    
    Args:
        days: Number of days to analyze
        max_conversations: Maximum conversations to include
        provider: LLM provider ("anthropic", "openai", "openrouter")
        model: Optional model override
        
    Returns:
        Theme Map JSON structure
    """
    print(f"🔍 Extracting high-signal conversations from last {days} days...", file=sys.stderr)
    
    # Get conversations from SQLite (no Vector DB)
    conversations = get_high_signal_conversations_sqlite_fast(
        days_back=days,
        max_conversations=max_conversations,
    )
    
    if not conversations:
        return {
            "error": "No conversations found",
            "suggestedDays": days,
            "analyzed": {
                "days": days,
                "conversationsConsidered": 0,
                "conversationsUsed": 0,
            },
            "themes": [],
            "counterIntuitive": [],
            "unexploredTerritory": [],
        }
    
    print(f"📊 Found {len(conversations)} high-signal conversations", file=sys.stderr)
    
    # Create conversation cards
    cards = create_conversation_cards(conversations, max_cards=60)
    print(f"📝 Created {len(cards)} conversation cards for analysis", file=sys.stderr)
    
    # Format for prompt
    cards_text = format_cards_for_prompt(cards)
    
    # Build the prompt
    prompt = f"""You are analyzing a developer's AI-assisted coding sessions from the last {days} days.

Here are summaries of their recent conversations:

{cards_text}

Based on these conversations, identify:

1. **Top 5 recurring themes** - patterns, topics, or problems that appear repeatedly
   - For each theme: provide a clear name, description, and why it matters
   - Include 2-3 specific conversation references as evidence

2. **Counter-intuitive perspectives** - 2 assumptions worth questioning
   - Challenge a pattern you see: "What if the opposite is true?"
   - Example: If they're building many apps → "What if focusing on fewer apps would accelerate learning?"
   - Example: If they're cloning production code → "What if studying production code slows original thinking?"
   - Make it thought-provoking but grounded in their actual patterns

3. **Unexplored territory** - 1-2 topics that are notably ABSENT but might be relevant
   - Be context-aware: if they're building web apps, are they missing security or testing?
   - If they're doing AI work, are they missing observability or evals?
   - Don't suggest generic topics - make it specific to their apparent stack/focus

Respond in this exact JSON format:
{{
  "themes": [
    {{
      "id": "theme_1",
      "title": "Theme Name",
      "summary": "One sentence describing the pattern",
      "whyItMatters": ["Reason 1", "Reason 2"],
      "evidence": [
        {{
          "workspace": "/path/to/workspace",
          "chatId": "chat_id_here",
          "chatType": "composer",
          "date": "YYYY-MM-DD",
          "snippet": "Brief excerpt showing this theme"
        }}
      ]
    }}
  ],
  "counterIntuitive": [
    {{
      "title": "Theme/Pattern Name",
      "perspective": "What if [opposite perspective]?",
      "reasoning": "Brief explanation of why this counter-perspective might be worth considering"
    }}
  ],
  "unexploredTerritory": [
    {{
      "title": "Missing Topic",
      "why": "Given your focus on X, the absence of Y discussions could be a risk because..."
    }}
  ]
}}

Important:
- Use ONLY information from the provided conversations
- Evidence must reference actual conversations from the list
- Keep summaries concise but insightful
- Counter-intuitive perspectives should challenge assumptions visible in the patterns
- Make unexplored territory suggestions specific to their apparent tech stack
"""

    print(f"🤖 Calling {provider} for theme synthesis...", file=sys.stderr)
    
    # Call LLM
    try:
        response = call_llm(
            prompt=prompt,
            provider=provider,
            model=model,
            temperature=0.3,  # Lower temperature for more consistent structure
            max_tokens=4000,
        )
    except Exception as e:
        return {
            "error": f"LLM call failed: {str(e)}",
            "suggestedDays": days,
            "analyzed": {
                "days": days,
                "conversationsConsidered": len(conversations),
                "conversationsUsed": len(cards),
            },
            "themes": [],
            "counterIntuitive": [],
            "unexploredTerritory": [],
        }
    
    # Parse response
    try:
        # Extract JSON from response (handle markdown code blocks)
        json_str = response
        if "```json" in response:
            json_str = response.split("```json")[1].split("```")[0]
        elif "```" in response:
            json_str = response.split("```")[1].split("```")[0]
        
        theme_data = json.loads(json_str.strip())
    except json.JSONDecodeError as e:
        print(f"⚠️  Failed to parse LLM response: {e}", file=sys.stderr)
        return {
            "error": f"Failed to parse LLM response: {str(e)}",
            "raw_response": response[:1000],
            "suggestedDays": days,
            "analyzed": {
                "days": days,
                "conversationsConsidered": len(conversations),
                "conversationsUsed": len(cards),
            },
            "themes": [],
            "counterIntuitive": [],
            "unexploredTerritory": [],
        }
    
    # Build final Theme Map
    theme_map = {
        "generatedAt": datetime.now().isoformat(),
        "suggestedDays": days,
        "analyzed": {
            "days": days,
            "conversationsConsidered": len(conversations),
            "conversationsUsed": len(cards),
        },
        "themes": theme_data.get("themes", []),
        "counterIntuitive": theme_data.get("counterIntuitive", []),
        "unexploredTerritory": theme_data.get("unexploredTerritory", []),
    }
    
    print(f"✅ Generated Theme Map with {len(theme_map['themes'])} themes", file=sys.stderr)
    
    # Enhance with Lenny's expert perspectives (if available)
    theme_map = enhance_themes_with_lenny(theme_map)
    
    return theme_map


def main():
    parser = argparse.ArgumentParser(
        description="Generate Theme Map from Cursor chat history"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=14,
        help="Number of days to analyze (default: 14)"
    )
    parser.add_argument(
        "--max-conversations",
        type=int,
        default=80,
        help="Maximum conversations to include (default: 80)"
    )
    parser.add_argument(
        "--provider",
        choices=["anthropic", "openai", "openrouter"],
        default="anthropic",
        help="LLM provider (default: anthropic)"
    )
    parser.add_argument(
        "--model",
        type=str,
        default=None,
        help="Model override (default: provider's default)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default=None,
        help="Output file path (default: stdout as JSON)"
    )
    parser.add_argument(
        "--estimate-only",
        action="store_true",
        help="Only estimate DB metrics, don't generate themes"
    )
    parser.add_argument(
        "--estimate-cost",
        action="store_true",
        help="Estimate cost without generating (requires --days)"
    )
    
    args = parser.parse_args()
    
    # Estimate-only mode (DB metrics)
    if args.estimate_only:
        metrics = estimate_db_metrics()
        print(json.dumps(metrics, indent=2))
        return
    
    # Estimate-cost mode (cost without generation)
    if args.estimate_cost:
        # Get conversation count estimate
        metrics = estimate_db_metrics()
        estimated_conversations = min(
            metrics.get("estimatedConversations", 50),
            args.max_conversations
        )
        
        # Calculate cost estimate
        cost_estimate = estimate_cost(
            conversation_count=estimated_conversations,
            provider=args.provider,
            model=args.model,
        )
        
        # Combine DB metrics with cost estimate
        result = {
            "dbMetrics": metrics,
            "costEstimate": cost_estimate,
        }
        print(json.dumps(result, indent=2))
        return
    
    # Generate Theme Map
    theme_map = generate_theme_map(
        days=args.days,
        max_conversations=args.max_conversations,
        provider=args.provider,
        model=args.model,
    )
    
    # Output
    if args.output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        with open(output_path, "w") as f:
            json.dump(theme_map, f, indent=2)
        print(f"📁 Theme Map saved to {output_path}", file=sys.stderr)
    else:
        print(json.dumps(theme_map, indent=2))


if __name__ == "__main__":
    main()
