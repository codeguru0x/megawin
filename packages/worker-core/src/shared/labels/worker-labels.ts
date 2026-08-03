import { WorkerRunState } from "../../use-cases/admin/types";

/**
 * Nhãn tiếng Việt cho `WorkerRunState` — trang BO "Sức khoẻ worker".
 *
 * Khai ở PACKAGE (không ở component BO) theo `frontend-dev.mdc` PHẦN 2 +
 * `code-quality-standards.mdc` §5.3 — tiền lệ `tenant-dispatch/shared/labels/dispatch-labels.ts`.
 */
export const WORKER_RUN_STATE_LABELS: Record<WorkerRunState, string> = {
  [WorkerRunState.Idle]: "Chờ lượt",
  [WorkerRunState.Running]: "Đang chạy",
  [WorkerRunState.Crashed]: "Chết giữa lượt",
  [WorkerRunState.Disabled]: "Đã tắt",
};

/**
 * Badge variant (shadcn) cho từng `WorkerRunState` — chỉ dùng variant CÓ SẴN của
 * `Badge`, không thêm variant mới.
 */
export const WORKER_RUN_STATE_VARIANT: Record<
  WorkerRunState,
  "default" | "secondary" | "destructive" | "outline"
> = {
  [WorkerRunState.Idle]: "secondary",
  [WorkerRunState.Running]: "default",
  [WorkerRunState.Crashed]: "destructive",
  [WorkerRunState.Disabled]: "outline",
};
