"""
Common utilities for Inspiration engine.
"""

from .config import (
    load_config,
    save_config,
    get_workspaces,
    set_workspaces,
    is_feature_enabled,
    get_feature_config,
    get_llm_config,
    is_setup_complete,
    mark_setup_complete,
    load_env_file,
    get_data_dir,
)

from .cursor_db import (
    get_cursor_db_path,
    get_workspace_mapping,
    get_conversations_for_date,
    get_conversations_for_range,
    format_conversations_for_prompt,
)

from .llm import (
    LLMProvider,
    create_llm,
    DEFAULT_ANTHROPIC_MODEL,
    DEFAULT_OPENAI_MODEL,
)

__all__ = [
    # Config
    "load_config",
    "save_config",
    "get_workspaces",
    "set_workspaces",
    "is_feature_enabled",
    "get_feature_config",
    "get_llm_config",
    "is_setup_complete",
    "mark_setup_complete",
    "load_env_file",
    "get_data_dir",
    # Cursor DB
    "get_cursor_db_path",
    "get_workspace_mapping",
    "get_conversations_for_date",
    "get_conversations_for_range",
    "format_conversations_for_prompt",
    # LLM
    "LLMProvider",
    "create_llm",
    "DEFAULT_ANTHROPIC_MODEL",
    "DEFAULT_OPENAI_MODEL",
]

