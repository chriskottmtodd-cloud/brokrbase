import { InlineField } from "@/components/InlineField";
import { Mail, MapPin, Phone } from "lucide-react";

interface Props {
  contact: Record<string, any>;
  onSave: (key: string, value: any) => Promise<void>;
}

export function ContactInfoSection({ contact, onSave }: Props) {
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Contact Info
      </div>
      <div className="space-y-0">
        <div className="flex items-start gap-2">
          <Mail className="h-3.5 w-3.5 text-muted-foreground mt-3 shrink-0" />
          <div className="flex-1">
            <InlineField
              label="Email"
              value={contact.email}
              fieldKey="email"
              type="text"
              onSave={async (key, val) => {
                await onSave(key, val || null);
              }}
              placeholder="Add email..."
            />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <Phone className="h-3.5 w-3.5 text-muted-foreground mt-3 shrink-0" />
          <div className="flex-1">
            <InlineField
              label="Phone"
              value={contact.phone}
              fieldKey="phone"
              type="text"
              onSave={async (key, val) => {
                await onSave(key, val || null);
              }}
              placeholder="Add phone..."
            />
          </div>
        </div>
        <div className="flex items-start gap-2">
          <MapPin className="h-3.5 w-3.5 text-muted-foreground mt-3 shrink-0" />
          <div className="flex-1 grid grid-cols-3 gap-2">
            <div className="col-span-3">
              <InlineField
                label="Address"
                value={contact.address}
                fieldKey="address"
                type="text"
                onSave={async (key, val) => {
                  await onSave(key, val || null);
                }}
                placeholder="Add address..."
              />
            </div>
            <InlineField
              label="City"
              value={contact.city}
              fieldKey="city"
              type="text"
              onSave={async (key, val) => {
                await onSave(key, val || null);
              }}
              placeholder="City"
            />
            <InlineField
              label="State"
              value={contact.state}
              fieldKey="state"
              type="text"
              onSave={async (key, val) => {
                await onSave(key, val || null);
              }}
              placeholder="State"
            />
            <InlineField
              label="Zip"
              value={contact.zip}
              fieldKey="zip"
              type="text"
              onSave={async (key, val) => {
                await onSave(key, val || null);
              }}
              placeholder="Zip"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
