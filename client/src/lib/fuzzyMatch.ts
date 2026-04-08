/**
 * Scores property candidates against a query string and returns the best match.
 * Uses a tiered scoring system: exact > address > name+city > partial.
 * Returns undefined if no match scores above the confidence threshold.
 */
export function fuzzyMatchProperty(
  query: string,
  properties: Array<{ id: number; name: string; address?: string | null; city?: string | null; state?: string | null; unitCount?: number | null }>
): typeof properties[number] | undefined {
  if (!query || !properties?.length) return undefined;
  const q = query.toLowerCase().trim();
  if (!q) return undefined;

  let bestScore = 0;
  let bestMatch: typeof properties[number] | undefined;

  for (const p of properties) {
    const pn = p.name.toLowerCase();
    const addr = (p.address ?? "").toLowerCase();
    const city = (p.city ?? "").toLowerCase();
    const full = `${pn} ${addr} ${city}`.trim();
    let score = 0;

    // Exact name match
    if (pn === q) score = 100;
    // Exact address match
    else if (addr && addr === q) score = 95;
    // Full string matches query
    else if (full === q) score = 90;
    // Name starts with query or query starts with name (for longer names)
    else if (pn.length > 3 && (pn.startsWith(q) || q.startsWith(pn))) score = 70;
    // Address is contained in query (e.g. "3840 W Pershing" in "called about 3840 W Pershing")
    else if (addr && addr.length > 5 && q.includes(addr)) score = 80;
    else if (addr && addr.length > 5 && addr.includes(q)) score = 75;
    // Name + city both appear in query
    else if (pn.length > 3 && city && q.includes(pn) && q.includes(city)) score = 65;
    // Name appears in query (but only if name is specific enough — more than 4 chars)
    else if (pn.length > 4 && q.includes(pn)) score = 40;
    // Query appears in name (but only if query is specific enough)
    else if (q.length > 4 && pn.includes(q)) score = 35;
    // Query appears in full property string
    else if (q.length > 4 && full.includes(q)) score = 30;

    // Bonus for city match when query also mentions the city
    if (score > 0 && city && city.length > 2 && q.includes(city)) score += 10;

    if (score > bestScore) {
      bestScore = score;
      bestMatch = p;
    }
  }

  // Only return if we have a reasonable confidence match
  return bestScore >= 30 ? bestMatch : undefined;
}
