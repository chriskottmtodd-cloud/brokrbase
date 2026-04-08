import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Loader2, Phone, Mail, MapPin, UserPlus, Link2, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";

interface ResearchContact {
  id: number;
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  title: string | null;
  contactType: string;
  isEntity: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
}

interface EnrichmentData {
  researchContactId: number;
  identityScore: number | null;
  phones: Array<{
    number: string;
    type: string;
    isConnected: boolean | null;
    firstReportedDate: string | null;
    lastReportedDate: string | null;
  }>;
  emails: Array<{
    email: string;
    isValidated: boolean;
    isBusiness: boolean;
  }>;
  addresses: Array<{
    street: string | null;
    unit: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    firstReportedDate: string | null;
    lastReportedDate: string | null;
  }>;
}

interface DuplicateResult {
  action: "duplicate_found";
  existingContacts: Array<{ id: number; firstName: string; lastName: string; email: string | null; phone: string | null; company: string | null }>;
  researchContactId: number;
}

interface CrossReference {
  type: string;
  matchedField: string;
  matchedIn: string;
  matchedRecordId: number;
  matchedRecordName: string;
  linkedProperties: { id: number; name: string; address: string }[];
  confidence: string;
}

interface ResearchResultsProps {
  contacts: ResearchContact[];
  onSaved: () => void;
  propertyId: number;
  crossReferences?: CrossReference[];
}

const typeConfig: Record<string, { label: string; className: string }> = {
  principal: { label: "Principal", className: "bg-primary/10 text-primary border-primary/30" },
  registered_agent: { label: "Registered Agent", className: "bg-muted text-muted-foreground border-border" },
  parent_entity: { label: "Parent Entity", className: "bg-blue-500/10 text-blue-400 border-blue-500/30" },
  unknown: { label: "Unknown", className: "bg-muted text-muted-foreground border-border" },
};

export function ResearchResults({ contacts, onSaved, propertyId, crossReferences }: ResearchResultsProps) {
  const [, setLocation] = useLocation();
  const [enriching, setEnriching] = useState<number | null>(null);
  const [enrichments, setEnrichments] = useState<Record<number, EnrichmentData>>({});
  const [promoting, setPromoting] = useState<number | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<DuplicateResult | null>(null);

  const enrichMutation = trpc.ownerResearch.enrichContact.useMutation();
  const promoteMutation = trpc.ownerResearch.promoteToContact.useMutation();
  const confirmPromoteMutation = trpc.ownerResearch.confirmPromote.useMutation();

  const handleEnrich = async (rcId: number) => {
    setEnriching(rcId);
    try {
      const result = await enrichMutation.mutateAsync({ researchContactId: rcId });
      setEnrichments((prev) => ({ ...prev, [rcId]: result as EnrichmentData }));
      toast.success("Contact enriched!");
    } catch (err: any) {
      toast.error(err.message ?? "Enrichment failed");
    } finally {
      setEnriching(null);
    }
  };

  const handlePromote = async (rcId: number) => {
    setPromoting(rcId);
    try {
      const result = await promoteMutation.mutateAsync({ researchContactId: rcId, dealRole: "owner" });
      if ("action" in result && result.action === "duplicate_found") {
        setDuplicateInfo(result as DuplicateResult);
        setPromoting(null);
        return;
      }
      toast.success("Contact saved to CRM!");
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? "Failed to save contact");
    } finally {
      setPromoting(null);
    }
  };

  const handleDuplicateAction = async (action: "create_new" | "link_existing", existingContactId?: number) => {
    if (!duplicateInfo) return;
    setPromoting(duplicateInfo.researchContactId);
    try {
      await confirmPromoteMutation.mutateAsync({
        researchContactId: duplicateInfo.researchContactId,
        action,
        existingContactId,
        dealRole: "owner",
      });
      toast.success(action === "link_existing" ? "Existing contact linked!" : "New contact created!");
      setDuplicateInfo(null);
      onSaved();
    } catch (err: any) {
      toast.error(err.message ?? "Failed");
    } finally {
      setPromoting(null);
    }
  };

  // Duplicate resolution dialog
  if (duplicateInfo) {
    return (
      <div className="space-y-3">
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
          <p className="text-sm font-medium text-foreground">Possible duplicate found</p>
          <p className="text-xs text-muted-foreground mt-1">This person may already exist in your CRM.</p>
        </div>
        {duplicateInfo.existingContacts.map((c) => (
          <Card key={c.id} className="p-3 border-border">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{c.firstName} {c.lastName}</p>
                {c.company && <p className="text-xs text-muted-foreground">{c.company}</p>}
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>{c.phone}</span>}
                </div>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1"
                onClick={() => handleDuplicateAction("link_existing", c.id)}
                disabled={promoting !== null}
              >
                <Link2 className="h-3 w-3" />Link Existing
              </Button>
            </div>
          </Card>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="w-full h-7 text-xs"
          onClick={() => handleDuplicateAction("create_new")}
          disabled={promoting !== null}
        >
          {promoting ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <UserPlus className="h-3 w-3 mr-1" />}
          Create New Contact Anyway
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Cross-references */}
      {crossReferences && crossReferences.length > 0 && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5 text-blue-400" />
            <span className="text-xs font-medium text-blue-400">Connections Found</span>
          </div>
          {crossReferences.map((ref, i) => (
            <div key={i} className="text-xs text-muted-foreground">
              <span className="text-foreground">{ref.type === "entity_match" ? "Entity" : ref.type === "name_match" ? "Name" : "Address"}</span>
              {" "}&ldquo;{ref.matchedField}&rdquo; matches{" "}
              <span className="text-foreground">{ref.matchedRecordName}</span>
              {ref.matchedIn === "contact" && " (existing contact)"}
              {ref.linkedProperties.length > 0 && (
                <span>
                  {" — linked to "}
                  {ref.linkedProperties.map((p, j) => (
                    <span key={p.id}>
                      {j > 0 && ", "}
                      <button
                        className="text-primary hover:underline"
                        onClick={() => setLocation(`/properties/${p.id}`)}
                      >
                        {p.name}
                      </button>
                    </span>
                  ))}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {contacts.map((c) => {
        const config = typeConfig[c.contactType] ?? typeConfig.unknown;
        const enrichment = enrichments[c.id];
        const isEnriching = enriching === c.id;
        const isPromoting = promoting === c.id;

        return (
          <Card key={c.id} className="p-3 border-border bg-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-foreground">{c.fullName}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-normal ${config.className}`}>
                    {config.label}
                  </Badge>
                  {c.isEntity && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-normal bg-blue-500/10 text-blue-400">LLC</Badge>
                  )}
                </div>
                {c.title && <p className="text-xs text-muted-foreground mt-0.5">{c.title}</p>}
                {(c.address || c.city) && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {[c.address, c.city, c.state, c.zip].filter(Boolean).join(", ")}
                  </p>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex items-center gap-1.5 shrink-0">
                {!c.isEntity && c.contactType !== "registered_agent" && !enrichment && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs gap-1"
                    onClick={() => handleEnrich(c.id)}
                    disabled={isEnriching}
                  >
                    {isEnriching ? <Loader2 className="h-3 w-3 animate-spin" /> : <Shield className="h-3 w-3" />}
                    Enrich
                  </Button>
                )}
              </div>
            </div>

            {/* Enrichment results */}
            {enrichment && (
              <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                {enrichment.identityScore != null && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Identity Score:</span>
                    <Badge variant="outline" className={`text-[10px] px-1.5 py-0 font-normal ${enrichment.identityScore >= 80 ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"}`}>
                      {enrichment.identityScore}/100
                    </Badge>
                  </div>
                )}

                {/* Phones */}
                {enrichment.phones.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Phones</p>
                    {enrichment.phones.map((p, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Phone className="h-3 w-3 text-primary shrink-0" />
                        <span className="text-foreground">{p.number}</span>
                        <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">{p.type}</Badge>
                        {p.isConnected && <span className="text-[10px] text-primary">connected</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Emails */}
                {enrichment.emails.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Emails</p>
                    {enrichment.emails.map((e, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <Mail className="h-3 w-3 text-primary shrink-0" />
                        <span className="text-foreground">{e.email}</span>
                        {e.isValidated && <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal bg-primary/10 text-primary">validated</Badge>}
                        {e.isBusiness && <Badge variant="outline" className="text-[10px] px-1 py-0 font-normal">business</Badge>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Addresses */}
                {enrichment.addresses.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-xs text-muted-foreground font-medium">Addresses</p>
                    {enrichment.addresses.slice(0, 3).map((a, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        <MapPin className="h-3 w-3 text-primary shrink-0" />
                        <span className="text-foreground">
                          {[a.street, a.unit, a.city, a.state, a.zip].filter(Boolean).join(", ")}
                        </span>
                        {a.lastReportedDate && <span className="text-muted-foreground">({a.lastReportedDate})</span>}
                      </div>
                    ))}
                  </div>
                )}

                {/* Save button */}
                <Button
                  size="sm"
                  className="w-full h-8 text-xs gap-1 mt-2"
                  onClick={() => handlePromote(c.id)}
                  disabled={isPromoting}
                >
                  {isPromoting ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserPlus className="h-3 w-3" />}
                  Save as Contact
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
