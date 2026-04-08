import { z } from "zod";
import { eq, and, desc, inArray } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { marketIntel, markets } from "../../drizzle/schema";
import { invokeLLM } from "../_core/llm";
import { toMarketSlug, getMarketParentChain } from "./markets";

// ─── AI Extraction (background, non-blocking) ────────────────────────────────
async function extractAndSaveFacts(intelId: number, content: string): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;
    const response = await invokeLLM({
      messages: [
        {
          role: "user",
          content: `Extract key market facts from this text. Return JSON with any of these fields that are mentioned (omit fields not found):

{
  "vacancy": { "rate": number, "class": "A/B/C/all", "trend": "up/down/flat", "asOf": "Q1 2026" },
  "rent": { "average": number, "changePct": number, "trend": "up/down/flat" },
  "capRate": { "rate": number, "trend": "up/down/flat" },
  "construction": { "units": number, "description": "string" },
  "employment": { "description": "string" },
  "development": { "description": "string" },
  "interestRates": { "description": "string" },
  "treasuryYield": { "rate": number },
  "buyerSentiment": { "description": "string" },
  "sellerSentiment": { "description": "string" },
  "keyFacts": ["array of other important points"]
}

Text to analyze:
${content}

Return only valid JSON.`,
        },
      ],
      response_format: { type: "json_object" } as any,
    });
    const raw = (response as any)?.choices?.[0]?.message?.content ?? "{}";
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { parsed = {}; }
    await db
      .update(marketIntel)
      .set({ extractedFacts: JSON.stringify(parsed) })
      .where(eq(marketIntel.id, intelId));
  } catch {
    // Background task — swallow errors silently
  }
}

export const marketIntelRouter = router({
  list: protectedProcedure
    .input(z.object({ marketId: z.number().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [eq(marketIntel.userId, ctx.user.id)];
      if (input?.marketId) conditions.push(eq(marketIntel.marketId, input.marketId));
      const rows = await db
        .select({
          id: marketIntel.id,
          userId: marketIntel.userId,
          marketId: marketIntel.marketId,
          content: marketIntel.content,
          source: marketIntel.source,
          extractedFacts: marketIntel.extractedFacts,
          createdAt: marketIntel.createdAt,
          updatedAt: marketIntel.updatedAt,
          marketName: markets.name,
          marketSlug: markets.slug,
        })
        .from(marketIntel)
        .leftJoin(markets, eq(marketIntel.marketId, markets.id))
        .where(and(...conditions))
        .orderBy(desc(marketIntel.createdAt));
      return rows;
    }),

  getForProperty: protectedProcedure
    .input(z.object({ city: z.string(), state: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { local: [], regional: [], state: [], macro: [] };

      const citySlug = toMarketSlug(input.city);

      // Find the city market
      const cityMarket = await db
        .select()
        .from(markets)
        .where(and(eq(markets.userId, ctx.user.id), eq(markets.slug, citySlug)))
        .limit(1);

      if (!cityMarket[0]) return { local: [], regional: [], state: [], macro: [] };

      // Get full parent chain (includes city itself)
      const marketIds = await getMarketParentChain(cityMarket[0].id, ctx.user.id);
      if (marketIds.length === 0) return { local: [], regional: [], state: [], macro: [] };

      // Pull all intel for these markets
      const intel = await db
        .select({
          id: marketIntel.id,
          content: marketIntel.content,
          source: marketIntel.source,
          extractedFacts: marketIntel.extractedFacts,
          createdAt: marketIntel.createdAt,
          marketId: marketIntel.marketId,
          marketName: markets.name,
          marketSlug: markets.slug,
          parentId: markets.parentId,
        })
        .from(marketIntel)
        .leftJoin(markets, eq(marketIntel.marketId, markets.id))
        .where(and(eq(marketIntel.userId, ctx.user.id), inArray(marketIntel.marketId, marketIds)))
        .orderBy(desc(marketIntel.createdAt));

      // Determine depth of each market in the chain
      // marketIds[0] = city (most specific), last = top-level (Macro)
      const depthMap: Record<number, number> = {};
      marketIds.forEach((id, idx) => { depthMap[id] = idx; });

      const local: typeof intel = [];
      const regional: typeof intel = [];
      const stateLevel: typeof intel = [];
      const macro: typeof intel = [];

      for (const entry of intel) {
        if (!entry.marketId) continue;
        const depth = depthMap[entry.marketId] ?? 99;
        if (depth === 0) local.push(entry);
        else if (depth === 1 || depth === 2) regional.push(entry);
        else if (depth === marketIds.length - 2) stateLevel.push(entry);
        else macro.push(entry);
      }

      return { local, regional, state: stateLevel, macro };
    }),

  getForPropertyById: protectedProcedure
    .input(z.object({ marketId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { entries: [], marketName: null };

      // Get full parent chain
      const marketIds = await getMarketParentChain(input.marketId, ctx.user.id);
      if (marketIds.length === 0) return { entries: [], marketName: null };

      // Get the assigned market name
      const assignedMarket = await db
        .select({ name: markets.name })
        .from(markets)
        .where(and(eq(markets.id, input.marketId), eq(markets.userId, ctx.user.id)))
        .limit(1);

      // Pull all intel for these markets
      const intel = await db
        .select({
          id: marketIntel.id,
          content: marketIntel.content,
          source: marketIntel.source,
          extractedFacts: marketIntel.extractedFacts,
          createdAt: marketIntel.createdAt,
          marketId: marketIntel.marketId,
          marketName: markets.name,
        })
        .from(marketIntel)
        .leftJoin(markets, eq(marketIntel.marketId, markets.id))
        .where(and(eq(marketIntel.userId, ctx.user.id), inArray(marketIntel.marketId, marketIds)))
        .orderBy(desc(marketIntel.createdAt));

      return {
        entries: intel,
        marketName: assignedMarket[0]?.name ?? null,
      };
    }),

  create: protectedProcedure
    .input(z.object({
      marketId: z.number(),
      content: z.string().min(1),
      source: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const result = await db.insert(marketIntel).values({
        userId: ctx.user.id,
        marketId: input.marketId,
        content: input.content,
        source: input.source ?? null,
      });
      const insertId = (result as any).insertId as number;
      // Fire-and-forget AI extraction
      extractAndSaveFacts(insertId, input.content);
      return { insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      marketId: z.number().optional(),
      content: z.string().optional(),
      source: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, content, marketId, source } = input;
      const updates: Record<string, unknown> = {};
      if (content !== undefined) updates.content = content;
      if (marketId !== undefined) updates.marketId = marketId;
      if (source !== undefined) updates.source = source;
      await db.update(marketIntel).set(updates).where(and(eq(marketIntel.id, id), eq(marketIntel.userId, ctx.user.id)));
      // Re-run extraction if content changed
      if (content) extractAndSaveFacts(id, content);
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(marketIntel).where(and(eq(marketIntel.id, input.id), eq(marketIntel.userId, ctx.user.id)));
      return { success: true };
    }),
});
