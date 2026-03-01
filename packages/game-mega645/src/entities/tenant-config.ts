/**
 * Mega 6/45 – Tenant Game Configuration
 *
 * Collection: mega645GameConfigs (scope = "tenant")
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
