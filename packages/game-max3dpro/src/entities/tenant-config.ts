/**
 * Max 3D Pro – Tenant Game Configuration
 *
 * Collection: max3d_pro_game_configs (scope = "tenant")
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
