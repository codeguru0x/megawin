/**
 * Shared UI types cho trang Vận hành Keno.
 *
 * Keno khác các game có Jackpot:
 * - Không có jackpotContribution, jackpotBefore, jackpotAfter
 * - Kết quả quay: 20 winningNumbers (01-80)
 * - Có bigCount, smallCount, evenCount, oddCount (side bet stats)
 * - Có payout caps (bậc 8/9/10)
 */

// ─── KPI ─────────────────────────────────────────────────────────────────────

export interface OpsKpi {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  totalEntries: number;
  /** Tổng boards (cả cơ bản pick1-10 và bổ sung bigSmall/evenOdd). */
  totalBoards: number;
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

// ─── Settled Draw Result ─────────────────────────────────────────────────────

export interface KenoDrawResult {
  /** 20 số trúng thưởng (01-80), giữ nguyên thứ tự quay. */
  winningNumbers: string[];
  /** Số "lớn" trong kết quả (>= 41). */
  bigCount: number;
  /** Số "nhỏ" trong kết quả (<= 40). */
  smallCount: number;
  /** Số chẵn trong kết quả. */
  evenCount: number;
  /** Số lẻ trong kết quả. */
  oddCount: number;
  settledAt?: string;
  publishedAt?: string;
}

export interface KenoDrawFinancialDisplay {
  /** Tổng doanh thu (VND). */
  totalRevenue: number;
  /** Tổng giải thưởng (VND). */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalAgentCommission: number;
  /** Phần công ty giữ lại (VND). */
  companyTake: number;
}

// ─── Void Info ───────────────────────────────────────────────────────────────

export interface VoidInfo {
  reason: string;
  voidedBy: string;
  voidedAt: string;
  refundAmount: number;
  entryCount: number;
}

// ─── Live Feed (Recent Entries) ─────────────────────────────────────────────

export interface LiveFeedEntry {
  entryId: string;
  time: string;
  /** Kiểu chơi của board đầu tiên (pick1-pick10, bigSmall, evenOdd). */
  playType: string;
  /** Số đã chọn của board đầu tiên. */
  numbers: string[];
  /**
   * Loại cược side bet. Chỉ set cho bigSmall / evenOdd.
   * bigSmall: "big" | "small" | "bigSmallDraw"
   * evenOdd: "even" | "odd" | ... (các giá trị KenoEvenOddBet)
   */
  bet?: string;
  /** Tiền cược (VND). */
  amount: number;
  username: string;
  tenant: string;
}
