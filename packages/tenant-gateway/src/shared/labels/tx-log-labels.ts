/**
 * Labels hiển thị cho `TxLogStatus` / `TxLogEventType`.
 *
 * Đặt ở package `tenant-gateway` (không phải FE) để FE/BE chia sẻ cùng nguồn
 * dịch — khi enum thay đổi, compile-time check bảo đảm label luôn phủ đủ.
 */

import { TxLogEventType, TxLogStatus } from "../../entities/enums";

/** Label hiển thị cho status. */
export const TX_LOG_STATUS_LABELS: Record<TxLogStatus, string> = {
  [TxLogStatus.Success]: "Thành công",
  [TxLogStatus.Failed]: "Thất bại",
};

/**
 * Variant badge theo status — map sang shadcn/ui badge variants.
 *
 * - `default` = xanh/primary (success).
 * - `destructive` = đỏ (failed).
 */
export const TX_LOG_STATUS_VARIANT: Record<TxLogStatus, "default" | "destructive"> = {
  [TxLogStatus.Success]: "default",
  [TxLogStatus.Failed]: "destructive",
};

/** Label hiển thị cho eventType. */
export const TX_LOG_EVENT_TYPE_LABELS: Record<TxLogEventType, string> = {
  [TxLogEventType.Transaction]: "Single",
  [TxLogEventType.BatchTransaction]: "Batch",
};
