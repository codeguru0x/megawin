/**
 * Mega 6/45 – Tenant Game Configuration
 *
 * Collection: mega645GameConfigs (scope = "tenant")
 */

import type { GameConfigScope } from "@megawin/game-core/entities";

/** Cấu hình game Mega 6/45 cấp đại lý (scope = "tenant"). */
export interface TenantConfigDoc {
  /** MongoDB document ID. */
  _id: unknown;
  /** Phạm vi cấu hình (luôn = "tenant"). */
  scope: typeof GameConfigScope.Tenant;
  /** ID đại lý (tenant) sở hữu cấu hình. */
  tenantId: string;
  /**
   * Tỷ lệ hoa hồng riêng cho đại lý.
   * Ghi đè rates.defaultCommissionRate trong global config.
   * Ví dụ: 0.2 = 20%.
   */
  commissionRate: number;
  /** Cho phép đại lý bán vé Mega 6/45 hay không. */
  isEnabled: boolean;
  /** Số phiên bản cấu hình (tăng mỗi khi admin cập nhật). */
  version: number;
  /** Thời điểm tạo. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. */
  updatedAt: Date;
}

/** Application-layer entity sau khi qua mapper. ObjectId → id string. */
export interface TenantConfigEntity extends Omit<TenantConfigDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}
