/**
 * Shared components cho settle financial reports của per-game.
 * Dùng chung cho tất cả 7 game: keno, lotto535, mega645, power655, max3d, max3dpro, bingo18.
 *
 * ```tsx
 * import { GameDrawKpiStrip, ... } from "@/components/reports/game/settle";
 * ```
 */

export type { GameDrawKpiData, GameDrawKpiStripProps } from "./game-draw-kpi-strip";
export { GameDrawKpiStrip, GameDrawKpiStripSkeleton } from "./game-draw-kpi-strip";
export type { DrawReportRow, GameDrawReportTableProps } from "./game-draw-report-table";
export { GameDrawReportTable } from "./game-draw-report-table";
export type { DrawTenantRow, GameDrawTenantTableProps } from "./game-draw-tenant-table";
export { GameDrawTenantTable } from "./game-draw-tenant-table";
export type {
  GamePlayerBreakdownTableProps,
  PlayerBreakdownRow,
} from "./game-player-breakdown-table";
export { GamePlayerBreakdownTable } from "./game-player-breakdown-table";
export type { EntryRow, GamePlayerEntryListProps } from "./game-player-entry-list";
export { GamePlayerEntryList } from "./game-player-entry-list";
export type { GameDrawBreadcrumbProps, GameTenantBreadcrumbProps } from "./game-report-breadcrumb";
export { GameDrawBreadcrumb, GameTenantBreadcrumb } from "./game-report-breadcrumb";
export type { GameTenantDrawListProps, TenantDrawRow } from "./game-tenant-draw-list";
export { GameTenantDrawList } from "./game-tenant-draw-list";
export type { GameTenantReportTableProps, TenantSummaryRow } from "./game-tenant-report-table";
export { GameTenantReportTable } from "./game-tenant-report-table";
export type { KpiCardProps } from "./kpi-card";
export { KpiCard } from "./kpi-card";
