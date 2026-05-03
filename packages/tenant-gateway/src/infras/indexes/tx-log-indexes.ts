/**
 * Indexes cho collection `tx_logs` (DB `megawin-tenant`).
 *
 * Apply qua migration script (createIndex / createIndexes) — KHÔNG ghi ngầm
 * ở runtime.
 */

import type { IndexDescription } from "mongodb";

/**
 * Indexes cần thiết cho query workload:
 *
 * - `tx_unique` — lookup exact theo `tx` + đóng vai trò unique key cho upsert
 *   (retry cùng `tx` overwrite doc cũ, không sinh trùng).
 * - `batchId` — list tất cả items thuộc cùng 1 batch.
 * - `createdAt_ttl` — default sort list-all (sort desc) + TTL anchor.
 *   TTL `expireAfterSeconds = 90 * 86_400` = 90 ngày kể từ `createdAt` (=
 *   thời điểm attempt cuối cùng sau retry).
 * - `tenantId_createdAt` — filter theo tenant + sort newest-first.
 * - `status_createdAt` — chỉ xem failed + sort newest-first.
 */
export const TX_LOG_INDEXES: ReadonlyArray<IndexDescription> = [
  { key: { tx: 1 }, name: "tx_unique", unique: true },
  { key: { batchId: 1 }, name: "batchId" },
  {
    key: { createdAt: -1 },
    name: "createdAt_ttl",
    expireAfterSeconds: 90 * 86_400,
  },
  { key: { tenantId: 1, createdAt: -1 }, name: "tenantId_createdAt" },
  { key: { status: 1, createdAt: -1 }, name: "status_createdAt" },
];
