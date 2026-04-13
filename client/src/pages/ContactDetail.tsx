import { useState } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
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
import {
  Activity,
  ArrowLeft,
  Building2,
  Calendar,
  Check,
  Edit2,
  Loader2,
  Mail,
  Phone,
  Plus,
  Save,
  Trash2,
  User as UserIcon,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ActivityDetailModal } from "@/components/ActivityDetailModal";

const activityIcons: Record<string, React.ReactNode> = {
  call: <Phone className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  meeting: <Calendar className="h-3.5 w-3.5" />,
  note: <Activity className="h-3.5 w-3.5" />,
};

const PRIORITIES = [
  { value: "hot", label: "Hot" },
  { value: "warm", label: "Warm" },
  { value: "cold", label: "Cold" },
  { value: "inactive", label: "Inactive" },
] as const;

export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const contactId = parseInt(id ?? "0");

  const [showEdit, setShowEdit] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [openActivityId, setOpenActivityId] = useState<number | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesText, setNotesText] = useState("");
  const [showAddActivity, setShowAddActivity] = useState(false);
  const [newActivity, setNewActivity] = useState({ type: "call" as string, subject: "", notes: "" });
  const [showLinkProperty, setShowLinkProperty] = useState(false);
  const [linkPropertySearch, setLinkPropertySearch] = useState("");
  const [linkPropertyRole, setLinkPropertyRole] = useState("owner");
  const [selectedLinkProperty, setSelectedLinkProperty] = useState<{ id: number; name: string; city?: string } | null>(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [newTask, setNewTask] = useState({ title: "", dueAt: "" });
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editTaskForm, setEditTaskForm] = useState({ title: "", dueAt: "" });

  const utils = trpc.useUtils();

  const { data: contact, isLoading } = trpc.contacts.byId.useQuery(
    { id: contactId },
    { enabled: !!contactId },
  );
  const { data: activities, refetch: refetchActivities } = trpc.activities.list.useQuery(
    { contactId, limit: 20 },
    { enabled: !!contactId },
  );
  const { data: linkedProperties } = trpc.contactLinks.listForContact.useQuery(
    { contactId },
    { enabled: !!contactId },
  );
  const { data: tasks } = trpc.tasks.list.useQuery(
    { contactId, status: "pending" },
    { enabled: !!contactId },
  );

  const deleteContact = trpc.contacts.delete.useMutation({
    onSuccess: () => {
      toast.success("Contact deleted");
      utils.contacts.list.invalidate();
      utils.dashboard.metrics.invalidate();
      setLocation("/contacts");
    },
    onError: (e) => toast.error(e.message),
  });

  const updateNotes = trpc.contacts.update.useMutation({
    onSuccess: () => {
      toast.success("Notes saved");
      setEditingNotes(false);
      utils.contacts.byId.invalidate({ id: contactId });
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

  const propertySearchQ = trpc.properties.list.useQuery(
    { search: linkPropertySearch, limit: 10 },
    { enabled: showLinkProperty && linkPropertySearch.length >= 1 },
  );

  const createLink = trpc.contactLinks.create.useMutation({
    onSuccess: () => {
      toast.success("Property linked");
      setShowLinkProperty(false);
      setLinkPropertySearch("");
      setSelectedLinkProperty(null);
      utils.contactLinks.listForContact.invalidate({ contactId });
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteLink = trpc.contactLinks.delete.useMutation({
    onSuccess: () => {
      toast.success("Link removed");
      utils.contactLinks.listForContact.invalidate({ contactId });
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

  if (!contactId) return <div className="p-6">Invalid contact ID</div>;
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!contact) return <div className="p-6">Contact not found</div>;

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-5">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/contacts")} className="gap-1">
          <ArrowLeft className="h-4 w-4" /> Contacts
        </Button>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="h-12 w-12 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
            <UserIcon className="h-6 w-6" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">
              {contact.firstName} {contact.lastName}
            </h1>
            {contact.company && (
              <div className="text-sm text-muted-foreground">{contact.company}</div>
            )}
            <div className="flex items-center gap-2 flex-wrap mt-1">
              <Badge variant="outline" className="capitalize">
                {contact.priority}
              </Badge>
              {contact.isOwner && <Badge variant="outline">Owner</Badge>}
              {contact.isBuyer && <Badge variant="outline">Buyer</Badge>}
            </div>
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
        <div className="lg:col-span-2 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Contact Info
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {contact.email && (
                <div className="flex items-center gap-2">
                  <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
                </div>
              )}
              {contact.phone && (
                <div className="flex items-center gap-2">
                  <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  <a href={`tel:${contact.phone}`} className="hover:underline">{contact.phone}</a>
                </div>
              )}
              {(contact.address || contact.city) && (
                <div className="text-muted-foreground">
                  {[contact.address, contact.city, contact.state, contact.zip].filter(Boolean).join(", ")}
                </div>
              )}
              <div className="pt-2 border-t mt-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-xs text-muted-foreground">Notes</div>
                  {!editingNotes && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 text-xs gap-1"
                      onClick={() => {
                        setNotesText(contact.notes ?? "");
                        setEditingNotes(true);
                      }}
                    >
                      <Edit2 className="h-3 w-3" />
                      {contact.notes ? "Edit" : "Add note"}
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
                            id: contactId,
                            notes: notesText || undefined,
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
                ) : contact.notes ? (
                  <p className="whitespace-pre-wrap">{contact.notes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground italic">No notes yet</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Activity className="h-3.5 w-3.5" /> Activity History
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
                          contactId,
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

        <div className="space-y-5">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Building2 className="h-3.5 w-3.5" /> Linked Properties
                </CardTitle>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs gap-1"
                  onClick={() => setShowLinkProperty(true)}
                >
                  <Plus className="h-3 w-3" /> Link
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {showLinkProperty && (
                <div className="space-y-2 p-2 border rounded-md bg-muted/30 mb-3">
                  {!selectedLinkProperty && (
                    <>
                      <Input
                        placeholder="Search properties..."
                        value={linkPropertySearch}
                        onChange={(e) => setLinkPropertySearch(e.target.value)}
                        className="h-8 text-xs"
                        autoFocus
                      />
                      {linkPropertySearch.length >= 1 && (
                        <div className="max-h-36 overflow-y-auto border rounded">
                          {!propertySearchQ.data?.length ? (
                            <div className="text-xs text-muted-foreground px-2 py-1">No properties found</div>
                          ) : (
                            propertySearchQ.data.map((p) => (
                              <button
                                key={p.id}
                                type="button"
                                className="block text-xs text-left w-full px-2 py-1.5 hover:bg-muted"
                                onClick={() => setSelectedLinkProperty({ id: p.id, name: p.name, city: p.city ?? undefined })}
                              >
                                <div className="font-medium">{p.name}</div>
                                {p.city && <div className="text-[10px] text-muted-foreground">{p.city}</div>}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </>
                  )}
                  {selectedLinkProperty && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <div className="text-xs font-semibold flex-1">{selectedLinkProperty.name}</div>
                        <button type="button" className="text-[10px] text-muted-foreground hover:text-foreground" onClick={() => { setSelectedLinkProperty(null); setLinkPropertySearch(""); }}>Change</button>
                      </div>
                      {selectedLinkProperty.city && <div className="text-[10px] text-muted-foreground">{selectedLinkProperty.city}</div>}
                      <Select value={linkPropertyRole} onValueChange={setLinkPropertyRole}>
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
                      <Button
                        size="sm"
                        className="h-8 text-xs w-full"
                        disabled={createLink.isPending}
                        onClick={() =>
                          createLink.mutate({
                            contactId,
                            propertyId: selectedLinkProperty.id,
                            dealRole: linkPropertyRole as any,
                            source: "manual",
                          })
                        }
                      >
                        {createLink.isPending ? "Linking..." : `Link as ${linkPropertyRole.replace("_", " ")}`}
                      </Button>
                    </div>
                  )}
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowLinkProperty(false); setLinkPropertySearch(""); setSelectedLinkProperty(null); }}>
                    Cancel
                  </Button>
                </div>
              )}
              {!linkedProperties?.length && !showLinkProperty ? (
                <p className="text-sm text-muted-foreground italic">No linked properties</p>
              ) : (
                <div className="space-y-2">
                  {linkedProperties?.filter((l) => l.propertyId).map((l) => (
                    <div key={l.id} className="flex items-start gap-2 border rounded-md p-2">
                      <button
                        type="button"
                        onClick={() => setLocation(`/properties/${l.propertyId}`)}
                        className="flex-1 text-left min-w-0 hover:bg-muted/40 rounded"
                      >
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium">{l.propertyName}</span>
                          {l.dealRole && (
                            <Badge variant="outline" className="text-[10px] capitalize">
                              {l.dealRole.replace("_", " ")}
                            </Badge>
                          )}
                        </div>
                        {l.propertyCity && (
                          <div className="text-xs text-muted-foreground">{l.propertyCity}</div>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteLink.mutate({ id: l.id })}
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
                  <Calendar className="h-3.5 w-3.5" /> Open Tasks
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
                          contactId,
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

      {showEdit && contact && (
        <EditContactModal
          contact={contact}
          onClose={() => setShowEdit(false)}
          onSuccess={() => {
            setShowEdit(false);
            utils.contacts.byId.invalidate({ id: contactId });
            utils.contacts.list.invalidate();
          }}
        />
      )}

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{contact.firstName} {contact.lastName}</strong> will be permanently deleted.
              This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteContact.mutate({ id: contactId })}
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

function EditContactModal({
  contact,
  onClose,
  onSuccess,
}: {
  contact: { id: number; firstName: string; lastName: string; email: string | null; phone: string | null; company: string | null; priority: string; isOwner: boolean; isBuyer: boolean; notes: string | null };
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [form, setForm] = useState({
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    company: contact.company ?? "",
    priority: contact.priority,
    isOwner: contact.isOwner,
    isBuyer: contact.isBuyer,
    notes: contact.notes ?? "",
  });

  const update = trpc.contacts.update.useMutation({
    onSuccess: () => {
      toast.success("Contact updated");
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    update.mutate({
      id: contact.id,
      firstName: form.firstName,
      lastName: form.lastName,
      email: form.email || undefined,
      phone: form.phone || undefined,
      company: form.company || undefined,
      priority: form.priority as "hot" | "warm" | "cold" | "inactive",
      isOwner: form.isOwner,
      isBuyer: form.isBuyer,
      notes: form.notes || undefined,
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Contact</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>First Name</Label>
              <Input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
            </div>
            <div>
              <Label>Last Name</Label>
              <Input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
            </div>
          </div>
          <div>
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Company</Label>
            <Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} />
          </div>
          <div>
            <Label>Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => (
                  <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isOwner} onChange={(e) => setForm({ ...form, isOwner: e.target.checked })} />
              Owner
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={form.isBuyer} onChange={(e) => setForm({ ...form, isBuyer: e.target.checked })} />
              Buyer
            </label>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending}>
            {update.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
