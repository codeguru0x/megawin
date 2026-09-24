/**
 * RedisRepository — base repository cho mọi lệnh Redis, dùng khi cần Redis
 * đúng nghĩa (lock, counter, rate-limit, sorted set…), không chỉ để cache.
 *
 * Method đặt tên bám sát lệnh Redis gốc (viết camelCase) để đọc code là biết
 * ngay lệnh gì chạy — ví dụ `zAdd` → `ZADD`, `hIncrBy` → `HINCRBY`.
 *
 * ⚠️ FAIL-FAST: mọi method THROW khi connect/command lỗi. Với nhu cầu CACHE
 * thuần trên hot path (chấp nhận miss khi Redis down), dùng `RedisCacheStore`
 * (@megawin/cache/stores) — adapter fail-open bọc ngoài repo này.
 *
 * `getClient()` cũng có thể throw ngay khi circuit đang mở (p0-00) —
 * caller fail-open phải coi đó là lỗi bình thường (degrade), không log ở mức
 * error như thể bug ứng dụng.
 *
 * ## ⚠️ THROW ≠ "LỆNH CHƯA CHẠY" — đọc trước khi viết lock/idempotency/ví
 *
 * Phân biệt 3 loại lỗi, vì đường tiền xử lý KHÁC NHAU hoàn toàn:
 *
 * | Lỗi | Lệnh đã chạy trên Redis chưa? | Caller được phép làm gì |
 * |---|---|---|
 * | `RedisCircuitOpenError` | **CHẮC CHẮN CHƯA** — chưa gửi byte nào | Coi như "không thực hiện được", retry / fail-closed tuỳ nghiệp vụ |
 * | Lỗi socket / `ClientClosedError` trước khi gửi | Chưa | Như trên |
 * | `DeadlineExceededError` | **KHÔNG BIẾT** | **KHÔNG được suy ra "chưa chạy"** |
 *
 * Vì sao `DeadlineExceededError` là UNKNOWN: `withDeadline` dùng `Promise.race`
 * — chỉ bỏ **chờ kết quả**, không huỷ được lệnh đã ghi vào socket. Redis có thể
 * đã thực thi xong và reply về muộn. Nặng hơn: khi client đang reconnect
 * (`isOpen && !isReady`) node-redis xếp lệnh vào **offline queue** và **gửi
 * THẬT** sau khi reconnect xong — tức lệnh chạy MUỘN, sau khi app đã kết luận
 * "thất bại" và có thể đã đi nhánh bù trừ. Đó là nguồn của double-write.
 *
 * Hệ quả bắt buộc cho code tiền (settle, payout, wallet, idempotency, lock):
 * 1. Dùng primitive **1 lệnh, idempotent** (`SET key token NX EX`, Lua script),
 *    KHÔNG chuỗi nhiều lệnh read-modify-write qua nhiều round-trip.
 * 2. Timeout → **đọc lại để xác nhận** trạng thái thật, hoặc fail-closed. Không
 *    bao giờ "thử lại với semantics khác".
 * 3. Node-redis xếp lệnh gọi lúc đang reconnect vào offline queue rồi gửi THẬT
 *    khi reconnect xong — đúng nguồn double-write ở trên. Khi thực sự cần chặn
 *    ca này (p0-02 lock/idempotency), thêm option `disableOfflineQueue` tại
 *    `createClient` (`client.ts`) lúc đó — chưa làm trước vì chưa có caller nào
 *    dùng, thêm sớm chỉ là API không ai gọi.
 *
 * ## Vì sao method KHÔNG nhận `commandOptions`
 *
 * Trước đây mọi method có tham số cuối `commandOptions?: RedisCommandOptions` với
 * gợi ý "timeout ngắn cho hot path". Đã **bỏ** (review 2026-09-21) vì 2 lý do:
 * `commandOptions.timeout` của redis@6 **không cắt được** lệnh đã gửi mà không có
 * reply (node-redis tháo timeout listener khi command rời queue — xem
 * `with-deadline.ts`), nên gợi ý đó dẫn người đọc tới đúng cái bẫy mà
 * `withDeadline` tồn tại để vá; và không có caller nào trong monorepo dùng nó.
 * Cần command options thật (abortSignal, typeMapping) → lấy proxy client qua
 * {@link RedisRepository.getClient} rồi gọi lệnh trực tiếp.
 *
 * @example Subclass để đóng gói domain-specific command
 * class RateLimitRepository extends RedisRepository {
 *   async hit(userId: string): Promise<number> {
 *     return await this.incrBy(`ratelimit:${userId}`);
 *   }
 * }
 *
 * @example Transaction — chuyển tiền giữa 2 counter, atomic
 * const multi = await repo.multi();
 * const results = await multi.incrBy("wallet:a", -amount).incrBy("wallet:b", amount).exec();
 */

import { DEFAULT_REDIS_ENV_KEY, DELETE_BATCH_SIZE } from "../constants";
import { getRedisClient } from "./client";
import type {
  ExpireMode,
  RedisClient,
  RedisCommandOptions,
  RedisMultiCommand,
  SortedSetMember,
  ZAddOptions,
  ZRangeByScoreOptions,
  ZRangeOptions,
} from "./types";

export class RedisRepository {
  /** Env key chứa Redis URI — mỗi repo có thể trỏ instance Redis khác nhau. */
  protected readonly redisEnvKey: string;

  /**
   * Tạo Redis repository.
   *
   * @param redisEnvKey - env key chứa Redis URI
   */
  constructor(redisEnvKey: string = DEFAULT_REDIS_ENV_KEY) {
    this.redisEnvKey = redisEnvKey;
  }

  /**
   * Lấy Redis client (singleton per env key, tự connect lần đầu).
   * Throw nếu thiếu env, circuit open, hoặc connect thất bại.
   *
   * @param commandOptions - Nếu truyền, trả về "proxy client" (theo doc redis@6)
   *   với command options này (abortSignal, typeMapping, asap…) áp cho mọi lệnh
   *   gọi qua proxy. Proxy chỉ là `Object.create(client)` + ghi đè
   *   `_commandOptions` — KHÔNG mở connection mới, dùng chung socket/queue với
   *   client gốc. KHÔNG cache proxy: client gốc giữ default `timeout` 5s nên
   *   lock/ví… trỏ cùng instance không bị ép trần hot-path của cache store.
   *
   *   ⚠️ **Đừng dùng `timeout` ở đây để chống stall.** node-redis tháo timeout
   *   listener ngay khi command rời queue sang chờ reply, nên nó chỉ phủ pha CHƯA
   *   gửi; lệnh đã gửi mà không có reply vẫn treo (đo probe: `timeout: 300` treo
   *   >10s). Trần thật cho pha command là `withDeadline` (xem `stores/redis-store.ts`).
   */
  public async getClient(commandOptions?: RedisCommandOptions): Promise<RedisClient> {
    const client = await getRedisClient(this.redisEnvKey);
    return commandOptions ? client.withCommandOptions(commandOptions) : client;
  }

  // ── JSON layer ─────────────────────────────────────────────────────────────

  /**
   * SET value dạng JSON với TTL tuỳ chọn.
   * `undefined` được chuẩn hoá thành `null` (JSON không có undefined).
   */
  public async setJson<T>(key: string, value: T, expiresInSec?: number): Promise<void> {
    await this.set(key, JSON.stringify(value ?? null), expiresInSec);
  }

  /**
   * GET value dạng JSON.
   * Trả `null` khi key không tồn tại HOẶC value không parse được (data corrupt
   * coi như miss — không throw để caller không nổ vì rác trong Redis).
   */
  public async getJson<T>(key: string): Promise<T | null> {
    const raw = await this.get(key);
    if (raw === null) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  // ── String layer ───────────────────────────────────────────────────────────

  /** GET string thô. Key không tồn tại → `null`. */
  public async get(key: string): Promise<string | null> {
    const client = await this.getClient();
    return await client.get(key);
  }

  /**
   * SET string thô. `expiresInSec > 0` → kèm `EX` (TTL seconds);
   * bỏ trống → key sống vô hạn (chỉ dùng cho data chủ động quản lý lifecycle).
   */
  public async set(key: string, value: string, expiresInSec?: number): Promise<void> {
    const client = await this.getClient();

    if (expiresInSec !== undefined && expiresInSec > 0) {
      await client.set(key, value, { EX: expiresInSec });
      return;
    }
    await client.set(key, value);
  }

  /**
   * DEL 1 hoặc nhiều keys trong 1 command.
   *
   * @returns Số key thực sự bị xoá (key không tồn tại không tính).
   */
  public async delete(keys: string | string[]): Promise<number> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length === 0) {
      return 0;
    }

    const client = await this.getClient();
    return await client.del(list);
  }

  /**
   * Xoá mọi key bắt đầu bằng prefix — SCAN cursor-based + DEL theo batch.
   * KHÔNG dùng KEYS (block Redis với keyspace lớn). Thao tác admin
   * (invalidate namespace, bump version) — không gọi trên hot path.
   *
   * Trần thời gian là việc của caller: `RedisCacheStore.deleteByPrefix` bọc
   * `DEFAULT_REDIS_ADMIN_TIMEOUT_MS` (15s) vì SCAN keyspace lớn kéo dài hợp lệ.
   *
   * @returns Tổng số key đã xoá.
   */
  public async deleteByPrefix(prefix: string): Promise<number> {
    const client = await this.getClient();

    // `scanIterator()` trả về một ASYNC ITERATOR — không phải array có sẵn
    // trong tay. Mỗi lần lặp, nó tự chạy 1 lệnh SCAN với cursor nội bộ
    // (client tự nhớ cursor, ta không cần quản lý) và trả về 1 lô key nhỏ.
    // `for await...of` là cú pháp DUY NHẤT để "rút" từng lô ra tuần tự —
    // mỗi vòng lặp là 1 lần `await` ngầm chờ SCAN tiếp theo trả về.
    //
    // Không dùng KEYS/dùng array load hết 1 lần vì keyspace lớn có thể
    // block Redis; SCAN chia nhỏ thành nhiều round-trip rẻ.
    let deleted = 0;
    let batch: string[] = [];

    for await (const keysFromOneScan of client.scanIterator({
      MATCH: `${prefix}*`,
      COUNT: DELETE_BATCH_SIZE,
    })) {
      // Redis không đảm bảo mỗi lần SCAN trả đúng COUNT key — có thể ít
      // hoặc nhiều hơn. Nên phải tự gom (`concat`) vào `batch` rồi tự
      // kiểm tra ngưỡng, không dựa vào số lượng của 1 lần SCAN đơn lẻ.
      batch = batch.concat(keysFromOneScan);

      // Batch đã đủ lớn → xoá ngay, không đợi SCAN xong hết toàn bộ
      // keyspace (tránh giữ hàng triệu key trong RAM cùng lúc).
      if (batch.length >= DELETE_BATCH_SIZE) {
        deleted += await this.delete(batch);
        batch = [];
      }
    }

    // SCAN đã duyệt hết keyspace nhưng batch cuối chưa đầy ngưỡng —
    // vẫn còn key dư trong `batch`, phải xoá nốt kẻo mất.
    if (batch.length > 0) {
      deleted += await this.delete(batch);
    }

    return deleted;
  }

  /** EXISTS — key có tồn tại không. */
  public async exists(key: string): Promise<boolean> {
    const client = await this.getClient();
    return (await client.exists(key)) > 0;
  }

  // ── TTL management ─────────────────────────────────────────────────────────

  /**
   * EXPIRE — đặt TTL theo giây.
   * @param mode - NX/XX/GT/LT — xem {@link ExpireMode}.
   * @returns `true` nếu TTL được đặt; `false` nếu key không tồn tại hoặc mode không thoả.
   */
  public async expire(key: string, expiresInSec: number, mode?: ExpireMode): Promise<boolean> {
    const client = await this.getClient();
    return (await client.expire(key, expiresInSec, mode)) === 1;
  }

  /**
   * PEXPIRE — đặt TTL theo milliseconds (cho lock/rate-limit cần độ chính xác cao).
   * @param mode - NX/XX/GT/LT — xem {@link ExpireMode}.
   * @returns `true` nếu TTL được đặt; `false` nếu key không tồn tại hoặc mode không thoả.
   */
  public async pExpire(key: string, expiresInMs: number, mode?: ExpireMode): Promise<boolean> {
    const client = await this.getClient();
    return (await client.pExpire(key, expiresInMs, mode)) === 1;
  }

  /**
   * TTL — thời gian sống còn lại của key (seconds).
   * @returns `-1` nếu key không có TTL, `-2` nếu key không tồn tại (semantics Redis).
   */
  public async ttl(key: string): Promise<number> {
    const client = await this.getClient();
    return await client.ttl(key);
  }

  // ── Counter ────────────────────────────────────────────────────────────────

  /**
   * INCRBY — tăng counter atomically. Key chưa tồn tại → khởi tạo 0 rồi tăng.
   * @returns Giá trị counter SAU khi tăng.
   */
  public async incrBy(key: string, increment = 1): Promise<number> {
    const client = await this.getClient();
    return await client.incrBy(key, increment);
  }

  // ── Hash ───────────────────────────────────────────────────────────────────

  /** HGET — đọc 1 field trong hash. Field/key không tồn tại → `null`. */
  public async hGet(key: string, field: string): Promise<string | null> {
    const client = await this.getClient();
    return await client.hGet(key, field);
  }

  /** HMGET — đọc nhiều fields trong 1 command. Field thiếu → `null` tại vị trí đó. */
  public async hmGet(key: string, fields: string[]): Promise<(string | null)[]> {
    const client = await this.getClient();
    return await client.hmGet(key, fields);
  }

  /**
   * HINCRBY — tăng 1 field số trong hash atomically.
   * @returns Giá trị field SAU khi tăng.
   */
  public async hIncrBy(key: string, field: string, increment = 1): Promise<number> {
    const client = await this.getClient();
    return await client.hIncrBy(key, field, increment);
  }

  // ── Set ────────────────────────────────────────────────────────────────────

  /**
   * SADD — thêm 1 hoặc nhiều members vào set.
   * @returns Số member MỚI được thêm (member đã có không tính).
   */
  public async sAdd(key: string, members: string | string[]): Promise<number> {
    const client = await this.getClient();
    return await client.sAdd(key, members);
  }

  /** SISMEMBER — member có trong set không. */
  public async sIsMember(key: string, member: string): Promise<boolean> {
    const client = await this.getClient();
    // node-redis type khai number (0|1); runtime một số bản trả boolean — Boolean() cover cả hai.
    return Boolean(await client.sIsMember(key, member));
  }

  // ── Sorted Set ─────────────────────────────────────────────────────────────

  /**
   * ZADD — thêm/update 1 hoặc nhiều members kèm score.
   * @returns Số member MỚI được thêm (member đã có, chỉ update score, không tính —
   * trừ khi truyền `{ CH: true }` để đếm cả member bị thay đổi score).
   */
  public async zAdd(key: string, members: SortedSetMember | SortedSetMember[], options?: ZAddOptions): Promise<number> {
    const client = await this.getClient();
    return await client.zAdd(key, members, options);
  }

  /** ZSCORE — lấy score của 1 member. Member/key không tồn tại → `null`. */
  public async zScore(key: string, member: string): Promise<number | null> {
    const client = await this.getClient();
    return await client.zScore(key, member);
  }

  /**
   * ZINCRBY — tăng score của 1 member atomically. Member chưa tồn tại → khởi
   * tạo score 0 rồi tăng. Dùng cho leaderboard cộng điểm, sliding-window counter.
   * @returns Score SAU khi tăng.
   */
  public async zIncrBy(key: string, member: string, increment: number): Promise<number> {
    const client = await this.getClient();
    return await client.zIncrBy(key, increment, member);
  }

  /**
   * ZRANGE — lấy members theo khoảng index/score/lex (tuỳ `options.BY`).
   * Mặc định trả theo **index** (0-based); ví dụ lấy top-N theo score cần
   * combine `REV: true` với index `[0, N-1]`.
   */
  public async zRange(
    key: string,
    min: number | string,
    max: number | string,
    options?: ZRangeOptions,
  ): Promise<string[]> {
    const client = await this.getClient();
    return await client.zRange(key, min, max, options);
  }

  /** ZRANGE kèm score — dùng khi caller cần hiển thị điểm (leaderboard UI). */
  public async zRangeWithScores(
    key: string,
    min: number | string,
    max: number | string,
    options?: ZRangeOptions,
  ): Promise<SortedSetMember[]> {
    const client = await this.getClient();
    return await client.zRangeWithScores(key, min, max, options);
  }

  /** ZRANGEBYSCORE — lấy members có score trong [min, max]. Dùng `"-inf"`/`"+inf"` cho biên vô hạn. */
  public async zRangeByScore(
    key: string,
    min: number | string,
    max: number | string,
    options?: ZRangeByScoreOptions,
  ): Promise<string[]> {
    const client = await this.getClient();
    return await client.zRangeByScore(key, min, max, options);
  }

  /**
   * ZREMRANGEBYSCORE — xoá members có score trong [min, max].
   *
   * ⚠️ Sliding-window rate-limit **không** nên ghép tay 3 lệnh
   * (ZREMRANGEBYSCORE → ZADD → ZCARD): 3 round-trip = 3 lần có thể timeout, mỗi
   * lần là 1 trạng thái UNKNOWN (xem đầu file), và không atomic với request khác.
   * Dùng 1 Lua script qua `getClient()` để cả window logic chạy trong 1 lệnh.
   *
   * @returns Số member đã xoá.
   */
  public async zRemRangeByScore(key: string, min: number | string, max: number | string): Promise<number> {
    const client = await this.getClient();
    return await client.zRemRangeByScore(key, min, max);
  }

  /**
   * ZREM — xoá 1 hoặc nhiều members khỏi sorted set.
   * @returns Số member đã xoá.
   */
  public async zRem(key: string, members: string | string[]): Promise<number> {
    const client = await this.getClient();
    return await client.zRem(key, members);
  }

  /** ZCARD — số lượng member trong sorted set. */
  public async zCard(key: string): Promise<number> {
    const client = await this.getClient();
    return await client.zCard(key);
  }

  /** ZRANK — rank của member (0-based, score thấp → cao). Member/key không tồn tại → `null`. */
  public async zRank(key: string, member: string): Promise<number | null> {
    const client = await this.getClient();
    return await client.zRank(key, member);
  }

  // ── Transaction ────────────────────────────────────────────────────────────

  /**
   * MULTI — mở transaction, queue nhiều lệnh chạy atomic trong 1 round-trip.
   *
   * Redis MULTI/EXEC KHÔNG rollback khi 1 lệnh lỗi giữa transaction (khác
   * MongoDB session) — mọi lệnh đã queue vẫn chạy hết, lỗi chỉ nằm trong kết
   * quả tại đúng vị trí lệnh đó. Dùng khi cần atomicity (không interleave với
   * lệnh khác) — KHÔNG dùng để đảm bảo all-or-nothing.
   *
   * @example
   * const multi = await repo.multi();
   * const results = await multi.incrBy("wallet:a", -amount).incrBy("wallet:b", amount).exec();
   */
  public async multi(): Promise<RedisMultiCommand> {
    const client = await this.getClient();
    return client.multi();
  }

  // ── Scripting ──────────────────────────────────────────────────────────────

  /**
   * EVAL — chạy Lua script (gửi full script mỗi lần).
   *
   * Dùng khi chưa cache SHA, hoặc sau `NOSCRIPT` (Redis restart / `SCRIPT FLUSH`).
   * Reply là `unknown` — caller tự narrow theo contract của script (Lua có thể
   * trả number, string, array…). FAIL-FAST: throw khi connect/command lỗi.
   *
   * ⚠️ `EVAL` **tự nạp** script vào script cache của Redis — sau lệnh này `evalSha` với SHA1 của
   * chính script đó đã hit. KHÔNG gọi `scriptLoad` sau `eval` (RTT thừa).
   *
   * ⚠️ Trần thời gian là việc của caller (`withDeadline` ở adapter fail-open).
   * Repo không nhận `commandOptions` — xem JSDoc đầu file.
   *
   * @param script - Nguồn Lua đầy đủ.
   * @param keys   - `KEYS[1..N]` truyền vào script.
   * @param args   - `ARGV[1..N]` — luôn string (Redis ép mọi ARGV về string).
   */
  public async eval(script: string, keys: string[], args: string[]): Promise<unknown> {
    const client = await this.getClient();
    return await client.eval(script, { keys, arguments: args });
  }

  /**
   * EVALSHA — chạy script đã nạp theo SHA1 digest.
   *
   * Rẻ hơn `eval` (1 RTT, không gửi lại body script). Throw `NOSCRIPT` nếu Redis
   * chưa có script trong script cache — caller bắt rồi fallback **chỉ** `eval`
   * (`EVAL` tự nạp cache; không cần `scriptLoad`). FAIL-FAST như mọi method khác.
   *
   * SHA1 tính **local** bằng `node:crypto` từ đúng text script — không hỏi Redis.
   *
   * @param sha  - SHA1 hex tính local (hoặc trả về từ `scriptLoad`).
   * @param keys - `KEYS[1..N]`.
   * @param args - `ARGV[1..N]` (string).
   */
  public async evalSha(sha: string, keys: string[], args: string[]): Promise<unknown> {
    const client = await this.getClient();
    return await client.evalSha(sha, { keys, arguments: args });
  }

  /**
   * SCRIPT LOAD — nạp script vào script cache của Redis, trả SHA1 để dùng với
   * `evalSha`. SHA sống đến khi Redis restart / `SCRIPT FLUSH`.
   *
   * ⚠️ Hầu hết trường hợp **KHÔNG cần** method này. Pattern đúng (node-redis cũng làm vậy):
   * tính SHA1 local bằng `node:crypto` → `evalSha` → bắt `NOSCRIPT` → `eval` (tự nạp lại).
   * Xem `RateLimiter.evalGcra` (`packages/guard`). Chỉ dùng `scriptLoad` khi cần **preload** script
   * ở thời điểm tách rời lần chạy đầu (VD warmup job), không dùng trên hot path.
   *
   * @param script - Nguồn Lua đầy đủ.
   * @returns SHA1 hex (40 chars).
   */
  public async scriptLoad(script: string): Promise<string> {
    const client = await this.getClient();
    return await client.scriptLoad(script);
  }
}
