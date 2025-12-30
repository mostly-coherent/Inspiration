"""
Unified Items Bank Management — v1 unified system for Ideas, Insights, and Use Cases.

Replaces separate idea_bank.json and insight_bank.json with a single items_bank.json
that supports user-defined modes and automatic category grouping via cosine similarity.
"""

import json
import hashlib
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Literal, Optional
from collections import defaultdict

from .config import get_data_dir
from .semantic_search import get_embedding, cosine_similarity


ThemeType = Literal["generation", "seek"]
ModeType = str  # User-defined modes: "idea", "insight", "use_case", etc.


class ItemsBank:
    """Unified bank manager for Items and Categories."""
    
    def __init__(self, data_dir: Optional[Path] = None):
        self.data_dir = data_dir or get_data_dir()
        self.bank_path = self.data_dir / "items_bank.json"
        self._bank: dict[str, Any] = {"version": 2, "items": [], "categories": []}
        self._load()
    
    def _load(self) -> None:
        """Load bank from disk."""
        if self.bank_path.exists():
            try:
                with open(self.bank_path) as f:
                    self._bank = json.load(f)
                    # Ensure version is set
                    if "version" not in self._bank:
                        self._bank["version"] = 2
                    # Ensure items and categories arrays exist
                    if "items" not in self._bank:
                        self._bank["items"] = []
                    if "categories" not in self._bank:
                        self._bank["categories"] = []
            except (json.JSONDecodeError, IOError):
                self._bank = {"version": 2, "items": [], "categories": []}
    
    def save(self) -> bool:
        """Save bank to disk."""
        try:
            self._bank["last_updated"] = datetime.now().isoformat()
            self.data_dir.mkdir(parents=True, exist_ok=True)
            with open(self.bank_path, "w") as f:
                json.dump(self._bank, f, indent=2)
            return True
        except IOError:
            return False
    
    def add_item(
        self,
        mode: ModeType,
        theme: ThemeType,
        content: dict[str, Any],
        name: Optional[str] = None,
        embedding: Optional[list[float]] = None,
    ) -> str:
        """
        Add a new item to the bank.
        
        Args:
            mode: Mode identifier (e.g., "idea", "insight", "use_case")
            theme: Theme identifier ("generation" or "seek")
            content: Item content (original data from generation)
            name: Optional name (will be generated if not provided)
            embedding: Optional embedding vector (will be generated if not provided)
        
        Returns:
            Item ID
        """
        # Generate item ID
        item_id = f"item-{uuid.uuid4().hex[:8]}"
        
        # Generate name if not provided
        if not name:
            name = self._generate_item_name(content, mode)
        
        # Generate embedding if not provided
        if not embedding:
            # Create text representation for embedding
            text = self._item_to_text(content, mode)
            embedding = get_embedding(text)
        
        # Check for existing similar item
        existing_id = self._find_similar_item(embedding, mode, threshold=0.85)
        
        if existing_id:
            # Update existing item
            item = self._get_item(existing_id)
            if item:
                item["occurrence"] = item.get("occurrence", 1) + 1
                item["lastSeen"] = datetime.now().isoformat()[:10]
                item["content"] = content  # Update content
                return existing_id
        
        # Create new item
        item = {
            "id": item_id,
            "mode": mode,
            "theme": theme,
            "name": name,
            "content": content,
            "occurrence": 1,
            "firstSeen": datetime.now().isoformat()[:10],
            "lastSeen": datetime.now().isoformat()[:10],
            "categoryId": None,
            "implemented": False,
            "implementedDate": None,
            "implementedSource": None,
            "embedding": embedding,
            "metadata": {
                "generatedDate": datetime.now().isoformat()[:10],
            },
        }
        
        self._bank["items"].append(item)
        return item_id
    
    def _generate_item_name(self, content: dict[str, Any], mode: ModeType) -> str:
        """Generate an intuitive name for an item based on its content."""
        # For ideas: use title or problem
        if mode == "idea":
            return content.get("title") or content.get("problem", "Untitled Idea")[:50]
        # For insights: use title or hook
        elif mode == "insight":
            return content.get("title") or content.get("hook", "Untitled Insight")[:50]
        # For use cases: use description or query
        elif mode == "use_case":
            return content.get("description") or content.get("query", "Untitled Use Case")[:50]
        # Fallback
        return content.get("title") or content.get("name") or "Untitled Item"
    
    def _item_to_text(self, content: dict[str, Any], mode: ModeType) -> str:
        """Convert item content to text for embedding generation."""
        parts = []
        
        if mode == "idea":
            parts.append(content.get("title", ""))
            parts.append(content.get("problem", ""))
            parts.append(content.get("solution", ""))
        elif mode == "insight":
            parts.append(content.get("title", ""))
            parts.append(content.get("hook", ""))
            parts.append(content.get("insight", ""))
        elif mode == "use_case":
            parts.append(content.get("description", ""))
            parts.append(content.get("query", ""))
        
        return " ".join(p for p in parts if p)
    
    def _find_similar_item(
        self,
        embedding: list[float],
        mode: ModeType,
        threshold: float = 0.85,
    ) -> Optional[str]:
        """Find similar item using cosine similarity."""
        
        best_match = None
        best_similarity = 0.0
        
        for item in self._bank["items"]:
            if item["mode"] != mode:
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
    
    def generate_categories(
        self,
        mode: Optional[ModeType] = None,
        similarity_threshold: float = 0.75,
    ) -> list[dict[str, Any]]:
        """
        Generate categories by grouping similar items using cosine similarity.
        
        Args:
            mode: Optional mode filter (only group items of this mode)
            similarity_threshold: Minimum similarity for grouping (0.0-1.0)
        
        Returns:
            List of created/updated categories
        """
        from .semantic_search import cosine_similarity
        
        # Filter items by mode if specified
        items = [item for item in self._bank["items"] if not mode or item["mode"] == mode]
        
        # Group items by similarity
        categories: dict[str, list[str]] = defaultdict(list)
        category_names: dict[str, str] = {}
        
        for item in items:
            if not item.get("embedding"):
                continue
            
            # Find best matching category
            best_category_id = None
            best_similarity = 0.0
            
            for cat in self._bank["categories"]:
                if cat["mode"] != item["mode"]:
                    continue
                
                # Get representative item from category
                if cat["itemIds"]:
                    rep_item = self._get_item(cat["itemIds"][0])
                    if rep_item and rep_item.get("embedding"):
                        similarity = cosine_similarity(
                            item["embedding"],
                            rep_item["embedding"]
                        )
                        if similarity > best_similarity and similarity >= similarity_threshold:
                            best_similarity = similarity
                            best_category_id = cat["id"]
            
            if best_category_id:
                categories[best_category_id].append(item["id"])
            else:
                # Create new category
                cat_id = f"category-{uuid.uuid4().hex[:8]}"
                cat_name = self._generate_category_name([item])
                categories[cat_id] = [item["id"]]
                category_names[cat_id] = cat_name
        
        # Update/create categories
        created_categories = []
        for cat_id, item_ids in categories.items():
            if cat_id in category_names:
                # New category
                category = {
                    "id": cat_id,
                    "name": category_names[cat_id],
                    "theme": items[0]["theme"] if items else "generation",
                    "mode": items[0]["mode"] if items else "idea",
                    "itemIds": item_ids,
                    "similarityThreshold": similarity_threshold,
                    "createdDate": datetime.now().isoformat()[:10],
                }
                self._bank["categories"].append(category)
                created_categories.append(category)
                
                # Update items with category ID
                for item_id in item_ids:
                    item = self._get_item(item_id)
                    if item:
                        item["categoryId"] = cat_id
            else:
                # Update existing category
                category = next((c for c in self._bank["categories"] if c["id"] == cat_id), None)
                if category:
                    # Merge item IDs (avoid duplicates)
                    existing_ids = set(category["itemIds"])
                    for item_id in item_ids:
                        if item_id not in existing_ids:
                            category["itemIds"].append(item_id)
                            existing_ids.add(item_id)
                            # Update item with category ID
                            item = self._get_item(item_id)
                            if item:
                                item["categoryId"] = cat_id
                    created_categories.append(category)
        
        return created_categories
    
    def _generate_category_name(self, items: list[dict[str, Any]]) -> str:
        """
        Generate an intuitive name for a category based on its items.
        Uses LLM for better category names when multiple items are present.
        """
        if not items:
            return "Unnamed Category"
        
        # For single item, use its name
        if len(items) == 1:
            return items[0].get("name", "Category")
        
        # For multiple items, try to find common words first
        words = [item.get("name", "").split() for item in items[:5]]
        common_words = set(words[0])
        for word_list in words[1:]:
            common_words &= set(word_list)
        
        if common_words:
            # Use common words if found
            name = " ".join(sorted(common_words)[:3])
            if len(name) > 50:
                name = name[:47] + "..."
            return name
        
        # Fallback: use first item's name with count
        base_name = items[0].get("name", "Category")
        if len(base_name) > 40:
            base_name = base_name[:37] + "..."
        return f"{base_name} (+{len(items) - 1})"
    
    def get_items(
        self,
        mode: Optional[ModeType] = None,
        theme: Optional[ThemeType] = None,
        implemented: Optional[bool] = None,
        category_id: Optional[str] = None,
    ) -> list[dict[str, Any]]:
        """Get items with optional filters."""
        items = self._bank["items"]
        
        if mode:
            items = [item for item in items if item["mode"] == mode]
        if theme:
            items = [item for item in items if item["theme"] == theme]
        if implemented is not None:
            items = [item for item in items if item["implemented"] == implemented]
        if category_id:
            items = [item for item in items if item.get("categoryId") == category_id]
        
        # Sort by occurrence (highest first)
        items.sort(key=lambda x: x.get("occurrence", 0), reverse=True)
        
        return items
    
    def get_categories(
        self,
        mode: Optional[ModeType] = None,
        theme: Optional[ThemeType] = None,
    ) -> list[dict[str, Any]]:
        """Get categories with optional filters."""
        categories = self._bank["categories"]
        
        if mode:
            categories = [c for c in categories if c["mode"] == mode]
        if theme:
            categories = [c for c in categories if c["theme"] == theme]
        
        # Sort by number of items (largest first)
        categories.sort(key=lambda x: len(x.get("itemIds", [])), reverse=True)
        
        return categories
    
    def mark_implemented(
        self,
        item_id: str,
        source: Optional[str] = None,
    ) -> bool:
        """Mark an item as implemented."""
        item = self._get_item(item_id)
        if not item:
            return False
        
        item["implemented"] = True
        item["implementedDate"] = datetime.now().isoformat()[:10]
        if source:
            item["implementedSource"] = source
        
        return True
    
    def get_stats(self) -> dict[str, Any]:
        """Get bank statistics."""
        items = self._bank["items"]
        categories = self._bank["categories"]
        
        stats = {
            "totalItems": len(items),
            "totalCategories": len(categories),
            "byMode": {},
            "byTheme": {},
            "implemented": sum(1 for item in items if item.get("implemented")),
        }
        
        # Count by mode
        for item in items:
            mode = item["mode"]
            stats["byMode"][mode] = stats["byMode"].get(mode, 0) + 1
        
        # Count by theme
        for item in items:
            theme = item["theme"]
            stats["byTheme"][theme] = stats["byTheme"].get(theme, 0) + 1
        
        return stats

