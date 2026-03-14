/**
 * Max 3D – Tenant Game Configuration
 *
 * Collection: max3d_game_configs (scope = "tenant")
 */

import type { GameConfigScope } from "@megawin/game-core/entities";

export interface TenantConfigDoc {
  _id: unknown;
  scope: typeof GameConfigScope.Tenant;
  tenantId: string;
  commissionRate: number;
  isEnabled: boolean;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface TenantConfigEntity extends Omit<TenantConfigDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
