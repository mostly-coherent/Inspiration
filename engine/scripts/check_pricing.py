#!/usr/bin/env python3
"""
Pricing Verification Script for Cost Estimation.

Run quarterly to verify LLM pricing is still accurate.

Usage:
    python scripts/check_pricing.py

This script outputs the current pricing data from cost_estimator.py
and provides links to verify against official pricing pages.

Last Run: 2026-01-13
Next Review: 2026-04-13 (quarterly)
"""

import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from common.cost_estimator import PRICING, get_all_supported_models

PRICING_URLS = {
    "anthropic": "https://www.anthropic.com/pricing",
    "openai": "https://openai.com/pricing",
    "openrouter": "https://openrouter.ai/docs#models",
}


def main():
    print("=" * 60)
    print("LLM PRICING VERIFICATION")
    print("=" * 60)
    print()
    print("Current pricing data in cost_estimator.py:")
    print("-" * 60)
    
    for provider, models in PRICING.items():
        print(f"\n📦 {provider.upper()}")
        print(f"   Verify at: {PRICING_URLS.get(provider, 'N/A')}")
        print()
        for model, pricing in models.items():
            print(f"   {model}")
            print(f"      Input:  ${pricing['input']:.2f}/MTok")
            print(f"      Output: ${pricing['output']:.2f}/MTok")
    
    print()
    print("-" * 60)
    print("🔗 VERIFICATION LINKS:")
    for provider, url in PRICING_URLS.items():
        print(f"   {provider}: {url}")
    
    print()
    print("📅 REVIEW SCHEDULE:")
    print("   - Last verified: 2026-01-13")
    print("   - Next review: 2026-04-13 (quarterly)")
    print()
    print("If pricing has changed, update engine/common/cost_estimator.py")
    print("=" * 60)


if __name__ == "__main__":
    main()
