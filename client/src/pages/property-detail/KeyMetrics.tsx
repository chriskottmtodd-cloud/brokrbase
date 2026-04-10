import { getTypeConfig } from "@/lib/propertyTypeConfig";
import { InlineField } from "@/components/InlineField";

interface Props {
  property: Record<string, any>;
  onSave: (key: string, value: any) => Promise<void>;
}

export function KeyMetrics({ property, onSave }: Props) {
  const config = getTypeConfig(property.propertyType);
  const computed = config.computed
    .map((c) => ({ label: c.label, value: c.compute(property) }))
    .filter((c) => c.value !== null);

  return (
    <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1">
      {config.keyMetrics.map((metric) => {
        const val = property[metric.key];
        return (
          <div
            key={metric.key}
            className="flex-1 min-w-[120px] rounded-xl border bg-card p-3"
          >
            <InlineField
              label={metric.label}
              value={val}
              fieldKey={metric.key}
              type={metric.type as any}
              suffix={metric.suffix}
              onSave={onSave}
              placeholder="Add..."
            />
          </div>
        );
      })}
      {computed.map((c) => (
        <div
          key={c.label}
          className="flex-1 min-w-[120px] rounded-xl border bg-muted/30 p-3"
        >
          <div className="text-xs text-muted-foreground mb-0.5">{c.label}</div>
          <div className="text-sm font-medium">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
