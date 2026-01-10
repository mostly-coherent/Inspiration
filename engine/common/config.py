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
        "judgeTemperature": 0.0,  # Temperature for ranking/judging LLM calls
        "compressionTokenThreshold": 10000,  # Compress conversations exceeding this token count
        "compressionDateThreshold": 7,  # Skip compression for date ranges < this many days
    },
    # v3 Custom Time Presets
    "customTimePresets": [],
    # v3 Generation Defaults - Control how AI generates content
    # Temperature 0.5: Better balance of creativity & focus for ideation
    # Dedup 0.80: Slightly more aggressive duplicate detection
    "generationDefaults": {
        "temperature": 0.5,  # How creative the AI should be (0.0 = focused, 1.0 = creative)
        "deduplicationThreshold": 0.80,  # How similar items need to be to count as duplicates (0.0-1.0)
        "maxTokens": 4000,  # Maximum length of generated content (in tokens, ~4 chars each)
        "maxTokensJudge": 500,  # Maximum length for quality judging responses
    },
    # v3 Seek Mode Defaults - Control how "Seek" searches chat history
    "seekDefaults": {
        "daysBack": 90,  # How many days of history to search (default: 3 months)
        "topK": 10,  # Maximum number of results to return
        "minSimilarity": 0.0,  # Minimum relevance score (0.0 = include all, 1.0 = exact match only)
    },
    # v3 Quality Scoring - How items are graded (A/B/C tiers)
    "qualityScoring": {
        "tierA": 13,  # Score >= this = Grade A (Excellent, worth sharing)
        "tierB": 9,   # Score >= this = Grade B (Good, needs polish)
        "tierC": 5,   # Score >= this = Grade C (Okay, needs work)
        # Below tierC = Unrated
    },
    # v3 Semantic Search - How chat history search works
    "semanticSearch": {
        "defaultTopK": 50,  # Default number of results for semantic search
        "defaultMinSimilarity": 0.3,  # Default minimum relevance for search results
    },
    # v3 File Tracking - What file types to scan for implemented items
    "fileTracking": {
        # Extensions to consider as text files (for scanning folders)
        # Common: .md (blogs, docs), .txt (notes), .py/.ts/.js (code)
        "textExtensions": [".md", ".txt", ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml"],
        "implementedMatchThreshold": 0.75,  # Similarity needed to mark item as "implemented"
    },
    # v3 Theme Explorer - Settings for the pattern discovery feature
    "themeExplorer": {
        "defaultZoom": 0.7,  # Initial similarity level (0.5 = broad, 0.9 = specific)
        "sliderMin": 0.45,  # Minimum slider value (broader grouping)
        "sliderMax": 0.92,  # Maximum slider value (more specific grouping)
        "maxThemesToDisplay": 20,  # How many themes to show in the list
        "largeThemeThreshold": 5,  # Items needed to count as a "major theme"
    },
    # v3 Theme Synthesis - AI insights for theme patterns
    "themeSynthesis": {
        "maxItemsToSynthesize": 15,  # Max items to include in AI analysis
        "maxTokens": 800,  # Max length of AI-generated insights
        "maxDescriptionLength": 200,  # Max chars per item description (truncated)
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
        - judgeTemperature: float (0.0-1.0)
        - compressionTokenThreshold: int
        - compressionDateThreshold: int (days)
    """
    config = load_config()
    return config.get("advancedThresholds", DEFAULT_CONFIG["advancedThresholds"])


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


def get_generation_defaults() -> dict[str, Any]:
    """
    Get generation default parameters.
    
    Returns:
        Dict with keys:
        - temperature: float (0.0-1.0) - How creative the AI should be
        - deduplicationThreshold: float (0.0-1.0) - Similarity threshold for dedup
        - maxTokens: int - Maximum tokens for generation
        - maxTokensJudge: int - Maximum tokens for judging
    """
    config = load_config()
    defaults = config.get("generationDefaults", DEFAULT_CONFIG["generationDefaults"])
    return defaults


def get_generation_temperature() -> float:
    """Get the default generation temperature."""
    return get_generation_defaults().get("temperature", 0.2)


def get_deduplication_threshold() -> float:
    """Get the default deduplication similarity threshold."""
    return get_generation_defaults().get("deduplicationThreshold", 0.85)


def get_max_tokens() -> int:
    """Get the maximum tokens for generation."""
    return get_generation_defaults().get("maxTokens", 4000)


def get_max_tokens_judge() -> int:
    """Get the maximum tokens for judge/ranking responses."""
    return get_generation_defaults().get("maxTokensJudge", 500)


def get_seek_defaults() -> dict[str, Any]:
    """
    Get Seek mode default parameters.
    
    Returns:
        Dict with keys:
        - daysBack: int - Days of history to search
        - topK: int - Maximum results
        - minSimilarity: float - Minimum relevance score
    """
    config = load_config()
    defaults = config.get("seekDefaults", DEFAULT_CONFIG["seekDefaults"])
    return defaults


def get_seek_days_back() -> int:
    """Get the default days back for Seek mode."""
    return get_seek_defaults().get("daysBack", 90)


def get_seek_top_k() -> int:
    """Get the default topK for Seek mode."""
    return get_seek_defaults().get("topK", 10)


def get_seek_min_similarity() -> float:
    """Get the default min similarity for Seek mode."""
    return get_seek_defaults().get("minSimilarity", 0.0)


def get_quality_scoring() -> dict[str, int]:
    """
    Get quality scoring tier thresholds.
    
    Returns:
        Dict with keys:
        - tierA: int - Score >= this = Grade A
        - tierB: int - Score >= this = Grade B
        - tierC: int - Score >= this = Grade C
    """
    config = load_config()
    defaults = config.get("qualityScoring", DEFAULT_CONFIG["qualityScoring"])
    return defaults


def get_quality_tier_thresholds() -> tuple[int, int, int]:
    """Get quality tier thresholds as a tuple (tierA, tierB, tierC)."""
    scoring = get_quality_scoring()
    return (
        scoring.get("tierA", 13),
        scoring.get("tierB", 9),
        scoring.get("tierC", 5),
    )


def get_semantic_search_defaults() -> dict[str, Any]:
    """
    Get semantic search default parameters.
    
    Returns:
        Dict with keys:
        - defaultTopK: int - Default number of results
        - defaultMinSimilarity: float - Default minimum relevance
    """
    config = load_config()
    defaults = config.get("semanticSearch", DEFAULT_CONFIG["semanticSearch"])
    return defaults


def get_semantic_search_top_k() -> int:
    """Get the default topK for semantic search."""
    return get_semantic_search_defaults().get("defaultTopK", 50)


def get_semantic_search_min_similarity() -> float:
    """Get the default min similarity for semantic search."""
    return get_semantic_search_defaults().get("defaultMinSimilarity", 0.3)


def get_file_tracking_config() -> dict[str, Any]:
    """
    Get file tracking configuration.
    
    Returns:
        Dict with keys:
        - textExtensions: list[str] - File extensions to scan
        - implementedMatchThreshold: float - Similarity for "implemented" match
    """
    config = load_config()
    defaults = config.get("fileTracking", DEFAULT_CONFIG["fileTracking"])
    return defaults


def get_text_extensions() -> list[str]:
    """Get the list of text file extensions to scan."""
    return get_file_tracking_config().get("textExtensions", 
        [".md", ".txt", ".py", ".ts", ".tsx", ".js", ".jsx", ".json", ".yaml", ".yml"])


def get_implemented_match_threshold() -> float:
    """Get the similarity threshold for marking items as implemented."""
    return get_file_tracking_config().get("implementedMatchThreshold", 0.75)


def get_theme_explorer_config() -> dict[str, Any]:
    """
    Get Theme Explorer configuration.
    
    Returns:
        Dict with keys:
        - defaultZoom: float - Initial similarity level (0.5-0.9)
        - sliderMin: float - Minimum slider value
        - sliderMax: float - Maximum slider value
        - maxThemesToDisplay: int - Max themes in list
        - largeThemeThreshold: int - Items needed for "major theme"
    """
    config = load_config()
    defaults = config.get("themeExplorer", DEFAULT_CONFIG["themeExplorer"])
    return defaults


def get_theme_explorer_default_zoom() -> float:
    """Get the default zoom/similarity level for Theme Explorer."""
    return get_theme_explorer_config().get("defaultZoom", 0.7)


def get_theme_explorer_slider_range() -> tuple[float, float]:
    """Get the slider min/max range for Theme Explorer."""
    config = get_theme_explorer_config()
    return (config.get("sliderMin", 0.45), config.get("sliderMax", 0.92))


def get_theme_explorer_max_themes() -> int:
    """Get the maximum number of themes to display."""
    return get_theme_explorer_config().get("maxThemesToDisplay", 20)


def get_theme_explorer_large_threshold() -> int:
    """Get the item count threshold for 'large theme' classification."""
    return get_theme_explorer_config().get("largeThemeThreshold", 5)


def get_theme_synthesis_config() -> dict[str, Any]:
    """
    Get Theme Synthesis configuration.
    
    Returns:
        Dict with keys:
        - maxItemsToSynthesize: int - Max items in AI analysis
        - maxTokens: int - Max length of AI insights
        - maxDescriptionLength: int - Max chars per item description
    """
    config = load_config()
    defaults = config.get("themeSynthesis", DEFAULT_CONFIG["themeSynthesis"])
    return defaults


def get_synthesis_max_items() -> int:
    """Get the maximum items to include in theme synthesis."""
    return get_theme_synthesis_config().get("maxItemsToSynthesize", 15)


def get_synthesis_max_tokens() -> int:
    """Get the maximum tokens for synthesis output."""
    return get_theme_synthesis_config().get("maxTokens", 800)


def get_synthesis_description_length() -> int:
    """Get the maximum description length per item in synthesis."""
    return get_theme_synthesis_config().get("maxDescriptionLength", 200)


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

