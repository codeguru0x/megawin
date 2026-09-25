/**
 * Hằng rate-limit của `api-tenant` — 2 lớp `POST /player/login`.
 *
 * Per-tenant khai trên middleware (trước Zod). Per-player gọi `RateLimiter`
 * trong handler vì key gồm `playerExternalId` từ body — chỉ có sau Zod.
 */

import { GuardSubjectType, type HandlerRateLimitOptions } from "@megawin/auth";

/** Trần cả tenant: 10 login / giây, burst 0 → spacing 100ms. */
export const PLAYER_LOGIN_PER_TENANT_RATE_LIMIT = {
  route: "tenant.player-login",
  limit: 10,
  windowSec: 1,
  burst: 0,
  subject: GuardSubjectType.Tenant,
} as const satisfies HandlerRateLimitOptions;

/**
 * Trần từng player trong tenant: 5 lần / 60s, burst 0.
 * `route` khác per-tenant → 2 key, 2 quota độc lập.
 */
export const PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT = {
  route: "tenant.player-login.player",
  limit: 5,
  windowSec: 60,
  burst: 0,
} as const;
