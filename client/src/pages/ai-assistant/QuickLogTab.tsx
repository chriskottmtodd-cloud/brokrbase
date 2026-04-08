import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import {
  Sparkles, ListChecks, CheckCircle2,
  Plus, Loader2, Building2, Users,
  AlertTriangle, CalendarIcon, X,
  Check, Edit2, Activity, User,
} from "lucide-react";
import { Link } from "wouter";
import { TASK_TYPES, PRIORITIES, ACTIVITY_TYPES, OUTCOMES } from "@/lib/constants";
import { ContactSearchPicker, type PickedContact } from "@/components/ContactSearchPicker";
import { PendingTasksFulfiller } from "@/components/PendingTasksFulfiller";
import { ContactConfirmationCard, type ConfirmedContact } from "@/components/ContactConfirmationCard";
import { DealResolver, type DealResolution } from "@/components/DealResolver";
import { parseLlmJson } from "@/lib/parseLlmJson";

import { nextWeekday } from "@shared/utils";

import { fuzzyMatchProperty } from "@/lib/fuzzyMatch";

// ─── Quick Log result types ───────────────────────────────────────────────────
interface ParsedActivity {
  type: string;
  outcome: string;
  subject: string;
  notes: string;
}
interface ParsedTask {
  title: string;
  type: string;
  priority: string;
  daysOut: number;
}
interface ParsedResult {
  summary: string;
  detectedContactName: string;
  detectedPropertyName: string;
  detectedListingName: string;
  hasListingInterest: boolean;
  activity: ParsedActivity;
  tasks: ParsedTask[];
  unsolicitedOffer?: { amount: number | null; notes: string } | null;
}

export function QuickLog({ urlContactId, urlPropertyId, urlListingId }: { urlContactId: number | null; urlPropertyId: number | null; urlListingId: number | null }) {
  const [text,    setText]    = useState("");
  const [parsing, setParsing] = useState(false);
  const [result,  setResult]  = useState<ParsedResult | null>(null);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  // Contact
  const [contact, setContact] = useState<PickedContact | null>(null);
  // contactAutoFilled: tracks the auto-filled ConfirmedContact (for ContactConfirmationCard display)
  const [contactAutoFilled, setContactAutoFilled] = useState<{ contact: ConfirmedContact; reason: "email_match" | "name_match" } | null>(null);
  // detectedEmail: email extracted from the thread (for pre-filling the create form)
  const [detectedEmail, setDetectedEmail] = useState<string>("");

  // Activity card (editable)
  const [actType,    setActType]    = useState("");
  const [actOutcome, setActOutcome] = useState("");
  const [actSubject, setActSubject] = useState("");
  const [actNotes,   setActNotes]   = useState("");
  // accept-as-you-go: null=pending, true=accepted, false=skipped
  const [actStatus, setActStatus] = useState<null | "accepted" | "skipped">(null);
  const [actSaving, setActSaving] = useState(false);

  // Listing interest card
  const [listingStatus, setListingStatus] = useState<null | "accepted" | "skipped">(null);
  const [listingSaving, setListingSaving] = useState(false);
  const [selectedListingId, setSelectedListingId] = useState("");

  // Property override (user can swap the AI-detected property)
  const [overridePropertyId, setOverridePropertyId] = useState<number | null>(null);
  const [propertySearchOpen, setPropertySearchOpen] = useState(false);
  const [propertySearchText, setPropertySearchText] = useState("");

  // Tiered deal resolution (Active Deal Stack)
  const [dealResolution, setDealResolution] = useState<DealResolution | null>(null);
  const resolvePropertyMut = trpc.smartLog.resolvePropertyName.useMutation();

  // Listing override (user can swap the AI-detected listing)
  const [overrideListingId, setOverrideListingId] = useState<number | null>(null);
  const [listingSearchOpen, setListingSearchOpen] = useState(false);
  const [listingSearchText, setListingSearchText] = useState("");

  // Tasks (editable array)
  const [taskCards, setTaskCards] = useState<Array<{
    status: null | "accepted" | "skipped"; saving: boolean;
    title: string; type: string; priority: string; dueDate: Date; calOpen: boolean;
  }>>([]);

  const { data: listings }   = trpc.listings.list.useQuery({ status: "active" });
  const { data: properties }  = trpc.properties.list.useQuery({ limit: 10000 });
  const { data: allContacts } = trpc.contacts.list.useQuery({ limit: 2000 });
  const utils = trpc.useUtils();

  const createActivity    = trpc.activities.create.useMutation();
  const createTask        = trpc.tasks.create.useMutation();
  const upsertInterest    = trpc.listings.upsertBuyerInterest.useMutation();
  const updateContact     = trpc.contacts.update.useMutation();
  const createContactLink = trpc.contactLinks.create.useMutation();
  const invokeLlm         = trpc.callIntel.invokeLlm.useMutation();
  const detectContactMut  = trpc.contactEmails.detectFromThread.useMutation();
  const detectContactRef  = useRef(detectContactMut.mutateAsync);
  detectContactRef.current = detectContactMut.mutateAsync;
  const refreshNotes         = trpc.contacts.refreshNotes.useMutation();
  const refreshPropertyNotes = trpc.properties.refreshNotes.useMutation();
  const createDealAct        = trpc.listings.createDealActivity.useMutation();
  const createOffer          = trpc.properties.createOffer.useMutation();

  // ─── URL query-param seeding (contextual launch) ────────────────────────────
  const hasSeededFromUrl = useRef(false);
  useEffect(() => {
    if (hasSeededFromUrl.current) return;
    if (!urlContactId && !urlPropertyId && !urlListingId) return;
    if (urlContactId && !allContacts) return;

    hasSeededFromUrl.current = true;

    if (urlContactId && allContacts) {
      const c = allContacts.find((ct: any) => ct.id === urlContactId);
      if (c) {
        setContact({ id: c.id, firstName: c.firstName, lastName: c.lastName, company: c.company, phone: c.phone });
        setContactAutoFilled({
          contact: {
            id: c.id, firstName: c.firstName, lastName: c.lastName,
            email: c.email, phone: c.phone, company: c.company,
            isOwner: c.isOwner, isBuyer: c.isBuyer,
          },
          reason: "name_match",
        });
      }
    }
    if (urlPropertyId) setOverridePropertyId(urlPropertyId);
    if (urlListingId) setOverrideListingId(urlListingId);
  }, [allContacts, urlContactId, urlPropertyId, urlListingId]);

  // Deal intelligence coaching
  const [dealIntelCoaching,  setDealIntelCoaching]  = useState<Array<{text: string; source: string}>>([]);
  const [isDealIntelLoading, setIsDealIntelLoading] = useState(false);
  const trpcUtils = trpc.useUtils();

  async function runDealIntelCoaching(contactId: number, propertyId: number | null, listingId: number | null, noteContext: string) {
    setIsDealIntelLoading(true);
    try {
      const [intel, narrative] = await Promise.all([
        trpcUtils.callIntel.getDealIntelligenceContext.fetch({
          contactId,
          propertyId: propertyId ?? undefined,
          listingId:  listingId  ?? undefined,
        }),
        propertyId
          ? trpcUtils.callIntel.getDealNarrative.fetch({ propertyId }).catch(() => null)
          : Promise.resolve(null),
      ]);
      const lines: string[] = [];
      // Inject deal narrative at the top if available
      if (narrative) {
        lines.push(`DEAL NARRATIVE (AI-maintained summary):\n${narrative.summary}`);
        if (narrative.nextSteps) lines.push(`Next Steps: ${narrative.nextSteps}`);
        if (narrative.blockers) lines.push(`Blockers: ${narrative.blockers}`);
        lines.push("---");
      }
      if (intel.contactName)       lines.push(`Contact: ${intel.contactName}${intel.contactCompany ? " (" + intel.contactCompany + ")" : ""}`);
      if (intel.dealRole)          lines.push(`Their role on this deal: ${intel.dealRole.replace(/_/g, " ")}`);
      if (intel.daysSinceContact !== null) lines.push(`Days since last contact: ${intel.daysSinceContact}`);
      if (intel.totalInteractions > 0) lines.push(`Total logged interactions: ${intel.totalInteractions}`);
      if (intel.activitySummary.length > 0) lines.push(`Recent activity:\n${intel.activitySummary.map(a => "  - " + a).join("\n")}`);
      if (intel.isDualRole)        lines.push(`Note: This contact is both a buyer AND a property owner — potential trade candidate.`);
      if (intel.otherDeals.length > 0) lines.push(`Other deals they're linked to: ${intel.otherDeals.join(", ")}`);
      if (intel.buyerCriteria)     lines.push(`Buyer criteria: ${JSON.stringify(intel.buyerCriteria)}`);
      if (intel.propertyName)      lines.push(`Property: ${intel.propertyName} (${intel.propertyCity ?? ""}, ${intel.propertyUnitCount ?? "?"}u, status: ${intel.propertyStatus ?? "unknown"})`);
      if (intel.propertyOffMarket) lines.push(`Off-market interest: owner has indicated willingness to sell (${intel.propertyOffMarketConf ?? "interested"})`);
      if (intel.propertyNotes)     lines.push(`Property notes: ${intel.propertyNotes.slice(0, 300)}`);
      if (intel.listingTitle)      lines.push(`Listing: ${intel.listingTitle} (stage: ${intel.listingStage}, ${intel.listingUnitCount ?? "?"}u, $${intel.listingPrice ? (intel.listingPrice / 1_000_000).toFixed(1) + "M" : "TBD"})`);
      if (intel.listingNotes)      lines.push(`Broker notes on listing: ${intel.listingNotes.slice(0, 300)}`);
      if (intel.contactNotes)      lines.push(`Contact notes: ${intel.contactNotes.slice(0, 200)}`);
      if (lines.length === 0) { setIsDealIntelLoading(false); return; }
      const intelBlock = lines.join("\n");
      const prompt = `You are a senior commercial real estate broker coaching a junior broker on a call/interaction.

DEAL INTELLIGENCE FROM CRM:
${intelBlock}

INTERACTION NOTES:
${noteContext.slice(0, 600)}

Based on this specific CRM data, generate 3-5 highly personalized coaching points. Each point must reference specific details from the CRM data above. Do NOT give generic advice. Think like a senior broker who knows this contact and deal intimately — what would they say after reviewing these notes?

Return ONLY a JSON array:
[{"text": "specific coaching point", "source": "crm"}]
No markdown, no backticks.`;
      const rawResult = await invokeLlm.mutateAsync({ prompt, maxTokens: 800 });
      const raw = typeof rawResult === "string" ? rawResult : rawResult.text;
      const points = parseLlmJson<Array<{text: string; source: string}>>(raw);
      setDealIntelCoaching(points);
    } catch (err) {
      console.error("Deal intel coaching failed:", err);
    } finally {
      setIsDealIntelLoading(false);
    }
  }

  async function handleParse() {
    if (!text.trim()) { toast.error("Paste some notes first."); return; }
    setParsing(true);
    setResult(null);
    setSaved(false);
    setDealIntelCoaching([]);
    setIsDealIntelLoading(false);

    // Build listing context with seller names for richer AI understanding
    const listingCtxForAI = listings?.map((l) => {
      const sellerNames = (l as any).sellers?.map((s: any) => `${s.firstName} ${s.lastName}`).join(", ");
      return `${l.title} (stage:${l.stage}${sellerNames ? ", sellers: " + sellerNames : ""})`;
    }).join(" | ") ?? "";

    // Build property context with off-market interest flags
    const propertyCtxForAI = properties?.map((p) => {
      const addr = p.address ? `${p.address}, ` : "";
      const parts = [`${p.name} (${addr}${p.city ?? ""} ${p.state ?? ""}, ${p.unitCount ?? "?"}u, ${p.status})`];
      if (p.offMarketInterest) {
        const conf = p.offMarketConfidence === "casual_mention" ? "casual mention" :
                     p.offMarketConfidence === "serious_interest" ? "serious interest" :
                     p.offMarketConfidence === "actively_exploring" ? "actively exploring" : "interested";
        parts.push(`OFF-MARKET: owner indicated willingness to sell (${conf}${p.offMarketTimeline ? ", " + p.offMarketTimeline : ""})`);
      }
      return parts.join(" — ");
    }).filter(p => p.includes("OFF-MARKET") || (p as string).includes("prospecting") || (p as string).includes("seller") || (p as string).includes("listed") || (p as string).includes("under_contract")).join(" | ") ?? "";

    const prompt = `You are an assistant for a commercial real estate broker (Chriskott Todd, multifamily broker in Idaho/Montana).
Active listings: ${listingCtxForAI.slice(0, 600)}
Key properties (prospecting/off-market/listed): ${propertyCtxForAI.slice(0, 800)}
Parse the following notes and return ONLY a JSON object (no markdown):
{
  "summary": "1-2 sentence summary of what happened",
  "detectedContactName": "full name of the person mentioned or empty string",
  "detectedPropertyName": "exact property name as it appears in the property list above, include address/city if needed to distinguish — or empty string if none mentioned",
  "detectedListingName": "listing/deal mentioned if any or empty string",
  "hasListingInterest": true or false (does the note suggest someone is interested in a listing?),
  "activity": {
    "type": "call|email|meeting|note|text|voicemail",
    "outcome": "reached|voicemail|no_answer|not_interested|interested|follow_up|callback_requested or empty",
    "subject": "one line subject e.g. 'Called Jay about Arbor Court'",
    "notes": "cleaned up notes summary"
  },
  "tasks": [
    { "title": "task title", "type": "call|email|follow_up|meeting|other", "priority": "urgent|high|medium|low", "daysOut": 3 }
  ],
  "unsolicitedOffer": null or { "amount": number or null, "notes": "brief context about the offer" }
}
daysOut = number of days from today when this task should be due (1-30).
Generate 1-3 tasks based on what logically comes next.
Set unsolicitedOffer if the notes mention an unsolicited or off-market offer on a property (e.g. buyer reached out with a number, owner received an unsolicited bid). Leave null if no offer is mentioned.

NOTES:
${text}`;

    try {
      const rawResult = await invokeLlm.mutateAsync({ prompt });
      const raw = typeof rawResult === "string" ? rawResult : rawResult.text;
      const parsed = parseLlmJson<ParsedResult>(raw);
      setResult(parsed);

      // Pre-fill editable fields
      setActType(parsed.activity.type || "note");
      setActOutcome(parsed.activity.outcome || "");
      setActSubject(parsed.activity.subject || "");
      setActNotes(parsed.activity.notes || text);
      setActStatus(null);
      setListingStatus(null);

      setTaskCards(parsed.tasks.map(t => ({
        status:   null,
        saving:   false,
        title:    t.title,
        type:     t.type,
        priority: t.priority,
        dueDate:  nextWeekday(addDays(new Date(), t.daysOut)),
        calOpen:  false,
      })));

      // Tiered property resolution via Active Deal Stack (runs in background)
      if (parsed.detectedPropertyName) {
        resolvePropertyMut.mutateAsync({ name: parsed.detectedPropertyName }).then((res) => {
          setDealResolution({
            detectedPropertyId: res.match?.property.id ?? null,
            detectedPropertyName: parsed.detectedPropertyName,
            confidence: (res.match?.confidence ?? "low") as DealResolution["confidence"],
            tier: (res.match?.tier ?? "none") as DealResolution["tier"],
            alternatives: res.alternatives.map(a => ({
              id: a.property.id,
              name: a.property.name,
              city: a.property.city ?? null,
              confidence: a.confidence,
              tier: a.tier,
              reason: a.reason,
            })),
            isNew: res.isNew,
          });
          // Auto-set override if high confidence
          if (res.match && res.match.confidence === "high") {
            setOverridePropertyId(res.match.property.id);
          }
        }).catch(() => { /* fall through to client-side fuzzy match */ });
      }

      // Auto-fill contact: ALWAYS call detectFromThread first (email-based lookup wins over name match)
      // This runs in background so it doesn't block the UI from showing the parsed result
      detectContactRef.current({
        thread: text.slice(0, 4000),
      }).then((detection) => {
        const _fuzzyProp = (name: string) => fuzzyMatchProperty(name, properties ?? []);
        const _fuzzyList = (name: string) => { const n = name.toLowerCase(); return (listings ?? []).find(l => { const ln = l.title.toLowerCase(); return ln === n || ln.includes(n) || n.includes(ln); }); };
        const detectedProperty = parsed.detectedPropertyName ? _fuzzyProp(parsed.detectedPropertyName) : undefined;
        const detectedListing = parsed.detectedListingName ? _fuzzyList(parsed.detectedListingName) : undefined;
        // Pre-select the listing in the buyer card if found
        if (detectedListing) setSelectedListingId(String(detectedListing.id));

        if (detection.matchedContact) {
          // Email-based or AI ID match — use it (highest confidence)
          const selReason: "email_match" | "name_match" = detection.primaryContactEmail && detection.matchedContact.email
            ? "email_match"
            : "name_match";
          const pickedContact: PickedContact = {
            id: detection.matchedContact.id,
            firstName: detection.matchedContact.firstName,
            lastName: detection.matchedContact.lastName,
            company: detection.matchedContact.company ?? undefined,
            isOwner: detection.matchedContact.isOwner ?? undefined,
            isBuyer: detection.matchedContact.isBuyer ?? undefined,
            lastContactedAt: detection.matchedContact.lastContactedAt ?? undefined,
          };
          setContact(pickedContact);
          setDetectedEmail(detection.primaryContactEmail ?? "");
          setContactAutoFilled({ contact: detection.matchedContact, reason: selReason });
        } else if (parsed.detectedContactName && allContacts && allContacts.length > 0) {
          // detectFromThread found nothing — fall back to local fuzzy name match
          const q = parsed.detectedContactName.trim().toLowerCase();
          const tokens = q.split(/\s+/);
          const scored = allContacts.map((c) => {
            const full = `${c.firstName} ${c.lastName}`.toLowerCase();
            let score = 0;
            if (full === q) score = 100;
            else if (c.firstName.toLowerCase() === tokens[0] && tokens[1] && c.lastName.toLowerCase() === tokens[1]) score = 90;
            else if (c.firstName.toLowerCase() === tokens[0]) score = 60;
            else if (tokens[1] && c.lastName.toLowerCase() === tokens[1]) score = 40;
            else if (full.includes(tokens[0])) score = 20;
            return { ...c, score };
          }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score);

          // Only auto-fill on exact first+last name match (score >= 90)
          if (scored.length > 0 && scored[0].score >= 90) {
            const best = scored[0];
            const pickedContact: PickedContact = {
              id: best.id,
              firstName: best.firstName,
              lastName: best.lastName,
              company: best.company ?? undefined,
              phone: best.phone ?? undefined,
              isOwner: best.isOwner ?? undefined,
              isBuyer: best.isBuyer ?? undefined,
              lastContactedAt: best.lastContactedAt ?? undefined,
            };
            setContact(pickedContact);
            setContactAutoFilled({
              contact: {
                id: best.id,
                firstName: best.firstName,
                lastName: best.lastName,
                company: best.company ?? null,
                email: best.email ?? null,
                isOwner: best.isOwner ?? null,
                isBuyer: best.isBuyer ?? null,
                lastContactedAt: best.lastContactedAt ?? null,
              },
              reason: "name_match",
            });
          }
          // No match — leave contact blank so user can fill in manually
        }
        // No name detected — leave contact blank
      }).catch(() => {
        // detectFromThread failed — fall back to local fuzzy name match only
        if (parsed.detectedContactName && allContacts && allContacts.length > 0) {
          const q = parsed.detectedContactName.trim().toLowerCase();
          const tokens = q.split(/\s+/);
          const scored = allContacts.map((c) => {
            const full = `${c.firstName} ${c.lastName}`.toLowerCase();
            let score = 0;
            if (full === q) score = 100;
            else if (c.firstName.toLowerCase() === tokens[0] && tokens[1] && c.lastName.toLowerCase() === tokens[1]) score = 90;
            else if (c.firstName.toLowerCase() === tokens[0]) score = 60;
            else if (tokens[1] && c.lastName.toLowerCase() === tokens[1]) score = 40;
            else if (full.includes(tokens[0])) score = 20;
            return { ...c, score };
          }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
          // Only auto-fill on exact first+last name match (score >= 90)
          if (scored.length > 0 && scored[0].score >= 90) {
            const best = scored[0];
            setContact({
              id: best.id, firstName: best.firstName, lastName: best.lastName,
              company: best.company ?? undefined, phone: best.phone ?? undefined,
              isOwner: best.isOwner ?? undefined, isBuyer: best.isBuyer ?? undefined,
              lastContactedAt: best.lastContactedAt ?? undefined,
            });
            setContactAutoFilled({
              contact: {
                id: best.id, firstName: best.firstName, lastName: best.lastName,
                company: best.company ?? null, email: best.email ?? null,
                isOwner: best.isOwner ?? null, isBuyer: best.isBuyer ?? null,
                lastContactedAt: best.lastContactedAt ?? null,
              },
              reason: "name_match",
            });
          }
        }
      });
    } catch {
      toast.error("Failed to parse notes. Try again.");
    } finally {
      setParsing(false);
    }
  }

  async function handleSaveAll() {
    if (!contact) { toast.error("Please link a contact first."); return; }
    setSaving(true);
    let savedCount = 0;
    try {
      // Calculate effective IDs up front so they can be attached to the activity
      const _fp = (name: string) => fuzzyMatchProperty(name, properties ?? []);
      const _fl = (name: string) => { const n = name.toLowerCase(); return (listings ?? []).find(l => { const ln = l.title.toLowerCase(); return ln === n || ln.includes(n) || n.includes(ln); }); };
      const effectivePropertyId = overridePropertyId ??
        (result?.detectedPropertyName ? _fp(result.detectedPropertyName)?.id ?? null : null);
      const effectiveListingId = overrideListingId ??
        (result?.detectedListingName ? _fl(result.detectedListingName)?.id ?? null : null);

      // Save activity — include propertyId so it shows up on the property's activity log
      if (actStatus === "accepted") {
        await createActivity.mutateAsync({
          type:      (ACTIVITY_TYPES.includes(actType as any) ? actType : "note") as any,
          contactId: contact.id,
          propertyId: effectivePropertyId ?? undefined,
          subject:   actSubject || undefined,
          notes:     actNotes   || undefined,
          outcome:   (OUTCOMES.includes(actOutcome as any) ? actOutcome : undefined) as any,
        });
        await updateContact.mutateAsync({ id: contact.id, lastContactedAt: new Date() });
        savedCount++;
      }

      // Save listing interest
      if (listingStatus === "accepted" && selectedListingId && contact) {
        await upsertInterest.mutateAsync({
          listingId:  parseInt(selectedListingId),
          contactId:  contact.id,
          status:     "interested",
          notes:      actNotes || text,
        });
        savedCount++;
      }

      // Save tasks
      for (const tc of taskCards) {
        if (tc.status !== "accepted") continue;
        await createTask.mutateAsync({
          title:     tc.title,
          type:      tc.type as any,
          priority:  tc.priority as any,
          dueAt:     tc.dueDate,
          contactId: contact.id,
        });
        savedCount++;
      }

      // Auto-tag: link contact to any property/listing mentioned in the notes
      if (effectivePropertyId) {
        const propName = (properties ?? []).find(p => p.id === effectivePropertyId)?.name ?? result?.detectedPropertyName ?? "";
        createContactLink.mutate({
          contactId: contact.id,
          propertyId: effectivePropertyId,
          source: "ai_assistant",
          label: `AI Assistant — ${propName}`,
        });
      }
      // Use override listing if user corrected the AI's detection
      if (effectiveListingId) {
        const listingName = (listings ?? []).find(l => l.id === effectiveListingId)?.title ?? result?.detectedListingName ?? "";
        createContactLink.mutate({
          contactId: contact.id,
          listingId: effectiveListingId,
          source: "ai_assistant",
          label: `AI Assistant — ${listingName}`,
        });
      }
      // Also auto-tag to the selected listing if buyer interest was logged
      if (listingStatus === "accepted" && selectedListingId) {
        const selListingIdNum = parseInt(selectedListingId);
        if (selListingIdNum !== effectiveListingId) {
          createContactLink.mutate({
            contactId: contact.id,
            listingId: selListingIdNum,
            source: "ai_assistant",
            label: `AI Assistant — Buyer Interest`,
          });
        }
      }

      // Save deal activity on the linked listing (detected/overridden or selected)
      const dealListingId = listingStatus === "accepted" && selectedListingId
        ? parseInt(selectedListingId)
        : effectiveListingId ?? null;
      if (dealListingId && result?.summary) {
        // Determine activity type from the parsed content
        const summaryLower = (result.summary ?? "").toLowerCase();
        const dealActType = summaryLower.includes("loi") || summaryLower.includes("letter of intent")
          ? "loi"
          : summaryLower.includes("offer")
            ? "offer"
            : actType === "call"
              ? "call"
              : actType === "email"
                ? "email"
                : "note";
        createDealAct.mutate({
          listingId: dealListingId,
          type: dealActType as any,
          summary: result.summary.slice(0, 800),
        });
      }

      // Save unsolicited offer if AI detected one and a property is linked
      if (result?.unsolicitedOffer && effectivePropertyId) {
        createOffer.mutate({
          propertyId: effectivePropertyId,
          amount: result.unsolicitedOffer.amount ?? undefined,
          notes: result.unsolicitedOffer.notes || result.summary.slice(0, 400),
          buyerContactId: contact?.id,
          receivedAt: new Date(),
        });
        savedCount++;
      }

      utils.tasks.list.invalidate();
      utils.contacts.list.invalidate();
      toast.success(`Saved ${savedCount} item${savedCount !== 1 ? "s" : ""} to CRM.`);
      setSaved(true);

      // Silently refresh property notes if a property was linked
      if (effectivePropertyId && savedCount > 0) {
        refreshPropertyNotes.mutate({ propertyId: effectivePropertyId });
      }

      // Silently refresh the contact's notes paragraph with the new context
      if (savedCount > 0 && result?.summary) {
        const contextParts: string[] = [result.summary];
        if (actStatus === "accepted" && actNotes) contextParts.push(actNotes.slice(0, 400));
        if (listingStatus === "accepted" && selectedListingId) {
          const listing = (listings ?? []).find((l) => l.id === parseInt(selectedListingId));
          if (listing) contextParts.push(`Expressed interest in listing: ${listing.title}`);
        }
        refreshNotes.mutate({
          contactId: contact.id,
          newContext: contextParts.join(" | "),
        });
      }
    } catch { toast.error("Something went wrong saving."); }
    finally { setSaving(false); }
  }

  function resetAll() {
    setText(""); setResult(null); setSaved(false); setContact(null); setContactAutoFilled(null); setDetectedEmail("");
    setTaskCards([]); setListingStatus(null); setSelectedListingId(""); setActStatus(null);
    setOverridePropertyId(null); setPropertySearchText(""); setPropertySearchOpen(false);
    setOverrideListingId(null); setListingSearchText(""); setListingSearchOpen(false);
    setDealIntelCoaching([]); setIsDealIntelLoading(false);
    setDealResolution(null);
  }

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Input */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Activity className="h-3.5 w-3.5 text-primary" />Paste Anything
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">Dump call notes, paste an email — as messy as you like.</p>
          <Textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null); setSaved(false); }}
            placeholder="Dump call notes, paste an email thread, type a quick update — as messy as you like. AI will extract the contact, what happened, and what to do next."
            className="bg-background border-border resize-none min-h-[180px] text-sm"
            rows={8}
          />
          <Button
            onClick={handleParse}
            disabled={parsing || !text.trim()}
            className="w-full gap-2"
          >
            {parsing ? <><Loader2 className="h-4 w-4 animate-spin" />Analyzing…</> : <><Sparkles className="h-4 w-4" />Process & Extract</>}
          </Button>
        </CardContent>
      </Card>

      {parsing && (
        <Card className="border-border bg-card">
          <CardContent className="py-10 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-primary" />
            <p className="font-medium">Analyzing your notes…</p>
          </CardContent>
        </Card>
      )}

      {result && !saved && (
        <>
          {/* Context summary bar */}
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-card border border-border/60 text-xs text-muted-foreground flex-wrap">
            {result.detectedContactName && (
              <span className="flex items-center gap-1.5">
                <User className="h-3 w-3 text-primary shrink-0" />
                <span className="font-medium text-foreground">{result.detectedContactName}</span>
              </span>
            )}
            {(result.detectedPropertyName || result.detectedListingName) && (
              <span className="flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-primary shrink-0" />
                <span className="font-medium text-foreground">{result.detectedPropertyName || result.detectedListingName}</span>
              </span>
            )}
            <span className="flex-1 min-w-0 truncate text-muted-foreground">{result.summary}</span>
            <Button variant="ghost" size="sm" className="h-5 text-[10px] px-1.5 text-muted-foreground shrink-0" onClick={resetAll}>Clear</Button>
          </div>

          {/* Deal Intelligence coaching card — only shown after on-demand load */}
          {(isDealIntelLoading || dealIntelCoaching.length > 0) && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500"></span>
                  Deal Intelligence
                  {isDealIntelLoading && <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-500 ml-1" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-4 space-y-2">
                {isDealIntelLoading && dealIntelCoaching.length === 0 && (
                  <p className="text-xs text-muted-foreground">Pulling deal context from CRM…</p>
                )}
                {dealIntelCoaching.map((pt, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 mt-0.5 bg-amber-500/20 text-amber-400 border-amber-500/30">
                      intel
                    </Badge>
                    <p className="text-xs text-foreground leading-relaxed">{pt.text}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

            {/* Contact picker */}
            <Card className="border-border bg-card">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-3.5 w-3.5 text-primary" />Contact
                  {!contact && <span className="text-primary text-[10px] font-normal normal-case ml-1">* required to save</span>}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Auto-filled contact — show confirmation card */}
                {contact && contactAutoFilled && contactAutoFilled.contact.id === contact.id ? (
                  <ContactConfirmationCard
                    contact={contactAutoFilled.contact}
                    selectionReason={contactAutoFilled.reason}
                    detectedName={result?.detectedContactName || undefined}
                    detectedEmail={detectedEmail || undefined}
                    onConfirm={(c) => {
                      // User confirmed — no extra action needed
                    }}
                    onSwap={(c) => {
                      const picked: PickedContact = {
                        id: c.id,
                        firstName: c.firstName,
                        lastName: c.lastName,
                        company: c.company ?? undefined,
                        isOwner: c.isOwner ?? undefined,
                        isBuyer: c.isBuyer ?? undefined,
                        lastContactedAt: c.lastContactedAt ?? undefined,
                      };
                      setContact(picked);
                      setContactAutoFilled({ contact: c, reason: "name_match" });
                      // Re-run deal intel with swapped contact
                      const detectedProperty = result.detectedPropertyName
                        ? (properties ?? []).find(p => p.name === result.detectedPropertyName)
                        : undefined;
                      const detectedListing = result.detectedListingName
                        ? (listings ?? []).find(l => l.title === result.detectedListingName)
                        : undefined;
                      runDealIntelCoaching(c.id, detectedProperty?.id ?? null, detectedListing?.id ?? null, text.slice(0, 600));
                      toast.success(`Switched to ${c.firstName} ${c.lastName}.`);
                    }}
                  />
                ) : (
                  <>
                    {result.detectedContactName && !contact && (
                      <p className="text-xs text-muted-foreground">
                        AI detected: <span className="text-foreground font-medium">"{result.detectedContactName}"</span> — search below to confirm or create.
                      </p>
                    )}
                    <ContactSearchPicker
                      value={contact}
                      onChange={(c) => { setContact(c); setContactAutoFilled(null); }}
                      required
                      allowCreate
                      placeholder={result.detectedContactName ? `Search for "${result.detectedContactName}"…` : "Search or create contact…"}
                    />
                  </>
                )}
              </CardContent>
            </Card>

            {/* Detected property — compact one-line row */}
            {(result.detectedPropertyName || overridePropertyId !== null) && (() => {
              const detectedProp = overridePropertyId
                ? (properties ?? []).find(p => p.id === overridePropertyId)
                : (() => { const n = result.detectedPropertyName.toLowerCase(); return (properties ?? []).find(p => { const pn = p.name.toLowerCase(); return pn === n || pn.includes(n) || n.includes(pn); }); })();
              const filteredProps = (properties ?? []).filter(p =>
                propertySearchText.trim().length < 2 ? true :
                `${p.name} ${p.address ?? ""} ${p.city ?? ""}`.toLowerCase().includes(propertySearchText.toLowerCase())
              ).slice(0, 8);
              return (
                <div className="rounded border border-border/60 bg-card px-3 py-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Property</p>
                    {detectedProp ? (
                      <>
                        <span className="text-xs font-medium text-foreground flex-1 truncate">{detectedProp.name}</span>
                        {detectedProp.city && <span className="text-[10px] text-muted-foreground shrink-0">{detectedProp.city}</span>}
                        <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-muted-foreground gap-0.5 shrink-0"
                          onClick={() => { setPropertySearchOpen(true); setPropertySearchText(""); }}>
                          <Edit2 className="h-2.5 w-2.5" />Change
                        </Button>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400 shrink-0"
                          title="Remove property"
                          onClick={() => { setOverridePropertyId(null); setPropertySearchOpen(false); setPropertySearchText(""); }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : dealResolution && !overridePropertyId ? (
                      <span className="text-xs text-amber-400 flex-1 truncate">Resolving "{result.detectedPropertyName}"...</span>
                    ) : (
                      <span className="text-xs text-amber-400 flex-1 truncate">"{result.detectedPropertyName}" — not in CRM</span>
                    )}
                  </div>
                  {/* Tiered deal resolution UI */}
                  {dealResolution && !overridePropertyId && !detectedProp && (
                    <DealResolver
                      resolution={dealResolution}
                      onResolved={(id) => {
                        setOverridePropertyId(id);
                        setDealResolution(null);
                      }}
                      onCreateNew={(name) => {
                        // TODO: Open property creation with pre-filled name
                        toast.info(`"${name}" — add it manually in Properties for now`);
                        setDealResolution(null);
                      }}
                      onUndo={() => {
                        setOverridePropertyId(null);
                        setDealResolution(null);
                      }}
                    />
                  )}
                  {(propertySearchOpen || (!detectedProp && !dealResolution)) && (
                    <div className="relative">
                      <Input autoFocus value={propertySearchText} onChange={(e) => setPropertySearchText(e.target.value)}
                        placeholder="Search property…" className="h-7 text-xs bg-background border-border" />
                      {propertySearchText.trim().length >= 1 && filteredProps.length > 0 && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded shadow-lg max-h-40 overflow-y-auto">
                          {filteredProps.map(p => (
                            <button key={p.id} className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors"
                              onClick={() => { setOverridePropertyId(p.id); setPropertySearchOpen(false); setPropertySearchText(""); }}>
                              <span className="font-medium">{p.name}</span>
                              <span className="text-muted-foreground ml-2">{p.city ?? ""}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Detected listing — compact one-line row */}
            {(result.detectedListingName || overrideListingId !== null) && (() => {
              const detectedListing = overrideListingId
                ? (listings ?? []).find(l => l.id === overrideListingId)
                : (() => { const n = result.detectedListingName.toLowerCase(); return (listings ?? []).find(l => { const ln = l.title.toLowerCase(); return ln === n || ln.includes(n) || n.includes(ln); }); })();
              const filteredListings = (listings ?? []).filter(l =>
                listingSearchText.trim().length < 2 ? true :
                l.title.toLowerCase().includes(listingSearchText.toLowerCase())
              ).slice(0, 8);
              return (
                <div className="rounded border border-border/60 bg-card px-3 py-2 space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-purple-400 shrink-0" />
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Listing</p>
                    {detectedListing ? (
                      <>
                        <span className="text-xs font-medium text-foreground flex-1 truncate">{detectedListing.title}</span>
                        {detectedListing.stage && <span className="text-[10px] text-muted-foreground capitalize shrink-0">{detectedListing.stage.replace(/_/g, " ")}</span>}
                        <Button size="sm" variant="ghost" className="h-5 text-[10px] px-1.5 text-muted-foreground gap-0.5 shrink-0"
                          onClick={() => { setListingSearchOpen(true); setListingSearchText(""); }}>
                          <Edit2 className="h-2.5 w-2.5" />Change
                        </Button>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-muted-foreground hover:text-red-400 shrink-0"
                          title="Remove listing"
                          onClick={() => { setOverrideListingId(null); setListingSearchOpen(false); setListingSearchText(""); }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </>
                    ) : (
                      <span className="text-xs text-amber-400 flex-1 truncate">"{result.detectedListingName}" — not in CRM</span>
                    )}
                  </div>
                  {(listingSearchOpen || !detectedListing) && (
                    <div className="relative">
                      <Input autoFocus value={listingSearchText} onChange={(e) => setListingSearchText(e.target.value)}
                        placeholder="Search listing…" className="h-7 text-xs bg-background border-border" />
                      {listingSearchText.trim().length >= 1 && filteredListings.length > 0 && (
                        <div className="absolute z-50 top-full mt-1 w-full bg-card border border-border rounded shadow-lg max-h-40 overflow-y-auto">
                          {filteredListings.map(l => (
                            <button key={l.id} className="w-full text-left px-3 py-2 text-xs hover:bg-accent transition-colors"
                              onClick={() => { setOverrideListingId(l.id); setListingSearchOpen(false); setListingSearchText(""); }}>
                              <span className="font-medium">{l.title}</span>
                              <span className="text-muted-foreground ml-2 capitalize">{l.stage?.replace(/_/g, " ") ?? ""}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Pending tasks for this contact */}
            {contact && (
              <Card className="border-border bg-card">
                <CardContent className="pt-4 pb-4">
                  <PendingTasksFulfiller
                    contactId={contact.id}
                    completionNote={actNotes || text}
                  />
                </CardContent>
              </Card>
            )}

            {/* ── Activity card (Accept/Skip) ─────────────────────────────── */}
            {actStatus !== "accepted" ? (
              <Card className={`border-border bg-card border-l-2 ${actStatus === "skipped" ? "border-l-slate-600 opacity-50" : "border-l-green-500/40"}`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Activity className="h-3.5 w-3.5 text-green-400" />Log Activity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <Select value={actType} onValueChange={setActType}>
                      <SelectTrigger className="h-7 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                      <SelectContent>{ACTIVITY_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                    <Select value={actOutcome} onValueChange={setActOutcome}>
                      <SelectTrigger className="h-7 text-xs bg-background border-border"><SelectValue placeholder="Outcome…" /></SelectTrigger>
                      <SelectContent>{OUTCOMES.map(o => <SelectItem key={o} value={o}>{o.replace(/_/g," ")}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <Input value={actSubject} onChange={(e) => setActSubject(e.target.value)} placeholder="Subject" className="h-7 text-xs bg-background border-border" />
                  <Textarea value={actNotes} onChange={(e) => setActNotes(e.target.value)} placeholder="Notes…" className="text-xs bg-background border-border resize-none" rows={2} />
                  {actStatus === null && (
                    <div className="flex gap-2 pt-1">
                      <Button
                        size="sm"
                        className="flex-1 h-7 text-xs gap-1 bg-green-600 hover:bg-green-500"
                        disabled={actSaving || !contact}
                        onClick={async () => {
                          if (!contact) { toast.error("Link a contact first."); return; }
                          setActSaving(true);
                          try {
                            const _fp = (name: string) => fuzzyMatchProperty(name, properties ?? []);
                            const effectivePropertyId = overridePropertyId ?? (result?.detectedPropertyName ? _fp(result.detectedPropertyName)?.id ?? null : null);
                            await createActivity.mutateAsync({
                              type: (ACTIVITY_TYPES.includes(actType as any) ? actType : "note") as any,
                              contactId: contact.id,
                              propertyId: effectivePropertyId ?? undefined,
                              subject: actSubject || undefined,
                              notes: actNotes || undefined,
                              outcome: (OUTCOMES.includes(actOutcome as any) ? actOutcome : undefined) as any,
                            });
                            await updateContact.mutateAsync({ id: contact.id, lastContactedAt: new Date() });
                            setActStatus("accepted");
                            toast.success("Activity logged.");
                          } catch { toast.error("Failed to log activity."); }
                          finally { setActSaving(false); }
                        }}
                      >
                        {actSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                        Accept
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs text-muted-foreground"
                        onClick={() => setActStatus("skipped")}
                      >
                        Skip
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-green-500/10 border border-green-500/20 text-xs text-green-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span className="font-medium">Activity logged</span>
                <span className="text-muted-foreground ml-1">{actSubject || actType}</span>
              </div>
            )}

            {/* ── Buyer Interest card (Accept/Skip) — always visible ──────────── */}
            {contact && (
              <Card className={`border-border bg-card border-l-2 ${
                listingStatus === "accepted" ? "border-l-purple-500" :
                listingStatus === "skipped" ? "border-l-slate-600 opacity-50" :
                result.hasListingInterest ? "border-l-amber-500/60" : "border-l-slate-600/40"
              }`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-purple-400" />Buyer Interest
                    {result.hasListingInterest && <span className="font-normal normal-case text-amber-400 text-[10px]">· AI detected interest</span>}
                  </CardTitle>
                </CardHeader>
                {listingStatus !== "accepted" ? (
                  <CardContent className="space-y-1.5">
                    <Select value={selectedListingId} onValueChange={setSelectedListingId}>
                      <SelectTrigger className="h-7 text-xs bg-background border-border"><SelectValue placeholder="Select listing…" /></SelectTrigger>
                      <SelectContent>
                        {listings?.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.title}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    {listingStatus === null && (
                      <div className="flex gap-2 pt-0.5">
                        <Button
                          size="sm"
                          className="flex-1 h-7 text-xs gap-1 bg-purple-600 hover:bg-purple-500"
                          disabled={!selectedListingId || listingSaving}
                          onClick={async () => {
                            if (!contact || !selectedListingId) return;
                            setListingSaving(true);
                            try {
                              await upsertInterest.mutateAsync({
                                listingId: parseInt(selectedListingId),
                                contactId: contact.id,
                                status: "interested",
                                notes: actNotes || text,
                              });
                              setListingStatus("accepted");
                              toast.success("Buyer interest logged.");
                            } catch { toast.error("Failed to log buyer interest."); }
                            finally { setListingSaving(false); }
                          }}
                        >
                          {listingSaving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => setListingStatus("skipped")}
                        >
                          Skip
                        </Button>
                      </div>
                    )}
                  </CardContent>
                ) : (
                  <CardContent className="pb-3">
                    <div className="flex items-center gap-2 text-xs text-purple-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="font-medium">Buyer interest logged</span>
                      <span className="text-muted-foreground">{listings?.find(l => String(l.id) === selectedListingId)?.title}</span>
                    </div>
                  </CardContent>
                )}
              </Card>
            )}

            {/* ── Task cards (Accept/Skip each) ────────────────────────────── */}
            {taskCards.map((tc, i) => (
              <Card key={i} className={`border-border bg-card border-l-2 ${
                tc.status === "accepted" ? "border-l-blue-500" :
                tc.status === "skipped" ? "border-l-slate-600 opacity-50" :
                "border-l-blue-500/40"
              }`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                    <ListChecks className="h-3.5 w-3.5 text-blue-400" />Task {i + 1}
                  </CardTitle>
                </CardHeader>
                {tc.status !== "accepted" ? (
                  <CardContent className="space-y-2">
                    <Input
                      value={tc.title}
                      onChange={(e) => setTaskCards(prev => prev.map((t, j) => j === i ? { ...t, title: e.target.value } : t))}
                      placeholder="Task title"
                      className="h-7 text-xs bg-background border-border"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <Select value={tc.type} onValueChange={(v) => setTaskCards(prev => prev.map((t, j) => j === i ? { ...t, type: v } : t))}>
                        <SelectTrigger className="h-7 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                        <SelectContent>{TASK_TYPES.map(t => <SelectItem key={t} value={t}>{t.replace("_"," ")}</SelectItem>)}</SelectContent>
                      </Select>
                      <Select value={tc.priority} onValueChange={(v) => setTaskCards(prev => prev.map((t, j) => j === i ? { ...t, priority: v } : t))}>
                        <SelectTrigger className="h-7 text-xs bg-background border-border"><SelectValue /></SelectTrigger>
                        <SelectContent>{PRIORITIES.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
                      </Select>
                      <Popover open={tc.calOpen} onOpenChange={(v) => setTaskCards(prev => prev.map((t, j) => j === i ? { ...t, calOpen: v } : t))}>
                        <PopoverTrigger asChild>
                          <Button variant="outline" size="sm" className="h-7 text-xs bg-background border-border gap-1 w-full">
                            <CalendarIcon className="h-3 w-3" />{format(tc.dueDate, "MMM d")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-card border-border">
                          <CalendarComponent mode="single" selected={tc.dueDate}
                            onSelect={(d) => { if (d) setTaskCards(prev => prev.map((t, j) => j === i ? { ...t, dueDate: d, calOpen: false } : t)); }}
                            initialFocus />
                        </PopoverContent>
                      </Popover>
                    </div>
                    {tc.status === null && (
                      <div className="flex gap-2 pt-1">
                        <Button
                          size="sm"
                          className="flex-1 h-7 text-xs gap-1 bg-blue-600 hover:bg-blue-500"
                          disabled={!tc.title.trim() || tc.saving || !contact}
                          onClick={async () => {
                            if (!contact) { toast.error("Link a contact first."); return; }
                            setTaskCards(prev => prev.map((t, j) => j === i ? { ...t, saving: true } : t));
                            try {
                              await createTask.mutateAsync({
                                title: tc.title,
                                type: tc.type as any,
                                priority: tc.priority as any,
                                dueAt: tc.dueDate,
                                contactId: contact.id,
                              });
                              setTaskCards(prev => prev.map((t, j) => j === i ? { ...t, status: "accepted", saving: false } : t));
                              toast.success("Task created.");
                            } catch { toast.error("Failed to create task."); setTaskCards(prev => prev.map((t, j) => j === i ? { ...t, saving: false } : t)); }
                          }}
                        >
                          {tc.saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Accept
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs text-muted-foreground"
                          onClick={() => setTaskCards(prev => prev.map((t, j) => j === i ? { ...t, status: "skipped" } : t))}
                        >
                          Skip
                        </Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-muted-foreground" onClick={() => setTaskCards(prev => prev.filter((_, j) => j !== i))}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </CardContent>
                ) : (
                  <CardContent className="pb-3">
                    <div className="flex items-center gap-2 text-xs text-blue-400">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      <span className="font-medium">Task created</span>
                      <span className="text-muted-foreground truncate">{tc.title}</span>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}

            {/* Add extra task */}
            <Button
              variant="outline"
              size="sm"
              className="w-full h-8 text-xs gap-1.5 border-dashed"
              onClick={() => setTaskCards(prev => [...prev, {
                status: null, saving: false, title: "", type: "follow_up", priority: "medium",
                dueDate: addDays(new Date(), 3), calOpen: false,
              }])}
            >
              <Plus className="h-3.5 w-3.5" /> Add Another Task
            </Button>

            {/* ── Deal Intel on-demand button ──────────────────────────────── */}
            {!isDealIntelLoading && dealIntelCoaching.length === 0 && contact && (
              <Button
                variant="outline"
                size="sm"
                className="w-full h-8 text-xs gap-1.5 border-amber-500/30 text-amber-400 hover:bg-amber-500/10"
                onClick={() => {
                  const _fp = (name: string) => fuzzyMatchProperty(name, properties ?? []);
                  const _fl = (name: string) => { const n = name.toLowerCase(); return (listings ?? []).find(l => { const ln = l.title.toLowerCase(); return ln === n || ln.includes(n) || n.includes(ln); }); };
                  const dp = result?.detectedPropertyName ? _fp(result.detectedPropertyName) : undefined;
                  const dl = result?.detectedListingName ? _fl(result.detectedListingName) : undefined;
                  runDealIntelCoaching(contact.id, overridePropertyId ?? dp?.id ?? null, overrideListingId ?? dl?.id ?? null, text.slice(0, 600));
                }}
              >
                <span className="inline-block w-2 h-2 rounded-full bg-amber-500 mr-0.5"></span>
                Load Deal Intel
              </Button>
            )}
            {!contact && <p className="text-xs text-center text-primary">Link a contact above to start logging.</p>}
          </>
        )}

        {saved && (
          <Card className="border-border bg-card">
            <CardContent className="py-12 flex flex-col items-center gap-3">
              <CheckCircle2 className="h-10 w-10 text-green-400" />
              <p className="font-medium text-foreground">All items saved to CRM!</p>
              <div className="flex gap-2">
                <Link href="/tasks"><Button variant="outline" size="sm">View Tasks</Button></Link>
                {contact && <Link href={`/contacts/${contact.id}`}><Button variant="outline" size="sm">View Contact</Button></Link>}
                <Button size="sm" onClick={resetAll}>Log Another</Button>
              </div>
            </CardContent>
          </Card>
        )}
    </div>
  );
}
