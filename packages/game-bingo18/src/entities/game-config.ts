/**
 * Bingo 18 – Game Configuration (barrel re-export)
 */

export type { GlobalConfigDoc } from "./global-config";
export type { TenantConfigDoc } from "./tenant-config";

export type GameConfigDoc = import("./global-config").GlobalConfigDoc | import("./tenant-config").TenantConfigDoc;
