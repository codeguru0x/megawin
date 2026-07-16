/**
 * MemoryCacheStore — L1 in-process cache, wrapper mỏng trên `lru-cache`.
 *
 * Tái dùng đúng pattern đã kiểm chứng ở tenant-gateway. Đồng bộ nội bộ nhưng
 * expose async interface để đồng nhất với Redis (consumer swap backend không sửa code).
 *
 * Bound memory bằng `max` (số entry) — BẮT BUỘC, quan trọng với process
 * long-running (Next.js server, Lambda container). Khi đầy, `lru-cache` tự
 * evict entry ít dùng gần nhất (LRU) để nhường slot — KHÔNG crash, KHÔNG leak,
 * KHÔNG throw. Cái giá duy nhất khi `max` quá nhỏ so với nhu cầu là hit-rate
 * giảm (evict sớm → gọi loader/DB nhiều hơn), không phải lỗi kỹ thuật.
 *
 * TTL per-entry qua `set(key, value, ttlSec)`.
 */

import { LRUCache } from "lru-cache";
import type { CacheStore } from "../types";

export interface MemoryCacheStoreOptions {
  /**
   * Số entry tối đa — LRU evict entry ít dùng nhất khi đầy. Bound memory theo
   * SỐ LƯỢNG, bắt buộc. Không crash khi vượt: chỉ evict để nhường chỗ.
   */
  max: number;
}

/**
 * L1 cache in-process bound bằng LRU. Fail-open theo contract CacheStore:
 * mọi thao tác chỉ đọc/ghi RAM nên không có lỗi backend để nuốt.
 */
export class MemoryCacheStore implements CacheStore {
  // lru-cache yêu cầu value non-null — envelope của cached-fetcher đảm bảo là object.
  private readonly cache: LRUCache<string, object>;

  constructor(options: MemoryCacheStoreOptions) {
    this.cache = new LRUCache<string, object>({
      max: options.max,
      // Không tự purge expired — evict lazy khi access hoặc khi cần slot.
      // Tiết kiệm CPU (không có timer quét nền); entry hết hạn chưa bị đọc lại
      // vẫn giữ slot cho tới khi LRU đẩy ra — chấp nhận được cho L1.
      ttlAutopurge: false,
    });
  }

  /**
   * Đọc value theo key. Miss hoặc entry đã hết TTL → `undefined`.
   * Không bao giờ throw (chỉ đọc RAM).
   *
   * @param key - Cache key đầy đủ.
   * @returns Value đã cache, hoặc `undefined` khi miss/hết hạn.
   */
  async get<T>(key: string): Promise<T | undefined> {
    return this.cache.get(key) as T | undefined;
  }

  /**
   * Ghi value với TTL. `ttlSec <= 0` → no-op (không cho key sống vô hạn).
   * Không bao giờ throw. Ghi khi cache đầy sẽ evict entry LRU cũ.
   *
   * @param key    - Cache key đầy đủ.
   * @param value  - Value (envelope object của cached-fetcher).
   * @param ttlSec - TTL tính bằng giây; `<= 0` bỏ qua không lưu.
   */
  async set<T>(key: string, value: T, ttlSec: number): Promise<void> {
    if (ttlSec <= 0) {
      return;
    }

    this.cache.set(key, value as object, { ttl: ttlSec * 1000 });
  }

  /**
   * Xoá 1 key. Key không tồn tại → no-op. Không bao giờ throw.
   *
   * @param key - Cache key đầy đủ cần xoá.
   */
  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  /**
   * Xoá mọi key bắt đầu bằng `prefix` — quét toàn bộ keys nội bộ (O(n)).
   * Dùng cho invalidate cả entity/namespace (thao tác admin, không hot path).
   * Không bao giờ throw.
   *
   * @param prefix - Tiền tố key cần xoá hàng loạt.
   */
  async deleteByPrefix(prefix: string): Promise<void> {
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
      }
    }
  }
}
