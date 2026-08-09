import { DispatchOrderStatus, DispatchSourceKind } from "../../entities/enums";

/**
 * Nhãn hiển thị tiếng Việt cho `DispatchOrderStatus`.
 *
 * Dùng cho bảng + filter dropdown trong BO. Không đổi theo locale — chỉ VN.
 */
export const DISPATCH_ORDER_STATUS_LABELS: Record<DispatchOrderStatus, string> = {
  [DispatchOrderStatus.Pending]: "Đang chờ",
  [DispatchOrderStatus.Dispatched]: "Đã gửi",
  [DispatchOrderStatus.Cancelled]: "Đã huỷ",
};

/**
 * Badge variant (shadcn) cho từng status.
 *
 * - `Pending` → `secondary` (muted, ám vàng nhẹ qua icon).
 * - `Dispatched` → `default` (primary — OK).
 * - `Cancelled` → `outline` (flat, không nổi bật).
 */
export const DISPATCH_ORDER_STATUS_VARIANT: Record<DispatchOrderStatus, "default" | "secondary" | "outline"> = {
  [DispatchOrderStatus.Pending]: "secondary",
  [DispatchOrderStatus.Dispatched]: "default",
  [DispatchOrderStatus.Cancelled]: "outline",
};

/**
 * Nhãn cho `DispatchSourceKind` — phân loại nội bộ MegaWin.
 *
 * Không trùng label với `TransactionReason` vì cùng 1 `reason=adjustment`
 * có thể là nhiều `sourceKind` khác nhau (hiện chỉ `reversal`, nhưng có thể
 * mở rộng ở Giai đoạn 2).
 */
export const DISPATCH_SOURCE_KIND_LABELS: Record<DispatchSourceKind, string> = {
  [DispatchSourceKind.Payout]: "Trả thưởng",
  [DispatchSourceKind.Refund]: "Hoàn cược",
  [DispatchSourceKind.Reversal]: "Thu hồi",
};

/**
 * Retry mode — FE-only enum dùng cho filter nhanh theo tình trạng retry.
 *
 * - `fresh`: `retryCount` chưa tồn tại (chưa từng thử dispatch).
 * - `retrying`: `retryCount >= 1` AND `< RETRY_ALERT_THRESHOLD` (đang retry bình thường).
 * - `stuck`: `retryCount >= RETRY_ALERT_THRESHOLD` (cần chú ý).
 */
export type DispatchRetryMode = "fresh" | "retrying" | "stuck";

/** Nhãn hiển thị cho `DispatchRetryMode`. */
export const DISPATCH_RETRY_MODE_LABELS: Record<DispatchRetryMode, string> = {
  fresh: "Chưa thử",
  retrying: "Đang retry",
  stuck: "Stuck",
};
