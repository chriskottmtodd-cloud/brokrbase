// ─── Priority Colors ─────────────────────────────────────────────────────────
export const priorityColors: Record<string, string> = {
  hot: "bg-red-500/20 text-red-400 border-red-500/30",
  warm: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  cold: "bg-blue-500/20 text-blue-400 border-blue-500/30",
  inactive: "bg-slate-500/20 text-slate-400 border-slate-500/30",
  urgent: "text-red-400 border-red-400/40 bg-red-400/10",
  high: "text-amber-400 border-amber-400/40 bg-amber-400/10",
  medium: "text-blue-400 border-blue-400/40 bg-blue-400/10",
  low: "text-slate-400 border-slate-400/40 bg-slate-400/10",
};

// ─── Property Status Colors ──────────────────────────────────────────────────
export const statusColors: Record<string, string> = {
  researching:   "bg-slate-500/20 text-slate-400 border-slate-500/30",
  prospecting:   "bg-blue-500/20 text-blue-400 border-blue-500/30",
  seller:        "bg-amber-500/20 text-amber-400 border-amber-500/30",
  listed:        "bg-purple-500/20 text-purple-400 border-purple-500/30",
  recently_sold: "bg-green-500/20 text-green-400 border-green-500/30",
};

// ─── Listing Stage Colors ────────────────────────────────────────────────────
export const stageColors: Record<string, string> = {
  new:            "bg-slate-500/20 text-slate-400 border-slate-500/30",
  active:         "bg-blue-500/20 text-blue-400 border-blue-500/30",
  under_contract: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  closed:         "bg-green-500/20 text-green-400 border-green-500/30",
  withdrawn:      "bg-red-500/20 text-red-400 border-red-500/30",
};

// ─── Buyer Interest Status Colors ────────────────────────────────────────────
export const interestStatusColors: Record<string, string> = {
  prospect:       "bg-slate-500/20 text-slate-400",
  contacted:      "bg-blue-500/20 text-blue-400",
  interested:     "bg-cyan-500/20 text-cyan-400",
  toured:         "bg-purple-500/20 text-purple-400",
  loi_submitted:  "bg-amber-500/20 text-amber-400",
  under_contract: "bg-orange-500/20 text-orange-400",
  closed:         "bg-green-500/20 text-green-400",
  passed:         "bg-red-500/20 text-red-400",
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
