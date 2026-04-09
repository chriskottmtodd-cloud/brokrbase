import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminProcedure, protectedProcedure, router } from "../_core/trpc";
import {
  createUserWithPassword,
  getAllUsers,
  getUserByEmail,
  getUserById,
  updateUserProfile,
} from "../db";

export const usersRouter = router({
  getMyProfile: protectedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.user.id);
    if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
    return {
      id: user.id,
      name: user.name ?? "",
      email: user.email ?? "",
      company: user.company ?? "",
      title: user.title ?? "",
      phone: user.phone ?? "",
      marketFocus: user.marketFocus ?? "",
      signature: user.signature ?? "",
      voiceNotes: user.voiceNotes ?? "",
      preferences: user.preferences ?? "",
    };
  }),

  updateMyProfile: protectedProcedure
    .input(
      z.object({
        name: z.string().max(200).optional(),
        company: z.string().max(200).optional(),
        title: z.string().max(200).optional(),
        phone: z.string().max(50).optional(),
        marketFocus: z.string().max(2000).optional(),
        signature: z.string().max(2000).optional(),
        voiceNotes: z.string().max(4000).optional(),
        preferences: z.string().max(10000).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { preferences, ...rest } = input;
      const data: Record<string, string | null> = Object.fromEntries(
        Object.entries(rest).map(([k, v]) => [k, v && v.trim() ? v.trim() : null]),
      );
      // preferences is JSON — don't trim/nullify it the same way
      if (preferences !== undefined) {
        data.preferences = preferences || null;
      }
      await updateUserProfile(ctx.user.id, data);
      return { success: true };
    }),

  list: adminProcedure.query(async () => getAllUsers()),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(1),
        email: z.string().email(),
        password: z.string().min(6),
        role: z.enum(["user", "admin"]).default("user"),
      }),
    )
    .mutation(async ({ input }) => {
      const existing = await getUserByEmail(input.email);
      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "A user with this email already exists",
        });
      }

      const passwordHash = await bcrypt.hash(input.password, 10);
      const user = await createUserWithPassword({
        name: input.name,
        email: input.email,
        passwordHash,
        role: input.role,
      });

      return { id: user?.id, name: user?.name, email: user?.email };
    }),
});
