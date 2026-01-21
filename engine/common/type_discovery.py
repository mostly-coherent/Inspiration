"""
Type Discovery — Discover new entity types from "other" category using clustering and LLM.

Part of Schema Evolution (P2): Allows schema to evolve by discovering new types from
unclassified entities without requiring full re-indexing.
"""

import json
from typing import Any, Optional
from dataclasses import dataclass
from collections import defaultdict

try:
    from sklearn.cluster import DBSCAN
    from sklearn.preprocessing import StandardScaler
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    DBSCAN = None
    StandardScaler = None

from .semantic_search import get_embedding, EMBEDDING_DIM
from .llm import call_llm
from .config import load_env_file

# Note: sklearn is optional - install with: pip install scikit-learn


@dataclass
class TypeProposal:
    """A proposed new entity type discovered from clustering."""
    proposed_type: str
    description: str
    example_entities: list[str]
    cluster_size: int
    confidence: float
    rationale: str


@dataclass
class EntityCluster:
    """A cluster of similar entities."""
    cluster_id: int
    entity_ids: list[str]
    entity_names: list[str]
    centroid_embedding: Optional[list[float]] = None
    size: int = 0


class TypeDiscovery:
    """
    Discover new entity types from "other" category entities using clustering and LLM.
    
    Process:
    1. Fetch all "other" entities with embeddings
    2. Cluster entities by embedding similarity
    3. Use LLM to propose types from clusters
    4. Return proposals for human validation
    """
    
    def __init__(self, supabase_client):
        self.supabase = supabase_client
        load_env_file()
    
    def fetch_other_entities(self, limit: Optional[int] = None) -> list[dict]:
        """
        Fetch all entities with entity_type='other' that have embeddings.
        
        Returns list of entity dicts with: id, canonical_name, embedding, mention_count
        """
        query = (
            self.supabase.table("kg_entities")
            .select("id, canonical_name, embedding, mention_count, source_type")
            .eq("entity_type", "other")
            .not_.is_("embedding", "null")
            .order("mention_count", desc=True)
        )
        
        if limit:
            query = query.limit(limit)
        
        result = query.execute()
        return result.data if result.data else []
    
    def cluster_entities(
        self,
        entities: list[dict],
        min_cluster_size: int = 5,
        eps: float = 0.3
    ) -> list[EntityCluster]:
        """
        Cluster entities by embedding similarity using DBSCAN.
        
        Args:
            entities: List of entity dicts with embeddings
            min_cluster_size: Minimum entities per cluster
            eps: Maximum distance between samples in same cluster (0.0-1.0)
        
        Returns:
            List of EntityCluster objects
        """
        if not SKLEARN_AVAILABLE:
            raise RuntimeError("scikit-learn not available. Install with: pip install scikit-learn")
        
        if len(entities) < min_cluster_size:
            return []
        
        # Extract embeddings
        embeddings = []
        entity_data = []
        for entity in entities:
            if entity.get("embedding"):
                embeddings.append(entity["embedding"])
                entity_data.append(entity)
        
        if len(embeddings) < min_cluster_size:
            return []
        
        # Convert to numpy array
        import numpy as np
        X = np.array(embeddings)
        
        # Standardize embeddings (DBSCAN works better with standardized data)
        scaler = StandardScaler()
        X_scaled = scaler.fit_transform(X)
        
        # Cluster using DBSCAN
        clustering = DBSCAN(eps=eps, min_samples=min_cluster_size, metric='cosine')
        cluster_labels = clustering.fit_predict(X_scaled)
        
        # Group entities by cluster
        clusters: dict[int, EntityCluster] = {}
        for idx, label in enumerate(cluster_labels):
            if label == -1:  # Noise (outliers)
                continue
            
            if label not in clusters:
                clusters[label] = EntityCluster(
                    cluster_id=label,
                    entity_ids=[],
                    entity_names=[],
                    size=0
                )
            
            entity = entity_data[idx]
            clusters[label].entity_ids.append(entity["id"])
            clusters[label].entity_names.append(entity["canonical_name"])
            clusters[label].size += 1
        
        # Calculate centroids for each cluster
        for cluster_id, cluster in clusters.items():
            cluster_indices = [i for i, label in enumerate(cluster_labels) if label == cluster_id]
            cluster_embeddings = X[cluster_indices]
            centroid = cluster_embeddings.mean(axis=0).tolist()
            cluster.centroid_embedding = centroid
        
        return list(clusters.values())
    
    def propose_types_from_clusters(
        self,
        clusters: list[EntityCluster],
        max_proposals: int = 10
    ) -> list[TypeProposal]:
        """
        Use LLM to propose entity types from clusters.
        
        Args:
            clusters: List of EntityCluster objects
            max_proposals: Maximum number of type proposals to generate
        
        Returns:
            List of TypeProposal objects
        """
        if not clusters:
            return []
        
        # Sort clusters by size (largest first)
        sorted_clusters = sorted(clusters, key=lambda c: c.size, reverse=True)
        
        proposals = []
        for cluster in sorted_clusters[:max_proposals]:
            # Build prompt for LLM
            example_names = cluster.entity_names[:10]  # Top 10 examples
            prompt = f"""Analyze this cluster of {cluster.size} entities and propose a new entity type.

Entities in cluster:
{', '.join(example_names)}

Current entity types in the system:
- tool: Technologies, frameworks, libraries (React, Supabase, Prisma)
- pattern: Design patterns, architectural patterns (caching, retry logic)
- problem: Issues, bugs, challenges (auth timeout, race condition)
- concept: Abstract ideas, principles (DRY, composition over inheritance)
- person: People mentioned (Lenny, Dan Abramov, team members)
- project: Projects, codebases, repos (Inspiration, dad-aura)
- workflow: Processes, methodologies (TDD, code review, pair programming)
- other: Entities that don't fit other categories

Propose a new entity type that best describes this cluster. Consider:
1. What do these entities have in common?
2. What category would they fit into?
3. Is this distinct from existing types?

Respond in JSON format:
{{
    "proposed_type": "lowercase_type_name",
    "description": "Brief description of what this type represents",
    "example_entities": ["entity1", "entity2", "entity3"],
    "confidence": 0.0-1.0,
    "rationale": "Why this type makes sense for this cluster"
}}"""
            
            try:
                response = call_llm(
                    prompt,
                    provider="anthropic",
                    model="claude-3-5-sonnet-20241022",
                    temperature=0.3,
                    max_tokens=500
                )
                
                # Parse JSON response
                response_text = response.strip()
                # Remove markdown code blocks if present
                if response_text.startswith("```"):
                    lines = response_text.split("\n")
                    response_text = "\n".join(lines[1:-1]) if len(lines) > 2 else response_text
                
                proposal_data = json.loads(response_text)
                
                proposal = TypeProposal(
                    proposed_type=proposal_data.get("proposed_type", ""),
                    description=proposal_data.get("description", ""),
                    example_entities=proposal_data.get("example_entities", [])[:10],
                    cluster_size=cluster.size,
                    confidence=float(proposal_data.get("confidence", 0.5)),
                    rationale=proposal_data.get("rationale", "")
                )
                
                # Validate proposal
                if proposal.proposed_type and proposal.confidence > 0.3:
                    proposals.append(proposal)
            
            except Exception as e:
                print(f"Error proposing type for cluster {cluster.cluster_id}: {e}")
                continue
        
        return proposals
    
    def discover_types(
        self,
        limit: Optional[int] = None,
        min_cluster_size: int = 5,
        eps: float = 0.3,
        max_proposals: int = 10
    ) -> list[TypeProposal]:
        """
        Main entry point: Discover new entity types from "other" entities.
        
        Args:
            limit: Maximum number of "other" entities to analyze
            min_cluster_size: Minimum entities per cluster
            eps: DBSCAN eps parameter (clustering threshold)
            max_proposals: Maximum type proposals to generate
        
        Returns:
            List of TypeProposal objects for human validation
        """
        # Step 1: Fetch "other" entities
        entities = self.fetch_other_entities(limit=limit)
        print(f"Found {len(entities)} 'other' entities with embeddings")
        
        if len(entities) < min_cluster_size:
            print(f"Not enough entities for clustering (need at least {min_cluster_size})")
            return []
        
        # Step 2: Cluster entities
        clusters = self.cluster_entities(entities, min_cluster_size=min_cluster_size, eps=eps)
        print(f"Found {len(clusters)} clusters")
        
        if not clusters:
            print("No clusters found. Try adjusting min_cluster_size or eps parameters.")
            return []
        
        # Step 3: Propose types from clusters
        proposals = self.propose_types_from_clusters(clusters, max_proposals=max_proposals)
        print(f"Generated {len(proposals)} type proposals")
        
        return proposals
