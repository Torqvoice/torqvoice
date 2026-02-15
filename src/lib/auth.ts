import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { twoFactor } from "better-auth/plugins/two-factor";
import { db } from "./db";

const baseURL = process.env.NEXT_PUBLIC_APP_URL;
const isProduction = baseURL?.startsWith("https://");

export const auth = betterAuth({
  baseURL,
  trustedOrigins: baseURL ? [baseURL] : [],
  database: prismaAdapter(db, {
    provider: "postgresql",
  }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // 1 day
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // 5 minutes
    },
  },
  advanced: {
    useSecureCookies: isProduction,
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user) => {
          // Block registration if disabled via system settings
          const setting = await db.systemSetting.findUnique({
            where: { key: "registration.disabled" },
          });
          if (setting?.value === "true") {
            return false;
          }
          return { data: user };
        },
        after: async (user) => {
          // Auto-promote the first registered user to super admin
          const count = await db.user.count();
          if (count === 1) {
            await db.user.update({
              where: { id: user.id },
              data: { isSuperAdmin: true },
            });
          }
        },
      },
    },
  },
  plugins: [
    twoFactor({ issuer: "Torqvoice" }),
    nextCookies(), // Must be last plugin
  ],
});
