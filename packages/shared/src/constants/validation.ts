/**
 * Validation – Hằng số và regex patterns dùng chung toàn hệ thống.
 *
 * Import: @megawin/shared/constants/validation
 */

export const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** drawId format dùng chung cho tất cả game: "YYYY-MM-DD.NNN" (NNN = sequence 001-999). */
export const DRAW_ID_REGEX = /^\d{4}-\d{2}-\d{2}\.\d{3}$/;
