import { useCallback, useRef, useState } from "react";
import {
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  MapPin,
  Upload,
  Users,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { parseKmlFile, type KmlPlacemark } from "@/lib/kmlParser";

// ─── Field definitions for mapping ─────────────────────────────────────────

const CONTACT_FIELDS = [
  { key: "firstName", label: "First Name", required: true },
  { key: "lastName", label: "Last Name", required: true },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "company", label: "Company" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
  { key: "notes", label: "Notes" },
] as const;

const PROPERTY_FIELDS = [
  { key: "name", label: "Name", required: true },
  { key: "propertyType", label: "Property Type" },
  { key: "address", label: "Address" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "zip", label: "Zip" },
  { key: "county", label: "County" },
  { key: "unitCount", label: "Unit Count" },
  { key: "vintageYear", label: "Year Built" },
  { key: "estimatedValue", label: "Estimated Value" },
  { key: "ownerName", label: "Owner Name" },
  { key: "ownerPhone", label: "Owner Phone" },
  { key: "ownerEmail", label: "Owner Email" },
  { key: "notes", label: "Notes" },
] as const;

type FieldDef = { key: string; label: string; required?: boolean };

// ─── Auto-match CSV headers to field keys ──────────────────────────────────

function autoMapHeaders(
  headers: string[],
  fields: readonly FieldDef[]
): Record<string, string> {
  const mapping: Record<string, string> = {};
  const aliases: Record<string, string[]> = {
    firstName: ["first name", "first", "fname", "given name"],
    lastName: ["last name", "last", "lname", "surname", "family name"],
    email: ["email", "e-mail", "email address"],
    phone: ["phone", "telephone", "tel", "mobile", "cell"],
    company: ["company", "organization", "org", "brokerage", "firm"],
    address: ["address", "street", "street address", "address1"],
    city: ["city", "town"],
    state: ["state", "st", "province"],
    zip: ["zip", "zipcode", "zip code", "postal", "postal code"],
    county: ["county"],
    notes: ["notes", "note", "comments", "description"],
    name: ["name", "property name", "property", "title"],
    propertyType: ["type", "property type", "asset type", "asset class"],
    unitCount: ["units", "unit count", "# units", "num units", "total units"],
    vintageYear: ["year built", "vintage", "year", "built"],
    estimatedValue: ["value", "estimated value", "price", "asking price"],
    ownerName: ["owner", "owner name", "landlord"],
    ownerPhone: ["owner phone", "owner tel"],
    ownerEmail: ["owner email"],
  };

  for (const header of headers) {
    const lower = header.toLowerCase().trim();
    for (const field of fields) {
      const fieldAliases = aliases[field.key] ?? [field.key.toLowerCase()];
      if (fieldAliases.some((a) => a === lower)) {
        mapping[header] = field.key;
        break;
      }
    }
  }
  return mapping;
}

// ─── CSV / XLSX parsing ────────────────────────────────────────────────────

function parseSpreadsheet(
  file: File
): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: "array" });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json<Record<string, string>>(sheet, {
          defval: "",
          raw: false,
        });
        if (!json.length) {
          reject(new Error("File is empty or has no data rows"));
          return;
        }
        const headers = Object.keys(json[0]);
        resolve({ headers, rows: json });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsArrayBuffer(file);
  });
}

// ─── Drop zone component ──────────────────────────────────────────────────

function DropZone({
  accept,
  label,
  onFile,
}: {
  accept: string;
  label: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) onFile(file);
    },
    [onFile]
  );

  return (
    <div
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
        dragOver ? "border-primary bg-primary/5" : "border-muted-foreground/25 hover:border-muted-foreground/50"
      }`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
      <p className="text-sm font-medium">{label}</p>
      <p className="text-xs text-muted-foreground mt-1">
        Drag and drop or click to browse
      </p>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onFile(file);
          e.target.value = "";
        }}
      />
    </div>
  );
}

// ─── Field Mapping UI ──────────────────────────────────────────────────────

function FieldMapper({
  headers,
  fields,
  mapping,
  onChange,
}: {
  headers: string[];
  fields: readonly FieldDef[];
  mapping: Record<string, string>;
  onChange: (mapping: Record<string, string>) => void;
}) {
  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wide">
        Map your columns
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {headers.map((header) => (
          <div key={header} className="flex items-center gap-2">
            <span className="text-sm truncate w-32 shrink-0" title={header}>
              {header}
            </span>
            <span className="text-muted-foreground text-xs shrink-0">&rarr;</span>
            <Select
              value={mapping[header] ?? "__skip__"}
              onValueChange={(val) =>
                onChange({
                  ...mapping,
                  [header]: val === "__skip__" ? "" : val,
                })
              }
            >
              <SelectTrigger className="h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__skip__">-- Skip --</SelectItem>
                {fields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>
                    {f.label}
                    {f.required ? " *" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Preview table ─────────────────────────────────────────────────────────

function PreviewTable({
  rows,
  mapping,
  fields,
}: {
  rows: Record<string, string>[];
  mapping: Record<string, string>;
  fields: readonly FieldDef[];
}) {
  const mappedKeys = Object.entries(mapping)
    .filter(([, v]) => v)
    .map(([header, fieldKey]) => ({
      header,
      fieldKey,
      label: fields.find((f) => f.key === fieldKey)?.label ?? fieldKey,
    }));

  if (!mappedKeys.length) return null;

  return (
    <div className="overflow-x-auto border rounded-md">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-muted/50">
            {mappedKeys.map((m) => (
              <th key={m.fieldKey} className="text-left p-2 font-semibold">
                {m.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 5).map((row, i) => (
            <tr key={i} className="border-t">
              {mappedKeys.map((m) => (
                <td key={m.fieldKey} className="p-2 truncate max-w-[200px]">
                  {row[m.header] || "-"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > 5 && (
        <p className="text-xs text-muted-foreground p-2">
          ...and {rows.length - 5} more rows
        </p>
      )}
    </div>
  );
}

// ─── Results summary ───────────────────────────────────────────────────────

function ResultsSummary({
  result,
}: {
  result: { total: number; inserted: number; skipped: number; failed: number };
}) {
  return (
    <div className="flex gap-4 p-4 bg-muted/30 rounded-lg">
      <div className="text-center">
        <div className="text-lg font-semibold">{result.total}</div>
        <div className="text-xs text-muted-foreground">Total</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-semibold text-green-600">{result.inserted}</div>
        <div className="text-xs text-muted-foreground">Imported</div>
      </div>
      <div className="text-center">
        <div className="text-lg font-semibold text-yellow-600">{result.skipped}</div>
        <div className="text-xs text-muted-foreground">Skipped</div>
      </div>
      {result.failed > 0 && (
        <div className="text-center">
          <div className="text-lg font-semibold text-red-600">{result.failed}</div>
          <div className="text-xs text-muted-foreground">Failed</div>
        </div>
      )}
    </div>
  );
}

// ─── Contacts CSV tab ──────────────────────────────────────────────────────

function ContactsImportTab() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    total: number;
    inserted: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const importMut = trpc.contacts.bulkImport.useMutation();
  const utils = trpc.useUtils();

  const handleFile = useCallback(async (f: File) => {
    try {
      const parsed = await parseSpreadsheet(f);
      setFile(f);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMapHeaders(parsed.headers, CONTACT_FIELDS));
      setResult(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    }
  }, []);

  const handleImport = async () => {
    const mappedRows = rows.map((row) => {
      const out: Record<string, string> = {};
      for (const [header, fieldKey] of Object.entries(mapping)) {
        if (fieldKey && row[header]) out[fieldKey] = row[header];
      }
      return out;
    });

    const validRows = mappedRows.filter((r) => r.firstName && r.lastName);
    if (!validRows.length) {
      toast.error("No valid rows found. Make sure First Name and Last Name are mapped.");
      return;
    }

    try {
      const res = await importMut.mutateAsync({
        rows: validRows.map((r) => ({
          firstName: r.firstName,
          lastName: r.lastName,
          email: r.email || undefined,
          phone: r.phone || undefined,
          company: r.company || undefined,
          address: r.address || undefined,
          city: r.city || undefined,
          state: r.state || undefined,
          zip: r.zip || undefined,
          notes: r.notes || undefined,
        })),
        skipDuplicates: true,
      });
      setResult(res);
      utils.contacts.list.invalidate();
      utils.dashboard.metrics.invalidate();
      toast.success(`Imported ${res.inserted} contacts`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const reset = () => {
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
  };

  if (result) {
    return (
      <div className="space-y-4">
        <ResultsSummary result={result} />
        <Button variant="outline" onClick={reset}>
          Import Another File
        </Button>
      </div>
    );
  }

  if (!file) {
    return (
      <DropZone
        accept=".csv,.xlsx,.xls"
        label="Upload contacts CSV or Excel file"
        onFile={handleFile}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{file.name}</span>
        <Badge variant="outline">{rows.length} rows</Badge>
        <Button variant="ghost" size="sm" onClick={reset}>
          Change file
        </Button>
      </div>

      <FieldMapper
        headers={headers}
        fields={CONTACT_FIELDS}
        mapping={mapping}
        onChange={setMapping}
      />

      <PreviewTable rows={rows} mapping={mapping} fields={CONTACT_FIELDS} />

      <div className="flex gap-2">
        <Button onClick={handleImport} disabled={importMut.isPending} className="gap-2">
          {importMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {importMut.isPending ? "Importing..." : `Import ${rows.length} Contacts`}
        </Button>
      </div>
    </div>
  );
}

// ─── Properties CSV tab ────────────────────────────────────────────────────

function PropertiesImportTab() {
  const [file, setFile] = useState<File | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [result, setResult] = useState<{
    total: number;
    inserted: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const importMut = trpc.properties.bulkImport.useMutation();
  const utils = trpc.useUtils();

  const handleFile = useCallback(async (f: File) => {
    try {
      const parsed = await parseSpreadsheet(f);
      setFile(f);
      setHeaders(parsed.headers);
      setRows(parsed.rows);
      setMapping(autoMapHeaders(parsed.headers, PROPERTY_FIELDS));
      setResult(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse file");
    }
  }, []);

  const handleImport = async () => {
    const mappedRows = rows.map((row) => {
      const out: Record<string, string> = {};
      for (const [header, fieldKey] of Object.entries(mapping)) {
        if (fieldKey && row[header]) out[fieldKey] = row[header];
      }
      return out;
    });

    const validRows = mappedRows.filter((r) => r.name);
    if (!validRows.length) {
      toast.error("No valid rows found. Make sure Name is mapped.");
      return;
    }

    try {
      const res = await importMut.mutateAsync({
        rows: validRows.map((r) => ({
          name: r.name,
          propertyType: (r.propertyType as any) || undefined,
          address: r.address || undefined,
          city: r.city || undefined,
          state: r.state || undefined,
          zip: r.zip || undefined,
          county: r.county || undefined,
          unitCount: r.unitCount ? parseInt(r.unitCount) || undefined : undefined,
          vintageYear: r.vintageYear ? parseInt(r.vintageYear) || undefined : undefined,
          estimatedValue: r.estimatedValue
            ? parseFloat(r.estimatedValue.replace(/[$,]/g, "")) || undefined
            : undefined,
          ownerName: r.ownerName || undefined,
          ownerPhone: r.ownerPhone || undefined,
          ownerEmail: r.ownerEmail || undefined,
          notes: r.notes || undefined,
        })),
        skipDuplicates: true,
      });
      setResult(res);
      utils.properties.list.invalidate();
      utils.dashboard.metrics.invalidate();
      toast.success(`Imported ${res.inserted} properties`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const reset = () => {
    setFile(null);
    setHeaders([]);
    setRows([]);
    setMapping({});
    setResult(null);
  };

  if (result) {
    return (
      <div className="space-y-4">
        <ResultsSummary result={result} />
        <Button variant="outline" onClick={reset}>
          Import Another File
        </Button>
      </div>
    );
  }

  if (!file) {
    return (
      <DropZone
        accept=".csv,.xlsx,.xls"
        label="Upload properties CSV or Excel file"
        onFile={handleFile}
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileSpreadsheet className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{file.name}</span>
        <Badge variant="outline">{rows.length} rows</Badge>
        <Button variant="ghost" size="sm" onClick={reset}>
          Change file
        </Button>
      </div>

      <FieldMapper
        headers={headers}
        fields={PROPERTY_FIELDS}
        mapping={mapping}
        onChange={setMapping}
      />

      <PreviewTable rows={rows} mapping={mapping} fields={PROPERTY_FIELDS} />

      <div className="flex gap-2">
        <Button onClick={handleImport} disabled={importMut.isPending} className="gap-2">
          {importMut.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="h-4 w-4" />
          )}
          {importMut.isPending ? "Importing..." : `Import ${rows.length} Properties`}
        </Button>
      </div>
    </div>
  );
}

// ─── My Maps KML tab ──────────────────────────────────────────────────────

function MyMapsImportTab() {
  const [file, setFile] = useState<File | null>(null);
  const [placemarks, setPlacemarks] = useState<KmlPlacemark[]>([]);
  const [result, setResult] = useState<{
    total: number;
    inserted: number;
    skipped: number;
    failed: number;
  } | null>(null);

  const importMut = trpc.properties.bulkImport.useMutation();
  const utils = trpc.useUtils();

  const handleFile = useCallback(async (f: File) => {
    try {
      const pins = await parseKmlFile(f);
      if (!pins.length) {
        toast.error("No pins found in this file");
        return;
      }
      setFile(f);
      setPlacemarks(pins);
      setResult(null);
      toast.success(`Found ${pins.length} pins`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to parse KML");
    }
  }, []);

  const handleImport = async () => {
    try {
      const res = await importMut.mutateAsync({
        rows: placemarks.map((pm) => ({
          name: pm.name,
          latitude: pm.latitude,
          longitude: pm.longitude,
          notes: pm.description || undefined,
        })),
        skipDuplicates: true,
      });
      setResult(res);
      utils.properties.list.invalidate();
      utils.dashboard.metrics.invalidate();
      toast.success(`Imported ${res.inserted} properties from My Maps`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Import failed");
    }
  };

  const reset = () => {
    setFile(null);
    setPlacemarks([]);
    setResult(null);
  };

  if (result) {
    return (
      <div className="space-y-4">
        <ResultsSummary result={result} />
        <Button variant="outline" onClick={reset}>
          Import Another File
        </Button>
      </div>
    );
  }

  if (!file) {
    return (
      <div className="space-y-3">
        <DropZone
          accept=".kml,.kmz"
          label="Upload Google My Maps file (KML or KMZ)"
          onFile={handleFile}
        />
        <p className="text-xs text-muted-foreground">
          To export from Google My Maps: open your map, click the three dots menu, then
          "Export to KML/KMZ".
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">{file.name}</span>
        <Badge variant="outline">{placemarks.length} pins</Badge>
        <Button variant="ghost" size="sm" onClick={reset}>
          Change file
        </Button>
      </div>

      <div className="overflow-x-auto border rounded-md">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50">
              <th className="text-left p-2 font-semibold">Name</th>
              <th className="text-left p-2 font-semibold">Description</th>
              <th className="text-left p-2 font-semibold">Lat</th>
              <th className="text-left p-2 font-semibold">Lng</th>
            </tr>
          </thead>
          <tbody>
            {placemarks.slice(0, 10).map((pm, i) => (
              <tr key={i} className="border-t">
                <td className="p-2 font-medium">{pm.name}</td>
                <td className="p-2 truncate max-w-[250px]">{pm.description || "-"}</td>
                <td className="p-2 tabular-nums">{pm.latitude.toFixed(5)}</td>
                <td className="p-2 tabular-nums">{pm.longitude.toFixed(5)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {placemarks.length > 10 && (
          <p className="text-xs text-muted-foreground p-2">
            ...and {placemarks.length - 10} more pins
          </p>
        )}
      </div>

      <Button onClick={handleImport} disabled={importMut.isPending} className="gap-2">
        {importMut.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <CheckCircle2 className="h-4 w-4" />
        )}
        {importMut.isPending
          ? "Importing..."
          : `Import ${placemarks.length} Properties`}
      </Button>
    </div>
  );
}

// ─── Main Import page ──────────────────────────────────────────────────────

export default function Import() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Upload className="h-6 w-6 text-muted-foreground" />
        <div>
          <h1 className="text-2xl font-semibold">Import Data</h1>
          <p className="text-sm text-muted-foreground">
            Bring in your contacts, properties, and Google My Maps pins.
          </p>
        </div>
      </div>

      <Tabs defaultValue="contacts">
        <TabsList>
          <TabsTrigger value="contacts" className="gap-1.5">
            <Users className="h-3.5 w-3.5" />
            Contacts
          </TabsTrigger>
          <TabsTrigger value="properties" className="gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            Properties
          </TabsTrigger>
          <TabsTrigger value="mymaps" className="gap-1.5">
            <MapPin className="h-3.5 w-3.5" />
            My Maps
          </TabsTrigger>
        </TabsList>

        <TabsContent value="contacts">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Import Contacts from CSV/Excel</CardTitle>
            </CardHeader>
            <CardContent>
              <ContactsImportTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="properties">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Import Properties from CSV/Excel
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PropertiesImportTab />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mymaps">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">
                Import from Google My Maps
              </CardTitle>
            </CardHeader>
            <CardContent>
              <MyMapsImportTab />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
