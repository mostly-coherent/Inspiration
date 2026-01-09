import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

interface Item {
  id: string;
  title: string;
  description?: string;
  itemType: string;
  embedding?: number[];
  categoryId?: string | null;
}

interface ThemePreview {
  id: string;
  name: string;
  itemCount: number;
  items: { id: string; title: string; description?: string }[];
}

// Cosine similarity calculation
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

// Dynamic theme grouping based on similarity threshold
function groupItemsByThreshold(
  items: Item[],
  threshold: number
): Map<string, Item[]> {
  const themes = new Map<string, Item[]>();
  const itemsWithEmbeddings = items.filter((item) => item.embedding && item.embedding.length > 0);

  for (const item of itemsWithEmbeddings) {
    let bestThemeId: string | null = null;
    let bestSimilarity = 0;

    // Check against existing themes
    for (const [themeId, themeItems] of themes.entries()) {
      // Compare with first item in theme (representative)
      const representative = themeItems[0];
      if (representative.embedding && item.embedding) {
        const similarity = cosineSimilarity(representative.embedding, item.embedding);
        if (similarity >= threshold && similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestThemeId = themeId;
        }
      }
    }

    if (bestThemeId) {
      themes.get(bestThemeId)!.push(item);
    } else {
      // Create new theme with item's title as base
      const newThemeId = `theme-${item.id}`;
      themes.set(newThemeId, [item]);
    }
  }

  return themes;
}

// Abstract theme concepts for broad themes (lower threshold = more abstract)
const ABSTRACT_THEME_CONCEPTS = [
  "Technology & Innovation",
  "Communication & Collaboration", 
  "Problem Solving & Strategy",
  "Growth & Learning",
  "Design & User Experience",
  "Data & Analytics",
  "Systems & Architecture",
  "Process & Workflow",
  "Leadership & Management",
  "Creativity & Ideas",
];

// Generate theme name from items - threshold affects abstraction level
function generateThemeName(items: Item[], threshold: number): string {
  if (items.length === 0) return "Unnamed Theme";
  if (items.length === 1) return items[0].title;

  // At very broad levels (low threshold, many items), use more abstract names
  const isBroadView = threshold < 0.6;
  
  // Find common words in titles
  const titles = items.slice(0, Math.min(10, items.length)).map((i) => i.title.toLowerCase());
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "your", "about", "when", "what", "how", "into", "using", "based"]);
  const wordSets = titles.map((t) => 
    new Set(t.split(/\s+/).filter((w) => w.length > 3 && !stopWords.has(w)))
  );

  // Find words that appear in at least half the titles
  const wordCounts = new Map<string, number>();
  for (const wordSet of wordSets) {
    for (const word of wordSet) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }
  
  const minOccurrences = isBroadView ? 2 : Math.ceil(wordSets.length / 2);
  const commonWords = [...wordCounts.entries()]
    .filter(([, count]) => count >= minOccurrences)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);

  if (commonWords.length > 0) {
    // Capitalize each word
    const name = commonWords.map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" & ");
    return isBroadView && items.length > 10 ? `${name} (${items.length})` : name;
  }

  // For broad views with no common words, try to pick a representative title
  if (isBroadView && items.length > 5) {
    // Use first part of longest title as representative
    const longestTitle = items.reduce((a, b) => a.title.length > b.title.length ? a : b).title;
    const firstPart = longestTitle.split(/[:\-–]/).shift()?.trim() || longestTitle;
    return firstPart.length > 35 ? firstPart.slice(0, 32) + "..." : firstPart;
  }

  // Fallback: first item's title with count
  const baseName = items[0].title.length > 40 
    ? items[0].title.slice(0, 37) + "..." 
    : items[0].title;
  return items.length > 1 ? `${baseName} (+${items.length - 1})` : baseName;
}

// Load config for theme explorer settings
async function loadThemeExplorerConfig() {
  try {
    const configPath = path.join(process.cwd(), "data", "config.json");
    const configContent = await fs.readFile(configPath, "utf-8");
    const config = JSON.parse(configContent);
    return {
      maxThemesToDisplay: config.themeExplorer?.maxThemesToDisplay ?? 20,
      largeThemeThreshold: config.themeExplorer?.largeThemeThreshold ?? 5,
    };
  } catch {
    return { maxThemesToDisplay: 20, largeThemeThreshold: 5 };
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const threshold = parseFloat(searchParams.get("threshold") || "0.75");
    const itemType = searchParams.get("itemType") || null;

    // Validate threshold
    if (isNaN(threshold) || threshold < 0.3 || threshold > 0.99) {
      return NextResponse.json(
        { success: false, error: "Threshold must be between 0.3 and 0.99" },
        { status: 400 }
      );
    }

    // Load config for display settings
    const explorerConfig = await loadThemeExplorerConfig();

    // Load items bank
    const dataPath = path.join(process.cwd(), "data", "items_bank.json");
    const fileContent = await fs.readFile(dataPath, "utf-8");
    const bank = JSON.parse(fileContent);

    // Filter items
    let items: Item[] = bank.items || [];
    if (itemType) {
      items = items.filter((item: Item) => item.itemType === itemType);
    }

    // Group by threshold
    const groupedThemes = groupItemsByThreshold(items, threshold);

    // Convert to preview format - include ALL items for each theme with descriptions
    const themes: ThemePreview[] = [];
    for (const [themeId, themeItems] of groupedThemes.entries()) {
      themes.push({
        id: themeId,
        name: generateThemeName(themeItems, threshold),
        itemCount: themeItems.length,
        items: themeItems.map((i) => ({ 
          id: i.id, 
          title: i.title,
          description: i.description,
        })),
      });
    }

    // Sort by item count (largest themes first)
    themes.sort((a, b) => b.itemCount - a.itemCount);

    return NextResponse.json({
      success: true,
      threshold,
      totalItems: items.length,
      themeCount: themes.length,
      themes: themes.slice(0, explorerConfig.maxThemesToDisplay),
      stats: {
        avgItemsPerTheme: themes.length > 0 
          ? Math.round((items.length / themes.length) * 10) / 10 
          : 0,
        singleItemThemes: themes.filter((t) => t.itemCount === 1).length,
        largeThemes: themes.filter((t) => t.itemCount >= explorerConfig.largeThemeThreshold).length,
      },
    });
  } catch (error) {
    console.error("Error previewing themes:", error);
    return NextResponse.json(
      { success: false, error: "Failed to preview themes" },
      { status: 500 }
    );
  }
}
