/**
 * Game Core – MongoDB Index Definitions
 *
 * Định nghĩa indexes cho các collections chung:
 * - entryChangeSeq: global singleton, unique index trên `key`.
 * - entryFeed: indexes cho tenant polling + query.
 */

import type { IndexDescription } from "mongodb";

// ─────────────────────────────────────────────
// entryChangeSeq indexes
// ─────────────────────────────────────────────

export const ENTRY_CHANGE_SEQ_INDEXES: IndexDescription[] = [
  {
    key: { key: 1 },
    unique: true,
    name: "idx_key_unique",
  },
];

// ─────────────────────────────────────────────
// entryFeed indexes
// ─────────────────────────────────────────────

/**
 * Chiến lược:
 * 1. sourceEntryId (unique) – mỗi entry gốc chỉ có 1 document mới nhất.
 *    Upsert key cho worker sync.
 * 2. version – cursor cho tenant poll (sorted scan, NOT unique vì batch events
 *    có thể share version).
 * 3. tenantId + version – tenant poll cho riêng tenant mình.
 * 4. tenantId + gameProduct + version – poll theo game cụ thể.
 */
export const ENTRY_FEED_INDEXES: IndexDescription[] = [
  {
    key: { sourceEntryId: 1 },
    unique: true,
    name: "idx_sourceEntryId_unique",
  },
  {
    key: { version: 1 },
    name: "idx_version",
  },
  {
    key: { tenantId: 1, version: 1 },
    name: "idx_tenant_version",
  },
  {
    key: { tenantId: 1, gameProduct: 1, version: 1 },
    name: "idx_tenant_game_version",
  },
];

// ─────────────────────────────────────────────
// feedSyncCursor indexes
// ─────────────────────────────────────────────

export const FEED_SYNC_CURSOR_INDEXES: IndexDescription[] = [
  {
    key: { gameProduct: 1 },
    unique: true,
    name: "idx_gameProduct_unique",
  },
];

// ─────────────────────────────────────────────
// gameDailyReports indexes
// ─────────────────────────────────────────────

/**
 * Chiến lược:
 * 1. game_draw: unique per tenant + game + draw
 * 2. game_daily: unique per tenant + game + date
 * 3. company_daily: unique per game + date
 * 4. financialDate: query báo cáo theo ngày/range
 * 5. gameProduct + financialDate: dashboard filter theo game
 */
export const GAME_DAILY_REPORT_INDEXES: IndexDescription[] = [
  {
    key: { reportType: 1, tenantId: 1, gameProduct: 1, drawId: 1 },
    unique: true,
    partialFilterExpression: { reportType: "game_draw" },
    name: "idx_game_draw_unique",
  },
  {
    key: { reportType: 1, tenantId: 1, gameProduct: 1, financialDate: 1 },
    unique: true,
    partialFilterExpression: { reportType: "game_daily" },
    name: "idx_game_daily_unique",
  },
  {
    key: { reportType: 1, gameProduct: 1, financialDate: 1 },
    unique: true,
    partialFilterExpression: { reportType: "company_daily" },
    name: "idx_company_daily_unique",
  },
  {
    key: { financialDate: 1, reportType: 1 },
    name: "idx_financial_date",
  },
  {
    key: { gameProduct: 1, financialDate: 1, reportType: 1 },
    name: "idx_game_financial_date",
  },
  {
    key: { tenantId: 1, financialDate: 1, reportType: 1 },
    name: "idx_tenant_financial_date",
  },
];
