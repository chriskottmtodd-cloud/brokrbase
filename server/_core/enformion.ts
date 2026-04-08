import { ENV } from "./env";

const BASE_URL = "https://devapi.enformion.com";

const REGISTERED_AGENT_BLOCKLIST = [
  "NORTHWEST REGISTERED AGENT", "CSC", "CORPORATION SERVICE COMPANY",
  "CT CORPORATION", "ZENBUSINESS", "COGENCY GLOBAL",
  "NATIONAL REGISTERED AGENTS", "REGISTERED AGENTS INC", "INCORP SERVICES",
  "LEGALINC", "UNITED AGENT GROUP", "SYNERGY CORPORATE SERVICES",
];

const ENTITY_PATTERNS = /\b(LLC|INC|CORP|TRUST|LTD|LP|LLP|PLLC|HOLDINGS|SERVICES|VENTURES|PARTNERS)\b/i;

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ParsedContact {
  firstName: string | null;
  lastName: string | null;
  fullName: string;
  title: string | null;
  contactType: "principal" | "registered_agent" | "parent_entity" | "unknown";
  isEntity: boolean;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  county: string | null;
}

export interface EnrichResult {
  firstName: string | null;
  lastName: string | null;
  middleName: string | null;
  age: string | null;
  identityScore: number | null;
  phones: Array<{
    number: string;
    type: "mobile" | "landline" | "unknown";
    isConnected: boolean | null;
    firstReportedDate: string | null;
    lastReportedDate: string | null;
  }>;
  emails: Array<{
    email: string;
    isValidated: boolean;
    isBusiness: boolean;
  }>;
  addresses: Array<{
    street: string | null;
    unit: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    firstReportedDate: string | null;
    lastReportedDate: string | null;
  }>;
}

// ─── API calls ──────────────────────────────────────────────────────────────

async function enformionFetch(endpoint: string, body: Record<string, unknown>, searchType: string) {
  const resp = await fetch(`${BASE_URL}/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "galaxy-ap-name": ENV.enformionApName,
      "galaxy-ap-password": ENV.enformionApPassword,
      "galaxy-search-type": searchType,
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    throw new Error(`Enformion ${endpoint} returned ${resp.status}: ${await resp.text()}`);
  }
  return resp.json();
}

// ─── BusinessV2Search (LLC Lookup) ──────────────────────────────────────────

export async function businessV2Search(businessName: string, state: string): Promise<{
  contacts: ParsedContact[];
  rawResponse: string;
  executionTimeMs: number;
}> {
  const data = await enformionFetch("BusinessV2Search", {
    businessName,
    addressLine2: state,
    page: 1,
    resultsPerPage: 10,
  }, "BusinessV2");

  const rawResponse = JSON.stringify(data);
  const executionTimeMs = data.totalRequestExecutionTimeMs ?? 0;
  const contacts: ParsedContact[] = [];

  // Parse usCorpFilings
  for (const record of data.businessV2Records ?? []) {
    for (const filing of record.usCorpFilings ?? []) {
      for (const officer of filing.officers ?? []) {
        contacts.push(classifyCorpOfficer(officer));
      }
      for (const contact of filing.contacts ?? []) {
        contacts.push(classifyCorpOfficer(contact));
      }
    }
    // Parse newBusinessFilings
    for (const filing of record.newBusinessFilings ?? []) {
      for (const contact of filing.contacts ?? []) {
        contacts.push(classifyNewBusinessContact(contact, filing.addresses ?? []));
      }
    }
  }

  return { contacts, rawResponse, executionTimeMs };
}

function classifyCorpOfficer(officer: any): ParsedContact {
  const name = officer.name ?? {};
  const fullName = (name.nameRaw ?? name.fullName ?? `${name.nameFirst ?? name.firstName ?? ""} ${name.nameLast ?? name.lastName ?? ""}`.trim()).trim();
  const firstName = name.nameFirst ?? name.firstName ?? null;
  const lastName = name.nameLast ?? name.lastName ?? null;
  const title = officer.title ?? null;
  const addr = officer.address ?? {};

  // Classify
  let contactType: ParsedContact["contactType"] = "principal";
  let isEntity = false;

  if (title && /REGISTERED\s*AGENT/i.test(title)) {
    contactType = "registered_agent";
  } else if (isBlocklistedAgent(fullName)) {
    contactType = "registered_agent";
  } else if (ENTITY_PATTERNS.test(fullName)) {
    contactType = "parent_entity";
    isEntity = true;
  }

  return {
    firstName, lastName, fullName, title, contactType, isEntity,
    address: addr.addressLine1 ?? null,
    city: addr.city ?? null,
    state: addr.state ?? null,
    zip: addr.zip ?? null,
    county: addr.county ?? null,
  };
}

function classifyNewBusinessContact(contact: any, addresses: any[]): ParsedContact {
  const name = contact.name ?? {};
  const fullName = (name.fullName ?? `${name.firstName ?? ""} ${name.lastName ?? ""}`.trim()).trim();
  const firstName = name.firstName ?? null;
  const lastName = name.lastName ?? null;
  const title = contact.officerTitleDesc ?? contact.contactTypeDesc ?? null;

  let contactType: ParsedContact["contactType"] = "principal";
  let isEntity = false;

  if (contact.contactTypeDesc === "AGENT" || contact.officerTitleDesc === "AGENT") {
    contactType = "registered_agent";
  } else if (isBlocklistedAgent(fullName)) {
    contactType = "registered_agent";
  } else if (contact.companyFlag === "True") {
    contactType = "parent_entity";
    isEntity = true;
  } else if (ENTITY_PATTERNS.test(fullName)) {
    contactType = "parent_entity";
    isEntity = true;
  }

  // Try to find a relevant address
  const addr = addresses.find((a: any) =>
    a.addressTypeDesc?.includes("OFFICER") || a.addressTypeDesc?.includes("BUSINESS")
  ) ?? addresses.find((a: any) => a.addressTypeDesc?.includes("MAIL")) ?? addresses[0];

  return {
    firstName, lastName, fullName, title, contactType, isEntity,
    address: addr?.addressLine1 ?? null,
    city: addr?.city ?? null,
    state: addr?.state ?? null,
    zip: addr?.zip ?? null,
    county: null,
  };
}

function isBlocklistedAgent(name: string): boolean {
  const upper = name.toUpperCase();
  return REGISTERED_AGENT_BLOCKLIST.some((blocked) => upper.includes(blocked));
}

// ─── Contact/Enrich ─────────────────────────────────────────────────────────

export async function contactEnrich(input: {
  firstName: string;
  lastName: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
}): Promise<{ result: EnrichResult; rawResponse: string; identityScore: number | null }> {
  const addressLine2 = [input.city, input.state, input.zip].filter(Boolean).join(", ");
  const body: Record<string, unknown> = {
    FirstName: input.firstName,
    LastName: input.lastName,
  };
  if (input.address || addressLine2) {
    body.Address = {
      ...(input.address ? { addressLine1: input.address } : {}),
      ...(addressLine2 ? { addressLine2 } : {}),
    };
  }

  const data = await enformionFetch("Contact/Enrich", body, "DevAPIContactEnrich");
  const rawResponse = JSON.stringify(data);
  const person = data.person ?? {};

  const phones = (person.phones ?? []).map((p: any) => ({
    number: p.number ?? "",
    type: (p.type === "mobile" ? "mobile" : p.type === "landline" ? "landline" : "unknown") as "mobile" | "landline" | "unknown",
    isConnected: p.isConnected ?? null,
    firstReportedDate: p.firstReportedDate ?? null,
    lastReportedDate: p.lastReportedDate ?? null,
  }));

  // Sort phones: mobile first, connected, most recent
  phones.sort((a: any, b: any) => {
    if (a.type === "mobile" && b.type !== "mobile") return -1;
    if (a.type !== "mobile" && b.type === "mobile") return 1;
    if (a.isConnected && !b.isConnected) return -1;
    if (!a.isConnected && b.isConnected) return 1;
    const aDate = a.lastReportedDate ? new Date(a.lastReportedDate).getTime() : 0;
    const bDate = b.lastReportedDate ? new Date(b.lastReportedDate).getTime() : 0;
    return bDate - aDate;
  });

  const emails = (person.emails ?? []).map((e: any) => ({
    email: e.email ?? "",
    isValidated: e.isValidated ?? false,
    isBusiness: e.isBusiness ?? false,
  }));

  // Sort emails: validated first, business first
  emails.sort((a: any, b: any) => {
    if (a.isValidated && !b.isValidated) return -1;
    if (!a.isValidated && b.isValidated) return 1;
    if (a.isBusiness && !b.isBusiness) return -1;
    if (!a.isBusiness && b.isBusiness) return 1;
    return 0;
  });

  const addresses = (person.addresses ?? []).map((a: any) => ({
    street: a.street ?? null,
    unit: a.unit ?? null,
    city: a.city ?? null,
    state: a.state ?? null,
    zip: a.zip ?? null,
    firstReportedDate: a.firstReportedDate ?? null,
    lastReportedDate: a.lastReportedDate ?? null,
  }));

  // Sort addresses: most recent first
  addresses.sort((a: any, b: any) => {
    const aDate = a.lastReportedDate ? new Date(a.lastReportedDate).getTime() : 0;
    const bDate = b.lastReportedDate ? new Date(b.lastReportedDate).getTime() : 0;
    return bDate - aDate;
  });

  const personName = person.name ?? {};
  return {
    result: {
      firstName: personName.firstName ?? null,
      lastName: personName.lastName ?? null,
      middleName: personName.middleName ?? null,
      age: person.age ?? null,
      identityScore: data.identityScore ?? null,
      phones,
      emails,
      addresses,
    },
    rawResponse,
    identityScore: data.identityScore ?? null,
  };
}
