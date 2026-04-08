import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { createTask, updateProperty, updateTask } from "../db";
import { invokeLLM } from "../_core/llm";
import { protectedProcedure, router } from "../_core/trpc";
import { nextWeekday } from "@shared/utils";

// ─── aiRouter (placeholder, intentionally minimal in v1) ────────────────────
// Brokrbase v1 keeps the AI router slim. Voice memo lives in its own router,
// and Email Studio uses callIntel.invokeLlm directly. Other AI features
// (deal matching, pricing, outreach, deal narratives) are deferred.
export const aiRouter = router({});

// ─── callIntelRouter ────────────────────────────────────────────────────────
// Two procedures only:
//   - invokeLlm: a thin server-side proxy so the client can run prompts
//     without exposing the API key. Used by Email Studio.
//   - applyCallActions: applies the structured changes the user approved
//     from a voice memo review (creates tasks, updates properties).
export const callIntelRouter = router({
  invokeLlm: protectedProcedure
    .input(
      z.object({
        prompt: z.string().min(1),
        maxTokens: z.number().optional(),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        const response = await invokeLLM({
          messages: [{ role: "user", content: input.prompt }],
        });
        const text =
          (response as { choices: Array<{ message: { content: string } }> })
            .choices[0]?.message?.content ?? "";
        return { text };
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: err instanceof Error ? err.message : "LLM call failed",
        });
      }
    }),

  applyCallActions: protectedProcedure
    .input(
      z.object({
        completeTaskIds: z.array(z.number()).optional(),
        newTasks: z
          .array(
            z.object({
              title: z.string(),
              description: z.string().optional(),
              priority: z.enum(["urgent", "high", "medium", "low"]).default("medium"),
              type: z
                .enum(["call", "email", "meeting", "follow_up", "research", "other"])
                .default("follow_up"),
              contactId: z.number().optional(),
              propertyId: z.number().optional(),
              dueDaysFromNow: z.number().default(1),
            }),
          )
          .optional(),
        propertyUpdates: z
          .array(
            z.object({
              propertyId: z.number(),
              field: z.string(),
              newValue: z.string(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const results: string[] = [];

      if (input.completeTaskIds?.length) {
        await Promise.all(
          input.completeTaskIds.map((id) =>
            updateTask(id, ctx.user.id, {
              status: "completed",
              completedAt: new Date(),
            }),
          ),
        );
        results.push(`Completed ${input.completeTaskIds.length} task(s)`);
      }

      if (input.newTasks?.length) {
        await Promise.all(
          input.newTasks.map((t) => {
            const dueAt = nextWeekday(
              new Date(Date.now() + (t.dueDaysFromNow ?? 1) * 86_400_000),
            );
            return createTask({
              userId: ctx.user.id,
              title: t.title,
              description: t.description,
              priority: t.priority,
              type: t.type,
              contactId: t.contactId || undefined,
              propertyId: t.propertyId || undefined,
              status: "pending",
              dueAt,
            });
          }),
        );
        results.push(`Created ${input.newTasks.length} new task(s)`);
      }

      if (input.propertyUpdates?.length) {
        await Promise.all(
          input.propertyUpdates.map((u) => {
            const updateData: Record<string, unknown> = {};
            if (u.field === "status") updateData.status = u.newValue;
            else if (u.field === "askingPrice")
              updateData.askingPrice = parseFloat(u.newValue.replace(/[^0-9.]/g, ""));
            else if (u.field === "estimatedValue")
              updateData.estimatedValue = parseFloat(u.newValue.replace(/[^0-9.]/g, ""));
            else if (u.field === "notes") updateData.notes = u.newValue;
            if (Object.keys(updateData).length > 0) {
              return updateProperty(
                u.propertyId,
                ctx.user.id,
                updateData as Parameters<typeof updateProperty>[2],
              );
            }
          }),
        );
        results.push(`Updated ${input.propertyUpdates.length} property field(s)`);
      }

      return { success: true, applied: results };
    }),
});
