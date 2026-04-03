/**
 * Shared types cho outstanding drill-down components.
 * Dùng chung cho tất cả 7 game.
 */

/** Drill level trong Outstanding page. */
export type OutstandingDrillLevel = "list" | "draw-tenants" | "players" | "entries";

/** Một hàng kỳ quay outstanding — Level 1. */
export interface OutstandingDrawRow {
  drawId: string;
  financialDate: string;
  playerCount: number;
  tenantCount: number;
  entryCount: number;
  /** Tổng số dòng cược. `undefined` với game không có lines (Keno, Bingo18). */
  lineCount?: number;
  estimatedCommission: number;
  totalStake: number;
}

/** Một hàng đại lý trong draw — Level 2. */
export interface OutstandingTenantRow {
  tenantId: string;
  playerCount: number;
  entryCount: number;
  /** Tổng số dòng cược. `undefined` với game không có lines (Keno, Bingo18). */
  lineCount?: number;
  estimatedCommission: number;
  totalStake: number;
}

/** Một hàng player trong tenant — Level 3. */
export interface OutstandingPlayerRow {
  accountId: string;
  /** Username hiển thị đã qua `toTenantUsername`. Nếu null dùng accountId. */
  displayName: string;
  entryCount: number;
  /** Tổng số dòng cược. `undefined` với game không có lines (Keno, Bingo18). */
  lineCount?: number;
  commissionAmount: number;
  totalStake: number;
}

/** Một entry outstanding — Level 4. */
export interface OutstandingEntryRow {
  id: string;
  /** Mã vé hiển thị. Fallback về id nếu không có. */
  ticketNo?: string | null;
  createdAt: string | Date;
  /**
   * Số boards = `entrySummary.boards.length`.
   * Tất cả 7 game đều có. `undefined` khi data cũ không truyền vào.
   *
   * - Games không có lines (Keno, Bingo18): đây là thông tin duy nhất về số lượt chọn.
   * - Games có lines: ghép với `lineCount` thành `{boardCount} / {lineCount}`.
   */
  boardCount?: number;
  /**
   * Số dòng cược (lines).
   * Games có lines (lotto535, mega645, power655, max3d, max3dpro): = `lineCount` trên entity.
   * Keno/Bingo18: `undefined`.
   */
  lineCount?: number;
  /**
   * Số lần tham gia dự thưởng.
   * Games có lines: Σ(expandedLines × betCount).
   * Keno/Bingo18: Σ(board.betCount).
   * `undefined` khi data cũ chưa có field này (backward compat).
   */
  betUnitCount?: number;
  commissionAmount: number;
  totalStake: number;
}

/** Callbacks navigation cho drill-down. */
export interface OutstandingNavigation {
  navigateToList: () => void;
  navigateToDraw: (drawId: string) => void;
  navigateToTenant: (tenantId: string) => void;
  navigateToPlayer: (accountId: string, displayName?: string) => void;
}

/** KPI summary data cho OutstandingKpiStrip. */
export interface OutstandingKpiData {
  activeDrawCount: number;
  totalEntries: number;
  totalLines?: number;
  totalCommission: number;
  totalStake: number;
}
