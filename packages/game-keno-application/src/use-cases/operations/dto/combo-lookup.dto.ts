/**
 * Keno – Combo Lookup DTO (staff)
 *
 * Tra cứu 1 bộ số cappable (pick 8/9/10) trong 1 kỳ: bao nhiêu người cược, tổng bộ/tiền,
 * breakdown từng account. Nguồn: `keno_draw_combo_stats` (worker aggregate realtime).
 * Dùng cho drill-down `capSets` + kiểm soát tập trung cược (syndicate).
 */

// ─── Input ────────────────────────────────────────────────────────────────────

export interface GetComboLookupInput {
  /** Mã kỳ quay `YYYY-MM-DD.NNN`. */
  drawId: string;
  /** Kiểu chơi cappable — pick8/pick9/pick10. */
  playType: string;
  /** Bộ số cần tra — 8–10 số "01".."80" distinct (chưa cần sort, use-case tự chuẩn hoá). */
  numbers: string[];
}

// ─── Output ───────────────────────────────────────────────────────────────────

/** 1 account đã cược combo này. */
export interface ComboLookupAccount {
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
   * Số người chơi distinct — đọc từ counter `accountCount` của combo doc.
   *
   * KHÁC `accounts.length`: mảng `accounts` bị giới hạn `limit` (combo hot có thể hàng nghìn
   * người), còn `players` là tổng thật. Trước p2-01 hai số này trùng nhau vì doc chứa cả
   * mảng — nay tách nên phải lấy từ counter.
   */
  players: number;
  /** Tổng số bộ cược combo (Σ betCount mọi account). */
  sets: number;
  /** Tổng tiền vào combo (VND). */
  amount: number;
  /** Breakdown account, sort tiền giảm dần, cắt theo `limit` của repo. */
  accounts: ComboLookupAccount[];
}
