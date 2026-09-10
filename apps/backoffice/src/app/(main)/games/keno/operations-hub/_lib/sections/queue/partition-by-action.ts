/**
 * Ops Hub — Tính khả dụng action theo trạng thái (plan §8.1, bảng test §11.2)
 *
 * Ba ràng buộc đã verify trong code use-case (KHÔNG đoán lại — sai 1 ô là mời staff bấm
 * nút chắc chắn lỗi, xem plan §8.1 điểm 1-3):
 * 1. `NeverOpened` (status `scheduled` đã qua `closeAt`) chỉ huỷ được — `CloseSalesUseCase`
 *    filter `status = salesOpen`, kỳ `scheduled` không khớp → `DRAW_INVALID_TRANSITION`.
 * 2. `closable` chỉ đúng `stage = PendingClose` (status `salesOpen` đã qua `closeAt`).
 * 3. `openable` PHẢI tự kiểm `nowMs < closeAtMs` — `OpenSalesUseCase` không tự kiểm (p0-04 §2.4).
 *
 * `isVoidable` KHÔNG còn dùng ở đây — VOID đã bỏ khỏi bulk action bar (plan §B5.2: hành động
 * không thể hoàn tác, ảnh hưởng tiền thật, không đặt cạnh nút thường xuyên dùng). VOID single-row
 * với dialog 2 lớp chặn (gõ `drawId` + checkbox) nằm trong expand panel (`hub-expand-panel.tsx`,
 * bước 7) — dùng trực tiếp `isVoidable` từ `void-draw-rules` tại đó, không qua `ActionPartition`.
 */

import { OpsStage, SaleGate } from "../../derive-draw-state";
import type { DerivedRow } from "../../hub-types";

/** Kết quả phân loại 1 tập `DerivedRow` đã chọn theo 3 action bulk — dùng cho Bulk Action Bar. */
export interface ActionPartition {
  /** `stage = AwaitingSettle` hoặc `NeedsResettle` → kết sổ được. */
  settlable: string[];
  /** `stage = PendingClose` (status `salesOpen`, đã qua `closeAt`) → đóng bán được. */
  closable: string[];
  /** `gate ∈ {PendingOpen, Halted}` VÀ `nowMs < closeAt` → mở bán được. */
  openable: string[];
}

/**
 * Phân loại các dòng đã chọn theo khả năng thực hiện TỪNG action (plan §8.1).
 *
 * Nút bulk PHẢI disable khi không dòng nào đủ điều kiện, và PHẢI hiện đúng số dòng SẼ bị
 * tác động — cho bấm rồi báo lỗi 400 là thiết kế sai.
 */
export function partitionByAction(selected: readonly DerivedRow[], nowMs: number): ActionPartition {
  const settlable: string[] = [];
  const closable: string[] = [];
  const openable: string[] = [];

  for (const row of selected) {
    if (row.stage === OpsStage.AwaitingSettle || row.stage === OpsStage.NeedsResettle) {
      settlable.push(row.drawId);
    }
    if (row.stage === OpsStage.PendingClose) {
      closable.push(row.drawId);
    }
    if ((row.gate === SaleGate.PendingOpen || row.gate === SaleGate.Halted) && nowMs < row.ts.closeAtMs) {
      openable.push(row.drawId);
    }
  }

  return { settlable, closable, openable };
}

/**
 * `true` khi dòng có ÍT NHẤT 1 action BULK khả dụng — quyết định có render checkbox không
 * (guideline §5.3 cột 1: "Chỉ render khi kỳ có ≥1 action khả dụng").
 *
 * KHÔNG tính `isVoidable` — void không còn là bulk action (§B5.2), checkbox không nên bật cho
 * dòng CHỈ voidable (chọn dòng đó vào bulk bar rồi không có nút nào khả dụng là UX sai). Muốn
 * void → click mở expand panel, không qua checkbox.
 */
export function hasAnyAction(row: DerivedRow, nowMs: number): boolean {
  const isSettlable = row.stage === OpsStage.AwaitingSettle || row.stage === OpsStage.NeedsResettle;
  const isClosable = row.stage === OpsStage.PendingClose;
  const isOpenable = (row.gate === SaleGate.PendingOpen || row.gate === SaleGate.Halted) && nowMs < row.ts.closeAtMs;
  return isSettlable || isClosable || isOpenable;
}

/**
 * Tô màu dòng — TỐI ĐA 1 màu, ưu tiên destructive > warn > none (guideline §5.4).
 *
 * Nền RẤT nhạt (`/5`) áp ở component render — hàm này chỉ trả "cấp độ", không trả class CSS,
 * để component tự quyết class theo dark/light mode.
 */
export function getRowAccent(row: DerivedRow): "none" | "warn" | "destructive" {
  if (row.health === "stuck" || row.stage === OpsStage.NeedsResettle || row.stage === OpsStage.NeverOpened) {
    return "destructive";
  }
  if (row.health === "warn" || row.gate === SaleGate.PendingOpen || row.gate === SaleGate.Halted) {
    return "warn";
  }
  return "none";
}

/** Tooltip lý do 1 action BULK KHÔNG khả dụng cho 1 dòng cụ thể — hiện khi staff hover nút đơn dòng. */
export function actionUnavailableReason(
  row: DerivedRow,
  action: "settle" | "close_sales" | "open_sales",
  nowMs: number,
): string | null {
  switch (action) {
    case "settle":
      if (row.stage === OpsStage.AwaitingSettle || row.stage === OpsStage.NeedsResettle) {
        return null;
      }
      return "Chỉ kết sổ được kỳ đã có kết quả (Chờ kết sổ / Cần kết sổ lại).";
    case "close_sales":
      if (row.stage === OpsStage.PendingClose) {
        return null;
      }
      return "Chỉ đóng bán được kỳ đã hết giờ cược nhưng chưa chốt (kỳ quá giờ mở bán chỉ huỷ được).";
    case "open_sales":
      if ((row.gate === SaleGate.PendingOpen || row.gate === SaleGate.Halted) && nowMs < row.ts.closeAtMs) {
        return null;
      }
      if (nowMs >= row.ts.closeAtMs) {
        return "Đã hết giờ cược, không mở bán lại được.";
      }
      return "Kỳ đang bán bình thường hoặc không ở trạng thái mở bán được.";
    default: {
      const _exhaustive: never = action;
      return _exhaustive;
    }
  }
}
