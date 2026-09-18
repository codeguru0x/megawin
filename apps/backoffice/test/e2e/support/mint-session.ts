/**
 * Ký session cookie E2E bằng `setSessionCookie` — KHÔNG gọi Cognito.
 *
 * Dùng `e2eAuth` (minimal) thay `@/lib/auth` — không kéo t3-env / Mongo / Cognito.
 * Secret từ `resolveBetterAuthSecret()` (process.env → fallback 1 key trong `.env.local`).
 *
 * @see `.cursor/plans/ui-visual-regression/p0-02-auth-storage-state.plan.md`
 */
import {
  AccountStatus as AccountStatusValues,
  AccountType as AccountTypeValues,
  type AccountStatus,
  type AccountType,
} from "@megawin/identity/entities";
import { setSessionCookie } from "better-auth/cookies";
import { makeSignature } from "better-auth/crypto";

import { e2eAuth } from "./e2e-auth";

/** Cookie theo shape Playwright `storageState` yêu cầu. */
export interface StateCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

export interface Persona {
  /** `"admin"` hoặc `"staff"` — CSV nếu nhiều: `"admin,staff"`. */
  roles: string;
  username: string;
  accountId: string;
  /** Mặc định `Company`. Truyền `Agent` để test nhánh `/unauthorized`. */
  accountType?: AccountType;
  accountStatus?: AccountStatus;
}

/**
 * Ký ra cặp cookie `session_token` + `session_data` cho 1 persona.
 *
 * `secure` luôn `false`: Playwright chạy `http://localhost` — cookie `Secure` bị browser bỏ.
 */
export async function mintSessionCookies(persona: Persona, baseURL: string): Promise<StateCookie[]> {
  const ctx = await e2eAuth.$context;
  const cookies: StateCookie[] = [];
  const host = new URL(baseURL).hostname;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const pushCookie = (name: string, value: string, attrs: Record<string, unknown>) => {
    const path = typeof attrs.path === "string" ? attrs.path : "/";
    const httpOnly = typeof attrs.httpOnly === "boolean" ? attrs.httpOnly : true;
    cookies.push({
      name,
      value,
      domain: host,
      path,
      expires: Math.floor(expiresAt.getTime() / 1000),
      httpOnly,
      secure: false,
      sameSite: "Lax",
    });
  };

  const endpointCtx = {
    context: {
      ...ctx,
      setNewSession: () => undefined,
    },
    setCookie: (name: string, value: string, attrs: Record<string, unknown>) => {
      pushCookie(name, value, attrs);
    },
    setSignedCookie: async (name: string, value: string, secret: string, attrs: Record<string, unknown>) => {
      const signature = await makeSignature(value, secret);
      pushCookie(name, `${value}.${signature}`, attrs);
    },
    getSignedCookie: async () => null,
    getCookie: () => null,
    headers: new Headers(),
  };

  await setSessionCookie(
    // oxlint-disable-next-line typescript/no-explicit-any: GenericEndpointContext là type nội bộ better-auth, không export.
    endpointCtx as any,
    {
      session: {
        id: `e2e-session-${persona.roles}`,
        token: `e2e-token-${persona.roles}`,
        userId: persona.accountId,
        expiresAt,
        createdAt: now,
        updatedAt: now,
        ipAddress: "127.0.0.1",
        userAgent: "playwright-e2e",
      },
      user: {
        id: persona.accountId,
        email: `${persona.username}@e2e.local`,
        emailVerified: true,
        name: persona.username,
        image: null,
        createdAt: now,
        updatedAt: now,
        sub: `e2e-sub-${persona.roles}`,
        username: persona.username,
        accountId: persona.accountId,
        accountType: persona.accountType ?? AccountTypeValues.Company,
        accountStatus: persona.accountStatus ?? AccountStatusValues.Active,
        roles: persona.roles,
        tenantId: "",
      },
    } as Parameters<typeof setSessionCookie>[1],
  );

  return cookies;
}
