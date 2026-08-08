/**
 * Tenant Dispatch Order — Outbox document.
 *
 * Collection: `tenant_dispatch_orders` trong DB `megawin-tenant`.
 *
 * 1 document = 1 giao dịch cần dispatch sang tenant API.
 * Sinh ra bởi game workers (Keno settle/void...) tại thời điểm hoàn tất use case,
 * xử lý bởi `apps/worker-tenant-dispatch` mỗi 1 phút.
 *
 * ## Idempotency
 *
 * Field `tx` (UUIDv7) là idempotency key — unique index. Retry luôn gửi cùng `tx`
 * → tenant trả cached result thay vì tạo giao dịch trùng.
 *
 * ## Ordering
 *
 * Outbox KHÔNG enforce thứ tự nghiệp vụ. Worker dispatch FIFO theo `nextAttemptAt ASC`.
 * Ordering giữa các bước (vd re-settle: reversal trước, payout mới sau) do lớp
 * orchestration phía trên đảm trách — enqueue reversal trước, sau khi tính xong
 * payout mới thì enqueue tiếp. Hai lần enqueue liên tiếp tự nhiên tạo ra
 * `nextAttemptAt` tăng dần → worker dispatch đúng thứ tự trong happy path.
 *
 * Trường hợp reversal fail retry trong khi payout mới tới hạn: tenant API đã
 * thiết kế idempotent (`tx`) + `force=true` cho reversal → eventually consistent
 * an toàn, không cần gating trong outbox.
 */

import type { Currency, TransactionAction, TransactionReason } from "@megawin/shared/types";

import type { DispatchOrderStatus, DispatchSourceKind } from "./enums";

// ─────────────────────────────────────────────
// Doc & Entity
// ─────────────────────────────────────────────

/** Raw MongoDB document — `_id` giữ nguyên ObjectId (type `unknown`). */
export interface TenantDispatchOrderDoc {
  /** MongoDB ObjectId. */
  _id: unknown;

  // ── Idempotency & tenant routing ────────────────────────────────
  /**
   * Idempotency key — UUIDv7 (RFC 9562). Unique index.
   * Gửi lên tenant qua `BatchTransactionItem.tx`. Retry luôn dùng cùng giá trị.
   */
  tx: string;
  /** Tenant đích. Worker group orders theo tenantId để gọi đúng endpoint. */
  tenantId: string;
  /** Account ID của player. */
  accountId: string;
  /** MegaWin username — dùng cho BO audit và compose description hiển thị. */
  username: string;

  // ── Transaction payload (gửi tenant) ────────────────────────────
  /** `TransactionAction` — reuse từ `@megawin/shared/types`. Builder đóng kín. */
  action: TransactionAction;
  /** `TransactionReason` — reuse từ shared. Builder đóng kín mapping từ `sourceKind`. */
  reason: TransactionReason;
  /** Số tiền (VND). */
  amount: number;
  /** Currency — hiện tại chỉ `"VND"`. */
  currency: Currency;
  /**
   * Force flag — chỉ dùng cho `reversal` (adjustment debit thu hồi payout sai).
   * Khi `true`, tenant cho phép balance âm.
   */
  force?: boolean;

  // ── Game context (gửi tenant) ───────────────────────────────────
  /** `"keno"`, `"lotto535"`, ... Khớp `BatchTransactionItem.gameId`. Required — cần cho BO filter + reverse lookup index `{ gameId, sourceKind, sourceId }`. */
  gameId: string;
  /**
   * Các kỳ quay liên quan. Tenant dùng để đối soát.
   *
   * Optional — match `BatchTransactionItem.roundIds?`. Bỏ qua nếu giao dịch không gắn
   * với round cụ thể (ví dụ jackpot cycle adjustment). Game có draw → luôn truyền
   * `[drawId]`. Không set `[]` mặc định vì MongoDB index / filter query hiệu quả hơn
   * khi field vắng hẳn.
   */
  roundIds?: string[];
  /**
   * Mô tả hiển thị tenant-side, ví dụ `"Trả thưởng Keno kỳ 2026-04-18.095"`.
   *
   * Optional — match `BatchTransactionItem.description?`. Builders payout/refund/reversal
   * đều compose sẵn nên trong thực tế hầu như luôn có; bỏ optional để đúng contract tenant API
   * và cho phép adjustment tự động không cần description.
   */
  description?: string;
  /**
   * OUTBOUND metadata — gửi thẳng vào `BatchTransactionItem.metadata`.
   * Stable public contract với tenant. Keno payout: `{ entryId, ticketNo }`.
   * KHÔNG chứa data nội bộ MegaWin.
   */
  metadata?: Record<string, unknown>;

  // ── Source tracking (INTERNAL MegaWin) ──────────────────────────
  /** Phân loại nội bộ. Xem {@link DispatchSourceKind}. */
  sourceKind: DispatchSourceKind;
  /**
   * ID của thực thể nghiệp vụ phát sinh giao dịch.
   * Ví dụ Keno entry payout: entryId hex. Mega645 jackpot: jackpotCycleId.
   * Cặp `(gameId, sourceKind, sourceId)` dùng để reverse lookup audit.
   */
  sourceId: string;
  /**
   * INTERNAL context — KHÔNG gửi đi đâu. Tuỳ game tự do định nghĩa.
   * Keno: `{ drawId }`. Re-settle Giai đoạn 2: `{ resettleVersion, parentTx }`.
   */
  sourceContext?: Record<string, unknown>;

  // ── Batch grouping ──────────────────────────────────────────────
  /**
   * Group orders cùng nguồn cho monitoring + retry theo batch.
   * Format: `"<gameId>:<operation>:<entityRef>:<purpose>"`.
   * Ví dụ: `"keno:settle:2026-04-18.095:payout"`.
   *
   * KHÔNG enforce thứ tự dispatch giữa các order cùng batchKey — worker luôn
   * FIFO theo `nextAttemptAt`. BatchKey chỉ dùng cho BO view + retry bulk.
   */
  batchKey: string;

  // ── Worker state ────────────────────────────────────────────────
  /** Trạng thái hiện tại. Insert lần đầu = `Pending`. */
  status: DispatchOrderStatus;
  /**
   * Thời điểm sớm nhất worker được phép dispatch lại.
   * Insert ban đầu = `now`. Sau lỗi = `now + backoff(retryCount) + jitter`.
   */
  nextAttemptAt: Date;

  /**
   * Số lần đã retry dispatch.
   *
   * - **Missing** (field vắng): order fresh — chưa từng thử dispatch (hoặc chưa fail lần nào).
   *   Main lane query `retryCount: { $exists: false }`.
   * - `>= 1`: đã fail ít nhất 1 lần. Retry lane query `retryCount: { $exists: true }`.
   *
   * Cặp filter `$exists: false` / `$exists: true` là mutually exclusive + complete
   * → main và retry worker không bao giờ xử lý cùng 1 order.
   */
  retryCount?: number;
  /**
   * Lỗi gần nhất — normalized string để BO đọc + log tools search.
   *
   * Format:
   * - Tenant `success: false` (per-item hoặc outer): `[CODE] message`, vd
   *   `[INTERNAL_ERROR] Database timeout`. Outer prefix thêm `"Outer fail: "`.
   * - HTTP/network/timeout: raw `err.message`.
   */
  lastError?: string;
  /** Thời điểm attempt gần nhất (thành công hoặc thất bại). */
  lastAttemptAt?: Date;
  /** Thời điểm dispatch thành công — chỉ có khi `status = Dispatched`. */
  dispatchedAt?: Date;

  // ── Audit ───────────────────────────────────────────────────────
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Application-layer entity sau khi qua mapper.
 * ObjectId → `id` hex string để dùng an toàn trong business logic.
 */
export interface TenantDispatchOrderEntity extends Omit<TenantDispatchOrderDoc, "_id"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
}

/**
 * Input shape cho builders (`buildPayoutOrder` / `buildRefundOrder` / `buildReversalOrder`)
 * và outbox insert (`DispatchOrderRepository.bulkEnqueue`, `EnqueueDispatchOrdersUseCase`).
 *
 * Là `TenantDispatchOrderDoc` chưa có `_id` — Mongo sinh `_id` lúc insert.
 */
export type TenantDispatchOrderInput = Omit<TenantDispatchOrderDoc, "_id">;
