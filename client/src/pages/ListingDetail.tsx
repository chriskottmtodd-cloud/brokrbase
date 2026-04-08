import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import {
  ArrowLeft, Building2, DollarSign, Users, Plus, Phone,
  TrendingUp, Bot, BookOpen, MessageSquare, Trash2,
  Send, Loader2, CheckCircle2, X, UserPlus, AlertCircle,
  Zap, Search, PhoneCall, ChevronDown, ChevronUp, Edit2,
  Sparkles, Download, Bell, Star, Pencil, Check, UserCheck, FileText, ExternalLink, Mail,
} from "lucide-react";
import { stageColors, interestStatusColors } from "@/lib/constants";
import { parseLlmJson } from "@/lib/parseLlmJson";

// ─── Agent voice ──────────────────────────────────────────────────────────────
const AGENT_STYLE = `You are an AI agent for a commercial real estate listing managed by Chriskott Todd, Director of Investment Sales at Berkadia Real Estate Advisors in Boise, Idaho. He focuses on multifamily, MHC, and investment properties across Idaho and Montana.

CHRISKOTT'S EMAIL VOICE (use when drafting replies):
- Direct, no fluff. First name only in greeting.
- Short sentences. Fragments are intentional.
- Specific numbers always — prices, cap rates, units, occupancy %.
- Bullets or numbered list when 2+ items.
- End with clear next step or open door for a call.
- Sign off: "Thanks," — never anything else.
- Never: "I hope this email finds you well", "Please don't hesitate", "Best regards", "Touch base".

GENERAL INSTRUCTIONS:
- Answer questions using the knowledge base provided.
- If asked to draft a buyer reply, write in Chriskott's voice above.
- If you lack enough info to answer accurately, say so and suggest what to add to the knowledge base.
- Never invent financial figures or deal terms not in the knowledge base.
- Be concise. Brokers don't have time for long explanations.

CALL/TEXT LOG MODE:
If the user pastes a call or text summary (starts with "LOG:" or contains phrases like "just got off the phone", "texted me", "called about", "left a voicemail"), do NOT respond conversationally. Instead respond ONLY with a JSON object:
{
  "mode": "call_log",
  "summary": "one sentence summary of the interaction",
  "contactName": "name mentioned or empty string",
  "suggestions": [
    { "type": "log_activity|update_interest|add_task", "label": "short label", "detail": "specific detail", "newStatus": "status if update_interest else empty" }
  ]
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────
function looksLikeBuyerEmail(text: string): boolean {
  return /From:\s+\S+/i.test(text) || /Subject:/i.test(text) || text.includes("________") || /^(Hi|Hello|Hey|Good)\s+Chriskott/i.test(text.trim());
}
function looksLikeCallLog(text: string): boolean {
  const t = text.toLowerCase();
  return t.startsWith("log:") || /just got off the phone|texted me|called (me|about)|left a voicemail|quick call|got a text/i.test(text);
}
function extractSenderName(text: string): string {
  const m = text.match(/From:\s+([^\n<]+)/i);
  if (m) return m[1].trim();
  const m2 = text.match(/\n\s*([A-Z][a-z]+ [A-Z][a-z]+)\s*\n/);
  if (m2) return m2[1].trim();
  return "";
}
function extractSenderEmail(text: string): string {
  const m = text.match(/From:\s+[^<]*<([^>]+)>/i) || text.match(/[\w.+-]+@[\w-]+\.\w+/);
  return m ? (m[1] ?? m[0]) : "";
}

// callClaude is defined inside the component to use the tRPC hook — see callClaudeRef below

// ─── Types ────────────────────────────────────────────────────────────────────
interface CRMSuggestion {
  type: "log_activity" | "update_interest" | "add_task";
  label: string;
  detail: string;
  newStatus?: string;
  accepted?: boolean;
  dismissed?: boolean;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ListingDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const listingId = parseInt(id ?? "0");
  const [activeTab,       setActiveTab]       = useState<"overview" | "agent">("overview");
  const [showAddBuyer,    setShowAddBuyer]    = useState(false);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [showEditListing,  setShowEditListing]  = useState(false);
  const [filterStatus,    setFilterStatus]    = useState("all");
  const [editingPriceId,  setEditingPriceId]  = useState<number | null>(null);
  const [priceInput,      setPriceInput]      = useState("");
  const [rankingLoading,  setRankingLoading]  = useState(false);
  const [exportLoading,   setExportLoading]   = useState(false);
  const [marketSummary,   setMarketSummary]   = useState("");

  const { data: listing,  isLoading, refetch: refetchListing } = trpc.listings.byId.useQuery({ id: listingId }, { enabled: !!listingId });
  const { data: buyers,   refetch: refetchBuyers } = trpc.listings.buyerInterests.useQuery({ listingId }, { enabled: !!listingId });
  const { data: sellers,  refetch: refetchSellers } = trpc.listings.getSellers.useQuery({ listingId }, { enabled: !!listingId });
  const updateInterest   = trpc.listings.updateBuyerInterest.useMutation({ onSuccess: () => refetchBuyers() });
  const updatePricePoint = trpc.buyerIntel.updatePricePoint.useMutation({ onSuccess: () => { refetchBuyers(); setEditingPriceId(null); } });
  const rankBuyers       = trpc.buyerIntel.rankBuyers.useMutation();
  const generateReport   = trpc.buyerIntel.generateReport.useMutation();
  const addSeller        = trpc.listings.addSeller.useMutation({ onSuccess: () => refetchSellers() });
  const removeSeller     = trpc.listings.removeSeller.useMutation({ onSuccess: () => refetchSellers() });
  const updateListing    = trpc.listings.update.useMutation({ onSuccess: () => refetchListing() });

  // LLM proxy via tRPC (replaces direct Anthropic API call)
  const invokeLlmMutation = trpc.callIntel.invokeLlm.useMutation();
  const invokeLlmRef = useRef(invokeLlmMutation.mutateAsync);
  invokeLlmRef.current = invokeLlmMutation.mutateAsync;

  async function callClaude(systemPrompt: string, userMessage: string, history: { role: string; content: string }[] = []): Promise<string> {
    const fullPrompt = [
      systemPrompt ? `SYSTEM: ${systemPrompt}\n\n` : "",
      ...history.map(m => `${m.role.toUpperCase()}: ${m.content}\n`),
      `USER: ${userMessage}`,
    ].join("");
    const result = await invokeLlmRef.current({ prompt: fullPrompt, maxTokens: 1000 });
    return typeof result === "string" ? result : result.text;
  }

  // Broker Notes state
  const [editingBrokerNotes, setEditingBrokerNotes] = useState(false);
  const [brokerNotesInput,   setBrokerNotesInput]   = useState("");

  // Record Sale state
  const [showRecordSale,   setShowRecordSale]   = useState(false);

  // Seller search state
  const [sellerSearch,     setSellerSearch]     = useState("");
  const [showSellerSearch, setShowSellerSearch] = useState(false);
  const { data: allContacts } = trpc.contacts.list.useQuery({ limit: 2000 }, { enabled: showSellerSearch });
  const filteredSellerCandidates = useMemo(() => {
    if (!sellerSearch.trim() || !allContacts) return [];
    const q = sellerSearch.toLowerCase();
    const linkedIds = new Set((sellers ?? []).map((s) => s.contactId));
    return allContacts
      .filter((c) => !linkedIds.has(c.id) && (`${c.firstName} ${c.lastName}`.toLowerCase().includes(q) || (c.company ?? "").toLowerCase().includes(q)))
      .slice(0, 6);
  }, [sellerSearch, allContacts, sellers]);

  const handleRankBuyers = async () => {
    setRankingLoading(true);
    try {
      const result = await rankBuyers.mutateAsync({ listingId });
      setMarketSummary(result.marketSummary ?? "");
      refetchBuyers();
      toast.success(`Ranked ${result.ranked.length} buyers`);
    } catch {
      toast.error("Ranking failed");
    } finally {
      setRankingLoading(false);
    }
  };

  const handleExportReport = async () => {
    setExportLoading(true);
    try {
      const result = await generateReport.mutateAsync({ listingId });
      // Trigger browser download
      const bytes = Uint8Array.from(atob(result.pdfBase64), c => c.charCodeAt(0));
      const blob  = new Blob([bytes], { type: "application/pdf" });
      const url   = URL.createObjectURL(blob);
      const a     = document.createElement("a");
      a.href = url; a.download = result.filename; a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded");
    } catch {
      toast.error("Export failed");
    } finally {
      setExportLoading(false);
    }
  };

  // Sort by AI score (new buyers pinned top), then by status weight
  const statusWeight: Record<string, number> = { loi_submitted: 7, under_contract: 8, closed: 9, toured: 6, interested: 5, contacted: 4, prospect: 3, passed: 1 };
  const twoWeeksAgo = new Date(); twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);
  const sortedBuyers = [...(buyers ?? [])].sort((a, b) => {
    const aNew = new Date(a.interest.createdAt) >= twoWeeksAgo ? 1 : 0;
    const bNew = new Date(b.interest.createdAt) >= twoWeeksAgo ? 1 : 0;
    if (aNew !== bNew) return bNew - aNew;
    const aScore = a.interest.aiScore ?? statusWeight[a.interest.status] ?? 3;
    const bScore = b.interest.aiScore ?? statusWeight[b.interest.status] ?? 3;
    return bScore - aScore;
  });
  const filteredBuyers  = sortedBuyers.filter((b) => filterStatus === "all" || b.interest.status === filterStatus);
  const pipelineCounts  = buyers?.reduce((acc, b) => { acc[b.interest.status] = (acc[b.interest.status] ?? 0) + 1; return acc; }, {} as Record<string, number>) ?? {};

  if (isLoading) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" /> Loading...</div>;
  if (!listing)  return <div className="p-6 text-muted-foreground">Listing not found.</div>;

  return (
    <div className="p-6 space-y-5 max-w-6xl">

      {/* Header */}
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/listings")} className="shrink-0 mt-0.5">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{listing.title}</h1>
              <Badge variant="outline" className={`text-xs ${stageColors[listing.stage] ?? ""}`}>{listing.stage.replace("_", " ")}</Badge>
            </div>
            {listing.propertyName && (
              <p className="text-muted-foreground text-sm mt-0.5 flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{listing.propertyName}</p>
            )}
          </div>
          {/* Header buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowEditListing(true)} className="gap-1.5">
              <Edit2 className="h-3.5 w-3.5" />Edit Listing
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowRecordSale(true)} className="gap-1.5 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
              <CheckCircle2 className="h-3.5 w-3.5" />Record Sale
            </Button>
            <Button variant="outline" onClick={() => setShowQuickCapture(true)} className="gap-2 border-primary/40 text-primary hover:bg-primary/10">
              <Zap className="h-4 w-4" /> Quick Capture
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => {
                const params = new URLSearchParams({ listingId: String(listingId) });
                if (listing?.propertyId) params.set("propertyId", String(listing.propertyId));
                if (listing?.ownerContactId) params.set("contactId", String(listing.ownerContactId));
                setLocation(`/email-studio?${params}`);
              }}>
              <Mail className="h-3.5 w-3.5" /> Draft Email
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => {
                const params = new URLSearchParams({ tab: "quicklog", listingId: String(listingId) });
                if (listing?.propertyId) params.set("propertyId", String(listing.propertyId));
                if (listing?.ownerContactId) params.set("contactId", String(listing.ownerContactId));
                setLocation(`/ai?${params}`);
              }}>
              <Zap className="h-3.5 w-3.5" /> Quick Log
            </Button>
            <Button onClick={() => setShowAddBuyer(true)} className="gap-2">
              <Plus className="h-4 w-4" /> Add Buyer
            </Button>
          </div>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-border">
        {[
          { key: "overview", label: "Overview", icon: Building2 },
          { key: "agent",    label: "AI Agent",  icon: Bot },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setActiveTab(key as typeof activeTab)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${activeTab === key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            <Icon className="h-3.5 w-3.5" />{label}
          </button>
        ))}
      </div>

      {/* ── Overview tab ── */}
      {activeTab === "overview" && (
        <div className="space-y-5">
          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {listing.askingPrice && (
              <Card className="border-border bg-card"><CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center"><DollarSign className="h-4 w-4 text-primary" /></div>
                <div><p className="text-lg font-bold text-foreground">${(listing.askingPrice / 1000000).toFixed(2)}M</p><p className="text-xs text-muted-foreground">Asking Price</p></div>
              </CardContent></Card>
            )}
            {listing.capRate && (
              <Card className="border-border bg-card"><CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-green-500/10 flex items-center justify-center"><TrendingUp className="h-4 w-4 text-green-400" /></div>
                <div><p className="text-lg font-bold text-foreground">{listing.capRate}%</p><p className="text-xs text-muted-foreground">Cap Rate</p></div>
              </CardContent></Card>
            )}
            {listing.unitCount && (
              <Card className="border-border bg-card"><CardContent className="p-4 flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-blue-500/10 flex items-center justify-center"><Building2 className="h-4 w-4 text-blue-400" /></div>
                <div><p className="text-lg font-bold text-foreground">{listing.unitCount}</p><p className="text-xs text-muted-foreground">Units</p></div>
              </CardContent></Card>
            )}
            <Card className="border-border bg-card"><CardContent className="p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-purple-500/10 flex items-center justify-center"><Users className="h-4 w-4 text-purple-400" /></div>
              <div><p className="text-lg font-bold text-foreground">{buyers?.length ?? 0}</p><p className="text-xs text-muted-foreground">Interested Buyers</p></div>
            </CardContent></Card>
          </div>

          {/* Property Owner Card */}
          {listing.ownerContactId && (() => {
            const isAlsoSeller = (sellers ?? []).some(s => s.contactId === listing.ownerContactId);
            const ownerName = `${listing.ownerContactFirstName ?? ""} ${listing.ownerContactLastName ?? ""}`.trim();
            const initials = `${listing.ownerContactFirstName?.[0] ?? ""}${listing.ownerContactLastName?.[0] ?? ""}`.toUpperCase();
            return (
              <Card className="border-amber-500/30 bg-amber-500/5">
                <CardHeader className="pb-3">
                  <div className="flex flex-row items-center justify-between gap-2">
                    <CardTitle className="text-sm font-semibold text-amber-400/80 uppercase tracking-wide flex items-center gap-2">
                      <UserCheck className="h-3.5 w-3.5" />Property Owner
                    </CardTitle>
                    {isAlsoSeller && (
                      <Badge variant="outline" className="text-xs border-amber-500/30 text-amber-400">Listed as Seller</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-amber-500/15 flex items-center justify-center text-sm font-semibold text-amber-400 shrink-0">
                        {initials || "?"}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground">{ownerName || "Unknown"}</p>
                        {listing.ownerContactCompany && (
                          <p className="text-xs text-muted-foreground truncate">{listing.ownerContactCompany}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {listing.ownerContactPhone && (
                            <a href={`tel:${listing.ownerContactPhone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <Phone className="h-3 w-3" />{listing.ownerContactPhone}
                            </a>
                          )}
                          {listing.ownerContactEmail && (
                            <a href={`mailto:${listing.ownerContactEmail}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
                              <Mail className="h-3 w-3" />{listing.ownerContactEmail}
                            </a>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1.5 text-amber-400 hover:text-amber-300 hover:bg-amber-500/10 shrink-0"
                      onClick={() => setLocation(`/contacts/${listing.ownerContactId}`)}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />View Contact
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })()}

          {/* Listing Sellers */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <UserCheck className="h-3.5 w-3.5" />Listing Sellers ({sellers?.length ?? 0})
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => setShowSellerSearch(!showSellerSearch)} className="h-7 text-xs gap-1">
                  <Plus className="h-3 w-3" />Link Seller
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {showSellerSearch && (
                <div className="space-y-2">
                  <Input
                    placeholder="Search contacts..."
                    value={sellerSearch}
                    onChange={(e) => setSellerSearch(e.target.value)}
                    className="h-8 text-sm bg-background border-border"
                    autoFocus
                  />
                  {filteredSellerCandidates.length > 0 && (
                    <div className="border border-border rounded-lg overflow-hidden">
                      {filteredSellerCandidates.map((c) => (
                        <button key={c.id} onClick={() => {
                          addSeller.mutate({ listingId, contactId: c.id, role: "seller" });
                          setSellerSearch("");
                          setShowSellerSearch(false);
                        }} className="w-full flex items-center gap-2 px-3 py-2 hover:bg-accent text-left text-sm border-b border-border last:border-0">
                          <div className="h-6 w-6 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">{c.firstName[0]}{c.lastName[0]}</div>
                          <div><p className="font-medium text-foreground">{c.firstName} {c.lastName}</p>{c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}</div>
                        </button>
                      ))}
                    </div>
                  )}
                  {sellerSearch.trim() && filteredSellerCandidates.length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-2">No contacts found</p>
                  )}
                </div>
              )}
              {sellers && sellers.length > 0 ? (
                <div className="space-y-2">
                  {sellers.map((s) => (
                    <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background/50">
                      <div className="flex items-center gap-2">
                        <div className="h-7 w-7 rounded-full bg-amber-500/10 flex items-center justify-center text-xs font-medium text-amber-400">{s.firstName[0]}{s.lastName[0]}</div>
                        <div>
                          <button
                            className="text-sm font-medium text-foreground hover:text-primary transition-colors text-left"
                            onClick={() => setLocation(`/contacts/${s.contactId}`)}
                          >
                            {s.firstName} {s.lastName}
                          </button>
                          {s.company && <p className="text-xs text-muted-foreground">{s.company}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs capitalize">{s.role}</Badge>
                        <button onClick={() => removeSeller.mutate({ id: s.id })} className="text-muted-foreground hover:text-destructive transition-colors"><X className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground text-center py-3">No sellers linked yet — click Link Seller to add contacts involved in this deal.</p>
              )}
            </CardContent>
          </Card>

          {/* Pipeline */}
          {buyers && buyers.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Buyer Pipeline</CardTitle></CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {["prospect","contacted","interested","toured","loi_submitted","under_contract","closed","passed"].map((status) => {
                    const count = pipelineCounts[status] ?? 0;
                    if (!count) return null;
                    return (
                      <button key={status} onClick={() => setFilterStatus(filterStatus === status ? "all" : status)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${interestStatusColors[status]} ${filterStatus === status ? "ring-2 ring-primary" : "border-transparent"}`}>
                        <span className="capitalize">{status.replace("_", " ")}</span>
                        <span className="bg-black/20 rounded-full px-1.5 py-0.5">{count}</span>
                      </button>
                    );
                  })}
                  {filterStatus !== "all" && <button onClick={() => setFilterStatus("all")} className="text-xs text-muted-foreground hover:text-foreground px-2 py-1.5">Show all</button>}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Buyer list */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <Users className="h-3.5 w-3.5" />Buyers ({filteredBuyers.length})
                </CardTitle>
                <div className="flex items-center gap-2 flex-wrap">
                  <Button variant="ghost" size="sm" onClick={() => setShowQuickCapture(true)} className="h-7 text-xs gap-1 text-primary hover:text-primary">
                    <Zap className="h-3 w-3" />Quick
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowAddBuyer(true)} className="h-7 text-xs gap-1">
                    <Plus className="h-3 w-3" />Add
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleRankBuyers} disabled={rankingLoading || !buyers?.length} className="h-7 text-xs gap-1 border-violet-500/40 text-violet-400 hover:bg-violet-500/10">
                    {rankingLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
                    {rankingLoading ? "Ranking…" : "Rank Buyers"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportReport} disabled={exportLoading || !buyers?.length} className="h-7 text-xs gap-1 border-emerald-500/40 text-emerald-400 hover:bg-emerald-500/10">
                    {exportLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Download className="h-3 w-3" />}
                    {exportLoading ? "Generating…" : "Export Report"}
                  </Button>
                </div>
              </div>
              {marketSummary && (
                <div className="mt-3 p-3 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs text-violet-300 leading-relaxed">
                  <span className="font-semibold text-violet-400">AI Market Summary: </span>{marketSummary}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {!filteredBuyers.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Users className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No buyers yet</p>
                  <div className="flex items-center justify-center gap-2 mt-3">
                    <Button variant="outline" size="sm" onClick={() => setShowQuickCapture(true)} className="gap-1.5"><Zap className="h-3.5 w-3.5" />Quick Capture</Button>
                    <Button variant="outline" size="sm" onClick={() => setShowAddBuyer(true)}>Add Buyer</Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredBuyers.map(({ interest, contact }, idx) => {
                    const isNew = new Date(interest.createdAt) >= twoWeeksAgo;
                    const isEditingPrice = editingPriceId === interest.id;
                    return (
                      <div key={interest.id} className="rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors border border-transparent hover:border-border/40">
                        {/* Main row */}
                        <div className="flex items-center gap-3 p-3">
                          {/* Rank badge */}
                          <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                            style={{ background: interest.aiScore != null ? `hsl(${Math.round(interest.aiScore * 12)}, 70%, 25%)` : "hsl(220,10%,20%)",
                              color: interest.aiScore != null ? `hsl(${Math.round(interest.aiScore * 12)}, 80%, 70%)` : "#6b7280" }}>
                            {interest.aiScore != null ? interest.aiScore : idx + 1}
                          </div>
                          <Avatar className="h-9 w-9 border border-border shrink-0">
                            <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">{contact?.firstName?.[0]}{contact?.lastName?.[0]}</AvatarFallback>
                          </Avatar>
                          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => contact && setLocation(`/contacts/${contact.id}`)}>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-foreground">{contact?.firstName} {contact?.lastName}</span>
                              {contact?.company && <span className="text-xs text-muted-foreground">{contact.company}</span>}
                              {isNew && <Badge className="text-[10px] px-1.5 py-0 bg-emerald-500/20 text-emerald-400 border-emerald-500/30">New</Badge>}
                              {interest.aiFollowUpFlag && (
                                <Badge className="text-[10px] px-1.5 py-0 bg-amber-500/20 text-amber-400 border-amber-500/30 gap-1">
                                  <Bell className="h-2.5 w-2.5" />Follow up
                                </Badge>
                              )}
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                              {contact?.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{contact.phone}</span>}
                              {interest.offerAmount && <span className="text-primary font-medium">${(interest.offerAmount / 1000000).toFixed(2)}M offer</span>}
                              {interest.lastContactedAt && <span>Last: {formatDistanceToNow(new Date(interest.lastContactedAt), { addSuffix: true })}</span>}
                            </div>
                          </div>
                          {/* Price point */}
                          <div className="shrink-0 w-36">
                            {isEditingPrice ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  autoFocus
                                  value={priceInput}
                                  onChange={e => setPriceInput(e.target.value)}
                                  onKeyDown={e => {
                                    if (e.key === "Enter") updatePricePoint.mutate({ id: interest.id, pricePointFeedback: priceInput });
                                    if (e.key === "Escape") setEditingPriceId(null);
                                  }}
                                  placeholder="e.g. $2.1M"
                                  className="h-7 text-xs px-2"
                                />
                                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0"
                                  onClick={() => updatePricePoint.mutate({ id: interest.id, pricePointFeedback: priceInput })}>
                                  <Check className="h-3 w-3 text-emerald-400" />
                                </Button>
                              </div>
                            ) : (
                              <button
                                onClick={() => { setEditingPriceId(interest.id); setPriceInput(interest.pricePointFeedback ?? ""); }}
                                className="w-full text-left text-xs px-2 py-1 rounded hover:bg-muted/60 transition-colors group"
                              >
                                {interest.pricePointFeedback
                                  ? <span className="text-primary font-medium">{interest.pricePointFeedback}</span>
                                  : <span className="text-muted-foreground/50 group-hover:text-muted-foreground flex items-center gap-1"><Pencil className="h-2.5 w-2.5" />Price feedback</span>
                                }
                              </button>
                            )}
                          </div>
                          <Select value={interest.status} onValueChange={(v) => updateInterest.mutate({ id: interest.id, status: v as any })}>
                            <SelectTrigger className={`w-36 h-7 text-xs border-0 ${interestStatusColors[interest.status]}`}><SelectValue /></SelectTrigger>
                            <SelectContent>
                              {["prospect","contacted","interested","toured","loi_submitted","under_contract","closed","passed"].map((s) => (
                                <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        {/* AI rationale */}
                        {interest.aiRationale && (
                          <div className="px-4 pb-2.5 text-xs text-muted-foreground/70 italic border-t border-border/20 pt-2">
                            <Sparkles className="h-2.5 w-2.5 inline mr-1 text-violet-400" />{interest.aiRationale}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {listing.description && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Description</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-foreground whitespace-pre-wrap">{listing.description}</p></CardContent>
            </Card>
          )}

          {/* Broker Notes card */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <FileText className="h-3.5 w-3.5 text-primary" />Broker Notes
              </CardTitle>
              {!editingBrokerNotes && (
                <Button
                  size="sm" variant="ghost"
                  className="h-6 text-[11px] text-muted-foreground gap-1"
                  onClick={() => { setBrokerNotesInput(listing.brokerNotes ?? ""); setEditingBrokerNotes(true); }}
                >
                  <Edit2 className="h-3 w-3" />{listing.brokerNotes ? "Edit" : "Add Notes"}
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {editingBrokerNotes ? (
                <div className="space-y-2">
                  <Textarea
                    autoFocus
                    value={brokerNotesInput}
                    onChange={(e) => setBrokerNotesInput(e.target.value)}
                    className="bg-background border-border resize-none text-sm"
                    rows={6}
                    placeholder="Deal notes, fee changes, seller conversations, pricing adjustments…"
                  />
                  <div className="flex gap-2 justify-end">
                    <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingBrokerNotes(false)}>Cancel</Button>
                    <Button
                      size="sm" className="h-7 text-xs gap-1"
                      disabled={updateListing.isPending}
                      onClick={async () => {
                        await updateListing.mutateAsync({ id: listingId, brokerNotes: brokerNotesInput });
                        setEditingBrokerNotes(false);
                        toast.success("Broker notes saved.");
                      }}
                    >
                      {updateListing.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Save
                    </Button>
                  </div>
                </div>
              ) : listing.brokerNotes ? (
                <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{listing.brokerNotes}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No broker notes yet. Notes from Email Studio deal updates will appear here automatically.</p>
              )}
            </CardContent>
          </Card>

          {/* Deal Activity Log */}
          <DealActivityLog listingId={listingId} />
        </div>
      )}

      {/* ── AI Agent tab ── */}
      {activeTab === "agent" && listing && (
        <AgentTab listing={listing} buyers={buyers ?? []} />
      )}

      {showAddBuyer && (
        <AddBuyerModal listingId={listingId} onClose={() => setShowAddBuyer(false)} onSuccess={() => { setShowAddBuyer(false); refetchBuyers(); }} />
      )}
      {showQuickCapture && (
        <QuickCaptureModal listingId={listingId} listingTitle={listing.title} onClose={() => setShowQuickCapture(false)} onSuccess={() => { setShowQuickCapture(false); refetchBuyers(); }} />
      )}
      {showEditListing && listing && (
        <EditListingModal listing={listing} onClose={() => setShowEditListing(false)} onSuccess={() => { setShowEditListing(false); refetchListing(); }} />
      )}
      {showRecordSale && listing && (
        <RecordSaleModal
          listingId={listingId}
          propertyId={listing.propertyId}
          unitCount={listing.unitCount ?? undefined}
          askingPrice={listing.askingPrice ?? undefined}
          onClose={() => setShowRecordSale(false)}
          onSuccess={() => { setShowRecordSale(false); refetchListing(); }}
        />
      )}
    </div>
  );
}

// ─── RecordSaleModal ────────────────────────────────────────────────────────────────────────────────────
function RecordSaleModal({
  listingId, propertyId, unitCount, askingPrice, onClose, onSuccess,
}: {
  listingId: number;
  propertyId: number;
  unitCount?: number;
  askingPrice?: number;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [closingDate,  setClosingDate]  = useState("");
  const [closingPrice, setClosingPrice] = useState(askingPrice ? String(askingPrice) : "");
  const [pricePerUnit, setPricePerUnit] = useState("");
  const [capRate,      setCapRate]      = useState("");
  const [processNote,  setProcessNote]  = useState("");
  const [saving,       setSaving]       = useState(false);

  // Auto-calculate price per unit when closingPrice or unitCount changes
  useEffect(() => {
    const price = parseFloat(closingPrice);
    if (!isNaN(price) && unitCount && unitCount > 0) {
      setPricePerUnit(Math.round(price / unitCount).toString());
    }
  }, [closingPrice, unitCount]);

  const upsertSaleRecord = trpc.properties.upsertSaleRecord.useMutation({
    onSuccess: () => { toast.success("Sale recorded!"); onSuccess(); },
    onError:   (e) => { toast.error(e.message); setSaving(false); },
  });

  function handleSave() {
    if (!closingPrice && !closingDate) { toast.error("Enter at least a closing price or date."); return; }
    setSaving(true);
    upsertSaleRecord.mutate({
      propertyId,
      listingId,
      closingDate:  closingDate  ? new Date(closingDate)          : undefined,
      closingPrice: closingPrice ? parseFloat(closingPrice)       : undefined,
      pricePerUnit: pricePerUnit ? parseFloat(pricePerUnit)       : undefined,
      capRate:      capRate      ? parseFloat(capRate)            : undefined,
      processNote:  processNote  || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />Record Sale
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Closing Date</Label>
              <Input type="date" value={closingDate} onChange={(e) => setClosingDate(e.target.value)} className="bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Closing Price ($)</Label>
              <Input type="number" placeholder="e.g. 4200000" value={closingPrice} onChange={(e) => setClosingPrice(e.target.value)} className="bg-background border-border" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">
                Price Per Unit ($)
                {unitCount && <span className="ml-1 text-muted-foreground/60">auto-calc from {unitCount} units</span>}
              </Label>
              <Input type="number" placeholder="e.g. 85000" value={pricePerUnit} onChange={(e) => setPricePerUnit(e.target.value)} className="bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cap Rate at Sale (%)</Label>
              <Input type="number" step="0.01" placeholder="e.g. 5.25" value={capRate} onChange={(e) => setCapRate(e.target.value)} className="bg-background border-border" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Deal Story (how it came together, who the buyer was, notable details)</Label>
            <Textarea
              value={processNote}
              onChange={(e) => setProcessNote(e.target.value)}
              className="bg-background border-border resize-none"
              rows={4}
              placeholder="e.g. Off-market deal sourced through buyer relationship. Buyer was a local family office. Closed in 45 days with minimal contingencies."
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700 text-white">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
            {saving ? "Saving..." : "Record Sale"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Quick Capture Modal ──────────────────────────────────────────────────────
function QuickCaptureModal({ listingId, listingTitle, onClose, onSuccess }: {
  listingId: number; listingTitle: string; onClose: () => void; onSuccess: () => void;
}) {
  const [searchQuery,     setSearchQuery]     = useState("");
  const [selectedContact, setSelectedContact] = useState<{ id: number; firstName: string; lastName: string; company?: string | null; phone?: string | null } | null>(null);
  const [showNewForm,     setShowNewForm]     = useState(false);
  const [status,          setStatus]          = useState("contacted");
  const [callNote,        setCallNote]        = useState("");
  const [contactType,     setContactType]     = useState<"call" | "text">("call");
  const [isSaving,        setIsSaving]        = useState(false);

  // New contact form fields
  const [newFirst,   setNewFirst]   = useState("");
  const [newLast,    setNewLast]    = useState("");
  const [newPhone,   setNewPhone]   = useState("");
  const [newCompany, setNewCompany] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const { data: allContacts } = trpc.contacts.list.useQuery({ limit: 2000 });

  const filteredContacts = useMemo(() => {
    if (!searchQuery.trim() || !allContacts) return [];
    const q = searchQuery.toLowerCase();
    return allContacts.filter((c) =>
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
      (c.company ?? "").toLowerCase().includes(q) ||
      (c.phone ?? "").includes(q)
    ).slice(0, 6);
  }, [searchQuery, allContacts]);

  const refreshNotes   = trpc.contacts.refreshNotes.useMutation();
  const upsertInterest = trpc.listings.upsertBuyerInterest.useMutation({
    onSuccess: () => {
      toast.success("Buyer captured and logged.");
      // Silently refresh the contact's notes with the new buyer context
      if (selectedContact) {
        const ctx = [`Expressed interest in listing: ${listingTitle}`, callNote ? `Note: ${callNote}` : ""].filter(Boolean).join(" — ");
        refreshNotes.mutate({ contactId: selectedContact.id, newContext: ctx });
      }
      onSuccess();
    },
    onError:   (e) => { toast.error(e.message); setIsSaving(false); },
  });
  const createContact = trpc.contacts.create.useMutation({
    onSuccess: (c) => {
      toast.success(`${c.firstName} ${c.lastName} created.`);
      setSelectedContact({ id: c.id, firstName: c.firstName, lastName: c.lastName, company: c.company, phone: c.phone });
      setShowNewForm(false);
      setIsCreating(false);
      setQuickAddDupWarning([]);
      setQuickAddConfirmed(false);
    },
    onError: (e) => { toast.error(e.message); setIsCreating(false); },
  });
  const checkDupQuickAdd = trpc.contacts.checkDuplicate.useQuery(
    { firstName: newFirst, lastName: newLast, phone: newPhone || undefined },
    { enabled: false }
  );
  const [quickAddDupWarning, setQuickAddDupWarning] = useState<Array<{id:number;firstName:string;lastName:string;company?:string|null}>>([]);
  const [quickAddConfirmed, setQuickAddConfirmed] = useState(false);

  async function handleCreateNew() {
    if (!newFirst.trim()) { toast.error("First name required."); return; }
    if (!quickAddConfirmed) {
      const result = await checkDupQuickAdd.refetch();
      if (result.data && result.data.length > 0) {
        setQuickAddDupWarning(result.data.map((d) => ({ id: d.id, firstName: d.firstName, lastName: d.lastName ?? "", company: d.company })));
        return;
      }
    }
    setIsCreating(true);
    createContact.mutate({ firstName: newFirst, lastName: newLast, phone: newPhone || undefined, company: newCompany || undefined, isBuyer: true, priority: "warm" });
  }

  function handleSave() {
    if (!selectedContact) { toast.error("Select or create a contact first."); return; }
    setIsSaving(true);
    upsertInterest.mutate({
      listingId,
      contactId: selectedContact.id,
      status: status as any,
      notes: callNote ? `[${contactType === "call" ? "Call" : "Text"} logged] ${callNote}` : undefined,
    });
  }

  const canSave = !!selectedContact;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-foreground flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" /> Quick Capture
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{listingTitle} — log a call or text from a buyer</p>
        </DialogHeader>

        <div className="space-y-4 py-1">

          {/* Step 1 — Contact search */}
          {!selectedContact ? (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Who called / texted?</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search by name, company, or phone…"
                  value={searchQuery}
                  onChange={(e) => { setSearchQuery(e.target.value); setShowNewForm(false); }}
                  className="pl-8 bg-background border-border text-sm"
                />
              </div>

              {/* Search results */}
              {filteredContacts.length > 0 && !showNewForm && (
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {filteredContacts.map((c) => (
                    <button key={c.id} onClick={() => { setSelectedContact(c); setSearchQuery(""); }}
                      className="w-full flex items-center gap-3 px-3 py-2 rounded-lg border border-border/50 hover:border-primary/50 hover:bg-primary/5 transition-colors text-left">
                      <Avatar className="h-7 w-7 border border-border shrink-0">
                        <AvatarFallback className="bg-primary/10 text-primary text-[10px] font-semibold">{c.firstName[0]}{c.lastName?.[0]}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground">{c.firstName} {c.lastName}</p>
                        <p className="text-xs text-muted-foreground truncate">{[c.company, c.phone].filter(Boolean).join(" · ")}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {/* No results + create option */}
              {searchQuery.length > 1 && filteredContacts.length === 0 && !showNewForm && (
                <div className="text-center py-3">
                  <p className="text-xs text-muted-foreground mb-2">No match for "{searchQuery}"</p>
                  <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setShowNewForm(true); setNewFirst(searchQuery.split(" ")[0] ?? ""); setNewLast(searchQuery.split(" ").slice(1).join(" ") ?? ""); }}>
                    <UserPlus className="h-3.5 w-3.5" /> Create new contact
                  </Button>
                </div>
              )}

              {/* Create new form */}
              {showNewForm && (
                <div className="space-y-2 p-3 rounded-lg border border-border bg-background/50">
                  <p className="text-xs font-semibold text-foreground flex items-center gap-1.5"><UserPlus className="h-3.5 w-3.5 text-primary" /> New Contact</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-[10px] text-muted-foreground">First Name *</Label>
                      <Input value={newFirst} onChange={(e) => setNewFirst(e.target.value)} className="h-7 text-xs bg-card border-border mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Last Name</Label>
                      <Input value={newLast} onChange={(e) => setNewLast(e.target.value)} className="h-7 text-xs bg-card border-border mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Phone</Label>
                      <Input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="208-555-0000" className="h-7 text-xs bg-card border-border mt-0.5" />
                    </div>
                    <div>
                      <Label className="text-[10px] text-muted-foreground">Company</Label>
                      <Input value={newCompany} onChange={(e) => setNewCompany(e.target.value)} className="h-7 text-xs bg-card border-border mt-0.5" />
                    </div>
                  </div>
                  {quickAddDupWarning.length > 0 && !quickAddConfirmed && (
                    <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2 space-y-1.5 text-xs">
                      <p className="font-semibold text-amber-400">Possible duplicate found</p>
                      {quickAddDupWarning.map((d) => (
                        <div key={d.id} className="flex items-center gap-2">
                          <span className="text-foreground font-medium">{d.firstName} {d.lastName}</span>
                          {d.company && <span className="text-muted-foreground">· {d.company}</span>}
                          <Button size="sm" variant="outline" className="h-5 text-[10px] px-1.5 ml-auto shrink-0"
                            onClick={() => { setSelectedContact({ id: d.id, firstName: d.firstName, lastName: d.lastName, company: d.company ?? null, phone: null }); setShowNewForm(false); setQuickAddDupWarning([]); }}>
                            Use this
                          </Button>
                        </div>
                      ))}
                      <Button size="sm" variant="ghost" className="h-5 text-[10px] text-amber-400 w-full" onClick={() => setQuickAddConfirmed(true)}>Create new anyway</Button>
                    </div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button size="sm" className="h-7 text-xs flex-1" onClick={handleCreateNew} disabled={isCreating || checkDupQuickAdd.isFetching}>
                      {checkDupQuickAdd.isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : isCreating ? <Loader2 className="h-3 w-3 animate-spin" /> : "Create & Select"}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => { setShowNewForm(false); setQuickAddDupWarning([]); setQuickAddConfirmed(false); }}><X className="h-3 w-3" /></Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* Selected contact — show pill with remove */
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Contact</Label>
              <div className="flex items-center gap-2 p-2.5 rounded-lg border border-green-500/30 bg-green-500/5">
                <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{selectedContact.firstName} {selectedContact.lastName}</p>
                  {(selectedContact.company || selectedContact.phone) && (
                    <p className="text-xs text-muted-foreground">{[selectedContact.company, selectedContact.phone].filter(Boolean).join(" · ")}</p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-foreground" onClick={() => setSelectedContact(null)}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Step 2 — Contact type + status + note (only when contact selected) */}
          {selectedContact && (
            <>
              {/* Call or Text */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Type</Label>
                <div className="flex gap-2">
                  {(["call", "text"] as const).map((t) => (
                    <button key={t} onClick={() => setContactType(t)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${contactType === t ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                      {t === "call" ? <PhoneCall className="h-3 w-3" /> : <MessageSquare className="h-3 w-3" />}
                      {t === "call" ? "Call" : "Text"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Buyer status */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Buyer Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="bg-background border-border text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["prospect","contacted","interested","toured","loi_submitted","under_contract","passed"].map((s) => (
                      <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Quick note */}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
                  Note <span className="normal-case font-normal text-muted-foreground/60">— optional</span>
                </Label>
                <Textarea
                  value={callNote}
                  onChange={(e) => setCallNote(e.target.value)}
                  placeholder="Quick summary — interested in pricing, wants T12, asked about assumable debt…"
                  className="bg-background border-border text-sm resize-none"
                  rows={2}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || isSaving} className="gap-2">
            {isSaving ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</> : <><Zap className="h-3.5 w-3.5" /> Log & Save</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Agent Tab ────────────────────────────────────────────────────────────────
function AgentTab({
  listing,
  buyers,
}: {
  listing: { id: number; title: string; unitCount?: number | null; askingPrice?: number | null; capRate?: number | null; stage: string; brokerNotes?: string | null };
  buyers: { interest: { id: number; status: string }; contact?: { id: number; firstName: string; lastName: string; company?: string | null; email?: string | null } | null }[];
}) {
  // LLM proxy via tRPC (replaces direct Anthropic API call)
  const invokeLlmAgent = trpc.callIntel.invokeLlm.useMutation();
  const invokeLlmAgentRef = useRef(invokeLlmAgent.mutateAsync);
  invokeLlmAgentRef.current = invokeLlmAgent.mutateAsync;

  async function callClaude(systemPrompt: string, userMessage: string, history: { role: string; content: string }[] = []): Promise<string> {
    const fullPrompt = [
      systemPrompt ? `SYSTEM: ${systemPrompt}\n\n` : "",
      ...history.map(m => `${m.role.toUpperCase()}: ${m.content}\n`),
      `USER: ${userMessage}`,
    ].join("");
    const result = await invokeLlmAgentRef.current({ prompt: fullPrompt, maxTokens: 1000 });
    return typeof result === "string" ? result : result.text;
  }

  // ── Knowledge base — real tRPC ────────────────────────────────────────────
  const [newTitle,   setNewTitle]   = useState("");
  const [newContent, setNewContent] = useState("");

  const { data: knowledgeData, refetch: refetchKnowledge } = trpc.listingAgent.knowledge.list.useQuery(
    { listingId: listing.id },
    { enabled: !!listing.id },
  );
  const knowledgeItems = knowledgeData ?? [];

  const addKnowledge = trpc.listingAgent.knowledge.add.useMutation({
    onSuccess: () => { setNewTitle(""); setNewContent(""); refetchKnowledge(); toast.success("Added to knowledge base."); },
    onError:   (e) => toast.error(e.message),
  });
  const deleteKnowledge = trpc.listingAgent.knowledge.delete.useMutation({
    onSuccess: () => refetchKnowledge(),
    onError:   (e) => toast.error(e.message),
  });

  // ── Chat history — real tRPC ───────────────────────────────────────────────
  const { data: chatData } = trpc.listingAgent.chat.history.useQuery(
    { listingId: listing.id },
    { enabled: !!listing.id },
  );
  const saveMessage = trpc.listingAgent.chat.saveMessage.useMutation();

  const [chatHistory, setChatHistory] = useState<{ role: "user" | "assistant"; content: string }[]>([]);

  // Seed chat history from DB on first load
  useEffect(() => {
    if (chatData && chatData.length > 0 && chatHistory.length === 0) {
      setChatHistory(chatData.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatData]);
  const [input,       setInput]       = useState("");
  const [isThinking,  setIsThinking]  = useState(false);
  const [inputMode,   setInputMode]   = useState<"chat" | "log">("chat");
  const chatBottomRef = useRef<HTMLDivElement>(null);

  const [suggestions,      setSuggestions]      = useState<CRMSuggestion[]>([]);
  const [detectedSender,   setDetectedSender]   = useState("");
  const [matchedBuyer,     setMatchedBuyer]     = useState<{ id: number; firstName: string; lastName: string; interestStatus: string } | null>(null);
  const [showNewBuyerForm, setShowNewBuyerForm] = useState(false);
  const [newBuyerPrefill,  setNewBuyerPrefill]  = useState({ firstName: "", lastName: "", email: "", company: "" });
  const [isCreatingBuyer,  setIsCreatingBuyer]  = useState(false);
  const [logSummary,       setLogSummary]       = useState("");

  const { data: allContacts } = trpc.contacts.list.useQuery({ limit: 2000 });
  const createContact  = trpc.contacts.create.useMutation({
    onSuccess: (c) => { toast.success(`${c.firstName} ${c.lastName} added.`); setShowNewBuyerForm(false); setIsCreatingBuyer(false); },
    onError:   (e) => { toast.error(e.message); setIsCreatingBuyer(false); },
  });
  const upsertInterest = trpc.listings.upsertBuyerInterest.useMutation({
    onSuccess: () => toast.success("Buyer interest updated."),
    onError:   (e) => toast.error(e.message),
  });

  useEffect(() => { chatBottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [chatHistory, isThinking]);

  function buildSystemPrompt(): string {
    const kbText = knowledgeItems.length > 0
      ? knowledgeItems.map((k) => `### ${k.title}\n${k.content}`).join("\n\n")
      : "No knowledge base entries yet.";
    return `${AGENT_STYLE}\n\n---\nLISTING: ${listing.title}\nUnits: ${listing.unitCount ?? "?"} | Asking: $${listing.askingPrice ? (listing.askingPrice / 1_000_000).toFixed(2) + "M" : "TBD"} | Cap Rate: ${listing.capRate ? listing.capRate + "%" : "TBD"} | Stage: ${listing.stage}\n${listing.brokerNotes ? `Broker Notes: ${listing.brokerNotes}` : ""}\n\nKNOWN BUYERS:\n${buyers.length > 0 ? buyers.map((b) => `- ${b.contact?.firstName} ${b.contact?.lastName}: ${b.interest.status}`).join("\n") : "None yet."}\n\nKNOWLEDGE BASE:\n${kbText}`;
  }

  function checkForBuyerEmail(userMessage: string) {
    if (!looksLikeBuyerEmail(userMessage)) { setSuggestions([]); setDetectedSender(""); setMatchedBuyer(null); setShowNewBuyerForm(false); return; }
    const senderName  = extractSenderName(userMessage);
    const senderEmail = extractSenderEmail(userMessage);
    setDetectedSender(senderName);
    if (senderName && allContacts) {
      const q = senderName.toLowerCase();
      const match = allContacts.find((c) => `${c.firstName} ${c.lastName}`.toLowerCase() === q || c.firstName.toLowerCase() === q.split(" ")[0]);
      if (match) {
        const buyerRecord = buyers.find((b) => b.contact?.id === match.id);
        setMatchedBuyer({ id: match.id, firstName: match.firstName, lastName: match.lastName, interestStatus: buyerRecord?.interest.status ?? "not on this listing" });
        setShowNewBuyerForm(false);
        setSuggestions([
          { type: "log_activity",    label: "Log email activity",           detail: `Log this email exchange with ${match.firstName} ${match.lastName} on ${listing.title}` },
          { type: "update_interest", label: "Update buyer interest status", detail: `Move ${match.firstName} to 'contacted' on this listing`, newStatus: "contacted" },
          { type: "add_task",        label: "Add follow-up task",           detail: `Follow up with ${match.firstName} ${match.lastName} re: ${listing.title}` },
        ]);
      } else {
        setMatchedBuyer(null);
        setNewBuyerPrefill({ firstName: senderName.split(" ")[0] ?? "", lastName: senderName.split(" ").slice(1).join(" ") ?? "", email: senderEmail, company: "" });
        setShowNewBuyerForm(true);
        setSuggestions([]);
      }
    }
  }

  // ── Handle call/text log submission ─────────────────────────────────────────
  async function submitCallLog() {
    const text = logSummary.trim();
    if (!text || isThinking) return;
    setIsThinking(true);
    try {
      const raw   = await callClaude(buildSystemPrompt(), `LOG: ${text}`, []);
      let parsed: { mode?: string; suggestions?: CRMSuggestion[]; summary?: string } | null = null;
      try { parsed = parseLlmJson(raw); } catch { /* not JSON — will fall through to chat */ }
      if (parsed && typeof parsed === "object") {
        if (parsed.mode === "call_log") {
          setSuggestions((parsed.suggestions ?? []).map((s: CRMSuggestion) => ({ ...s, accepted: false, dismissed: false })));
          setLogSummary("");
          toast.success("Call logged — review suggestions below.");
          // Add a brief note to chat for record and persist
          const userContent  = `[Call/Text Log] ${text}`;
          const assistantContent = `Logged: ${parsed.summary ?? text}`;
          setChatHistory((prev) => [...prev,
            { role: "user",      content: userContent },
            { role: "assistant", content: assistantContent },
          ]);
          saveMessage.mutate({ listingId: listing.id, role: "user",      content: userContent });
          saveMessage.mutate({ listingId: listing.id, role: "assistant", content: assistantContent });
          return;
        }
      }
      // Fallback — treat as normal chat
      setChatHistory((prev) => [...prev, { role: "user", content: text }, { role: "assistant", content: raw }]);
      saveMessage.mutate({ listingId: listing.id, role: "user",      content: text });
      saveMessage.mutate({ listingId: listing.id, role: "assistant", content: raw });
      setLogSummary("");
    } catch {
      toast.error("Something went wrong.");
    } finally {
      setIsThinking(false);
    }
  }

  async function sendMessage() {
    const text = input.trim();
    if (!text || isThinking) return;
    setInput("");
    checkForBuyerEmail(text);
    const userMsg: { role: "user" | "assistant"; content: string } = { role: "user", content: text };
    setChatHistory((prev) => [...prev, userMsg]);
    setIsThinking(true);
    try {
      const reply = await callClaude(buildSystemPrompt(), text, chatHistory);
      setChatHistory((prev) => [...prev, { role: "assistant", content: reply }]);
      // Persist both messages
      saveMessage.mutate({ listingId: listing.id, role: "user",      content: text });
      saveMessage.mutate({ listingId: listing.id, role: "assistant", content: reply });
    } catch {
      toast.error("Agent error — try again.");
    } finally {
      setIsThinking(false);
    }
  }

  function saveKnowledgeEntry() {
    if (!newTitle.trim() || !newContent.trim()) { toast.error("Title and content required."); return; }
    addKnowledge.mutate({ listingId: listing.id, title: newTitle.trim(), content: newContent.trim() });
  }

  const logActivityFromListing = trpc.activities.create.useMutation();
  function acceptSuggestion(idx: number) {
    const s = suggestions[idx];
    if (s.type === "update_interest" && matchedBuyer && s.newStatus) {
      const buyerRecord = buyers.find((b) => b.contact?.id === matchedBuyer.id);
      if (buyerRecord) upsertInterest.mutate({ listingId: listing.id, contactId: matchedBuyer.id, status: s.newStatus as any });
    }
    if (s.type === "log_activity" && matchedBuyer) {
      // Create a real activity record linked to both the contact and this listing
      logActivityFromListing.mutate({
        type: "call",
        contactId: matchedBuyer.id,
        listingId: listing.id,
        notes: s.detail,
        subject: s.label,
      });
    }
    setSuggestions((prev) => prev.map((s, i) => i === idx ? { ...s, accepted: true } : s));
  }
  function dismissSuggestion(idx: number) {
    setSuggestions((prev) => prev.map((s, i) => i === idx ? { ...s, dismissed: true } : s));
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">

      {/* ── Left: Knowledge Base ── */}
      <Card className="bg-card border-border">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2"><BookOpen className="h-4 w-4 text-primary" /> Knowledge Base</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">Paste summaries, seller talking points, buyer Q&A, pricing notes — anything the agent should know about this deal.</p>
        </CardHeader>
        <CardContent className="px-4 pb-4 space-y-3">
          {knowledgeItems.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">No entries yet. Add your first one below.</p>
          ) : (
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {knowledgeItems.map((item) => (
                <div key={item.id} className="flex items-start gap-2 p-2.5 rounded-lg bg-background/50 border border-border/50">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-foreground">{item.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.content}</p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-red-400 shrink-0" onClick={() => deleteKnowledge.mutate({ id: item.id })}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <Input placeholder="Entry title (e.g. T12 Summary, Seller Constraints, Buyer FAQ)" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className="h-8 text-xs bg-background border-border" />
            <Textarea placeholder="Paste content here…" value={newContent} onChange={(e) => setNewContent(e.target.value)} className="text-xs bg-background border-border resize-none" rows={4} />
            <Button size="sm" className="w-full h-8 text-xs gap-1.5" onClick={saveKnowledgeEntry} disabled={addKnowledge.isPending || !newTitle.trim() || !newContent.trim()}>
              {addKnowledge.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Save to Knowledge Base
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Right: Chat + Log ── */}
      <div className="space-y-4">
        <Card className="bg-card border-border flex flex-col" style={{ height: "620px" }}>
          <CardHeader className="px-4 pt-4 pb-2 shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold flex items-center gap-2"><MessageSquare className="h-4 w-4 text-primary" /> Agent</CardTitle>
              {chatHistory.length > 0 && (
                <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => setChatHistory([])}>Clear</Button>
              )}
            </div>
            {/* Mode toggle */}
            <div className="flex gap-1 mt-2">
              {([
                { key: "chat", label: "Chat / Email",   icon: MessageSquare },
                { key: "log",  label: "Log Call / Text", icon: PhoneCall },
              ] as const).map(({ key, label, icon: Icon }) => (
                <button key={key} onClick={() => setInputMode(key)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${inputMode === key ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground hover:text-foreground"}`}>
                  <Icon className="h-3 w-3" />{label}
                </button>
              ))}
            </div>
          </CardHeader>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3">
            {chatHistory.length === 0 && (
              <div className="text-center py-10 text-muted-foreground">
                <Bot className="h-10 w-10 mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Agent ready</p>
                <p className="text-xs mt-1 max-w-xs mx-auto">
                  {inputMode === "chat" ? "Ask anything about this listing, or paste a buyer email for a draft reply." : "Summarize a call or text. The agent will surface CRM actions — no need to type it out formally."}
                </p>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-xl px-3 py-2 text-sm leading-relaxed ${msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted/40 text-foreground border border-border/40"}`}>
                  <pre className="whitespace-pre-wrap font-sans">{msg.content}</pre>
                </div>
              </div>
            ))}
            {isThinking && (
              <div className="flex justify-start">
                <div className="bg-muted/40 border border-border/40 rounded-xl px-3 py-2 flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Thinking…</span>
                </div>
              </div>
            )}
            <div ref={chatBottomRef} />
          </div>

          {/* CRM suggestions */}
          {(suggestions.length > 0 || showNewBuyerForm || matchedBuyer) && (
            <div className="px-4 py-2 border-t border-border/40 space-y-2 max-h-52 overflow-y-auto shrink-0">
              {matchedBuyer && (
                <div className="flex items-center gap-2 p-2 rounded border border-green-500/30 bg-green-500/5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" />
                  <span className="text-xs font-medium text-foreground">{matchedBuyer.firstName} {matchedBuyer.lastName}</span>
                  <span className="text-xs text-muted-foreground">· {matchedBuyer.interestStatus}</span>
                </div>
              )}
              {showNewBuyerForm && (
                <div className="space-y-2 p-3 rounded border border-amber-500/30 bg-amber-500/5">
                  <div className="flex items-center gap-1.5 text-xs text-amber-400">
                    <AlertCircle className="h-3.5 w-3.5" /> {detectedSender || "Sender"} not in CRM
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <Input placeholder="First name" value={newBuyerPrefill.firstName} onChange={(e) => setNewBuyerPrefill({ ...newBuyerPrefill, firstName: e.target.value })} className="h-7 text-xs bg-background border-border" />
                    <Input placeholder="Last name"  value={newBuyerPrefill.lastName}  onChange={(e) => setNewBuyerPrefill({ ...newBuyerPrefill, lastName:  e.target.value })} className="h-7 text-xs bg-background border-border" />
                    <Input placeholder="Email"      value={newBuyerPrefill.email}     onChange={(e) => setNewBuyerPrefill({ ...newBuyerPrefill, email:     e.target.value })} className="h-7 text-xs bg-background border-border" />
                    <Input placeholder="Company"    value={newBuyerPrefill.company}   onChange={(e) => setNewBuyerPrefill({ ...newBuyerPrefill, company:   e.target.value })} className="h-7 text-xs bg-background border-border" />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="h-7 text-xs flex-1 gap-1" disabled={isCreatingBuyer}
                      onClick={() => {
                        if (!newBuyerPrefill.firstName.trim()) { toast.error("First name required."); return; }
                        setIsCreatingBuyer(true);
                        createContact.mutate({ firstName: newBuyerPrefill.firstName, lastName: newBuyerPrefill.lastName, email: newBuyerPrefill.email || undefined, company: newBuyerPrefill.company || undefined, isBuyer: true, priority: "warm" });
                      }}>
                      {isCreatingBuyer ? <Loader2 className="h-3 w-3 animate-spin" /> : <><UserPlus className="h-3 w-3" /> Add to CRM</>}
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 text-xs px-2" onClick={() => setShowNewBuyerForm(false)}><X className="h-3 w-3" /></Button>
                  </div>
                </div>
              )}
              {suggestions.filter((s) => !s.dismissed).map((s, i) => {
                const realIdx = suggestions.indexOf(s);
                return (
                  <div key={i} className={`flex items-start gap-2 p-2 rounded border text-xs transition-all ${s.accepted ? "border-green-500/20 bg-green-500/5" : "border-border/40 bg-background/50"}`}>
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium ${s.accepted ? "text-green-400" : "text-foreground"}`}>{s.label}</p>
                      <p className="text-muted-foreground mt-0.5">{s.detail}</p>
                    </div>
                    {s.accepted
                      ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0 mt-0.5" />
                      : <div className="flex gap-1 shrink-0">
                          <Button size="sm" className="h-6 text-[11px] px-2" onClick={() => acceptSuggestion(realIdx)}>Accept</Button>
                          <Button size="sm" variant="ghost" className="h-6 text-[11px] px-2 text-muted-foreground" onClick={() => dismissSuggestion(realIdx)}>Skip</Button>
                        </div>
                    }
                  </div>
                );
              })}
            </div>
          )}

          {/* Input area */}
          <div className="px-4 pb-4 pt-2 shrink-0 border-t border-border/40">
            {inputMode === "chat" ? (
              <>
                <p className="text-[10px] text-muted-foreground mb-1.5">Ask anything about this listing, or paste a buyer email to get a draft reply.</p>
                <div className="flex gap-2">
                  <Textarea value={input} onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                    placeholder="Type a question or paste a buyer email…"
                    className="text-sm bg-background border-border resize-none flex-1" rows={2} />
                  <Button onClick={sendMessage} disabled={isThinking || !input.trim()} className="self-end h-9 w-9 p-0 shrink-0">
                    {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            ) : (
              <>
                <p className="text-[10px] text-muted-foreground mb-1.5">Summarize the call or text — the agent will surface CRM actions.</p>
                <div className="flex gap-2">
                  <Textarea value={logSummary} onChange={(e) => setLogSummary(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitCallLog(); } }}
                    placeholder="e.g. Jay called, interested in pricing, wants to see T12 before making a move…"
                    className="text-sm bg-background border-border resize-none flex-1" rows={2} />
                  <Button onClick={submitCallLog} disabled={isThinking || !logSummary.trim()} className="self-end h-9 w-9 p-0 shrink-0">
                    {isThinking ? <Loader2 className="h-4 w-4 animate-spin" /> : <PhoneCall className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ─── AddBuyerModal ────────────────────────────────────────────────────────────
function AddBuyerModal({ listingId, onClose, onSuccess }: { listingId: number; onClose: () => void; onSuccess: () => void }) {
  const [contactId, setContactId] = useState("");
  const [status,    setStatus]    = useState("prospect");
  const [notes,     setNotes]     = useState("");
  const { data: buyerContacts } = trpc.contacts.list.useQuery({ isBuyer: true, limit: 200 });
  const refreshNotes = trpc.contacts.refreshNotes.useMutation();
  const upsert = trpc.listings.upsertBuyerInterest.useMutation({
    onSuccess: () => {
      toast.success("Buyer added!");
      // Silently refresh the contact's notes with the new buyer context
      if (contactId) {
        const ctx = `Added as interested buyer for listing ID ${listingId}${notes ? " — " + notes : ""}`;
        refreshNotes.mutate({ contactId: parseInt(contactId), newContext: ctx });
      }
      onSuccess();
    },
    onError:   (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Add Buyer Interest</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Buyer *</Label>
            <Select value={contactId} onValueChange={setContactId}>
              <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select buyer..." /></SelectTrigger>
              <SelectContent>{buyerContacts?.map((b) => <SelectItem key={b.id} value={String(b.id)}>{b.firstName} {b.lastName}{b.company ? ` — ${b.company}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent>{["prospect","contacted","interested","toured","loi_submitted"].map((s) => <SelectItem key={s} value={s}>{s.replace(/_/g, " ")}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="bg-background border-border resize-none" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (!contactId) return toast.error("Select a buyer"); upsert.mutate({ listingId, contactId: parseInt(contactId), status: status as any, notes: notes || undefined }); }} disabled={upsert.isPending}>
            {upsert.isPending ? "Adding..." : "Add Buyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Edit Listing Modal ───────────────────────────────────────────────────────
function EditListingModal({ listing, onClose, onSuccess }: { listing: any; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    title:         listing.title         ?? "",
    description:   listing.description   ?? "",
    stage:         listing.stage         ?? "active",
    status:        listing.status        ?? "active",
    askingPrice:   listing.askingPrice   != null ? String(listing.askingPrice)  : "",
    capRate:       listing.capRate       != null ? String(listing.capRate)      : "",
    noi:           listing.noi           != null ? String(listing.noi)          : "",
    unitCount:     listing.unitCount     != null ? String(listing.unitCount)    : "",
    brokerNotes:   listing.brokerNotes   ?? "",
    marketingMemo: listing.marketingMemo ?? "",
  });

  const update = trpc.listings.update.useMutation({
    onSuccess: () => { toast.success("Listing updated!"); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });

  function handleSave() {
    update.mutate({
      id:            listing.id,
      title:         form.title         || undefined,
      description:   form.description   || undefined,
      stage:         form.stage         as any,
      status:        form.status        as any,
      askingPrice:   form.askingPrice   ? parseFloat(form.askingPrice)  : undefined,
      capRate:       form.capRate       ? parseFloat(form.capRate)      : undefined,
      noi:           form.noi           ? parseFloat(form.noi)          : undefined,
      unitCount:     form.unitCount     ? parseInt(form.unitCount)      : undefined,
      brokerNotes:   form.brokerNotes   || undefined,
      marketingMemo: form.marketingMemo || undefined,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-foreground">Edit Listing</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Title *</Label>
            <Input value={form.title} onChange={(e) => setForm(f => ({...f, title: e.target.value}))} className="bg-background border-border" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Stage</Label>
              <Select value={form.stage} onValueChange={(v) => setForm(f => ({...f, stage: v}))}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">New</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="under_contract">Under Contract</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm(f => ({...f, status: v}))}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="under_contract">Under Contract</SelectItem>
                  <SelectItem value="sold">Sold</SelectItem>
                  <SelectItem value="withdrawn">Withdrawn</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Asking Price ($)</Label>
              <Input type="number" value={form.askingPrice} onChange={(e) => setForm(f => ({...f, askingPrice: e.target.value}))} className="bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Cap Rate (%)</Label>
              <Input type="number" value={form.capRate} onChange={(e) => setForm(f => ({...f, capRate: e.target.value}))} className="bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">NOI ($)</Label>
              <Input type="number" value={form.noi} onChange={(e) => setForm(f => ({...f, noi: e.target.value}))} className="bg-background border-border" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Unit Count</Label>
              <Input type="number" value={form.unitCount} onChange={(e) => setForm(f => ({...f, unitCount: e.target.value}))} className="bg-background border-border" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Description</Label>
            <Textarea value={form.description} onChange={(e) => setForm(f => ({...f, description: e.target.value}))} className="bg-background border-border resize-none" rows={3} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Broker Notes (internal)</Label>
            <Textarea value={form.brokerNotes} onChange={(e) => setForm(f => ({...f, brokerNotes: e.target.value}))} className="bg-background border-border resize-none" rows={3} placeholder="Internal notes, seller constraints, pricing rationale…" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Marketing Memo</Label>
            <Textarea value={form.marketingMemo} onChange={(e) => setForm(f => ({...f, marketingMemo: e.target.value}))} className="bg-background border-border resize-none" rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={update.isPending || !form.title}>
            {update.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Deal Activity Log ────────────────────────────────────────────────────────
const activityTypeConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  loi:          { label: "LOI",          color: "text-purple-400 bg-purple-500/10 border-purple-500/20", icon: <FileText className="h-3 w-3" /> },
  offer:        { label: "Offer",        color: "text-green-400 bg-green-500/10 border-green-500/20",   icon: <DollarSign className="h-3 w-3" /> },
  call:         { label: "Call",         color: "text-blue-400 bg-blue-500/10 border-blue-500/20",      icon: <PhoneCall className="h-3 w-3" /> },
  email:        { label: "Email",        color: "text-sky-400 bg-sky-500/10 border-sky-500/20",         icon: <Send className="h-3 w-3" /> },
  note:         { label: "Note",         color: "text-muted-foreground bg-muted/30 border-border",      icon: <BookOpen className="h-3 w-3" /> },
  price_change: { label: "Price",        color: "text-amber-400 bg-amber-500/10 border-amber-500/20",   icon: <TrendingUp className="h-3 w-3" /> },
  stage_change: { label: "Stage",        color: "text-orange-400 bg-orange-500/10 border-orange-500/20",icon: <Zap className="h-3 w-3" /> },
  buyer_added:  { label: "Buyer",        color: "text-teal-400 bg-teal-500/10 border-teal-500/20",      icon: <UserPlus className="h-3 w-3" /> },
  document:     { label: "Document",     color: "text-indigo-400 bg-indigo-500/10 border-indigo-500/20",icon: <FileText className="h-3 w-3" /> },
  other:        { label: "Note",         color: "text-muted-foreground bg-muted/30 border-border",      icon: <BookOpen className="h-3 w-3" /> },
};

function DealActivityLog({ listingId }: { listingId: number }) {
  const { data: activities, refetch } = trpc.listings.dealActivities.useQuery({ listingId }, { enabled: !!listingId });
  const createActivity = trpc.listings.createDealActivity.useMutation({ onSuccess: () => refetch() });
  const [showAdd, setShowAdd] = useState(false);
  const [newType, setNewType] = useState<"loi" | "offer" | "call" | "email" | "note" | "price_change" | "stage_change" | "buyer_added" | "document" | "other">("note");
  const [newSummary, setNewSummary] = useState("");

  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Bell className="h-3.5 w-3.5 text-primary" />Deal Activity
        </CardTitle>
        <Button size="sm" variant="ghost" className="h-6 text-[11px] text-muted-foreground gap-1" onClick={() => setShowAdd(v => !v)}>
          <Plus className="h-3 w-3" />Add Entry
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAdd && (
          <div className="border border-border rounded-md p-3 space-y-2 bg-muted/20">
            <div className="flex gap-2">
              <Select value={newType} onValueChange={(v) => setNewType(v as typeof newType)}>
                <SelectTrigger className="h-7 text-xs w-36 bg-background border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(activityTypeConfig).map(([k, v]) => (
                    <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Textarea
              autoFocus
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              className="bg-background border-border resize-none text-sm"
              rows={3}
              placeholder="Describe what happened…"
            />
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowAdd(false); setNewSummary(""); }}>Cancel</Button>
              <Button
                size="sm" className="h-7 text-xs gap-1"
                disabled={!newSummary.trim() || createActivity.isPending}
                onClick={async () => {
                  await createActivity.mutateAsync({ listingId, type: newType, summary: newSummary.trim() });
                  setShowAdd(false);
                  setNewSummary("");
                  toast.success("Deal activity logged.");
                }}
              >
                {createActivity.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}Save
              </Button>
            </div>
          </div>
        )}
        {(!activities || activities.length === 0) && !showAdd && (
          <p className="text-sm text-muted-foreground italic">No deal activity yet. LOIs, calls, and updates from Email Studio and AI Assistant will appear here automatically.</p>
        )}
        {activities && activities.length > 0 && (
          <div className="space-y-2">
            {activities.map((a) => {
              const cfg = activityTypeConfig[a.type] ?? activityTypeConfig.other;
              const isPropertyActivity = (a as { source?: string }).source === "property";
              const contactName = (a as { contactName?: string | null }).contactName;
              return (
                <div key={a.id} className="flex gap-3 items-start">
                  <div className={`mt-0.5 flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-medium shrink-0 ${cfg.color}`}>
                    {cfg.icon}{cfg.label}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground leading-snug">{a.summary}</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{new Date(a.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
                      {contactName && <span className="text-muted-foreground/70">· {contactName}</span>}
                      {isPropertyActivity && (
                        <span className="px-1 py-0 rounded bg-muted/40 border border-border text-[10px] text-muted-foreground/60">property log</span>
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
