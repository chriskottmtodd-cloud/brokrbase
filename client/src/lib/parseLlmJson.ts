/**
 * Extract and parse JSON from an LLM response that may contain
 * markdown fences, commentary text, or other wrapping.
 *
 * Tries multiple strategies:
 * 1. Direct JSON.parse
 * 2. Strip markdown fences and parse
 * 3. Find first { or [ and last } or ] and parse that substring
 * 4. Throw with the original text for debugging
 */
export function parseLlmJson<T = unknown>(raw: string): T {
  const trimmed = raw.trim();

  // Strategy 1: Direct parse
  try {
    return JSON.parse(trimmed) as T;
  } catch {}

  // Strategy 2: Strip markdown fences
  const stripped = trimmed
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  try {
    return JSON.parse(stripped) as T;
  } catch {}

  // Strategy 3: Find the JSON substring (first {/[ to last }/])
  const objStart = stripped.indexOf("{");
  const arrStart = stripped.indexOf("[");
  let start = -1;
  let end = -1;

  if (objStart >= 0 && (arrStart < 0 || objStart < arrStart)) {
    start = objStart;
    end = stripped.lastIndexOf("}");
  } else if (arrStart >= 0) {
    start = arrStart;
    end = stripped.lastIndexOf("]");
  }

  if (start >= 0 && end > start) {
    try {
      return JSON.parse(stripped.substring(start, end + 1)) as T;
    } catch {}
  }

  // All strategies failed
  throw new Error(
    `Failed to parse LLM response as JSON. Raw response (first 500 chars): ${trimmed.slice(0, 500)}`
  );
}
