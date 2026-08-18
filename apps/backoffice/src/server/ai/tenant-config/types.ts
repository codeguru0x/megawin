/**
 * `getTenantGameConfig` — types dispatcher gộp 7 game (p1-03 §2.6).
 *
 * Dùng `ConfigItem` (cùng lớp nghĩa với `getGameConfig`) vì `commissionRate`/`isEnabled` là cấu
 * hình tĩnh cần `label`/`unit`/`note` — model đã thuộc quy tắc đọc payload này, không cần dạy
 * thêm quy tắc mới.
 */

import type { GameProduct } from "@megawin/game-core/entities";

import type { ConfigItem } from "../payload";

export type { ConfigItem, ConfigUnit } from "../payload";

/** `meta` của `getTenantGameConfig` — model biết đang xem 1 đại lý cụ thể hay toàn bộ. */
export interface TenantConfigMeta {
  game: GameProduct;
  /** Từ `GAME_LABELS`, KHÔNG tự map lại. */
  gameLabel: string;
  /** `undefined` khi liệt kê TẤT CẢ đại lý (không truyền `tenantId`). */
  tenantId?: string;
  /** Số đại lý trả về — để model biết có bị cắt hay đang xem đúng 1 đại lý. */
  count: number;
  /** Thời điểm tool đọc (ISO). */
  fetchedAt: string;
}

/** 1 đại lý đã gắn nhãn — `items` dùng chung `ConfigItem` để model đọc nhất quán với `getGameConfig`. */
export interface TenantConfigRow {
  tenantId: string;
  items: ConfigItem[];
}

export interface GetTenantGameConfigDispatchInput {
  game: GameProduct;
  /** Bỏ trống → liệt kê cấu hình của TẤT CẢ đại lý đã tạo cho game này. */
  tenantId?: string;
}

export interface GetTenantGameConfigDispatchOutput {
  meta: TenantConfigMeta;
  rows: TenantConfigRow[];
}
