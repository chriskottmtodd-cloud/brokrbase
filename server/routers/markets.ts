import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { markets, marketIntel } from "../../drizzle/schema";

export function toMarketSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

export async function getMarketParentChain(marketId: number, userId: number): Promise<number[]> {
  const db = await getDb();
  if (!db) return [];
  const ids: number[] = [];
  let currentId: number | null = marketId;
  const visited = new Set<number>();
  while (currentId != null) {
    if (visited.has(currentId)) break;
    visited.add(currentId);
    const rows = await db.select().from(markets).where(and(eq(markets.id, currentId), eq(markets.userId, userId))).limit(1);
    if (!rows[0]) break;
    ids.push(rows[0].id);
    currentId = rows[0].parentId ?? null;
  }
  return ids;
}

const DEFAULT_MARKETS = [
  { name: "Macro",          parent: null },
  { name: "Idaho",          parent: "macro" },
  { name: "Treasure Valley", parent: "idaho" },
  { name: "Boise",          parent: "treasure_valley" },
  { name: "Meridian",       parent: "treasure_valley" },
  { name: "Nampa",          parent: "treasure_valley" },
  { name: "Caldwell",       parent: "treasure_valley" },
  { name: "Eagle",          parent: "treasure_valley" },
  { name: "Garden City",    parent: "treasure_valley" },
  { name: "Southern Idaho", parent: "idaho" },
  { name: "Twin Falls",     parent: "southern_idaho" },
  { name: "Eastern Idaho",  parent: "idaho" },
  { name: "Idaho Falls",    parent: "eastern_idaho" },
  { name: "Pocatello",      parent: "eastern_idaho" },
  { name: "Northern Idaho", parent: "idaho" },
  { name: "Coeur dAlene",   parent: "northern_idaho" },
  { name: "Lewiston",       parent: "northern_idaho" },
  { name: "Montana",        parent: "macro" },
  { name: "Billings",       parent: "montana" },
  { name: "Missoula",       parent: "montana" },
  { name: "Bozeman",        parent: "montana" },
  { name: "Helena",         parent: "montana" },
  { name: "Great Falls",    parent: "montana" },
];

export const marketsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const all = await db
      .select()
      .from(markets)
      .where(eq(markets.userId, ctx.user.id))
      .orderBy(asc(markets.id));
    const byId = Object.fromEntries(all.map(m => [m.id, m]));
    return all.map(m => ({
      ...m,
      parentName: m.parentId ? (byId[m.parentId]?.name ?? null) : null,
    }));
  }),

  tree: protectedProcedure.query(async ({ ctx }) => {
    const db = await getDb();
    if (!db) return [];
    const all = await db
      .select()
      .from(markets)
      .where(eq(markets.userId, ctx.user.id))
      .orderBy(asc(markets.id));

    type TreeNode = (typeof all)[0] & { children: TreeNode[] };
    const nodeMap: Record<number, TreeNode> = {};
    for (const m of all) nodeMap[m.id] = { ...m, children: [] };
    const roots: TreeNode[] = [];
    for (const m of all) {
      if (m.parentId && nodeMap[m.parentId]) {
        nodeMap[m.parentId].children.push(nodeMap[m.id]);
      } else {
        roots.push(nodeMap[m.id]);
      }
    }
    return roots;
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      parentId: z.number().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const slug = toMarketSlug(input.name);
      const result = await db.insert(markets).values({
        userId: ctx.user.id,
        name: input.name,
        slug,
        parentId: input.parentId ?? null,
      });
      return { slug, insertId: (result as any).insertId };
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      name: z.string().optional(),
      parentId: z.number().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, name, parentId } = input;
      const updates: Record<string, unknown> = {};
      if (name !== undefined) {
        updates.name = name;
        updates.slug = toMarketSlug(name);
      }
      if (parentId !== undefined) updates.parentId = parentId;
      await db.update(markets).set(updates).where(and(eq(markets.id, id), eq(markets.userId, ctx.user.id)));
      return { success: true };
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const children = await db.select().from(markets).where(and(eq(markets.parentId, input.id), eq(markets.userId, ctx.user.id)));
      if (children.length > 0) throw new Error("Cannot delete a market that has child markets.");
      const intel = await db.select().from(marketIntel).where(and(eq(marketIntel.marketId, input.id), eq(marketIntel.userId, ctx.user.id)));
      if (intel.length > 0) throw new Error("Cannot delete a market that has intel entries. Delete the intel first.");
      await db.delete(markets).where(and(eq(markets.id, input.id), eq(markets.userId, ctx.user.id)));
      return { success: true };
    }),

  seedDefaults: protectedProcedure.mutation(async ({ ctx }) => {
    const db = await getDb();
    if (!db) throw new Error("DB unavailable");
    const existing = await db.select().from(markets).where(eq(markets.userId, ctx.user.id)).limit(1);
    if (existing.length > 0) return { skipped: true };

    const slugToId: Record<string, number> = {};
    for (const m of DEFAULT_MARKETS) {
      const slug = toMarketSlug(m.name);
      const parentId = m.parent ? (slugToId[m.parent] ?? null) : null;
      const result = await db.insert(markets).values({
        userId: ctx.user.id,
        name: m.name,
        slug,
        parentId,
      });
      slugToId[slug] = (result as any).insertId as number;
    }
    return { seeded: DEFAULT_MARKETS.length };
  }),

  getParentChain: protectedProcedure
    .input(z.object({ marketId: z.number() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const ids = await getMarketParentChain(input.marketId, ctx.user.id);
      const rows = await Promise.all(
        ids.map(id => db.select().from(markets).where(eq(markets.id, id)).limit(1).then(r => r[0]))
      );
      return rows.filter(Boolean).map(m => m!.name);
    }),

  matchCity: protectedProcedure
    .input(z.object({ city: z.string() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { market: null, parentIds: [] };
      const slug = toMarketSlug(input.city);
      const match = await db
        .select()
        .from(markets)
        .where(and(eq(markets.userId, ctx.user.id), eq(markets.slug, slug)))
        .limit(1);
      if (!match[0]) return { market: null, parentIds: [] };
      const parentIds = await getMarketParentChain(match[0].id, ctx.user.id);
      return { market: match[0], parentIds };
    }),
});
