"""
Entity Deduplicator — Prevent duplicate entities via multi-stage matching.

Deduplication strategy:
1. Exact match (lowercase canonical_name)
2. Alias match (check if name matches existing alias)
3. Embedding similarity (cosine > 0.85 → merge as alias)
"""

import uuid
from datetime import datetime, timezone
from typing import Optional

from .knowledge_graph import EntityType, Entity
from .semantic_search import get_embedding, cosine_similarity


# Similarity threshold for considering entities as duplicates
EMBEDDING_SIMILARITY_THRESHOLD = 0.85


class EntityDeduplicator:
    """
    Manages entity deduplication using Supabase as storage.
    
    Uses multi-stage matching:
    1. Exact match on canonical_name (case-insensitive)
    2. Alias match (check if name is in any entity's aliases)
    3. Embedding similarity match (cosine > threshold)
    """
    
    def __init__(self, supabase_client):
        """
        Initialize deduplicator with Supabase client.
        
        Args:
            supabase_client: Initialized Supabase client
        """
        self.supabase = supabase_client
        self._cache: dict[str, Entity] = {}  # name_lower -> Entity (for session caching)
    
    def find_or_create_entity(
        self,
        name: str,
        entity_type: EntityType,
        embedding: Optional[list[float]] = None,
        confidence: float = 1.0,
        message_timestamp: Optional[int] = None,
        source_type: str = "user",
    ) -> tuple[str, bool]:
        """
        Find existing entity or create new one.
        
        Args:
            name: Entity name to find/create
            entity_type: Type of entity
            embedding: Optional embedding vector (generated if not provided)
            confidence: Extraction confidence score
            message_timestamp: Source message timestamp for first_seen/last_seen
            source_type: Source of the entity ('user' | 'expert'), default 'user'
            
        Returns:
            Tuple of (entity_id, is_new) where is_new indicates if entity was created
        """
        name = name.strip()
        name_lower = name.lower()
        
        # 1. Check session cache first
        if name_lower in self._cache:
            cached = self._cache[name_lower]
            self._update_entity_stats(cached.id, message_timestamp, source_type)
            return cached.id, False
        
        # 2. Exact match on canonical_name
        existing = self._find_by_canonical_name(name_lower)
        if existing:
            self._cache[name_lower] = existing
            self._update_entity_stats(existing.id, message_timestamp, source_type)
            return existing.id, False
        
        # 3. Alias match
        existing = self._find_by_alias(name_lower)
        if existing:
            self._cache[name_lower] = existing
            self._update_entity_stats(existing.id, message_timestamp, source_type)
            return existing.id, False
        
        # 4. Generate embedding if not provided
        if embedding is None:
            embedding = get_embedding(name)
        
        # 5. Embedding similarity match (only for same entity type)
        if embedding:
            similar = self._find_by_embedding_similarity(embedding, entity_type)
            if similar:
                # Add as alias to existing entity
                self._add_alias(similar.id, name)
                self._cache[name_lower] = similar
                self._update_entity_stats(similar.id, message_timestamp, source_type)
                return similar.id, False
        
        # 6. No match found — create new entity
        new_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        
        timestamp_dt = None
        if message_timestamp:
            timestamp_dt = datetime.fromtimestamp(message_timestamp / 1000, tz=timezone.utc)
        
        # Build source_breakdown based on source_type
        source_breakdown = {
            "user": 1 if source_type == "user" else 0,
            "lenny": 1 if source_type == "expert" else 0,
        }
        
        entity_data = {
            "id": new_id,
            "canonical_name": name,
            "entity_type": entity_type.value,
            "aliases": [],
            "embedding": embedding,
            "mention_count": 1,
            "first_seen": (timestamp_dt or now).isoformat(),
            "last_seen": (timestamp_dt or now).isoformat(),
            "confidence": confidence,
            "source": "llm",
            "source_type": source_type,
            "source_breakdown": source_breakdown,
        }
        
        try:
            self.supabase.table("kg_entities").insert(entity_data).execute()
            
            # Cache the new entity
            new_entity = Entity(
                id=new_id,
                canonical_name=name,
                entity_type=entity_type,
                aliases=[],
                embedding=embedding,
                mention_count=1,
                confidence=confidence,
            )
            self._cache[name_lower] = new_entity
            
            return new_id, True
            
        except Exception as e:
            print(f"⚠️ Failed to create entity '{name}': {e}")
            raise
    
    def _find_by_canonical_name(self, name_lower: str) -> Optional[Entity]:
        """Find entity by canonical name (case-insensitive)."""
        try:
            result = (
                self.supabase.table("kg_entities")
                .select("*")
                .ilike("canonical_name", name_lower)
                .limit(1)
                .execute()
            )
            
            if result.data:
                return self._row_to_entity(result.data[0])
            return None
            
        except Exception as e:
            print(f"⚠️ Error finding entity by name: {e}")
            return None
    
    def _find_by_alias(self, name_lower: str) -> Optional[Entity]:
        """Find entity where name matches an alias."""
        try:
            # PostgreSQL array contains check (case-insensitive via ILIKE workaround)
            result = (
                self.supabase.table("kg_entities")
                .select("*")
                .execute()
            )
            
            # Filter in Python for case-insensitive alias matching
            for row in result.data:
                aliases = row.get("aliases", []) or []
                if any(alias.lower() == name_lower for alias in aliases):
                    return self._row_to_entity(row)
            
            return None
            
        except Exception as e:
            print(f"⚠️ Error finding entity by alias: {e}")
            return None
    
    def _find_by_embedding_similarity(
        self,
        embedding: list[float],
        entity_type: EntityType,
    ) -> Optional[Entity]:
        """Find entity with similar embedding (same type only)."""
        try:
            # Use RPC function for efficient vector search
            result = self.supabase.rpc(
                "search_kg_entities",
                {
                    "query_embedding": embedding,
                    "match_threshold": EMBEDDING_SIMILARITY_THRESHOLD,
                    "match_count": 1,
                    "type_filter": entity_type.value,
                }
            ).execute()
            
            if result.data:
                # Fetch full entity data
                entity_id = result.data[0]["id"]
                full_result = (
                    self.supabase.table("kg_entities")
                    .select("*")
                    .eq("id", entity_id)
                    .limit(1)
                    .execute()
                )
                if full_result.data:
                    return self._row_to_entity(full_result.data[0])
            
            return None
            
        except Exception as e:
            # RPC might not exist yet, fall back to client-side similarity
            print(f"⚠️ RPC search failed, using fallback: {e}")
            return self._find_by_embedding_similarity_fallback(embedding, entity_type)
    
    def _find_by_embedding_similarity_fallback(
        self,
        embedding: list[float],
        entity_type: EntityType,
    ) -> Optional[Entity]:
        """Fallback: fetch all entities of type and compute similarity client-side."""
        try:
            result = (
                self.supabase.table("kg_entities")
                .select("*")
                .eq("entity_type", entity_type.value)
                .execute()
            )
            
            best_match = None
            best_similarity = 0.0
            
            for row in result.data:
                row_embedding = row.get("embedding")
                if not row_embedding:
                    continue
                
                similarity = cosine_similarity(embedding, row_embedding)
                if similarity > EMBEDDING_SIMILARITY_THRESHOLD and similarity > best_similarity:
                    best_similarity = similarity
                    best_match = row
            
            if best_match:
                return self._row_to_entity(best_match)
            
            return None
            
        except Exception as e:
            print(f"⚠️ Fallback similarity search failed: {e}")
            return None
    
    def _add_alias(self, entity_id: str, alias: str) -> None:
        """Add alias to existing entity."""
        try:
            # Fetch current aliases
            result = (
                self.supabase.table("kg_entities")
                .select("aliases")
                .eq("id", entity_id)
                .limit(1)
                .execute()
            )
            
            if result.data:
                current_aliases = result.data[0].get("aliases", []) or []
                
                # Don't add duplicate
                if alias.lower() not in [a.lower() for a in current_aliases]:
                    current_aliases.append(alias)
                    
                    self.supabase.table("kg_entities").update({
                        "aliases": current_aliases
                    }).eq("id", entity_id).execute()
                    
        except Exception as e:
            print(f"⚠️ Failed to add alias '{alias}' to entity {entity_id}: {e}")
    
    def _update_entity_stats(self, entity_id: str, message_timestamp: Optional[int], source_type: str = "user") -> None:
        """
        Update mention_count, last_seen, and source_breakdown for existing entity.
        
        Args:
            entity_id: Entity ID to update
            message_timestamp: Source message timestamp
            source_type: Source of the mention ('user' | 'expert')
        """
        try:
            update_data = {}
            
            # Fetch current stats
            result = (
                self.supabase.table("kg_entities")
                .select("mention_count, first_seen, source_breakdown, source_type")
                .eq("id", entity_id)
                .limit(1)
                .execute()
            )
            
            if result.data:
                current_count = result.data[0].get("mention_count", 0)
                update_data["mention_count"] = current_count + 1
                
                # Update source_breakdown
                source_breakdown = result.data[0].get("source_breakdown", {"user": 0, "lenny": 0})
                source_key = "lenny" if source_type == "expert" else "user"
                source_breakdown[source_key] = source_breakdown.get(source_key, 0) + 1
                update_data["source_breakdown"] = source_breakdown
                
                # Determine new source_type (cross-source if both > 0)
                user_count = source_breakdown.get("user", 0)
                lenny_count = source_breakdown.get("lenny", 0)
                if user_count > 0 and lenny_count > 0:
                    update_data["source_type"] = "both"
                elif lenny_count > 0:
                    update_data["source_type"] = "expert"
                else:
                    update_data["source_type"] = "user"
                
                # Update timestamps
                if message_timestamp:
                    timestamp_dt = datetime.fromtimestamp(message_timestamp / 1000, tz=timezone.utc)
                    update_data["last_seen"] = timestamp_dt.isoformat()
                    
                    # Update first_seen if earlier
                    first_seen_str = result.data[0].get("first_seen")
                    if first_seen_str:
                        first_seen = datetime.fromisoformat(first_seen_str.replace("Z", "+00:00"))
                        if timestamp_dt < first_seen:
                            update_data["first_seen"] = timestamp_dt.isoformat()
                
                self.supabase.table("kg_entities").update(update_data).eq("id", entity_id).execute()
                
        except Exception as e:
            print(f"⚠️ Failed to update entity stats: {e}")
    
    def _row_to_entity(self, row: dict) -> Entity:
        """Convert database row to Entity object."""
        return Entity(
            id=row["id"],
            canonical_name=row["canonical_name"],
            entity_type=EntityType(row["entity_type"]),
            aliases=row.get("aliases", []) or [],
            description=row.get("description"),
            embedding=row.get("embedding"),
            mention_count=row.get("mention_count", 0),
            first_seen=datetime.fromisoformat(row["first_seen"].replace("Z", "+00:00")) if row.get("first_seen") else None,
            last_seen=datetime.fromisoformat(row["last_seen"].replace("Z", "+00:00")) if row.get("last_seen") else None,
            confidence=row.get("confidence", 1.0),
            source=row.get("source", "llm"),
        )
    
    def clear_cache(self) -> None:
        """Clear the session cache."""
        self._cache.clear()


def create_deduplicator() -> EntityDeduplicator:
    """Create EntityDeduplicator with configured Supabase client."""
    from .vector_db import get_supabase_client
    
    client = get_supabase_client()
    if not client:
        raise RuntimeError("Supabase client not configured. Run setup first.")
    
    return EntityDeduplicator(client)
