import type { DashboardGameDailyData } from "@megawin/game-core-application/repos";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import {
  GAME_LABELS as CORE_GAME_LABELS,
  getGameLabel as coreGetGameLabel,
} from "@megawin/game-core/labels";
import { getGameHex } from "@/lib/game-colors";

/**
 * Tổng hợp KPI toàn hệ thống từ raw per-game data của 1 ngày tài chính.
 *
 * Dùng cho Hero KPI cards và Game Performance table.
 * Client-side compute để tái dùng cùng 1 API response cho nhiều zones.
 */
export interface DashboardDayKpis {
  /** Tổng doanh thu bán vé (VND). */
  totalStake: number;
  /** Tổng GGR = totalStake - totalPayout (VND). */
  totalGgr: number;
  /** Lợi nhuận ròng = GGR - commission (VND). */
  totalProfit: number;
  /** Tổng số entry đã settle. */
  totalEntries: number;
  /** Số player (unique accountId) trong ngày. Sum across games — có thể double-count nếu 1 player chơi nhiều game. */
  totalPlayers: number;
  /** Số kỳ quay đã settle. */
  totalDraws: number;
  /** Payout ratio = totalPayout / totalStake (0-1). */
  payoutRatio: number;
  /** Per-game breakdown, sorted by totalStake desc. */
  byGame: DashboardGameDailyData[];
}

/**
 * Tính % thay đổi so với ngày base.
 *
 * Trả null khi base = 0 (không chia cho 0).
 * Trả null khi baseValue không có (không so sánh được).
 */
export function calcTrendPercent(current: number, base: number | undefined): number | null {
  if (base == null || base === 0) return null;
  return ((current - base) / base) * 100;
}

/**
 * Tổng hợp KPI từ raw per-game data cho 1 ngày tài chính cụ thể.
 */
export function computeDayKpis(
  data: DashboardGameDailyData[],
  financialDate: string,
): DashboardDayKpis {
  const dayData = data.filter((r) => r.financialDate === financialDate);

  const totalStake = dayData.reduce((s, r) => s + r.totalStake, 0);
  const totalPayout = dayData.reduce((s, r) => s + r.totalPayout, 0);
  const totalCommission = dayData.reduce((s, r) => s + r.totalCommission, 0);
  const totalGgr = totalStake - totalPayout;
  const totalProfit = totalGgr - totalCommission;
  const totalEntries = dayData.reduce((s, r) => s + r.entryCount, 0);
  const totalPlayers = dayData.reduce((s, r) => s + (r.playerCount ?? 0), 0);
  const totalDraws = dayData.reduce((s, r) => s + r.drawCount, 0);
  const payoutRatio = totalStake > 0 ? totalPayout / totalStake : 0;

  const byGame = [...dayData].sort((a, b) => b.totalStake - a.totalStake);

  return {
    totalStake,
    totalGgr,
    totalProfit,
    totalEntries,
    totalPlayers,
    totalDraws,
    payoutRatio,
    byGame,
  };
}

/**
 * Thống kê payout ratio per-game cho chart.
 * Sorted by payoutRatio descending (game cao nhất trước).
 */
export interface GamePayoutRatioRow {
  gameProduct: string;
  totalStake: number;
  totalPayout: number;
  /** Payout ratio = totalPayout / totalStake (0-1). Có thể > 1. */
  payoutRatio: number;
}

export function computePayoutRatios(data: DashboardGameDailyData[]): GamePayoutRatioRow[] {
  return data
    .map((r) => ({
      gameProduct: r.gameProduct,
      totalStake: r.totalStake,
      totalPayout: r.totalPayout,
      payoutRatio: r.totalStake > 0 ? r.totalPayout / r.totalStake : 0,
    }))
    .sort((a, b) => b.payoutRatio - a.payoutRatio);
}

/** Delegate sang game-core/labels — tên hiển thị chính thức. */
export { CORE_GAME_LABELS as GAME_LABELS };

export function getGameLabel(gameProduct: string): string {
  return coreGetGameLabel(gameProduct as GameProduct);
}

/**
 * Màu hex cho mỗi game — delegate sang `@/lib/game-colors`.
 * Keys khớp với GameProduct enum values.
 * Dùng cho Recharts fill/stroke và inline style.
 *
 * @deprecated Dùng `getGameHex(gameProduct)` hoặc `getGameColors(gameProduct)` trực tiếp.
 */
export const GAME_CHART_COLORS: Record<string, string> = Object.fromEntries(
  Object.values(GameProduct).map((gp) => [gp, getGameHex(gp)]),
);

export function getGameColor(gameProduct: string): string {
  return getGameHex(gameProduct);
}
