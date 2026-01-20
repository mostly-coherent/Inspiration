"""
Triple Extractor — Extract Subject-Predicate-Object triples from text.

Phase 0: Triple-Based Foundation for Knowledge Graph construction.

Uses LLM-based extraction to identify triples (Subject-Predicate-Object) from text,
which serves as the foundation for entity and relation extraction.
"""

import json
import re
from dataclasses import dataclass
from typing import Optional

from .llm import call_llm, is_permanent_failure, PermanentAPIFailure, get_fallback_chain


@dataclass
class Triple:
    """A Subject-Predicate-Object triple extracted from text."""
    
    subject: str
    predicate: str
    object: str
    confidence: float = 1.0
    evidence_snippet: Optional[str] = None
    
    def __str__(self) -> str:
        return f"({self.subject}, {self.predicate}, {self.object})"
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "subject": self.subject,
            "predicate": self.predicate,
            "object": self.object,
            "confidence": self.confidence,
            "evidence_snippet": self.evidence_snippet,
        }


# Prompt template for triple extraction
TRIPLE_EXTRACTION_PROMPT = """Extract Subject-Predicate-Object triples from this conversation text.

A triple represents a factual relationship: (Subject, Predicate, Object)
- Subject: The entity or concept that performs the action or is described
- Predicate: The relationship or action connecting subject and object
- Object: The entity or concept that receives the action or is related to the subject

Examples:
- "React is a JavaScript library" → (React, is_a, JavaScript library)
- "We use Supabase for authentication" → (We, use, Supabase) AND (Supabase, provides, authentication)
- "Circuit Breaker pattern solves API failures" → (Circuit Breaker pattern, solves, API failures)
- "Next.js is built on React" → (Next.js, built_on, React)

Rules:
1. Extract factual, specific relationships (not opinions or vague statements)
2. Use natural language predicates (e.g., "solves", "enables", "uses", "built_on")
3. Subjects and objects should be specific entities (tools, patterns, concepts, people)
4. Skip generic or filler statements ("I think", "maybe", "probably")
5. Extract at most 10 triples per conversation
6. Provide a brief evidence snippet (quote) for each triple

Conversation:
{text}

Respond with a JSON array of triples. If no clear triples found, return empty array [].

Format:
[
  {{
    "subject": "Entity Name",
    "predicate": "relationship verb",
    "object": "Entity Name",
    "confidence": 0.9,
    "evidence_snippet": "Brief quote showing this relationship"
  }}
]

Only output the JSON array, no other text."""


def extract_triples(
    text: str,
    model: str = "gpt-4o-mini",
    provider: str = "openai",
    max_triples: int = 10,
    context: str = "user",
) -> list[Triple]:
    """
    Extract Subject-Predicate-Object triples from conversation text using LLM.
    
    Args:
        text: Conversation text to analyze
        model: LLM model to use (default: gpt-4o-mini for cost efficiency)
        provider: LLM provider (default: openai)
        max_triples: Maximum triples to extract per call
        context: "baseline" for high-quality baseline KG, "user" for user KG
        
    Returns:
        List of Triple objects
        
    Raises:
        PermanentAPIFailure: If API quota/budget exhausted (permanent failure)
    """
    if not text or len(text.strip()) < 20:
        return []
    
    # Truncate very long text to avoid token limits
    max_chars = 8000  # ~2000 tokens
    if len(text) > max_chars:
        text = text[:max_chars] + "... [truncated]"
    
    prompt = TRIPLE_EXTRACTION_PROMPT.format(text=text)
    
    # Try primary provider first
    try:
        response = call_llm(
            prompt=prompt,
            model=model,
            provider=provider,
            temperature=0.1,  # Low temperature for consistent extraction
            max_tokens=2000,
        )
        
        triples = _parse_triple_response(response)
        return triples[:max_triples]
        
    except Exception as primary_error:
        # Check if this is a permanent failure (budget exhausted)
        if is_permanent_failure(primary_error):
            print(f"❌ {provider} quota exhausted (permanent failure)")
            raise PermanentAPIFailure(f"{provider} API quota exhausted")
        
        # Try fallback chain
        fallback_chain = get_fallback_chain(provider, context)
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
                triples = _parse_triple_response(response)
                return triples[:max_triples]
            except Exception as fallback_error:
                if is_permanent_failure(fallback_error):
                    print(f"❌ {fallback_provider} quota exhausted")
                    continue
                # Continue to next fallback
                continue
        
        # All fallbacks failed
        print(f"❌ All LLM providers failed for triple extraction")
        raise RuntimeError(f"Triple extraction failed: {primary_error}")


def _parse_triple_response(response: str) -> list[Triple]:
    """
    Parse LLM response into list of Triple objects.
    
    Args:
        response: LLM response text (should be JSON array)
        
    Returns:
        List of Triple objects
    """
    if not response or not response.strip():
        return []
    
    # Try to extract JSON array from response
    # Handle cases where LLM adds extra text before/after JSON
    json_match = re.search(r'\[.*\]', response, re.DOTALL)
    if json_match:
        json_str = json_match.group(0)
    else:
        # Try parsing entire response as JSON
        json_str = response.strip()
    
    try:
        data = json.loads(json_str)
        if not isinstance(data, list):
            return []
        
        triples = []
        for item in data:
            if not isinstance(item, dict):
                continue
            
            # Validate required fields
            if "subject" not in item or "predicate" not in item or "object" not in item:
                continue
            
            triple = Triple(
                subject=item["subject"].strip(),
                predicate=item["predicate"].strip(),
                object=item["object"].strip(),
                confidence=item.get("confidence", 1.0),
                evidence_snippet=item.get("evidence_snippet"),
            )
            
            # Skip empty or invalid triples
            if triple.subject and triple.predicate and triple.object:
                triples.append(triple)
        
        return triples
        
    except json.JSONDecodeError as e:
        print(f"⚠️ Failed to parse triple extraction response as JSON: {e}")
        print(f"Response: {response[:200]}...")
        return []


def triples_to_entities(triples: list[Triple]) -> set[str]:
    """
    Extract unique entity names from triples (subjects and objects).
    
    Args:
        triples: List of Triple objects
        
    Returns:
        Set of unique entity names
    """
    entities = set()
    for triple in triples:
        if triple.subject:
            entities.add(triple.subject)
        if triple.object:
            entities.add(triple.object)
    return entities


def triples_to_relations(triples: list[Triple]) -> list[dict]:
    """
    Convert triples to relation dictionaries for relation extraction.
    
    Args:
        triples: List of Triple objects
        
    Returns:
        List of relation dictionaries with subject, predicate, object
    """
    relations = []
    for triple in triples:
        relations.append({
            "source": triple.subject,
            "target": triple.object,
            "predicate": triple.predicate,
            "confidence": triple.confidence,
            "evidence": triple.evidence_snippet,
        })
    return relations
