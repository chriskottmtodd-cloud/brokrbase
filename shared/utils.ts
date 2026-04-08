/**
 * Shared utility functions used by both client and server.
 */

/** Strip markdown formatting from text (for plain-text email bodies). */
export function stripMarkdown(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/__([^_]+)__/g, "$1")
    .replace(/_([^_]+)_/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[\*\-]\s+/gm, "")
    .replace(/^\d+\.\s+/gm, "")
    .replace(/\*/g, "")
    .trim();
}

/** Advance a date to the nearest weekday (Mon-Fri). */
export function nextWeekday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  if (day === 0) d.setDate(d.getDate() + 1); // Sun -> Mon
  if (day === 6) d.setDate(d.getDate() + 2); // Sat -> Mon
  return d;
}
