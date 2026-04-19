import { useState, useCallback } from "react";
import { UserPlus, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { ActionCardStack } from "@/components/ActionCardStack";
import {
  normalizeVoiceMemoActions,
  type ActionItem,
  type TaskAction,
  type PropertyUpdateAction,
  type ContactLinkAction,
  type NewContactAction,
  type ActivityAction,
} from "@/lib/actionTypes";

type Confidence = "high" | "medium" | "low" | "none";

export interface ResolvedRef {
  id: number | null;
  name: string;
  confidence: Confidence;
  matchMethod: string;
  candidateCount: number;
  topCandidates?: Array<{ id: number; name: string; score: number }>;
}

export interface VoiceMemoResult {
  transcript: string;
  summary: string;
  keyInsights: string[];
  activityId: number | null;
  activityType?: string;
  command?: string | null;
  newTasks: Array<{
    title: string;
    description: string;
    priority: string;
    type: string;
    dueDaysFromNow: number;
    contact?: ResolvedRef;
    property?: ResolvedRef;
  }>;
  propertyUpdates: Array<{
    property: ResolvedRef;
    field: string;
    newValue: string;
    reason: string;
  }>;
  contactLinks: Array<{
    contact: ResolvedRef;
    property: ResolvedRef;
    relationship: string;
    reason: string;
  }>;
  newContactSuggestions?: Array<{
    extractedName: string;
    firstName: string;
    lastName: string;
    phone: string;
    email: string;
    company: string;
    role: string;
    context: string;
  }>;
  resolvedPeople?: Array<{
    extractedName: string;
    id: number | null;
    name: string;
    confidence: Confidence;
    matchMethod: string;
    candidateCount: number;
    topCandidates?: Array<{ id: number; name: string; score: number }>;
    role: string;
  }>;
  resolvedProperties?: Array<{
    extractedName: string;
    id: number | null;
    name: string;
    confidence: Confidence;
    matchMethod: string;
    candidateCount: number;
    topCandidates?: Array<{ id: number; name: string; score: number }>;
  }>;
}

const ROLE_TO_DEAL_ROLE: Record<
  string,
  "owner" | "buyer" | "seller" | "buyers_broker" | "listing_agent" | "property_manager" | "attorney" | "lender" | "other"
> = {
  owner: "owner",
  buyer: "buyer",
  seller: "seller",
  broker: "buyers_broker",
  buyers_broker: "buyers_broker",
  listing_agent: "listing_agent",
  property_manager: "property_manager",
  attorney: "attorney",
  lender: "lender",
};

const confidenceColors: Record<Confidence, string> = {
  high: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-900 border-yellow-200",
  low: "bg-red-100 text-red-800 border-red-200",
  none: "bg-gray-100 text-gray-600 border-gray-200",
};

function clampPriority(p: string): "urgent" | "high" | "medium" | "low" {
  return (["urgent", "high", "medium", "low"] as const).includes(p as any)
    ? (p as "urgent" | "high" | "medium" | "low")
    : "medium";
}
function clampType(t: string): "call" | "email" | "meeting" | "follow_up" | "research" | "other" {
  return (["call", "email", "meeting", "follow_up", "research", "other"] as const).includes(t as any)
    ? (t as "call" | "email" | "meeting" | "follow_up" | "research" | "other")
    : "follow_up";
}

export function VoiceMemoReviewPanel({
  data,
  onDone,
}: {
  data: VoiceMemoResult;
  onDone: () => void;
}) {
  // ActionCard items (replaces old checkboxes)
  const [actionItems, setActionItems] = useState<ActionItem[]>(() =>
    normalizeVoiceMemoActions(data),
  );

  // Primary contact + property
  const initialContact = data.resolvedPeople?.[0] ?? null;
  const initialProperty = data.resolvedProperties?.[0] ?? null;
  const newContactData = data.newContactSuggestions?.[0] ?? null;

  const [pickedContact, setPickedContact] = useState<ResolvedRef | null>(initialContact);
  const [pickedProperty, setPickedProperty] = useState<ResolvedRef | null>(initialProperty);
  const [showContactSearch, setShowContactSearch] = useState(false);
  const [showPropertySearch, setShowPropertySearch] = useState(false);
  const [showNewContactForm, setShowNewContactForm] = useState(!initialContact && !!newContactData);
  const [newContact, setNewContact] = useState({
    firstName: newContactData?.firstName ?? "",
    lastName: newContactData?.lastName ?? "",
    phone: newContactData?.phone ?? "",
    email: newContactData?.email ?? "",
    company: newContactData?.company ?? "",
  });

  const [tasks] = useState(() => data.newTasks.map((t) => ({ ...t })));

  // Tasks to mark complete
  const [tasksToComplete, setTasksToComplete] = useState<Set<number>>(new Set());

  const utils = trpc.useUtils();

  const applyActions = trpc.callIntel.applyCallActions.useMutation();
  const createLink = trpc.contactLinks.create.useMutation();
  const updateActivity = trpc.activities.update.useMutation();
  const completeTask = trpc.tasks.update.useMutation();
  const createContactMut = trpc.contacts.create.useMutation();

  const primaryContactId = pickedContact?.id ?? null;

  const { data: pendingTasks } = trpc.tasks.list.useQuery(
    { contactId: primaryContactId ?? 0, status: "pending", limit: 20 },
    { enabled: !!primaryContactId },
  );

  // Counts
  const acceptedCount = actionItems.filter((i) => i.status === "accepted").length + tasksToComplete.size;
  const isPending = applyActions.isPending || createLink.isPending || completeTask.isPending || createContactMut.isPending;

  // Accept handler (no-op — ActionCardStack tracks status, real save on Apply)
  const handleAcceptItem = useCallback(async (_item: ActionItem) => {}, []);

  // Apply all accepted items
  const handleApply = async () => {
    try {
      const accepted = actionItems.filter((i) => i.status === "accepted");

      // Tasks
      const taskPayloads = accepted
        .filter((i): i is ActionItem & { action: TaskAction } => i.action.kind === "task")
        .map((i) => ({
          title: i.action.title,
          description: i.action.description || "",
          priority: clampPriority(i.action.priority),
          type: clampType(i.action.type),
          contactId: tasks.find((t) => t.title === i.action.title)?.contact?.id ?? pickedContact?.id ?? undefined,
          propertyId: tasks.find((t) => t.title === i.action.title)?.property?.id ?? pickedProperty?.id ?? undefined,
          dueDaysFromNow: Math.max(1, Math.round((i.action.dueDate.getTime() - Date.now()) / 86400000)),
        }));

      // Property updates
      const propUpdatePayloads = accepted
        .filter((i): i is ActionItem & { action: PropertyUpdateAction } => i.action.kind === "property_update")
        .filter((i) => i.action.propertyId)
        .map((i) => ({
          propertyId: i.action.propertyId!,
          field: i.action.field,
          newValue: i.action.newValue,
        }));

      if (taskPayloads.length || propUpdatePayloads.length) {
        await applyActions.mutateAsync({
          newTasks: taskPayloads,
          propertyUpdates: propUpdatePayloads,
        });
      }

      // Contact-property links
      const linkActions = accepted
        .filter((i): i is ActionItem & { action: ContactLinkAction } => i.action.kind === "contact_link")
        .filter((i) => i.action.contactId && i.action.propertyId);
      for (const l of linkActions) {
        await createLink.mutateAsync({
          contactId: l.action.contactId!,
          propertyId: l.action.propertyId!,
          source: "activity",
          dealRole: ROLE_TO_DEAL_ROLE[l.action.relationship] ?? undefined,
        });
      }

      // Mark pending tasks complete
      for (const taskId of Array.from(tasksToComplete)) {
        await completeTask.mutateAsync({ id: taskId, status: "completed", completedAt: new Date() });
      }

      // Update activity type if user accepted an activity card
      const activityActions = accepted.filter(
        (i): i is ActionItem & { action: ActivityAction } => i.action.kind === "activity",
      );
      if (data.activityId) {
        const patches: Record<string, unknown> = {};
        if (pickedContact?.id) patches.contactId = pickedContact.id;
        if (pickedProperty?.id) patches.propertyId = pickedProperty.id;
        if (activityActions.length > 0) {
          patches.type = activityActions[0].action.type;
        }
        if (Object.keys(patches).length > 0) {
          try {
            await updateActivity.mutateAsync({ id: data.activityId, ...patches } as any);
          } catch { /* non-critical */ }
        }
      }

      // Create new contacts
      const newContactActions = accepted
        .filter((i): i is ActionItem & { action: NewContactAction } => i.action.kind === "new_contact");
      for (const nc of newContactActions) {
        if (!nc.action.firstName) continue;
        try {
          await createContactMut.mutateAsync({
            firstName: nc.action.firstName,
            lastName: nc.action.lastName,
            phone: nc.action.phone || undefined,
            email: nc.action.email || undefined,
            company: nc.action.company || undefined,
          });
        } catch { /* continue */ }
      }

      toast.success(`Voice memo applied — ${accepted.length + tasksToComplete.size} change(s) saved`);
      utils.tasks.invalidate();
      utils.properties.invalidate();
      utils.contacts.invalidate();
      utils.activities.invalidate();
      onDone();
    } catch (err) {
      toast.error(`Failed to apply: ${err instanceof Error ? err.message : "Unknown error"}`);
    }
  };

  return (
    <div className="space-y-4">
      {/* Transcript (collapsible) */}
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          View transcript
        </summary>
        <p className="mt-2 text-sm text-muted-foreground bg-muted p-3 rounded-md whitespace-pre-wrap">
          {data.transcript}
        </p>
      </details>

      {/* Summary + Key Insights */}
      <div className="bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
        <p className="text-sm font-medium">{data.summary}</p>
        {data.keyInsights.length > 0 && (
          <ul className="mt-2 text-sm text-muted-foreground space-y-1">
            {data.keyInsights.map((k, i) => (
              <li key={i}>• {k}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Contact + Property (always visible, easy override) */}
      <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
        {/* Contact */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Contact</div>
          {showNewContactForm ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center text-xs px-2 py-1 rounded-full border bg-amber-100 text-amber-800 border-amber-200">
                  New: {newContactData?.extractedName ?? ""}
                </span>
                <button onClick={() => { setShowNewContactForm(false); setShowContactSearch(true); }} className="text-xs text-primary hover:underline">Search instead</button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={newContact.firstName} onChange={(e) => setNewContact({ ...newContact, firstName: e.target.value })} placeholder="First name" className="h-9 text-xs bg-background border-border" />
                <Input value={newContact.lastName} onChange={(e) => setNewContact({ ...newContact, lastName: e.target.value })} placeholder="Last name" className="h-9 text-xs bg-background border-border" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input value={newContact.phone} onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })} placeholder="Phone" className="h-9 text-xs bg-background border-border" />
                <Input value={newContact.company} onChange={(e) => setNewContact({ ...newContact, company: e.target.value })} placeholder="Company" className="h-9 text-xs bg-background border-border" />
              </div>
              <Button
                className="w-full h-9 text-xs gap-1.5"
                disabled={!newContact.firstName.trim() || createContactMut.isPending}
                onClick={async () => {
                  const c = await createContactMut.mutateAsync({
                    firstName: newContact.firstName.trim(),
                    lastName: newContact.lastName.trim(),
                    phone: newContact.phone.trim() || undefined,
                    company: newContact.company.trim() || undefined,
                  });
                  setPickedContact({ id: c.id, name: `${c.firstName} ${c.lastName}`, confidence: "high", matchMethod: "created", candidateCount: 1 });
                  setShowNewContactForm(false);
                  toast.success(`Created ${c.firstName} ${c.lastName}`);
                }}
              >
                {createContactMut.isPending ? "Creating..." : `Create ${newContact.firstName} ${newContact.lastName}`.trim()}
              </Button>
            </div>
          ) : showContactSearch ? (
            <EntityMatch
              entity={pickedContact ?? { id: null, name: "(search)", confidence: "none", matchMethod: "unmatched", candidateCount: 0 }}
              type="contact"
              onPick={(picked) => { setPickedContact(picked); setShowContactSearch(false); }}
              onNewContact={() => { setShowContactSearch(false); setShowNewContactForm(true); }}
            />
          ) : pickedContact && pickedContact.id ? (
            <div className="space-y-2">
              <div className={`inline-flex items-center text-xs px-2 py-1 rounded-full border ${confidenceColors[pickedContact.confidence]}`}>
                {pickedContact.name}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-9 text-xs flex-1" onClick={() => setShowContactSearch(true)}>Change</Button>
                <Button variant="outline" size="sm" className="h-9 text-xs flex-1 gap-1" onClick={() => { setShowContactSearch(false); setShowNewContactForm(true); }}>
                  <UserPlus className="h-3 w-3" /> New Contact
                </Button>
                <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => { setPickedContact(null); setShowContactSearch(false); }}>Clear</Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">No contact detected</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-9 text-xs flex-1" onClick={() => setShowContactSearch(true)}>Search Contact</Button>
                <Button variant="outline" size="sm" className="h-9 text-xs flex-1 gap-1" onClick={() => setShowNewContactForm(true)}>
                  <UserPlus className="h-3 w-3" /> New Contact
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Property */}
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Property</div>
          {showPropertySearch ? (
            <EntityMatch
              entity={pickedProperty ?? { id: null, name: "(search)", confidence: "none", matchMethod: "unmatched", candidateCount: 0 }}
              type="property"
              onPick={(picked) => { setPickedProperty(picked); setShowPropertySearch(false); }}
            />
          ) : pickedProperty && pickedProperty.id ? (
            <div className="space-y-2">
              <PropertyBadge propertyId={pickedProperty.id} name={pickedProperty.name} confidence={pickedProperty.confidence} />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="h-9 text-xs flex-1" onClick={() => setShowPropertySearch(true)}>Change</Button>
                <Button variant="outline" size="sm" className="h-9 text-xs" onClick={() => { setPickedProperty(null); setShowPropertySearch(false); }}>Clear</Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" size="sm" className="h-9 text-xs w-full" onClick={() => setShowPropertySearch(true)}>Search Property</Button>
          )}
        </div>
      </div>

      {/* Mark Complete -- pending tasks */}
      {pendingTasks && pendingTasks.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold mb-2">Mark Complete? ({pendingTasks.length} pending)</h4>
          <p className="text-[11px] text-muted-foreground italic mb-2">
            Pending tasks for the linked contact. Check any this memo fulfilled.
          </p>
          <div className="space-y-2">
            {pendingTasks.map((t) => (
              <div key={t.id} className="flex items-start gap-2 border rounded-md p-2">
                <Checkbox
                  checked={tasksToComplete.has(t.id)}
                  onCheckedChange={() => {
                    const next = new Set(tasksToComplete);
                    if (next.has(t.id)) next.delete(t.id);
                    else next.add(t.id);
                    setTasksToComplete(next);
                  }}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium">{t.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {t.priority}{t.dueAt ? ` · due ${new Date(t.dueAt).toLocaleDateString()}` : ""}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Cards */}
      {actionItems.length > 0 ? (
        <div>
          <h4 className="text-sm font-semibold mb-2">Actions ({actionItems.length})</h4>
          <ActionCardStack
            items={actionItems}
            onItemsChange={setActionItems}
            onAccept={handleAcceptItem}
            showAddTask
          />
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
          <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          Transcript saved as activity note.
        </div>
      )}

      {/* Apply button */}
      <Button
        className="w-full"
        onClick={handleApply}
        disabled={isPending}
      >
        {isPending
          ? "Applying..."
          : acceptedCount > 0
            ? `Apply ${acceptedCount} Change${acceptedCount === 1 ? "" : "s"}`
            : "Save & Log"}
      </Button>
    </div>
  );
}

// ── EntityMatch (search picker) ─────────────────────────────────────────────

function EntityMatch({
  entity,
  type,
  onPick,
  onNewContact,
}: {
  entity: ResolvedRef;
  type: "contact" | "property";
  onPick: (picked: ResolvedRef) => void;
  onNewContact?: () => void;
}) {
  const [query, setQuery] = useState("");

  const contactsQ = trpc.contacts.list.useQuery(
    { search: query || undefined, limit: 8 },
    { enabled: type === "contact" },
  );
  const propertiesQ = trpc.properties.list.useQuery(
    { search: query || undefined, limit: 8 },
    { enabled: type === "property" },
  );

  type SearchHit = { id: number; name: string; sub?: string };
  const hits: SearchHit[] =
    type === "contact"
      ? (contactsQ.data ?? []).map((c) => ({
          id: c.id,
          name: `${c.firstName} ${c.lastName}`.trim(),
          sub: c.company ?? undefined,
        }))
      : (propertiesQ.data ?? []).map((p) => ({
          id: p.id,
          name: p.name,
          sub: [p.city, p.unitCount ? `${p.unitCount}u` : null].filter(Boolean).join(" · "),
        }));

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={type === "contact" ? "Type a name..." : "Type a property name..."}
        className="h-9 text-sm bg-background border-border"
      />
      <div className="max-h-52 overflow-y-auto border rounded-lg bg-card">
        {!query && <div className="text-xs text-muted-foreground px-3 py-1.5">Recent</div>}
        {hits.length === 0 && query && (
          <div className="text-sm text-muted-foreground px-3 py-3">No results for "{query}"</div>
        )}
        {hits.map((h) => (
          <button
            key={h.id}
            type="button"
            className="w-full text-left px-3 py-2.5 hover:bg-muted border-b border-border/40 last:border-0 transition-colors"
            onClick={() => {
              onPick({
                ...entity,
                id: h.id,
                name: h.name,
                confidence: "high",
                matchMethod: "manual",
              });
              setQuery("");
            }}
          >
            <div className="text-sm font-medium text-foreground">{h.name}</div>
            {h.sub && <div className="text-xs text-muted-foreground">{h.sub}</div>}
          </button>
        ))}
      </div>
      {type === "contact" && onNewContact && (
        <Button variant="outline" size="sm" className="w-full h-9 text-xs gap-1.5" onClick={onNewContact}>
          <UserPlus className="h-3.5 w-3.5" /> New Contact
        </Button>
      )}
    </div>
  );
}

// ── Property badge with details lookup ──────────────────────────────────────

function PropertyBadge({ propertyId, name, confidence }: { propertyId: number; name: string; confidence: Confidence }) {
  const { data: prop } = trpc.properties.byId.useQuery({ id: propertyId }, { enabled: !!propertyId });
  const sub = prop ? [prop.city, prop.unitCount ? `${prop.unitCount}u` : null].filter(Boolean).join(" · ") : null;
  return (
    <div className={`inline-flex flex-col text-xs px-3 py-1.5 rounded-lg border ${confidenceColors[confidence]}`}>
      <span className="font-medium">{name}</span>
      {sub && <span className="text-[10px] opacity-70">{sub}</span>}
    </div>
  );
}
