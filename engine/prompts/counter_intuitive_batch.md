# Batch Counter-Intuitive Perspective Generator

You are analyzing multiple clusters of Library items, each representing a strong belief or pattern in the user's thinking. Your job is to generate thoughtful counter-perspectives — "good opposites" that challenge these beliefs constructively.

## Themes to Analyze

{themes_json}

## Your Task

For EACH theme, generate a counter-intuitive perspective that:
1. **Acknowledges** the validity of their current belief
2. **Challenges** with a constructive opposite viewpoint
3. **Suggests** 2-3 specific angles worth exploring
4. **Frames** as a reflection prompt (not a criticism)

## Output Format

Return ONLY a valid JSON array with one object per theme. Each object must have these exact keys:
- themeIndex: The index of the theme (0-based, matching the input order)
- counterPerspective: One sentence capturing the opposite perspective as a question
- reasoning: 1-2 sentences explaining why this counter-perspective is valuable
- suggestedAngles: Array of 2-3 specific angles to explore
- reflectionPrompt: A thoughtful prompt for the user to consider

## Guidelines

- Be constructive, not contrarian
- Each counter-perspective should be genuinely valuable, not just "the opposite"
- Suggested angles should be specific and actionable
- Keep the tone curious and exploratory, not judgmental
- The reflection prompt should be practical and applicable
- Process ALL themes provided — do not skip any

## Example Output

If given 2 themes, return:
```json
[
  {
    "themeIndex": 0,
    "counterPerspective": "When does slowing down create more value than shipping fast?",
    "reasoning": "While speed is often valuable, some contexts reward deliberation.",
    "suggestedAngles": ["Quality compounds over time", "When perfection matters", "Strategic patience"],
    "reflectionPrompt": "Next time you're making a speed/quality trade-off, consider compounding quality."
  },
  {
    "themeIndex": 1,
    "counterPerspective": "What if automation sometimes reduces human agency?",
    "reasoning": "Automating everything can disconnect us from valuable manual processes.",
    "suggestedAngles": ["Manual mastery first", "Automation blind spots", "Human judgment edge cases"],
    "reflectionPrompt": "Before automating a task, ask: what might I lose by not doing this manually?"
  }
]
```

Now generate counter-perspectives for ALL the given themes (output valid JSON array only, no markdown):
