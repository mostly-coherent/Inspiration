"""
Configuration Management — Load and save user configuration.
"""

import json
import os
from pathlib import Path
from typing import Any


# Default configuration
DEFAULT_CONFIG = {
    "version": 1,
    "setupComplete": False,
    "workspaces": [],
    "llm": {
        "provider": "anthropic",
        "model": "claude-sonnet-4-20250514",
        "fallbackProvider": "openai",
        "fallbackModel": "gpt-4o",
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


def load_config() -> dict[str, Any]:
    """
    Load user configuration.
    
    Returns:
        Configuration dict (merged with defaults for missing keys)
    """
    config_path = get_config_path()
    
    if not config_path.exists():
        return DEFAULT_CONFIG.copy()
    
    try:
        with open(config_path) as f:
            user_config = json.load(f)
        
        # Merge with defaults (user config wins)
        return _deep_merge(DEFAULT_CONFIG.copy(), user_config)
    
    except (json.JSONDecodeError, IOError) as e:
        print(f"⚠️  Failed to load config: {e}")
        return DEFAULT_CONFIG.copy()


def save_config(config: dict[str, Any]) -> bool:
    """
    Save user configuration.
    
    Args:
        config: Configuration dict to save
    
    Returns:
        True if successful, False otherwise
    """
    config_path = get_config_path()
    
    try:
        # Ensure data directory exists
        config_path.parent.mkdir(exist_ok=True)
        
        with open(config_path, "w") as f:
            json.dump(config, f, indent=2)
        
        return True
    
    except IOError as e:
        print(f"⚠️  Failed to save config: {e}")
        return False


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

