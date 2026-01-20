"""
Knowledge Graph Type Definitions

Core types for entity extraction, storage, and querying.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional


class EntityType(str, Enum):
    """Types of entities that can be extracted from conversations."""
    
    TOOL = "tool"           # Technologies, frameworks, libraries (React, Supabase, Prisma)
    PATTERN = "pattern"     # Design patterns, architectural patterns (caching, retry logic)
    PROBLEM = "problem"     # Issues, bugs, challenges (auth timeout, race condition)
    CONCEPT = "concept"     # Abstract ideas, principles (DRY, composition over inheritance)
    PERSON = "person"       # People mentioned (Lenny, Dan Abramov, team members)
    PROJECT = "project"     # Projects, codebases, repos (Inspiration, dad-aura)
    WORKFLOW = "workflow"   # Processes, methodologies (TDD, code review, pair programming)
    OTHER = "other"         # Entities that don't fit other categories (companies, metrics, events, etc.)
    
    @classmethod
    def from_string(cls, value: str) -> "EntityType":
        """Convert string to EntityType, case-insensitive."""
        try:
            return cls(value.lower())
        except ValueError:
            raise ValueError(f"Unknown entity type: {value}. Valid types: {[e.value for e in cls]}")


class RelationType(str, Enum):
    """Types of relationships between entities."""
    
    SOLVES = "SOLVES"               # tool/pattern SOLVES problem
    CAUSES = "CAUSES"               # problem CAUSES problem (cascade)
    ENABLES = "ENABLES"             # pattern/tool ENABLES capability
    PART_OF = "PART_OF"             # entity is component of larger entity
    USED_WITH = "USED_WITH"         # entities commonly used together
    ALTERNATIVE_TO = "ALTERNATIVE_TO"  # entities serve similar purpose
    REQUIRES = "REQUIRES"           # entity depends on another
    IMPLEMENTS = "IMPLEMENTS"       # pattern/tool IMPLEMENTS concept
    MENTIONED_BY = "MENTIONED_BY"   # person MENTIONED entity (expert attribution)
    # Temporal chain relations (Phase 1b: User Chat KG)
    FOLLOWED_BY = "FOLLOWED_BY"     # chat A FOLLOWED_BY chat B (temporal sequence)
    REFERENCED_BY = "REFERENCED_BY" # chat A REFERENCED_BY chat B (explicit reference)
    OBSOLETES = "OBSOLETES"         # chat A OBSOLETES chat B (deprecated code)


@dataclass
class Entity:
    """An extracted entity from conversations."""
    
    id: str
    canonical_name: str
    entity_type: EntityType
    aliases: list[str] = field(default_factory=list)
    description: Optional[str] = None
    embedding: Optional[list[float]] = None
    
    # Frequency & temporal data
    mention_count: int = 0
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    
    # Confidence & provenance
    confidence: float = 1.0
    source: str = "llm"  # 'llm', 'user_created', 'user_corrected'
    
    # Timestamps
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "canonical_name": self.canonical_name,
            "entity_type": self.entity_type.value,
            "aliases": self.aliases,
            "description": self.description,
            "mention_count": self.mention_count,
            "first_seen": self.first_seen.isoformat() if self.first_seen else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "confidence": self.confidence,
            "source": self.source,
        }
    
    @classmethod
    def from_dict(cls, data: dict) -> "Entity":
        """Create Entity from dictionary."""
        return cls(
            id=data["id"],
            canonical_name=data["canonical_name"],
            entity_type=EntityType(data["entity_type"]),
            aliases=data.get("aliases", []),
            description=data.get("description"),
            embedding=data.get("embedding"),
            mention_count=data.get("mention_count", 0),
            first_seen=datetime.fromisoformat(data["first_seen"]) if data.get("first_seen") else None,
            last_seen=datetime.fromisoformat(data["last_seen"]) if data.get("last_seen") else None,
            confidence=data.get("confidence", 1.0),
            source=data.get("source", "llm"),
        )


@dataclass
class EntityMention:
    """A single mention of an entity in a conversation message."""
    
    id: str
    entity_id: str
    message_id: str
    context_snippet: str
    message_timestamp: int  # Unix timestamp in milliseconds
    mention_start: Optional[int] = None
    mention_end: Optional[int] = None
    created_at: Optional[datetime] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "entity_id": self.entity_id,
            "message_id": self.message_id,
            "context_snippet": self.context_snippet,
            "message_timestamp": self.message_timestamp,
            "mention_start": self.mention_start,
            "mention_end": self.mention_end,
        }


@dataclass
class Relation:
    """A relationship between two entities."""
    
    id: str
    source_entity_id: str
    target_entity_id: str
    relation_type: RelationType
    
    # Frequency & confidence
    occurrence_count: int = 1
    confidence: float = 1.0
    
    # Provenance
    source: str = "llm"
    evidence_snippet: Optional[str] = None
    
    # Timestamps
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "id": self.id,
            "source_entity_id": self.source_entity_id,
            "target_entity_id": self.target_entity_id,
            "relation_type": self.relation_type.value,
            "occurrence_count": self.occurrence_count,
            "confidence": self.confidence,
            "source": self.source,
            "evidence_snippet": self.evidence_snippet,
        }


@dataclass
class ExtractedEntity:
    """Entity as extracted by LLM (before deduplication/storage)."""
    
    name: str
    entity_type: EntityType
    aliases: list[str] = field(default_factory=list)
    confidence: float = 1.0
    context_snippet: Optional[str] = None
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "name": self.name,
            "entity_type": self.entity_type.value,
            "aliases": self.aliases,
            "confidence": self.confidence,
        }


@dataclass
class ExtractedRelation:
    """Relation as extracted by LLM (before storage)."""
    
    source_name: str
    target_name: str
    relation_type: RelationType
    evidence_snippet: Optional[str] = None
    confidence: float = 1.0
    
    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            "source_name": self.source_name,
            "target_name": self.target_name,
            "relation_type": self.relation_type.value,
            "evidence_snippet": self.evidence_snippet,
            "confidence": self.confidence,
        }


# Type aliases for API responses
EntityStatsResponse = dict  # {"totalEntities": int, "byType": dict, "totalMentions": int, "indexed": bool}
EntityListResponse = list[dict]  # List of Entity.to_dict()


# Skip list - common terms that shouldn't be extracted as entities
KG_SKIP_LIST = [
    # Generic terms
    "it", "this", "that", "thing", "stuff", "something", "anything",
    "code", "data", "file", "files", "folder", "directory",
    "function", "method", "class", "component", "module",
    "error", "bug", "issue", "problem", "fix",
    "app", "application", "project", "system", "service",
    "user", "users", "client", "server",
    "request", "response", "api", "endpoint",
    "database", "db", "table", "query",
    "test", "tests", "testing",
    "config", "configuration", "settings",
    "build", "deploy", "deployment",
    # Cursor-specific
    "cursor", "composer", "chat", "conversation",
    "assistant", "ai", "llm", "model",
    # Common actions
    "create", "update", "delete", "read", "get", "set",
    "add", "remove", "change", "modify",
    # Time-related
    "today", "yesterday", "tomorrow", "now", "later",
    # Numbers and generic quantities
    "one", "two", "three", "first", "second", "last",
    "some", "many", "few", "all", "none",
]
