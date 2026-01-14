# Inspiration Fast Start — Launch Prep

> **Goal:** Get 10 active users who rave about the local-only experience.
> **Target:** Cursor power users who want to extract patterns from their AI chat history.

---

## 📋 Launch Checklist

### Core Functionality
- [x] Clone → first theme map in < 3 minutes (including key paste)
- [x] Works without Supabase setup
- [x] `npm run bootstrap` works on macOS and Windows
- [x] DB auto-detection works
- [x] Time window suggestion is reasonable
- [x] API key validation works (Anthropic, OpenAI, OpenRouter)
- [x] Theme generation completes in < 90 seconds
- [x] Theme Map displays correctly (themes, evidence, unexplored)
- [x] Theme Map persists across page refreshes
- [x] Theme Map accessible from main app header

### Error Handling
- [x] Invalid API key → clear error message + return to key input
- [x] No conversations found → suggest longer time window
- [x] LLM timeout → suggest shorter time window
- [x] Rate limit → show countdown + retry option
- [x] Malformed LLM output → silent retry once

### Documentation
- [x] README updated with Fast Start flow
- [x] README shows ~90 seconds badge
- [x] Quick Start has clear 4 steps
- [x] Supabase framed as optional power feature
- [x] CLAUDE.md documents dual-mode architecture
- [x] ARCHITECTURE.md has new components/APIs

### Testing
- [x] E2E tests pass (10/10)
- [x] Performance benchmark script works
- [x] DB estimation < 5s ✅
- [x] Conversation extraction < 15s ✅

### Polish
- [x] Debug Report button in Settings
- [ ] Demo video/GIF ready
- [ ] User testing complete (3-5 developers)

---

## 🎬 Demo Video Script

**Target length:** 60-90 seconds
**Format:** Screen recording with voiceover (or captions)
**Resolution:** 1080p or 720p

### Scene 1: The Hook (0:00-0:10)
**Visual:** Terminal showing `git clone`
**Script:**
> "What patterns are hiding in your Cursor chat history? Let's find out in 90 seconds."

### Scene 2: Clone & Install (0:10-0:25)
**Visual:** Terminal commands
**Script:**
```bash
git clone https://github.com/mostly-coherent/Inspiration.git
cd Inspiration
npm run bootstrap
npm run dev
```
> "Clone, bootstrap, run. That's it."

### Scene 3: Auto-Detection (0:25-0:35)
**Visual:** Browser showing onboarding welcome screen
**Script:**
> "Inspiration auto-detects your Cursor history. [X] MB of conversations ready to analyze."

### Scene 4: API Key (0:35-0:45)
**Visual:** Paste API key, see validation checkmark
**Script:**
> "Paste your Anthropic or OpenAI key. One key, stored locally."

### Scene 5: Generate Theme Map (0:45-0:65)
**Visual:** Progress indicator → Theme Map results
**Script:**
> "Click generate. In about a minute, you'll see the top 5 themes from your recent work."

### Scene 6: Theme Results (0:65-0:80)
**Visual:** Scroll through themes, hover on evidence
**Script:**
> "Each theme shows what you've been working on, backed by real conversations. Plus: unexplored territory you might want to dive into."

### Scene 7: CTA (0:80-0:90)
**Visual:** GitHub link + star button
**Script:**
> "Local-first. No uploads. Your patterns, your insights. Star the repo and try it today."

### Recording Tips
- Use a clean browser profile (no extensions visible)
- Pre-populate with a good-looking Theme Map result
- Use `?preview=true` for consistent demo data
- Record at 1.5x speed, play at 1x with voiceover
- Add background music (lo-fi, non-distracting)

---

## 👥 User Testing Materials

### Recruitment Message (Discord/Twitter/DM)

**Subject:** 🔬 Beta testers wanted: Find patterns in your Cursor history

**Message:**
> Hey! I built a tool that analyzes your Cursor AI chat history and surfaces patterns in what you've been working on.
>
> Looking for 3-5 developers to try the new "Fast Start" experience:
> - Takes ~90 seconds from clone to first insights
> - Runs 100% locally (no data uploads)
> - Requires just one LLM API key
>
> In return: I'd love 15 minutes of your time to watch you try it and hear your honest feedback.
>
> Interested? Drop a 🙋 or DM me!

### Pre-Test Checklist
Before the session, verify:
- [ ] Tester has Cursor installed with chat history (> 1 week of use)
- [ ] Tester has an LLM API key (Anthropic, OpenAI, or OpenRouter)
- [ ] Tester is on macOS or Windows (no Linux)
- [ ] Tester has Node.js and Python 3.10+ installed
- [ ] Screen sharing set up (Zoom, Discord, etc.)

### Testing Script

**Introduction (2 min):**
> "Thanks for helping test Inspiration! I'll share a GitHub link and watch you try to get from clone to seeing patterns in your Cursor history. Think out loud — I want to hear your reactions, confusion, excitement, everything. I won't help unless you're truly stuck."

**Task (5-10 min):**
> "Here's the repo: github.com/mostly-coherent/Inspiration
> Your goal: See patterns from your recent Cursor conversations.
> Go!"

**Observation points:**
- [ ] Did they find the Quick Start section?
- [ ] Did `npm run bootstrap` work on first try?
- [ ] Any confusion about which API key to use?
- [ ] Was the time window suggestion "obviously right"?
- [ ] How did they react when themes appeared?
- [ ] Did they click on any themes or evidence?
- [ ] Did they notice the "unexplored territory" section?

**Debrief questions (5 min):**
1. "On a scale of 1-10, how useful were the themes you saw?"
2. "Was anything confusing or frustrating?"
3. "What would make you come back and use this again?"
4. "Would you recommend this to a colleague? Why/why not?"
5. "Any features you expected but didn't see?"

### Success Criteria
- [ ] All testers complete onboarding in < 3 minutes
- [ ] At least 4/5 say themes were "interesting/useful" (7+ on scale)
- [ ] No blocking issues identified
- [ ] Clear next steps for improvement

### Feedback Tracking

| Tester | Date | Time to Theme Map | Theme Rating (1-10) | Key Feedback | Blockers |
|--------|------|-------------------|---------------------|--------------|----------|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

---

## 📣 Launch Channels

### Primary (Week 1)
1. **Cursor Discord** — #showcase or #projects channel
2. **Twitter/X** — Tag @cursor_ai, @AnthropicAI
3. **r/ClaudeAI** — Post with demo GIF

### Secondary (Week 2)
4. **Hacker News** — "Show HN: Extract patterns from your Cursor AI history"
5. **r/LocalLLaMA** — Emphasize local-first, no data uploads
6. **Dev.to** — "What I learned from analyzing 1000 AI conversations"

### Direct Outreach
- DM 20-30 Cursor power users (find via Twitter, Discord activity)
- Offer live onboarding call (Zoom screen share)

---

## 🎯 Success Metrics

**Target: 10 active users within 2 weeks of launch**

| Metric | Target | Tracking |
|--------|--------|----------|
| GitHub stars | 50+ | GitHub repo |
| Clones/forks | 20+ | GitHub insights |
| Issues/PRs | 5+ | GitHub repo |
| Discord mentions | 10+ | Cursor Discord search |
| Twitter mentions | 10+ | Twitter search |
| User feedback sessions | 5+ | Manual tracking |

---

**Last Updated:** 2026-01-13
