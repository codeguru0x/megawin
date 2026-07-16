/**
 * NoopCacheStore — cache "tắt": get luôn miss, set/delete no-op.
 *
 * Dùng cho:
 * - Unit test use-case (hành vi giống không có cache — mọi lần đều gọi loader).
 * - Tắt cache qua env (`CACHE_DISABLED=true`) khi debug production issue.
 *
 * Cùng contract CacheStore nên swap vào không cần đổi code consumer.
 */

import type { CacheStore } from "../types";

/** Cache no-op: đọc luôn miss, ghi/xoá không làm gì. */
export class NoopCacheStore implements CacheStore {
  /** Luôn trả `undefined` — buộc caller chạy loader mỗi lần. */
  async get<T>(): Promise<T | undefined> {
    return undefined;
  }

  /** No-op — không lưu gì. */
  async set(): Promise<void> {}

  /** No-op — không có gì để xoá. */
  async delete(): Promise<void> {}

  /** No-op — không có gì để xoá. */
  async deleteByPrefix(): Promise<void> {}
}
