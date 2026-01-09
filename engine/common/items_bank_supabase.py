"""
Supabase-based Items Bank Management

Replaces JSON file storage with Supabase for scalable cloud storage.
API-compatible with items_bank.py for easy migration.
"""

import uuid
from datetime import datetime
from typing import Any, Literal, Optional
from collections import defaultdict

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
        # Legacy support
        mode: Optional[str] = None,
        theme: Optional[str] = None,
        content: Optional[dict[str, Any]] = None,
        name: Optional[str] = None,
    ) -> str:
        """
        Add a new item to Supabase.
        
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
    
    def find_similar_items(
        self,
        title: str,
        description: str,
        threshold: float = 0.85,
        item_type: Optional[ItemType] = None,
    ) -> list[dict[str, Any]]:
        """Find similar items using embeddings (for deduplication)."""
        # Generate embedding for query
        query_text = f"{title} {description}"
        query_embedding = get_embedding(query_text)
        
        # Fetch all items (or filtered by type)
        query = self.client.table("library_items").select("*")
        if item_type:
            query = query.eq("item_type", item_type)
        
        result = query.execute()
        items = result.data if result.data else []
        
        # Calculate similarity (assuming embeddings stored if available)
        similar_items = []
        for item in items:
            # For now, use basic text similarity
            # TODO: Add embedding column to library_items table
            item_text = f"{item.get('title', '')} {item.get('description', '')}"
            item_embedding = get_embedding(item_text)
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
        return similar_items
    
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
