/**
 * Keno – Game Configuration (barrel re-export)
 *
 * Giữ backward compatibility. Import trực tiếp từ global-config hoặc tenant-config
 * khi cần rõ ràng hơn.
 */

export type { GlobalConfigDoc } from "./global-config";
export type { TenantConfigDoc } from "./tenant-config";

export type GameConfigDoc =
  import("./global-config").GlobalConfigDoc | import("./tenant-config").TenantConfigDoc;
