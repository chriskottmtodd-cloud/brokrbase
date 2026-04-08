import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Building2, ChevronDown, ChevronUp, Plus, Edit2 } from "lucide-react";
import { format } from "date-fns";

interface UnitMixSectionProps {
  propertyId: number;
  propertyType: string;
  vintageYear?: number | null;
  yearRenovated?: number | null;
}

export function UnitMixSection({ propertyId, propertyType, vintageYear, yearRenovated }: UnitMixSectionProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: unitTypes } = trpc.unitTypes.list.useQuery({ propertyId });

  const isMhc = propertyType === "mhc";
  const unitLabel = isMhc ? "spaces" : "units";
  const sectionTitle = isMhc ? "Space Mix & Lot Rents" : "Unit Mix & Rents";

  const totalUnits = unitTypes?.reduce((s, u) => s + (u.unitCount ?? 0), 0) ?? 0;
  const totalVacant = unitTypes?.reduce((s, u) => s + (u.vacantUnits ?? 0), 0) ?? 0;
  const vacancyPct = totalUnits > 0 ? ((totalVacant / totalUnits) * 100).toFixed(1) : "0";

  // Find most recent rent data source
  const mostRecentData = unitTypes
    ?.filter((u) => u.rentDataDate)
    .sort((a, b) => new Date(b.rentDataDate!).getTime() - new Date(a.rentDataDate!).getTime())[0];

  // Group by bedCount for apartments, by label for MHC
  const groups = (() => {
    if (!unitTypes?.length) return [];
    if (isMhc) {
      // One pill per unique label
      const labelMap = new Map<string, { label: string; count: number; minRent: number; maxRent: number; vacant: number }>();
      for (const u of unitTypes) {
        const key = u.label;
        const existing = labelMap.get(key);
        const rent = u.askingRent ?? 0;
        if (existing) {
          existing.count += u.unitCount ?? 0;
          existing.vacant += u.vacantUnits ?? 0;
          if (rent > 0 && rent < existing.minRent) existing.minRent = rent;
          if (rent > existing.maxRent) existing.maxRent = rent;
        } else {
          labelMap.set(key, {
            label: key,
            count: u.unitCount ?? 0,
            minRent: rent > 0 ? rent : Infinity,
            maxRent: rent,
            vacant: u.vacantUnits ?? 0,
          });
        }
      }
      return Array.from(labelMap.values()).map((g) => ({
        ...g,
        minRent: g.minRent === Infinity ? 0 : g.minRent,
      }));
    }
    // Apartment / affordable: group by bedCount
    const bedMap = new Map<number, { label: string; count: number; minRent: number; maxRent: number; vacant: number }>();
    for (const u of unitTypes) {
      const bed = u.bedCount ?? 0;
      const existing = bedMap.get(bed);
      const rent = u.askingRent ?? 0;
      if (existing) {
        existing.count += u.unitCount ?? 0;
        existing.vacant += u.vacantUnits ?? 0;
        if (rent > 0 && rent < existing.minRent) existing.minRent = rent;
        if (rent > existing.maxRent) existing.maxRent = rent;
      } else {
        bedMap.set(bed, {
          label: bed === 0 ? "Studio" : `${bed} Bed`,
          count: u.unitCount ?? 0,
          minRent: rent > 0 ? rent : Infinity,
          maxRent: rent,
          vacant: u.vacantUnits ?? 0,
        });
      }
    }
    return Array.from(bedMap.entries())
      .sort((a, b) => a[0] - b[0])
      .map(([, g]) => ({ ...g, minRent: g.minRent === Infinity ? 0 : g.minRent }));
  })();

  const formatCurrency = (v: number) =>
    v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`;

  const formatRentRange = (min: number, max: number) => {
    if (min === 0 && max === 0) return "—";
    if (min === max || min === 0) return formatCurrency(max);
    return `${formatCurrency(min)}–${formatCurrency(max)}`;
  };

  const tierLabel = (tier: string | null, year: number | null) => {
    if (!tier || tier === "classic") return "Classic";
    if (tier === "renovated") return year ? `Reno '${String(year).slice(-2)}` : "Renovated";
    if (tier === "premium") return year ? `Premium '${String(year).slice(-2)}` : "Premium";
    return tier;
  };

  // Empty state
  if (!unitTypes?.length) {
    return (
      <div>
        <Card className="border-border bg-card">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5" />{sectionTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 text-muted-foreground">
              <Building2 className="h-8 w-8 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No unit mix data yet</p>
              <Button variant="outline" size="sm" className="mt-3 h-7 text-xs gap-1">
                <Plus className="h-3 w-3" />Update Rents
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <Card className="border-border bg-card">
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5" />{sectionTitle}
          </CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              <Edit2 className="h-3 w-3" />Edit
            </Button>
            <Button variant="outline" size="sm" className="h-7 text-xs gap-1">
              <Plus className="h-3 w-3" />Update Rents
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Metrics bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">{isMhc ? "Total Spaces" : "Total Units"}</p>
              <p className="text-lg font-semibold text-foreground">{totalUnits}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Yr Built</p>
              <p className="text-lg font-semibold text-foreground">{vintageYear ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Yr Renovated</p>
              <p className="text-lg font-semibold text-foreground">{yearRenovated ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Overall Vacancy</p>
              <p className="text-lg font-semibold text-foreground">
                {totalVacant} {unitLabel} ({vacancyPct}%)
              </p>
            </div>
          </div>

          {/* Summary pills */}
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <div key={g.label} className="bg-muted rounded-lg px-3 py-2 min-w-[120px]">
                <p className="text-sm font-medium text-foreground">{g.label}</p>
                <p className="text-xs text-muted-foreground">
                  {g.count} {unitLabel} · {formatRentRange(g.minRent, g.maxRent)}
                </p>
                {g.vacant > 0 && (
                  <p className="text-xs text-muted-foreground">{g.vacant} vacant</p>
                )}
              </div>
            ))}
          </div>

          {/* Expandable breakdown table */}
          <div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {expanded ? "Collapse" : "Full Breakdown by Unit Type"}
            </Button>
            {expanded && (
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-xs text-muted-foreground">
                      <th className="text-left py-2 pr-4 font-medium">Unit Type</th>
                      <th className="text-right py-2 px-2 font-medium">Count</th>
                      <th className="text-right py-2 px-2 font-medium">Avg SF</th>
                      <th className="text-right py-2 px-2 font-medium">Asking Rent</th>
                      <th className="text-right py-2 px-2 font-medium">Eff. Rent</th>
                      <th className="text-right py-2 pl-2 font-medium">Vacant</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitTypes.map((u) => (
                      <tr key={u.id} className="border-b border-border/50">
                        <td className="py-2 pr-4">
                          <span className="text-foreground">{u.label}</span>
                          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 font-normal">
                            {tierLabel(u.renovationTier, u.yearRenovated)}
                          </Badge>
                        </td>
                        <td className="text-right py-2 px-2 text-foreground">{u.unitCount ?? "—"}</td>
                        <td className="text-right py-2 px-2 text-foreground">{u.avgSqft ? u.avgSqft.toLocaleString() : "—"}</td>
                        <td className="text-right py-2 px-2 text-foreground">{u.askingRent ? `$${Math.round(u.askingRent).toLocaleString()}` : "—"}</td>
                        <td className="text-right py-2 px-2 text-foreground">{u.effectiveRent ? `$${Math.round(u.effectiveRent).toLocaleString()}` : "—"}</td>
                        <td className="text-right py-2 pl-2 text-foreground">{u.vacantUnits ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Data source footer */}
          {mostRecentData && (
            <p className="text-xs text-muted-foreground border-t border-border/50 pt-2">
              Rent data via {mostRecentData.rentDataSource ?? "Unknown"} · Updated{" "}
              {mostRecentData.rentDataDate
                ? format(new Date(mostRecentData.rentDataDate), "MMM d, yyyy")
                : "—"}{" "}
              · <button className="underline hover:text-foreground transition-colors">Refresh</button>
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
