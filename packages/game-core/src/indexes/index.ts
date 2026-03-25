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
 * 1. entryId (unique) – mỗi entry gốc chỉ có 1 document mới nhất.
 *    Upsert key cho worker sync.
 * 2. version – cursor cho tenant poll (sorted scan, NOT unique vì batch events
 *    có thể share version).
 * 3. tenantId + version – tenant poll cho riêng tenant mình.
 * 4. tenantId + gameProduct + version – poll theo game cụ thể.
 */
export const ENTRY_FEED_INDEXES: IndexDescription[] = [
  {
    key: { entryId: 1 },
    unique: true,
    name: "idx_entryId_unique",
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
// playerSettleGameDaily indexes
// ─────────────────────────────────────────────

/**
 * Chiến lược:
 * 1. Upsert key (unique) — idempotent write, 1 doc duy nhất per player × game × date.
 *    Settle/void pipeline dùng filter này để overwrite ($set).
 * 2. accountId + financialDate — Player detail page: lấy tất cả game stats
 *    của 1 player trong date range. Sort descending để hiển thị ngày gần nhất trước.
 * 3. tenantId + financialDate — Admin xem tất cả players của 1 tenant trong date range.
 *    Dùng cho trang quản lý players theo đại lý.
 */
export const PLAYER_SETTLE_GAME_DAILY_INDEXES: IndexDescription[] = [
  {
    key: {
      accountId: 1,
      gameProduct: 1,
      financialDate: 1,
    },
    unique: true,
    name: "idx_account_game_date_unique",
  },
  {
    key: {
      accountId: 1,
      financialDate: -1,
    },
    name: "idx_account_date",
  },
  {
    key: {
      tenantId: 1,
      financialDate: -1,
    },
    name: "idx_tenant_date",
  },
];

// ─────────────────────────────────────────────
// ticketCounters indexes
// ─────────────────────────────────────────────

export const TICKET_COUNTER_INDEXES: IndexDescription[] = [
  {
    key: { accountId: 1, date: 1 },
    unique: true,
    name: "idx_account_date_unique",
  },
];
