/**
 * Unexplored Territory → Dismiss Topic API
 * 
 * Purpose: Allow users to dismiss unexplored topics as "noise"
 * Dismissed topics won't appear in future Unexplored Territory scans
 */

import { NextRequest, NextResponse } from "next/server";
import { readFile, writeFile } from "fs/promises";
import path from "path";
import { existsSync } from "fs";

const DISMISSED_FILE = path.join(process.cwd(), "data", "dismissed_topics.json");

interface DismissedTopic {
  id: string;
  topic: string;
  dismissedAt: string;
  reason?: string;
}

interface DismissedTopicsData {
  version: 1;
  topics: DismissedTopic[];
}

async function loadDismissedTopics(): Promise<DismissedTopicsData> {
  try {
    if (existsSync(DISMISSED_FILE)) {
      const content = await readFile(DISMISSED_FILE, "utf-8");
      const parsed = JSON.parse(content);
      // Validate structure
      if (parsed && Array.isArray(parsed.topics)) {
        return parsed;
      }
      console.warn("Invalid dismissed topics file structure, resetting to empty");
      return { version: 1, topics: [] };
    }
  } catch (error) {
    console.error("Error loading dismissed topics:", error);
  }
  return { version: 1, topics: [] };
}

async function saveDismissedTopics(data: DismissedTopicsData): Promise<void> {
  await writeFile(DISMISSED_FILE, JSON.stringify(data, null, 2));
}

// POST: Dismiss a topic
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { areaId, topic, reason } = body;

    // Validation
    if (!topic || typeof topic !== "string" || topic.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Topic is required and must be a non-empty string" }, { status: 400 });
    }

    const data = await loadDismissedTopics();
    
    // Check if already dismissed
    const existing = data.topics.find(t => t.topic.toLowerCase() === topic.toLowerCase());
    if (existing) {
      return NextResponse.json({ 
        success: true, 
        message: "Topic already dismissed",
        topic: existing,
      });
    }

    // Add new dismissed topic
    const newDismissed: DismissedTopic = {
      id: areaId || `dismissed-${Date.now()}`,
      topic,
      dismissedAt: new Date().toISOString(),
      reason,
    };
    
    data.topics.push(newDismissed);
    await saveDismissedTopics(data);

    return NextResponse.json({ 
      success: true, 
      message: `Topic "${topic}" dismissed`,
      topic: newDismissed,
    });
  } catch (error) {
    console.error("Error dismissing topic:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}

// GET: List all dismissed topics
export async function GET() {
  try {
    const data = await loadDismissedTopics();
    return NextResponse.json({ 
      success: true, 
      topics: data.topics,
      count: data.topics.length,
    });
  } catch (error) {
    console.error("Error loading dismissed topics:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}

// DELETE: Restore a dismissed topic
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const topic = searchParams.get("topic");

    if (!topic || topic.trim().length === 0) {
      return NextResponse.json({ success: false, error: "Topic is required and must be a non-empty string" }, { status: 400 });
    }

    const data = await loadDismissedTopics();
    const index = data.topics.findIndex(t => t.topic.toLowerCase() === topic.toLowerCase());
    
    if (index === -1) {
      return NextResponse.json({ 
        success: false, 
        error: "Topic not found in dismissed list" 
      }, { status: 404 });
    }

    const removed = data.topics.splice(index, 1)[0];
    await saveDismissedTopics(data);

    return NextResponse.json({ 
      success: true, 
      message: `Topic "${topic}" restored`,
      topic: removed,
    });
  } catch (error) {
    console.error("Error restoring topic:", error);
    return NextResponse.json({ 
      success: false, 
      error: error instanceof Error ? error.message : "Unknown error" 
    }, { status: 500 });
  }
}
