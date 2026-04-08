import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  Search, Plus, Building2, MapPin, LocateFixed,
  ChevronUp, ChevronDown, ChevronsUpDown, Map,
} from "lucide-react";
import { AddressAutocomplete } from "@/components/AddressAutocomplete";
import { statusColors, propertyTypeLabels } from "@/lib/constants";

// ─── Property-specific color maps ────────────────────────────────────────────
const typeColors: Record<string, string> = {
  mhc:                "bg-teal-500/20 text-teal-400 border-teal-500/30",
  apartment:          "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  affordable_housing: "bg-green-500/20 text-green-400 border-green-500/30",
  self_storage:       "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  mixed:              "bg-pink-500/20 text-pink-400 border-pink-500/30",
};
const TYPE_LABELS: Record<string, string> = {
  mhc: "MHC", apartment: "APT", affordable_housing: "AHP",
  self_storage: "STG", mixed: "MXD",
};

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtValue(v: number | null | undefined): string {
  if (!v) return "—";
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000)     return `$${Math.round(v / 1_000)}K`;
  return `$${v}`;
}

function fmtDate(d: string | Date | null | undefined): string {
  if (!d) return "—";
  const date = new Date(d as string);
  if (isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "2-digit" });
}

// ─── Sort helpers ─────────────────────────────────────────────────────────────
type SortKey =
  | "name" | "city" | "county" | "propertyType" | "status"
  | "unitCount" | "vintageYear" | "estimatedValue" | "ownerName" | "lastContactedAt";
type SortDir = "asc" | "desc";

function cmpVal(a: unknown, b: unknown, dir: SortDir): number {
  const av = a ?? "";
  const bv = b ?? "";
  let r = 0;
  if (typeof av === "number" && typeof bv === "number") {
    r = av - bv;
  } else {
    r = String(av).toLowerCase().localeCompare(String(bv).toLowerCase());
  }
  return dir === "asc" ? r : -r;
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown className="h-3 w-3 opacity-30 ml-0.5 shrink-0" />;
  return sortDir === "asc"
    ? <ChevronUp   className="h-3 w-3 ml-0.5 text-primary shrink-0" />
    : <ChevronDown className="h-3 w-3 ml-0.5 text-primary shrink-0" />;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Properties() {
  const [, setLocation] = useLocation();
  const [search,       setSearch]       = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [sortKey,      setSortKey]      = useState<SortKey>("city");
  const [sortDir,      setSortDir]      = useState<SortDir>("asc");

  const [filters, setFilters] = useState({
    propertyType: "all",
    status:       "all",
    city:         "all",
    county:       "",
    minUnits:     0,
    maxUnits:     500,
    minYear:      1960,
    maxYear:      2026,
  });

  const utils = trpc.useUtils();

  const geocodeMissing = trpc.properties.geocodeMissing.useMutation({
    onSuccess: (res) => {
      toast.success(
        `Geocoded ${res.geocoded} of ${res.total} properties` +
        (res.failed > 0 ? ` (${res.failed} failed — no address data)` : "")
      );
      utils.properties.list.invalidate();
      utils.properties.forMap.invalidate();
    },
    onError: () => toast.error("Geocoding failed"),
  });

  // Load the full dataset once — all filtering & sorting is client-side
  const { data: allProperties, isLoading, refetch } = trpc.properties.list.useQuery({ limit: 5000 });

  // Unique city list derived from loaded data
  const cityOptions = useMemo(() => {
    if (!allProperties) return [];
    const set = new Set(allProperties.map((p) => p.city).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [allProperties]);

  // Client-side filter → sort
  const displayed = useMemo(() => {
    if (!allProperties) return [];
    let rows = allProperties;

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((p) =>
        [p.name, p.address, p.ownerName, p.city, p.county].some((v) => v?.toLowerCase().includes(q))
      );
    }
    if (filters.propertyType !== "all") rows = rows.filter((p) => p.propertyType === filters.propertyType);
    if (filters.status       !== "all") rows = rows.filter((p) => p.status       === filters.status);
    if (filters.city         !== "all") rows = rows.filter((p) => p.city         === filters.city);
    if (filters.county.trim()) {
      const q = filters.county.trim().toLowerCase();
      rows = rows.filter((p) => p.county?.toLowerCase().includes(q));
    }
    if (filters.minUnits > 0)   rows = rows.filter((p) => (p.unitCount   ?? 0)    >= filters.minUnits);
    if (filters.maxUnits < 500) rows = rows.filter((p) => (p.unitCount   ?? 9999) <= filters.maxUnits);
    if (filters.minYear  > 1960) rows = rows.filter((p) => (p.vintageYear ?? 0)    >= filters.minYear);
    if (filters.maxYear  < 2026) rows = rows.filter((p) => (p.vintageYear ?? 9999) <= filters.maxYear);

    return [...rows].sort((a, b) => cmpVal(
      (a as Record<string, unknown>)[sortKey],
      (b as Record<string, unknown>)[sortKey],
      sortDir
    ));
  }, [allProperties, search, filters, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  }

  function clearFilters() {
    setSearch("");
    setFilters({ propertyType: "all", status: "all", city: "all", county: "", minUnits: 0, maxUnits: 500, minYear: 1960, maxYear: 2026 });
  }

  const hasActiveFilters =
    search || filters.propertyType !== "all" || filters.status !== "all" ||
    filters.city !== "all" || filters.county || filters.minUnits > 0 ||
    filters.maxUnits < 500 || filters.minYear > 1960 || filters.maxYear < 2026;

  // Header cell component
  const TH = ({ label, col, align = "left" }: { label: string; col: SortKey; align?: "left" | "right" }) => (
    <th
      className={`px-3 py-2.5 text-${align} text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer select-none whitespace-nowrap hover:text-foreground transition-colors`}
      onClick={() => toggleSort(col)}
    >
      <span className={`inline-flex items-center gap-0.5 ${align === "right" ? "flex-row-reverse" : ""}`}>
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden" }}>

      {/* ── Header ── */}
      <div className="px-6 pt-6 pb-3 shrink-0 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Properties</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {isLoading
                ? "Loading…"
                : `${displayed.length.toLocaleString()} of ${(allProperties?.length ?? 0).toLocaleString()} properties`}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setLocation("/map")} className="gap-1.5">
              <MapPin className="h-4 w-4" /> Map View
            </Button>
            {hasActiveFilters && (
              <Button
                variant="outline" size="sm"
                onClick={() => {
                  const params = new URLSearchParams();
                  if (filters.status !== "all")       params.set("status", filters.status);
                  if (filters.propertyType !== "all") params.set("type", filters.propertyType);
                  if (filters.city !== "all")         params.set("city", filters.city);
                  if (filters.county.trim())          params.set("county", filters.county.trim());
                  if (filters.minUnits > 0)           params.set("minUnits", String(filters.minUnits));
                  if (filters.maxUnits < 500)         params.set("maxUnits", String(filters.maxUnits));
                  if (filters.minYear > 1960)         params.set("minYear", String(filters.minYear));
                  if (filters.maxYear < 2026)         params.set("maxYear", String(filters.maxYear));
                  if (search.trim())                  params.set("q", search.trim());
                  const qs = params.toString();
                  setLocation(`/map${qs ? "?" + qs : ""}`);
                }}
                className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
                title={`View ${displayed.length} filtered properties on map`}
              >
                <Map className="h-4 w-4" /> <span className="hidden sm:inline">View {displayed.length} on Map</span><span className="sm:hidden">Map</span>
              </Button>
            )}
            {/* Geocode button — desktop only, not needed on mobile */}
            <Button
              variant="outline" size="sm"
              onClick={() => geocodeMissing.mutate()}
              disabled={geocodeMissing.isPending}
              className="gap-1.5 hidden sm:flex"
              title="Batch-geocode properties missing coordinates"
            >
              <LocateFixed className="h-4 w-4" />
              {geocodeMissing.isPending ? "Geocoding…" : "Geocode Missing"}
            </Button>
            <Button onClick={() => setShowAddModal(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Property
            </Button>
          </div>
        </div>

        {/* ── Inline filter bar — always visible ── */}
        <div className="flex flex-wrap gap-2 items-end">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-sm bg-card border-border w-44"
            />
          </div>

          {/* Type */}
          <Select value={filters.propertyType} onValueChange={(v) => setFilters({ ...filters, propertyType: v })}>
            <SelectTrigger className="h-8 text-xs bg-card border-border w-[118px]"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="mhc">MHC</SelectItem>
              <SelectItem value="apartment">Apartment</SelectItem>
              <SelectItem value="affordable_housing">Affordable Housing</SelectItem>
              <SelectItem value="self_storage">Self Storage</SelectItem>
              <SelectItem value="other">Other</SelectItem>
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
            <SelectTrigger className="h-8 text-xs bg-card border-border w-[128px]"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Statuses</SelectItem>
              <SelectItem value="researching">Researching</SelectItem>
              <SelectItem value="prospecting">Prospecting</SelectItem>
              <SelectItem value="seller">Seller</SelectItem>
              <SelectItem value="listed">Listed</SelectItem>
              <SelectItem value="recently_sold">Recently Sold</SelectItem>
            </SelectContent>
          </Select>

          {/* City */}
          <Select value={filters.city} onValueChange={(v) => setFilters({ ...filters, city: v })}>
            <SelectTrigger className="h-8 text-xs bg-card border-border w-[128px]"><SelectValue placeholder="City" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {cityOptions.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>

          {/* County text */}
          <Input
            placeholder="County…"
            value={filters.county}
            onChange={(e) => setFilters({ ...filters, county: e.target.value })}
            className="h-8 text-xs bg-card border-border w-24"
          />

          {/* Units range */}
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <span className="text-[10px] text-muted-foreground leading-none">
              Units: {filters.minUnits}–{filters.maxUnits >= 500 ? "500+" : filters.maxUnits}
            </span>
            <Slider
              min={0} max={500} step={5}
              value={[filters.minUnits, filters.maxUnits]}
              onValueChange={([min, max]) => setFilters({ ...filters, minUnits: min, maxUnits: max })}
              className="w-full sm:w-32 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 sm:[&_[role=slider]]:h-4 sm:[&_[role=slider]]:w-4"
            />
          </div>

          {/* Vintage range */}
          <div className="flex flex-col gap-1 w-full sm:w-auto">
            <span className="text-[10px] text-muted-foreground leading-none">
              Built: {filters.minYear}–{filters.maxYear}
            </span>
            <Slider
              min={1960} max={2026} step={1}
              value={[filters.minYear, filters.maxYear]}
              onValueChange={([min, max]) => setFilters({ ...filters, minYear: min, maxYear: max })}
              className="w-full sm:w-32 [&_[role=slider]]:h-5 [&_[role=slider]]:w-5 sm:[&_[role=slider]]:h-4 sm:[&_[role=slider]]:w-4"
            />
          </div>

          {/* Clear */}
          {hasActiveFilters && (
            <Button
              variant="ghost" size="sm"
              className="h-8 text-xs text-muted-foreground hover:text-foreground px-2"
              onClick={clearFilters}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {/* ── Scrollable table area ── */}
      <div style={{ flex: 1, overflowY: "auto", overflowX: "auto" }} className="px-6 pb-6">
        {isLoading ? (
          <div className="space-y-1 pt-3">
            {Array.from({ length: 25 }).map((_, i) => (
              <div key={i} className="h-9 bg-card rounded animate-pulse" />
            ))}
          </div>
        ) : displayed.length === 0 ? (
          <div className="text-center py-20 text-muted-foreground">
            <Building2 className="h-12 w-12 mx-auto mb-3 opacity-20" />
            <p className="font-medium">No properties match these filters</p>
            <p className="text-sm mt-1">Try adjusting or clearing your filters</p>
          </div>
        ) : (
          <>
          {/* ── Mobile card list (< sm) ── */}
          <div className="sm:hidden divide-y divide-border/30">
            {displayed.map((prop) => (
              <div
                key={prop.id}
                onClick={() => setLocation(`/properties/${prop.id}`)}
                className="flex items-center gap-3 px-3 py-3 cursor-pointer hover:bg-primary/5 active:bg-primary/10"
              >
                {/* Left: name + city */}
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground text-sm truncate">{prop.name}</p>
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {[prop.city, prop.county].filter(Boolean).join(", ") || "—"}
                  </p>
                </div>
                {/* Right: badges + units */}
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <div className="flex gap-1">
                    <Badge variant="outline" className={`text-[10px] px-1.5 leading-4 ${statusColors[prop.status] ?? ""}`}>
                      {prop.status.replace(/_/g, " ")}
                    </Badge>
                    <Badge variant="outline" className={`text-[10px] px-1.5 leading-4 ${typeColors[prop.propertyType] ?? ""}`}>
                      {TYPE_LABELS[prop.propertyType] ?? prop.propertyType.toUpperCase()}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted-foreground">
                    {prop.unitCount ? `${prop.unitCount} units` : ""}
                    {prop.unitCount && prop.vintageYear ? " · " : ""}
                    {prop.vintageYear ? `${prop.vintageYear}` : ""}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* ── Desktop table (≥ sm) ── */}
          <table
            className="hidden sm:table w-full border-collapse"
            style={{ fontSize: "13px", tableLayout: "fixed", minWidth: "900px" }}
          >
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "9%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "10%" }} />
              <col style={{ width: "6%" }} />
              <col style={{ width: "7%" }} />
              <col style={{ width: "8%" }} />
              <col style={{ width: "13%" }} />
              <col style={{ width: "9%" }} />
            </colgroup>

            <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
              <tr className="bg-card border-b-2 border-border">
                <TH label="Name"         col="name" />
                <TH label="City"         col="city" />
                <TH label="County"       col="county" />
                <TH label="Type"         col="propertyType" />
                <TH label="Status"       col="status" />
                <TH label="Units"        col="unitCount"       align="right" />
                <TH label="Yr Built"     col="vintageYear"     align="right" />
                <TH label="Est. Value"   col="estimatedValue"  align="right" />
                <TH label="Owner"        col="ownerName" />
                <TH label="Last Contact" col="lastContactedAt" />
              </tr>
            </thead>

            <tbody>
              {displayed.map((prop, idx) => (
                <tr
                  key={prop.id}
                  onClick={() => setLocation(`/properties/${prop.id}`)}
                  className="cursor-pointer border-b border-border/30 transition-colors hover:bg-primary/5"
                  style={{
                    height: "36px",
                    backgroundColor: idx % 2 === 0 ? "transparent" : "rgba(255,255,255,0.02)",
                  }}
                >
                  <td className="px-3 overflow-hidden">
                    <span
                      className="font-medium text-foreground block truncate"
                      style={{ lineHeight: "36px" }}
                      title={prop.name}
                    >
                      {prop.name}
                    </span>
                  </td>

                  <td className="px-3 overflow-hidden">
                    <span className="text-muted-foreground text-xs block truncate" style={{ lineHeight: "36px" }}>
                      {prop.city ?? "—"}
                    </span>
                  </td>

                  <td className="px-3 overflow-hidden">
                    <span className="text-muted-foreground text-xs block truncate" style={{ lineHeight: "36px" }}>
                      {prop.county ?? "—"}
                    </span>
                  </td>

                  <td className="px-3">
                    <div className="flex items-center" style={{ height: "36px" }}>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 leading-4 ${typeColors[prop.propertyType] ?? ""}`}
                      >
                        {TYPE_LABELS[prop.propertyType] ?? prop.propertyType.toUpperCase()}
                      </Badge>
                    </div>
                  </td>

                  <td className="px-3">
                    <div className="flex items-center" style={{ height: "36px" }}>
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 leading-4 ${statusColors[prop.status] ?? ""}`}
                      >
                        {prop.status.replace(/_/g, " ")}
                      </Badge>
                    </div>
                  </td>

                  <td className="px-3 text-right">
                    <span className="text-muted-foreground text-xs" style={{ lineHeight: "36px", display: "block" }}>
                      {prop.unitCount ?? "—"}
                    </span>
                  </td>

                  <td className="px-3 text-right">
                    <span className="text-muted-foreground text-xs" style={{ lineHeight: "36px", display: "block" }}>
                      {prop.vintageYear ?? "—"}
                    </span>
                  </td>

                  <td className="px-3 text-right">
                    <span className="text-primary text-xs font-medium" style={{ lineHeight: "36px", display: "block" }}>
                      {fmtValue(prop.estimatedValue)}
                    </span>
                  </td>

                  <td className="px-3 overflow-hidden">
                    <span
                      className="text-muted-foreground text-xs block truncate"
                      style={{ lineHeight: "36px" }}
                      title={prop.ownerName ?? ""}
                    >
                      {prop.ownerName ?? "—"}
                    </span>
                  </td>

                  <td className="px-3">
                    <span className="text-muted-foreground text-xs" style={{ lineHeight: "36px", display: "block" }}>
                      {fmtDate(prop.lastContactedAt)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </>
        )}
      </div>

      <AddPropertyModal
        open={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSuccess={() => { setShowAddModal(false); refetch(); }}
      />
    </div>
  );
}

// ─── AddPropertyModal — UNCHANGED from original ───────────────────────────────
interface AddPropertyPrefill {
  address?: string;
  city?: string;
  county?: string;
  state?: string;
  zip?: string;
  latitude?: number;
  longitude?: number;
}

export function AddPropertyModal({
  open, onClose, onSuccess, prefill,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefill?: AddPropertyPrefill;
}) {
  const [form, setForm] = useState({
    name: "", propertyType: "mhc" as "mhc"|"apartment"|"affordable_housing"|"self_storage"|"other",
    address: "", city: "", state: "ID", county: "", zip: "",
    latitude: null as number | null, longitude: null as number | null,
    unitCount: "", vintageYear: "", estimatedValue: "",
    status: "researching" as "researching"|"prospecting"|"seller"|"listed"|"recently_sold",
    notes: "",
  });

  const prevOpen = useRef(false);
  useEffect(() => {
    if (open && !prevOpen.current && prefill) {
      setForm((f) => ({
        ...f,
        address:   prefill.address   ?? f.address,
        city:      prefill.city      ?? f.city,
        county:    prefill.county    ?? f.county,
        state:     prefill.state     ?? f.state,
        zip:       prefill.zip       ?? f.zip,
        latitude:  prefill.latitude  ?? f.latitude,
        longitude: prefill.longitude ?? f.longitude,
      }));
    }
    prevOpen.current = open;
  }, [open, prefill]);

  const createProperty = trpc.properties.create.useMutation({
    onSuccess: () => { toast.success("Property added!"); onSuccess(); },
    onError:   (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Add Property</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Property Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Sunrise MHC" className="bg-background border-border" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={form.propertyType} onValueChange={(v) => setForm({ ...form, propertyType: v as typeof form.propertyType })}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mhc">MHC</SelectItem>
                  <SelectItem value="apartment">Apartment</SelectItem>
                  <SelectItem value="affordable_housing">Affordable Housing</SelectItem>
                  <SelectItem value="self_storage">Self Storage</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as typeof form.status })}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="researching">Researching</SelectItem>
                  <SelectItem value="prospecting">Prospecting</SelectItem>
                  <SelectItem value="seller">Seller</SelectItem>
                  <SelectItem value="listed">Listed</SelectItem>
                  <SelectItem value="recently_sold">Recently Sold</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Address <span className="text-primary">— type to search or paste a Google Maps address</span>
            </Label>
            <AddressAutocomplete
              value={form.address}
              onChange={(v) => setForm({ ...form, address: v })}
              onPlaceSelected={(c) => setForm((f) => ({
                ...f, address: c.address,
                city: c.city || f.city, county: c.county || f.county,
                state: c.state || f.state, zip: c.zip || f.zip,
                latitude: c.latitude, longitude: c.longitude,
              }))}
              placeholder="e.g. 123 Main St, Boise, ID"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">City</Label><Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} placeholder="Auto-filled" className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">County</Label><Input value={form.county} onChange={(e) => setForm({ ...form, county: e.target.value })} placeholder="Auto-filled" className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">State</Label><Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="Auto-filled" className="bg-background border-border" /></div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Units</Label><Input type="number" value={form.unitCount} onChange={(e) => setForm({ ...form, unitCount: e.target.value })} className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Year Built</Label><Input type="number" value={form.vintageYear} onChange={(e) => setForm({ ...form, vintageYear: e.target.value })} className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Est. Value ($)</Label><Input type="number" value={form.estimatedValue} onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })} className="bg-background border-border" /></div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => {
              if (!form.name) return toast.error("Name required");
              createProperty.mutate({
                ...form,
                unitCount:      form.unitCount      ? parseInt(form.unitCount)       : undefined,
                vintageYear:    form.vintageYear     ? parseInt(form.vintageYear)     : undefined,
                estimatedValue: form.estimatedValue  ? parseFloat(form.estimatedValue): undefined,
                latitude:       form.latitude        ?? undefined,
                longitude:      form.longitude       ?? undefined,
              });
            }}
            disabled={createProperty.isPending}
          >
            {createProperty.isPending ? "Adding…" : "Add Property"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
