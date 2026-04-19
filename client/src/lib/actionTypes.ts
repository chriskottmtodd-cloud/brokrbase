/**
 * Unified Action Type System
 *
 * Single source of truth for AI-suggested action cards in
 * Voice Memo review panel.
 */
import {
  Activity, ListChecks, Building2, UserPlus, Link2,
  type LucideIcon,
} from "lucide-react";
import type { VoiceMemoResult } from "@/components/VoiceMemoReviewPanel";
import { addDays } from "date-fns";

// ── Action Kinds (brokrbase v1) ─────────────────────────────────────────────

export type ActionKind =
  | "task"
  | "activity"
  | "property_update"
  | "contact_link"
  | "new_contact";

// ── Discriminated Union ─────────────────────────────────────────────────────

export type TaskAction = {
  kind: "task";
  title: string;
  type: string;
  priority: string;
  dueDate: Date;
  description?: string;
  contactName?: string;
  propertyName?: string;
};

export type ActivityAction = {
  kind: "activity";
  type: string;
  outcome?: string;
  subject: string;
  notes: string;
  direction?: string;
};

export type PropertyUpdateAction = {
  kind: "property_update";
  propertyId: number | null;
  propertyName: string;
  field: string;
  newValue: string;
  reason: string;
};

export type ContactLinkAction = {
  kind: "contact_link";
  contactId: number | null;
  contactName: string;
  propertyId: number | null;
  propertyName: string;
  relationship: string;
  reason: string;
};

export type NewContactAction = {
  kind: "new_contact";
  firstName: string;
  lastName: string;
  phone?: string;
  email?: string;
  company?: string;
  role?: string;
  context?: string;
};

export type UnifiedAction =
  | TaskAction
  | ActivityAction
  | PropertyUpdateAction
  | ContactLinkAction
  | NewContactAction;

// ── Action Item (action + status) ───────────────────────────────────────────

export type ActionStatus = "pending" | "accepted" | "skipped";

export interface ActionItem {
  id: string;
  action: UnifiedAction;
  status: ActionStatus;
}

// ── Metadata per Kind ───────────────────────────────────────────────────────

interface ActionMeta {
  label: string;
  icon: LucideIcon;
  color: string;
  acceptedLabel: string;
  buttonClass: string;
  acceptedBg: string;
  acceptedText: string;
}

export const ACTION_META: Record<ActionKind, ActionMeta> = {
  activity: {
    label: "Log Activity",
    icon: Activity,
    color: "green-500",
    acceptedLabel: "Activity logged",
    buttonClass: "bg-green-600 hover:bg-green-500",
    acceptedBg: "bg-green-500/10 border-green-500/20",
    acceptedText: "text-green-500",
  },
  task: {
    label: "Create Task",
    icon: ListChecks,
    color: "blue-500",
    acceptedLabel: "Task created",
    buttonClass: "bg-blue-600 hover:bg-blue-500",
    acceptedBg: "bg-blue-500/10 border-blue-500/20",
    acceptedText: "text-blue-500",
  },
  property_update: {
    label: "Update Property",
    icon: Building2,
    color: "amber-500",
    acceptedLabel: "Property updated",
    buttonClass: "bg-amber-600 hover:bg-amber-500",
    acceptedBg: "bg-amber-500/10 border-amber-500/20",
    acceptedText: "text-amber-500",
  },
  contact_link: {
    label: "Link Contact",
    icon: Link2,
    color: "primary",
    acceptedLabel: "Contact linked",
    buttonClass: "bg-primary hover:bg-primary/90",
    acceptedBg: "bg-primary/10 border-primary/20",
    acceptedText: "text-primary",
  },
  new_contact: {
    label: "New Contact",
    icon: UserPlus,
    color: "sky-500",
    acceptedLabel: "Contact created",
    buttonClass: "bg-sky-600 hover:bg-sky-500",
    acceptedBg: "bg-sky-500/10 border-sky-500/20",
    acceptedText: "text-sky-500",
  },
};

// ── Left-border classes (can't use template strings in Tailwind) ────────────

const PENDING_BORDER: Record<ActionKind, string> = {
  activity: "border-l-green-500/40",
  task: "border-l-blue-500/40",
  property_update: "border-l-amber-500/40",
  contact_link: "border-l-primary/40",
  new_contact: "border-l-sky-500/40",
};

const ACCEPTED_BORDER: Record<ActionKind, string> = {
  activity: "border-l-green-500",
  task: "border-l-blue-500",
  property_update: "border-l-amber-500",
  contact_link: "border-l-primary",
  new_contact: "border-l-sky-500",
};

const ICON_COLOR: Record<ActionKind, string> = {
  activity: "text-green-400",
  task: "text-blue-400",
  property_update: "text-amber-400",
  contact_link: "text-primary",
  new_contact: "text-sky-400",
};

export function getBorderClass(kind: ActionKind, status: ActionStatus): string {
  if (status === "accepted") return ACCEPTED_BORDER[kind];
  if (status === "skipped") return "border-l-slate-600";
  return PENDING_BORDER[kind];
}

export function getIconColor(kind: ActionKind): string {
  return ICON_COLOR[kind];
}

// ── Summary text (pending state) ────────────────────────────────────────────

export function getActionSummary(action: UnifiedAction): { title: string; tokens: string[] } {
  switch (action.kind) {
    case "task":
      return {
        title: action.title || "Untitled task",
        tokens: [action.type.replace(/_/g, " "), action.priority, `Due ${action.dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`],
      };
    case "activity":
      return {
        title: action.subject || action.type,
        tokens: [action.type, action.outcome ?? ""].filter(Boolean),
      };
    case "property_update":
      return {
        title: `${action.propertyName}: ${action.field}`,
        tokens: [`\u2192 ${action.newValue}`],
      };
    case "contact_link":
      return {
        title: `${action.contactName} \u2192 ${action.propertyName}`,
        tokens: [action.relationship.replace(/_/g, " ")],
      };
    case "new_contact":
      return {
        title: `${action.firstName} ${action.lastName}`.trim() || "New contact",
        tokens: [action.phone, action.email, action.company].filter(Boolean) as string[],
      };
  }
}

// ── Normalizers ─────────────────────────────────────────────────────────────

let _nextId = 0;
function uid(): string {
  return `action-${++_nextId}-${Date.now()}`;
}

/** Voice Memo result -> ActionItem[] */
export function normalizeVoiceMemoActions(data: VoiceMemoResult): ActionItem[] {
  const items: ActionItem[] = [];

  // Activity card (if detected type is not just "note")
  if (data.activityType && data.activityType !== "note") {
    items.push({
      id: uid(),
      status: "pending",
      action: {
        kind: "activity",
        type: data.activityType,
        subject: data.summary?.slice(0, 80) || "Voice Memo",
        notes: data.transcript?.slice(0, 500) || "",
        direction: "outbound",
      },
    });
  }

  for (const t of data.newTasks) {
    items.push({
      id: uid(),
      status: "pending",
      action: {
        kind: "task",
        title: t.title,
        type: t.type || "follow_up",
        priority: t.priority || "medium",
        dueDate: addDays(new Date(), t.dueDaysFromNow || 3),
        description: t.description,
        contactName: t.contact?.name,
        propertyName: t.property?.name,
      },
    });
  }

  for (const u of data.propertyUpdates) {
    items.push({
      id: uid(),
      status: "pending",
      action: {
        kind: "property_update",
        propertyId: u.property.id,
        propertyName: u.property.name,
        field: u.field,
        newValue: u.newValue,
        reason: u.reason,
      },
    });
  }

  for (const l of data.contactLinks) {
    items.push({
      id: uid(),
      status: "pending",
      action: {
        kind: "contact_link",
        contactId: l.contact.id,
        contactName: l.contact.name,
        propertyId: l.property.id,
        propertyName: l.property.name,
        relationship: l.relationship,
        reason: l.reason,
      },
    });
  }

  for (const s of data.newContactSuggestions ?? []) {
    items.push({
      id: uid(),
      status: "pending",
      action: {
        kind: "new_contact",
        firstName: s.firstName,
        lastName: s.lastName,
        phone: s.phone || undefined,
        email: s.email || undefined,
        company: s.company || undefined,
        role: s.role || undefined,
        context: s.context || undefined,
      },
    });
  }

  return items;
}
