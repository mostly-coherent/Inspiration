"""
LLM Provider Abstraction — Unified interface for Anthropic, OpenAI, and OpenRouter.

Supports:
- Anthropic Claude (primary)
- OpenAI GPT (fallback)
- OpenRouter (500+ models from 60+ providers)
"""

import os
import time
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
DEFAULT_OPENROUTER_MODEL = "anthropic/claude-sonnet-4"  # OpenRouter model ID
OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

# Token limits
MAX_TOKENS_DEFAULT = 4000
MAX_TOKENS_JUDGE = 500


class LLMProvider:
    """Unified LLM provider interface."""
    
    def __init__(
        self,
        provider: Literal["anthropic", "openai", "openrouter"] = "anthropic",
        model: str | None = None,
        fallback_provider: Literal["anthropic", "openai", "openrouter", None] = "openai",
        fallback_model: str | None = None,
        judge_provider: Literal["anthropic", "openai", "openrouter", None] = None,
        judge_model: str | None = None,
        use_cheaper_judge: bool = True,
    ):
        self.provider = provider
        # Set default model based on provider
        if model is None:
            if provider == "anthropic":
                self.model = DEFAULT_ANTHROPIC_MODEL
            elif provider == "openrouter":
                self.model = DEFAULT_OPENROUTER_MODEL
            else:
                self.model = DEFAULT_OPENAI_MODEL
        else:
            self.model = model
        
        self.fallback_provider = fallback_provider
        # Set default fallback model
        if fallback_model is None and fallback_provider:
            if fallback_provider == "anthropic":
                self.fallback_model = DEFAULT_ANTHROPIC_MODEL
            elif fallback_provider == "openrouter":
                self.fallback_model = DEFAULT_OPENROUTER_MODEL
            else:
                self.fallback_model = DEFAULT_OPENAI_MODEL
        else:
            self.fallback_model = fallback_model
        
        # Judge model configuration (for cheaper judging)
        self.use_cheaper_judge = use_cheaper_judge
        self.judge_provider = judge_provider or ("openai" if use_cheaper_judge else None)
        self.judge_model = judge_model or ("gpt-3.5-turbo" if self.judge_provider == "openai" else None)
        
        # Initialize clients
        self._anthropic_client = None
        self._openai_client = None
        self._openrouter_client = None
        
        self._init_clients()
    
    def get_judge_llm(self) -> "LLMProvider":
        """
        Get an LLM instance optimized for judging tasks.
        Returns a cheaper model if configured, otherwise returns self.
        """
        if not self.use_cheaper_judge or not self.judge_provider or not self.judge_model:
            return self
        
        # Check if judge provider is available
        if self.judge_provider == "openai" and not self.is_available("openai"):
            print("⚠️  Judge model (OpenAI) not available, falling back to primary model")
            return self
        
        if self.judge_provider == "anthropic" and not self.is_available("anthropic"):
            print("⚠️  Judge model (Anthropic) not available, falling back to primary model")
            return self
        
        # Return a new instance with judge configuration
        return LLMProvider(
            provider=self.judge_provider,
            model=self.judge_model,
            fallback_provider=self.provider,  # Fallback to primary if judge fails
            fallback_model=self.model,
            use_cheaper_judge=False,  # Prevent recursion
        )
    
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
        
        # OpenRouter (uses OpenAI client with custom base URL)
        if OPENAI_AVAILABLE:
            api_key = os.environ.get("OPENROUTER_API_KEY")
            if api_key:
                self._openrouter_client = openai.OpenAI(
                    api_key=api_key,
                    base_url=OPENROUTER_BASE_URL
                )
    
    def is_available(self, provider: str) -> bool:
        """Check if a provider is available."""
        if provider == "anthropic":
            return self._anthropic_client is not None
        elif provider == "openai":
            return self._openai_client is not None
        elif provider == "openrouter":
            return self._openrouter_client is not None
        return False
    
    def get_available_providers(self) -> list[str]:
        """Get list of available providers."""
        available = []
        if self.is_available("openrouter"):
            available.append("openrouter")
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
        max_retries: int = 3,
        base_delay: float = 1.0,
        stream: bool = False,
    ) -> str | None:
        """
        Generate a response from the LLM with retry logic.
        
        Args:
            prompt: User prompt
            system_prompt: Optional system prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
            max_retries: Maximum number of retry attempts
            base_delay: Base delay in seconds for exponential backoff
            stream: If True, returns a generator that yields tokens (not implemented for all providers)
        
        Returns:
            Generated text (or None if stream=True, use generate_stream() instead)
            
        Raises:
            RuntimeError: If no LLM provider is available or all retries exhausted
        """
        if stream:
            # Streaming not supported in synchronous mode
            # Use generate_stream() method instead
            raise ValueError("Use generate_stream() for streaming. Set stream=False for non-streaming.")
        
        # Try primary provider with retry
        if self.is_available(self.provider):
            try:
                return self._generate_with_retry(
                    self.provider,
                    self.model,
                    prompt,
                    system_prompt,
                    max_tokens,
                    temperature,
                    max_retries,
                    base_delay,
                )
            except Exception as e:
                print(f"⚠️  {self.provider} failed after retries: {e}")
                if self.fallback_provider:
                    print(f"   Trying fallback: {self.fallback_provider}")
        
        # Try fallback provider with retry
        if self.fallback_provider and self.is_available(self.fallback_provider):
            try:
                return self._generate_with_retry(
                    self.fallback_provider,
                    self.fallback_model,
                    prompt,
                    system_prompt,
                    max_tokens,
                    temperature,
                    max_retries,
                    base_delay,
                )
            except Exception as e:
                raise RuntimeError(f"Both primary and fallback LLM failed: {e}")
        
        # No provider available
        available = self.get_available_providers()
        if not available:
            raise RuntimeError(
                "No LLM provider available. Please set ANTHROPIC_API_KEY, OPENAI_API_KEY, or OPENROUTER_API_KEY "
                "in your environment or .env file."
            )
        
        raise RuntimeError(f"Requested provider '{self.provider}' not available. Available: {available}")
    
    def generate_stream(
        self,
        prompt: str,
        *,
        system_prompt: str | None = None,
        max_tokens: int = MAX_TOKENS_DEFAULT,
        temperature: float = 0.4,
    ):
        """
        Generate a streaming response from the LLM.
        
        Args:
            prompt: User prompt
            system_prompt: Optional system prompt
            max_tokens: Maximum tokens to generate
            temperature: Sampling temperature
        
        Yields:
            Token strings as they're generated
        """
        # Try primary provider
        if self.is_available(self.provider):
            try:
                yield from self._call_provider_stream(
                    self.provider,
                    self.model,
                    prompt,
                    system_prompt,
                    max_tokens,
                    temperature,
                )
                return
            except Exception as e:
                print(f"⚠️  {self.provider} streaming failed: {e}")
                if self.fallback_provider:
                    print(f"   Trying fallback: {self.fallback_provider}")
        
        # Try fallback provider
        if self.fallback_provider and self.is_available(self.fallback_provider):
            try:
                yield from self._call_provider_stream(
                    self.fallback_provider,
                    self.fallback_model,
                    prompt,
                    system_prompt,
                    max_tokens,
                    temperature,
                )
                return
            except Exception as e:
                raise RuntimeError(f"Both primary and fallback LLM streaming failed: {e}")
        
        raise RuntimeError("No LLM provider available for streaming")
    
    def _call_provider_stream(
        self,
        provider: str,
        model: str,
        prompt: str,
        system_prompt: str | None,
        max_tokens: int,
        temperature: float,
    ):
        """Call a specific provider with streaming."""
        if provider == "anthropic":
            yield from self._call_anthropic_stream(model, prompt, system_prompt, max_tokens, temperature)
        elif provider == "openai":
            yield from self._call_openai_stream(model, prompt, system_prompt, max_tokens, temperature)
        elif provider == "openrouter":
            yield from self._call_openrouter_stream(model, prompt, system_prompt, max_tokens, temperature)
        else:
            raise ValueError(f"Unknown provider: {provider}")
    
    def _call_anthropic_stream(
        self,
        model: str,
        prompt: str,
        system_prompt: str | None,
        max_tokens: int,
        temperature: float,
    ):
        """Stream tokens from Anthropic Claude."""
        if not self._anthropic_client:
            raise RuntimeError("Anthropic client not initialized")
        
        kwargs = {
            "model": model,
            "max_tokens": max_tokens,
            "temperature": temperature,
            "messages": [{"role": "user", "content": prompt}],
            "stream": True,
        }
        
        if system_prompt:
            kwargs["system"] = system_prompt
        
        with self._anthropic_client.messages.stream(**kwargs) as stream:
            for text_event in stream.text_stream:
                yield text_event
    
    def _call_openai_stream(
        self,
        model: str,
        prompt: str,
        system_prompt: str | None,
        max_tokens: int,
        temperature: float,
    ):
        """Stream tokens from OpenAI GPT."""
        if not self._openai_client:
            raise RuntimeError("OpenAI client not initialized")
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        stream = self._openai_client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        
        for chunk in stream:
            if chunk.choices and chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content
    
    def _generate_with_retry(
        self,
        provider: str,
        model: str,
        prompt: str,
        system_prompt: str | None,
        max_tokens: int,
        temperature: float,
        max_retries: int,
        base_delay: float,
    ) -> str:
        """Generate with exponential backoff retry logic."""
        last_error = None
        
        for attempt in range(max_retries):
            try:
                return self._call_provider(
                    provider, model, prompt, system_prompt, max_tokens, temperature
                )
            except Exception as e:
                last_error = e
                
                # Check if error is retryable
                if not self._is_retryable_error(e):
                    raise  # Don't retry non-retryable errors
                
                # Don't retry on last attempt
                if attempt == max_retries - 1:
                    break
                
                # Calculate delay with exponential backoff
                delay = base_delay * (2 ** attempt)
                print(f"⚠️  Retryable error (attempt {attempt + 1}/{max_retries}): {e}")
                print(f"   Retrying in {delay:.1f}s...")
                time.sleep(delay)
        
        # All retries exhausted
        raise RuntimeError(f"Failed after {max_retries} attempts: {last_error}")
    
    def _is_retryable_error(self, error: Exception) -> bool:
        """Check if an error is retryable."""
        error_str = str(error).lower()
        error_type = type(error).__name__
        
        # Rate limit errors
        if "rate limit" in error_str or "rate_limit" in error_str or "429" in error_str:
            return True
        
        # Network/timeout errors
        if any(keyword in error_str for keyword in ["timeout", "connection", "network", "unavailable", "503", "502", "500"]):
            return True
        
        # Anthropic-specific retryable errors
        if error_type in ["RateLimitError", "APIConnectionError", "APITimeoutError", "InternalServerError"]:
            return True
        
        # OpenAI-specific retryable errors
        if error_type in ["RateLimitError", "APIConnectionError", "APITimeoutError", "InternalServerError"]:
            return True
        
        # Don't retry authentication, validation, or other permanent errors
        return False
    
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
        elif provider == "openrouter":
            return self._call_openrouter(model, prompt, system_prompt, max_tokens, temperature)
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
    
    def _call_openrouter(
        self,
        model: str,
        prompt: str,
        system_prompt: str | None,
        max_tokens: int,
        temperature: float,
    ) -> str:
        """Call OpenRouter (OpenAI-compatible API)."""
        if not self._openrouter_client:
            raise RuntimeError("OpenRouter client not initialized")
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        response = self._openrouter_client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        
        return response.choices[0].message.content
    
    def _call_openrouter_stream(
        self,
        model: str,
        prompt: str,
        system_prompt: str | None,
        max_tokens: int,
        temperature: float,
    ):
        """Stream tokens from OpenRouter (OpenAI-compatible API)."""
        if not self._openrouter_client:
            raise RuntimeError("OpenRouter client not initialized")
        
        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})
        
        stream = self._openrouter_client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=max_tokens,
            temperature=temperature,
            stream=True,
        )
        
        for chunk in stream:
            if chunk.choices[0].delta.content:
                yield chunk.choices[0].delta.content


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
        judge_provider=config.get("judgeProvider"),
        judge_model=config.get("judgeModel"),
        use_cheaper_judge=config.get("useCheaperJudge", True),
    )

