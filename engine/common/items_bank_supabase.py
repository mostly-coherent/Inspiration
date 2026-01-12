"""
Supabase-based Items Bank Management

Replaces JSON file storage with Supabase for scalable cloud storage.
API-compatible with items_bank.py for easy migration.

OPTIMIZATIONS (H-1, H-2):
- Batch similarity search using pgvector RPC
- Parallel processing with ThreadPoolExecutor
"""

import uuid
import time
from datetime import datetime
from typing import Any, Literal, Optional, Callable, TypeVar
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed

from .vector_db import get_supabase_client
from .semantic_search import get_embedding, cosine_similarity

T = TypeVar('T')


ThemeType = Literal["generation", "seek"]
ItemType = Literal["insight", "idea", "use_case"]
StatusType = Literal["active", "implemented", "posted", "archived"]


def _is_retryable_error(error: Exception) -> bool:
    """Check if error is retryable (transient) vs permanent."""
    error_str = str(error).lower()
    error_type = type(error).__name__
    
    # Network errors are retryable
    if "network" in error_str or "connection" in error_str or "timeout" in error_str:
        return True
    
    # Check for HTTP status codes in error message
    # 429 = Too Many Requests (rate limit)
    # 503 = Service Unavailable
    # 502 = Bad Gateway
    # 504 = Gateway Timeout
    if "429" in error_str or "503" in error_str or "502" in error_str or "504" in error_str:
        return True
    
    # Permanent errors (don't retry)
    # 400 = Bad Request
    # 401 = Unauthorized
    # 404 = Not Found
    if "400" in error_str or "401" in error_str or "404" in error_str:
        return False
    
    # Default: retry on unknown errors (safer to retry than fail)
    return True


def _retry_supabase_operation(
    operation: Callable[[], T],
    max_retries: int = 3,
    initial_delay: float = 0.5,
    max_delay: float = 5.0,
    operation_name: str = "Supabase operation"
) -> T:
    """
    Retry a Supabase operation with exponential backoff.
    
    Args:
        operation: Function to execute (no args)
        max_retries: Maximum number of retry attempts
        initial_delay: Initial delay in seconds
        max_delay: Maximum delay in seconds
        operation_name: Name for error messages
    
    Returns:
        Result of operation
    
    Raises:
        Exception: Last exception if all retries fail
    """
    last_error = None
    
    for attempt in range(max_retries + 1):
        try:
            return operation()
        except Exception as e:
            last_error = e
            
            # Don't retry on last attempt
            if attempt >= max_retries:
                break
            
            # Don't retry if error is permanent
            if not _is_retryable_error(e):
                break
            
            # Calculate delay with exponential backoff
            delay = min(initial_delay * (2 ** attempt), max_delay)
            
            import sys
            print(f"   ⚠️ {operation_name} failed (attempt {attempt + 1}/{max_retries + 1}): {str(e)[:100]}", file=sys.stderr)
            print(f"      Retrying in {delay:.1f}s...", file=sys.stderr)
            time.sleep(delay)
    
    # All retries exhausted or permanent error
    raise last_error


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
        embedding: Optional[list[float]] = None,
        first_seen_date: Optional[str] = None,  # YYYY-MM format (from filename) or YYYY-MM-DD (converted)
        # Coverage Intelligence: source date range tracking
        source_start_date: Optional[str] = None,  # YYYY-MM-DD format (full date)
        source_end_date: Optional[str] = None,  # YYYY-MM-DD format (full date)
        # Theme tracking
        theme: Optional[str] = None,
        # Deprecated - kept for backward compatibility in function signature
        tags: Optional[list[str]] = None,  # Deprecated: not written
        quality: Optional[str] = None,  # Deprecated: not written
        mode: Optional[str] = None,  # Deprecated: use item_type
        source_conversations: int = 1,  # Deprecated: use occurrence
        content: Optional[dict[str, Any]] = None,  # Deprecated
        name: Optional[str] = None,  # Deprecated
    ) -> str:
        """
        Add a new item to Supabase.
        
        Args:
            item_type: Type of item ("idea", "insight", "use_case")
            title: Item title
            description: Item description
            embedding: Pre-computed embedding vector
            first_seen_date: Date when item content was first seen (YYYY-MM format)
            source_start_date: Start date of the generation run (YYYY-MM-DD)
            source_end_date: End date of the generation run (YYYY-MM-DD)
            theme: "generation" or "seek"
        
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
        
        # DATE FORMAT STANDARD:
        # - first_seen / last_seen: YYYY-MM format (month-year, backward compatibility)
        # - first_seen_date / last_seen_date: YYYY-MM-DD format (full date, preferred)
        # - source_start_date / source_end_date: YYYY-MM-DD format (full date, Coverage Intelligence)
        # Convert first_seen_date from YYYY-MM to YYYY-MM-DD if needed
        if first_seen_date and len(first_seen_date) == 7:  # YYYY-MM format
            first_seen_date_full = f"{first_seen_date}-01"  # Use first day of month
        else:
            first_seen_date_full = first_seen_date or datetime.now().strftime("%Y-%m-%d")
        
        # Prepare item data (simplified schema v2)
        item_data = {
            "id": item_id,
            "item_type": item_type,
            "title": title,
            "description": description,
            "status": "active",
            "occurrence": 1,
            "first_seen": first_seen_date[:7] if first_seen_date and len(first_seen_date) >= 7 else datetime.now().strftime("%Y-%m"),
            "last_seen": datetime.now().strftime("%Y-%m"),
            # Day-level precision dates for analytics
            "first_seen_date": first_seen_date_full,
            "last_seen_date": datetime.now().strftime("%Y-%m-%d"),
            "category_id": None,
            "embedding": embedding,
            # Coverage Intelligence: source date range tracking
            "source_start_date": source_start_date,
            "source_end_date": source_end_date,
            # Theme tracking
            "theme": theme or "generation",
        }
        
        # Insert into Supabase
        result = self.client.table("library_items").insert(item_data).execute()
        
        if not result.data:
            raise Exception(f"Failed to insert item: {result}")
        
        # Record in occurrence history table (if it exists)
        try:
            self.client.table("library_occurrence_history").insert({
                "item_id": item_id,
                "occurred_at": datetime.now().strftime("%Y-%m-%d"),
                "source_type": "generation",
                "source_context": f"New item created ({item_type})",
            }).execute()
        except Exception:
            pass  # Table might not exist yet
        
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
        
        # Try server-side similarity search first (fast path, with retry)
        try:
            def rpc_search():
                result = self.client.rpc(
                    "search_similar_library_items",
                    {
                        "query_embedding": embedding,
                        "match_threshold": threshold,
                        "match_count": 1,  # We only need the best match
                        "filter_item_type": item_type,
                    }
                ).execute()
                return result
            
            result = _retry_supabase_operation(
                rpc_search,
                max_retries=2,  # Fewer retries for RPC (usually fast)
                operation_name="RPC similarity search"
            )
            
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
        # Fetch current item (with retry)
        def fetch_item():
            result = self.client.table("library_items").select(
                "occurrence, source_start_date, source_end_date"
            ).eq("id", item_id).single().execute()
            return result
        
        try:
            result = _retry_supabase_operation(
                fetch_item,
                max_retries=2,
                operation_name=f"Fetch item {item_id}"
            )
        except Exception:
            return False
        
        if not result.data:
            return False
        
        current = result.data
        current_occurrence = current.get("occurrence", 0)
        
        # Build update data
        update_data = {
            "occurrence": current_occurrence + 1,
            "last_seen": datetime.now().strftime("%Y-%m"),
            "last_seen_date": datetime.now().strftime("%Y-%m-%d"),  # Day-level precision
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
        
        # Update in Supabase (with retry)
        def update_item():
            update_result = self.client.table("library_items").update(update_data).eq("id", item_id).execute()
            return update_result
        
        try:
            update_result = _retry_supabase_operation(
                update_item,
                max_retries=2,
                operation_name=f"Update item {item_id}"
            )
            return bool(update_result.data)
        except Exception:
            return False
    
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
            "last_seen_date": datetime.now().strftime("%Y-%m-%d"),  # Day-level precision
        }).eq("id", item_id).execute()
        
        # Record in occurrence history table (if it exists)
        try:
            self.client.table("library_occurrence_history").insert({
                "item_id": item_id,
                "occurred_at": datetime.now().strftime("%Y-%m-%d"),
                "source_type": "deduplication",
                "source_context": "Item expanded via occurrence increment",
            }).execute()
        except Exception:
            pass  # Table might not exist yet
        
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
        
        import sys
        
        # Extract embeddings (already pre-computed)
        embeddings = [item.get("embedding") for item in items]
        
        # PHASE 1: Parallel similarity search using ThreadPoolExecutor
        print(f"   ⚡ Parallel dedup check for {len(items)} items (workers={max_workers})...", file=sys.stderr)
        # Emit progress marker to stdout for frontend (dedup phase)
        print(f"[PROGRESS:current=0,total={len(items)},label=deduplicating]", flush=True)
        
        try:
            similar_matches = self._batch_find_similar_parallel(
                embeddings=embeddings,
                item_type=item_type,
                threshold=threshold,
                max_workers=max_workers,
            )
        except Exception as e:
            # Emit error marker for frontend
            error_msg = str(e)[:200]  # Truncate long error messages
            print(f"[ERROR:type=batch_dedup,message=Batch deduplication failed: {error_msg}]", flush=True)
            print(f"   ⚠️ Batch deduplication failed: {e}", file=sys.stderr)
            raise  # Re-raise to let caller handle
        
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
                # New item - prepare insert (simplified schema v2)
                # DATE FORMAT STANDARD: Convert first_seen_date from YYYY-MM to YYYY-MM-DD if needed
                first_seen_date_raw = item.get("first_seen_date")
                if first_seen_date_raw and len(first_seen_date_raw) == 7:  # YYYY-MM format
                    first_seen_date_full = f"{first_seen_date_raw}-01"  # Use first day of month
                    first_seen_month = first_seen_date_raw
                else:
                    first_seen_date_full = first_seen_date_raw or datetime.now().strftime("%Y-%m-%d")
                    first_seen_month = first_seen_date_full[:7] if len(first_seen_date_full) >= 7 else datetime.now().strftime("%Y-%m")
                
                item_id = f"item-{uuid.uuid4().hex[:8]}"
                items_to_insert.append({
                    "id": item_id,
                    "item_type": item_type,
                    "title": item.get("title", ""),
                    "description": item.get("description", ""),
                    "status": "active",
                    "occurrence": 1,
                    "first_seen": first_seen_month,  # YYYY-MM format
                    "last_seen": datetime.now().strftime("%Y-%m"),
                    # Day-level precision dates for analytics
                    "first_seen_date": first_seen_date_full,  # YYYY-MM-DD format
                    "last_seen_date": datetime.now().strftime("%Y-%m-%d"),
                    "category_id": None,
                    "embedding": item.get("embedding"),
                    "source_start_date": source_start_date,
                    "source_end_date": source_end_date,
                    "theme": "generation",
                })
        
        # Emit dedup complete marker
        print(f"[STAT:dedupNew={len(items_to_insert)}]", flush=True)
        print(f"[STAT:dedupDuplicates={len(items_to_update)}]", flush=True)
        
        # PHASE 3: Batch insert new items
        added = 0
        insert_errors = []
        if items_to_insert:
            print(f"[PROGRESS:current=0,total={len(items_to_insert)},label=inserting]", flush=True)
            try:
                # Supabase supports batch insert (with retry)
                def batch_insert():
                    result = self.client.table("library_items").insert(items_to_insert).execute()
                    return len(result.data) if result.data else 0
                
                added = _retry_supabase_operation(
                    batch_insert,
                    max_retries=3,
                    operation_name="Batch insert"
                )
                print(f"[PROGRESS:current={added},total={len(items_to_insert)},label=inserting]", flush=True)
            except Exception as e:
                print(f"   ⚠️ Batch insert failed after retries, falling back to individual inserts: {e}", file=sys.stderr)
                for idx, item_data in enumerate(items_to_insert):
                    try:
                        def single_insert():
                            self.client.table("library_items").insert(item_data).execute()
                            return True
                        
                        _retry_supabase_operation(
                            single_insert,
                            max_retries=2,  # Fewer retries for individual inserts
                            operation_name=f"Insert item {idx + 1}"
                        )
                        added += 1
                    except Exception as item_err:
                        insert_errors.append(f"Item {idx}: {str(item_err)[:50]}")
                    # Emit progress every 5 items
                    if (idx + 1) % 5 == 0:
                        print(f"[PROGRESS:current={idx + 1},total={len(items_to_insert)},label=inserting]", flush=True)
        
        # PHASE 4: Batch update existing items (expand date ranges)
        updated = 0
        update_errors = []
        if items_to_update:
            print(f"[PROGRESS:current=0,total={len(items_to_update)},label=updating]", flush=True)
            completed = 0
            # Group updates and process in parallel
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                futures = {
                    executor.submit(
                        self._update_existing_item_on_dedup,
                        update["existing_id"],
                        update["source_start_date"],
                        update["source_end_date"],
                    ): update["existing_id"]
                    for update in items_to_update
                }
                for future in as_completed(futures):
                    completed += 1
                    try:
                        if future.result():
                            updated += 1
                    except Exception as update_err:
                        update_errors.append(f"Update failed: {str(update_err)[:50]}")
                    # Emit progress every 5 items
                    if completed % 5 == 0:
                        print(f"[PROGRESS:current={completed},total={len(items_to_update)},label=updating]", flush=True)
            print(f"[PROGRESS:current={len(items_to_update)},total={len(items_to_update)},label=updating]", flush=True)
        
        # Log any errors (to stderr for debugging)
        all_errors = insert_errors + update_errors
        if all_errors:
            print(f"   ⚠️ {len(all_errors)} item(s) had errors during batch operation", file=sys.stderr)
            for err in all_errors[:5]:  # Show first 5 errors
                print(f"      - {err}", file=sys.stderr)
            if len(all_errors) > 5:
                print(f"      ... and {len(all_errors) - 5} more", file=sys.stderr)
        
        return {
            "added": added,
            "updated": updated,
            "total": len(items),
            "dedup_matches": len(items_to_update),
            "errors": all_errors,
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