/**
 * Lotto 5/35 – Tenant Game Configuration
 *
 * Collection: lotto535GameConfigs (scope = "tenant")
 *
 * Cấu hình game riêng cho từng tenant (đại lý).
 * Chỉ chứa các field cần override.
 * Những gì không set sẽ fallback về global config.
 */

import type { GameConfigScope } from "@megawin/game-core/entities";
import type { PrizeAmounts } from "./types";

/**
 * Cấu hình game riêng cho từng tenant (đại lý).
 *
 * Chỉ chứa các field cần override.
 * Những gì không set sẽ fallback về global config.
 */
export interface TenantConfigDoc {
  _id: unknown;

  /** Luôn = "tenant". */
  scope: typeof GameConfigScope.Tenant;

  /** ID của tenant/đại lý. */
  tenantId: string;

  /**
   * Hoa hồng đại lý cho tenant này (tỷ lệ trên doanh thu).
   * Override rates.defaultCommissionRate trong global config.
   */
  commissionRate: number;

  /** Tenant có được phép chơi game này không. Default: true. */
  isEnabled: boolean;

  /**
   * Override giá trị giải thưởng riêng cho tenant (hiếm khi dùng).
   * null = dùng global defaultPrizes.
   */
  prizeOverrides: PrizeAmounts | null;

  /** Version config – tăng mỗi khi staff chỉnh sửa. */
  version: number;

  createdAt: Date;
  updatedAt: Date;
}
