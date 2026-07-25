/**
 * Shared outstanding components dùng chung cho tất cả 7 game.
 *
 * ```tsx
 * import { OutstandingContent, ... } from "@/components/reports/game/outstanding";
 * ```
 */

export type { OutstandingBreadcrumbProps } from "./outstanding-breadcrumb";
export { OutstandingBreadcrumb } from "./outstanding-breadcrumb";
export type { OutstandingContentProps } from "./outstanding-content";
export { OutstandingContent } from "./outstanding-content";
export type { OutstandingDrawListProps } from "./outstanding-draw-list";
export { OutstandingDrawList } from "./outstanding-draw-list";
export type { OutstandingEntryListProps } from "./outstanding-entry-list";
export { OutstandingEntryList } from "./outstanding-entry-list";
export { OutstandingKpiStrip } from "./outstanding-kpi-strip";
export type { OutstandingPlayerBreakdownProps } from "./outstanding-player-breakdown";
export { OutstandingPlayerBreakdown } from "./outstanding-player-breakdown";
export type { OutstandingTenantBreakdownProps } from "./outstanding-tenant-breakdown";
export { OutstandingTenantBreakdown } from "./outstanding-tenant-breakdown";
export type {
  OutstandingDrawRow,
  OutstandingDrillLevel,
  OutstandingEntryRow,
  OutstandingKpiData,
  OutstandingPlayerRow,
  OutstandingTenantRow,
} from "./types";
