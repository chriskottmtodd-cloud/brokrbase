import { trpc } from "@/lib/trpc";
import { useState, useMemo, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { format, isToday, isTomorrow, isPast, formatDistanceToNow, addDays, addWeeks, addMonths } from "date-fns";
import {
  Plus, Phone, Mail, Calendar, CheckCircle2, Clock, AlertCircle,
  Building2, User, ListChecks, ChevronRight, CalendarIcon, Loader2,
  Sparkles, BellOff, RotateCcw, ChevronDown, ChevronUp, X, Edit2, Save,
} from "lucide-react";
import { ContactSearchPicker, type PickedContact } from "@/components/ContactSearchPicker";
import { parseLlmJson } from "@/lib/parseLlmJson";

// ─── Types ──────────// ─── Utility: advance a date to the nearest weekday (Mon–Fri) ─────────────
function nextWeekday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun, 6=Sat
  if (day === 0) d.setDate(d.getDate() + 1); // Sun → Mon
  if (day === 6) d.setDate(d.getDate() + 2); // Sat → Mon
  return d;
}

// ─── Types ─────────────────────────────────────────────────────
interface Task {
  id: number;
  title: string;
  description?: string | null;
  type: string;
  priority: string;
  status: string;
  dueAt?: Date | null;
  completedAt?: Date | null;
  contactId?: number | null;
  contactName?: string | null;
  propertyId?: number | null;
  propertyName?: string | null;
  listingId?: number | null;
}

// ─── Config ───────────────────────────────────────────────────────────────────
const priorityConfig: Record<string, { border: string; badge: string; label: string }> = {
  urgent: { border: "border-l-red-600",    badge: "bg-red-500/10 text-red-500 border-red-500/30",    label: "Urgent" },
  high:   { border: "border-l-red-400",   badge: "bg-red-400/10 text-red-400 border-red-400/30",   label: "High" },
  medium: { border: "border-l-slate-400",  badge: "bg-slate-400/10 text-slate-500 border-slate-400/30",  label: "Medium" },
  low:    { border: "border-l-slate-300",  badge: "bg-slate-300/10 text-slate-400 border-slate-300/30",  label: "Low" },
};
const typeIcons: Record<string, React.ReactNode> = {
  call:      <Phone className="h-3 w-3" />,
  email:     <Mail className="h-3 w-3" />,
  meeting:   <Calendar className="h-3 w-3" />,
  follow_up: <ChevronRight className="h-3 w-3" />,
  research:  <Building2 className="h-3 w-3" />,
  other:     <ListChecks className="h-3 w-3" />,
};
const TASK_TYPES = ["call","email","meeting","follow_up","research","other"] as const;
const PRIORITIES = ["urgent","high","medium","low"] as const;

function getDueBadge(dueAt?: Date | null) {
  if (!dueAt) return null;
  const d = new Date(dueAt);
  if (isPast(d) && !isToday(d)) return <Badge variant="outline" className="text-[10px] px-1 py-0 bg-red-500/10 text-red-400 border-red-500/30">Overdue</Badge>;
  if (isToday(d))    return <Badge variant="outline" className="text-[10px] px-1 py-0 bg-red-400/10 text-red-400 border-red-400/30">Today</Badge>;
  if (isTomorrow(d)) return <Badge variant="outline" className="text-[10px] px-1 py-0 bg-slate-400/10 text-slate-500 border-slate-400/30">Tomorrow</Badge>;
  return <span className="text-xs text-muted-foreground">{format(d, "MMM d")}</span>;
}

// ─── Main ─────────────────────────────────────────────────────────────────────
type TabId = "overdue" | "today" | "future";

export default function Tasks() {
  const [tab,           setTab]           = useState<TabId>("today");
  const [expandedId,    setExpandedId]    = useState<number | null>(null);
  const [showAddModal,  setShowAddModal]  = useState(false);

  const utils = trpc.useUtils();
  const { data: rawTasks,    isLoading } = trpc.tasks.list.useQuery({ status: "pending" });
  const { data: rawContacts }            = trpc.contacts.list.useQuery({ limit: 3000 });
  const { data: rawProperties }          = trpc.properties.list.useQuery({ limit: 10000 });
  const { data: completedTasks }         = trpc.tasks.list.useQuery({ status: "completed", limit: 8 });

  // Enrich with names
  const tasks = useMemo<Task[]>(() => {
    return (rawTasks ?? []).map((t) => {
      const c = t.contactId  ? (rawContacts  ?? []).find(x => x.id === t.contactId)  : null;
      const p = t.propertyId ? (rawProperties ?? []).find(x => x.id === t.propertyId) : null;
      return {
        ...t,
        contactName:  c ? `${c.firstName} ${c.lastName}`.trim() : (t as any).contactName ?? null,
        propertyName: p ? p.name : (t as any).propertyName ?? null,
      } as Task;
    });
  }, [rawTasks, rawContacts, rawProperties]);

  const completed = useMemo<Task[]>(() => {
    return (completedTasks ?? []).map((t) => {
      const c = t.contactId ? (rawContacts ?? []).find(x => x.id === t.contactId) : null;
      return { ...t, contactName: c ? `${c.firstName} ${c.lastName}`.trim() : null } as Task;
    });
  }, [completedTasks, rawContacts]);

  // Partition by tab
  const overdue = tasks.filter(t => t.dueAt && isPast(new Date(t.dueAt)) && !isToday(new Date(t.dueAt)));
  const today   = tasks.filter(t => t.dueAt && isToday(new Date(t.dueAt)));
  const future  = tasks
    .filter(t => !overdue.includes(t) && !today.includes(t))
    .sort((a, b) => (a.dueAt ? new Date(a.dueAt).getTime() : Infinity) - (b.dueAt ? new Date(b.dueAt).getTime() : Infinity));

  const tabTasks: Record<TabId, Task[]> = { overdue, today, future };
  const visible = tabTasks[tab];

  function invalidate() { utils.tasks.list.invalidate(); utils.contacts.list.invalidate(); }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-border/50 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <ListChecks className="h-6 w-6 text-primary" /> Tasks
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {tasks.length} pending
              {overdue.length > 0 && <span className="text-red-400"> · {overdue.length} overdue</span>}
              {today.length  > 0 && <span className="text-amber-400"> · {today.length} today</span>}
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)} className="gap-2 h-8 text-sm">
            <Plus className="h-3.5 w-3.5" /> Add Task
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mt-4">
          {([
            { id: "overdue" as TabId, label: "Overdue", count: overdue.length, color: "text-red-400" },
            { id: "today"   as TabId, label: "Today",   count: today.length,   color: "text-amber-400" },
            { id: "future"  as TabId, label: "Future",  count: future.length,  color: "text-blue-400" },
          ]).map(({ id, label, count, color }) => (
            <button
              key={id}
              onClick={() => { setTab(id); setExpandedId(null); }}
              className={`flex items-center gap-1.5 px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                tab === id
                  ? "bg-card border border-border text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
              {count > 0 && (
                <span className={`text-xs font-bold ${tab === id ? color : "text-muted-foreground"}`}>{count}</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-1.5">
        {isLoading && (
          <div className="flex items-center gap-2 text-muted-foreground py-8 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}

        {!isLoading && visible.length === 0 && (
          <div className="text-center py-16 text-muted-foreground">
            <CheckCircle2 className="h-10 w-10 mx-auto mb-3 opacity-20" />
            <p className="text-sm font-medium">
              {tab === "overdue" ? "Nothing overdue" : tab === "today" ? "Nothing due today" : "No future tasks"}
            </p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => setShowAddModal(true)}>Add Task</Button>
          </div>
        )}

        {visible.map((task) => (
          <TaskRow
            key={task.id}
            task={task}
            allProperties={(rawProperties ?? []).map(p => ({ id: p.id, name: p.name }))}
            isExpanded={expandedId === task.id}
            onToggle={() => setExpandedId(expandedId === task.id ? null : task.id)}
            onMutated={() => { invalidate(); setExpandedId(null); }}
          />
        ))}

        {/* Recently completed */}
        {tab === "today" && completed.length > 0 && (
          <div className="pt-4 border-t border-border/30">
            <p className="text-xs text-muted-foreground uppercase tracking-wide font-semibold px-1 mb-2">Recently Completed</p>
            {completed.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-3 py-2 rounded opacity-40">
                <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                <span className="text-sm line-through text-muted-foreground flex-1 truncate">{t.title}</span>
                {t.contactName && <span className="text-xs text-muted-foreground shrink-0">· {t.contactName}</span>}
              </div>
            ))}
          </div>
        )}
      </div>

      {showAddModal && (
        <AddTaskModal
          open={showAddModal}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); invalidate(); }}
        />
      )}
    </div>
  );
}

// ─── Task Row ─────────────────────────────────────────────────────────────────
function TaskRow({ task, isExpanded, onToggle, onMutated, allProperties }: {
  task: Task; isExpanded: boolean; onToggle: () => void; onMutated: () => void; allProperties: Array<{ id: number; name: string }>;
}) {
  const [, setLocation] = useLocation();

  // Completion flow
  const [note,         setNote]         = useState("");
  const [isCompleting, setIsCompleting] = useState(false);
  const [showFollowUp, setShowFollowUp] = useState(false);
  const [fuTitle,      setFuTitle]      = useState("");
  const [fuType,       setFuType]       = useState("follow_up");
  const [fuDate,       setFuDate]       = useState<Date>(addDays(new Date(), 3));
  const [fuCal,        setFuCal]        = useState(false);
  const [isCreatingFU, setIsCreatingFU] = useState(false);

  // Snooze
  const [snoozeOpen,     setSnoozeOpen]     = useState(false);
  const [isSnoozing,     setIsSnoozing]     = useState(false);
  const [quickSnoozeOpen, setQuickSnoozeOpen] = useState(false);
  // Row hover for quick actions
  const [rowHovered,     setRowHovered]     = useState(false);
  const [quickCompleting, setQuickCompleting] = useState(false);

  // Inline edit
  const [isEditing,   setIsEditing]   = useState(false);
  const [editTitle,   setEditTitle]   = useState(task.title);
  const [editType,    setEditType]    = useState(task.type);
  const [editPri,     setEditPri]     = useState(task.priority);
  const [editDue,     setEditDue]     = useState<Date | undefined>(task.dueAt ? new Date(task.dueAt) : undefined);
  const [editDueCal,  setEditDueCal]  = useState(false);
  const [editNote,    setEditNote]    = useState(task.description ?? "");

  // AI hint
  const [aiHint,     setAiHint]     = useState("");
  const [hintLoading, setHintLoading] = useState(false);

  // Quick note (without completing)
  const [quickNote,    setQuickNote]    = useState("");
  const [savingNote,   setSavingNote]   = useState(false);

  const noteRef = useRef<HTMLTextAreaElement>(null);

  // Property attachment
  const [propertySearch, setPropertySearch] = useState("");
  const [showPropertyPicker, setShowPropertyPicker] = useState(false);

  // Local fuzzy match — find property whose name appears in the task title (or vice versa)
  const suggestedProperty = useMemo(() => {
    if (task.propertyId) return null;
    const titleLower = (task.title + " " + (task.description ?? "")).toLowerCase();
    // Look for properties whose name (or first 2+ words of name) appears in the task text
    for (const p of allProperties) {
      const nameLower = p.name.toLowerCase();
      if (nameLower.length < 4) continue;
      // Direct substring match
      if (titleLower.includes(nameLower)) return p;
      // Match first significant word (4+ chars) of property name
      const firstWord = nameLower.split(/\s+/).find(w => w.length >= 5);
      if (firstWord && titleLower.includes(firstWord)) return p;
    }
    return null;
  }, [task.title, task.description, task.propertyId, allProperties]);

  const propertyOptions = useMemo(() => {
    if (!propertySearch.trim()) return allProperties.slice(0, 8);
    const s = propertySearch.toLowerCase();
    return allProperties.filter(p => p.name.toLowerCase().includes(s)).slice(0, 8);
  }, [propertySearch, allProperties]);

  async function handleAttachProperty(propertyId: number) {
    await updateTask.mutateAsync({ id: task.id, propertyId });
    setShowPropertyPicker(false);
    setPropertySearch("");
    toast.success("Property linked");
    utils.tasks.list.invalidate();
  }

  async function handleRemoveProperty() {
    await updateTask.mutateAsync({ id: task.id, propertyId: null as any });
    toast.success("Property unlinked");
    utils.tasks.list.invalidate();
  }

  const { data: contact } = trpc.contacts.byId.useQuery(
    { id: task.contactId! },
    { enabled: isExpanded && !!task.contactId }
  );

  const utils          = trpc.useUtils();
  const updateTask     = trpc.tasks.update.useMutation();
  const createActivity = trpc.activities.create.useMutation();
  const updateContact  = trpc.contacts.update.useMutation();
  const createTask     = trpc.tasks.create.useMutation();
  const invokeLlm      = trpc.callIntel.invokeLlm.useMutation();

  useEffect(() => {
    if (isExpanded) {
      setEditTitle(task.title);
      setEditType(task.type);
      setEditPri(task.priority);
      setEditDue(task.dueAt ? new Date(task.dueAt) : undefined);
      setEditNote(task.description ?? "");
      setTimeout(() => noteRef.current?.focus(), 50);
      if (!aiHint && !hintLoading) {
        setHintLoading(true);
        const hintPrompt = `You are an assistant for a commercial real estate broker. Give ONE specific coaching thought (max 15 words) for this task.
Task: "${task.title}" | Type: ${task.type} | Due: ${task.dueAt ? format(new Date(task.dueAt), "MMM d") : "no date"}
Contact: ${task.contactName ?? "unknown"} | Last contacted: ${contact?.lastContactedAt ? formatDistanceToNow(new Date(contact.lastContactedAt), { addSuffix: true }) : "unknown"}
${task.description ? `Notes: ${task.description}` : ""}
Respond with ONLY the one-liner. No quotes. No preamble.`;
        invokeLlm.mutateAsync({ prompt: hintPrompt })
          .then(r => { setAiHint(r.text ?? ""); setHintLoading(false); })
          .catch(() => setHintLoading(false));
      }
    }
  }, [isExpanded]);

  const isOverdue = !!(task.dueAt && isPast(new Date(task.dueAt)) && !isToday(new Date(task.dueAt)));
  const pc = priorityConfig[task.priority] ?? priorityConfig.medium;

  async function handleComplete() {
    if (!note.trim()) { toast.error("Add a quick note about what happened."); return; }
    setIsCompleting(true);
    try {
      await updateTask.mutateAsync({ id: task.id, status: "completed", completedAt: new Date() });
      if (task.contactId) {
        await createActivity.mutateAsync({
          type: (["call","email","meeting","note","text","voicemail"].includes(task.type) ? task.type : "note") as any,
          contactId: task.contactId,
          propertyId: task.propertyId ?? undefined,
          listingId:  task.listingId  ?? undefined,
          subject: task.title,
          notes:   note,
          outcome: "follow_up",
        });
        await updateContact.mutateAsync({ id: task.contactId, lastContactedAt: new Date() });
      }
      toast.success("Task completed and logged.");
      setHintLoading(true);
      try {
        const fuPrompt = `Suggest a follow-up task after completing this CRE task.
Completed: "${task.title}" | Contact: ${task.contactName ?? "unknown"} | Note: "${note}"
Respond ONLY with JSON (no markdown): {"title":"string","type":"call|email|follow_up|meeting","daysOut":3}
daysOut: 1–14 based on urgency in the note.`;
        const fuRes = await invokeLlm.mutateAsync({ prompt: fuPrompt });
        const suggestion = parseLlmJson<{ title: string; type: string; daysOut: number }>(fuRes.text ?? "{}");
        setFuTitle(suggestion.title ?? `Follow up with ${task.contactName ?? "contact"}`);
        setFuType(suggestion.type ?? "follow_up");
        setFuDate(nextWeekday(addDays(new Date(), suggestion.daysOut ?? 3)));
      } catch {
        setFuTitle(`Follow up with ${task.contactName ?? "contact"}`);
        setFuType("follow_up");
        setFuDate(nextWeekday(addDays(new Date(), 3)));
      }
      setHintLoading(false);
      setShowFollowUp(true);
      // Don't invalidate yet — wait until user handles follow-up so the row stays visible
    } catch { toast.error("Something went wrong."); }
    finally { setIsCompleting(false); }
  }

  async function handleSaveEdit() {
    await updateTask.mutateAsync({
      id:          task.id,
      title:       editTitle || undefined,
      type:        editType as any,
      priority:    editPri as any,
      dueAt:       editDue ?? null,
      description: editNote || undefined,
    });
    toast.success("Task updated.");
    setIsEditing(false);
  }

  async function handleSaveQuickNote() {
    if (!quickNote.trim()) return;
    setSavingNote(true);
    await updateTask.mutateAsync({ id: task.id, description: [task.description, quickNote].filter(Boolean).join("\n\n") });
    if (task.contactId) {
      await createActivity.mutateAsync({
        type: "note",
        contactId: task.contactId,
        subject: `Note on: ${task.title}`,
        notes: quickNote,
      });
    }
    toast.success("Note saved.");
    setQuickNote("");
    setSavingNote(false);
    utils.tasks.list.invalidate();
  }

  async function handleSnooze(date: Date) {
    setIsSnoozing(true);
    setSnoozeOpen(false);
    setQuickSnoozeOpen(false);
    await updateTask.mutateAsync({ id: task.id, dueAt: date });
    toast.success(`Snoozed to ${format(date, "MMM d, yyyy")}`);
    setIsSnoozing(false);
    onMutated();
  }

  async function handleQuickComplete(e: React.MouseEvent) {
    e.stopPropagation();
    setQuickCompleting(true);
    await updateTask.mutateAsync({ id: task.id, status: "completed", completedAt: new Date() });
    toast.success("Task completed!");
    setQuickCompleting(false);
    utils.tasks.list.invalidate();
    onMutated();
  }

  async function handleCreateFollowUp() {
    if (!fuTitle.trim()) { toast.error("Add a title."); return; }
    setIsCreatingFU(true);
    await createTask.mutateAsync({
      title:      fuTitle,
      type:       fuType as any,
      priority:   task.priority as any,
      dueAt:      fuDate,
      contactId:  task.contactId ?? undefined,
      propertyId: task.propertyId ?? undefined,
      listingId:  task.listingId  ?? undefined,
    });
    toast.success("Follow-up task created.");
    setShowFollowUp(false);
    setIsCreatingFU(false);
    utils.tasks.list.invalidate();
    onMutated();
  }

  return (
    <div
      className={`rounded-lg border-l-2 border border-border bg-card transition-all ${pc.border} ${isOverdue ? "bg-red-500/5 border-red-500/30" : ""}`}
      onMouseEnter={() => setRowHovered(true)}
      onMouseLeave={() => setRowHovered(false)}
    >

      {/* Row header */}
      <div className="flex items-center gap-3 px-3 py-2.5 cursor-pointer select-none" onClick={onToggle}>
        <div onClick={(e) => e.stopPropagation()}>
          <Checkbox
            checked={task.status === "completed"}
            disabled={task.status === "completed"}
            onCheckedChange={() => task.status !== "completed" && onToggle()}
            className="shrink-0"
          />
        </div>

        {/* Contact — prominent */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {task.contactName && (
              <span
                className="text-sm font-semibold text-primary hover:underline cursor-pointer"
                onClick={(e) => { e.stopPropagation(); task.contactId && setLocation(`/contacts/${task.contactId}`); }}
              >
                {task.contactName}
              </span>
            )}
            {task.contactName && <span className="text-muted-foreground text-xs">·</span>}
            {isOverdue && <AlertCircle className="h-3 w-3 text-red-400 shrink-0" />}
            <span className={`text-sm ${isOverdue ? "text-red-300" : "text-foreground"} truncate`}>{task.title}</span>
            <span className="text-muted-foreground opacity-60">{typeIcons[task.type]}</span>
            {getDueBadge(task.dueAt)}
          </div>
          {task.propertyName && (
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
              <Building2 className="h-3 w-3" />{task.propertyName}
            </p>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {/* Quick actions — appear on hover when row is collapsed and task is pending */}
          {!isExpanded && rowHovered && task.status !== "completed" && (
            <div className="flex items-center gap-0.5 mr-1" onClick={(e) => e.stopPropagation()}>
              {/* Quick complete — opens expanded view to capture note + follow-up */}
              <Button
                size="sm"
                variant="ghost"
                className="h-6 w-6 p-0 text-green-400 hover:text-green-300 hover:bg-green-500/10 rounded"
                onClick={(e) => { e.stopPropagation(); onToggle(); }}
                title="Complete task"
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
              </Button>
              {/* Quick snooze */}
              <DropdownMenu open={quickSnoozeOpen} onOpenChange={setQuickSnoozeOpen}>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground hover:bg-muted/60 rounded"
                    disabled={isSnoozing}
                    title="Snooze"
                  >
                    {isSnoozing
                      ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      : <BellOff className="h-3.5 w-3.5" />}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-36">
                  <div className="px-2 py-1.5 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">Snooze until</div>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => handleSnooze(addDays(new Date(), 1))}>
                    <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground" />Tomorrow
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSnooze(addDays(new Date(), 3))}>
                    <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground" />3 days
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSnooze(addWeeks(new Date(), 1))}>
                    <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground" />1 week
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => handleSnooze(addMonths(new Date(), 1))}>
                    <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground" />1 month
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${pc.badge}`}>{pc.label}</Badge>
          {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </div>

      {/* Expanded panel */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-border/40 pt-3">

          {/* Contact context bar */}
          {contact && (
            <div className="flex items-center gap-4 text-xs bg-background/50 rounded px-3 py-2 border border-border/40 flex-wrap">
              <span
                className="flex items-center gap-1.5 cursor-pointer hover:text-primary transition-colors font-medium text-foreground"
                onClick={() => setLocation(`/contacts/${contact.id}`)}
              >
                <User className="h-3 w-3 text-primary" />{contact.firstName} {contact.lastName}
              </span>
              {contact.lastContactedAt && (
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  Last contact: {formatDistanceToNow(new Date(contact.lastContactedAt), { addSuffix: true })}
                </span>
              )}
              {contact.phone && (
                <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-muted-foreground hover:text-foreground">
                  <Phone className="h-3 w-3" />{contact.phone}
                </a>
              )}
            </div>
          )}

          {/* AI hint */}
          <div className="flex items-start gap-2 text-xs">
            <Sparkles className="h-3.5 w-3.5 text-primary shrink-0 mt-0.5" />
            {hintLoading
              ? <span className="text-muted-foreground animate-pulse">Thinking…</span>
              : aiHint
                ? <span className="text-foreground/80 italic">{aiHint}</span>
                : <span className="text-muted-foreground text-[11px]">No hint loaded.</span>
            }
          </div>

          {/* Property attachment */}
          <div className="space-y-1">
            {task.propertyName ? (
              <div className="flex items-center gap-2 text-xs">
                <Building2 className="h-3 w-3 text-primary shrink-0" />
                <button
                  onClick={() => setLocation(`/properties/${task.propertyId}`)}
                  className="text-foreground hover:text-primary transition-colors truncate"
                >
                  {task.propertyName}
                </button>
                <button
                  onClick={() => setShowPropertyPicker(!showPropertyPicker)}
                  className="text-muted-foreground hover:text-primary text-[10px] underline"
                >
                  change
                </button>
                <button
                  onClick={handleRemoveProperty}
                  className="text-muted-foreground hover:text-destructive text-[10px] underline"
                >
                  remove
                </button>
              </div>
            ) : suggestedProperty && !showPropertyPicker ? (
              <div className="flex items-center gap-2 text-xs bg-primary/5 border border-primary/20 rounded px-2 py-1.5">
                <Sparkles className="h-3 w-3 text-primary shrink-0" />
                <span className="text-muted-foreground">Link to</span>
                <span className="text-foreground font-medium truncate">{suggestedProperty.name}</span>
                <span className="text-muted-foreground">?</span>
                <button
                  onClick={() => handleAttachProperty(suggestedProperty.id)}
                  className="text-primary hover:underline ml-auto shrink-0"
                >
                  Yes
                </button>
                <button
                  onClick={() => setShowPropertyPicker(true)}
                  className="text-muted-foreground hover:text-primary shrink-0"
                >
                  Other
                </button>
              </div>
            ) : !showPropertyPicker ? (
              <button
                onClick={() => setShowPropertyPicker(true)}
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                <Building2 className="h-3 w-3" /> Link to property
              </button>
            ) : null}

            {/* Property picker */}
            {showPropertyPicker && (
              <div className="space-y-1 p-2 rounded border border-border bg-background/50">
                <Input
                  value={propertySearch}
                  onChange={(e) => setPropertySearch(e.target.value)}
                  placeholder="Search properties..."
                  className="h-7 text-xs bg-background border-border"
                  autoFocus
                />
                <div className="max-h-40 overflow-y-auto space-y-0.5">
                  {propertyOptions.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => handleAttachProperty(p.id)}
                      className="w-full text-left text-xs px-2 py-1 rounded hover:bg-muted text-foreground"
                    >
                      {p.name}
                    </button>
                  ))}
                  {propertyOptions.length === 0 && (
                    <p className="text-xs text-muted-foreground px-2 py-1">No matches</p>
                  )}
                </div>
                <button
                  onClick={() => { setShowPropertyPicker(false); setPropertySearch(""); }}
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>

          {/* Inline edit fields */}
          {isEditing ? (
            <div className="space-y-2 p-3 rounded border border-border/60 bg-background/50">
              <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} className="h-7 text-sm bg-background border-border" placeholder="Task title" />
              <div className="grid grid-cols-3 gap-2">
                <Select value={editType} onValueChange={setEditType}>
                  <SelectTrigger className="h-7 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace("_"," ")}</SelectItem>)}</SelectContent>
                </Select>
                <Select value={editPri} onValueChange={setEditPri}>
                  <SelectTrigger className="h-7 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                </Select>
                <Popover open={editDueCal} onOpenChange={setEditDueCal}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs bg-background border-border gap-1">
                      <CalendarIcon className="h-3 w-3" />{editDue ? format(editDue, "MMM d") : "Due date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-card border-border">
                    <CalendarComponent mode="single" selected={editDue} onSelect={(d) => { setEditDue(d ?? undefined); setEditDueCal(false); }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <Textarea value={editNote} onChange={(e) => setEditNote(e.target.value)} placeholder="Notes…" className="text-xs bg-background border-border resize-none" rows={2} />
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleSaveEdit} disabled={updateTask.isPending}>
                  <Save className="h-3 w-3" /> Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setIsEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              {task.description && (
                <p className="text-xs text-muted-foreground bg-background/50 rounded px-3 py-2 border border-border/40 whitespace-pre-wrap">{task.description}</p>
              )}
              <Button size="sm" variant="ghost" className="h-6 text-xs text-muted-foreground gap-1 -ml-1" onClick={() => setIsEditing(true)}>
                <Edit2 className="h-3 w-3" /> Edit task
              </Button>
            </>
          )}

          {/* Quick note (no complete required) */}
          {!showFollowUp && !isEditing && (
            <div className="space-y-1.5">
              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Quick Note</Label>
              <div className="flex gap-2">
                <Textarea
                  value={quickNote}
                  onChange={(e) => setQuickNote(e.target.value)}
                  placeholder="Add a note without completing…"
                  className="text-xs bg-background border-border resize-none flex-1"
                  rows={1}
                />
                <Button size="sm" variant="outline" className="h-8 text-xs shrink-0" onClick={handleSaveQuickNote} disabled={!quickNote.trim() || savingNote}>
                  {savingNote ? <Loader2 className="h-3 w-3 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          )}

          {/* Follow-up suggestion */}
          {showFollowUp ? (
            <div className="space-y-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
              <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
                <RotateCcw className="h-3.5 w-3.5" /> Schedule follow-up?
              </p>
              <Input value={fuTitle} onChange={(e) => setFuTitle(e.target.value)} className="h-7 text-xs bg-background border-border" placeholder="Follow-up title" />
              <div className="flex gap-2">
                <Select value={fuType} onValueChange={setFuType}>
                  <SelectTrigger className="h-7 text-xs bg-background border-border flex-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace("_"," ")}</SelectItem>)}</SelectContent>
                </Select>
                <Popover open={fuCal} onOpenChange={setFuCal}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className="h-7 text-xs gap-1 flex-1 bg-background border-border">
                      <CalendarIcon className="h-3 w-3" />{format(fuDate, "MMM d")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-card border-border">
                    <CalendarComponent mode="single" selected={fuDate} onSelect={(d) => { if (d) { setFuDate(d); setFuCal(false); } }} initialFocus />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateFollowUp} disabled={isCreatingFU}>
                  {isCreatingFU ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create Follow-up"}
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground px-2" onClick={() => { setShowFollowUp(false); onMutated(); }}>
                  Skip <X className="h-3 w-3 ml-1" />
                </Button>
              </div>
            </div>
          ) : !isEditing && (
            <>
              {/* Complete & Log */}
              <div className="space-y-1.5">
                <Label className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">
                  What happened? <span className="text-primary">*</span>
                </Label>
                <Textarea
                  ref={noteRef}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Left voicemail, sent T12, discussed pricing…"
                  className="text-xs bg-background border-border resize-none"
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1.5"
                  onClick={handleComplete}
                  disabled={isCompleting || !note.trim()}
                >
                  {isCompleting
                    ? <><Loader2 className="h-3 w-3 animate-spin" /> Completing…</>
                    : <><CheckCircle2 className="h-3 w-3" /> Complete & Log</>
                  }
                </Button>

                {/* Snooze */}
                <Popover open={snoozeOpen} onOpenChange={setSnoozeOpen}>
                  <PopoverTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1 bg-background border-border" disabled={isSnoozing}>
                      <BellOff className="h-3 w-3" /> Snooze
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                    <div className="p-3 space-y-2 border-b border-border">
                      <p className="text-xs font-semibold text-foreground">Quick snooze</p>
                      <div className="flex gap-1.5 flex-wrap">
                        {[
                          { label: "Tomorrow", date: addDays(new Date(), 1) },
                          { label: "3 days",   date: addDays(new Date(), 3) },
                          { label: "1 week",   date: addWeeks(new Date(), 1) },
                          { label: "1 month",  date: addMonths(new Date(), 1) },
                        ].map(({ label, date }) => (
                          <Button key={label} size="sm" variant="outline" className="h-6 text-[11px] px-2 bg-background border-border"
                            onClick={() => handleSnooze(date)}>
                            {label}
                          </Button>
                        ))}
                      </div>
                    </div>
                    <CalendarComponent mode="single" selected={task.dueAt ? new Date(task.dueAt) : undefined}
                      onSelect={(d) => { if (d) handleSnooze(d); }} initialFocus />
                  </PopoverContent>
                </Popover>

                {task.contactId && (
                  <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground gap-1"
                    onClick={() => setLocation(`/contacts/${task.contactId}`)}>
                    <User className="h-3 w-3" /> View Contact
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Add Task Modal ───────────────────────────────────────────────────────────
export function AddTaskModal({ open, onClose, onSuccess, prefill }: {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  prefill?: { title?: string; description?: string; contactId?: number; propertyId?: number; type?: string };
}) {
  const [contact,  setContact]  = useState<PickedContact | null>(null);
  const [dueDate,  setDueDate]  = useState<Date>(() => { const d = new Date(); d.setHours(0,0,0,0); return d; });
  const [calOpen,  setCalOpen]  = useState(false);
  const [form, setForm] = useState({
    title:       prefill?.title       ?? "",
    description: prefill?.description ?? "",
    type:        (prefill?.type       ?? "follow_up") as "call"|"email"|"meeting"|"follow_up"|"research"|"other",
    priority:    "medium" as "urgent"|"high"|"medium"|"low",
  });

  const { data: prefilledContact } = trpc.contacts.byId.useQuery(
    { id: prefill?.contactId! },
    { enabled: !!prefill?.contactId }
  );

  useEffect(() => {
    if (prefilledContact) setContact(prefilledContact as PickedContact);
  }, [prefilledContact]);

  const { data: properties } = trpc.properties.list.useQuery({ limit: 10000 });
  const [propertyId, setPropertyId] = useState(prefill?.propertyId ? String(prefill.propertyId) : "");

  const createTask = trpc.tasks.create.useMutation({
    onSuccess: () => { toast.success("Task created!"); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Add Task</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          {/* Contact — required */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">
              Contact <span className="text-primary">*</span>
            </Label>
            <ContactSearchPicker
              value={contact}
              onChange={setContact}
              required
              allowCreate
              placeholder="Search or create contact…"
            />
            {!contact && <p className="text-[10px] text-primary">Every task must be linked to a contact.</p>}
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Title *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Call Jay re: Arbor Court" className="bg-background border-border" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as typeof form.type })}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v as typeof form.priority })}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Due Date</Label>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal bg-background border-border gap-2">
                  <CalendarIcon className="h-4 w-4 text-muted-foreground" />
                  {dueDate ? format(dueDate, "EEEE, MMM d, yyyy") : "Pick a date"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                <CalendarComponent
                  mode="single"
                  selected={dueDate}
                  onSelect={(d) => { if (d) { setDueDate(d); setCalOpen(false); } }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Property (optional)</Label>
            <Select value={propertyId} onValueChange={setPropertyId}>
              <SelectTrigger className="bg-background border-border"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">None</SelectItem>
                {properties?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              className="bg-background border-border resize-none" rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!form.title || !contact || createTask.isPending}
            onClick={() => createTask.mutate({
              title:       form.title,
              description: form.description || undefined,
              type:        form.type,
              priority:    form.priority,
              dueAt:       dueDate,
              contactId:   contact?.id,
              propertyId:  (propertyId && propertyId !== "__none__") ? parseInt(propertyId) : undefined,
            })}
          >
            {createTask.isPending ? "Adding…" : "Add Task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
