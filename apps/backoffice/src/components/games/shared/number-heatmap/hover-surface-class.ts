/**
 * Design token class cho **Data Hover Surface** (rich preview trên heatmap / +N chips).
 *
 * Không dùng cho Hint Tooltip shadcn (inverted `bg-foreground`) — đó là role khác.
 * Surface dùng popover tokens → caret/panel tự khớp light/dark, không cần CSS hack Arrow.
 */
export const DATA_HOVER_SURFACE_CLASS =
  "bg-popover text-popover-foreground border border-border shadow-lg rounded-xl px-3 py-2.5";
