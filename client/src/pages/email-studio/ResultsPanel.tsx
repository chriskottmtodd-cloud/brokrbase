import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import {
  Wand2, CheckCircle2, ClipboardList, User, Building2,
  Loader2, Copy, ChevronDown, Globe, Lightbulb,
  Check, X, Mail, CalendarIcon, Plus, Users,
} from "lucide-react";
import { PendingTasksFulfiller } from "@/components/PendingTasksFulfiller";
import { ContactConfirmationCard, type ConfirmedContact } from "@/components/ContactConfirmationCard";
import { DealResolver, type DealResolution } from "@/components/DealResolver";
import type { CRMAction, CoachingPoint, EmailAnalysis, ContactMatchStatus } from "./types";

const ACTION_COLORS: Record<string, string> = {
  add_task:        "bg-blue-500/20 text-blue-400 border-blue-500/30",
  update_contact:  "bg-amber-500/20 text-amber-400 border-amber-500/30",
  log_activity:    "bg-purple-500/20 text-purple-400 border-purple-500/30",
  update_property: "bg-teal-500/20 text-teal-400 border-teal-500/30",
  update_listing:  "bg-orange-500/20 text-orange-400 border-orange-500/30",
};
const ACTION_LABELS: Record<string, string> = {
  add_task: "Task", update_contact: "Contact",
  log_activity: "Log", update_property: "Property", update_listing: "Listing",
};
const COACHING_COLORS: Record<string, string> = {
  crm:      "bg-blue-500/20 text-blue-400 border-blue-500/30",
  market:   "bg-teal-500/20 text-teal-400 border-teal-500/30",
  strategy: "bg-amber-500/20 text-amber-400 border-amber-500/30",
};

interface ResultsPanelProps {
  analysis: EmailAnalysis;
  actions: CRMAction[];
  setActions: React.Dispatch<React.SetStateAction<CRMAction[]>>;
  thread: string;
  copied: boolean;
  copyEmail: () => void;
  showOriginal: boolean;
  setShowOriginal: (v: boolean) => void;

  // Context bar
  overrideDealMentioned: string | null;
  setOverrideDealMentioned: (v: string | null) => void;
  showDealPicker: boolean;
  setShowDealPicker: (v: boolean) => void;
  dealPickerSearch: string;
  setDealPickerSearch: (v: string) => void;

  // Coaching
  isSearching: boolean;
  runWebSearch: () => void;
  webCoaching: string[];
  dealIntelCoaching: Array<{ text: string; source: string }>;
  isDealIntelLoading: boolean;
  dealIntelContactId: number | null;
  dealIntelPropertyId: number | null;
  dealIntelListingId: number | null;
  runDealIntelCoaching: (contactId: number | null, propertyId: number | null, listingId: number | null, emailContext: string) => void;

  // Contact match
  contactMatch: ContactMatchStatus | null;
  resolvedContactId: number | null;
  setResolvedContactId: (v: number | null) => void;
  confirmedContact: ConfirmedContact | null;
  setConfirmedContact: (v: ConfirmedContact | null) => void;
  showContactPicker: boolean;
  setShowContactPicker: (v: boolean) => void;
  showNewForm: boolean;
  setShowNewForm: (v: boolean) => void;
  setContactMatch: (v: ContactMatchStatus | null) => void;
  autoTagContact: (contactId: number) => void;

  // Deal intel setters
  setDealIntelContactId: (v: number | null) => void;
  setDealIntelPropertyId: (v: number | null) => void;
  setDealIntelListingId: (v: number | null) => void;

  // Action handlers
  acceptAction: (idx: number) => void;
  dismissAction: (idx: number) => void;
  editingActionIdx: number | null;
  setEditingActionIdx: (v: number | null) => void;
  editingAction: { label: string; detail: string };
  setEditingAction: (v: { label: string; detail: string }) => void;

  // Buyer card
  buyerCardOpen: boolean;
  setBuyerCardOpen: (v: boolean) => void;
  buyerListingId: string;
  setBuyerListingId: (v: string) => void;
  buyerCardSaved: boolean;
  setBuyerCardSaved: (v: boolean) => void;
  isSavingBuyer: boolean;
  setIsSavingBuyer: (v: boolean) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  upsertInterest: { mutateAsync: (args: any) => Promise<unknown> };

  // Data
  contacts: Array<{ id: number; firstName: string; lastName: string; company?: string | null; [key: string]: unknown }> | undefined;
  properties: Array<{ id: number; name: string; city?: string | null; address?: string | null; marketId?: number | null; [key: string]: unknown }> | undefined;
  listings: Array<{ id: number; title: string; [key: string]: unknown }> | undefined;

  // Deal resolution (Active Deal Stack)
  dealResolution?: DealResolution | null;
  onDealResolved?: (propertyId: number) => void;
  onDealCreateNew?: (name: string) => void;
  onDealUndo?: () => void;
}

export function ResultsPanel({
  analysis, actions, setActions, thread,
  copied, copyEmail, showOriginal, setShowOriginal,
  overrideDealMentioned, setOverrideDealMentioned,
  showDealPicker, setShowDealPicker, dealPickerSearch, setDealPickerSearch,
  isSearching, runWebSearch, webCoaching,
  dealIntelCoaching, isDealIntelLoading,
  dealIntelContactId, dealIntelPropertyId, dealIntelListingId,
  runDealIntelCoaching,
  contactMatch, resolvedContactId, setResolvedContactId,
  confirmedContact, setConfirmedContact,
  showContactPicker, showNewForm,
  setContactMatch, autoTagContact,
  setDealIntelContactId, setDealIntelPropertyId, setDealIntelListingId,
  acceptAction, dismissAction,
  editingActionIdx, setEditingActionIdx,
  editingAction, setEditingAction,
  buyerCardOpen, setBuyerCardOpen,
  buyerListingId, setBuyerListingId,
  buyerCardSaved, setBuyerCardSaved,
  isSavingBuyer, setIsSavingBuyer,
  upsertInterest,
  contacts, properties, listings,
  dealResolution, onDealResolved, onDealCreateNew, onDealUndo,
}: ResultsPanelProps) {
  // Track which task action's date popover is open
  const [openDatePickerIdx, setOpenDatePickerIdx] = useState<number | null>(null);

  // Track which action's property picker is open + its search text
  const [openPropertyPickerIdx, setOpenPropertyPickerIdx] = useState<number | null>(null);
  const [propertyPickerSearch, setPropertyPickerSearch] = useState("");

  const activeActions = actions.filter((a) => !a.dismissed);

  return (
    <div className="space-y-4">

      {/* Context summary bar */}
      <div className="flex items-center gap-3 flex-wrap px-1">
        {analysis.senderFirstName && (
          <span className="flex items-center gap-1.5 text-sm">
            <User className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-foreground">
              {analysis.senderFirstName} {analysis.senderLastName}
            </span>
            {analysis.senderCompany && (
              <span className="text-muted-foreground text-xs">· {analysis.senderCompany}</span>
            )}
          </span>
        )}
        {(overrideDealMentioned ?? analysis.dealMentioned) && !showDealPicker && (
          <span className="flex items-center gap-1.5 text-sm">
            <Building2 className="h-3.5 w-3.5 text-primary" />
            <span className="font-medium text-foreground">{overrideDealMentioned ?? analysis.dealMentioned}</span>
            <button
              onClick={() => { setShowDealPicker(true); setDealPickerSearch(""); }}
              className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Change
            </button>
          </span>
        )}
        {!analysis.dealMentioned && !overrideDealMentioned && !showDealPicker && !dealResolution && (
          <button
            onClick={() => { setShowDealPicker(true); setDealPickerSearch(""); }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border/50 hover:border-primary/40 rounded px-2 py-0.5"
          >
            <Building2 className="h-3 w-3" /> Link property
          </button>
        )}
        {dealResolution && !overrideDealMentioned && onDealResolved && onDealCreateNew && (
          <DealResolver
            resolution={dealResolution}
            onResolved={onDealResolved}
            onCreateNew={onDealCreateNew}
            onUndo={onDealUndo}
          />
        )}
        {showDealPicker && (() => {
          const allOptions = [
            ...(properties ?? []).map(p => ({ name: p.name, type: "property" as const })),
            ...(listings ?? []).map(l => ({ name: l.title, type: "listing" as const })),
          ];
          const filtered = dealPickerSearch.trim().length < 1
            ? allOptions.slice(0, 10)
            : allOptions.filter(o => o.name.toLowerCase().includes(dealPickerSearch.toLowerCase())).slice(0, 10);
          return (
            <div className="relative flex items-center gap-1">
              <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
              <input
                autoFocus
                value={dealPickerSearch}
                onChange={(e) => setDealPickerSearch(e.target.value)}
                placeholder="Search property or listing…"
                className="text-xs px-2 py-0.5 rounded border border-primary/50 bg-background text-foreground placeholder:text-muted-foreground outline-none w-48"
              />
              <button onClick={() => setShowDealPicker(false)} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
              {filtered.length > 0 && (
                <div className="absolute z-50 top-full left-6 mt-0.5 w-64 bg-card border border-border rounded shadow-lg max-h-48 overflow-y-auto">
                  {filtered.map(o => (
                    <button
                      key={o.name}
                      className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-accent transition-colors flex items-center gap-1.5"
                      onClick={() => { setOverrideDealMentioned(o.name); setShowDealPicker(false); setDealPickerSearch(""); }}
                    >
                      <Building2 className="h-2.5 w-2.5 text-muted-foreground shrink-0" />
                      <span className="font-medium">{o.name}</span>
                      <span className="text-muted-foreground text-[10px] ml-auto">{o.type}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}
        <span className="text-xs text-muted-foreground">{analysis.contextSummary}</span>
      </div>

      {/* Three-column results */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">

        {/* ── Col 1: Edited Email ── */}
        <Card className="bg-card border-border">
          <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-primary" /> Edited Reply
            </CardTitle>
            <Button variant="outline" size="sm" onClick={copyEmail} className="h-7 text-xs gap-1.5">
              {copied ? <><CheckCircle2 className="h-3.5 w-3.5 text-green-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">
            <pre className="whitespace-pre-wrap text-sm text-foreground font-sans leading-relaxed bg-background/50 rounded p-3 border border-border/50 max-h-80 overflow-y-auto">
              {analysis.editedEmail}
            </pre>
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
              onClick={() => setShowOriginal(!showOriginal)}
            >
              <ChevronDown className={`h-3 w-3 transition-transform ${showOriginal ? "rotate-180" : ""}`} />
              {showOriginal ? "Hide" : "Show"} original draft
            </button>
            {showOriginal && (
              <pre className="whitespace-pre-wrap text-xs text-muted-foreground font-mono bg-card rounded p-3 border border-border/50 max-h-48 overflow-y-auto">
                {thread}
              </pre>
            )}
          </CardContent>
        </Card>

        {/* ── Col 2: Coaching ── */}
        <Card className="bg-card border-border">
          <CardHeader className="px-4 pt-4 pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Lightbulb className="h-4 w-4 text-primary" /> Coaching
            </CardTitle>
            <Button
              variant="outline" size="sm"
              onClick={runWebSearch}
              disabled={isSearching}
              className="h-7 text-xs gap-1.5"
              title="Pull current market intel for this deal"
            >
              {isSearching
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…</>
                : <><Globe className="h-3.5 w-3.5" /> Market Intel</>
              }
            </Button>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-2">
            {analysis.coachingPoints.map((pt, i) => (
              <div key={i} className="flex gap-2 items-start">
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 py-0 shrink-0 mt-0.5 ${COACHING_COLORS[pt.source] ?? ""}`}
                >
                  {pt.source}
                </Badge>
                <p className="text-xs text-foreground leading-relaxed">{pt.text}</p>
              </div>
            ))}

            {/* Deal Intelligence coaching — on-demand only */}
            <div className="border-t border-border/40 pt-2 mt-2">
              {dealIntelCoaching.length === 0 && !isDealIntelLoading ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1.5 w-full"
                  disabled={!dealIntelContactId && !dealIntelPropertyId && !dealIntelListingId}
                  onClick={() => runDealIntelCoaching(dealIntelContactId, dealIntelPropertyId, dealIntelListingId, thread.slice(0, 800))}
                >
                  <Lightbulb className="h-3.5 w-3.5 text-amber-400" /> Load Deal Intelligence
                </Button>
              ) : (
                <>
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2 flex items-center gap-1.5">
                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500"></span>
                    Deal Intelligence
                    {isDealIntelLoading && <Loader2 className="h-2.5 w-2.5 animate-spin ml-1" />}
                  </p>
                  {dealIntelCoaching.map((pt, i) => (
                    <div key={i} className="flex gap-2 items-start mb-2">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 mt-0.5 bg-amber-500/20 text-amber-400 border-amber-500/30">
                        intel
                      </Badge>
                      <p className="text-xs text-foreground leading-relaxed">{pt.text}</p>
                    </div>
                  ))}
                </>
              )}
            </div>

            {webCoaching.length > 0 && (
              <>
                <div className="border-t border-border/40 pt-2 mt-2">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold mb-2">
                    Market Intel
                  </p>
                  {webCoaching.map((pt, i) => (
                    <div key={i} className="flex gap-2 items-start mb-2">
                      <Badge variant="outline" className="text-[9px] px-1 py-0 shrink-0 mt-0.5 bg-teal-500/20 text-teal-400 border-teal-500/30">
                        web
                      </Badge>
                      <p className="text-xs text-foreground leading-relaxed">{pt}</p>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* ── Col 3: CRM Actions ── */}
        <Card className="bg-card border-border">
          <CardHeader className="px-4 pt-4 pb-2">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <ClipboardList className="h-4 w-4 text-primary" /> CRM Actions
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4 space-y-3">

            {/* Contact match */}
            {contactMatch && (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Contact</p>

                {/* Found — ContactConfirmationCard with Wrong person? + recency badge */}
                {contactMatch.status === "found" && !resolvedContactId && !showContactPicker && (
                  <div className="space-y-1.5">
                    <ContactConfirmationCard
                      contact={contactMatch.contact}
                      selectionReason={contactMatch.selectionReason}
                      detectedName={analysis ? `${analysis.senderFirstName} ${analysis.senderLastName}`.trim() || undefined : undefined}
                      detectedEmail={analysis?.senderEmail || undefined}
                      detectedCompany={analysis?.senderCompany || undefined}
                      detectedPhone={analysis?.senderPhone || undefined}
                      onConfirm={(c) => {
                        setResolvedContactId(c.id);
                        setConfirmedContact(c);
                        autoTagContact(c.id);
                        const dealName = overrideDealMentioned ?? analysis?.dealMentioned;
                        const mp = dealName ? (properties ?? []).find(p => p.name === dealName) : undefined;
                        const ml = dealName ? (listings  ?? []).find(l => l.title === dealName) : undefined;
                        setDealIntelContactId(c.id);
                        setDealIntelPropertyId(mp?.id ?? null);
                        setDealIntelListingId(ml?.id ?? null);
                      }}
                      onSwap={(c) => {
                        setResolvedContactId(c.id);
                        setConfirmedContact(c);
                        setContactMatch({ status: "found", contact: c, selectionReason: "manual" });
                        autoTagContact(c.id);
                        const dealName = overrideDealMentioned ?? analysis?.dealMentioned;
                        const mp = dealName ? (properties ?? []).find(p => p.name === dealName) : undefined;
                        const ml = dealName ? (listings  ?? []).find(l => l.title === dealName) : undefined;
                        setDealIntelContactId(c.id);
                        setDealIntelPropertyId(mp?.id ?? null);
                        setDealIntelListingId(ml?.id ?? null);
                        toast.success(`Switched to ${c.firstName} ${c.lastName}.`);
                      }}
                    />

                  </div>
                )}



                {/* Ambiguous */}
                {contactMatch.status === "ambiguous" && !resolvedContactId && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-1.5 text-xs text-amber-400">
                      <Users className="h-3.5 w-3.5" /> Multiple matches — select one:
                    </div>
                    {contactMatch.candidates.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => { setResolvedContactId(c.id); autoTagContact(c.id); }}
                        className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors text-xs"
                      >
                        <User className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="font-medium text-foreground">{c.firstName} {c.lastName}</span>
                        {c.company && <span className="text-muted-foreground">· {c.company}</span>}
                      </button>
                    ))}

                  </div>
                )}

                {/* Not found — ContactConfirmationCard handles create flow */}
                {contactMatch.status === "not_found" && !resolvedContactId && (
                  <ContactConfirmationCard
                    contact={null as any}
                    selectionReason={undefined}
                    detectedName={contactMatch.prefill.firstName || analysis?.senderFirstName ? `${contactMatch.prefill.firstName || analysis?.senderFirstName} ${contactMatch.prefill.lastName || analysis?.senderLastName}`.trim() : undefined}
                    detectedEmail={contactMatch.prefill.email || analysis?.senderEmail || undefined}
                    detectedCompany={contactMatch.prefill.company || analysis?.senderCompany || undefined}
                    detectedPhone={contactMatch.prefill.phone || analysis?.senderPhone || undefined}
                    notFoundMode
                    onConfirm={(c) => {
                      setResolvedContactId(c.id);
                      setConfirmedContact(c);
                      autoTagContact(c.id);
                      const dealName = overrideDealMentioned ?? analysis?.dealMentioned;
                      const mp = dealName ? (properties ?? []).find(p => p.name === dealName) : undefined;
                      const ml = dealName ? (listings  ?? []).find(l => l.title === dealName) : undefined;
                      setDealIntelContactId(c.id);
                      setDealIntelPropertyId(mp?.id ?? null);
                      setDealIntelListingId(ml?.id ?? null);
                    }}
                    onSwap={(c) => {
                      setResolvedContactId(c.id);
                      setConfirmedContact(c);
                      setContactMatch({ status: "found", contact: c, selectionReason: "manual" });
                      autoTagContact(c.id);
                      const dealName = overrideDealMentioned ?? analysis?.dealMentioned;
                      const mp = dealName ? (properties ?? []).find(p => p.name === dealName) : undefined;
                      const ml = dealName ? (listings  ?? []).find(l => l.title === dealName) : undefined;
                      setDealIntelContactId(c.id);
                      setDealIntelPropertyId(mp?.id ?? null);
                      setDealIntelListingId(ml?.id ?? null);
                      toast.success(`Switched to ${c.firstName} ${c.lastName}.`);
                    }}
                  />
                )}

                {/* Resolved — show ContactConfirmationCard for confirmed contact */}
                {resolvedContactId && confirmedContact && (
                  <ContactConfirmationCard
                    contact={confirmedContact}
                    selectionReason={contactMatch?.status === "found" ? contactMatch.selectionReason : "manual"}
                    detectedName={analysis ? `${analysis.senderFirstName} ${analysis.senderLastName}`.trim() || undefined : undefined}
                    detectedEmail={analysis?.senderEmail || undefined}
                    detectedCompany={analysis?.senderCompany || undefined}
                    detectedPhone={analysis?.senderPhone || undefined}
                    onConfirm={() => {}}
                    onSwap={async (c) => {
                      setResolvedContactId(c.id);
                      setConfirmedContact(c);
                      setContactMatch({ status: "found", contact: c, selectionReason: "manual" });
                      autoTagContact(c.id);
                      const dealName = overrideDealMentioned ?? analysis?.dealMentioned;
                      const mp = dealName ? (properties ?? []).find(p => p.name === dealName) : undefined;
                      const ml = dealName ? (listings  ?? []).find(l => l.title === dealName) : undefined;
                      setDealIntelContactId(c.id);
                      setDealIntelPropertyId(mp?.id ?? null);
                      setDealIntelListingId(ml?.id ?? null);
                      toast.success(`Switched to ${c.firstName} ${c.lastName}.`);
                    }}
                  />
                )}
                {/* Resolved (no confirmedContact data) — simple fallback chip */}
                {resolvedContactId && !confirmedContact && (
                  <div className="flex items-center gap-2 p-2 rounded border border-green-500/30 bg-green-500/5">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                    <span className="text-xs text-foreground flex-1">
                      {(() => {
                        const c = (contacts ?? []).find((x) => x.id === resolvedContactId);
                        return c ? `${c.firstName} ${c.lastName}${c.company ? " · " + c.company : ""}` : "Contact linked";
                      })()}
                    </span>
                  </div>
                )}


              </div>
            )}

                {/* Pending tasks for resolved contact */}
                {resolvedContactId && !showContactPicker && !showNewForm && (
                  <div className="mt-2">
                    <div className="rounded border border-border/60 bg-card px-3 py-3">
                      <PendingTasksFulfiller
                        contactId={resolvedContactId}
                        completionNote={thread}
                      />
                    </div>
                  </div>
                )}

                {/* Add as Buyer to Listing card — always visible after analysis */}
                {analysis && (
                  <div className={`mt-2 rounded border transition-all ${buyerCardSaved ? "border-green-500/30 bg-green-500/5" : buyerCardOpen ? "border-purple-500/30 bg-purple-500/5" : "border-border/40 bg-background/30"}` }>
                    <div className="flex items-center justify-between px-3 py-2">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                        <Building2 className="h-3 w-3 text-purple-400" />Add as Buyer to Listing
                      </span>
                      {buyerCardSaved ? (
                        <span className="text-[11px] text-green-400 flex items-center gap-1"><Check className="h-3 w-3" />Saved</span>
                      ) : (
                        <Button
                          size="sm"
                          variant={buyerCardOpen ? "default" : "outline"}
                          className="h-6 text-[11px] gap-1"
                          onClick={() => setBuyerCardOpen(!buyerCardOpen)}
                        >
                          {buyerCardOpen ? "Cancel" : <><Plus className="h-3 w-3" />Add Buyer</>}
                        </Button>
                      )}
                    </div>
                    {buyerCardOpen && !buyerCardSaved && (
                      <div className="px-3 pb-3 space-y-2">
                        <Select value={buyerListingId} onValueChange={setBuyerListingId}>
                          <SelectTrigger className="h-7 text-xs bg-background border-border"><SelectValue placeholder="Select listing…" /></SelectTrigger>
                          <SelectContent>
                            {listings?.map(l => <SelectItem key={l.id} value={String(l.id)}>{l.title}</SelectItem>)}
                          </SelectContent>
                        </Select>
                        {!buyerListingId && <p className="text-[10px] text-muted-foreground">Select a listing — contact will be logged as an interested buyer on that listing's page.</p>}
                        <Button
                          size="sm"
                          className="h-7 text-xs w-full gap-1"
                          disabled={!buyerListingId || isSavingBuyer}
                          onClick={async () => {
                            setIsSavingBuyer(true);
                            try {
                              await upsertInterest.mutateAsync({
                                listingId: parseInt(buyerListingId),
                                contactId: resolvedContactId!,
                                status: "interested",
                                notes: thread.slice(0, 300),
                              });
                              setBuyerCardSaved(true);
                              setBuyerCardOpen(false);
                              const listingTitle = listings?.find(l => l.id === parseInt(buyerListingId))?.title ?? "listing";
                              toast.success(`Logged as interested buyer on "${listingTitle}".`);
                            } catch { toast.error("Failed to save buyer interest."); }
                            finally { setIsSavingBuyer(false); }
                          }}
                        >
                          {isSavingBuyer ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                          Save Buyer Interest
                        </Button>
                      </div>
                    )}
                  </div>
                )}

                {/* Divider if both contact and actions */}
            {contactMatch && activeActions.length > 0 && (
              <div className="border-t border-border/40" />
            )}

            {/* Suggested actions */}
            {activeActions.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] text-muted-foreground uppercase tracking-wide font-semibold">Suggested Actions</p>
                {activeActions.map((action, idx) => {
                  const realIdx = actions.indexOf(action);
                  const isEditing = editingActionIdx === realIdx;
                  return (
                    <div
                      key={idx}
                      className={`p-2.5 rounded border transition-all space-y-1 ${
                        action.accepted
                          ? "bg-green-500/5 border-green-500/20"
                          : isEditing
                            ? "bg-primary/5 border-primary/30"
                            : "bg-background/50 border-border/50"
                      }`}
                    >
                      {/* Inline edit mode */}
                      {isEditing ? (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Badge variant="outline" className={`text-[9px] px-1 py-0 shrink-0 ${ACTION_COLORS[action.type] ?? ""}`}>
                              {ACTION_LABELS[action.type]}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">Editing</span>
                          </div>
                          <Input
                            value={editingAction.label}
                            onChange={(e) => setEditingAction({ ...editingAction, label: e.target.value })}
                            placeholder="Task title"
                            className="h-7 text-xs bg-card border-border"
                          />
                          <Textarea
                            value={editingAction.detail}
                            onChange={(e) => setEditingAction({ ...editingAction, detail: e.target.value })}
                            placeholder="Details"
                            className="text-xs bg-card border-border resize-none"
                            rows={2}
                          />
                          <div className="flex gap-1.5">
                            <Button size="sm" className="h-6 text-[11px] px-2 flex-1" onClick={() => {
                              setActions((prev) => prev.map((a, i) => i === realIdx ? { ...a, label: editingAction.label, detail: editingAction.detail } : a));
                              setEditingActionIdx(null);
                            }}>
                              <Check className="h-3 w-3 mr-1" /> Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2" onClick={() => setEditingActionIdx(null)}>
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-start gap-2">
                            <Badge variant="outline" className={`text-[9px] px-1 py-0 shrink-0 mt-0.5 ${ACTION_COLORS[action.type] ?? ""}`}>
                              {ACTION_LABELS[action.type]}
                            </Badge>
                            <div className="flex-1 min-w-0">
                              <p className={`text-xs font-medium ${action.accepted ? "text-green-400" : "text-foreground"}`}>
                                {action.label}
                              </p>
                              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{action.detail}</p>
                              <div className="flex flex-wrap gap-2 mt-1">
                                {action.contactName && (
                                  <span className="text-[10px] text-primary flex items-center gap-0.5">
                                    <User className="h-2.5 w-2.5" /> {action.contactName}
                                  </span>
                                )}
                                {action.propertyName && (
                                  <span className="text-[10px] text-primary flex items-center gap-1">
                                    <Building2 className="h-2.5 w-2.5" /> {action.propertyName}
                                    {!action.accepted && (
                                      <>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setOpenPropertyPickerIdx(openPropertyPickerIdx === realIdx ? null : realIdx); setPropertyPickerSearch(""); }}
                                          className="text-muted-foreground hover:text-foreground transition-colors ml-0.5"
                                          title="Change property"
                                        >
                                          <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                        </button>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setActions(prev => prev.map((a, i) => i === realIdx ? { ...a, propertyName: undefined } : a)); setOpenPropertyPickerIdx(null); }}
                                          className="text-muted-foreground hover:text-red-400 transition-colors ml-0.5"
                                          title="Remove property"
                                        >
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </>
                                    )}
                                  </span>
                                )}
                                {openPropertyPickerIdx === realIdx && !action.accepted && (() => {
                                  const filtered = (properties ?? []).filter(p =>
                                    propertyPickerSearch.trim().length < 1 ? true :
                                    `${p.name} ${p.address ?? ""} ${p.city ?? ""}`.toLowerCase().includes(propertyPickerSearch.toLowerCase())
                                  ).slice(0, 8);
                                  return (
                                    <div className="w-full mt-1 relative" onClick={(e) => e.stopPropagation()}>
                                      <input
                                        autoFocus
                                        value={propertyPickerSearch}
                                        onChange={(e) => setPropertyPickerSearch(e.target.value)}
                                        placeholder="Search property…"
                                        className="w-full text-[11px] px-2 py-1 rounded border border-border bg-background text-foreground placeholder:text-muted-foreground outline-none"
                                      />
                                      {filtered.length > 0 && (
                                        <div className="absolute z-50 top-full mt-0.5 w-full bg-card border border-border rounded shadow-lg max-h-40 overflow-y-auto">
                                          {filtered.map(p => (
                                            <button
                                              key={p.id}
                                              className="w-full text-left px-2 py-1.5 text-[11px] hover:bg-accent transition-colors"
                                              onClick={() => {
                                                setActions(prev => prev.map((a, i) => i === realIdx ? { ...a, propertyName: p.name } : a));
                                                setOpenPropertyPickerIdx(null);
                                                setPropertyPickerSearch("");
                                              }}
                                            >
                                              <span className="font-medium">{p.name}</span>
                                              <span className="text-muted-foreground ml-1.5">{p.city ?? ""}{p.address ? " · " + p.address : ""}</span>
                                            </button>
                                          ))}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })()}
                                {action.listingName && (
                                  <span className="text-[10px] text-orange-400 flex items-center gap-1">
                                    <Mail className="h-2.5 w-2.5" /> {action.listingName}
                                    {action.listingStage ? ` → ${action.listingStage.replace(/_/g, " ")}` : ""}
                                    {!action.accepted && (
                                      <button
                                        onClick={(e) => { e.stopPropagation(); setActions(prev => prev.map((a, i) => i === realIdx ? { ...a, listingName: undefined, listingStage: undefined } : a)); }}
                                        className="text-muted-foreground hover:text-red-400 transition-colors ml-0.5"
                                        title="Remove listing"
                                      >
                                        <X className="h-2.5 w-2.5" />
                                      </button>
                                    )}
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Edit pencil — only for non-accepted actions */}
                            {!action.accepted && (
                              <button
                                onClick={() => { setEditingActionIdx(realIdx); setEditingAction({ label: action.label, detail: action.detail ?? "" }); }}
                                className="text-muted-foreground hover:text-foreground transition-colors shrink-0 mt-0.5"
                                title="Edit this action"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                              </button>
                            )}
                          </div>
                          {!action.accepted && action.type === "add_task" && (
                            <div className="pt-1">
                              <Popover
                                open={openDatePickerIdx === realIdx}
                                onOpenChange={(open) => setOpenDatePickerIdx(open ? realIdx : null)}
                              >
                                <PopoverTrigger asChild>
                                  <button className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground border border-border/50 hover:border-primary/50 rounded px-2 py-0.5 transition-colors bg-background/40">
                                    <CalendarIcon className="h-3 w-3" />
                                    {action.dueDate
                                      ? format(action.dueDate, "MMM d")
                                      : "Tomorrow"}
                                  </button>
                                </PopoverTrigger>
                                <PopoverContent className="w-auto p-0 bg-card border-border" align="start">
                                  <div className="flex gap-1 p-2 border-b border-border/40">
                                    {[
                                      { label: "Today",   days: 0 },
                                      { label: "Tomorrow", days: 1 },
                                      { label: "3 days",  days: 3 },
                                      { label: "1 week",  days: 7 },
                                    ].map(({ label, days }) => (
                                      <button
                                        key={label}
                                        onClick={() => {
                                          setActions((prev) => prev.map((a, i) => i === realIdx ? { ...a, dueDate: addDays(new Date(), days) } : a));
                                          setOpenDatePickerIdx(null);
                                        }}
                                        className="text-[11px] px-2 py-0.5 rounded border border-border/60 bg-background/50 text-muted-foreground hover:border-primary/50 hover:text-foreground transition-colors"
                                      >
                                        {label}
                                      </button>
                                    ))}
                                  </div>
                                  <CalendarComponent
                                    mode="single"
                                    selected={action.dueDate ?? addDays(new Date(), 1)}
                                    onSelect={(d) => {
                                      if (d) {
                                        setActions((prev) => prev.map((a, i) => i === realIdx ? { ...a, dueDate: d } : a));
                                      }
                                      setOpenDatePickerIdx(null);
                                    }}
                                    initialFocus
                                  />
                                </PopoverContent>
                              </Popover>
                            </div>
                          )}
                          {!action.accepted && (
                            <div className="flex gap-1.5 pt-0.5">
                              <Button size="sm" className="h-6 text-[11px] px-2 flex-1" onClick={() => acceptAction(realIdx)}>
                                Accept
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-muted-foreground" onClick={() => dismissAction(realIdx)}>
                                Skip
                              </Button>
                            </div>
                          )}
                          {action.accepted && (
                            <div className="flex items-center gap-1 pt-0.5">
                              <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                              <span className="text-[11px] text-green-400">Accepted</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })}

                {/* Add Task button */}
                <button
                  onClick={() => {
                    const contactName = (() => {
                      const cid = resolvedContactId ?? (contactMatch?.status === "found" ? contactMatch.contact.id : null);
                      if (!cid) return undefined;
                      const c = (contacts ?? []).find((x) => x.id === cid);
                      return c ? `${c.firstName} ${c.lastName}` : undefined;
                    })();
                    const newIdx = actions.length;
                    setActions((prev) => [...prev, {
                      type: "add_task",
                      label: "",
                      detail: "",
                      contactName,
                      accepted: false,
                      dismissed: false,
                    }]);
                    setEditingActionIdx(newIdx);
                    setEditingAction({ label: "", detail: "" });
                  }}
                  className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-1.5 rounded border border-dashed border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Task
                </button>
              </div>
            )}

            {activeActions.length === 0 && !contactMatch && (
              <p className="text-xs text-muted-foreground text-center py-4">No actions suggested for this email.</p>
            )}

            {/* Add Task when no actions yet but contact is matched */}
            {activeActions.length === 0 && contactMatch && (
              <button
                onClick={() => {
                  const contactName = (() => {
                    const cid = resolvedContactId ?? (contactMatch?.status === "found" ? contactMatch.contact.id : null);
                    if (!cid) return undefined;
                    const c = (contacts ?? []).find((x) => x.id === cid);
                    return c ? `${c.firstName} ${c.lastName}` : undefined;
                  })();
                  const newIdx = actions.length;
                  setActions((prev) => [...prev, {
                    type: "add_task",
                    label: "",
                    detail: "",
                    contactName,
                    accepted: false,
                    dismissed: false,
                  }]);
                  setEditingActionIdx(newIdx);
                  setEditingAction({ label: "", detail: "" });
                }}
                className="w-full text-xs text-muted-foreground hover:text-foreground flex items-center justify-center gap-1.5 py-2 rounded border border-dashed border-border/50 hover:border-primary/40 hover:bg-primary/5 transition-all"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Task
              </button>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
