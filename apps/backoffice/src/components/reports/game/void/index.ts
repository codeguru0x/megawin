/**
 * Shared void report components dùng chung cho tất cả 7 game.
 *
 * ```tsx
 * import { VoidContent, ... } from "@/components/reports/game/void";
 * ```
 */

export type {
  VoidDrawRow,
  VoidDrillLevel,
  VoidEntryRow,
  VoidKpiData,
  VoidPlayerRow,
  VoidTenantRow,
} from "./types";
export type { VoidBreadcrumbProps } from "./void-breadcrumb";
export { VoidBreadcrumb } from "./void-breadcrumb";
export type { VoidContentProps } from "./void-content";
export { VoidContent } from "./void-content";
export type { VoidDrawListProps } from "./void-draw-list";
export { VoidDrawList } from "./void-draw-list";
export type { VoidEntryListProps } from "./void-entry-list";
export { VoidEntryList } from "./void-entry-list";
export { VoidKpiStrip } from "./void-kpi-strip";
export type { VoidPlayerBreakdownProps } from "./void-player-breakdown";
export { VoidPlayerBreakdown } from "./void-player-breakdown";
export type { VoidTenantBreakdownProps } from "./void-tenant-breakdown";
export { VoidTenantBreakdown } from "./void-tenant-breakdown";
