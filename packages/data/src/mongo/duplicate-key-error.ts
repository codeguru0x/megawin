/**
 * MongoDB – Helper nhận diện & xử lý lỗi duplicate key (11000)
 *
 * Dùng chung cho 2 pattern ghi hay gặp trong toàn hệ thống (mongodb.mdc §8.6):
 * 1. **Bulk write delta idempotent**: `$inc` + watermark `lastEntryId:{$lt:batchMaxId}` trong
 *    CÙNG 1 lệnh `upsert`. Batch đã áp trước đó (worker crash rồi retry) → filter không khớp →
 *    upsert cố insert doc trùng unique index → 11000 = **no-op ĐÚNG THIẾT KẾ**, không phải lỗi.
 * 2. **Bulk insert "insert-if-not-exists"**: `insertMany({ ordered: false })` — record đã tồn
 *    tại raise 11000 cho riêng record đó, các record khác trong batch vẫn insert bình thường.
 *
 * Cả 2 pattern đều BẮT BUỘC `{ ordered: false }` — nếu `ordered: true`, op đầu tiên bị 11000 sẽ
 * chặn toàn bộ op còn lại trong batch.
 */

import type { BulkWriteResult } from "mongodb";

/**
 * true khi `error` (1 write error đơn — KHÔNG phải `MongoBulkWriteError` chứa `writeErrors[]`)
 * là duplicate key (11000).
 *
 * Kiểm cả 2 shape `error.code` (native `MongoServerError`, vd lỗi từ `findOneAndUpdate` đơn) và
 * `error.err.code` (dạng lồng xuất hiện trong từng phần tử `writeErrors` của bulk operation) —
 * driver không luôn đồng nhất shape giữa 2 nguồn lỗi này.
 */
export function isDuplicateKeyError(error: unknown): boolean {
  const err = error as { code?: number; err?: { code?: number } } | null;
  return err?.code === 11000 || err?.err?.code === 11000;
}

/**
 * true khi MỌI write error trong 1 `MongoBulkWriteError` đều là duplicate key (11000).
 *
 * `MongoBulkWriteError.writeErrors` khai `OneOrMore<WriteError>` — có thể là 1 object đơn lẻ,
 * không phải luôn là mảng; và `error.code` top-level chỉ phản ánh lỗi ĐẦU TIÊN nên không đủ để
 * kết luận cho cả batch (batch có thể trộn 11000 với lỗi khác).
 *
 * Phân nhánh theo **sự hiện diện của field `writeErrors`**, KHÔNG theo `length > 0`:
 * - Có `writeErrors` (là bulk error) → mọi phần tử phải là 11000. Mảng RỖNG (`[]`) trả `false`:
 *   bulk lỗi mà không có write error nào (vd `WriteConcernError`) KHÔNG phải "toàn 11000", tránh
 *   rơi xuống kiểm `error.code` — vốn chỉ phản ánh lỗi đầu tiên nên có thể nuốt nhầm lỗi khác.
 * - Không có `writeErrors` (là `MongoServerError` đơn từ `findOneAndUpdate`/`insertOne`) → kiểm
 *   trực tiếp `error.code`.
 */
export function isOnlyDuplicateKeyError(error: unknown): boolean {
  const raw = (error as { writeErrors?: unknown } | null)?.writeErrors;

  if (raw !== undefined) {
    const writeErrors = Array.isArray(raw) ? raw : [raw];
    return writeErrors.length > 0 && writeErrors.every((e) => isDuplicateKeyError(e));
  }

  return isDuplicateKeyError(error);
}

/**
 * Chạy 1 bulk write delta và **bỏ qua lỗi duplicate key (11000)**.
 *
 * Với pattern watermark (mongodb.mdc §8.6), 11000 KHÔNG phải lỗi: nó nghĩa là batch đã được áp
 * trước đó (worker crash rồi retry) nên filter `lastEntryId:{$lt}` không còn khớp và `upsert` cố
 * insert doc trùng unique index → **đúng ngữ nghĩa no-op**. Mọi lỗi khác vẫn throw để không che
 * bug thật.
 *
 * Bắt buộc dùng kèm `{ ordered: false }` — nếu `ordered: true`, op đầu tiên bị 11000 sẽ chặn toàn
 * bộ op còn lại trong batch.
 *
 * @param run - Thunk thực hiện `bulkWrite(ops, { ordered: false })`.
 */
export async function runDeltaBulkWrite(run: () => Promise<BulkWriteResult>): Promise<void> {
  try {
    await run();
  } catch (error) {
    if (!isOnlyDuplicateKeyError(error)) {
      throw error;
    }
  }
}
