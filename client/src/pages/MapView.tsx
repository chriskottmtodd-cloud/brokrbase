import { trpc } from "@/lib/trpc";
import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import { MapView } from "@/components/Map";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { Label } from "@/components/ui/label";
import { Building2, MapPin, Home, SlidersHorizontal, X, Layers, ChevronRight, Plus, LocateFixed, Search, Phone, Mail, Eye } from "lucide-react";
import { AddPropertyModal } from "@/pages/Properties";
import { toast } from "sonner";

// ─── Status colors ────────────────────────────────────────────────────────────
const statusColors: Record<string, string> = {
  researching: "#64748b",
  prospecting: "#60a5fa",
  seller: "#fbbf24",
  listed: "#c084fc",
  recently_sold: "#4ade80",
  under_contract: "#f59e0b",
};

const statusLabels: Record<string, string> = {
  researching: "Researching",
  prospecting: "Prospecting",
  seller: "Seller",
  listed: "Listed",
  recently_sold: "Recently Sold",
  under_contract: "Under Contract",
};

// ─── Asset type config ────────────────────────────────────────────────────────
const ASSET_TYPES = [
  { value: "mhc",              label: "MHC",        color: "#0d9488" },
  { value: "apartment",        label: "Apartment",  color: "#6366f1" },
  { value: "affordable_housing", label: "Affordable", color: "#16a34a" },
  { value: "self_storage",     label: "Storage",    color: "#d97706" },
  { value: "other",            label: "Other",      color: "#64748b" },
];

function createPinElement(propertyType: string, _status: string, listingStage?: string | null): HTMLElement {
  const typeConfig = ASSET_TYPES.find(t => t.value === propertyType) ?? ASSET_TYPES[ASSET_TYPES.length - 1];
  const color = typeConfig.color;
  const isUC = listingStage === "under_contract";

  const dot = document.createElement("div");
  dot.style.cssText = `
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: ${color};
    border: 1.5px solid rgba(255,255,255,0.5);
    cursor: pointer;
    ${isUC ? `box-shadow: 0 0 0 2.5px #f59e0b;` : ""}
  `;

  return dot;
}

interface MapProperty {
  id: number;
  name: string;
  propertyType: string;
  status: string;
  unitCount: number | null;
  vintageYear: number | null;
  city: string | null;
  county: string | null;
  state: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  ownerId: number | null;
  ownerName: string | null;
  estimatedValue: number | null;
  askingPrice: number | null;
  ownerCompany?: string | null;
  ownerEmail?: string | null;
  ownerPhone?: string | null;
  ownerFirstName?: string | null;
  ownerLastName?: string | null;
  listingStage?: string | null;
  researchStatus?: string | null;
}

interface ContextMenu {
  x: number;
  y: number;
  lat: number;
  lng: number;
}

interface AddPropertyPrefill {
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
}

export default function MapViewPage() {
  const [, setLocation] = useLocation();
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Map<number, google.maps.marker.AdvancedMarkerElement>>(new Map());
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const activeMarkerRef = useRef<{ el: HTMLElement; propId: number } | null>(null);
  const searchBoxRef = useRef<google.maps.places.SearchBox | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);

  const [selectedProperty, setSelectedProperty] = useState<MapProperty | null>(null);
  // Auto-open filter panel if filters were passed in via URL params
  const [showFilters, setShowFilters] = useState(() => {
    const p = new URLSearchParams(window.location.search);
    return !!(p.get("status") || p.get("type") || p.get("city") || p.get("county") ||
              p.get("minUnits") || p.get("maxUnits") || p.get("minYear") || p.get("maxYear"));
  });
  const [satelliteMode, setSatelliteMode] = useState(false);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<AddPropertyPrefill | undefined>(undefined);
  const [geocoding, setGeocoding] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [searchQuery, setSearchQuery] = useState(() => new URLSearchParams(window.location.search).get("q") ?? "");
  const [searchResult, setSearchResult] = useState<{ found: boolean; property?: MapProperty } | null>(null);

  // Read URL params — supports ?highlight=X (auto-open popup), ?zoom=N, and filter params from Properties list
  const _urlParams = new URLSearchParams(window.location.search);
  const highlightId = parseInt(_urlParams.get("highlight") ?? "0") || null;
  const highlightZoom = parseInt(_urlParams.get("zoom") ?? "0") || null;

  const utils = trpc.useUtils();
  const geocodeMissing = trpc.properties.geocodeMissing.useMutation({
    onSuccess: (res) => {
      toast.success(`Geocoded ${res.geocoded} of ${res.total} properties`);
      utils.properties.forMap.invalidate();
    },
    onError: () => toast.error("Geocoding failed — please try again"),
  });

  // Multi-select asset type filter — pre-populate from ?type= URL param
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(() => {
    const t = _urlParams.get("type");
    return t && t !== "all" ? new Set([t]) : new Set();
  });
  const [filters, setFilters] = useState(() => ({
    status:   _urlParams.get("status") ?? "all",
    minUnits: parseInt(_urlParams.get("minUnits") ?? "0")   || 0,
    maxUnits: parseInt(_urlParams.get("maxUnits") ?? "500") || 500,
    minYear:  parseInt(_urlParams.get("minYear")  ?? "1960") || 1960,
    maxYear:  parseInt(_urlParams.get("maxYear")  ?? "2026") || 2026,
  }));
  // If filters were pre-loaded from URL, open the filter panel automatically
  const _hasUrlFilters = !!(highlightId ||
    _urlParams.get("status") || _urlParams.get("type") || _urlParams.get("city") ||
    _urlParams.get("county") || _urlParams.get("minUnits") || _urlParams.get("maxUnits") ||
    _urlParams.get("minYear") || _urlParams.get("maxYear") || _urlParams.get("q"));
  // Also seed the map search box if ?q= was passed
  const _urlQ = _urlParams.get("q") ?? "";

  const { data: properties } = trpc.properties.forMap.useQuery();

  // Filter properties
  const filtered = (properties ?? []).filter((p) => {
    if (selectedTypes.size > 0 && !selectedTypes.has(p.propertyType)) return false;
    if (filters.status !== "all" && p.status !== filters.status) return false;
    if (filters.minUnits > 0 && (p.unitCount ?? 0) < filters.minUnits) return false;
    if (filters.maxUnits < 500 && (p.unitCount ?? 999) > filters.maxUnits) return false;
    if (filters.minYear > 1960 && (p.vintageYear ?? 0) < filters.minYear) return false;
    if (filters.maxYear < 2026 && (p.vintageYear ?? 9999) > filters.maxYear) return false;
    return true;
  });

  // Toggle an asset type in/out of the multi-select set
  const toggleType = (type: string) => {
    setSelectedTypes(prev => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  // Auto-open highlighted property popup once properties + map are ready
  useEffect(() => {
    if (!highlightId || !properties || !mapReady) return;
    const prop = properties.find(p => p.id === highlightId);
    if (!prop) return;
    setSelectedProperty(prop as MapProperty);
    if (prop.latitude && prop.longitude && mapRef.current) {
      // Zoom to neighborhood level (14) when coming from a property detail page,
      // or use whatever zoom was explicitly passed in the URL.
      const targetZoom = highlightZoom ?? 14;
      mapRef.current.setZoom(targetZoom);
      mapRef.current.panTo({ lat: prop.latitude, lng: prop.longitude });
    }
    // Clean up the URL params without triggering a navigation
    const url = new URL(window.location.href);
    url.searchParams.delete("highlight");
    url.searchParams.delete("zoom");
    window.history.replaceState({}, "", url.pathname + (url.search !== "?" ? url.search : ""));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightId, properties, mapReady]);

  // Place markers via MarkerClusterer whenever filtered properties or map changes
  useEffect(() => {
    if (!mapRef.current || !window.google) return;

    // Clear old clusterer and markers
    if (clustererRef.current) {
      clustererRef.current.clearMarkers();
      clustererRef.current.setMap(null);
      clustererRef.current = null;
    }
    markersRef.current.forEach((m) => { m.map = null; });
    markersRef.current = new Map();

    const newMarkerMap = new Map<number, google.maps.marker.AdvancedMarkerElement>();
    const newMarkersArr: google.maps.marker.AdvancedMarkerElement[] = [];

    filtered.forEach((prop) => {
      if (!prop.latitude || !prop.longitude) return;

      const pinEl = createPinElement(prop.propertyType, prop.status, prop.listingStage);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat: prop.latitude, lng: prop.longitude },
        title: prop.name,
        content: pinEl,
      });

      marker.addListener("click", () => {
        // Restore previous active pin to normal style
        if (activeMarkerRef.current) {
          const prev = activeMarkerRef.current.el;
          prev.style.transform = "";
          prev.style.zIndex = "";
          prev.style.boxShadow = "";
        }
        // Highlight the newly clicked pin
        const el = pinEl;
        el.style.transform = "scale(2.2)";
        el.style.zIndex = "999";
        el.style.boxShadow = "0 0 0 3px white, 0 0 8px rgba(255,255,255,0.6)";
        activeMarkerRef.current = { el, propId: prop.id };

        setSelectedProperty(prop as MapProperty);
        setContextMenu(null);
        setSearchResult(null);
        // Pan slightly above center so the card (bottom-right) doesn't cover the pin
        const map = mapRef.current;
        if (map && prop.latitude && prop.longitude) {
          const zoom = map.getZoom() ?? 12;
          const latOffset = 80 / (Math.pow(2, zoom) * 0.5);
          map.panTo({ lat: prop.latitude - latOffset * 0.3, lng: prop.longitude });
        }
      });

      newMarkerMap.set(prop.id, marker);
      newMarkersArr.push(marker);
    });

    markersRef.current = newMarkerMap;
    activeMarkerRef.current = null;

    // Create clusterer — clusters appear below zoom 11, individual pins above
    clustererRef.current = new MarkerClusterer({
      map: mapRef.current,
      markers: newMarkersArr,
      algorithmOptions: { maxZoom: 10 },
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered.length, mapReady, properties, selectedTypes, filters]);

  // Toggle satellite
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.setMapTypeId(satelliteMode ? "satellite" : "roadmap");
  }, [satelliteMode]);

  // Close context menu on outside click
  useEffect(() => {
    const handler = () => setContextMenu(null);
    window.addEventListener("click", handler);
    return () => window.removeEventListener("click", handler);
  }, []);

  const MAP_POS_KEY = "re-crm-map-pos";

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMapReady(true);

    try {
      const saved = sessionStorage.getItem(MAP_POS_KEY);
      if (saved) {
        const { lat, lng, zoom } = JSON.parse(saved);
        map.setCenter({ lat, lng });
        map.setZoom(zoom);
      } else {
        map.setCenter({ lat: 43.6150, lng: -116.2023 });
        map.setZoom(7);
      }
    } catch {
      map.setCenter({ lat: 43.6150, lng: -116.2023 });
      map.setZoom(7);
    }

    map.addListener("idle", () => {
      try {
        const center = map.getCenter();
        const zoom = map.getZoom();
        if (center && zoom !== undefined) {
          sessionStorage.setItem(MAP_POS_KEY, JSON.stringify({ lat: center.lat(), lng: center.lng(), zoom }));
        }
      } catch { /* ignore */ }
    });

    map.addListener("rightclick", (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;
      const lat = e.latLng.lat();
      const lng = e.latLng.lng();
      const container = (map as any).getDiv() as HTMLElement;
      const rect = container.getBoundingClientRect();
      const scale = Math.pow(2, map.getZoom()!);
      const proj = map.getProjection();
      if (!proj) return;
      const worldPoint = proj.fromLatLngToPoint(e.latLng);
      const mapCenter = proj.fromLatLngToPoint(map.getCenter()!);
      const pixelX = (worldPoint!.x - mapCenter!.x) * scale + rect.width / 2;
      const pixelY = (worldPoint!.y - mapCenter!.y) * scale + rect.height / 2;
      setContextMenu({ x: rect.left + pixelX, y: rect.top + pixelY, lat, lng });
    });

    map.addListener("click", () => setContextMenu(null));

    // Wire up address search box
    if (searchInputRef.current) {
      const searchBox = new google.maps.places.SearchBox(searchInputRef.current);
      searchBoxRef.current = searchBox;
      searchBox.addListener("places_changed", () => {
        const places = searchBox.getPlaces();
        if (!places || places.length === 0) return;
        const place = places[0];
        if (!place.geometry?.location) return;
        const lat = place.geometry.location.lat();
        const lng = place.geometry.location.lng();
        map.panTo({ lat, lng });
        map.setZoom(15);
        // Check if any property matches this location
        handleAddressSearch(lat, lng, place.formatted_address ?? "");
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Address search: check if a property is near the searched location
  const handleAddressSearch = useCallback((lat: number, lng: number, address: string) => {
    const allProps = properties ?? [];
    // Find closest property within ~100m
    const THRESHOLD = 0.001; // ~100m in degrees
    const nearby = allProps.find(p => {
      if (!p.latitude || !p.longitude) return false;
      return Math.abs(p.latitude - lat) < THRESHOLD && Math.abs(p.longitude - lng) < THRESHOLD;
    });

    // Also try matching by address string
    const addressMatch = !nearby && allProps.find(p => {
      if (!p.address) return false;
      const pAddr = `${p.address} ${p.city ?? ""}`.toLowerCase();
      const searchAddr = address.toLowerCase();
      // Check if the street number and name match
      return pAddr.includes(searchAddr.split(",")[0].toLowerCase()) ||
             searchAddr.includes(pAddr.split(",")[0].toLowerCase());
    });

    const found = nearby ?? addressMatch ?? null;

    // Drop a search marker
    if (searchMarkerRef.current) {
      searchMarkerRef.current.map = null;
    }
    if (!found) {
      const markerEl = document.createElement("div");
      markerEl.innerHTML = `
        <div style="
          background: #ef4444;
          border: 3px solid white;
          border-radius: 50%;
          width: 20px; height: 20px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5);
          animation: pulse 1.5s infinite;
        "></div>
      `;
      const searchMarker = new google.maps.marker.AdvancedMarkerElement({
        map: mapRef.current!,
        position: { lat, lng },
        title: address,
        content: markerEl,
      });
      searchMarkerRef.current = searchMarker;
    }

    if (found) {
      setSelectedProperty(found as MapProperty);
      setSearchResult({ found: true, property: found as MapProperty });
      toast.success(`Found in system: ${found.name}`);
    } else {
      setSearchResult({ found: false });
      toast("Address not in system — right-click map to add it", { icon: "📍" });
    }
  }, [properties]);

  const handleManualSearch = () => {
    if (!searchQuery.trim() || !mapRef.current) return;
    const geocoder = new google.maps.Geocoder();
    geocoder.geocode({ address: searchQuery }, (results, status) => {
      if (status === "OK" && results && results[0]) {
        const loc = results[0].geometry.location;
        mapRef.current!.panTo(loc);
        mapRef.current!.setZoom(15);
        handleAddressSearch(loc.lat(), loc.lng(), results[0].formatted_address);
      } else {
        toast.error("Address not found");
      }
    });
  };

  const handleAddPropertyHere = async () => {
    if (!contextMenu) return;
    setGeocoding(true);
    setContextMenu(null);

    try {
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode(
        { location: { lat: contextMenu.lat, lng: contextMenu.lng } },
        (results, status) => {
          setGeocoding(false);
          const prefill: AddPropertyPrefill = { latitude: contextMenu.lat, longitude: contextMenu.lng };
          if (status === "OK" && results && results[0]) {
            const comps = results[0].address_components;
            const get = (type: string, short = false) => {
              const c = comps.find((x) => x.types.includes(type));
              return c ? (short ? c.short_name : c.long_name) : "";
            };
            prefill.address = [get("street_number"), get("route")].filter(Boolean).join(" ") || results[0].formatted_address;
            prefill.city = get("locality") || get("sublocality") || get("administrative_area_level_3");
            prefill.county = get("administrative_area_level_2").replace(" County", "");
            prefill.state = get("administrative_area_level_1", true);
            prefill.zip = get("postal_code");
          }
          setAddPrefill(prefill);
          setAddModalOpen(true);
        }
      );
    } catch {
      setGeocoding(false);
      setAddPrefill({ latitude: contextMenu.lat, longitude: contextMenu.lng });
      setAddModalOpen(true);
    }
  };

  const missingCoords = (properties ?? []).filter(p => !p.latitude || !p.longitude).length;

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden">

      {/* ── Desktop Toolbar (hidden on mobile) ── */}
      <div className="hidden sm:flex shrink-0 bg-card/95 backdrop-blur-sm border-b border-border px-3 py-2 items-center gap-2 z-20">

        {/* Address Search */}
        <div className="flex items-center gap-1.5 flex-1 max-w-md bg-background border border-border rounded-lg px-2.5 h-8">
          <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleManualSearch(); }}
            placeholder="Search address or property…"
            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
          />
          {searchQuery && (
            <button onClick={() => { setSearchQuery(""); setSearchResult(null); if (searchMarkerRef.current) { searchMarkerRef.current.map = null; } }} className="text-muted-foreground hover:text-foreground">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Asset Type Multi-Select */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setSelectedTypes(new Set())}
            className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors ${
              selectedTypes.size === 0
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground hover:bg-muted/60"
            }`}
          >
            All
          </button>
          {ASSET_TYPES.map(t => (
            <button
              key={t.value}
              onClick={() => toggleType(t.value)}
              className={`px-2.5 h-7 rounded-md text-xs font-medium transition-colors border ${
                selectedTypes.has(t.value)
                  ? "border-transparent text-black"
                  : "bg-muted/20 text-muted-foreground hover:bg-muted/40 border-border/50"
              }`}
              style={selectedTypes.has(t.value) ? { background: t.color } : {}}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5 ml-auto">
          <span className="text-xs text-muted-foreground">
            {filtered.filter(p => p.latitude && p.longitude).length} / {properties?.length ?? 0} shown
          </span>
          <Button size="sm" variant={showFilters ? "secondary" : "ghost"} className="h-7 gap-1.5 text-xs" onClick={() => setShowFilters(!showFilters)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />
            Filters
          </Button>
          <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={() => setSatelliteMode(!satelliteMode)}>
            <Layers className="h-3.5 w-3.5" />
            {satelliteMode ? "Road" : "Satellite"}
          </Button>
        </div>
      </div>

      {/* ── Mobile Toolbar (collapsed by default, full-screen map) ── */}
      <div className="sm:hidden shrink-0 z-20">
        {/* Collapsed state: single row with Filters toggle + Satellite */}
        {!showFilters ? (
          <div className="bg-card/95 backdrop-blur-sm border-b border-border px-3 py-2 flex items-center gap-2">
            <div className="flex items-center gap-1.5 flex-1 bg-background border border-border rounded-lg px-2.5 h-10">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleManualSearch(); }}
                placeholder="Search address…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
              {searchQuery && (
                <button onClick={() => { setSearchQuery(""); setSearchResult(null); if (searchMarkerRef.current) { searchMarkerRef.current.map = null; } }} className="text-muted-foreground hover:text-foreground p-1">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <button
              onClick={() => setShowFilters(true)}
              className="flex items-center gap-1.5 h-10 px-3 rounded-lg bg-muted/40 text-muted-foreground text-sm font-medium shrink-0 active:bg-muted/60"
            >
              <SlidersHorizontal className="h-4 w-4" />
              Filters
              {(selectedTypes.size > 0 || filters.status !== "all" || filters.minUnits > 0 || filters.maxUnits < 500 || filters.minYear > 1960 || filters.maxYear < 2026) && (
                <span className="h-2 w-2 rounded-full bg-primary" />
              )}
            </button>
          </div>
        ) : (
          /* Expanded state: full filter panel */
          <div className="bg-card/95 backdrop-blur-sm border-b border-border px-3 py-3 space-y-3">
            {/* Header row */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-foreground">Map Filters</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSatelliteMode(!satelliteMode)}
                  className="flex items-center gap-1 h-8 px-2.5 rounded-lg bg-muted/40 text-muted-foreground text-xs active:bg-muted/60"
                >
                  <Layers className="h-3.5 w-3.5" />
                  {satelliteMode ? "Road" : "Satellite"}
                </button>
                <button
                  onClick={() => setShowFilters(false)}
                  className="h-8 w-8 flex items-center justify-center rounded-lg bg-muted/40 text-muted-foreground active:bg-muted/60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            {/* Search */}
            <div className="flex items-center gap-1.5 bg-background border border-border rounded-lg px-2.5 h-10">
              <Search className="h-4 w-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { handleManualSearch(); setShowFilters(false); } }}
                placeholder="Search address or property…"
                className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none"
              />
            </div>

            {/* Asset type pills */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Type</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setSelectedTypes(new Set())}
                  className={`px-3 h-9 rounded-lg text-sm font-medium transition-colors ${
                    selectedTypes.size === 0 ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground"
                  }`}
                >All</button>
                {ASSET_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => toggleType(t.value)}
                    className={`px-3 h-9 rounded-lg text-sm font-medium transition-colors border ${
                      selectedTypes.has(t.value) ? "border-transparent text-black" : "bg-muted/20 text-muted-foreground border-border/50"
                    }`}
                    style={selectedTypes.has(t.value) ? { background: t.color } : {}}
                  >{t.label}</button>
                ))}
              </div>
            </div>

            {/* Status pills */}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide">Status</Label>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setFilters({...filters, status: "all"})}
                  className={`px-3 h-9 rounded-lg text-sm transition-colors ${filters.status === "all" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground"}`}
                >All</button>
                {Object.entries(statusLabels).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setFilters({...filters, status: val})}
                    className={`px-3 h-9 rounded-lg text-sm transition-colors border ${filters.status === val ? "border-transparent text-black" : "bg-muted/20 text-muted-foreground border-border/50"}`}
                    style={filters.status === val ? { background: statusColors[val] } : {}}
                  >{label}</button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Units: {filters.minUnits}–{filters.maxUnits === 500 ? "500+" : filters.maxUnits}
                </Label>
                <div className="px-1">
                  <Slider min={0} max={500} step={5} value={[filters.minUnits, filters.maxUnits]}
                    onValueChange={([min, max]) => setFilters({...filters, minUnits: min, maxUnits: max})}
                    className="[&_[role=slider]]:h-6 [&_[role=slider]]:w-6" />
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">
                  Year Built: {filters.minYear}–{filters.maxYear}
                </Label>
                <div className="px-1">
                  <Slider min={1960} max={2026} step={1} value={[filters.minYear, filters.maxYear]}
                    onValueChange={([min, max]) => setFilters({...filters, minYear: min, maxYear: max})}
                    className="[&_[role=slider]]:h-6 [&_[role=slider]]:w-6" />
                </div>
              </div>
            </div>

            {/* Footer row */}
            <div className="flex items-center justify-between pt-1">
              <span className="text-xs text-muted-foreground">
                {filtered.filter(p => p.latitude && p.longitude).length} / {properties?.length ?? 0} shown
              </span>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" className="h-9 text-xs text-muted-foreground" onClick={() => {
                  setFilters({ status: "all", minUnits: 0, maxUnits: 500, minYear: 1960, maxYear: 2026 });
                  setSelectedTypes(new Set());
                }}>Reset</Button>
                <Button size="sm" className="h-9 text-xs" onClick={() => setShowFilters(false)}>Apply</Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Desktop Extended Filters Row (collapsible) ── */}
      {showFilters && (
        <div className="hidden sm:flex shrink-0 bg-card/90 backdrop-blur-sm border-b border-border px-4 py-3 flex-wrap items-end gap-4 z-10">
          {/* Status filter */}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">Status</Label>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={() => setFilters({...filters, status: "all"})}
                className={`px-2 h-6 rounded text-xs transition-colors ${filters.status === "all" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-muted-foreground hover:bg-muted/60"}`}
              >All</button>
              {Object.entries(statusLabels).map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setFilters({...filters, status: val})}
                  className={`px-2 h-6 rounded text-xs transition-colors border ${filters.status === val ? "border-transparent text-black" : "bg-muted/20 text-muted-foreground hover:bg-muted/40 border-border/50"}`}
                  style={filters.status === val ? { background: statusColors[val] } : {}}
                >{label}</button>
              ))}
            </div>
          </div>

          {/* Unit count range */}
          <div className="space-y-1 min-w-[160px]">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Units: {filters.minUnits}–{filters.maxUnits === 500 ? "500+" : filters.maxUnits}
            </Label>
            <Slider min={0} max={500} step={5} value={[filters.minUnits, filters.maxUnits]}
              onValueChange={([min, max]) => setFilters({...filters, minUnits: min, maxUnits: max})} />
          </div>

          {/* Vintage year range */}
          <div className="space-y-1 min-w-[160px]">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide">
              Year Built: {filters.minYear}–{filters.maxYear}
            </Label>
            <Slider min={1960} max={2026} step={1} value={[filters.minYear, filters.maxYear]}
              onValueChange={([min, max]) => setFilters({...filters, minYear: min, maxYear: max})} />
          </div>

          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => {
            setFilters({ status: "all", minUnits: 0, maxUnits: 500, minYear: 1960, maxYear: 2026 });
            setSelectedTypes(new Set());
          }}>Reset</Button>
        </div>
      )}

      {/* ── Map Area ── */}
      <div className="flex-1 relative">

        {/* Geocode missing banner */}
        {!geocodeMissing.isPending && missingCoords > 0 && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-card/90 backdrop-blur-sm border border-amber-500/40 rounded-lg px-3 py-2 flex items-center gap-2.5 shadow-lg">
              <MapPin className="h-3.5 w-3.5 text-amber-400 shrink-0" />
              <span className="text-xs text-foreground">{missingCoords} properties missing coordinates</span>
              <Button size="sm" variant="outline" className="h-6 text-xs px-2 gap-1 border-amber-500/40 hover:bg-amber-500/10" onClick={() => geocodeMissing.mutate()}>
                <LocateFixed className="h-3 w-3" /> Geocode All
              </Button>
            </div>
          </div>
        )}
        {geocodeMissing.isPending && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-10">
            <div className="bg-card/90 backdrop-blur-sm border border-primary/40 rounded-lg px-3 py-2 flex items-center gap-2.5 shadow-lg">
              <div className="h-3.5 w-3.5 border-2 border-primary border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="text-xs text-foreground">Geocoding all properties…</span>
            </div>
          </div>
        )}

        {/* Right-click hint — moved to bottom-center so it doesn't clash with card */}
        {!selectedProperty && (
          <div className="absolute bottom-4 right-4 z-10">
            <div className="bg-card/80 backdrop-blur-sm border border-border rounded-md px-2.5 py-1.5 text-xs text-muted-foreground flex items-center gap-1.5 shadow">
              <Plus className="h-3 w-3 text-primary" />
              Right-click map to add property
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="absolute bottom-4 left-4 z-10">
          <div className="bg-card/85 backdrop-blur-sm border border-border rounded-lg p-2.5 shadow space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium mb-1">Status</p>
            {Object.entries(statusLabels).map(([val, label]) => (
              <div key={val} className="flex items-center gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: statusColors[val] }} />
                <span className="text-[10px] text-muted-foreground">{label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Geocoding spinner overlay */}
        {geocoding && (
          <div className="absolute inset-0 z-20 flex items-center justify-center bg-background/40 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-xl px-5 py-3 flex items-center gap-3 shadow-xl">
              <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-foreground">Looking up address…</span>
            </div>
          </div>
        )}

        <MapView
          className="w-full h-full"
          initialCenter={{ lat: 43.6150, lng: -116.2023 }}
          initialZoom={7}
          onMapReady={handleMapReady}
        />

        {/* Right-click Context Menu */}
        {contextMenu && (
          <div
            className="fixed z-50 bg-card border border-border rounded-lg shadow-2xl overflow-hidden min-w-[180px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-border bg-muted/30">
              <p className="text-xs text-muted-foreground font-medium">{contextMenu.lat.toFixed(5)}, {contextMenu.lng.toFixed(5)}</p>
            </div>
            <button className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-primary/10 hover:text-primary transition-colors text-left" onClick={handleAddPropertyHere}>
              <Building2 className="h-4 w-4 text-primary" /> Add Property Here
            </button>
            <button className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/40 transition-colors text-left" onClick={() => setContextMenu(null)}>
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>
        )}

        {/* Selected Property Popup — anchored bottom-right so it doesn't cover the selected pin */}
        {selectedProperty && (
          <div className="absolute bottom-4 right-4 w-80 z-10">
            <Card className="border-0 bg-white shadow-2xl rounded-2xl overflow-hidden">
              {/* Status accent bar */}
              <div className="h-1 w-full" style={{ background: statusColors[selectedProperty.listingStage === 'under_contract' ? 'under_contract' : selectedProperty.status] ?? '#64748b' }} />
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Name */}
                    <h3 className="font-bold text-base text-foreground leading-tight truncate">{selectedProperty.name}</h3>
                    {/* Address */}
                    {(selectedProperty.address || selectedProperty.city) && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {[selectedProperty.address, selectedProperty.city, selectedProperty.state].filter(Boolean).join(", ")}
                      </p>
                    )}

                    {/* Badges */}
                    <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          background: (ASSET_TYPES.find(t => t.value === selectedProperty.propertyType)?.color ?? "#c084fc") + "20",
                          color: ASSET_TYPES.find(t => t.value === selectedProperty.propertyType)?.color ?? "#c084fc",
                        }}
                      >
                        {selectedProperty.propertyType.replace(/_/g, " ")}
                      </span>
                      <span
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                        style={{
                          background: (statusColors[selectedProperty.status] ?? "#64748b") + "18",
                          color: statusColors[selectedProperty.status] ?? "#64748b",
                        }}
                      >
                        {statusLabels[selectedProperty.status] ?? selectedProperty.status}
                      </span>
                      {selectedProperty.listingStage && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700">
                          {selectedProperty.listingStage.replace(/_/g, " ")}
                        </span>
                      )}
                      <ResearchStatusBadge status={selectedProperty.researchStatus} />
                    </div>

                    {/* Key stats */}
                    <div className="flex items-center gap-3 mt-3">
                      {selectedProperty.unitCount && (
                        <div className="bg-muted/50 rounded-lg px-3 py-1.5 text-center">
                          <p className="text-sm font-bold text-foreground">{selectedProperty.unitCount}</p>
                          <p className="text-[10px] text-muted-foreground">Units</p>
                        </div>
                      )}
                      {selectedProperty.vintageYear && (
                        <div className="bg-muted/50 rounded-lg px-3 py-1.5 text-center">
                          <p className="text-sm font-bold text-foreground">{selectedProperty.vintageYear}</p>
                          <p className="text-[10px] text-muted-foreground">Built</p>
                        </div>
                      )}
                      {(selectedProperty.askingPrice || selectedProperty.estimatedValue) && (
                        <div className="bg-primary/10 rounded-lg px-3 py-1.5 text-center">
                          <p className="text-sm font-bold text-primary">${((selectedProperty.askingPrice ?? selectedProperty.estimatedValue)! / 1_000_000).toFixed(2)}M</p>
                          <p className="text-[10px] text-muted-foreground">{selectedProperty.askingPrice ? "Asking" : "Est."}</p>
                        </div>
                      )}
                    </div>

                    {/* Owner */}
                    {(selectedProperty.ownerCompany || selectedProperty.ownerFirstName || selectedProperty.ownerName) && (
                      <div className="mt-3 pt-3 border-t border-border/60">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">Owner</p>
                            {selectedProperty.ownerCompany && (
                              <p className="text-xs font-semibold text-foreground truncate mt-0.5">{selectedProperty.ownerCompany}</p>
                            )}
                            {(selectedProperty.ownerFirstName || selectedProperty.ownerName) && (
                              <p className="text-xs text-muted-foreground">
                                {selectedProperty.ownerFirstName
                                  ? `${selectedProperty.ownerFirstName} ${selectedProperty.ownerLastName ?? ""}`.trim()
                                  : selectedProperty.ownerName}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {selectedProperty.ownerPhone && (
                              <a href={`tel:${selectedProperty.ownerPhone}`} className="h-7 w-7 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                                <Phone className="h-3 w-3" />
                              </a>
                            )}
                            {selectedProperty.ownerEmail && (
                              <a href={`mailto:${selectedProperty.ownerEmail}`} className="h-7 w-7 flex items-center justify-center rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors">
                                <Mail className="h-3 w-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Close */}
                  <button
                    onClick={() => {
                      setSelectedProperty(null);
                      setSearchResult(null);
                      // Restore the active pin to normal style
                      if (activeMarkerRef.current) {
                        const prev = activeMarkerRef.current.el;
                        prev.style.transform = "scale(1)";
                        prev.style.zIndex = "";
                        prev.style.filter = "";
                        const ring = prev.querySelector(".active-ring") as HTMLElement | null;
                        if (ring) ring.remove();
                        activeMarkerRef.current = null;
                      }
                    }}
                    className="h-7 w-7 flex items-center justify-center rounded-full bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0 mt-0.5"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-2 mt-4">
                  <Button className="flex-1 h-8 text-xs gap-1.5 rounded-xl" onClick={() => setLocation(`/properties/${selectedProperty.id}?from=map`)}>
                    <Eye className="h-3.5 w-3.5" /> View Property
                  </Button>
                  {selectedProperty.ownerId && (
                    <Button variant="outline" className="flex-1 h-8 text-xs gap-1.5 rounded-xl" onClick={() => setLocation(`/contacts/${selectedProperty.ownerId}?from=map&propertyId=${selectedProperty.id}`)}>
                      <Building2 className="h-3.5 w-3.5" /> Owner Profile
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Search result: address not in system */}
        {searchResult && !searchResult.found && (
          <div className="absolute bottom-16 left-1/2 -translate-x-1/2 w-full max-w-sm px-4 z-10">
            <Card className="border-amber-500/40 bg-card shadow-2xl">
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-foreground">Not in system</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Right-click the map pin to add this property</p>
                </div>
                <Button size="sm" variant="ghost" className="h-7 text-xs shrink-0" onClick={() => setSearchResult(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      {/* Add Property Modal */}
      <AddPropertyModal
        open={addModalOpen}
        onClose={() => { setAddModalOpen(false); setAddPrefill(undefined); }}
        onSuccess={() => {
          setAddModalOpen(false);
          setAddPrefill(undefined);
          utils.properties.forMap.invalidate();
          utils.properties.list.invalidate();
        }}
        prefill={addPrefill}
      />
    </div>
  );
}

// ─── Research status badge for map card ──────────────────────��───────────────
const researchStatusConfig: Record<string, { label: string; dotClass: string; textClass: string }> = {
  researched: { label: "Researched", dotClass: "bg-emerald-500", textClass: "text-emerald-500" },
  contact_on_file: { label: "Contact on File", dotClass: "bg-blue-500", textClass: "text-blue-500" },
  pending_review: { label: "Pending Review", dotClass: "bg-amber-500", textClass: "text-amber-500" },
  partial_data: { label: "Partial Data", dotClass: "bg-gray-300", textClass: "text-gray-400" },
  not_researched: { label: "Not Researched", dotClass: "bg-gray-400", textClass: "text-gray-400" },
};

function ResearchStatusBadge({ status }: { status?: string | null }) {
  const config = researchStatusConfig[status ?? "not_researched"] ?? researchStatusConfig.not_researched;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium ${config.textClass}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dotClass}`} />
      {config.label}
    </span>
  );
}
