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
  ArrowRight,
  RotateCcw,
  AlertCircle,
  Loader2,
  Eye,
  StickyNote,
  Users,
  Link2,
  AlertTriangle,
  UserCheck,
  UserPlus,
  SkipForward,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Link } from "wouter";
import * as XLSX from "xlsx";

// ─── CRM fields available for mapping ────────────────────────────────────────
const CRM_FIELDS = [
  { key: "firstName", label: "First Name", required: true },
  { key: "lastName", label: "Last Name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "address", label: "Street Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "ZIP Code" },
  { key: "isOwner", label: "Is Property Owner (true/false)" },
  { key: "isBuyer", label: "Is Buyer (true/false)" },
  { key: "priority", label: "Priority (hot/warm/cold/inactive)" },
  { key: "notes", label: "Notes (primary)" },
  { key: "ownerNotes", label: "Owner Notes" },
  { key: "fullName", label: "Full Name (auto-split)" },
] as const;

type CrmFieldKey = (typeof CRM_FIELDS)[number]["key"];

const SENTINEL_SKIP = "__skip__";
const SENTINEL_NOTES = "__save_as_notes__";

type MappingValue = CrmFieldKey | typeof SENTINEL_SKIP | typeof SENTINEL_NOTES;

// ─── CSV parser ───────────────────────────────────────────────────────────────
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

// ─── Excel parser ─────────────────────────────────────────────────────────────
function parseXLSX(buffer: ArrayBuffer): { headers: string[]; rows: string[][] } {
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return { headers: [], rows: [] };
  const sheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: "" });
  if (data.length < 2) return { headers: [], rows: [] };
  const headers = (data[0] as string[]).map(h => String(h ?? "").trim()).filter(h => h !== "");
  const rows = data.slice(1)
    .map(row => headers.map((_, i) => String((row as string[])[i] ?? "").trim()))
    .filter(r => r.some(c => c !== ""));
  return { headers, rows };
}

// ─── Auto-suggest mapping ─────────────────────────────────────────────────────
function autoSuggestMapping(headers: string[]): Record<string, MappingValue> {
  const mapping: Record<string, MappingValue> = {};
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const matchers: Array<{ patterns: string[]; field: CrmFieldKey }> = [
    { patterns: ["fullname", "name", "contactname", "ownername"], field: "fullName" },
    { patterns: ["firstname", "first", "fname", "givenname"], field: "firstName" },
    { patterns: ["lastname", "last", "lname", "surname", "familyname"], field: "lastName" },
    { patterns: ["email", "emailaddress", "mail"], field: "email" },
    { patterns: ["phone", "phonenumber", "mobile", "cell", "telephone"], field: "phone" },
    { patterns: ["company", "firm", "organization", "employer", "business"], field: "company" },
    { patterns: ["address", "streetaddress", "street", "addr"], field: "address" },
    { patterns: ["city", "municipality", "town"], field: "city" },
    { patterns: ["state", "st"], field: "state" },
    { patterns: ["zip", "zipcode", "postalcode", "postal"], field: "zip" },
    { patterns: ["isowner", "owner", "propertyowner"], field: "isOwner" },
    { patterns: ["isbuyer", "buyer"], field: "isBuyer" },
    { patterns: ["priority", "tier", "rank"], field: "priority" },
    { patterns: ["notes", "comments", "description", "remarks"], field: "notes" },
    { patterns: ["ownernotes", "sellernotes"], field: "ownerNotes" },
  ];
  const usedFields = new Set<string>();
  headers.forEach(h => {
    const norm = normalize(h);
    const match = matchers.find(m => !usedFields.has(m.field) && m.patterns.some(p => norm === p || norm.startsWith(p) || p.startsWith(norm)));
    if (match) {
      mapping[h] = match.field;
      usedFields.add(match.field);
    } else {
      mapping[h] = SENTINEL_NOTES;
    }
  });
  return mapping;
}

// ─── Normalize priority ───────────────────────────────────────────────────────
function normalizePriority(raw: string): "hot" | "warm" | "cold" | "inactive" {
  const v = raw.toLowerCase().trim();
  if (v.includes("hot") || v.includes("high")) return "hot";
  if (v.includes("cold") || v.includes("low")) return "cold";
  if (v.includes("inact") || v.includes("dead")) return "inactive";
  return "warm";
}

// ─── Step types ───────────────────────────────────────────────────────────────
type Step = "upload" | "map" | "preview" | "review" | "importing" | "done";

type DuplicateFlag = {
  index: number;
  matches: Array<{ id: number; firstName: string; lastName: string | null; email: string | null; phone: string | null; company: string | null }>;
};

type RowDecision = "skip" | "create";

type ImportResult = {
  total: number;
  inserted: number;
  linked: number;
  skipped: number;
  failed: number;
  results: Array<{ index: number; name: string; status: string; linkedPropertyId?: number; error?: string }>;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function ImportContacts() {
  const [step, setStep] = useState<Step>("upload");
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<Record<string, MappingValue>>({});
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [duplicateFlags, setDuplicateFlags] = useState<DuplicateFlag[]>([]);
  const [rowDecisions, setRowDecisions] = useState<Record<number, RowDecision>>({});
  const [isScanning, setIsScanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scanImport = trpc.contacts.scanImportForDuplicates.useMutation();

  const bulkImport = trpc.contacts.bulkImport.useMutation({
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
        if (h.length === 0) { toast.error("Could not parse CSV"); return; }
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
        if (h.length === 0) { toast.error("Could not parse Excel file"); return; }
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
          if (val.trim()) extraNotes.push(`${h}: ${val.trim()}`);
        } else {
          mapped[field] = val;
        }
      });

      // Handle fullName split
      let firstName = mapped.firstName ?? "";
      let lastName = mapped.lastName ?? "";
      if (mapped.fullName && (!firstName || !lastName)) {
        const parts = mapped.fullName.trim().split(/\s+/);
        if (parts.length >= 2) {
          firstName = firstName || parts[0];
          lastName = lastName || parts.slice(1).join(" ");
        } else {
          firstName = firstName || mapped.fullName;
          lastName = lastName || "—";
        }
      }

      const noteParts: string[] = [];
      if (mapped.notes?.trim()) noteParts.push(mapped.notes.trim());
      if (extraNotes.length > 0) {
        noteParts.push("--- Additional Data ---");
        noteParts.push(...extraNotes);
      }

      return {
        firstName: firstName || "Unknown",
        lastName: lastName || "—",
        email: mapped.email || undefined,
        phone: mapped.phone || undefined,
        company: mapped.company || undefined,
        isOwner: mapped.isOwner ? ["true", "yes", "1", "y"].includes(mapped.isOwner.toLowerCase()) : false,
        isBuyer: mapped.isBuyer ? ["true", "yes", "1", "y"].includes(mapped.isBuyer.toLowerCase()) : false,
        address: mapped.address || undefined,
        city: mapped.city || undefined,
        state: mapped.state || undefined,
        zip: mapped.zip || undefined,
        priority: mapped.priority ? normalizePriority(mapped.priority) : ("warm" as const),
        notes: noteParts.length > 0 ? noteParts.join("\n") : undefined,
        ownerNotes: mapped.ownerNotes || undefined,
        linkedPropertyOwnerName: mapped.fullName || (firstName && lastName ? `${firstName} ${lastName}` : undefined),
      };
    });
  };

  const handlePreviewNext = async () => {
    const importRows = buildImportRows();
    setIsScanning(true);
    try {
      const scanRows = importRows.map((r, i) => ({
        index: i,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
      }));
      const flags = await scanImport.mutateAsync({ rows: scanRows });
      if (flags.length > 0) {
        setDuplicateFlags(flags);
        // Default decision: skip all flagged rows
        const defaults: Record<number, RowDecision> = {};
        flags.forEach(f => { defaults[f.index] = "skip"; });
        setRowDecisions(defaults);
        setStep("review");
      } else {
        // No duplicates — go straight to import
        setStep("importing");
        bulkImport.mutate({ rows: importRows, skipDuplicates: false });
      }
    } catch {
      toast.error("Duplicate scan failed — proceeding with import");
      setStep("importing");
      bulkImport.mutate({ rows: importRows, skipDuplicates });
    } finally {
      setIsScanning(false);
    }
  };

  const runImportAfterReview = () => {
    const importRows = buildImportRows();
    // Filter out rows the user decided to skip
    const filteredRows = importRows.filter((_, i) => {
      const flag = duplicateFlags.find(f => f.index === i);
      if (!flag) return true; // not flagged — always import
      return rowDecisions[i] === "create"; // only import if user chose "create new"
    });
    setStep("importing");
    bulkImport.mutate({ rows: filteredRows, skipDuplicates: false });
  };

  const runImport = () => {
    const importRows = buildImportRows();
    setStep("importing");
    bulkImport.mutate({ rows: importRows, skipDuplicates });
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

  // ─── Stats ─────────────────────────────────────────────────────────────────
  const mappedToCrmCount = Object.values(mapping).filter(v => v !== SENTINEL_SKIP && v !== SENTINEL_NOTES).length;
  const savedAsNotesCount = Object.values(mapping).filter(v => v === SENTINEL_NOTES).length;
  const hasNotesColumns = savedAsNotesCount > 0;
  const previewRows = buildImportRows().slice(0, 5);
  const mappedFields = Array.from(new Set(
    Object.values(mapping).filter(v => v !== SENTINEL_SKIP && v !== SENTINEL_NOTES && v !== "fullName")
  )) as CrmFieldKey[];
  const hasNameMapping = Object.values(mapping).some(v => v === "firstName" || v === "lastName" || v === "fullName");

  return (
    <div className="p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Import Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Bulk import contacts from CSV or Excel files</p>
        </div>
        <div className="flex items-center gap-2">
          {step !== "upload" && (
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> Start Over
            </Button>
          )}
        </div>
      </div>

      {/* Progress indicator */}
      {step !== "upload" && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {["upload", "map", "preview", "review", "importing", "done"].map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              {i > 0 && <div className="h-px w-6 bg-border" />}
              <span className={`px-2 py-0.5 rounded-full ${(() => {
                const ORDER = ["upload", "map", "preview", "review", "importing", "done"];
                const currentIdx = ORDER.indexOf(step);
                const itemIdx = ORDER.indexOf(s);
                if (step === s) return "bg-primary text-primary-foreground font-semibold";
                if (itemIdx < currentIdx) return "text-primary";
                return "text-muted-foreground";
              })()}`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* ── STEP 1: Upload ────────────────────────────────────────────────── */}
      {step === "upload" && (
        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardContent className="py-8">
              <div
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-colors cursor-pointer ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/5"}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFileChange} />
                <div className="flex flex-col items-center gap-3">
                  <div className="p-4 rounded-full bg-primary/10 border border-primary/20">
                    <Upload className="h-8 w-8 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Drop your CSV or Excel file here</p>
                    <p className="text-xs text-muted-foreground mt-1">or click to browse — .csv, .xlsx, .xls supported</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tips */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Expected Columns
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                {[
                  { col: "First Name / Last Name", note: "or Full Name (auto-split)" },
                  { col: "Email", note: "optional, used for dedup" },
                  { col: "Phone", note: "optional" },
                  { col: "Company", note: "optional" },
                  { col: "Is Owner (true/false)", note: "optional" },
                  { col: "Priority (hot/warm/cold)", note: "optional" },
                ].map(({ col, note }) => (
                  <div key={col} className="text-xs p-2 rounded-lg bg-muted/10 border border-border">
                    <p className="font-semibold text-foreground">{col}</p>
                    <p className="text-muted-foreground">{note}</p>
                  </div>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-3">
                Any column not mapped to a CRM field will be saved as structured notes on each contact.
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 2: Map Columns ───────────────────────────────────────────── */}
      {step === "map" && (
        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" />
                Map Columns
                <Badge variant="outline" className="text-[10px] ml-auto bg-primary/10 text-primary border-primary/30">
                  {rows.length.toLocaleString()} rows · {fileName}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="flex gap-4 mb-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />{mappedToCrmCount} mapped to CRM fields</span>
                <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />{savedAsNotesCount} saved as notes</span>
              </div>
              <div className="space-y-2">
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
                        <SelectTrigger className={`w-52 h-8 text-xs ${
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

              {/* Skip duplicates toggle */}
              <div className="mt-4 flex items-center gap-3 p-3 rounded-lg bg-muted/10 border border-border">
                <XCircle className="h-4 w-4 text-amber-400 shrink-0" />
                <div className="flex-1">
                  <p className="text-xs font-semibold text-foreground">Skip duplicates</p>
                  <p className="text-[10px] text-muted-foreground">Contacts matching an existing name or email will be skipped</p>
                </div>
                <Switch id="skip-dup-toggle" checked={skipDuplicates} onCheckedChange={setSkipDuplicates} />
                <Label htmlFor="skip-dup-toggle" className="text-xs text-muted-foreground">{skipDuplicates ? "On" : "Off"}</Label>
              </div>

              {/* Auto-link notice */}
              <div className="mt-2 flex items-center gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300">
                <Link2 className="h-3.5 w-3.5 shrink-0" />
                Contacts will be auto-linked to existing properties where the owner name matches
              </div>

              {/* Validation */}
              {!hasNameMapping && (
                <div className="mt-3 flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                  Map at least <strong>First Name + Last Name</strong> or <strong>Full Name</strong> to continue
                </div>
              )}

              <div className="mt-4 flex gap-3">
                <Button variant="outline" size="sm" onClick={reset}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Back
                </Button>
                <Button
                  size="sm"
                  disabled={!hasNameMapping}
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

      {/* ── STEP 3: Preview ───────────────────────────────────────────────── */}
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

              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-muted/10 border border-border text-xs text-muted-foreground">
                  <XCircle className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                  {skipDuplicates ? "Duplicates will be skipped (same name or email)" : "Duplicates will be imported (skip-duplicates OFF)"}
                </div>
                <div className="flex items-center gap-2.5 p-3 rounded-lg bg-blue-500/5 border border-blue-500/20 text-xs text-blue-300">
                  <Link2 className="h-3.5 w-3.5 shrink-0" />
                  Auto-linking to properties by owner name match
                </div>
              </div>

              <div className="mt-4 flex gap-3">
                <Button variant="outline" size="sm" onClick={() => setStep("map")}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Back
                </Button>
                <Button size="sm" onClick={handlePreviewNext} disabled={isScanning} className="gap-1.5">
                  {isScanning ? (
                    <><Loader2 className="h-3.5 w-3.5 animate-spin" />Scanning for duplicates…</>
                  ) : (
                    <><ArrowRight className="h-3.5 w-3.5" />Check for Duplicates &amp; Import</>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── STEP 3.5: Duplicate Review ─────────────────────────────────────── */}
      {step === "review" && (
        <div className="space-y-4">
          <Card className="border-amber-500/40 bg-card">
            <CardHeader className="pb-2 pt-4">
              <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400" />
                Duplicate Review
                <Badge variant="outline" className="text-[10px] ml-auto bg-amber-500/10 text-amber-400 border-amber-500/30">
                  {duplicateFlags.length} possible duplicate{duplicateFlags.length !== 1 ? "s" : ""} found
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                The rows below closely match contacts already in your CRM. Choose what to do with each one before importing.
              </p>

              {/* Summary bar */}
              <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/10 border border-border text-xs">
                <span className="text-muted-foreground">
                  <span className="font-semibold text-foreground">{rows.length - duplicateFlags.length}</span> rows have no duplicates and will be imported automatically.
                </span>
                <span className="text-muted-foreground ml-auto">
                  <span className="font-semibold text-amber-400">{Object.values(rowDecisions).filter(d => d === "skip").length}</span> skipped ·{" "}
                  <span className="font-semibold text-green-400">{Object.values(rowDecisions).filter(d => d === "create").length}</span> will create new
                </span>
              </div>

              {/* Per-row cards */}
              <div className="space-y-3">
                {duplicateFlags.map((flag) => {
                  const importRows = buildImportRows();
                  const incoming = importRows[flag.index];
                  const decision = rowDecisions[flag.index] ?? "skip";
                  const topMatch = flag.matches[0];
                  return (
                    <div
                      key={flag.index}
                      className={`rounded-lg border p-3 transition-colors ${
                        decision === "skip"
                          ? "border-border bg-muted/5 opacity-70"
                          : "border-green-500/40 bg-green-500/5"
                      }`}
                    >
                      {/* Row header */}
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <p className="text-xs font-semibold text-foreground">
                            Row {flag.index + 1}: {incoming?.firstName} {incoming?.lastName}
                          </p>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {[incoming?.email, incoming?.phone, incoming?.company].filter(Boolean).join(" · ") || "No additional fields"}
                          </p>
                        </div>
                        <div className="flex gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant={decision === "skip" ? "default" : "outline"}
                            className={`h-7 text-[10px] gap-1 ${
                              decision === "skip" ? "bg-muted/60 hover:bg-muted/80 text-foreground" : ""
                            }`}
                            onClick={() => setRowDecisions(prev => ({ ...prev, [flag.index]: "skip" }))}
                          >
                            <SkipForward className="h-3 w-3" />
                            Skip
                          </Button>
                          <Button
                            size="sm"
                            variant={decision === "create" ? "default" : "outline"}
                            className={`h-7 text-[10px] gap-1 ${
                              decision === "create" ? "bg-green-600 hover:bg-green-700 text-white border-green-600" : ""
                            }`}
                            onClick={() => setRowDecisions(prev => ({ ...prev, [flag.index]: "create" }))}
                          >
                            <UserPlus className="h-3 w-3" />
                            Create New
                          </Button>
                        </div>
                      </div>

                      {/* Matched contact */}
                      <div className="flex items-center gap-2 p-2 rounded bg-amber-500/5 border border-amber-500/20">
                        <UserCheck className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <div className="text-[10px] text-muted-foreground">
                          <span className="text-amber-300 font-semibold">Matches:</span>{" "}
                          {topMatch.firstName} {topMatch.lastName}
                          {topMatch.email && <span> · {topMatch.email}</span>}
                          {topMatch.phone && <span> · {topMatch.phone}</span>}
                          {topMatch.company && <span> · {topMatch.company}</span>}
                        </div>
                        <Link href={`/contacts/${topMatch.id}`} className="ml-auto shrink-0">
                          <Button variant="ghost" size="sm" className="h-6 text-[10px] text-amber-400 hover:text-amber-300 px-2">
                            View
                          </Button>
                        </Link>
                      </div>

                      {flag.matches.length > 1 && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 pl-1">
                          +{flag.matches.length - 1} other possible match{flag.matches.length - 1 !== 1 ? "es" : ""}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Action buttons */}
              <div className="mt-4 flex gap-3 flex-wrap">
                <Button variant="outline" size="sm" onClick={() => setStep("preview")}>
                  <RotateCcw className="h-3.5 w-3.5 mr-1.5" />Back
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-muted-foreground"
                  onClick={() => {
                    const all: Record<number, RowDecision> = {};
                    duplicateFlags.forEach(f => { all[f.index] = "skip"; });
                    setRowDecisions(all);
                  }}
                >
                  <SkipForward className="h-3.5 w-3.5 mr-1.5" />Skip All Duplicates
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-green-400 border-green-500/30 hover:bg-green-500/10"
                  onClick={() => {
                    const all: Record<number, RowDecision> = {};
                    duplicateFlags.forEach(f => { all[f.index] = "create"; });
                    setRowDecisions(all);
                  }}
                >
                  <UserPlus className="h-3.5 w-3.5 mr-1.5" />Create All Anyway
                </Button>
                <Button size="sm" onClick={runImportAfterReview} className="gap-1.5 ml-auto">
                  <Upload className="h-3.5 w-3.5" />
                  Import{" "}
                  {(rows.length - duplicateFlags.length + Object.values(rowDecisions).filter(d => d === "create").length).toLocaleString()}{" "}
                  Contacts
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
              <p className="text-sm font-semibold text-foreground">Importing {rows.length.toLocaleString()} contacts…</p>
              <p className="text-xs text-muted-foreground mt-1">Checking for duplicates and linking to properties</p>
            </div>
            <div className="w-full max-w-sm">
              <Progress value={undefined} className="h-2" />
            </div>
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
                    {importResult.inserted.toLocaleString()} contacts added to your CRM
                    {importResult.linked > 0 ? ` · ${importResult.linked} linked to properties` : ""}
                  </p>
                </div>
              </div>

              <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  { label: "Total Rows", value: importResult.total, color: "text-foreground" },
                  { label: "Imported", value: importResult.inserted, color: "text-green-400" },
                  { label: "Linked", value: importResult.linked, color: "text-blue-400" },
                  { label: "Skipped", value: importResult.skipped, color: importResult.skipped > 0 ? "text-amber-400" : "text-muted-foreground" },
                  { label: "Failed", value: importResult.failed, color: importResult.failed > 0 ? "text-red-400" : "text-muted-foreground" },
                ].map(stat => (
                  <div key={stat.label} className="text-center p-3 rounded-lg bg-muted/10 border border-border">
                    <p className={`text-xl font-bold ${stat.color}`}>{stat.value.toLocaleString()}</p>
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide mt-0.5">{stat.label}</p>
                  </div>
                ))}
              </div>

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
                <Link href="/contacts">
                  <Button size="sm" className="gap-1.5">
                    <Users className="h-3.5 w-3.5" />
                    View Contacts
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
