import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CheckCircle2, User, AlertCircle, RefreshCw, Clock, Building2, UserPlus, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";

export interface ConfirmedContact {
  id: number;
  firstName: string;
  lastName: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  isOwner?: boolean | null;
  isBuyer?: boolean | null;
  lastContactedAt?: Date | null;
}

interface Props {
  /** The contact the system resolved — show this for confirmation */
  contact: ConfirmedContact;
  /** Called when user accepts the contact (auto-called on mount if confidence=high) */
  onConfirm: (c: ConfirmedContact) => void;
  /** Called when user swaps to a different contact */
  onSwap: (c: ConfirmedContact) => void;
  /** Badge shown for match type */
  selectionReason?: "email_match" | "name_match" | "manual";
  /** Optional: filter swap search to contacts linked to this property */
  linkedPropertyId?: number;
  /** Optional: pre-fill the create form with detected data */
  detectedName?: string;
  detectedEmail?: string;
  detectedCompany?: string;
  detectedPhone?: string;
  /** Optional: show what value was matched on (e.g. the email address) */
  matchDetail?: string;
  /** When true, skip the confirmed-contact display and open directly in create/search mode */
  notFoundMode?: boolean;
}

export function ContactConfirmationCard({
  contact,
  onConfirm,
  onSwap,
  selectionReason,
  linkedPropertyId,
  detectedName,
  detectedEmail,
  detectedCompany,
  detectedPhone,
  matchDetail,
  notFoundMode,
}: Props) {
  const [swapping, setSwapping] = useState(() => !!notFoundMode);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);

  // Create form state — pre-fill from detected props
  const [newFirstName, setNewFirstName] = useState(() => {
    if (detectedName) {
      const parts = detectedName.trim().split(/\s+/);
      return parts[0] ?? "";
    }
    return "";
  });
  const [newLastName, setNewLastName] = useState(() => {
    if (detectedName) {
      const parts = detectedName.trim().split(/\s+/);
      return parts.slice(1).join(" ");
    }
    return "";
  });
  const [newEmail,   setNewEmail]   = useState(detectedEmail   ?? "");
  const [newPhone,   setNewPhone]   = useState(detectedPhone   ?? "");
  const [newCompany, setNewCompany] = useState(detectedCompany ?? "");
  const [newIsOwner, setNewIsOwner] = useState(false);
  const [newIsBuyer, setNewIsBuyer] = useState(false);

  const utils = trpc.useUtils();
  const createContact = trpc.contacts.create.useMutation({
    onSuccess: (created) => {
      utils.contacts.list.invalidate();
      const newContact: ConfirmedContact = {
        id: created.id,
        firstName: created.firstName,
        lastName: created.lastName ?? "",
        company: created.company,
        email: created.email,
        phone: created.phone,
        isOwner: created.isOwner,
        isBuyer: created.isBuyer,
        lastContactedAt: null,
      };
      toast.success(`${created.firstName} ${created.lastName} added to CRM`, {
        action: {
          label: "View Contact",
          onClick: () => window.open(`/contacts/${created.id}`, "_blank"),
        },
      });
      setSwapping(false);
      setCreating(false);
      setQuery("");
      onSwap(newContact);
    },
    onError: (err) => {
      toast.error(`Failed to create contact: ${err.message}`);
    },
  });

  const { data: searchResults } = trpc.contacts.list.useQuery(
    { search: query, limit: 15, linkedPropertyId: swapping && linkedPropertyId ? linkedPropertyId : undefined },
    { enabled: swapping && !creating && query.length >= 1 }
  );

  // When no query yet in swap mode, show contacts linked to the property (if any)
  const { data: propertyContacts } = trpc.contacts.list.useQuery(
    { linkedPropertyId, limit: 10 },
    { enabled: swapping && !creating && !!linkedPropertyId && query.length === 0 }
  );

  const displayResults = query.length >= 1 ? (searchResults ?? []) : (propertyContacts ?? []);

  const lastContactedLabel = contact?.lastContactedAt
    ? `Last contact: ${formatDistanceToNow(new Date(contact.lastContactedAt), { addSuffix: true })}`
    : "No prior contact";

  const reasonBadge = selectionReason === "email_match"
    ? { label: "Email match", color: "bg-green-500/20 text-green-400 border-green-500/30" }
    : selectionReason === "name_match"
    ? { label: "Name match", color: "bg-blue-500/20 text-blue-400 border-blue-500/30" }
    : null;

  // ── Create new contact form ──────────────────────────────────────────────
  if (swapping && creating) {
    return (
      <div className="space-y-3 p-3 rounded-lg border border-primary/30 bg-primary/5">
        <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <UserPlus className="h-3.5 w-3.5" /> Create new contact
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">First name *</Label>
            <Input
              autoFocus
              value={newFirstName}
              onChange={(e) => setNewFirstName(e.target.value)}
              placeholder="First"
              className="h-8 text-sm"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-[11px] text-muted-foreground">Last name</Label>
            <Input
              value={newLastName}
              onChange={(e) => setNewLastName(e.target.value)}
              placeholder="Last"
              className="h-8 text-sm"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Email</Label>
          <Input
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="email@example.com"
            type="email"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Phone</Label>
          <Input
            value={newPhone}
            onChange={(e) => setNewPhone(e.target.value)}
            placeholder="(208) 555-0100"
            type="tel"
            className="h-8 text-sm"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[11px] text-muted-foreground">Company</Label>
          <Input
            value={newCompany}
            onChange={(e) => setNewCompany(e.target.value)}
            placeholder="Company name"
            className="h-8 text-sm"
          />
        </div>
        <div className="flex gap-3">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newIsOwner}
              onChange={(e) => setNewIsOwner(e.target.checked)}
              className="rounded"
            />
            Owner
          </label>
          <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none">
            <input
              type="checkbox"
              checked={newIsBuyer}
              onChange={(e) => setNewIsBuyer(e.target.checked)}
              className="rounded"
            />
            Buyer
          </label>
        </div>
        <div className="flex gap-2">
          <Button
            size="sm"
            className="flex-1 h-8 text-xs"
            disabled={!newFirstName.trim() || createContact.isPending}
            onClick={() => {
              createContact.mutate({
                firstName: newFirstName.trim(),
                lastName: newLastName.trim(),
                email: newEmail.trim() || undefined,
                phone: newPhone.trim() || undefined,
                company: newCompany.trim() || undefined,
                isOwner: newIsOwner,
                isBuyer: newIsBuyer,
              });
            }}
          >
            {createContact.isPending ? (
              <><Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> Creating…</>
            ) : (
              "Create Contact"
            )}
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 text-xs"
            onClick={() => setCreating(false)}
          >
            Back
          </Button>
        </div>
      </div>
    );
  }

  // ── Swap search panel ────────────────────────────────────────────────────
  if (swapping) {
    const noResults = query.length >= 1 && (searchResults ?? []).length === 0;
    return (
      <div className="space-y-2 p-3 rounded-lg border border-primary/30 bg-primary/5">
        <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
          <RefreshCw className="h-3.5 w-3.5" /> Select the correct contact
        </p>
        {linkedPropertyId && (
          <p className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Building2 className="h-3 w-3" /> Showing contacts linked to this property first
          </p>
        )}
        <Input
          autoFocus
          placeholder="Search by name, company, or email…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 text-sm bg-background border-border"
        />

        {/* Results list — only shown when there are results */}
        {displayResults.length > 0 && (
          <div className="max-h-48 overflow-y-auto space-y-0.5 rounded border border-border/40 bg-background">
            {displayResults.map((c) => (
              <button
                key={c.id}
                className="w-full text-left flex items-center gap-2.5 px-3 py-2 hover:bg-primary/10 transition-colors text-sm border-b border-border/30 last:border-0"
                onClick={() => {
                  setSwapping(false);
                  setQuery("");
                  onSwap(c as ConfirmedContact);
                }}
              >
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">{c.firstName} {c.lastName}</span>
                  {c.company && <span className="text-muted-foreground text-xs ml-1.5">· {c.company}</span>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {c.isOwner && <Badge variant="outline" className="text-[9px] h-4 px-1 border-orange-500/40 text-orange-400">Owner</Badge>}
                  {c.isBuyer && <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-500/40 text-blue-400">Buyer</Badge>}
                  {c.lastContactedAt && (
                    <span className="text-[10px] text-muted-foreground">
                      {formatDistanceToNow(new Date(c.lastContactedAt), { addSuffix: true })}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}

        {/* No results state — make create the primary action */}
        {noResults && (
          <div className="rounded-md border border-border/40 bg-background px-3 py-3 text-center space-y-2">
            <p className="text-xs text-muted-foreground">No contacts match "{query}"</p>
            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={() => {
                const parts = query.trim().split(/\s+/);
                setNewFirstName(parts[0] ?? detectedName?.split(" ")[0] ?? "");
                setNewLastName(parts.slice(1).join(" ") || detectedName?.split(" ").slice(1).join(" ") || "");
                setCreating(true);
              }}
            >
              <UserPlus className="h-3.5 w-3.5" />
              Create "{query}" as new contact
            </Button>
          </div>
        )}

        {/* Empty state hint */}
        {!noResults && displayResults.length === 0 && query.length === 0 && (
          <p className="px-1 text-xs text-muted-foreground">Type to search all contacts…</p>
        )}

        {/* Create new contact — always visible outside the scroll area */}
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-primary hover:bg-primary/10 transition-colors rounded border border-primary/20 border-dashed"
          onClick={() => {
            // Pre-fill from search query if typed, otherwise from detected props
            if (query.trim()) {
              const parts = query.trim().split(/\s+/);
              setNewFirstName(parts[0] ?? "");
              setNewLastName(parts.slice(1).join(" "));
            }
            setCreating(true);
          }}
        >
          <UserPlus className="h-3.5 w-3.5" />
          + Create new contact{query.trim() ? ` "${query.trim()}"` : ""}
        </button>

        {!notFoundMode && contact && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => { setSwapping(false); setQuery(""); }}
          >
            Cancel — keep {contact.firstName} {contact.lastName}
          </button>
        )}
      </div>
    );
  }

  // ── Confirmed contact display ────────────────────────────────────────────
  return (
    <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 space-y-2">
      {/* Header row */}
      <div className="flex items-start gap-2.5">
        <CheckCircle2 className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-sm font-semibold text-foreground">
              {contact.firstName} {contact.lastName}
            </span>
            {contact.isOwner && <Badge variant="outline" className="text-[9px] h-4 px-1 border-orange-500/40 text-orange-400">Owner</Badge>}
            {contact.isBuyer && <Badge variant="outline" className="text-[9px] h-4 px-1 border-blue-500/40 text-blue-400">Buyer</Badge>}
            {reasonBadge && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded border font-medium ${reasonBadge.color}`}>
                {reasonBadge.label}
              </span>
            )}
          </div>
          {contact.company && (
            <p className="text-xs text-muted-foreground mt-0.5">{contact.company}</p>
          )}
          <div className="flex items-center gap-1 mt-1">
            <Clock className="h-3 w-3 text-muted-foreground" />
            <span className="text-[10px] text-muted-foreground">{lastContactedLabel}</span>
          </div>
          {contact.email && (
            <p className="text-[10px] text-muted-foreground mt-0.5">{contact.email}</p>
          )}
          {matchDetail && (
            <p className="text-[10px] text-muted-foreground/60 mt-0.5 italic">Matched on: {matchDetail}</p>
          )}
        </div>
        <button
          className="shrink-0 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary transition-colors border border-border/50 hover:border-primary/40 rounded px-2 py-1 bg-background"
          onClick={() => setSwapping(true)}
        >
          <AlertCircle className="h-3 w-3" />
          Wrong person?
        </button>
      </div>
    </div>
  );
}
