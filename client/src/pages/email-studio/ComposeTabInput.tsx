import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Wand2, Building2, X, Lightbulb } from "lucide-react";
import { ContactSearchPicker, type PickedContact } from "@/components/ContactSearchPicker";

interface ComposeTabInputProps {
  composeContact: PickedContact | null;
  setComposeContact: (c: PickedContact | null) => void;
  composePropertySearch: string;
  setComposePropertySearch: (v: string) => void;
  composePropertyId: number | null;
  setComposePropertyId: (v: number | null) => void;
  composeListingId: number | null;
  setComposeListingId: (v: number | null) => void;
  composeIntent: string;
  setComposeIntent: (v: string) => void;
  tone: "tight" | "balanced" | "conversational";
  setTone: (v: "tight" | "balanced" | "conversational") => void;
  isComposing: boolean;
  composeEmail: () => void;
  setResolvedContactId: (v: number | null) => void;
  setDealIntelContactId: (v: number | null) => void;
  properties: Array<{ id: number; name: string; city?: string | null; [key: string]: unknown }> | undefined;
  listings: Array<{ id: number; title: string; propertyId?: number | null; [key: string]: unknown }> | undefined;
  dealContextQuery: {
    isLoading: boolean;
    data?: {
      narrative?: { summary: string; nextSteps?: string | null; updatedAt?: string | Date | null } | null;
      recentActivities?: Array<{ occurredAt?: string | Date | null; type: string; contactFirstName?: string | null; contactLastName?: string | null; summary?: string | null }>;
      buyerCriteria?: { propertyTypes?: string | null; minUnits?: number | null; maxUnits?: number | null; minPrice?: number | null; maxPrice?: number | null; markets?: string | null } | null;
      property?: { name: string; propertyType?: string | null; unitCount?: number | null; city?: string | null; state?: string | null } | null;
      links?: Array<{ contactFirstName?: string | null; contactLastName?: string | null; dealRole?: string | null }>;
    } | null;
  };
}

export function ComposeTabInput({
  composeContact, setComposeContact,
  composePropertySearch, setComposePropertySearch,
  composePropertyId, setComposePropertyId,
  composeListingId, setComposeListingId,
  composeIntent, setComposeIntent,
  tone, setTone,
  isComposing, composeEmail,
  setResolvedContactId, setDealIntelContactId,
  properties, listings,
  dealContextQuery,
}: ComposeTabInputProps) {
  return (
    <div className="max-w-4xl space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: Compose inputs */}
        <div className="lg:col-span-2 space-y-4">
          {/* Recipient picker */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
              Who are you emailing? <span className="text-primary">*</span>
            </Label>
            <ContactSearchPicker
              value={composeContact}
              onChange={(c) => {
                setComposeContact(c);
                if (c) {
                  setResolvedContactId(c.id);
                  setDealIntelContactId(c.id);
                }
              }}
              placeholder="Search contacts…"
              allowCreate
            />
          </div>

          {/* Property/deal picker */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
              What deal / property? <span className="text-muted-foreground/50 normal-case font-normal">— optional but recommended</span>
            </Label>
            {composePropertyId || composeListingId ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-primary/10 border border-primary/30">
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-sm font-medium text-foreground flex-1 truncate">
                  {(() => {
                    if (composePropertyId) {
                      const p = (properties ?? []).find((pr: any) => pr.id === composePropertyId);
                      return p ? `${p.name}${p.city ? ` · ${p.city}` : ""}` : "Property selected";
                    }
                    if (composeListingId) {
                      const l = (listings ?? []).find((ls: any) => ls.id === composeListingId);
                      return l ? l.title : "Listing selected";
                    }
                    return "";
                  })()}
                </span>
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-5 w-5 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                  onClick={() => { setComposePropertyId(null); setComposeListingId(null); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Input
                  value={composePropertySearch}
                  onChange={(e) => setComposePropertySearch(e.target.value)}
                  placeholder="Search property or listing…"
                  className="bg-background border-border text-sm"
                />
                {composePropertySearch.length >= 1 && (() => {
                  const allOpts = [
                    ...(properties ?? []).map((p: any) => ({ id: p.id, name: p.name, type: "property" as const, city: p.city })),
                    ...(listings ?? []).map((l: any) => ({ id: l.id, name: l.title, type: "listing" as const, city: null, propertyId: l.propertyId })),
                  ];
                  const filtered = allOpts.filter(o => o.name.toLowerCase().includes(composePropertySearch.toLowerCase())).slice(0, 8);
                  return filtered.length > 0 ? (
                    <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-card border border-border rounded-md shadow-lg max-h-48 overflow-y-auto">
                      {filtered.map(o => (
                        <button
                          key={`${o.type}-${o.id}`}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-muted/30 transition-colors flex items-center gap-2"
                          onClick={() => {
                            if (o.type === "property") { setComposePropertyId(o.id); setComposeListingId(null); }
                            else { setComposeListingId(o.id); setComposePropertyId((o as any).propertyId ?? null); }
                            setComposePropertySearch("");
                          }}
                        >
                          <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="font-medium">{o.name}</span>
                          {o.city && <span className="text-xs text-muted-foreground">· {o.city}</span>}
                          <span className="text-[10px] text-muted-foreground ml-auto">{o.type}</span>
                        </button>
                      ))}
                    </div>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* Intent textarea */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">
              What do you want to say? <span className="text-primary">*</span>
            </Label>
            <Textarea
              value={composeIntent}
              onChange={(e) => setComposeIntent(e.target.value)}
              placeholder="e.g., 'Follow up on our call, mention the new comp at 6.2 cap, see if they're ready to move to LOI'"
              className="bg-card border-border text-sm resize-none font-mono"
              rows={8}
            />
          </div>

          {/* Tone selector */}
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground uppercase tracking-wide font-semibold">Tone</Label>
            <div className="flex gap-2">
              {(["tight", "balanced", "conversational"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`flex-1 py-1.5 px-2 rounded text-xs font-medium border transition-colors ${
                    tone === t
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-card text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
                  }`}
                >
                  {t === "tight" ? "Tight" : t === "balanced" ? "Balanced" : "Conversational"}
                </button>
              ))}
            </div>
          </div>

          <Button onClick={composeEmail} disabled={isComposing || !composeIntent.trim() || !composeContact} className="gap-2 w-full" size="lg">
            {isComposing
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Composing…</>
              : <><Wand2 className="h-4 w-4" /> Compose Email</>
            }
          </Button>
        </div>

        {/* Right: Context preview panel */}
        <div className="space-y-3">
          <div className="rounded-lg border border-border/60 bg-card/50 p-4 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
              <Lightbulb className="h-3.5 w-3.5 text-primary" /> Context the AI will use
            </p>

            {!composePropertyId && !composeListingId && (
              <p className="text-xs text-muted-foreground">Select a property or listing to see the deal context the AI will reference.</p>
            )}

            {dealContextQuery.isLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" /> Loading deal context…
              </div>
            )}

            {dealContextQuery.data && (() => {
              const dc = dealContextQuery.data;
              return (
                <div className="space-y-3 text-xs">
                  {/* Deal Narrative */}
                  {dc.narrative ? (
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground flex items-center gap-1">
                        <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" /> Deal Summary
                      </p>
                      <p className="text-muted-foreground leading-relaxed">{dc.narrative.summary}</p>
                      {dc.narrative.nextSteps && (
                        <p className="text-muted-foreground"><span className="font-medium text-foreground">Next steps:</span> {dc.narrative.nextSteps}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-muted-foreground italic">No deal summary yet — it will be generated after the first activity is logged.</p>
                  )}

                  {/* Recent activities */}
                  {dc.recentActivities && dc.recentActivities.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">Recent Activity</p>
                      {dc.recentActivities.slice(0, 5).map((a: any, i: number) => (
                        <p key={i} className="text-muted-foreground">
                          {a.occurredAt ? new Date(a.occurredAt).toLocaleDateString() : "?"} — {a.type} with {[a.contactFirstName, a.contactLastName].filter(Boolean).join(" ")}
                          {a.summary ? `: ${a.summary.slice(0, 80)}` : ""}
                        </p>
                      ))}
                    </div>
                  )}

                  {/* Buyer criteria */}
                  {dc.buyerCriteria && (
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">Buyer Criteria</p>
                      <p className="text-muted-foreground">
                        {dc.buyerCriteria.propertyTypes ?? "Any type"} · {dc.buyerCriteria.minUnits ?? "?"}-{dc.buyerCriteria.maxUnits ?? "?"} units · ${dc.buyerCriteria.minPrice ? `$${Number(dc.buyerCriteria.minPrice).toLocaleString()}` : "?"}-{dc.buyerCriteria.maxPrice ? `$${Number(dc.buyerCriteria.maxPrice).toLocaleString()}` : "?"}
                      </p>
                    </div>
                  )}

                  {/* Property basics */}
                  {dc.property && (
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">Property</p>
                      <p className="text-muted-foreground">
                        {dc.property.name} · {dc.property.propertyType} · {dc.property.unitCount ?? "?"} units · {dc.property.city ?? "?"}, {dc.property.state ?? "ID"}
                      </p>
                    </div>
                  )}

                  {/* Involved parties */}
                  {dc.links && dc.links.length > 0 && (
                    <div className="space-y-1">
                      <p className="font-semibold text-foreground">Involved Parties</p>
                      {dc.links.slice(0, 4).map((l: any, i: number) => (
                        <p key={i} className="text-muted-foreground">
                          {l.contactFirstName} {l.contactLastName} — {l.dealRole ?? "linked"}
                        </p>
                      ))}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
