import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { systemRouter } from "../_core/systemRouter";
import { publicProcedure, router } from "../_core/trpc";
import { contactsRouter } from "./contacts";
import { propertiesRouter } from "./properties";
import { listingsRouter } from "./listings";
import { activitiesRouter } from "./activities";
import { tasksRouter } from "./tasks";
import { notificationsRouter, dashboardRouter } from "./notifications";
import { aiRouter, smartLogRouter, callIntelRouter } from "./ai";
import { followUpRouter } from "./followup";
import { buyerCriteriaRouter } from "./buyerCriteria";
import { listingAgentRouter } from "./listingAgent";
import { contactLinksRouter } from "./contactLinks";
import { buyerIntelRouter } from "./buyerIntel";
import { contactEmailsRouter } from "./contactEmailsRouter";
import { dataCleanupRouter } from "./dataCleanup";
import { exportRouter } from "./export";
import { marketsRouter } from "./markets";
import { marketIntelRouter } from "./marketIntel";
import { usersRouter } from "./users";
import { unitTypesRouter } from "./unitTypes";
import { ownerResearchRouter } from "./ownerResearch";
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
  listings: listingsRouter,
  activities: activitiesRouter,
  tasks: tasksRouter,
  notifications: notificationsRouter,
  dashboard: dashboardRouter,
  ai: aiRouter,
  callIntel: callIntelRouter,
  followUp: followUpRouter,
  smartLog: smartLogRouter,
  buyerCriteria: buyerCriteriaRouter,
  listingAgent: listingAgentRouter,
  contactLinks: contactLinksRouter,
  buyerIntel: buyerIntelRouter,
  contactEmails: contactEmailsRouter,
  dataCleanup: dataCleanupRouter,
  export: exportRouter,
  markets: marketsRouter,
  marketIntel: marketIntelRouter,
  users: usersRouter,
  unitTypes: unitTypesRouter,
  ownerResearch: ownerResearchRouter,
  voiceMemo: voiceMemoRouter,
});

export type AppRouter = typeof appRouter;
