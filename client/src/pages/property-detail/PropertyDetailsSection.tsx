import { getTypeConfig } from "@/lib/propertyTypeConfig";
import { InlineField } from "@/components/InlineField";
import { Separator } from "@/components/ui/separator";

interface Props {
  property: Record<string, any>;
  onSave: (key: string, value: any) => Promise<void>;
}

export function PropertyDetailsSection({ property, onSave }: Props) {
  const config = getTypeConfig(property.propertyType);

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">
        Details
      </div>
      {config.sections.map((section, idx) => (
        <div key={section.title}>
          {idx > 0 && <Separator className="my-3" />}
          <div className="text-xs text-muted-foreground/70 uppercase tracking-wide mb-1 font-medium">
            {section.title}
          </div>
          <div className="grid grid-cols-2 gap-x-6">
            {section.fields.map((field) => (
              <InlineField
                key={field.key}
                label={field.label}
                value={property[field.key]}
                fieldKey={field.key}
                type={field.type as any}
                suffix={field.suffix}
                onSave={onSave}
                placeholder="Add..."
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
