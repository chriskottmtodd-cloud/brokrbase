import { useState, useRef, useEffect } from "react";
import { useSearch } from "wouter";
import { fuzzyMatchProperty } from "@/lib/fuzzyMatch";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { addDays } from "date-fns";
import { Mail, RotateCcw, ExternalLink } from "lucide-react";
import type { ConfirmedContact } from "@/components/ContactConfirmationCard";
import type { PickedContact } from "@/components/ContactSearchPicker";
import { parseLlmJson } from "@/lib/parseLlmJson";
import { stripMarkdown } from "@shared/utils";

import { EditTabInput } from "./EditTabInput";
import { ComposeTabInput } from "./ComposeTabInput";
import { ResultsPanel } from "./ResultsPanel";
import { EditingChat, type ChatMessage } from "./EditingChat";
import { DealResolver, type DealResolution } from "@/components/DealResolver";
import type { CRMAction, EmailAnalysis, ContactMatchStatus } from "./types";

// ─── Style prompt ─────────────────────────────────────────────────────
const STYLE_PROMPT = `You are an email assistant for Chriskott Todd, a commercial real estate investment sales broker at Berkadia Real Estate Advisors in Boise, Idaho, focused on multifamily, MHC, and investment properties across Idaho and Montana.

TWO MODES — detect which one automatically:
1. EDIT MODE: If the input looks like a written email draft (has a greeting, sign-off, or reads like prose meant to be sent), polish and edit it in Chriskott's voice.
2. COMPOSE MODE: If the input is informal notes, bullet points, a description of what to say, or a conversational explanation of the situation — compose a complete email from scratch in Chriskott's voice based on the intent described. Use the background context and any thread history to inform the email.

VOICE & TONE:
- Casual but professional — trusted advisor, not corporate drone.
- Short sentences are preferred, but NEVER sacrifice warmth or necessary context for brevity.
- Fragments are fine when they feel natural.
- Never use: "I hope this email finds you well", "Please don't hesitate", "Best regards", "Touch base" (say "call"), "Going forward", or corporate filler.
- Real estate shorthand used freely: OM, T12, T3, NOI, cap rate, rent roll, BOV, CA, escrow, pro forma.

CONTEXT-AWARE TONE — READ THE SITUATION BEFORE EDITING:
- FIRST INTRODUCTION / NEW RELATIONSHIP: Be warm and welcoming. Keep "thank you for the intro" language. A friendly 2-3 sentence email is correct — do NOT strip it to a 2-word telegram. The goal is a good first impression, not maximum efficiency.
- ONGOING DEAL / OPERATIONAL UPDATE: Be direct and efficient. Lead with the point. Bullets for multiple items.
- DEAL NEGOTIATION / PRICING: Precise and confident. Lead with the number.
- QUICK CHECK-IN: Conversational and brief, but still human.

LENGTH — CRITICAL RULE:
- Match the length and warmth of the original draft UNLESS the user explicitly asks to shorten it.
- If the original is 3 sentences, the edit should be roughly 3 sentences.
- Tighten wording only where it genuinely improves clarity — do NOT cut content just to make it shorter.
- A light polish is often the right answer. When in doubt, preserve the original.

STRUCTURE:
- Greeting: First name only. "Hi [Name]" is fine for intros and warmer emails.
- Write in plain text only — no markdown, no asterisks, no bullet symbols, no pound signs. Use short sentences and line breaks to separate multiple items.
- Always include specific numbers — prices, cap rates, units, occupancy %.
- End with a clear next step or open door for a call.
- Sign-off: Always "Thanks," — never anything else.

EXAMPLE EMAILS:
---
[INTRO EMAIL — warm, brief, friendly — DO NOT compress this style]
Brandon,
Thank you for the intro!
Ben, we would love to set up a time to get on a call. Do you have availability this week?
Thanks,
---
[OPERATIONAL UPDATE — direct, bullets]
Matt,
Thanks for getting that listing agreement signed. I'll get you a copy shortly.
Goal is to launch the week of October 13th. A few things needed:
1. Photos — do you have any, and when can we schedule photography?
2. Any vacant units available for a 360 tour?
3. September numbers ready by next week for the OM?
4. PCR on hand? Not critical, but helpful.
Thanks,
---
[PRICING GUIDANCE — lead with the number]
Hi Scott,
Guiding to $30,000,000 — ~6% cap on T3 income. Positive leverage.
Runs well as a student deal, but proximity to downtown means conversion to traditional rental is realistic. 130 of 161 units are 1BR or studio.
Good time to jump on a call?
Thanks,
---
[QUICK CHECK-IN — conversational]
Hi Craig,
Just checking in on Curtis Meadow closing timing. Sounds like Everbank is working on the loan — any idea on timeline?
Is Spokane still on track?
Give me a call when you get a minute.
Thanks,
---

EDITING RULES (when in EDIT MODE):
1. Fix all typos and grammar.
2. Tighten wording only where it genuinely improves clarity — do NOT cut for the sake of cutting.
3. PRESERVE the original length and warmth unless the user explicitly asks to shorten.
4. Keep the body as plain text — no markdown, no asterisks, no bullet characters. Use short sentences and line breaks only.
5. Keep all specific numbers, deal names, and facts exactly as provided.
6. Sign-off: "Thanks," — nothing after.
7. Do not add information not in the draft. Do not invent details.
8. Only edit the DRAFT — not any prior emails in the thread.
9. If the draft is already in his voice and appropriate for the context, make minimal changes.

COMPOSE RULES (when in COMPOSE MODE):
1. Write a complete email from scratch based on the user's described intent.
2. Use the background context, CRM data, and thread history to inform the content.
3. Match the appropriate tone for the situation (intro, update, negotiation, check-in).
4. Include specific numbers, names, and details from the context — don't be vague.
5. Keep the body as plain text — no markdown, no asterisks, no bullet characters.
6. Sign-off: "Thanks," — nothing after.
7. Do not invent facts not provided in the context or user's notes.`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fuzzyMatch(
  name: string,
  contacts: { id: number; firstName: string; lastName: string; company?: string | null; email?: string | null }[]
): ContactMatchStatus {
  if (!name.trim()) return { status: "unknown" };
  const q = name.trim().toLowerCase();
  const tokens = q.split(/\s+/);

  const scored = contacts.map((c) => {
    const full = `${c.firstName} ${c.lastName}`.toLowerCase();
    let score = 0;
    if (full === q) score = 100;
    else if (c.firstName.toLowerCase() === tokens[0]) score = 60;
    else if (c.lastName.toLowerCase() === (tokens[1] ?? "")) score += 30;
    else if (full.includes(tokens[0])) score = 20;
    return { ...c, score };
  }).filter((c) => c.score > 0).sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { status: "not_found", prefill: { firstName: "", lastName: "", email: "", company: "", phone: "" } };
  if (scored[0].score >= 90) {
    return { status: "found", contact: scored[0] };
  }
  return { status: "not_found", prefill: { firstName: "", lastName: "", email: "", company: "", phone: "" } };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function EmailStudio() {
  const [background,   setBackground]   = useState("");
  const [thread,       setThread]       = useState("");
  const [analysis,     setAnalysis]     = useState<EmailAnalysis | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [copied,       setCopied]       = useState(false);
  const [actions,      setActions]      = useState<CRMAction[]>([]);

  // Contact match
  const [contactMatch,       setContactMatch]       = useState<ContactMatchStatus | null>(null);
  const [resolvedContactId,  setResolvedContactId]  = useState<number | null>(null);
  const [confirmedContact,   setConfirmedContact]   = useState<ConfirmedContact | null>(null);
  const [showNewForm,        setShowNewForm]        = useState(false);
  const [newContact,         setNewContact]         = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", isOwner: false, isBuyer: false });
  const [isCreating,         setIsCreating]         = useState(false);
  const [dupWarning,         setDupWarning]         = useState<Array<{id:number;firstName:string;lastName:string;company?:string|null}>>([]);
  const [confirmedNew,       setConfirmedNew]       = useState(false);
  const [showContactPicker,  setShowContactPicker]  = useState(false);
  const [contactSearch,      setContactSearch]      = useState("");

  // Inline action editing
  const [editingActionIdx,   setEditingActionIdx]   = useState<number | null>(null);
  const [editingAction,      setEditingAction]      = useState<{ label: string; detail: string }>({ label: "", detail: "" });

  // Deal/property override in context bar
  const [overrideDealMentioned,    setOverrideDealMentioned]    = useState<string | null>(null);
  const [showDealPicker,           setShowDealPicker]           = useState(false);
  const [dealPickerSearch,         setDealPickerSearch]         = useState("");

  // Tiered deal resolution (Active Deal Stack)
  const [dealResolution, setDealResolution] = useState<DealResolution | null>(null);
  const resolvePropertyMut = trpc.smartLog.resolvePropertyName.useMutation();

  // Web search coaching
  const [isSearching,      setIsSearching]      = useState(false);
  const [webCoaching,      setWebCoaching]      = useState<string[]>([]);
  const [showOriginal,     setShowOriginal]     = useState(false);

  // Deal intelligence coaching (second pass after contact/deal resolved)
  const [dealIntelCoaching,    setDealIntelCoaching]    = useState<Array<{text: string; source: string}>>([]);
  const [isDealIntelLoading,   setIsDealIntelLoading]   = useState(false);
  const [dealIntelContactId,   setDealIntelContactId]   = useState<number | null>(null);
  const [dealIntelPropertyId,  setDealIntelPropertyId]  = useState<number | null>(null);
  const [dealIntelListingId,   setDealIntelListingId]   = useState<number | null>(null);

  // Tone selector & original draft tracking
  const [tone,             setTone]             = useState<"tight" | "balanced" | "conversational">("balanced");
  const [originalDraft,    setOriginalDraft]    = useState<string>("");

  // Market intel for the currently matched property
  const [marketIntelPropertyMarketId, setMarketIntelPropertyMarketId] = useState<number | null>(null);
  const { data: marketIntelData } = trpc.marketIntel.getForPropertyById.useQuery(
    { marketId: marketIntelPropertyMarketId! },
    { enabled: marketIntelPropertyMarketId != null }
  );

  // Data
  const { data: contacts }  = trpc.contacts.list.useQuery({ limit: 2000 });
  const { data: properties } = trpc.properties.list.useQuery({ limit: 10000 });
  const { data: listings }   = trpc.listings.list.useQuery({});

  // ─── URL query-param seeding (contextual launch) ────────────────────────────
  const search = useSearch();
  const urlParams = new URLSearchParams(search);
  const urlContactId = urlParams.get("contactId") ? parseInt(urlParams.get("contactId")!) : null;
  const urlPropertyId = urlParams.get("propertyId") ? parseInt(urlParams.get("propertyId")!) : null;
  const urlListingId = urlParams.get("listingId") ? parseInt(urlParams.get("listingId")!) : null;

  // ─── Tab state ───────────────────────────────────────────────────────────────
  const hasContactParam = !!urlContactId;
  const [activeTab, setActiveTab] = useState<"compose" | "edit">(hasContactParam ? "compose" : "edit");

  // ─── Compose-specific state ──────────────────────────────────────────────────
  const [composeContact, setComposeContact] = useState<PickedContact | null>(null);
  const [composePropertySearch, setComposePropertySearch] = useState("");
  const [composePropertyId, setComposePropertyId] = useState<number | null>(urlPropertyId);
  const [composeListingId, setComposeListingId] = useState<number | null>(urlListingId);
  const [composeIntent, setComposeIntent] = useState("");
  const [isComposing, setIsComposing] = useState(false);

  const hasSeededFromUrl = useRef(false);
  useEffect(() => {
    if (hasSeededFromUrl.current) return;
    if (!urlContactId && !urlPropertyId && !urlListingId) return;
    if ((urlContactId && !contacts) || (urlPropertyId && !properties) || (urlListingId && !listings)) return;

    hasSeededFromUrl.current = true;

    const bgParts: string[] = [];

    if (urlContactId && contacts) {
      const c = contacts.find((ct: any) => ct.id === urlContactId);
      if (c) {
        setResolvedContactId(c.id);
        setConfirmedContact({
          id: c.id, firstName: c.firstName, lastName: c.lastName,
          email: c.email, phone: c.phone, company: c.company,
          isOwner: c.isOwner, isBuyer: c.isBuyer,
        });
        setDealIntelContactId(c.id);

        const roles = [c.isOwner && "Owner", c.isBuyer && "Buyer"].filter(Boolean).join(", ");
        bgParts.push(`Contact: ${c.firstName} ${c.lastName}${c.company ? ` (${c.company})` : ""}${roles ? ` — ${roles}` : ""}${c.priority ? ` | Priority: ${c.priority}` : ""}`);
        if (c.notes) bgParts.push(`Notes: ${c.notes}`);
      }
    }
    if (urlPropertyId && properties) {
      const p = properties.find((pr: any) => pr.id === urlPropertyId);
      if (p) {
        setOverrideDealMentioned(p.name);
        setDealIntelPropertyId(urlPropertyId);

        const details = [
          p.propertyType && p.propertyType.toUpperCase(),
          p.unitCount && `${p.unitCount} units`,
          p.city && p.city,
          p.state && p.state,
        ].filter(Boolean).join(" · ");
        bgParts.push(`Property: ${p.name}${details ? ` (${details})` : ""}`);
      }
    }
    if (urlListingId && listings) {
      const l = listings.find((ls: any) => ls.id === urlListingId);
      if (l) {
        setDealIntelListingId(urlListingId);
        if (!urlPropertyId) {
          setOverrideDealMentioned(l.propertyName ?? l.title);
        }
        bgParts.push(`Listing: ${l.title}${l.askingPrice ? ` — $${Number(l.askingPrice).toLocaleString()}` : ""}${l.stage ? ` | Stage: ${l.stage}` : ""}`);
      }
    }

    if (bgParts.length > 0) {
      setBackground(bgParts.join("\n"));
    }
  }, [contacts, properties, listings, urlContactId, urlPropertyId, urlListingId]);

  // Seed compose contact from URL param
  const hasSeededCompose = useRef(false);
  useEffect(() => {
    if (hasSeededCompose.current || !urlContactId || !contacts) return;
    hasSeededCompose.current = true;
    const c = contacts.find((ct: any) => ct.id === urlContactId);
    if (c) {
      setComposeContact({
        id: c.id, firstName: c.firstName, lastName: c.lastName,
        company: c.company, phone: c.phone, isOwner: c.isOwner, isBuyer: c.isBuyer,
        priority: c.priority, lastContactedAt: c.lastContactedAt,
      });
    }
  }, [contacts, urlContactId]);

  // Deal context query for compose mode
  const dealContextQuery = trpc.callIntel.getDealContext.useQuery(
    {
      propertyId: composePropertyId ?? undefined,
      listingId: composeListingId ?? undefined,
      recipientContactId: composeContact?.id ?? undefined,
    },
    { enabled: activeTab === "compose" && !!(composePropertyId || composeListingId) }
  );

  const invokeLlmMutation = trpc.callIntel.invokeLlm.useMutation();
  const invokeLlmRef = useRef(invokeLlmMutation.mutateAsync);
  invokeLlmRef.current = invokeLlmMutation.mutateAsync;

  // Deal intelligence context — fetched lazily when contact + deal are resolved
  const trpcUtils = trpc.useUtils();

  async function runDealIntelCoaching(contactId: number | null, propertyId: number | null, listingId: number | null, emailContext: string) {
    if (!contactId && !propertyId && !listingId) return;
    setIsDealIntelLoading(true);
    try {
      const [intel, narrative] = await Promise.all([
        trpcUtils.callIntel.getDealIntelligenceContext.fetch({
          contactId:  contactId  ?? undefined,
          propertyId: propertyId ?? undefined,
          listingId:  listingId  ?? undefined,
        }),
        propertyId
          ? trpcUtils.callIntel.getDealNarrative.fetch({ propertyId }).catch(() => null)
          : Promise.resolve(null),
      ]);

      const lines: string[] = [];
      if (narrative) {
        lines.push(`DEAL NARRATIVE (AI-maintained summary, last updated ${narrative.updatedAt ? new Date(narrative.updatedAt).toLocaleDateString() : "unknown"}):\n${narrative.summary}`);
        if (narrative.nextSteps) lines.push(`Next Steps: ${narrative.nextSteps}`);
        if (narrative.blockers) lines.push(`Blockers: ${narrative.blockers}`);
        lines.push("---");
      }
      if (intel.contactName)      lines.push(`Contact: ${intel.contactName}${intel.contactCompany ? " (" + intel.contactCompany + ")" : ""}`);
      if (intel.dealRole)         lines.push(`Their role on this deal: ${intel.dealRole.replace(/_/g, " ")}`);
      if (intel.daysSinceContact !== null) lines.push(`Days since last contact: ${intel.daysSinceContact}`);
      if (intel.totalInteractions > 0) lines.push(`Total logged interactions: ${intel.totalInteractions}`);
      if (intel.activitySummary.length > 0) lines.push(`Recent activity:\n${intel.activitySummary.map(a => "  - " + a).join("\n")}`);
      if (intel.isDualRole)       lines.push(`Note: This contact is both a buyer AND a property owner — potential trade candidate.`);
      if (intel.otherDeals.length > 0) lines.push(`Other deals they're linked to: ${intel.otherDeals.join(", ")}`);
      if (intel.buyerCriteria)    lines.push(`Buyer criteria: ${JSON.stringify(intel.buyerCriteria)}`);
      if (intel.propertyName)     lines.push(`Property: ${intel.propertyName} (${intel.propertyCity ?? ""}, ${intel.propertyUnitCount ?? "?"}u, status: ${intel.propertyStatus ?? "unknown"})`);
      if (intel.propertyOffMarket) lines.push(`Off-market interest: owner has indicated willingness to sell (${intel.propertyOffMarketConf ?? "interested"})`);
      if (intel.propertyNotes)    lines.push(`Property notes: ${intel.propertyNotes.slice(0, 300)}`);
      if (intel.listingTitle)     lines.push(`Listing: ${intel.listingTitle} (stage: ${intel.listingStage}, ${intel.listingUnitCount ?? "?"}u, $${intel.listingPrice ? (intel.listingPrice / 1_000_000).toFixed(1) + "M" : "TBD"})`);
      if (intel.listingNotes)     lines.push(`Broker notes on listing: ${intel.listingNotes.slice(0, 300)}`);
      if (intel.contactNotes)     lines.push(`Contact notes: ${intel.contactNotes.slice(0, 200)}`);

      if (lines.length === 0) { setIsDealIntelLoading(false); return; }

      const intelBlock = lines.join("\n");
      const prompt = `You are a senior commercial real estate broker coaching a junior broker on a specific email.

DEAL INTELLIGENCE FROM CRM:
${intelBlock}

EMAIL CONTEXT:
${emailContext.slice(0, 800)}

Based on this specific CRM data, generate 3-5 highly personalized coaching points. Each point must reference specific details from the CRM data above — names, dates, deal stages, roles, history. Do NOT give generic advice. Think like a senior broker who knows this contact and deal intimately.

Return ONLY a JSON array:
[{"text": "specific coaching point referencing CRM data", "source": "crm"}]
No markdown, no backticks.`;

      const raw = await callClaude(prompt, 800);
      const points = parseLlmJson<Array<{text: string; source: string}>>(raw);
      setDealIntelCoaching(points);
    } catch (err) {
      console.error("Deal intel coaching failed:", err);
    } finally {
      setIsDealIntelLoading(false);
    }
  }

  async function callClaude(prompt: string, maxTokens = 1500): Promise<string> {
    const result = await invokeLlmRef.current({ prompt, maxTokens });
    return result.text;
  }

  const studioUtils = trpc.useUtils();
  const createContactLink = trpc.contactLinks.create.useMutation();
  const detectContactMutation = trpc.contactEmails.detectFromThread.useMutation();
  const detectContactRef = useRef(detectContactMutation.mutateAsync);
  detectContactRef.current = detectContactMutation.mutateAsync;

  // Helper: auto-tag a contact with any property/listing context from the current analysis
  function autoTagContact(contactId: number) {
    const effectiveDeal = overrideDealMentioned ?? analysis?.dealMentioned;
    if (!effectiveDeal) return;
        const _fuzzyP = (n: string) => { const q = n.toLowerCase(); return (properties ?? []).find(p => { const pn = p.name.toLowerCase(); return pn === q || pn.includes(q) || q.includes(pn); }); };
        const _fuzzyL = (n: string) => { const q = n.toLowerCase(); return (listings ?? []).find(l => { const ln = l.title.toLowerCase(); return ln === q || ln.includes(q) || q.includes(ln); }); };
        const matchedProperty = effectiveDeal ? _fuzzyP(effectiveDeal) : undefined;
        const matchedListing  = effectiveDeal ? _fuzzyL(effectiveDeal) : undefined;
        // Pre-select listing in buyer card if found
        if (matchedListing) setBuyerListingId(String(matchedListing.id));
    // Load market intel if the property has a market assigned
    if (matchedProperty?.marketId) setMarketIntelPropertyMarketId(matchedProperty.marketId);
    if (matchedProperty) {
      createContactLink.mutate({
        contactId,
        propertyId: matchedProperty.id,
        source: "email_studio",
        label: `Email Studio — ${effectiveDeal}`,
      });
    } else if (matchedListing) {
      createContactLink.mutate({
        contactId,
        listingId: matchedListing.id,
        source: "email_studio",
        label: `Email Studio — ${effectiveDeal}`,
      });
    }
  }

  const createContact = trpc.contacts.create.useMutation({
    onSuccess: (c) => {
      studioUtils.contacts.list.invalidate();
      autoTagContact(c.id);
      toast.success(
        <span className="flex items-center gap-2">
          {c.firstName} {c.lastName} added to CRM.
          <a
            href={`/contacts/${c.id}`}
            target="_blank"
            rel="noreferrer"
            className="underline text-primary font-medium flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        </span>
      );
      setResolvedContactId(c.id);
      setShowNewForm(false);
      setIsCreating(false);
    },
    onError: (e) => { toast.error(e.message); setIsCreating(false); },
  });

  // Mutations for wiring Accept button to real DB writes
  const createTask       = trpc.tasks.create.useMutation();
  const createActivity   = trpc.activities.create.useMutation();
  const updateContact    = trpc.contacts.update.useMutation();
  const updateProperty   = trpc.properties.update.useMutation();
  const updateListing    = trpc.listings.update.useMutation();
  const refreshNotes     = trpc.contacts.refreshNotes.useMutation();
  const createDealAct    = trpc.listings.createDealActivity.useMutation();
  const upsertInterest   = trpc.listings.upsertBuyerInterest.useMutation();

  // Buyer card state (Add as Buyer to Listing)
  const [buyerCardOpen,      setBuyerCardOpen]      = useState(false);
  const [buyerListingId,     setBuyerListingId]     = useState("");
  const [buyerCardSaved,     setBuyerCardSaved]     = useState(false);
  const [isSavingBuyer,      setIsSavingBuyer]      = useState(false);

  // ── Process ─────────────────────────────────────────────────────────────────
  async function process() {
    if (!thread.trim()) { toast.error("Paste your draft and thread first."); return; }
    setIsProcessing(true);
    setAnalysis(null);
    setContactMatch(null);
    setResolvedContactId(null);
    setWebCoaching([]);
    setDealIntelCoaching([]);
    setIsDealIntelLoading(false);
    setDealIntelContactId(null); setDealIntelPropertyId(null); setDealIntelListingId(null);
    setShowNewForm(false);
    setShowContactPicker(false);
    setContactSearch("");
    setEditingActionIdx(null);
    setActions([]);
    setBuyerCardOpen(false);
    setBuyerListingId("");
    setBuyerCardSaved(false);

    // Capture the user's original draft (everything before the first "From:" line)
    const draftOnly = thread.split(/\n(?=From:|_{10,})/)[0].trim();
    setOriginalDraft(draftOnly);

    try {
      const contactCtx  = contacts?.map((c) => `${c.firstName} ${c.lastName}${c.company ? " (" + c.company + ")" : ""}`).join(", ") ?? "";
      const propertyCtx = properties?.map((p) => {
        const parts = [`${p.name} (${p.city ?? ""}, ${p.unitCount ?? "?"}u, ${p.status})`];
        if (p.offMarketInterest) {
          const conf = p.offMarketConfidence === "casual_mention" ? "casual mention" :
                       p.offMarketConfidence === "serious_interest" ? "serious interest" :
                       p.offMarketConfidence === "actively_exploring" ? "actively exploring" : "interested";
          parts.push(`off-market: owner indicated willingness to sell (${conf}${p.offMarketTimeline ? ", " + p.offMarketTimeline : ""})`);
        }
        return parts.join(" — ");
      }).join(" | ") ?? "";
      const listingCtx  = listings?.map((l) => {
        const sellerNames = (l as any).sellers?.map((s: any) => `${s.firstName} ${s.lastName}`).join(", ");
        return `${l.title} (stage:${l.stage}, ${l.unitCount ?? "?"}u, $${l.askingPrice ? (l.askingPrice / 1_000_000).toFixed(1) + "M" : "TBD"}${sellerNames ? ", sellers: " + sellerNames : ""})`;
      }).join(" | ") ?? "";

      const contactHistoryNote = contacts && contacts.length > 0
        ? `You have ${contacts.length} contacts in the CRM. Cross-reference the sender against this list.`
        : "";

      const toneInstruction = tone === "tight"
        ? "TONE MODE: TIGHT — Be maximally direct and concise. Cut every unnecessary word."
        : tone === "conversational"
        ? "TONE MODE: CONVERSATIONAL — Be warm and natural. Preserve the full length and friendliness of the original. Do not compress."
        : "TONE MODE: BALANCED — Use good judgment based on the context. Preserve length and warmth unless the original is genuinely wordy.";

      const prompt = `${STYLE_PROMPT}

${toneInstruction}

---
CRM CONTACTS: ${contactCtx.slice(0, 1200)}
CRM PROPERTIES: ${propertyCtx.slice(0, 1000)}
ACTIVE LISTINGS: ${listingCtx.slice(0, 800)}
${contactHistoryNote}
${background.trim() ? `\nBACKGROUND / CONTEXT FROM USER:\n${background.trim()}\n` : ""}
---

USER INPUT (this may be a polished draft to edit, OR informal notes/instructions describing what email to compose — detect which and respond accordingly; everything after the first "From:" line or "---" separator is prior conversation for context only):
${thread}

---

Return ONLY valid JSON (no markdown, no backticks):
{
  "editedEmail": "the polished/composed email in Chriskott's voice (edited draft if edit mode, freshly composed if compose mode)",
  "contextSummary": "1-2 sentence CRM summary of what this thread is about",
  "senderFirstName": "first name of person being emailed",
  "senderLastName": "last name if visible, else empty string",
  "senderEmail": "sender email address if visible in thread, else empty string",
  "senderCompany": "company name if visible, else empty string",
  "senderPhone": "phone if visible in signature, else empty string",
  "dealMentioned": "property or listing name mentioned, else empty string",
  "coachingPoints": [
    {
      "text": "specific coaching suggestion — reference real CRM data, deal specifics, or strategic advice",
      "source": "crm | market | strategy"
    }
  ],
  "suggestedActions": [
    {
      "type": "add_task | log_activity | update_contact | update_property | update_listing",
      "label": "short action title",
      "detail": "specific detail",
      "contactName": "full name or empty string",
      "propertyName": "property name or empty string",
      "listingName": "listing title or empty string",
      "listingStage": "new stage if changing, else empty string",
      "listingNotes": "for update_listing: a concise note about the deal update (fee change, price adjustment, new terms, etc.) to save as broker notes — empty string if no deal update",
      "askingPrice": 0,
      "capRate": 0
    }
  ]
}

For update_listing actions: always populate listingNotes with a concise summary of what changed (e.g. "Fee adjusted to 2.5% per email discussion Mar 10"). If a price or cap rate was mentioned, populate askingPrice or capRate. Use 0 to mean "no change" for numeric fields.

For coachingPoints: generate 3-6 specific, useful points. Use CRM data (known properties, listings, contact history) where relevant. Think like a senior broker coaching a junior on this exact email — what would they point out? Flag deal intel, relationship context, pricing angles, missing info to gather, or strategic positioning. Mark source as "crm" if referencing CRM data, "market" for market knowledge, "strategy" for tactical advice.

For suggestedActions: generate as many or few as genuinely useful. Do not force suggestions.`;

      const raw  = await callClaude(prompt, 1800);
      const parsed = parseLlmJson<EmailAnalysis>(raw);
      parsed.suggestedActions = (parsed.suggestedActions ?? []).map((a) => ({ ...a, accepted: false, dismissed: false }));
      parsed.coachingPoints   = parsed.coachingPoints ?? [];

      setAnalysis(parsed);
      setActions(parsed.suggestedActions);

      // AI-powered primary contact detection (runs in background after analysis completes)
      setNewContact((n) => ({
        ...n,
        firstName: parsed.senderFirstName || n.firstName,
        lastName:  parsed.senderLastName  || n.lastName,
        email:     parsed.senderEmail     || n.email,
        company:   parsed.senderCompany   || n.company,
        phone:     parsed.senderPhone     || n.phone,
      }));
      setContactMatch({ status: "unknown" });
      detectContactRef.current({
        thread: thread.slice(0, 4000),
        background: background.trim() || undefined,
        senderEmail: parsed.senderEmail || undefined,
      }).then((detection) => {
        setNewContact((n) => ({
          ...n,
          firstName: detection.primaryContactName?.split(" ")[0] || n.firstName,
          lastName:  detection.primaryContactName?.split(" ").slice(1).join(" ") || n.lastName,
          email:     detection.primaryContactEmail || n.email,
          company:   detection.primaryContactCompany || n.company,
          phone:     detection.primaryContactPhone || n.phone,
        }));
        if (detection.matchedContact) {
          const selReason: "email_match" | "name_match" = detection.primaryContactEmail && detection.matchedContact.email
            ? "email_match"
            : "name_match";
          setContactMatch({ status: "found", contact: detection.matchedContact, selectionReason: selReason });
          setConfirmedContact(detection.matchedContact);
          if (detection.confidence === "high") {
            setResolvedContactId(detection.matchedContact.id);
          }
          const dealName = overrideDealMentioned ?? parsed.dealMentioned;
          const _fzP = (n: string) => { const q = n.toLowerCase(); return (properties ?? []).find(p => { const pn = p.name.toLowerCase(); return pn === q || pn.includes(q) || q.includes(pn); }); };
          const _fzL = (n: string) => { const q = n.toLowerCase(); return (listings ?? []).find(l => { const ln = l.title.toLowerCase(); return ln === q || ln.includes(q) || q.includes(ln); }); };
          const matchedProperty = dealName ? _fzP(dealName) : undefined;
          const matchedListing  = dealName ? _fzL(dealName) : undefined;
          setDealIntelContactId(detection.matchedContact.id);
          setDealIntelPropertyId(matchedProperty?.id ?? null);
          setDealIntelListingId(matchedListing?.id ?? null);
          if (matchedProperty?.marketId) setMarketIntelPropertyMarketId(matchedProperty.marketId);

          // Tiered resolution via Active Deal Stack (runs in background)
          if (dealName && !matchedProperty) {
            resolvePropertyMut.mutateAsync({ name: dealName }).then((res) => {
              setDealResolution({
                detectedPropertyId: res.match?.property.id ?? null,
                detectedPropertyName: dealName,
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
              // Auto-set if high confidence
              if (res.match && res.match.confidence === "high") {
                setDealIntelPropertyId(res.match.property.id);
                setOverrideDealMentioned(res.match.property.name);
              }
            }).catch(() => { /* fall through */ });
          }
        } else {
          setContactMatch({
            status: "not_found",
            prefill: {
              firstName: detection.primaryContactName?.split(" ")[0] || parsed.senderFirstName || "",
              lastName:  detection.primaryContactName?.split(" ").slice(1).join(" ") || parsed.senderLastName || "",
              email:     detection.primaryContactEmail || parsed.senderEmail || "",
              company:   detection.primaryContactCompany || parsed.senderCompany || "",
              phone:     detection.primaryContactPhone || parsed.senderPhone || "",
            },
          });
        }
      }).catch(() => {
        const fullName = `${parsed.senderFirstName} ${parsed.senderLastName}`.trim();
        if (fullName && contacts) {
          const match = fuzzyMatch(fullName, contacts);
          if (match.status === "not_found") {
            match.prefill.firstName = parsed.senderFirstName;
            match.prefill.lastName  = parsed.senderLastName;
            match.prefill.email     = parsed.senderEmail;
            match.prefill.company   = parsed.senderCompany;
            match.prefill.phone     = parsed.senderPhone;
          }
          setContactMatch(match);
        } else {
          setContactMatch({ status: "unknown" });
        }
      });
    } catch (err) {
      console.error(err);
      toast.error("Something went wrong. Check your draft and try again.");
    } finally {
      setIsProcessing(false);
    }
  }

  // ── Web search coaching ──────────────────────────────────────────────────────
  async function runWebSearch() {
    if (!analysis) return;
    setIsSearching(true);
    try {
      const topic = (overrideDealMentioned ?? analysis.dealMentioned) || analysis.contextSummary || "multifamily real estate Idaho Montana";
      const prompt = `You are a commercial real estate market intelligence assistant.

The broker is working on an email about: ${topic}
Context: ${analysis.contextSummary}

Based on your knowledge of multifamily real estate markets in Idaho and Montana, provide 3-4 specific, current market intelligence points that would make this broker look well-informed. Focus on:
- Cap rate trends in relevant markets
- Notable transactions or market activity
- Economic drivers (employment, population, development)
- Anything that adds credibility to a broker response on this topic

Be specific and factual. Format as a JSON array of strings: ["point 1", "point 2", "point 3"]
Return only the JSON array, no markdown.`;

      const raw    = await callClaude(prompt, 600);
      const points = parseLlmJson<string[]>(raw);
      setWebCoaching(points);
      toast.success("Market intel added.");
    } catch {
      toast.error("Search failed — try again.");
    } finally {
      setIsSearching(false);
    }
  }

  // ── Actions ──────────────────────────────────────────────────────────────────
  function getActiveContactId(): number | null {
    if (resolvedContactId) return resolvedContactId;
    if (contactMatch?.status === "found") return contactMatch.contact.id;
    return null;
  }

  async function acceptAction(idx: number) {
    const action = actions[idx];
    if (!action) return;

    try {
      if (action.type === "add_task") {
        const contactId = getActiveContactId() ?? undefined;
        const propertyId = action.propertyName
          ? fuzzyMatchProperty(action.propertyName, properties ?? [])?.id
          : undefined;
        await createTask.mutateAsync({
          title:       action.label || "Follow-up task",
          description: action.detail || undefined,
          type:        "follow_up",
          priority:    "medium",
          contactId,
          propertyId,
          dueAt:       action.dueDate ?? addDays(new Date(), 1),
        });
        toast.success(`Task created: "${action.label || "Follow-up task"}".`);

      } else if (action.type === "log_activity") {
        const contactId = getActiveContactId() ?? undefined;
        const propertyId = action.propertyName
          ? fuzzyMatchProperty(action.propertyName, properties ?? [])?.id
          : undefined;
        const effectiveDeal = action.listingName || overrideDealMentioned || analysis?.dealMentioned || "";
        const resolvedListing = effectiveDeal
          ? (() => { const q = effectiveDeal.toLowerCase(); return (listings ?? []).find(l => { const ln = l.title.toLowerCase(); return ln === q || ln.includes(q) || q.includes(ln); }); })()
          : undefined;
        await createActivity.mutateAsync({
          type:      "email",
          direction: "outbound",
          contactId,
          propertyId,
          listingId: resolvedListing?.id,
          subject:   action.label || "Email",
          notes:     action.detail || undefined,
        });
        if (resolvedListing) {
          const noteText = action.detail || action.label || "Email logged from Email Studio";
          createDealAct.mutate({
            listingId: resolvedListing.id,
            type: "note",
            summary: noteText,
          });
        }
        toast.success(`Activity logged: "${action.label || "Email"}"${resolvedListing ? ` · saved to listing "${resolvedListing.title}"` : ""}.`);

      } else if (action.type === "update_contact") {
        const contactId = getActiveContactId();
        if (!contactId) {
          toast.error("No contact linked — resolve the contact first.");
          return;
        }
        const newContext = [action.label, action.detail].filter(Boolean).join(" — ");
        await refreshNotes.mutateAsync({ contactId, newContext });
        toast.success(`Contact notes updated: "${action.label}".`);

      } else if (action.type === "update_property") {
        const prop = action.propertyName
          ? fuzzyMatchProperty(action.propertyName, properties ?? [])
          : null;
        if (!prop) {
          toast.error("Could not find the property to update — check the property name.");
          return;
        }
        await updateProperty.mutateAsync({
          id:    prop.id,
          notes: action.detail || undefined,
        });
        toast.success(`Property updated: "${prop.name}".`);

      } else if (action.type === "update_listing") {
        const listing = action.listingName
          ? (() => { const q = action.listingName.toLowerCase(); return (listings ?? []).find(l => { const ln = l.title.toLowerCase(); return ln === q || ln.includes(q) || q.includes(ln); }); })()
          : null;
        if (!listing) {
          toast.error("Could not find the listing to update — check the listing name.");
          return;
        }
        const updatePayload: Record<string, unknown> = { id: listing.id };
        const validStages = ["new", "active", "under_contract", "closed", "withdrawn", "expired"];
        if (action.listingStage && validStages.includes(action.listingStage)) {
          updatePayload.stage = action.listingStage;
        }
        if (action.askingPrice && action.askingPrice > 0) updatePayload.askingPrice = action.askingPrice;
        if (action.capRate && action.capRate > 0) updatePayload.capRate = action.capRate;
        if (action.listingNotes) {
          const dateStr = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
          const existingNotes = (listing as Record<string, unknown>).brokerNotes as string | null | undefined;
          const newNotes = existingNotes
            ? `${existingNotes}\n\n[${dateStr}] ${action.listingNotes}`
            : `[${dateStr}] ${action.listingNotes}`;
          updatePayload.brokerNotes = newNotes;
        }
        await updateListing.mutateAsync(updatePayload as Parameters<typeof updateListing.mutateAsync>[0]);
        const changes: string[] = [];
        if (updatePayload.stage) changes.push(`stage → ${String(updatePayload.stage).replace(/_/g, " ")}`);
        if (updatePayload.askingPrice) changes.push(`price → $${Number(updatePayload.askingPrice).toLocaleString()}`);
        if (updatePayload.capRate) changes.push(`cap rate → ${updatePayload.capRate}%`);
        if (updatePayload.brokerNotes) changes.push("broker notes updated");
        toast.success(`Listing "${listing.title}" updated${changes.length ? ": " + changes.join(", ") : ""}.`);
        if (action.listingNotes) {
          const actSummaryLower = action.listingNotes.toLowerCase();
          const dealActType = actSummaryLower.includes("loi") || actSummaryLower.includes("letter of intent")
            ? "loi"
            : actSummaryLower.includes("offer")
              ? "offer"
              : updatePayload.stage
                ? "stage_change"
                : updatePayload.askingPrice || updatePayload.capRate
                  ? "price_change"
                  : "note";
          createDealAct.mutate({
            listingId: listing.id,
            type: dealActType as any,
            summary: action.listingNotes,
          });
        }
      }

      setActions((prev) => prev.map((a, i) => i === idx ? { ...a, accepted: true, dismissed: false } : a));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to apply action: ${msg}`);
    }
  }
  function dismissAction(idx: number) {
    setActions((prev) => prev.map((a, i) => i === idx ? { ...a, dismissed: true } : a));
  }

  function copyEmail() {
    if (!analysis?.editedEmail) return;
    navigator.clipboard.writeText(analysis.editedEmail);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function reset() {
    setBackground(""); setThread(""); setAnalysis(null); setActions([]);
    setOverrideDealMentioned(null); setShowDealPicker(false); setDealPickerSearch("");
    setContactMatch(null); setResolvedContactId(null); setWebCoaching([]);
    setShowNewForm(false); setShowOriginal(false);
    setChatMessages([]); setChatInput(""); setCurrentDraft(null);
    setDupWarning([]); setConfirmedNew(false);
    setDealIntelCoaching([]); setIsDealIntelLoading(false);
    setDealIntelContactId(null); setDealIntelPropertyId(null); setDealIntelListingId(null);
    setComposeContact(null); setComposeIntent(""); setComposePropertyId(null); setComposeListingId(null);
  }

  // ── Compose mode ─────────────────────────────────────────────────────────────
  async function composeEmail() {
    if (!composeIntent.trim()) { toast.error("Describe what you want the email to say."); return; }
    if (!composeContact) { toast.error("Select a contact to email."); return; }

    setIsComposing(true);
    setAnalysis(null);
    setActions([]);
    setChatMessages([]);
    setCurrentDraft(null);

    try {
      const dc = dealContextQuery.data;
      const toneInstruction = tone === "tight"
        ? "TONE MODE: TIGHT — Be maximally direct and concise. Cut every unnecessary word."
        : tone === "conversational"
        ? "TONE MODE: CONVERSATIONAL — Be warm and natural. Preserve the full length and friendliness."
        : "TONE MODE: BALANCED — Use good judgment based on the context.";

      let narrativeBlock = "";
      if (dc?.narrative) {
        narrativeBlock = `DEAL NARRATIVE (AI-maintained summary, last updated ${dc.narrative.updatedAt ? new Date(dc.narrative.updatedAt).toLocaleDateString() : "unknown"}):\n${dc.narrative.summary}\n\nSeller Motivation: ${dc.narrative.sellerMotivation ?? "Unknown"}\nPricing: ${dc.narrative.pricingStatus ?? "Unknown"}\nBuyer Activity: ${dc.narrative.buyerActivity ?? "Unknown"}\nBlockers: ${dc.narrative.blockers ?? "Unknown"}\nNext Steps: ${dc.narrative.nextSteps ?? "Unknown"}\n`;
      }

      let activitiesBlock = "";
      if (dc?.recentActivities && dc.recentActivities.length > 0) {
        activitiesBlock = "RECENT INTERACTIONS ON THIS DEAL:\n" + dc.recentActivities.map((a: any) => {
          const date = a.occurredAt ? new Date(a.occurredAt).toLocaleDateString() : "?";
          const name = [a.contactFirstName, a.contactLastName].filter(Boolean).join(" ") || "Unknown";
          return `- [${date}] ${a.type} with ${name}: ${a.summary || a.notes || "(no notes)"}`;
        }).join("\n") + "\n";
      }

      let recipientBlock = `RECIPIENT CONTEXT:\n- Name: ${composeContact.firstName} ${composeContact.lastName}`;
      if (composeContact.company) recipientBlock += `\n- Company: ${composeContact.company}`;
      if (composeContact.isOwner) recipientBlock += `\n- Role: Owner`;
      if (composeContact.isBuyer) recipientBlock += `\n- Role: Buyer`;
      if (dc?.buyerCriteria) {
        const bc = dc.buyerCriteria;
        recipientBlock += `\n- Buyer Criteria: ${bc.propertyTypes ?? "any type"}, ${bc.minUnits ?? "?"}-${bc.maxUnits ?? "?"} units, $${bc.minPrice ?? "?"}-$${bc.maxPrice ?? "?"}, markets: ${bc.markets ?? "any"}`;
      }

      let propertyBlock = "";
      if (dc?.property) {
        const p = dc.property;
        propertyBlock = `PROPERTY CONTEXT:\n- Name: ${p.name}\n- Location: ${p.city ?? "?"}, ${p.state ?? "ID"}\n- Type: ${p.propertyType}, ${p.unitCount ?? "?"} units\n- Status: ${p.status}\n- Financials: Est. value $${p.estimatedValue ?? "Unknown"}, Cap rate ${p.capRate ?? "?"}%, NOI $${p.noi ?? "Unknown"}`;
        if (p.offMarketInterest) propertyBlock += `\n- Off-market interest: ${p.offMarketConfidence ?? "interested"} — ${p.offMarketNotes ?? ""}`;
        propertyBlock += "\n";
      }

      let listingBlock = "";
      if (dc?.listing) {
        const l = dc.listing;
        listingBlock = `LISTING CONTEXT:\n- Stage: ${l.stage}\n- Asking: $${l.askingPrice ?? "TBD"}\n- Broker Notes: ${l.brokerNotes ?? "none"}\n`;
      }

      const prompt = `${STYLE_PROMPT}

${toneInstruction}

---
${narrativeBlock}
${activitiesBlock}
${recipientBlock}

${propertyBlock}
${listingBlock}
---

BROKER'S INTENT (what Chriskott wants this email to say):
${composeIntent}

---

Compose a complete email from Chriskott to ${composeContact.firstName} based on the intent above.
Use the deal narrative, recent interactions, and CRM context to include specific details,
numbers, and references to real conversations. Do NOT invent facts not present in the context.

Return ONLY valid JSON (no markdown, no backticks):
{
  "editedEmail": "the complete composed email",
  "contextSummary": "1-2 sentence summary of what this email is about",
  "senderFirstName": "${composeContact.firstName}",
  "senderLastName": "${composeContact.lastName}",
  "senderEmail": "",
  "senderCompany": "${composeContact.company ?? ""}",
  "senderPhone": "",
  "dealMentioned": "${dc?.property?.name ?? dc?.listing?.title ?? ""}",
  "coachingPoints": [
    {"text": "specific coaching point referencing CRM data", "source": "crm"}
  ],
  "suggestedActions": [
    {
      "type": "log_activity",
      "label": "Log outbound email to ${composeContact.firstName}",
      "detail": "Email composed via Email Studio about ${dc?.property?.name ?? "deal"}",
      "contactName": "${composeContact.firstName} ${composeContact.lastName}",
      "propertyName": "${dc?.property?.name ?? ""}",
      "listingName": "",
      "listingStage": "",
      "listingNotes": "",
      "askingPrice": 0,
      "capRate": 0
    }
  ]
}

For coachingPoints: generate 3-6 points based on the deal narrative and CRM context.
Focus on deal strategy, timing, relationship context, and what to watch for.`;

      const raw = await callClaude(prompt, 1800);
      const parsed = parseLlmJson<EmailAnalysis>(raw);
      parsed.suggestedActions = (parsed.suggestedActions ?? []).map((a) => ({ ...a, accepted: false, dismissed: false }));
      parsed.coachingPoints = parsed.coachingPoints ?? [];

      setAnalysis(parsed);
      setActions(parsed.suggestedActions);

      setResolvedContactId(composeContact.id);
      setConfirmedContact({
        id: composeContact.id, firstName: composeContact.firstName, lastName: composeContact.lastName,
        email: null, phone: composeContact.phone ?? null, company: composeContact.company ?? null,
        isOwner: composeContact.isOwner ?? false, isBuyer: composeContact.isBuyer ?? false,
      });
      if (dc?.property) setOverrideDealMentioned(dc.property.name);
      setDealIntelContactId(composeContact.id);
      setDealIntelPropertyId(composePropertyId);
      setDealIntelListingId(composeListingId);

    } catch (err) {
      console.error(err);
      toast.error("Compose failed. Check your inputs and try again.");
    } finally {
      setIsComposing(false);
    }
  }

  // Backend duplicate check for Email Studio
  const checkDupES = trpc.contacts.checkDuplicate.useQuery(
    { firstName: newContact.firstName, lastName: newContact.lastName, email: newContact.email || undefined, phone: newContact.phone || undefined },
    { enabled: false }
  );

  async function handleCreateContact() {
    if (!newContact.firstName.trim()) { toast.error("First name required."); return; }
    if (!confirmedNew) {
      const result = await checkDupES.refetch();
      if (result.data && result.data.length > 0) {
        setDupWarning(result.data.map((d) => ({ id: d.id, firstName: d.firstName, lastName: d.lastName ?? "", company: d.company })));
        return;
      }
    }
    setIsCreating(true);
    createContact.mutate({
      firstName: newContact.firstName,
      lastName:  newContact.lastName,
      email:     newContact.email || undefined,
      phone:     newContact.phone || undefined,
      company:   newContact.company || undefined,
      isOwner:   newContact.isOwner,
      isBuyer:   newContact.isBuyer,
      priority:  "warm",
    });
  }

  // ── Iterative editing chat ───────────────────────────────────────────────────
  const [chatMessages,   setChatMessages]   = useState<ChatMessage[]>([]);
  const [chatInput,      setChatInput]      = useState("");
  const [isChatting,     setIsChatting]     = useState(false);
  const [currentDraft,   setCurrentDraft]   = useState<string | null>(null);
  const [copiedChat,     setCopiedChat]     = useState<number | null>(null);

  // Seed currentDraft when analysis first arrives
  useEffect(() => {
    if (analysis && currentDraft === null) {
      setCurrentDraft(stripMarkdown(analysis.editedEmail));
      setChatMessages([]);
    }
  }, [analysis]);

  async function sendChatEdit(instruction: string) {
    if (!instruction.trim() || !currentDraft) return;
    setIsChatting(true);
    setChatMessages((prev) => [...prev, { role: "user", text: instruction }]);
    setChatInput("");
    try {
      const toneInstruction = tone === "tight"
        ? "TONE MODE: TIGHT — Be maximally direct and concise."
        : tone === "conversational"
        ? "TONE MODE: CONVERSATIONAL — Be warm and natural. Preserve length and friendliness."
        : "TONE MODE: BALANCED — Use good judgment based on context.";

      let marketIntelBlock = "";
      if (marketIntelData && marketIntelData.entries.length > 0) {
        const intelLines = marketIntelData.entries.map(e =>
          `[${e.marketName ?? "Market"}, ${e.source ?? "note"}] ${e.content.slice(0, 400)}`
        ).join("\n\n");
        marketIntelBlock = `\nMARKET INTEL FOR ${marketIntelData.marketName ?? "THIS MARKET"} (from your knowledge base — you may reference these facts in the email if relevant):\n${intelLines}\n`;
      }

      const questionWords = /^(how|what|why|should|can|would|could|is|are|does|do|will|when|where|which|who|tell me|explain|show me)/i;
      const isQuestion = questionWords.test(instruction.trim());

      if (isQuestion) {
        const prompt = `You are a senior commercial real estate broker helping draft and refine emails.

${marketIntelBlock}
CURRENT EMAIL DRAFT:
${currentDraft}

The user is asking a question about the email or the market context. Answer conversationally and helpfully — do NOT rewrite the email unless explicitly asked. Be specific and reference the actual draft content or market intel above.

USER QUESTION: ${instruction}`;
        const answer = await callClaude(prompt, 600);
        setChatMessages((prev) => [...prev, { role: "assistant", text: answer.trim(), isEmail: false }]);
      } else {
        const prompt = `${STYLE_PROMPT}

${toneInstruction}
${marketIntelBlock}
---
You are iteratively editing an email draft based on the user's instructions.

${originalDraft ? `ORIGINAL DRAFT (what the user wrote before any edits):\n${originalDraft}\n\n` : ""}CURRENT DRAFT:
${currentDraft}

USER INSTRUCTION:
${instruction}

If the user asks to make it "more like the original" or "closer to what I wrote", use the ORIGINAL DRAFT above as the reference.
If the instruction references a market stat or fact, use the MARKET INTEL block above to find and incorporate the specific data.
Return ONLY the revised email text — no JSON, no explanation, no markdown, no preamble. Just the email.`;
        const revised = await callClaude(prompt, 1200);
        const clean = stripMarkdown(revised.trim());
        setCurrentDraft(clean);
        setChatMessages((prev) => [...prev, { role: "assistant", text: clean, isEmail: true }]);
      }
    } catch {
      toast.error("Edit failed — try again.");
      setChatMessages((prev) => prev.slice(0, -1));
    } finally {
      setIsChatting(false);
    }
  }

  function copyChatDraft(idx: number, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedChat(idx);
    setTimeout(() => setCopiedChat(null), 2000);
  }

  function handleChatKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendChatEdit(chatInput);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-screen overflow-hidden">

      {/* Header */}
      <div className="px-6 pt-6 pb-0 border-b border-border/50 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Mail className="h-6 w-6 text-primary" /> Email Studio
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {activeTab === "compose" ? "Compose with full deal context" : "Edit in your voice · Coach with CRM data · Surface actions"}
            </p>
          </div>
          {analysis && (
            <Button variant="ghost" size="sm" onClick={reset} className="gap-1.5 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" /> New Email
            </Button>
          )}
        </div>
        {/* Tab bar */}
        <div className="flex gap-1 mt-3">
          {(["compose", "edit"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {tab === "compose" ? "Compose" : "Edit"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-auto px-6 py-5">

        {/* ── Compose Tab ── */}
        {activeTab === "compose" && !analysis && (
          <ComposeTabInput
            composeContact={composeContact}
            setComposeContact={setComposeContact}
            composePropertySearch={composePropertySearch}
            setComposePropertySearch={setComposePropertySearch}
            composePropertyId={composePropertyId}
            setComposePropertyId={setComposePropertyId}
            composeListingId={composeListingId}
            setComposeListingId={setComposeListingId}
            composeIntent={composeIntent}
            setComposeIntent={setComposeIntent}
            tone={tone}
            setTone={setTone}
            isComposing={isComposing}
            composeEmail={composeEmail}
            setResolvedContactId={setResolvedContactId}
            setDealIntelContactId={setDealIntelContactId}
            properties={properties}
            listings={listings}
            dealContextQuery={dealContextQuery}
          />
        )}

        {/* ── Edit Tab: Input state ── */}
        {activeTab === "edit" && !analysis && (
          <EditTabInput
            background={background}
            setBackground={setBackground}
            thread={thread}
            setThread={setThread}
            tone={tone}
            setTone={setTone}
            isProcessing={isProcessing}
            process={process}
          />
        )}

        {/* ── Results state ── */}
        {analysis && (
          <>
            <ResultsPanel
              analysis={analysis}
              actions={actions}
              setActions={setActions}
              thread={thread}
              copied={copied}
              copyEmail={copyEmail}
              showOriginal={showOriginal}
              setShowOriginal={setShowOriginal}
              overrideDealMentioned={overrideDealMentioned}
              setOverrideDealMentioned={setOverrideDealMentioned}
              showDealPicker={showDealPicker}
              setShowDealPicker={setShowDealPicker}
              dealPickerSearch={dealPickerSearch}
              setDealPickerSearch={setDealPickerSearch}
              isSearching={isSearching}
              runWebSearch={runWebSearch}
              webCoaching={webCoaching}
              dealIntelCoaching={dealIntelCoaching}
              isDealIntelLoading={isDealIntelLoading}
              dealIntelContactId={dealIntelContactId}
              dealIntelPropertyId={dealIntelPropertyId}
              dealIntelListingId={dealIntelListingId}
              runDealIntelCoaching={runDealIntelCoaching}
              contactMatch={contactMatch}
              resolvedContactId={resolvedContactId}
              setResolvedContactId={setResolvedContactId}
              confirmedContact={confirmedContact}
              setConfirmedContact={setConfirmedContact}
              showContactPicker={showContactPicker}
              setShowContactPicker={setShowContactPicker}
              showNewForm={showNewForm}
              setShowNewForm={setShowNewForm}
              setContactMatch={setContactMatch}
              autoTagContact={autoTagContact}
              setDealIntelContactId={setDealIntelContactId}
              setDealIntelPropertyId={setDealIntelPropertyId}
              setDealIntelListingId={setDealIntelListingId}
              acceptAction={acceptAction}
              dismissAction={dismissAction}
              editingActionIdx={editingActionIdx}
              setEditingActionIdx={setEditingActionIdx}
              editingAction={editingAction}
              setEditingAction={setEditingAction}
              buyerCardOpen={buyerCardOpen}
              setBuyerCardOpen={setBuyerCardOpen}
              buyerListingId={buyerListingId}
              setBuyerListingId={setBuyerListingId}
              buyerCardSaved={buyerCardSaved}
              setBuyerCardSaved={setBuyerCardSaved}
              isSavingBuyer={isSavingBuyer}
              setIsSavingBuyer={setIsSavingBuyer}
              upsertInterest={upsertInterest}
              contacts={contacts}
              properties={properties}
              listings={listings}
              dealResolution={dealResolution}
              onDealResolved={(id) => {
                setDealIntelPropertyId(id);
                const prop = (properties ?? []).find(p => p.id === id);
                if (prop) setOverrideDealMentioned(prop.name);
                setDealResolution(null);
              }}
              onDealCreateNew={(name) => {
                toast.info(`"${name}" — add it manually in Properties for now`);
                setDealResolution(null);
              }}
              onDealUndo={() => {
                setDealIntelPropertyId(null);
                setOverrideDealMentioned(null);
                setDealResolution(null);
              }}
            />

            {/* ── Iterative Editing Chat ── */}
            <div className="mt-4">
              <EditingChat
                analysis={analysis}
                tone={tone}
                setTone={setTone}
                chatMessages={chatMessages}
                chatInput={chatInput}
                setChatInput={setChatInput}
                isChatting={isChatting}
                sendChatEdit={sendChatEdit}
                handleChatKeyDown={handleChatKeyDown}
                copyChatDraft={copyChatDraft}
                copiedChat={copiedChat}
                marketIntelData={marketIntelData}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
