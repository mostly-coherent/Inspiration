"""
Quality filters for Knowledge Graph extraction.

Determines which chunks are worth indexing and validates extracted entities.
"""

import re
from typing import List, Tuple
from dataclasses import dataclass


@dataclass
class ChunkQualityScore:
    """Quality score for a chunk of content."""
    score: float  # 0-1
    should_index: bool
    signals: List[str]
    reason: str


# Generic/low-value terms to filter out
GENERIC_TERMS = {
    # Too vague
    'thing', 'stuff', 'it', 'this', 'that', 'way', 'method', 'approach',
    'process', 'system', 'solution', 'idea', 'concept', 'strategy',
    
    # Too common in tech context
    'code', 'feature', 'app', 'product', 'user', 'data', 'file', 'project',
    
    # Pronouns/articles
    'i', 'you', 'we', 'they', 'the', 'a', 'an',
}

# Keywords that signal high-value content
PROBLEM_KEYWORDS = [
    'problem', 'challenge', 'issue', 'bottleneck', 'pain point',
    'struggle', 'difficulty', 'obstacle', 'blocker', 'friction',
    'bug', 'error', 'failure', 'broken', 'slow'
]

SOLUTION_KEYWORDS = [
    'solved', 'built', 'implemented', 'fixed', 'optimized',
    'approach', 'pattern', 'technique', 'strategy', 'framework',
    'tool', 'library', 'architecture', 'design', 'algorithm'
]

COMPARATIVE_KEYWORDS = [
    'vs', 'versus', 'compared to', 'alternative', 'instead of',
    'trade-off', 'pros and cons', 'better than', 'worse than',
    'different from', 'similar to'
]

# REMOVED: Domain-specific keywords create bias
# The filter must work for ANY domain: PM, design, engineering, marketing,
# branding, AI/ML, startup strategy, tech history, psychology, etc.
# Quality should be domain-agnostic: specific, actionable, reusable.

# Sponsor ad patterns to exclude (podcast sponsor reads)
SPONSOR_AD_PATTERNS = [
    r'this episode is brought to you by',
    r'sponsored by',
    r'brought to you by',
    r"today's sponsor",
    r'special thanks to our sponsor',
    r'check out \w+ at',
    r'use code \w+ for',
    r'get \d+% off',
    r'sign up.*free trial',
    r'visit \w+\.com\/\w+',
    r'head to \w+\.com',
    r'go to \w+\.com',
    r'promo code',
    r'discount code',
    r'free trial at',
    r'links in the show notes',
]


def is_sponsor_ad(chunk_text: str) -> bool:
    """Check if chunk is primarily a sponsor ad."""
    chunk_lower = chunk_text.lower()
    # Count how many sponsor patterns match
    matches = sum(1 for pattern in SPONSOR_AD_PATTERNS if re.search(pattern, chunk_lower))
    # If 2+ patterns match, it's likely a sponsor read
    return matches >= 2


def score_chunk_quality(chunk_text: str, content_type: str = "general") -> ChunkQualityScore:
    """
    Score a chunk for KG extraction worthiness (DOMAIN-AGNOSTIC).
    
    Works for ANY domain: PM, design, engineering, marketing, branding,
    AI/ML, startup strategy, tech history, psychology, leadership, etc.
    
    Quality = Specific + Actionable + Reusable (regardless of domain)
    
    Args:
        chunk_text: The text content to score
        content_type: "chat" for user chats, "podcast" for Lenny, "general" for other
    
    Returns:
        ChunkQualityScore with decision and reasoning
    """
    # Early exit: Skip sponsor ads (especially for podcast content)
    if content_type == "podcast" and is_sponsor_ad(chunk_text):
        return ChunkQualityScore(
            score=0.0,
            should_index=False,
            signals=["sponsor_ad"],
            reason="Sponsor ad detected - skipped"
        )

    score = 0.0
    signals = []
    chunk_lower = chunk_text.lower()
    
    # Signal 1: Named entities (capitalized words/phrases)
    # Works for ANY domain: "Figma", "Kubernetes", "World Model", "Y Combinator"
    named_entity_pattern = r'\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\b'
    named_entities = re.findall(named_entity_pattern, chunk_text)
    # Filter out common words (I, The, A)
    named_entities = [ne for ne in named_entities if ne.lower() not in {'i', 'the', 'a', 'an', 'in', 'on', 'at', 'to'}]
    
    if len(named_entities) >= 3:
        score += 0.30  # Increased weight - strong universal signal
        signals.append(f"{len(named_entities)} named entities")
    
    # Signal 2: Technical/Specific terms (camelCase, kebab-case, proper nouns)
    # Works for ANY domain: camelCase code, design-system, brand names
    tech_patterns = [
        r'\b[a-z]+[A-Z][a-zA-Z]*\b',  # camelCase, PascalCase
        r'\b[a-z]+-[a-z]+(?:-[a-z]+)*\b',  # kebab-case (multi-word)
        r'\b[A-Z_]{3,}\b',             # SCREAMING_CASE
        r'\b\w+\.\w+\b'                # package.name, domain.com
    ]
    
    has_tech = any(re.search(pattern, chunk_text) for pattern in tech_patterns)
    if has_tech:
        score += 0.15
        signals.append("specific terminology")
    
    # Signal 3: Problem + Solution structure
    # Works for ANY domain: design problems, engineering problems, business problems
    has_problem = any(kw in chunk_lower for kw in PROBLEM_KEYWORDS)
    has_solution = any(kw in chunk_lower for kw in SOLUTION_KEYWORDS)
    
    if has_problem and has_solution:
        score += 0.35  # Highest weight - describes actionable knowledge
        signals.append("problem + solution")
    elif has_problem:
        score += 0.15
        signals.append("describes problem")
    elif has_solution:
        score += 0.15
        signals.append("describes solution")
    
    # Signal 4: Comparative analysis
    # Works for ANY domain: tool comparisons, strategy trade-offs, approach alternatives
    has_comparative = any(comp in chunk_lower for comp in COMPARATIVE_KEYWORDS)
    if has_comparative:
        score += 0.20
        signals.append("comparative analysis")
    
    # Signal 5: Metrics/Data present
    # Works for ANY domain: performance metrics, business metrics, user research data
    has_metrics = bool(re.search(r'\d+%|\d+x|\$\d+|\d+,\d+|\d+\.\d+x', chunk_text))
    if has_metrics:
        score += 0.15
        signals.append("contains metrics")
    
    # Signal 6: Framework/Method indicators (when combined with specific names)
    # Works for ANY domain: "RICE framework", "Design Thinking", "Circuit Breaker pattern"
    framework_indicators = ['framework', 'methodology', 'approach', 'pattern', 'system',
                           'model', 'principle', 'technique', 'strategy', 'method']
    
    # Only score if framework indicators appear WITH named entities (avoids generic "approach")
    if len(named_entities) >= 2 and any(ind in chunk_lower for ind in framework_indicators):
        score += 0.10
        signals.append("named framework/method")
    
    # Cap at 1.0
    score = min(score, 1.0)

    # Threshold: 0.30+ is worth indexing (lowered from 0.35 to capture more content)
    # This allows borderline chunks (0.30-0.34) to be indexed while filtering noise
    threshold = 0.30
    should_index = score >= threshold
    
    if should_index:
        reason = f"High signal ({score:.2f}): " + ", ".join(signals)
    else:
        reason = f"Low signal ({score:.2f})"
        if not signals:
            reason += " - no clear entities or concepts"
    
    return ChunkQualityScore(
        score=score,
        should_index=should_index,
        signals=signals,
        reason=reason
    )


def validate_entity(entity_name: str, entity_type: str, chunk_text: str) -> Tuple[bool, str]:
    """
    Validate if an extracted entity is high-quality.
    
    Returns:
        (is_valid, rejection_reason)
    """
    name_lower = entity_name.lower().strip()
    
    # Gate 1: Must be in the chunk (case-insensitive)
    if name_lower not in chunk_text.lower():
        return False, "not_in_chunk"
    
    # Gate 2: Not too generic
    if name_lower in GENERIC_TERMS:
        return False, "too_generic"
    
    # Gate 3: Reasonable length (1-5 words for most types)
    word_count = len(entity_name.split())
    if word_count > 5:
        return False, "too_long"
    if word_count == 0:
        return False, "empty"
    
    # Gate 4: Not just a pronoun or article
    if name_lower in {'i', 'you', 'we', 'they', 'it', 'this', 'that', 'the', 'a', 'an'}:
        return False, "pronoun_or_article"
    
    # Gate 5: Type-specific validation
    if entity_type == "tool":
        # Tools should be proper nouns or have technical naming
        if not (entity_name[0].isupper() or re.search(r'[A-Z]|\.|-|_', entity_name)):
            return False, "tool_not_proper_noun"
    
    elif entity_type == "concept":
        # Concepts should be substantive (not single short words)
        if len(entity_name) < 4 and word_count == 1:
            return False, "concept_too_short"
        # Concepts often have multiple words or are capitalized
        if word_count == 1 and not entity_name[0].isupper():
            # Single word concepts should be somewhat substantial
            if len(entity_name) < 6:
                return False, "concept_not_substantial"
    
    elif entity_type == "person":
        # Persons should have capital letters
        if not entity_name[0].isupper():
            return False, "person_not_capitalized"
    
    elif entity_type == "pattern":
        # Patterns should be descriptive (multiple words or technical terms)
        if word_count == 1 and len(entity_name) < 6:
            return False, "pattern_not_descriptive"
    
    # Gate 6: Not just numbers or symbols
    if re.match(r'^[\d\s\-_\.]+$', entity_name):
        return False, "only_numbers_symbols"
    
    # Passed all gates
    return True, "valid"


def estimate_indexing_cost(
    total_chunks: int,
    avg_chunk_size: int = 200,  # tokens
    model: str = "claude-haiku-4-5",
    with_relations: bool = True
) -> dict:
    """
    Estimate cost for indexing a corpus.
    
    Args:
        total_chunks: Number of chunks to process
        avg_chunk_size: Average tokens per chunk
        model: LLM model to use
        with_relations: Whether to extract relations
    
    Returns:
        Dict with cost breakdown
    """
    # Model pricing (per 1M tokens)
    pricing = {
        "claude-haiku-4-5": {
            "input": 1.00,   # $1 per 1M input tokens
            "output": 5.00   # $5 per 1M output tokens
        },
        "gpt-4o-mini": {
            "input": 0.15,
            "output": 0.60
        }
    }
    
    if model not in pricing:
        model = "claude-haiku-4-5"  # Default
    
    prices = pricing[model]
    
    # Input tokens: chunk + system prompt (~500 tokens)
    input_tokens_per_chunk = avg_chunk_size + 500
    total_input_tokens = total_chunks * input_tokens_per_chunk
    
    # Output tokens: entity extraction (~300 tokens avg)
    output_tokens_per_chunk = 300
    if with_relations:
        output_tokens_per_chunk += 400  # Relation extraction adds ~400 tokens
    
    total_output_tokens = total_chunks * output_tokens_per_chunk
    
    # Calculate costs
    input_cost = (total_input_tokens / 1_000_000) * prices["input"]
    output_cost = (total_output_tokens / 1_000_000) * prices["output"]
    total_cost = input_cost + output_cost
    
    # Estimate time (based on empirical data: 19.8 chunks/min with Haiku 4.5)
    chunks_per_min = 19.8 if model == "claude-haiku-4-5" else 7.0
    total_time_min = total_chunks / chunks_per_min
    total_time_hours = total_time_min / 60
    
    return {
        "model": model,
        "total_chunks": total_chunks,
        "total_cost_usd": round(total_cost, 2),
        "input_cost_usd": round(input_cost, 2),
        "output_cost_usd": round(output_cost, 2),
        "estimated_time_hours": round(total_time_hours, 2),
        "estimated_time_minutes": round(total_time_min, 0),
        "with_relations": with_relations,
        "cost_per_chunk": round(total_cost / total_chunks, 4) if total_chunks > 0 else 0
    }


def analyze_quality_metrics(entities: List[dict], chunk_count: int) -> dict:
    """
    Analyze quality of extracted entities.
    
    Returns metrics for dashboard/monitoring.
    """
    from collections import Counter
    
    # Hit rate: % of chunks that yielded entities
    chunks_with_entities = len(set(e.get('source_chunk_id') for e in entities if e.get('source_chunk_id')))
    hit_rate = chunks_with_entities / chunk_count if chunk_count > 0 else 0
    
    # Type distribution
    type_counts = Counter(e['entity_type'] for e in entities)
    
    # Specificity: % of entities with 2+ words (more specific)
    multi_word_entities = sum(1 for e in entities if len(e['canonical_name'].split()) >= 2)
    specificity_rate = multi_word_entities / len(entities) if entities else 0
    
    # Uniqueness: % of entities mentioned only once (might indicate noise)
    mention_counts = Counter(e['canonical_name'] for e in entities)
    single_mention = sum(1 for count in mention_counts.values() if count == 1)
    uniqueness_rate = single_mention / len(mention_counts) if mention_counts else 0
    
    return {
        "total_entities": len(entities),
        "unique_entities": len(mention_counts),
        "chunks_with_entities": chunks_with_entities,
        "hit_rate": round(hit_rate * 100, 1),
        "specificity_rate": round(specificity_rate * 100, 1),
        "uniqueness_rate": round(uniqueness_rate * 100, 1),
        "type_distribution": dict(type_counts),
        "avg_mentions_per_entity": round(len(entities) / len(mention_counts), 2) if mention_counts else 0
    }
