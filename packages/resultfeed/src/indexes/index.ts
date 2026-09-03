/**
 * ResultFeed – Recommended MongoDB Indexes
 *
 * Danh sách indexes khuyến nghị cho tất cả collections ResultFeed (DB `megawin-resultfeed`).
 * Dùng bởi migration script / Atlas Index Management để tạo indexes.
 *
 * Cách dùng:
 * ```ts
 * import { RESULTFEED_INDEXES } from "@megawin/resultfeed/indexes";
 * for (const idx of RESULTFEED_INDEXES) {
 *   await db.collection(idx.collection).createIndex(idx.key, idx.options);
 * }
 * ```
 *
 * LƯU Ý: Chạy trong môi trường maintenance hoặc background — tránh block production.
 */

import { ResultFeedCollections } from "../entities/enums";

/** Mô tả 1 index MongoDB cần tạo cho ResultFeed collections. */
export interface IndexSpec {
  /** Tên collection (từ `ResultFeedCollections`). */
  collection: string;
  /** Khai báo index key: field → 1 (ascending) hoặc -1 (descending). */
  key: Record<string, 1 | -1>;
  /** Tùy chọn MongoDB createIndex. */
  options?: {
    /** True nếu index phải unique. */
    unique?: boolean;
    /** Tên index — dùng để identify khi drop/update. */
    name?: string;
    /** True nếu chỉ index các document có field đó (tiết kiệm storage cho optional fields). */
    sparse?: boolean;
    /**
     * TTL (giây) — Mongo tự xoá document sau khi field trong `key` (PHẢI là 1 field
     * Date, ascending, đứng riêng — không gộp compound) quá hạn.
     */
    expireAfterSeconds?: number;
    /** Chỉ index document khớp điều kiện — dùng cho TTL có điều kiện (§6 data-model plan). */
    partialFilterExpression?: Record<string, unknown>;
  };
  /** Mô tả mục đích index này phục vụ query nào. Dùng để review và audit. */
  purpose: string;
}

/**
 * Tất cả indexes khuyến nghị cho ResultFeed.
 *
 * Bao gồm 6 collections: sources, submissions, observations, consensus, source_cursors, alerts.
 */
export const RESULTFEED_INDEXES: readonly IndexSpec[] = [
  // ─────────────────────────────────────────
  // sources
  // ─────────────────────────────────────────
  {
    collection: ResultFeedCollections.Sources,
    key: { sourceId: 1 },
    options: { unique: true, name: "idx_sourceId_unique" },
    purpose: "Khoá tra cứu nguồn theo sourceId",
  },

  // ─────────────────────────────────────────
  // submissions
  // ─────────────────────────────────────────
  {
    collection: ResultFeedCollections.Submissions,
    key: { sourceId: 1, contentHash: 1 },
    options: { unique: true, name: "idx_sourceId_contentHash_unique" },
    purpose: "Dedupe: cùng nguồn + cùng bytes = không lưu 2 lần",
  },
  {
    collection: ResultFeedCollections.Submissions,
    key: { state: 1, fetchedAt: 1 },
    options: { name: "idx_state_fetchedAt" },
    purpose: "Hàng đợi parse lại khi state = parse_failed",
  },
  {
    collection: ResultFeedCollections.Submissions,
    key: { fetchedAt: 1 },
    options: {
      name: "idx_fetchedAt_ttl",
      expireAfterSeconds: 30 * 24 * 60 * 60,
      partialFilterExpression: { state: { $in: ["parsed", "unavailable"] } },
    },
    purpose:
      "Retention 30 ngày cho bản đã xử lý xong (parsed) VÀ cho probe 'kỳ chưa có kết quả' " +
      "(unavailable — bình thường, xảy ra liên tục ở live edge, không phải bằng chứng lỗi). " +
      "parse_failed/fetch_failed KHÔNG bị xoá tự động (đó là bằng chứng để sửa parser). " +
      "TTL single-field ascending riêng, không gộp compound.",
  },
  {
    collection: ResultFeedCollections.Submissions,
    key: { gameKey: 1, fetchedAt: -1 },
    options: { name: "idx_gameKey_fetchedAt_desc" },
    purpose: "Trang vận hành xem log submission theo game",
  },

  // ─────────────────────────────────────────
  // observations
  // ─────────────────────────────────────────
  {
    collection: ResultFeedCollections.Observations,
    key: { sourceId: 1, gameKey: 1, drawPeriod: 1, parserVersion: 1 },
    options: {
      unique: true,
      name: "idx_source_game_period_parserVersion_unique",
    },
    purpose:
      "Idempotent: parse lại cùng version = no-op (upsert filter khớp); version mới = bản ghi " +
      "mới để so sánh trước/sau khi bump parser.",
  },
  {
    collection: ResultFeedCollections.Observations,
    key: { gameKey: 1, drawPeriod: 1 },
    options: { name: "idx_gameKey_drawPeriod" },
    purpose: "Query nóng của consensus: 'kỳ này các nguồn nói gì'",
  },
  {
    collection: ResultFeedCollections.Observations,
    key: { gameKey: 1, createdAt: -1 },
    options: { name: "idx_gameKey_createdAt_desc" },
    purpose: "Trang vận hành xem observation gần đây theo game",
  },
  {
    collection: ResultFeedCollections.Observations,
    key: { updatedAt: 1 },
    options: { name: "idx_updatedAt" },
    purpose: "Cursor cho ConsensusTickUseCase.findChangedSince — quét observation mới đổi",
  },

  // ─────────────────────────────────────────
  // consensus
  // ─────────────────────────────────────────
  {
    collection: ResultFeedCollections.Consensus,
    key: { gameKey: 1, drawPeriod: 1 },
    options: { unique: true, name: "idx_gameKey_drawPeriod_unique" },
    purpose: "1 kỳ đúng 1 doc consensus",
  },
  {
    collection: ResultFeedCollections.Consensus,
    key: { state: 1, gameKey: 1, drawPeriod: -1 },
    options: { name: "idx_state_gameKey_drawPeriod_desc" },
    purpose: "Hàng đợi conflict cho người duyệt",
  },
  {
    collection: ResultFeedCollections.Consensus,
    key: { publishedAt: -1 },
    options: {
      name: "idx_publishedAt_desc_partial",
      partialFilterExpression: { publishedAt: { $type: "date" } },
    },
    purpose: "Core PULL + API public chỉ đọc bản đã publish",
  },

  // ─────────────────────────────────────────
  // source_cursors
  // ─────────────────────────────────────────
  {
    collection: ResultFeedCollections.SourceCursors,
    key: { sourceId: 1, gameKey: 1 },
    options: { unique: true, name: "idx_sourceId_gameKey_unique" },
    purpose: "1 cursor / nguồn / game",
  },
  {
    collection: ResultFeedCollections.SourceCursors,
    key: { nextFetchAt: 1 },
    options: { name: "idx_nextFetchAt" },
    purpose: "Worker lấy việc đến hạn (findDue: nextFetchAt <= now)",
  },

  // ─────────────────────────────────────────
  // alerts
  // ─────────────────────────────────────────
  {
    collection: ResultFeedCollections.Alerts,
    key: { status: 1, createdAt: -1 },
    options: { name: "idx_status_createdAt_desc" },
    purpose: "Hàng đợi alert theo status + badge snapshot",
  },
  {
    collection: ResultFeedCollections.Alerts,
    key: { createdAt: 1 },
    options: {
      name: "idx_createdAt_ttl",
      expireAfterSeconds: 90 * 24 * 60 * 60,
    },
    purpose: "Retention 90 ngày — TTL single-field ascending riêng",
  },
];
