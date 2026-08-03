import { MODULES } from "./modules";

const MODULE = MODULES.workers;

/**
 * Query keys cho trang "Sức khoẻ worker" (`/system/workers`).
 *
 * V1 không filter (15 dòng, xem hết trên 1 màn) — `list()` KHÔNG nhận params,
 * khác các module khác. Thêm filter ở tương lai thì mới thêm params vào đây.
 */
export const workersKeys = {
  all: [MODULE] as const,
  list: () => [MODULE, "list"] as const,
};
