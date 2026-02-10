/**
 * YouTube timestamp utilities.
 *
 * Converts HH:MM:SS timestamps (from Lenny podcast transcripts) into
 * YouTube deep-link URLs with `?t=` or `&t=` query parameters.
 */

/**
 * Convert "HH:MM:SS" or "MM:SS" to total seconds.
 * Returns null if the format is invalid or timestamp is "00:00:00".
 */
export function timestampToSeconds(timestamp: string | undefined | null): number | null {
  if (!timestamp) return null;

  const parts = timestamp.split(":").map(Number);
  if (parts.some(isNaN)) return null;

  let seconds: number;
  if (parts.length === 3) {
    seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    seconds = parts[0] * 60 + parts[1];
  } else {
    return null;
  }

  // Don't append t=0 — it's the start of the video
  return seconds > 0 ? seconds : null;
}

/**
 * Build a YouTube URL with a timestamp deep-link.
 *
 * Given `https://youtube.com/watch?v=abc` and `"00:15:30"`,
 * returns `https://youtube.com/watch?v=abc&t=930`.
 */
export function youtubeUrlWithTimestamp(
  youtubeUrl: string | undefined | null,
  timestamp: string | undefined | null,
): string | null {
  if (!youtubeUrl) return null;

  const seconds = timestampToSeconds(timestamp);
  if (seconds === null) return youtubeUrl;

  // Append t= parameter (use & if URL already has query params, else ?)
  const separator = youtubeUrl.includes("?") ? "&" : "?";
  return `${youtubeUrl}${separator}t=${seconds}`;
}
