/**
 * Game Core – Entry Change Sequence
 *
 * Collection: entryChangeSeq
 *
 * Mục đích: cấp phát số thứ tự thay đổi (change version) tăng dần
 * cho mỗi entry khi đơn cược được tạo mới hoặc thay đổi trạng thái.
 *
 * Cách hoạt động:
 * - 1 document duy nhất (singleton) với key = "global".
 * - _id là ObjectId chuẩn MongoDB.
 * - Field `seq` là BigInt64 (BSON Long / Int64) – đảm bảo không bao giờ tràn số.
 * - Mỗi lần cần version mới: findOneAndUpdate + $inc: { seq: Long(1) }.
 * - Giá trị seq trả về được gán cho entry trong entryFeed.
 *
 * Sequence là GLOBAL cho toàn hệ thống (tất cả game dùng chung 1 counter).
 * Đảm bảo version tăng liên tục, tenant chỉ cần 1 cursor duy nhất
 * để poll tất cả thay đổi bất kể game nào.
 *
 * Tại sao BigInt64:
 * - JavaScript number chỉ safe đến 2^53. Hệ thống lottery có volume cao,
 *   dùng Int64 (max ~9.2 × 10^18) đảm bảo an toàn lâu dài.
 * - MongoDB native Long type, không cần custom serialization.
 */

import type { Long } from "mongodb";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────

/**
 * Key cố định cho document singleton.
 * Unique index trên field `key` trong collection `entryChangeSeq`.
 * Toàn hệ thống chỉ có 1 document duy nhất với key này.
 */
export const ENTRY_CHANGE_SEQ_KEY = "global" as const;

// ─────────────────────────────────────────────
// Sequence Document
// ─────────────────────────────────────────────

/**
 * Document singleton lưu giá trị sequence hiện tại.
 *
 * Collection `entryChangeSeq` chỉ chứa đúng 1 document.
 * Worker dùng atomic `findOneAndUpdate` + `$inc` để lấy version mới.
 */
export interface EntryChangeSeqDoc {
  /**
   * MongoDB ObjectId chuẩn – tự sinh khi upsert lần đầu.
   * Không dùng làm lookup key (dùng field `key` thay thế).
   */
  _id: unknown;

  /**
   * Key định danh singleton, luôn = "global".
   * Unique index trên field này.
   * Worker query bằng `{ key: "global" }` để findOneAndUpdate.
   * Lý do tách riêng thay vì dùng `_id`: _id phải là ObjectId
   * theo convention chung của hệ thống.
   */
  key: typeof ENTRY_CHANGE_SEQ_KEY;

  /**
   * Giá trị sequence hiện tại (BSON Long / Int64).
   *
   * Bắt đầu từ 0, tăng monotonically (không bao giờ giảm).
   * Mỗi lần worker allocate N versions: $inc { seq: Long(N) }.
   * Giá trị sau $inc = version cuối cùng trong batch.
   *
   * Ví dụ: seq = 100, allocate(3) → seq thành 103,
   * worker nhận range [101, 102, 103].
   */
  seq: Long;

  /**
   * Thời điểm lần cuối allocate sequence (UTC).
   * Dùng cho monitoring: nếu updatedAt quá cũ → worker có thể bị treo.
   */
  updatedAt: Date;
}

// ─────────────────────────────────────────────
// Helper types cho application layer
// ─────────────────────────────────────────────

/**
 * Kết quả trả về khi allocate 1 batch sequence numbers.
 *
 * Worker gọi `allocateSeq(count)` → nhận range [startSeq, endSeq].
 * Gán lần lượt mỗi version cho mỗi feed entry trước khi insert.
 */
export interface SeqAllocation {
  /**
   * Sequence đầu tiên trong batch (inclusive).
   * Ví dụ: nếu allocate 3 từ seq = 100 → startSeq = 101.
   */
  startSeq: Long;

  /**
   * Sequence cuối cùng trong batch (inclusive).
   * = giá trị seq trong DB sau khi $inc.
   * Ví dụ: nếu allocate 3 từ seq = 100 → endSeq = 103.
   */
  endSeq: Long;
}
