/**
 * Shared UI types cho trang Vận hành Bingo 18.
 *
 * Bingo 18 khác Keno:
 * - Không có Jackpot
 * - Kết quả: 3 xúc xắc (1-6) + tổng 3-18
 * - Boards chứa cả cơ bản (singleNum, doubleMatch, tripleMatch) và bổ sung (sumTotal, bigSmallDraw)
 * - UI phân biệt cơ bản/bổ sung bằng filter playType
 * - Không có payout caps
 * - profit = totalRevenue - totalPrizes - totalAgentCommission
 */

// ─── KPI ─────────────────────────────────────────────────────────────────────

export interface OpsKpi {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  totalEntries: number;
  /** Số basic boards (singleNum, doubleMatch, tripleMatch). Tính phía UI từ totalBoards - totalSideBets. */
  totalBasicBoards: number;
  /** Số side bets (sumTotal, bigSmallDraw). Tính phía UI bằng filter boards theo playType. */
  totalSideBets: number;
  uniquePlayers: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
}

// ─── Tenant Breakdown ────────────────────────────────────────────────────────

export interface TenantRow {
  tenantId: string;
  entries: number;
  boards: number;
  players: number;
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
  /** Tiền cược (VND). */
  amount: number;
  username: string;
  tenant: string;
}
