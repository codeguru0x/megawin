/**
 * Config types — dùng cho TenantConfigRepository.
 */

/**
 * Các fields có thể upsert vào TenantConfig.
 * Cả 2 fields đều optional — chỉ update field nào được truyền vào.
 */
export interface TenantConfigFields {
  /** Tỷ lệ hoa hồng đại lý (0-1). */
  commissionRate?: number;
  /** Bật/tắt đại lý. */
  isEnabled?: boolean;
}
