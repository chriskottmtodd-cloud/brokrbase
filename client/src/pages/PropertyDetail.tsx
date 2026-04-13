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
  Check,
  DollarSign,
  Edit2,
  Loader2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ActivityDetailModal } from "@/components/ActivityDetailModal";
import { ALL_PROPERTY_TYPES, getEnabledTypes, getTypeColor, parsePreferences } from "./Settings";

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
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [newActivity, setNewActivity] = useState({ type: "call" as string, subject: "", notes: "" });
  const [showLinkContact, setShowLinkContact] = useState(false);
  const [linkContactSearch, setLinkContactSearch] = useState("");
  const [linkContactRole, setLinkContactRole] = useState("owner");
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", dueAt: "" });
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ title: "", dueAt: "" });

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
      utils.properties.list.invalidate();
      utils.dashboard.metrics.invalidate();
      setLocation("/properties");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateNotes = trpc.properties.update.useMutation({
    onSuccess: () => {
      toast.success("Notes saved");
      setEditingNotes(false);
      utils.properties.byId.invalidate({ id: propertyId });
    },
    onError: (e) => toast.error(e.message),
  });

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => {
      toast.success("Task created");
      setShowAddTask(false);
      setNewTask({ title: "", dueAt: "" });
      utils.tasks.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const updateTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("Task updated");
      setEditingTaskId(null);
      utils.tasks.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const completeTask = trpc.tasks.update.useMutation({
    onSuccess: () => {
      toast.success("Task completed");
      utils.tasks.list.invalidate();
      utils.dashboard.metrics.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const contactSearchQ = trpc.contacts.list.useQuery(
    { search: linkContactSearch, limit: 10 },
    { enabled: showLinkContact && linkContactSearch.length >= 1 },
  );

  const createLink = trpc.contactLinks.create.useMutation({
    onSuccess: () => {
      toast.success("Contact linked");
      setShowLinkContact(false);
      setLinkContactSearch("");
      utils.contactLinks.listForProperty.invalidate({ propertyId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLink = trpc.contactLinks.delete.useMutation({
    onSuccess: () => {
      toast.success("Link removed");
      utils.contactLinks.listForProperty.invalidate({ propertyId });
    },
    onError: (e) => toast.error(e.message),
  });

  const createActivity = trpc.activities.create.useMutation({
    onSuccess: () => {
      toast.success("Activity logged");
      setShowAddActivity(false);
      setNewActivity({ type: "call", subject: "", notes: "" });
      refetchActivities();
      utils.dashboard.metrics.invalidate();
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
  const typeColor = getTypeColor(prefs, property.propertyType);

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
          <div
            className="h-12 w-12 rounded-lg flex items-center justify-center shrink-0"
            style={{ backgroundColor: typeColor + "22", color: typeColor }}
          >
            <Building2 className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold truncate">{property.name}</h1>
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Badge
                variant="outline"
                className="capitalize"
                style={{ borderColor: typeColor + "55", color: typeColor }}
              >
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
          {(property.latitude || property.address) && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() => {
                if (property.latitude && property.longitude) {
                  setLocation(`/map?lat=${property.latitude}&lng=${property.longitude}&zoom=16`);
                } else {
                  setLocation(`/map?search=${encodeURIComponent(fullAddress)}`);
                }
              }}
            >
              <MapPin className="h-3.5 w-3.5" /> View on Map
            </Button>
          )}
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
                <InlineEditField
                  label="Year Built"
                  value={property.vintageYear}
                  type="number"
                  propertyId={propertyId}
                  fieldKey="vintageYear"
                />
                <InlineEditField
                  label="Lot Size (acres)"
                  value={property.lotAcres}
                  type="number"
                  propertyId={propertyId}
                  fieldKey="lotAcres"
                />
                <InlineEditField
                  label="Building Size (sqft)"
                  value={property.sizeSqft}
                  type="number"
                  format={(v) => v ? Number(v).toLocaleString() : undefined}
                  propertyId={propertyId}
                  fieldKey="sizeSqft"
                />
                {["apartment", "mhc", "affordable_housing", "self_storage"].includes(property.propertyType) && (
                  <InlineEditField
                    label="Units"
                    value={property.unitCount}
                    type="number"
                    propertyId={propertyId}
                    fieldKey="unitCount"
                  />
                )}
                {["office", "retail", "industrial"].includes(property.propertyType) && (
                  <>
                    <InlineEditField
                      label="Primary Tenant"
                      value={(property as any).primaryTenant}
                      type="text"
                      propertyId={propertyId}
                      fieldKey="primaryTenant"
                    />
                    <InlineEditField
                      label="Lease Type"
                      value={(property as any).leaseType}
                      type="text"
                      placeholder="NNN, Gross, Modified Gross..."
                      propertyId={propertyId}
                      fieldKey="leaseType"
                    />
                    <InlineEditField
                      label="Lease Expiration"
                      value={(property as any).leaseExpiration}
                      type="date"
                      propertyId={propertyId}
                      fieldKey="leaseExpiration"
                    />
                  </>
                )}
              </div>
              <div className="pt-3 border-t">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-muted-foreground">Notes</div>
                  {!editingNotes && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => {
                        setNotesText(property.notes ?? "");
                        setEditingNotes(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                      {property.notes ? "Edit" : "Add note"}
                    </Button>
                  )}
                </div>
                {editingNotes ? (
                  <div className="space-y-2">
                    <Textarea
                      rows={4}
                      value={notesText}
                      onChange={(e) => setNotesText(e.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="gap-1"
                        disabled={updateNotes.isPending}
                        onClick={() =>
                          updateNotes.mutate({
                            id: propertyId,
                            data: { notes: notesText || null },
                          })
                        }
                      >
                        <Save className="h-3 w-3" />
                        {updateNotes.isPending ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingNotes(false)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : property.notes ? (
                  <p className="text-sm whitespace-pre-wrap">{property.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No notes yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Activity Timeline */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" />
                  Activity History
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => setShowAddActivity(true)}
                >
                  <Plus className="h-3 w-3" /> Log Activity
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {showAddActivity && (
                <div className="space-y-2 p-3 border rounded-md bg-muted/30 mb-4">
                  <div className="flex gap-2">
                    <Select
                      value={newActivity.type}
                      onValueChange={(v) => setNewActivity({ ...newActivity, type: v })}
                    >
                      <SelectTrigger className="h-8 text-xs w-28">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="call">Call</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="note">Note</SelectItem>
                        <SelectItem value="text">Text</SelectItem>
                        <SelectItem value="voicemail">Voicemail</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Subject..."
                      value={newActivity.subject}
                      onChange={(e) => setNewActivity({ ...newActivity, subject: e.target.value })}
                      className="h-8 text-xs"
                    />
                  </div>
                  <Textarea
                    rows={3}
                    placeholder="Notes..."
                    value={newActivity.notes}
                    onChange={(e) => setNewActivity({ ...newActivity, notes: e.target.value })}
                    className="text-xs"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={createActivity.isPending}
                      onClick={() =>
                        createActivity.mutate({
                          type: newActivity.type as "call" | "email" | "meeting" | "note" | "text" | "voicemail",
                          propertyId,
                          subject: newActivity.subject || undefined,
                          notes: newActivity.notes || undefined,
                        })
                      }
                    >
                      {createActivity.isPending ? "Saving..." : "Log"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddActivity(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {!activities?.length && !showAddActivity ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No activities logged yet</p>
                  <p className="text-xs mt-1">Use the mic button or click "Log Activity" above.</p>
                </div>
              ) : (
                <div className="space-y-0">
                  {activities?.map((activity, idx) => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => setOpenActivityId(activity.id)}
                      className="w-full text-left flex gap-3 pb-4 relative hover:bg-muted/40 rounded-md -mx-2 px-2 py-1 transition-colors"
                    >
                      {idx < (activities?.length ?? 0) - 1 && (
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
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />
                  Linked Contacts
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => setShowLinkContact(true)}
                >
                  <Plus className="h-3 w-3" /> Link
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {showLinkContact && (
                <div className="space-y-2 p-2 border rounded-md bg-muted/30 mb-3">
                  <Select value={linkContactRole} onValueChange={setLinkContactRole}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="owner">Owner</SelectItem>
                      <SelectItem value="tenant">Tenant</SelectItem>
                      <SelectItem value="seller">Seller</SelectItem>
                      <SelectItem value="buyer">Buyer</SelectItem>
                      <SelectItem value="buyers_broker">Buyer's Broker</SelectItem>
                      <SelectItem value="listing_agent">Listing Agent</SelectItem>
                      <SelectItem value="property_manager">Property Manager</SelectItem>
                      <SelectItem value="attorney">Attorney</SelectItem>
                      <SelectItem value="lender">Lender</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    placeholder="Search contacts..."
                    value={linkContactSearch}
                    onChange={(e) => setLinkContactSearch(e.target.value)}
                    className="h-8 text-xs"
                    autoFocus
                  />
                  {linkContactSearch.length >= 1 && (
                    <div className="max-h-36 overflow-y-auto border rounded">
                      {!contactSearchQ.data?.length ? (
                        <div className="text-xs text-muted-foreground px-2 py-1">No contacts found</div>
                      ) : (
                        contactSearchQ.data.map((c) => (
                          <button
                            key={c.id}
                            type="button"
                            className="block text-xs text-left w-full px-2 py-1.5 hover:bg-muted"
                            onClick={() =>
                              createLink.mutate({
                                contactId: c.id,
                                propertyId,
                                dealRole: linkContactRole as any,
                                source: "manual",
                              })
                            }
                          >
                            <div className="font-medium">{c.firstName} {c.lastName}</div>
                            {c.company && <div className="text-[10px] text-muted-foreground">{c.company}</div>}
                          </button>
                        ))
                      )}
                    </div>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowLinkContact(false); setLinkContactSearch(""); }}>
                    Cancel
                  </Button>
                </div>
              )}
              {!linkedContacts?.length && !showLinkContact ? (
                <p className="text-sm text-muted-foreground italic">No linked contacts</p>
              ) : (
                <div className="space-y-2">
                  {linkedContacts?.map((c) => (
                    <div key={c.id} className="flex items-start gap-2 border rounded-md p-2">
                      <button
                        type="button"
                        onClick={() => setLocation(`/contacts/${c.contactId}`)}
                        className="flex-1 text-left min-w-0 hover:bg-muted/40 rounded"
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
                      <button
                        type="button"
                        onClick={() => deleteLink.mutate({ id: c.id })}
                        className="text-muted-foreground hover:text-destructive shrink-0 mt-1"
                        title="Remove link"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Calendar className="h-3.5 w-3.5" />
                  Open Tasks
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => setShowAddTask(true)}
                >
                  <Plus className="h-3 w-3" /> Add
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {showAddTask && (
                <div className="space-y-2 p-2 border rounded-md bg-muted/30 mb-3">
                  <Input
                    placeholder="Task title..."
                    value={newTask.title}
                    onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                    autoFocus
                  />
                  <Input
                    type="date"
                    value={newTask.dueAt}
                    onChange={(e) => setNewTask({ ...newTask, dueAt: e.target.value })}
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      disabled={!newTask.title || createTask.isPending}
                      onClick={() =>
                        createTask.mutate({
                          title: newTask.title,
                          propertyId,
                          type: "follow_up",
                          priority: "medium",
                          dueAt: newTask.dueAt ? new Date(newTask.dueAt) : undefined,
                        })
                      }
                    >
                      {createTask.isPending ? "Creating..." : "Create"}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setShowAddTask(false)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {!tasks?.length && !showAddTask ? (
                <p className="text-sm text-muted-foreground italic">No open tasks</p>
              ) : (
                <div className="space-y-2">
                  {tasks?.map((t) =>
                    editingTaskId === t.id ? (
                      <div key={t.id} className="space-y-2 p-2 border rounded-md bg-muted/30">
                        <Input
                          value={editTaskForm.title}
                          onChange={(e) => setEditTaskForm({ ...editTaskForm, title: e.target.value })}
                          autoFocus
                        />
                        <Input
                          type="date"
                          value={editTaskForm.dueAt}
                          onChange={(e) => setEditTaskForm({ ...editTaskForm, dueAt: e.target.value })}
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            disabled={updateTask.isPending}
                            onClick={() =>
                              updateTask.mutate({
                                id: t.id,
                                title: editTaskForm.title,
                                dueAt: editTaskForm.dueAt ? new Date(editTaskForm.dueAt) : undefined,
                              })
                            }
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingTaskId(null)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div key={t.id} className="border rounded-md p-2 flex items-start gap-2">
                        <button
                          onClick={() =>
                            completeTask.mutate({ id: t.id, status: "completed" })
                          }
                          className="text-muted-foreground hover:text-green-600 mt-0.5 shrink-0"
                          title="Complete task"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button
                          className="flex-1 text-left min-w-0"
                          onClick={() => {
                            setEditingTaskId(t.id);
                            setEditTaskForm({
                              title: t.title,
                              dueAt: t.dueAt
                                ? new Date(t.dueAt).toISOString().split("T")[0]
                                : "",
                            });
                          }}
                        >
                          <div className="text-sm font-medium">{t.title}</div>
                          {t.dueAt && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Due {formatDistanceToNow(new Date(t.dueAt), { addSuffix: true })}
                            </div>
                          )}
                        </button>
                      </div>
                    )
                  )}
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

function InlineEditField({
  label,
  value,
  type,
  format,
  placeholder,
  propertyId,
  fieldKey,
}: {
  label: string;
  value: string | number | Date | null | undefined;
  type: "text" | "number" | "date";
  format?: (v: unknown) => string | undefined;
  placeholder?: string;
  propertyId: number;
  fieldKey: string;
}) {
  const [editing, setEditing] = useState(false);
  const [inputVal, setInputVal] = useState("");
  const utils = trpc.useUtils();
  const update = trpc.properties.update.useMutation({
    onSuccess: () => {
      setEditing(false);
      utils.properties.byId.invalidate({ id: propertyId });
    },
    onError: (e) => toast.error(e.message),
  });

  const displayValue = format
    ? format(value)
    : type === "date" && value
      ? new Date(value as string | Date).toLocaleDateString()
      : value != null
        ? String(value)
        : undefined;

  const startEdit = () => {
    if (type === "date" && value) {
      setInputVal(new Date(value as string | Date).toISOString().split("T")[0]);
    } else {
      setInputVal(value != null ? String(value) : "");
    }
    setEditing(true);
  };

  const save = () => {
    let parsed: unknown;
    if (!inputVal && inputVal !== "0") {
      parsed = null;
    } else if (type === "number") {
      parsed = parseFloat(inputVal) || null;
    } else if (type === "date") {
      parsed = new Date(inputVal);
    } else {
      parsed = inputVal;
    }
    update.mutate({ id: propertyId, data: { [fieldKey]: parsed } as any });
  };

  if (editing) {
    return (
      <div>
        <div className="text-xs text-muted-foreground mb-0.5">{label}</div>
        <Input
          type={type === "number" ? "number" : type === "date" ? "date" : "text"}
          value={inputVal}
          onChange={(e) => setInputVal(e.target.value)}
          placeholder={placeholder}
          className="h-7 text-sm"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            if (e.key === "Escape") setEditing(false);
          }}
          onBlur={save}
        />
      </div>
    );
  }

  return (
    <div
      className="cursor-pointer hover:bg-muted/40 rounded px-1 -mx-1 py-0.5 transition-colors"
      onClick={startEdit}
      title="Click to edit"
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm">{displayValue || <span className="text-muted-foreground">—</span>}</div>
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
