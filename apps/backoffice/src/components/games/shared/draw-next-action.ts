/**
 * Shared – Next Action resolver cho Draw Command Center (mọi game)
 *
 * Map trạng thái draw → action chính hiển thị trên action bar (label/icon/
 * style/handler). Trước khi tách, logic giống 100% ở 5 game (Keno, Bingo18,
 * Lotto535, Mega645, Power655) qua hàm riêng `getNextAction`; Max3D/Max3dpro
 * viết cùng logic nhưng inline IIFE trong component. Chuẩn hoá về 1 hàm dùng
 * chung cho cả 7 game.
 */

import { DrawStatus } from "@megawin/game-core/entities";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, Lock, Radio, RotateCcw, Unlock } from "lucide-react";

/** Field tối thiểu cần cho `getNextAction` — mọi `DrawSelectorItem` game đều thoả. */
export interface DrawNextActionFields {
  /** Trạng thái kỳ quay hiện tại. */
  status: string;
}

/** Tập handler tối thiểu cần cho `getNextAction` — subset của `DrawCommandProps` từng game. */
export interface DrawNextActionHandlers {
  onOpenSales?: () => void;
  onCloseSales?: () => void;
  onPublishResult?: () => void;
  onTriggerSettle?: () => void;
  onTriggerResettle?: () => void;
}

export interface DrawNextAction {
  label: string;
  /** Tailwind classes cho nút — rỗng nghĩa là dùng style Button mặc định. */
  className: string;
  handler?: () => void;
  icon: LucideIcon;
}

/**
 * Action CHÍNH hiển thị trên action bar theo status hiện tại. `isResettleReady`
 * (từ {@link shouldShowResettle}) quyết định nhánh "Kết sổ" vs "Kết sổ lại"
 * khi status = `Published`. Trả `null` cho status không có action chính
 * (Settling, Settled, Void, Voiding — xử lý riêng ở JSX từng game).
 */
export function getNextAction(
  draw: DrawNextActionFields,
  handlers: DrawNextActionHandlers,
  isResettleReady: boolean,
): DrawNextAction | null {
  switch (draw.status) {
    case DrawStatus.Scheduled:
      return { label: "Mở bán", handler: handlers.onOpenSales, icon: Unlock, className: "" };
    case DrawStatus.SalesOpen:
      return {
        label: "Đóng bán",
        className: "bg-amber-600 hover:bg-amber-700 text-white",
        handler: handlers.onCloseSales,
        icon: Lock,
      };
    case DrawStatus.SalesClosed:
      return {
        label: "Công bố kết quả",
        className: "bg-violet-600 hover:bg-violet-700 text-white",
        handler: handlers.onPublishResult,
        icon: Radio,
      };
    case DrawStatus.Published:
      // Đã settle ≥ 1 lần + có kết quả mới → nút chính là "Kết sổ lại".
      if (isResettleReady) {
        return {
          label: "Kết sổ lại",
          handler: handlers.onTriggerResettle,
          icon: RotateCcw,
          className: "bg-orange-600 hover:bg-orange-700 text-white",
        };
      }
      return {
        label: "Kết sổ",
        handler: handlers.onTriggerSettle,
        icon: ChevronRight,
        className: "",
      };
    default:
      return null;
  }
}
