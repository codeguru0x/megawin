/**
 * Better Auth tối giản CHỈ để mint cookie E2E — không import `@/lib/auth` / `@/env`.
 *
 * Vì sao tách: `auth.ts` kéo t3-env (Cognito, Mongo, Redis, SFN…) → globalSetup trên CI
 * phải inject cả đống secret chỉ để ký cookie. Mint chỉ cần `BETTER_AUTH_SECRET` khớp
 * với process `next dev` (cùng secret → cookie verify được).
 *
 * `additionalFields` + `session.cookieCache` PHẢI khớp `src/lib/auth.ts` — lệch shape
 * → proxy/`requireOperatorSession` đọc sai claim.
 */
import { AccountStatus } from "@megawin/identity/entities";
import { betterAuth } from "better-auth";

import { resolveBetterAuthSecret, resolveE2eBaseURL } from "./resolve-auth-secret";

export const e2eAuth = betterAuth({
  secret: resolveBetterAuthSecret(),
  baseURL: resolveE2eBaseURL(),
  user: {
    additionalFields: {
      sub: { type: "string", required: false, input: true },
      roles: { type: "string", required: false, defaultValue: "", input: true },
      accountStatus: {
        type: "string",
        required: false,
        defaultValue: AccountStatus.Active,
        input: true,
      },
      accountId: { type: "string", required: false, input: true },
      tenantId: { type: "string", required: false, input: true },
      accountType: { type: "string", required: false, input: true },
      username: { type: "string", required: false, input: true },
    },
  },
  session: {
    expiresIn: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 60 * 60 * 24,
    },
  },
});
