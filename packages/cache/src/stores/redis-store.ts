/**
 * RedisCacheStore — L2 distributed cache, adapter FAIL-OPEN trên RedisRepository.
 *
 * RedisRepository (`src/redis/repository.ts`) đúng JSON + EX semantics nhưng
 * THROW khi connect/command fail — không dùng trực tiếp trên hot path. Adapter
 * này bọc try/catch + hạ timeout để đảm bảo contract CacheStore:
 * - Mọi lỗi Redis → log + degrade về cache-miss/no-op, KHÔNG throw ra consumer.
 * - Hot path (get/set/delete) hạ command timeout xuống 300ms (redis@6 tự HỦY
 *   command quá hạn qua AbortSignal) — cache chậm hơn DB thì vô nghĩa.
 * - `deleteByPrefix` delegate xuống repo (SCAN + DEL batch, KHÔNG dùng KEYS),
 *   giữ default timeout 5s vì là thao tác admin dài.
 *
 * Backend hiện tại là Redis; tương lai Memcached/DynamoDB DAX… chỉ cần viết
 * store mới implement `CacheStore` — consumer không đổi 1 dòng nào.
 */

import { logWarn } from "@megawin/shared/utils";
import { DEFAULT_REDIS_COMMAND_TIMEOUT_MS, DEFAULT_REDIS_ENV_KEY } from "../constants";
import { RedisRepository } from "../redis/repository";
import type { RedisCommandOptions } from "../redis/types";
import type { CacheStore } from "../types";

export interface RedisCacheStoreOptions {
  /**
   * Env key chứa Redis URI. Mặc định {@link DEFAULT_REDIS_ENV_KEY} (`"REDIS_URI"`).
   *
   * KHÔNG thừa: cho phép trỏ instance Redis riêng khi muốn tách workload nặng
   * (rate-limit, leaderboard…) khỏi instance cache chung. Đa số dùng mặc định.
   */
  redisEnvKey?: string;
  /** Timeout mỗi Redis command (ms). Mặc định 300ms — vượt là coi như miss. */
  commandTimeoutMs?: number;
}

/**
 * Adapter fail-open bọc `RedisRepository`, biến mọi lỗi Redis thành cache-miss
 * để cache không bao giờ là hard dependency trên hot path.
 */
export class RedisCacheStore implements CacheStore {
  private readonly repo: RedisRepository;
  /**
   * Command options áp cho lệnh HOT PATH (get/set/delete): đặt `timeout` ngắn.
   *
   * `redis@6` mặc định timeout mọi command 5s và HỦY command thật (AbortSignal,
   * command chưa ghi socket sẽ bị bỏ khỏi queue) — hơn hẳn `Promise.race` cũ
   * (chỉ bỏ kết quả, command vẫn chạy ngầm). Ta chỉ hạ trần xuống 300ms cho hot
   * path: cache chậm hơn DB thì vô nghĩa. `deleteByPrefix` KHÔNG dùng options
   * này (thao tác admin dài, giữ default 5s của redis).
   *
   * Truyền xuống repo → repo tạo "proxy client" (`Object.create` + ghi đè
   * `_commandOptions`) mỗi lệnh: chi phí không đáng kể so với round-trip Redis,
   * client gốc giữ default 5s nên lock/ví trỏ cùng instance không bị ép 300ms.
   */
  private readonly hotPathOptions: RedisCommandOptions;

  constructor(options: RedisCacheStoreOptions = {}) {
    // Không truyền redisEnvKey → dùng env mặc định chung (DRY, 1 nguồn sự thật).
    this.repo = new RedisRepository(options.redisEnvKey ?? DEFAULT_REDIS_ENV_KEY);
    this.hotPathOptions = {
      timeout: options.commandTimeoutMs ?? DEFAULT_REDIS_COMMAND_TIMEOUT_MS,
    };
  }

  /**
   * Đọc value theo key. FAIL-OPEN: lỗi/timeout Redis → trả `undefined` (miss).
   *
   * @param key - Cache key đầy đủ.
   * @returns Value đã cache, hoặc `undefined` khi miss / Redis lỗi.
   */
  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.repo.getJson<T>(key, this.hotPathOptions);
      // getJson trả null cho cả miss lẫn cached-null — envelope { v } của
      // cached-fetcher nằm bên trong value nên null ở đây luôn là miss.
      return value === null ? undefined : value;
    } catch (err) {
      logWarn("RedisCacheStore", "get lỗi — degrade về cache miss", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
      return undefined;
    }
  }

  /**
   * Ghi value với TTL. FAIL-OPEN: lỗi/timeout Redis → bỏ qua, không throw.
   *
   * `ttlSec <= 0` → no-op (không cho phép key sống vô hạn trong cache).
   *
   * @param key    - Cache key đầy đủ.
   * @param value  - Value JSON-serializable (envelope `{ v }` của cached-fetcher).
   * @param ttlSec - TTL tính bằng giây; `<= 0` bỏ qua.
   */
  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    if (ttlSec <= 0) return;
    try {
      await this.repo.setJson(key, value, ttlSec, this.hotPathOptions);
    } catch (err) {
      logWarn("RedisCacheStore", "set lỗi — bỏ qua (fail-open)", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Xoá 1 key. FAIL-OPEN: lỗi/timeout Redis → bỏ qua, không throw.
   *
   * Gọi từ invalidate use-case sau khi ghi DB. Nếu delete fail, entry vẫn tự
   * hết hạn theo TTL — staleness có cận trên, không kẹt vĩnh viễn.
   *
   * @param key - Cache key đầy đủ cần xoá.
   */
  async delete(key: string): Promise<void> {
    try {
      await this.repo.delete(key, this.hotPathOptions);
    } catch (err) {
      logWarn("RedisCacheStore", "delete lỗi — bỏ qua (fail-open)", {
        key,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /**
   * Xoá mọi key bắt đầu bằng `prefix` (SCAN + DEL batch trong repo).
   * FAIL-OPEN: lỗi Redis → bỏ qua, không throw.
   *
   * KHÔNG truyền `hotPathOptions`: đây là thao tác ADMIN (bump version, flush cả
   * namespace), hiếm gọi và có thể kéo dài hợp lệ khi keyspace lớn → giữ default
   * timeout 5s của redis@6, không ép 300ms. TUYỆT ĐỐI không gọi trên hot path.
   *
   * @param prefix - Tiền tố key cần xoá hàng loạt.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    try {
      // Logic SCAN+DEL batch sống ở RedisRepository.deleteByPrefix.
      await this.repo.deleteByPrefix(prefix);
    } catch (err) {
      logWarn("RedisCacheStore", "deleteByPrefix lỗi — bỏ qua (fail-open)", {
        prefix,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
