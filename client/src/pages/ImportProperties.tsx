import { useState, useCallback, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Upload,
  FileText,
  CheckCircle2,
  XCircle,
  MapPin,
  ArrowRight,
  RotateCcw,
  Download,
  AlertCircle,
  Loader2,
  Table2,
  Settings2,
  Eye,
  StickyNote,
  FileSpreadsheet,
  Sparkles,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import * as XLSX from "xlsx";

// ─── CRM fields available for mapping ────────────────────────────────────────
const CRM_FIELDS = [
  { key: "name", label: "Property Name", required: true },
  { key: "propertyType", label: "Property Type" },
  { key: "address", label: "Street Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP Code" },
  { key: "county", label: "County" },
  { key: "unitCount", label: "Unit Count" },
  { key: "vintageYear", label: "Vintage Year" },
  { key: "sizeSqft", label: "Size (sq ft)" },
  { key: "estimatedValue", label: "Estimated Value ($)" },
  { key: "askingPrice", label: "Asking Price ($)" },
  { key: "status", label: "Status" },
  { key: "ownerName", label: "Owner Name" },
  { key: "notes", label: "Notes (primary)" },
  { key: "importNotes", label: "Research Notes (Import)" },
  { key: "latitude", label: "Latitude" },
  { key: "longitude", label: "Longitude" },
] as const;

type CrmFieldKey = (typeof CRM_FIELDS)[number]["key"];

// Special sentinel values for the mapping dropdown
const SENTINEL_SKIP = "__skip__";
const SENTINEL_NOTES = "__save_as_notes__";

type MappingValue = CrmFieldKey | typeof SENTINEL_SKIP | typeof SENTINEL_NOTES;

// ─── Property type normalizer — defaults to apartment ────────────────────────
function normalizePropertyType(raw: string): "mhc" | "apartment" | "affordable_housing" | "self_storage" | "other" {
  const v = raw.toLowerCase().trim();
  if (v.includes("mhc") || v.includes("mobile") || v.includes("manufactured") || v.includes("park")) return "mhc";
  if (v.includes("affordable") || v.includes("section 8") || v.includes("lihtc") || v.includes("low income")) return "affordable_housing";
  if (v.includes("self") || v.includes("storage")) return "self_storage";
  if (v.includes("mixed") || v.includes("other")) return "other";
  if (v.includes("apart") || v.includes("multi") || v.includes("residential") || v.includes("flat")) return "apartment";
  // Default: apartment
  return "apartment";
}

function normalizeStatus(raw: string): "researching" | "prospecting" | "seller" | "listed" | "recently_sold" {
  const v = raw.toLowerCase().trim();
  if (v.includes("prospect")) return "prospecting";
  if (v.includes("seller") || v.includes("motivated") || v.includes("negotiat") || v.includes("contact")) return "seller";
  if (v.includes("sold") || v.includes("closed") || v.includes("recent")) return "recently_sold";
  if (v.includes("list")) return "listed";
  return "researching";
}

// ─── Parse CSV text ───────────────────────────────────────────────────────────
function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return { headers: [], rows: [] };

  const parseRow = (line: string): string[] => {
    const result: string[] = [];
    let current = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else inQuotes = !inQuotes;
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = "";
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseRow(lines[0]);
  const rows = lines.slice(1).map(parseRow).filter(r => r.some(c => c !== ""));
  return { headers, rows };
}

// ─── Parse Excel (.xlsx) file ─────────────────────────────────────────────────
function parseXLSX(buffer: ArrayBuffer): { headers: string[]; rows: string[][] } {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  if (data.length < 2) return { headers: [], rows: [] };
  const headers = (data[0] as string[]).map(h => String(h ?? "").trim()).filter(h => h !== "");
  const colCount = headers.length;
  const rows = data.slice(1)
    .map(row => headers.map((_, i) => String((row as string[])[i] ?? "").trim()))
    .filter(r => r.some(c => c !== ""));
  return { headers, rows };
}

// ─── Auto-suggest field mapping ───────────────────────────────────────────────
// Columns that don't match a CRM field default to "Save as Notes"
function autoSuggestMapping(headers: string[]): Record<string, MappingValue> {
  const mapping: Record<string, MappingValue> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");

  const matchers: Array<{ patterns: string[]; field: CrmFieldKey }> = [
    { patterns: ["name", "propertyname", "property", "title", "complex", "complexname"], field: "name" },
    { patterns: ["type", "propertytype", "assettype", "class", "assetclass"], field: "propertyType" },
    { patterns: ["address", "streetaddress", "street", "addr", "fulladdress"], field: "address" },
    { patterns: ["city", "municipality", "town"], field: "city" },
    { patterns: ["state", "st"], field: "state" },
    { patterns: ["zip", "zipcode", "postalcode", "postal"], field: "zip" },
    { patterns: ["county", "region"], field: "county" },
    { patterns: ["units", "unitcount", "numunits", "totalunits", "beds", "spaces", "numberofunits"], field: "unitCount" },
    { patterns: ["year", "vintage", "builtyear", "yearbuilt", "constructed", "yearconstructed"], field: "vintageYear" },
    { patterns: ["sqft", "size", "squarefeet", "sf", "squarefootage", "gla"], field: "sizeSqft" },
    { patterns: ["value", "estimatedvalue", "appraisal", "avm", "assessedvalue"], field: "estimatedValue" },
    { patterns: ["asking", "askingprice", "listprice", "listingprice"], field: "askingPrice" },
    { patterns: ["status", "stage", "disposition", "dealstage"], field: "status" },
    { patterns: ["owner", "ownername", "seller", "contact", "currentowner"], field: "ownerName" },
    { patterns: ["notes", "comments", "description", "remarks", "mynotes"], field: "notes" },
    { patterns: ["lat", "latitude"], field: "latitude" },
    { patterns: ["lng", "lon", "long", "longitude"], field: "longitude" },
  ];

  const usedFields = new Set<string>();
  headers.forEach(h => {
    const norm = normalize(h);
    // Only assign a CRM field if it hasn't been assigned to a previous column
    const match = matchers.find(m => !usedFields.has(m.field) && m.patterns.some(p => norm === p || norm.startsWith(p) || p.startsWith(norm)));
    if (match) {
      mapping[h] = match.field;
      usedFields.add(match.field);
    } else {
      // Default unmapped columns to "Save as Notes" instead of "Skip"
      mapping[h] = SENTINEL_NOTES;
    }
  });

  return mapping;
}

// ─── Step types ───────────────────────────────────────────────────────────────
type Step = "upload" | "map" | "preview" | "importing" | "done";

type ImportResult = {
  total: number;
  inserted: number;
  geocoded: number;
  failed: number;
  skipped: number;
  results: Array<{ index: number; name: string; status: string; geocoded: boolean; error?: string }>;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImportProperties() {
  const [step, setStep] = useState<Step>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, MappingValue>>({});
  const [geocodeEnabled, setGeocodeEnabled] = useState(true);
  const [duplicateMode, setDuplicateMode] = useState<"skip" | "update" | "insert">("skip");
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [aiMapping, setAiMapping] = useState(false);
  const aiMapColumns = trpc.properties.aiMapColumns.useMutation({
    onSuccess: (data) => {
      setMapping(data as Record<string, MappingValue>);
      toast.success("AI mapped your columns");
      setAiMapping(false);
    },
    onError: () => {
      toast.error("AI mapping failed — using auto-suggestions");
      setAiMapping(false);
    },
  });

  const bulkImport = trpc.properties.bulkImport.useMutation({
    onSuccess: (data) => {
      setImportResult(data);
      setStep("done");
    },
    onError: (e) => {
      toast.error("Import failed: " + e.message);
      setStep("preview");
    },
  });

  // ─── File handling ──────────────────────────────────────────────────────────
  const processFile = useCallback((file: File) => {
    const isXLSX = file.name.endsWith(".xlsx") || file.name.endsWith(".xls");
    const isCSV = file.name.endsWith(".csv");
    if (!isXLSX && !isCSV) {
      toast.error("Please upload a .csv or .xlsx file");
      return;
    }
    setFileName(file.name);

    if (isCSV) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        const { headers: h, rows: r } = parseCSV(text);
        if (h.length === 0) { toast.error("Could not parse CSV — check the file format"); return; }
        setHeaders(h);
        setRows(r);
        setMapping(autoSuggestMapping(h));
        setStep("map");
      };
      reader.readAsText(file);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        const buffer = e.target?.result as ArrayBuffer;
        const { headers: h, rows: r } = parseXLSX(buffer);
        if (h.length === 0) { toast.error("Could not parse Excel file — check the file format"); return; }
        setHeaders(h);
        setRows(r);
        setMapping(autoSuggestMapping(h));
        setStep("map");
      };
      reader.readAsArrayBuffer(file);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  // ─── Build rows for import ──────────────────────────────────────────────────
  const buildImportRows = () => {
    return rows.map(row => {
      const mapped: Record<string, string> = {};
      const extraNotes: string[] = [];

      headers.forEach((h, i) => {
        const field = mapping[h];
        const val = row[i] ?? "";
        if (!field || field === SENTINEL_SKIP) return;
        if (field === SENTINEL_NOTES) {
          // Save unmapped column as "Column Name: value" note entry
          if (val.trim()) extraNotes.push(`${h}: ${val.trim()}`);
        } else {
          mapped[field] = val;
        }
      });

      const num = (k: string) => {
        const v = parseFloat(mapped[k] ?? "");
        return isNaN(v) ? undefined : v;
      };

      // Combine explicit notes field + all extra note columns
      const noteParts: string[] = [];
      if (mapped.notes?.trim()) noteParts.push(mapped.notes.trim());
      if (extraNotes.length > 0) {
        noteParts.push("--- Additional Data ---");
        noteParts.push(...extraNotes);
      }

      return {
        name: mapped.name || "Unnamed Property",
        // Default to apartment when no type is mapped or value is unrecognized
        propertyType: mapped.propertyType ? normalizePropertyType(mapped.propertyType) : ("apartment" as const),
        address: mapped.address || undefined,
        city: mapped.city || undefined,
        state: mapped.state || undefined,
        zip: mapped.zip || undefined,
        county: mapped.county || undefined,
        unitCount: num("unitCount"),
        vintageYear: num("vintageYear"),
        sizeSqft: num("sizeSqft"),
        estimatedValue: num("estimatedValue"),
        askingPrice: num("askingPrice"),
        status: mapped.status ? normalizeStatus(mapped.status) : ("researching" as const),
        ownerName: mapped.ownerName || undefined,
        notes: noteParts.length > 0 ? noteParts.join("\n") : undefined,
        importNotes: mapped.importNotes?.trim() || undefined,
        latitude: num("latitude"),
        longitude: num("longitude"),
      };
    });
  };

  const runImport = () => {
    const importRows = buildImportRows();
    setStep("importing");
    bulkImport.mutate({ rows: importRows, geocode: geocodeEnabled, duplicateMode });
  };

  const reset = () => {
    setStep("upload");
    setFileName("");
    setHeaders([]);
    setRows([]);
    setMapping({});
    setImportResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ─── Stats for mapping step ─────────────────────────────────────────────────
  const mappedToCrmCount = Object.values(mapping).filter(v => v !== SENTINEL_SKIP && v !== SENTINEL_NOTES).length;
  const savedAsNotesCount = Object.values(mapping).filter(v => v === SENTINEL_NOTES).length;
  const skippedCount = Object.values(mapping).filter(v => v === SENTINEL_SKIP).length;

  // ─── Preview rows (first 5) ─────────────────────────────────────────────────
  const previewRows = buildImportRows().slice(0, 5);
  // Deduplicate: if two columns are mapped to the same CRM field, show it only once in the preview table
  const mappedFields = Array.from(new Set(Object.values(mapping).filter(v => v !== SENTINEL_SKIP && v !== SENTINEL_NOTES))) as CrmFieldKey[];
  const hasNotesColumns = savedAsNotesCount > 0;

  // ─── Download sample CSV ────────────────────────────────────────────────────
  const downloadSample = () => {
    const hdr = "Property Name,Type,Address,City,State,ZIP,County,Units,Year Built,Owner Name,Last Sale Date,CoStar ID,Notes";
    const sampleRows = [
      "Sunset MHC,MHC,123 Main St,Boise,ID,83701,Ada County,48,1985,John Smith,2018-06-15,CS-12345,Owner expressed interest in selling",
      "Riverfront Apartments,Apartment,456 River Rd,Nampa,ID,83651,Canyon County,72,1998,Jane Doe,2015-03-22,CS-67890,",
      "Valley View Affordable,Affordable Housing,789 Valley Dr,Meridian,ID,83642,Ada County,60,2005,,2020-11-01,,Section 8 property",
    ];
    const csv = [hdr, ...sampleRows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "sample_properties.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Upload className="h-6 w-6 text-primary" />
            Bulk Property Import
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Upload a CSV or Excel (.xlsx) file — extra columns are automatically saved as property notes
          </p>
        </div>
        <Button variant="outline" size="sm" className="gap-2 shrink-0" onClick={downloadSample}>
          <Download className="h-3.5 w-3.5" />
          Sample CSV
        </Button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs">
        {(["upload", "map", "preview", "importing", "done"] as Step[]).map((s, i) => {
          const stepLabels: Record<Step, string> = { upload: "Upload", map: "Map Fields", preview: "Preview", importing: "Importing", done: "Done" };
          const stepIcons: Record<Step, React.ReactNode> = {
            upload: <Upload className="h-3 w-3" />,
            map: <Settings2 className="h-3 w-3" />,
            preview: <Eye className="h-3 w-3" />,
            importing: <Loader2 className="h-3 w-3" />,
            done: <CheckCircle2 className="h-3 w-3" />,
          };
          const steps: Step[] = ["upload", "map", "preview", "importing", "done"];
          const currentIdx = steps.indexOf(step);
          const isActive = s === step;
          const isDone = steps.indexOf(s) < currentIdx;
          return (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <ArrowRight className="h-3 w-3 text-muted-foreground/40" />}
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium transition-colors ${
                isActive ? "bg-primary/20 border-primary/50 text-primary" :
                isDone ? "bg-green-500/10 border-green-500/30 text-green-400" :
                "border-border text-muted-foreground"
              }`}>
                {stepIcons[s]}
                {stepLabels[s]}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── STEP 1: Upload ─────────────────────────────────────────────────── */}
      {step === "upload" && (
        <Card className="border-border bg-card">
          <CardContent className="pt-6 pb-6">
            <div
              className={`border-2 border-dashed rounded-xl p-12 flex flex-col items-center gap-4 cursor-pointer transition-colors ${
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/5"
              }`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={onDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              <div className={`p-4 rounded-full border-2 transition-colors ${isDragging ? "border-primary bg-primary/10" : "border-border bg-muted/10"}`}>
                <FileSpreadsheet className={`h-8 w-8 ${isDragging ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div className="text-center">
                <p className="text-sm font-semibold text-foreground">
                  {isDragging ? "Drop your file here" : "Drag & drop your file here"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">or click to browse</p>
                <div className="flex items-center justify-center gap-2 mt-2">
                  <Badge variant="outline" className="text-[10px] gap-1"><FileText className="h-2.5 w-2.5" />.csv</Badge>
                  <Badge variant="outline" className="text-[10px] gap-1"><FileSpreadsheet className="h-2.5 w-2.5" />.xlsx</Badge>
                  <Badge variant="outline" className="text-[10px] gap-1"><FileSpreadsheet className="h-2.5 w-2.5" />.xls</Badge>
                </div>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={onFileChange}
              />
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { icon: <Table2 className="h-4 w-4 text-primary" />, title: "Any column order", desc: "Auto-detects field mappings from your headers — works with CoStar, Yardi, and Crexi exports" },
                { icon: <StickyNote className="h-4 w-4 text-primary" />, title: "Extra columns saved as notes", desc: "Old owner, sale dates, CoStar data — all preserved as structured notes on each property" },
                { icon: <MapPin className="h-4 w-4 text-primary" />, title: "Auto geocoding", desc: "Addresses are automatically geocoded so all properties appear as pins on the map" },
              ].map((item, i) => (
                <div key={i} className="flex gap-3 p-3 rounded-lg bg-muted/10 border border-border">
                  <div className="shrink-0 mt-0.5">{item.icon}</div>
                  <div>
                    <p className="text-xs font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 2: Field Mapping ──────────────────────────────────────────── */}
      {step === "map" && (
        <div className="space-y-4">
          {/* Mapping summary banner */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/10 border border-border text-xs">
            <div className="flex items-center gap-1.5 text-green-400"><CheckCircle2 className="h-3.5 w-3.5" /><span className="font-semibold">{mappedToCrmCount}</span> mapped to CRM fields</div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5 text-amber-400"><StickyNote className="h-3.5 w-3.5" /><span className="font-semibold">{savedAsNotesCount}</span> saved as notes</div>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-1.5 text-muted-foreground"><XCircle className="h-3.5 w-3.5" /><span className="font-semibold">{skippedCount}</span> skipped</div>
          </div>

          <Card className="border-border bg-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Settings2 className="h-4 w-4 text-primary" />
                Map Columns to CRM Fields
                <Button
                  size="sm"
                  variant="outline"
                  className="ml-auto text-xs gap-1.5"
                  disabled={aiMapping}
                  onClick={() => {
                    setAiMapping(true);
                    aiMapColumns.mutate({
                      headers,
                      sampleRows: rows.slice(0, 5),
                    });
                  }}
                >
                  {aiMapping ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                  {aiMapping ? "AI Mapping..." : "AI Map Columns"}
                </Button>
                <Badge variant="outline" className="text-[10px]">
                  {fileName} · {rows.length.toLocaleString()} rows · {headers.length} columns
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              {/* Info callout about notes */}
              <div className="mb-4 flex items-start gap-2.5 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
                <StickyNote className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Columns set to <strong>"Save as Notes"</strong> will be preserved on each property as <em>Column Name: value</em> — great for CoStar IDs, sale dates, old owner info, Yardi/Crexi data, and any other research notes.</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {headers.map(h => {
                  const val = mapping[h] ?? SENTINEL_NOTES;
                  const isMapped = val !== SENTINEL_SKIP && val !== SENTINEL_NOTES;
                  const isNotes = val === SENTINEL_NOTES;
                  return (
                    <div key={h} className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                      isMapped ? "bg-green-500/5 border-green-500/20" :
                      isNotes ? "bg-amber-500/5 border-amber-500/20" :
                      "bg-muted/10 border-border"
                    }`}>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{h}</p>
                        <p className="text-[10px] text-muted-foreground truncate">
                          Sample: {rows[0]?.[headers.indexOf(h)] ?? "—"}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/40 shrink-0" />
                      <Select
                        value={val}
                        onValueChange={(v) => setMapping(prev => ({ ...prev, [h]: v as MappingValue }))}
                      >
                        <SelectTrigger className={`w-44 h-8 text-xs ${
                          isMapped ? "border-green-500/30 bg-green-500/5" :
                          isNotes ? "border-amber-500/30 bg-amber-500/5" : ""
                        }`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SENTINEL_NOTES}>📝 Save as Notes</SelectItem>
                          <SelectItem value={SENTINEL_SKIP}>— Skip this column —</SelectItem>
                          {CRM_FIELDS.map(f => (
                            <SelectItem key={`${h}-${f.key}`} value={f.key}>
                              {f.label}{"required" in f && f.required ? " *" : ""}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>

              {/* Default type notice */}
              <div className="mt-4 flex items-center gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                Properties without a mapped Type column will default to <strong>Apartment</strong>. You can change individual properties after import.
              </div>

              {/* Geocoding toggle */}
              <div className="mt-3 flex items-center gap-3 p-3 rounded-lg bg-muted/10 border border-border">
                <MapPin className="h-4 w-4 text-primary shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground">Auto-geocode addresses</p>
                  <p className="text-[10px] text-muted-foreground">Converts street addresses to map coordinates so properties appear as pins on the map</p>
                </div>
                <Switch id="geocode-toggle" checked={geocodeEnabled} onCheckedChange={setGeocodeEnabled} />
                <Label htmlFor="geocode-toggle" className="text-xs text-muted-foreground">{geocodeEnabled ? "On" : "Off"}</Label>
              </div>
              {/* Duplicate mode selector */}
              <div className="mt-2 p-3 rounded-lg bg-muted/10 border border-border">
                <p className="text-xs font-semibold text-foreground mb-2">When a property already exists in the CRM</p>
                <div className="flex flex-col gap-1.5">
                  {([
                    { value: "skip",   icon: "⏭", label: "Skip it",            desc: "Leave the existing record untouched" },
                    { value: "update", icon: "✏️", label: "Update existing",    desc: "Merge changes — only fields you edited will be updated" },
                    { value: "insert", icon: "➕", label: "Always insert new",  desc: "Create a duplicate record regardless" },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setDuplicateMode(opt.value)}
                      className={`flex items-start gap-2.5 px-3 py-2 rounded-md border text-left transition-colors ${
                        duplicateMode === opt.value
                          ? "border-primary bg-primary/10 text-foreground"
                          : "border-border bg-transparent text-muted-foreground hover:border-muted-foreground/40"
                      }`}
                    >
                      <span className="text-sm mt-0.5">{opt.icon}</span>
                      <div>
                        <p className="text-xs font-semibold leading-tight">{opt.label}</p>
                        <p className="text-[10px] leading-tight mt-0.5">{opt.desc}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Validation */}
              {!Object.values(mapping).some(v => v === "name") && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Map at least one column to <strong>Property Name</strong> to continue
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <Button variant="outline" size="sm" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Back
                </Button>
                <Button
                  size="sm"
                  disabled={!Object.values(mapping).some(v => v === "name")}
                  onClick={() => setStep("preview")}
                  className="gap-1.5"
                >
                  Preview Import <ArrowRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 3: Preview ────────────────────────────────────────────────── */}
      {step === "preview" && (
        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <Eye className="h-4 w-4 text-primary" />
                Preview — First 5 Rows
                <Badge variant="outline" className="text-[10px] ml-auto bg-primary/10 text-primary border-primary/30">
                  {rows.length.toLocaleString()} total rows to import
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {mappedFields.map(f => (
                        <th key={f} className="text-left py-2 px-3 text-muted-foreground font-semibold uppercase tracking-wide text-[10px]">
                          {CRM_FIELDS.find(c => c.key === f)?.label ?? f}
                        </th>
                      ))}
                      {hasNotesColumns && (
                        <th className="text-left py-2 px-3 text-amber-400 font-semibold uppercase tracking-wide text-[10px]">
                          <span className="flex items-center gap-1"><StickyNote className="h-2.5 w-2.5" />Notes ({savedAsNotesCount} cols)</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row, i) => (
                      <tr key={i} className="border-b border-border/40 hover:bg-muted/5">
                        {mappedFields.map(f => (
                          <td key={f} className="py-2 px-3 text-foreground">
                            {String((row as Record<string, unknown>)[f] ?? "—")}
                          </td>
                        ))}
                        {hasNotesColumns && (
                          <td className="py-2 px-3 text-amber-300/80 max-w-xs">
                            <div className="truncate text-[10px]">
                              {row.notes ? row.notes.split("\n").slice(0, 3).join(" · ") : "—"}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 5 && (
                <p className="text-xs text-muted-foreground mt-3 text-center">
                  + {rows.length - 5} more rows not shown
                </p>
              )}

              {/* Summary */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/10 border border-border text-xs text-muted-foreground">
                  <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                  {geocodeEnabled
                    ? "Geocoding ON — addresses will be converted to map coordinates"
                    : "Geocoding OFF — properties imported without map coordinates"}
                </div>
                {hasNotesColumns && (
                  <div className="flex items-center gap-2.5 p-3 rounded-lg bg-amber-500/5 border border-amber-500/20 text-xs text-amber-300">
                    <StickyNote className="h-3.5 w-3.5 shrink-0" />
                    {savedAsNotesCount} extra columns will be saved as structured notes on each property
                  </div>
                )}
              </div>

              <div className="mt-4 flex gap-3">
                <Button variant="outline" size="sm" onClick={() => setStep("map")}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Back
                </Button>
                <Button size="sm" onClick={runImport} className="gap-1.5">
                  <Upload className="h-3.5 w-3.5" />
                  Import {rows.length.toLocaleString()} Properties
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 4: Importing ─────────────────────────────────────────────── */}
      {step === "importing" && (
        <Card className="border-border bg-card">
          <CardContent className="py-16 flex flex-col items-center gap-6">
            <div className="p-4 rounded-full bg-primary/10 border border-primary/20">
              <Loader2 className="h-8 w-8 text-primary animate-spin" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-foreground">Importing {rows.length.toLocaleString()} properties…</p>
              <p className="text-xs text-muted-foreground mt-1">
                {geocodeEnabled ? "Geocoding addresses and inserting into your database" : "Inserting into your database"}
              </p>
            </div>
            <div className="w-full max-w-sm">
              <Progress value={undefined} className="h-2" />
            </div>
            <p className="text-xs text-muted-foreground">This may take a moment for large files with geocoding enabled</p>
          </CardContent>
        </Card>
      )}

      {/* ── STEP 5: Done ──────────────────────────────────────────────────── */}
      {step === "done" && importResult && (
        <div className="space-y-4">
          <Card className="border-border bg-card border-l-4 border-l-green-500">
            <CardContent className="py-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-green-500/10 border border-green-500/20 shrink-0">
                  <CheckCircle2 className="h-6 w-6 text-green-400" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Import complete!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {importResult.inserted.toLocaleString()} properties added to your CRM
                    {hasNotesColumns ? ` — ${savedAsNotesCount} extra columns saved as notes on each property` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "Total Rows", value: importResult.total, color: "text-foreground" },
                  { label: "Imported", value: importResult.inserted, color: "text-green-400" },
                  { label: "Geocoded", value: importResult.geocoded, color: "text-blue-400" },
                  { label: "Skipped", value: importResult.skipped ?? 0, color: importResult.skipped > 0 ? "text-amber-400" : "text-muted-foreground" },
                  { label: "Failed", value: importResult.failed, color: importResult.failed > 0 ? "text-red-400" : "text-muted-foreground" },
                ].map(stat => (
                  <div key={stat.label} className="text-center p-3 rounded-lg bg-muted/10 border border-border">
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

              {/* Failed rows */}
              {importResult.failed > 0 && (
                <div className="mt-4 space-y-1.5">
                  <p className="text-xs font-semibold text-red-400 flex items-center gap-1.5">
                    <XCircle className="h-3.5 w-3.5" />
                    Failed rows
                  </p>
                  {importResult.results.filter(r => r.status === "error").map(r => (
                    <div key={r.index} className="text-xs text-muted-foreground bg-red-500/5 border border-red-500/20 rounded px-3 py-1.5">
                      Row {r.index + 1}: <strong className="text-foreground">{r.name}</strong> — {r.error}
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-5 flex gap-3">
                <Link href="/properties">
                  <Button size="sm" className="gap-1.5">
                    <ArrowRight className="h-3.5 w-3.5" />
                    View Properties
                  </Button>
                </Link>
                <Link href="/map">
                  <Button variant="outline" size="sm" className="gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    View on Map
                  </Button>
                </Link>
                <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 ml-auto">
                  <Upload className="h-3.5 w-3.5" />
                  Import Another File
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
