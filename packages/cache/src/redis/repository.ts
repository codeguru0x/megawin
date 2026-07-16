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

import getRedisClient from "./client";
import { DEFAULT_REDIS_ENV_KEY, DELETE_BATCH_SIZE } from "../constants";
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
   * @param redisEnvKey - env key chứa Redis URI
   */
  constructor(redisEnvKey: string = DEFAULT_REDIS_ENV_KEY) {
    this.redisEnvKey = redisEnvKey;
  }

  /**
   * Lấy Redis client (singleton per env key, tự connect lần đầu).
   * Throw nếu thiếu env hoặc connect thất bại.
   *
   * @param commandOptions - Nếu truyền, trả về "proxy client" (theo doc redis@6)
   *   với command options này (timeout, abortSignal…) áp cho mọi lệnh gọi qua
   *   proxy. Proxy chỉ là `Object.create(client)` + ghi đè `_commandOptions` —
   *   KHÔNG mở connection mới, dùng chung socket/queue với client gốc, chi phí
   *   tạo không đáng kể so với 1 round-trip Redis. KHÔNG cache proxy: client gốc
   *   giữ default `timeout` 5s nên lock/ví… trỏ cùng instance không bị ép 300ms.
   *   Không truyền → dùng thẳng client gốc.
   */
  public async getClient(commandOptions?: RedisCommandOptions): Promise<RedisClient> {
    const client = await getRedisClient(this.redisEnvKey);
    return commandOptions ? client.withCommandOptions(commandOptions) : client;
  }

  // ── JSON layer ─────────────────────────────────────────────────────────────

  /**
   * SET value dạng JSON với TTL tuỳ chọn.
   * `undefined` được chuẩn hoá thành `null` (JSON không có undefined).
   *
   * @param commandOptions - Command options (VD timeout ngắn cho hot path cache).
   */
  public async setJson<T>(
    key: string,
    value: T,
    expiresInSec?: number,
    commandOptions?: RedisCommandOptions,
  ): Promise<void> {
    await this.set(key, JSON.stringify(value ?? null), expiresInSec, commandOptions);
  }

  /**
   * GET value dạng JSON.
   * Trả `null` khi key không tồn tại HOẶC value không parse được (data corrupt
   * coi như miss — không throw để caller không nổ vì rác trong Redis).
   *
   * @param commandOptions - Command options (VD timeout ngắn cho hot path cache).
   */
  public async getJson<T>(key: string, commandOptions?: RedisCommandOptions): Promise<T | null> {
    const raw = await this.get(key, commandOptions);
    if (raw === null) return null;

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  // ── String layer ───────────────────────────────────────────────────────────

  /**
   * GET string thô. Key không tồn tại → `null`.
   *
   * @param commandOptions - Command options (VD timeout ngắn cho hot path cache).
   */
  public async get(key: string, commandOptions?: RedisCommandOptions): Promise<string | null> {
    const client = await this.getClient(commandOptions);
    return await client.get(key);
  }

  /**
   * SET string thô. `expiresInSec > 0` → kèm `EX` (TTL seconds);
   * bỏ trống → key sống vô hạn (chỉ dùng cho data chủ động quản lý lifecycle).
   *
   * @param commandOptions - Command options (VD timeout ngắn cho hot path cache).
   */
  public async set(
    key: string,
    value: string,
    expiresInSec?: number,
    commandOptions?: RedisCommandOptions,
  ): Promise<void> {
    const client = await this.getClient(commandOptions);

    if (expiresInSec !== undefined && expiresInSec > 0) {
      await client.set(key, value, { EX: expiresInSec });
      return;
    }
    await client.set(key, value);
  }

  /**
   * DEL 1 hoặc nhiều keys trong 1 command.
   *
   * @param commandOptions - Command options (VD timeout ngắn cho hot path cache).
   * @returns Số key thực sự bị xoá (key không tồn tại không tính).
   */
  public async delete(
    keys: string | string[],
    commandOptions?: RedisCommandOptions,
  ): Promise<number> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (list.length === 0) return 0;

    const client = await this.getClient(commandOptions);
    return await client.del(list);
  }

  /**
   * Xoá mọi key bắt đầu bằng prefix — SCAN cursor-based + DEL theo batch.
   * KHÔNG dùng KEYS (block Redis với keyspace lớn). Thao tác admin
   * (invalidate namespace, bump version) — không gọi trên hot path.
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
  public async incrBy(key: string, increment: number = 1): Promise<number> {
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
  public async hIncrBy(key: string, field: string, increment: number = 1): Promise<number> {
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
    return (await client.sIsMember(key, member)) === 1;
  }

  // ── Sorted Set ─────────────────────────────────────────────────────────────

  /**
   * ZADD — thêm/update 1 hoặc nhiều members kèm score.
   * @returns Số member MỚI được thêm (member đã có, chỉ update score, không tính —
   * trừ khi truyền `{ CH: true }` để đếm cả member bị thay đổi score).
   */
  public async zAdd(
    key: string,
    members: SortedSetMember | SortedSetMember[],
    options?: ZAddOptions,
  ): Promise<number> {
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
   * Dùng cho sliding-window rate-limit: xoá event cũ hơn window trước khi ZCARD đếm.
   * @returns Số member đã xoá.
   */
  public async zRemRangeByScore(
    key: string,
    min: number | string,
    max: number | string,
  ): Promise<number> {
    const client = await this.getClient();
    return await client.zRemRangeByScore(key, min, max);
  }

  /** ZREM — xoá 1 hoặc nhiều members khỏi sorted set. @returns Số member đã xoá. */
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
}
