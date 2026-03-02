/**
 * Bingo 18 – Tenant Game Configuration
 *
 * Collection: bingo18_game_configs (scope = "tenant")
 *
 * Cấu hình game riêng cho từng tenant (đại lý).
 * Chỉ chứa các field cần override.
 * Những gì không set sẽ fallback về global config.
 */

import type { GameConfigScope } from "@megawin/game-core/entities";

export interface TenantConfigDoc {
  _id: unknown;

  /** Luôn = "tenant". */
  scope: typeof GameConfigScope.Tenant;

  /** ID của tenant/đại lý. */
  tenantId: string;

  /** Hoa hồng đại lý cho tenant này. */
  commissionRate: number;

  /** Tenant có được phép chơi game này không. */
  isEnabled: boolean;

  /** Version config. */
  version: number;

  createdAt: Date;
  updatedAt: Date;
}
