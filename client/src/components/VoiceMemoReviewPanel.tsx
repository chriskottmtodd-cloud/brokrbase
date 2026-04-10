import { useState } from "react";
import { Edit2, Plus, Search, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

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
}

const PRIORITY_VALUES = ["urgent", "high", "medium", "low"] as const;
const TYPE_VALUES = ["call", "email", "meeting", "follow_up", "research", "other"] as const;

function clampPriority(p: string): (typeof PRIORITY_VALUES)[number] {
  return (PRIORITY_VALUES as readonly string[]).includes(p)
    ? (p as (typeof PRIORITY_VALUES)[number])
    : "medium";
}
function clampType(t: string): (typeof TYPE_VALUES)[number] {
  return (TYPE_VALUES as readonly string[]).includes(t)
    ? (t as (typeof TYPE_VALUES)[number])
    : "follow_up";
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

function emptyRef(type: "contact" | "property"): ResolvedRef {
  return {
    id: null,
    name: type === "contact" ? "(no contact)" : "(no property)",
    confidence: "none",
    matchMethod: "unmatched",
    candidateCount: 0,
  };
}

const confidenceColors: Record<Confidence, string> = {
  high: "bg-green-100 text-green-800 border-green-200",
  medium: "bg-yellow-100 text-yellow-900 border-yellow-200",
  low: "bg-red-100 text-red-800 border-red-200",
  none: "bg-gray-100 text-gray-600 border-gray-200",
};

export function VoiceMemoReviewPanel({
  data,
  onDone,
}: {
  data: VoiceMemoResult;
  onDone: () => void;
}) {
  // Mutable copy of refs so users can pick alternatives
  const [tasks, setTasks] = useState(() => data.newTasks.map((t) => ({ ...t })));
  const [updates, setUpdates] = useState(() => data.propertyUpdates.map((u) => ({ ...u })));
  const [links, setLinks] = useState(() => data.contactLinks.map((l) => ({ ...l })));

  const autoCheck = (r?: ResolvedRef) =>
    !r || r.confidence === "high" || r.confidence === "medium";

  const [selTasks, setSelTasks] = useState<Set<number>>(
    () => new Set(tasks.map((_, i) => i).filter((i) => autoCheck(tasks[i].contact) && autoCheck(tasks[i].property))),
  );
  const [selUpdates, setSelUpdates] = useState<Set<number>>(
    () => new Set(updates.map((_, i) => i).filter((i) => updates[i].property.confidence !== "none" && updates[i].property.confidence !== "low")),
  );
  const [selLinks, setSelLinks] = useState<Set<number>>(
    () =>
      new Set(
        links
          .map((_, i) => i)
          .filter(
            (i) =>
              autoCheck(links[i].contact) &&
              autoCheck(links[i].property) &&
              links[i].contact.confidence !== "low" &&
              links[i].property.confidence !== "low",
          ),
      ),
  );

  const utils = trpc.useUtils();

  // New contact creation
  const [showCreateContact, setShowCreateContact] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "" });
  const createContact = trpc.contacts.create.useMutation();

  // Task editing
  const [editingTaskIdx, setEditingTaskIdx] = useState<number | null>(null);

  const applyActions = trpc.callIntel.applyCallActions.useMutation();
  const createLink = trpc.contactLinks.create.useMutation();

  const totalSelected = selTasks.size + selUpdates.size + selLinks.size;
  const isPending = applyActions.isPending || createLink.isPending;

  const toggle = (
    set: Set<number>,
    setter: React.Dispatch<React.SetStateAction<Set<number>>>,
    i: number,
  ) => {
    const next = new Set(set);
    if (next.has(i)) next.delete(i);
    else next.add(i);
    setter(next);
  };

  const handleApply = async () => {
    try {
      const newTasksPayload = Array.from(selTasks).map((i) => {
        const t = tasks[i];
        return {
          title: t.title,
          description: t.description,
          priority: clampPriority(t.priority),
          type: clampType(t.type),
          contactId: t.contact?.id ?? undefined,
          propertyId: t.property?.id ?? undefined,
          dueDaysFromNow: t.dueDaysFromNow || 1,
        };
      });

      const propertyUpdatesPayload = Array.from(selUpdates)
        .map((i) => {
          const u = updates[i];
          if (!u.property.id) return null;
          return {
            propertyId: u.property.id,
            field: u.field,
            newValue: u.newValue,
          };
        })
        .filter((u): u is NonNullable<typeof u> => !!u);

      if (newTasksPayload.length || propertyUpdatesPayload.length) {
        await applyActions.mutateAsync({
          newTasks: newTasksPayload,
          propertyUpdates: propertyUpdatesPayload,
        });
      }

      // Create contact-property links via the dedicated mutation
      const linksToCreate = Array.from(selLinks)
        .map((i) => links[i])
        .filter((l) => l.contact.id && l.property.id);
      for (const l of linksToCreate) {
        await createLink.mutateAsync({
          contactId: l.contact.id!,
          propertyId: l.property.id!,
          source: "activity",
          dealRole: ROLE_TO_DEAL_ROLE[l.relationship] ?? undefined,
        });
      }

      toast.success(`Voice memo applied — ${totalSelected} change(s) saved`);
      utils.tasks.invalidate();
      utils.properties.invalidate();
      utils.contacts.invalidate();
      utils.activities.invalidate();
      onDone();
    } catch (err) {
      toast.error(
        `Failed to apply: ${err instanceof Error ? err.message : "Unknown error"}`,
      );
    }
  };

  return (
    <div className="space-y-4">
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground">
          View transcript
        </summary>
        <p className="mt-2 text-sm text-muted-foreground bg-muted p-3 rounded-md whitespace-pre-wrap">
          {data.transcript}
        </p>
      </details>

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

      {tasks.length > 0 && (
        <Section title={`New Tasks (${tasks.length})`}>
          {tasks.map((t, i) => (
            <div key={i} className="flex items-start gap-2 border rounded-md p-2">
              <Checkbox checked={selTasks.has(i)} onCheckedChange={() => toggle(selTasks, setSelTasks, i)} className="mt-0.5" />
              <div className="flex-1 min-w-0">
                {editingTaskIdx === i ? (
                  <div className="space-y-2">
                    <Input
                      value={t.title}
                      onChange={(e) => {
                        const next = [...tasks];
                        next[i] = { ...next[i], title: e.target.value };
                        setTasks(next);
                      }}
                      className="h-7 text-xs"
                      placeholder="Task title"
                      autoFocus
                    />
                    <div className="flex gap-2">
                      <Select
                        value={t.priority}
                        onValueChange={(v) => {
                          const next = [...tasks];
                          next[i] = { ...next[i], priority: v };
                          setTasks(next);
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PRIORITY_VALUES.map((p) => (
                            <SelectItem key={p} value={p}>{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={t.type}
                        onValueChange={(v) => {
                          const next = [...tasks];
                          next[i] = { ...next[i], type: v };
                          setTasks(next);
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {TYPE_VALUES.map((tp) => (
                            <SelectItem key={tp} value={tp}>{tp.replace("_", " ")}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Due in</span>
                        <Input
                          type="number"
                          min={0}
                          value={t.dueDaysFromNow}
                          onChange={(e) => {
                            const next = [...tasks];
                            next[i] = { ...next[i], dueDaysFromNow: parseInt(e.target.value) || 1 };
                            setTasks(next);
                          }}
                          className="h-7 text-xs w-14"
                        />
                        <span className="text-xs text-muted-foreground">days</span>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => setEditingTaskIdx(null)}>
                      Done editing
                    </Button>
                  </div>
                ) : (
                  <div>
                    <div className="flex items-center gap-1.5">
                      <div className="text-sm font-medium flex-1">{t.title}</div>
                      <button
                        type="button"
                        onClick={() => setEditingTaskIdx(i)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Edit task"
                      >
                        <Edit2 className="h-3 w-3" />
                      </button>
                    </div>
                    <div className="text-xs text-muted-foreground">{t.priority} · {t.type.replace("_", " ")} · due in {t.dueDaysFromNow}d</div>
                  </div>
                )}
                <EntityMatch
                  entity={t.contact ?? emptyRef("contact")}
                  type="contact"
                  onPick={(picked) => {
                    const next = [...tasks];
                    next[i] = { ...next[i], contact: picked };
                    setTasks(next);
                  }}
                  onCreateContact={() => setShowCreateContact(true)}
                />
                <EntityMatch
                  entity={t.property ?? emptyRef("property")}
                  type="property"
                  onPick={(picked) => {
                    const next = [...tasks];
                    next[i] = { ...next[i], property: picked };
                    setTasks(next);
                  }}
                />
              </div>
            </div>
          ))}
        </Section>
      )}

      {updates.length > 0 && (
        <Section title={`Property Updates (${updates.length})`}>
          {updates.map((u, i) => (
            <CheckItem
              key={i}
              checked={selUpdates.has(i)}
              onToggle={() => toggle(selUpdates, setSelUpdates, i)}
              label={`${u.property.name}: ${u.field}`}
              sublabel={`→ ${u.newValue} (${u.reason})`}
            >
              <EntityMatch
                entity={u.property}
                type="property"
                onPick={(picked) => {
                  const next = [...updates];
                  next[i] = { ...next[i], property: picked };
                  setUpdates(next);
                }}
              />
            </CheckItem>
          ))}
        </Section>
      )}

      {links.length > 0 && (
        <Section title={`Contact ↔ Property Links (${links.length})`}>
          {links.map((l, i) => (
            <CheckItem
              key={i}
              checked={selLinks.has(i)}
              onToggle={() => toggle(selLinks, setSelLinks, i)}
              label={`${l.contact.name} → ${l.property.name}`}
              sublabel={`${l.relationship} · ${l.reason}`}
            >
              <EntityMatch
                entity={l.contact}
                type="contact"
                onPick={(picked) => {
                  const next = [...links];
                  next[i] = { ...next[i], contact: picked };
                  setLinks(next);
                }}
                onCreateContact={() => setShowCreateContact(true)}
              />
              <EntityMatch
                entity={l.property}
                type="property"
                onPick={(picked) => {
                  const next = [...links];
                  next[i] = { ...next[i], property: picked };
                  setLinks(next);
                }}
              />
            </CheckItem>
          ))}
        </Section>
      )}

      {/* Create new contact */}
      {showCreateContact && (
        <div className="border rounded-md p-3 space-y-2 bg-muted/30">
          <div className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">Create New Contact</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="First name"
              value={newContactForm.firstName}
              onChange={(e) => setNewContactForm({ ...newContactForm, firstName: e.target.value })}
              className="h-7 text-xs"
              autoFocus
            />
            <Input
              placeholder="Last name"
              value={newContactForm.lastName}
              onChange={(e) => setNewContactForm({ ...newContactForm, lastName: e.target.value })}
              className="h-7 text-xs"
            />
          </div>
          <Input
            placeholder="Email"
            value={newContactForm.email}
            onChange={(e) => setNewContactForm({ ...newContactForm, email: e.target.value })}
            className="h-7 text-xs"
          />
          <Input
            placeholder="Phone"
            value={newContactForm.phone}
            onChange={(e) => setNewContactForm({ ...newContactForm, phone: e.target.value })}
            className="h-7 text-xs"
          />
          <Input
            placeholder="Company"
            value={newContactForm.company}
            onChange={(e) => setNewContactForm({ ...newContactForm, company: e.target.value })}
            className="h-7 text-xs"
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 text-xs"
              disabled={!newContactForm.firstName || !newContactForm.lastName || createContact.isPending}
              onClick={async () => {
                try {
                  const result = await createContact.mutateAsync({
                    firstName: newContactForm.firstName,
                    lastName: newContactForm.lastName,
                    email: newContactForm.email || undefined,
                    phone: newContactForm.phone || undefined,
                    company: newContactForm.company || undefined,
                  });
                  const fullName = `${newContactForm.firstName} ${newContactForm.lastName}`;
                  toast.success(`Created ${fullName}`);
                  // Update any unmatched tasks to use this new contact
                  const next = tasks.map((t) => {
                    if (!t.contact?.id || t.contact.confidence === "none" || t.contact.confidence === "low") {
                      return {
                        ...t,
                        contact: { id: result.id, name: fullName, confidence: "high" as Confidence, matchMethod: "created", candidateCount: 1 },
                      };
                    }
                    return t;
                  });
                  setTasks(next);
                  setShowCreateContact(false);
                  setNewContactForm({ firstName: "", lastName: "", email: "", phone: "", company: "" });
                  utils.contacts.invalidate();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Failed to create contact");
                }
              }}
            >
              {createContact.isPending ? "Creating..." : "Create"}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowCreateContact(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {!showCreateContact && (
        <button
          type="button"
          onClick={() => setShowCreateContact(true)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
        >
          <UserPlus className="h-3.5 w-3.5" /> Add new contact mentioned in memo
        </button>
      )}

      {tasks.length === 0 && updates.length === 0 && links.length === 0 && (
        <p className="text-sm text-muted-foreground italic">
          No actionable items extracted. The transcript is saved as an activity note.
        </p>
      )}

      <Button
        className="w-full"
        onClick={handleApply}
        disabled={totalSelected === 0 || isPending}
      >
        {isPending
          ? "Applying…"
          : totalSelected === 0
            ? "Close"
            : `Apply ${totalSelected} Change${totalSelected === 1 ? "" : "s"}`}
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 className="text-sm font-semibold mb-2">{title}</h4>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function CheckItem({
  checked,
  onToggle,
  label,
  sublabel,
  children,
}: {
  checked: boolean;
  onToggle: () => void;
  label: string;
  sublabel: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 border rounded-md p-2">
      <Checkbox checked={checked} onCheckedChange={onToggle} className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{sublabel}</div>
        {children}
      </div>
    </div>
  );
}

function EntityMatch({
  entity,
  type,
  onPick,
  onCreateContact,
}: {
  entity: ResolvedRef;
  type: "contact" | "property";
  onPick: (picked: ResolvedRef) => void;
  onCreateContact?: () => void;
}) {
  const [showAlts, setShowAlts] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [query, setQuery] = useState("");
  const icon = type === "contact" ? "👤" : "🏢";
  const hasAlts = !!entity.topCandidates && entity.topCandidates.length > 0;
  const isEmpty = entity.id === null && entity.name.startsWith("(no ");
  const label = isEmpty
    ? `${icon} ${type === "contact" ? "Add contact" : "Add property"}`
    : entity.confidence === "none"
      ? `${icon} "${entity.name}" — no match`
      : `${icon} ${entity.name}`;

  const contactsQ = trpc.contacts.list.useQuery(
    { search: query, limit: 10 },
    { enabled: type === "contact" && showSearch && query.length >= 1 },
  );
  const propertiesQ = trpc.properties.list.useQuery(
    { search: query, limit: 10 },
    { enabled: type === "property" && showSearch && query.length >= 1 },
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
    <div className="mt-1">
      <div className="flex items-center gap-1 flex-wrap">
        <button
          type="button"
          onClick={() => hasAlts && setShowAlts((o) => !o)}
          className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border ${confidenceColors[entity.confidence]} ${hasAlts ? "cursor-pointer hover:opacity-80" : ""}`}
        >
          {label}
          {entity.confidence !== "high" && entity.confidence !== "none" && hasAlts && (
            <span className="text-[10px] opacity-70">({entity.candidateCount})</span>
          )}
        </button>
        <button
          type="button"
          onClick={() => {
            setShowSearch((s) => !s);
            setShowAlts(false);
          }}
          className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted"
          title={`Search for a different ${type}`}
        >
          <Search className="h-3 w-3" />
          {showSearch ? "Cancel" : "Search"}
        </button>
      </div>

      {showAlts && entity.topCandidates && (
        <div className="mt-1 ml-2 space-y-1">
          {entity.topCandidates.map((alt) => (
            <button
              key={alt.id}
              type="button"
              className="block text-xs text-left w-full px-2 py-1 rounded hover:bg-muted"
              onClick={() => {
                onPick({ ...entity, id: alt.id, name: alt.name, confidence: "high" });
                setShowAlts(false);
              }}
            >
              {alt.name} <span className="text-muted-foreground">(score {alt.score})</span>
            </button>
          ))}
        </div>
      )}

      {showSearch && (
        <div className="mt-1 ml-2 space-y-1">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={type === "contact" ? "Search contacts…" : "Search properties…"}
            className="h-7 text-xs"
          />
          <div className="max-h-48 overflow-y-auto border rounded">
            {query.length < 1 && (
              <div className="text-[11px] text-muted-foreground px-2 py-1">
                Type to search…
              </div>
            )}
            {query.length >= 1 && hits.length === 0 && (
              <div className="text-[11px] text-muted-foreground px-2 py-1">
                No results
                {type === "contact" && onCreateContact && (
                  <button
                    type="button"
                    className="ml-1 text-primary hover:underline"
                    onClick={() => {
                      onCreateContact();
                      setShowSearch(false);
                      setQuery("");
                    }}
                  >
                    — Create new contact
                  </button>
                )}
              </div>
            )}
            {hits.map((h) => (
              <button
                key={h.id}
                type="button"
                className="block text-xs text-left w-full px-2 py-1 hover:bg-muted"
                onClick={() => {
                  onPick({
                    ...entity,
                    id: h.id,
                    name: h.name,
                    confidence: "high",
                    matchMethod: "manual",
                  });
                  setShowSearch(false);
                  setQuery("");
                }}
              >
                <div className="font-medium">{h.name}</div>
                {h.sub && <div className="text-[10px] text-muted-foreground">{h.sub}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
