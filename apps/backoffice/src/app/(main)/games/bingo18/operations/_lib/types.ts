/**
 * Shared UI types cho trang Vận hành Bingo 18.
 *
 * Bingo 18 khác Keno:
 * - Không có Jackpot
 * - Kết quả: 3 xúc xắc (1-6) + tổng 3-18
 * - Bộ cược gồm cả cơ bản (singleNum, doubleMatch, tripleMatch) và bổ sung (sumTotal, bigSmallDraw)
 * - UI phân biệt cơ bản/bổ sung bằng filter playType
 * - Không có payout caps
 * - profit = totalRevenue - totalPrizes - totalAgentCommission
 */

// ─── KPI ─────────────────────────────────────────────────────────────────────

export interface OpsKpi {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  totalEntries: number;
  /** Số bộ cược cơ bản (Σ betCount của singleNum/doubleMatch/tripleMatch). */
  totalBasicSets: number;
  /** Số bộ cược bổ sung (Σ betCount của sumTotal/bigSmallDraw). */
  totalSideBets: number;
  /**
   * Số người chơi distinct — số THẬT, `countDocuments` trên `bingo18_draw_account_stats`
   * (1 doc/account), field cấp snapshot (p0-03).
   */
  uniquePlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}

// ─── Play type distribution ──────────────────────────────────────────────────

export interface PlayTypeRow {
  /** Key kiểu chơi (tripleMatch tách "tripleMatch-specific"/"tripleMatch-any"). */
  playType: string;
  label: string;
  entries: number;
  /** Σ betCount (số bộ cược). */
  sets: number;
  /** Tổng tiền (VND). */
  revenue: number;
  /** % theo revenue. */
  pct: number;
}

// ─── Dice board (6 ô — thuần hiển thị, KHÔNG chọn số) ───────────────────────

export interface DiceCellItem {
  /** Mặt xúc xắc 1-6. */
  diceValue: number;
  /** Dòng tiền quy cho số này (VND) — heat nền theo giá trị này. */
  amount: number;
  /** Số bộ cược chứa số này (singleNum + doubleMatch + tripleMatch.specific). */
  sets: number;
}

// ─── SumTotal bar (16 cột 3-18) ──────────────────────────────────────────────

export interface SumBarItem {
  /** Tổng 3-18. */
  sum: number;
  /** Tiền dồn vào tổng này (VND). */
  amount: number;
  /** Số bộ. */
  sets: number;
  /** Bucket nhân cao (×120 — tổng 3/18): viền đỏ nhạt + xét ngưỡng amber. */
  isHighMultiplier: boolean;
}

// ─── Side bet split (3 hướng big/draw/small) ─────────────────────────────────

export interface SideBetSplit {
  big: { label: string; amount: number };
  draw: { label: string; amount: number };
  small: { label: string; amount: number };
  total: number;
}

// ─── Top risk ────────────────────────────────────────────────────────────────

export interface TopAccountRow {
  accountId: string;
  username: string;
  amount: number;
  entries: number;
}

export interface TopPotentialRow {
  entryId: string;
  accountId: string;
  username: string;
  amount: number;
  /** Worst-case entry này trả (VND) — exact max over 216 outcome. */
  potentialWin: number;
}

// ─── Tenant Breakdown ────────────────────────────────────────────────────────

export interface TenantRow {
  tenantId: string;
  entries: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** Hoa hồng (VND). */
  commission: number;
  /** Phần trăm doanh thu so với tổng. */
  pct: number;
}

// ─── Draw Result ─────────────────────────────────────────────────────────────

export interface Bingo18DrawResult {
  /** 3 xúc xắc, mỗi giá trị 1-6. */
  diceNumbers: number[];
  /** Tổng 3 xúc xắc (3-18). */
  sum: number;
  settledAt?: string;
  publishedAt?: string;
}

export interface Bingo18DrawFinancialDisplay {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  /** Tổng giải thưởng (VND). */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /**
   * Lợi nhuận thuần (VND).
   * Công thức: totalRevenue - totalPrizes - totalAgentCommission
   * Bingo 18 không có companyRate — không có khoản khấu trừ "company take" riêng.
   */
  profit: number;
}

// ─── Void Info ───────────────────────────────────────────────────────────────

export interface VoidInfo {
  reason: string;
  voidedBy: string;
  voidedAt: string;
  refundAmount: number;
  entryCount: number;
}

// ─── Live Feed ───────────────────────────────────────────────────────────────

export interface LiveFeedEntry {
  entryId: string;
  time: string;
  /** Play type của board đầu tiên để hiển thị preview. */
  playType: string;
  /** Số đã chọn (singleNum → [n], doubleMatch → [n], tripleMatch-specific → [n], else []) */
  numbers: number[];
  /**
   * Tổng điểm đã cược (3-18). Chỉ set cho sumTotal.
   * Hiển thị: "Tổng 9"
   */
  sum?: number;
  /**
   * Loại cược lớn/hòa/nhỏ. Chỉ set cho bigSmallDraw.
   * Hiển thị label: "Lớn" | "Hòa" | "Nhỏ"
   */
  bet?: string;
  /** Tiền cược (VND). */
  amount: number;
  username: string;
  tenant: string;
}
