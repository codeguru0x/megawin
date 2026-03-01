/**
 * Centralized React Query Key Factory
 *
 * ═══════════════════════════════════════════════════════════════════
 *  QUY TẮC ĐẶT TÊN QUERY KEY (NAMING CONVENTION)
 * ═══════════════════════════════════════════════════════════════════
 *
 * 1. CẤU TRÚC:  [module, resource, ...params?]
 *    - Segment đầu tiên LUÔN là tên module (game/feature): "lotto535", "keno", "power655", "accounts" ...
 *    - Segment thứ hai là tên resource: "config", "draws", "jackpot-current" ...
 *    - Segment tiếp theo (nếu có) là params dạng object để React Query tự diff.
 *
 * 2. MODULE ID (segment đầu tiên):
 *    - Dùng kebab-case hoặc camelCase ngắn gọn, KHÔNG trùng giữa các game/feature.
 *    - Mỗi game/feature có 1 file riêng trong thư mục này, export 1 object chứa tất cả keys.
 *    - Ví dụ: "lotto535", "keno", "power655", "accounts", "tenants"
 *
 * 3. KEY `all`:
 *    - Mỗi module BẮT BUỘC có key `all` = [moduleId] để dùng cho invalidateQueries toàn module.
 *    - Ví dụ: queryKeys.lotto535.all → ["lotto535"]
 *
 * 4. RESOURCE NAMING:
 *    - Dùng kebab-case cho resource name: "tenant-configs", "jackpot-current", "jackpot-history"
 *    - Resource có filter/pagination → dùng function trả về tuple có params:
 *        draws: (params?) => ["lotto535", "draws", params] | ["lotto535", "draws"]
 *
 * 5. TRÁNH TRÙNG KEY:
 *    - Tất cả module ID được khai báo tập trung trong `modules.ts` (SINGLE SOURCE OF TRUTH).
 *    - KHÔNG tự khai báo module ID string trong file riêng lẻ.
 *    - TypeScript đảm bảo compile-time safety: nếu 2 module trùng key sẽ báo lỗi.
 *
 * 6. KHI THÊM GAME/FEATURE MỚI:
 *    a) Thêm module ID vào `MODULES` object trong `modules.ts`
 *    b) Tạo file `<moduleId>.ts`, import module ID từ `modules.ts`
 *    c) Export 1 const object với đầy đủ keys
 *    d) Import và thêm vào `queryKeys` aggregate object trong file index.ts
 *
 * ═══════════════════════════════════════════════════════════════════
 *
 * Usage:
 *   import { queryKeys } from "@/lib/query-keys";
 *   useQuery({ queryKey: queryKeys.lotto535.currentDraw, ... });
 *   qc.invalidateQueries({ queryKey: queryKeys.lotto535.all });
 *
 *   // Hoặc import trực tiếp keys của 1 game:
 *   import { lotto535Keys } from "@/lib/query-keys";
 *   useQuery({ queryKey: lotto535Keys.draws({ page: 1 }), ... });
 */

export { lotto535Keys } from "./lotto535";
export { kenoKeys } from "./keno";
export { power655Keys } from "./power655";
export { mega645Keys } from "./mega645";

import { lotto535Keys } from "./lotto535";
import { kenoKeys } from "./keno";
import { power655Keys } from "./power655";
import { mega645Keys } from "./mega645";

export const queryKeys = {
  lotto535: lotto535Keys,
  keno: kenoKeys,
  power655: power655Keys,
  mega645: mega645Keys,
} as const;
