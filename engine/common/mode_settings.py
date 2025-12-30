"""
Mode Settings — Load mode-specific settings from themes.json
"""

import json
from pathlib import Path
from typing import Any, Optional

from .config import get_data_dir


def load_themes_config() -> dict[str, Any]:
    """Load themes.json configuration."""
    themes_path = get_data_dir().parent / "data" / "themes.json"
    
    if not themes_path.exists():
        return {"version": 1, "themes": []}
    
    try:
        with open(themes_path) as f:
            return json.load(f)
    except (json.JSONDecodeError, IOError):
        return {"version": 1, "themes": []}


def get_mode_settings(theme_id: str, mode_id: str) -> Optional[dict[str, Any]]:
    """
    Get settings for a specific mode.
    
    Args:
        theme_id: Theme ID (e.g., "generation")
        mode_id: Mode ID (e.g., "idea", "insight")
    
    Returns:
        Mode settings dict or None if not found
    """
    config = load_themes_config()
    
    for theme in config.get("themes", []):
        if theme.get("id") == theme_id:
            for mode in theme.get("modes", []):
                if mode.get("id") == mode_id:
                    return mode.get("settings")
    
    return None


def get_mode_setting(theme_id: str, mode_id: str, setting_key: str, default: Any = None) -> Any:
    """
    Get a specific setting value for a mode.
    
    Args:
        theme_id: Theme ID
        mode_id: Mode ID
        setting_key: Setting key (e.g., "implementedItemsFolder")
        default: Default value if not found
    
    Returns:
        Setting value or default
    """
    settings = get_mode_settings(theme_id, mode_id)
    if not settings:
        return default
    
    return settings.get(setting_key, default)

