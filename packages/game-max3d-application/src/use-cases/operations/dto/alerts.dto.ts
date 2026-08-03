import type {
  Max3dOpsAlertEntity,
  Max3dOpsAlertType,
  OpsAlertSeverity,
  OpsAlertStatus,
} from "@megawin/game-max3d/entities";

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

/** 1 nhóm alert gộp theo `type` — badge panel hiển thị "N pair_liability". */
export interface AlertGroup {
  /** Loại alert của nhóm. */
  type: Max3dOpsAlertType;
  /** Số alert trong nhóm. */
  count: number;
  /** Severity cao nhất trong nhóm (critical > warning). */
  severity: OpsAlertSeverity;
  /** Alert thuộc nhóm, mới nhất trước. */
  items: Max3dOpsAlertEntity[];
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
  items?: Max3dOpsAlertEntity[];
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
