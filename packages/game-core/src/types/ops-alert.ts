/**
 * Game Core – Ops Alert Types (dùng chung cho tất cả game)
 *
 * Lifecycle + khung alert vận hành alert-driven. Field đặc thù game (union alert
 * type cụ thể, payload…) do game extend/khai riêng.
 * Xem `.cursor/analysis/keno-operations-risk-control.analysis.md` §8.
 */

/**
 * Lifecycle 1 alert vận hành.
 *
 * Khai `const … as const` + type dẫn xuất (rule `code-quality-standards.mdc` §5.3 —
 * KHÔNG union string trần). Dùng qua member: `OpsAlertStatus.Ack`.
 */
export const OpsAlertStatus = {
  /** Vừa sinh, chưa ai xử lý. */
  New: "new",
  /** Staff đã xác nhận (acknowledge). */
  Ack: "ack",
  /** Đã giải quyết/đóng. */
  Resolved: "resolved",
} as const;
export type OpsAlertStatus = (typeof OpsAlertStatus)[keyof typeof OpsAlertStatus];

/** Mức độ nghiêm trọng của alert — const object as const (§5.3). */
export const OpsAlertSeverity = {
  /** Thông tin, không cần hành động ngay. */
  Info: "info",
  /** Cảnh báo — cần chú ý. */
  Warning: "warning",
  /** Nghiêm trọng — cần xử lý ngay (UI badge đỏ). */
  Critical: "critical",
} as const;
export type OpsAlertSeverity = (typeof OpsAlertSeverity)[keyof typeof OpsAlertSeverity];

/**
 * Khung alert doc — base chung mọi game.
 *
 * Game khai `type` cụ thể (union alert type đặc thù, cũng theo §5.3) + `_id`:
 * `interface KenoOpsAlertDoc extends OpsAlertBase { _id: unknown; type: KenoOpsAlertType }`.
 */
export interface OpsAlertBase {
  /** drawId dạng `YYYY-MM-DD.NNN` mà alert thuộc về. */
  drawId: string;
  /** Mức độ nghiêm trọng. */
  severity: OpsAlertSeverity;
  /** Context tuỳ loại alert: entryId, giá trị đo được, ngưỡng vượt… */
  payload: Record<string, unknown>;
  /** Khoá chống bắn trùng: unique cùng `drawId`. Vd `"combo_concentration:pick10:01,05,..."`. */
  dedupeKey: string;
  /** Trạng thái xử lý. */
  status: OpsAlertStatus;
  /** Thời điểm alert sinh lần đầu. */
  createdAt: Date;
  /** ID staff đã acknowledge (nếu có). */
  ackBy?: string;
  /** Thời điểm acknowledge (nếu có). */
  ackAt?: Date;
}
