/**
 * TieredCache — composite L1 (memory) → L2 (distributed) cache.
 *
 * - get   : L1 hit → trả ngay (0 network). L1 miss → L2. L2 hit → backfill L1
 *           (fire-and-forget) với TTL ngắn → trả. Cả 2 miss → undefined.
 * - set   : ghi cả 2 tầng ĐỘC LẬP. L2 dùng `ttlSec` caller (source of truth);
 *           L1 dùng `min(ttlSec, l1TtlSec)` — không giữ lâu hơn ý định caller.
 * - delete: xoá cả 2 ĐỘC LẬP. L1 chỉ trong process hiện tại — containers khác
 *           dựa vào TTL L1 ngắn để tự hết hạn → staleness bound = `l1TtlSec`.
 *
 * Quy tắc TTL: L1 TTL = `min(ttlSec, l1TtlSec)`. `l1TtlSec` là hằng số TUYỆT
 * ĐỐI ngắn (staleness bound sau invalidate qua L2), độc lập `ttlSec` — độ tươi
 * là yêu cầu nghiệp vụ, không phải hàm của TTL từng loại cache. `min` chỉ để
 * cache siêu ngắn (ttlSec < l1TtlSec) không bị L1 giữ lâu hơn L2.
 *
 * FAIL-OPEN theo tầng: L1/L2 store con đã tự nuốt lỗi backend, nhưng set/delete
 * vẫn dùng `Promise.allSettled` để 1 tầng lỗi bất thường KHÔNG kéo tầng kia bỏ
 * theo (defense-in-depth) — get/set không bao giờ throw ra consumer.
 */

import type { CacheStore } from "../types";

export interface TieredCacheOptions {
  /** Tầng L1 — thường MemoryCacheStore, latency ~0. */
  l1: CacheStore;
  /** Tầng L2 — thường RedisCacheStore, shared cross-container. */
  l2: CacheStore;
  /**
   * TTL tuyệt đối cho L1 (seconds) — staleness bound sau khi invalidate qua L2.
   * Ngắn (VD 5s): container khác thấy giá trị mới trễ tối đa chừng này. L1 thực
   * dùng `min(ttlSec, l1TtlSec)` để không vượt TTL caller yêu cầu.
   */
  l1TtlSec: number;
}

/**
 * Cache 2 tầng L1→L2, đọc ưu tiên L1 và backfill khi L2 hit, ghi/xoá song song
 * 2 tầng độc lập.
 */
export class TieredCache implements CacheStore {
  private readonly l1: CacheStore;
  private readonly l2: CacheStore;
  private readonly l1TtlSec: number;

  constructor(options: TieredCacheOptions) {
    this.l1 = options.l1;
    this.l2 = options.l2;
    this.l1TtlSec = options.l1TtlSec;
  }

  /**
   * Đọc theo thứ tự L1 → L2. L2 hit thì backfill L1 để lần đọc sau trong
   * container này không chạm network nữa.
   *
   * @param key - Cache key đầy đủ.
   * @returns Value từ L1 hoặc L2; `undefined` khi cả 2 miss.
   */
  async get<T>(key: string): Promise<T | undefined> {
    const fromL1 = await this.l1.get<T>(key);
    if (fromL1 !== undefined) return fromL1;

    const fromL2 = await this.l2.get<T>(key);
    if (fromL2 !== undefined) {
      // Backfill L1 fire-and-forget: không await để không cộng latency ghi L1
      // vào đường đọc. L1 là MemoryCacheStore (ghi RAM, không throw) nên bỏ
      // await an toàn; consumer nhận value ngay.
      //
      // Dùng thẳng `l1TtlSec`: get không biết `ttlSec` gốc của entry L2 (redis
      // GET không trả TTL còn lại), mà `l1TtlSec` đã là staleness bound ngắn
      // nên an toàn — L1 không giữ lâu hơn ngưỡng cho phép.
      void this.l1.set(key, fromL2, this.l1TtlSec);
    }
    return fromL2;
  }

  /**
   * Ghi value vào cả 2 tầng song song, độc lập.
   *
   * L2 dùng `ttlSec` caller yêu cầu; L1 dùng `min(ttlSec, l1TtlSec)` — không
   * giữ data lâu hơn ý định caller (case `ttlSec` < `l1TtlSec`) và cũng không
   * vượt staleness bound.
   *
   * @param key    - Cache key đầy đủ.
   * @param value  - Value JSON-serializable.
   * @param ttlSec - TTL của L2 (source of truth), giây.
   */
  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    // allSettled: 1 tầng reject bất thường không hủy ghi tầng kia (2 tầng độc lập).
    await Promise.allSettled([
      this.l1.set(key, value, Math.min(ttlSec, this.l1TtlSec)),
      this.l2.set(key, value, ttlSec),
    ]);
  }

  /**
   * Xoá key ở cả 2 tầng song song, độc lập. Gọi từ invalidate use-case.
   *
   * @param key - Cache key đầy đủ cần xoá.
   */
  async delete(key: string): Promise<void> {
    await Promise.allSettled([this.l1.delete(key), this.l2.delete(key)]);
  }

  /**
   * Xoá mọi key theo prefix ở cả 2 tầng song song, độc lập (thao tác admin).
   *
   * @param prefix - Tiền tố key cần xoá hàng loạt.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    await Promise.allSettled([this.l1.deleteByPrefix(prefix), this.l2.deleteByPrefix(prefix)]);
  }
}
