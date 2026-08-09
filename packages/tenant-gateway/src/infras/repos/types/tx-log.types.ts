/**
 * Types cho `TxLogRepository`.
 *
 * Tách khỏi repo class để UI/use-case layer có thể import type độc lập
 * (không kéo theo mapper / mongo client).
 */

import type { TxLogEventType, TxLogStatus } from "../../../entities/enums";
import type { TxLogDoc, TxLogEntity } from "../../../entities/tx-log";

/**
 * Shape doc insert vào `tx_logs` — `TxLogDoc` bỏ `_id` (Mongo tự sinh).
 *
 * Dùng chung giữa repo (`upsertLog` / `upsertLogs`) và write-side use cases
 * (`LogTxUseCase` / `LogTxBulkUseCase`) qua helper `buildTxLogInsertDoc`.
 * Payload ở đây đã được serialize thành JSON string — xem
 * {@link TxLogDoc.requestPayload} / {@link TxLogDoc.responsePayload}.
 */
export type TxLogInsertDoc = Omit<TxLogDoc, "_id">;

/**
 * Filter cho list UI — tra cứu theo `tx` chính xác HOẶC range thời gian + status.
 *
 * Ưu tiên `tx` khi có giá trị — range sẽ bị ignore (tránh vô tình miss record
 * do lệch phân giây). Các filter còn lại (`status`, `tenantId`, `eventType`,
 * `batchId`) combine theo $and.
 */
export interface ListTxLogsFilter {
  /** Exact match `tx`. Khi set → ignore `from`/`to`. */
  tx?: string;
  /** Lower bound `createdAt >= from`. */
  from?: Date;
  /** Upper bound `createdAt <= to`. */
  to?: Date;
  /** `"success"` hoặc `"failed"`. */
  status?: TxLogStatus;
  tenantId?: string;
  eventType?: TxLogEventType;
  /** Khi set → list tất cả items trong batch này. */
  batchId?: string;
}

/**
 * Option phân trang cursor-based.
 *
 * Sort chuẩn: `createdAt DESC, _id DESC`. Cursor chứa cặp `(createdAt, id)`
 * của record cuối cùng ở page trước.
 */
export interface ListTxLogsOptions {
  /** Số record lấy mỗi trang. Cap ở layer trên — repo không tự cap. */
  limit: number;
  /** `null` / `undefined` = page đầu. */
  cursor?: { createdAt: Date; id: string } | null;
}

/**
 * Output shape của `listLogs` — data + nextCursor cho infinite scroll.
 */
export interface ListTxLogsResult {
  data: TxLogEntity[];
  nextCursor: { createdAt: string; id: string } | null;
}

/**
 * Filter cho `aggregateSummary` — narrow hơn `ListTxLogsFilter`, bỏ cursor /
 * pagination / tx exact-match (summary luôn chạy theo range).
 *
 * Các filter optional khác (`status`, `eventType`, `tenantId`) cố tình không
 * có — summary chạy trên **toàn bộ** range để cho con số tổng; filter UI chỉ
 * áp dụng ở bảng list, không làm biến dạng KPI.
 */
export interface AggregateTxLogsSummaryFilter {
  /** Lower bound `createdAt >= from`. */
  from: Date;
  /** Upper bound `createdAt <= to`. */
  to: Date;
}

/**
 * Output của `aggregateSummary` — raw count từ MongoDB.
 *
 * Tỷ lệ % + formatted string tính ở use-case/UI layer.
 */
export interface AggregateTxLogsSummaryResult {
  /** Tổng số docs (= số transaction được log) trong range. */
  total: number;
  /** Docs có `status = success`. */
  successCount: number;
  /** Docs có `status = failed`. */
  failedCount: number;
  /**
   * Docs thuộc nhóm "uncertainty" — WAL còn giữ, cần reconcile:
   * `code` ∈ { TIMEOUT, NETWORK_ERROR, HTTP_5xx, BATCH_REJECTED }.
   * Business reject (INSUFFICIENT_BALANCE, INVALID_SESSION, …) KHÔNG tính.
   */
  uncertainCount: number;
}
