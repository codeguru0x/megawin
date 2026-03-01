/**
 * Mega 6/45 – Game Configuration (union type)
 */

import type { GlobalConfigDoc } from "./global-config";
import type { TenantConfigDoc } from "./tenant-config";

export type GameConfigDoc = GlobalConfigDoc | TenantConfigDoc;
