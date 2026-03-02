/**
 * Max 3D Pro – Game Configuration (union type)
 */

export type { GlobalConfigDoc } from "./global-config";
export type { TenantConfigDoc } from "./tenant-config";

import type { GlobalConfigDoc } from "./global-config";
import type { TenantConfigDoc } from "./tenant-config";

export type GameConfigDoc = GlobalConfigDoc | TenantConfigDoc;
