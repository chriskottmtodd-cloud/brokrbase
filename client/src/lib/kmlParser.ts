import JSZip from "jszip";

export interface KmlPlacemark {
  name: string;
  description: string;
  latitude: number;
  longitude: number;
}

function stripHtml(html: string): string {
  const div = document.createElement("div");
  div.innerHTML = html;
  return div.textContent?.trim() ?? "";
}

function extractDescription(pm: Element): string {
  // Try <description> first (may contain HTML/CDATA)
  const descEl = pm.querySelector("description");
  if (descEl) {
    const raw = descEl.textContent?.trim() ?? "";
    if (raw) return stripHtml(raw);
  }

  // Google My Maps often stores data in <ExtendedData> / <Data> elements
  const dataEls = pm.querySelectorAll("ExtendedData Data");
  if (dataEls.length > 0) {
    const parts: string[] = [];
    dataEls.forEach((d) => {
      const name = d.getAttribute("name") ?? "";
      const value = d.querySelector("value")?.textContent?.trim() ?? "";
      if (value) parts.push(`${name}: ${value}`);
    });
    if (parts.length) return parts.join("\n");
  }

  // Also try SimpleData (another Google My Maps format)
  const simpleDataEls = pm.querySelectorAll("ExtendedData SchemaData SimpleData");
  if (simpleDataEls.length > 0) {
    const parts: string[] = [];
    simpleDataEls.forEach((d) => {
      const name = d.getAttribute("name") ?? "";
      const value = d.textContent?.trim() ?? "";
      if (value) parts.push(`${name}: ${value}`);
    });
    if (parts.length) return parts.join("\n");
  }

  return "";
}

function parseKmlString(xml: string): KmlPlacemark[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, "text/xml");
  const placemarks = doc.querySelectorAll("Placemark");
  const results: KmlPlacemark[] = [];

  placemarks.forEach((pm) => {
    const name = pm.querySelector("name")?.textContent?.trim() ?? "";
    const description = extractDescription(pm);
    const coords =
      pm.querySelector("Point coordinates")?.textContent?.trim() ??
      pm.querySelector("coordinates")?.textContent?.trim();

    if (!coords) return;

    // KML coordinates are lng,lat,alt
    const parts = coords.split(",").map((s) => parseFloat(s.trim()));
    if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return;

    results.push({
      name: name || "Unnamed Pin",
      description,
      longitude: parts[0],
      latitude: parts[1],
    });
  });

  return results;
}

export async function parseKmlFile(file: File): Promise<KmlPlacemark[]> {
  const ext = file.name.toLowerCase().split(".").pop();

  if (ext === "kmz") {
    const zip = await JSZip.loadAsync(file);
    const kmlEntry =
      zip.file("doc.kml") ??
      zip.file(/\.kml$/i)[0];
    if (!kmlEntry) throw new Error("No KML file found inside KMZ archive");
    const xml = await kmlEntry.async("text");
    return parseKmlString(xml);
  }

  const xml = await file.text();
  return parseKmlString(xml);
}
