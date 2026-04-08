import { z } from "zod";
import { eq, and, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { listingKnowledge, listingChatMessages } from "../../drizzle/schema";

// ─── Knowledge sub-router ─────────────────────────────────────────────────────
const knowledgeRouter = router({
  list: protectedProcedure
    .input(z.object({ listingId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(listingKnowledge)
        .where(
          and(
            eq(listingKnowledge.userId, ctx.user.id),
            eq(listingKnowledge.listingId, input.listingId),
          ),
        )
        .orderBy(asc(listingKnowledge.createdAt));
    }),

  add: protectedProcedure
    .input(
      z.object({
        listingId: z.number().int().positive(),
        title:     z.string().min(1).max(200),
        content:   z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [result] = await db.insert(listingKnowledge).values({
        userId:    ctx.user.id,
        listingId: input.listingId,
        title:     input.title,
        content:   input.content,
      });
      const insertId = (result as { insertId: number }).insertId;
      const [row] = await db
        .select()
        .from(listingKnowledge)
        .where(eq(listingKnowledge.id, insertId));
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Insert failed" });
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [row] = await db
        .select()
        .from(listingKnowledge)
        .where(eq(listingKnowledge.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Entry not found" });
      if (row.userId !== ctx.user.id) throw new TRPCError({ code: "FORBIDDEN", message: "Not your entry" });
      await db.delete(listingKnowledge).where(eq(listingKnowledge.id, input.id));
      return { success: true };
    }),
});

// ─── Chat sub-router ──────────────────────────────────────────────────────────
const chatRouter = router({
  history: protectedProcedure
    .input(z.object({ listingId: z.number().int().positive() }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      return db
        .select()
        .from(listingChatMessages)
        .where(
          and(
            eq(listingChatMessages.userId, ctx.user.id),
            eq(listingChatMessages.listingId, input.listingId),
          ),
        )
        .orderBy(asc(listingChatMessages.createdAt));
    }),

  saveMessage: protectedProcedure
    .input(
      z.object({
        listingId: z.number().int().positive(),
        role:      z.enum(["user", "assistant"]),
        content:   z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const [result] = await db.insert(listingChatMessages).values({
        userId:    ctx.user.id,
        listingId: input.listingId,
        role:      input.role,
        content:   input.content,
      });
      const insertId = (result as { insertId: number }).insertId;
      const [row] = await db
        .select()
        .from(listingChatMessages)
        .where(eq(listingChatMessages.id, insertId));
      if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Insert failed" });
      return row;
    }),
});

// ─── Combined router ──────────────────────────────────────────────────────────
export const listingAgentRouter = router({
  knowledge: knowledgeRouter,
  chat:      chatRouter,
});
