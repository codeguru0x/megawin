/**
 * Lotto 5/35 – Operations DTO (snapshot / alerts / combo-lookup)
 *
 * 1 file gộp cả 3 nhóm DTO — theo tiền lệ Power 6/55 (p0-03 mục 1: P0 chỉ có 3
 * use-case đọc mới, gộp 1 file dễ đối chiếu hơn tách nhỏ). Named types (KHÔNG
 * indexed-access — rule `code-quality-standards.mdc` §5.4).
 *
 * KHÁC Power 6/55: `Lotto535SnapshotExposure` chỉ có 1 jackpot pool (không JP1/JP2);
 * `Lotto535TopCombo`/`Lotto535ComboLookupOutput` có thêm chiều `specialNumbers`;
 * `numberStats` tách 2 mảng theo `kind` (main/special) để UI vẽ 2 lưới.
 */

import type { DrawStatus } from "@megawin/game-core/entities";
import type {
  Lotto535DrawBettingStatsEntity,
  Lotto535DrawNumberStatsEntity,
  Lotto535OpsAlertEntity,
  Lotto535OpsAlertType,
  OpsAlertSeverity,
  OpsAlertStatus,
  PlayType,
  TopAccountStat,
} from "@megawin/game-lotto535/entities";

// ─────────────────────────────────────────────────────────────
// Snapshot
// ─────────────────────────────────────────────────────────────

/** Input snapshot vận hành — 1 kỳ cụ thể. */
export interface GetOpsSnapshotInput {
  /** Kỳ cần đọc snapshot. */
  drawId: string;
}

/** 1 combo (board) bị dồn cược nhiều nhất — derive lúc đọc từ `lotto535_draw_combo_stats`. */
export interface Lotto535TopCombo {
  /** Khoá combo `${playType}:${sortedMain}|${sortedSpecial}`. */
  comboKey: string;
  /** Kiểu chơi của combo. */
  playType: PlayType;
  /** Số chính đã chọn, đã sort. */
  mainNumbers: string[];
  /** Số đặc biệt đã chọn, đã sort. */
  specialNumbers: string[];
  /** Tổng bộ cược combo này (Σ expandedLines × betCount). */
  sets: number;
  /** Số account distinct đã cược combo. */
  accounts: number;
  /** Tổng tiền vào combo (VND). */
  amount: number;
}

/**
 * Ngưỡng vận hành từ GlobalConfig gửi kèm snapshot — FE tô màu đúng cấu hình thực
 * (analysis §5.2), KHÔNG hardcode default. KHÔNG dùng để sinh alert (alert do
 * worker sinh server-side).
 */
export interface Lotto535SnapshotThresholds {
  /** Ngưỡng cược lớn (VND) — `ops.alerts.largeBetAmount`. */
  largeBetAmount: number;
  /** Ngưỡng exposure giải cố định (VND tuyệt đối) — `ops.alerts.fixedExposureWarnAmount`. */
  fixedExposureWarnAmount: number;
  /** Ngưỡng số account dồn 1 combo — `ops.alerts.comboAccountsWarn`. */
  comboAccountsWarn: number;
  /** Ngưỡng giá board Bao số chính cao — `ops.alerts.coverHighStakeAmount`. */
  coverHighStakeAmount: number;
  /** Tỷ trọng dồn 1 số ĐB (thập phân 0–1) — `ops.alerts.specialSkewRatio`. */
  specialSkewRatio: number;
  /** Ngưỡng tổng tiền ĐB tối thiểu để xét skew (VND) — `ops.alerts.specialSkewMinAmount`. */
  specialSkewMinAmount: number;
}

/**
 * Exposure gộp 2 phần cho ops snapshot (analysis §3.6) — KHÁC Power 6/55: Lotto
 * 5/35 chỉ có 1 pool Jackpot (không JP1/JP2, không cap/maxPrize):
 *
 * 1. `fixedWorstCase` — đọc thẳng `stats.exposure.fixedWorstCase` (RAW, cộng dồn
 *    `$inc`, KHÔNG cap vì Lotto 5/35 không có `maxPerDraw`).
 * 2. `jackpotExposure` — KHÔNG lưu ở đâu, đọc snapshot pool lúc build response:
 *    `draw.jackpot.closingAmount` (draw đã settled) HOẶC
 *    `jackpotCycle.currentAmount` (draw chưa settled, cycle đang active).
 *    Split KHÔNG cộng vào đây (phân phối post-hoc, không tạo liability mới
 *    trước giờ quay — analysis §3.6).
 */
export interface Lotto535SnapshotExposure {
  /** Worst-case giải cố định (VND) — `totals.sets × tier1`, RAW không cap. */
  fixedWorstCase: number;
  /** Jackpot pool dùng để tính `jackpotExposure` (VND) — closing (đã settle) hoặc current (active). */
  jackpotAmount: number;
  /** Tổng exposure jackpot (VND) — bằng `jackpotAmount` (chỉ 1 pool, giữ field riêng để đồng bộ shape Power 6/55). */
  jackpotExposure: number;
}

/**
 * Snapshot gộp mọi số liệu vận hành 1 kỳ — nguồn cho **timer 1 duy nhất** (analysis
 * §5.2, mirror Power 6/55 D2 — trang Lotto 5/35 dùng 1 nhịp `tickSeconds` chung cho
 * cả snapshot và live feed).
 *
 * Thay các aggregation on-demand cũ (`aggregateOpsSummary`/`TenantBreakdown`/
 * `NumberFrequency`/`PlayTypeDistribution`/`TopCombos`) bằng 1 findOne pre-aggregated
 * + vài query top-K index-only. `stats` null khi worker chưa tạo doc (kỳ vừa mở,
 * chưa có cược).
 */
export interface GetOpsSnapshotOutput {
  /** Kỳ đang xem. */
  drawId: string;
  /** Trạng thái kỳ — FE tắt poll khi settled/voided. */
  drawStatus: DrawStatus | null;
  /** Stats pre-aggregated; null nếu worker chưa tạo doc (chưa có cược). */
  stats: Lotto535DrawBettingStatsEntity | null;
  /**
   * Tần suất số CHÍNH (35 số) — lọc `kind=main` từ `lotto535_draw_number_stats`.
   * Rỗng khi chưa có cược.
   */
  mainNumberStats: Lotto535DrawNumberStatsEntity[];
  /**
   * Tần suất số ĐẶC BIỆT (12 số) — lọc `kind=special`. Input trực tiếp cho rule
   * `special_skew` (đọc lại ở BO panel để hiển thị, worker tự đọc riêng lúc eval).
   */
  specialNumberStats: Lotto535DrawNumberStatsEntity[];
  /**
   * Top combo bị dồn cược — derive lúc ĐỌC từ `lotto535_draw_combo_stats`
   * (`sort({sets:-1}).limit(topCombosK)`). Rỗng khi chưa ai cược.
   */
  topCombos: Lotto535TopCombo[];
  /**
   * Top người chơi theo tiền cược — derive lúc ĐỌC từ `lotto535_draw_account_stats`
   * (`sort({amount:-1}).limit(topAccountsK)`).
   */
  topAccounts: TopAccountStat[];
  /** Số người chơi distinct trong kỳ — `countDocuments` trên `lotto535_draw_account_stats`. */
  uniquePlayers: number;
  /** Exposure 2 phần (fixed + jackpot) — null khi chưa có stats doc. */
  exposure: Lotto535SnapshotExposure | null;
  /**
   * Đếm alert theo status CHO KỲ NÀY — nguồn cho badge header (`alertRepo.countByStatus`,
   * KHÔNG timer riêng — analysis §4.1 mirror Power 6/55).
   */
  alertCounts: Record<OpsAlertStatus, number>;
  /** Ngưỡng vận hành từ config — FE tô màu đúng cấu hình (§4.3). */
  thresholds: Lotto535SnapshotThresholds;
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
export interface Lotto535AlertGroup {
  /** Loại alert của nhóm. */
  type: Lotto535OpsAlertType;
  /** Số alert trong nhóm. */
  count: number;
  /** Severity cao nhất trong nhóm (critical > warning > info). */
  severity: OpsAlertSeverity;
  /** Alert thuộc nhóm, mới nhất trước. */
  items: Lotto535OpsAlertEntity[];
}

/** Output list alert — grouped hoặc raw tuỳ input. */
export interface ListAlertsOutput {
  /** Kỳ đang xem. */
  drawId: string;
  /** `true` khi trả `groups`; `false` khi trả `items` raw. */
  grouped: boolean;
  /** Nhóm gộp theo type (khi `grouped=true`). */
  groups?: Lotto535AlertGroup[];
  /** Alert raw (khi `grouped=false`). */
  items?: Lotto535OpsAlertEntity[];
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
 * Input tra cứu combo cho staff. PlayType TỰ SUY ở UI theo số lượng số chính +
 * số đặc biệt đã chọn (5+1=standard, 4+1=mainCover4, 6-15+1=mainCoverN, 5+2..12=
 * specialCover) — API vẫn nhận `playType` tường minh làm chốt chặn cuối (analysis
 * §3.10(7)).
 */
export interface GetComboLookupInput {
  /** Mã kỳ quay `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Kiểu chơi của bộ số tra cứu. */
  playType: string;
  /** Số chính cần tra — "01".."35" distinct, số lượng tuỳ playType. */
  mainNumbers: string[];
  /** Số đặc biệt cần tra — "01".."12" distinct, số lượng tuỳ playType. */
  specialNumbers: string[];
}

/** 1 account đã cược combo này. */
export interface Lotto535ComboLookupAccount {
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
  /** Khoá combo đã chuẩn hoá `${playType}:${sortedMain}|${sortedSpecial}`. */
  comboKey: string;
  /** Có ai cược combo này chưa. `false` → sets/amount/players rỗng. */
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
   * Giá 1 lần cược bộ số này (VND) = `unitPrice × calculateLineCount(playType,
   * selection)` — tham khảo mức tiền staff cần soi (đặc biệt mainCover cao),
   * KHÔNG phải "giá 1 line".
   */
  boardPrice: number;
  /** Breakdown account, sort tiền giảm dần, cắt theo `limit` của repo. */
  accounts: Lotto535ComboLookupAccount[];
}
