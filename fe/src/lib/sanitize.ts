/**
 * OZIK-SENTINEL :: Military-Grade Text Sanitizer
 * Strips raw Markdown tokens, AI artifacts, and broken character encodings.
 */

export function sanitizeMilitaryText(rawText: string): string {
  if (!rawText) return "";

  return rawText
    // Remove Markdown headers (#, ##, ###, ####)
    .replace(/^#{1,6}\s+/gm, "")
    // Remove bold and italic markers (**, *, __, _)
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    // Remove strikethrough (~~text~~)
    .replace(/~~(.*?)~~/g, "$1")
    // Remove inline backticks and code blocks
    .replace(/`([^`]+)`/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    // Remove raw bullet dashes/asterisks at line starts
    .replace(/^[\*\-\+]\s+/gm, "")
    // Fix broken encoding characters (such as "â€"", "â€¢", etc.)
    .replace(/â€"/g, " - ")
    .replace(/â€¢/g, "• ")
    .replace(/â€™/g, "'")
    .replace(/â€œ/g, '"')
    .replace(/â€/g, '"')
    // Remove standalone AI markdown dashes
    .replace(/\s+--\s+/g, " - ")
    // Normalize consecutive newlines and trim
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default sanitizeMilitaryText;
