import type { DashboardGameDailyData } from "@megawin/game-core-application/repos";
import { GameProduct } from "@megawin/game-core/entities/game-core.enums";
import { getGameLabel as coreGetGameLabel } from "@megawin/game-core/labels";

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

/** Delegate sang game-core/labels — tên hiển thị chính thức. */
export function getGameLabel(gameProduct: string): string {
  return coreGetGameLabel(gameProduct as GameProduct);
}
