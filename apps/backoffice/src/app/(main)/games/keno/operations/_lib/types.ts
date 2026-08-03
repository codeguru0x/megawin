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
  /** Tổng số bộ cược `Σ(board.betCount)` — cả cơ bản pick1-10 và bổ sung bigSmall/evenOdd. */
  totalSets: number;
  /**
   * Số người chơi distinct. `null` khi stats doc KHÔNG có sẵn — KpiStrip render "—".
   * Betting stats hiện chỉ có entries/sets theo tenant, không có players count →
   * KHÔNG bịa số (thà "—" còn hơn số sai).
   */
  uniquePlayers: number | null;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Doanh thu thuần (VND) = totalRevenue − totalCommission. */
  netRevenue: number;
}

// ─── Tenant Breakdown ────────────────────────────────────────────────────────

export interface TenantRow {
  tenantId: string;
  entries: number;
  /** Số bộ cược. `null` khi stats không tách theo tenant → UI ẩn/"—". */
  sets: number | null;
  /** Số người chơi. `null` khi stats không có players theo tenant → UI ẩn/"—". */
  players: number | null;
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
  /**
   * Lợi nhuận công ty của kỳ (VND). Công thức: revenue − prizes − commission.
   * Keno không có Jackpot nên đây là con số cuối cùng — có thể ÂM khi chi trả
   * giải vượt doanh thu (trúng lớn ở bậc pick cao).
   */
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

// ─── Analytics adapter outputs (từ betting stats snapshot) ───────────────────

/** 1 dòng phân bổ kiểu chơi — khớp PlayTypeCard render contract. */
export interface PlayTypeRow {
  playType: string;
  label: string;
  /** Số bộ cược `Σ(board.betCount)` của kiểu chơi này. */
  sets: number;
  /** Doanh thu (VND). */
  revenue: number;
  /** % theo doanh thu so với tổng. */
  pct: number;
}

/**
 * 1 số trên heatmap — chỉ dòng tiền (`amount`).
 * `sets` = số bộ cược basic chứa số này (stats không tách entries theo số).
 *
 * KHÔNG có per-number liability: worst-case là thuộc tính của BOARD (trúng đủ ngưỡng),
 * gán cho từng số sẽ double-count vô nghĩa (1 board pick10 = 2 tỷ cộng vào cả 10 ô). Rủi
 * ro chi trả đo ở cấp entry — xem `TopPotentialRow` (analysis §3.7 cập nhật 29/07).
 */
export interface NumberFreqItem {
  number: string;
  /** Số bộ cược basic chứa số này. */
  sets: number;
  /** Dòng tiền quy cho số (VND). */
  amount: number;
}

/** 1 bộ số phổ biến — khớp TopCombos render contract trong number-heatmap.tsx. */
export interface TopComboRow {
  rank: number;
  numbers: string[];
  playType: string;
  /** Số bộ cược vào combo này (`Σ betCount` mọi account). */
  sets: number;
  entryCount: number;
}

// ─── Exposure (proxy liability worst-case) ───────────────────────────────────

/** 1 dòng cap sets của 1 bậc pick trên Exposure card. */
export interface ExposureCapRow {
  playType: "pick8" | "pick9" | "pick10";
  /** Số bộ cược trọn bậc (trúng hết). */
  sets: number;
  /** Mẫu số cap tham chiếu (maxSetsForFixed default). */
  max: number;
}

/** Slice exposure adapter → ExposureCard. */
export interface ExposureView {
  /** Tổng worst-case toàn kỳ (VND). */
  worstCaseTotal: number;
  capRows: ExposureCapRow[];
}

/**
 * ExposureView + ngưỡng cảnh báo (%) từ config — bọc để `select` slice snapshot 1 lần
 * (tránh 2 subscription). `warnPct` = `thresholds.exposureWarnPct` (analysis §4.3).
 */
export interface ExposureViewWithThreshold {
  view: ExposureView;
  /** Ngưỡng cảnh báo exposure (%) từ config — dùng tô màu gauge. */
  warnPct: number;
}

// ─── Side-bet direction bars ─────────────────────────────────────────────────

/** 1 cặp side bet đối xứng (Lớn↔Nhỏ hoặc Chẵn↔Lẻ) cho progress bar. */
export interface SideBetPair {
  /** Nhãn cặp (vd "Lớn / Nhỏ"). */
  label: string;
  /** Nhãn + tiền hướng trái. */
  left: { label: string; amount: number };
  /** Nhãn + tiền hướng phải. */
  right: { label: string; amount: number };
  /** Tiền hướng hoà (VND) — hiển thị phụ, không tính vào lệch. */
  drawAmount: number;
}

// ─── Top risk (accounts theo tiền cược / theo liability) ─────────────────────

/** 1 account trong bảng "Top người chơi theo tiền cược" (`stats.topAccounts`). */
export interface TopAccountRow {
  /** ID account — link tới hồ sơ tài khoản. */
  accountId: string;
  /** Username hiển thị (ưu tiên trước accountId). Rỗng → UI fallback accountId. */
  username: string;
  /** Tổng tiền account cược trong kỳ (VND). */
  amount: number;
  /** Số entries account đặt trong kỳ. */
  entries: number;
}

/** 1 entry trong bảng "Top phải trả tiềm năng" (`stats.topPotential`). */
export interface TopPotentialRow {
  entryId: string;
  /** ID account — link tới hồ sơ tài khoản. */
  accountId: string;
  /** Username hiển thị (ưu tiên trước accountId). Rỗng → UI fallback accountId. */
  username: string;
  /** Tiền cược của entry (VND). */
  amount: number;
  /** Tiền phải trả nếu entry trúng tối đa (VND). */
  potentialWin: number;
}
