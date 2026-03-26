/**
 * Aggregate result types cho outstanding drill-down queries — Max 3D.
 *
 * Dùng bởi EntryOutstandingRepository — tách riêng khỏi entry.types.ts
 * vì concern khác nhau (outstanding vs settled).
 */

/**
 * Aggregate tenant cho 1 draw outstanding. Kết quả drill cấp 2.
 *
 * Double-$group pattern: bước 1 dedup (accountId, tenantId),
 * bước 2 group by tenantId → playerCount chính xác không bị overcounting.
 * Max 3D có lineCount (1 cho straight, 3 cho combo3, 6 cho combo6).
 */
export interface OutstandingTenantBreakdownRow {
  tenantId: string;
  /** Số entries đang pending của tenant này trong draw. */
  entryCount: number;
  /** Số players unique đang có entries trong draw × tenant này. */
  playerCount: number;
  /** Tổng số lines pending. Max 3D: 1/3/6 tuỳ playType (straight/combo3/combo6). */
  lineCount: number;
  /** Tổng tiền cược pending (VND). Công thức: SUM(entry.amount). */
  totalStake: number;
  /** Ước tính hoa hồng pending (VND). Công thức: SUM(entry.tenant.commissionAmount). */
  estimatedCommission: number;
}

/**
 * Aggregate player cho 1 draw × 1 tenant outstanding. Kết quả drill cấp 3.
 *
 * Filter: { drawId, tenantId, status: "scheduled" }, group by accountId.
 * Max 3D có lineCount.
 */
export interface OutstandingPlayerBreakdownRow {
  accountId: string;
  /** Tên đăng nhập player (snapshot lúc place-bet). */
  username: string;
  /** Số entries đang pending. */
  entryCount: number;
  /** Tổng số lines pending. */
  lineCount: number;
  /** Tổng tiền cược pending (VND). */
  totalStake: number;
  /** Ước tính hoa hồng (VND). Công thức: SUM(entry.tenant.commissionAmount). */
  commissionAmount: number;
}
