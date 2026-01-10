"""
Supabase-based Items Bank Management

Replaces JSON file storage with Supabase for scalable cloud storage.
API-compatible with items_bank.py for easy migration.

OPTIMIZATIONS (H-1, H-2):
- Batch similarity search using pgvector RPC
- Parallel processing with ThreadPoolExecutor
"""

import uuid
from datetime import datetime
from typing import Any, Literal, Optional
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

from .vector_db import get_supabase_client
from .semantic_search import get_embedding, cosine_similarity


ThemeType = Literal["generation", "seek"]
ItemType = Literal["insight", "idea", "use_case"]
StatusType = Literal["active", "implemented", "posted", "archived"]


class ItemsBankSupabase:
    """Supabase-based bank manager for Items and Categories."""
    
    CURRENT_VERSION = 3
    
    def __init__(self):
        self.client = get_supabase_client()
    
    def add_item(
        self,
        item_type: ItemType,
        title: str,
        description: str,
        *,
        tags: Optional[list[str]] = None,
        source_conversations: int = 1,
        embedding: Optional[list[float]] = None,
        first_seen_date: Optional[str] = None,
        quality: Optional[str] = None,  # "A", "B", "C", or None
        # Coverage Intelligence: source date range tracking
        source_start_date: Optional[str] = None,  # YYYY-MM-DD format
        source_end_date: Optional[str] = None,  # YYYY-MM-DD format
        # Legacy support
        mode: Optional[str] = None,
        theme: Optional[str] = None,
        content: Optional[dict[str, Any]] = None,
        name: Optional[str] = None,
    ) -> str:
        """
        Add a new item to Supabase.
        
        Args:
            item_type: Type of item ("idea", "insight", "use_case")
            title: Item title
            description: Item description
            tags: Optional tags for filtering
            source_conversations: Number of conversations this item came from
            embedding: Pre-computed embedding vector
            first_seen_date: Date when item content was first seen (YYYY-MM format)
            quality: Quality tier ("A", "B", "C")
            source_start_date: Start date of the generation run that created this item (YYYY-MM-DD)
            source_end_date: End date of the generation run that created this item (YYYY-MM-DD)
            mode: Legacy field
            theme: Legacy field
            content: Legacy field
            name: Legacy field
        
        Returns the item ID.
        """
        item_id = f"item-{uuid.uuid4().hex[:8]}"
        
        # Generate embedding if not provided
        if embedding is None:
            try:
                query_text = f"{title} {description}"
                embedding = get_embedding(query_text)
            except Exception:
                embedding = None  # Proceed without embedding if generation fails
        
        # Check for existing similar item (deduplication)
        if embedding:
            existing = self._find_and_update_similar(
                embedding=embedding,
                item_type=item_type,
                source_start_date=source_start_date,
                source_end_date=source_end_date,
                threshold=0.85,
            )
            if existing:
                return existing  # Return existing item ID instead of creating new
        
        # Prepare item data
        item_data = {
            "id": item_id,
            "item_type": item_type,
            "title": title,
            "description": description,
            "tags": (tags or [])[:10],  # Cap at 10 tags
            "status": "active",
            "quality": quality,
            "source_conversations": source_conversations,
            "occurrence": 1,
            "first_seen": first_seen_date or datetime.now().strftime("%Y-%m"),
            "last_seen": datetime.now().strftime("%Y-%m"),
            "category_id": None,
            "embedding": embedding,  # Store embedding for theme grouping
            # Coverage Intelligence: source date range tracking
            "source_start_date": source_start_date,
            "source_end_date": source_end_date,
            # Legacy fields for backward compatibility
            "mode": mode or item_type,
            "theme": theme or "generation",
            "name": name,
            "content": content,
            "implemented": False,
        }
        
        # Insert into Supabase
        result = self.client.table("library_items").insert(item_data).execute()
        
        if not result.data:
            raise Exception(f"Failed to insert item: {result}")
        
        return item_id
    
    def _find_and_update_similar(
        self,
        embedding: list[float],
        item_type: ItemType,
        source_start_date: Optional[str],
        source_end_date: Optional[str],
        threshold: float = 0.85,
    ) -> Optional[str]:
        """
        Find similar item and update it if found.
        
        CRITICAL for Coverage Intelligence: When a similar item is found, we expand
        its source date range to include the new period. This prevents false coverage
        gaps where the same concept appears across multiple weeks.
        
        OPTIMIZED: Uses pgvector RPC function for server-side similarity search.
        Falls back to client-side search if RPC not available (during migration).
        
        Returns the existing item ID if updated, None if no similar item found.
        """
        best_match_id = None
        
        # Try server-side similarity search first (fast path)
        try:
            result = self.client.rpc(
                "search_similar_library_items",
                {
                    "query_embedding": embedding,
                    "match_threshold": threshold,
                    "match_count": 1,  # We only need the best match
                    "filter_item_type": item_type,
                }
            ).execute()
            
            if result.data and len(result.data) > 0:
                best_match_id = result.data[0]["id"]
        except Exception as e:
            # RPC not available, fall back to client-side search
            # This happens before the migration is run
            if "function search_similar_library_items" in str(e):
                best_match_id = self._find_similar_client_side(
                    embedding, item_type, threshold
                )
            else:
                raise
        
        if best_match_id:
            # Update existing item: increment occurrence + expand date range
            self._update_existing_item_on_dedup(
                item_id=best_match_id,
                source_start_date=source_start_date,
                source_end_date=source_end_date,
            )
            return best_match_id
        
        return None
    
    def _find_similar_client_side(
        self,
        embedding: list[float],
        item_type: ItemType,
        threshold: float = 0.85,
    ) -> Optional[str]:
        """
        Client-side fallback for similarity search.
        Used when pgvector RPC is not yet available.
        """
        # Fetch all items of this type with embeddings
        query = self.client.table("library_items").select(
            "id, embedding"
        ).eq("item_type", item_type).neq("status", "archived")
        result = query.execute()
        items = result.data if result.data else []
        
        best_match_id = None
        best_similarity = 0.0
        
        for item in items:
            item_embedding = item.get("embedding")
            if not item_embedding:
                continue
            
            similarity = cosine_similarity(embedding, item_embedding)
            if similarity >= threshold and similarity > best_similarity:
                best_similarity = similarity
                best_match_id = item["id"]
        
        return best_match_id
    
    def _update_existing_item_on_dedup(
        self,
        item_id: str,
        source_start_date: Optional[str],
        source_end_date: Optional[str],
    ) -> bool:
        """
        Update existing item when deduplicating: increment occurrence and expand date range.
        """
        # Fetch current item
        result = self.client.table("library_items").select(
            "occurrence, source_start_date, source_end_date"
        ).eq("id", item_id).single().execute()
        
        if not result.data:
            return False
        
        current = result.data
        current_occurrence = current.get("occurrence", 0)
        
        # Build update data
        update_data = {
            "occurrence": current_occurrence + 1,
            "last_seen": datetime.now().strftime("%Y-%m"),
        }
        
        # CRITICAL: Expand source date range for Coverage Intelligence
        # The existing item now "covers" both its original period AND the new period
        if source_start_date:
            existing_start = current.get("source_start_date")
            if not existing_start or source_start_date < existing_start:
                update_data["source_start_date"] = source_start_date
        
        if source_end_date:
            existing_end = current.get("source_end_date")
            if not existing_end or source_end_date > existing_end:
                update_data["source_end_date"] = source_end_date
        
        # Update in Supabase
        update_result = self.client.table("library_items").update(update_data).eq("id", item_id).execute()
        
        return bool(update_result.data)
    
    def find_similar_items(
        self,
        title: str,
        description: str,
        threshold: float = 0.85,
        item_type: Optional[ItemType] = None,
        limit: int = 10,
    ) -> list[dict[str, Any]]:
        """
        Find similar items using embeddings (for deduplication).
        
        OPTIMIZED: Uses pgvector RPC function for server-side similarity search.
        Falls back to client-side search if RPC not available.
        """
        # Generate embedding for query (one API call)
        query_text = f"{title} {description}"
        query_embedding = get_embedding(query_text)
        
        # Try server-side similarity search first (fast path)
        try:
            result = self.client.rpc(
                "search_similar_library_items",
                {
                    "query_embedding": query_embedding,
                    "match_threshold": threshold,
                    "match_count": limit,
                    "filter_item_type": item_type,
                }
            ).execute()
            
            if result.data:
                return [
                    {
                        "id": item["id"],
                        "title": item["title"],
                        "similarity": item["similarity"],
                        "occurrence": item["occurrence"],
                    }
                    for item in result.data
                ]
            return []
        except Exception as e:
            # RPC not available, fall back to client-side search
            if "function search_similar_library_items" not in str(e):
                raise
        
        # Fallback: Client-side search using stored embeddings
        query = self.client.table("library_items").select(
            "id, title, embedding, occurrence"
        ).neq("status", "archived")
        if item_type:
            query = query.eq("item_type", item_type)
        
        result = query.execute()
        items = result.data if result.data else []
        
        # Calculate similarity using stored embeddings (no regeneration!)
        similar_items = []
        for item in items:
            item_embedding = item.get("embedding")
            if not item_embedding:
                continue  # Skip items without embeddings
            
            similarity = cosine_similarity(query_embedding, item_embedding)
            
            if similarity >= threshold:
                similar_items.append({
                    "id": item["id"],
                    "title": item["title"],
                    "similarity": similarity,
                    "occurrence": item["occurrence"],
                })
        
        # Sort by similarity (descending)
        similar_items.sort(key=lambda x: x["similarity"], reverse=True)
        return similar_items[:limit]
    
    def increment_occurrence(self, item_id: str) -> bool:
        """Increment occurrence count for an existing item."""
        # Fetch current item
        result = self.client.table("library_items").select("occurrence").eq("id", item_id).single().execute()
        
        if not result.data:
            return False
        
        current_occurrence = result.data.get("occurrence", 0)
        
        # Update with incremented occurrence and new last_seen
        update_result = self.client.table("library_items").update({
            "occurrence": current_occurrence + 1,
            "last_seen": datetime.now().strftime("%Y-%m"),
        }).eq("id", item_id).execute()
        
        return bool(update_result.data)
    
    def add_category(
        self,
        name: str,
        theme: ThemeType,
        mode: ItemType,
        item_ids: list[str],
        similarity_threshold: float = 0.75,
    ) -> str:
        """Add a new category to Supabase."""
        category_id = f"category-{uuid.uuid4().hex[:8]}"
        
        category_data = {
            "id": category_id,
            "name": name,
            "theme": theme,
            "mode": mode,
            "item_ids": item_ids,
            "similarity_threshold": similarity_threshold,
            "created_date": datetime.now().isoformat(),
        }
        
        result = self.client.table("library_categories").insert(category_data).execute()
        
        if not result.data:
            raise Exception(f"Failed to insert category: {result}")
        
        return category_id
    
    def update_item_category(self, item_id: str, category_id: Optional[str]) -> bool:
        """Update the category assignment for an item."""
        result = self.client.table("library_items").update({
            "category_id": category_id
        }).eq("id", item_id).execute()
        
        return bool(result.data)
    
    def get_all_item_ids(self) -> set[str]:
        """Get all item IDs from the library."""
        result = self.client.table("library_items").select("id").execute()
        if result.data:
            return {item["id"] for item in result.data}
        return set()
    
    def get_stats(self) -> dict[str, Any]:
        """Get library statistics."""
        # Get total items count
        items_result = self.client.table("library_items").select("*", count="exact").execute()
        total_items = items_result.count if hasattr(items_result, "count") else 0
        
        # Get total categories count
        categories_result = self.client.table("library_categories").select("*", count="exact").execute()
        total_categories = categories_result.count if hasattr(categories_result, "count") else 0
        
        # Get items data for detailed stats
        items = items_result.data if items_result.data else []
        
        # Calculate stats
        by_mode = defaultdict(int)
        by_theme = defaultdict(int)
        by_status = defaultdict(int)
        
        for item in items:
            mode = item.get("mode", item.get("item_type", "unknown"))
            theme = item.get("theme", "generation")
            status = item.get("status", "active")
            
            by_mode[mode] += 1
            by_theme[theme] += 1
            by_status[status] += 1
        
        return {
            "totalItems": total_items,
            "totalCategories": total_categories,
            "byMode": dict(by_mode),
            "byTheme": dict(by_theme),
            "byStatus": dict(by_status),
            "implemented": by_status.get("implemented", 0),
        }
    
    def save(self) -> bool:
        """
        No-op for Supabase (all changes are immediately persisted).
        Kept for API compatibility with JSON-based ItemsBank.
        """
        return True
    
    def clear(self) -> bool:
        """
        Clear all items and categories from Supabase.
        WARNING: This is a destructive operation.
        """
        try:
            # Delete all items
            self.client.table("library_items").delete().neq("id", "").execute()
            
            # Delete all categories
            self.client.table("library_categories").delete().neq("id", "").execute()
            
            return True
        except Exception as e:
            print(f"❌ Failed to clear Supabase bank: {e}")
            return False
    
    # =========================================================================
    # BATCH OPERATIONS (H-1, H-2 Optimizations)
    # =========================================================================
    
    def batch_add_items(
        self,
        items: list[dict[str, Any]],
        item_type: ItemType,
        source_start_date: Optional[str] = None,
        source_end_date: Optional[str] = None,
        threshold: float = 0.85,
        max_workers: int = 5,
    ) -> dict[str, Any]:
        """
        Batch add items with parallel deduplication.
        
        OPTIMIZATION: Uses ThreadPoolExecutor for parallel similarity searches,
        then batches inserts/updates for efficiency.
        
        Args:
            items: List of item dicts with keys: title, description, tags, embedding, first_seen_date, quality
            item_type: Type of items ("idea", "insight", "use_case")
            source_start_date: Coverage tracking start date
            source_end_date: Coverage tracking end date
            threshold: Similarity threshold for deduplication
            max_workers: Number of parallel workers for similarity search
        
        Returns:
            Stats dict with added, updated, total counts
        """
        if not items:
            return {"added": 0, "updated": 0, "total": 0}
        
        # Extract embeddings (already pre-computed)
        embeddings = [item.get("embedding") for item in items]
        
        # PHASE 1: Parallel similarity search using ThreadPoolExecutor
        print(f"   ⚡ Parallel dedup check for {len(items)} items (workers={max_workers})...", file=__import__('sys').stderr)
        
        similar_matches = self._batch_find_similar_parallel(
            embeddings=embeddings,
            item_type=item_type,
            threshold=threshold,
            max_workers=max_workers,
        )
        
        # PHASE 2: Separate items into new vs update
        items_to_insert = []
        items_to_update = []
        
        for i, item in enumerate(items):
            match_id = similar_matches[i]
            if match_id:
                # Existing item found - prepare update
                items_to_update.append({
                    "existing_id": match_id,
                    "source_start_date": source_start_date,
                    "source_end_date": source_end_date,
                })
            else:
                # New item - prepare insert
                item_id = f"item-{uuid.uuid4().hex[:8]}"
                items_to_insert.append({
                    "id": item_id,
                    "item_type": item_type,
                    "title": item.get("title", ""),
                    "description": item.get("description", ""),
                    "tags": (item.get("tags") or [])[:10],
                    "status": "active",
                    "quality": item.get("quality"),
                    "source_conversations": item.get("source_conversations", 1),
                    "occurrence": 1,
                    "first_seen": item.get("first_seen_date") or datetime.now().strftime("%Y-%m"),
                    "last_seen": datetime.now().strftime("%Y-%m"),
                    "category_id": None,
                    "embedding": item.get("embedding"),
                    "source_start_date": source_start_date,
                    "source_end_date": source_end_date,
                    "mode": item_type,
                    "theme": "generation",
                    "name": None,
                    "content": None,
                    "implemented": False,
                })
        
        # PHASE 3: Batch insert new items
        added = 0
        if items_to_insert:
            try:
                # Supabase supports batch insert
                result = self.client.table("library_items").insert(items_to_insert).execute()
                added = len(result.data) if result.data else 0
            except Exception as e:
                print(f"   ⚠️ Batch insert failed, falling back to individual inserts: {e}", file=__import__('sys').stderr)
                for item_data in items_to_insert:
                    try:
                        self.client.table("library_items").insert(item_data).execute()
                        added += 1
                    except Exception:
                        pass
        
        # PHASE 4: Batch update existing items (expand date ranges)
        updated = 0
        if items_to_update:
            # Group updates and process in parallel
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = [
                    executor.submit(
                        self._update_existing_item_on_dedup,
                        update["existing_id"],
                        update["source_start_date"],
                        update["source_end_date"],
                    )
                    for update in items_to_update
                ]
                for future in as_completed(futures):
                    if future.result():
                        updated += 1
        
        return {
            "added": added,
            "updated": updated,
            "total": len(items),
            "dedup_matches": len(items_to_update),
        }
    
    def _batch_find_similar_parallel(
        self,
        embeddings: list[list[float]],
        item_type: ItemType,
        threshold: float = 0.85,
        max_workers: int = 5,
    ) -> list[Optional[str]]:
        """
        Find similar items for multiple embeddings in parallel.
        
        Returns:
            List of existing item IDs (or None if no match) for each embedding.
        """
        results = [None] * len(embeddings)
        
        def search_one(idx: int, embedding: list[float]) -> tuple[int, Optional[str]]:
            """Search for similar item for one embedding."""
            if not embedding or all(v == 0.0 for v in embedding[:10]):
                return (idx, None)  # Skip zero vectors
            
            try:
                result = self.client.rpc(
                    "search_similar_library_items",
                    {
                        "query_embedding": embedding,
                        "match_threshold": threshold,
                        "match_count": 1,
                        "filter_item_type": item_type,
                    }
                ).execute()
                
                if result.data and len(result.data) > 0:
                    return (idx, result.data[0]["id"])
            except Exception as e:
                # RPC not available, fall back to client-side
                if "function search_similar_library_items" in str(e):
                    match_id = self._find_similar_client_side(embedding, item_type, threshold)
                    return (idx, match_id)
                # Other errors - return no match
                pass
            
            return (idx, None)
        
        # Run searches in parallel
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            futures = [
                executor.submit(search_one, i, emb)
                for i, emb in enumerate(embeddings)
            ]
            
            for future in as_completed(futures):
                idx, match_id = future.result()
                results[idx] = match_id
        
        return results