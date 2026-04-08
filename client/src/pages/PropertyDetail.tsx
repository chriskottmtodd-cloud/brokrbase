import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { ContactSearchPicker } from "@/components/ContactSearchPicker";
import {
  ArrowLeft, Building2, MapPin, Home, Calendar, DollarSign, Activity,
  Phone, Mail, Plus, User, ChevronRight, ExternalLink, Target, Loader2,
  Tag, Map, Edit2, Users, Trash2, Link2, TrendingUp, ChevronDown, ChevronUp,
  Globe, RefreshCw, Sparkles, FileText, Zap,
} from "lucide-react";
import { statusColors, DEAL_ROLES } from "@/lib/constants";
import { UnitMixSection } from "@/components/UnitMixSection";
import { OwnerResearchModal } from "@/components/OwnerResearchModal";
import { ActivityDetailModal } from "@/components/ActivityDetailModal";

const activityIcons: Record<string, React.ReactNode> = {
  call:    <Phone className="h-3.5 w-3.5" />,
  email:   <Mail className="h-3.5 w-3.5" />,
  meeting: <Calendar className="h-3.5 w-3.5" />,
  note:    <Activity className="h-3.5 w-3.5" />,
};

export default function PropertyDetail() {
  const { id }    = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const search    = useSearch();
  const propertyId = parseInt(id ?? "0");
  const fromMap   = new URLSearchParams(search).get("from") === "map";
  const backTo    = fromMap ? `/map?highlight=${propertyId}` : "/properties";
  const backLabel = fromMap ? "Back to Map" : "Properties";

  const [showLogActivity, setShowLogActivity] = useState(false);
  const [openActivityId, setOpenActivityId] = useState<number | null>(null);
  const [showEditModal,   setShowEditModal]   = useState(false);
  const [showAddLinkedContact, setShowAddLinkedContact] = useState(false);
  const [linkedContactPick, setLinkedContactPick] = useState<{ id: number; firstName: string; lastName: string } | null>(null);
  const [showOwnerResearch, setShowOwnerResearch] = useState(false);
  const [showOtherParties, setShowOtherParties] = useState(false);

  const { data: property, isLoading, refetch } = trpc.properties.byId.useQuery({ id: propertyId }, { enabled: !!propertyId });
  const { data: activities, refetch: refetchActivities } = trpc.activities.list.useQuery({ propertyId, limit: 20 }, { enabled: !!propertyId });
  const { data: otherDeals } = trpc.properties.otherByOwner.useQuery(
    { ownerId: property?.ownerId ?? 0, excludePropertyId: propertyId },
    { enabled: !!property?.ownerId }
  );
  const { data: linkedContacts, refetch: refetchLinkedContacts } = trpc.contactLinks.listForProperty.useQuery(
    { propertyId },
    { enabled: !!propertyId }
  );
  const { data: propertyConnections } = trpc.ownerResearch.getPropertyConnections.useQuery(
    { propertyId },
    { enabled: !!propertyId }
  );
  const createLink = trpc.contactLinks.create.useMutation({
    onSuccess: () => { toast.success("Contact linked!"); refetchLinkedContacts(); setShowAddLinkedContact(false); setLinkedContactPick(null); },
    onError: () => toast.error("Failed to link contact"),
  });
  const [showDeleteProperty, setShowDeleteProperty] = useState(false);
  const deleteProperty = trpc.properties.delete.useMutation({
    onSuccess: () => { toast.success("Property deleted"); setLocation("/properties"); },
    onError: (e) => toast.error(e.message),
  });
  const deleteLink = trpc.contactLinks.delete.useMutation({
    onSuccess: () => { toast.success("Link removed"); refetchLinkedContacts(); },
    onError: () => toast.error("Failed to remove link"),
  });
  const updateLinkRole = trpc.contactLinks.updateRole.useMutation({
    onSuccess: () => { refetchLinkedContacts(); refetch(); },
    onError: () => toast.error("Failed to update role"),
  });
  const setPrimaryOwnerMutation = trpc.contactLinks.setPrimaryOwner.useMutation({
    onSuccess: () => { toast.success("Primary owner updated"); refetch(); refetchLinkedContacts(); },
    onError: (e) => toast.error(e.message),
  });
  const [creatingOwnerContact, setCreatingOwnerContact] = useState(false);
  const createContact = trpc.contacts.create.useMutation({
    onError: () => { toast.error("Failed to create contact"); setCreatingOwnerContact(false); },
  });
  const handleCreateOwnerContact = async () => {
    if (!property) return;
    setCreatingOwnerContact(true);
    try {
      const nameParts = (property.ownerName ?? "").split(" ");
      const firstName = property.ownerFirstName ?? nameParts[0] ?? "Owner";
      const lastName  = property.ownerLastName  ?? nameParts.slice(1).join(" ") ?? "";
      const newContact = await createContact.mutateAsync({
        firstName,
        lastName: lastName || undefined,
        company: property.ownerCompany ?? undefined,
        phone:   property.ownerPhone   ?? undefined,
        email:   property.ownerEmail   ?? undefined,
        isOwner: true,
      });
      await createLink.mutateAsync({ contactId: newContact.id, propertyId, source: "manual", dealRole: "owner" });
      toast.success(<span>Contact created! <a href={`/contacts/${newContact.id}`} className="underline font-medium">View {firstName}</a></span>);
    } finally {
      setCreatingOwnerContact(false);
    }
  };
  const sourceLabelMap: Record<string, string> = {
    email_studio: "Email Studio",
    ai_assistant: "AI Assistant",
    manual: "Manual",
    import: "Import",
    task: "Task",
    activity: "Activity",
  };
  const { data: saleRecord } = trpc.properties.getSaleRecord.useQuery({ propertyId }, { enabled: !!propertyId });

  // Deal Narrative
  const { data: dealNarrative, refetch: refetchNarrative } = trpc.callIntel.getDealNarrative.useQuery(
    { propertyId },
    { enabled: !!propertyId }
  );
  const generateNarrative = trpc.callIntel.generateDealNarrative.useMutation({
    onSuccess: () => { toast.success("Deal narrative generated"); refetchNarrative(); },
    onError: (e) => toast.error(e.message),
  });
  const refreshNarrative = trpc.callIntel.refreshDealNarrative.useMutation({
    onSuccess: () => { toast.success("Deal narrative refreshed"); refetchNarrative(); },
    onError: (e) => toast.error(e.message),
  });
  const [narrativeExpanded, setNarrativeExpanded] = useState(false);

  // AI Notes refresh
  const [notesRefreshing, setNotesRefreshing] = useState(false);
  const refreshNotes = trpc.properties.refreshNotes.useMutation({
    onMutate: () => setNotesRefreshing(true),
    onSuccess: () => { toast.success("Notes refreshed"); refetch(); setNotesRefreshing(false); },
    onError: (e) => { toast.error(e.message); setNotesRefreshing(false); },
  });

  // Web Intelligence
  const [webIntelOpen, setWebIntelOpen] = useState(false);
  const [webIntelLoading, setWebIntelLoading] = useState(false);
  const [webIntelSections, setWebIntelSections] = useState<Record<string, string> | null>(null);
  const webIntelMutation = trpc.properties.webIntelligence.useMutation({
    onMutate: () => setWebIntelLoading(true),
    onSuccess: (data) => {
      setWebIntelSections(data.sections as Record<string, string>);
      setWebIntelOpen(true);
      setWebIntelLoading(false);
      refetch();
    },
    onError: (e) => { toast.error(e.message); setWebIntelLoading(false); },
  });

  // Off-market interest
  const [showOffMarket, setShowOffMarket] = useState(false);
  const [omInterest,    setOmInterest]    = useState(false);
  const [omConfidence,  setOmConfidence]  = useState<"casual_mention"|"serious_interest"|"actively_exploring"|"">("" );
  const [omTimeline,    setOmTimeline]    = useState("");
  const [omNotes,       setOmNotes]       = useState("");
  const [omEditing,     setOmEditing]     = useState(false);

  const updateOffMarket = trpc.properties.updateOffMarketInterest.useMutation({
    onSuccess: () => { toast.success("Off-market interest updated"); refetch(); setOmEditing(false); },
    onError: (e) => toast.error(e.message),
  });

  const updateProperty = trpc.properties.update.useMutation({
    onSuccess: () => { toast.success("Property updated"); refetch(); setShowEditModal(false); },
    onError: (e) => toast.error(e.message),
  });

  // Sync off-market state from property data when it loads
  if (property && !omEditing && omInterest !== property.offMarketInterest) {
    setOmInterest(property.offMarketInterest ?? false);
    setOmConfidence((property.offMarketConfidence ?? "") as typeof omConfidence);
    setOmTimeline(property.offMarketTimeline ?? "");
    setOmNotes(property.offMarketNotes ?? "");
  }

  if (isLoading) return <div className="p-6 flex items-center gap-2 text-muted-foreground"><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary" />Loading...</div>;
  if (!property) return <div className="p-6 text-muted-foreground">Property not found.</div>;

  const ownerContactName = property.ownerFirstName
    ? `${property.ownerFirstName} ${property.ownerLastName ?? ""}`.trim()
    : property.ownerName;

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-start gap-4">
        <Button variant="ghost" size="sm" onClick={() => setLocation(backTo)} className="shrink-0 mt-0.5 gap-1.5 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" />{backLabel}
        </Button>
        <div className="flex-1 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{property.name}</h1>
              <Badge variant="outline" className={`text-xs ${statusColors[property.status] ?? ""}`}>{property.status.replace("_", " ")}</Badge>
              <Badge variant="outline" className="text-xs bg-teal-500/10 text-teal-400 border-teal-500/30">{property.propertyType.toUpperCase()}</Badge>
            </div>
            {(property.city || property.county) && (
              <p className="text-muted-foreground text-sm mt-0.5 flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {[property.address, property.city, property.county, property.state].filter(Boolean).join(", ")}
              </p>
            )}
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setShowEditModal(true)} className="gap-1.5">
              <Edit2 className="h-3.5 w-3.5" /> Edit Property
            </Button>
            <Button
              variant={property.isMyListing ? "default" : "outline"}
              size="sm"
              onClick={() => updateProperty.mutate({ id: propertyId, isMyListing: !property.isMyListing })}
              className="gap-1.5"
            >
              <Tag className="h-3.5 w-3.5" />
              {property.isMyListing ? "My Listing" : "Mark as My Listing"}
            </Button>
            <Button variant="outline" size="sm" onClick={() => setLocation(`/map?highlight=${propertyId}`)} className="gap-1.5">
              <Map className="h-3.5 w-3.5" /> Map
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowLogActivity(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Log Activity
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => {
                const ownerContact = linkedContacts?.find(lc => lc.dealRole === "owner");
                const params = new URLSearchParams({ propertyId: String(propertyId) });
                if (ownerContact) params.set("contactId", String(ownerContact.contactId));
                setLocation(`/email-studio?${params}`);
              }}>
              <Mail className="h-3.5 w-3.5" /> Draft Email
            </Button>
            <Button variant="outline" size="sm" className="gap-1.5 border-primary/40 text-primary hover:bg-primary/10"
              onClick={() => {
                const ownerContact = linkedContacts?.find(lc => lc.dealRole === "owner");
                const params = new URLSearchParams({ tab: "quicklog", propertyId: String(propertyId) });
                if (ownerContact) params.set("contactId", String(ownerContact.contactId));
                setLocation(`/ai?${params}`);
              }}>
              <Zap className="h-3.5 w-3.5" /> Quick Log
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteProperty(true)} className="gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="space-y-4">
          <Card className="border-border bg-card">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Property Details</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {property.unitCount   && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground flex items-center gap-1.5"><Home className="h-3.5 w-3.5" />Units</span><span className="text-sm font-medium text-foreground">{property.unitCount}</span></div>}
              {property.vintageYear && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground flex items-center gap-1.5"><Calendar className="h-3.5 w-3.5" />Year Built</span><span className="text-sm font-medium text-foreground">{property.vintageYear}</span></div>}
              {property.sizeSqft    && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground flex items-center gap-1.5"><Building2 className="h-3.5 w-3.5" />Sq Ft</span><span className="text-sm font-medium text-foreground">{property.sizeSqft.toLocaleString()}</span></div>}
              {property.lotAcres    && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Acres</span><span className="text-sm font-medium text-foreground">{property.lotAcres}</span></div>}
              <PropertyMarketBadge marketId={property.marketId} />
              {!property.unitCount && !property.vintageYear && <p className="text-xs text-muted-foreground italic">No details yet — click Edit Property to add.</p>}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Financials</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {property.estimatedValue && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground flex items-center gap-1.5"><DollarSign className="h-3.5 w-3.5" />Est. Value</span><span className="text-sm font-semibold text-primary">${(property.estimatedValue/1000000).toFixed(2)}M</span></div>}
              {property.askingPrice   && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Asking</span><span className="text-sm font-medium text-foreground">${(property.askingPrice/1000000).toFixed(2)}M</span></div>}
              {property.noi           && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">NOI</span><span className="text-sm font-medium text-foreground">${property.noi.toLocaleString()}</span></div>}
              {property.capRate       && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Cap Rate</span><span className="text-sm font-medium text-foreground">{property.capRate}%</span></div>}
              {property.lastSalePrice  && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Last Sale Price</span><span className="text-sm font-medium text-foreground">${property.lastSalePrice.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span></div>}
              {property.lastSaleDate   && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">Last Sale Date</span><span className="text-sm font-medium text-foreground">{new Date(property.lastSaleDate).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}</span></div>}
              {!property.estimatedValue && !property.askingPrice && !property.lastSalePrice && <p className="text-xs text-muted-foreground italic">No financials yet.</p>}
            </CardContent>
          </Card>

          {(() => {
            // Find ALL linked contacts with role 'owner'
            const allOwners = (linkedContacts ?? []).filter(lc => lc.dealRole === "owner");
            const hasFlat = !!(property.ownerName || property.ownerFirstName || property.ownerCompany);
            return (
              <Card className="border-border bg-card">
                <CardHeader className="pb-3 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                    {allOwners.length > 1 ? `Owners (${allOwners.length})` : "Owner"}
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    {allOwners.length > 0 && (
                      <Badge variant="outline" className="text-xs bg-primary/10 text-primary border-primary/30">CRM Contact</Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {property.ownerLlc && (
                    <div className="flex items-center gap-2.5">
                      <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div>
                        <p className="text-[10px] text-muted-foreground">Property LLC</p>
                        <p className="text-xs font-medium text-foreground">{property.ownerLlc}</p>
                      </div>
                    </div>
                  )}
                  {allOwners.length > 0 ? (
                    // Show ALL linked owners
                    <>
                      {allOwners.map((owner) => {
                        const isPrimary = property.ownerId === owner.contactId;
                        return (
                          <div key={owner.id} className="border-b border-border/40 pb-3 last:border-0 last:pb-0 space-y-1.5 group">
                            <div
                              className="flex items-center gap-2.5 cursor-pointer hover:text-primary transition-colors"
                              onClick={() => setLocation(`/contacts/${owner.contactId}`)}
                            >
                              <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-semibold text-sm">
                                {(owner.firstName?.[0] ?? "?").toUpperCase()}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5">
                                  <p className="text-sm font-semibold text-foreground hover:text-primary transition-colors truncate">
                                    {owner.firstName} {owner.lastName}
                                  </p>
                                  {isPrimary && (
                                    <Badge variant="outline" className="text-[10px] px-1 py-0 bg-primary/10 text-primary border-primary/30 shrink-0">Primary</Badge>
                                  )}
                                </div>
                                {owner.company && <p className="text-xs text-muted-foreground truncate">{owner.company}</p>}
                              </div>
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                            </div>
                            {owner.email && (
                              <a href={`mailto:${owner.email}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2.5 text-muted-foreground hover:text-primary transition-colors pl-11">
                                <Mail className="h-3 w-3 shrink-0" /><span className="text-xs truncate">{owner.email}</span>
                              </a>
                            )}
                            {owner.phone && (
                              <a href={`tel:${owner.phone}`} onClick={(e) => e.stopPropagation()} className="flex items-center gap-2.5 text-muted-foreground hover:text-primary transition-colors pl-11">
                                <Phone className="h-3 w-3 shrink-0" /><span className="text-xs">{owner.phone}</span>
                              </a>
                            )}
                            {!isPrimary && allOwners.length > 1 && (
                              <button
                                onClick={(e) => { e.stopPropagation(); setPrimaryOwnerMutation.mutate({ propertyId, contactId: owner.contactId }); }}
                                className="text-[10px] text-muted-foreground hover:text-primary underline pl-11"
                              >
                                Make primary
                              </button>
                            )}
                          </div>
                        );
                      })}
                      <button
                        className="text-xs text-muted-foreground hover:text-primary transition-colors mt-1"
                        onClick={() => setShowOwnerResearch(true)}
                      >
                        Update Research
                      </button>
                    </>
                  ) : hasFlat ? (
                    // Show flat imported data with Create Contact button
                    <>
                      {property.ownerCompany && (
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0"><Building2 className="h-4 w-4 text-muted-foreground" /></div>
                          <div><p className="text-xs text-muted-foreground">Company</p><p className="text-sm font-medium text-foreground">{property.ownerCompany}</p></div>
                        </div>
                      )}
                      {ownerContactName && (
                        <div className="flex items-center gap-2.5">
                          <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0"><User className="h-4 w-4 text-muted-foreground" /></div>
                          <div><p className="text-xs text-muted-foreground">Name</p><p className="text-sm font-medium text-foreground">{ownerContactName}</p></div>
                        </div>
                      )}
                      {property.ownerEmail && (
                        <a href={`mailto:${property.ownerEmail}`} className="flex items-center gap-2.5 text-muted-foreground hover:text-primary transition-colors">
                          <Mail className="h-3.5 w-3.5 shrink-0" /><span className="text-xs truncate">{property.ownerEmail}</span>
                        </a>
                      )}
                      {property.ownerPhone && (
                        <a href={`tel:${property.ownerPhone}`} className="flex items-center gap-2.5 text-muted-foreground hover:text-primary transition-colors">
                          <Phone className="h-3.5 w-3.5 shrink-0" /><span className="text-xs">{property.ownerPhone}</span>
                        </a>
                      )}
                      <div className="flex gap-2 mt-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5 text-primary border-primary/30 hover:bg-primary/5"
                          onClick={handleCreateOwnerContact}
                          disabled={creatingOwnerContact}
                        >
                          {creatingOwnerContact ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                          Create Contact
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="flex-1 gap-1.5"
                          onClick={() => setShowOwnerResearch(true)}
                        >
                          <Target className="h-3.5 w-3.5" />Research Owner
                        </Button>
                      </div>
                    </>
                  ) : (
                    // No owner data at all — prominent research button
                    <div className="text-center py-2">
                      <p className="text-xs text-muted-foreground mb-2">No owner data yet</p>
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setShowOwnerResearch(true)}
                      >
                        <Target className="h-3.5 w-3.5" />Research Owner
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })()}

          {propertyConnections && propertyConnections.length > 0 && (
            <PropertyConnectionsPanel
              connections={propertyConnections}
              propertyId={propertyId}
              hasOwner={!!property.ownerId}
              onLinked={() => { refetch(); refetchLinkedContacts(); }}
            />
          )}

          {otherDeals && otherDeals.length > 0 && (
            <Card className="border-border bg-card">
              <CardHeader className="pb-3"><CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">Other Deals — Same Owner <span className="text-primary font-normal">({otherDeals.length})</span></CardTitle></CardHeader>
              <CardContent className="space-y-1 p-3 pt-0">
                {otherDeals.map((deal) => (
                  <div key={deal.id} className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/40 cursor-pointer transition-colors group" onClick={() => setLocation(`/properties/${deal.id}`)}>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{deal.name}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {deal.city && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{deal.city}</span>}
                        {deal.unitCount && <span className="text-xs text-muted-foreground">{deal.unitCount}u</span>}
                        {deal.estimatedValue && <span className="text-xs text-primary font-medium">${(deal.estimatedValue/1000000).toFixed(1)}M</span>}
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-xs px-1.5 py-0 ${statusColors[deal.status] ?? ""}`}>{deal.status.replace("_"," ")}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* AI-driven Property Notes */}
          {/* Deal Narrative — AI-maintained deal summary */}
          <Card className="border-primary/30 bg-card ring-1 ring-primary/10">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                  <Zap className="h-4 w-4 text-primary" />
                  Deal Narrative
                </CardTitle>
                {dealNarrative ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-primary"
                    disabled={refreshNarrative.isPending}
                    onClick={() => refreshNarrative.mutate({ propertyId })}
                  >
                    {refreshNarrative.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    {refreshNarrative.isPending ? "Refreshing…" : "Refresh"}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    disabled={generateNarrative.isPending}
                    onClick={() => generateNarrative.mutate({ propertyId })}
                  >
                    {generateNarrative.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                    {generateNarrative.isPending ? "Generating…" : "Generate Deal Summary"}
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {dealNarrative ? (
                <>
                  <p className="text-sm text-foreground leading-relaxed">{dealNarrative.summary}</p>

                  {/* Expandable structured fields */}
                  <button
                    onClick={() => setNarrativeExpanded(!narrativeExpanded)}
                    className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                  >
                    {narrativeExpanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                    {narrativeExpanded ? "Hide details" : "Show details"}
                  </button>

                  {narrativeExpanded && (
                    <div className="space-y-2 pt-1">
                      {dealNarrative.sellerMotivation && dealNarrative.sellerMotivation !== "Unknown" && (
                        <div className="text-xs">
                          <span className="font-semibold text-foreground">Seller Motivation:</span>{" "}
                          <span className="text-muted-foreground">{dealNarrative.sellerMotivation}</span>
                        </div>
                      )}
                      {dealNarrative.pricingStatus && dealNarrative.pricingStatus !== "Unknown" && (
                        <div className="text-xs">
                          <span className="font-semibold text-foreground">Pricing:</span>{" "}
                          <span className="text-muted-foreground">{dealNarrative.pricingStatus}</span>
                        </div>
                      )}
                      {dealNarrative.buyerActivity && dealNarrative.buyerActivity !== "Unknown" && (
                        <div className="text-xs">
                          <span className="font-semibold text-foreground">Buyer Activity:</span>{" "}
                          <span className="text-muted-foreground">{dealNarrative.buyerActivity}</span>
                        </div>
                      )}
                      {dealNarrative.keyDates && dealNarrative.keyDates !== "Unknown" && (
                        <div className="text-xs">
                          <span className="font-semibold text-foreground">Key Dates:</span>{" "}
                          <span className="text-muted-foreground">{dealNarrative.keyDates}</span>
                        </div>
                      )}
                      {dealNarrative.blockers && dealNarrative.blockers !== "Unknown" && (
                        <div className="text-xs">
                          <span className="font-semibold text-foreground">Blockers:</span>{" "}
                          <span className="text-muted-foreground">{dealNarrative.blockers}</span>
                        </div>
                      )}
                      {dealNarrative.nextSteps && dealNarrative.nextSteps !== "Unknown" && (
                        <div className="text-xs">
                          <span className="font-semibold text-foreground">Next Steps:</span>{" "}
                          <span className="text-muted-foreground">{dealNarrative.nextSteps}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground/60">
                    Last updated {dealNarrative.updatedAt ? formatDistanceToNow(new Date(dealNarrative.updatedAt), { addSuffix: true }) : "unknown"} · {dealNarrative.activityCount ?? 0} activities tracked
                  </p>
                </>
              ) : (
                <p className="text-sm text-muted-foreground italic">
                  No deal summary yet — click "Generate Deal Summary" to create one from your CRM activity, or it will auto-generate when you log your next activity on this property.
                </p>
              )}
            </CardContent>
          </Card>

          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Property Notes
                </CardTitle>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-primary"
                  disabled={notesRefreshing}
                  onClick={() => refreshNotes.mutate({ propertyId })}
                >
                  {notesRefreshing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  {notesRefreshing ? "Refreshing…" : "AI Refresh"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {property.notes ? (
                <p className="text-sm text-foreground whitespace-pre-wrap">{property.notes}</p>
              ) : (
                <p className="text-sm text-muted-foreground italic">No notes yet — click AI Refresh to generate a summary from CRM activity.</p>
              )}
              {property.notesUpdatedAt && (
                <p className="text-xs text-muted-foreground/60 mt-2">
                  AI last updated {formatDistanceToNow(new Date(property.notesUpdatedAt), { addSuffix: true })}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Research Notes (Import) — read-only, permanent record from CSV/Excel imports */}
          {property.importNotes && (
            <Card className="border-border bg-card">
              <CardContent className="pt-4 pb-4">
                <details className="group">
                  <summary className="flex items-center gap-2 text-sm font-medium text-muted-foreground cursor-pointer select-none list-none">
                    <FileText className="h-4 w-4 shrink-0" />
                    Research Notes (Import)
                    <ChevronDown className="h-4 w-4 ml-auto transition-transform group-open:rotate-180" />
                  </summary>
                  <div className="mt-3 p-3 rounded-lg bg-muted/50 border border-border text-sm text-foreground whitespace-pre-wrap">
                    {property.importNotes}
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-2">
                    Read-only · Original research data from import · Never modified by AI
                  </p>
                </details>
              </CardContent>
            </Card>
          )}

          {/* Sale Record */}
          {saleRecord && (
            <Card className="border-emerald-500/20 bg-emerald-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold text-emerald-400 uppercase tracking-wide flex items-center gap-2">
                  <DollarSign className="h-3.5 w-3.5" />Sale Record
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {saleRecord.closingDate && (
                    <div>
                      <p className="text-xs text-muted-foreground">Closing Date</p>
                      <p className="text-sm font-medium text-foreground">{new Date(saleRecord.closingDate).toLocaleDateString()}</p>
                    </div>
                  )}
                  {saleRecord.closingPrice && (
                    <div>
                      <p className="text-xs text-muted-foreground">Closing Price</p>
                      <p className="text-sm font-medium text-foreground">${(saleRecord.closingPrice / 1000000).toFixed(2)}M</p>
                    </div>
                  )}
                  {saleRecord.pricePerUnit && (
                    <div>
                      <p className="text-xs text-muted-foreground">Price Per Unit</p>
                      <p className="text-sm font-medium text-foreground">${saleRecord.pricePerUnit.toLocaleString()}</p>
                    </div>
                  )}
                  {saleRecord.capRate && (
                    <div>
                      <p className="text-xs text-muted-foreground">Cap Rate at Sale</p>
                      <p className="text-sm font-medium text-foreground">{saleRecord.capRate}%</p>
                    </div>
                  )}
                </div>
                {saleRecord.processNote && (
                  <div className="pt-2 border-t border-emerald-500/20">
                    <p className="text-xs text-muted-foreground mb-1">Deal Story</p>
                    <p className="text-sm text-foreground whitespace-pre-wrap">{saleRecord.processNote}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Call Prep */}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-sky-400" />
                  Call Prep
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  disabled={webIntelLoading}
                  onClick={() => webIntelMutation.mutate({ propertyId })}
                >
                  {webIntelLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Globe className="h-3.5 w-3.5" />}
                  {webIntelLoading ? "Building brief…" : "Build Call Brief"}
                </Button>
              </div>
            </CardHeader>
            {(webIntelSections || property.webIntelligence) && (
              <CardContent className="space-y-0 pt-0">
                <button
                  className="w-full flex items-center justify-between text-xs text-muted-foreground hover:text-foreground transition-colors py-1.5 px-0"
                  onClick={() => setWebIntelOpen(v => !v)}
                >
                  <span>{webIntelOpen ? "Collapse brief" : "Expand brief"}</span>
                  {webIntelOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                </button>
                {webIntelOpen && (() => {
                  const sections: Record<string, string> = webIntelSections ?? (property.webIntelligence ? JSON.parse(property.webIntelligence) : {});
                  // New 4-layer Call Prep labels
                  const sectionConfig: Array<{ key: string; label: string; color: string; highlight?: boolean }> = [
                    { key: "relationship", label: "Your Relationship", color: "text-emerald-400" },
                    { key: "nearbyActivity", label: "Your Market Activity", color: "text-sky-400" },
                    { key: "marketIntel", label: "Local Market Intel", color: "text-violet-400" },
                    { key: "talkingPoint", label: "Suggested Opening", color: "text-amber-400", highlight: true },
                    // Legacy keys — kept for backward compat with old stored data
                    { key: "ownership", label: "Ownership", color: "text-sky-400" },
                    { key: "ownerProfile", label: "Owner Profile", color: "text-sky-400" },
                    { key: "permitActivity", label: "Permit Activity", color: "text-sky-400" },
                    { key: "saleHistory", label: "Sale History", color: "text-sky-400" },
                    { key: "newsPress", label: "News & Press", color: "text-sky-400" },
                    { key: "zoningEntitlements", label: "Zoning & Entitlements", color: "text-sky-400" },
                    { key: "marketContext", label: "Market Context", color: "text-sky-400" },
                  ];
                  return (
                    <div className="space-y-4 pt-2 border-t border-border">
                      {sectionConfig.map(({ key, label, color, highlight }) => {
                        const text = sections[key];
                        if (!text || text.trim() === "" || text.toLowerCase().includes("no information") || text.toLowerCase() === "n/a" || text.toLowerCase() === "no relevant data found.") return null;
                        return (
                          <div key={key} className={highlight ? "rounded-md bg-amber-500/10 border border-amber-500/20 p-3" : ""}>
                            <p className={`text-xs font-semibold ${color} uppercase tracking-wide mb-1`}>{label}</p>
                            <p className={`text-sm whitespace-pre-wrap leading-relaxed ${highlight ? "text-foreground font-semibold" : "text-foreground/90"}`}>{text}</p>
                          </div>
                        );
                      })}
                      {property.webIntelligenceUpdatedAt && (
                        <p className="text-xs text-muted-foreground/60 pt-2 border-t border-border">
                          Last built {formatDistanceToNow(new Date(property.webIntelligenceUpdatedAt), { addSuffix: true })}
                        </p>
                      )}
                    </div>
                  );
                })()}
              </CardContent>
            )}
            {!webIntelSections && !property.webIntelligence && (
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground italic">Click "Build Call Brief" to get a pre-call summary: your CRM relationship history, nearby listings and matching buyers, local market intel, and one suggested talking point.</p>
              </CardContent>
            )}
          </Card>

          {/* Off-Market Interest */}
          <Card className={`border-border bg-card ${property.offMarketInterest ? "border-amber-500/30 bg-amber-500/5" : ""}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className={`text-sm font-semibold uppercase tracking-wide flex items-center gap-2 ${property.offMarketInterest ? "text-amber-400" : "text-muted-foreground"}`}>
                  <TrendingUp className="h-3.5 w-3.5" />
                  Off-Market Interest
                  {property.offMarketInterest && (
                    <span className="text-xs font-normal px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                      {property.offMarketConfidence === "casual_mention" ? "Casual Mention" :
                       property.offMarketConfidence === "serious_interest" ? "Serious Interest" :
                       property.offMarketConfidence === "actively_exploring" ? "Actively Exploring" : "Flagged"}
                    </span>
                  )}
                </CardTitle>
                <div className="flex gap-2">
                  {omEditing ? (
                    <>
                      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOmEditing(false)}>Cancel</Button>
                      <Button size="sm" className="h-7 text-xs" disabled={updateOffMarket.isPending}
                        onClick={() => updateOffMarket.mutate({ propertyId, offMarketInterest: omInterest, offMarketConfidence: omConfidence || undefined, offMarketTimeline: omTimeline || undefined, offMarketNotes: omNotes || undefined })}>
                        {updateOffMarket.isPending ? "Saving..." : "Save"}
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => { setOmEditing(true); setOmInterest(property.offMarketInterest ?? false); setOmConfidence((property.offMarketConfidence ?? "") as typeof omConfidence); setOmTimeline(property.offMarketTimeline ?? ""); setOmNotes(property.offMarketNotes ?? ""); }}>
                      <Edit2 className="h-3 w-3" />Edit
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {omEditing ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setOmInterest(v => !v)}
                      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${ omInterest ? "bg-amber-500" : "bg-muted" }`}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${ omInterest ? "translate-x-4" : "translate-x-1" }`} />
                    </button>
                    <span className="text-sm text-foreground">{omInterest ? "Owner indicated willingness to sell" : "No indication yet"}</span>
                  </div>
                  {omInterest && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label className="text-xs text-muted-foreground">Confidence Level</Label>
                          <Select value={omConfidence} onValueChange={(v) => setOmConfidence(v as typeof omConfidence)}>
                            <SelectTrigger className="mt-1 h-8 text-xs bg-background border-border">
                              <SelectValue placeholder="Select confidence" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="casual_mention">Casual Mention</SelectItem>
                              <SelectItem value="serious_interest">Serious Interest</SelectItem>
                              <SelectItem value="actively_exploring">Actively Exploring</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs text-muted-foreground">Timeline</Label>
                          <Input className="mt-1 h-8 text-xs bg-background border-border" placeholder="e.g. 2-3 years, 12-18 months" value={omTimeline} onChange={e => setOmTimeline(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs text-muted-foreground">What the owner said</Label>
                        <Textarea className="mt-1 text-xs bg-background border-border resize-none" rows={3} placeholder="Brief note about what was said..." value={omNotes} onChange={e => setOmNotes(e.target.value)} />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div>
                  {property.offMarketInterest ? (
                    <div className="space-y-2">
                      {property.offMarketTimeline && (
                        <div className="flex items-center gap-2">
                          <Calendar className="h-3.5 w-3.5 text-amber-400" />
                          <span className="text-sm text-foreground">Timeline: {property.offMarketTimeline}</span>
                        </div>
                      )}
                      {property.offMarketNotes && (
                        <p className="text-sm text-foreground/80 whitespace-pre-wrap">{property.offMarketNotes}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No off-market interest recorded. Click Edit to flag this property.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Unsolicited Offer Log */}
          <UnsolicitedOfferLog
            propertyId={propertyId}
            onOfferLogged={() => refreshNotes.mutate({ propertyId })}
          />

          {/* Other Parties (non-owner roles) */}
          {(() => {
            const otherParties = (linkedContacts ?? []).filter(lc => lc.dealRole !== "owner");
            return (
              <Card className="border-border bg-card">
                <CardHeader className="pb-3 flex flex-row items-center justify-between cursor-pointer" onClick={() => setShowOtherParties(v => !v)}>
                  <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <Users className="h-3.5 w-3.5" />Other Parties
                    {otherParties.length > 0 && <span className="text-primary font-normal">({otherParties.length})</span>}
                    {showOtherParties ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                  </CardTitle>
                  <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={(e) => { e.stopPropagation(); setShowOtherParties(true); setShowAddLinkedContact(v => !v); }}>
                    <Link2 className="h-3 w-3" />{showAddLinkedContact ? "Cancel" : "+ Link"}
                  </Button>
                </CardHeader>
                {showOtherParties && (
                  <CardContent className="space-y-2 pt-0">
                    {showAddLinkedContact && (
                      <div className="flex gap-2 items-end pb-2 border-b border-border/40">
                        <div className="flex-1">
                          <ContactSearchPicker
                            value={linkedContactPick}
                            onChange={setLinkedContactPick}
                            placeholder="Search contact to link..."
                            allowCreate
                          />
                        </div>
                        <Button
                          size="sm"
                          className="h-9 text-xs"
                          disabled={!linkedContactPick || createLink.isPending}
                          onClick={() => linkedContactPick && createLink.mutate({ contactId: linkedContactPick.id, propertyId, source: "manual" })}
                        >
                          {createLink.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : "Link"}
                        </Button>
                      </div>
                    )}
                    {!otherParties.length && !showAddLinkedContact && (
                      <p className="text-xs text-muted-foreground py-2">No other parties linked. Brokers, attorneys, lenders, etc. show up here.</p>
                    )}
                    {otherParties.map((lc) => (
                      <div key={lc.id} className="flex items-center gap-2.5 group hover:bg-muted/30 rounded-md px-1.5 py-1.5 transition-colors">
                        <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                          <User className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setLocation(`/contacts/${lc.contactId}`)}>
                          <p className="text-sm font-medium text-foreground group-hover:text-primary transition-colors truncate">{lc.firstName} {lc.lastName}</p>
                          <p className="text-xs text-muted-foreground">{sourceLabelMap[lc.source] ?? lc.source}{lc.label ? ` · ${lc.label}` : ""}</p>
                        </div>
                        <Select
                          value={lc.dealRole ?? ""}
                          onValueChange={(val) => updateLinkRole.mutate({ id: lc.id, dealRole: val as any })}
                        >
                          <SelectTrigger className="h-6 w-auto min-w-[90px] text-xs border-dashed border-border/60 bg-transparent px-2 py-0 gap-1">
                            <SelectValue placeholder="Set role" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="owner" className="text-xs">Owner</SelectItem>
                            {DEAL_ROLES.map(r => (
                              <SelectItem key={r.value} value={r.value} className="text-xs">{r.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded"
                          onClick={() => deleteLink.mutate({ id: lc.id })}
                          title="Remove link"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </CardContent>
                )}
              </Card>
            );
          })()}
        </div>

        {/* Right column: Unit Mix on top, Activity Timeline below */}
        <div className="lg:col-span-2 space-y-4">
          {property && ["apartment", "affordable_housing", "mhc"].includes(property.propertyType) && (
            <UnitMixSection
              propertyId={propertyId}
              propertyType={property.propertyType}
              vintageYear={property.vintageYear}
              yearRenovated={property.yearRenovated}
            />
          )}
          <Card className="border-border bg-card">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2"><Activity className="h-3.5 w-3.5" />Activity History</CardTitle>
              <Button variant="outline" size="sm" onClick={() => setShowLogActivity(true)} className="h-7 text-xs gap-1"><Plus className="h-3 w-3" />Log</Button>
            </CardHeader>
            <CardContent>
              {!activities?.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Activity className="h-8 w-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No activities logged yet</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowLogActivity(true)}>Log first activity</Button>
                </div>
              ) : (
                <div className="space-y-0">
                  {activities.map((activity, idx) => (
                    <button
                      key={activity.id}
                      type="button"
                      onClick={() => setOpenActivityId(activity.id)}
                      className="w-full text-left flex gap-3 pb-4 relative hover:bg-muted/40 rounded-md -mx-2 px-2 py-1 transition-colors"
                    >
                      {idx < activities.length - 1 && <div className="absolute left-6 top-9 bottom-0 w-px bg-border" />}
                      <div className="shrink-0 h-8 w-8 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center text-primary z-10">
                        {activityIcons[activity.type] ?? <Activity className="h-3.5 w-3.5" />}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-foreground capitalize">{activity.type}</span>
                          {activity.outcome && <Badge variant="outline" className="text-xs px-1.5 py-0 capitalize">{activity.outcome.replace("_"," ")}</Badge>}
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

          <MatchedBuyersPanel propertyId={propertyId} />
        </div>
      </div>

      {showOwnerResearch && property && (
        <OwnerResearchModal
          open={showOwnerResearch}
          onClose={() => setShowOwnerResearch(false)}
          propertyId={propertyId}
          propertyState={property.state}
          ownerName={property.ownerName}
          onSaved={() => { refetch(); refetchLinkedContacts(); }}
        />
      )}

      <ActivityDetailModal
        activityId={openActivityId}
        open={openActivityId !== null}
        onClose={() => setOpenActivityId(null)}
        onChanged={() => refetchActivities()}
      />

      {showLogActivity && (
        <LogActivityModal
          propertyId={propertyId}
          onClose={() => setShowLogActivity(false)}
          onSuccess={() => {
            setShowLogActivity(false);
            refetchActivities();
            refetch();
            // Auto-refresh AI notes after activity is logged
            refreshNotes.mutate({ propertyId });
          }}
        />
      )}

      {showEditModal && (
        <EditPropertyModal
          property={property}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => { setShowEditModal(false); refetch(); }}
        />
      )}
      <AlertDialog open={showDeleteProperty} onOpenChange={setShowDeleteProperty}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete property?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{property.name}</strong> will be permanently deleted along with all linked data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteProperty.mutate({ id: propertyId })}
              disabled={deleteProperty.isPending}
            >
              {deleteProperty.isPending ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Property Market Badge (display row) ─────────────────────────────────────────────
function PropertyMarketBadge({ marketId }: { marketId: number | null | undefined }) {
  const { data: flat = [] } = trpc.markets.list.useQuery();
  if (!marketId || flat.length === 0) return null;
  const market = (flat as { id: number; name: string }[]).find(m => m.id === marketId);
  if (!market) return null;
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground flex items-center gap-1.5">
        <TrendingUp className="h-3.5 w-3.5" />Market
      </span>
      <span className="text-sm font-medium text-foreground">{market.name}</span>
    </div>
  );
}

// ─── Market Select Field ─────────────────────────────────────────────────────
function MarketSelectField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: flat = [] } = trpc.markets.list.useQuery();
  if (flat.length === 0) return null;
  // Build indented list
  const byId: Record<number, { id: number; name: string; parentId: number | null }> = {};
  for (const m of flat as { id: number; name: string; parentId: number | null }[]) byId[m.id] = m;
  function depth(m: { id: number; parentId: number | null }): number {
    let d = 0; let cur = m;
    while (cur.parentId && byId[cur.parentId]) { d++; cur = byId[cur.parentId]; }
    return d;
  }
  const indented = (flat as { id: number; name: string; parentId: number | null }[]).map(m => ({ id: m.id, name: m.name, depth: depth(m) }));
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">Market Assignment</Label>
      <Select value={value || "none"} onValueChange={(v) => onChange(v === "none" ? "" : v)}>
        <SelectTrigger className="bg-background border-border">
          <SelectValue placeholder="Unassigned" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Unassigned</SelectItem>
          {indented.map(m => (
            <SelectItem key={m.id} value={String(m.id)}>
              {"\u00a0".repeat(m.depth * 3)}{m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// ─── Edit Property Modal ──────────────────────────────────────────────────────
function EditPropertyModal({ property, onClose, onSuccess }: { property: any; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    name:           property.name ?? "",
    address:        property.address ?? "",
    city:           property.city ?? "",
    county:         property.county ?? "",
    state:          property.state ?? "",
    zip:            property.zip ?? "",
    propertyType:   property.propertyType ?? "apartment",
    status:         property.status ?? "researching",
    unitCount:      property.unitCount != null ? String(property.unitCount) : "",
    vintageYear:    property.vintageYear != null ? String(property.vintageYear) : "",
    sizeSqft:       property.sizeSqft != null ? String(property.sizeSqft) : "",
    lotAcres:       property.lotAcres != null ? String(property.lotAcres) : "",
    estimatedValue: property.estimatedValue != null ? String(property.estimatedValue) : "",
    askingPrice:    property.askingPrice != null ? String(property.askingPrice) : "",
    noi:            property.noi != null ? String(property.noi) : "",
    capRate:        property.capRate != null ? String(property.capRate) : "",
    lastSalePrice:  property.lastSalePrice != null ? String(property.lastSalePrice) : "",
    lastSaleDate:   property.lastSaleDate ? new Date(property.lastSaleDate).toISOString().slice(0, 10) : "",
    ownerName:      property.ownerName ?? "",
    ownerCompany:   property.ownerCompany ?? "",
    ownerPhone:     property.ownerPhone ?? "",
    ownerEmail:     property.ownerEmail ?? "",
    notes:          property.notes ?? "",
    marketId:       property.marketId != null ? String(property.marketId) : "",
  });

  const updateProperty = trpc.properties.update.useMutation({
    onSuccess: () => { toast.success("Property updated!"); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });

  function handleSave() {
    updateProperty.mutate({
      id:             property.id,
      name:           form.name || undefined,
      address:        form.address || undefined,
      city:           form.city || undefined,
      county:         form.county || undefined,
      state:          form.state || undefined,
      zip:            form.zip || undefined,
      propertyType:   form.propertyType as any,
      status:         form.status as any,
      unitCount:      form.unitCount      ? parseInt(form.unitCount)       : undefined,
      vintageYear:    form.vintageYear    ? parseInt(form.vintageYear)     : undefined,
      sizeSqft:       form.sizeSqft       ? parseInt(form.sizeSqft)        : undefined,
      lotAcres:       form.lotAcres       ? parseFloat(form.lotAcres)      : undefined,
      estimatedValue: form.estimatedValue ? parseFloat(form.estimatedValue): undefined,
      askingPrice:    form.askingPrice    ? parseFloat(form.askingPrice)   : undefined,
      noi:            form.noi            ? parseFloat(form.noi)           : undefined,
      capRate:        form.capRate        ? parseFloat(form.capRate)       : undefined,
      lastSalePrice:  form.lastSalePrice  ? parseFloat(form.lastSalePrice) : undefined,
      lastSaleDate:   form.lastSaleDate   ? new Date(form.lastSaleDate)    : undefined,
      ownerName:      form.ownerName || undefined,
      ownerCompany:   form.ownerCompany || undefined,
      ownerPhone:     form.ownerPhone || undefined,
      ownerEmail:     form.ownerEmail || undefined,
      notes:          form.notes || undefined,
      marketId:       form.marketId ? parseInt(form.marketId) : null,
    });
  }

  const f = (key: keyof typeof form, label: string, type: "text" | "number" | "date" = "text") => (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input type={type} value={form[key]} onChange={(e) => setForm(prev => ({ ...prev, [key]: e.target.value }))} className="bg-background border-border h-8 text-sm" />
    </div>
  );

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl bg-card border-border max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-foreground">Edit Property</DialogTitle></DialogHeader>
        <div className="space-y-5 py-2">

          {/* Basic */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Basic Info</p>
            <div className="grid grid-cols-2 gap-3">
              {f("name", "Property Name")}
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={form.propertyType} onValueChange={(v) => setForm(p => ({ ...p, propertyType: v }))}>
                  <SelectTrigger className="bg-background border-border h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="apartment">Apartment</SelectItem>
                    <SelectItem value="mhc">MHC</SelectItem>
                    <SelectItem value="affordable_housing">Affordable Housing</SelectItem>
                    <SelectItem value="self_storage">Self Storage</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm(p => ({ ...p, status: v }))}>
                  <SelectTrigger className="bg-background border-border h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="researching">Researching</SelectItem>
                    <SelectItem value="prospecting">Prospecting</SelectItem>
                    <SelectItem value="seller">Seller</SelectItem>
                    <SelectItem value="listed">Listed</SelectItem>
                    <SelectItem value="recently_sold">Recently Sold</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Address</p>
            <div className="grid grid-cols-2 gap-3">
              {f("address", "Street Address")}
              {f("city",    "City")}
              {f("county",  "County")}
              {f("state",   "State")}
              {f("zip",     "Zip")}
            </div>
          </div>

          {/* Details */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Property Details</p>
            <div className="grid grid-cols-3 gap-3">
              {f("unitCount",   "Units",      "number")}
              {f("vintageYear", "Year Built", "number")}
              {f("sizeSqft",    "Sq Ft",      "number")}
              {f("lotAcres",    "Acres",      "number")}
            </div>
          </div>

          {/* Financials */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Financials</p>
            <div className="grid grid-cols-2 gap-3">
              {f("estimatedValue", "Est. Value ($)",  "number")}
              {f("askingPrice",    "Asking Price ($)", "number")}
              {f("noi",            "NOI ($)",          "number")}
              {f("capRate",        "Cap Rate (%)",     "number")}
              {f("lastSalePrice",  "Last Sale Price ($)", "number")}
              {f("lastSaleDate",   "Last Sale Date",   "date")}
            </div>
          </div>

          {/* Owner */}
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Owner Info</p>
            <div className="grid grid-cols-2 gap-3">
              {f("ownerName",    "Owner Name")}
              {f("ownerCompany", "Owner Company")}
              {f("ownerPhone",   "Owner Phone")}
              {f("ownerEmail",   "Owner Email")}
            </div>
          </div>

          {/* Market Assignment */}
          <MarketSelectField value={form.marketId} onChange={(v) => setForm(p => ({ ...p, marketId: v }))} />

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea value={form.notes} onChange={(e) => setForm(p => ({ ...p, notes: e.target.value }))} className="bg-background border-border resize-none text-sm" rows={4} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={updateProperty.isPending}>
            {updateProperty.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Log Activity Modal ───────────────────────────────────────────────────────
function LogActivityModal({ propertyId, onClose, onSuccess }: { propertyId: number; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({
    type:    "call" as "call"|"email"|"meeting"|"note"|"text"|"voicemail",
    subject: "",
    notes:   "",
    outcome: "" as ""|"reached"|"voicemail"|"no_answer"|"callback_requested"|"not_interested"|"interested"|"follow_up",
  });
  const createActivity = trpc.activities.create.useMutation({
    onSuccess: () => { toast.success("Activity logged!"); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-card border border-border rounded-xl p-6 w-full max-w-md space-y-4">
        <h3 className="text-lg font-semibold text-foreground">Log Activity</h3>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Type</Label>
            <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as typeof form.type }))}>
              <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="call">Call</SelectItem><SelectItem value="email">Email</SelectItem><SelectItem value="meeting">Meeting</SelectItem><SelectItem value="note">Note</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Outcome</Label>
            <Select value={form.outcome} onValueChange={(v) => setForm(f => ({ ...f, outcome: v as typeof form.outcome }))}>
              <SelectTrigger className="bg-background border-border"><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent><SelectItem value="reached">Reached</SelectItem><SelectItem value="voicemail">Voicemail</SelectItem><SelectItem value="no_answer">No Answer</SelectItem><SelectItem value="interested">Interested</SelectItem><SelectItem value="not_interested">Not Interested</SelectItem><SelectItem value="follow_up">Follow Up</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Subject</Label><input className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground" value={form.subject} onChange={(e) => setForm(f => ({ ...f, subject: e.target.value }))} placeholder="e.g. Called about sale timeline" /></div>
        <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Notes</Label><textarea className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm text-foreground resize-none" rows={3} value={form.notes} onChange={(e) => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="What happened?" /></div>
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button onClick={() => createActivity.mutate({ propertyId, type: form.type, subject: form.subject || undefined, notes: form.notes || undefined, outcome: form.outcome || undefined })} disabled={createActivity.isPending}>
            {createActivity.isPending ? "Saving…" : "Save Activity"}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Matched Buyers Panel ─────────────────────────────────────────────────────
function MatchedBuyersPanel({ propertyId }: { propertyId: number }) {
  const [, setLocation] = useLocation();
  const { data: matches, isLoading } = trpc.buyerCriteria.matchBuyers.useQuery({ propertyId });
  if (isLoading || !matches?.length) return null;
  return (
    <Card className="border-border bg-card">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
          <Target className="h-3.5 w-3.5 text-green-400" />Matched Buyers
          <Badge variant="outline" className="text-[10px] bg-green-500/10 text-green-400 border-green-500/30 ml-1">{matches.length}</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {matches.map(({ contact, criteria }) => (
            <div key={contact.id} className="flex items-center justify-between p-3 rounded-lg bg-muted/20 hover:bg-muted/40 cursor-pointer transition-colors border border-border/50 group" onClick={() => setLocation(`/contacts/${contact.id}`)}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-foreground">{contact.firstName} {contact.lastName}</p>
                  {contact.company && <span className="text-xs text-muted-foreground">· {contact.company}</span>}
                  <Badge variant="outline" className={`text-[10px] shrink-0 capitalize ${contact.priority === "hot" ? "bg-red-500/10 text-red-400 border-red-500/30" : contact.priority === "warm" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-slate-500/10 text-slate-400 border-slate-500/30"}`}>{contact.priority}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {criteria.minUnits != null || criteria.maxUnits != null ? `${criteria.minUnits ?? "Any"}–${criteria.maxUnits ?? "Any"} units` : "Any unit count"}
                  {criteria.markets ? ` · ${(JSON.parse(criteria.markets) as string[]).join(", ")}` : ""}
                  {criteria.minPrice != null || criteria.maxPrice != null ? ` · $${criteria.minPrice != null ? (criteria.minPrice/1_000_000).toFixed(1)+"M" : "Any"}–${criteria.maxPrice != null ? (criteria.maxPrice/1_000_000).toFixed(1)+"M" : "Any"}` : ""}
                </p>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Unsolicited Offer Log ────────────────────────────────────────────────────
function UnsolicitedOfferLog({ propertyId, onOfferLogged }: { propertyId: number; onOfferLogged?: () => void }) {
  const { data: offers, refetch } = trpc.properties.offers.useQuery({ propertyId }, { enabled: !!propertyId });
  const { data: allContacts } = trpc.contacts.list.useQuery({ limit: 2000 });
  const createOffer = trpc.properties.createOffer.useMutation({
    onSuccess: () => { toast.success("Offer logged"); refetch(); setShowAdd(false); resetForm(); onOfferLogged?.(); },
    onError: (e) => toast.error(e.message),
  });
  const deleteOffer = trpc.properties.deleteOffer.useMutation({
    onSuccess: () => { toast.success("Offer removed"); refetch(); },
    onError: (e) => toast.error(e.message),
  });

  const [showAdd, setShowAdd] = useState(false);
  const [amount, setAmount] = useState("");
  const [buyerContactId, setBuyerContactId] = useState<number | undefined>(undefined);
  const [buyerSearch, setBuyerSearch] = useState("");
  const [buyerFocused, setBuyerFocused] = useState(false);
  const [receivedAt, setReceivedAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");

  function resetForm() { setAmount(""); setBuyerContactId(undefined); setBuyerSearch(""); setReceivedAt(new Date().toISOString().slice(0, 10)); setNotes(""); }

  const buyerResults = buyerSearch.trim().length >= 1
    ? (allContacts ?? []).filter(c => {
        const q = buyerSearch.toLowerCase();
        return `${c.firstName} ${c.lastName ?? ""}`.toLowerCase().includes(q) ||
          (c.company ?? "").toLowerCase().includes(q);
      }).slice(0, 8)
    : [];

  const selectedBuyer = buyerContactId ? (allContacts ?? []).find(c => c.id === buyerContactId) : null;

  function handleAdd() {
    createOffer.mutate({
      propertyId,
      amount: amount ? parseFloat(amount) : undefined,
      buyerContactId: buyerContactId ?? undefined,
      receivedAt: new Date(receivedAt),
      notes: notes || undefined,
    });
  }

  const offerTypeColor = "bg-orange-500/20 text-orange-400 border-orange-500/30";

  return (
    <Card className="border-border bg-card border-orange-500/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-orange-400 uppercase tracking-wide flex items-center gap-2">
            <DollarSign className="h-3.5 w-3.5" />
            Unsolicited Offers
            {offers && offers.length > 0 && (
              <span className="text-xs font-normal px-1.5 py-0.5 rounded bg-orange-500/20 text-orange-300 border border-orange-500/30">
                {offers.length}
              </span>
            )}
          </CardTitle>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1" onClick={() => setShowAdd(v => !v)}>
            <Plus className="h-3 w-3" />{showAdd ? "Cancel" : "Log Offer"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {showAdd && (
          <div className="space-y-3 p-3 rounded-lg bg-muted/30 border border-border">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Offer Amount ($)</Label>
                <Input className="mt-1 h-8 text-xs bg-background border-border" placeholder="e.g. 4200000" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Date Received</Label>
                <Input className="mt-1 h-8 text-xs bg-background border-border" type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} />
              </div>
            </div>
            <div className="relative">
              <Label className="text-xs text-muted-foreground">Buyer (optional)</Label>
              {selectedBuyer ? (
                <div className="mt-1 flex items-center gap-2 h-8 px-3 rounded-md border border-border bg-background text-xs">
                  <span className="flex-1 truncate">{selectedBuyer.firstName} {selectedBuyer.lastName ?? ""}{selectedBuyer.company ? ` — ${selectedBuyer.company}` : ""}</span>
                  <button type="button" className="text-muted-foreground hover:text-foreground shrink-0" onClick={() => { setBuyerContactId(undefined); setBuyerSearch(""); }}>
                    ✕
                  </button>
                </div>
              ) : (
                <div className="relative">
                  <Input
                    className="mt-1 h-8 text-xs bg-background border-border"
                    placeholder="Search contacts..."
                    value={buyerSearch}
                    onChange={e => setBuyerSearch(e.target.value)}
                    onFocus={() => setBuyerFocused(true)}
                    onBlur={() => setTimeout(() => setBuyerFocused(false), 150)}
                  />
                  {buyerFocused && buyerResults.length > 0 && (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-popover border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {buyerResults.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-accent-foreground"
                          onMouseDown={() => { setBuyerContactId(c.id); setBuyerSearch(""); setBuyerFocused(false); }}
                        >
                          <span className="font-medium">{c.firstName} {c.lastName ?? ""}</span>
                          {c.company && <span className="text-muted-foreground ml-1">— {c.company}</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Notes</Label>
              <Textarea className="mt-1 text-xs bg-background border-border resize-none" rows={2} placeholder="Context about this offer..." value={notes} onChange={e => setNotes(e.target.value)} />
            </div>
            <Button size="sm" className="h-7 text-xs w-full" disabled={createOffer.isPending} onClick={handleAdd}>
              {createOffer.isPending ? "Saving..." : "Save Offer"}
            </Button>
          </div>
        )}

        {!offers || offers.length === 0 ? (
          <p className="text-xs text-muted-foreground">No unsolicited offers logged yet. Use "Log Offer" to track incoming interest on this off-market property.</p>
        ) : (
          <div className="space-y-2">
            {offers.map(offer => (
              <div key={offer.id} className="flex items-start gap-3 p-2.5 rounded-lg bg-muted/20 border border-border group">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${offerTypeColor}`}>Offer</span>
                    {offer.amount && (
                      <span className="text-sm font-semibold text-foreground">
                        ${offer.amount >= 1_000_000
                          ? `${(offer.amount / 1_000_000).toFixed(2)}M`
                          : offer.amount.toLocaleString()}
                      </span>
                    )}
                    {offer.buyerName && (
                      <span className="text-xs text-muted-foreground">from {offer.buyerName}</span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {new Date(offer.receivedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </span>
                  </div>
                  {offer.notes && <p className="text-xs text-muted-foreground mt-1">{offer.notes}</p>}
                </div>
                <button
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                  onClick={() => { if (confirm("Remove this offer record?")) deleteOffer.mutate({ id: offer.id }); }}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Property Connections Panel ─────────────────────────────────────────────
function PropertyConnectionsPanel({ connections, propertyId, hasOwner, onLinked }: {
  connections: any[]; propertyId: number; hasOwner: boolean; onLinked: () => void;
}) {
  const [, setLocation] = useLocation();
  const [conflictContactId, setConflictContactId] = useState<number | null>(null);
  const [conflictName, setConflictName] = useState<string>("");

  const linkAsOwner = trpc.ownerResearch.linkContactAsOwner.useMutation({
    onSuccess: () => { toast.success("Linked as owner!"); onLinked(); setConflictContactId(null); },
    onError: (e) => toast.error(e.message),
  });

  const handleLink = (contactId: number, contactName: string) => {
    if (hasOwner) {
      // Show conflict resolution
      setConflictContactId(contactId);
      setConflictName(contactName);
    } else {
      // Just link silently
      linkAsOwner.mutate({ propertyId, contactId, mode: "co_owner" });
    }
  };

  // Dedupe connections by contactId for the contact-type matches
  const contactConnections = connections.filter((c) => c.matchedIn === "contact");
  const seenContacts = new Set<number>();
  const uniqueContactConnections = contactConnections.filter((c) => {
    if (seenContacts.has(c.matchedRecordId)) return false;
    seenContacts.add(c.matchedRecordId);
    return true;
  });
  const otherConnections = connections.filter((c) => c.matchedIn !== "contact");

  return (
    <>
      <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
        <p className="text-xs font-medium text-blue-400">Possible Connections</p>

        {/* Contact-based connections — actionable */}
        {uniqueContactConnections.map((conn) => (
          <div key={`${conn.type}-${conn.matchedRecordId}`} className="flex items-start gap-2 text-xs">
            <div className="flex-1 min-w-0">
              <div className="text-muted-foreground">
                <span className="text-foreground font-medium">{conn.matchedRecordName}</span>
                {conn.type === "address_match" && " — address matches"}
                {conn.type === "name_match" && " — name matches"}
                {conn.linkedProperties.length > 0 && (
                  <span className="text-muted-foreground"> · also owns </span>
                )}
                {conn.linkedProperties.slice(0, 3).map((p: any, j: number) => (
                  <span key={p.id}>
                    {j > 0 && ", "}
                    <button className="text-primary hover:underline" onClick={() => setLocation(`/properties/${p.id}`)}>
                      {p.name}
                    </button>
                  </span>
                ))}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[10px] px-2 shrink-0"
              onClick={() => handleLink(conn.matchedRecordId, conn.matchedRecordName)}
              disabled={linkAsOwner.isPending}
            >
              <Link2 className="h-2.5 w-2.5 mr-1" />Link as Owner
            </Button>
          </div>
        ))}

        {/* Entity-based / property connections — informational only */}
        {otherConnections.slice(0, 5).map((conn) => (
          <div key={`${conn.type}-${conn.matchedRecordId}`} className="text-xs text-muted-foreground">
            {conn.matchedField} matches{" "}
            <span className="text-foreground">{conn.matchedRecordName}</span>
            {conn.linkedProperties.length > 0 && (
              <>
                {" — "}
                {conn.linkedProperties.slice(0, 3).map((p: any, j: number) => (
                  <span key={p.id}>
                    {j > 0 && ", "}
                    <button className="text-primary hover:underline" onClick={() => setLocation(`/properties/${p.id}`)}>
                      {p.name}
                    </button>
                  </span>
                ))}
              </>
            )}
          </div>
        ))}
      </div>

      {/* Conflict resolution dialog */}
      <AlertDialog open={conflictContactId !== null} onOpenChange={(o) => !o && setConflictContactId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Property already has an owner</AlertDialogTitle>
            <AlertDialogDescription>
              How should {conflictName} be added?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <Button
              variant="outline"
              onClick={() => conflictContactId && linkAsOwner.mutate({ propertyId, contactId: conflictContactId, mode: "co_owner" })}
            >
              Add as Co-Owner
            </Button>
            <AlertDialogAction
              onClick={() => conflictContactId && linkAsOwner.mutate({ propertyId, contactId: conflictContactId, mode: "replace" })}
            >
              Replace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

