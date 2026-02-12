/**
 * Better Auth – Server-side configuration.
 *
 * Sử dụng AWS Cognito làm social provider cho hosted UI login.
 * Session được lưu bằng cookie (default) – phù hợp SSR/RSC của Next.js.
 *
 * @see https://www.better-auth.com/docs/authentication/cognito
 * @see https://better-auth.com/docs/integrations/next
 */

import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";

export const auth = betterAuth({
  /**
   * BETTER_AUTH_SECRET – bắt buộc, dùng để ký session.
   * BETTER_AUTH_URL – base URL của app (auto-detected trong production).
   */
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,

  /**
   * AWS Cognito social provider.
   * Redirect user sang Cognito Hosted UI để đăng nhập,
   * sau đó callback về /api/auth/callback/cognito.
   */
  socialProviders: {
    cognito: {
      clientId: process.env.COGNITO_CLIENT_ID as string,
      clientSecret: process.env.COGNITO_CLIENT_SECRET as string,
      domain: process.env.COGNITO_DOMAIN as string,
      region: process.env.COGNITO_REGION as string,
      userPoolId: process.env.COGNITO_USERPOOL_ID as string,
    },
  },

  /**
   * Session configuration.
   */
  session: {
    /** Cookie-based session (default). */
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60, // Cache session in cookie for 5 minutes
    },
  },

  /**
   * Plugins.
   * nextCookies – tự động set cookies cho server actions.
   * PHẢI đặt cuối mảng plugins.
   */
  plugins: [nextCookies()],
});

/** Inferred types for client-side usage. */
export type Session = typeof auth.$Infer.Session;
