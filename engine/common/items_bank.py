"""
Unified Items Bank Management — v2 unified system with simplified content structure.

All item types (Ideas, Insights, Use Cases) share the same content structure:
- title: Compelling hook/attention grabber
- description: Main content with problem, solution, takeaway as appropriate
- tags: Auto-generated keywords for filtering/discovery
"""

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Optional
from collections import defaultdict

from .config import get_data_dir
from .semantic_search import get_embedding, cosine_similarity


ThemeType = Literal["generation", "seek"]
ItemType = Literal["insight", "idea", "use_case"]
StatusType = Literal["active", "implemented", "posted", "archived"]


class ItemsBank:
    """Unified bank manager for Items and Categories."""
    
    CURRENT_VERSION = 3  # Bumped for new unified structure
    
    def __init__(self, data_dir: Optional[Path] = None):
        self.data_dir = data_dir or get_data_dir()
        self.bank_path = self.data_dir / "items_bank.json"
        self._bank: dict[str, Any] = {"version": self.CURRENT_VERSION, "items": [], "categories": []}
        self._load()
    
    def _load(self) -> None:
        """Load bank from disk."""
        if self.bank_path.exists():
            try:
                with open(self.bank_path) as f:
                    self._bank = json.load(f)
                    # Ensure version is set
                    if "version" not in self._bank:
                        self._bank["version"] = self.CURRENT_VERSION
                    # Ensure items and categories arrays exist
                    if "items" not in self._bank:
                        self._bank["items"] = []
                    if "categories" not in self._bank:
                        self._bank["categories"] = []
            except (json.JSONDecodeError, IOError):
                self._bank = {"version": self.CURRENT_VERSION, "items": [], "categories": []}
    
    def get_all_item_ids(self) -> set[str]:
        """Get all item IDs from the bank."""
        return {item["id"] for item in self._bank["items"]}
    
    def save(self) -> bool:
        """Save bank to disk."""
        try:
            self._bank["last_updated"] = datetime.now().isoformat()
            self._bank["version"] = self.CURRENT_VERSION
            self.data_dir.mkdir(parents=True, exist_ok=True)
            with open(self.bank_path, "w") as f:
                json.dump(self._bank, f, indent=2)
            return True
        except IOError:
            return False
    
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
        # Coverage Intelligence: source date range tracking
        source_start_date: Optional[str] = None,  # YYYY-MM-DD format
        source_end_date: Optional[str] = None,  # YYYY-MM-DD format
        # Legacy support - ignore these
        mode: Optional[str] = None,
        theme: Optional[str] = None,
        content: Optional[dict[str, Any]] = None,
        name: Optional[str] = None,
    ) -> str:
        """
        Add a new item to the bank with unified content structure.
        
        Args:
            item_type: Type of item ("insight", "idea", "use_case")
            title: Compelling title/hook for the item
            description: Main content (problem+solution, post draft, or JTBD with takeaway)
            tags: Optional list of tags for filtering/discovery
            source_conversations: Number of distinct conversations this came from
            embedding: Optional embedding vector (will be generated if not provided)
            first_seen_date: Optional date (YYYY-MM) when this item was first seen in chat history
            
            # Legacy parameters (for backward compatibility)
            mode: Deprecated - maps to item_type
            theme: Deprecated - ignored
            content: Deprecated - extracts title/description if new params not provided
            name: Deprecated - maps to title
        
        Returns:
            Item ID
        """
        # Handle legacy content dict format
        if content and not description:
            title = content.get("title", "") or name or title
            description = self._extract_description_from_legacy(content, mode or item_type)
            tags = content.get("tags", tags)
        
        # Map legacy mode to item_type
        if mode and not item_type:
            item_type = mode  # type: ignore
        
        # Use name as title fallback
        if name and not title:
            title = name
        
        # Validate required fields
        if not title:
            title = "Untitled Item"
        if not description:
            description = ""
        
        # Generate item ID
        item_id = f"item-{uuid.uuid4().hex[:8]}"
        
        # Generate embedding if not provided
        if not embedding:
            # Create text representation for embedding
            text = f"{title} {description}"
            embedding = get_embedding(text)
        
        # Check for existing similar item
        existing_id = self._find_similar_item(embedding, item_type, threshold=0.85)
        
        if existing_id:
            # Update existing item
            item = self._get_item(existing_id)
            if item:
                item["occurrence"] = item.get("occurrence", 1) + 1
                item["lastSeen"] = datetime.now().isoformat()[:10]
                item["sourceConversations"] = item.get("sourceConversations", 1) + source_conversations
                # Update firstSeen to earliest date (if new date is earlier)
                # Supports both YYYY-MM and YYYY-MM-DD formats (string comparison works for both)
                if first_seen_date:
                    existing_first_seen = item.get("firstSeen", "")
                    if not existing_first_seen or first_seen_date < existing_first_seen:
                        item["firstSeen"] = first_seen_date
                # Update description if new one is longer/better
                if len(description) > len(item.get("description", "")):
                    item["description"] = description
                # Merge tags
                existing_tags = set(item.get("tags", []))
                if tags:
                    existing_tags.update(tags)
                item["tags"] = list(existing_tags)[:10]  # Cap at 10 tags
                
                # CRITICAL FIX: Expand source date range for Coverage Intelligence
                # When a similar item is deduplicated, the existing item now "covers"
                # both the original period AND the new period. This prevents false
                # coverage gaps where the same concept appears across multiple weeks.
                if source_start_date:
                    existing_start = item.get("sourceStartDate")
                    if not existing_start or source_start_date < existing_start:
                        item["sourceStartDate"] = source_start_date
                if source_end_date:
                    existing_end = item.get("sourceEndDate")
                    if not existing_end or source_end_date > existing_end:
                        item["sourceEndDate"] = source_end_date
                
                return existing_id
        
        # Create new item with unified structure
        item = {
            "id": item_id,
            "itemType": item_type,
            "title": title,
            "description": description,
            "tags": (tags or [])[:10],  # Cap at 10 tags
            "occurrence": 1,
            "sourceConversations": source_conversations,
            "firstSeen": first_seen_date or datetime.now().isoformat()[:7],  # YYYY-MM format
            "lastSeen": datetime.now().isoformat()[:7],  # YYYY-MM format
            "status": "active",
            "categoryId": None,
            "embedding": embedding,
            # Coverage Intelligence: source date range tracking
            "sourceStartDate": source_start_date,  # YYYY-MM-DD format
            "sourceEndDate": source_end_date,  # YYYY-MM-DD format
            # Legacy fields for backward compatibility
            "mode": item_type,
            "theme": "generation",
        }
        
        self._bank["items"].append(item)
        return item_id
    
    def _extract_description_from_legacy(self, content: dict[str, Any], item_type: str) -> str:
        """Extract description from legacy content dict format."""
        parts = []
        
        if item_type == "insight":
            # Legacy: hook, insight, takeaway
            if content.get("hook"):
                parts.append(content["hook"])
            if content.get("insight"):
                parts.append(content["insight"])
            if content.get("takeaway"):
                parts.append(f"\n\n**Takeaway:** {content['takeaway']}")
        elif item_type == "idea":
            # Legacy: problem, solution
            if content.get("problem"):
                parts.append(f"**Problem:** {content['problem']}")
            if content.get("solution"):
                parts.append(f"\n\n**Solution:** {content['solution']}")
            if content.get("why_it_matters"):
                parts.append(f"\n\n**Why It Matters:** {content['why_it_matters']}")
        elif item_type == "use_case":
            # Legacy: what, how, context
            if content.get("what"):
                parts.append(f"**What:** {content['what']}")
            if content.get("how"):
                parts.append(f"\n\n**How:** {content['how']}")
            if content.get("takeaways"):
                parts.append(f"\n\n**Takeaways:** {content['takeaways']}")
        
        # Fallback to any content field
        if not parts:
            if content.get("content"):
                parts.append(content["content"])
            elif content.get("description"):
                parts.append(content["description"])
        
        return "".join(parts).strip()
    
    def _find_similar_item(
        self,
        embedding: list[float],
        item_type: ItemType,
        threshold: float = 0.85,
    ) -> Optional[str]:
        """Find similar item using cosine similarity."""
        
        best_match = None
        best_similarity = 0.0
        
        for item in self._bank["items"]:
            # Check both new itemType and legacy mode
            item_item_type = item.get("itemType") or item.get("mode")
            if item_item_type != item_type:
                continue
            
            if not item.get("embedding"):
                continue
            
            similarity = cosine_similarity(embedding, item["embedding"])
            if similarity > best_similarity and similarity >= threshold:
                best_similarity = similarity
                best_match = item["id"]
        
        return best_match
    
    def _get_item(self, item_id: str) -> Optional[dict[str, Any]]:
        """Get item by ID."""
        for item in self._bank["items"]:
            if item["id"] == item_id:
                return item
        return None
    
    # NOTE: generate_categories() removed - Category grouping is now handled by Theme Explorer
    # Theme Explorer provides dynamic similarity-based grouping with a zoom slider
    # Tags provide user-managed organization
    # Existing categories in the database remain accessible via get_categories()
    
    def get_items(
        self,
        item_type: Optional[ItemType] = None,
        status: Optional[StatusType] = None,
        category_id: Optional[str] = None,
        # Legacy parameters
        mode: Optional[str] = None,
        theme: Optional[str] = None,
        implemented: Optional[bool] = None,
    ) -> list[dict[str, Any]]:
        """Get items with optional filters."""
        items = self._bank["items"]
        
        # Legacy support
        if mode and not item_type:
            item_type = mode  # type: ignore
        if implemented is not None and not status:
            status = "implemented" if implemented else "active"
        
        if item_type:
            items = [item for item in items if (item.get("itemType") or item.get("mode")) == item_type]
        if status:
            items = [item for item in items if item.get("status", "active") == status]
        if category_id:
            items = [item for item in items if item.get("categoryId") == category_id]
        
        # Sort by occurrence (highest first)
        items.sort(key=lambda x: x.get("occurrence", 0), reverse=True)
        
        return items
    
    def get_categories(
        self,
        item_type: Optional[ItemType] = None,
        # Legacy parameters
        mode: Optional[str] = None,
        theme: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Get categories with optional filters."""
        categories = self._bank["categories"]
        
        # Legacy support
        if mode and not item_type:
            item_type = mode  # type: ignore
        
        if item_type:
            categories = [c for c in categories if (c.get("itemType") or c.get("mode")) == item_type]
        
        # Sort by number of items (largest first)
        categories.sort(key=lambda x: len(x.get("itemIds", [])), reverse=True)
        
        return categories
    
    def set_status(
        self,
        item_id: str,
        status: StatusType,
        source: Optional[str] = None,
    ) -> bool:
        """Set item status (active, implemented, posted, archived)."""
        item = self._get_item(item_id)
        if not item:
            return False
        
        item["status"] = status
        if status in ("implemented", "posted"):
            item["statusDate"] = datetime.now().isoformat()[:10]
            if source:
                item["statusSource"] = source
        
        # Legacy compatibility
        item["implemented"] = status == "implemented"
        if status == "implemented":
            item["implementedDate"] = datetime.now().isoformat()[:10]
            if source:
                item["implementedSource"] = source
        
        return True
    
    def mark_implemented(
        self,
        item_id: str,
        source: Optional[str] = None,
    ) -> bool:
        """Mark an item as implemented. Legacy method - use set_status instead."""
        return self.set_status(item_id, "implemented", source)
    
    def clear(self) -> bool:
        """
        Clear all items and categories from the bank.
        
        Returns:
            True if successful
        """
        self._bank = {"version": self.CURRENT_VERSION, "items": [], "categories": []}
        return self.save()
    
    def get_stats(self) -> dict[str, Any]:
        """Get bank statistics."""
        items = self._bank["items"]
        categories = self._bank["categories"]
        
        stats = {
            "totalItems": len(items),
            "totalCategories": len(categories),
            "byType": {},
            "byStatus": {},
            # Legacy fields
            "byMode": {},
            "byTheme": {},
            "implemented": 0,
        }
        
        # Count by item type
        for item in items:
            item_type = item.get("itemType") or item.get("mode", "unknown")
            stats["byType"][item_type] = stats["byType"].get(item_type, 0) + 1
            stats["byMode"][item_type] = stats["byMode"].get(item_type, 0) + 1
        
        # Count by status
        for item in items:
            status = item.get("status", "active")
            stats["byStatus"][status] = stats["byStatus"].get(status, 0) + 1
            if status == "implemented":
                stats["implemented"] += 1
        
        # Legacy: count by theme (always "generation" now)
        stats["byTheme"]["generation"] = len(items)
        
        return stats
