/**
 * Game Core – Transaction Intent (WAL)
 *
 * Collection: tx_intents
 *
 * Write-Ahead Log cho place-bet debit flow. Document ghi TRƯỚC khi gọi
 * tenant debit API, đảm bảo recovery nếu Lambda crash giữa chừng.
 *
 * FLOW (hot path — place-bet):
 *   1. Generate tx (UUIDv7)
 *   2. Insert tx_intents (DEBIT_PENDING)
 *   3. Gọi tenant debit(tx)
 *      - 4xx → xoá WAL → throw (inline, scheduler không cần xử lý)
 *      - 5xx/timeout → giữ WAL → throw (scheduler xử lý)
 *      - success/duplicate → tiếp bước 4
 *   4. saveAtomically(ticket { tx }, entries)
 *   5. markCompleted(tx)
 *
 * CRASH RECOVERY (scheduler — mỗi 2 phút):
 *   Scan orphan DEBIT_PENDING quá 30s:
 *
 *   Step 1 — Confirm debit (READ-ONLY, không side effect):
 *     GET /transaction/{tx}/status
 *     - "not_found" / "failed" → debit CHƯA xảy ra → xoá WAL, done
 *     - "success" → debit ĐÃ xảy ra → Step 2
 *     - timeout/5xx → indeterminate → retry lần sau
 *
 *   Step 2 — Check ticket exists (game-specific service):
 *     ticketCheckers[gameId](tx)
 *     - exists → crash sau save, trước markCompleted → markCompleted
 *     - !exists → crash sau debit, trước save → rollback credit
 *
 *   recoveryAttempts >= 20 → MANUAL_REVIEW + alert operator.
 *
 * TTL: 14 ngày từ resolvedAt (partial filter: resolvedAt != null).
 * Documents chưa resolved (null) không bị xoá — recovery tiếp tục xử lý.
 *
 * DESIGN:
 *   Transaction identity fields mirror 1:1 từ TransactionRequest
 *   (@megawin/tenant-gateway). Khi gọi tenant debit, build request
 *   trực tiếp từ document fields — không cần transform.
 */

import type { Currency, TransactionAction, TransactionReason } from "@megawin/shared/types";

// ─────────────────────────────────────────────
// Phase State Machine
// ─────────────────────────────────────────────

/**
 * Phase lifecycle của 1 transaction intent.
 *
 * ```
 * DEBIT_PENDING ──→ COMPLETED      (hot path: debit OK → save ticket → markCompleted)
 *       │
 *       ├──→ (delete)              (inline: debit fail 4xx → xoá WAL)
 *       │
 *       ├──→ ROLLED_BACK           (scheduler: confirm debit → rollback credit)
 *       │
 *       └──→ MANUAL_REVIEW         (scheduler: exhausted retries ≥ 20)
 * ```
 *
 * | Key            | Value              | Ý nghĩa                                                  |
 * |----------------|--------------------|-----------------------------------------------------------|
 * | `DebitPending` | `"DEBIT_PENDING"`  | WAL inserted, chưa/đang gọi tenant debit                 |
 * | `Completed`    | `"COMPLETED"`      | Happy path — ticket + entries saved, flow hoàn tất        |
 * | `RolledBack`   | `"ROLLED_BACK"`    | Rollback credit gửi tenant thành công                     |
 * | `ManualReview` | `"MANUAL_REVIEW"`  | Recovery fail nhiều lần, cần operator kiểm tra            |
 */
export const TxIntentPhase = {
  /** WAL inserted, chưa/đang gọi tenant debit. */
  DebitPending: "DEBIT_PENDING",
  /** Happy path — ticket + entries saved, flow hoàn tất. */
  Completed: "COMPLETED",
  /** Rollback credit gửi tenant thành công. */
  RolledBack: "ROLLED_BACK",
  /** Recovery fail nhiều lần, cần operator kiểm tra. */
  ManualReview: "MANUAL_REVIEW",
} as const;

export type TxIntentPhase = (typeof TxIntentPhase)[keyof typeof TxIntentPhase];

// ─────────────────────────────────────────────
// MongoDB Document
// ─────────────────────────────────────────────

/**
 * Document lưu trong MongoDB collection `tx_intents`.
 *
 * Transaction identity fields (tx, action, reason, playerId, amount, currency,
 * gameId, roundIds, description, metadata) mirror 1:1 từ TransactionRequest.
 * Khi gọi tenant debit API, build request trực tiếp từ các fields này.
 *
 * @see TransactionRequest — `@megawin/tenant-gateway`
 */
export interface TxIntentDoc {
  /** MongoDB ObjectId — auto-generated. */
  _id: unknown;

  /** Phase trong state machine. @see TxIntentPhase */
  phase: TxIntentPhase;

  // ── Transaction identity (mirror từ TransactionRequest) ──

  /**
   * Idempotency key — UUIDv7 (RFC 9562).
   *
   * Sinh trước khi insert WAL, dùng làm `tx` khi gọi tenant debit API.
   * Tenant dùng field này detect duplicate transaction (retry-safe).
   * Unique index trên collection ngăn duplicate WAL record.
   *
   * @example "019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b"
   */
  tx: string;

  /**
   * Hành động trên ví player.
   * WAL place-bet luôn là `TransactionAction.Debit`. Giữ typed cho mở rộng sau.
   */
  action: TransactionAction;

  /**
   * Lý do giao dịch — audit trail.
   * WAL place-bet luôn là `TransactionReason.Bet`. Giữ typed cho mở rộng sau.
   */
  reason: TransactionReason;

  // ── Context (mirror từ TransactionRequest) ──

  /**
   * Megawin username của player.
   * @example "john_doe@acme"
   */
  username: string;

  /**
   * Số tiền giao dịch (VND). Luôn > 0.
   * = tổng tiền cược toàn bộ draws. Direction xác định bởi `action`.
   */
  amount: number;

  /** Mã tiền tệ ISO 4217. Hiện tại luôn là `Currency.VND`. */
  currency: Currency;

  /**
   * Mã sản phẩm game.
   * @example "keno", "mega645", "lotto535"
   */
  gameId: string;

  /**
   * Danh sách kỳ quay mà bet này tham gia.
   * 1 bet có thể cover nhiều draws (multi-draw).
   * Tenant index field này cho reporting + reconciliation theo kỳ quay.
   *
   * @example ["2026-04-10.095", "2026-04-10.096", "2026-04-10.097"]
   */
  roundIds: string[];

  /**
   * Mô tả giao dịch dạng text — hiển thị cho player trên lịch sử giao dịch.
   * @example "Đặt cược Keno 3 kỳ 2026-04-10.095→097"
   */
  description?: string;

  /**
   * Dữ liệu mở rộng game-specific.
   * Map trực tiếp sang `metadata` trong TransactionRequest.
   *
   * Các key phổ biến:
   * - `ticketNo` — mã vé hiển thị. VD: `"KENO-20260410-00001"`.
   * - `entryId` — MegaWin entry ID cho đối soát.
   * - `refTx` — tx gốc liên quan (chỉ khi rollback/refund, informational).
   */
  metadata?: Record<string, unknown>;

  // ── Ownership (internal, không gửi tenant) ──

  /** ID tenant/đại lý sở hữu bet. Dùng cho query, report, lookup gateway config. */
  tenantId: string;

  /**
   * ID tài khoản player trong hệ thống MegaWin.
   * Khác với playerId (= tenant username). Dùng cho internal lookup.
   */
  accountId: string;

  // ── Recovery tracking ──

  /** Số lần recovery job đã thử xử lý intent này. Reset = 0 khi insert. */
  recoveryAttempts: number;

  /** Thời điểm recovery gần nhất (UTC). null = chưa từng recovery. */
  lastRecoveryAt: Date | null;

  /** Error message từ lần recovery gần nhất. null = chưa có lỗi. */
  recoveryError: string | null;

  // ── Timestamps ──

  /** Thời điểm tạo document (UTC). */
  createdAt: Date;

  /** Thời điểm cập nhật gần nhất (UTC). */
  updatedAt: Date;

  /**
   * Thời điểm intent được resolved (COMPLETED / ROLLED_BACK / MANUAL_REVIEW).
   * TTL index đếm expiry từ field này. null = chưa resolved → không bị TTL xoá.
   */
  resolvedAt: Date | null;
}

// ─────────────────────────────────────────────
// Application Entity
// ─────────────────────────────────────────────

/**
 * Application-layer entity cho tx_intents document.
 *
 * Map từ TxIntentDoc: `_id` (ObjectId) → `id` (hex string).
 * Dùng trong use case, handler, service.
 */
export interface TxIntentEntity extends Omit<TxIntentDoc, "_id"> {
  /** ObjectId hex string, map từ _id. */
  id: string;
}
