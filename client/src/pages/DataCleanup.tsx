import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Merge, Users, Building2, CheckCircle2, AlertTriangle, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const REASON_LABELS: Record<string, string> = {
  same_name: "Same name",
  same_email: "Same email",
  same_phone: "Same phone",
  same_geocode: "Same location",
  same_name_city: "Same name & city",
};

function ReasonBadge({ reason }: { reason: string }) {
  return (
    <Badge variant="secondary" className="text-xs">
      {REASON_LABELS[reason] ?? reason}
    </Badge>
  );
}

function FieldRow({ label, a, b }: { label: string; a?: string | null; b?: string | null }) {
  if (!a && !b) return null;
  const differ = a !== b;
  return (
    <div className={`grid grid-cols-[120px_1fr_1fr] gap-2 text-sm py-1 ${differ ? "bg-amber-50 rounded px-1" : ""}`}>
      <span className="text-muted-foreground font-medium truncate">{label}</span>
      <span className="truncate">{a || <span className="text-muted-foreground italic">—</span>}</span>
      <span className="truncate">{b || <span className="text-muted-foreground italic">—</span>}</span>
    </div>
  );
}

// ─── Contact Duplicate Card ───────────────────────────────────────────────────
function ContactDuplicateCard({
  pair,
  onMerged,
}: {
  pair: { contact1: any; contact2: any; reasons: string[] };
  onMerged: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetId, setTargetId] = useState<number>(pair.contact1.id);

  const merge = trpc.dataCleanup.mergeContacts.useMutation({
    onSuccess: () => {
      toast.success("Contacts merged", { description: "The duplicate has been removed." });
      onMerged();
    },
    onError: (e) => toast.error("Merge failed", { description: e.message }),
  });

  const sourceId = targetId === pair.contact1.id ? pair.contact2.id : pair.contact1.id;
  const target = targetId === pair.contact1.id ? pair.contact1 : pair.contact2;
  const source = targetId === pair.contact1.id ? pair.contact2 : pair.contact1;

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">
              {pair.contact1.firstName} {pair.contact1.lastName}
              {" "}&amp;{" "}
              {pair.contact2.firstName} {pair.contact2.lastName}
            </CardTitle>
            {pair.reasons.map((r) => <ReasonBadge key={r} reason={r} />)}
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setConfirmOpen(true)}>
            <Merge className="h-3.5 w-3.5 mr-1.5" />
            Merge
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Keep-as toggle */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>Keep as primary:</span>
          <button
            onClick={() => setTargetId(pair.contact1.id)}
            className={`px-2 py-0.5 rounded border text-xs transition-colors ${targetId === pair.contact1.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
          >
            {pair.contact1.firstName} {pair.contact1.lastName}
          </button>
          <button
            onClick={() => setTargetId(pair.contact2.id)}
            className={`px-2 py-0.5 rounded border text-xs transition-colors ${targetId === pair.contact2.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
          >
            {pair.contact2.firstName} {pair.contact2.lastName}
          </button>
        </div>

        {/* Side-by-side comparison */}
        <div className="border rounded-lg p-3 bg-muted/30 space-y-0.5">
          <div className="grid grid-cols-[120px_1fr_1fr] gap-2 text-xs font-semibold text-muted-foreground pb-1 border-b mb-1">
            <span>Field</span>
            <span className="flex items-center gap-1">
              {target.firstName} {target.lastName}
              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">Keep</Badge>
            </span>
            <span>{source.firstName} {source.lastName}</span>
          </div>
          <FieldRow label="Email" a={target.email} b={source.email} />
          <FieldRow label="Phone" a={target.phone} b={source.phone} />
          <FieldRow label="Company" a={target.company} b={source.company} />
          <FieldRow label="City" a={target.city} b={source.city} />
          <FieldRow label="Priority" a={target.priority} b={source.priority} />
        </div>

        <p className="text-xs text-muted-foreground">
          Highlighted rows differ. The merged contact uses the best available value from each field.
          All activities, tasks, and deal connections are re-linked to the primary record.
        </p>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge contacts?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{source.firstName} {source.lastName}</strong> will be merged into{" "}
              <strong>{target.firstName} {target.lastName}</strong>. All activities, tasks, and deal
              connections will be re-linked. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => merge.mutate({ targetId, sourceId })}
              disabled={merge.isPending}
            >
              {merge.isPending ? "Merging…" : "Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─── Property Duplicate Card ──────────────────────────────────────────────────
function PropertyDuplicateCard({
  pair,
  onMerged,
}: {
  pair: { property1: any; property2: any; reasons: string[] };
  onMerged: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [targetId, setTargetId] = useState<number>(pair.property1.id);

  const merge = trpc.dataCleanup.mergeProperties.useMutation({
    onSuccess: () => {
      toast.success("Properties merged", { description: "The duplicate has been removed." });
      onMerged();
    },
    onError: (e) => toast.error("Merge failed", { description: e.message }),
  });

  const sourceId = targetId === pair.property1.id ? pair.property2.id : pair.property1.id;
  const target = targetId === pair.property1.id ? pair.property1 : pair.property2;
  const source = targetId === pair.property1.id ? pair.property2 : pair.property1;

  return (
    <Card className="border-amber-200">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base">
              {pair.property1.name} &amp; {pair.property2.name}
            </CardTitle>
            {pair.reasons.map((r) => <ReasonBadge key={r} reason={r} />)}
          </div>
          <Button size="sm" className="shrink-0" onClick={() => setConfirmOpen(true)}>
            <Merge className="h-3.5 w-3.5 mr-1.5" />
            Merge
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Keep-as toggle */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
          <span>Keep as primary:</span>
          <button
            onClick={() => setTargetId(pair.property1.id)}
            className={`px-2 py-0.5 rounded border text-xs transition-colors ${targetId === pair.property1.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
          >
            {pair.property1.name}
          </button>
          <button
            onClick={() => setTargetId(pair.property2.id)}
            className={`px-2 py-0.5 rounded border text-xs transition-colors ${targetId === pair.property2.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:bg-muted"}`}
          >
            {pair.property2.name}
          </button>
        </div>

        {/* Side-by-side comparison */}
        <div className="border rounded-lg p-3 bg-muted/30 space-y-0.5">
          <div className="grid grid-cols-[120px_1fr_1fr] gap-2 text-xs font-semibold text-muted-foreground pb-1 border-b mb-1">
            <span>Field</span>
            <span className="flex items-center gap-1">
              {target.name}
              <Badge variant="outline" className="text-[10px] px-1 py-0 ml-1">Keep</Badge>
            </span>
            <span>{source.name}</span>
          </div>
          <FieldRow label="Address" a={target.address} b={source.address} />
          <FieldRow label="City" a={target.city} b={source.city} />
          <FieldRow label="Units" a={target.unitCount?.toString()} b={source.unitCount?.toString()} />
          <FieldRow label="Owner" a={target.ownerName} b={source.ownerName} />
          <FieldRow label="Status" a={target.status} b={source.status} />
          <FieldRow
            label="Est. Value"
            a={target.estimatedValue ? `$${Number(target.estimatedValue).toLocaleString()}` : null}
            b={source.estimatedValue ? `$${Number(source.estimatedValue).toLocaleString()}` : null}
          />
        </div>

        <p className="text-xs text-muted-foreground">
          Highlighted rows differ. The merged property uses the best available value.
          All activities, tasks, sale records, and contact links are re-linked to the primary record.
        </p>
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Merge properties?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{source.name}</strong> will be merged into <strong>{target.name}</strong>.
              All linked data will be re-pointed to the primary record. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => merge.mutate({ targetId, sourceId })}
              disabled={merge.isPending}
            >
              {merge.isPending ? "Merging…" : "Merge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DataCleanup() {
  const [tab, setTab] = useState("contacts");

  const {
    data: contactDupes,
    isLoading: loadingContacts,
    refetch: refetchContacts,
  } = trpc.dataCleanup.findDuplicateContacts.useQuery();

  const {
    data: propertyDupes,
    isLoading: loadingProperties,
    refetch: refetchProperties,
  } = trpc.dataCleanup.findDuplicateProperties.useQuery();

  const contactCount = contactDupes?.length ?? 0;
  const propertyCount = propertyDupes?.length ?? 0;

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Data Cleanup</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Find and merge duplicate contacts and properties. All linked data is preserved.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { refetchContacts(); refetchProperties(); }}
          >
            <RefreshCw className="h-4 w-4 mr-1.5" />
            Rescan
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4">
          <Card className={contactCount > 0 ? "border-amber-300 bg-amber-50/40" : ""}>
            <CardContent className="p-4 flex items-center gap-3">
              <Users className={`h-8 w-8 ${contactCount > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
              <div>
                <p className="text-2xl font-bold">{loadingContacts ? "…" : contactCount}</p>
                <p className="text-sm text-muted-foreground">Duplicate contact pairs</p>
              </div>
              {contactCount > 0 && <AlertTriangle className="h-5 w-5 text-amber-500 ml-auto" />}
              {contactCount === 0 && !loadingContacts && <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto" />}
            </CardContent>
          </Card>
          <Card className={propertyCount > 0 ? "border-amber-300 bg-amber-50/40" : ""}>
            <CardContent className="p-4 flex items-center gap-3">
              <Building2 className={`h-8 w-8 ${propertyCount > 0 ? "text-amber-600" : "text-muted-foreground"}`} />
              <div>
                <p className="text-2xl font-bold">{loadingProperties ? "…" : propertyCount}</p>
                <p className="text-sm text-muted-foreground">Duplicate property pairs</p>
              </div>
              {propertyCount > 0 && <AlertTriangle className="h-5 w-5 text-amber-500 ml-auto" />}
              {propertyCount === 0 && !loadingProperties && <CheckCircle2 className="h-5 w-5 text-green-500 ml-auto" />}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab}>
          <TabsList>
            <TabsTrigger value="contacts" className="gap-1.5">
              <Users className="h-4 w-4" />
              Contacts
              {contactCount > 0 && (
                <Badge className="ml-1 h-5 min-w-5 text-xs px-1.5 bg-amber-500 text-white">{contactCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="properties" className="gap-1.5">
              <Building2 className="h-4 w-4" />
              Properties
              {propertyCount > 0 && (
                <Badge className="ml-1 h-5 min-w-5 text-xs px-1.5 bg-amber-500 text-white">{propertyCount}</Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="contacts" className="mt-4 space-y-4">
            {loadingContacts && (
              <div className="text-center py-12 text-muted-foreground">Scanning contacts…</div>
            )}
            {!loadingContacts && contactCount === 0 && (
              <div className="text-center py-12 space-y-2">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                <p className="font-medium text-foreground">No duplicate contacts found</p>
                <p className="text-sm text-muted-foreground">Your contact list looks clean.</p>
              </div>
            )}
            {contactDupes?.map((pair) => (
              <ContactDuplicateCard
                key={`${pair.contact1.id}-${pair.contact2.id}`}
                pair={pair}
                onMerged={refetchContacts}
              />
            ))}
          </TabsContent>

          <TabsContent value="properties" className="mt-4 space-y-4">
            {loadingProperties && (
              <div className="text-center py-12 text-muted-foreground">Scanning properties…</div>
            )}
            {!loadingProperties && propertyCount === 0 && (
              <div className="text-center py-12 space-y-2">
                <CheckCircle2 className="h-10 w-10 text-green-500 mx-auto" />
                <p className="font-medium text-foreground">No duplicate properties found</p>
                <p className="text-sm text-muted-foreground">Your property list looks clean.</p>
              </div>
            )}
            {propertyDupes?.map((pair) => (
              <PropertyDuplicateCard
                key={`${pair.property1.id}-${pair.property2.id}`}
                pair={pair}
                onMerged={refetchProperties}
              />
            ))}
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
