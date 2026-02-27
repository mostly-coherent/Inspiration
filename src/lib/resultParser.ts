/**
 * Result Parser - Parse generation results into ranked items
 * 
 * Extracts individual items from markdown content and ranks them
 * based on judge scores or position (best first).
 */

export interface RankedItem {
  id: string;
  rank: number;
  isBest: boolean;
  name: string;
  content: string;
  rawMarkdown: string;
  score?: number;
}

/**
 * Parse markdown content into ranked items
 * Supports both insights (posts) and ideas formats
 */
export function parseRankedItems(
  content: string,
  mode: "insights" | "ideas"
): RankedItem[] {
  if (!content) return [];

  // Extract the main content (before "---")
  const mainContent = content.split("\n---\n")[0];
  
  const items: RankedItem[] = [];

  const prefix = mode === "insights" ? "Post" : "Idea";
  const idPrefix = mode === "insights" ? "post" : "idea";

  // Split by ANY ## heading, then only process sections that match our item pattern
  const allSections = mainContent.split(/(?=^## )/m).filter((s) => s.trim());
  const itemPattern = new RegExp(`^## ${prefix} (\\d+):\\s*(.+)`);

  for (const section of allSections) {
    const headerMatch = section.match(itemPattern);
    if (!headerMatch) continue;

    const num = parseInt(headerMatch[1]);
    const title = headerMatch[2].trim().split("\n")[0];

    let extracted = title;
    if (mode === "insights") {
      const hookMatch = section.match(/\*\*Hook:?\*\*[:\s]*(.+?)(?=\*\*|$)/s);
      const insightMatch = section.match(/\*\*(?:Key )?Insight:?\*\*[:\s]*(.+?)(?=\*\*|$)/s);
      extracted = hookMatch?.[1]?.trim() || insightMatch?.[1]?.trim() || title;
    } else {
      const problemMatch = section.match(/\*\*Problem:?\*\*[:\s]*(.+?)(?=\*\*|$)/s);
      const solutionMatch = section.match(/\*\*Solution:?\*\*[:\s]*(.+?)(?=\*\*|$)/s);
      extracted = problemMatch?.[1]?.trim() || solutionMatch?.[1]?.trim() || title;
    }

    items.push({
      id: `${idPrefix}-${num}`,
      rank: num,
      isBest: num === 1,
      name: title,
      content: extracted,
      rawMarkdown: section.trim(),
    });
  }

  // Sort by rank (already sorted, but ensure it)
  return items.sort((a, b) => a.rank - b.rank);
}

/**
 * Extract estimated cost from content or stats
 */
export function extractEstimatedCost(
  content: string,
  itemsGenerated: number
): number {
  // Try to extract from content if available
  const costMatch = content.match(/Estimated cost:?\s*\$?([\d.]+)/i);
  if (costMatch) {
    return parseFloat(costMatch[1]);
  }
  
  // Fallback: estimate based on items generated
  // v2: Single LLM call (~$0.05-0.10 depending on items)
  return Math.max(0.05, itemsGenerated * 0.01);
}

