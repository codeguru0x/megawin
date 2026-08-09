/**
 * Lotto 5/35 – Game Configuration
 *
 * Collection: lotto535GameConfigs
 *
 * Re-export từ global-config.ts và tenant-config.ts.
 * File này giữ lại để backward compatible với các import hiện tại.
 *
 * 2 loại document:
 *   1. Global (scope = "global", tenantId = null): 1 document duy nhất.
 *   2. Per-tenant (scope = "tenant", tenantId = "xxx"): override cho từng tenant.
 */

/** Union type cho collection lotto535GameConfigs. */
export type { GlobalConfigDoc, GlobalConfigDoc as _GlobalConfigDoc } from "./global-config";
export type { TenantConfigDoc, TenantConfigDoc as _TenantConfigDoc } from "./tenant-config";

import type { GlobalConfigDoc } from "./global-config";
import type { TenantConfigDoc } from "./tenant-config";

export type GameConfigDoc = GlobalConfigDoc | TenantConfigDoc;
