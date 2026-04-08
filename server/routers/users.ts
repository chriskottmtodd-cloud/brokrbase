import { TRPCError } from "@trpc/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { adminProcedure, router } from "../_core/trpc";
import { createUserWithPassword, getAllUsers, getUserByEmail } from "../db";

export const usersRouter = router({
  /** List all users (admin only) */
  list: adminProcedure.query(async () => {
    return getAllUsers();
  }),

  /** Create a new user (admin only) */
  create: adminProcedure
    .input(z.object({
      name: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(6),
      role: z.enum(["user", "admin"]).default("user"),
    }))
    .mutation(async ({ input }) => {
      // Check if email already exists
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
