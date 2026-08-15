// AI Panel — Persisted State (cookie: ai_panel_state, ai_panel_width)

export const AI_PANEL_STATE_VALUES = ["open", "closed"] as const;
export type AiPanelState = (typeof AI_PANEL_STATE_VALUES)[number];

/** Giới hạn width panel (px) — resize handle clamp về khoảng này. */
export const AI_PANEL_MIN_WIDTH = 340;
export const AI_PANEL_MAX_WIDTH = 480;
export const AI_PANEL_DEFAULT_WIDTH = 400;

/**
 * Clamp width đọc từ cookie về khoảng hợp lệ — phòng cookie bị sửa tay ngoài range
 * hoặc giá trị không parse được thành số.
 */
export function clampAiPanelWidth(raw: string | undefined): number {
  const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
  if (Number.isNaN(parsed)) {
    return AI_PANEL_DEFAULT_WIDTH;
  }
  return Math.min(AI_PANEL_MAX_WIDTH, Math.max(AI_PANEL_MIN_WIDTH, parsed));
}
