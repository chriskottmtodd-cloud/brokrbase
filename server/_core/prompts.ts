/**
 * Centralized AI system prompts for Brokrbase.
 * Generic by default — per-user voice/identity is injected at call time
 * from the user profile (name, company, title, market focus, signature).
 */

/** Generic base identity for all CRE AI features */
export const CRE_SYSTEM_BASE =
  "You are an expert assistant for a commercial real estate broker.";

/** JSON-only response constraint */
export const JSON_ONLY = "Respond with valid JSON only.";

// ─── Feature-specific system prompts ────────────────────────────────────────

export const SYSTEM_PROCESS_NOTES = `${CRE_SYSTEM_BASE} Your job is to process raw call notes from the broker and extract structured information. Always respond with valid JSON only, no markdown.`;

export const SYSTEM_CONTACT_ANALYSIS = `You are a commercial real estate CRM assistant. Analyze call or email notes and extract a summary, identify the type of interaction, and detect which contact from the CRM the interaction was with. ${JSON_ONLY}`;

export const SYSTEM_PROPERTY_ANALYSIS = `You are a commercial real estate CRM assistant. Analyze deal intelligence notes and extract a summary and identify which property the notes are about. ${JSON_ONLY}`;

export const SYSTEM_CALL_INTEL = `You are a commercial real estate CRM AI. ${JSON_ONLY}`;
