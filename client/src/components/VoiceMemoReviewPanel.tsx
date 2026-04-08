import { useState } from "react";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
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
            <CheckItem
              key={i}
              checked={selTasks.has(i)}
              onToggle={() => toggle(selTasks, setSelTasks, i)}
              label={t.title}
              sublabel={`${t.priority} · due in ${t.dueDaysFromNow}d`}
            >
              <EntityMatch
                entity={t.contact ?? emptyRef("contact")}
                type="contact"
                onPick={(picked) => {
                  const next = [...tasks];
                  next[i] = { ...next[i], contact: picked };
                  setTasks(next);
                }}
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
            </CheckItem>
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
}: {
  entity: ResolvedRef;
  type: "contact" | "property";
  onPick: (picked: ResolvedRef) => void;
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
              <div className="text-[11px] text-muted-foreground px-2 py-1">No results</div>
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
