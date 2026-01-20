/**
 * Feature Flags
 * 
 * Controls visibility of features in the UI and API.
 * When disabled, features are hidden from UI and API routes return 404.
 * Features can still be accessed via direct URL navigation if flag is enabled.
 */

export const FEATURE_FLAGS = {
  /**
   * Knowledge Graph features
   * When false:
   * - KG links are hidden from main UI
   * - API routes return 404 (not found)
   * - Routes remain accessible if flag is enabled
   */
  KNOWLEDGE_GRAPH: true,
} as const;

/**
 * Check if a feature is enabled
 */
export function isFeatureEnabled(feature: keyof typeof FEATURE_FLAGS): boolean {
  return FEATURE_FLAGS[feature];
}

/**
 * Check if a feature is enabled (for API routes)
 * Returns 404 response if disabled
 */
export function requireFeature(feature: keyof typeof FEATURE_FLAGS): Response | null {
  if (!isFeatureEnabled(feature)) {
    return new Response(
      JSON.stringify({ error: "Feature not available" }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }
  return null;
}
