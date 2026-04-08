import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format } from "date-fns";
import { ActivityDetailModal } from "@/components/ActivityDetailModal";
import {
  Phone, Mail, Calendar, FileText, MessageSquare, Mic, Plus, User, Building2, Filter,
  Sparkles, CheckCircle2, ListTodo, RefreshCw, X, ChevronRight, AlertTriangle, Link2,
} from "lucide-react";

const typeConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  call: { icon: <Phone className="h-4 w-4" />, color: "bg-blue-500/10 text-blue-400 border-blue-500/20", label: "Call" },
  email: { icon: <Mail className="h-4 w-4" />, color: "bg-purple-500/10 text-purple-400 border-purple-500/20", label: "Email" },
  meeting: { icon: <Calendar className="h-4 w-4" />, color: "bg-green-500/10 text-green-400 border-green-500/20", label: "Meeting" },
  note: { icon: <FileText className="h-4 w-4" />, color: "bg-slate-500/10 text-slate-400 border-slate-500/20", label: "Note" },
  text: { icon: <MessageSquare className="h-4 w-4" />, color: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20", label: "Text" },
  voicemail: { icon: <Mic className="h-4 w-4" />, color: "bg-amber-500/10 text-amber-400 border-amber-500/20", label: "Voicemail" },
};

const outcomeColors: Record<string, string> = {
  reached: "bg-green-500/10 text-green-400",
  voicemail: "bg-amber-500/10 text-amber-400",
  no_answer: "bg-slate-500/10 text-slate-400",
  callback_requested: "bg-blue-500/10 text-blue-400",
  not_interested: "bg-red-500/10 text-red-400",
  interested: "bg-cyan-500/10 text-cyan-400",
  follow_up: "bg-purple-500/10 text-purple-400",
};

export default function ActivityLog() {
  const [, setLocation] = useLocation();
  const [filterType, setFilterType] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);
  const [openActivityId, setOpenActivityId] = useState<number | null>(null);
  const utils = trpc.useUtils();

  const { data: activities, isLoading } = trpc.activities.list.useQuery({
    type: filterType !== "all" ? filterType : undefined,
    limit: 100,
  });

  // Group by date
  const grouped: Record<string, typeof activities> = {};
  activities?.forEach(a => {
    const key = format(new Date(a.occurredAt), "yyyy-MM-dd");
    if (!grouped[key]) grouped[key] = [];
    grouped[key]!.push(a);
  });

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Activity Log</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{activities?.length ?? 0} activities recorded</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="gap-2"><Plus className="h-4 w-4" />Log Activity</Button>
      </div>

      {/* Type Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="h-4 w-4 text-muted-foreground" />
        {["all", "call", "email", "meeting", "note", "text", "voicemail"].map(t => (
          <button key={t} onClick={() => setFilterType(t)} className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all capitalize ${filterType === t ? "bg-primary text-primary-foreground border-primary" : "bg-card border-border text-muted-foreground hover:text-foreground"}`}>
            {t === "all" ? "All" : typeConfig[t]?.label ?? t}
          </button>
        ))}
      </div>

      {/* Activity Feed */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />)}</div>
      ) : !activities?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Phone className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No activities yet</p>
          <p className="text-sm mt-1">Log your first call, email, or meeting</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).sort(([a], [b]) => b.localeCompare(a)).map(([date, acts]) => (
            <div key={date}>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mb-3 flex items-center gap-2">
                <span className="h-px flex-1 bg-border" />
                {format(new Date(date + "T12:00:00"), "EEEE, MMMM d, yyyy")}
                <span className="h-px flex-1 bg-border" />
              </p>
              <div className="space-y-2">
                {acts?.map(activity => {
                  const cfg = typeConfig[activity.type];
                  return (
                    <Card
                      key={activity.id}
                      className="border-border bg-card hover:bg-card/80 transition-colors cursor-pointer"
                      onClick={() => setOpenActivityId(activity.id)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                          <div className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 border ${cfg?.color ?? "bg-muted text-muted-foreground"}`}>
                            {cfg?.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-foreground text-sm">{activity.subject || cfg?.label}</span>
                              {activity.outcome && <Badge variant="outline" className={`text-xs px-1.5 py-0 ${outcomeColors[activity.outcome] ?? ""}`}>{activity.outcome.replace("_", " ")}</Badge>}
                              {activity.duration && <span className="text-xs text-muted-foreground">{activity.duration} min</span>}
                              <span className="text-xs text-muted-foreground ml-auto">{format(new Date(activity.occurredAt), "h:mm a")}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              {(activity as any).contactName && (
                                <span className="flex items-center gap-1 cursor-pointer hover:text-foreground" onClick={(e) => { e.stopPropagation(); activity.contactId && setLocation(`/contacts/${activity.contactId}`); }}>
                                  <User className="h-3 w-3" />{(activity as any).contactName}
                                </span>
                              )}
                              {(activity as any).propertyName && (
                                <span className="flex items-center gap-1 cursor-pointer hover:text-foreground" onClick={(e) => { e.stopPropagation(); activity.propertyId && setLocation(`/properties/${activity.propertyId}`); }}>
                                  <Building2 className="h-3 w-3" />{(activity as any).propertyName}
                                </span>
                              )}
                            </div>
                            {activity.summary && <p className="text-sm text-muted-foreground mt-2 bg-muted/30 rounded-md px-3 py-2 italic">"{activity.summary}"</p>}
                            {!activity.summary && activity.notes && <p className="text-sm text-muted-foreground mt-2 line-clamp-2">{activity.notes}</p>}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <LogActivityModal open={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={() => { setShowAddModal(false); utils.activities.list.invalidate(); }} />
      <ActivityDetailModal
        activityId={openActivityId}
        open={openActivityId !== null}
        onClose={() => setOpenActivityId(null)}
        onChanged={() => utils.activities.list.invalidate()}
      />
    </div>
  );
}

// ─── Post-Call Intelligence Panel ────────────────────────────────────────────

type ParsedCallResult = {
  summary: string;
  keyInsights: string[];
  completedTasks: Array<{ id: number; title: string; priority: string }>;
  newTasks: Array<{ title: string; description: string; priority: "urgent" | "high" | "medium" | "low"; type: "call" | "email" | "meeting" | "follow_up" | "research" | "other"; contactId: number; propertyId: number; dueDaysFromNow: number }>;
  propertyUpdates: Array<{ propertyId: number; propertyName: string; field: string; oldValue: string; newValue: string; reason: string }>;
  contactLinks: Array<{ contactId: number; contactName: string; propertyId: number; propertyName: string; relationship: string; reason: string }>;
};

function PostCallIntelPanel({
  result,
  onApply,
  onDismiss,
  isApplying,
}: {
  result: ParsedCallResult;
  onApply: (selections: { completeTaskIds: number[]; newTasks: typeof result.newTasks; propertyUpdates: Array<{ propertyId: number; field: string; newValue: string }> }) => void;
  onDismiss: () => void;
  isApplying: boolean;
}) {
  const [selectedCompleted, setSelectedCompleted] = useState<Set<number>>(new Set(result.completedTasks.map(t => t.id)));
  const [selectedNewTasks, setSelectedNewTasks] = useState<Set<number>>(new Set(result.newTasks.map((_, i) => i)));
  const [selectedUpdates, setSelectedUpdates] = useState<Set<number>>(new Set(result.propertyUpdates.map((_, i) => i)));

  const totalSelected = selectedCompleted.size + selectedNewTasks.size + selectedUpdates.size;

  const handleApply = () => {
    onApply({
      completeTaskIds: Array.from(selectedCompleted),
      newTasks: result.newTasks.filter((_, i) => selectedNewTasks.has(i)).map(t => ({
        ...t,
        priority: t.priority as "urgent" | "high" | "medium" | "low",
        type: t.type as "call" | "email" | "meeting" | "follow_up" | "research" | "other",
      })),
      propertyUpdates: result.propertyUpdates
        .filter((_, i) => selectedUpdates.has(i))
        .map(u => ({ propertyId: u.propertyId, field: u.field, newValue: u.newValue })),
    });
  };

  const toggle = (set: Set<number>, setFn: (s: Set<number>) => void, id: number) => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id); else next.add(id);
    setFn(next);
  };

  const hasAnything = result.completedTasks.length + result.newTasks.length + result.propertyUpdates.length + result.contactLinks.length > 0;

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="bg-primary/5 border border-primary/20 rounded-lg p-3">
        <div className="flex items-center gap-2 mb-1.5">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">AI Call Summary</span>
        </div>
        <p className="text-sm text-muted-foreground">{result.summary}</p>
        {result.keyInsights.length > 0 && (
          <ul className="mt-2 space-y-1">
            {result.keyInsights.map((insight, i) => (
              <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                <span className="text-primary mt-0.5">•</span>{insight}
              </li>
            ))}
          </ul>
        )}
      </div>

      {!hasAnything && (
        <div className="text-center py-4 text-muted-foreground text-sm">
          No action items detected in these notes.
        </div>
      )}

      {/* Completed Tasks */}
      {result.completedTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Tasks to Complete ({result.completedTasks.length})
          </p>
          {result.completedTasks.map(task => (
            <div key={task.id} className={`flex items-center gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${selectedCompleted.has(task.id) ? "bg-green-500/10 border-green-500/30" : "bg-muted/20 border-border opacity-60"}`}
              onClick={() => toggle(selectedCompleted, setSelectedCompleted, task.id)}>
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${selectedCompleted.has(task.id) ? "bg-green-500 border-green-500" : "border-muted-foreground"}`}>
                {selectedCompleted.has(task.id) && <CheckCircle2 className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium line-clamp-1">{task.title}</p>
                <p className="text-xs text-muted-foreground capitalize">{task.priority} priority</p>
              </div>
              <Badge variant="outline" className="text-xs text-green-400 border-green-500/30 shrink-0">Mark Done</Badge>
            </div>
          ))}
        </div>
      )}

      {/* New Tasks */}
      {result.newTasks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <ListTodo className="h-3.5 w-3.5 text-blue-400" /> New Tasks to Create ({result.newTasks.length})
          </p>
          {result.newTasks.map((task, i) => (
            <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${selectedNewTasks.has(i) ? "bg-blue-500/10 border-blue-500/30" : "bg-muted/20 border-border opacity-60"}`}
              onClick={() => toggle(selectedNewTasks, setSelectedNewTasks, i)}>
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${selectedNewTasks.has(i) ? "bg-blue-500 border-blue-500" : "border-muted-foreground"}`}>
                {selectedNewTasks.has(i) && <CheckCircle2 className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium">{task.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{task.description}</p>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <Badge variant="outline" className="text-xs px-1.5 py-0 capitalize">{task.priority}</Badge>
                  <span className="text-xs text-muted-foreground">Due in {task.dueDaysFromNow} day{task.dueDaysFromNow !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Property Updates */}
      {result.propertyUpdates.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-amber-400" /> Property Updates ({result.propertyUpdates.length})
          </p>
          {result.propertyUpdates.map((update, i) => (
            <div key={i} className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-all ${selectedUpdates.has(i) ? "bg-amber-500/10 border-amber-500/30" : "bg-muted/20 border-border opacity-60"}`}
              onClick={() => toggle(selectedUpdates, setSelectedUpdates, i)}>
              <div className={`h-4 w-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${selectedUpdates.has(i) ? "bg-amber-500 border-amber-500" : "border-muted-foreground"}`}>
                {selectedUpdates.has(i) && <CheckCircle2 className="h-3 w-3 text-white" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium">{update.propertyName}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="capitalize">{update.field}</span>: <span className="line-through opacity-60">{update.oldValue || "—"}</span> → <span className="text-amber-400 font-medium">{update.newValue}</span>
                </p>
                <p className="text-xs text-muted-foreground mt-0.5 italic">{update.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Contact Links (informational only) */}
      {result.contactLinks.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
            <Link2 className="h-3.5 w-3.5 text-purple-400" /> Detected Relationships
          </p>
          {result.contactLinks.map((link, i) => (
            <div key={i} className="flex items-start gap-3 p-2.5 rounded-lg border border-purple-500/20 bg-purple-500/5">
              <Link2 className="h-4 w-4 text-purple-400 shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground font-medium">{link.contactName} ↔ {link.propertyName}</p>
                <p className="text-xs text-muted-foreground mt-0.5 capitalize">{link.relationship} — {link.reason}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Action Buttons */}
      <div className="flex items-center gap-2 pt-1 border-t border-border">
        <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onDismiss}>
          <X className="h-3.5 w-3.5 mr-1" /> Dismiss All
        </Button>
        <div className="flex-1" />
        {totalSelected > 0 && (
          <Button size="sm" onClick={handleApply} disabled={isApplying} className="gap-1.5">
            {isApplying ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            Apply {totalSelected} Change{totalSelected !== 1 ? "s" : ""}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Log Activity Modal ───────────────────────────────────────────────────────

export function LogActivityModal({ open, onClose, onSuccess, prefill }: { open: boolean; onClose: () => void; onSuccess: () => void; prefill?: { contactId?: number; propertyId?: number; type?: string } }) {
  const [form, setForm] = useState({
    type: prefill?.type ?? "call" as "call"|"email"|"meeting"|"note"|"text"|"voicemail",
    direction: "outbound" as "inbound"|"outbound",
    contactId: prefill?.contactId ? String(prefill.contactId) : "",
    propertyId: prefill?.propertyId ? String(prefill.propertyId) : "",
    subject: "",
    notes: "",
    duration: "",
    outcome: "__none__" as "reached"|"voicemail"|"no_answer"|"callback_requested"|"not_interested"|"interested"|"follow_up"|"__none__",
    occurredAt: new Date().toISOString().slice(0, 16),
  });

  const [intelResult, setIntelResult] = useState<ParsedCallResult | null>(null);
  const [showIntel, setShowIntel] = useState(false);

  const { data: contacts } = trpc.contacts.list.useQuery({ limit: 200 });
  const { data: properties } = trpc.properties.list.useQuery({ limit: 200 });
  const utils = trpc.useUtils();

  const createActivity = trpc.activities.create.useMutation({
    onSuccess: () => { toast.success("Activity logged!"); },
    onError: (e) => toast.error(e.message),
  });

  const parseCallNote = trpc.callIntel.parseCallNote.useMutation({
    onSuccess: (data) => {
      setIntelResult(data as ParsedCallResult);
      setShowIntel(true);
    },
    onError: (e) => toast.error("AI analysis failed: " + e.message),
  });

  const applyActions = trpc.callIntel.applyCallActions.useMutation({
    onSuccess: (data) => {
      toast.success(data.applied.join(" · ") || "Changes applied!");
      utils.tasks.list.invalidate();
      utils.properties.list.invalidate();
      setShowIntel(false);
      setIntelResult(null);
      onSuccess();
    },
    onError: (e) => toast.error("Failed to apply changes: " + e.message),
  });

  const handleLog = () => {
    createActivity.mutate({
      type: form.type as "call"|"email"|"meeting"|"note"|"text"|"voicemail",
      direction: form.direction,
      contactId: (form.contactId && form.contactId !== "__none__") ? parseInt(form.contactId) : undefined,
      propertyId: (form.propertyId && form.propertyId !== "__none__") ? parseInt(form.propertyId) : undefined,
      subject: form.subject || undefined,
      notes: form.notes || undefined,
      duration: form.duration ? parseInt(form.duration) : undefined,
      outcome: (form.outcome && form.outcome !== "__none__" ? form.outcome : undefined) as "reached"|"voicemail"|"no_answer"|"callback_requested"|"not_interested"|"interested"|"follow_up"|undefined,
      occurredAt: new Date(form.occurredAt),
    }, {
      onSuccess: () => {
        // If there are notes, trigger AI analysis
        if (form.notes.trim().length > 20) {
          toast.info("Activity logged! Analyzing notes with AI...", { duration: 2000 });
          parseCallNote.mutate({
            notes: form.notes,
            contactId: (form.contactId && form.contactId !== "__none__") ? parseInt(form.contactId) : undefined,
            propertyId: (form.propertyId && form.propertyId !== "__none__") ? parseInt(form.propertyId) : undefined,
          });
        } else {
          onSuccess();
        }
      },
    });
  };

  const handleApplyActions = (selections: Parameters<typeof PostCallIntelPanel>[0]["onApply"] extends (s: infer S) => void ? S : never) => {
    applyActions.mutate(selections);
  };

  const handleDismiss = () => {
    setShowIntel(false);
    setIntelResult(null);
    onSuccess();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            {showIntel ? (
              <><Sparkles className="h-4 w-4 text-primary" /> Post-Call Intelligence</>
            ) : "Log Activity"}
          </DialogTitle>
        </DialogHeader>

        {showIntel && intelResult ? (
          <PostCallIntelPanel
            result={intelResult}
            onApply={handleApplyActions}
            onDismiss={handleDismiss}
            isApplying={applyActions.isPending}
          />
        ) : (
          <>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Type *</Label>
                  <Select value={form.type} onValueChange={(v) => setForm({...form, type: v as typeof form.type})}>
                    <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="call">Call</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="meeting">Meeting</SelectItem><SelectItem value="note">Note</SelectItem><SelectItem value="text">Text</SelectItem><SelectItem value="voicemail">Voicemail</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Direction</Label>
                  <Select value={form.direction} onValueChange={(v) => setForm({...form, direction: v as typeof form.direction})}>
                    <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="outbound">Outbound</SelectItem><SelectItem value="inbound">Inbound</SelectItem></SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Contact</Label>
                  <Select value={form.contactId} onValueChange={(v) => setForm({...form, contactId: v})}>
                    <SelectTrigger className="bg-background border-border"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">None</SelectItem>{contacts?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.firstName} {c.lastName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Property</Label>
                  <Select value={form.propertyId} onValueChange={(v) => setForm({...form, propertyId: v})}>
                    <SelectTrigger className="bg-background border-border"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">None</SelectItem>{properties?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Subject</Label><Input value={form.subject} onChange={(e) => setForm({...form, subject: e.target.value})} placeholder="e.g. Follow-up call re: Sunrise MHC" className="bg-background border-border" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Outcome</Label>
                  <Select value={form.outcome} onValueChange={(v) => setForm({...form, outcome: v as typeof form.outcome})}>
                    <SelectTrigger className="bg-background border-border"><SelectValue placeholder="None" /></SelectTrigger>
                    <SelectContent><SelectItem value="__none__">None</SelectItem><SelectItem value="reached">Reached</SelectItem><SelectItem value="voicemail">Voicemail</SelectItem><SelectItem value="no_answer">No Answer</SelectItem><SelectItem value="callback_requested">Callback Requested</SelectItem><SelectItem value="interested">Interested</SelectItem><SelectItem value="not_interested">Not Interested</SelectItem><SelectItem value="follow_up">Follow Up</SelectItem></SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Duration (min)</Label><Input type="number" value={form.duration} onChange={(e) => setForm({...form, duration: e.target.value})} className="bg-background border-border" /></div>
              </div>
              <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Date & Time</Label><Input type="datetime-local" value={form.occurredAt} onChange={(e) => setForm({...form, occurredAt: e.target.value})} className="bg-background border-border" /></div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground flex items-center gap-1.5">
                  Notes
                  {form.notes.trim().length > 20 && (
                    <span className="flex items-center gap-1 text-primary">
                      <Sparkles className="h-3 w-3" /> AI will analyze on save
                    </span>
                  )}
                </Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm({...form, notes: e.target.value})}
                  className="bg-background border-border resize-none"
                  rows={4}
                  placeholder="Paste your call notes here... AI will extract tasks, detect completed items, and suggest property updates automatically."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button
                onClick={handleLog}
                disabled={createActivity.isPending || parseCallNote.isPending}
                className="gap-1.5"
              >
                {(createActivity.isPending || parseCallNote.isPending) ? (
                  <><RefreshCw className="h-3.5 w-3.5 animate-spin" /> {parseCallNote.isPending ? "Analyzing..." : "Logging..."}</>
                ) : (
                  <>{form.notes.trim().length > 20 ? <><Sparkles className="h-3.5 w-3.5" /> Log & Analyze</> : "Log Activity"}</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
