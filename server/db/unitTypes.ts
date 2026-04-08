import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { unitTypes, InsertUnitType, UnitType } from "../../drizzle/schema";
import { getDb } from "./connection";

export async function getUnitTypesByProperty(propertyId: number): Promise<UnitType[]> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  return db
    .select()
    .from(unitTypes)
    .where(eq(unitTypes.propertyId, propertyId))
    .orderBy(asc(unitTypes.bedCount), asc(unitTypes.label));
}

export async function upsertUnitType(data: InsertUnitType): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  const existing = await db
    .select({ id: unitTypes.id })
    .from(unitTypes)
    .where(
      and(
        eq(unitTypes.propertyId, data.propertyId),
        eq(unitTypes.userId, data.userId),
        eq(unitTypes.label, data.label),
        eq(unitTypes.renovationTier, data.renovationTier ?? "classic"),
      )
    )
    .limit(1);
  if (existing.length > 0) {
    await db.update(unitTypes).set(data).where(eq(unitTypes.id, existing[0].id));
  } else {
    await db.insert(unitTypes).values(data);
  }
}

export async function bulkUpsertUnitTypes(
  propertyId: number,
  userId: number,
  units: InsertUnitType[]
): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");

  // Upsert each unit
  const keptIds: number[] = [];
  for (const unit of units) {
    const existing = await db
      .select({ id: unitTypes.id })
      .from(unitTypes)
      .where(
        and(
          eq(unitTypes.propertyId, propertyId),
          eq(unitTypes.userId, userId),
          eq(unitTypes.label, unit.label),
          eq(unitTypes.renovationTier, unit.renovationTier ?? "classic"),
        )
      )
      .limit(1);
    if (existing.length > 0) {
      await db.update(unitTypes).set(unit).where(eq(unitTypes.id, existing[0].id));
      keptIds.push(existing[0].id);
    } else {
      const result = await db.insert(unitTypes).values({ ...unit, propertyId, userId });
      keptIds.push(Number(result[0].insertId));
    }
  }

  // Delete unit types not in the new array
  const allExisting = await db
    .select({ id: unitTypes.id })
    .from(unitTypes)
    .where(and(eq(unitTypes.propertyId, propertyId), eq(unitTypes.userId, userId)));

  const toDelete = allExisting.filter((r) => !keptIds.includes(r.id)).map((r) => r.id);
  if (toDelete.length > 0) {
    await db.delete(unitTypes).where(inArray(unitTypes.id, toDelete));
  }
}

export async function deleteUnitType(id: number): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("DB unavailable");
  await db.delete(unitTypes).where(eq(unitTypes.id, id));
}
