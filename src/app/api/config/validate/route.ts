import { NextResponse } from "next/server";

/**
 * POST /api/config/validate
 *
 * Validates API keys before saving them.
 * Tests each key by making a minimal API call.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { ANTHROPIC_API_KEY, OPENAI_API_KEY, SUPABASE_URL, SUPABASE_ANON_KEY } = body;

    const results: {
      anthropic: { valid: boolean; error?: string };
      openai: { valid: boolean; error?: string } | null;
      supabase: { valid: boolean; error?: string } | null;
    } = {
      anthropic: { valid: false },
      openai: null,
      supabase: null,
    };

    // Validate Anthropic API Key
    if (ANTHROPIC_API_KEY) {
      try {
        // Make a minimal API call to verify the key works
        const response = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-3-haiku-20240307", // Cheapest model for validation
            max_tokens: 1,
            messages: [{ role: "user", content: "Hi" }],
          }),
        });

        if (response.ok) {
          results.anthropic = { valid: true };
        } else {
          let errorData: { error?: { message?: string } } = {};
          try {
            errorData = await response.json();
          } catch {
            // Response is not JSON, use default error
          }
          if (response.status === 401) {
            results.anthropic = { valid: false, error: "Invalid API key" };
          } else if (response.status === 403) {
            results.anthropic = { valid: false, error: "API key lacks permissions" };
          } else if (response.status === 429) {
            // Rate limited but key is valid
            results.anthropic = { valid: true };
          } else {
            results.anthropic = {
              valid: false,
              error: errorData.error?.message || `API error: ${response.status}`,
            };
          }
        }
      } catch (error) {
        results.anthropic = {
          valid: false,
          error: error instanceof Error ? error.message : "Failed to connect to Anthropic",
        };
      }
    } else {
      results.anthropic = { valid: false, error: "API key is required" };
    }

    // Validate OpenAI API Key (optional - only validate if provided)
    if (OPENAI_API_KEY) {
      try {
        // Make a minimal API call to verify the key works
        const response = await fetch("https://api.openai.com/v1/models", {
          method: "GET",
          headers: {
            "Authorization": `Bearer ${OPENAI_API_KEY}`,
          },
        });

        if (response.ok) {
          results.openai = { valid: true };
        } else if (response.status === 401) {
          results.openai = { valid: false, error: "Invalid API key" };
        } else if (response.status === 429) {
          // Rate limited but key is valid
          results.openai = { valid: true };
        } else {
          const errorData = await response.json().catch(() => ({}));
          results.openai = {
            valid: false,
            error: errorData.error?.message || `API error: ${response.status}`,
          };
        }
      } catch (error) {
        results.openai = {
          valid: false,
          error: error instanceof Error ? error.message : "Failed to connect to OpenAI",
        };
      }
    }

    // Validate Supabase credentials (if provided)
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
      try {
        // Test the connection by checking if we can reach the API
        const testUrl = `${SUPABASE_URL}/rest/v1/`;
        const response = await fetch(testUrl, {
          method: "GET",
          headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          },
        });

        if (response.ok || response.status === 200) {
          results.supabase = { valid: true };
        } else if (response.status === 401) {
          results.supabase = { valid: false, error: "Invalid anon key" };
        } else if (response.status === 404) {
          results.supabase = { valid: false, error: "Invalid project URL" };
        } else {
          // Check if we get any response at all (connection works)
          const text = await response.text();
          if (text.includes("error")) {
            results.supabase = { valid: false, error: "Connection failed" };
          } else {
            // Got a response, likely valid
            results.supabase = { valid: true };
          }
        }
      } catch (error) {
        // Check for common URL errors
        const errorMsg = error instanceof Error ? error.message : "Connection failed";
        if (errorMsg.includes("fetch failed") || errorMsg.includes("ENOTFOUND")) {
          results.supabase = { valid: false, error: "Invalid URL - cannot connect" };
        } else {
          results.supabase = { valid: false, error: errorMsg };
        }
      }
    }

    // Determine overall validity
    // Anthropic is required; OpenAI and Supabase are optional (only fail if provided and invalid)
    const allValid = 
      results.anthropic.valid && 
      (results.openai === null || results.openai.valid) &&
      (results.supabase === null || results.supabase.valid);

    return NextResponse.json({
      success: true,
      valid: allValid,
      results,
    });
  } catch (error) {
    console.error("Error validating API keys:", error);
    return NextResponse.json(
      { success: false, error: "Validation failed" },
      { status: 500 }
    );
  }
}
