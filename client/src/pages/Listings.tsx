import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Plus, Building2, DollarSign, Users, ChevronRight, Tag, TrendingUp, Search, ChevronsUpDown, Check } from "lucide-react";

const stageColors: Record<string, string> = {
  new: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  active: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  under_contract: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  closed: "bg-green-500/20 text-green-400 border-green-500/30",
  withdrawn: "bg-red-500/20 text-red-400 border-red-500/30",
  expired: "bg-slate-500/20 text-slate-400 border-slate-500/30",
};

export default function Listings() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState("all");
  const [showAddModal, setShowAddModal] = useState(false);

  const { data: listings, isLoading, refetch } = trpc.listings.list.useQuery({
    search: search || undefined,
    stage: filterStage !== "all" ? filterStage : undefined,
  });

  const totalValue = listings?.reduce((sum, l) => sum + (l.askingPrice ?? 0), 0) ?? 0;
  const totalBuyers = listings?.reduce((sum, l) => sum + (l.interestedBuyerCount ?? 0), 0) ?? 0;

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Listings</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{listings?.length ?? 0} active listings</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="gap-2">
          <Plus className="h-4 w-4" /> New Listing
        </Button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center"><Tag className="h-5 w-5 text-primary" /></div>
            <div><p className="text-2xl font-bold text-foreground">{listings?.length ?? 0}</p><p className="text-xs text-muted-foreground">Total Listings</p></div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-green-500/10 flex items-center justify-center"><DollarSign className="h-5 w-5 text-green-400" /></div>
            <div><p className="text-2xl font-bold text-foreground">${(totalValue / 1000000).toFixed(1)}M</p><p className="text-xs text-muted-foreground">Total Value</p></div>
          </CardContent>
        </Card>
        <Card className="border-border bg-card">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-500/10 flex items-center justify-center"><Users className="h-5 w-5 text-blue-400" /></div>
            <div><p className="text-2xl font-bold text-foreground">{totalBuyers}</p><p className="text-xs text-muted-foreground">Total Buyer Interest</p></div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search listings..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
        </div>
        <Select value={filterStage} onValueChange={setFilterStage}>
          <SelectTrigger className="w-40 bg-card border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Stages</SelectItem>
            <SelectItem value="new">New</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="under_contract">Under Contract</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
            <SelectItem value="withdrawn">Withdrawn</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Listings */}
      {isLoading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-40 bg-card rounded-lg animate-pulse" />)}</div>
      ) : !listings?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <Tag className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">No listings yet</p>
          <p className="text-sm mt-1">Create your first listing to track buyer interest</p>
          <Button className="mt-4" onClick={() => setShowAddModal(true)}><Plus className="h-4 w-4 mr-2" />New Listing</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {listings.map((listing) => {
            const engagementPct = listing.interestedBuyerCount ? Math.min(100, (listing.interestedBuyerCount / 20) * 100) : 0;
            return (
              <Card key={listing.id} className="card-hover cursor-pointer border-border bg-card" onClick={() => setLocation(`/listings/${listing.id}`)}>
                <CardContent className="p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="h-11 w-11 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-foreground text-lg">{listing.title}</span>
                          <Badge variant="outline" className={`text-xs px-1.5 py-0 ${stageColors[listing.stage] ?? ""}`}>{listing.stage.replace("_", " ")}</Badge>
                        </div>
                        {listing.propertyName && <p className="text-sm text-muted-foreground mt-0.5">{listing.propertyName}</p>}
                        <div className="flex items-center gap-4 mt-2 text-sm flex-wrap">
                          {listing.askingPrice && <span className="font-semibold text-primary flex items-center gap-1"><DollarSign className="h-3.5 w-3.5" />{(listing.askingPrice / 1000000).toFixed(2)}M asking</span>}
                          {listing.capRate && <span className="text-muted-foreground">{listing.capRate}% cap rate</span>}
                          {listing.unitCount && <span className="text-muted-foreground">{listing.unitCount} units</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <div className="flex items-center gap-1.5 text-sm">
                        <Users className="h-4 w-4 text-blue-400" />
                        <span className="font-semibold text-foreground">{listing.interestedBuyerCount ?? 0}</span>
                        <span className="text-muted-foreground">buyers</span>
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>

                  {/* Buyer engagement bar */}
                  <div className="mt-4 space-y-1.5">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3" />Buyer Engagement</span>
                      <span>{listing.interestedBuyerCount ?? 0} interested</span>
                    </div>
                    <Progress value={engagementPct} className="h-1.5" />
                  </div>

                  {listing.description && <p className="text-sm text-muted-foreground mt-3 line-clamp-2">{listing.description}</p>}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AddListingModal open={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={() => { setShowAddModal(false); refetch(); }} />
    </div>
  );
}

function AddListingModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ title: "", propertyId: "", askingPrice: "", capRate: "", unitCount: "", stage: "active" as "new"|"active"|"under_contract"|"closed"|"withdrawn"|"expired", description: "", highlights: "" });
  const [propSearch, setPropSearch] = useState("");
  const [propOpen, setPropOpen] = useState(false);
  const { data: properties } = trpc.properties.list.useQuery(
    { search: propSearch || undefined, limit: 30 }
  );
  const selectedProp = properties?.find(p => String(p.id) === form.propertyId);
  const createListing = trpc.listings.create.useMutation({
    onSuccess: () => { toast.success("Listing created!"); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">New Listing</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Listing Title *</Label><Input value={form.title} onChange={(e) => setForm({...form, title: e.target.value})} placeholder="e.g. Sunrise MHC - 80 Units" className="bg-background border-border" /></div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Linked Property</Label>
            <Popover open={propOpen} onOpenChange={setPropOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  role="combobox"
                  aria-expanded={propOpen}
                  className="w-full justify-between bg-background border-border text-sm font-normal h-9 px-3"
                >
                  <span className={selectedProp ? "text-foreground" : "text-muted-foreground"}>
                    {selectedProp ? selectedProp.name : "Search property by name or address…"}
                  </span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-muted-foreground" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[440px] p-0 bg-card border-border" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Type to search properties…"
                    value={propSearch}
                    onValueChange={setPropSearch}
                    className="h-9"
                  />
                  <CommandList>
                    <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">
                      {propSearch.length < 1 ? "Start typing to search…" : "No properties found."}
                    </CommandEmpty>
                    {properties && properties.length > 0 && (
                      <CommandGroup>
                        {properties.map(p => (
                          <CommandItem
                            key={p.id}
                            value={String(p.id)}
                            onSelect={(val) => {
                              setForm({ ...form, propertyId: val === form.propertyId ? "" : val });
                              setPropOpen(false);
                              setPropSearch("");
                            }}
                            className="flex items-start gap-2 py-2"
                          >
                            <Check className={`mt-0.5 h-4 w-4 shrink-0 ${form.propertyId === String(p.id) ? "opacity-100" : "opacity-0"}`} />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-foreground truncate">{p.name}</p>
                              {(p.address || p.city) && (
                                <p className="text-xs text-muted-foreground truncate">
                                  {[p.address, p.city, p.state].filter(Boolean).join(", ")}
                                </p>
                              )}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {form.propertyId && (
              <button
                type="button"
                onClick={() => setForm({ ...form, propertyId: "" })}
                className="text-[11px] text-muted-foreground hover:text-foreground underline"
              >
                Clear selection
              </button>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Asking Price ($)</Label><Input type="number" value={form.askingPrice} onChange={(e) => setForm({...form, askingPrice: e.target.value})} className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Cap Rate (%)</Label><Input type="number" step="0.1" value={form.capRate} onChange={(e) => setForm({...form, capRate: e.target.value})} className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Units</Label><Input type="number" value={form.unitCount} onChange={(e) => setForm({...form, unitCount: e.target.value})} className="bg-background border-border" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Stage</Label>
            <Select value={form.stage} onValueChange={(v) => setForm({...form, stage: v as typeof form.stage})}>
              <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="new">New</SelectItem><SelectItem value="active">Active</SelectItem><SelectItem value="under_contract">Under Contract</SelectItem></SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Description</Label><Textarea value={form.description} onChange={(e) => setForm({...form, description: e.target.value})} className="bg-background border-border resize-none" rows={3} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => { if (!form.title) return toast.error("Title required"); createListing.mutate({ title: form.title, propertyId: form.propertyId ? parseInt(form.propertyId) : undefined, askingPrice: form.askingPrice ? parseFloat(form.askingPrice) : undefined, capRate: form.capRate ? parseFloat(form.capRate) : undefined, unitCount: form.unitCount ? parseInt(form.unitCount) : undefined, stage: form.stage, description: form.description || undefined }); }} disabled={createListing.isPending}>{createListing.isPending ? "Creating..." : "Create Listing"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
