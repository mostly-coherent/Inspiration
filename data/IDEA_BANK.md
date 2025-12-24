# 💡 Idea Bank
Last updated: 2025-12-21 | Total: 3 (0 unsolved, 3 partial, 0 solved)

---

## 🔶 Partially Solved

### 🔶 Conflict-Check for Documentation
**Problem:** When building agentically, AI generates tons of documentation (PRDs, specs, diagrams), but there's no easy way to catch contradictions between documents. You manually spot-check an ERD against other docs, but miss conflicts that could cause downstream confusion or rework.
**Solution:** A tool that ingests multiple docs (markdown, PDFs, diagrams) and flags potential conflicts — inconsistent naming, contradictory requirements, misaligned assumptions. Think "diff" but for semantic meaning across document types, not just text changes.
**Audience:** PMs, Technical Writers, Builders, Product Teams
**Seen:** 1 times | **First:** 2025-12-21 | **Last:** 2025-12-21 | **Solved by:** Prompts/ListConflicts.md

**Nuances:**
- MVP scope: Upload 2-5 documents, parse entities/relationships, flag conflicts with confidence scores
- Medium build complexity
- Prevents costly misalignments before they hit development

---

### 🔶 README Optimizer for Open Source
**Problem:** Most open-source projects have terrible READMEs that bury the value proposition and make it hard for newcomers to see what the tool actually does. Builders know their README sucks but don't know how to fix it systematically.
**Solution:** A README analyzer that scores existing READMEs on "time-to-aha" and suggests specific improvements. Checks for: clear value prop, working demo/screenshots, simple setup instructions, and whether a beginner can understand the purpose in 30 seconds.
**Audience:** Open Source Maintainers, Developers, Side Project Builders
**Seen:** 1 times | **First:** 2025-12-21 | **Last:** 2025-12-21 | **Solved by:** Prompts/README-project-refine-prompt.md

**Nuances:**
- Focus on getting users to "first aha moment" quickly
- Score on 5-6 key criteria with specific suggestions and examples
- Simple build complexity
- Before/after comparison tool feature

---

### 🔶 Prompt Library with Context Matching
**Problem:** Valuable prompts are often context-specific (company size, tech stack, role) and not directly shareable. There's no good way to find prompts that match your specific work context or toolchain, and most prompt libraries are too generic.
**Solution:** A prompt library where prompts are tagged by context with pattern extraction. Instead of copying prompts verbatim, users find patterns and get help adapting them to their specific context and workflow.
**Audience:** PMs, Builders, Professionals Using AI Tools
**Seen:** 1 times | **First:** 2025-12-21 | **Last:** 2025-12-21 | **Solved by:** Helpful Prompts

**Nuances:**
- Focus on transferable patterns rather than verbatim copying
- Context tags include role, tools, company type, industry
- "Adapt this pattern" feature for customization
- Community voting on most helpful adaptations
- Medium build complexity

---
