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

// ─────────────────────────────────────────────
// txIntents indexes (WAL)
// ─────────────────────────────────────────────

/**
 * Chiến lược (Database: megawin-tenant):
 * 1. tx (unique) — idempotency key (UUIDv7). Ngăn duplicate WAL record
 *    nếu Lambda retry trùng. Cũng là lookup key chính trong happy path.
 * 2. phase + createdAt — recovery Lambda scan orphans:
 *    phase = DEBIT_PENDING AND createdAt < cutoff.
 * 3. tenantId + gameId + createdAt — reporting / audit per tenant per game.
 * 4. TTL trên resolvedAt (14 ngày) — auto-cleanup resolved intents.
 *    partialFilterExpression đảm bảo chỉ xoá documents đã resolved
 *    (resolvedAt !== null). Intents chưa resolved giữ vĩnh viễn cho recovery.
 */
export const TX_INTENT_INDEXES: IndexDescription[] = [
  {
    key: { tx: 1 },
    unique: true,
    name: "idx_tx_unique",
  },
  {
    key: { phase: 1, createdAt: 1 },
    name: "idx_phase_createdAt",
  },
  {
    key: { tenantId: 1, gameId: 1, createdAt: -1 },
    name: "idx_tenant_game_createdAt",
  },
  {
    key: { resolvedAt: 1 },
    name: "idx_resolvedAt_ttl",
    expireAfterSeconds: 14 * 24 * 60 * 60,
    partialFilterExpression: { resolvedAt: { $type: "date" } },
  },
];
