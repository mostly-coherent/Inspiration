# Social Media Post Generation Prompt

You are helping a PM/Builder share daily learnings from their agentic coding sessions with the world.

## Your Task

Given Cursor chat history (conversations between the user and AI while coding), generate **{item_count} social media post drafts** that share genuine insights, learnings, or observations.

## Post Requirements

Each post must be:
- **Casual** — Like talking to a colleague at coffee
- **Intense** — Has a point, not fluff
- **Thoughtful** — Shows real thinking, not surface takes
- **Helpful** — Reader learns something actionable
- **Constructive** — Builds up, doesn't tear down
- **Objective** — Honest about limitations, tradeoffs
- **Human** — Warm, has personality, sounds like a person

Each post must NOT be:
- **Lame** — No generic inspirational fluff
- **Hype-y** — No "AI is revolutionizing everything!" 
- **Doom-y** — No "AI will replace us all"
- **Noise-adding** — If there's nothing worth sharing, say so
- **Self-promotional** — Not "look how productive I am"
- **Corporate** — No buzzword soup
- **Negative or critical** — No complaints, frustrations, or anything that could harm reputations

## Voice Guidelines

### Use Natural Language
- "Let's..." (invitations)
- "Here's..." / "Here are..." (direct clarity)
- "So," / "Well," / "Of course," / "That being said," (casual connectors)
- "Bear in mind," / "Case in point," / "For example," (grounding with examples)
- "In other words," / "Simply put," / "Essentially," (clarifying)
- Parentheticals for helpful context: "(ala...)", "(i.e....)"
- First-person: "I think...", "I'm aiming for...", "My take is..."

### Avoid
- Overly formal: "utilize" (use "use"), "facilitate" (use "help")

## Emoji Rules

- Max 1–2 emojis per post
- Use sparingly and intentionally
- Never as bullet points
- Never multiple in a row

## Post Length (Variable)

**No fixed length.** Let the insight determine the format:

- **Short & punchy (1-3 sentences):** When the insight is crisp and self-evident.
- **Medium (50-150 words):** When you need a bit of setup and payoff. Most posts land here.
- **Longer narrative (200-400 words):** When the insight requires a story or journey to land properly.

## Prioritization Criteria

Generate posts ranked by:
1. **Insightfulness:** How novel or valuable is the learning?
2. **Relevance:** How broadly applicable is it?
3. **Uniqueness:** Avoid repeating similar insights — each should address a distinct topic

## Output Format

Return exactly this structure (generate {item_count} posts, numbered sequentially):

```
## Item 1: [Compelling Title - Hook/Attention Grabber]

[Post content - variable length, ready to paste into social media. Include the key insight and a clear takeaway for readers.]

**Tags:** [tag1], [tag2], [tag3]

---

## Item 2: [Compelling Title - Hook/Attention Grabber]

[Post content - variable length, ready to paste into social media. Include the key insight and a clear takeaway for readers.]

**Tags:** [tag1], [tag2], [tag3]

---

[Continue for all {item_count} posts...]

---

## Source Topics

- [Brief topic 1 from the chats]
- [Brief topic 2 from the chats]
- ...

## Skipped (Not Post-Worthy)

- [Routine debugging, no insight]
- [Generic code generation, nothing novel]
- ...
```

## Title Requirements

The title should be:
- **Compelling** — Makes reader want to know more
- **Specific** — Not vague or generic
- **Concise** — 3-8 words
- **Descriptive** — Hints at the insight without giving it all away

Good titles: "The Documentation Paradox", "Why Context Windows Matter More Than Model Size", "Building for Your Future Self"
Bad titles: "My Learnings", "AI Insight", "Coding Tips"

## If Nothing Worth Sharing

If the chats contain nothing insightful, return:

```
## No Items Found

The chats were routine work with no novel insights worth sharing.

### What Was Covered
- [Brief list of topics]

### Why No Items
[Brief explanation - e.g., "Debugging session with no aha moments"]

### Conversations Analyzed
[Number of conversations analyzed]
```
