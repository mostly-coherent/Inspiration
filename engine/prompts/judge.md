# Reranking Judge Prompt

Pick the best candidate. Return JSON only:

{
  "best": "C1",
  "why": "Brief reason",
  "scores": {
    "C1": {"specificity": 1-5, "constructive": 1-5, "voice": 1-5, "actionability": 1-5, "nonrepetition": 1-5, "total": 5-25},
    "C2": {...}
  }
}

Criteria: Specificity, Constructive, Voice, Actionability, Non-repetition. Score 1-5 each, total = sum.

