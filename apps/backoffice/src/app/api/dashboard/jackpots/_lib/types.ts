/**
 * DTO types cho dashboard jackpots API response.
 *
 * Định nghĩa tại API route level — không thuộc game-core-application
 * vì chỉ phục vụ backoffice dashboard, không phải core domain.
 *
 * Consumer: apps/backoffice (use-dashboard-queries, jackpot-pools component).
 */

/** Jackpot info tối giản cho dashboard card — game single jackpot (Mega645, Lotto535). */
export interface DashboardJackpotInfo {
  /** Số cycle hiện tại. */
  cycleNo: number;
  /** Giá trị pool hiện tại (VND). */
  currentAmount: number;
  /** Giá trị seed (VND). */
  seedAmount: number;
  /** Số kỳ kể từ khi bắt đầu cycle. */
  drawCount: number;
  /** Ngưỡng split — chỉ Lotto535 (VND). */
  splitThreshold?: number;
  /** Phần trăm đã tích lũy tới ngưỡng (0-100). */
  progressPercent?: number;
}

/** Power 6/55 có dual jackpot JP1 + JP2. */
export interface DashboardPower655JackpotInfo {
  /** Số cycle hiện tại. */
  cycleNo: number;
  /** Pool JP1 hiện tại (VND) — giải 6/6. */
  jp1Current: number;
  /** Pool JP2 hiện tại (VND) — giải 5/6 + bonus. */
  jp2Current: number;
  /** Seed JP1 (VND). */
  jp1Seed: number;
  /** Seed JP2 (VND). */
  jp2Seed: number;
  /** Số kỳ kể từ khi bắt đầu cycle. */
  drawCount: number;
  /** Ngưỡng overflow JP1 → JP2 (VND). */
  jp1OverflowThreshold: number;
}

export interface GetDashboardJackpotsOutput {
  mega645: DashboardJackpotInfo | null;
  power655: DashboardPower655JackpotInfo | null;
  lotto535: DashboardJackpotInfo | null;
}
