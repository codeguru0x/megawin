/**
 * Rate-limit middleware cho `buildHandler` — sau auth, trước Zod.
 *
 * Mode toàn cục qua env `GUARD_RATELIMIT_MODE`: `enforce` (mặc định) / `off`.
 * Giá trị rác → `enforce` + log. Chỉ hai mode, không có mode trung gian.
 */

import { GuardSubjectType, RateLimiter, type GuardSubject, type RateLimitDecision } from "@megawin/guard";
import { APP_ERROR_CODES } from "@megawin/shared/errors";
import { extractClientIpFromApiGatewayV2, logError } from "@megawin/shared/utils";

/** Hai mode vận hành — `const object as const`, không string literal trần. */
export const RateLimitMode = {
  Enforce: "enforce",
  Off: "off",
} as const;
export type RateLimitMode = (typeof RateLimitMode)[keyof typeof RateLimitMode];

/** Khai báo tĩnh trên handler — `route` do developer đặt, không lấy từ request. */
export interface HandlerRateLimitOptions {
  /** Id route tĩnh — VD `"keno.place-bet"`. */
  route: string;
  /** Số request tối đa trong 1 window. */
  limit: number;
  /** Độ dài window (seconds). */
  windowSec: number;
  /** Burst cho phép vượt steady rate. Bỏ trống = mặc định của guard. */
  burst?: number;
  /** Subject dùng `GuardSubjectType` — không string literal trần. */
  subject: GuardSubjectType;
}

const GUARD_RATELIMIT_MODE_ENV = "GUARD_RATELIMIT_MODE";

const RATE_LIMIT_DENIED_MESSAGE = "Bạn đang thao tác quá nhanh, vui lòng thử lại sau ít giây.";

/** Singleton per process — RateLimiter stateless. */
const rateLimiter = new RateLimiter();

/**
 * Đọc mode từ env mỗi request — van tắt không cần deploy lại.
 * Giá trị rác → enforce + log (không âm thầm tắt phòng thủ).
 */
export function resolveRateLimitMode(raw: string | undefined): RateLimitMode {
  if (raw == null || raw === "") {
    return RateLimitMode.Enforce;
  }
  if (raw === RateLimitMode.Enforce) {
    return RateLimitMode.Enforce;
  }
  if (raw === RateLimitMode.Off) {
    return RateLimitMode.Off;
  }
  logError("rateLimit.resolveMode", new Error(`GUARD_RATELIMIT_MODE giá trị không hợp lệ, fallback enforce: ${raw}`), {
    raw,
  });
  return RateLimitMode.Enforce;
}

function retryAfterSeconds(retryAfterMs: number): string {
  return String(Math.max(1, Math.ceil(retryAfterMs / 1000)));
}

function buildDeniedResponse(decision: RateLimitDecision) {
  return {
    statusCode: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": retryAfterSeconds(decision.retryAfterMs),
    },
    body: JSON.stringify({
      success: false,
      error: {
        code: APP_ERROR_CODES.TOO_MANY_REQUESTS,
        message: RATE_LIMIT_DENIED_MESSAGE,
      },
    }),
  };
}

type EventLike = {
  user?: { accountId?: string; tenantId?: string };
  tenant?: { tenantId?: string };
  requestContext?: { http?: { sourceIp?: string } };
};

/**
 * Resolve subject theo thứ tự plan: account → tenant → IP.
 * `account` thiếu identity → fallback IP + log. Không lấy được IP → skip (caller bỏ qua RL).
 */
export function resolveRateLimitSubject(event: EventLike, subjectType: GuardSubjectType): GuardSubject | null {
  if (subjectType === GuardSubjectType.Account) {
    const accountId = event.user?.accountId;
    if (accountId) {
      return { type: GuardSubjectType.Account, id: accountId };
    }
    const ip = extractClientIpFromApiGatewayV2(event);
    logError(
      "rateLimit.resolveSubject",
      new Error("Khai subject account nhưng event không có accountId — fallback IP"),
      { subjectType },
    );
    if (!ip) {
      logError(
        "rateLimit.resolveSubject",
        new Error("Không lấy được IP sau khi fallback từ account — bỏ qua rate limit"),
        { subjectType },
      );
      return null;
    }
    return { type: GuardSubjectType.Ip, id: ip };
  }

  if (subjectType === GuardSubjectType.Tenant) {
    const tenantId = event.tenant?.tenantId || event.user?.tenantId;
    if (tenantId) {
      return { type: GuardSubjectType.Tenant, id: tenantId };
    }
    logError(
      "rateLimit.resolveSubject",
      new Error("Khai subject tenant nhưng event không có tenantId — bỏ qua rate limit"),
      { subjectType },
    );
    return null;
  }

  const ip = extractClientIpFromApiGatewayV2(event);
  if (!ip) {
    logError("rateLimit.resolveSubject", new Error("Không lấy được IP — bỏ qua rate limit"), { subjectType });
    return null;
  }
  return { type: GuardSubjectType.Ip, id: ip };
}

/**
 * Middy `before`: auth → **rateLimit** → validatorZod.
 * Không khai `rateLimit` hoặc mode `off` → no-op, không gọi Redis.
 */
export function rateLimitMiddleware(options: HandlerRateLimitOptions) {
  return {
    before: async (request: { event: unknown; earlyResponse?: unknown }) => {
      const event = request.event as EventLike;
      const mode = resolveRateLimitMode(process.env[GUARD_RATELIMIT_MODE_ENV]);
      if (mode === RateLimitMode.Off) {
        return;
      }

      const subject = resolveRateLimitSubject(event, options.subject);
      if (!subject) {
        return;
      }

      const decision = await rateLimiter.checkRateLimit({
        route: options.route,
        subject,
        rule: {
          limit: options.limit,
          windowSec: options.windowSec,
          burst: options.burst,
        },
      });

      if (decision.failedOpen || decision.allowed) {
        return;
      }

      logError("rateLimit.denied", new Error("Rate limit denied"), {
        route: options.route,
        subjectType: subject.type,
        decision: {
          allowed: decision.allowed,
          retryAfterMs: decision.retryAfterMs,
          remainingBurst: decision.remainingBurst,
          failedOpen: decision.failedOpen,
        },
      });

      request.earlyResponse = buildDeniedResponse(decision);
    },
  };
}
