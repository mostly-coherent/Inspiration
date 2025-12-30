/**
 * Version detection and feature flags for v0/v1 compatibility
 */

import { AppConfig } from "@/app/api/config/route";

export const APP_VERSION = "1.0.0";

/**
 * Check if v1 features are enabled
 */
export function isV1Enabled(config: AppConfig | null): boolean {
  if (!config) return false;
  
  // v1 enabled if:
  // 1. Explicit feature flag is set
  // 2. Config version is 2 or higher
  return config.features?.v1Enabled === true || config.version >= 2;
}

/**
 * Check if we should use v1 API (theme/mode) vs v0 API (tool)
 */
export function useV1API(config: AppConfig | null): boolean {
  return isV1Enabled(config);
}

/**
 * Get current version string
 */
export function getVersionString(): string {
  return APP_VERSION;
}

