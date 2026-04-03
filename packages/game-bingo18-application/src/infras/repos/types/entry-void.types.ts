/**
 * Aggregate result types cho void drill-down queries.
 *
 * Dùng bởi EntryVoidRepository — tách riêng khỏi entry.types.ts
 * vì concern khác nhau (voided vs settled/outstanding).
 */

/**
 * Aggregate tenant cho 1 draw đã void. Kết quả drill cấp 2.
 *
 * Double-$group pattern: bước 1 dedup (accountId, tenantId),
 * bước 2 group by tenantId → playerCount chính xác.
 */
export interface VoidTenantBreakdownRow {
  tenantId: string;
  /** Số entries đã void của tenant này trong draw. */
  entryCount: number;
  /** Số players unique có entries void trong draw × tenant này. */
  playerCount: number;
  /** Tổng tiền cược gốc (VND). Công thức: SUM(entry.amount). */
  totalOriginalStake: number;
  /** Tổng tiền hoàn trả (VND). Công thức: SUM(entry.voidInfo.refundAmount). */
  totalRefundAmount: number;
}

/**
 * Aggregate player cho 1 draw × 1 tenant đã void. Kết quả drill cấp 3.
 *
 * Filter: { drawId, tenantId, status: "void" }, group by accountId.
 */
export interface VoidPlayerBreakdownRow {
  accountId: string;
  /** Tên đăng nhập player (snapshot lúc place-bet). */
  username: string;
  /** Số entries đã void. */
  entryCount: number;
  /** Tổng tiền cược gốc (VND). */
  totalOriginalStake: number;
  /** Tổng tiền hoàn trả (VND). */
  totalRefundAmount: number;
}
