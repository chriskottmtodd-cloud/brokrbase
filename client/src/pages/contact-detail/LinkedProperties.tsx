import { useLocation } from "wouter";
import { Badge } from "@/components/ui/badge";
import { Building2, ChevronRight } from "lucide-react";

interface Props {
  linkedProperties: any[];
}

export function LinkedProperties({ linkedProperties }: Props) {
  const [, setLocation] = useLocation();

  const withProperty = linkedProperties.filter((l) => l.propertyId);
  if (!withProperty.length) return null;

  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
        Linked Properties
      </div>
      <div className="space-y-1">
        {withProperty.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setLocation(`/properties/${l.propertyId}`)}
            className="w-full text-left flex items-center gap-2 py-2 px-2 -mx-2 rounded-md hover:bg-muted/40 transition-colors group"
          >
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{l.propertyName}</div>
              {l.propertyCity && (
                <div className="text-xs text-muted-foreground">{l.propertyCity}</div>
              )}
            </div>
            {l.dealRole && (
              <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                {l.dealRole.replace("_", " ")}
              </Badge>
            )}
            {l.propertyType && (
              <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                {l.propertyType.replace("_", " ")}
              </Badge>
            )}
            <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors shrink-0" />
          </button>
        ))}
      </div>
    </div>
  );
}
