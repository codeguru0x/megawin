/**
 * Types cho DispatchOrderRepository — các shape query/aggregate.
 *
 * Entity types (`TenantDispatchOrderDoc`, `TenantDispatchOrderEntity`) đã ở entities layer.
 * File này chỉ chứa aggregate/query result types riêng cho repo.
 */

import type { TransactionAction, TransactionReason, Currency } from "@megawin/shared/types";
import type { DispatchOrderStatus, DispatchSourceKind } from "../../../entities/enums";

// ─────────────────────────────────────────────
// Pending batch — worker polling
// ─────────────────────────────────────────────

/**
 * Order ở trạng thái sẵn sàng dispatch — subset fields worker cần.
 *
 * Worker query `getPendingBatch` trả về shape này. Bỏ các field không cần thiết
 * cho dispatch loop (createdAt, updatedAt, ...).
 */
export interface PendingDispatchOrder {
  id: string;
  tx: string;
  tenantId: string;
  accountId: string;
  username: string;
  action: TransactionAction;
  reason: TransactionReason;
  amount: number;
  currency: Currency;
  force?: boolean;
  gameId: string;
  roundIds?: string[];
  description?: string;
  metadata?: Record<string, unknown>;
  sourceKind: DispatchSourceKind;
  sourceId: string;
  batchKey: string;
  retryCount?: number;
}

// ─────────────────────────────────────────────
// Batch progress — BO monitoring
// ─────────────────────────────────────────────

/**
 * Tổng hợp tiến độ của 1 `batchKey`. Dùng cho BO view "Batch progress".
 *
 * Aggregate `$group by status` + compute min/max timestamps.
 *
 * KHÔNG có field `failed` — với retry vô hạn, orders failed vẫn `Pending`.
 * BO dùng `listStuck` để thấy orders đang retry nhiều.
 */
export interface BatchProgress {
  batchKey: string;
  total: number;
  pending: number;
  dispatched: number;
  cancelled: number;
  /** Thời điểm order đầu tiên trong batch được tạo. */
  firstCreatedAt?: Date;
  /** Thời điểm dispatch gần nhất (order mới nhất hoàn tất). */
  lastDispatchedAt?: Date;
  /** Tổng amount của các orders đã dispatched. */
  dispatchedAmount: number;
}

// ─────────────────────────────────────────────
// List by source — BO reverse lookup
// ─────────────────────────────────────────────

/** Filter cho `listBySource`. */
export interface ListBySourceFilter {
  gameId: string;
  sourceKind: DispatchSourceKind;
  sourceId: string;
  status?: DispatchOrderStatus;
  limit?: number;
  skip?: number;
}

// ─────────────────────────────────────────────
// Stuck orders — BO monitoring
// ─────────────────────────────────────────────

/**
 * Filter cho `listStuck`. Staff dùng để monitor orders đang retry nhiều lần.
 *
 * Filter base: `status = Pending AND retryCount >= minRetryCount`.
 */
export interface ListStuckFilter {
  /** Ngưỡng tối thiểu `retryCount`. Mặc định `RETRY_ALERT_THRESHOLD`. */
  minRetryCount?: number;
  /** Filter theo tenant cụ thể (optional). */
  tenantId?: string;
  limit?: number;
  skip?: number;
}
