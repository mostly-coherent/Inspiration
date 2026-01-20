"""
Decision Extractor — Extract decision points and assumptions from user chat history.

Phase 1b: User's Chat KG — Extracts:
- Decisions: "Why Postgres over MongoDB?"
- Assumptions: "Assuming we have 10k users..."
- Dependencies: Which libraries were suggested?
"""

import json
import re
from dataclasses import dataclass
from typing import Optional

from .llm import call_llm, is_permanent_failure, PermanentAPIFailure, get_fallback_chain


@dataclass
class Decision:
    """A decision point extracted from conversation."""
    
    decision_text: str
    decision_type: str  # "TECHNOLOGY_CHOICE", "ARCHITECTURE", "DEPENDENCY", "ASSUMPTION"
    confidence: float = 1.0
    context_snippet: Optional[str] = None
    alternatives_considered: list[str] = None
    rationale: Optional[str] = None
    
    def __post_init__(self):
        if self.alternatives_considered is None:
            self.alternatives_considered = []


# Prompt template for decision extraction
DECISION_EXTRACTION_PROMPT = """Extract decision points, assumptions, and dependencies from this conversation text.

A decision point is a choice made or recommended:
- Technology choices: "We'll use Postgres instead of MongoDB"
- Architecture decisions: "Let's use server-side rendering"
- Dependency choices: "We need to add Prisma for database access"
- Assumptions: "Assuming we have 10k users, we can..."

Rules:
1. Only extract EXPLICIT decisions or assumptions (not vague suggestions)
2. Include alternatives if mentioned ("Postgres over MongoDB")
3. Extract rationale if provided ("because it has better JSON support")
4. Extract at most 5 decisions per conversation
5. Provide context snippet showing where decision was made

Conversation:
{text}

Respond with a JSON array of decisions. If no clear decisions found, return empty array [].

Format:
[
  {{
    "decision_text": "Use Postgres instead of MongoDB",
    "decision_type": "TECHNOLOGY_CHOICE",
    "confidence": 0.9,
    "context_snippet": "Brief quote showing this decision",
    "alternatives_considered": ["MongoDB", "MySQL"],
    "rationale": "Better JSON support and ACID compliance"
  }}
]

Only output the JSON array, no other text."""


def extract_decisions(
    text: str,
    model: str = "gpt-4o-mini",
    provider: str = "openai",
    max_decisions: int = 5,
) -> list[Decision]:
    """
    Extract decision points from conversation text using LLM.
    
    Args:
        text: Conversation text to analyze
        model: LLM model to use (default: gpt-4o-mini)
        provider: LLM provider (default: openai)
        max_decisions: Maximum decisions to extract per call
        
    Returns:
        List of Decision objects
        
    Raises:
        PermanentAPIFailure: If API quota/budget exhausted
    """
    if not text or len(text.strip()) < 50:
        return []
    
    # Truncate very long text
    max_chars = 8000
    if len(text) > max_chars:
        text = text[:max_chars] + "... [truncated]"
    
    prompt = DECISION_EXTRACTION_PROMPT.format(text=text)
    
    # Try primary provider first
    try:
        response = call_llm(
            prompt=prompt,
            model=model,
            provider=provider,
            temperature=0.1,
            max_tokens=2000,
        )
        
        decisions = _parse_decision_response(response)
        return decisions[:max_decisions]
        
    except Exception as primary_error:
        if is_permanent_failure(primary_error):
            print(f"❌ {provider} quota exhausted (permanent failure)")
            raise PermanentAPIFailure(f"{provider} API quota exhausted")
        
        # Try fallback chain
        fallback_chain = get_fallback_chain(provider, "user")
        for fallback_provider, fallback_model in fallback_chain:
            try:
                print(f"⚠️ Retrying with {fallback_provider} {fallback_model}...")
                response = call_llm(
                    prompt=prompt,
                    model=fallback_model,
                    provider=fallback_provider,
                    temperature=0.1,
                    max_tokens=2000,
                )
                decisions = _parse_decision_response(response)
                return decisions[:max_decisions]
            except Exception as fallback_error:
                if is_permanent_failure(fallback_error):
                    continue
                continue
        
        print(f"❌ All LLM providers failed for decision extraction")
        raise RuntimeError(f"Decision extraction failed: {primary_error}")


def _parse_decision_response(response: str) -> list[Decision]:
    """
    Parse LLM response into list of Decision objects.
    
    Args:
        response: LLM response text (should be JSON array)
        
    Returns:
        List of Decision objects
    """
    if not response or not response.strip():
        return []
    
    # Try to extract JSON array from response
    json_match = re.search(r'\[.*\]', response, re.DOTALL)
    if json_match:
        json_str = json_match.group(0)
    else:
        json_str = response.strip()
    
    try:
        data = json.loads(json_str)
        if not isinstance(data, list):
            return []
        
        decisions = []
        for item in data:
            if not isinstance(item, dict):
                continue
            
            if "decision_text" not in item:
                continue
            
            decision = Decision(
                decision_text=item["decision_text"].strip(),
                decision_type=item.get("decision_type", "DECISION"),
                confidence=item.get("confidence", 1.0),
                context_snippet=item.get("context_snippet"),
                alternatives_considered=item.get("alternatives_considered", []),
                rationale=item.get("rationale"),
            )
            
            if decision.decision_text:
                decisions.append(decision)
        
        return decisions
        
    except json.JSONDecodeError as e:
        print(f"⚠️ Failed to parse decision extraction response as JSON: {e}")
        print(f"Response: {response[:200]}...")
        return []


def extract_trace_ids(text: str) -> list[str]:
    """
    Extract trace IDs from code comments (e.g., `# @trace-id: research_node_882`).
    
    Args:
        text: Code or conversation text
        
    Returns:
        List of trace ID strings found
    """
    pattern = r'#\s*@trace-id:\s*(\S+)'
    matches = re.findall(pattern, text, re.IGNORECASE)
    return matches
