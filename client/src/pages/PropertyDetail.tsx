import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  ArrowLeft,
  Building2,
  Calendar,
  DollarSign,
  Edit2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Trash2,
  Users,
} from "lucide-react";
import { ActivityDetailModal } from "@/components/ActivityDetailModal";
import { ALL_PROPERTY_TYPES, getEnabledTypes, parsePreferences } from "./Settings";

const activityIcons: Record<string, React.ReactNode> = {
  call: <Phone className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  meeting: <Calendar className="h-3.5 w-3.5" />,
  note: <Activity className="h-3.5 w-3.5" />,
};

// PROPERTY_TYPES is computed inside the component from user preferences

const STATUSES = [
  { value: "researching", label: "Researching" },
  { value: "prospecting", label: "Prospecting" },
  { value: "seller", label: "Seller" },
  { value: "listed", label: "Listed" },
  { value: "under_contract", label: "Under Contract" },
  { value: "recently_sold", label: "Recently Sold" },
] as const;

export default function PropertyDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const propertyId = parseInt(id ?? "0");

  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [openActivityId, setOpenActivityId] = useState<number | null>(null);

  const profileQuery = trpc.users.getMyProfile.useQuery();
  const prefs = parsePreferences(profileQuery.data?.preferences ?? "");
  const enabledTypes = getEnabledTypes(prefs);
  const PROPERTY_TYPES = ALL_PROPERTY_TYPES.filter((t) => enabledTypes.includes(t.value));

  const utils = trpc.useUtils();

  const { data: property, isLoading } = trpc.properties.byId.useQuery(
    { id: propertyId },
    { enabled: !!propertyId },
  );
  const { data: activities, refetch: refetchActivities } = trpc.activities.list.useQuery(
    { propertyId, limit: 20 },
    { enabled: !!propertyId },
  );
  const { data: linkedContacts } = trpc.contactLinks.listForProperty.useQuery(
    { propertyId },
    { enabled: !!propertyId },
  );
  const { data: tasks } = trpc.tasks.list.useQuery(
    { propertyId, status: "pending" },
    { enabled: !!propertyId },
  );

  const deleteProperty = trpc.properties.delete.useMutation({
    onSuccess: () => {
      toast.success("Property deleted");
      setLocation("/properties");
    },
    onError: (e) => toast.error(e.message),
  });

  if (!propertyId) return <div className="p-6">Invalid property ID</div>;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!property) return <div className="p-6">Property not found</div>;

  const fullAddress = [property.address, property.city, property.state, property.zip]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/properties")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Properties
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold truncate">{property.name}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Badge variant="outline" className="capitalize">
                {property.propertyType.replace("_", " ")}
              </Badge>
              <Badge variant="outline" className="capitalize">
                {property.status.replace("_", " ")}
              </Badge>
              {property.unitCount && (
                <span className="text-xs text-muted-foreground">{property.unitCount} units</span>
              )}
            </div>
            {fullAddress && (
              <div className="flex items-center gap-1 mt-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {fullAddress}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button variant="outline" size="sm" onClick={() => setShowEdit(true)} className="gap-1">
            <Edit2 className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowDelete(true)}
            className="gap-1 text-destructive hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left column: details */}
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Property Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <Detail label="Vintage Year" value={property.vintageYear?.toString()} />
                <Detail label="Year Renovated" value={property.yearRenovated?.toString()} />
                <Detail label="Size (sqft)" value={property.sizeSqft?.toLocaleString()} />
                <Detail label="Lot (acres)" value={property.lotAcres?.toString()} />
                <Detail
                  label="Asking Price"
                  value={property.askingPrice ? `$${property.askingPrice.toLocaleString()}` : undefined}
                />
                <Detail
                  label="Cap Rate"
                  value={property.capRate ? `${property.capRate}%` : undefined}
                />
                <Detail
                  label="NOI"
                  value={property.noi ? `$${property.noi.toLocaleString()}` : undefined}
                />
                <Detail
                  label="Last Sale"
                  value={
                    property.lastSalePrice
                      ? `$${property.lastSalePrice.toLocaleString()}${property.lastSaleDate ? ` (${new Date(property.lastSaleDate).getFullYear()})` : ""}`
                      : undefined
                  }
                />
              </div>
              {property.notes && (
                <div className="pt-3 border-t">
                  <div className="text-xs text-muted-foreground mb-1">Notes</div>
                  <p className="text-sm whitespace-pre-wrap">{property.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" />
                Activity History
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!activities?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No activities logged yet</p>
                  <p className="text-xs mt-1">Use the mic button to log a call or meeting.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {activities.map((activity, idx) => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => setOpenActivityId(activity.id)}
                      className="w-full text-left flex gap-3 pb-4 relative hover:bg-muted/40 rounded-md -mx-2 px-2 py-1 transition-colors"
                    >
                      {idx < activities.length - 1 && (
                        <div className="absolute left-6 top-9 bottom-0 w-px bg-border" />
                      )}
                      <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary z-10">
                        {activityIcons[activity.type] ?? <Activity className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium capitalize">{activity.type}</span>
                          {activity.outcome && (
                            <Badge variant="outline" className="text-xs px-1.5 py-0 capitalize">
                              {activity.outcome.replace("_", " ")}
                            </Badge>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {formatDistanceToNow(new Date(activity.occurredAt), { addSuffix: true })}
                          </span>
                        </div>
                        {activity.subject && <p className="text-sm mt-0.5">{activity.subject}</p>}
                        {activity.summary && (
                          <p className="text-sm text-muted-foreground mt-1 italic">"{activity.summary}"</p>
                        )}
                        {activity.notes && !activity.summary && (
                          <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{activity.notes}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column: linked contacts + tasks */}
        <div className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Users className="h-3.5 w-3.5" />
                Linked Contacts
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!linkedContacts?.length ? (
                <p className="text-sm text-muted-foreground italic">No linked contacts</p>
              ) : (
                <div className="space-y-2">
                  {linkedContacts.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setLocation(`/contacts/${c.contactId}`)}
                      className="w-full text-left border rounded-md p-2 hover:bg-muted/40"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">
                          {c.firstName} {c.lastName}
                        </span>
                        {c.dealRole && (
                          <Badge variant="outline" className="text-[10px] capitalize">
                            {c.dealRole.replace("_", " ")}
                          </Badge>
                        )}
                      </div>
                      {c.company && (
                        <div className="text-xs text-muted-foreground">{c.company}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" />
                Open Tasks
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!tasks?.length ? (
                <p className="text-sm text-muted-foreground italic">No open tasks</p>
              ) : (
                <div className="space-y-2">
                  {tasks.map((t) => (
                    <div key={t.id} className="border rounded-md p-2">
                      <div className="text-sm font-medium">{t.title}</div>
                      {t.dueAt && (
                        <div className="text-xs text-muted-foreground mt-0.5">
                          Due {formatDistanceToNow(new Date(t.dueAt), { addSuffix: true })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {showEdit && property && (
        <EditPropertyModal
          property={property}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            setShowEdit(false);
            utils.properties.byId.invalidate({ id: propertyId });
            utils.properties.list.invalidate();
          }}
        />
      )}

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete property?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{property.name}</strong> will be permanently deleted along with all linked
              data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProperty.mutate({ id: propertyId })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <ActivityDetailModal
        activityId={openActivityId}
        open={openActivityId !== null}
        onClose={() => setOpenActivityId(null)}
        onChanged={() => refetchActivities()}
      />
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{value || "—"}</div>
    </div>
  );
}

function EditPropertyModal({
  property,
  onClose,
  onSuccess,
}: {
  property: { id: number; name: string; propertyType: string; address: string | null; city: string | null; state: string | null; zip: string | null; unitCount: number | null; vintageYear: number | null; status: string; notes: string | null };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const profileQ = trpc.users.getMyProfile.useQuery();
  const prefs2 = parsePreferences(profileQ.data?.preferences ?? "");
  const PROPERTY_TYPES = ALL_PROPERTY_TYPES.filter((t) => getEnabledTypes(prefs2).includes(t.value));
  const [form, setForm] = useState({
    name: property.name,
    propertyType: property.propertyType,
    address: property.address ?? "",
    city: property.city ?? "",
    state: property.state ?? "",
    zip: property.zip ?? "",
    unitCount: property.unitCount?.toString() ?? "",
    vintageYear: property.vintageYear?.toString() ?? "",
    status: property.status,
    notes: property.notes ?? "",
  });

  const updateProperty = trpc.properties.update.useMutation({
    onSuccess: () => {
      toast.success("Property updated");
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    updateProperty.mutate({
      id: property.id,
      data: {
        name: form.name,
        propertyType: form.propertyType as "mhc" | "apartment" | "affordable_housing" | "self_storage" | "office" | "retail" | "industrial" | "other",
        address: form.address || null,
        city: form.city || null,
        state: form.state || null,
        zip: form.zip || null,
        unitCount: form.unitCount ? Number(form.unitCount) : null,
        vintageYear: form.vintageYear ? Number(form.vintageYear) : null,
        status: form.status as "researching" | "prospecting" | "seller" | "listed" | "under_contract" | "recently_sold",
        notes: form.notes || null,
      },
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Property</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Type</Label>
              <Select value={form.propertyType} onValueChange={(v) => setForm({ ...form, propertyType: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Zip</Label>
              <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            </div>
            <div>
              <Label>Units</Label>
              <Input type="number" value={form.unitCount} onChange={(e) => setForm({ ...form, unitCount: e.target.value })} />
            </div>
            <div>
              <Label>Year Built</Label>
              <Input type="number" value={form.vintageYear} onChange={(e) => setForm({ ...form, vintageYear: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateProperty.isPending}>
            {updateProperty.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
