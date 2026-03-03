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

import { ClaimKey } from "@megawin/identity/entities/claim";
import { AccountStatus } from "@megawin/identity/entities/account";

import { env } from "@/env";

export const auth = betterAuth({
  /**
   * BETTER_AUTH_SECRET – bắt buộc, dùng để ký session.
   * BETTER_AUTH_URL – base URL của app (auto-detected trong production).
   */
  secret: env.BETTER_AUTH_SECRET,
  baseURL: env.BETTER_AUTH_URL,

  /**
   * Custom fields trên user – better-auth sẽ lưu & trả lại trong session.
   * mapProfileToUser populate các fields này từ Cognito token claims.
   */
  user: {
    additionalFields: {
      sub: {
        type: "string",
        required: false,
        input: false,
      },
      roles: {
        type: "string",
        required: false,
        defaultValue: "",
        input: false,
      },
      accountStatus: {
        type: "string",
        required: false,
        defaultValue: AccountStatus.Active,
        input: false,
      },
      accountId: {
        type: "string",
        required: false,
        input: false,
      },
      tenantId: {
        type: "string",
        required: false,
        input: false,
      },
      accountType: {
        type: "string",
        required: false,
        input: false,
      },
      username: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },

  /**
   * AWS Cognito social provider.
   * Redirect user sang Cognito Hosted UI để đăng nhập,
   * sau đó callback về /api/auth/callback/cognito.
   */
  socialProviders: {
    cognito: {
      clientId: env.COGNITO_WORKFORCE_CLIENT_ID,
      //clientSecret: env.COGNITO_CLIENT_SECRET,
      domain: env.COGNITO_WORKFORCE_DOMAIN,
      region: env.COGNITO_WORKFORCE_REGION,
      userPoolId: env.COGNITO_WORKFORCE_POOL_ID,
      redirectURI: `${env.BETTER_AUTH_URL}/api/auth/callback/cognito`,
      mapProfileToUser: (profile) => {
        const raw = profile as Record<string, unknown>;

        return {
          sub: (raw[ClaimKey.Sub] as string) ?? undefined,
          accountStatus:
            (raw[ClaimKey.AccountStatus] as string) ?? AccountStatus.Active,
          accountId: (raw[ClaimKey.AccountId] as string) ?? undefined,
          roles: (raw[ClaimKey.Roles] as string) ?? "",
          tenantId: (raw[ClaimKey.TenantId] as string) ?? undefined,
          accountType: (raw[ClaimKey.AccountType] as string) ?? undefined,
          username: (raw[ClaimKey.Username] as string) ?? undefined,
        };
      },
    },
  },

  /**
   * Session configuration.
   */
  session: {
    /** Cookie-based session (default). */
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60,
    },
  },

  /**
   * Redirect error page sang custom page thay vì dùng trang mặc định
   * để tránh lộ thông tin package đang sử dụng.
   */
  onAPIError: {
    errorURL: `${env.BETTER_AUTH_URL}/auth/error`,
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
