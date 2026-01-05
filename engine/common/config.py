"""
Configuration Management — Load and save user configuration.
"""

import json
import os
from pathlib import Path
from typing import Any, Optional

try:
    from supabase import create_client, Client
    SUPABASE_AVAILABLE = True
except ImportError:
    SUPABASE_AVAILABLE = False


# Default configuration
DEFAULT_CONFIG = {
    "version": 1,
    "setupComplete": False,
    "workspaces": [],
    "llm": {
        "provider": "anthropic",  # Options: "anthropic", "openai", "openrouter"
        "model": "claude-sonnet-4-20250514",
        "fallbackProvider": "openai",  # Optional fallback provider
        "fallbackModel": "gpt-4o",
        "judgeProvider": "openai",  # Cheaper model for judging
        "judgeModel": "gpt-3.5-turbo",  # ~80% cost reduction vs Claude Sonnet 4
        "useCheaperJudge": True,  # Enable cheaper model for judging (can be disabled for quality comparison)
        "promptCompression": {
            "enabled": False,  # Enable prompt compression for cost savings (requires quality validation)
            "threshold": 10000,  # Compress if prompt exceeds this many tokens (estimated)
            "compressionModel": "gpt-3.5-turbo",  # Model to use for compression
        },
        # v3 LLM Task Assignments (explicit per-task configuration)
        "generationModel": "claude-sonnet-4-20250514",
        "generationProvider": "anthropic",
        "embeddingModel": "text-embedding-3-small",
        "embeddingProvider": "openai",
        "compressionModel": "gpt-3.5-turbo",
        "compressionProvider": "openai",
    },
    "features": {
        "linkedInSync": {
            "enabled": False,
            "postsDirectory": None,
        },
        "solvedStatusSync": {
            "enabled": False,
        },
        "customVoice": {
            "enabled": False,
            "filePath": None,
        },
    },
    "ui": {
        "defaultTool": "insights",
        "defaultMode": "sprint",
    },
    # v3 Advanced Thresholds
    "advancedThresholds": {
        "categorySimilarity": 0.75,  # Threshold for grouping items into categories
        "judgeTemperature": 0.0,  # Temperature for ranking/judging LLM calls
        "compressionTokenThreshold": 10000,  # Compress conversations exceeding this token count
        "compressionDateThreshold": 7,  # Skip compression for date ranges < this many days
    },
    # v3 Custom Time Presets
    "customTimePresets": [],
}


def get_data_dir() -> Path:
    """Get the data directory path (relative to engine location)."""
    engine_dir = Path(__file__).parent.parent
    data_dir = engine_dir.parent / "data"
    data_dir.mkdir(exist_ok=True)
    return data_dir


def get_config_path() -> Path:
    """Get the config file path."""
    return get_data_dir() / "config.json"


def get_supabase_client() -> Optional[Any]:
    """Get Supabase client if configured."""
    if not SUPABASE_AVAILABLE:
        return None
    
    load_env_file()
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_ANON_KEY")
    
    if url and key:
        try:
            return create_client(url, key)
        except Exception:
            pass
    return None


def load_config() -> dict[str, Any]:
    """
    Load user configuration.
    
    Priority order:
    1. Local file (if exists) - preferred for development
    2. Supabase (if configured) - for Vercel deployment
    3. Defaults
    
    Returns:
        Configuration dict (merged with defaults for missing keys)
    """
    config_path = get_config_path()
    
    # Try local file first (preferred for local development)
    if config_path.exists():
        try:
            with open(config_path) as f:
                user_config = json.load(f)
            
            # Merge with defaults (user config wins)
            return _deep_merge(DEFAULT_CONFIG.copy(), user_config)
        
        except (json.JSONDecodeError, IOError) as e:
            print(f"⚠️  Failed to load config from local file: {e}")
    
    # Fallback to Supabase (for Vercel where local file doesn't exist)
    supabase = get_supabase_client()
    if supabase:
        try:
            response = supabase.table("app_config").select("value").eq("key", "user_config").execute()
            if response.data and len(response.data) > 0:
                user_config = response.data[0]["value"]
                return _deep_merge(DEFAULT_CONFIG.copy(), user_config)
        except Exception as e:
            print(f"⚠️  Failed to load config from Supabase: {e}")
    
    return DEFAULT_CONFIG.copy()


def save_config(config: dict[str, Any]) -> bool:
    """
    Save user configuration.
    
    Args:
        config: Configuration dict to save
    
    Returns:
        True if successful, False otherwise
    """
    success = False
    
    # Save to Supabase
    supabase = get_supabase_client()
    if supabase:
        try:
            from datetime import datetime
            data = {
                "key": "user_config",
                "value": config,
                "updated_at": datetime.now().isoformat()
            }
            supabase.table("app_config").upsert(data).execute()
            success = True
        except Exception as e:
            print(f"⚠️  Failed to save config to Supabase: {e}")

    config_path = get_config_path()
    
    try:
        # Ensure data directory exists
        config_path.parent.mkdir(exist_ok=True)
        
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)
        
        return True
    
    except IOError as e:
        if not success:
            print(f"⚠️  Failed to save config: {e}")
        return success


def get_workspaces() -> list[str]:
    """Get configured workspace paths."""
    config = load_config()
    return config.get("workspaces", [])


def set_workspaces(workspaces: list[str]) -> bool:
    """
    Set workspace paths.
    
    Args:
        workspaces: List of workspace directory paths
    
    Returns:
        True if successful
    """
    config = load_config()
    config["workspaces"] = workspaces
    return save_config(config)


def is_feature_enabled(feature_name: str) -> bool:
    """
    Check if a feature is enabled.
    
    Args:
        feature_name: One of "linkedInSync", "solvedStatusSync", "customVoice"
    
    Returns:
        True if enabled
    """
    config = load_config()
    features = config.get("features", {})
    feature = features.get(feature_name, {})
    return feature.get("enabled", False)


def get_feature_config(feature_name: str) -> dict[str, Any]:
    """
    Get configuration for a specific feature.
    
    Args:
        feature_name: Feature identifier
    
    Returns:
        Feature configuration dict
    """
    config = load_config()
    features = config.get("features", {})
    return features.get(feature_name, {})


def get_llm_config() -> dict[str, Any]:
    """Get LLM configuration."""
    config = load_config()
    return config.get("llm", DEFAULT_CONFIG["llm"])


def get_advanced_thresholds() -> dict[str, Any]:
    """
    Get advanced threshold configuration (v3).
    
    Returns:
        Dict with keys:
        - categorySimilarity: float (0.0-1.0)
        - judgeTemperature: float (0.0-1.0)
        - compressionTokenThreshold: int
        - compressionDateThreshold: int (days)
    """
    config = load_config()
    return config.get("advancedThresholds", DEFAULT_CONFIG["advancedThresholds"])


def get_category_similarity_threshold() -> float:
    """Get the category similarity threshold for grouping items."""
    thresholds = get_advanced_thresholds()
    return thresholds.get("categorySimilarity", 0.75)


def get_judge_temperature() -> float:
    """Get the temperature for judge/ranking LLM calls."""
    thresholds = get_advanced_thresholds()
    return thresholds.get("judgeTemperature", 0.0)


def get_compression_token_threshold() -> int:
    """Get the token threshold for conversation compression."""
    thresholds = get_advanced_thresholds()
    return thresholds.get("compressionTokenThreshold", 10000)


def get_compression_date_threshold() -> int:
    """Get the date range threshold for skipping compression (in days)."""
    thresholds = get_advanced_thresholds()
    return thresholds.get("compressionDateThreshold", 7)


def get_custom_time_presets() -> list[dict[str, Any]]:
    """Get custom time presets for generation/seek."""
    config = load_config()
    return config.get("customTimePresets", [])


def is_setup_complete() -> bool:
    """Check if initial setup has been completed."""
    config = load_config()
    return config.get("setupComplete", False)


def mark_setup_complete() -> bool:
    """Mark setup as complete."""
    config = load_config()
    config["setupComplete"] = True
    return save_config(config)


def _deep_merge(base: dict, override: dict) -> dict:
    """
    Deep merge two dictionaries.
    
    Args:
        base: Base dict (modified in place)
        override: Dict with override values
    
    Returns:
        Merged dict
    """
    for key, value in override.items():
        if key in base and isinstance(base[key], dict) and isinstance(value, dict):
            _deep_merge(base[key], value)
        else:
            base[key] = value
    return base


# Environment variable loading
def load_env_file(env_path: str | Path | None = None) -> None:
    """
    Load environment variables from .env file.
    
    Args:
        env_path: Path to .env file. If None, searches for .env in 
                  project root and parent directories.
    """
    if env_path:
        paths = [Path(env_path)]
    else:
        # Search order: project .env, then .env.local
        project_root = Path(__file__).parent.parent.parent
        paths = [
            project_root / ".env.local",
            project_root / ".env",
            project_root.parent / ".env",  # Parent workspace .env
        ]
    
    for path in paths:
        if path.exists():
            _parse_env_file(path)
            return


def _parse_env_file(path: Path) -> None:
    """Parse and load a .env file."""
    try:
        with open(path) as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    key, _, value = line.partition("=")
                    key = key.strip()
                    value = value.strip()
                    # Remove quotes if present
                    if value and value[0] == value[-1] and value[0] in ('"', "'"):
                        value = value[1:-1]
                    if key and key not in os.environ:
                        os.environ[key] = value
    except IOError:
        pass

