/**
 * Shared outstanding components dùng chung cho tất cả 7 game.
 *
 * ```tsx
 * import { OutstandingContent, ... } from "@/components/reports/game/outstanding";
 * ```
 */

export { OutstandingContent } from "./outstanding-content";
export type { OutstandingContentProps } from "./outstanding-content";

export { OutstandingKpiStrip } from "./outstanding-kpi-strip";

export { OutstandingBreadcrumb } from "./outstanding-breadcrumb";
export type { OutstandingBreadcrumbProps } from "./outstanding-breadcrumb";

export { OutstandingDrawList } from "./outstanding-draw-list";
export type { OutstandingDrawListProps } from "./outstanding-draw-list";

export { OutstandingTenantBreakdown } from "./outstanding-tenant-breakdown";
export type { OutstandingTenantBreakdownProps } from "./outstanding-tenant-breakdown";

export { OutstandingPlayerBreakdown } from "./outstanding-player-breakdown";
export type { OutstandingPlayerBreakdownProps } from "./outstanding-player-breakdown";

export { OutstandingEntryList } from "./outstanding-entry-list";
export type { OutstandingEntryListProps } from "./outstanding-entry-list";

export type {
  OutstandingDrillLevel,
  OutstandingDrawRow,
  OutstandingTenantRow,
  OutstandingPlayerRow,
  OutstandingEntryRow,
  OutstandingKpiData,
} from "./types";
