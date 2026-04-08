import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Download, Archive, FileSpreadsheet, Loader2,
  Building2, Users, Activity, CheckSquare, Link2,
  Tag, DollarSign, TrendingUp, Target,
} from "lucide-react";

// ─── Download helpers ─────────────────────────────────────────────────────────
function downloadCSV(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

type FullBackupData = {
  exportedAt: string;
  properties: { rows: unknown[]; csv: string };
  contacts: { rows: unknown[]; csv: string };
  activities: { rows: unknown[]; csv: string };
  tasks: { rows: unknown[]; csv: string };
  contactPropertyLinks: { rows: unknown[]; csv: string };
  listings: { rows: unknown[]; csv: string };
  saleRecords: { rows: unknown[]; csv: string };
  unsolicitedOffers: { rows: unknown[]; csv: string };
  buyerCriteria: { rows: unknown[]; csv: string };
};

async function downloadZip(data: FullBackupData) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  zip.file("properties.csv", data.properties.csv);
  zip.file("contacts.csv", data.contacts.csv);
  zip.file("activities.csv", data.activities.csv);
  zip.file("tasks.csv", data.tasks.csv);
  zip.file("contact_property_links.csv", data.contactPropertyLinks.csv);
  zip.file("listings.csv", data.listings.csv);
  zip.file("sale_records.csv", data.saleRecords.csv);
  zip.file("unsolicited_offers.csv", data.unsolicitedOffers.csv);
  zip.file("buyer_criteria.csv", data.buyerCriteria.csv);
  zip.file("full_backup.json", JSON.stringify(data, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `crm_backup_${new Date().toISOString().split("T")[0]}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Single export button component ──────────────────────────────────────────
function ExportButton({
  label,
  icon: Icon,
  onExport,
}: {
  label: string;
  icon: React.ElementType;
  onExport: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      await onExport();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="justify-start gap-2 h-9 text-sm"
      disabled={loading}
      onClick={handleClick}
    >
      {loading ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
      ) : (
        <Icon className="h-3.5 w-3.5 shrink-0" />
      )}
      {label}
    </Button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function DataExport() {
  const utils = trpc.useUtils();

  // ── Full backup ──────────────────────────────────────────────────────────────
  const handleFullBackup = async () => {
    const data = await utils.export.fullBackup.fetch();
    await downloadZip(data as FullBackupData);
    toast.success("Downloaded crm_backup.zip");
  };

  // ── Rich exports ─────────────────────────────────────────────────────────────
  const handleRich = async (
    key: "propertiesRich" | "contactsRich" | "listingsRich"
  ) => {
    const data = await utils.export[key].fetch();
    downloadCSV(data.filename, data.csv);
    toast.success(`Downloaded ${data.filename}`);
  };

  // ── Raw exports ──────────────────────────────────────────────────────────────
  const handleRaw = async (
    key:
      | "properties"
      | "contacts"
      | "activities"
      | "tasks"
      | "contactPropertyLinks"
      | "listings"
      | "saleRecords"
      | "unsolicitedOffers"
      | "buyerCriteria"
  ) => {
    const data = await utils.export[key].fetch();
    downloadCSV(data.filename, data.csv);
    toast.success(`Downloaded ${data.filename}`);
  };

  return (
    <div className="max-w-2xl mx-auto py-8 px-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Data Export</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Download your CRM data for backup or migration to another system.
        </p>
      </div>

      {/* Section 1: Full Backup */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Archive className="h-4 w-4 text-primary" />
            Full Backup
          </CardTitle>
          <CardDescription>
            Download everything — use this for monthly backups. Produces a ZIP
            with all CSVs and a complete JSON snapshot.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ExportButton
            label="Export Everything (ZIP)"
            icon={Download}
            onExport={handleFullBackup}
          />
        </CardContent>
      </Card>

      {/* Section 2: Rich Exports */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-primary" />
            Rich Exports
          </CardTitle>
          <CardDescription>
            Flattened exports with related data included — best for importing
            into another CRM or sharing with a team.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <ExportButton
            label="Properties (Rich)"
            icon={Building2}
            onExport={() => handleRich("propertiesRich")}
          />
          <ExportButton
            label="Contacts (Rich)"
            icon={Users}
            onExport={() => handleRich("contactsRich")}
          />
          <ExportButton
            label="Listings (Rich)"
            icon={Tag}
            onExport={() => handleRich("listingsRich")}
          />
        </CardContent>
      </Card>

      {/* Section 3: Raw Data */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Download className="h-4 w-4 text-primary" />
            Raw Data
          </CardTitle>
          <CardDescription>
            Individual tables with IDs — for advanced migrations that can
            rebuild relationships programmatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <ExportButton
            label="Properties"
            icon={Building2}
            onExport={() => handleRaw("properties")}
          />
          <ExportButton
            label="Contacts"
            icon={Users}
            onExport={() => handleRaw("contacts")}
          />
          <ExportButton
            label="Activities"
            icon={Activity}
            onExport={() => handleRaw("activities")}
          />
          <ExportButton
            label="Tasks"
            icon={CheckSquare}
            onExport={() => handleRaw("tasks")}
          />
          <ExportButton
            label="Contact-Property Links"
            icon={Link2}
            onExport={() => handleRaw("contactPropertyLinks")}
          />
          <ExportButton
            label="Listings"
            icon={Tag}
            onExport={() => handleRaw("listings")}
          />
          <ExportButton
            label="Sale Records"
            icon={DollarSign}
            onExport={() => handleRaw("saleRecords")}
          />
          <ExportButton
            label="Unsolicited Offers"
            icon={TrendingUp}
            onExport={() => handleRaw("unsolicitedOffers")}
          />
          <ExportButton
            label="Buyer Criteria"
            icon={Target}
            onExport={() => handleRaw("buyerCriteria")}
          />
        </CardContent>
      </Card>
    </div>
  );
}
