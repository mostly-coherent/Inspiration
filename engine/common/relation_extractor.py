"""
Relation Extractor for Knowledge Graph

Extracts relationships between entities from conversation text using LLM.
"""

import json
import os
from typing import Optional

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    openai = None
    OPENAI_AVAILABLE = False

from .knowledge_graph import (
    RelationType,
    ExtractedRelation,
    KG_SKIP_LIST,
)

# System prompt for relation extraction
RELATION_EXTRACTION_PROMPT = """You are a knowledge graph relation extractor. Given a conversation about software development, extract RELATIONSHIPS between entities.

RELATION TYPES:
- SOLVES: tool/pattern addresses a problem (e.g., "React Query SOLVES caching")
- CAUSES: one problem leads to another (e.g., "N+1 queries CAUSES slow response")
- ENABLES: tool/pattern makes something possible (e.g., "pgvector ENABLES semantic search")
- PART_OF: component relationship (e.g., "Auth middleware PART_OF API layer")
- USED_WITH: commonly paired together (e.g., "Prisma USED_WITH Supabase")
- ALTERNATIVE_TO: similar purpose (e.g., "React Query ALTERNATIVE_TO SWR")
- REQUIRES: dependency (e.g., "pgvector REQUIRES PostgreSQL")
- IMPLEMENTS: realizes a concept (e.g., "Retry logic IMPLEMENTS resilience pattern")

RULES:
1. Only extract relationships that are EXPLICIT or STRONGLY IMPLIED in the text
2. Both source and target must be specific, named entities (not generic terms)
3. Extract at most 5 relationships per conversation
4. Skip vague or uncertain relationships
5. Provide a brief evidence snippet (quote or paraphrase) for each relation

OUTPUT FORMAT (JSON array):
[
  {
    "source": "Entity Name",
    "target": "Entity Name",
    "relation": "SOLVES",
    "evidence": "Brief quote or paraphrase showing this relationship",
    "confidence": 0.9
  }
]

If no clear relationships exist, return an empty array: []
"""


class RelationExtractor:
    """Extracts relationships between entities using LLM."""

    def __init__(self, model: str = "gpt-4o-mini", provider: str = "openai"):
        self.model = model
        self.provider = provider
        self.skip_list = set(s.lower() for s in KG_SKIP_LIST)
        self.valid_relation_types = set(rt.value for rt in RelationType)
        
        # Only initialize OpenAI client if using OpenAI provider
        if provider == "openai":
            if not OPENAI_AVAILABLE:
                raise RuntimeError("OpenAI package not installed")
            api_key = os.environ.get("OPENAI_API_KEY")
            if not api_key:
                raise RuntimeError("OPENAI_API_KEY environment variable not set")
            self.client = openai.OpenAI(api_key=api_key)
        else:
            self.client = None

    def extract_relations(
        self,
        text: str,
        known_entities: Optional[list[str]] = None,
    ) -> list[ExtractedRelation]:
        """
        Extract relationships from text.
        
        Args:
            text: Conversation text to analyze
            known_entities: Optional list of entity names to focus on
            
        Returns:
            List of ExtractedRelation objects
        """
        if not text or len(text.strip()) < 50:
            return []

        # Truncate very long texts
        if len(text) > 8000:
            text = text[:8000] + "..."

        # Build prompt
        user_prompt = f"Conversation:\n{text}"
        if known_entities:
            entity_hint = ", ".join(known_entities[:20])
            user_prompt += f"\n\nKnown entities in this conversation: {entity_hint}"

        try:
            # Use appropriate API based on provider
            if self.provider == "openai" and self.client:
                response = self.client.chat.completions.create(
                    model=self.model,
                    messages=[
                        {"role": "system", "content": RELATION_EXTRACTION_PROMPT},
                        {"role": "user", "content": user_prompt},
                    ],
                    temperature=0.1,
                    max_tokens=1000,
                    response_format={"type": "json_object"},
                    timeout=30.0,
                )
                content = response.choices[0].message.content if response.choices else None
            else:
                # Use Anthropic via llm.py
                from engine.common.llm import call_llm
                content = call_llm(
                    prompt=user_prompt,
                    system_prompt=RELATION_EXTRACTION_PROMPT,
                    model=self.model,
                    provider=self.provider,
                    temperature=0.1,
                    max_tokens=1000,
                )
            
            if not content:
                return []

            # Strip markdown code blocks if present (Claude often wraps responses)
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]  # Remove ```json
            elif content.startswith("```"):
                content = content[3:]  # Remove ```
            if content.endswith("```"):
                content = content[:-3]  # Remove trailing ```
            content = content.strip()

            # Parse JSON response
            try:
                data = json.loads(content)
            except json.JSONDecodeError as json_err:
                print(f"[RelationExtractor] JSON decode error: {json_err}")
                print(f"[RelationExtractor] Raw content: {content[:200]}...")
                return []
            
            # Handle multiple formats:
            # 1. {"relations": [...]} or {"relationships": [...]} - wrapped array
            # 2. [...] - direct array
            # 3. {"source": ..., "target": ...} - single object (wrap in array)
            if isinstance(data, list):
                relations_data = data
            elif isinstance(data, dict):
                if "relations" in data:
                    relations_data = data["relations"]
                elif "relationships" in data:
                    # LLM sometimes uses "relationships" instead of "relations"
                    relations_data = data["relationships"]
                elif "source" in data and "target" in data:
                    # Single relation object, wrap in array
                    relations_data = [data]
                else:
                    relations_data = []
            else:
                relations_data = []
            
            if not isinstance(relations_data, list):
                return []

            relations = []
            for item in relations_data:
                relation = self._parse_relation(item)
                if relation:
                    relations.append(relation)

            return relations

        except Exception as e:
            # Handle OpenAI API errors (rate limits, network issues, etc.)
            error_msg = str(e)
            if "rate limit" in error_msg.lower():
                print(f"[RelationExtractor] Rate limit error: {e}")
            elif "timeout" in error_msg.lower():
                print(f"[RelationExtractor] Timeout error: {e}")
            elif "network" in error_msg.lower() or "connection" in error_msg.lower():
                print(f"[RelationExtractor] Network error: {e}")
            else:
                print(f"[RelationExtractor] Error: {e}")
            return []

    def _parse_relation(self, data: dict) -> Optional[ExtractedRelation]:
        """Parse a single relation from the LLM response."""
        try:
            source = data.get("source", "").strip()
            target = data.get("target", "").strip()
            relation = data.get("relation", "").upper().strip()
            evidence = data.get("evidence", "").strip()
            confidence = float(data.get("confidence", 0.8))

            # Validate required fields
            if not source or not target or not relation:
                return None

            # Skip if source or target is in skip list
            if source.lower() in self.skip_list or target.lower() in self.skip_list:
                return None

            # Skip self-referential relations
            if source.lower() == target.lower():
                return None

            # Validate relation type
            if relation not in self.valid_relation_types:
                # Try to map common variations
                relation_map = {
                    "USES": "USED_WITH",
                    "DEPENDS_ON": "REQUIRES",
                    "FIXES": "SOLVES",
                    "RESOLVES": "SOLVES",
                    "LEADS_TO": "CAUSES",
                    "TRIGGERS": "CAUSES",
                    "SUPPORTS": "ENABLES",
                    "ALLOWS": "ENABLES",
                    "IS_PART_OF": "PART_OF",
                    "BELONGS_TO": "PART_OF",
                    "REPLACES": "ALTERNATIVE_TO",
                    "SIMILAR_TO": "ALTERNATIVE_TO",
                    "NEEDS": "REQUIRES",
                    "REALIZES": "IMPLEMENTS",
                }
                relation = relation_map.get(relation, None)
                if not relation:
                    return None

            # Parse relation type
            try:
                relation_type = RelationType(relation)
            except ValueError:
                return None

            # Clamp confidence
            confidence = max(0.0, min(1.0, confidence))

            return ExtractedRelation(
                source_name=source,
                target_name=target,
                relation_type=relation_type,
                evidence_snippet=evidence[:500] if evidence else None,
                confidence=confidence,
            )

        except Exception as e:
            print(f"[RelationExtractor] Parse error: {e}")
            return None


# Module-level instance for convenience
_extractor: Optional[RelationExtractor] = None


def get_relation_extractor(model: str = "gpt-4o-mini", provider: str = "openai") -> RelationExtractor:
    """Get or create a relation extractor. Note: Not cached per model/provider combo."""
    return RelationExtractor(model=model, provider=provider)


def extract_relations(
    text: str,
    known_entities: Optional[list[str]] = None,
    model: str = "gpt-4o-mini",
    provider: str = "openai",
) -> list[ExtractedRelation]:
    """
    Convenience function to extract relations from text.
    
    Args:
        text: Conversation text to analyze
        known_entities: Optional list of entity names to focus on
        model: LLM model to use
        provider: LLM provider (openai or anthropic)
        
    Returns:
        List of ExtractedRelation objects
    """
    extractor = get_relation_extractor(model=model, provider=provider)
    return extractor.extract_relations(text, known_entities)
