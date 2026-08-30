/**
 * Bingo 18 – Financial Calculations
 *
 * Bingo 18 không có Jackpot tích luỹ và không có payout caps.
 * Giải thưởng cố định theo bảng, giải cao nhất = 1.200.000đ.
 */

import type { GlobalConfigDoc } from "../entities/global-config";
import { Bingo18OpsAlertType } from "../entities/ops-alert";
import {
  DEFAULT_BIG_SMALL_DRAW_PRIZES,
  DEFAULT_DOUBLE_MATCH_PRIZES,
  DEFAULT_SINGLE_NUM_PRIZES,
  DEFAULT_SUM_TOTAL_PRIZES,
  DEFAULT_TRIPLE_MATCH_PRIZES,
} from "./prize-tables";

// ─────────────────────────────────────────────
// Draw Financial Calculation
// ─────────────────────────────────────────────

/**
 * Input cho hàm tính tài chính kỳ quay.
 * Được tổng hợp từ tất cả entries trong kỳ trước khi gọi `calculateBingo18DrawFinancials()`.
 */
export interface DrawFinancialInput {
  /** Tổng doanh thu = Σ(entry.amount) cho tất cả entries trong kỳ. */
  totalRevenue: number;
  /** Tổng tiền thưởng = Σ(entry.payout.winAmount) cho tất cả entries thắng. */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: Σ(tenantAgg[].commission). */
  totalAgentCommission: number;
}

/**
 * Kết quả tính tài chính kỳ quay.
 *
 * Output của `calculateBingo18DrawFinancials()`.
 * Map trực tiếp lên `DrawFinancial` entity để ghi vào draw document.
 *
 * Bingo 18 KHÔNG có Jackpot → `companyTake` = toàn bộ profit còn lại
 * (revenue - prizes - commission). Có thể âm nếu trả thưởng lớn.
 */
export interface DrawFinancialResult {
  /** Tổng doanh thu = Σ(entry.amount). Copy từ input. */
  totalRevenue: number;
  /** Tổng tiền thưởng = Σ(entry.payout.winAmount). Copy từ input. */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý = Σ(tenant.commissionAmount). */
  totalAgentCommission: number;
  /**
   * Phần công ty thu (VND) = totalRevenue - totalPrizes - totalAgentCommission.
   * Bingo 18 không có Jackpot pool → companyTake = toàn bộ profit, có thể âm.
   * Map lên `DrawFinancial.companyTake` khi ghi vào DB.
   */
  companyTake: number;
}

/**
 * Tính tài chính tổng hợp cho 1 kỳ quay Bingo 18.
 *
 * Bingo 18 KHÔNG có Jackpot, KHÔNG có payout caps.
 * Công thức: companyTake = totalRevenue - totalPrizes - totalAgentCommission (có thể âm).
 *
 * @param input - Dữ liệu tổng hợp từ DB sau khi tất cả entries đã settled.
 * @returns Kết quả tài chính map trực tiếp lên DrawFinancial entity.
 */
export function calculateBingo18DrawFinancials(input: DrawFinancialInput): DrawFinancialResult {
  const { totalRevenue, totalPrizes, totalAgentCommission } = input;

  // companyTake = phần còn lại sau khi trừ giải thưởng + hoa hồng.
  // Không có Jackpot pool → công ty thu toàn bộ phần này. Có thể âm khi giải lớn.
  const companyTake = totalRevenue - totalPrizes - totalAgentCommission;

  return {
    totalRevenue,
    totalPrizes,
    totalAgentCommission,
    companyTake,
  };
}

// ─────────────────────────────────────────────
// Play Rule Hard Caps (chống abuse — độc lập với config động)
// ─────────────────────────────────────────────

/**
 * Hard cap tuyệt đối số board mỗi vé Bingo 18 — chống payload lạm dụng.
 *
 * Đây KHÔNG phải giới hạn nghiệp vụ (giới hạn thật là `play.maxBasicBoardsPerTicket`
 * trong game config, có thể nhỏ hơn). Dùng làm trần cứng ở 2 tầng:
 * - Zod schema place-bet: `boards[]` không quá {@link BINGO18_MAX_BOARDS}.
 * - Zod schema update game config: `maxBasicBoardsPerTicket` không cấu hình vượt trần này.
 *
 * Đảm bảo `maxBasicBoardsPerTicket` luôn ≤ số board tối đa mà API chấp nhận.
 */
export const BINGO18_MAX_BOARDS = 100;

// ─────────────────────────────────────────────
// Default Config Values
// ─────────────────────────────────────────────

export const DEFAULT_BINGO18_CONFIG: Pick<
  GlobalConfigDoc,
  | "rates"
  | "singleNumPrizes"
  | "doubleMatchPrizes"
  | "tripleMatchPrizes"
  | "sumTotalPrizes"
  | "bigSmallDrawPrizes"
  | "play"
  | "ops"
> = {
  rates: {
    defaultCommissionRate: 0.2,
  },
  singleNumPrizes: { ...DEFAULT_SINGLE_NUM_PRIZES },
  doubleMatchPrizes: { ...DEFAULT_DOUBLE_MATCH_PRIZES },
  tripleMatchPrizes: { ...DEFAULT_TRIPLE_MATCH_PRIZES },
  sumTotalPrizes: { ...DEFAULT_SUM_TOTAL_PRIZES },
  bigSmallDrawPrizes: { ...DEFAULT_BIG_SMALL_DRAW_PRIZES },
  play: {
    unitPrice: 10_000,
    minBetCount: 1,
    maxBetCount: 10,
    maxBasicBoardsPerTicket: 6,
    maxDrawCount: 20,
    salesCloseBeforeSeconds: 30,
    drawIntervalMinutes: 6,
    // Kỳ 1 quay lúc 06:06 (KHÔNG phải 06:00) — cùng cơ chế với Keno: kỳ đầu tiên diễn ra
    // sau khi cửa sổ bán vé đầu tiên (6 phút) đóng lại. Suy ra từ dữ liệu thực tế Vietlott
    // (2026-08): kỳ đầu ngày → kỳ cuối ngày chỉ có 158 kỳ (không phải 159). Với lastDrawTime
    // giữ nguyên 21:53 → floor((21:53-06:06)/6) + 1 = 158 kỳ/ngày, kỳ cuối thực tế 21:48.
    firstDrawTime: "06:06",
    lastDrawTime: "21:53",
    timezone: "Asia/Ho_Chi_Minh",
  },
  /**
   * Cấu hình vận hành mặc định (analysis bingo18-ops §3.6, ngưỡng chốt 30/07/2026).
   * Staff chỉnh trên tab "Vận hành"; đổi có hiệu lực trong ~1 chu kỳ worker.
   * `stats` KHÔNG có topCombosK — Bingo 18 dùng OpsStatsConfigBase (không combo).
   */
  ops: {
    alerts: {
      largeBetAmount: 1_000_000,
      exposureWarnRevenuePct: 300,
      exposureWarnMinAmount: 50_000_000,
      sidebetSkewPct: 70,
      bucketConcentrationAmount: 5_000_000,
      enabled: {
        [Bingo18OpsAlertType.LargeBet]: true,
        [Bingo18OpsAlertType.ExposureThreshold]: true,
        [Bingo18OpsAlertType.SidebetSkew]: true,
        [Bingo18OpsAlertType.BucketConcentration]: true,
        // Để dành — không bắn ở P0.
        [Bingo18OpsAlertType.RevenueAnomaly]: false,
        [Bingo18OpsAlertType.SettleStuck]: false,
      },
    },
    stats: {
      tickSeconds: 10,
      topPotentialK: 50,
      topAccountsK: 50,
    },
  },
};
