/**
 * Shared utility functions
 */

/**
 * Copy text to clipboard with fallback for older browsers
 */
export async function copyToClipboard(content: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(content);
  } catch {
    // Fallback for older browsers
    // NOTE: document.execCommand is deprecated but kept as fallback for browsers
    // that don't support the Clipboard API (e.g., older Safari versions)
    try {
      const textArea = document.createElement("textarea");
      textArea.value = content;
      document.body.appendChild(textArea);
      textArea.select();
      // NOTE: document.execCommand is deprecated but kept as fallback for browsers
      // that don't support the Clipboard API (e.g., older Safari versions)
      // TypeScript doesn't flag this as an error, but it's deprecated in the DOM spec
      document.execCommand("copy");
      document.body.removeChild(textArea);
    } catch (fallbackError) {
      console.error("Failed to copy to clipboard:", fallbackError);
      throw new Error("Unable to copy to clipboard");
    }
  }
}

/**
 * Download content as a file
 */
export function downloadFile(content: string, filename: string): void {
  const blob = new Blob([content], { type: "text/markdown" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

