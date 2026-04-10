import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ArrowLeft, Building2, MapPin, MoreHorizontal, Trash2 } from "lucide-react";
import { ALL_PROPERTY_TYPES, getEnabledTypes, parsePreferences } from "../Settings";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const STATUSES = [
  { value: "researching", label: "Researching" },
  { value: "prospecting", label: "Prospecting" },
  { value: "seller", label: "Seller" },
  { value: "listed", label: "Listed" },
  { value: "under_contract", label: "Under Contract" },
  { value: "recently_sold", label: "Recently Sold" },
] as const;

interface Props {
  property: Record<string, any>;
  onSave: (key: string, value: any) => Promise<void>;
}

export function PropertyHeader({ property, onSave }: Props) {
  const [, setLocation] = useLocation();
  const [editingName, setEditingName] = useState(false);
  const [editingAddress, setEditingAddress] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [addressDraft, setAddressDraft] = useState({ address: "", city: "", state: "", zip: "" });
  const [showDelete, setShowDelete] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const profileQuery = trpc.users.getMyProfile.useQuery();
  const prefs = parsePreferences(profileQuery.data?.preferences ?? "");
  const enabledTypes = getEnabledTypes(prefs);
  const PROPERTY_TYPES = ALL_PROPERTY_TYPES.filter((t) => enabledTypes.includes(t.value));

  const deleteProperty = trpc.properties.delete.useMutation({
    onSuccess: () => {
      toast.success("Property deleted");
      setLocation("/properties");
    },
    onError: (e) => toast.error(e.message),
  });

  useEffect(() => {
    if (editingName && nameRef.current) {
      nameRef.current.focus();
      nameRef.current.select();
    }
  }, [editingName]);

  const fullAddress = [property.address, property.city, property.state, property.zip]
    .filter(Boolean)
    .join(", ");

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => setLocation("/properties")} className="gap-1 text-muted-foreground">
          <ArrowLeft className="h-4 w-4" /> Properties
        </Button>
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center text-primary shrink-0">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            {editingName ? (
              <Input
                ref={nameRef}
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                onBlur={async () => {
                  if (nameDraft && nameDraft !== property.name) {
                    await onSave("name", nameDraft);
                  }
                  setEditingName(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    (e.target as HTMLInputElement).blur();
                  }
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="text-2xl font-semibold h-auto py-0.5 px-1 -ml-1 border-transparent focus:border-border"
              />
            ) : (
              <h1
                className="text-2xl font-semibold truncate cursor-text hover:bg-muted/50 rounded px-1 -ml-1 transition-colors"
                onClick={() => {
                  setNameDraft(property.name);
                  setEditingName(true);
                }}
              >
                {property.name}
              </h1>
            )}

            {editingAddress ? (
              <div className="flex items-center gap-1.5 mt-1">
                <Input
                  value={addressDraft.address}
                  onChange={(e) => setAddressDraft((d) => ({ ...d, address: e.target.value }))}
                  placeholder="Address"
                  className="h-7 text-sm flex-1"
                  autoFocus
                />
                <Input
                  value={addressDraft.city}
                  onChange={(e) => setAddressDraft((d) => ({ ...d, city: e.target.value }))}
                  placeholder="City"
                  className="h-7 text-sm w-24"
                />
                <Input
                  value={addressDraft.state}
                  onChange={(e) => setAddressDraft((d) => ({ ...d, state: e.target.value }))}
                  placeholder="ST"
                  className="h-7 text-sm w-14"
                />
                <Input
                  value={addressDraft.zip}
                  onChange={(e) => setAddressDraft((d) => ({ ...d, zip: e.target.value }))}
                  placeholder="Zip"
                  className="h-7 text-sm w-20"
                />
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  onClick={async () => {
                    await onSave("address", addressDraft.address || null);
                    await onSave("city", addressDraft.city || null);
                    await onSave("state", addressDraft.state || null);
                    await onSave("zip", addressDraft.zip || null);
                    setEditingAddress(false);
                  }}
                >
                  Save
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingAddress(false)}>
                  Cancel
                </Button>
              </div>
            ) : (
              <div
                className="flex items-center gap-1 mt-1 text-sm text-muted-foreground cursor-text hover:bg-muted/50 rounded px-1 -ml-1 py-0.5 transition-colors"
                onClick={() => {
                  setAddressDraft({
                    address: property.address ?? "",
                    city: property.city ?? "",
                    state: property.state ?? "",
                    zip: property.zip ?? "",
                  });
                  setEditingAddress(true);
                }}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0" />
                {fullAddress || <span className="italic text-muted-foreground/60">Add address...</span>}
              </div>
            )}

            <div className="flex items-center gap-2 mt-2">
              <Select
                value={property.propertyType}
                onValueChange={(v) => onSave("propertyType", v)}
              >
                <SelectTrigger className="h-7 text-xs w-auto min-w-[100px] border-transparent hover:border-border transition-colors capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PROPERTY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={property.status}
                onValueChange={(v) => onSave("status", v)}
              >
                <SelectTrigger className="h-7 text-xs w-auto min-w-[100px] border-transparent hover:border-border transition-colors capitalize">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {property.unitCount && (
                <span className="text-xs text-muted-foreground">{property.unitCount} units</span>
              )}
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-2" />
              Delete Property
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={showDelete} onOpenChange={setShowDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete property?</AlertDialogTitle>
            <AlertDialogDescription>
              <strong>{property.name}</strong> will be permanently deleted along with all linked
              data. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteProperty.mutate({ id: property.id })}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
