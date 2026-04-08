import type { ConfirmedContact } from "@/components/ContactConfirmationCard";

export interface CRMAction {
  type: "update_contact" | "add_task" | "log_activity" | "update_property" | "update_listing";
  label: string;
  detail: string;
  contactName?: string;
  propertyName?: string;
  listingName?: string;
  listingStage?: string;
  listingNotes?: string;
  askingPrice?: number;
  capRate?: number;
  dueDate?: Date;
  accepted?: boolean;
  dismissed?: boolean;
}

export interface CoachingPoint {
  text: string;
  source: "crm" | "market" | "strategy";
}

export interface EmailAnalysis {
  editedEmail: string;
  contextSummary: string;
  senderFirstName: string;
  senderLastName: string;
  senderEmail: string;
  senderCompany: string;
  senderPhone: string;
  dealMentioned: string;
  coachingPoints: CoachingPoint[];
  suggestedActions: CRMAction[];
}

export type ContactMatchStatus =
  | { status: "found";     contact: ConfirmedContact; selectionReason?: "email_match" | "name_match" | "manual" }
  | { status: "ambiguous"; candidates: { id: number; firstName: string; lastName: string; company?: string | null }[] }
  | { status: "not_found"; prefill: { firstName: string; lastName: string; email: string; company: string; phone: string } }
  | { status: "unknown" };
