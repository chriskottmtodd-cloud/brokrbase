import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { invokeLLM } from "../_core/llm";
import { callDataApi } from "../_core/dataApi";
import {
  bulkInsertProperties,
  createContact,
  createContactPropertyLink,
  createProperty,
  deleteProperty,
  findDuplicateProperty,
  getProperties,
  getPropertiesForMap,
  getPropertiesMissingCoords,
  getPropertiesByOwner,
  getPropertyById,
  updateProperty,
  getSaleRecord,
  upsertSaleRecord,
  createUnsolicitedOffer,
  getUnsolicitedOffers,
  deleteUnsolicitedOffer,
  getRecentUnsolicitedOfferProperties,
  getActivities,
  getDb,
  createListing,
  getListings,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

const PROPERTY_STATUS = [
  "researching",
  "prospecting",
  "seller",
  "listed",
  "recently_sold",
] as const;

const PROPERTY_TYPE = [
  "mhc",
  "apartment",
  "affordable_housing",
  "self_storage",
  "other",
] as const;

export const propertiesRouter = router({
  list: protectedProcedure
    .input(
      z
        .object({
          search: z.string().optional(),
          propertyType: z.string().optional(),
          status: z.string().optional(),
          minUnits: z.number().optional(),
          maxUnits: z.number().optional(),
          minYear: z.number().optional(),
          maxYear: z.number().optional(),
          city: z.string().optional(),
          county: z.string().optional(),
          ownerId: z.number().optional(),
          limit: z.number().optional(),
          offset: z.number().optional(),
        })
        .optional()
    )
    .query(({ ctx, input }) => getProperties(ctx.user.id, input)),

  forMap: protectedProcedure.query(({ ctx }) =>
    getPropertiesForMap(ctx.user.id)
  ),

  byId: protectedProcedure
    .input(z.object({ id: z.number() }))
    .query(async ({ ctx, input }) => {
      const prop = await getPropertyById(input.id, ctx.user.id);
      if (!prop) throw new TRPCError({ code: "NOT_FOUND" });
      return prop;
    }),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        propertyType: z.enum(PROPERTY_TYPE),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().default("ID"),
        zip: z.string().optional(),
        county: z.string().optional(),
        unitCount: z.number().optional(),
        vintageYear: z.number().optional(),
        sizeSqft: z.number().optional(),
        lotAcres: z.number().optional(),
        estimatedValue: z.number().optional(),
        lastSalePrice: z.number().optional(),
        lastSaleDate: z.date().optional().nullable(),
        askingPrice: z.number().optional(),
        capRate: z.number().optional(),
        noi: z.number().optional(),
        status: z.enum(PROPERTY_STATUS).default("researching"),
        isMyListing: z.boolean().optional(),
        ownerId: z.number().optional(),
        ownerName: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        notes: z.string().optional(),
        tags: z.string().optional(),
        nextFollowUpAt: z.date().optional(),
        marketId: z.number().optional().nullable(),
      })
    )
    .mutation(({ ctx, input }) =>
      createProperty({ ...input, userId: ctx.user.id })
    ),

  update: protectedProcedure
    .input(
      z.object({
        id: z.number(),
        name: z.string().optional(),
        propertyType: z.enum(PROPERTY_TYPE).optional(),
        address: z.string().optional(),
        city: z.string().optional(),
        state: z.string().optional(),
        zip: z.string().optional(),
        county: z.string().optional(),
        unitCount: z.number().optional(),
        vintageYear: z.number().optional(),
        sizeSqft: z.number().optional(),
        lotAcres: z.number().optional(),
        estimatedValue: z.number().optional(),
        lastSalePrice: z.number().optional(),
        lastSaleDate: z.date().optional().nullable(),
        askingPrice: z.number().optional(),
        capRate: z.number().optional(),
        noi: z.number().optional(),
        status: z.enum(PROPERTY_STATUS).optional(),
        isMyListing: z.boolean().optional(),
        ownerId: z.number().optional().nullable(),
        ownerName: z.string().optional(),
        ownerCompany: z.string().optional(),
        ownerLlc: z.string().optional(),
        ownerPhone: z.string().optional(),
        ownerEmail: z.string().optional(),
        latitude: z.number().optional(),
        longitude: z.number().optional(),
        notes: z.string().optional(),
        tags: z.string().optional(),
        nextFollowUpAt: z.date().optional().nullable(),
        marketId: z.number().optional().nullable(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      await updateProperty(id, ctx.user.id, data);

      // Auto-create listing when property is both "listed" AND isMyListing
      // Re-read from DB AFTER the update has been applied
      if (data.status === "listed" || data.isMyListing === true) {
        const prop = await getPropertyById(id, ctx.user.id);
        if (prop && prop.isMyListing && prop.status === "listed") {
          const existingListings = await getListings(ctx.user.id);
          const hasListing = existingListings.some(
            (l) => l.propertyId === id && l.stage !== "withdrawn" && l.stage !== "expired" && l.stage !== "closed"
          );
          if (!hasListing) {
            await createListing({
              userId: ctx.user.id,
              propertyId: id,
              title: prop.name,
              askingPrice: prop.askingPrice ?? undefined,
              capRate: prop.capRate ?? undefined,
              noi: prop.noi ?? undefined,
              unitCount: prop.unitCount ?? undefined,
              propertyName: prop.name,
              stage: "active",
              status: "active",
            });
          }
        }
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteProperty(input.id, ctx.user.id)),

  otherByOwner: protectedProcedure
    .input(
      z.object({ ownerId: z.number(), excludePropertyId: z.number() })
    )
    .query(({ ctx, input }) =>
      getPropertiesByOwner(
        input.ownerId,
        input.excludePropertyId,
        ctx.user.id
      )
    ),

  geocodeMissing: protectedProcedure.mutation(async ({ ctx }) => {
    const { makeRequest } = await import("../_core/map");
    type GeocodeResult = {
      status: string;
      results: Array<{
        geometry: { location: { lat: number; lng: number } };
      }>;
    };
    const missing = await getPropertiesMissingCoords(ctx.user.id);
    let geocoded = 0;
    let failed = 0;
    for (const prop of missing) {
      const candidates = [
        [prop.address, prop.city, prop.state, prop.zip]
          .filter(Boolean)
          .join(", "),
        /^\d/.test(prop.name ?? "")
          ? [prop.name, prop.city, prop.state, prop.zip]
              .filter(Boolean)
              .join(", ")
          : null,
        [prop.city, prop.state].filter(Boolean).join(", "),
      ].filter(Boolean) as string[];

      let success = false;
      for (const query of candidates) {
        try {
          const geo = await makeRequest<GeocodeResult>(
            `/maps/api/geocode/json?address=${encodeURIComponent(query)}`
          );
          if (geo.status === "OK" && geo.results[0]) {
            const { lat, lng } = geo.results[0].geometry.location;
            if (/^\d/.test(prop.name ?? "") && !prop.address) {
              await updateProperty(prop.id, ctx.user.id, {
                latitude: lat,
                longitude: lng,
                address: prop.name,
              });
            } else {
              await updateProperty(prop.id, ctx.user.id, {
                latitude: lat,
                longitude: lng,
              });
            }
            geocoded++;
            success = true;
            break;
          }
        } catch {
          // try next candidate
        }
      }
      if (!success) failed++;
    }
    return { total: missing.length, geocoded, failed };
  }),

  // ─── AI Column Mapping ─────────────────────────────────────────────────────
  aiMapColumns: protectedProcedure
    .input(z.object({
      headers: z.array(z.string()),
      sampleRows: z.array(z.array(z.string())).max(5),
    }))
    .mutation(async ({ input }) => {
      const { parseLlmJson } = await import("../lib/parseLlmJson");

      const CRM_FIELD_KEYS = [
        "name", "propertyType", "address", "city", "state", "zip", "county",
        "unitCount", "vintageYear", "sizeSqft", "estimatedValue", "askingPrice",
        "status", "ownerName", "notes", "importNotes", "latitude", "longitude",
      ];

      // Build a table preview for the LLM
      const preview = input.sampleRows.map((row, i) =>
        `Row ${i + 1}: ${input.headers.map((h, j) => `${h}="${row[j] ?? ""}"`).join(", ")}`
      ).join("\n");

      const response = await invokeLLM({
        messages: [
          {
            role: "system",
            content: "You are a data mapping assistant for a commercial real estate CRM. Map spreadsheet columns to CRM fields. Respond with valid JSON only.",
          },
          {
            role: "user",
            content: `Map these spreadsheet columns to CRM fields. Look at both the header names AND the sample data to determine the best mapping.

SPREADSHEET HEADERS: ${JSON.stringify(input.headers)}

SAMPLE DATA:
${preview}

CRM FIELDS (use exactly these keys):
${CRM_FIELD_KEYS.map(k => `- "${k}"`).join("\n")}

Special values:
- "__save_as_notes__" — save the column data as notes (for columns with useful info that don't map to a specific field)
- "__skip__" — skip this column entirely (for row numbers, empty columns, or irrelevant data)

Return a JSON object mapping each header to a CRM field key, "__save_as_notes__", or "__skip__":
{ "header1": "name", "header2": "address", "header3": "__save_as_notes__", ... }

RULES:
- Every header must be mapped to exactly one value
- Each CRM field can only be used once
- Prefer mapping to specific fields over __save_as_notes__
- Columns with rent data, unit mix, tenant info, lease terms → __save_as_notes__ (these get preserved as research notes)
- Column with property/complex names → "name"
- Columns with dollar amounts: look at context — sale price/value → "estimatedValue", list price → "askingPrice"
- Owner/seller/contact name → "ownerName"`,
          },
        ],
      });

      const rawContent = (response as { choices: Array<{ message: { content: string } }> })
        .choices[0]?.message?.content ?? "{}";
      const mapped = parseLlmJson<Record<string, string>>(rawContent);

      // Validate: ensure all returned values are valid
      const validValues = new Set([...CRM_FIELD_KEYS, "__save_as_notes__", "__skip__"]);
      const result: Record<string, string> = {};
      const usedFields = new Set<string>();

      for (const header of input.headers) {
        const value = mapped[header];
        if (value && validValues.has(value) && !usedFields.has(value)) {
          result[header] = value;
          if (value !== "__save_as_notes__" && value !== "__skip__") {
            usedFields.add(value);
          }
        } else {
          result[header] = "__save_as_notes__";
        }
      }

      return result;
    }),

  // ─── Bulk Import (upsert mode) ──────────────────────────────────────────────
  bulkImport: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            name: z.string(),
            propertyType: z.enum(PROPERTY_TYPE).default("mhc"),
            address: z.string().optional(),
            city: z.string().optional(),
            state: z.string().optional(),
            zip: z.string().optional(),
            county: z.string().optional(),
            unitCount: z.number().optional(),
            vintageYear: z.number().optional(),
            sizeSqft: z.number().optional(),
            estimatedValue: z.number().optional(),
            askingPrice: z.number().optional(),
            status: z.enum(PROPERTY_STATUS).optional(),
            ownerName: z.string().optional(),
            notes: z.string().optional(),
            importNotes: z.string().optional(),
            latitude: z.number().optional(),
            longitude: z.number().optional(),
          })
        ),
        geocode: z.boolean().default(true),
        /** "skip" = skip duplicates, "update" = update existing fields, "insert" = always insert */
        duplicateMode: z
          .enum(["skip", "update", "insert"])
          .default("skip"),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { makeRequest } = await import("../_core/map");
      type GeocodeResult = {
        status: string;
        results: Array<{
          geometry: { location: { lat: number; lng: number } };
          address_components: Array<{
            long_name: string;
            short_name: string;
            types: string[];
          }>;
        }>;
      };

      const results: Array<{
        index: number;
        name: string;
        status: "inserted" | "updated" | "skipped" | "error";
        geocoded: boolean;
        error?: string;
      }> = [];

      let inserted = 0;
      let updated = 0;
      let skipped = 0;
      let geocodedCount = 0;

      for (let index = 0; index < input.rows.length; index++) {
        const row = input.rows[index];
        try {
          // Geocode if needed
          let lat = row.latitude;
          let lng = row.longitude;
          let city = row.city;
          let county = row.county;
          let state = row.state ?? "ID";
          let zip = row.zip;
          let wasGeocoded = false;

          if (input.geocode === true && row.address && (lat === undefined || lng === undefined)) {
            try {
              const addressStr = [row.address, row.city, row.state ?? "ID", row.zip]
                .filter(Boolean)
                .join(", ");
              const geo = await makeRequest<GeocodeResult>(
                `/maps/api/geocode/json?address=${encodeURIComponent(addressStr)}`
              );
              if (geo.status === "OK" && geo.results[0]) {
                const r = geo.results[0];
                lat = r.geometry.location.lat;
                lng = r.geometry.location.lng;
                wasGeocoded = true;
                for (const comp of r.address_components) {
                  if (!city && comp.types.includes("locality"))
                    city = comp.long_name;
                  if (!county && comp.types.includes("administrative_area_level_2"))
                    county = comp.long_name;
                  if (!state && comp.types.includes("administrative_area_level_1"))
                    state = comp.short_name;
                  if (!zip && comp.types.includes("postal_code"))
                    zip = comp.long_name;
                }
              }
            } catch {
              // geocoding failed, continue without coords
            }
          }

          // Check for existing property
          const existingId = await findDuplicateProperty(
            ctx.user.id,
            row.name,
            row.address
          );

          // ── importNotes append helper ──────────────────────────────────────
          // importNotes is a permanent record of research data from imports.
          // It is NEVER overwritten — only prepended with a dated header when
          // new notes differ from what's already stored.
          const buildImportNotes = (incomingNotes: string | undefined, existingImportNotes: string | null | undefined): string | undefined => {
            const incoming = incomingNotes?.trim();
            if (!incoming) return undefined; // nothing to add
            const existing = existingImportNotes ?? "";
            if (existing && existing.includes(incoming)) return undefined; // already stored
            const dateHeader = `--- Import: ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} ---`;
            return existing
              ? `${dateHeader}\n${incoming}\n\n${existing}`
              : `${dateHeader}\n${incoming}`;
          };

          if (existingId) {
            if (input.duplicateMode === "skip") {
              results.push({ index, name: row.name, status: "skipped", geocoded: wasGeocoded });
              skipped++;
              continue;
            } else if (input.duplicateMode === "update") {
              // Field-level merge: only update fields that are present in this row
              const updateData: Record<string, unknown> = {};
              if (row.propertyType) updateData.propertyType = row.propertyType;
              if (row.address) updateData.address = row.address;
              if (city) updateData.city = city;
              if (state) updateData.state = state;
              if (zip) updateData.zip = zip;
              if (county) updateData.county = county;
              if (row.unitCount !== undefined) updateData.unitCount = row.unitCount;
              if (row.vintageYear !== undefined) updateData.vintageYear = row.vintageYear;
              if (row.sizeSqft !== undefined) updateData.sizeSqft = row.sizeSqft;
              if (row.estimatedValue !== undefined) updateData.estimatedValue = row.estimatedValue;
              if (row.askingPrice !== undefined) updateData.askingPrice = row.askingPrice;
              if (row.status) updateData.status = row.status;
              if (row.ownerName) updateData.ownerName = row.ownerName;
              if (row.notes) updateData.notes = row.notes;
              if (lat !== undefined) updateData.latitude = lat;
              if (lng !== undefined) updateData.longitude = lng;
              // importNotes: fetch existing then append
              const existingProp = await getPropertyById(existingId, ctx.user.id);
              const newImportNotes = buildImportNotes(row.importNotes ?? row.notes, existingProp?.importNotes);
              if (newImportNotes !== undefined) updateData.importNotes = newImportNotes;
              await updateProperty(existingId, ctx.user.id, updateData);
              results.push({ index, name: row.name, status: "updated", geocoded: wasGeocoded });
              updated++;
              if (wasGeocoded) geocodedCount++;
              continue;
            }
            // duplicateMode === "insert" falls through to create a new record
          }

          // Build importNotes for new property
          const newImportNotes = buildImportNotes(row.importNotes ?? row.notes, undefined);

          // Insert new property
          await createProperty({
            userId: ctx.user.id,
            name: row.name,
            propertyType: row.propertyType ?? "mhc",
            address: row.address,
            city,
            state: state ?? "ID",
            zip,
            county,
            unitCount: row.unitCount,
            vintageYear: row.vintageYear,
            sizeSqft: row.sizeSqft,
            estimatedValue: row.estimatedValue,
            askingPrice: row.askingPrice,
            status: row.status ?? "researching",
            ownerName: row.ownerName,
            notes: row.notes,
            importNotes: newImportNotes,
            latitude: lat,
            longitude: lng,
          });
          results.push({ index, name: row.name, status: "inserted", geocoded: wasGeocoded });
          inserted++;
          if (wasGeocoded) geocodedCount++;
        } catch (err) {
          results.push({
            index,
            name: row.name,
            status: "error",
            geocoded: false,
            error: String(err),
          });
        }
      }

      return {
        total: input.rows.length,
        inserted,
        updated,
        skipped,
        geocoded: geocodedCount,
        failed: results.filter((r) => r.status === "error").length,
        results,
      };
    }),

  // ─── Enriched Import (combined properties + contacts from CRM_Import_Enriched format) ──
  enrichedImport: protectedProcedure
    .input(
      z.object({
        rows: z.array(
          z.object({
            propertyName: z.string().nullable().optional(),
            assetType: z.string().nullable().optional(),
            propertyAddress: z.string().nullable().optional(),
            city: z.string().nullable().optional(),
            state: z.string().nullable().optional(),
            zip: z.string().nullable().optional(),
            units: z.string().nullable().optional(),
            yearBuilt: z.string().nullable().optional(),
            ownerName: z.string().nullable().optional(),
            ownerAddress: z.string().nullable().optional(),
            contact1Name: z.string().nullable().optional(),
            contact1Phone: z.string().nullable().optional(),
            contact1Email: z.string().nullable().optional(),
            contact2Name: z.string().nullable().optional(),
            contact2Phone: z.string().nullable().optional(),
            contact2Email: z.string().nullable().optional(),
            lastSoldDate: z.string().nullable().optional(),
            lastSoldPrice: z.string().nullable().optional(),
            lastContacted: z.string().nullable().optional(),
            dataSource: z.string().nullable().optional(),
            notes: z.string().nullable().optional(),
            toDo: z.string().nullable().optional(),
            sourceDetailNotes: z.string().nullable().optional(),
            researchConfidence: z.string().nullable().optional(),
            duplicateOwnerFlag: z.string().nullable().optional(),
            importNotes: z.string().nullable().optional(),
            market: z.string().nullable().optional(),
          })
        ),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { makeRequest } = await import("../_core/map");
      type GeocodeResult = {
        status: string;
        results: Array<{
          geometry: { location: { lat: number; lng: number } };
        }>;
      };
      let propertiesInserted = 0;
      let contactsInserted = 0;
      let propertiesSkipped = 0;
       const errors: string[] = [];
      const contactCache = new Map<string, number>();

      // Pre-load markets for name-based lookup (market column → marketId)
      const db = await getDb();
      const { markets: mTable } = await import("../../drizzle/schema");
      const allMarkets = db ? await db.select({ id: mTable.id, name: mTable.name }).from(mTable).where(eq(mTable.userId, ctx.user.id)) : [];
      const marketByName = new Map(allMarkets.map(m => [m.name.toLowerCase().trim(), m.id]));

      for (const row of input.rows) {
        const propName = row.propertyName?.trim();
        if (!propName) continue;

        const dup = await findDuplicateProperty(
          ctx.user.id,
          propName,
          row.propertyAddress ?? undefined
        );
        if (dup) {
          propertiesSkipped++;
          continue;
        }

        const assetTypeLower = (row.assetType ?? "").toLowerCase();
        let propertyType: "mhc" | "apartment" | "affordable_housing" | "self_storage" | "other" = "apartment";
        if (
          assetTypeLower.includes("mobile") ||
          assetTypeLower.includes("mhc") ||
          assetTypeLower === "mkt"
        )
          propertyType = "mhc";
        else if (assetTypeLower.includes("storage"))
          propertyType = "self_storage";
        else if (assetTypeLower.includes("affordable"))
          propertyType = "affordable_housing";

        const notesParts: string[] = [];
        if (row.notes) notesParts.push(row.notes);
        if (row.sourceDetailNotes)
          notesParts.push(`[Source Detail] ${row.sourceDetailNotes}`);
        if (row.toDo) notesParts.push(`[To Do] ${row.toDo}`);
        if (row.dataSource) notesParts.push(`[Data Source] ${row.dataSource}`);
        if (row.researchConfidence)
          notesParts.push(`[Research Confidence] ${row.researchConfidence}`);
        if (row.duplicateOwnerFlag)
          notesParts.push(`[Duplicate Owner] ${row.duplicateOwnerFlag}`);

        let lastSalePrice: number | undefined;
        if (row.lastSoldPrice) {
          const cleaned = row.lastSoldPrice.replace(/[$,]/g, "");
          const parsed = parseFloat(cleaned);
          if (!isNaN(parsed)) lastSalePrice = parsed;
        }

        let lastSaleDate: Date | undefined;
        if (row.lastSoldDate) {
          const d = new Date(row.lastSoldDate);
          if (!isNaN(d.getTime())) lastSaleDate = d;
        }

        const unitCount = row.units ? parseInt(row.units) || undefined : undefined;
        const vintageYear = row.yearBuilt
          ? parseInt(row.yearBuilt) || undefined
          : undefined;

        let latitude: number | undefined;
        let longitude: number | undefined;
        const geocodeQuery = [
          row.propertyAddress,
          row.city,
          row.state,
          row.zip,
        ]
          .filter(Boolean)
          .join(", ");
        if (geocodeQuery) {
          try {
            const geo = await makeRequest<GeocodeResult>(
              `/maps/api/geocode/json?address=${encodeURIComponent(geocodeQuery)}`
            );
            if (geo.status === "OK" && geo.results[0]) {
              latitude = geo.results[0].geometry.location.lat;
              longitude = geo.results[0].geometry.location.lng;
            }
          } catch {
            /* geocode failure is non-fatal */
          }
        }

        const getOrCreateContact = async (
          name: string | null | undefined,
          phone: string | null | undefined,
          email: string | null | undefined,
          company?: string | null
        ) => {
          if (!name?.trim()) return null;
          const cacheKey = name.trim().toLowerCase();
          if (contactCache.has(cacheKey)) return contactCache.get(cacheKey)!;
          const parts = name.trim().split(/\s+/);
          const firstName = parts[0] ?? name.trim();
          const lastName = parts.slice(1).join(" ") || "";
          const result = await createContact({
            userId: ctx.user.id,
            firstName,
            lastName,
            email: email?.trim() || undefined,
            phone: phone?.trim() || undefined,
            company: company?.trim() || undefined,
            address: row.ownerAddress?.trim() || undefined,
            isOwner: true,
            isBuyer: false,
            priority: "warm",
          });
          const contactId = result.insertId;
          contactCache.set(cacheKey, contactId);
          contactsInserted++;
          return contactId;
        };

        const contact1Id = await getOrCreateContact(
          row.contact1Name,
          row.contact1Phone,
          row.contact1Email,
          row.ownerName ?? undefined
        );
        const contact2Id = await getOrCreateContact(
          row.contact2Name,
          row.contact2Phone,
          row.contact2Email,
          row.ownerName ?? undefined
        );

        try {
          const propResult = await createProperty({
            userId: ctx.user.id,
            name: propName,
            propertyType,
            address: row.propertyAddress?.trim() || undefined,
            city: row.city?.trim() || undefined,
            state: row.state?.trim() || "ID",
            zip: row.zip?.trim() || undefined,
            unitCount,
            vintageYear,
            lastSalePrice,
            lastSaleDate,
            ownerId: contact1Id ?? undefined,
            ownerName:
              row.ownerName?.trim() ||
              row.contact1Name?.trim() ||
              undefined,
            latitude,
            longitude,
            notes: notesParts.join("\n\n") || undefined,
            importNotes: row.importNotes?.trim() || undefined,
            marketId: (() => {
              // Try explicit market column first, then fall back to city
              const marketKey = row.market?.trim().toLowerCase();
              if (marketKey) {
                const byMarket = marketByName.get(marketKey);
                if (byMarket) return byMarket;
              }
              // Fall back: match city field against market names
              const cityKey = row.city?.trim().toLowerCase();
              if (cityKey) {
                return marketByName.get(cityKey) ?? undefined;
              }
              return undefined;
            })(),
            status: "researching",
          });
          const newPropertyId = propResult.insertId;
          // Create contactPropertyLink for owner contact(s) so the linked contacts
          // section and map both see them immediately
          if (contact1Id && newPropertyId) {
            await createContactPropertyLink({
              userId: ctx.user.id,
              contactId: contact1Id,
              propertyId: newPropertyId,
              dealRole: "owner",
              source: "import",
              label: row.ownerName?.trim() || row.contact1Name?.trim() || undefined,
            }).catch(() => { /* ignore duplicate link errors */ });
          }
          if (contact2Id && newPropertyId) {
            await createContactPropertyLink({
              userId: ctx.user.id,
              contactId: contact2Id,
              propertyId: newPropertyId,
              dealRole: "owner",
              source: "import",
              label: row.contact2Name?.trim() || undefined,
            }).catch(() => { /* ignore duplicate link errors */ });
          }
          propertiesInserted++;
        } catch (e: unknown) {
          errors.push(`${propName}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return { propertiesInserted, contactsInserted, propertiesSkipped, errors };
    }),  // ── Off-Market Interest ───────────────────────────────────────────────────────────────
  updateOffMarketInterest: protectedProcedure
    .input(z.object({
      propertyId:          z.number(),
      offMarketInterest:   z.boolean(),
      offMarketConfidence: z.enum(["casual_mention", "serious_interest", "actively_exploring"]).optional(),
      offMarketTimeline:   z.string().optional(),
      offMarketNotes:      z.string().optional(),
    }))
    .mutation(({ ctx, input }) => {
      const { propertyId, ...data } = input;
      return updateProperty(propertyId, ctx.user.id, data);
    }),

  // ── Sale Records ──────────────────────────────────────────────────────────────────────
  getSaleRecord: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(async ({ ctx, input }) => {
      const record = await getSaleRecord(input.propertyId, ctx.user.id);
      return record ?? null;
    }),

  upsertSaleRecord: protectedProcedure
    .input(z.object({
      propertyId:   z.number(),
      listingId:    z.number().optional(),
      closingDate:  z.date().optional(),
      closingPrice: z.number().optional(),
      pricePerUnit: z.number().optional(),
      capRate:      z.number().optional(),
      processNote:  z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      upsertSaleRecord({ ...input, userId: ctx.user.id })
    ),

  // ── Unsolicited Offers ────────────────────────────────────────────────────────
  createOffer: protectedProcedure
    .input(z.object({
      propertyId:     z.number(),
      amount:         z.number().optional(),
      buyerContactId: z.number().optional(),
      receivedAt:     z.date().optional(),
      notes:          z.string().optional(),
    }))
    .mutation(({ ctx, input }) =>
      createUnsolicitedOffer({
        ...input,
        userId: ctx.user.id,
        receivedAt: input.receivedAt ?? new Date(),
      })
    ),

  offers: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .query(({ ctx, input }) => getUnsolicitedOffers(input.propertyId, ctx.user.id)),

  deleteOffer: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteUnsolicitedOffer(input.id, ctx.user.id)),

  recentOfferActivity: protectedProcedure
    .input(z.object({ days: z.number().optional() }))
    .query(({ ctx, input }) => getRecentUnsolicitedOfferProperties(ctx.user.id, input.days ?? 30)),

  // ── AI-driven Property Notes Refresh ─────────────────────────────────────────
  refreshNotes: protectedProcedure
    .input(z.object({ propertyId: z.number(), context: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { getActivities, getUnsolicitedOffers, getDealNarrative } = await import("../db");
      const prop = await getPropertyById(input.propertyId, ctx.user.id);
      if (!prop) throw new TRPCError({ code: "NOT_FOUND" });

      const [recentActivities, offers, narrative] = await Promise.all([
        getActivities(ctx.user.id, { propertyId: input.propertyId, limit: 10 }),
        getUnsolicitedOffers(input.propertyId, ctx.user.id),
        getDealNarrative(ctx.user.id, input.propertyId),
      ]);

      const activitySummary = recentActivities.length
        ? recentActivities.map(a => `[${a.type}] ${a.subject ?? ""}: ${(a.notes ?? "").slice(0, 200)}`).join("\n")
        : "No recent activities.";

      const offerSummary = offers.length
        ? offers.map(o => `Offer: $${o.amount?.toLocaleString() ?? "unknown"} from ${o.buyerName ?? "unknown buyer"} on ${new Date(o.receivedAt).toLocaleDateString()}`).join("\n")
        : "No unsolicited offers.";

      const narrativeBlock = narrative
        ? `\nDEAL NARRATIVE (AI-maintained summary):\n${narrative.summary}\nSeller Motivation: ${narrative.sellerMotivation ?? "Unknown"}\nPricing: ${narrative.pricingStatus ?? "Unknown"}\nBlockers: ${narrative.blockers ?? "Unknown"}\nNext Steps: ${narrative.nextSteps ?? "Unknown"}\n`
        : "";

      const prompt = `You are a commercial real estate CRM assistant. Write a concise 2-3 sentence paragraph describing this property's deal context and situation. Focus on the owner, deal status, any interest or offers, and anything actionable. Do NOT describe physical specs — only the deal story and relationship context.

Property: ${prop.name}
Address: ${[prop.address, prop.city, prop.state].filter(Boolean).join(", ")}
Owner: ${prop.ownerName ?? "Unknown"}
Status: ${prop.status}
Off-market interest: ${prop.offMarketInterest ? `Yes (${prop.offMarketConfidence?.replace("_", " ") ?? ""}, timeline: ${prop.offMarketTimeline ?? "unknown"})` : "No"}
Off-market notes: ${prop.offMarketNotes ?? "None"}
Current notes: ${prop.notes ?? "None"}
${narrativeBlock}
Recent activities:\n${activitySummary}
Unsolicited offers:\n${offerSummary}
${input.context ? `\nNew context: ${input.context}` : ""}

Write only the paragraph. No labels, no headers.`;

      const response = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const newNotes = (response as { choices: Array<{ message: { content: string } }> }).choices[0]?.message?.content?.trim() ?? "";

      // Note: importNotes is intentionally not touched here.
      // importNotes is a permanent record of original research data from CSV/Excel imports
      // and must never be overwritten by AI-generated content.
      await updateProperty(input.propertyId, ctx.user.id, {
        notes: newNotes,
        notesUpdatedAt: Date.now(),
      });

      return { notes: newNotes };
    }),

  // ── Call Prep (formerly Web Intelligence) ────────────────────────────────────
  // Four data layers:
  //   1. CRM relationship: recent activities, off-market signals, notes
  //   2. Nearby CRM activity: other properties/listings in same city, matching buyers, recent comps
  //   3. Targeted web searches: market trends, local development, owner profile
  //   4. One synthesized talking point
  webIntelligence: protectedProcedure
    .input(z.object({ propertyId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { getDealNarrative: getDealNarrativeDb } = await import("../db");
      const prop = await getPropertyById(input.propertyId, ctx.user.id);
      if (!prop) throw new TRPCError({ code: "NOT_FOUND" });

      const address = [prop.address, prop.city, prop.state, prop.zip].filter(Boolean).join(", ");
      const ownerName = prop.ownerName ?? "";
      const city = prop.city ?? "";
      const propertyType = prop.propertyType;

      // Fetch deal narrative for call prep context
      const callPrepNarrative = await getDealNarrativeDb(ctx.user.id, input.propertyId);

      // ── Layer 1: CRM relationship ─────────────────────────────────────────────
      const recentActivities = await getActivities(ctx.user.id, { propertyId: input.propertyId, limit: 5 });
      const activitySummary = recentActivities.length
        ? recentActivities.map(a => `[${new Date(a.occurredAt ?? a.createdAt).toLocaleDateString()}] ${a.type}: ${a.subject ?? ""} — ${(a.notes ?? "").slice(0, 150)}`).join("\n")
        : "No recorded activities with this property.";

      const offMarketSignal = prop.offMarketInterest
        ? `Owner has shown off-market interest (${prop.offMarketConfidence?.replace("_", " ") ?? "unknown confidence"}, timeline: ${prop.offMarketTimeline ?? "unknown"}).`
        : "No off-market interest recorded.";

      const lastContacted = prop.lastContactedAt
        ? `Last contacted: ${new Date(prop.lastContactedAt).toLocaleDateString()}`
        : "Never contacted.";

      // ── Layer 2: Nearby CRM activity ──────────────────────────────────────────
      // 2a. Other properties in same city
      const nearbyProps = city
        ? (await getProperties(ctx.user.id, { city, limit: 10 })).filter(p => p.id !== input.propertyId)
        : [];
      const nearbyPropsSummary = nearbyProps.length
        ? nearbyProps.map(p => `${p.name} (${p.unitCount ?? "?"} units, ${p.status})`).join("; ")
        : "No other properties in this city.";

      // 2b. Active listings in same city
      const { getListings } = await import("../db");
      const allListings = await getListings(ctx.user.id, { status: "active" });
      const nearbyListings = allListings.filter(l => {
        const lCity = (l.propertyName ?? "").toLowerCase();
        return city && (lCity.includes(city.toLowerCase()) || (l as { city?: string }).city?.toLowerCase() === city.toLowerCase());
      });
      // Also match via property join — get property cities for listings
      const listingPropertyIds = allListings.map(l => l.propertyId).filter(Boolean) as number[];
      const listingPropsInCity = listingPropertyIds.length
        ? (await getProperties(ctx.user.id, { city, limit: 20 })).filter(p => listingPropertyIds.includes(p.id))
        : [];
      const nearbyListingNames = listingPropsInCity.length
        ? listingPropsInCity.map(p => {
            const listing = allListings.find(l => l.propertyId === p.id);
            return `${listing?.title ?? p.name} at ${p.address ?? "unknown address"} (asking: ${listing?.askingPrice ? `$${(listing.askingPrice / 1000).toFixed(0)}K` : "TBD"})`;
          }).join("; ")
        : "No active listings in this city.";

      // 2c. Buyers with matching criteria
      const db = await getDb();
      let matchingBuyersSummary = "No matching buyers in CRM.";
      if (db) {
        const { buyerCriteria: bcTable, contacts: ctTable } = await import("../../drizzle/schema");
        const { eq: deq, and: dand, or: dor, lte: dlte, gte: dgte, sql: dsql } = await import("drizzle-orm");
        // Find buyer criteria that could match this property
        const allCriteria = await db
          .select({ bc: bcTable, contact: ctTable })
          .from(bcTable)
          .innerJoin(ctTable, deq(bcTable.contactId, ctTable.id))
          .where(deq(bcTable.userId, ctx.user.id));

        const matchingBuyers = allCriteria.filter(({ bc }) => {
          // Check property type match
          if (bc.propertyTypes) {
            try {
              const types = JSON.parse(bc.propertyTypes) as string[];
              if (types.length > 0 && !types.includes(propertyType)) return false;
            } catch { /* ignore parse errors */ }
          }
          // Check unit count range
          if (prop.unitCount !== null && prop.unitCount !== undefined) {
            if (bc.minUnits !== null && bc.minUnits !== undefined && prop.unitCount < bc.minUnits) return false;
            if (bc.maxUnits !== null && bc.maxUnits !== undefined && prop.unitCount > bc.maxUnits) return false;
          }
          // Check city/market match
          if (bc.markets && city) {
            try {
              const markets = JSON.parse(bc.markets) as string[];
              if (markets.length > 0 && !markets.some(m => m.toLowerCase().includes(city.toLowerCase()) || city.toLowerCase().includes(m.toLowerCase()))) return false;
            } catch { /* ignore */ }
          }
          return true;
        });

        if (matchingBuyers.length > 0) {
          matchingBuyersSummary = matchingBuyers
            .slice(0, 3)
            .map(({ bc, contact }) => {
              const types = bc.propertyTypes ? (() => { try { return (JSON.parse(bc.propertyTypes) as string[]).join("/"); } catch { return ""; } })() : "any type";
              const units = bc.minUnits || bc.maxUnits ? `${bc.minUnits ?? 0}–${bc.maxUnits ?? "∞"} units` : "any size";
              return `${contact.firstName} ${contact.lastName ?? ""} (${contact.company ?? "buyer"}) — looking for ${types}, ${units}`;
            })
            .join("; ");
          if (matchingBuyers.length > 3) matchingBuyersSummary += ` (+${matchingBuyers.length - 3} more)`;
        }
      }

      // 2d. Recent comps: properties with status recently_sold or saleRecords in same city
      let recentCompsSummary = "No recent comps in CRM for this city.";
      if (city && db) {
        const soldProps = await getProperties(ctx.user.id, { city, status: "recently_sold", limit: 5 });
        // Also check saleRecords joined to properties in same city
        const { saleRecords: srTable } = await import("../../drizzle/schema");
        const { eq: deq, and: dand } = await import("drizzle-orm");
        const { properties: propsTable } = await import("../../drizzle/schema");
        const recentSales = await db
          .select({
            propertyName: propsTable.name,
            address: propsTable.address,
            unitCount: propsTable.unitCount,
            closingPrice: srTable.closingPrice,
            pricePerUnit: srTable.pricePerUnit,
            capRate: srTable.capRate,
            closingDate: srTable.closingDate,
          })
          .from(srTable)
          .innerJoin(propsTable, deq(srTable.propertyId, propsTable.id))
          .where(dand(deq(propsTable.userId, ctx.user.id), deq(propsTable.city, city)))
          .orderBy(srTable.closingDate)
          .limit(3);

        const compLines: string[] = [];
        for (const s of recentSales) {
          const ppu = s.pricePerUnit ? `$${s.pricePerUnit.toLocaleString()}/door` : "";
          const cap = s.capRate ? `${s.capRate}% cap` : "";
          const date = s.closingDate ? new Date(s.closingDate).toLocaleDateString() : "";
          compLines.push(`${s.propertyName} (${s.unitCount ?? "?"} units) closed at ${s.closingPrice ? `$${(s.closingPrice / 1000000).toFixed(2)}M` : "undisclosed"} ${[ppu, cap, date].filter(Boolean).join(", ")}`);
        }
        for (const p of soldProps) {
          if (!recentSales.find(s => s.propertyName === p.name)) {
            compLines.push(`${p.name} — recently sold (no price recorded)`);
          }
        }
        if (compLines.length > 0) recentCompsSummary = compLines.join("; ");
      }

      // ── Layer 3: Market Intel KB (with web search fallback) ──────────────────
      let searchResults = "";
      let hasKbIntel = false;
      try {
        // 3a. Try market intel knowledge base first
        const { marketIntel: miTable, markets: mTable } = await import("../../drizzle/schema");
        const { toMarketSlug, getMarketParentChain } = await import("./markets");
        const { inArray } = await import("drizzle-orm");
        const db3 = await getDb();
        if (db3) {
          // Prefer explicit marketId assignment; fall back to city slug match
          let resolvedMarketId: number | null = prop.marketId ?? null;
          if (!resolvedMarketId && city) {
            const citySlug = toMarketSlug(city);
            const cityMarket = await db3
              .select()
              .from(mTable)
              .where(eq(mTable.userId, ctx.user.id) && eq(mTable.slug, citySlug) as any)
              .limit(1);
            if (cityMarket[0]) resolvedMarketId = cityMarket[0].id;
          }
          if (resolvedMarketId) {
            const marketIds = await getMarketParentChain(resolvedMarketId, ctx.user.id);
            if (marketIds.length > 0) {
              const intel = await db3
                .select({
                  content: miTable.content,
                  source: miTable.source,
                  createdAt: miTable.createdAt,
                  marketName: mTable.name,
                  marketSlug: mTable.slug,
                  marketId: miTable.marketId,
                })
                .from(miTable)
                .leftJoin(mTable, eq(miTable.marketId, mTable.id))
                .where(eq(miTable.userId, ctx.user.id) as any)
                .orderBy(desc(miTable.createdAt));
              const filtered = intel.filter(i => i.marketId != null && marketIds.includes(i.marketId));
              if (filtered.length > 0) {
                hasKbIntel = true;
                const depthMap: Record<number, number> = {};
                marketIds.forEach((id, idx) => { depthMap[id] = idx; });
                const local = filtered.filter(i => i.marketId != null && depthMap[i.marketId] === 0);
                const regional = filtered.filter(i => i.marketId != null && depthMap[i.marketId] === 1);
                const stateLevel = filtered.filter(i => i.marketId != null && depthMap[i.marketId] >= 2 && depthMap[i.marketId] < marketIds.length - 1);
                const macroLevel = filtered.filter(i => i.marketId != null && depthMap[i.marketId] === marketIds.length - 1);
                const fmt = (entries: typeof filtered) =>
                  entries.map(i => `[${i.marketName}, ${i.source || "note"}, ${new Date(i.createdAt).toLocaleDateString()}] ${i.content}`).join("\n\n");
                const parts: string[] = [];
                if (local.length)      parts.push(`LOCAL (${city}):\n${fmt(local)}`);
                if (regional.length)   parts.push(`REGIONAL:\n${fmt(regional)}`);
                if (stateLevel.length) parts.push(`STATE:\n${fmt(stateLevel)}`);
                if (macroLevel.length) parts.push(`MACRO / NATIONAL:\n${fmt(macroLevel)}`);
                searchResults = parts.join("\n\n");
              }
            }
          }
        }
      } catch { /* KB lookup failed — fall through to web search */ }

      // 3b. Web search fallback (only if no KB intel found)
      if (!hasKbIntel) {
        try {
          const ptLabel = propertyType === "mhc" ? "mobile home park" : propertyType === "self_storage" ? "self storage" : propertyType === "apartment" ? "apartment" : propertyType;
          const state = prop.state ?? "";
          const cityState = [city, state].filter(Boolean).join(" ");
          const queries = [
            cityState ? `${cityState} ${ptLabel} vacancy and rent trends` : null,
            city ? `${city} ${state} new employer and employer expansion 2025` : null,
            city ? `${city} ${state} city development plan growth infrastructure` : null,
          ].filter(Boolean) as string[];
          const results = await Promise.allSettled(
            queries.map(q =>
              (callDataApi("Google/search", { query: { q, num: 3 } }) as Promise<{ organic_results?: Array<{ title: string; snippet: string }> }>)
                .then(r => r?.organic_results?.map(x => `${x.title}: ${x.snippet}`).join("\n") ?? "")
                .catch(() => "")
            )
          );
          searchResults = results
            .map((r, i) => {
              const labels = ["Rent & Vacancy Trends", "New Employers & Expansions", "City Development Plans"];
              return r.status === "fulfilled" && r.value ? `[${labels[i]}]\n${r.value}` : "";
            })
            .filter(Boolean)
            .join("\n\n");
        } catch {
          searchResults = "Web search unavailable.";
        }
      }

      // ── Layer 4: LLM synthesizes everything into a Call Prep brief ────────────
      const prompt = `You are a commercial real estate broker's assistant. Generate a pre-call brief for a broker about to call the owner of this property. Be specific, concise, and actionable. Return a JSON object with exactly these keys:

{
  "relationship": "...",
  "nearbyActivity": "...",
  "marketIntel": "...",
  "talkingPoint": "..."
}

Guidelines:
- "relationship": 2-3 sentences summarizing the broker's history with this owner/property. Mention last contact date, any off-market signals, and key notes.
- "nearbyActivity": 2-3 sentences about the broker's own CRM activity in this market — other properties they own nearby, active listings, matching buyers, and recent comps they know. This is what makes the broker sound like a local expert.
- "marketIntel": 2-3 sentences of genuine local market context from web searches — rent trends, new development, employers, infrastructure. Only include if real data was found; otherwise say "No recent market news found."
- "talkingPoint": ONE sentence the broker could literally say on the call to open the conversation. Make it specific, not generic. Use the strongest piece of intel from any layer.

Property: ${prop.name}
Address: ${address}
Owner: ${ownerName || "Unknown"}
Unit Count: ${prop.unitCount ?? "Unknown"}
Property Type: ${propertyType}
Status: ${prop.status}

=== LAYER 1: CRM RELATIONSHIP ===
${lastContacted}
${offMarketSignal}
Recent activities:
${activitySummary}
CRM notes: ${(prop.notes ?? "None").slice(0, 300)}
Import notes: ${(prop.importNotes ?? "None").slice(0, 300)}
${callPrepNarrative ? `\nDEAL NARRATIVE (AI-maintained deal summary):\n${callPrepNarrative.summary}\nSeller Motivation: ${callPrepNarrative.sellerMotivation ?? "Unknown"}\nNext Steps: ${callPrepNarrative.nextSteps ?? "Unknown"}\nBlockers: ${callPrepNarrative.blockers ?? "Unknown"}\n` : ""}

=== LAYER 2: NEARBY CRM ACTIVITY ===
Other properties in ${city || "same city"}: ${nearbyPropsSummary}
Active listings in ${city || "same city"}: ${nearbyListingNames}
Matching buyers: ${matchingBuyersSummary}
Recent comps: ${recentCompsSummary}

=== LAYER 3: MARKET INTEL (${hasKbIntel ? "from your knowledge base" : "web search fallback"}) ===
${searchResults || "No market intel available."}

Return only the JSON object. No markdown, no extra text.`;

      const response = await invokeLLM({ messages: [{ role: "user", content: prompt }] });
      const content = (response as { choices: Array<{ message: { content: string } }> }).choices[0]?.message?.content?.trim() ?? "{}";

      let parsed: Record<string, string> = {};
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        parsed = JSON.parse(jsonMatch?.[0] ?? "{}");
      } catch {
        parsed = { relationship: content };
      }

      const webIntelligenceStr = JSON.stringify(parsed);
      await updateProperty(input.propertyId, ctx.user.id, {
        webIntelligence: webIntelligenceStr,
        webIntelligenceUpdatedAt: Date.now(),
      });

      return { sections: parsed, updatedAt: Date.now() };
    }),
});
