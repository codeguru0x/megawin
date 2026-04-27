/**
 * Shared types cho void report drill-down components.
 * Dùng chung cho tất cả 7 game.
 */

/** Drill level trong Void Reports page. */
export type VoidDrillLevel = "list" | "draw-tenants" | "players" | "entries";

/** Một hàng kỳ quay void — Level 1. */
export interface VoidDrawRow {
  drawId: string;
  financialDate: string;
  entryCount: number;
  playerCount: number;
  tenantCount: number;
  /** Tổng tiền cược gốc trước khi hoàn (VND). */
  totalOriginalStake: number;
  /** Tổng tiền hoàn trả (VND). */
  totalRefundAmount: number;
}

/** Một hàng đại lý trong draw void — Level 2. */
export interface VoidTenantRow {
  tenantId: string;
  playerCount: number;
  entryCount: number;
  /** Tổng tiền cược gốc (VND). */
  totalOriginalStake: number;
  /** Tổng tiền hoàn trả (VND). */
  totalRefundAmount: number;
}

/** Một hàng player trong tenant void — Level 3. */
export interface VoidPlayerRow {
  accountId: string;
  /** Username hiển thị đã qua `toTenantUsername`. Nếu null dùng accountId. */
  displayName: string;
  entryCount: number;
  /** Tổng tiền cược gốc (VND). */
  totalOriginalStake: number;
  /** Tổng tiền hoàn trả (VND). */
  totalRefundAmount: number;
}

/** Một entry void — Level 4. */
export interface VoidEntryRow {
  id: string;
  /** Mã vé hiển thị. Fallback về id nếu không có. */
  ticketNo?: string | null;
  createdAt: string | Date;
  /** Số boards. */
  boardCount?: number;
  /** Số dòng cược (lines). Keno/Bingo18: `undefined`. */
  lineCount?: number;
  /** Tiền cược gốc (VND). */
  originalAmount: number;
  /** Tiền hoàn trả (VND). */
  refundAmount: number;
}

/** Callbacks navigation cho drill-down. */
export interface VoidNavigation {
  navigateToList: () => void;
  navigateToDraw: (drawId: string) => void;
  navigateToTenant: (tenantId: string) => void;
  navigateToPlayer: (accountId: string, displayName?: string) => void;
}

/** KPI summary data cho VoidKpiStrip. */
export interface VoidKpiData {
  totalVoidedDraws: number;
  totalEntries: number;
  totalOriginalStake: number;
  totalRefundAmount: number;
}
