"""
Prompt Compression — Compress long conversation histories to reduce token costs.

Uses a cheaper LLM model to summarize/compress conversations before sending to primary model.
"""

import tiktoken
from typing import Optional
from .llm import LLMProvider, create_llm_from_config
from .config import load_config


# Rough token estimation (4 chars per token average)
def estimate_tokens(text: str) -> int:
    """Estimate token count for text."""
    try:
        # Use tiktoken for accurate estimation if available
        encoding = tiktoken.get_encoding("cl100k_base")  # Used by GPT-3.5/GPT-4
        return len(encoding.encode(text))
    except Exception:
        # Fallback: rough estimate (4 chars per token)
        return len(text) // 4


def compress_conversations(
    conversations_text: str,
    llm: Optional[LLMProvider] = None,
    threshold: int = 10000,
    compression_model: str = "gpt-3.5-turbo",
) -> str:
    """
    Compress conversation text if it exceeds threshold.
    
    Args:
        conversations_text: Full conversation text
        llm: LLM provider (if None, creates one from config)
        threshold: Token threshold for compression (default: 10000)
        compression_model: Model to use for compression (default: gpt-3.5-turbo)
    
    Returns:
        Compressed conversation text (or original if below threshold)
    """
    # Estimate tokens
    estimated_tokens = estimate_tokens(conversations_text)
    
    if estimated_tokens <= threshold:
        return conversations_text
    
    print(f"📦 Compressing prompt ({estimated_tokens} tokens > {threshold} threshold)...")
    
    # Create compression LLM if not provided
    if llm is None:
        config = load_config()
        llm_config = config.get("llm", {})
        compression_config = llm_config.get("promptCompression", {})
        compression_model = compression_config.get("compressionModel", compression_model)
        
        # Create a cheap LLM for compression
        compression_llm = LLMProvider(
            provider="openai",
            model=compression_model,
            fallback_provider="anthropic",
            fallback_model="claude-sonnet-4-20250514",
        )
    else:
        compression_llm = llm
    
    # Compression prompt
    compression_prompt = f"""Compress the following conversation history while preserving:
1. Key technical decisions and rationale
2. Important code patterns and solutions
3. Problem statements and requirements
4. Critical insights and learnings

Remove:
- Redundant explanations
- Verbose descriptions
- Repeated information
- Unnecessary context

Keep the conversation structure but make it more concise. Target: ~{threshold // 2} tokens.

Conversations:
{conversations_text}"""

    system_prompt = """You are a conversation compression assistant. Your job is to reduce token count while preserving all critical information and context needed for generating ideas/insights from the conversations."""

    try:
        compressed = compression_llm.generate(
            compression_prompt,
            system_prompt=system_prompt,
            max_tokens=threshold,  # Limit output size
            temperature=0.0,  # Deterministic compression
        )
        
        compressed_tokens = estimate_tokens(compressed)
        reduction = ((estimated_tokens - compressed_tokens) / estimated_tokens) * 100
        print(f"✅ Compressed: {estimated_tokens} → {compressed_tokens} tokens ({reduction:.1f}% reduction)")
        
        return compressed
    except Exception as e:
        print(f"⚠️  Compression failed: {e}, using original text")
        return conversations_text

