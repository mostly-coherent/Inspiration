"""
Relationship Canonicalizer — Group similar relationship predicates into canonical forms.

Part of Relationship Grouping (P3): Prevents predicate explosion by grouping
similar relationships ("talked about", "discussed", "mentioned" → "MENTIONED")
into canonical relation types.
"""

import json
from typing import Any, Optional
from dataclasses import dataclass
from collections import defaultdict

from .llm import call_llm
from .config import load_env_file


@dataclass
class RelationGroup:
    """A group of similar relationship predicates."""
    canonical_type: str
    predicates: list[str]
    example_relations: list[dict]
    confidence: float
    rationale: str


@dataclass
class CanonicalRelation:
    """A canonical relation type with grouped predicates."""
    canonical_type: str
    description: str
    grouped_predicates: list[str]
    example_count: int


class RelationshipCanonicalizer:
    """
    Group similar relationship predicates into canonical forms.
    
    Process:
    1. Fetch all unique relation_type values from kg_relations
    2. Group similar predicates using LLM analysis
    3. Build Dynamic Ontology of canonical relations
    4. Return groupings for human validation
    """
    
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        load_env_file()
    
    def fetch_unique_relation_types(self) -> list[dict]:
        """
        Fetch all unique relation_type values with counts.
        
        Returns list of dicts with: relation_type, count, example_relations
        """
        # Get unique relation types with counts
        result = self.supabase.table("kg_relations").select("relation_type").execute()
        
        if not result.data:
            return []
        
        # Count occurrences
        type_counts = defaultdict(int)
        type_examples = defaultdict(list)
        
        for rel in result.data:
            rel_type = rel.get("relation_type")
            if rel_type:
                type_counts[rel_type] += 1
                # Store up to 3 examples per type
                if len(type_examples[rel_type]) < 3:
                    type_examples[rel_type].append(rel)
        
        # Format results
        unique_types = []
        for rel_type, count in type_counts.items():
            unique_types.append({
                "relation_type": rel_type,
                "count": count,
                "examples": type_examples[rel_type][:3]
            })
        
        # Sort by count (most common first)
        unique_types.sort(key=lambda x: x["count"], reverse=True)
        
        return unique_types
    
    def group_similar_predicates(
        self,
        relation_types: list[dict],
        similarity_threshold: float = 0.7
    ) -> list[RelationGroup]:
        """
        Use LLM to group similar relationship predicates.
        
        Args:
            relation_types: List of relation type dicts with counts
            similarity_threshold: Minimum confidence for grouping
        
        Returns:
            List of RelationGroup objects
        """
        if len(relation_types) < 2:
            return []
        
        # Build prompt for LLM
        type_list = "\n".join([
            f"- {rt['relation_type']} ({rt['count']} occurrences)"
            for rt in relation_types[:50]  # Limit to top 50 for prompt size
        ])
        
        prompt = f"""Analyze these relationship predicates and group similar ones into canonical forms.

Current relation types:
{type_list}

Existing canonical types in the system:
- SOLVES: tool/pattern SOLVES problem
- CAUSES: problem CAUSES problem (cascade)
- ENABLES: pattern/tool ENABLES capability
- PART_OF: entity is component of larger entity
- USED_WITH: entities commonly used together
- ALTERNATIVE_TO: entities serve similar purpose
- REQUIRES: entity depends on another
- IMPLEMENTS: pattern/tool IMPLEMENTS concept
- MENTIONED_BY: person MENTIONED entity (expert attribution)

Group similar predicates together. For example:
- "talked about", "discussed", "mentioned", "brought up" → "MENTIONED"
- "founder of", "started by", "created by" → "FOUNDED_BY"
- "works at", "employed by", "part of" → "WORKS_AT"

Respond in JSON format with array of groups:
[
    {{
        "canonical_type": "MENTIONED",
        "predicates": ["talked about", "discussed", "mentioned"],
        "confidence": 0.9,
        "rationale": "All describe entities being referenced or discussed"
    }},
    ...
]

Only group predicates that are semantically similar. Don't force grouping."""
        
        try:
            response = call_llm(
                prompt,
                provider="anthropic",
                model="claude-3-5-sonnet-20241022",
                temperature=0.2,  # Low temperature for consistent grouping
                max_tokens=2000
            )
            
            # Parse JSON response
            response_text = response.strip()
            # Remove markdown code blocks if present
            if response_text.startswith("```"):
                lines = response_text.split("\n")
                response_text = "\n".join(lines[1:-1]) if len(lines) > 2 else response_text
            
            groups_data = json.loads(response_text)
            
            # Convert to RelationGroup objects
            groups = []
            for group_data in groups_data:
                if group_data.get("confidence", 0) >= similarity_threshold:
                    group = RelationGroup(
                        canonical_type=group_data.get("canonical_type", ""),
                        predicates=group_data.get("predicates", []),
                        example_relations=[],
                        confidence=float(group_data.get("confidence", 0.5)),
                        rationale=group_data.get("rationale", "")
                    )
                    groups.append(group)
            
            return groups
        
        except Exception as e:
            print(f"Error grouping predicates: {e}")
            return []
    
    def build_dynamic_ontology(
        self,
        groups: list[RelationGroup]
    ) -> list[CanonicalRelation]:
        """
        Build Dynamic Ontology from grouped predicates.
        
        Args:
            groups: List of RelationGroup objects
        
        Returns:
            List of CanonicalRelation objects
        """
        ontology = []
        
        for group in groups:
            canonical = CanonicalRelation(
                canonical_type=group.canonical_type,
                description=group.rationale,
                grouped_predicates=group.predicates,
                example_count=sum(len(pred.split()) for pred in group.predicates)  # Rough estimate
            )
            ontology.append(canonical)
        
        return ontology
    
    def canonicalize_relations(
        self,
        similarity_threshold: float = 0.7
    ) -> tuple[list[RelationGroup], list[CanonicalRelation]]:
        """
        Main entry point: Canonicalize relationship predicates.
        
        Args:
            similarity_threshold: Minimum confidence for grouping
        
        Returns:
            Tuple of (groups, ontology) for human validation
        """
        # Step 1: Fetch unique relation types
        relation_types = self.fetch_unique_relation_types()
        print(f"Found {len(relation_types)} unique relation types")
        
        if len(relation_types) < 2:
            print("Not enough relation types for grouping")
            return [], []
        
        # Step 2: Group similar predicates
        groups = self.group_similar_predicates(
            relation_types,
            similarity_threshold=similarity_threshold
        )
        print(f"Created {len(groups)} canonical groups")
        
        # Step 3: Build Dynamic Ontology
        ontology = self.build_dynamic_ontology(groups)
        
        return groups, ontology
