/**
 * Power 6/55 – Operations DTO (snapshot / alerts / combo-lookup)
 *
 * 1 file gộp cả 3 nhóm DTO (KHÁC Keno tách 3 file `snapshot.dto.ts`/`alerts.dto.ts`/
 * `combo-lookup.dto.ts`) — chốt theo plan p0-03 mục 1, vì Power 6/55 P0 chỉ có 3
 * use-case đọc mới, gộp 1 file dễ đối chiếu hơn tách nhỏ. Named types (KHÔNG
 * indexed-access — rule `code-quality-standards.mdc` §5.4).
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type {
  Power655DrawBettingStatsEntity,
  Power655DrawNumberStatsEntity,
  Power655OpsAlertEntity,
  Power655OpsAlertType,
  OpsAlertSeverity,
  OpsAlertStatus,
  PlayType,
  TopAccountStat,
} from "@megawin/game-power655/entities";

// ─────────────────────────────────────────────────────────────
// Snapshot
// ─────────────────────────────────────────────────────────────

/** Input snapshot vận hành — 1 kỳ cụ thể. */
export interface GetOpsSnapshotInput {
  /** Kỳ cần đọc snapshot. */
  drawId: string;
}

/** 1 combo (board) bị dồn cược nhiều nhất — derive lúc đọc từ `power655_draw_combo_stats`. */
export interface Power655TopCombo {
  /** Khoá combo `${playType}:${sortedMainNumbers.join(",")}`. */
  comboKey: string;
  /** Kiểu chơi của combo. */
  playType: PlayType;
  /** Bộ số đã chọn, đã sort. */
  mainNumbers: string[];
  /** Tổng bộ cược combo này (Σ expandedLines × betCount). */
  sets: number;
  /** Số account distinct đã cược combo. */
  accounts: number;
  /** Tổng tiền vào combo (VND). */
  amount: number;
}

/**
 * Ngưỡng vận hành từ GlobalConfig gửi kèm snapshot — FE tô màu đúng cấu hình thực
 * (analysis §4.3/§5.2), KHÔNG hardcode default. KHÔNG dùng để sinh alert (alert do
 * worker sinh server-side).
 */
export interface Power655SnapshotThresholds {
  /** Ngưỡng cược lớn (VND) — `ops.alerts.largeBetAmount`. */
  largeBetAmount: number;
  /** Ngưỡng exposure giải cố định (VND tuyệt đối) — `ops.alerts.fixedExposureWarnAmount`. */
  fixedExposureWarnAmount: number;
  /** Ngưỡng số account dồn 1 combo — `ops.alerts.comboAccountsWarn`. */
  comboAccountsWarn: number;
  /** Ngưỡng giá board Bao cao — `ops.alerts.baoHighStakeAmount`. */
  baoHighStakeAmount: number;
}

/**
 * Exposure gộp 2 phần cho ops snapshot (analysis §3.6) — KHÁC KENO CĂN BẢN (game
 * jackpot, không có bảng maxPrize/cap):
 *
 * 1. `fixedWorstCase` — đọc thẳng `stats.exposure.fixedWorstCase` (RAW, cộng dồn `$inc`,
 *    KHÔNG cap vì Power 6/55 không có `maxPerDraw`).
 * 2. `jackpotExposure` — KHÔNG lưu ở đâu, đọc snapshot pool lúc build response:
 *    `closingJackpot1 + closingJackpot2` từ `DrawJackpot` (draw đã settled) HOẶC
 *    `jackpot1CurrentAmount + jackpot2CurrentAmount` từ jackpot cycle đang active
 *    (draw chưa settled). Jackpot bị chặn bởi pool — KHÔNG nhân theo số vé.
 */
export interface Power655SnapshotExposure {
  /** Worst-case giải cố định (VND) — `totals.sets × tier1`, RAW không cap. */
  fixedWorstCase: number;
  /** JP1 dùng để tính `jackpotExposure` (VND) — closing (đã settle) hoặc current (active). */
  jackpot1: number;
  /** JP2 dùng để tính `jackpotExposure` (VND) — closing (đã settle) hoặc current (active). */
  jackpot2: number;
  /** Tổng exposure jackpot (VND) = `jackpot1 + jackpot2`. */
  jackpotExposure: number;
}

/**
 * Snapshot gộp mọi số liệu vận hành 1 kỳ — nguồn cho **timer 1 duy nhất** (analysis
 * §5.2, điểm diverge D2 so Keno — trang Power 6/55 dùng 1 nhịp `tickSeconds` chung cho
 * cả snapshot và live feed).
 *
 * Thay 7 request aggregation on-demand cũ bằng 1 findOne pre-aggregated + vài query
 * top-K index-only. `stats` null khi worker chưa tạo doc (kỳ vừa mở, chưa có cược).
 */
export interface GetOpsSnapshotOutput {
  /** Kỳ đang xem. */
  drawId: string;
  /** Trạng thái kỳ — FE tắt poll khi settled/voided. */
  drawStatus: DrawStatus | null;
  /** Stats pre-aggregated; null nếu worker chưa tạo doc (chưa có cược). */
  stats: Power655DrawBettingStatsEntity | null;
  /**
   * Tần suất 55 số chính — đọc `power655_draw_number_stats` (`findByDrawId`, ≤55
   * doc). Tách collection riêng KHÁC Keno (Keno nhúng `numberFreq` trong stats
   * doc) — xem JSDoc {@link Power655DrawNumberStatsDoc}. Rỗng khi chưa có cược.
   */
  numberStats: Power655DrawNumberStatsEntity[];
  /**
   * Top combo bị dồn cược — derive lúc ĐỌC từ `power655_draw_combo_stats`
   * (`sort({sets:-1}).limit(topCombosK)`). Rỗng khi chưa ai cược.
   */
  topCombos: Power655TopCombo[];
  /**
   * Top người chơi theo tiền cược — derive lúc ĐỌC từ `power655_draw_account_stats`
   * (`sort({amount:-1}).limit(topAccountsK)`).
   */
  topAccounts: TopAccountStat[];
  /** Số người chơi distinct trong kỳ — `countDocuments` trên `power655_draw_account_stats`. */
  uniquePlayers: number;
  /** Exposure 2 phần (fixed + jackpot) — null khi chưa có stats doc. */
  exposure: Power655SnapshotExposure | null;
  /**
   * Đếm alert theo status CHO KỲ NÀY — nguồn cho badge header (`alertRepo.countByStatus`,
   * KHÔNG timer riêng — analysis §4.1 mirror Keno).
   */
  alertCounts: Record<OpsAlertStatus, number>;
  /** Ngưỡng vận hành từ config — FE tô màu đúng cấu hình (§4.3). */
  thresholds: Power655SnapshotThresholds;
  /** Nhịp poll FE nên dùng (giây) = `ops.stats.tickSeconds`. */
  pollSeconds: number;
}

// ─────────────────────────────────────────────────────────────
// Alerts (list + ack)
// ─────────────────────────────────────────────────────────────

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
export interface Power655AlertGroup {
  /** Loại alert của nhóm. */
  type: Power655OpsAlertType;
  /** Số alert trong nhóm. */
  count: number;
  /** Severity cao nhất trong nhóm (critical > warning > info). */
  severity: OpsAlertSeverity;
  /** Alert thuộc nhóm, mới nhất trước. */
  items: Power655OpsAlertEntity[];
}

/** Output list alert — grouped hoặc raw tuỳ input. */
export interface ListAlertsOutput {
  /** Kỳ đang xem. */
  drawId: string;
  /** `true` khi trả `groups`; `false` khi trả `items` raw. */
  grouped: boolean;
  /** Nhóm gộp theo type (khi `grouped=true`). */
  groups?: Power655AlertGroup[];
  /** Alert raw (khi `grouped=false`). */
  items?: Power655OpsAlertEntity[];
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

// ─────────────────────────────────────────────────────────────
// Combo lookup (staff)
// ─────────────────────────────────────────────────────────────

/**
 * Input tra cứu combo cho staff. PlayType TỰ SUY ở UI theo số lượng số đã chọn
 * (5=bao5, 6=standard, 7-15=baoN, 18=bao18) — API vẫn nhận `playType` tường minh làm
 * chốt chặn cuối (client-side hint là đủ, xem analysis §3.10(7)).
 */
export interface GetComboLookupInput {
  /** Mã kỳ quay `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Kiểu chơi của bộ số tra cứu. */
  playType: string;
  /** Bộ số cần tra — 5/6/7-15/18 số "01".."55" distinct tuỳ playType. */
  numbers: string[];
}

/** 1 account đã cược combo này. */
export interface Power655ComboLookupAccount {
  /** ID account. */
  accountId: string;
  /** Username hiển thị (snapshot lúc cược). */
  username: string;
  /** Số bộ account này cược vào combo. */
  sets: number;
  /** Tổng tiền account này vào combo (VND). */
  amount: number;
}

export interface GetComboLookupOutput {
  /** Mã kỳ quay. */
  drawId: string;
  /** Khoá combo đã chuẩn hoá `${playType}:${sortedNumbers}`. */
  comboKey: string;
  /** Có ai cược combo này chưa. `false` → sets/amount/accounts rỗng. */
  found: boolean;
  /**
   * Số người chơi distinct — đọc từ counter `accountCount` của combo doc. KHÁC
   * `accounts.length` (mảng bị giới hạn `limit`).
   */
  players: number;
  /** Tổng số bộ cược combo (Σ expandedLines × betCount mọi account). */
  sets: number;
  /** Tổng tiền vào combo (VND). */
  amount: number;
  /**
   * Giá 1 lần cược bộ số này (VND) = `unitPrice × expandedLines(playType)` — tham khảo
   * mức tiền staff cần soi (đặc biệt Bao cao), KHÔNG phải "giá 1 line".
   */
  boardPrice: number;
  /** Breakdown account, sort tiền giảm dần, cắt theo `limit` của repo. */
  accounts: Power655ComboLookupAccount[];
}
