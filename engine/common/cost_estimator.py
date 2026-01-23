"""
Cost Estimation for Theme Map Generation.

Estimates LLM API costs based on:
- Conversation count and average message length
- Provider and model pricing
- System prompt and output token estimates

Pricing Sources (as of 2026-01-13):
- Anthropic: https://www.anthropic.com/pricing
- OpenAI: https://openai.com/pricing

Last Updated: 2026-01-13
"""

from typing import Literal, TypedDict

# Pricing per million tokens (MTok)
# Source URLs in comments for easy verification
PRICING = {
    # Anthropic - https://www.anthropic.com/pricing
    "anthropic": {
        "claude-sonnet-4-20250514": {"input": 3.00, "output": 15.00},
        "claude-3-5-sonnet-20241022": {"input": 3.00, "output": 15.00},
        "claude-3-opus-20240229": {"input": 15.00, "output": 75.00},
        "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    },
    # OpenAI - https://openai.com/pricing
    "openai": {
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "gpt-4o-mini": {"input": 0.15, "output": 0.60},
        "gpt-4-turbo": {"input": 10.00, "output": 30.00},
        "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
    },
}

# Default models per provider (same as llm.py)
DEFAULT_MODELS = {
    "anthropic": "claude-sonnet-4-20250514",
    "openai": "gpt-4o",
}

# Token estimation constants
CHARS_PER_TOKEN = 3.5  # Conservative estimate (English text)
AVG_MESSAGE_LENGTH_CHARS = 200  # Average message length
AVG_MESSAGES_PER_CONVERSATION = 15  # Average messages per conversation
SYSTEM_PROMPT_TOKENS = 500  # Theme Map system prompt
OUTPUT_TOKENS_ESTIMATE = 2500  # Theme Map JSON output size


class CostBreakdown(TypedDict):
    """Cost breakdown structure."""
    inputCostUSD: float
    outputCostUSD: float
    pricingPerMTok: dict[str, float]


class CostEstimate(TypedDict):
    """Cost estimation result structure."""
    estimatedCostUSD: float
    inputTokens: int
    outputTokens: int
    breakdown: CostBreakdown
    provider: str
    model: str
    disclaimer: str
    conversationCount: int


def estimate_tokens_from_text(text: str) -> int:
    """Estimate token count from text."""
    return int(len(text) / CHARS_PER_TOKEN)


def estimate_input_tokens(conversation_count: int, avg_chars_per_convo: int | None = None) -> int:
    """
    Estimate input tokens for Theme Map generation.
    
    Args:
        conversation_count: Number of conversations to analyze
        avg_chars_per_convo: Optional average chars per conversation (uses default if None)
        
    Returns:
        Estimated input token count
    """
    if avg_chars_per_convo is None:
        # Default: 15 messages * 200 chars = 3000 chars per conversation
        avg_chars_per_convo = AVG_MESSAGE_LENGTH_CHARS * AVG_MESSAGES_PER_CONVERSATION
    
    # Total chars from conversations (truncated to cards)
    # Cards include: summary (200 chars) + snippet (300 chars) + metadata (100 chars)
    chars_per_card = 600  # Approximate chars per conversation card
    total_card_chars = conversation_count * chars_per_card
    
    # Convert to tokens
    conversation_tokens = int(total_card_chars / CHARS_PER_TOKEN)
    
    # Add system prompt tokens
    return conversation_tokens + SYSTEM_PROMPT_TOKENS


def get_model_pricing(provider: str, model: str | None = None) -> dict | None:
    """
    Get pricing for a provider/model combination.
    
    Args:
        provider: LLM provider ("anthropic", "openai")
        model: Model identifier (uses default if None)
        
    Returns:
        Pricing dict with "input" and "output" keys ($/MTok), or None if not found
    """
    if provider not in PRICING:
        return None
    
    provider_pricing = PRICING[provider]
    
    # Use default model if not specified
    if model is None:
        model = DEFAULT_MODELS.get(provider)
    
    if model is None:
        return None
    
    return provider_pricing.get(model)


def estimate_cost(
    conversation_count: int,
    provider: Literal["anthropic", "openai"] = "anthropic",
    model: str | None = None,
    output_tokens: int | None = None,
) -> CostEstimate:
    """
    Estimate the cost of Theme Map generation.
    
    Args:
        conversation_count: Number of conversations to analyze
        provider: LLM provider
        model: Model identifier (uses default if None)
        output_tokens: Optional output token override (uses estimate if None)
        
    Returns:
        CostEstimate dict with all cost details
    """
    # Get model (use default if not specified)
    if model is None:
        model = DEFAULT_MODELS.get(provider, "unknown")
    
    # Get pricing
    pricing = get_model_pricing(provider, model)
    
    if pricing is None:
        # Fallback pricing (conservative estimate)
        pricing = {"input": 5.00, "output": 15.00}
        disclaimer = f"Estimated cost (pricing not found for {provider}/{model}, using fallback)"
    else:
        disclaimer = "Estimate may vary ±20% based on actual conversation length"
    
    # Calculate tokens
    input_tokens = estimate_input_tokens(conversation_count)
    output_tokens = output_tokens or OUTPUT_TOKENS_ESTIMATE
    
    # Calculate costs (pricing is per million tokens)
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    total_cost = input_cost + output_cost
    
    return CostEstimate(
        estimatedCostUSD=round(total_cost, 4),
        inputTokens=input_tokens,
        outputTokens=output_tokens,
        breakdown={
            "inputCostUSD": round(input_cost, 4),
            "outputCostUSD": round(output_cost, 4),
            "pricingPerMTok": {
                "input": pricing["input"],
                "output": pricing["output"],
            },
        },
        provider=provider,
        model=model,
        disclaimer=disclaimer,
        conversationCount=conversation_count,
    )


def format_cost_display(estimate: CostEstimate) -> str:
    """
    Format cost estimate for display.
    
    Args:
        estimate: CostEstimate from estimate_cost()
        
    Returns:
        Human-readable cost string
    """
    cost = estimate["estimatedCostUSD"]
    
    if cost < 0.01:
        return f"~${cost:.4f}"
    elif cost < 0.10:
        return f"~${cost:.3f}"
    else:
        return f"~${cost:.2f}"


def get_all_supported_models() -> dict:
    """
    Get all supported models with their pricing.
    
    Returns:
        Dict of provider -> list of {model, inputPrice, outputPrice}
    """
    result = {}
    
    for provider, models in PRICING.items():
        result[provider] = [
            {
                "model": model,
                "inputPricePerMTok": pricing["input"],
                "outputPricePerMTok": pricing["output"],
            }
            for model, pricing in models.items()
        ]
    
    return result
