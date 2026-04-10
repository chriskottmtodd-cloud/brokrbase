// ─── Priority Colors (red intensity scale) ──────────────────────────────────
export const priorityColors: Record<string, string> = {
  hot: "bg-red-500/20 text-red-500 border-red-500/30",
  warm: "bg-red-400/15 text-red-400 border-red-400/25",
  cold: "bg-slate-400/15 text-slate-400 border-slate-400/25",
  inactive: "bg-slate-300/15 text-slate-300 border-slate-300/20",
  urgent: "text-red-500 border-red-500/40 bg-red-500/10",
  high: "text-red-400 border-red-400/40 bg-red-400/10",
  medium: "text-slate-500 border-slate-400/40 bg-slate-400/10",
  low: "text-slate-400 border-slate-400/30 bg-slate-300/10",
};

// ─── Property Status Colors (red → gray scale) ─────────────────────────────
export const statusColors: Record<string, string> = {
  researching:   "bg-slate-400/15 text-slate-400 border-slate-400/25",
  prospecting:   "bg-red-400/15 text-red-400 border-red-400/25",
  seller:        "bg-red-500/20 text-red-500 border-red-500/30",
  listed:        "bg-red-600/20 text-red-600 border-red-600/30",
  under_contract: "bg-red-700/20 text-red-700 border-red-700/30",
  recently_sold: "bg-slate-500/20 text-slate-500 border-slate-500/30",
};

// ─── Listing Stage Colors ────────────────────────────────────────────────────
export const stageColors: Record<string, string> = {
  new:            "bg-slate-400/15 text-slate-400 border-slate-400/25",
  active:         "bg-red-500/20 text-red-500 border-red-500/30",
  under_contract: "bg-red-700/20 text-red-700 border-red-700/30",
  closed:         "bg-slate-500/20 text-slate-500 border-slate-500/30",
  withdrawn:      "bg-slate-300/15 text-slate-300 border-slate-300/20",
};

// ─── Buyer Interest Status Colors ────────────────────────────────────────────
export const interestStatusColors: Record<string, string> = {
  prospect:       "bg-slate-400/15 text-slate-400",
  contacted:      "bg-red-300/15 text-red-400",
  interested:     "bg-red-400/20 text-red-400",
  toured:         "bg-red-500/20 text-red-500",
  loi_submitted:  "bg-red-600/20 text-red-600",
  under_contract: "bg-red-700/20 text-red-700",
  closed:         "bg-slate-500/20 text-slate-500",
  passed:         "bg-slate-300/15 text-slate-300",
};

// ─── Property Type Labels ────────────────────────────────────────────────────
export const propertyTypeLabels: Record<string, string> = {
  mhc: "MHC",
  apartment: "Apt",
  affordable_housing: "Affordable",
  self_storage: "Storage",
  mixed: "Mixed",
  other: "Other",
};

// ─── Enum Arrays (for form selects) ──────────────────────────────────────────
export const TASK_TYPES = ["call", "email", "meeting", "follow_up", "research", "other"] as const;
export const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
export const ACTIVITY_TYPES = ["call", "email", "meeting", "note", "text", "voicemail"] as const;
export const OUTCOMES = ["reached", "voicemail", "no_answer", "callback_requested", "not_interested", "interested", "follow_up"] as const;

export const PROPERTY_TYPES = [
  { value: "apartment", label: "Apartment" },
  { value: "mhc", label: "MHC / Mobile Home Community" },
  { value: "affordable_housing", label: "Affordable Housing" },
  { value: "self_storage", label: "Self Storage" },
  { value: "other", label: "Other" },
] as const;

export const DEAL_ROLES = [
  { value: "owner", label: "Owner" },
  { value: "seller", label: "Seller" },
  { value: "buyer", label: "Buyer" },
  { value: "buyers_broker", label: "Buyer's Broker" },
  { value: "listing_agent", label: "Listing Agent" },
  { value: "property_manager", label: "Property Manager" },
  { value: "attorney", label: "Attorney" },
  { value: "lender", label: "Lender" },
  { value: "other", label: "Other" },
] as const;
