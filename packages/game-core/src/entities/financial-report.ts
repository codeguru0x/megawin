/**
 * Game Core – Financial Report Entities
 *
 * System-level report collections dùng chung cho tất cả game.
 * Re-aggregate từ per-game draw-level reports — KHÔNG dùng $inc.
 *
 * 3 system collections:
 *   system_settle_game_daily      — 1 doc/game/financialDate
 *   system_settle_tenant_daily    — 1 doc/tenant/game/financialDate (flatten)
 *   system_outstanding_game_daily — 1 doc/game (TTL 15 phút)
 *
 * LƯU Ý: Không có system_settle_daily riêng.
 * Daily total = aggregate system_settle_game_daily WHERE { financialDate }.
 */

import type { GameProduct } from "./game-core.enums";

// ─────────────────────────────────────────────────────────────────────────────
// Collection Name Constants
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tổng hợp settle của 1 game trong 1 ngày tài chính.
 * Unique index: { financialDate: 1, gameProduct: 1 }
 */
export const SYSTEM_SETTLE_GAME_DAILY = "system_settle_game_daily";

/**
 * Tổng hợp settle cross-game của 1 tenant cho 1 game trong 1 ngày tài chính.
 * Flatten design: 1 doc = 1 financialDate × 1 tenantId × 1 gameProduct.
 * Unique index: { financialDate: 1, tenantId: 1, gameProduct: 1 }
 */
export const SYSTEM_SETTLE_TENANT_DAILY = "system_settle_tenant_daily";

/**
 * Snapshot outstanding cross-draw cho 1 game. TTL auto-expire.
 * Unique index: { gameProduct: 1 }
 * TTL index:    { snapshotAt: 1 }, expireAfterSeconds: 300
 */
export const SYSTEM_OUTSTANDING_GAME_DAILY = "system_outstanding_game_daily";

// ─────────────────────────────────────────────────────────────────────────────
// System Settle Entities
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tổng hợp settle của 1 game trong 1 ngày tài chính. Re-aggregate từ settle_draw_reports.
 *
 * IDEMPOTENT: upsert by { financialDate, gameProduct }, chạy lại overwrite toàn bộ.
 * KHÔNG có system_settle_daily riêng. Daily total = aggregate collection này by financialDate.
 * Unique index: { financialDate: 1, gameProduct: 1 }
 */
export interface SystemSettleGameDaily {
  /** Game product identifier. */
  gameProduct: GameProduct;
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;

  /** Số kỳ quay đã settle trong ngày. */
  drawCount: number;
  /** Tổng số entry đã settle. */
  entryCount: number;
  /** Số player (unique accountId) trong ngày. */
  playerCount: number;
  /** Số tenant tham gia trong ngày. */
  tenantCount: number;

  /** Tổng tiền cược (VND). Công thức: SUM(draw.totalStake). */
  totalStake: number;
  /** Tổng tiền trả thưởng (VND). Công thức: SUM(draw.totalPayout). */
  totalPayout: number;
  /** Gross Gaming Revenue (VND). Công thức: totalStake - totalPayout. Có thể ÂM. */
  ggr: number;
  /** Tổng hoa hồng đại lý (VND). Công thức: SUM(draw.totalCommission). */
  totalCommission: number;
  /** Lợi nhuận ròng (VND). Công thức: ggr - totalCommission. Có thể ÂM. */
  netProfit: number;

  createdAt: Date;
  updatedAt: Date;
}

/**
 * Tổng hợp settle cross-game của 1 tenant cho 1 game trong 1 ngày tài chính.
 *
 * Flatten design: 1 doc = 1 financialDate × 1 tenantId × 1 gameProduct.
 * IDEMPOTENT: upsert by { financialDate, tenantId, gameProduct }.
 *
 * Tenant daily total = aggregate WHERE { financialDate, tenantId } → SUM all games.
 * All tenants for 1 date = aggregate WHERE { financialDate } group by tenantId.
 * Unique index: { financialDate: 1, tenantId: 1, gameProduct: 1 }
 */
export interface SystemSettleTenantDaily {
  /** Ngày tài chính (YYYY-MM-DD). */
  financialDate: string;
  /** ID đại lý. */
  tenantId: string;
  /** Game product identifier. */
  gameProduct: GameProduct;

  /** Tổng tiền cược của tenant (VND). */
  totalStake: number;
  /** Tổng tiền trả thưởng của tenant (VND). */
  totalPayout: number;
  /** GGR = totalStake - totalPayout. Có thể ÂM. */
  ggr: number;
  /** Hoa hồng đại lý (VND). */
  commission: number;
  /** Lợi nhuận ròng (VND). Công thức: ggr - commission. Có thể ÂM. */
  netProfit: number;
  /** Số entry của tenant trong ngày. */
  entryCount: number;
  /** Số player (unique accountId) của tenant trong ngày. */
  playerCount: number;
  /** Số kỳ quay tenant có entry trong ngày. */
  drawCount: number;

  createdAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// System Outstanding Entity
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Snapshot outstanding cross-draw cho 1 game. TTL auto-expire sau 15 phút.
 *
 * Scheduled job aggregate từ per-game outstanding_draw_reports và upsert mỗi 5 phút.
 * Unique index: { gameProduct: 1 }
 * TTL index:    { snapshotAt: 1 }, expireAfterSeconds: 300
 */
export interface SystemOutstandingGameDaily {
  /** Game product identifier. */
  gameProduct: GameProduct;

  /** Số draw đang active (chưa settle/void). */
  activeDrawCount: number;
  /** Tổng số entry pending. */
  totalEntryCount: number;
  /** Tổng số player (unique accountId) pending. */
  totalPlayerCount: number;
  /** Tổng số tenant tham gia pending. */
  totalTenantCount: number;
  /** Tổng tiền cược pending (VND). */
  totalOutstandingStake: number;
  /** Ước tính tổng hoa hồng pending (VND). */
  totalEstimatedCommission: number;

  /** TTL field. MongoDB tự xoá doc khi snapshotAt + 300s < now. */
  snapshotAt: Date;
  updatedAt: Date;
}

// ─────────────────────────────────────────────────────────────────────────────
// Entity Types (MongoDB document + id field)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * MongoDB document type cho system_settle_game_daily.
 * Thêm `id` (hex string từ _id ObjectId) theo yêu cầu của BaseEntity.
 */
export type SystemSettleGameDailyEntity = SystemSettleGameDaily & { id: string };

/**
 * MongoDB document type cho system_settle_tenant_daily.
 * Thêm `id` (hex string từ _id ObjectId) theo yêu cầu của BaseEntity.
 */
export type SystemSettleTenantDailyEntity = SystemSettleTenantDaily & { id: string };

/**
 * MongoDB document type cho system_outstanding_game_daily.
 * Thêm `id` (hex string từ _id ObjectId) theo yêu cầu của BaseEntity.
 */
export type SystemOutstandingGameDailyEntity = SystemOutstandingGameDaily & { id: string };
