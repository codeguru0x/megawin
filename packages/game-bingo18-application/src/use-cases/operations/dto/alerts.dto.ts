import type {
  Bingo18OpsAlertEntity,
  Bingo18OpsAlertType,
  OpsAlertSeverity,
  OpsAlertStatus,
} from "@megawin/game-bingo18/entities";

/** Input list alert cho 1 kỳ (backoffice panel, on-demand). */
export interface ListAlertsInput {
  /** Kỳ cần xem alert. */
  drawId: string;
  /**
   * Lọc theo status. Bỏ trống = mọi status — mặc định trả CẢ `ack` (UI v6 Keno 30/07:
   * item ack hiển thị dưới disclosure per-group thay vì ẩn, giữ audit trail).
   */
  status?: OpsAlertStatus;
  /** `true` (mặc định) gộp theo `type`; `false` trả raw từng alert để drill-down. */
  grouped?: boolean;
}

/** 1 nhóm alert gộp theo `type` — badge panel hiển thị "N bucket_concentration". */
export interface AlertGroup {
  /** Loại alert của nhóm. */
  type: Bingo18OpsAlertType;
  /** Số alert trong nhóm. */
  count: number;
  /** Severity cao nhất trong nhóm (critical > warning). */
  severity: OpsAlertSeverity;
  /** Alert thuộc nhóm, mới nhất trước. */
  items: Bingo18OpsAlertEntity[];
}

/** Output list alert — grouped hoặc raw tuỳ input. */
export interface ListAlertsOutput {
  /** Kỳ đang xem. */
  drawId: string;
  /** `true` khi trả `groups`; `false` khi trả `items` raw. */
  grouped: boolean;
  /** Nhóm gộp theo type (khi `grouped=true`). */
  groups?: AlertGroup[];
  /** Alert raw (khi `grouped=false`). */
  items?: Bingo18OpsAlertEntity[];
}

/** Input acknowledge 1 alert. */
export interface AckAlertInput {
  /** ObjectId hex của alert. */
  alertId: string;
  /** ID staff acknowledge (từ session). */
  actorId: string;
}

/** Output acknowledge — báo thành công. */
export interface AckAlertOutput {
  /** true nếu alert đổi sang `ack`. */
  acked: boolean;
}
