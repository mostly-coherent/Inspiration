"""
Entity Canonicalizer — Explicitly merge semantically identical entities.

Phase 0: Triple-Based Foundation — CRITICAL STEP

Canonicalization prevents graph fragmentation by merging entities that refer
to the same thing but are written differently:
- "PM" → "Product Manager"
- "Next.js" → "NextJS" → "next.js"
- "React" → "React.js"

Uses embedding-based similarity + LLM-based resolution for ambiguous cases.
"""

from typing import Optional
from .knowledge_graph import EntityType, Entity
from .semantic_search import get_embedding, cosine_similarity
from .entity_deduplicator import EntityDeduplicator, EMBEDDING_SIMILARITY_THRESHOLD


class EntityCanonicalizer:
    """
    Canonicalizes entities by merging semantically identical ones.
    
    Builds on EntityDeduplicator but adds explicit canonicalization step
    for entities extracted from triples.
    """
    
    def __init__(self, deduplicator: EntityDeduplicator):
        """
        Initialize canonicalizer with deduplicator.
        
        Args:
            deduplicator: EntityDeduplicator instance for database operations
        """
        self.deduplicator = deduplicator
    
    def canonicalize_entity(
        self,
        name: str,
        entity_type: EntityType,
        embedding: Optional[list[float]] = None,
        confidence: float = 1.0,
        message_timestamp: Optional[int] = None,
        source_type: str = "user",
    ) -> tuple[str, bool, Optional[str]]:
        """
        Canonicalize an entity name, merging with existing entities if semantically identical.
        
        Args:
            name: Entity name to canonicalize
            entity_type: Type of entity
            embedding: Optional embedding vector (generated if not provided)
            confidence: Extraction confidence score
            message_timestamp: Source message timestamp
            source_type: Source of the entity ('user' | 'expert')
            
        Returns:
            Tuple of (canonical_entity_id, is_new, canonical_name)
            - canonical_entity_id: ID of the canonical entity (existing or newly created)
            - is_new: Whether this is a new entity
            - canonical_name: The canonical name (may differ from input name if merged)
        """
        # Use deduplicator to find or create entity
        # This handles exact match, alias match, and embedding similarity
        entity_id, is_new = self.deduplicator.find_or_create_entity(
            name=name,
            entity_type=entity_type,
            embedding=embedding,
            confidence=confidence,
            message_timestamp=message_timestamp,
            source_type=source_type,
        )
        
        # Get canonical name from database
        canonical_name = self._get_canonical_name(entity_id)
        
        return entity_id, is_new, canonical_name
    
    def canonicalize_batch(
        self,
        entities: list[tuple[str, EntityType, float]],
        source_type: str = "user",
    ) -> dict[str, tuple[str, str]]:
        """
        Canonicalize a batch of entities.
        
        Args:
            entities: List of (name, entity_type, confidence) tuples
            source_type: Source of entities ('user' | 'expert')
            
        Returns:
            Dictionary mapping original_name -> (entity_id, canonical_name)
        """
        results = {}
        for name, entity_type, confidence in entities:
            entity_id, is_new, canonical_name = self.canonicalize_entity(
                name=name,
                entity_type=entity_type,
                confidence=confidence,
                source_type=source_type,
            )
            results[name] = (entity_id, canonical_name)
        return results
    
    def _get_canonical_name(self, entity_id: str) -> Optional[str]:
        """
        Get canonical name for an entity ID.
        
        Args:
            entity_id: Entity ID
            
        Returns:
            Canonical name or None if entity not found
        """
        try:
            result = self.deduplicator.supabase.table("kg_entities")\
                .select("canonical_name")\
                .eq("id", entity_id)\
                .single()\
                .execute()
            
            if result.data:
                return result.data["canonical_name"]
        except Exception as e:
            print(f"⚠️ Error fetching canonical name for {entity_id}: {e}")
        
        return None
    
    def merge_entities(
        self,
        source_entity_id: str,
        target_entity_id: str,
        reason: str = "Semantic similarity",
    ) -> bool:
        """
        Merge two entities (move all mentions/relations from source to target).
        
        Args:
            source_entity_id: Entity to merge from (will be deleted)
            target_entity_id: Entity to merge into (kept as canonical)
            reason: Reason for merge (for logging)
            
        Returns:
            True if merge successful, False otherwise
        """
        try:
            # Get source entity to add as alias
            source_result = self.deduplicator.supabase.table("kg_entities")\
                .select("canonical_name, aliases")\
                .eq("id", source_entity_id)\
                .single()\
                .execute()
            
            if not source_result.data:
                print(f"⚠️ Source entity {source_entity_id} not found")
                return False
            
            source_name = source_result.data["canonical_name"]
            source_aliases = source_result.data.get("aliases", [])
            
            # Get target entity aliases
            target_result = self.deduplicator.supabase.table("kg_entities")\
                .select("aliases, mention_count")\
                .eq("id", target_entity_id)\
                .single()\
                .execute()
            
            if not target_result.data:
                print(f"⚠️ Target entity {target_entity_id} not found")
                return False
            
            target_aliases = set(target_result.data.get("aliases", []))
            target_mention_count = target_result.data.get("mention_count", 0)
            
            # Add source name and aliases to target
            target_aliases.add(source_name)
            target_aliases.update(source_aliases)
            
            # Get source mention count
            source_mention_result = self.deduplicator.supabase.table("kg_entity_mentions")\
                .select("id", count="exact")\
                .eq("entity_id", source_entity_id)\
                .execute()
            
            source_mention_count = source_mention_result.count if source_mention_result.count else 0
            
            # Update target entity with merged aliases and mention count
            self.deduplicator.supabase.table("kg_entities")\
                .update({
                    "aliases": list(target_aliases),
                    "mention_count": target_mention_count + source_mention_count,
                })\
                .eq("id", target_entity_id)\
                .execute()
            
            # Update all mentions to point to target entity
            self.deduplicator.supabase.table("kg_entity_mentions")\
                .update({"entity_id": target_entity_id})\
                .eq("entity_id", source_entity_id)\
                .execute()
            
            # Update all relations to point to target entity
            # Relations where source_entity_id is source
            self.deduplicator.supabase.table("kg_relations")\
                .update({"source_entity_id": target_entity_id})\
                .eq("source_entity_id", source_entity_id)\
                .execute()
            
            # Relations where source_entity_id is target
            self.deduplicator.supabase.table("kg_relations")\
                .update({"target_entity_id": target_entity_id})\
                .eq("target_entity_id", source_entity_id)\
                .execute()
            
            # Delete source entity
            self.deduplicator.supabase.table("kg_entities")\
                .delete()\
                .eq("id", source_entity_id)\
                .execute()
            
            print(f"✅ Merged {source_name} → {target_entity_id} ({reason})")
            return True
            
        except Exception as e:
            print(f"❌ Error merging entities {source_entity_id} → {target_entity_id}: {e}")
            return False
