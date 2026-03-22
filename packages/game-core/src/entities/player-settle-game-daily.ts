/**
 * Player Settle Game Daily — Thống kê cược đã settle/void của 1 player theo game + ngày.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * Collection: player_settle_game_daily (game-core database)
 * Unique key: { tenantId, accountId, gameProduct, financialDate }
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Ghi trong settle pipeline (Step 7 — PublishSettleDaily) và void pipeline.
 * IDEMPOTENT: re-aggregate toàn bộ entries cùng (financialDate, gameProduct)
 * cho player → overwrite ($set) — chạy lại bao nhiêu lần cũng đúng.
 *
 * GÓC NHÌN: Company nhìn về 1 player — "player này tạo ra bao nhiêu
 * doanh thu, chi phí, hoa hồng cho công ty trong ngày".
 * Naming nhất quán với SystemSettleGameDaily và SystemSettleTenantDaily.
 *
 * FINANCIAL METRICS chỉ tính entries đã SETTLED (status = "settled").
 * Entries void đếm vào voidCount nhưng KHÔNG tính vào totalStake/totalPayout
 * — consistent với SettleDrawReport bị XOÁ khi void.
 */

import type { GameProduct } from "./game-core.enums";

// ─────────────────────────────────────────────────────────────────────────────
// Collection Name Constant
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thống kê settle/void per-player × per-game × per-financialDate.
 *
 * Unique index: { accountId: 1, gameProduct: 1, financialDate: 1 }
 * Query index:  { accountId: 1, financialDate: -1 }
 * Tenant index: { tenantId: 1, financialDate: -1 }
 */
export const PLAYER_SETTLE_GAME_DAILY = "player_settle_game_daily";

// ─────────────────────────────────────────────────────────────────────────────
// Entity Interface
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Thống kê cược đã settle/void của 1 player × 1 game × 1 ngày tài chính.
 *
 * Re-aggregate từ per-game `ticket_entries` WHERE { financialDate, status ∈ [settled, void] }.
 * IDEMPOTENT: upsert by { accountId, gameProduct, financialDate },
 * overwrite toàn bộ — chạy lại cho cùng kết quả.
 *
 * Dùng cho trang Player Detail (backoffice): KPIs, chart, game breakdown.
 */
export interface PlayerSettleGameDaily {
  // ── Identity ──────────────────────────────────────────────────────────

  /** ID đại lý sở hữu player. Dùng cho query "all players of 1 tenant". */
  tenantId: string;
  /** ID tài khoản player (ULID). */
  accountId: string;
  /** Sản phẩm game (lotto535, keno, ...). */
  gameProduct: GameProduct;
  /** Ngày tài chính (YYYY-MM-DD). Tính từ 11h → 11h hôm sau (Asia/HCM). */
  financialDate: string;

  // ── Volume ────────────────────────────────────────────────────────────

  /** Số kỳ quay player tham gia trong ngày (unique drawIds, bao gồm settled + void). */
  drawCount: number;
  /** Tổng số entry (bao gồm cả settled + void). */
  entryCount: number;
  /** Số entry đã settle (status = "settled"). */
  settledCount: number;
  /** Số entry thắng (outcome = "win", chỉ đếm trong settled). */
  winCount: number;
  /** Số entry thua (outcome = "loss", chỉ đếm trong settled). */
  lossCount: number;
  /** Số entry bị huỷ (status = "void"). */
  voidCount: number;

  // ── Financial (VND) — CHỈ tính entries settled ────────────────────────

  /**
   * Tổng tiền cược (VND). Công thức: Σ(entry.amount) WHERE status = "settled".
   * KHÔNG bao gồm void entries — tiền đã hoàn không tính doanh thu.
   */
  totalStake: number;
  /**
   * Tổng tiền thắng gross (VND). Công thức: Σ(entry.payout.winAmount).
   * Null-safe: entries chưa có payout (edge case) → winAmount = 0.
   */
  totalWin: number;
  /**
   * Tổng tiền trả thực cho player (VND). Công thức: Σ(entry.payout.payoutAmount).
   * Null-safe: entries chưa có payout → payoutAmount = 0.
   */
  totalPayout: number;
  /**
   * Gross Gaming Revenue (VND). Công thức: totalStake - totalPayout.
   * Dương = company thu lời từ player này, Âm = company lỗ (player trúng giải lớn).
   */
  ggr: number;
  /**
   * Hoa hồng đại lý (VND). Công thức: Σ(entry.tenant.commissionAmount) WHERE status = "settled".
   * Commission trả cho tenant/đại lý dựa trên tiền cược của player này.
   * Naming "totalCommission" nhất quán với SystemSettleGameDaily, SystemSettleTenantDaily,
   * SettleDrawReport — trong hệ thống này commission LUÔN là của tenant, player không có commission.
   */
  totalCommission: number;
  /**
   * Lợi nhuận ròng (VND). Công thức: ggr - totalCommission.
   * Có thể ÂM khi player trúng giải lớn. Đây là bottom-line P&L cho player này.
   */
  netProfit: number;

  // ── Metadata ──────────────────────────────────────────────────────────

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Type (MongoDB document + id field)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MongoDB document type cho player_settle_game_daily.
 * Thêm `id` (hex string từ _id ObjectId) theo yêu cầu của BaseEntity.
 */
export type PlayerSettleGameDailyEntity = PlayerSettleGameDaily & { id: string };
