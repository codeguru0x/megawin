/**
 * Lambda handler: POST /tenant/players/login
 * Server-to-server: Tenant server gọi để đăng nhập / tạo player.
 *
 * Auth: Tenant API Key + IP whitelist.
 * tenantId lấy từ API Key auth (không từ body) để đảm bảo tenant
 * chỉ login player cho chính mình.
 */

import { buildRateLimitDeniedResponse, GuardSubjectType, RateLimitMode, resolveRateLimitMode } from "@megawin/auth";
import { withTenantAuth } from "@megawin/auth/tenant";
import { RateLimiter } from "@megawin/guard";
import { PlayerLoginUseCase } from "@megawin/identity-application/use-cases/players";
import { logError } from "@megawin/shared/utils";
import { z } from "zod";

import { PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT, PLAYER_LOGIN_PER_TENANT_RATE_LIMIT } from "../lib/rate-limit";

// ============ Zod schema ============

const bodySchema = z.object({
  playerExternalId: z
    .string()
    .min(4, "playerExternalId must be at least 4 characters")
    .max(32, "playerExternalId must be at most 32 characters")
    .regex(/^[a-zA-Z0-9]+$/, "playerExternalId must be alphanumeric only"),
});

// ============ Use case ============

const useCase = new PlayerLoginUseCase();

/**
 * Lớp per-player gọi trực tiếp `RateLimiter` (sau Zod) vì key gồm `playerExternalId`
 * từ body. Middleware rate-limit đứng TRƯỚC `validatorZod` nên không đọc được body —
 * không đảo chain cả app cho 1 endpoint. Lớp per-tenant nằm ở middleware (trước Zod).
 *
 * Van tắt `GUARD_RATELIMIT_MODE=off` vẫn phải tôn trọng ở đây: middleware đã no-op,
 * lớp này cũng không được gọi Redis.
 */
const playerLoginLimiter = new RateLimiter();

/**
 * Lớp 2 — per-player, sau Zod. Key = `tenantId:playerExternalId`.
 * Trả 429 khi denied; `undefined` khi cho qua, mode `off`, hoặc fail-open.
 */
async function denyIfPlayerLoginOverPerPlayerLimit(tenantId: string, playerExternalId: string) {
  const mode = resolveRateLimitMode(process.env.GUARD_RATELIMIT_MODE);
  if (mode === RateLimitMode.Off) {
    return undefined;
  }

  const decision = await playerLoginLimiter.checkRateLimit({
    route: PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT.route,
    subject: { type: GuardSubjectType.Tenant, id: `${tenantId}:${playerExternalId}` },
    rule: {
      limit: PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT.limit,
      windowSec: PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT.windowSec,
      burst: PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT.burst,
    },
  });

  if (decision.allowed || decision.failedOpen) {
    return undefined;
  }

  logError("rateLimit.denied", new Error("Rate limit denied"), {
    route: PLAYER_LOGIN_PER_PLAYER_RATE_LIMIT.route,
    subjectType: GuardSubjectType.Tenant,
    decision: {
      allowed: decision.allowed,
      retryAfterMs: decision.retryAfterMs,
      remainingBurst: decision.remainingBurst,
      failedOpen: decision.failedOpen,
    },
  });
  return buildRateLimitDeniedResponse(decision);
}

// ============ Handler ============

export const handler = withTenantAuth(
  async (event) => {
    const { playerExternalId } = event.schema.body;
    const { tenantId } = event.tenant;

    /**
     * Check rate limit for per-player login
     */
    const denied = await denyIfPlayerLoginOverPerPlayerLimit(tenantId, playerExternalId);
    if (denied) {
      return denied;
    }

    return useCase.run({ playerExternalId, tenantId });
  },
  {
    schemas: { body: bodySchema },
    /**
     * Rate limit for per-tenant login
     */
    rateLimit: PLAYER_LOGIN_PER_TENANT_RATE_LIMIT,
  },
);
