import { z } from "zod";
import { createTask, deleteTask, getTasks, updateTask } from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const tasksRouter = router({
  list: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      priority: z.string().optional(),
      contactId: z.number().optional(),
      propertyId: z.number().optional(),
      dueToday: z.boolean().optional(),
      limit: z.number().optional(),
    }).optional())
    .query(({ ctx, input }) => getTasks(ctx.user.id, input)),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1),
      description: z.string().optional(),
      type: z.enum(["call", "email", "meeting", "follow_up", "research", "other"]).default("follow_up"),
      priority: z.enum(["urgent", "high", "medium", "low"]).default("medium"),
      contactId: z.number().optional(),
      propertyId: z.number().optional(),
      listingId: z.number().optional(),
      activityId: z.number().optional(),
      dueAt: z.date().optional(),
    }))
    .mutation(({ ctx, input }) => createTask({ ...input, userId: ctx.user.id })),

  update: protectedProcedure
    .input(z.object({
      id: z.number(),
      title: z.string().optional(),
      description: z.string().optional(),
      type: z.enum(["call", "email", "meeting", "follow_up", "research", "other"]).optional(),
      priority: z.enum(["urgent", "high", "medium", "low"]).optional(),
      status: z.enum(["pending", "in_progress", "completed", "cancelled"]).optional(),
      dueAt: z.date().optional().nullable(),
      completedAt: z.date().optional().nullable(),
      propertyId: z.number().optional().nullable(),
      contactId: z.number().optional().nullable(),
      listingId: z.number().optional().nullable(),
    }))
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return updateTask(id, ctx.user.id, data);
    }),

  complete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) =>
      updateTask(input.id, ctx.user.id, { status: "completed", completedAt: new Date() })
    ),

  delete: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(({ ctx, input }) => deleteTask(input.id, ctx.user.id)),
});
