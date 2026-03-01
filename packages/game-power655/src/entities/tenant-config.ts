/**
 * Power 6/55 – Tenant Config Entity
 *
 * Cấu hình riêng cho từng tenant (đại lý xổ số điện toán).
 * Override commission rate và on/off game per-tenant.
 *
 * Nếu tenant chưa có config → dùng default từ GlobalConfig.rates.defaultCommissionRate.
 * Staff backoffice tạo/update qua UpdateTenantConfig use case.
 *
 * Collection: power655GameConfigs (scope = "tenant", tenantId = "<id>").
 */

import type { GameConfigScope } from "@megawin/game-core/entities";

/**
 * MongoDB document cho tenant config.
 */
export interface TenantConfigDoc {
  _id: unknown;
  /** Scope luôn = "tenant" cho document này. */
  scope: typeof GameConfigScope.Tenant;
  /** ID tenant/đại lý. Unique cùng scope trong collection. */
  tenantId: string;
  /** Tên tenant (denormalized, hiển thị trên backoffice). */
  tenantName?: string;
  /** Hoa hồng đại lý (override global). VD: 0.2 = 20% doanh thu. */
  commissionRate: number;
  /** Game có bật cho tenant này không. False = tenant không thể bán vé Power 6/55. */
  isEnabled: boolean;
  /** Version tăng mỗi lần update (optimistic concurrency). */
  version: number;
  createdAt: Date;
  updatedAt: Date;
}

/** Application layer entity. */
export interface TenantConfigEntity extends Omit<TenantConfigDoc, "_id"> {
  id: string;
}
