/**
 * Shared components cho settle financial reports của per-game.
 * Dùng chung cho tất cả 7 game: keno, lotto535, mega645, power655, max3d, max3dpro, bingo18.
 *
 * ```tsx
 * import { GameDrawKpiStrip, ... } from "@/components/reports/game/settle";
 * ```
 */

export { KpiCard } from "./kpi-card";
export type { KpiCardProps } from "./kpi-card";

export { GameDrawKpiStrip, GameDrawKpiStripSkeleton } from "./game-draw-kpi-strip";
export type { GameDrawKpiData, GameDrawKpiStripProps } from "./game-draw-kpi-strip";

export { GameDrawReportTable } from "./game-draw-report-table";
export type { DrawReportRow, GameDrawReportTableProps } from "./game-draw-report-table";

export { GameDrawTenantTable } from "./game-draw-tenant-table";
export type { DrawTenantRow, GameDrawTenantTableProps } from "./game-draw-tenant-table";

export { GameTenantReportTable } from "./game-tenant-report-table";
export type { TenantSummaryRow, GameTenantReportTableProps } from "./game-tenant-report-table";

export { GameTenantDrawList } from "./game-tenant-draw-list";
export type { TenantDrawRow, GameTenantDrawListProps } from "./game-tenant-draw-list";

export { GamePlayerBreakdownTable } from "./game-player-breakdown-table";
export type {
  PlayerBreakdownRow,
  GamePlayerBreakdownTableProps,
} from "./game-player-breakdown-table";

export { GameDrawBreadcrumb, GameTenantBreadcrumb } from "./game-report-breadcrumb";
export type { GameDrawBreadcrumbProps, GameTenantBreadcrumbProps } from "./game-report-breadcrumb";

export { GamePlayerEntryList } from "./game-player-entry-list";
export type { EntryRow, GamePlayerEntryListProps } from "./game-player-entry-list";
