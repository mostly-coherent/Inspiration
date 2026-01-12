# Item Ranking Prompt

Rank the following items by quality and relevance. Return JSON only.

## Ranking Criteria

1. **Impact** (1-5): How much value does this provide? How many people would benefit?
2. **Specificity** (1-5): Is it concrete and actionable, not vague?
3. **Uniqueness** (1-5): Is it novel or just restating something obvious?
4. **Feasibility** (1-5): Is it realistic and achievable?
5. **Recurrence** (1-5): Does this theme appear multiple times in the generation window? Higher recurrence = stronger pattern signal.

## Output Format

Return a JSON array of item rankings, sorted best to worst:

```json
{
  "rankings": [
    {"id": "Item 1", "scores": {"impact": 5, "specificity": 4, "uniqueness": 4, "feasibility": 5, "recurrence": 5}, "total": 23, "reason": "High-impact idea that appeared in 3 different contexts - strong signal"},
    {"id": "Item 2", "scores": {"impact": 4, "specificity": 3, "uniqueness": 5, "feasibility": 4, "recurrence": 2}, "total": 18, "reason": "Novel approach but single occurrence"},
    ...
  ],
  "summary": "Brief summary of top items and why they stand out"
}
```

## Rules

- Rank ALL items provided
- Sort by total score (highest first)
- Be objective and consistent in scoring
- If items are very similar, give the more specific one a higher uniqueness score
- Return ONLY valid JSON, no other text

