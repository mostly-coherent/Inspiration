"""
Cross-KG Semantic Matcher — Find semantically similar entities across User ↔ Lenny KGs.

Part of Cross-KG Semantic Matching (P4): Uses embedding similarity to find related
entities across sources when string matching finds 0 overlaps.
"""

import numpy as np
from typing import Any, Optional
from dataclasses import dataclass

from .semantic_search import get_embedding
from .config import load_env_file


@dataclass
class CrossKGMatch:
    """A semantic match between entities from different KGs."""
    user_entity_id: str
    user_entity_name: str
    lenny_entity_id: str
    lenny_entity_name: str
    similarity: float
    user_entity_type: str
    lenny_entity_type: str


class CrossKGMatcher:
    """
    Find semantically similar entities across User KG ↔ Lenny KG.
    
    Process:
    1. Fetch user entities with embeddings
    2. Fetch Lenny entities with embeddings
    3. Compute cosine similarity between embeddings
    4. Return top matches above threshold
    """
    
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        load_env_file()
    
    def fetch_user_entities(self, limit: Optional[int] = None) -> list[dict]:
        """
        Fetch user entities (source_type='user') with embeddings.
        
        Returns list of entity dicts with: id, canonical_name, embedding, entity_type
        """
        query = (
            self.supabase.table("kg_entities")
            .select("id, canonical_name, embedding, entity_type, mention_count")
            .eq("source_type", "user")
            .not_.is_("embedding", "null")
            .order("mention_count", desc=True)
        )
        
        if limit:
            query = query.limit(limit)
        
        result = query.execute()
        return result.data if result.data else []
    
    def fetch_lenny_entities(self, limit: Optional[int] = None) -> list[dict]:
        """
        Fetch Lenny entities (source_type='expert' or 'lenny') with embeddings.
        
        Returns list of entity dicts with: id, canonical_name, embedding, entity_type
        """
        query = (
            self.supabase.table("kg_entities")
            .select("id, canonical_name, embedding, entity_type, mention_count")
            .in_("source_type", ["expert", "lenny"])
            .not_.is_("embedding", "null")
            .order("mention_count", desc=True)
        )
        
        if limit:
            query = query.limit(limit)
        
        result = query.execute()
        return result.data if result.data else []
    
    def cosine_similarity(self, vec1: list[float], vec2: list[float]) -> float:
        """Compute cosine similarity between two vectors."""
        if not vec1 or not vec2:
            return 0.0
        
        try:
            v1 = np.array(vec1)
            v2 = np.array(vec2)
            
            dot_product = np.dot(v1, v2)
            norm1 = np.linalg.norm(v1)
            norm2 = np.linalg.norm(v2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            return float(dot_product / (norm1 * norm2))
        except Exception:
            return 0.0
    
    def find_semantic_matches(
        self,
        user_entities: Optional[list[dict]] = None,
        lenny_entities: Optional[list[dict]] = None,
        similarity_threshold: float = 0.75,
        top_k: int = 10,
        user_limit: Optional[int] = None,
        lenny_limit: Optional[int] = None
    ) -> list[CrossKGMatch]:
        """
        Find semantically similar entities across User ↔ Lenny KGs.
        
        Args:
            user_entities: Optional pre-fetched user entities
            lenny_entities: Optional pre-fetched Lenny entities
            similarity_threshold: Minimum similarity score (0.0-1.0)
            top_k: Maximum matches per user entity
            user_limit: Limit number of user entities to check
            lenny_limit: Limit number of Lenny entities to check
        
        Returns:
            List of CrossKGMatch objects sorted by similarity (highest first)
        """
        # Fetch entities if not provided
        if user_entities is None:
            user_entities = self.fetch_user_entities(limit=user_limit)
        
        if lenny_entities is None:
            lenny_entities = self.fetch_lenny_entities(limit=lenny_limit)
        
        if not user_entities or not lenny_entities:
            return []
        
        print(f"Comparing {len(user_entities)} user entities with {len(lenny_entities)} Lenny entities")
        
        matches = []
        
        # Compare each user entity with all Lenny entities
        for user_entity in user_entities:
            user_embedding = user_entity.get("embedding")
            if not user_embedding:
                continue
            
            entity_matches = []
            
            for lenny_entity in lenny_entities:
                lenny_embedding = lenny_entity.get("embedding")
                if not lenny_embedding:
                    continue
                
                similarity = self.cosine_similarity(user_embedding, lenny_embedding)
                
                if similarity >= similarity_threshold:
                    match = CrossKGMatch(
                        user_entity_id=user_entity["id"],
                        user_entity_name=user_entity["canonical_name"],
                        lenny_entity_id=lenny_entity["id"],
                        lenny_entity_name=lenny_entity["canonical_name"],
                        similarity=similarity,
                        user_entity_type=user_entity.get("entity_type", "unknown"),
                        lenny_entity_type=lenny_entity.get("entity_type", "unknown")
                    )
                    entity_matches.append(match)
            
            # Sort by similarity and take top K
            entity_matches.sort(key=lambda m: m.similarity, reverse=True)
            matches.extend(entity_matches[:top_k])
        
        # Sort all matches by similarity
        matches.sort(key=lambda m: m.similarity, reverse=True)
        
        print(f"Found {len(matches)} semantic matches above threshold {similarity_threshold}")
        
        return matches
    
    def find_matches_for_entity(
        self,
        entity_id: str,
        similarity_threshold: float = 0.75,
        top_k: int = 10
    ) -> list[CrossKGMatch]:
        """
        Find semantic matches for a specific entity.
        
        Args:
            entity_id: Entity ID to find matches for
            similarity_threshold: Minimum similarity score
            top_k: Maximum matches to return
        
        Returns:
            List of CrossKGMatch objects
        """
        # Fetch the entity
        result = self.supabase.table("kg_entities").select(
            "id, canonical_name, embedding, entity_type, source_type"
        ).eq("id", entity_id).execute()
        
        if not result.data:
            return []
        
        entity = result.data[0]
        source_type = entity.get("source_type", "")
        
        # Determine which KG this entity belongs to
        if source_type == "user":
            user_entities = [entity]
            lenny_entities = self.fetch_lenny_entities()
        elif source_type in ["expert", "lenny"]:
            user_entities = self.fetch_user_entities()
            lenny_entities = [entity]
        else:
            # Unknown source - check both
            user_entities = self.fetch_user_entities()
            lenny_entities = self.fetch_lenny_entities()
        
        return self.find_semantic_matches(
            user_entities=user_entities if source_type == "user" else None,
            lenny_entities=lenny_entities if source_type in ["expert", "lenny"] else None,
            similarity_threshold=similarity_threshold,
            top_k=top_k
        )
