export interface FieldDef {
  key: string;
  label: string;
  type: "text" | "number" | "currency" | "percent" | "select";
  suffix?: string;
}

export interface ComputedMetric {
  label: string;
  compute: (p: Record<string, any>) => string | null;
}

export interface TypeConfig {
  keyMetrics: FieldDef[];
  sections: { title: string; fields: FieldDef[] }[];
  computed: ComputedMetric[];
}

function pricePerUnit(p: Record<string, any>): string | null {
  if (!p.askingPrice || !p.unitCount) return null;
  return `$${Math.round(p.askingPrice / p.unitCount).toLocaleString()}`;
}

function pricePerSqft(p: Record<string, any>): string | null {
  if (!p.askingPrice || !p.sizeSqft) return null;
  return `$${Math.round(p.askingPrice / p.sizeSqft).toLocaleString()}`;
}

function pricePerAcre(p: Record<string, any>): string | null {
  if (!p.askingPrice || !p.lotAcres) return null;
  return `$${Math.round(p.askingPrice / p.lotAcres).toLocaleString()}`;
}

export const PROPERTY_TYPE_CONFIGS: Record<string, TypeConfig> = {
  apartment: {
    keyMetrics: [
      { key: "unitCount", label: "Units", type: "number" },
      { key: "askingPrice", label: "Asking Price", type: "currency" },
      { key: "capRate", label: "Cap Rate", type: "percent" },
      { key: "noi", label: "NOI", type: "currency" },
    ],
    sections: [
      {
        title: "Physical",
        fields: [
          { key: "sizeSqft", label: "Size", type: "number", suffix: "sqft" },
          { key: "vintageYear", label: "Year Built", type: "number" },
          { key: "yearRenovated", label: "Renovated", type: "number" },
          { key: "lotAcres", label: "Lot Size", type: "number", suffix: "acres" },
          { key: "occupancyRate", label: "Occupancy", type: "percent" },
        ],
      },
      {
        title: "Financial",
        fields: [
          { key: "estimatedValue", label: "Estimated Value", type: "currency" },
          { key: "lastSalePrice", label: "Last Sale Price", type: "currency" },
        ],
      },
    ],
    computed: [{ label: "Price / Unit", compute: pricePerUnit }],
  },

  industrial: {
    keyMetrics: [
      { key: "sizeSqft", label: "Size", type: "number", suffix: "sqft" },
      { key: "askingPrice", label: "Asking Price", type: "currency" },
      { key: "capRate", label: "Cap Rate", type: "percent" },
      { key: "noi", label: "NOI", type: "currency" },
    ],
    sections: [
      {
        title: "Physical",
        fields: [
          { key: "clearHeight", label: "Clear Height", type: "number", suffix: "ft" },
          { key: "dockDoors", label: "Dock Doors", type: "number" },
          { key: "lotAcres", label: "Lot Size", type: "number", suffix: "acres" },
          { key: "vintageYear", label: "Year Built", type: "number" },
          { key: "parkingSpaces", label: "Parking", type: "number" },
        ],
      },
      {
        title: "Tenant",
        fields: [
          { key: "tenantName", label: "Tenant", type: "text" },
          { key: "leaseExpiration", label: "Lease Expiration", type: "text" },
          { key: "occupancyRate", label: "Occupancy", type: "percent" },
        ],
      },
      {
        title: "Financial",
        fields: [
          { key: "estimatedValue", label: "Estimated Value", type: "currency" },
          { key: "lastSalePrice", label: "Last Sale Price", type: "currency" },
        ],
      },
    ],
    computed: [{ label: "Price / sqft", compute: pricePerSqft }],
  },

  land: {
    keyMetrics: [
      { key: "lotAcres", label: "Lot Size", type: "number", suffix: "acres" },
      { key: "askingPrice", label: "Asking Price", type: "currency" },
      { key: "estimatedValue", label: "Estimated Value", type: "currency" },
      { key: "zoning", label: "Zoning", type: "text" },
    ],
    sections: [
      {
        title: "Details",
        fields: [
          { key: "zoning", label: "Zoning", type: "text" },
          { key: "unitCount", label: "Entitled Units", type: "number" },
          { key: "sizeSqft", label: "Size", type: "number", suffix: "sqft" },
        ],
      },
      {
        title: "Financial",
        fields: [
          { key: "lastSalePrice", label: "Last Sale Price", type: "currency" },
        ],
      },
    ],
    computed: [{ label: "Price / Acre", compute: pricePerAcre }],
  },

  office: {
    keyMetrics: [
      { key: "sizeSqft", label: "Size", type: "number", suffix: "sqft" },
      { key: "askingPrice", label: "Asking Price", type: "currency" },
      { key: "capRate", label: "Cap Rate", type: "percent" },
      { key: "noi", label: "NOI", type: "currency" },
    ],
    sections: [
      {
        title: "Physical",
        fields: [
          { key: "vintageYear", label: "Year Built", type: "number" },
          { key: "yearRenovated", label: "Renovated", type: "number" },
          { key: "parkingSpaces", label: "Parking", type: "number" },
          { key: "lotAcres", label: "Lot Size", type: "number", suffix: "acres" },
        ],
      },
      {
        title: "Tenant",
        fields: [
          { key: "tenantName", label: "Tenant", type: "text" },
          { key: "leaseExpiration", label: "Lease Expiration", type: "text" },
          { key: "occupancyRate", label: "Occupancy", type: "percent" },
        ],
      },
      {
        title: "Financial",
        fields: [
          { key: "estimatedValue", label: "Estimated Value", type: "currency" },
          { key: "lastSalePrice", label: "Last Sale Price", type: "currency" },
        ],
      },
    ],
    computed: [{ label: "Price / sqft", compute: pricePerSqft }],
  },

  retail: {
    keyMetrics: [
      { key: "sizeSqft", label: "Size", type: "number", suffix: "sqft" },
      { key: "askingPrice", label: "Asking Price", type: "currency" },
      { key: "capRate", label: "Cap Rate", type: "percent" },
      { key: "noi", label: "NOI", type: "currency" },
    ],
    sections: [
      {
        title: "Physical",
        fields: [
          { key: "vintageYear", label: "Year Built", type: "number" },
          { key: "lotAcres", label: "Lot Size", type: "number", suffix: "acres" },
          { key: "parkingSpaces", label: "Parking", type: "number" },
        ],
      },
      {
        title: "Tenant",
        fields: [
          { key: "tenantName", label: "Tenant", type: "text" },
          { key: "leaseExpiration", label: "Lease Expiration", type: "text" },
          { key: "occupancyRate", label: "Occupancy", type: "percent" },
        ],
      },
      {
        title: "Financial",
        fields: [
          { key: "estimatedValue", label: "Estimated Value", type: "currency" },
          { key: "lastSalePrice", label: "Last Sale Price", type: "currency" },
        ],
      },
    ],
    computed: [{ label: "Price / sqft", compute: pricePerSqft }],
  },

  self_storage: {
    keyMetrics: [
      { key: "unitCount", label: "Units", type: "number" },
      { key: "sizeSqft", label: "Size", type: "number", suffix: "sqft" },
      { key: "askingPrice", label: "Asking Price", type: "currency" },
      { key: "capRate", label: "Cap Rate", type: "percent" },
    ],
    sections: [
      {
        title: "Physical",
        fields: [
          { key: "vintageYear", label: "Year Built", type: "number" },
          { key: "lotAcres", label: "Lot Size", type: "number", suffix: "acres" },
          { key: "occupancyRate", label: "Occupancy", type: "percent" },
        ],
      },
      {
        title: "Financial",
        fields: [
          { key: "noi", label: "NOI", type: "currency" },
          { key: "estimatedValue", label: "Estimated Value", type: "currency" },
          { key: "lastSalePrice", label: "Last Sale Price", type: "currency" },
        ],
      },
    ],
    computed: [{ label: "Price / Unit", compute: pricePerUnit }],
  },

  mhc: {
    keyMetrics: [
      { key: "unitCount", label: "Pads", type: "number" },
      { key: "askingPrice", label: "Asking Price", type: "currency" },
      { key: "capRate", label: "Cap Rate", type: "percent" },
      { key: "noi", label: "NOI", type: "currency" },
    ],
    sections: [
      {
        title: "Physical",
        fields: [
          { key: "sizeSqft", label: "Size", type: "number", suffix: "sqft" },
          { key: "lotAcres", label: "Lot Size", type: "number", suffix: "acres" },
          { key: "vintageYear", label: "Year Built", type: "number" },
          { key: "yearRenovated", label: "Renovated", type: "number" },
          { key: "occupancyRate", label: "Occupancy", type: "percent" },
        ],
      },
      {
        title: "Financial",
        fields: [
          { key: "estimatedValue", label: "Estimated Value", type: "currency" },
          { key: "lastSalePrice", label: "Last Sale Price", type: "currency" },
        ],
      },
    ],
    computed: [{ label: "Price / Pad", compute: pricePerUnit }],
  },

  affordable_housing: {
    keyMetrics: [
      { key: "unitCount", label: "Units", type: "number" },
      { key: "askingPrice", label: "Asking Price", type: "currency" },
      { key: "capRate", label: "Cap Rate", type: "percent" },
      { key: "noi", label: "NOI", type: "currency" },
    ],
    sections: [
      {
        title: "Physical",
        fields: [
          { key: "sizeSqft", label: "Size", type: "number", suffix: "sqft" },
          { key: "vintageYear", label: "Year Built", type: "number" },
          { key: "yearRenovated", label: "Renovated", type: "number" },
          { key: "occupancyRate", label: "Occupancy", type: "percent" },
        ],
      },
      {
        title: "Financial",
        fields: [
          { key: "noi", label: "NOI", type: "currency" },
          { key: "estimatedValue", label: "Estimated Value", type: "currency" },
          { key: "lastSalePrice", label: "Last Sale Price", type: "currency" },
        ],
      },
    ],
    computed: [{ label: "Price / Unit", compute: pricePerUnit }],
  },

  other: {
    keyMetrics: [
      { key: "askingPrice", label: "Asking Price", type: "currency" },
      { key: "sizeSqft", label: "Size", type: "number", suffix: "sqft" },
      { key: "lotAcres", label: "Lot Size", type: "number", suffix: "acres" },
      { key: "capRate", label: "Cap Rate", type: "percent" },
    ],
    sections: [
      {
        title: "Physical",
        fields: [
          { key: "unitCount", label: "Units", type: "number" },
          { key: "vintageYear", label: "Year Built", type: "number" },
          { key: "yearRenovated", label: "Renovated", type: "number" },
          { key: "occupancyRate", label: "Occupancy", type: "percent" },
          { key: "parkingSpaces", label: "Parking", type: "number" },
          { key: "zoning", label: "Zoning", type: "text" },
        ],
      },
      {
        title: "Financial",
        fields: [
          { key: "noi", label: "NOI", type: "currency" },
          { key: "estimatedValue", label: "Estimated Value", type: "currency" },
          { key: "lastSalePrice", label: "Last Sale Price", type: "currency" },
        ],
      },
    ],
    computed: [],
  },
};

export function getTypeConfig(propertyType: string): TypeConfig {
  return PROPERTY_TYPE_CONFIGS[propertyType] ?? PROPERTY_TYPE_CONFIGS.other;
}
