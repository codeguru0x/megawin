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
 * 1. version (unique) – global cursor cho tenant poll.
 * 2. tenantId + version – tenant poll cho riêng tenant mình.
 * 3. tenantId + gameProduct + version – poll theo game cụ thể.
 * 4. sourceEntryId + version – lookup history 1 entry.
 */
export const ENTRY_FEED_INDEXES: IndexDescription[] = [
  {
    key: { version: 1 },
    unique: true,
    name: "idx_version_unique",
  },
  {
    key: { tenantId: 1, version: 1 },
    name: "idx_tenant_version",
  },
  {
    key: { tenantId: 1, gameProduct: 1, version: 1 },
    name: "idx_tenant_game_version",
  },
  {
    key: { sourceEntryId: 1, version: -1 },
    name: "idx_source_entry_version",
  },
];
