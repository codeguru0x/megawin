/**
 * Validation – Hằng số và regex patterns dùng chung toàn hệ thống.
 *
 * Import: @megawin/shared/constants/validation
 */

export const OBJECT_ID_REGEX = /^[a-f\d]{24}$/i;

export const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** drawId format dùng chung cho tất cả game: "YYYY-MM-DD.NNN" (NNN = sequence 001-999). */
export const DRAW_ID_REGEX = /^\d{4}-\d{2}-\d{2}\.\d{3}$/;

/**
 * Trần `drawNo` trong 1 ngày = 999 — hệ quả TRỰC TIẾP của {@link DRAW_ID_REGEX}: phần `NNN`
 * là ĐÚNG 3 chữ số, nên `drawNo` ≥ 1000 sinh ra drawId 4 chữ số ("2026-08-28.1000") bị mọi
 * schema drawId (api-player, backoffice nav-registry, `{game}DrawIdSchema`) từ chối.
 *
 * Kỳ đó sẽ nằm trong DB nhưng KHÔNG tra cứu / công bố kết quả được → phải chặn ngay lúc tạo,
 * KHÔNG để lọt xuống DB (xem `CreateDrawUseCase` của Keno/Bingo 18 — 2 game duy nhất cấp
 * `drawNo` bằng atomic counter nên có thể vượt 999 khi counter tiêu thụ nhiều dải).
 */
export const MAX_DRAW_NO_PER_DAY = 999;
