import type { TenantDispatchOrderEntity } from "@megawin/tenant-dispatch/entities";

/**
 * Row hiển thị trong bảng — alias cho entity, giữ chỗ để mở rộng sau
 * (VD: thêm computed field "retry bucket" ở FE nếu cần).
 */
export type DispatchOrderRow = TenantDispatchOrderEntity;
