/**
 * Vercel/Cloud Environment Detection
 * 
 * Helper functions to detect if the app is running in a serverless/cloud environment
 * where Python processes and file system access are not available.
 */

/**
 * Check if running in a cloud/serverless environment
 */
export function isCloudEnvironment(): boolean {
  return !!(
    process.env.VERCEL || 
    process.env.RAILWAY_ENVIRONMENT || 
    process.env.RENDER ||
    process.env.AWS_LAMBDA_FUNCTION_NAME
  );
}

/**
 * Get a user-friendly error message for cloud environment limitations
 */
export function getCloudErrorMessage(feature: string): string {
  return `This feature (${feature}) requires local file system access and is not available when running on Vercel. Please run the app locally (npm run dev) to use this feature.`;
}
