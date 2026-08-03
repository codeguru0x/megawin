import type { WorkerStalledItem } from "../../entities/worker-lock";

/**
 * Trạng thái vận hành hiện tại của 1 worker — derive ở SERVER (không phải FE)
 * từ `ownerToken`/`expiresAt`/`isEnabled` để tránh lệch giờ client.
 *
 * | Trạng thái | Điều kiện | Ý nghĩa |
 * |---|---|---|
 * | `idle` | `ownerToken == null` | Không invocation nào đang chạy — bình thường giữa 2 lượt |
 * | `running` | `ownerToken != null` && `expiresAt > now` | Đang chạy, heartbeat còn hạn |
 * | `crashed` | `ownerToken != null` && `expiresAt <= now` | Chết giữa lượt — hết TTL mà chưa release |
 * | `disabled` | `isEnabled === false` | Kill-switch đang bật (ưu tiên hiển thị trên mọi trạng thái khác) |
 */
export const WorkerRunState = {
  Idle: "idle",
  Running: "running",
  Crashed: "crashed",
  Disabled: "disabled",
} as const;
export type WorkerRunState = (typeof WorkerRunState)[keyof typeof WorkerRunState];

/**
 * 1 dòng dữ liệu cho trang BO "Sức khoẻ worker" — CHỈ chứa field FE dùng, KHÔNG
 * trả cả `WorkerLockEntity` (tránh lộ `ownerToken`/`id` qua RSC boundary,
 * `vercel-react-best-practices` §3.4).
 */
export interface WorkerHealthRow {
  /** Khoá worker, vd `"keno:stats-sync"`. Dùng làm React key + tham số toggle. */
  lockKey: string;
  /**
   * Mô tả worker làm gì — LUÔN có giá trị: use-case fallback `description ?? lockKey`
   * (worker chưa khai `description` thì hiện chính `lockKey`).
   *
   * Fallback ở use-case chứ KHÔNG ở mapper — mapper phải giữ được phân biệt
   * "chưa khai" vs "khai bằng lockKey".
   */
  description: string;
  /** Trạng thái đã derive ở server (client không tự tính vì lệch giờ). */
  state: WorkerRunState;
  /** ISO 8601 lần thành công gần nhất; `null` nếu chưa từng. */
  lastSuccessAt: string | null;
  /** Số giây kể từ `lastSuccessAt` — server tính để tránh lệch đồng hồ client. */
  secondsSinceSuccess: number | null;
  /** Message lỗi gần nhất (đã cắt 500 ký tự ở worker); `null` nếu lượt cuối OK. */
  lastError: string | null;
  /** Cursor hiện tại — chuỗi tự do do worker tự đặt nghĩa. */
  cursor: string | null;
  /** `false` = kill-switch đang chặn mọi invocation. */
  isEnabled: boolean;
  /** Item đang lỗi lặp lại; rỗng = không có gì kẹt. */
  stalledItems: WorkerStalledItem[];
}
