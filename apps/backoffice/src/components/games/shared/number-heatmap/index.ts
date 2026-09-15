/**
 * Number heatmap — shared hover surface (ops backoffice).
 *
 * Design roles:
 * - **Hint Tooltip** — shadcn `Tooltip` inverted (`bg-foreground`): hint 1–2 dòng.
 * - **Data Hover Surface** — module này (`DATA_HOVER_SURFACE_CLASS` / HoverLayer):
 *   rich preview trên grid hàng chục–trăm ô. O(1) panel, không mount N Radix Tooltip.
 *
 * Cấm: `TooltipProvider` / `Tooltip` per `NumberCell`; cấm override `TooltipContent`
 * bằng `bg-popover` (Arrow shadcn hardcode foreground → caret lệch màu).
 */

export { DATA_HOVER_SURFACE_CLASS } from "./hover-surface-class";
export { NumberHeatmapCellDetail } from "./number-heatmap-cell-detail";
export { NumberHeatmapHoverLayer } from "./number-heatmap-hover-layer";
export {
  type NumberHeatmapHovered,
  type NumberHeatmapHoverItem,
  useNumberHeatmapHover,
} from "./use-number-heatmap-hover";
