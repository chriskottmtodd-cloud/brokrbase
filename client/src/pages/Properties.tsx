import { useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Building2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { ALL_PROPERTY_TYPES, getEnabledTypes, parsePreferences } from "./Settings";

export default function Properties() {
  const [, setLocation] = useLocation();
  const [search, setSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const profileQuery = trpc.users.getMyProfile.useQuery();
  const prefs = parsePreferences(profileQuery.data?.preferences ?? "");
  const enabledTypes = getEnabledTypes(prefs);
  const PROPERTY_TYPES = ALL_PROPERTY_TYPES.filter((t) => enabledTypes.includes(t.value));

  const { data: properties, refetch } = trpc.properties.list.useQuery({
    search: search || undefined,
    limit: 200,
  });

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Properties</h1>
          <p className="text-sm text-muted-foreground">
            {properties?.length ?? 0} {properties?.length === 1 ? "property" : "properties"}
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)} className="gap-1">
          <Plus className="h-4 w-4" /> Add Property
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, address, city…"
          className="pl-9"
        />
      </div>

      {properties?.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="h-10 w-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No properties yet</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => setShowCreate(true)}>
              Add your first property
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {properties?.map((p) => (
          <Link key={p.id} href={`/properties/${p.id}`}>
            <Card className="hover:bg-muted/40 cursor-pointer h-full">
              <CardContent className="p-4">
                <div className="flex items-start gap-2">
                  <div className="h-9 w-9 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shrink-0">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{p.name}</div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {p.propertyType.replace("_", " ")}
                      </Badge>
                      {p.unitCount && <span>{p.unitCount} units</span>}
                    </div>
                    {p.city && (
                      <div className="text-xs text-muted-foreground mt-1 truncate">
                        {p.city}
                        {p.state ? `, ${p.state}` : ""}
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {showCreate && (
        <CreatePropertyModal
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setShowCreate(false);
            refetch();
            setLocation(`/properties/${id}`);
          }}
        />
      )}
    </div>
  );
}

function CreatePropertyModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const profileQ = trpc.users.getMyProfile.useQuery();
  const prefs2 = parsePreferences(profileQ.data?.preferences ?? "");
  const PROPERTY_TYPES = ALL_PROPERTY_TYPES.filter((t) => getEnabledTypes(prefs2).includes(t.value));
  const firstEnabledType = PROPERTY_TYPES[0]?.value ?? "apartment";
  const [form, setForm] = useState({
    name: "",
    propertyType: firstEnabledType as string,
    address: "",
    city: "",
    state: "",
    zip: "",
    unitCount: "",
  });
  const create = trpc.properties.create.useMutation({
    onSuccess: (res) => onCreated(res.id),
    onError: (e) => toast.error(e.message),
  });

  const handleSave = () => {
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    create.mutate({
      name: form.name,
      propertyType: form.propertyType as "mhc" | "apartment" | "affordable_housing" | "self_storage" | "office" | "retail" | "industrial" | "other",
      address: form.address || undefined,
      city: form.city || undefined,
      state: form.state || undefined,
      zip: form.zip || undefined,
      unitCount: form.unitCount ? Number(form.unitCount) : undefined,
    });
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Property</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label>Name *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>Type</Label>
            <Select value={form.propertyType} onValueChange={(v) => setForm({ ...form, propertyType: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROPERTY_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Address</Label>
            <Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Label>City</Label>
              <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
            <div>
              <Label>State</Label>
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Zip</Label>
              <Input value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} />
            </div>
            <div>
              <Label>Units</Label>
              <Input type="number" value={form.unitCount} onChange={(e) => setForm({ ...form, unitCount: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={create.isPending}>
            {create.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
