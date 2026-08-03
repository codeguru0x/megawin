import type {
  KenoOpsAlertEntity,
  KenoOpsAlertType,
  OpsAlertSeverity,
  OpsAlertStatus,
} from "@megawin/game-keno/entities";

/** Input list alert cho 1 kỳ (backoffice panel, on-demand). */
export interface ListAlertsInput {
  /** Kỳ cần xem alert. */
  drawId: string;
  /** Lọc theo status. Bỏ trống = mọi status. */
  status?: OpsAlertStatus;
  /** `true` (mặc định) gộp theo `type`; `false` trả raw từng alert để drill-down. */
  grouped?: boolean;
}

/** 1 nhóm alert gộp theo `type` — badge panel hiển thị "N combo_concentration". */
export interface AlertGroup {
  /** Loại alert của nhóm. */
  type: KenoOpsAlertType;
  /** Số alert trong nhóm. */
  count: number;
  /** Severity cao nhất trong nhóm (critical > warning). */
  severity: OpsAlertSeverity;
  /** Alert thuộc nhóm, mới nhất trước. */
  items: KenoOpsAlertEntity[];
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
  items?: KenoOpsAlertEntity[];
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
