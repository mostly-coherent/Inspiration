"""
Entity Extractor — LLM-based entity extraction from conversation text.

Uses GPT-4o-mini for cost-efficient structured output extraction.
"""

import json
import re
from typing import Optional

from .knowledge_graph import EntityType, ExtractedEntity
from .llm import call_llm, is_permanent_failure, PermanentAPIFailure, get_fallback_chain


# Prompt template for entity extraction
ENTITY_EXTRACTION_PROMPT = """Analyze this conversation text and extract notable entities.

Entity Types:
- tool: Technologies, frameworks, libraries, services (React, Supabase, Prisma, AWS, Cursor)
- pattern: Design patterns, architectural approaches (caching, retry logic, error boundaries, pub/sub)
- problem: Issues, bugs, challenges, pain points (auth timeout, race condition, N+1 query, memory leak)
- concept: Abstract principles, mental models (DRY, composition, idempotency, eventual consistency)
- person: People mentioned by name (Lenny Rachitsky, Dan Abramov, specific team members)
- project: Specific projects, codebases, repos mentioned (not generic terms)
- workflow: Processes, methodologies (TDD, code review, pair programming, standup)
- unknown: Entities that don't fit other categories (companies, organizations, metrics, KPIs, events, conferences, products, brands, etc.)

Extraction Rules:
1. Only extract SPECIFIC, NAMED entities (not generic terms like "the database" or "my code")
2. Prefer proper capitalization (React, not react; Supabase, not supabase)
3. Include aliases if the same entity is referred to differently in the text
4. Assign confidence 0.7-1.0 based on how clearly the entity is referenced
5. Skip very common/generic terms (JavaScript, Python, API, function, etc.) unless they're the main focus
6. For tools, only include if it's clear the user is actively using or discussing it
7. Use "unknown" type for entities that don't clearly fit other categories (companies, metrics, events, products, etc.)

Conversation:
{text}

Respond with a JSON array of entities. If no notable entities found, return empty array [].

Format:
[
  {{"name": "Entity Name", "type": "tool|pattern|problem|concept|person|project|workflow|unknown", "aliases": ["alias1"], "confidence": 0.9}},
  ...
]

Only output the JSON array, no other text."""


def extract_entities(
    text: str,
    model: str = "gpt-4o-mini",
    max_entities: int = 20,
    provider: str = "openai",
    context: str = "user",
) -> list[ExtractedEntity]:
    """
    Extract entities from conversation text using LLM with circuit breaker.
    
    Args:
        text: Conversation text to analyze
        model: LLM model to use (default: gpt-4o-mini for cost efficiency)
        max_entities: Maximum entities to extract per call
        provider: LLM provider (default: openai)
        context: "baseline" for high-quality baseline KG, "user" for user KG
        
    Returns:
        List of ExtractedEntity objects
        
    Raises:
        PermanentAPIFailure: If API quota/budget exhausted (permanent failure)
    """
    if not text or len(text.strip()) < 20:
        return []
    
    # Truncate very long text to avoid token limits
    max_chars = 8000  # ~2000 tokens
    if len(text) > max_chars:
        text = text[:max_chars] + "... [truncated]"
    
    prompt = ENTITY_EXTRACTION_PROMPT.format(text=text)
    
    # Try primary provider first
    try:
        response = call_llm(
            prompt=prompt,
            model=model,
            provider=provider,
            temperature=0.1,  # Low temperature for consistent extraction
            max_tokens=2000,
        )
        
        entities = _parse_extraction_response(response)
        return entities[:max_entities]
        
    except Exception as primary_error:
        # Check if this is a permanent failure (budget exhausted)
        if is_permanent_failure(primary_error):
            print(f"❌ {provider} quota exhausted (permanent failure)")
            
            # Try fallback chain based on context
            fallback_chain = get_fallback_chain(context)
            print(f"   Trying fallback chain: {[f'{p}/{m}' for p, m in fallback_chain]}")
            
            last_error = primary_error
            for fallback_provider, fallback_model in fallback_chain:
                # Skip if this is the same provider/model we just tried
                if fallback_provider == provider and fallback_model == model:
                    continue
                    
                try:
                    print(f"   Trying fallback: {fallback_provider}/{fallback_model}")
                    response = call_llm(
                        prompt=prompt,
                        model=fallback_model,
                        provider=fallback_provider,
                        temperature=0.1,
                        max_tokens=2000,
                    )
                    
                    entities = _parse_extraction_response(response)
                    print(f"   ✅ Fallback successful: {fallback_provider}/{fallback_model}")
                    return entities[:max_entities]
                    
                except Exception as fallback_error:
                    if is_permanent_failure(fallback_error):
                        print(f"   ❌ {fallback_provider} also quota exhausted")
                        last_error = fallback_error
                        continue
                    else:
                        # Transient error on fallback - try next
                        print(f"   ⚠️ {fallback_provider} transient error: {fallback_error}")
                        last_error = fallback_error
                        continue
            
            # All fallbacks exhausted
            if context == "baseline":
                raise PermanentAPIFailure(
                    f"Baseline KG: All high-quality models exhausted. "
                    f"Cannot use GPT-3.5 for baseline quality. "
                    f"Wait for quota reset or add budget."
                ) from last_error
            else:
                raise PermanentAPIFailure(
                    f"All fallback providers exhausted: {last_error}"
                ) from last_error
        
        # Transient error - log and return empty
        print(f"⚠️ Entity extraction failed (transient): {primary_error}")
        return []


def _parse_extraction_response(response: str) -> list[ExtractedEntity]:
    """Parse LLM response into ExtractedEntity objects."""
    
    # First, try to extract JSON array directly
    json_str = _extract_json_array(response)
    data = None
    
    # If no array found, try parsing the entire response as JSON
    if not json_str:
        try:
            # Try parsing the full response (might be {"entities": [...]} or just {...})
            full_data = json.loads(response.strip())
            if isinstance(full_data, dict):
                # Check for "entities" key
                if "entities" in full_data and isinstance(full_data["entities"], list):
                    data = full_data["entities"]
                else:
                    return []
            elif isinstance(full_data, list):
                data = full_data
            else:
                return []
        except (json.JSONDecodeError, AttributeError, TypeError):
            return []
    else:
        # Parse the extracted JSON string
        try:
            parsed = json.loads(json_str)
            # Ensure it's a list (handle case where it's wrapped in an object)
            if isinstance(parsed, dict) and "entities" in parsed:
                data = parsed["entities"]
            elif isinstance(parsed, list):
                data = parsed
            else:
                return []
        except json.JSONDecodeError:
            return []
    
    # Process entities from the parsed data
    if not isinstance(data, list):
        return []
    
    entities = []
    for item in data:
        if not isinstance(item, dict):
            continue
            
        name = item.get("name", "").strip()
        type_str = item.get("type", "").strip().lower()
        
        if not name or not type_str:
            continue
        
        # Validate entity type
        try:
            entity_type = EntityType.from_string(type_str)
        except ValueError:
            continue
        
        # Skip very short or generic names
        if len(name) < 2 or name.lower() in SKIP_ENTITIES:
            continue
        
        entities.append(ExtractedEntity(
            name=name,
            entity_type=entity_type,
            aliases=item.get("aliases", []) or [],
            confidence=min(1.0, max(0.0, float(item.get("confidence", 0.8)))),
        ))
    
    return entities


def _extract_json_array(text: str) -> Optional[str]:
    """Extract JSON array from text, handling markdown code blocks."""
    
    # Try to find JSON array in markdown code block
    code_block_match = re.search(r"```(?:json)?\s*(\[[\s\S]*?\])\s*```", text)
    if code_block_match:
        return code_block_match.group(1)
    
    # Try to find raw JSON array
    array_match = re.search(r"\[[\s\S]*\]", text)
    if array_match:
        return array_match.group(0)
    
    return None


# Entities to skip (too generic or common)
SKIP_ENTITIES = {
    # Generic programming terms
    "api", "function", "method", "class", "variable", "code", "file", "folder",
    "database", "server", "client", "frontend", "backend", "app", "application",
    "module", "package", "library", "framework", "tool", "service",
    
    # Very common languages (skip unless main focus)
    "javascript", "typescript", "python", "html", "css", "sql",
    
    # Generic actions
    "build", "deploy", "test", "debug", "fix", "update", "create", "delete",
    
    # Vague terms
    "issue", "problem", "bug", "error", "thing", "stuff", "it", "this", "that",
}


def extract_entities_batch(
    texts: list[str],
    model: str = "gpt-4o-mini",
    max_entities_per_text: int = 10,
) -> list[list[ExtractedEntity]]:
    """
    Extract entities from multiple texts.
    
    Args:
        texts: List of conversation texts
        model: LLM model to use
        max_entities_per_text: Max entities per text
        
    Returns:
        List of entity lists (one per input text)
    """
    results = []
    for text in texts:
        entities = extract_entities(text, model, max_entities_per_text)
        results.append(entities)
    return results


# For testing
if __name__ == "__main__":
    test_text = """
    I've been working on implementing React Server Components with Supabase for my 
    Inspiration project. The main challenge is handling the caching layer properly - 
    I keep running into N+1 query problems. Dan Abramov's blog post about streaming 
    helped me understand the hydration issues better. I'm using Prisma as the ORM 
    and pgvector for semantic search.
    """
    
    print("Testing entity extraction...")
    entities = extract_entities(test_text)
    print(f"\nFound {len(entities)} entities:")
    for e in entities:
        print(f"  - {e.name} ({e.entity_type.value}) [confidence: {e.confidence}]")
        if e.aliases:
            print(f"    Aliases: {e.aliases}")
