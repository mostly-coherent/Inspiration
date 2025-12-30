"""
Prompt Compression — Compress long conversation histories to reduce token costs.

Uses a cheaper LLM model to summarize/compress conversations before sending to primary model.
Supports both per-conversation compression (lossless distillation) and bulk compression.
"""

try:
    import tiktoken
    TIKTOKEN_AVAILABLE = True
except ImportError:
    TIKTOKEN_AVAILABLE = False
    tiktoken = None

from typing import Optional
from .llm import LLMProvider
from .config import load_config
from .cursor_db import format_conversations_for_prompt


# Rough token estimation (4 chars per token average)
def estimate_tokens(text: str) -> int:
    """Estimate token count for text."""
    if TIKTOKEN_AVAILABLE and tiktoken:
        try:
            # Use tiktoken for accurate estimation if available
            encoding = tiktoken.get_encoding("cl100k_base")  # Used by GPT-3.5/GPT-4
            return len(encoding.encode(text))
        except Exception:
            pass
    
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


def compress_single_message(
    text: str,
    llm: Optional[LLMProvider] = None,
    max_chars: int = 6000,
    compression_model: str = "gpt-3.5-turbo",
    max_retries: int = 3,
) -> Optional[str]:
    """
    Compress a single long message while preserving key information.
    
    Designed for embedding preparation - preserves:
    - Key technical decisions and rationale
    - Important code patterns and solutions
    - Problem statements and requirements
    - Critical insights and learnings
    
    Args:
        text: Message text to compress
        llm: LLM provider (if None, creates one from config)
        max_chars: Target max characters for compressed text
        compression_model: Model to use for compression (default: gpt-3.5-turbo)
    
    Returns:
        Compressed text (or original if compression fails)
    """
    if len(text) <= max_chars:
        return text
    
    # Create compression LLM if not provided
    if llm is None:
        config = load_config()
        llm_config = config.get("llm", {})
        compression_config = llm_config.get("promptCompression", {})
        compression_model = compression_config.get("compressionModel", compression_model)
        
        compression_llm = LLMProvider(
            provider="openai",
            model=compression_model,
            fallback_provider="anthropic",
            fallback_model="claude-sonnet-4-20250514",
        )
    else:
        compression_llm = llm
    
    # Compression prompt for single message
    compression_prompt = f"""Compress this message while preserving ALL critical information:

1. Key technical decisions and rationale
2. Important code patterns and solutions
3. Problem statements and requirements
4. Critical insights and learnings
5. Important context and background

Remove:
- Redundant explanations
- Verbose descriptions
- Repeated information
- Unnecessary context

Make it concise but preserve all important details.
Target: ~{max_chars} characters.

Message:
{text}"""

    system_prompt = """You are a message compression assistant. Your job is to reduce length while preserving ALL critical information needed for semantic search and embedding. This is lossless compression - nothing important should be lost."""

    # Retry logic with exponential backoff
    import time
    last_error = None
    
    for attempt in range(max_retries):
        try:
            compressed_text = compression_llm.generate(
                compression_prompt,
                system_prompt=system_prompt,
                max_tokens=max_chars // 4,  # Rough estimate: 4 chars per token
                temperature=0.0,  # Deterministic compression
            )
            
            # Ensure it's within limits (compression might overshoot)
            if len(compressed_text) > max_chars:
                # Truncate if compression overshot
                truncated = compressed_text[:max_chars]
                last_period = truncated.rfind('.')
                last_newline = truncated.rfind('\n')
                cut_point = max(last_period, last_newline)
                
                if cut_point > max_chars * 0.8:
                    return truncated[:cut_point + 1] + "\n\n[Message compressed and truncated]"
                else:
                    return truncated + "\n\n[Message compressed and truncated]"
            
            return compressed_text.strip() + "\n\n[Message compressed to preserve key information]"
            
        except Exception as e:
            last_error = e
            # Don't retry on last attempt
            if attempt == max_retries - 1:
                break
            
            # Exponential backoff: 1s, 2s, 4s
            delay = 2 ** attempt
            import sys
            print(f"⚠️  Compression attempt {attempt + 1}/{max_retries} failed: {e}", file=sys.stderr)
            print(f"   Retrying in {delay}s...", file=sys.stderr)
            time.sleep(delay)
    
    # All retries failed - return None to signal failure (caller can truncate)
    return None


def compress_single_conversation(
    conversation: dict,
    llm: Optional[LLMProvider] = None,
    max_tokens: int = 500,  # Lower target: allows ~50 conversations (50 × 500 = 25k tokens)
    compression_model: str = "gpt-3.5-turbo",
) -> dict:
    """
    Compress a single conversation by distilling messages while preserving key information.
    
    This performs lossless distillation - reduces token count but preserves:
    - Key technical decisions and rationale
    - Important code patterns and solutions
    - Problem statements and requirements
    - Critical insights and learnings
    
    Args:
        conversation: Conversation dict with messages
        llm: LLM provider (if None, creates one from config)
        max_tokens: Target max tokens for compressed conversation
        compression_model: Model to use for compression
    
    Returns:
        Compressed conversation dict with distilled messages
    """
    # Format conversation for compression (only once)
    conversation_text = format_conversations_for_prompt([conversation])
    estimated_tokens = estimate_tokens(conversation_text)
    
    # Only compress if conversation is large (>800 tokens)
    # Small conversations don't need compression
    if estimated_tokens <= 800:
        return conversation
    
    # Create compression LLM if not provided
    if llm is None:
        config = load_config()
        llm_config = config.get("llm", {})
        compression_config = llm_config.get("promptCompression", {})
        compression_model = compression_config.get("compressionModel", compression_model)
        
        compression_llm = LLMProvider(
            provider="openai",
            model=compression_model,
            fallback_provider="anthropic",
            fallback_model="claude-sonnet-4-20250514",
        )
    else:
        compression_llm = llm
    
    # Compression prompt for single conversation
    compression_prompt = f"""Compress this conversation while preserving ALL critical information:

1. Key technical decisions and rationale
2. Important code patterns and solutions  
3. Problem statements and requirements
4. Critical insights and learnings
5. Important context and background

Remove:
- Redundant explanations
- Verbose descriptions
- Repeated information
- Unnecessary context

Keep the conversation structure (USER/ASSISTANT turns) but make it concise.
Target: ~{max_tokens} tokens.

Conversation:
{conversation_text}"""

    system_prompt = """You are a conversation compression assistant. Your job is to reduce token count while preserving ALL critical information needed for generating insights/ideas. This is lossless compression - nothing important should be lost."""

    try:
        compressed_text = compression_llm.generate(
            compression_prompt,
            system_prompt=system_prompt,
            max_tokens=max_tokens * 2,  # Allow some room for compression
            temperature=0.0,  # Deterministic compression
        )
        
        # Parse compressed text back into conversation format
        # Handle various formats: [USER], USER:, [ASSISTANT], ASSISTANT:, etc.
        compressed_messages = []
        lines = compressed_text.split('\n')
        current_role = None
        current_text = []
        
        for line in lines:
            stripped = line.strip()
            # Check for role markers (case-insensitive, various formats)
            if stripped.upper().startswith('[USER]') or stripped.upper().startswith('USER:'):
                # Save previous message if exists
                if current_role and current_text:
                    compressed_messages.append({
                        "type": current_role.lower(),
                        "text": '\n'.join(current_text).strip(),
                        "timestamp": 0,  # Timestamp lost in compression
                    })
                current_role = "user"
                current_text = []
                # Include rest of line after marker if any
                rest = stripped.split(':', 1)[1].strip() if ':' in stripped else stripped.split(']', 1)[1].strip() if ']' in stripped else ""
                if rest:
                    current_text.append(rest)
            elif stripped.upper().startswith('[ASSISTANT]') or stripped.upper().startswith('ASSISTANT:'):
                # Save previous message if exists
                if current_role and current_text:
                    compressed_messages.append({
                        "type": current_role.lower(),
                        "text": '\n'.join(current_text).strip(),
                        "timestamp": 0,
                    })
                current_role = "assistant"
                current_text = []
                # Include rest of line after marker if any
                rest = stripped.split(':', 1)[1].strip() if ':' in stripped else stripped.split(']', 1)[1].strip() if ']' in stripped else ""
                if rest:
                    current_text.append(rest)
            elif current_role:
                # Continue current message
                if stripped or current_text:  # Include empty lines if we have content
                    current_text.append(line)  # Keep original line (preserves formatting)
        
        # Add last message
        if current_role and current_text:
            compressed_messages.append({
                "type": current_role.lower(),
                "text": '\n'.join(current_text).strip(),
                "timestamp": 0,
            })
        
        # If parsing failed or no messages found, create a single summary message
        if not compressed_messages:
            # Try to preserve original structure - use first message type from original
            original_first_type = conversation.get("messages", [{}])[0].get("type", "assistant") if conversation.get("messages") else "assistant"
            compressed_messages = [{
                "type": original_first_type,
                "text": compressed_text.strip(),
                "timestamp": 0,
            }]
        
        # Return compressed conversation (don't estimate tokens here - caller will do it)
        compressed_conversation = conversation.copy()
        compressed_conversation["messages"] = compressed_messages
        compressed_conversation["_compressed"] = True  # Mark as compressed
        
        return compressed_conversation
        
    except Exception as e:
        import sys
        print(f"⚠️  Conversation compression failed: {e}, using original", file=sys.stderr)
        return conversation

