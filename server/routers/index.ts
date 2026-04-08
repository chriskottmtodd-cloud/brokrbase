import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { publicProcedure, router } from "../_core/trpc";
import { contactsRouter } from "./contacts";
import { propertiesRouter } from "./properties";
import { activitiesRouter } from "./activities";
import { tasksRouter } from "./tasks";
import { notificationsRouter, dashboardRouter } from "./notifications";
import { aiRouter, callIntelRouter } from "./ai";
import { contactLinksRouter } from "./contactLinks";
import { contactEmailsRouter } from "./contactEmailsRouter";
import { usersRouter } from "./users";
import { voiceMemoRouter } from "./voiceMemo";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  contacts: contactsRouter,
  properties: propertiesRouter,
  activities: activitiesRouter,
  tasks: tasksRouter,
  notifications: notificationsRouter,
  dashboard: dashboardRouter,
  ai: aiRouter,
  callIntel: callIntelRouter,
  contactLinks: contactLinksRouter,
  contactEmails: contactEmailsRouter,
  users: usersRouter,
  voiceMemo: voiceMemoRouter,
});

export type AppRouter = typeof appRouter;
