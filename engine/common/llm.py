"""
LLM Provider Abstraction — Unified interface for Anthropic and OpenAI.

Supports:
- Anthropic Claude (primary)
- OpenAI GPT (fallback)
"""

import os
from typing import Literal

# Try importing providers
try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    anthropic = None
    ANTHROPIC_AVAILABLE = False

try:
    import openai
    OPENAI_AVAILABLE = True
except ImportError:
    openai = None
    OPENAI_AVAILABLE = False


# Default models
DEFAULT_ANTHROPIC_MODEL = "claude-sonnet-4-20250514"
DEFAULT_OPENAI_MODEL = "gpt-4o"

# Token limits
MAX_TOKENS_DEFAULT = 4000
MAX_TOKENS_JUDGE = 500


class LLMProvider:
    """Unified LLM provider interface."""
    
    def __init__(
        self,
        provider: Literal["anthropic", "openai"] = "anthropic",
        model: str | None = None,
        fallback_provider: Literal["anthropic", "openai", None] = "openai",
        fallback_model: str | None = None,
    ):
        self.provider = provider
        self.model = model or (DEFAULT_ANTHROPIC_MODEL if provider == "anthropic" else DEFAULT_OPENAI_MODEL)
        self.fallback_provider = fallback_provider
        self.fallback_model = fallback_model or (DEFAULT_OPENAI_MODEL if fallback_provider == "openai" else DEFAULT_ANTHROPIC_MODEL)
        
        # Initialize clients
        self._anthropic_client = None
        self._openai_client = None
        
        self._init_clients()
    
    def _init_clients(self):
        """Initialize available LLM clients."""
        # Anthropic
        if ANTHROPIC_AVAILABLE:
            api_key = os.environ.get("ANTHROPIC_API_KEY")
            if api_key:
                self._anthropic_client = anthropic.Anthropic(api_key=api_key)
        
        # OpenAI
        if OPENAI_AVAILABLE:
            api_key = os.environ.get("OPENAI_API_KEY")
            if api_key:
                self._openai_client = openai.OpenAI(api_key=api_key)
    
    def is_available(self, provider: str) -> bool:
        """Check if a provider is available."""
        if provider == "anthropic":
            return self._anthropic_client is not None
        elif provider == "openai":
            return self._openai_client is not None
        return False
    
    def get_available_providers(self) -> list[str]:
        """Get list of available providers."""
        available = []
        if self._anthropic_client:
            available.append("anthropic")
        if self._openai_client:
            available.append("openai")
        return available
    
    def generate(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        max_tokens: int = MAX_TOKENS_DEFAULT,
        temperature: float = 0.4,
    ) -> str:
        """
        Generate a response from the LLM.
        
        Args:
            prompt: User prompt
            system_prompt: Optional system prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
        
        Returns:
            Generated text
            
        Raises:
            RuntimeError: If no LLM provider is available
        """
        # Try primary provider
        if self.is_available(self.provider):
            try:
                return self._call_provider(
                    self.provider, 
                    self.model, 
                    prompt, 
                    system_prompt, 
                    max_tokens, 
                    temperature
                )
            except Exception as e:
                print(f"⚠️  {self.provider} failed: {e}")
                if self.fallback_provider:
                    print(f"   Trying fallback: {self.fallback_provider}")
        
        # Try fallback provider
        if self.fallback_provider and self.is_available(self.fallback_provider):
            try:
                return self._call_provider(
                    self.fallback_provider,
                    self.fallback_model,
                    prompt,
                    system_prompt,
                    max_tokens,
                    temperature
                )
            except Exception as e:
                raise RuntimeError(f"Both primary and fallback LLM failed: {e}")
        
        # No provider available
        available = self.get_available_providers()
        if not available:
            raise RuntimeError(
                "No LLM provider available. Please set ANTHROPIC_API_KEY or OPENAI_API_KEY "
                "in your environment or .env file."
            )
        
        raise RuntimeError(f"Requested provider '{self.provider}' not available. Available: {available}")
    
    def _call_provider(
        self,
        provider: str,
        model: str,
        prompt: str,
        system_prompt: str | None,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Call a specific provider."""
        if provider == "anthropic":
            return self._call_anthropic(model, prompt, system_prompt, max_tokens, temperature)
        elif provider == "openai":
            return self._call_openai(model, prompt, system_prompt, max_tokens, temperature)
        else:
            raise ValueError(f"Unknown provider: {provider}")
    
    def _call_anthropic(
        self,
        model: str,
        prompt: str,
        system_prompt: str | None,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Call Anthropic Claude."""
        if not self._anthropic_client:
            raise RuntimeError("Anthropic client not initialized")
        
        kwargs = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
        }
        
        if system_prompt:
            kwargs["system"] = system_prompt
        
        response = self._anthropic_client.messages.create(**kwargs)
        return response.content[0].text
    
    def _call_openai(
        self,
        model: str,
        prompt: str,
        system_prompt: str | None,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Call OpenAI GPT."""
        if not self._openai_client:
            raise RuntimeError("OpenAI client not initialized")
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = self._openai_client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        
        return response.choices[0].message.content


def create_llm(config: dict | None = None) -> LLMProvider:
    """
    Create an LLM provider from configuration.
    
    Args:
        config: Optional config dict with llm settings:
            {
                "provider": "anthropic",
                "model": "claude-sonnet-4-20250514",
                "fallbackProvider": "openai",
                "fallbackModel": "gpt-4o"
            }
    
    Returns:
        Configured LLMProvider instance
    """
    if config is None:
        config = {}
    
    return LLMProvider(
        provider=config.get("provider", "anthropic"),
        model=config.get("model"),
        fallback_provider=config.get("fallbackProvider", "openai"),
        fallback_model=config.get("fallbackModel"),
    )

