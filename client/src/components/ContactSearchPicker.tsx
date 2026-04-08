import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { User, Plus, X, Loader2, AlertTriangle, ExternalLink } from "lucide-react";

export interface PickedContact {
  id: number;
  firstName: string;
  lastName: string;
  company?: string | null;
  phone?: string | null;
  isOwner?: boolean;
  isBuyer?: boolean;
  priority?: string;
  lastContactedAt?: Date | null;
}

interface Props {
  value: PickedContact | null;
  onChange: (c: PickedContact | null) => void;
  required?: boolean;
  placeholder?: string;
  allowCreate?: boolean;
  className?: string;
  /** Pre-fill the create form with AI-detected data */
  defaultEmail?: string;
  defaultCompany?: string;
  defaultPhone?: string;
}

/** Levenshtein distance for fuzzy name matching */
function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j-1], dp[i-1][j], dp[i][j-1]);
  return dp[m][n];
}

function findDuplicates(
  firstName: string,
  lastName: string,
  allContacts: PickedContact[]
): PickedContact[] {
  const full = `${firstName} ${lastName}`.toLowerCase().trim();
  if (full.length < 2) return [];
  return allContacts.filter((c) => {
    const existing = `${c.firstName} ${c.lastName}`.toLowerCase();
    const dist = levenshtein(full, existing);
    const maxLen = Math.max(full.length, existing.length);
    const similarity = 1 - dist / maxLen;
    // Flag if >70% similar or first names match exactly
    return similarity >= 0.7 || c.firstName.toLowerCase() === firstName.toLowerCase();
  }).slice(0, 3);
}

export function ContactSearchPicker({ value, onChange, required, placeholder, allowCreate, className, defaultEmail, defaultCompany, defaultPhone }: Props) {
  const [query, setQuery]           = useState("");
  const [open, setOpen]             = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newForm, setNewForm]       = useState({ firstName: "", lastName: "", phone: defaultPhone ?? "", company: defaultCompany ?? "", email: defaultEmail ?? "", isOwner: false, isBuyer: false });
  const [dupWarning, setDupWarning] = useState<PickedContact[]>([]);
  const [confirmedNew, setConfirmedNew] = useState(false);

  const utils = trpc.useUtils();

  const { data: results } = trpc.contacts.list.useQuery(
    { search: query, limit: 12 },
    { enabled: query.length >= 1 }
  );

  // Load all contacts for duplicate checking (only when create form is open)
  const { data: allContacts } = trpc.contacts.list.useQuery(
    { limit: 2000 },
    { enabled: showCreate }
  );

  const duplicates = useMemo(() => {
    if (!showCreate || !allContacts || confirmedNew) return [];
    return findDuplicates(newForm.firstName, newForm.lastName, allContacts as PickedContact[]);
  }, [showCreate, allContacts, newForm.firstName, newForm.lastName, confirmedNew]);

  const createContact = trpc.contacts.create.useMutation({
    onSuccess: (c) => {
      utils.contacts.list.invalidate();
      onChange(c as PickedContact);
      setShowCreate(false);
      setOpen(false);
      setQuery("");
      setDupWarning([]);
      setConfirmedNew(false);
      // Toast with "View Contact" link
      toast.success(
        <span className="flex items-center gap-2">
          {c.firstName} {c.lastName} added to CRM.
          <a
            href={`/contacts/${c.id}`}
            target="_blank"
            rel="noreferrer"
            className="underline text-primary font-medium flex items-center gap-0.5"
            onClick={(e) => e.stopPropagation()}
          >
            View <ExternalLink className="h-3 w-3" />
          </a>
        </span>
      );
    },
  });

  function handleCreate() {
    // If duplicates exist and not yet confirmed, show warning instead
    if (duplicates.length > 0 && !confirmedNew) {
      setDupWarning(duplicates);
      return;
    }
    createContact.mutate({
      firstName: newForm.firstName,
      lastName: newForm.lastName,
      phone: newForm.phone || undefined,
      email: newForm.email || undefined,
      company: newForm.company || undefined,
      priority: "warm",
      isOwner: newForm.isOwner,
      isBuyer: newForm.isBuyer,
    });
  }

  if (value) {
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30 ${className ?? ""}`}>
        <User className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-sm font-medium text-foreground flex-1 truncate">
          {value.firstName} {value.lastName}
        </span>
        {value.company && (
          <span className="text-xs text-muted-foreground truncate hidden sm:block">{value.company}</span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-5 w-5 p-0 shrink-0 text-muted-foreground hover:text-foreground"
          onClick={() => onChange(null)}
        >
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ""}`}>
      <Input
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setShowCreate(false); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder={placeholder ?? "Search contacts by name…"}
        className={`bg-background border-border text-sm ${required ? "border-primary/50 focus:border-primary" : ""}`}
      />

      {open && query.length >= 1 && !showCreate && (
        <div className="absolute top-full left-0 right-0 z-50 mt-1 bg-card border border-border rounded-md shadow-lg overflow-hidden max-h-52 overflow-y-auto">
          {results && results.length > 0
            ? results.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="w-full text-left px-3 py-2.5 text-sm hover:bg-muted/30 transition-colors border-b border-border/40 last:border-0 flex items-center gap-2"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(c as PickedContact); setQuery(""); setOpen(false); }}
                >
                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-medium text-foreground">{c.firstName} {c.lastName}</span>
                  {c.company && <span className="text-muted-foreground text-xs">· {c.company}</span>}
                  <span className="ml-auto text-[10px] text-muted-foreground">
                    {[c.isOwner && "Owner", c.isBuyer && "Buyer"].filter(Boolean).join(" · ")}
                  </span>
                </button>
              ))
            : <div className="px-3 py-2 text-xs text-muted-foreground">No contacts found for "{query}"</div>
          }
          {allowCreate && query.length >= 2 && (
            <button
              type="button"
              className="w-full text-left px-3 py-2.5 text-sm hover:bg-primary/5 transition-colors text-primary flex items-center gap-1.5 border-t border-border/40"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                const parts = query.trim().split(" ");
                setNewForm({ firstName: parts[0] ?? "", lastName: parts.slice(1).join(" "), phone: defaultPhone ?? "", company: defaultCompany ?? "", email: defaultEmail ?? "", isOwner: false, isBuyer: false });
                setDupWarning([]);
                setConfirmedNew(false);
                setShowCreate(true);
                setOpen(false);
              }}
            >
              <Plus className="h-3.5 w-3.5" /> Create new contact "{query}"
            </button>
          )}
        </div>
      )}

      {showCreate && (
        <div className="mt-2 p-3 border border-primary/30 rounded-md bg-primary/5 space-y-2">
          <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
            <Plus className="h-3.5 w-3.5" /> New Contact
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Input
              value={newForm.firstName}
              onChange={(e) => { setNewForm(f => ({ ...f, firstName: e.target.value })); setDupWarning([]); setConfirmedNew(false); }}
              placeholder="First name *"
              className="h-7 text-xs bg-background border-border"
            />
            <Input
              value={newForm.lastName}
              onChange={(e) => { setNewForm(f => ({ ...f, lastName: e.target.value })); setDupWarning([]); setConfirmedNew(false); }}
              placeholder="Last name"
              className="h-7 text-xs bg-background border-border"
            />
          </div>
          <Input value={newForm.email}   onChange={(e) => setNewForm(f => ({ ...f, email: e.target.value }))}   placeholder="Email (optional)"    className="h-7 text-xs bg-background border-border" />
          <Input value={newForm.phone}   onChange={(e) => setNewForm(f => ({ ...f, phone: e.target.value }))}   placeholder="Phone (optional)"    className="h-7 text-xs bg-background border-border" />
          <Input value={newForm.company} onChange={(e) => setNewForm(f => ({ ...f, company: e.target.value }))} placeholder="Company (optional)"  className="h-7 text-xs bg-background border-border" />
          <div className="flex gap-3 pt-0.5">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={newForm.isBuyer} onChange={(e) => setNewForm(f => ({ ...f, isBuyer: e.target.checked }))} className="h-3 w-3 accent-primary" />
              Buyer
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={newForm.isOwner} onChange={(e) => setNewForm(f => ({ ...f, isOwner: e.target.checked }))} className="h-3 w-3 accent-primary" />
              Owner
            </label>
          </div>

          {/* Duplicate warning */}
          {dupWarning.length > 0 && !confirmedNew && (
            <div className="rounded border border-amber-500/40 bg-amber-500/10 p-2.5 space-y-1.5">
              <p className="text-xs font-semibold text-amber-400 flex items-center gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5" /> Possible duplicate{dupWarning.length > 1 ? "s" : ""} found
              </p>
              {dupWarning.map((dup) => (
                <div key={dup.id} className="flex items-center gap-2 text-xs">
                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-foreground font-medium">{dup.firstName} {dup.lastName}</span>
                  {dup.company && <span className="text-muted-foreground">· {dup.company}</span>}
                  <a
                    href={`/contacts/${dup.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto text-primary underline flex items-center gap-0.5 shrink-0"
                  >
                    View <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-5 text-[10px] px-1.5 shrink-0"
                    onClick={() => { onChange(dup); setShowCreate(false); setDupWarning([]); }}
                  >
                    Use this
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-xs text-amber-400 hover:text-amber-300 w-full mt-1"
                onClick={() => setConfirmedNew(true)}
              >
                No, create new anyway
              </Button>
            </div>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              className="h-7 text-xs flex-1 gap-1"
              disabled={!newForm.firstName || createContact.isPending}
              onClick={handleCreate}
            >
              {createContact.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
              {dupWarning.length > 0 && !confirmedNew ? "Check for duplicates" : "Create Contact"}
            </Button>
            <Button type="button" size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setShowCreate(false); setDupWarning([]); setConfirmedNew(false); setOpen(true); }}>
              Back
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
