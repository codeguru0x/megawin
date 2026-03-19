/**
 * Bingo 18 – Financial Report Entities
 *
 * Per-game report collections cho Bingo 18.
 * 4 collections với prefix `bingo18_`:
 *   bingo18_settle_draw_reports      — 1 doc/draw đã settle
 *   bingo18_settle_tenant_reports    — 1 doc/tenant/draw đã settle
 *   bingo18_void_draw_reports        — 1 doc/draw đã void
 *   bingo18_outstanding_draw_reports — 1 doc/draw active (TTL 15 phút)
 *
 * Nguyên tắc:
 *   - KHÔNG lưu drawNo, drawDate, drawTime — tra từ DrawDoc khi hiển thị.
 *   - KHÔNG dùng $inc — mọi write đều upsert overwrite.
 *   - Mỗi collection chỉ chứa 1 loại document duy nhất (không dùng reportType).
 *   - Bingo 18 KHÔNG CÓ Jackpot: KHÔNG có field jackpotContribution.
 *   - Bingo 18 KHÔNG CÓ lineCount: betCount = boards + sideBets (không expand).
 */

// ─────────────────────────────────────────────────────────────────────────────
// Collection Name Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Báo cáo settle theo draw cho Bingo 18.
 * Unique index: { drawId: 1 }
 * Query index:  { financialDate: 1 }
 */
export const BINGO18_SETTLE_DRAW_REPORTS = "bingo18_settle_draw_reports";

/**
 * Báo cáo settle theo tenant × draw cho Bingo 18.
 * Unique index: { drawId: 1, tenantId: 1 }
 * Query index:  { financialDate: 1, tenantId: 1 }
 */
export const BINGO18_SETTLE_TENANT_REPORTS = "bingo18_settle_tenant_reports";

/**
 * Báo cáo void theo draw cho Bingo 18.
 * Unique index: { drawId: 1 }
 * Query index:  { financialDate: 1 }
 */
export const BINGO18_VOID_DRAW_REPORTS = "bingo18_void_draw_reports";

/**
 * Snapshot outstanding draw cho Bingo 18. TTL auto-expire.
 * Unique index: { drawId: 1 }
 * TTL index:    { snapshotAt: 1 }, expireAfterSeconds: 300
 */
export const BINGO18_OUTSTANDING_DRAW_REPORTS = "bingo18_outstanding_draw_reports";

// ─────────────────────────────────────────────────────────────────────────────
// Settle Entities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Báo cáo tài chính kỳ quay đã settle. 1 doc = 1 draw.
 *
 * IDEMPOTENT: upsert by drawId, chạy lại overwrite toàn bộ.
 * Thông tin draw (drawNo, drawDate, drawTime) tra từ DrawDoc khi cần hiển thị.
 * Bingo 18 KHÔNG CÓ Jackpot: KHÔNG có field jackpotContribution.
 * Bingo 18 KHÔNG CÓ lineCount: không expand boards sang lines.
 * Unique index: { drawId: 1 }
 * Query index:  { financialDate: 1 }
 */
export interface SettleDrawReport {
  /** ID kỳ quay. Unique index. */
  drawId: string;
  /** Ngày tài chính (YYYY-MM-DD). Query index. */
  financialDate: string;

  /** Số entry đã settle. */
  entryCount: number;
  /** Số player (unique accountId). */
  playerCount: number;
  /** Số tenant tham gia. */
  tenantCount: number;

  /** Tổng tiền cược (VND). Công thức: SUM(entry.amount). */
  totalStake: number;
  /** Tổng tiền thắng (VND). Công thức: SUM(entry.payout.winAmount). */
  totalWin: number;
  /** Tổng tiền trả thưởng (VND). Công thức: SUM(entry.payout.payoutAmount). */
  totalPayout: number;

  /** Gross Gaming Revenue (VND). Công thức: totalStake - totalPayout. Có thể ÂM. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: SUM(entry.tenant.commissionAmount). */
  totalCommission: number;
  /** Lợi nhuận ròng (VND). Công thức: ggr - totalCommission. Có thể ÂM. Đây là bottom-line P&L. */
  netProfit: number;

  /**
   * Phần công ty thu về (VND).
   * Bingo 18: companyTake = DrawFinancial.companyTake (toàn bộ profit sau prizes + commission).
   */
  companyTake: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Báo cáo tài chính theo tenant cho 1 draw đã settle. 1 doc = 1 tenant × 1 draw.
 *
 * IDEMPOTENT: upsert by { drawId, tenantId }.
 * Bingo 18 KHÔNG CÓ lineCount.
 * Unique index: { drawId: 1, tenantId: 1 }
 * Query index:  { financialDate: 1, tenantId: 1 }
 */
export interface SettleTenantReport {
  /** ID kỳ quay. */
  drawId: string;
  /** ID đại lý. */
  tenantId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;

  /** Số entry của tenant trong draw. */
  entryCount: number;
  /** Số player của tenant (unique accountId). */
  playerCount: number;

  /** Tổng tiền cược (VND). */
  totalStake: number;
  /** Tổng tiền thắng (VND). */
  totalWin: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
  /** GGR = totalStake - totalPayout. Có thể ÂM. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: SUM(entry.tenant.commissionAmount). */
  totalCommission: number;
  /** Lợi nhuận ròng (VND). Công thức: ggr - totalCommission. Có thể ÂM. Đây là bottom-line P&L của tenant. */
  netProfit: number;

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Void Entities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot dữ liệu settle trước khi void, dùng cho audit trail.
 * Chỉ có khi wasPreviouslySettled = true trên VoidDrawReport.
 */
export interface VoidPreviousSettleSnapshot {
  /** Tổng tiền cược gốc (VND). */
  totalStake: number;
  /** Tổng tiền trả thưởng (VND). */
  totalPayout: number;
  /** GGR tại thời điểm settle (VND). */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). */
  totalCommission: number;
  /** Lợi nhuận ròng tại thời điểm settle (VND). */
  netProfit: number;
}

/**
 * Báo cáo kỳ quay đã void. 1 doc = 1 draw.
 *
 * Nếu draw đã settle trước khi void, snapshot settle data vào previousSettleSnapshot.
 * IDEMPOTENT: upsert by drawId.
 * Thông tin draw (drawNo, drawDate) tra từ DrawDoc khi cần hiển thị.
 * Unique index: { drawId: 1 }
 * Query index:  { financialDate: 1 }
 */
export interface VoidDrawReport {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;

  /** Số entry đã void. */
  entryCount: number;
  /** Số player (unique accountId). */
  playerCount: number;
  /** Số tenant tham gia. */
  tenantCount: number;

  /** Tổng tiền cược gốc trước khi hoàn (VND). Công thức: SUM(entry.amount). */
  totalOriginalStake: number;
  /** Tổng tiền hoàn trả (VND). Công thức: SUM(entry.voidInfo.refundAmount). */
  totalRefundAmount: number;

  /** True nếu draw đã settle trước khi bị void. */
  wasPreviouslySettled: boolean;

  /** Snapshot settle data trước khi xoá. Chỉ có khi wasPreviouslySettled = true. */
  previousSettleSnapshot?: VoidPreviousSettleSnapshot;

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Outstanding Entity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot số liệu entries chưa settle/void cho 1 draw active. TTL auto-expire.
 *
 * Scheduled job upsert mỗi 5 phút, refresh snapshotAt.
 * Khi draw settle/void, job ngừng refresh → doc tự expire sau 15 phút.
 * Thông tin draw (drawNo, drawDate, drawTime) tra từ DrawDoc khi cần hiển thị.
 * Bingo 18 KHÔNG CÓ lineCount.
 * Unique index: { drawId: 1 }
 * TTL index:    { snapshotAt: 1 }, expireAfterSeconds: 300
 */
export interface OutstandingDrawReport {
  /** ID kỳ quay. */
  drawId: string;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;

  /** Số entry đang pending (status: scheduled). */
  entryCount: number;
  /** Số player (unique accountId). */
  playerCount: number;
  /** Số tenant tham gia. */
  tenantCount: number;
  /** Tổng tiền cược pending (VND). Công thức: SUM(entry.amount). */
  totalStake: number;
  /** Ước tính hoa hồng (VND). Công thức: SUM(entry.tenant.commissionAmount). */
  estimatedCommission: number;

  /** TTL field. MongoDB tự xoá doc khi snapshotAt + 300s < now. */
  snapshotAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Types (MongoDB document + id field)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MongoDB document type cho bingo18_settle_draw_reports.
 * Thêm `id` (hex string từ _id ObjectId) theo yêu cầu của BaseEntity.
 */
export type SettleDrawReportEntity = SettleDrawReport & { id: string };

/**
 * MongoDB document type cho bingo18_settle_tenant_reports.
 * Thêm `id` (hex string từ _id ObjectId) theo yêu cầu của BaseEntity.
 */
export type SettleTenantReportEntity = SettleTenantReport & { id: string };

/**
 * MongoDB document type cho bingo18_void_draw_reports.
 * Thêm `id` (hex string từ _id ObjectId) theo yêu cầu của BaseEntity.
 */
export type VoidDrawReportEntity = VoidDrawReport & { id: string };

/**
 * MongoDB document type cho bingo18_outstanding_draw_reports.
 * Thêm `id` (hex string từ _id ObjectId) theo yêu cầu của BaseEntity.
 */
export type OutstandingDrawReportEntity = OutstandingDrawReport & { id: string };
