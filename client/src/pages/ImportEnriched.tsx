import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { ArrowLeft, Upload, FileSpreadsheet, CheckCircle2, AlertCircle, Loader2, Building2, Users, XCircle } from "lucide-react";
import * as XLSX from "xlsx";

type EnrichedRow = {
  propertyName?: string | null;
  assetType?: string | null;
  propertyAddress?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  units?: string | null;
  yearBuilt?: string | null;
  ownerName?: string | null;
  ownerAddress?: string | null;
  contact1Name?: string | null;
  contact1Phone?: string | null;
  contact1Email?: string | null;
  contact2Name?: string | null;
  contact2Phone?: string | null;
  contact2Email?: string | null;
  lastSoldDate?: string | null;
  lastSoldPrice?: string | null;
  lastContacted?: string | null;
  dataSource?: string | null;
  notes?: string | null;
  toDo?: string | null;
  sourceDetailNotes?: string | null;
  researchConfidence?: string | null;
  duplicateOwnerFlag?: string | null;
  importNotes?: string | null;
  market?: string | null;
};

const COLUMN_MAP: Record<string, keyof EnrichedRow> = {
  // Title Case (original format)
  "Property Name": "propertyName",
  "Asset Type": "assetType",
  "Property Address": "propertyAddress",
  "City": "city",
  "State": "state",
  "Zip": "zip",
  "Units": "units",
  "Year Built": "yearBuilt",
  "Owner Name": "ownerName",
  "Owner Address": "ownerAddress",
  "Contact 1 Name": "contact1Name",
  "Contact 1 Phone": "contact1Phone",
  "Contact 1 Email": "contact1Email",
  "Contact 2 Name": "contact2Name",
  "Contact 2 Phone": "contact2Phone",
  "Contact 2 Email": "contact2Email",
  "Last Sold Date": "lastSoldDate",
  "Last Sold Price": "lastSoldPrice",
  "Last Contacted": "lastContacted",
  "Data Source": "dataSource",
  "Notes": "notes",
  "To Do": "toDo",
  "Source Detail Notes": "sourceDetailNotes",
  "Research Confidence": "researchConfidence",
  "Duplicate Owner Flag": "duplicateOwnerFlag",
  "Import Notes": "importNotes",
  "Market": "market",
  // camelCase aliases (your spreadsheet format)
  "propertyName": "propertyName",
  "assetType": "assetType",
  "propertyAddress": "propertyAddress",
  "city": "city",
  "state": "state",
  "zip": "zip",
  "units": "units",
  "yearBuilt": "yearBuilt",
  "ownerName": "ownerName",
  "ownerAddress": "ownerAddress",
  "contact1Name": "contact1Name",
  "contact1Phone": "contact1Phone",
  "contact1Email": "contact1Email",
  "contact2Name": "contact2Name",
  "contact2Phone": "contact2Phone",
  "contact2Email": "contact2Email",
  "lastSoldDate": "lastSoldDate",
  "lastSoldPrice": "lastSoldPrice",
  "lastContacted": "lastContacted",
  "dataSource": "dataSource",
  "notes": "notes",
  "toDo": "toDo",
  "sourceDetailNotes": "sourceDetailNotes",
  "researchConfidence": "researchConfidence",
  "duplicateOwnerFlag": "duplicateOwnerFlag",
  "importNotes": "importNotes",
  "market": "market",
};

const BATCH_SIZE = 50;

type BatchResult = {
  propertiesInserted: number;
  contactsInserted: number;
  propertiesSkipped: number;
  errors: string[];
};

export default function ImportEnriched() {
  const [, setLocation] = useLocation();
  const [isDragging, setIsDragging] = useState(false);
  const [rows, setRows] = useState<EnrichedRow[]>([]);
  const [fileName, setFileName] = useState<string>("");
  const [step, setStep] = useState<"upload" | "preview" | "importing" | "done">("upload");

  // Batched import state
  const [batchProgress, setBatchProgress] = useState(0);
  const [totalBatches, setTotalBatches] = useState(0);
  const [currentBatch, setCurrentBatch] = useState(0);
  const [cumulativeResult, setCumulativeResult] = useState<BatchResult>({ propertiesInserted: 0, contactsInserted: 0, propertiesSkipped: 0, errors: [] });
  const abortRef = useRef(false);

  const enrichedImport = trpc.properties.enrichedImport.useMutation();

  const parseFile = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null });
        const parsed: EnrichedRow[] = raw.map((r) => {
          const row: EnrichedRow = {};
          for (const [col, field] of Object.entries(COLUMN_MAP)) {
            const val = r[col];
            (row as Record<string, unknown>)[field] = val != null ? String(val) : null;
          }
          return row;
        });
        setRows(parsed.filter(r => r.propertyName?.trim()));
        setFileName(file.name);
        setStep("preview");
      } catch {
        toast.error("Could not parse file. Make sure it's an Excel (.xlsx) file.");
      }
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
  }, [parseFile]);

  const runImport = async () => {
    setStep("importing");
    abortRef.current = false;

    const batches: EnrichedRow[][] = [];
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      batches.push(rows.slice(i, i + BATCH_SIZE));
    }
    setTotalBatches(batches.length);
    setCurrentBatch(0);
    setBatchProgress(0);

    const accumulated: BatchResult = { propertiesInserted: 0, contactsInserted: 0, propertiesSkipped: 0, errors: [] };

    for (let i = 0; i < batches.length; i++) {
      if (abortRef.current) {
        toast.warning(`Import cancelled after ${accumulated.propertiesInserted} properties.`);
        setCumulativeResult(accumulated);
        setStep("done");
        return;
      }

      setCurrentBatch(i + 1);
      setBatchProgress(Math.round(((i) / batches.length) * 100));

      try {
        const result = await enrichedImport.mutateAsync({ rows: batches[i] });
        accumulated.propertiesInserted += result.propertiesInserted;
        accumulated.contactsInserted += result.contactsInserted;
        accumulated.propertiesSkipped += result.propertiesSkipped;
        accumulated.errors.push(...result.errors);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        accumulated.errors.push(`Batch ${i + 1}: ${msg}`);
        // Continue with next batch even if one fails
      }
    }

    setBatchProgress(100);
    setCumulativeResult(accumulated);
    setStep("done");
    toast.success(`Import complete! ${accumulated.propertiesInserted} properties, ${accumulated.contactsInserted} contacts.`);
  };

  const cancelImport = () => {
    abortRef.current = true;
  };

  // Count stats from preview
  const rowsWithContact1 = rows.filter(r => r.contact1Name?.trim()).length;
  const rowsWithContact2 = rows.filter(r => r.contact2Name?.trim()).length;
  const rowsWithAddress = rows.filter(r => r.propertyAddress?.trim()).length;
  const rowsWithMarket = rows.filter(r => r.market?.trim()).length;
  const rowsWithImportNotes = rows.filter(r => r.importNotes?.trim()).length;

  const progressPercent = totalBatches > 0 ? Math.round((currentBatch / totalBatches) * 100) : 0;
  const rowsProcessed = Math.min(currentBatch * BATCH_SIZE, rows.length);

  return (
    <div className="p-6 max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/properties")} className="shrink-0">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold text-foreground">Import Enriched File</h1>
          <p className="text-sm text-muted-foreground">Import your combined properties + contacts Excel file in one step</p>
        </div>
      </div>

      {step === "upload" && (
        <Card className="border-border bg-card">
          <CardContent className="pt-6">
            <div
              className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleDrop}
            >
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-base font-medium text-foreground mb-1">Drop your enriched Excel file here</p>
              <p className="text-sm text-muted-foreground mb-4">Supports the CRM_Import_Enriched.xlsx format with Contact 1 + Contact 2 columns</p>
              <label className="cursor-pointer">
                <Button variant="outline" className="gap-2" asChild>
                  <span><Upload className="h-4 w-4" /> Browse File</span>
                </Button>
                <input type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFileInput} />
              </label>
            </div>

            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              <div className="p-3 rounded-lg bg-muted/30">
                <Building2 className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-xs text-muted-foreground">Properties</p>
                <p className="text-sm font-medium text-foreground">Auto-geocoded</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <Users className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-xs text-muted-foreground">Contacts</p>
                <p className="text-sm font-medium text-foreground">Contact 1 + 2</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/30">
                <CheckCircle2 className="h-5 w-5 mx-auto mb-1 text-primary" />
                <p className="text-xs text-muted-foreground">Duplicates</p>
                <p className="text-sm font-medium text-foreground">Auto-skipped</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "preview" && (
        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">File Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/30">
                <FileSpreadsheet className="h-8 w-8 text-primary shrink-0" />
                <div>
                  <p className="text-sm font-medium text-foreground">{fileName}</p>
                  <p className="text-xs text-muted-foreground">{rows.length} properties ready to import · {Math.ceil(rows.length / BATCH_SIZE)} batches of {BATCH_SIZE}</p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Properties</p>
                  <p className="text-2xl font-bold text-foreground">{rows.length}</p>
                  <p className="text-xs text-muted-foreground">{rowsWithAddress} with geocodable address</p>
                </div>
                <div className="p-3 rounded-lg bg-muted/30 space-y-1">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Contacts</p>
                  <p className="text-2xl font-bold text-foreground">{rowsWithContact1 + rowsWithContact2}</p>
                  <p className="text-xs text-muted-foreground">{rowsWithContact1} primary · {rowsWithContact2} secondary</p>
                </div>
                {rowsWithMarket > 0 && (
                  <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 space-y-1">
                    <p className="text-xs text-violet-400 uppercase tracking-wide">Market Assigned</p>
                    <p className="text-2xl font-bold text-foreground">{rowsWithMarket}</p>
                    <p className="text-xs text-muted-foreground">will auto-link to market KB</p>
                  </div>
                )}
                {rowsWithImportNotes > 0 && (
                  <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1">
                    <p className="text-xs text-amber-400 uppercase tracking-wide">Research Notes</p>
                    <p className="text-2xl font-bold text-foreground">{rowsWithImportNotes}</p>
                    <p className="text-xs text-muted-foreground">permanent, never overwritten</p>
                  </div>
                )}
              </div>

              {/* Property list preview */}
              <div className="max-h-64 overflow-y-auto space-y-1 rounded-lg border border-border p-2">
                {rows.map((row, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-muted/30">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{row.propertyName}</p>
                      <p className="text-xs text-muted-foreground truncate">{[row.propertyAddress, row.city, row.state].filter(Boolean).join(", ")}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {row.units && <Badge variant="outline" className="text-xs px-1.5 py-0">{row.units}u</Badge>}
                      {row.contact1Name && <Badge variant="outline" className="text-xs px-1.5 py-0 bg-primary/10 text-primary border-primary/20">Contact</Badge>}
                      {row.market && <Badge variant="outline" className="text-xs px-1.5 py-0 bg-violet-500/10 text-violet-400 border-violet-500/20">{row.market}</Badge>}
                      {row.importNotes && <Badge variant="outline" className="text-xs px-1.5 py-0 bg-amber-500/10 text-amber-400 border-amber-500/20">Notes</Badge>}
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => { setStep("upload"); setRows([]); setFileName(""); }}>
                  Change File
                </Button>
                <Button onClick={runImport} className="gap-2">
                  <Upload className="h-4 w-4" />
                  Import {rows.length} Properties
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {step === "importing" && (
        <Card className="border-border bg-card">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="text-center">
              <Loader2 className="h-12 w-12 mx-auto text-primary animate-spin mb-3" />
              <p className="text-base font-semibold text-foreground">Importing & Geocoding...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Batch {currentBatch} of {totalBatches} · {rowsProcessed.toLocaleString()} / {rows.length.toLocaleString()} properties
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{cumulativeResult.propertiesInserted} imported · {cumulativeResult.contactsInserted} contacts created</span>
                <span>{progressPercent}%</span>
              </div>
              <Progress value={progressPercent} className="h-3" />
            </div>

            <div className="text-center">
              <p className="text-xs text-muted-foreground mb-3">You can safely navigate away — import continues in the background. Come back to this page to check progress.</p>
              <Button variant="outline" size="sm" onClick={cancelImport} className="gap-2 text-destructive border-destructive/30 hover:bg-destructive/10">
                <XCircle className="h-4 w-4" />
                Cancel Import
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "done" && (
        <Card className="border-border bg-card">
          <CardContent className="pt-8 pb-8 space-y-6">
            <div className="text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-3" />
              <h2 className="text-xl font-bold text-foreground">Import Complete</h2>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/20 text-center">
                <p className="text-2xl font-bold text-green-400">{cumulativeResult.propertiesInserted}</p>
                <p className="text-xs text-muted-foreground mt-1">Properties Imported</p>
              </div>
              <div className="p-4 rounded-lg bg-primary/10 border border-primary/20 text-center">
                <p className="text-2xl font-bold text-primary">{cumulativeResult.contactsInserted}</p>
                <p className="text-xs text-muted-foreground mt-1">Contacts Created</p>
              </div>
              <div className="p-4 rounded-lg bg-muted/30 border border-border text-center">
                <p className="text-2xl font-bold text-muted-foreground">{cumulativeResult.propertiesSkipped}</p>
                <p className="text-xs text-muted-foreground mt-1">Duplicates Skipped</p>
              </div>
            </div>

            {cumulativeResult.errors.length > 0 && (
              <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-red-400 text-sm font-medium">
                  <AlertCircle className="h-4 w-4" />
                  {cumulativeResult.errors.length} errors
                </div>
                {cumulativeResult.errors.slice(0, 5).map((e, i) => (
                  <p key={i} className="text-xs text-muted-foreground pl-5">{e}</p>
                ))}
                {cumulativeResult.errors.length > 5 && (
                  <p className="text-xs text-muted-foreground pl-5">...and {cumulativeResult.errors.length - 5} more</p>
                )}
              </div>
            )}

            <div className="flex gap-2 justify-center">
              <Button variant="outline" onClick={() => setLocation("/map")} className="gap-2">
                <Building2 className="h-4 w-4" /> View on Map
              </Button>
              <Button onClick={() => setLocation("/properties")} className="gap-2">
                View Properties
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
