import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Phone, Plus, Trash2, Check, X, MessageSquare, ChevronDown, ChevronUp, Voicemail } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PhoneListProps {
  contactId: number;
  primaryPhone?: string | null;
}

const statusConfig: Record<string, { label: string; className: string }> = {
  untried: { label: "Untried", className: "bg-muted/40 text-muted-foreground" },
  verified: { label: "Verified", className: "bg-primary/10 text-primary" },
  wrong_number: { label: "Wrong #", className: "bg-destructive/10 text-destructive" },
  disconnected: { label: "Disconnected", className: "bg-destructive/10 text-destructive" },
  no_answer: { label: "No Answer", className: "bg-amber-500/10 text-amber-500" },
};

export function PhoneList({ contactId, primaryPhone }: PhoneListProps) {
  const [expanded, setExpanded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newNumber, setNewNumber] = useState("");
  const [editingNotes, setEditingNotes] = useState<number | null>(null);
  const [noteText, setNoteText] = useState("");

  const { data: phones, refetch } = trpc.ownerResearch.listPhones.useQuery({ contactId });
  const addPhone = trpc.ownerResearch.addPhone.useMutation({
    onSuccess: () => { toast.success("Phone added"); refetch(); setShowAdd(false); setNewNumber(""); },
    onError: () => toast.error("Failed to add phone"),
  });
  const updatePhone = trpc.ownerResearch.updatePhone.useMutation({
    onSuccess: () => { refetch(); },
    onError: () => toast.error("Failed to update"),
  });
  const deletePhone = trpc.ownerResearch.deletePhone.useMutation({
    onSuccess: () => { toast.success("Phone removed"); refetch(); },
    onError: () => toast.error("Failed to remove"),
  });

  const allPhones = phones ?? [];
  const primaryFromTable = allPhones.find((p) => p.isPrimary) ?? allPhones[0];
  const bestPhone = primaryFromTable?.number ?? primaryPhone;
  const extraCount = allPhones.length > 1 ? allPhones.length - 1 : (primaryPhone && allPhones.length > 0 ? 0 : 0);
  const hasExtras = allPhones.length > 1 || (primaryPhone && allPhones.length > 0 && !allPhones.some((p) => p.number === primaryPhone));

  // No phones at all
  if (!bestPhone && allPhones.length === 0) {
    return showAdd ? (
      <div className="flex items-center gap-1.5">
        <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
        <Input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="(208) 555-1234" className="h-7 text-xs bg-background border-border flex-1" onKeyDown={(e) => { if (e.key === "Enter" && newNumber.trim()) addPhone.mutate({ contactId, number: newNumber.trim() }); if (e.key === "Escape") setShowAdd(false); }} autoFocus />
        <Button size="sm" className="h-7 text-xs px-2" onClick={() => addPhone.mutate({ contactId, number: newNumber.trim() })} disabled={!newNumber.trim()}>Add</Button>
      </div>
    ) : (
      <button onClick={() => setShowAdd(true)} className="flex items-center gap-2.5 text-muted-foreground hover:text-primary">
        <Phone className="h-4 w-4 shrink-0" /><span className="text-sm">Add phone</span>
      </button>
    );
  }

  return (
    <div className="space-y-1">
      {/* Primary phone — always visible */}
      <div className="flex items-center gap-2 group relative min-w-0">
        <Phone className="h-4 w-4 text-primary shrink-0" />
        <a href={`tel:${bestPhone}`} className="text-sm text-foreground hover:text-primary transition-colors whitespace-nowrap">{bestPhone}</a>
        {primaryFromTable && (
          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-normal whitespace-nowrap shrink-0 ${statusConfig[primaryFromTable.status]?.className ?? ""}`}>
            {statusConfig[primaryFromTable.status]?.label ?? primaryFromTable.status}
          </Badge>
        )}
        {/* Expand toggle */}
        {hasExtras && (
          <button onClick={() => setExpanded(!expanded)} className="text-xs text-muted-foreground hover:text-primary ml-auto flex items-center gap-0.5 shrink-0 whitespace-nowrap">
            +{allPhones.length - 1} {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>
        )}
        {/* Inline actions — overlay on hover so they don't push layout */}
        {primaryFromTable && (
          <div className="hidden group-hover:flex items-center gap-1.5 absolute right-0 top-1/2 -translate-y-1/2 bg-card pl-2 shadow-sm">
            {primaryFromTable.status !== "verified" && (
              <button onClick={() => updatePhone.mutate({ id: primaryFromTable.id, status: "verified" })} className="text-primary hover:text-primary/80" title="Mark Verified"><Check className="h-3.5 w-3.5" /></button>
            )}
            {primaryFromTable.status !== "wrong_number" && (
              <button onClick={() => updatePhone.mutate({ id: primaryFromTable.id, status: "wrong_number" })} className="text-muted-foreground hover:text-destructive" title="Wrong #"><X className="h-3.5 w-3.5" /></button>
            )}
            <button onClick={() => { setEditingNotes(editingNotes === primaryFromTable.id ? null : primaryFromTable.id); setNoteText(primaryFromTable.statusNotes ?? ""); }} className="text-muted-foreground hover:text-primary" title="Note"><MessageSquare className="h-3.5 w-3.5" /></button>
            <button onClick={() => { const note = `VM ${format(new Date(), "M/d")}`; const existing = primaryFromTable.statusNotes ? `${primaryFromTable.statusNotes} · ${note}` : note; updatePhone.mutate({ id: primaryFromTable.id, statusNotes: existing, status: "no_answer" }); toast.success("VM logged"); }} className="text-muted-foreground hover:text-amber-500" title="Left VM"><Voicemail className="h-3.5 w-3.5" /></button>
          </div>
        )}
      </div>

      {/* Notes for primary */}
      {primaryFromTable?.statusNotes && editingNotes !== primaryFromTable.id && (
        <p className="text-xs text-muted-foreground pl-[26px]">{primaryFromTable.statusNotes}</p>
      )}
      {editingNotes === primaryFromTable?.id && (
        <div className="flex items-center gap-1.5 pl-[26px]">
          <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Left VM 4/6" className="h-7 text-xs bg-background border-border flex-1" onKeyDown={(e) => { if (e.key === "Enter") { updatePhone.mutate({ id: primaryFromTable!.id, statusNotes: noteText }); setEditingNotes(null); } if (e.key === "Escape") setEditingNotes(null); }} autoFocus />
          <Button size="sm" className="h-7 text-xs px-2" onClick={() => { updatePhone.mutate({ id: primaryFromTable!.id, statusNotes: noteText }); setEditingNotes(null); }}>Save</Button>
        </div>
      )}

      {/* Expanded: additional phones */}
      {expanded && allPhones.filter((p) => p.id !== primaryFromTable?.id).map((p) => (
        <div key={p.id} className="group">
          <div className="flex items-center gap-2.5 pl-[26px]">
            <a href={`tel:${p.number}`} className="text-sm text-muted-foreground hover:text-primary transition-colors">{p.number}</a>
            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-normal ${statusConfig[p.status]?.className ?? ""}`}>
              {statusConfig[p.status]?.label ?? p.status}
            </Badge>
            <span className="text-[10px] text-muted-foreground">{p.type === "mobile" ? "Mobile" : p.type === "landline" ? "Landline" : ""}</span>
            <div className="hidden group-hover:flex items-center gap-1 ml-auto">
              {p.status !== "verified" && <button onClick={() => updatePhone.mutate({ id: p.id, status: "verified" })} className="text-primary" title="Verified"><Check className="h-3 w-3" /></button>}
              {p.status !== "wrong_number" && <button onClick={() => updatePhone.mutate({ id: p.id, status: "wrong_number" })} className="text-muted-foreground hover:text-destructive" title="Wrong #"><X className="h-3 w-3" /></button>}
              <button onClick={() => { setEditingNotes(editingNotes === p.id ? null : p.id); setNoteText(p.statusNotes ?? ""); }} className="text-muted-foreground hover:text-primary" title="Note"><MessageSquare className="h-3 w-3" /></button>
              <button onClick={() => { const note = `VM ${format(new Date(), "M/d")}`; const existing = p.statusNotes ? `${p.statusNotes} · ${note}` : note; updatePhone.mutate({ id: p.id, statusNotes: existing, status: "no_answer" }); toast.success("VM logged"); }} className="text-muted-foreground hover:text-amber-500" title="Left VM"><Voicemail className="h-3 w-3" /></button>
              <button onClick={() => deletePhone.mutate({ id: p.id })} className="text-muted-foreground hover:text-destructive" title="Remove"><Trash2 className="h-3 w-3" /></button>
            </div>
          </div>
          {p.statusNotes && editingNotes !== p.id && <p className="text-xs text-muted-foreground pl-[26px] mt-0.5">{p.statusNotes}</p>}
          {editingNotes === p.id && (
            <div className="flex items-center gap-1.5 mt-1 pl-[26px]">
              <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="e.g. Left VM 4/6" className="h-7 text-xs bg-background border-border flex-1" onKeyDown={(e) => { if (e.key === "Enter") { updatePhone.mutate({ id: p.id, statusNotes: noteText }); setEditingNotes(null); } if (e.key === "Escape") setEditingNotes(null); }} autoFocus />
              <Button size="sm" className="h-7 text-xs px-2" onClick={() => { updatePhone.mutate({ id: p.id, statusNotes: noteText }); setEditingNotes(null); }}>Save</Button>
            </div>
          )}
        </div>
      ))}

      {/* Add phone - only in expanded view */}
      {expanded && (
        showAdd ? (
          <div className="flex items-center gap-1.5 pl-[26px]">
            <Input value={newNumber} onChange={(e) => setNewNumber(e.target.value)} placeholder="(208) 555-1234" className="h-7 text-xs bg-background border-border flex-1" onKeyDown={(e) => { if (e.key === "Enter" && newNumber.trim()) addPhone.mutate({ contactId, number: newNumber.trim() }); if (e.key === "Escape") setShowAdd(false); }} autoFocus />
            <Button size="sm" className="h-7 text-xs px-2" onClick={() => addPhone.mutate({ contactId, number: newNumber.trim() })} disabled={!newNumber.trim()}>Add</Button>
          </div>
        ) : (
          <button onClick={() => setShowAdd(true)} className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 pl-[26px]"><Plus className="h-3 w-3" />Add phone</button>
        )
      )}
    </div>
  );
}
