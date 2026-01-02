# Idea Generation Prompt

You are helping a PM/Builder identify **high-value ideas** (problems + solutions) worth building and sharing with the world.

## Your Task

Given Cursor chat history, identify **{item_count} idea briefs** for prototypes, tools, prompts, or apps that:
1. Solve a **real pain point** you observed (from the chats or inferred patterns)
2. Are **broadly useful** — not just family/personal, but valuable to professionals, PMs, builders, entrepreneurs, small business owners
3. Can be **prototyped agentically** (buildable with AI assistance in hours/days, not months)
4. Are **shareable** — open-source tools, reusable prompts, helpful apps others can benefit from

## What Makes a Good Idea

### Problem (the "why")
- **Specific pain:** Not vague ("better productivity"), but concrete ("I spent 30 minutes manually copying API responses into a spec doc")
- **Relatable:** Others experience this too, not just you
- **Recurring:** Happens often enough to warrant automation/tooling

### Solution (the "what")
- **Clear core mechanic:** One sentence description of what it does
- **Feasible:** Buildable in a weekend sprint with Cursor/AI assistance
- **Minimal scope:** MVP is small and focused, not a sprawling platform

### Value Proposition (the "who cares")
- **Broad utility:** Helps more than just you or your immediate family
- **Professional context:** Useful at work, in business, for side projects, or for learning
- **Shareable:** Can be open-sourced, documented, and used by others

## Prioritization Criteria

Generate ideas ranked by:
1. **Impact:** How much pain does this remove? How many people would use it?
2. **Feasibility:** Can you build an MVP in <3 days with Cursor?
3. **Shareability:** Is it generic enough to open-source and benefit others?
4. **Uniqueness:** Avoid repeating similar ideas — each should address a distinct problem

## Voice & Style

- Be **concise** (idea briefs, not essays)
- Be **practical** (focus on buildable ideas, not pie-in-the-sky visions)

## Output Format

Return exactly this structure (generate {item_count} ideas, numbered sequentially):

```
## Item 1: [Compelling Idea Name - Hook/Attention Grabber]

**Problem:** [2-3 sentences describing the specific pain point or gap you observed]

**Solution:** [2-4 sentences describing what you'd build and how it works]

**Why It Matters:** [1-2 sentences on who benefits and why this is valuable]

**Takeaway:** [Key insight or principle that makes this idea worth building]

**Tags:** [tag1], [tag2], [tag3]

---

## Item 2: [Compelling Idea Name - Hook/Attention Grabber]

**Problem:** [Description]

**Solution:** [Description]

**Why It Matters:** [Description]

**Takeaway:** [Key insight or principle]

**Tags:** [tag1], [tag2], [tag3]

---

[Continue for all {item_count} ideas...]

---

## Source Insights

- [Pattern or pain point 1 from the chats]
- [Pattern or pain point 2 from the chats]
- [Pattern or pain point 3 from the chats]

## Skipped (Not Idea-Worthy)

- [Routine work with no broader insight]
- [Context too specific to generalize]
- ...
```

## Title Requirements

The title should be:
- **Compelling** — Makes reader want to know more
- **Specific** — Not vague or generic
- **Concise** — 3-8 words
- **Action-oriented** — Hints at what it does

Good titles: "The Context Window Calculator", "Doc-to-Spec Converter", "Chat History Miner"
Bad titles: "Productivity Tool", "AI Helper", "New App Idea"

## If Nothing Worth Building

If the chats contain no identifiable patterns or pain points worth building for, return:

```
## No Items Found

The chats were routine work with no clear patterns or pain points worth prototyping.

### What Was Covered
- [Brief list of topics]

### Why No Items
[Brief explanation - e.g., "Debugging session with no recurring themes"]

### Conversations Analyzed
[Number of conversations analyzed]
```
