/**
 * ActionCard -- Unified AI-suggested action card.
 *
 * Pending -> tap to edit -> Accept / Skip.
 * Accepted -> collapses to single confirmation row.
 * Skipped -> dimmed, strikethrough.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { CheckCircle2, CalendarIcon, Loader2, ChevronDown } from "lucide-react";
import { format } from "date-fns";
import { TASK_TYPES, PRIORITIES, ACTIVITY_TYPES, OUTCOMES, DEAL_ROLES } from "@/lib/constants";
import {
  type UnifiedAction,
  type ActionStatus,
  ACTION_META,
  getBorderClass,
  getIconColor,
  getActionSummary,
} from "@/lib/actionTypes";

export interface ActionCardProps {
  action: UnifiedAction;
  status: ActionStatus;
  isEditing: boolean;
  onStartEdit: () => void;
  onCancelEdit: () => void;
  onChange: (updated: UnifiedAction) => void;
  onAccept: () => void;
  onSkip: () => void;
  onUndo?: () => void;
  onRemove?: () => void;
  saving?: boolean;
  acceptDisabled?: boolean;
  acceptDisabledReason?: string;
}

export function ActionCard({
  action,
  status,
  isEditing,
  onStartEdit,
  onCancelEdit,
  onChange,
  onAccept,
  onSkip,
  onUndo,
  onRemove,
  saving = false,
  acceptDisabled = false,
  acceptDisabledReason,
}: ActionCardProps) {
  const meta = ACTION_META[action.kind];
  const Icon = meta.icon;
  const summary = getActionSummary(action);
  const [calOpen, setCalOpen] = useState(false);
  const [showUndo, setShowUndo] = useState(true);

  // Accepted state
  if (status === "accepted") {
    return (
      <div className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${meta.acceptedBg} transition-all duration-200`}>
        <CheckCircle2 className={`h-4 w-4 shrink-0 ${meta.acceptedText}`} />
        <span className={`text-sm font-medium ${meta.acceptedText}`}>{meta.acceptedLabel}</span>
        <span className="text-xs text-muted-foreground truncate flex-1">{summary.title}</span>
        {showUndo && onUndo && (
          <button
            className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
            onClick={() => { onUndo(); setShowUndo(false); }}
          >
            Undo
          </button>
        )}
      </div>
    );
  }

  // Skipped state
  if (status === "skipped") {
    return (
      <div className="rounded-xl border border-border bg-card border-l-2 border-l-slate-600 opacity-40 px-4 py-3 transition-all duration-200">
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 text-slate-500 shrink-0" />
          <span className="text-sm text-muted-foreground line-through flex-1 truncate">{summary.title}</span>
          {onUndo && (
            <button
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors shrink-0"
              onClick={onUndo}
            >
              Undo
            </button>
          )}
        </div>
      </div>
    );
  }

  // Pending state
  return (
    <div
      className={`rounded-xl border border-border bg-card border-l-2 ${getBorderClass(action.kind, "pending")} transition-all duration-200 ${
        isEditing ? "ring-1 ring-primary/20" : ""
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-2.5 px-4 pt-3 pb-1">
        <Icon className={`h-4 w-4 shrink-0 ${getIconColor(action.kind)}`} />
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {meta.label}
        </span>
      </div>

      {/* Summary (tap to edit) */}
      <button
        type="button"
        className="w-full text-left px-4 py-2 group cursor-pointer"
        onClick={() => (isEditing ? undefined : onStartEdit())}
      >
        <p className={`text-sm font-medium text-foreground ${isEditing ? "mb-0" : ""}`}>
          {summary.title}
        </p>
        {summary.tokens.length > 0 && !isEditing && (
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5 flex-wrap">
            {summary.tokens.map((t, i) => (
              <span key={i} className="inline-flex items-center">
                {i > 0 && <span className="text-border mr-1.5">·</span>}
                {t}
              </span>
            ))}
            <ChevronDown className="h-3 w-3 text-muted-foreground/50 ml-auto opacity-0 group-hover:opacity-100 transition-opacity" />
          </p>
        )}
      </button>

      {/* Edit fields (progressive disclosure) */}
      <Collapsible open={isEditing}>
        <CollapsibleContent className="px-4 pb-1 space-y-2">
          <EditFields action={action} onChange={onChange} calOpen={calOpen} setCalOpen={setCalOpen} />
          <div className="flex justify-end pt-1 pb-1">
            <button
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
              onClick={onCancelEdit}
            >
              Done editing
            </button>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Action bar */}
      <div className="flex gap-2 px-4 pb-3 pt-1">
        <Button
          size="sm"
          className={`flex-[2] h-9 text-sm gap-1.5 ${meta.buttonClass} text-white`}
          disabled={saving || acceptDisabled}
          title={acceptDisabledReason}
          onClick={onAccept}
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Accept
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="flex-1 h-9 text-sm text-muted-foreground"
          onClick={onSkip}
        >
          Skip
        </Button>
        {onRemove && (
          <Button
            size="sm"
            variant="ghost"
            className="h-9 w-9 p-0 text-muted-foreground"
            onClick={onRemove}
          >
            ×
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Edit fields per kind ────────────────────────────────────────────────────

function EditFields({
  action,
  onChange,
  calOpen,
  setCalOpen,
}: {
  action: UnifiedAction;
  onChange: (u: UnifiedAction) => void;
  calOpen: boolean;
  setCalOpen: (v: boolean) => void;
}) {
  const inputCls = "h-8 text-sm bg-background border-border";
  const selectCls = "h-8 text-sm bg-background border-border";

  switch (action.kind) {
    case "task":
      return (
        <>
          <Input
            value={action.title}
            onChange={(e) => onChange({ ...action, title: e.target.value })}
            placeholder="Task title"
            className={inputCls}
          />
          <div className="grid grid-cols-3 gap-2">
            <Select value={action.type} onValueChange={(v) => onChange({ ...action, type: v })}>
              <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {TASK_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={action.priority} onValueChange={(v) => onChange({ ...action, priority: v })}>
              <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
              </SelectContent>
            </Select>
            <Popover open={calOpen} onOpenChange={setCalOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className={`${selectCls} gap-1.5 w-full`}>
                  <CalendarIcon className="h-3.5 w-3.5" />
                  {format(action.dueDate, "MMM d")}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-card border-border">
                <CalendarComponent
                  mode="single"
                  selected={action.dueDate}
                  onSelect={(d) => { if (d) { onChange({ ...action, dueDate: d }); setCalOpen(false); } }}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
        </>
      );

    case "activity":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Select value={action.type} onValueChange={(v) => onChange({ ...action, type: v })}>
              <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACTIVITY_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={action.outcome ?? ""} onValueChange={(v) => onChange({ ...action, outcome: v || undefined })}>
              <SelectTrigger className={selectCls}><SelectValue placeholder="Outcome..." /></SelectTrigger>
              <SelectContent>
                {OUTCOMES.map((o) => <SelectItem key={o} value={o}>{o.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Input
            value={action.subject}
            onChange={(e) => onChange({ ...action, subject: e.target.value })}
            placeholder="Subject"
            className={inputCls}
          />
          <Textarea
            value={action.notes}
            onChange={(e) => onChange({ ...action, notes: e.target.value })}
            placeholder="Notes..."
            className="text-sm bg-background border-border resize-none"
            rows={2}
          />
        </>
      );

    case "property_update":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex items-center px-3 h-8 rounded-md bg-muted/50 text-sm text-muted-foreground">{action.field}</div>
            <Input
              value={action.newValue}
              onChange={(e) => onChange({ ...action, newValue: e.target.value })}
              placeholder="New value"
              className={inputCls}
            />
          </div>
          <p className="text-xs text-muted-foreground px-1">{action.reason}</p>
        </>
      );

    case "contact_link":
      return (
        <Select value={action.relationship} onValueChange={(v) => onChange({ ...action, relationship: v })}>
          <SelectTrigger className={selectCls}><SelectValue /></SelectTrigger>
          <SelectContent>
            {DEAL_ROLES.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
          </SelectContent>
        </Select>
      );

    case "new_contact":
      return (
        <>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={action.firstName}
              onChange={(e) => onChange({ ...action, firstName: e.target.value })}
              placeholder="First name"
              className={inputCls}
            />
            <Input
              value={action.lastName}
              onChange={(e) => onChange({ ...action, lastName: e.target.value })}
              placeholder="Last name"
              className={inputCls}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={action.phone ?? ""}
              onChange={(e) => onChange({ ...action, phone: e.target.value })}
              placeholder="Phone"
              className={inputCls}
            />
            <Input
              value={action.email ?? ""}
              onChange={(e) => onChange({ ...action, email: e.target.value })}
              placeholder="Email"
              className={inputCls}
            />
          </div>
          <Input
            value={action.company ?? ""}
            onChange={(e) => onChange({ ...action, company: e.target.value })}
            placeholder="Company"
            className={inputCls}
          />
        </>
      );
  }
}
