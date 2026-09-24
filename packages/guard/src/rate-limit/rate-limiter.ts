/**
 * RateLimiter — GCRA qua Lua EVALSHA/EVAL, adapter **fail-open**.
 *
 * Pipeline: build key → compute GCRA params → connect → sample `now` →
 * EVALSHA (fallback EVAL khi NOSCRIPT) → narrow reply. Redis lỗi/timeout →
 * `{ allowed: true, failedOpen: true }` — **tuyệt đối không throw**. Rate
 * limit là phòng thủ, không phải correctness; chặn hết traffic thật để ngăn
 * abuse giả định là tự gây sự cố (analysis §3.4).
 *
 * SHA1 tính **local** bằng `node:crypto` (hằng {@link GCRA_SHA1}) — không hỏi
 * Redis, không giữ state per-process. Chiến lược giống node-redis
 * `_executeScript`: EVALSHA trước, `NOSCRIPT` → EVAL (EVAL tự nạp cache).
 *
 * Timeout command: {@link DEFAULT_RATE_LIMIT_TIMEOUT_MS} qua `withDeadline`
 * — cùng cơ chế với `RedisCacheStore` sau p0-00 (không dùng `commandOptions.timeout`).
 *
 * Không dùng `getDefaultCacheStore()` — đó là cache fail-open cho *dữ liệu*;
 * đây cần chạy *script* → `RedisRepository` trực tiếp.
 *
 * ## Trần thời gian: 250ms là của pha COMMAND, không phải của cả lời gọi
 *
 * | Pha | Trần | Hằng |
 * |---|---|---|
 * | connect/reconnect (`getClient`) | 5000ms | `DEFAULT_REDIS_CONNECT_DEADLINE_MS` (@megawin/cache) |
 * | command (EVALSHA/EVAL) | 250ms | `DEFAULT_RATE_LIMIT_TIMEOUT_MS` |
 * | **tổng worst-case** | **5250ms** | — |
 *
 * Pha connect KHÔNG bị bọc `withDeadline` riêng — quyết định có chủ đích (p0-01b Q1):
 * `withDeadline` chỉ bỏ **chờ**, không huỷ được `connect()` đang chạy, nên trần riêng chỉ cắt
 * *lời hứa* chứ không cắt công việc; đổi lại nếu đặt thấp hơn latency handshake thật tới Redis
 * Cloud thì MỌI cold start fail-open — mất phòng thủ đúng lúc Lambda scale up.
 *
 * Worst-case 5250ms chỉ trả giá ở request ĐẦU sau mỗi cửa sổ circuit (`REDIS_CIRCUIT_OPEN_MS`
 * = 5s); các request sau fail-open ~0ms nhờ circuit. Nếu đo thấy p99 thực tế không chấp nhận
 * được sau rollout → mở lại Q1, không tự đổi.
 */

import { createHash } from "node:crypto";

import { DEFAULT_REDIS_ENV_KEY } from "@megawin/cache";
import { DeadlineExceededError, RedisCircuitOpenError, RedisRepository, withDeadline } from "@megawin/cache/redis";
import { logError, logWarn } from "@megawin/shared/utils";

import { DEFAULT_RATE_LIMIT_TIMEOUT_MS } from "../constants";
import { buildRateLimitKey } from "../keys";
import type { RateLimitDecision, RateLimitInput } from "../types";
import { computeGcraParams } from "./gcra-math";
import { GCRA_LUA_SCRIPT } from "./gcra.lua";

/**
 * SHA1 của {@link GCRA_LUA_SCRIPT} — tính **local** bằng `node:crypto`, KHÔNG hỏi Redis.
 *
 * Đây đúng chiến lược của node-redis (`defineScript` + `_executeScript`,
 * `@redis/client/dist/lib/client/index.js:1108`): EVALSHA trước, `NOSCRIPT` → EVAL.
 * `EVAL` **tự nạp** script vào script cache của Redis nên `SCRIPT LOAD` là round-trip thừa.
 *
 * Hằng số thay cho biến cache vì SHA1 chỉ phụ thuộc text script (bất biến ở runtime) —
 * không có gì để invalidate, và không còn state dùng chung giữa các `redisEnvKey`.
 */
const GCRA_SHA1 = createHash("sha1").update(GCRA_LUA_SCRIPT).digest("hex");

/** Options khởi tạo RateLimiter. */
export interface RateLimiterOptions {
  /**
   * Env key chứa Redis URI. Mặc định {@link DEFAULT_REDIS_ENV_KEY}.
   * Chừa đường tách instance `REDIS_RATELIMIT_URI` sau (analysis §5.3) mà không
   * phải refactor.
   */
  redisEnvKey?: string;

  /**
   * Trần pha **command** (ms) — KHÔNG phủ pha connect, xem bảng ở JSDoc class.
   * Mặc định {@link DEFAULT_RATE_LIMIT_TIMEOUT_MS}.
   */
  commandTimeoutMs?: number;
}

/**
 * Quyết định fail-open chuẩn — dùng khi Redis lỗi / reply sai shape.
 *
 * **Factory, không phải hằng dùng chung**: `RateLimitDecision` không `readonly`, một caller
 * (middleware p1-01) gán `decision.remainingBurst` sẽ làm bẩn mọi request sau nếu trả shared
 * reference. Không `Object.freeze`: file ESM là strict mode, gán lên object đóng băng sẽ
 * **throw** giữa request — đổi bug bẩn state thành bug 500. Factory cho phép caller gán field
 * trên bản sao của riêng họ.
 */
function failOpenDecision(): RateLimitDecision {
  return { allowed: true, retryAfterMs: 0, remainingBurst: 0, failedOpen: true };
}

/**
 * GCRA rate limiter dùng Redis Lua.
 *
 * Instance-per-process là đủ (stateless — SHA tính local, không cache). Có thể
 * new nhiều instance trỏ `redisEnvKey` khác nhau mà không chia sẻ state.
 */
export class RateLimiter {
  private readonly repo: RedisRepository;
  /** Env key — giữ để gắn vào log khi fail-open. */
  private readonly redisEnvKey: string;
  /** Trần `withDeadline` cho pha command (sau connect). */
  private readonly commandDeadlineMs: number;

  constructor(options: RateLimiterOptions = {}) {
    this.redisEnvKey = options.redisEnvKey ?? DEFAULT_REDIS_ENV_KEY;
    this.repo = new RedisRepository(this.redisEnvKey);
    this.commandDeadlineMs = options.commandTimeoutMs ?? DEFAULT_RATE_LIMIT_TIMEOUT_MS;
  }

  /**
   * Đánh giá 1 request theo rule GCRA.
   *
   * **Không bao giờ throw** — Redis lỗi/timeout/reply rác → fail-open.
   *
   * Trần thời gian: pha connect tới `DEFAULT_REDIS_CONNECT_DEADLINE_MS` (5000ms)
   * + pha command {@link DEFAULT_RATE_LIMIT_TIMEOUT_MS} (250ms) = **5250ms**
   * worst-case. 250ms **không** phải trần của cả lời gọi — xem bảng ở JSDoc class.
   *
   * @param input - Route + subject + rule (+ optional `nowMs`).
   */
  public async checkRateLimit(input: RateLimitInput): Promise<RateLimitDecision> {
    try {
      // Pure + có thể throw (config sai / route chứa `:`) — throw sớm trước connect.
      const params = computeGcraParams(input.rule);
      const key = buildRateLimitKey(input.route, input.subject.type, input.subject.id);

      await this.repo.getClient();

      // Sample `now` MUỘN nhất có thể. connect/reconnect có thể tốn tới
      // DEFAULT_REDIS_CONNECT_DEADLINE_MS; `now` cũ làm GCRA thấy tat > now → deny oan request hợp lệ.
      const nowMs = input.nowMs ?? Date.now();
      const args = [String(params.emissionIntervalMs), String(params.delayToleranceMs), String(nowMs)];

      const raw = await withDeadline(this.evalGcra(key, args), this.commandDeadlineMs, "RateLimiter.checkRateLimit");

      return this.parseDecision(raw);
    } catch (err) {
      this.logFailOpen(err, input);
      return failOpenDecision();
    }
  }

  /**
   * EVALSHA trước (1 RTT); `NOSCRIPT` → EVAL full script (script được nạp lại luôn).
   *
   * KHÔNG gọi `SCRIPT LOAD`: `EVAL` đã nạp script vào cache server, thêm `SCRIPT LOAD` chỉ là
   * 1 RTT thừa **nằm trong** budget `withDeadline` của caller.
   *
   * Không giữ state: cold start Lambda trên Redis đã có script (ca phổ biến nhất) chỉ tốn
   * **1 RTT** thay vì 2 như bản cũ (bản cũ không biết SHA nên luôn EVAL + SCRIPT LOAD).
   *
   * Cũng an toàn trên Redis Cloud **clustered**: không phụ thuộc việc proxy có broadcast
   * `SCRIPT LOAD` tới mọi shard hay không — `EVAL` nạp đúng shard đang giữ key.
   */
  private async evalGcra(key: string, args: string[]): Promise<unknown> {
    const keys = [key];

    try {
      return await this.repo.evalSha(GCRA_SHA1, keys, args);
    } catch (err) {
      if (!isNoscriptError(err)) {
        throw err;
      }
      // Redis chưa có / vừa mất script cache (restart, SCRIPT FLUSH, failover shard).
      return await this.repo.eval(GCRA_LUA_SCRIPT, keys, args);
    }
  }

  /**
   * Narrow reply Lua `{ allowed, retryAfterMs, remainingBurst }` → decision.
   * Shape sai → fail-open (không TypeError ra ngoài).
   */
  private parseDecision(raw: unknown): RateLimitDecision {
    if (!Array.isArray(raw) || raw.length < 3) {
      logWarn("RateLimiter", "reply sai shape — fail-open", {
        redisEnvKey: this.redisEnvKey,
        rawType: typeof raw,
      });
      return failOpenDecision();
    }

    const allowedFlag = Number(raw[0]);
    const retryAfterMs = Number(raw[1]);
    const remainingBurst = Number(raw[2]);

    if (!Number.isFinite(allowedFlag) || !Number.isFinite(retryAfterMs) || !Number.isFinite(remainingBurst)) {
      logWarn("RateLimiter", "reply không phải số — fail-open", {
        redisEnvKey: this.redisEnvKey,
        raw,
      });
      return failOpenDecision();
    }

    return {
      allowed: allowedFlag === 1,
      retryAfterMs: Math.max(0, Math.trunc(retryAfterMs)),
      remainingBurst: Math.max(0, Math.trunc(remainingBurst)),
      failedOpen: false,
    };
  }

  /**
   * Log fail-open — phân mức giống `RedisCacheStore.logFailOpen`:
   * circuit open không log (đã log 1 lần lúc mở); deadline → logError; còn lại warn.
   */
  private logFailOpen(err: unknown, input: RateLimitInput): void {
    if (err instanceof RedisCircuitOpenError) {
      return;
    }

    const ctx = {
      redisEnvKey: this.redisEnvKey,
      route: input.route,
      subjectType: input.subject.type,
      deadlineMs: this.commandDeadlineMs,
    };

    if (err instanceof DeadlineExceededError) {
      logError("RateLimiter", err, { ...ctx, phase: "command" });
      return;
    }

    // computeGcraParams throw / lỗi khác — vẫn fail-open nhưng log rõ để sửa cấu hình.
    logError("RateLimiter", err, ctx);
  }
}

/**
 * Redis trả error **prefix** `NOSCRIPT No matching script` khi SHA không có trong script cache.
 *
 * `startsWith` (KHÔNG `includes`) — khớp đúng cách node-redis tự kiểm tra
 * (`client/index.js:1115`). `includes` sẽ nuốt cả lỗi khác có chuỗi "NOSCRIPT" trong body và
 * fallback EVAL sai ngữ cảnh, che mất lỗi thật.
 */
function isNoscriptError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("NOSCRIPT");
}
