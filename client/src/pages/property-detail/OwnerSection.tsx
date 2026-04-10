import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ContactSearchPicker, PickedContact } from "@/components/ContactSearchPicker";
import { ChevronRight, Link2, Mail, Phone, User as UserIcon, X } from "lucide-react";
import { toast } from "sonner";

interface Props {
  property: Record<string, any>;
  linkedContacts: any[];
  onSave: (key: string, value: any) => Promise<void>;
}

export function OwnerSection({ property, linkedContacts, onSave }: Props) {
  const [, setLocation] = useLocation();
  const [linking, setLinking] = useState(false);
  const utils = trpc.useUtils();

  const createLink = trpc.contactLinks.create.useMutation({
    onSuccess: () => {
      utils.contactLinks.listForProperty.invalidate({ propertyId: property.id });
      toast.success("Owner linked");
    },
    onError: (e) => toast.error(e.message),
  });

  const owner = linkedContacts?.find((c) => c.dealRole === "owner");
  const otherContacts = linkedContacts?.filter((c) => c.dealRole !== "owner") ?? [];

  const handleLinkOwner = async (contact: PickedContact | null) => {
    if (!contact) return;
    await onSave("ownerId", contact.id);
    await onSave("ownerName", `${contact.firstName} ${contact.lastName}`);
    await onSave("ownerCompany", contact.company ?? null);
    await onSave("ownerPhone", contact.phone ?? null);
    createLink.mutate({
      contactId: contact.id,
      propertyId: property.id,
      dealRole: "owner",
      source: "manual",
    });
    setLinking(false);
  };

  return (
    <>
      {/* Owner */}
      <div>
        <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
          Owner
        </div>
        {owner ? (
          <button
            type="button"
            onClick={() => setLocation(`/contacts/${owner.contactId}`)}
            className="w-full text-left flex items-center gap-3 p-3 rounded-xl border hover:bg-muted/40 transition-colors group"
          >
            <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center text-primary shrink-0">
              <UserIcon className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">
                {owner.firstName} {owner.lastName}
              </div>
              {owner.company && (
                <div className="text-xs text-muted-foreground">{owner.company}</div>
              )}
              <div className="flex items-center gap-3 mt-0.5">
                {owner.email && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-2.5 w-2.5" /> {owner.email}
                  </span>
                )}
                {owner.phone && (
                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                    <Phone className="h-2.5 w-2.5" /> {owner.phone}
                  </span>
                )}
              </div>
            </div>
            <ChevronRight className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        ) : linking ? (
          <div className="space-y-2">
            <ContactSearchPicker
              value={null}
              onChange={handleLinkOwner}
              placeholder="Search for owner contact..."
              allowCreate
            />
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setLinking(false)}
            >
              Cancel
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-muted-foreground"
            onClick={() => setLinking(true)}
          >
            <Link2 className="h-3.5 w-3.5" /> Link Owner
          </Button>
        )}
      </div>

      {/* Other contacts */}
      {otherContacts.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Other Contacts
          </div>
          <div className="space-y-1">
            {otherContacts.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setLocation(`/contacts/${c.contactId}`)}
                className="w-full text-left flex items-center gap-2 py-2 px-2 -mx-2 rounded-md hover:bg-muted/40 transition-colors group"
              >
                <div className="text-sm font-medium flex-1">
                  {c.firstName} {c.lastName}
                </div>
                {c.dealRole && (
                  <Badge variant="outline" className="text-[10px] capitalize">
                    {c.dealRole.replace("_", " ")}
                  </Badge>
                )}
                <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
