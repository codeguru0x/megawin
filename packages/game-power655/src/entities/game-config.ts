/**
 * Power 6/55 – Game Config (unified type)
 *
 * Union type cho cả 2 loại config:
 * - GlobalConfigDoc/Entity: cấu hình toàn hệ thống (scope = "global")
 * - TenantConfigDoc/Entity: cấu hình per-tenant (scope = "tenant")
 *
 * Cả 2 lưu trong cùng collection power655GameConfigs,
 * phân biệt bằng field scope + tenantId.
 */

import type { GlobalConfigDoc, GlobalConfigEntity } from "./global-config";
import type { TenantConfigDoc, TenantConfigEntity } from "./tenant-config";

/** Union MongoDB document. */
export type GameConfigDoc = GlobalConfigDoc | TenantConfigDoc;

/** Union application entity. */
export type GameConfigEntity = GlobalConfigEntity | TenantConfigEntity;
