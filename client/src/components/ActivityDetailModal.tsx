import { useEffect, useState } from "react";
import { Building2, Loader2, Pencil, Trash2, User } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

const TYPES = ["call", "email", "meeting", "note", "text", "voicemail"] as const;
const OUTCOMES = [
  "reached",
  "voicemail",
  "no_answer",
  "callback_requested",
  "not_interested",
  "interested",
  "follow_up",
] as const;

export function ActivityDetailModal({
  activityId,
  open,
  onClose,
  onChanged,
}: {
  activityId: number | null;
  open: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const utils = trpc.useUtils();
  const detailQuery = trpc.activities.getDetail.useQuery(
    { id: activityId ?? 0 },
    { enabled: !!activityId && open },
  );

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    type: "note" as (typeof TYPES)[number],
    subject: "",
    notes: "",
    outcome: "" as "" | (typeof OUTCOMES)[number],
    duration: "",
    occurredAt: "",
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  const data = detailQuery.data;

  useEffect(() => {
    if (data?.activity) {
      setForm({
        type: data.activity.type,
        subject: data.activity.subject ?? "",
        notes: data.activity.notes ?? "",
        outcome: (data.activity.outcome ?? "") as typeof form.outcome,
        duration: data.activity.duration?.toString() ?? "",
        occurredAt: data.activity.occurredAt
          ? format(new Date(data.activity.occurredAt), "yyyy-MM-dd'T'HH:mm")
          : "",
      });
      setEditing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.activity?.id]);

  const updateMut = trpc.activities.update.useMutation({
    onSuccess: () => {
      toast.success("Activity updated");
      detailQuery.refetch();
      utils.activities.list.invalidate();
      onChanged?.();
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteMut = trpc.activities.delete.useMutation({
    onSuccess: () => {
      toast.success("Activity deleted");
      utils.activities.list.invalidate();
      onChanged?.();
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!activityId) return;
    updateMut.mutate({
      id: activityId,
      type: form.type,
      subject: form.subject || null,
      notes: form.notes || null,
      outcome: form.outcome || null,
      duration: form.duration ? Number(form.duration) : null,
      occurredAt: form.occurredAt ? new Date(form.occurredAt) : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Activity Details</DialogTitle>
        </DialogHeader>

        {detailQuery.isLoading && (
          <div className="flex items-center justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {detailQuery.error && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
            <div className="font-semibold mb-1">Failed to load activity</div>
            <div className="text-xs whitespace-pre-wrap">{detailQuery.error.message}</div>
          </div>
        )}

        {!detailQuery.isLoading && !detailQuery.error && !data && (
          <div className="text-sm text-muted-foreground py-6 text-center">
            No data returned for this activity.
          </div>
        )}

        {data && (
          <div className="space-y-5">
            {/* Header bar with type, date, edit/delete */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="capitalize">
                  {data.activity.type}
                </Badge>
                {data.activity.outcome && (
                  <Badge variant="outline" className="capitalize">
                    {data.activity.outcome.replace("_", " ")}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">
                  {format(new Date(data.activity.occurredAt), "PPp")}
                </span>
              </div>
              <div className="flex items-center gap-1">
                {!editing && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditing(true)}
                    className="h-8 gap-1"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmDelete(true)}
                  className="h-8 gap-1 text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            </div>

            {/* View mode */}
            {!editing && (
              <div className="space-y-3">
                {data.activity.subject && (
                  <div>
                    <div className="text-xs text-muted-foreground">Subject</div>
                    <div className="text-sm font-medium">{data.activity.subject}</div>
                  </div>
                )}
                {data.activity.summary && (
                  <div>
                    <div className="text-xs text-muted-foreground">Summary</div>
                    <p className="text-sm italic">"{data.activity.summary}"</p>
                  </div>
                )}
                {data.activity.notes && (
                  <div>
                    <div className="text-xs text-muted-foreground">Notes</div>
                    <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded-md p-3">
                      {data.activity.notes}
                    </p>
                  </div>
                )}
                {data.activity.duration && (
                  <div className="text-xs text-muted-foreground">
                    Duration: {data.activity.duration} min
                  </div>
                )}
              </div>
            )}

            {/* Edit mode */}
            {editing && (
              <div className="space-y-3 border rounded-lg p-3 bg-muted/30">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Type</label>
                    <Select
                      value={form.type}
                      onValueChange={(v) =>
                        setForm({ ...form, type: v as (typeof TYPES)[number] })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {TYPES.map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">When</label>
                    <Input
                      type="datetime-local"
                      value={form.occurredAt}
                      onChange={(e) => setForm({ ...form, occurredAt: e.target.value })}
                      className="h-9"
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Subject</label>
                  <Input
                    value={form.subject}
                    onChange={(e) => setForm({ ...form, subject: e.target.value })}
                    className="h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Notes</label>
                  <Textarea
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    rows={6}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Outcome</label>
                    <Select
                      value={form.outcome || "__none__"}
                      onValueChange={(v) =>
                        setForm({
                          ...form,
                          outcome: v === "__none__" ? "" : (v as (typeof OUTCOMES)[number]),
                        })
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">None</SelectItem>
                        {OUTCOMES.map((o) => (
                          <SelectItem key={o} value={o} className="capitalize">
                            {o.replace("_", " ")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Duration (min)</label>
                    <Input
                      type="number"
                      value={form.duration}
                      onChange={(e) => setForm({ ...form, duration: e.target.value })}
                      className="h-9"
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <Button variant="outline" size="sm" onClick={() => setEditing(false)}>
                    Cancel
                  </Button>
                  <Button size="sm" onClick={handleSave} disabled={updateMut.isPending}>
                    {updateMut.isPending ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            )}

            {/* Linked entities (read-only) */}
            <LinkedList
              title="Contacts"
              icon={<User className="h-3.5 w-3.5" />}
              items={data.linkedContacts.map((c) => ({
                key: `c-${c.id}`,
                label: c.name,
                sub: c.company ?? undefined,
              }))}
            />
            <LinkedList
              title="Properties"
              icon={<Building2 className="h-3.5 w-3.5" />}
              items={data.linkedProperties.map((p) => ({
                key: `p-${p.id}`,
                label: p.name,
                sub: p.city ?? undefined,
              }))}
            />
            <LinkedList
              title="Listings / Deals"
              icon={<Building2 className="h-3.5 w-3.5" />}
              items={data.linkedListings.map((l) => ({
                key: `l-${l.id}`,
                label: l.title,
              }))}
            />
          </div>
        )}

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this activity?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the activity and all its links. This cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => activityId && deleteMut.mutate({ id: activityId })}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </DialogContent>
    </Dialog>
  );
}

function LinkedList({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: Array<{ key: string; label: string; sub?: string }>;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        {icon}
        {title}
        <span className="text-muted-foreground/60">({items.length})</span>
      </div>
      <div className="space-y-1">
        {items.map((it) => (
          <div
            key={it.key}
            className="border rounded-md px-2 py-1.5 text-sm"
          >
            <div className="font-medium truncate">{it.label}</div>
            {it.sub && <div className="text-xs text-muted-foreground truncate">{it.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}
