import { z } from "zod";
import {
  getActivities,
  getDashboardListingPanels,
  getDashboardMetrics,
  getDueSoonTasks,
  getNotifications,
  getOverdueContactsCount,
  getTasks,
  markNotificationsRead,
} from "../db";
import { protectedProcedure, router } from "../_core/trpc";

export const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({ unreadOnly: z.boolean().optional() }).optional())
    .query(({ ctx, input }) => getNotifications(ctx.user.id, input?.unreadOnly)),

  markRead: protectedProcedure
    .input(z.object({ ids: z.array(z.number()).optional() }))
    .mutation(({ ctx, input }) => markNotificationsRead(ctx.user.id, input.ids)),
});

export const dashboardRouter = router({
  metrics: protectedProcedure
    .query(({ ctx }) => getDashboardMetrics(ctx.user.id)),

  recentActivities: protectedProcedure
    .query(({ ctx }) => getActivities(ctx.user.id, { limit: 10 })),

  upcomingTasks: protectedProcedure
    .query(({ ctx }) => getTasks(ctx.user.id, { status: "pending", limit: 10 })),

  dueSoonTasks: protectedProcedure
    .query(({ ctx }) => getDueSoonTasks(ctx.user.id)),

  overdueContactsCount: protectedProcedure
    .query(({ ctx }) => getOverdueContactsCount(ctx.user.id)),

  listingPanels: protectedProcedure
    .query(({ ctx }) => getDashboardListingPanels(ctx.user.id)),
});
