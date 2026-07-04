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
export { max3dKeys } from "./max3d";
export { max3dproKeys } from "./max3dpro";
export { bingo18Keys } from "./bingo18";
export { tenantsKeys } from "./tenants";
export { accountsKeys } from "./accounts";
export { playerDetailKeys } from "./player-detail";
export { meKeys, type MyAuditLogsListFilters } from "./me";
export { reportsKeys } from "./reports";
export { dashboardKeys } from "./dashboard";
export { txLogsKeys } from "./tx-logs";
export { tenantDispatchKeys } from "./tenant-dispatch";
export { auditLogsKeys, type AuditLogsListFilters } from "./audit-logs";

import { lotto535Keys } from "./lotto535";
import { kenoKeys } from "./keno";
import { power655Keys } from "./power655";
import { mega645Keys } from "./mega645";
import { max3dKeys } from "./max3d";
import { max3dproKeys } from "./max3dpro";
import { bingo18Keys } from "./bingo18";
import { tenantsKeys } from "./tenants";
import { accountsKeys } from "./accounts";
import { playerDetailKeys } from "./player-detail";
import { meKeys } from "./me";
import { reportsKeys } from "./reports";
import { dashboardKeys } from "./dashboard";
import { txLogsKeys } from "./tx-logs";
import { tenantDispatchKeys } from "./tenant-dispatch";
import { auditLogsKeys } from "./audit-logs";

export const queryKeys = {
  tenants: tenantsKeys,
  accounts: accountsKeys,
  playerDetail: playerDetailKeys,
  me: meKeys,
  lotto535: lotto535Keys,
  keno: kenoKeys,
  power655: power655Keys,
  mega645: mega645Keys,
  max3d: max3dKeys,
  max3dpro: max3dproKeys,
  bingo18: bingo18Keys,
  reports: reportsKeys,
  dashboard: dashboardKeys,
  txLogs: txLogsKeys,
  tenantDispatch: tenantDispatchKeys,
  auditLogs: auditLogsKeys,
} as const;
