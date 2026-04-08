import { trpc } from "@/lib/trpc";
import { useState, useMemo, useCallback } from "react";
import { useParams, useLocation } from "wouter";
import { addDays } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { ActivityDetailModal } from "@/components/ActivityDetailModal";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  ArrowLeft, Phone, Mail, Building2, MapPin, Edit2, Plus,
  Activity, Calendar, MessageSquare, Clock, Target, Search,
  CheckCircle2, Loader2, Trash2, ChevronRight, ChevronDown, ChevronUp, ListChecks, Sparkles, Zap,
} from "lucide-react";
import { priorityColors, PROPERTY_TYPES } from "@/lib/constants";
import { parseLlmJson } from "@/lib/parseLlmJson";
import { PhoneList } from "@/components/PhoneList";

const activityTypeIcons: Record<string, React.ReactNode> = {
  call: <Phone className="h-3.5 w-3.5" />,
  email: <Mail className="h-3.5 w-3.5" />,
  meeting: <Calendar className="h-3.5 w-3.5" />,
  note: <MessageSquare className="h-3.5 w-3.5" />,
  text: <MessageSquare className="h-3.5 w-3.5" />,
  voicemail: <Phone className="h-3.5 w-3.5" />,
};

const STATUS_OPTIONS = [
  { value: "researching", label: "Researching" },
  { value: "prospecting", label: "Prospecting" },
  { value: "seller", label: "Seller" },
  { value: "listed", label: "Listed" },
  { value: "recently_sold", label: "Recently Sold" },
];

// ─── Buyer Criteria Editor ────────────────────────────────────────────────────
function BuyerCriteriaPanel({ contactId }: { contactId: number }) {
  const utils = trpc.useUtils();
  const { data: criteria, isLoading } = trpc.buyerCriteria.get.useQuery({ contactId });
  const { data: matchResult, isLoading: isMatching, refetch: refetchMatches } = trpc.buyerCriteria.matchProperties.useQuery({ contactId });

  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({
    propertyTypes: [] as string[],
    minUnits: "",
    maxUnits: "",
    minVintageYear: "",
    maxVintageYear: "",
    minPrice: "",
    maxPrice: "",
    markets: "",
    states: "",
    notes: "",
  });

  const upsert = trpc.buyerCriteria.upsert.useMutation({
    onSuccess: () => {
      toast.success("Buyer criteria saved!");
      utils.buyerCriteria.get.invalidate({ contactId });
      utils.buyerCriteria.matchProperties.invalidate({ contactId });
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCriteria = trpc.buyerCriteria.delete.useMutation({
    onSuccess: () => {
      toast.success("Criteria cleared");
      utils.buyerCriteria.get.invalidate({ contactId });
      utils.buyerCriteria.matchProperties.invalidate({ contactId });
    },
    onError: (e) => toast.error(e.message),
  });

  const startEditing = () => {
    if (criteria) {
      setForm({
        propertyTypes: criteria.propertyTypes ? JSON.parse(criteria.propertyTypes) : [],
        minUnits: criteria.minUnits != null ? String(criteria.minUnits) : "",
        maxUnits: criteria.maxUnits != null ? String(criteria.maxUnits) : "",
        minVintageYear: criteria.minVintageYear != null ? String(criteria.minVintageYear) : "",
        maxVintageYear: criteria.maxVintageYear != null ? String(criteria.maxVintageYear) : "",
        minPrice: criteria.minPrice != null ? String(criteria.minPrice) : "",
        maxPrice: criteria.maxPrice != null ? String(criteria.maxPrice) : "",
        markets: criteria.markets ? JSON.parse(criteria.markets).join(", ") : "",
        states: criteria.states ? JSON.parse(criteria.states).join(", ") : "",
        notes: criteria.notes ?? "",
      });
    } else {
      setForm({ propertyTypes: [], minUnits: "", maxUnits: "", minVintageYear: "", maxVintageYear: "", minPrice: "", maxPrice: "", markets: "", states: "", notes: "" });
    }
    setEditing(true);
  };

  const save = () => {
    upsert.mutate({
      contactId,
      propertyTypes: form.propertyTypes.length > 0 ? form.propertyTypes as any[] : undefined,
      minUnits: form.minUnits ? parseInt(form.minUnits) : undefined,
      maxUnits: form.maxUnits ? parseInt(form.maxUnits) : undefined,
      minVintageYear: form.minVintageYear ? parseInt(form.minVintageYear) : undefined,
      maxVintageYear: form.maxVintageYear ? parseInt(form.maxVintageYear) : undefined,
      minPrice: form.minPrice ? parseFloat(form.minPrice) : undefined,
      maxPrice: form.maxPrice ? parseFloat(form.maxPrice) : undefined,
      markets: form.markets ? form.markets.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      states: form.states ? form.states.split(",").map(s => s.trim()).filter(Boolean) : undefined,
      notes: form.notes || undefined,
    });
  };

  const toggleType = (val: string) => {
    setForm(f => ({
      ...f,
      propertyTypes: f.propertyTypes.includes(val)
        ? f.propertyTypes.filter(t => t !== val)
        : [...f.propertyTypes, val],
    }));
  };

  if (isLoading) return <div className="py-4 flex items-center gap-2 text-muted-foreground text-sm"><Loader2 className="h-4 w-4 animate-spin" />Loading criteria...</div>;

  return (
    <div className="space-y-4">
      {/* Criteria Card */}
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-green-400" />
            Buyer Criteria
          </CardTitle>
          <div className="flex gap-2">
            {criteria && !editing && (
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-400" onClick={() => deleteCriteria.mutate({ contactId })}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={editing ? () => setEditing(false) : startEditing}>
              {editing ? "Cancel" : criteria ? <><Edit2 className="h-3 w-3" />Edit</> : <><Plus className="h-3 w-3" />Set Criteria</>}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!editing && !criteria && (
            <div className="text-center py-6 text-muted-foreground">
              <Target className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No criteria set yet</p>
              <p className="text-xs mt-1">Define what this buyer is looking for to auto-match against your inventory</p>
              <Button variant="outline" size="sm" className="mt-3" onClick={startEditing}>Set Buyer Criteria</Button>
            </div>
          )}

          {!editing && criteria && (
            <div className="space-y-3 text-sm">
              {criteria.propertyTypes && (
                <div>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">Property Types</span>
                  <div className="flex flex-wrap gap-1.5 mt-1">
                    {(JSON.parse(criteria.propertyTypes) as string[]).map(t => (
                      <Badge key={t} variant="outline" className="text-xs capitalize bg-green-500/10 text-green-400 border-green-500/30">
                        {PROPERTY_TYPES.find(p => p.value === t)?.label ?? t}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {(criteria.minUnits != null || criteria.maxUnits != null) && (
                  <div>
                    <span className="text-xs text-muted-foreground">Units</span>
                    <p className="text-foreground font-medium">
                      {criteria.minUnits != null ? criteria.minUnits : "Any"} – {criteria.maxUnits != null ? criteria.maxUnits : "Any"}
                    </p>
                  </div>
                )}
                {(criteria.minVintageYear != null || criteria.maxVintageYear != null) && (
                  <div>
                    <span className="text-xs text-muted-foreground">Vintage Year</span>
                    <p className="text-foreground font-medium">
                      {criteria.minVintageYear ?? "Any"} – {criteria.maxVintageYear ?? "Any"}
                    </p>
                  </div>
                )}
                {(criteria.minPrice != null || criteria.maxPrice != null) && (
                  <div>
                    <span className="text-xs text-muted-foreground">Price Range</span>
                    <p className="text-foreground font-medium">
                      {criteria.minPrice != null ? `$${(criteria.minPrice / 1_000_000).toFixed(1)}M` : "Any"} – {criteria.maxPrice != null ? `$${(criteria.maxPrice / 1_000_000).toFixed(1)}M` : "Any"}
                    </p>
                  </div>
                )}
                {criteria.markets && (
                  <div>
                    <span className="text-xs text-muted-foreground">Markets</span>
                    <p className="text-foreground font-medium">{(JSON.parse(criteria.markets) as string[]).join(", ")}</p>
                  </div>
                )}
                {criteria.states && (
                  <div>
                    <span className="text-xs text-muted-foreground">States</span>
                    <p className="text-foreground font-medium">{(JSON.parse(criteria.states) as string[]).join(", ")}</p>
                  </div>
                )}
              </div>
              {criteria.notes && (
                <div>
                  <span className="text-xs text-muted-foreground">Notes</span>
                  <p className="text-foreground text-sm mt-0.5 whitespace-pre-wrap">{criteria.notes}</p>
                </div>
              )}
            </div>
          )}

          {editing && (
            <div className="space-y-4">
              {/* Property Types */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Property Types (leave blank = any)</Label>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {PROPERTY_TYPES.map(t => (
                    <div key={t.value} className="flex items-center gap-2">
                      <Checkbox
                        id={`type-${t.value}`}
                        checked={form.propertyTypes.includes(t.value)}
                        onCheckedChange={() => toggleType(t.value)}
                      />
                      <label htmlFor={`type-${t.value}`} className="text-sm text-foreground cursor-pointer">{t.label}</label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Unit Count */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Unit Count Range</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <Input placeholder="Min units" value={form.minUnits} onChange={e => setForm(f => ({ ...f, minUnits: e.target.value }))} className="bg-background border-border" type="number" min="0" />
                  <Input placeholder="Max units" value={form.maxUnits} onChange={e => setForm(f => ({ ...f, maxUnits: e.target.value }))} className="bg-background border-border" type="number" min="0" />
                </div>
              </div>

              {/* Vintage Year */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Vintage Year Range</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <Input placeholder="Built after (e.g. 1970)" value={form.minVintageYear} onChange={e => setForm(f => ({ ...f, minVintageYear: e.target.value }))} className="bg-background border-border" type="number" />
                  <Input placeholder="Built before (e.g. 2000)" value={form.maxVintageYear} onChange={e => setForm(f => ({ ...f, maxVintageYear: e.target.value }))} className="bg-background border-border" type="number" />
                </div>
              </div>

              {/* Price Range */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Price Range ($)</Label>
                <div className="grid grid-cols-2 gap-2 mt-1.5">
                  <Input placeholder="Min price (e.g. 1000000)" value={form.minPrice} onChange={e => setForm(f => ({ ...f, minPrice: e.target.value }))} className="bg-background border-border" type="number" min="0" />
                  <Input placeholder="Max price (e.g. 10000000)" value={form.maxPrice} onChange={e => setForm(f => ({ ...f, maxPrice: e.target.value }))} className="bg-background border-border" type="number" min="0" />
                </div>
              </div>

              {/* Markets */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Markets (cities or counties, comma-separated)</Label>
                <Input placeholder="e.g. Nampa, Boise, Canyon County" value={form.markets} onChange={e => setForm(f => ({ ...f, markets: e.target.value }))} className="bg-background border-border mt-1.5" />
              </div>

              {/* States */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">States (comma-separated)</Label>
                <Input placeholder="e.g. ID, OR, WA" value={form.states} onChange={e => setForm(f => ({ ...f, states: e.target.value }))} className="bg-background border-border mt-1.5" />
              </div>

              {/* Notes */}
              <div>
                <Label className="text-xs text-muted-foreground uppercase tracking-wide">Additional Notes</Label>
                <Textarea placeholder="Any other preferences or requirements..." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="bg-background border-border resize-none mt-1.5" rows={3} />
              </div>

              <div className="flex gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancel</Button>
                <Button size="sm" onClick={save} disabled={upsert.isPending} className="gap-1.5">
                  {upsert.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                  Save Criteria
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Matched Properties */}
      {criteria && (
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Search className="h-3.5 w-3.5 text-primary" />
              Matching Properties
              {matchResult && (
                <Badge variant="outline" className="text-[10px] bg-primary/10 text-primary border-primary/30 ml-1">
                  {matchResult.matches.length} match{matchResult.matches.length !== 1 ? "es" : ""}
                </Badge>
              )}
            </CardTitle>
            <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => refetchMatches()}>
              Refresh
            </Button>
          </CardHeader>
          <CardContent>
            {isMatching ? (
              <div className="flex items-center gap-2 text-muted-foreground text-sm py-4">
                <Loader2 className="h-4 w-4 animate-spin" />Scanning inventory...
              </div>
            ) : !matchResult?.matches.length ? (
              <div className="text-center py-6 text-muted-foreground">
                <Search className="h-8 w-8 mx-auto mb-2 opacity-20" />
                <p className="text-sm">No properties match these criteria</p>
                <p className="text-xs mt-1">Try widening the unit count range, price range, or removing market filters</p>
              </div>
            ) : (
              <MatchedPropertyList matches={matchResult.matches} />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function MatchedPropertyList({ matches }: { matches: any[] }) {
  const [, setLocation] = useLocation();
  return (
    <div className="space-y-2">
      {matches.map(prop => (
        <div
          key={prop.id}
          className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors border border-border/50 group"
          onClick={() => setLocation(`/properties/${prop.id}`)}
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-medium text-foreground truncate">{prop.name}</p>
              <Badge variant="outline" className="text-[10px] capitalize shrink-0">{prop.status.replace("_", " ")}</Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-0.5">
              {[prop.city, prop.state].filter(Boolean).join(", ")}
              {prop.unitCount ? ` · ${prop.unitCount} units` : ""}
              {prop.vintageYear ? ` · ${prop.vintageYear}` : ""}
              {prop.askingPrice ? ` · $${(prop.askingPrice / 1_000_000).toFixed(2)}M` : prop.estimatedValue ? ` · ~$${(prop.estimatedValue / 1_000_000).toFixed(2)}M` : ""}
            </p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground/40 shrink-0 group-hover:text-muted-foreground transition-colors" />
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ContactDetail() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const contactId = parseInt(id ?? "0");
  const [showLogActivity, setShowLogActivity] = useState(false);
  const [openActivityId, setOpenActivityId] = useState<number | null>(null);
  const [showEditContact, setShowEditContact] = useState(false);

  // Map-aware back navigation: detect ?from=map&propertyId=X
  const searchParams = new URLSearchParams(window.location.search);
  const fromMap = searchParams.get("from") === "map";
  const mapPropertyId = searchParams.get("propertyId");
  const backDestination = fromMap
    ? `/map${mapPropertyId ? `?highlight=${mapPropertyId}` : ""}`
    : "/contacts";

  const [showAddLink, setShowAddLink] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkType, setLinkType] = useState<"property" | "listing">("property");
  const utils = trpc.useUtils();
  const { data: contact, isLoading, refetch } = trpc.contacts.byId.useQuery({ id: contactId }, { enabled: !!contactId });
  const { data: activities, refetch: refetchActivities } = trpc.contacts.getActivitiesForContact.useQuery({ contactId, limit: 20 }, { enabled: !!contactId });
  const { data: properties } = trpc.contacts.getPropertiesForContact.useQuery({ contactId }, { enabled: !!contactId });
  const { data: upcomingTasks } = trpc.tasks.list.useQuery({ contactId, status: "pending", limit: 10 }, { enabled: !!contactId });
  const { data: contactLinks, refetch: refetchLinks } = trpc.contactLinks.listForContact.useQuery({ contactId }, { enabled: !!contactId });
  const { data: dealConnections } = trpc.contactLinks.getDealConnections.useQuery({ contactId }, { enabled: !!contactId });
  const [dealLinkSuggestions, setDealLinkSuggestions] = useState<Array<{ type: string; id: number; name: string; listingId?: number; propertyId?: number }>>([]);
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<number>>(new Set());
  const confirmSuggestion = trpc.contactLinks.create.useMutation({
    onSuccess: () => { refetchLinks(); },
    onError: (e) => toast.error(e.message),
  });
  const { data: allProperties } = trpc.properties.list.useQuery({ limit: 10000 }, { enabled: showAddLink && linkType === "property" });
  const { data: allListings }   = trpc.listings.list.useQuery({}, { enabled: showAddLink && linkType === "listing" });
  const { data: extraEmails, refetch: refetchEmails } = trpc.contactEmails.list.useQuery({ contactId }, { enabled: !!contactId });
  const { data: contactConnections } = trpc.ownerResearch.getContactConnections.useQuery({ contactId }, { enabled: !!contactId });
  const [showAddEmail, setShowAddEmail] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const addEmail = trpc.contactEmails.add.useMutation({
    onSuccess: () => { refetchEmails(); setNewEmail(""); setShowAddEmail(false); toast.success("Email added"); },
    onError: () => toast.error("Failed to add email"),
  });
  const removeEmail = trpc.contactEmails.remove.useMutation({
    onSuccess: () => { refetchEmails(); toast.success("Email removed"); },
    onError: () => toast.error("Failed to remove email"),
  });
  const setPrimaryEmail = trpc.contactEmails.setPrimary.useMutation({
    onSuccess: () => { refetch(); refetchEmails(); toast.success("Primary email updated"); },
    onError: () => toast.error("Failed to update primary email"),
  });
  const createLink = trpc.contactLinks.create.useMutation({
    onSuccess: () => { refetchLinks(); setShowAddLink(false); setLinkSearch(""); toast.success("Link added."); },
    onError: (e) => toast.error(e.message),
  });
  const deleteLink = trpc.contactLinks.delete.useMutation({
    onSuccess: () => { refetchLinks(); toast.success("Link removed."); },
    onError: (e) => toast.error(e.message),
  });
  const updateLinkRole = trpc.contactLinks.updateRole.useMutation({
    onSuccess: () => refetchLinks(),
    onError: () => toast.error("Failed to update role"),
  });
  const [showDeleteContact, setShowDeleteContact] = useState(false);
  const deleteContact = trpc.contacts.delete.useMutation({
    onSuccess: () => { toast.success("Contact deleted"); setLocation("/contacts"); },
    onError: (e) => toast.error(e.message),
  });
  const DEAL_ROLES = [
    { value: "owner", label: "Owner" },
    { value: "seller", label: "Seller" },
    { value: "buyer", label: "Buyer" },
    { value: "buyers_broker", label: "Buyer's Broker" },
    { value: "listing_agent", label: "Listing Agent" },
    { value: "property_manager", label: "Property Manager" },
    { value: "attorney", label: "Attorney" },
    { value: "lender", label: "Lender" },
    { value: "other", label: "Other" },
  ];
  const refreshNotes = trpc.contacts.refreshNotes.useMutation({
    onSuccess: () => { refetch(); toast.success("Notes refreshed by AI."); },
    onError: (e) => toast.error(e.message ?? "Failed to refresh notes"),
  });

  // ─── Task completion state & mutations ─────────────────────────────────
  const [completingTaskId, setCompletingTaskId] = useState<number | null>(null);
  const [completionNote, setCompletionNote] = useState("");
  const [isCompletingTask, setIsCompletingTask] = useState(false);
  const [showFollowUpFor, setShowFollowUpFor] = useState<number | null>(null);
  const [fuTitle, setFuTitle] = useState("");
  const [fuType, setFuType] = useState("follow_up");
  const [fuDate, setFuDate] = useState<Date>(addDays(new Date(), 3));
  const [isCreatingFU, setIsCreatingFU] = useState(false);
  const [fuLoading, setFuLoading] = useState(false);

  const updateTask = trpc.tasks.update.useMutation();
  const createTask = trpc.tasks.create.useMutation();
  const createActivityForTask = trpc.activities.create.useMutation();
  const updateContact = trpc.contacts.update.useMutation();
  const invokeLlm = trpc.callIntel.invokeLlm.useMutation();

  const handleCompleteTask = useCallback(async (task: { id: number; title: string; type: string; contactId?: number | null; propertyId?: number | null; listingId?: number | null }) => {
    if (!completionNote.trim()) { toast.error("Add a quick note about what happened."); return; }
    setIsCompletingTask(true);
    try {
      await updateTask.mutateAsync({ id: task.id, status: "completed", completedAt: new Date() });
      if (task.contactId) {
        await createActivityForTask.mutateAsync({
          type: (["call","email","meeting","note","text","voicemail"].includes(task.type) ? task.type : "note") as any,
          contactId: task.contactId,
          propertyId: task.propertyId ?? undefined,
          listingId: task.listingId ?? undefined,
          subject: task.title,
          notes: completionNote,
          outcome: "follow_up",
        });
        await updateContact.mutateAsync({ id: task.contactId, lastContactedAt: new Date() });
      }
      toast.success("Task completed & logged!");
      refetchActivities();
      utils.tasks.list.invalidate();

      // AI follow-up suggestion
      setFuLoading(true);
      setShowFollowUpFor(task.id);
      try {
        const fuPrompt = `Suggest a follow-up task after completing this CRE task.
Completed: "${task.title}" | Contact: ${contact?.firstName ?? ""} ${contact?.lastName ?? ""} | Note: "${completionNote}"
Respond ONLY with JSON (no markdown): {"title":"string","type":"call|email|follow_up|meeting","daysOut":3}
daysOut: 1–14 based on urgency in the note.`;
        const fuRes = await invokeLlm.mutateAsync({ prompt: fuPrompt });
        const suggestion = parseLlmJson<{ title: string; type: string; daysOut: number }>(fuRes.text ?? "{}");
        setFuTitle(suggestion.title ?? `Follow up with ${contact?.firstName ?? "contact"}`);
        setFuType(suggestion.type ?? "follow_up");
        setFuDate(addDays(new Date(), suggestion.daysOut ?? 3));
      } catch {
        setFuTitle(`Follow up with ${contact?.firstName ?? "contact"}`);
        setFuType("follow_up");
        setFuDate(addDays(new Date(), 3));
      }
      setFuLoading(false);
      setCompletingTaskId(null);
      setCompletionNote("");
    } catch { toast.error("Something went wrong."); }
    finally { setIsCompletingTask(false); }
  }, [completionNote, contact, updateTask, createActivityForTask, updateContact, invokeLlm, refetchActivities, utils]);

  const handleCreateFollowUp = useCallback(async () => {
    if (!fuTitle.trim()) { toast.error("Add a title."); return; }
    setIsCreatingFU(true);
    await createTask.mutateAsync({
      title: fuTitle,
      type: fuType as any,
      priority: "medium",
      dueAt: fuDate,
      contactId,
    });
    toast.success("Follow-up task created!");
    setShowFollowUpFor(null);
    setFuTitle("");
    setIsCreatingFU(false);
    utils.tasks.list.invalidate();
  }, [fuTitle, fuType, fuDate, contactId, createTask, utils]);

  if (isLoading) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" /> Loading...</div>;
  if (!contact) return <div className="p-6 text-muted-foreground">Contact not found.</div>;

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-5xl">
      {/* Back button */}
      <Button variant="ghost" size="sm" onClick={() => setLocation(backDestination)} className="gap-1.5 -ml-2">
        <ArrowLeft className="h-4 w-4" />
        {fromMap ? "Back to Map" : "Contacts"}
      </Button>

      {/* Header: avatar + name + action buttons */}
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
        {/* Avatar + name block — centered on mobile */}
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-3 text-center sm:text-left">
          <Avatar className="h-16 w-16 border-2 border-border shrink-0">
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
              {contact.firstName[0]}{contact.lastName[0]}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold text-foreground">{contact.firstName} {contact.lastName}</h1>
            <div className="flex items-center justify-center sm:justify-start gap-2 flex-wrap mt-1">
              <Badge variant="outline" className={`text-xs ${priorityColors[contact.priority]}`}>{contact.priority}</Badge>
              {contact.isOwner && <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/30">Owner</Badge>}
              {contact.isBuyer && <Badge variant="outline" className="text-xs bg-green-500/10 text-green-400 border-green-500/30">Buyer</Badge>}
            </div>
            {contact.company && <p className="text-muted-foreground text-sm mt-0.5">{contact.company}</p>}
          </div>
        </div>
        {/* Action buttons — full-width row on mobile, auto on desktop */}
        <div className="flex gap-2 w-full sm:w-auto flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowLogActivity(true)} className="gap-1.5 flex-1 sm:flex-none min-h-[44px] sm:min-h-0">
            <Plus className="h-3.5 w-3.5" /> Log Activity
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none min-h-[44px] sm:min-h-0 border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => {
              const firstPropLink = contactLinks?.find((l: any) => l.propertyId);
              const params = new URLSearchParams({ contactId: String(contactId) });
              if (firstPropLink?.propertyId) params.set("propertyId", String(firstPropLink.propertyId));
              setLocation(`/email-studio?${params}`);
            }}>
            <Mail className="h-3.5 w-3.5" /> Draft Email
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5 flex-1 sm:flex-none min-h-[44px] sm:min-h-0 border-primary/40 text-primary hover:bg-primary/10"
            onClick={() => {
              const firstPropLink = contactLinks?.find((l: any) => l.propertyId);
              const params = new URLSearchParams({ tab: "quicklog", contactId: String(contactId) });
              if (firstPropLink?.propertyId) params.set("propertyId", String(firstPropLink.propertyId));
              setLocation(`/ai?${params}`);
            }}>
            <Zap className="h-3.5 w-3.5" /> Quick Log
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowEditContact(true)} className="gap-1.5 flex-1 sm:flex-none min-h-[44px] sm:min-h-0">
            <Edit2 className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowDeleteContact(true)} className="gap-1.5 flex-1 sm:flex-none min-h-[44px] sm:min-h-0 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Contact Info + Properties */}
        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Contact Info</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <PhoneList contactId={contactId} primaryPhone={contact.phone} />
              {/* Email — primary only, expand for more */}
              <CollapsibleEmails
                contactId={contactId}
                primaryEmail={contact.email}
                extraEmails={extraEmails ?? []}
                showAddEmail={showAddEmail}
                setShowAddEmail={setShowAddEmail}
                newEmail={newEmail}
                setNewEmail={setNewEmail}
                addEmail={addEmail}
                removeEmail={removeEmail}
                setPrimaryEmail={setPrimaryEmail}
              />
              {/* Address — primary only, expand for more */}
              <ContactAddressList contactId={contactId} fallbackCity={contact.city} fallbackState={contact.state} />
              {contact.lastContactedAt && (
                <div className="flex items-center gap-2.5">
                  <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground">Last contact: {formatDistanceToNow(new Date(contact.lastContactedAt), { addSuffix: true })}</span>
                </div>
              )}
              {contact.nextFollowUpAt && (
                <div className="flex items-center gap-2.5">
                  <Calendar className="h-4 w-4 text-amber-400 shrink-0" />
                  <span className="text-sm text-amber-400">Follow up: {format(new Date(contact.nextFollowUpAt), "MMM d, yyyy")}</span>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Notes</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
                onClick={() => refreshNotes.mutate({ contactId, newContext: "Manual refresh requested by user" })}
                disabled={refreshNotes.isPending}
                title="AI rewrites notes from CRM activity"
              >
                {refreshNotes.isPending
                  ? <><Loader2 className="h-3 w-3 animate-spin" /> Refreshing…</>
                  : <><Sparkles className="h-3 w-3" /> AI Refresh</>}
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {contact.notes
                ? <p className="text-sm text-foreground whitespace-pre-wrap">{contact.notes}</p>
                : <p className="text-sm text-muted-foreground italic">No notes yet — click AI Refresh to generate a summary from CRM activity.</p>
              }
              {contact.notesUpdatedAt && (
                <p className="text-xs text-muted-foreground/60 flex items-center gap-1">
                  <Sparkles className="h-2.5 w-2.5" />
                  <span>AI last updated</span>
                  <span>{new Date(contact.notesUpdatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</span>
                </p>
              )}
            </CardContent>
          </Card>

          {/* Linked Properties (for owners) */}
          {properties && properties.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"><Building2 className="h-3.5 w-3.5" />Properties ({properties.length})</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {properties.map((prop) => (
                  <div key={prop.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors" onClick={() => setLocation(`/properties/${prop.id}`)}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground truncate">{prop.name}</p>
                      <p className="text-xs text-muted-foreground">{prop.city} · {prop.unitCount ? `${prop.unitCount} units` : prop.propertyType}</p>
                    </div>
                    <Badge variant="outline" className="text-xs shrink-0 ml-2 capitalize">{prop.status}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
          {/* ── Additional Properties (cross-reference matches) ────────── */}
          {contactConnections && contactConnections.length > 0 && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-400 mb-1.5">Possible Additional Properties</p>
              <p className="text-xs text-muted-foreground mb-2">Based on matching owner data across your CRM.</p>
              {contactConnections.slice(0, 5).map((conn) => (
                <div key={conn.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background/50 mb-1">
                  <div className="min-w-0">
                    <button className="text-sm font-medium text-foreground hover:text-primary truncate text-left" onClick={() => setLocation(`/properties/${conn.id}`)}>
                      {conn.name}
                    </button>
                    <p className="text-xs text-muted-foreground">{conn.matchReason}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {/* ── AI Deal-Link Suggestions ─────────────────────────────────── */}
          {dealLinkSuggestions.filter(s => !dismissedSuggestions.has(s.id)).length > 0 && (
            <Card className="border-primary/30 bg-primary/5">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold text-primary/80 uppercase tracking-wide flex items-center gap-2">
                  <Sparkles className="h-3.5 w-3.5" />Deal Mentions Detected
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-xs text-muted-foreground">Your activity note mentions these deals. Link them to this contact?</p>
                {dealLinkSuggestions.filter(s => !dismissedSuggestions.has(s.id)).map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-background/50">
                    <div className="flex items-center gap-2 min-w-0">
                      <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span className="text-sm font-medium text-foreground truncate">{s.name}</span>
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">{s.type}</Badge>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-primary hover:text-primary hover:bg-primary/10" onClick={() => {
                        confirmSuggestion.mutate({ contactId, listingId: s.listingId, propertyId: s.propertyId, source: "activity", label: s.name, dealRole: "other" });
                        setDismissedSuggestions(prev => { const n = new Set(Array.from(prev)); n.add(s.id); return n; });
                        toast.success(`Linked to ${s.name}`);
                      }}>Link</Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2 text-muted-foreground" onClick={() => setDismissedSuggestions(prev => { const n = new Set(Array.from(prev)); n.add(s.id); return n; })}>Dismiss</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* ── Linked Deals (auto-tagged + manual + buyer interests + sellers) ── */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-primary" />
                Linked Deals {((contactLinks?.length ?? 0) + (dealConnections?.length ?? 0)) > 0 && `(${(contactLinks?.length ?? 0) + (dealConnections?.length ?? 0)})`}
              </CardTitle>
              <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAddLink(!showAddLink)}>
                <Plus className="h-3 w-3" /> Add
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {/* Manual add form */}
              {showAddLink && (
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 space-y-2 mb-2">
                  <div className="flex gap-1.5">
                    <button
                      onClick={() => { setLinkType("property"); setLinkSearch(""); }}
                      className={`flex-1 text-xs py-1 rounded border transition-colors ${linkType === "property" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >Property</button>
                    <button
                      onClick={() => { setLinkType("listing"); setLinkSearch(""); }}
                      className={`flex-1 text-xs py-1 rounded border transition-colors ${linkType === "listing" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:text-foreground"}`}
                    >Listing</button>
                  </div>
                  <Input
                    placeholder={linkType === "property" ? "Search properties…" : "Search listings…"}
                    value={linkSearch}
                    onChange={(e) => setLinkSearch(e.target.value)}
                    className="h-7 text-xs bg-background border-border"
                  />
                  <div className="max-h-36 overflow-y-auto space-y-0.5">
                    {linkType === "property"
                      ? (allProperties ?? [])
                          .filter((p) => !linkSearch || p.name.toLowerCase().includes(linkSearch.toLowerCase()) || (p.city ?? "").toLowerCase().includes(linkSearch.toLowerCase()))
                          .slice(0, 10)
                          .map((p) => (
                            <button
                              key={p.id}
                              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/10 transition-colors flex items-center gap-1.5"
                              onClick={() => createLink.mutate({ contactId, propertyId: p.id, source: "manual", label: p.name })}
                            >
                              <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="font-medium text-foreground">{p.name}</span>
                              {p.city && <span className="text-muted-foreground">· {p.city}</span>}
                            </button>
                          ))
                      : (allListings ?? [])
                          .filter((l) => !linkSearch || l.title.toLowerCase().includes(linkSearch.toLowerCase()))
                          .slice(0, 10)
                          .map((l) => (
                            <button
                              key={l.id}
                              className="w-full text-left text-xs px-2 py-1.5 rounded hover:bg-primary/10 transition-colors flex items-center gap-1.5"
                              onClick={() => createLink.mutate({ contactId, listingId: l.id, source: "manual", label: l.title })}
                            >
                              <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="font-medium text-foreground">{l.title}</span>
                              {l.stage && <span className="text-muted-foreground capitalize">· {l.stage}</span>}
                            </button>
                          ))
                    }
                  </div>
                  <button onClick={() => { setShowAddLink(false); setLinkSearch(""); }} className="text-xs text-muted-foreground hover:text-foreground transition-colors">Cancel</button>
                </div>
              )}
              {/* Buyer interest & seller connections (read-only, from buyer_interests / listing_sellers) */}
              {(dealConnections ?? []).map((conn) => (
                <div key={`conn-${conn.source}-${conn.id}`} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <button
                      className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block w-full text-left"
                      onClick={() => setLocation(`/listings/${conn.listingId}`)}
                    >
                      {conn.listingTitle ?? conn.propertyName ?? "Unknown"}
                    </button>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      {conn.propertyCity && <span className="text-xs text-muted-foreground">{conn.propertyCity}</span>}
                      {conn.listingStage && <span className="text-xs text-muted-foreground capitalize">· {conn.listingStage}</span>}
                      {conn.status && <span className="text-[10px] text-blue-400 bg-blue-500/10 px-1 rounded capitalize">{conn.status.replace(/_/g, " ")}</span>}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize shrink-0">
                    {conn.dealRole}
                  </Badge>
                </div>
              ))}
              {/* Manual / auto-tagged contactPropertyLinks */}
              {!contactLinks || contactLinks.length === 0 ? (
                (dealConnections ?? []).length === 0 && <p className="text-xs text-muted-foreground text-center py-3">No linked deals yet. Links are added automatically when contacts are created from Email Studio or AI Assistant.</p>
              ) : (
                contactLinks.map((link) => {
                  const name   = link.propertyName ?? link.listingTitle ?? link.label ?? "Unknown";
                  const detail = link.propertyCity ?? (link.listingStage ? `Stage: ${link.listingStage}` : null);
                  const sourceLabel: Record<string, string> = {
                    email_studio: "Email Studio",
                    ai_assistant: "AI Assistant",
                    manual: "Manual",
                    import: "Import",
                    task: "Task",
                    activity: "Activity",
                  };
                  return (
                    <div key={link.id} className="flex items-center gap-2 p-2 rounded-lg bg-muted/20 group">
                      <div className="flex-1 min-w-0">
                        <button
                          className="text-sm font-medium text-foreground hover:text-primary transition-colors truncate block w-full text-left"
                          onClick={() => link.propertyId ? setLocation(`/properties/${link.propertyId}`) : setLocation(`/listings/${link.listingId}`)}
                        >
                          {name}
                        </button>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          {detail && <span className="text-xs text-muted-foreground">{detail}</span>}
                          <span className="text-[10px] text-muted-foreground/60 bg-muted/40 px-1 rounded">{sourceLabel[link.source] ?? link.source}</span>
                        </div>
                      </div>
                      {/* Role selector */}
                      <Select
                        value={link.dealRole ?? ""}
                        onValueChange={(val) => updateLinkRole.mutate({ id: link.id, dealRole: val as "seller" | "buyer" | "buyers_broker" | "listing_agent" | "property_manager" | "attorney" | "lender" | "other" })}
                      >
                        <SelectTrigger className="h-6 w-auto min-w-[90px] text-xs border-dashed border-border/60 bg-transparent px-2 py-0 gap-1">
                          <SelectValue placeholder="Role" />
                        </SelectTrigger>
                        <SelectContent>
                          {DEAL_ROLES.map(r => (
                            <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-red-400"
                        onClick={() => deleteLink.mutate({ id: link.id })}
                        title="Remove link"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right: Activity Timeline + Buyer Criteria */}
        <div className="lg:col-span-2 space-y-4">

          {/* Upcoming Tasks — Interactive */}
          {upcomingTasks && upcomingTasks.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                  <ListChecks className="h-3.5 w-3.5" /> Upcoming Tasks ({upcomingTasks.length})
                </CardTitle>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setLocation("/tasks")}>
                  View All
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {upcomingTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-border bg-muted/10">
                    {/* Task row */}
                    <div
                      className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-muted/30 transition-colors"
                      onClick={() => { setCompletingTaskId(completingTaskId === task.id ? null : task.id); setCompletionNote(""); }}
                    >
                      <Checkbox
                        checked={false}
                        onCheckedChange={() => setCompletingTaskId(task.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="shrink-0"
                      />
                      <div className={`h-2 w-2 rounded-full shrink-0 ${task.priority === "urgent" ? "bg-red-400" : task.priority === "high" ? "bg-orange-400" : task.priority === "medium" ? "bg-amber-400" : "bg-slate-400"}`} />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-foreground block truncate">{task.title}</span>
                        <span className="text-xs text-muted-foreground capitalize">{task.type.replace("_", " ")}</span>
                      </div>
                      {task.dueAt && (
                        <span className={`text-xs shrink-0 ${new Date(task.dueAt) < new Date() ? "text-red-400 font-medium" : "text-muted-foreground"}`}>
                          {format(new Date(task.dueAt), "MMM d")}
                        </span>
                      )}
                    </div>

                    {/* Completion panel — slides open when clicked */}
                    {completingTaskId === task.id && (
                      <div className="px-3 pb-3 pt-1 border-t border-border space-y-2">
                        <label className="text-xs font-medium text-muted-foreground">What happened?</label>
                        <Textarea
                          placeholder="Quick note — called and discussed pricing, sent follow-up email, etc."
                          value={completionNote}
                          onChange={(e) => setCompletionNote(e.target.value)}
                          className="text-sm min-h-[60px] resize-none"
                          autoFocus
                        />
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            className="gap-1.5"
                            disabled={isCompletingTask || !completionNote.trim()}
                            onClick={() => handleCompleteTask(task)}
                          >
                            {isCompletingTask ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />}
                            Complete & Log
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setCompletingTaskId(null); setCompletionNote(""); }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Follow-up suggestion dialog */}
          <Dialog open={showFollowUpFor !== null} onOpenChange={(open) => { if (!open) setShowFollowUpFor(null); }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-amber-500" /> Create a Follow-Up?
                </DialogTitle>
              </DialogHeader>
              {fuLoading ? (
                <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> Thinking of a follow-up...
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs">Title</Label>
                    <Input value={fuTitle} onChange={(e) => setFuTitle(e.target.value)} className="text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Type</Label>
                      <Select value={fuType} onValueChange={setFuType}>
                        <SelectTrigger className="text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="call">Call</SelectItem>
                          <SelectItem value="email">Email</SelectItem>
                          <SelectItem value="meeting">Meeting</SelectItem>
                          <SelectItem value="follow_up">Follow Up</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Due Date</Label>
                      <Input
                        type="date"
                        value={fuDate.toISOString().slice(0, 10)}
                        onChange={(e) => setFuDate(new Date(e.target.value))}
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={() => setShowFollowUpFor(null)}>
                  Skip
                </Button>
                <Button onClick={handleCreateFollowUp} disabled={isCreatingFU || fuLoading} className="gap-1.5">
                  {isCreatingFU ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                  Create Follow-Up
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
                <Activity className="h-3.5 w-3.5" />Activity History
              </CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowLogActivity(true)} className="h-7 text-xs gap-1">
                <Plus className="h-3 w-3" /> Log
              </Button>
            </CardHeader>
            <CardContent>
              {!activities?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No activities logged yet</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowLogActivity(true)}>Log first activity</Button>
                </div>
              ) : (
                <div className="relative space-y-0">
                  {activities.map((activity, idx) => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => setOpenActivityId(activity.id)}
                      className="w-full text-left flex gap-3 pb-4 relative hover:bg-muted/40 rounded-md -mx-2 px-2 py-1 transition-colors"
                    >
                      {idx < activities.length - 1 && <div className="absolute left-6 top-9 bottom-0 w-px bg-border" />}
                      <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary z-10">
                        {activityTypeIcons[activity.type] ?? <Activity className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground capitalize">{activity.type}</span>
                          {activity.outcome && <Badge variant="outline" className="text-xs px-1.5 py-0 capitalize">{activity.outcome.replace("_", " ")}</Badge>}
                          <span className="text-xs text-muted-foreground ml-auto">{formatDistanceToNow(new Date(activity.occurredAt), { addSuffix: true })}</span>
                        </div>
                        {activity.subject && <p className="text-sm text-foreground mt-0.5">{activity.subject}</p>}
                        {activity.summary && <p className="text-sm text-muted-foreground mt-1 italic">"{activity.summary}"</p>}
                        {activity.notes && !activity.summary && <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{activity.notes}</p>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Buyer Criteria — only shown for buyer contacts */}
          {contact.isBuyer && <BuyerCriteriaPanel contactId={contactId} />}
        </div>
      </div>

      <LogActivityModal open={showLogActivity} onClose={() => setShowLogActivity(false)} contactId={contactId} onSuccess={() => { setShowLogActivity(false); refetchActivities(); refetch(); }} onSuggestions={(suggestions) => setDealLinkSuggestions(suggestions)} />
      <ActivityDetailModal
        activityId={openActivityId}
        open={openActivityId !== null}
        onClose={() => setOpenActivityId(null)}
        onChanged={() => refetchActivities()}
      />
      {showEditContact && <EditContactModal contact={contact} onClose={() => setShowEditContact(false)} onSuccess={() => { setShowEditContact(false); refetch(); }} />}
      <AlertDialog open={showDeleteContact} onOpenChange={setShowDeleteContact}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete contact?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{contact.firstName} {contact.lastName}</strong> will be permanently deleted along with all their linked data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteContact.mutate({ id: contactId })}
              disabled={deleteContact.isPending}
            >
              {deleteContact.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function LogActivityModal({ open, onClose, contactId, propertyId, onSuccess, onSuggestions }: {
  open: boolean;
  onClose: () => void;
  contactId?: number;
  propertyId?: number;
  onSuccess: () => void;
  onSuggestions?: (suggestions: Array<{ type: string; id: number; name: string; listingId?: number; propertyId?: number }>) => void;
}) {
  const [form, setForm] = useState({ type: "call" as "call"|"email"|"meeting"|"note"|"text"|"voicemail", subject: "", notes: "", outcome: "" as ""|"reached"|"voicemail"|"no_answer"|"callback_requested"|"not_interested"|"interested"|"follow_up", duration: "" });
  const [taggedDeal, setTaggedDeal] = useState<{ id: number; name: string; type: "listing" | "property" } | null>(null);
  const [dealSearch, setDealSearch] = useState("");
  const [showDealSearch, setShowDealSearch] = useState(false);
  const { data: allListings } = trpc.listings.list.useQuery({}, { enabled: showDealSearch });
  const { data: allProperties } = trpc.properties.list.useQuery({ limit: 10000 }, { enabled: showDealSearch });
  const suggestDealLinks = trpc.contactLinks.suggestDealLinks.useMutation();
  const createActivity = trpc.activities.create.useMutation({
    onSuccess: async () => {
      toast.success("Activity logged!");
      // Run AI deal-link suggestion on the notes
      if (onSuggestions && form.notes.trim() && contactId) {
        try {
          const result = await suggestDealLinks.mutateAsync({ text: form.notes, contactId });
          if (result.suggestions.length > 0) onSuggestions(result.suggestions);
        } catch { /* non-fatal */ }
      }
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const dealResults = useMemo(() => {
    const q = dealSearch.toLowerCase();
    const listings = (allListings ?? []).filter(l => !q || l.title.toLowerCase().includes(q)).slice(0, 5).map(l => ({ id: l.id, name: l.title, type: "listing" as const }));
    const props = (allProperties ?? []).filter(p => !q || p.name.toLowerCase().includes(q) || (p.city ?? "").toLowerCase().includes(q)).slice(0, 5).map(p => ({ id: p.id, name: p.name, type: "property" as const }));
    return [...listings, ...props];
  }, [allListings, allProperties, dealSearch]);

  const handleSave = () => {
    const linkedListingId = taggedDeal?.type === "listing" ? taggedDeal.id : undefined;
    const linkedPropertyId = taggedDeal?.type === "property" ? taggedDeal.id : (propertyId ?? undefined);
    createActivity.mutate({ type: form.type, subject: form.subject || undefined, notes: form.notes || undefined, outcome: form.outcome || undefined, contactId, listingId: linkedListingId, propertyId: linkedPropertyId });
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Log Activity</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={form.type} onValueChange={(v) => setForm({...form, type: v as typeof form.type})}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="call">Call</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="meeting">Meeting</SelectItem><SelectItem value="note">Note</SelectItem><SelectItem value="text">Text</SelectItem><SelectItem value="voicemail">Voicemail</SelectItem></SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Outcome</Label>
              <Select value={form.outcome} onValueChange={(v) => setForm({...form, outcome: v as typeof form.outcome})}>
                <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent><SelectItem value="reached">Reached</SelectItem><SelectItem value="voicemail">Voicemail</SelectItem><SelectItem value="no_answer">No Answer</SelectItem><SelectItem value="interested">Interested</SelectItem><SelectItem value="not_interested">Not Interested</SelectItem><SelectItem value="follow_up">Follow Up</SelectItem><SelectItem value="callback_requested">Callback Requested</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Subject</Label><Input value={form.subject} onChange={(e) => setForm({...form, subject: e.target.value})} placeholder="e.g. Called about Sunrise MHC" className="bg-background border-border" /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} placeholder="What was discussed..." className="bg-background border-border resize-none" rows={4} /></div>
          {/* Tag a Deal */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Tag a Deal <span className="text-muted-foreground/50">(optional)</span></Label>
            {taggedDeal ? (
              <div className="flex items-center gap-2 px-2 py-1.5 rounded-md border border-border/60 bg-muted/20">
                <ChevronRight className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-sm text-foreground flex-1 truncate">{taggedDeal.name}</span>
                <button className="text-xs text-muted-foreground hover:text-foreground" onClick={() => setTaggedDeal(null)}>×</button>
              </div>
            ) : (
              <div className="relative">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Search listings or properties…"
                    value={dealSearch}
                    onChange={(e) => { setDealSearch(e.target.value); setShowDealSearch(true); }}
                    onFocus={() => setShowDealSearch(true)}
                    className="h-8 text-xs bg-background border-border pl-7"
                  />
                </div>
                {showDealSearch && dealResults.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border border-border bg-card shadow-md max-h-40 overflow-y-auto">
                    {dealResults.map(d => (
                      <button key={`${d.type}-${d.id}`} className="w-full text-left text-xs px-3 py-2 hover:bg-muted/40 flex items-center gap-2" onClick={() => { setTaggedDeal(d); setDealSearch(""); setShowDealSearch(false); }}>
                        <span className="font-medium text-foreground truncate">{d.name}</span>
                        <Badge variant="outline" className="text-[10px] capitalize shrink-0">{d.type}</Badge>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={createActivity.isPending}>{createActivity.isPending ? "Logging..." : "Log Activity"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditContactModal({ contact, onClose, onSuccess }: { contact: any; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ firstName: contact.firstName, lastName: contact.lastName, email: contact.email ?? "", phone: contact.phone ?? "", company: contact.company ?? "", priority: contact.priority, notes: contact.notes ?? "" });
  const updateContact = trpc.contacts.update.useMutation({
    onSuccess: () => { toast.success("Contact updated!"); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Edit Contact</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">First Name</Label><Input value={form.firstName} onChange={(e) => setForm({...form, firstName: e.target.value})} className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Last Name</Label><Input value={form.lastName} onChange={(e) => setForm({...form, lastName: e.target.value})} className="bg-background border-border" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Email</Label><Input value={form.email} onChange={(e) => setForm({...form, email: e.target.value})} className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Phone</Label><Input value={form.phone} onChange={(e) => setForm({...form, phone: e.target.value})} className="bg-background border-border" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Company</Label><Input value={form.company} onChange={(e) => setForm({...form, company: e.target.value})} className="bg-background border-border" /></div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Priority</Label>
            <Select value={form.priority} onValueChange={(v) => setForm({...form, priority: v})}>
              <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="hot">Hot</SelectItem><SelectItem value="warm">Warm</SelectItem><SelectItem value="cold">Cold</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} className="bg-background border-border resize-none" rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => updateContact.mutate({ id: contact.id, ...form })} disabled={updateContact.isPending}>{updateContact.isPending ? "Saving..." : "Save Changes"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Collapsible emails component ───────────────────────────────────────────
function CollapsibleEmails({ contactId, primaryEmail, extraEmails, showAddEmail, setShowAddEmail, newEmail, setNewEmail, addEmail, removeEmail, setPrimaryEmail }: {
  contactId: number; primaryEmail?: string | null; extraEmails: any[]; showAddEmail: boolean; setShowAddEmail: (v: boolean) => void;
  newEmail: string; setNewEmail: (v: string) => void; addEmail: any; removeEmail: any; setPrimaryEmail: any;
}) {
  const [expanded, setExpanded] = useState(false);
  const allEmails = extraEmails ?? [];
  const hasExtras = allEmails.length > 0;

  if (!primaryEmail && allEmails.length === 0) {
    return showAddEmail ? (
      <div className="flex items-center gap-1.5">
        <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="email@example.com" className="h-7 text-xs bg-background border-border flex-1" onKeyDown={(e) => { if (e.key === "Enter") addEmail.mutate({ contactId, email: newEmail }); if (e.key === "Escape") setShowAddEmail(false); }} autoFocus />
        <Button size="sm" className="h-7 text-xs px-2" onClick={() => addEmail.mutate({ contactId, email: newEmail })} disabled={!newEmail.trim()}>Add</Button>
      </div>
    ) : (
      <button onClick={() => setShowAddEmail(true)} className="flex items-center gap-2.5 text-muted-foreground hover:text-primary"><Mail className="h-4 w-4 shrink-0" /><span className="text-sm">Add email</span></button>
    );
  }

  return (
    <div className="space-y-1">
      {/* Primary email — always visible */}
      {primaryEmail && (
        <div className="flex items-center gap-2 min-w-0">
          <Mail className="h-4 w-4 text-primary shrink-0" />
          <a href={`mailto:${primaryEmail}`} className="text-sm text-foreground hover:text-primary transition-colors truncate flex-1 min-w-0">{primaryEmail}</a>
          {hasExtras && (
            <button onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5 shrink-0 whitespace-nowrap">
              +{allEmails.length} {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            </button>
          )}
        </div>
      )}
      {/* Expanded extras */}
      {expanded && allEmails.map((e) => (
        <div key={e.id} className="flex items-center gap-2.5 pl-[26px] group">
          <a href={`mailto:${e.email}`} className="text-sm text-muted-foreground hover:text-primary transition-colors truncate flex-1">{e.email}</a>
          <div className="hidden group-hover:flex items-center gap-1">
            <button onClick={() => setPrimaryEmail.mutate({ id: e.id, contactId })} className="text-[10px] text-primary hover:underline">set primary</button>
            <button onClick={() => removeEmail.mutate({ id: e.id })} className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3 w-3" /></button>
          </div>
        </div>
      ))}
      {expanded && (
        showAddEmail ? (
          <div className="flex items-center gap-1.5 pl-[26px]">
            <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="new@email.com" className="h-7 text-xs bg-background border-border flex-1" onKeyDown={(e) => { if (e.key === "Enter") addEmail.mutate({ contactId, email: newEmail }); if (e.key === "Escape") setShowAddEmail(false); }} autoFocus />
            <Button size="sm" className="h-7 text-xs px-2" onClick={() => addEmail.mutate({ contactId, email: newEmail })} disabled={!newEmail.trim()}>Add</Button>
          </div>
        ) : (
          <button onClick={() => setShowAddEmail(true)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 pl-[26px]"><Plus className="h-3 w-3" />Add email</button>
        )
      )}
    </div>
  );
}

// ─── Collapsible address list component ─────────────────────────────────────
function ContactAddressList({ contactId, fallbackCity, fallbackState }: { contactId: number; fallbackCity?: string | null; fallbackState?: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const { data: addresses } = trpc.ownerResearch.listAddresses.useQuery({ contactId });
  const allAddresses = addresses ?? [];
  const primary = allAddresses.find((a) => a.isPrimary) ?? allAddresses[0];
  const hasExtras = allAddresses.length > 1;

  if (allAddresses.length === 0) {
    if (!fallbackCity && !fallbackState) return null;
    return (
      <div className="flex items-center gap-2.5">
        <MapPin className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm text-foreground">{[fallbackCity, fallbackState].filter(Boolean).join(", ")}</span>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Primary address — always visible */}
      <div className="flex items-center gap-2 min-w-0">
        <MapPin className="h-4 w-4 text-primary shrink-0" />
        <span className="text-sm text-foreground truncate flex-1 min-w-0">
          {[primary.street, primary.city, primary.state, primary.zip].filter(Boolean).join(", ")}
        </span>
        {hasExtras && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-0.5 shrink-0 whitespace-nowrap">
            +{allAddresses.length - 1} {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
      </div>
      {/* Expanded extras */}
      {expanded && allAddresses.filter((a) => a.id !== primary.id).map((a) => (
        <div key={a.id} className="flex items-center gap-2.5 pl-[26px]">
          <span className="text-sm text-muted-foreground truncate">
            {[a.street, a.unit, a.city, a.state, a.zip].filter(Boolean).join(", ")}
          </span>
          {a.label && a.label !== "other" && <span className="text-[10px] text-muted-foreground">{a.label}</span>}
        </div>
      ))}
    </div>
  );
}
