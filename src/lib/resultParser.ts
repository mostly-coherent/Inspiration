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

  if (mode === "insights") {
    // Parse insights format: ## Post 1: Title\n\n**Hook:** ...\n**Insight:** ...
    const postPattern = /^## Post (\d+):\s*(.+?)(?=^## |\Z)/gms;
    let match;
    
    while ((match = postPattern.exec(mainContent)) !== null) {
      const postNumber = parseInt(match[1]);
      const postContent = match[0];
      const title = match[2].trim().split('\n')[0];
      
      // Extract hook and insight
      const hookMatch = postContent.match(/\*\*Hook:?\*\*[:\s]*(.+?)(?=\*\*|$)/s);
      const insightMatch = postContent.match(/\*\*(?:Key )?Insight:?\*\*[:\s]*(.+?)(?=\*\*|$)/s);
      
      items.push({
        id: `post-${postNumber}`,
        rank: postNumber,
        isBest: postNumber === 1, // First post is best
        name: title,
        content: hookMatch?.[1]?.trim() || insightMatch?.[1]?.trim() || title,
        rawMarkdown: postContent.trim(),
      });
    }
  } else if (mode === "ideas") {
    // Parse ideas format: ## Idea 1: Title\n\n**Problem:** ...\n**Solution:** ...
    const ideaPattern = /^## Idea (\d+):\s*(.+?)(?=^## |\Z)/gms;
    let match;
    
    while ((match = ideaPattern.exec(mainContent)) !== null) {
      const ideaNumber = parseInt(match[1]);
      const ideaContent = match[0];
      const title = match[2].trim().split('\n')[0];
      
      // Extract problem and solution
      const problemMatch = ideaContent.match(/\*\*Problem:?\*\*[:\s]*(.+?)(?=\*\*|$)/s);
      const solutionMatch = ideaContent.match(/\*\*Solution:?\*\*[:\s]*(.+?)(?=\*\*|$)/s);
      
      items.push({
        id: `idea-${ideaNumber}`,
        rank: ideaNumber,
        isBest: ideaNumber === 1, // First idea is best
        name: title,
        content: problemMatch?.[1]?.trim() || solutionMatch?.[1]?.trim() || title,
        rawMarkdown: ideaContent.trim(),
      });
    }
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

