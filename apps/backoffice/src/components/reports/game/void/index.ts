/**
 * Shared void report components dùng chung cho tất cả 7 game.
 *
 * ```tsx
 * import { VoidContent, ... } from "@/components/reports/game/void";
 * ```
 */

export { VoidContent } from "./void-content";
export type { VoidContentProps } from "./void-content";

export { VoidKpiStrip } from "./void-kpi-strip";

export { VoidBreadcrumb } from "./void-breadcrumb";
export type { VoidBreadcrumbProps } from "./void-breadcrumb";

export { VoidDrawList } from "./void-draw-list";
export type { VoidDrawListProps } from "./void-draw-list";

export { VoidTenantBreakdown } from "./void-tenant-breakdown";
export type { VoidTenantBreakdownProps } from "./void-tenant-breakdown";

export { VoidPlayerBreakdown } from "./void-player-breakdown";
export type { VoidPlayerBreakdownProps } from "./void-player-breakdown";

export { VoidEntryList } from "./void-entry-list";
export type { VoidEntryListProps } from "./void-entry-list";

export type {
  VoidDrillLevel,
  VoidDrawRow,
  VoidTenantRow,
  VoidPlayerRow,
  VoidEntryRow,
  VoidKpiData,
} from "./types";
