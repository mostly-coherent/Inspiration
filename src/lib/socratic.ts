/**
 * Socratic Engine — TypeScript implementation for cloud-compatible Socratic reflection.
 *
 * Replaces the Python socratic_engine.py to enable Vercel deployment.
 * Aggregates data from Supabase, calls Anthropic LLM, and caches results.
 *
 * Data Sources:
 * - Patterns (Library item clusters via cosine similarity)
 * - Library stats (type/date distribution)
 * - Expert matches (Lenny archive vector search)
 * - Temporal shifts (emerging/declining themes)
 * - Unexplored areas (Memory gaps not in Library)
 */

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SocraticQuestion {
  id: string;
  question: string;
  category: "pattern" | "gap" | "tension" | "temporal" | "expert" | "alignment";
  evidence: string;
  difficulty: "comfortable" | "uncomfortable" | "confrontational";
}

interface PatternCluster {
  name: string;
  itemCount: number;
  items: string[];
  percentage: number;
}

interface UnexploredTopic {
  topic: string;
  conversationCount: number;
  severity: string;
  sampleText: string;
}

interface ExpertMatch {
  theme: string;
  expertQuote: string;
  guestName: string;
  episodeTitle: string;
  similarity: number;
}

interface TemporalShift {
  theme: string;
  trend: "emerging" | "declining";
  peakPeriod: string;
  currentPeriod: string;
  peakCount: number;
  currentCount: number;
}

interface LibraryStats {
  totalItems: number;
  byType: Record<string, number>;
  oldestItemDate: string | null;
  newestItemDate: string | null;
}

interface SocraticContext {
  patterns: PatternCluster[];
  unexplored: UnexploredTopic[];
  counterIntuitive: { saved: string[]; dismissed: string[] };
  libraryStats: LibraryStats;
  expertMatches: ExpertMatch[];
  temporalShifts: TemporalShift[];
}

// ---------------------------------------------------------------------------
// In-memory cache (persists within a function instance / dev server)
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

let cachedQuestions: SocraticQuestion[] | null = null;
let cachedAt: number | null = null;

function getCachedQuestions(): SocraticQuestion[] | null {
  if (!cachedQuestions || !cachedAt) return null;
  if (Date.now() - cachedAt > CACHE_TTL_MS) {
    cachedQuestions = null;
    cachedAt = null;
    return null;
  }
  return cachedQuestions;
}

function saveToCache(questions: SocraticQuestion[]): void {
  cachedQuestions = questions;
  cachedAt = Date.now();
}

// ---------------------------------------------------------------------------
// Supabase client helper
// ---------------------------------------------------------------------------

function getSupabaseClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

// ---------------------------------------------------------------------------
// Data Aggregation: Patterns (Library item clusters)
// ---------------------------------------------------------------------------

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);
  if (normA === 0 || normB === 0) return 0;
  return dot / (normA * normB);
}

function generateClusterName(titles: string[]): string {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
    "have", "has", "had", "do", "does", "did", "will", "would", "could",
    "should", "may", "might", "can", "shall", "must", "and", "or", "but",
    "in", "on", "at", "to", "for", "of", "with", "by", "from", "as",
    "into", "through", "during", "before", "after", "above", "below",
    "between", "out", "off", "over", "under", "about", "up", "down",
    "this", "that", "these", "those", "it", "its", "how", "what", "when",
    "where", "why", "which", "who", "whom", "not", "no", "nor", "so",
    "too", "very", "just", "than", "then", "also", "here", "there", "if",
    "use", "using", "used",
  ]);

  const wordCounts: Record<string, number> = {};
  for (const title of titles) {
    for (let word of title.toLowerCase().split(/\s+/)) {
      word = word.replace(/^[.,!?;:()[\]{}"'`\-_/\\]+|[.,!?;:()[\]{}"'`\-_/\\]+$/g, "");
      if (word.length > 3 && !stopWords.has(word)) {
        wordCounts[word] = (wordCounts[word] || 0) + 1;
      }
    }
  }

  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  if (topWords.length > 0) {
    return topWords.map(([w]) => w.charAt(0).toUpperCase() + w.slice(1)).join(" & ");
  }
  return titles[0]?.slice(0, 50) || "Unknown";
}

async function aggregatePatterns(supabase: SupabaseClient): Promise<PatternCluster[]> {
  // Fetch all active library items with embeddings
  const { data: items, error } = await supabase
    .from("library_items")
    .select("id, title, embedding, item_type, last_seen, first_seen")
    .neq("status", "archived");

  if (error || !items || items.length < 5) return [];

  // Parse embeddings: Supabase returns them as JSON strings, not arrays
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const itemsWithEmbeddings: Array<(typeof items)[number] & { embedding: number[] }> = [];
  for (const item of items) {
    if (!item.embedding) continue;
    let emb: number[];
    if (typeof item.embedding === "string") {
      try {
        emb = JSON.parse(item.embedding);
      } catch {
        continue;
      }
    } else if (Array.isArray(item.embedding)) {
      emb = item.embedding;
    } else {
      continue;
    }
    if (emb.length > 0) {
      itemsWithEmbeddings.push({ ...item, embedding: emb });
    }
  }

  if (itemsWithEmbeddings.length < 5) return [];

  // Cluster by cosine similarity
  const threshold = 0.7;
  const used = new Set<number>();
  const clusters: PatternCluster[] = [];

  for (let i = 0; i < itemsWithEmbeddings.length; i++) {
    if (used.has(i)) continue;

    const cluster = [itemsWithEmbeddings[i]];
    used.add(i);

    for (let j = i + 1; j < itemsWithEmbeddings.length; j++) {
      if (used.has(j)) continue;

      const sim = cosineSimilarity(
        itemsWithEmbeddings[i].embedding,
        itemsWithEmbeddings[j].embedding
      );
      if (sim >= threshold) {
        cluster.push(itemsWithEmbeddings[j]);
        used.add(j);
      }
    }

    if (cluster.length >= 2) {
      const titles = cluster.slice(0, 5).map((item) => item.title || "");
      clusters.push({
        name: generateClusterName(titles),
        itemCount: cluster.length,
        items: cluster.slice(0, 8).map((item) => item.title || ""),
        percentage: Math.round((cluster.length / itemsWithEmbeddings.length) * 1000) / 10,
      });
    }
  }

  clusters.sort((a, b) => b.itemCount - a.itemCount);
  return clusters.slice(0, 10);
}

// ---------------------------------------------------------------------------
// Data Aggregation: Library Stats
// ---------------------------------------------------------------------------

async function aggregateLibraryStats(supabase: SupabaseClient): Promise<LibraryStats> {
  const { data: items, error } = await supabase
    .from("library_items")
    .select("item_type, last_seen, first_seen")
    .neq("status", "archived");

  if (error || !items || items.length === 0) {
    return { totalItems: 0, byType: {}, oldestItemDate: null, newestItemDate: null };
  }

  const byType: Record<string, number> = {};
  const dates: string[] = [];

  for (const item of items) {
    const itemType = item.item_type || "unknown";
    byType[itemType] = (byType[itemType] || 0) + 1;

    const dateStr = item.last_seen || item.first_seen;
    if (dateStr) dates.push(dateStr);
  }

  dates.sort();

  return {
    totalItems: items.length,
    byType,
    oldestItemDate: dates[0] || null,
    newestItemDate: dates[dates.length - 1] || null,
  };
}

// ---------------------------------------------------------------------------
// Data Aggregation: Expert Matches (Lenny archive vector search)
// ---------------------------------------------------------------------------

async function aggregateExpertMatches(
  supabase: SupabaseClient,
  patterns: PatternCluster[]
): Promise<ExpertMatch[]> {
  if (patterns.length === 0) return [];

  const openaiKey = process.env.OPENAI_API_KEY;
  if (!openaiKey) return [];

  const openai = new OpenAI({ apiKey: openaiKey });
  const matches: ExpertMatch[] = [];

  // Search for top 5 patterns
  for (const pattern of patterns.slice(0, 5)) {
    try {
      // Get embedding for pattern name
      const embeddingResponse = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: pattern.name,
      });
      const queryEmbedding = embeddingResponse.data[0].embedding;

      // Search Lenny archive via RPC
      const { data, error } = await supabase.rpc("search_cursor_messages", {
        query_embedding: queryEmbedding,
        match_threshold: 0.4,
        match_count: 5,
      });

      if (error || !data || data.length === 0) continue;

      // Get source details to filter Lenny results
      const messageIds = data.map((row: { message_id: string }) => row.message_id);
      const { data: fullRows } = await supabase
        .from("cursor_messages")
        .select("message_id, source, source_detail, text")
        .in("message_id", messageIds);

      if (!fullRows) continue;

      const lennyRow = fullRows.find((r) => r.source === "lenny");
      if (lennyRow) {
        const detail = lennyRow.source_detail || {};
        matches.push({
          theme: pattern.name,
          expertQuote: (lennyRow.text || "").slice(0, 200),
          guestName: detail.guest_name || "Unknown",
          episodeTitle: detail.episode_title || detail.episode_filename || "",
          similarity: data.find(
            (d: { message_id: string; similarity: number }) => d.message_id === lennyRow.message_id
          )?.similarity || 0,
        });
      }
    } catch (e) {
      // Lenny search might not be available — continue without
      console.warn(`Expert match failed for '${pattern.name}':`, e);
    }
  }

  return matches;
}

// ---------------------------------------------------------------------------
// Data Aggregation: Temporal Shifts
// ---------------------------------------------------------------------------

function countTitleWords(titles: string[]): Record<string, number> {
  const stopWords = new Set([
    "the", "a", "an", "is", "are", "and", "or", "but", "in", "on", "at",
    "to", "for", "of", "with", "by", "from", "as", "how", "what", "when",
    "where", "why", "which", "who", "not", "this", "that", "it", "its",
    "use", "using", "used",
  ]);

  const counts: Record<string, number> = {};
  for (const title of titles) {
    const seen = new Set<string>();
    for (let word of title.toLowerCase().split(/\s+/)) {
      word = word.replace(/^[.,!?;:()[\]{}"'`\-_/\\]+|[.,!?;:()[\]{}"'`\-_/\\]+$/g, "");
      if (word.length > 3 && !stopWords.has(word) && !seen.has(word)) {
        seen.add(word);
        counts[word] = (counts[word] || 0) + 1;
      }
    }
  }
  return counts;
}

async function aggregateTemporalShifts(supabase: SupabaseClient): Promise<TemporalShift[]> {
  const { data: items, error } = await supabase
    .from("library_items")
    .select("title, last_seen, first_seen")
    .neq("status", "archived");

  if (error || !items || items.length < 10) return [];

  const now = new Date();
  const recentCutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const olderCutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const recentTitles: string[] = [];
  const olderTitles: string[] = [];

  for (const item of items) {
    const dateStr = item.last_seen || item.first_seen;
    if (!dateStr) continue;

    if (dateStr >= recentCutoff) {
      recentTitles.push(item.title || "");
    } else if (dateStr >= olderCutoff) {
      olderTitles.push(item.title || "");
    }
  }

  const recentWords = countTitleWords(recentTitles);
  const olderWords = countTitleWords(olderTitles);
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const olderMonth = olderCutoff.slice(0, 7);
  const shifts: TemporalShift[] = [];

  // Declining themes (were popular, now gone)
  for (const [word, oldCount] of Object.entries(olderWords)) {
    if (oldCount >= 3 && (recentWords[word] || 0) <= 1) {
      shifts.push({
        theme: word.charAt(0).toUpperCase() + word.slice(1),
        trend: "declining",
        peakPeriod: olderMonth,
        currentPeriod: currentMonth,
        peakCount: oldCount,
        currentCount: recentWords[word] || 0,
      });
    }
  }

  // Emerging themes (new, weren't there before)
  for (const [word, newCount] of Object.entries(recentWords)) {
    if (newCount >= 3 && (olderWords[word] || 0) <= 1) {
      shifts.push({
        theme: word.charAt(0).toUpperCase() + word.slice(1),
        trend: "emerging",
        peakPeriod: currentMonth,
        currentPeriod: currentMonth,
        peakCount: newCount,
        currentCount: newCount,
      });
    }
  }

  return shifts.slice(0, 5);
}

// ---------------------------------------------------------------------------
// Data Aggregation: Unexplored Topics (simplified cloud version)
// ---------------------------------------------------------------------------

async function aggregateUnexplored(supabase: SupabaseClient): Promise<UnexploredTopic[]> {
  // Simplified cloud version: find conversation topics that appear frequently
  // but have no matching library items.
  //
  // We look at recent conversations (cursor_messages) and compare with library items.
  // This is a lighter-weight version of the Python detect_memory_library_mismatch.

  try {
    // Get recent conversation topics (last 90 days)
    const cutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

    const { data: messages, error: msgError } = await supabase
      .from("cursor_messages")
      .select("text, chat_id")
      .neq("source", "lenny")
      .neq("source", "workspace_docs")
      .gte("timestamp", cutoff)
      .limit(500);

    if (msgError || !messages || messages.length < 10) return [];

    // Get all library item titles for comparison
    const { data: libraryItems } = await supabase
      .from("library_items")
      .select("title")
      .neq("status", "archived");

    const libraryTitleWords = new Set<string>();
    for (const item of libraryItems || []) {
      for (const word of (item.title || "").toLowerCase().split(/\s+/)) {
        if (word.length > 4) libraryTitleWords.add(word);
      }
    }

    // Count significant words across conversation messages
    const wordConversations: Record<string, Set<string>> = {};
    const wordSamples: Record<string, string> = {};

    for (const msg of messages) {
      const text = msg.text || "";
      const chatId = msg.chat_id || "unknown";

      for (let word of text.toLowerCase().split(/\s+/)) {
        word = word.replace(/^[^a-z]+|[^a-z]+$/g, "");
        if (word.length > 4 && !libraryTitleWords.has(word)) {
          if (!wordConversations[word]) {
            wordConversations[word] = new Set();
            wordSamples[word] = text.slice(0, 100);
          }
          wordConversations[word].add(chatId);
        }
      }
    }

    // Find topics with many conversations but not in library
    const topics: UnexploredTopic[] = [];
    for (const [word, convos] of Object.entries(wordConversations)) {
      if (convos.size >= 5) {
        topics.push({
          topic: word.charAt(0).toUpperCase() + word.slice(1),
          conversationCount: convos.size,
          severity: convos.size >= 10 ? "high" : "medium",
          sampleText: wordSamples[word] || "",
        });
      }
    }

    topics.sort((a, b) => b.conversationCount - a.conversationCount);
    return topics.slice(0, 8);
  } catch (e) {
    console.warn("Failed to get unexplored areas:", e);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Aggregate all context
// ---------------------------------------------------------------------------

async function aggregateSocraticContext(): Promise<SocraticContext | null> {
  const supabase = getSupabaseClient();
  if (!supabase) {
    console.error("Supabase not available for Socratic reflection.");
    return null;
  }

  // Run independent aggregations in parallel
  const [patterns, libraryStats, unexplored] = await Promise.all([
    aggregatePatterns(supabase),
    aggregateLibraryStats(supabase),
    aggregateUnexplored(supabase),
  ]);

  // Expert matches depend on patterns, temporal shifts is independent
  const [expertMatches, temporalShifts] = await Promise.all([
    aggregateExpertMatches(supabase, patterns),
    aggregateTemporalShifts(supabase),
  ]);

  return {
    patterns,
    unexplored,
    counterIntuitive: { saved: [], dismissed: [] }, // Not applicable in cloud mode
    libraryStats,
    expertMatches,
    temporalShifts,
  };
}

// ---------------------------------------------------------------------------
// Prompt template (inlined from engine/prompts/socratic_questions.md)
// ---------------------------------------------------------------------------

const SOCRATIC_SYSTEM_PROMPT = `# Socratic Reflection Questions

You are a sharp, perceptive thinking partner. Your job is to generate probing questions that challenge a builder's assumptions, surface blind spots, and prompt genuine self-reflection.

## Rules

1. **Questions only.** Never answer, explain, or advise. Just ask.
2. **Every question must cite specific evidence** from the data provided (cluster names, item counts, date ranges, expert quotes). No generic questions.
3. **Be uncomfortable.** At least 2 questions should make the user pause and reconsider something they've assumed.
4. **No flattery.** Don't validate patterns — probe them.
5. **Vary the categories.** Mix pattern, gap, tension, temporal, expert, and alignment questions.
6. **Keep questions concise.** One to two sentences maximum per question.

## Question Categories

- **pattern**: Questions about dominant themes or suspicious distributions. ("Why does X dominate your thinking while Y barely exists?")
- **gap**: Questions about topics discussed but never formalized. ("You discussed X in 20 conversations but never saved insights. Why?")
- **tension**: Questions about contradictions within the user's own patterns. ("Your Library has both X and anti-X items. How do you reconcile these?")
- **temporal**: Questions about shifts, disappearances, or stagnation over time. ("X disappeared from your conversations 3 months ago. What changed?")
- **expert**: Questions about divergence from expert thinking. ("Experts treat X as foundational. You've never mentioned it.")
- **alignment**: Questions about gaps between plans/docs and actual conversations. ("Your docs prioritize X but your chats focus on Y.")

## Output Format

Return a JSON array of exactly 8-12 questions:

\`\`\`json
[
  {
    "question": "The probing question text",
    "category": "pattern|gap|tension|temporal|expert|alignment",
    "evidence": "Specific data that prompted this question",
    "difficulty": "comfortable|uncomfortable|confrontational"
  }
]
\`\`\`

**Difficulty guide:**
- \`comfortable\`: Makes the user think but doesn't challenge core assumptions
- \`uncomfortable\`: Challenges something the user probably takes for granted
- \`confrontational\`: Directly challenges a pattern that might reveal a blind spot or avoidance

**Target mix:** 4-5 comfortable, 3-4 uncomfortable, 1-2 confrontational.

Generate the questions now based on the input data provided.`;

// ---------------------------------------------------------------------------
// LLM call — generate questions via Anthropic
// ---------------------------------------------------------------------------

function createQuestionId(question: string): string {
  // Simple hash using string charCodes (browser-compatible, no crypto needed)
  let hash = 0;
  for (let i = 0; i < question.length; i++) {
    const chr = question.charCodeAt(i);
    hash = ((hash << 5) - hash) + chr;
    hash |= 0; // Convert to 32-bit integer
  }
  return `sq-${Math.abs(hash).toString(16).padStart(8, "0")}`;
}

function parseQuestionsJson(response: string): SocraticQuestion[] {
  // Try direct JSON parse
  try {
    const data = JSON.parse(response);
    if (Array.isArray(data)) return data;
  } catch {
    // not pure JSON
  }

  // Try extracting from markdown code block
  const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    try {
      const data = JSON.parse(codeBlockMatch[1]);
      if (Array.isArray(data)) return data;
    } catch {
      // not valid JSON in code block
    }
  }

  // Try finding array brackets
  const bracketStart = response.indexOf("[");
  const bracketEnd = response.lastIndexOf("]");
  if (bracketStart >= 0 && bracketEnd > bracketStart) {
    try {
      const data = JSON.parse(response.slice(bracketStart, bracketEnd + 1));
      if (Array.isArray(data)) return data;
    } catch {
      // not valid JSON between brackets
    }
  }

  return [];
}

async function callLLMForQuestions(context: SocraticContext): Promise<SocraticQuestion[]> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY not configured");
  }

  const client = new Anthropic({ apiKey });

  const userMessage = `Here is the user's data. Generate 8-12 probing Socratic questions based on this.

${JSON.stringify(context, null, 2)}

Return ONLY the JSON array of questions. No markdown, no explanation.`;

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4000,
    temperature: 0.8,
    system: SOCRATIC_SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  });

  // Extract text content from response
  const textBlock = response.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("LLM returned no text response");
  }

  const questions = parseQuestionsJson(textBlock.text);
  if (questions.length === 0) {
    throw new Error("Failed to parse questions from LLM response");
  }

  // Add unique IDs
  for (const q of questions) {
    q.id = createQuestionId(q.question);
  }

  return questions;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Generate Socratic reflection questions.
 * Uses cache if available and not expired; otherwise aggregates context and calls LLM.
 */
export async function generateSocraticQuestions(
  forceRegenerate: boolean = false
): Promise<{ questions: SocraticQuestion[]; cached: boolean; message?: string }> {
  // Check cache first
  if (!forceRegenerate) {
    const cached = getCachedQuestions();
    if (cached) {
      return { questions: cached, cached: true };
    }
  }

  // Aggregate context from all sources
  const context = await aggregateSocraticContext();
  if (!context) {
    return {
      questions: [],
      cached: false,
      message: "Supabase not configured. Please set SUPABASE_URL and SUPABASE_ANON_KEY.",
    };
  }

  // Check minimum data requirements
  if (!context.patterns.length && !context.unexplored.length) {
    return {
      questions: [],
      cached: false,
      message:
        "Not enough data yet. Add Library items and sync your Memory to generate reflection questions.",
    };
  }

  // Call LLM to generate questions
  const questions = await callLLMForQuestions(context);

  // Cache results
  saveToCache(questions);

  return { questions, cached: false };
}
