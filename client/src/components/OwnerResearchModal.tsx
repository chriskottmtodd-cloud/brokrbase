import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search, Building2, User } from "lucide-react";
import { toast } from "sonner";
import { ResearchResults } from "./ResearchResults";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY","DC",
];

interface OwnerResearchModalProps {
  open: boolean;
  onClose: () => void;
  propertyId: number;
  propertyState?: string | null;
  ownerName?: string | null;
  onSaved: () => void;
}

export function OwnerResearchModal({ open, onClose, propertyId, propertyState, ownerName, onSaved }: OwnerResearchModalProps) {
  const [tab, setTab] = useState<"llc" | "name">("llc");
  const [llcName, setLlcName] = useState(ownerName ?? "");
  const [llcState, setLlcState] = useState(propertyState ?? "ID");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState(propertyState ?? "ID");
  const [zip, setZip] = useState("");

  const [llcResults, setLlcResults] = useState<any[] | null>(null);
  const [llcCrossRefs, setLlcCrossRefs] = useState<any[] | null>(null);
  const [manualResults, setManualResults] = useState<any | null>(null);

  const llcLookup = trpc.ownerResearch.llcLookup.useMutation();
  const manualEntry = trpc.ownerResearch.manualEntry.useMutation();

  const handleLlcSearch = async () => {
    if (!llcName.trim()) return;
    try {
      const result = await llcLookup.mutateAsync({ propertyId, llcName: llcName.trim(), state: llcState });
      setLlcResults(result.contacts);
      setLlcCrossRefs(result.crossReferences ?? []);
      if (result.contacts.length === 0) {
        toast.info("No results found for this LLC");
      }
    } catch (err: any) {
      toast.error(err.message ?? "LLC lookup failed");
    }
  };

  const handleManualSearch = async () => {
    if (!firstName.trim() || !lastName.trim()) return;
    try {
      const result = await manualEntry.mutateAsync({
        propertyId,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        address: address.trim() || undefined,
        city: city.trim() || undefined,
        state: state.trim() || undefined,
        zip: zip.trim() || undefined,
      });
      setManualResults(result);
    } catch (err: any) {
      toast.error(err.message ?? "Search failed");
    }
  };

  const handleSaved = () => {
    onSaved();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Search className="h-4 w-4" />Owner Research
          </DialogTitle>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex gap-1 bg-muted rounded-lg p-1">
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "llc" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => { setTab("llc"); setManualResults(null); }}
          >
            <Building2 className="h-3.5 w-3.5" />LLC Lookup
          </button>
          <button
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === "name" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            onClick={() => { setTab("name"); setLlcResults(null); }}
          >
            <User className="h-3.5 w-3.5" />Name + Address
          </button>
        </div>

        {/* LLC Lookup Tab */}
        {tab === "llc" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">LLC / Entity Name</Label>
              <Input
                value={llcName}
                onChange={(e) => setLlcName(e.target.value)}
                placeholder="e.g. PRIMROSE ASPEN LLC"
                className="h-8 text-sm"
                onKeyDown={(e) => e.key === "Enter" && handleLlcSearch()}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">State of Filing</Label>
              <Select value={llcState} onValueChange={setLlcState}>
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {US_STATES.map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              className="w-full h-8 text-xs gap-1"
              onClick={handleLlcSearch}
              disabled={llcLookup.isPending || !llcName.trim()}
            >
              {llcLookup.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              Search (~$0.50)
            </Button>

            {llcResults && llcResults.length > 0 && (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-2">{llcResults.length} result{llcResults.length !== 1 ? "s" : ""} found</p>
                <ResearchResults contacts={llcResults} onSaved={handleSaved} propertyId={propertyId} crossReferences={llcCrossRefs ?? undefined} />
              </div>
            )}
            {llcResults && llcResults.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-4">No officers or contacts found for this LLC.</p>
            )}
          </div>
        )}

        {/* Name + Address Tab */}
        {tab === "name" && !manualResults && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">First Name</Label>
                <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Mark" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Last Name</Label>
                <Input value={lastName} onChange={(e) => setLastName(e.target.value)} placeholder="Leary" className="h-8 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Street Address</Label>
              <Input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="3 Leeward" className="h-8 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Belvedere" className="h-8 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">State</Label>
                <Select value={state} onValueChange={setState}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>{US_STATES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Zip</Label>
                <Input value={zip} onChange={(e) => setZip(e.target.value)} placeholder="94920" className="h-8 text-sm" />
              </div>
            </div>
            <Button
              className="w-full h-8 text-xs gap-1"
              onClick={handleManualSearch}
              disabled={manualEntry.isPending || !firstName.trim() || !lastName.trim()}
            >
              {manualEntry.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Search className="h-3 w-3" />}
              Search & Enrich (~$0.25)
            </Button>
          </div>
        )}

        {/* Manual entry results */}
        {tab === "name" && manualResults && (
          <div className="space-y-3">
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setManualResults(null)}>
              &larr; New Search
            </Button>
            <ResearchResults
              contacts={[{
                id: manualResults.researchContactId,
                fullName: `${firstName} ${lastName}`,
                firstName,
                lastName,
                title: null,
                contactType: "principal",
                isEntity: false,
                address, city, state, zip,
              }]}
              onSaved={handleSaved}
              propertyId={propertyId}
            />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
