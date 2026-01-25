import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

// Note: Abstract theme concepts were considered for broad themes (lower threshold = more abstract)
// but are not currently used. Keeping as reference for future enhancement.
// const ABSTRACT_THEME_CONCEPTS = [
//   "Technology & Innovation",
//   "Communication & Collaboration", 
//   "Problem Solving & Strategy",
//   "Growth & Learning",
//   "Design & User Experience",
//   "Data & Analytics",
//   "Systems & Architecture",
//   "Process & Workflow",
//   "Leadership & Management",
//   "Creativity & Ideas",
// ];

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

// Theme explorer config (defaults - no file system access on Vercel)
function getThemeExplorerConfig() {
  return { 
    maxThemesToDisplay: 20,
  };
}

export const maxDuration = 60; // 60 seconds for theme computation (longer for Vector DB queries)

// Helper: Average embeddings from multiple messages
function averageEmbeddings(embeddings: number[][]): number[] | undefined {
  if (!embeddings || embeddings.length === 0) return undefined;
  
  const dim = embeddings[0].length;
  if (!dim) return undefined;
  
  const avg = new Array(dim).fill(0);
  for (const emb of embeddings) {
    if (emb.length !== dim) continue;
    for (let i = 0; i < dim; i++) {
      avg[i] += emb[i];
    }
  }
  
  for (let i = 0; i < dim; i++) {
    avg[i] /= embeddings.length;
  }
  
  return avg;
}

// Helper: Generate title from conversation messages
function generateConversationTitle(messages: any[]): string {
  if (!messages || messages.length === 0) return "Untitled Conversation";
  
  // Try to extract a meaningful title from first user message or first assistant message
  const firstUserMsg = messages.find((m: any) => m.message_type === "user");
  const firstAssistantMsg = messages.find((m: any) => m.message_type === "assistant");
  
  const text = firstUserMsg?.text || firstAssistantMsg?.text || "";
  if (!text) return "Untitled Conversation";
  
  // Extract first sentence or first 100 chars
  const firstLine = text.split("\n")[0].trim();
  const title = firstLine.length > 100 ? firstLine.slice(0, 97) + "..." : firstLine;
  return title || "Untitled Conversation";
}

// Helper: Generate description from conversation messages
function generateConversationDescription(messages: any[]): string {
  if (!messages || messages.length === 0) return "";
  
  // Combine first few messages
  const previewMessages = messages.slice(0, 3);
  const preview = previewMessages
    .map((m: any) => {
      const text = m.text || "";
      return text.length > 200 ? text.slice(0, 197) + "..." : text;
    })
    .join("\n\n");
  
  return preview.length > 500 ? preview.slice(0, 497) + "..." : preview;
}

// Helper: Fetch conversations from Vector DB and convert to virtual items
async function getConversationsFromVectorDb(
  supabase: ReturnType<typeof createClient> | any, // Supabase client type
  daysBack: number = 90
): Promise<Item[]> {
  try {
    // Calculate timestamp range (milliseconds)
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - daysBack);
    
    const startTs = startDate.getTime(); // milliseconds
    const endTs = endDate.getTime(); // milliseconds
    
    // Fetch messages grouped by conversation
    // We'll group by workspace:chat_id:chat_type
    // Limit to reasonable number to avoid memory issues (sample recent conversations)
    const { data: messages, error } = await supabase
      .from("cursor_messages")
      .select("workspace, chat_id, chat_type, message_type, text, timestamp, embedding")
      .gte("timestamp", startTs)
      .lte("timestamp", endTs)
      .order("timestamp", { ascending: false })
      .limit(10000); // Limit to prevent memory issues
    
    if (error) {
      console.error("Error fetching messages from Vector DB:", error);
      return [];
    }
    
    if (!messages || messages.length === 0) {
      return [];
    }
    
    // Group messages by conversation
    const conversationsMap = new Map<string, {
      workspace: string;
      chat_id: string;
      chat_type: string;
      messages: any[];
      embeddings: number[][];
    }>();
    
    // Type assertion for Supabase query result
    type MessageRow = {
      workspace: string;
      chat_id: string;
      chat_type: string;
      message_type: string;
      text: string;
      timestamp: number;
      embedding?: number[] | string | null;
    };
    
    for (const msg of messages as MessageRow[]) {
      const convKey = `${msg.workspace}:${msg.chat_id}:${msg.chat_type}`;
      
      if (!conversationsMap.has(convKey)) {
        conversationsMap.set(convKey, {
          workspace: msg.workspace,
          chat_id: msg.chat_id,
          chat_type: msg.chat_type,
          messages: [],
          embeddings: [],
        });
      }
      
      const conv = conversationsMap.get(convKey)!;
      conv.messages.push({
        message_type: msg.message_type,
        text: msg.text,
        timestamp: msg.timestamp,
      });
      
      // Collect embeddings
      if (msg.embedding) {
        let embedding: number[];
        if (Array.isArray(msg.embedding)) {
          embedding = msg.embedding;
        } else if (typeof msg.embedding === 'string') {
          try {
            embedding = JSON.parse(msg.embedding);
          } catch {
            continue;
          }
        } else {
          continue;
        }
        
        if (embedding.length > 0) {
          conv.embeddings.push(embedding);
        }
      }
    }
    
    // Convert conversations to virtual items
    const items: Item[] = [];
    for (const [convKey, conv] of conversationsMap.entries()) {
      // Skip conversations with no embeddings
      if (conv.embeddings.length === 0) continue;
      
      // Average embeddings for conversation-level representation
      const avgEmbedding = averageEmbeddings(conv.embeddings);
      if (!avgEmbedding) continue;
      
      const title = generateConversationTitle(conv.messages);
      const description = generateConversationDescription(conv.messages);
      
      items.push({
        id: `conv-${convKey}`,
        title,
        description,
        itemType: "use_case", // Conversations are treated as use cases
        embedding: avgEmbedding,
        categoryId: null,
      });
    }
    
    return items;
  } catch (error) {
    console.error("Error converting Vector DB conversations to items:", error);
    return [];
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const threshold = parseFloat(searchParams.get("threshold") || "0.75");
    const itemType = searchParams.get("itemType") || null;
    const useVectorDb = searchParams.get("useVectorDb") === "true"; // Force Vector DB mode (ignores library items)

    // Validate threshold
    if (isNaN(threshold) || threshold < 0.3 || threshold > 0.99) {
      return NextResponse.json(
        { success: false, error: "Threshold must be between 0.3 and 0.99" },
        { status: 400 }
      );
    }

    // Load config for display settings
    const explorerConfig = getThemeExplorerConfig();

    // Initialize Supabase client
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      return NextResponse.json({
        success: false,
        error: "Supabase not configured",
      }, { status: 500 });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    let items: Item[] = [];
    let sourceType: "library" | "vectordb" | "combined" = "library";

    // Try to fetch library items first (unless forced to use Vector DB)
    let libraryItems: Item[] = [];
    if (!useVectorDb) {
      let query = supabase
        .from("library_items")
        .select("id, title, description, item_type, category_id, embedding");
      
      // Filter by item type if specified
      if (itemType) {
        query = query.eq("item_type", itemType);
      }
      
      const { data: itemsData, error: itemsError } = await query;
      
      if (itemsError) {
        console.error("Error fetching items from Supabase:", itemsError);
        // Don't return error immediately - try Vector DB as fallback
      } else {
        // Transform Supabase data to Item format
        libraryItems = (itemsData || []).map((item: any) => {
          // Parse embedding from JSONB (stored as array)
          let embedding: number[] | undefined;
          if (item.embedding) {
            if (Array.isArray(item.embedding)) {
              embedding = item.embedding;
            } else if (typeof item.embedding === 'string') {
              try {
                embedding = JSON.parse(item.embedding);
              } catch {
                embedding = undefined;
              }
            }
          }
          
          return {
            id: item.id,
            title: item.title,
            description: item.description,
            itemType: item.item_type,
            embedding,
            categoryId: item.category_id,
          };
        });
      }
    }
    
    // Fetch Vector DB conversations
    // Always fetch Vector DB: either as fallback (no library items), or to combine (>= 1 library items)
    let vectorDbItems: Item[] = [];
    console.log(useVectorDb
      ? "Forced Vector DB mode, fetching conversations..."
      : libraryItems.length === 0
        ? "No library items found, fetching from Vector DB..."
        : `Auto-combining ${libraryItems.length} library items with Vector DB conversations...`);
    
    vectorDbItems = await getConversationsFromVectorDb(supabase, 3650); // ~10 years - effectively all available data
    
    if (vectorDbItems.length > 0) {
      console.log(`Fetched ${vectorDbItems.length} conversations from Vector DB`);
    } else if (useVectorDb) {
      // User explicitly requested Vector DB but got no results
      return NextResponse.json({
        success: false,
        error: "No conversations found in Vector DB. Please index your chat history first.",
      }, { status: 404 });
    }
    
    // Combine or select items based on strategy
    if (useVectorDb) {
      // Forced Vector DB only (ignore library items)
      items = vectorDbItems;
      sourceType = "vectordb";
    } else if (libraryItems.length === 0) {
      // No library items, use Vector DB only
      items = vectorDbItems;
      sourceType = "vectordb";
    } else {
      // Has library items (>= 1), combine with Vector DB
      items = [...libraryItems, ...vectorDbItems];
      sourceType = "combined";
      console.log(`Combined ${libraryItems.length} library items + ${vectorDbItems.length} Vector DB conversations = ${items.length} total items`);
    }

    // If still no items, return empty result
    if (items.length === 0) {
      return NextResponse.json({
        success: true,
        threshold,
        totalItems: 0,
        themeCount: 0,
        themes: [],
        oneOffItems: [],
        stats: {
          avgItemsPerTheme: 0,
          singleItemThemes: 0,
        },
        sourceType: "none",
        message: "No library items or Vector DB conversations found. Generate library items or index your chat history.",
      });
    }
    
    // Check if any items have embeddings
    const itemsWithEmbeddings = items.filter(i => i.embedding && i.embedding.length > 0);
    
    const themes: ThemePreview[] = [];
    
    if (itemsWithEmbeddings.length > 0) {
      // Use embedding-based grouping
      const groupedThemes = groupItemsByThreshold(items, threshold);
      
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
    } else {
      // Fallback: group by category_id when no embeddings available
      const categoryMap = new Map<string, Item[]>();
      
      for (const item of items) {
        const catId = item.categoryId || "uncategorized";
        if (!categoryMap.has(catId)) {
          categoryMap.set(catId, []);
        }
        categoryMap.get(catId)!.push(item);
      }
      
      for (const [catId, catItems] of categoryMap.entries()) {
        themes.push({
          id: catId,
          name: generateThemeName(catItems, threshold),
          itemCount: catItems.length,
          items: catItems.map((i) => ({ 
            id: i.id, 
            title: i.title,
            description: i.description,
          })),
        });
      }
    }

    // Sort by item count (largest themes first)
    themes.sort((a, b) => b.itemCount - a.itemCount);
    
    // Extract single-item themes (one-off items) for separate display
    const singleItemThemes = themes.filter((t) => t.itemCount === 1);

    return NextResponse.json({
      success: true,
      threshold,
      totalItems: items.length,
      themeCount: themes.length,
      themes: themes.slice(0, explorerConfig.maxThemesToDisplay),
      oneOffItems: singleItemThemes.slice(0, 20).map((t) => ({
        id: t.id,
        title: t.items?.[0]?.title || t.name,
        description: t.items?.[0]?.description,
      })),
      stats: {
        avgItemsPerTheme: themes.length > 0 
          ? Math.round((items.length / themes.length) * 10) / 10 
          : 0,
        singleItemThemes: singleItemThemes.length,
      },
      sourceType, // NEW: Indicate data source: "library", "vectordb", or "combined"
    });
  } catch (error) {
    console.error("Error previewing themes:", error);
    return NextResponse.json(
      { success: false, error: "Failed to preview themes" },
      { status: 500 }
    );
  }
}
