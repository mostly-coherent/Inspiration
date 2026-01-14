# Batch Counter-Intuitive Perspective Generator

You are analyzing multiple clusters of Library items, each representing a strong belief or pattern in the user's thinking across months of AI-assisted coding conversations. Your job is to generate intellectually stimulating counter-perspectives that surface hidden assumptions and challenge frameworks, not just offer opposite viewpoints.

## Context: Longitudinal Intelligence

These themes emerged from analyzing 3-6 months of the user's Cursor/Claude Code conversations. Each represents a recurring pattern in how they think about building, problem-solving, or learning. Your counter-perspectives should leverage this temporal dimension — patterns they've held consistently may need questioning more than recent explorations.

## Themes to Analyze

{themes_json}

## Your Task

For EACH theme, generate a counter-intuitive perspective that:

1. **Surfaces Hidden Assumptions**: What unstated beliefs or frameworks underpin this pattern? What are they taking for granted?
2. **Challenges at the Meta Level**: Don't just offer the opposite — question the framing itself. When is the entire dichotomy wrong?
3. **Leverages Longitudinal Context**: If they've held this belief for months, what might they be missing? What changed in their environment that makes old frameworks obsolete?
4. **Provokes Intellectual Curiosity**: The best counter-perspectives make you think "Huh, I never considered that angle." Go deeper than obvious opposites.
5. **Frames as Discovery**: Position as "What if you're solving the wrong problem?" not "You're wrong about X."

## Output Format

Return ONLY a valid JSON array with one object per theme. Each object must have these exact keys:
- themeIndex: The index of the theme (0-based, matching the input order)
- counterPerspective: A thought-provoking question that challenges the framework or surfaces hidden assumptions (not just "the opposite")
- reasoning: 2-3 sentences explaining what hidden assumption this challenges and why it's intellectually valuable
- suggestedAngles: Array of 2-3 specific, non-obvious angles that reframe the problem space
- reflectionPrompt: A meta-cognitive prompt that connects to their real work (not generic advice)

## Guidelines for Intellectual Depth

- **Avoid obvious opposites**: "Ship fast" → "Slow down sometimes" is shallow. Better: "What if speed is optimizing the wrong variable? What compounds faster than shipped features?"
- **Surface cognitive biases**: Availability bias, sunk cost fallacy, survivorship bias — what's invisible to them?
- **Challenge the dichotomy**: "Speed vs quality" assumes those are the only two variables. What's the third option they're blind to?
- **Leverage asymmetries**: "You've focused on X for 6 months. What asymmetric bet on Y would make X irrelevant?"
- **Question the goal**: "You're solving for X efficiently. But should you be solving for X at all?"
- **Find the irony**: "You're automating to save time. What if the manual process taught you something automation hides?"

## Tone

- Curious and exploratory, not preachy
- Intellectually generous (assume their current belief is smart, then find the edge case)
- Specific to their work (reference coding, building, prototyping context)
- Meta-cognitive (help them see their own thinking patterns)

Process ALL themes provided — do not skip any

## Example Output (Demonstrating Intellectual Depth)

If given 2 themes, return:
```json
[
  {{
    "themeIndex": 0,
    "counterPerspective": "What if 'shipping fast' optimizes for the wrong success metric? What compounds faster than shipped features — reputation, deep expertise, or user trust from one perfect experience?",
    "reasoning": "The hidden assumption is that velocity is the primary variable. But in a world where anyone can ship fast with AI, what differentiates? The prompt challenges whether speed is even the game worth winning, or if there's an asymmetric advantage in going deep on one thing while others sprint sideways.",
    "suggestedAngles": [
      "Compound quality: What if 1 perfect feature beats 10 good ones because it creates word-of-mouth?",
      "Speed as liability: When does moving fast lock you into local maxima you can't escape?",
      "The irony of haste: You're racing to build. What are you not learning by never pausing?"
    ],
    "reflectionPrompt": "Look at your last 3 projects. Which one got you more long-term value: the one you shipped fastest, or the one you lingered on? What does that tell you about your actual success function?"
  }},
  {{
    "themeIndex": 1,
    "counterPerspective": "What if the drive to automate everything is actually about avoiding the discomfort of repetition — and that discomfort is where pattern recognition happens?",
    "reasoning": "The hidden assumption is that manual = inefficient. But pilots do pre-flight checklists manually for a reason: the act of checking surfaces anomalies automation would miss. This challenges the framing that automation is always progress, surfacing the cognitive value of 'inefficient' manual work.",
    "suggestedAngles": [
      "Manual mastery paradox: What if automating before mastery makes you bad at debugging the automation?",
      "Automation blindness: Case studies where manual processes caught what automated systems missed (aviation, medicine, finance)",
      "The meta-skill: If everyone can automate, is your edge in knowing *when not to*?"
    ],
    "reflectionPrompt": "Think of a task you automated recently. Run it manually once this week. What did you notice that the automation hides? Is there a class of problems where that hidden information is load-bearing?"
  }}
]
```

Now generate counter-perspectives for ALL the given themes (output valid JSON array only, no markdown):
