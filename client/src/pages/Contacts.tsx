import { trpc } from "@/lib/trpc";
import { useState, useEffect } from "react";
type DuplicateMatch = { id: number; firstName: string; lastName: string; email?: string | null; phone?: string | null; company?: string | null };
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Search, Plus, Phone, Mail, Building2, User, ChevronRight, Filter, Type, Link2, X, ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

const priorityColors: Record<string, string> = {
  hot: "bg-red-500/20 text-red-500 border-red-500/30",
  warm: "bg-red-400/15 text-red-400 border-red-400/25",
  cold: "bg-slate-400/15 text-slate-400 border-slate-400/25",
  inactive: "bg-slate-300/15 text-slate-300 border-slate-300/20",
};

export default function Contacts() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [linkedPropertyId, setLinkedPropertyId] = useState<number | null>(null);
  const [linkedPropertyName, setLinkedPropertyName] = useState<string>("");
  const [propertyPickerOpen, setPropertyPickerOpen] = useState(false);
  const [propertySearch, setPropertySearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [displayLimit, setDisplayLimit] = useState(200);

  const utils = trpc.useUtils();

  const normalizeCasing = trpc.contacts.normalizeNameCasing.useMutation({
    onSuccess: (result) => {
      if (result.updated === 0) {
        toast.info("All contact names already look good!");
      } else {
        toast.success(`Fixed casing for ${result.updated} contact${result.updated === 1 ? "" : "s"}`);
        utils.contacts.list.invalidate();
      }
    },
    onError: () => toast.error("Failed to normalize names"),
  });

  // Load properties for the filter dropdown
  const { data: allProperties } = trpc.properties.list.useQuery(
    { search: propertySearch || undefined, limit: 50 },
    { enabled: propertyPickerOpen }
  );

  // Reset display limit when filters change
  useEffect(() => { setDisplayLimit(200); }, [search, filterRole, filterPriority, linkedPropertyId]);

  const { data: contacts, isLoading, refetch } = trpc.contacts.list.useQuery({
    search: search || undefined,
    isOwner: filterRole === "owner" ? true : undefined,
    isBuyer: filterRole === "buyer" ? true : undefined,
    priority: filterPriority !== "all" ? filterPriority : undefined,
    linkedPropertyId: linkedPropertyId ?? undefined,
    limit: displayLimit,
  });

  const clearPropertyFilter = () => {
    setLinkedPropertyId(null);
    setLinkedPropertyName("");
  };

  return (
    <div className="p-6 space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {contacts?.length ?? 0}{contacts?.length === displayLimit ? "+" : ""} contacts
            {linkedPropertyName && (
              <span className="ml-1 text-violet-400">· linked to {linkedPropertyName}</span>
            )}
            {!linkedPropertyName && " · Owners, Buyers & Dual-Role"}
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-xs h-9"
            onClick={() => normalizeCasing.mutate()}
            disabled={normalizeCasing.isPending}
            title="Fix ALL-CAPS or all-lowercase contact names to Title Case"
          >
            <Type className="h-3.5 w-3.5" />
            {normalizeCasing.isPending ? "Fixing..." : "Fix Name Casing"}
          </Button>
          <Button onClick={() => setShowAddModal(true)} className="gap-2">
            <Plus className="h-4 w-4" /> Add Contact
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, email, company..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9 bg-card border-border" />
        </div>

        <Select value={filterRole} onValueChange={setFilterRole}>
          <SelectTrigger className="w-36 bg-card border-border">
            <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" /><SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Roles</SelectItem>
            <SelectItem value="owner">Owners</SelectItem>
            <SelectItem value="buyer">Buyers</SelectItem>
          </SelectContent>
        </Select>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36 bg-card border-border"><SelectValue placeholder="Priority" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Priority</SelectItem>
            <SelectItem value="hot">Hot</SelectItem>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="cold">Cold</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
          </SelectContent>
        </Select>

        {/* Linked to Property filter */}
        <Popover open={propertyPickerOpen} onOpenChange={setPropertyPickerOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className={cn(
                "w-52 justify-between bg-card border-border text-sm font-normal",
                linkedPropertyId && "border-violet-500/50 bg-violet-500/10 text-violet-300"
              )}
            >
              <span className="flex items-center gap-1.5 truncate">
                <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{linkedPropertyName || "Linked to Property"}</span>
              </span>
              {linkedPropertyId ? (
                <X
                  className="h-3.5 w-3.5 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={(e) => { e.stopPropagation(); clearPropertyFilter(); }}
                />
              ) : (
                <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0 bg-card border-border" align="start">
            <Command>
              <CommandInput
                placeholder="Search properties..."
                value={propertySearch}
                onValueChange={setPropertySearch}
                className="h-9"
              />
              <CommandList>
                <CommandEmpty className="py-4 text-center text-sm text-muted-foreground">No properties found</CommandEmpty>
                {linkedPropertyId && (
                  <CommandGroup>
                    <CommandItem
                      onSelect={clearPropertyFilter}
                      className="text-muted-foreground text-xs"
                    >
                      <X className="h-3.5 w-3.5 mr-2" />
                      Clear filter
                    </CommandItem>
                  </CommandGroup>
                )}
                <CommandGroup heading="Properties">
                  {allProperties?.map((p) => (
                    <CommandItem
                      key={p.id}
                      value={p.name}
                      onSelect={() => {
                        setLinkedPropertyId(p.id);
                        setLinkedPropertyName(p.name);
                        setPropertyPickerOpen(false);
                        setPropertySearch("");
                      }}
                    >
                      <Check className={cn("mr-2 h-4 w-4", linkedPropertyId === p.id ? "opacity-100" : "opacity-0")} />
                      <div className="flex-1 min-w-0">
                        <p className="truncate text-sm">{p.name}</p>
                        {p.city && <p className="text-xs text-muted-foreground truncate">{p.city}, {p.state}</p>}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Active filter badge */}
      {linkedPropertyId && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtered by:</span>
          <Badge
            variant="outline"
            className="gap-1.5 text-xs bg-violet-500/10 text-violet-300 border-violet-500/30 cursor-pointer hover:bg-violet-500/20"
            onClick={clearPropertyFilter}
          >
            <Link2 className="h-3 w-3" />
            {linkedPropertyName}
            <X className="h-3 w-3" />
          </Badge>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">{[1,2,3,4,5].map(i => <div key={i} className="h-20 bg-card rounded-lg animate-pulse" />)}</div>
      ) : !contacts?.length ? (
        <div className="text-center py-16 text-muted-foreground">
          <User className="h-12 w-12 mx-auto mb-3 opacity-20" />
          <p className="font-medium">
            {linkedPropertyId ? `No contacts linked to ${linkedPropertyName}` : "No contacts found"}
          </p>
          <p className="text-sm mt-1">
            {linkedPropertyId
              ? "Contacts are linked when created from Email Studio or AI Assistant, or manually on the property page."
              : "Add your first contact to get started"}
          </p>
          {!linkedPropertyId && (
            <Button className="mt-4" onClick={() => setShowAddModal(true)}><Plus className="h-4 w-4 mr-2" />Add Contact</Button>
          )}
          {linkedPropertyId && (
            <Button variant="outline" className="mt-4" onClick={clearPropertyFilter}><X className="h-4 w-4 mr-2" />Clear filter</Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <Card key={contact.id} className="card-hover cursor-pointer border-border bg-card" onClick={() => setLocation(`/contacts/${contact.id}`)}>
              <CardContent className="p-4 flex items-center gap-4">
                <Avatar className="h-10 w-10 border border-border shrink-0">
                  <AvatarFallback className="bg-primary/10 text-primary text-sm font-semibold">{contact.firstName[0]}{contact.lastName[0]}</AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-foreground">{contact.firstName} {contact.lastName}</span>
                    <Badge variant="outline" className={`text-xs px-1.5 py-0 ${priorityColors[contact.priority]}`}>{contact.priority}</Badge>
                    {contact.isOwner && <Badge variant="outline" className="text-xs px-1.5 py-0 bg-slate-500/10 text-slate-500 border-slate-500/30">Owner</Badge>}
                    {contact.isBuyer && <Badge variant="outline" className="text-xs px-1.5 py-0 bg-slate-400/10 text-slate-400 border-slate-400/30">Buyer</Badge>}
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground flex-wrap">
                    {contact.company && <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" />{contact.company}</span>}
                    {contact.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{contact.phone}</span>}
                    {contact.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{contact.email}</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          ))}
          {contacts.length === displayLimit && (
            <div className="pt-2 text-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDisplayLimit(prev => prev + 200)}
                className="text-xs"
              >
                Load more contacts
              </Button>
            </div>
          )}
        </div>
      )}

      <AddContactModal open={showAddModal} onClose={() => setShowAddModal(false)} onSuccess={() => { setShowAddModal(false); refetch(); }} />
    </div>
  );
}

export function AddContactModal({ open, onClose, onSuccess }: { open: boolean; onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", phone: "", company: "", isOwner: false, isBuyer: false, priority: "warm" as "hot"|"warm"|"cold"|"inactive", notes: "", city: "", state: "ID" });
  const [dupMatches, setDupMatches] = useState<DuplicateMatch[]>([]);
  const [checkedOnce, setCheckedOnce] = useState(false);
  const checkDup = trpc.contacts.checkDuplicate.useQuery(
    { firstName: form.firstName, lastName: form.lastName, email: form.email || undefined, phone: form.phone || undefined },
    { enabled: false }
  );
  const createContact = trpc.contacts.create.useMutation({
    onSuccess: () => { toast.success("Contact added!"); setDupMatches([]); setCheckedOnce(false); onSuccess(); },
    onError: (e) => toast.error(e.message),
  });
  const doCreate = () => createContact.mutate({ ...form, email: form.email || undefined });
  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName) return toast.error("First and last name required");
    if (!checkedOnce) {
      const result = await checkDup.refetch();
      setCheckedOnce(true);
      if (result.data && result.data.length > 0) {
        setDupMatches(result.data as DuplicateMatch[]);
        return;
      }
    }
    doCreate();
  };
  const handleClose = () => { setDupMatches([]); setCheckedOnce(false); onClose(); };
  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader><DialogTitle className="text-foreground">Add New Contact</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">First Name *</Label><Input value={form.firstName} onChange={(e) => { setForm({...form, firstName: e.target.value}); setCheckedOnce(false); setDupMatches([]); }} className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Last Name *</Label><Input value={form.lastName} onChange={(e) => { setForm({...form, lastName: e.target.value}); setCheckedOnce(false); setDupMatches([]); }} className="bg-background border-border" /></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Email</Label><Input type="email" value={form.email} onChange={(e) => { setForm({...form, email: e.target.value}); setCheckedOnce(false); setDupMatches([]); }} className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Phone</Label><Input value={form.phone} onChange={(e) => { setForm({...form, phone: e.target.value}); setCheckedOnce(false); setDupMatches([]); }} className="bg-background border-border" /></div>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Company</Label><Input value={form.company} onChange={(e) => setForm({...form, company: e.target.value})} className="bg-background border-border" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">City</Label><Input value={form.city} onChange={(e) => setForm({...form, city: e.target.value})} className="bg-background border-border" /></div>
            <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Priority</Label>
              <Select value={form.priority} onValueChange={(v) => setForm({...form, priority: v as typeof form.priority})}>
                <SelectTrigger className="bg-background border-border"><SelectValue /></SelectTrigger>
                <SelectContent><SelectItem value="hot">Hot</SelectItem><SelectItem value="warm">Warm</SelectItem><SelectItem value="cold">Cold</SelectItem><SelectItem value="inactive">Inactive</SelectItem></SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={form.isOwner} onCheckedChange={(c) => setForm({...form, isOwner: !!c})} /><span className="text-sm text-foreground">Property Owner</span></label>
            <label className="flex items-center gap-2 cursor-pointer"><Checkbox checked={form.isBuyer} onCheckedChange={(c) => setForm({...form, isBuyer: !!c})} /><span className="text-sm text-foreground">Buyer</span></label>
          </div>
          <div className="space-y-1.5"><Label className="text-xs text-muted-foreground">Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({...form, notes: e.target.value})} className="bg-background border-border resize-none" rows={3} /></div>
          {dupMatches.length > 0 && (
            <div className="border border-amber-300 bg-amber-50 rounded-md p-3 text-sm">
              <div className="font-medium text-amber-900 mb-1">Possible duplicates found</div>
              <ul className="text-xs text-amber-800 space-y-0.5 mb-2">
                {dupMatches.map((m) => (
                  <li key={m.id}>{m.firstName} {m.lastName}{m.company ? ` (${m.company})` : ""}</li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={handleClose}>Cancel</Button>
                <Button size="sm" onClick={doCreate} disabled={createContact.isPending}>
                  Create anyway
                </Button>
              </div>
            </div>
          )}
        </div>
        {dupMatches.length === 0 && (
          <DialogFooter>
            <Button variant="outline" onClick={handleClose}>Cancel</Button>
            <Button onClick={handleSubmit} disabled={createContact.isPending || checkDup.isFetching}>{checkDup.isFetching ? "Checking..." : createContact.isPending ? "Adding..." : "Add Contact"}</Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
