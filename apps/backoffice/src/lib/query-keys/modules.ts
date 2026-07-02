/**
 * Registry tất cả Module ID dùng cho query keys.
 *
 * ĐÂY LÀ SINGLE SOURCE OF TRUTH — mọi module ID phải khai báo tại đây.
 * TypeScript sẽ báo lỗi compile-time nếu 2 key trùng value nhờ kiểu `QueryModule`.
 *
 * Khi thêm game/feature mới:
 *   1. Thêm 1 entry vào object `MODULES` bên dưới
 *   2. Tạo file query keys tương ứng, import module ID từ file này
 */
export const MODULES = {
  tenants: "tenants",
  accounts: "accounts",
  me: "me",
  lotto535: "lotto535",
  keno: "keno",
  power655: "power655",
  mega645: "mega645",
  max3d: "max3d",
  max3dpro: "max3dpro",
  bingo18: "bingo18",
  reports: "reports",
  dashboard: "dashboard",
  txLogs: "tx-logs",
  tenantDispatch: "tenant-dispatch",
  auditLogs: "audit-logs",
} as const;

/** Union type tất cả module ID hợp lệ */
export type QueryModule = (typeof MODULES)[keyof typeof MODULES];
