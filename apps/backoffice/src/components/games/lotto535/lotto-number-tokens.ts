/**
 * Shared design tokens for Lotto 5/35 number display.
 * Single source of truth — import everywhere in the lotto535 UI.
 */

// ─── Number ball color tokens ─────────────────────────────────────────────────

/** Orange circle: main numbers (01–35) */
export const LOTTO_MAIN_BG = "bg-warning text-white";
/** Indigo circle: special number (01–12) */
export const LOTTO_SPECIAL_BG = "bg-info text-white";
/** Muted placeholder when no data */
export const LOTTO_MUTED_BG = "bg-muted/40 text-muted-foreground/40";

/** Inline style hex values for non-Tailwind contexts (SVG, canvas, etc.) */
export const LOTTO_MAIN_HEX = "#fb923c"; // orange-400
export const LOTTO_SPECIAL_HEX = "#818cf8"; // indigo-400

// ─── Size map ─────────────────────────────────────────────────────────────────

export type LottoNumberSize = "xs" | "sm" | "md" | "lg";

export const LOTTO_NUMBER_SIZE: Record<LottoNumberSize, { sizeClass: string; textClass: string }> = {
  xs: { sizeClass: "size-5", textClass: "text-xs" },
  sm: { sizeClass: "size-7", textClass: "text-xs" },
  md: { sizeClass: "size-9", textClass: "text-sm" },
  lg: { sizeClass: "size-11", textClass: "text-base" },
};
