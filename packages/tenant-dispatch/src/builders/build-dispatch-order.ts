/**
 * Builders sinh `TenantDispatchOrderDoc` theo đúng `DispatchSourceKind`.
 *
 * Lý do tách builder: ẩn mapping `sourceKind → action + reason + force`
 * khỏi caller. Caller chỉ cần biết nghiệp vụ ("trả thưởng entry này") → builder tự
 * lo phần technical (action=credit, reason=payout, force=false...).
 *
 * Mọi builder đều:
 * - Sinh `tx` UUIDv7 nếu caller không cung cấp.
 * - Set `status = Pending`, `nextAttemptAt = now`.
 * - Caller có thể override `tx` khi re-use từ entity field (vd `entry.payoutTx` đã sinh sẵn lúc settle).
 */

import type { Currency as CurrencyType } from "@megawin/shared/types";
import { Currency, TransactionAction, TransactionReason } from "@megawin/shared/types";
import { generateId } from "@megawin/shared/utils";

import type { TenantDispatchOrderDoc, TenantDispatchOrderInput } from "../entities/dispatch-order";
import { DispatchOrderStatus, DispatchSourceKind } from "../entities/enums";

// ─────────────────────────────────────────────
// Common input
// ─────────────────────────────────────────────

interface CommonBuilderInput {
  /** Override tx — dùng khi entity đã sinh sẵn (payoutTx / refundTx). Nếu bỏ trống, builder tự sinh UUIDv7. */
  tx?: string;
  tenantId: string;
  accountId: string;
  username: string;
  amount: number;
  /** Mặc định `"VND"`. */
  currency?: CurrencyType;
  gameId: string;
  /** Kỳ quay liên quan. Payout/Refund: thường 1 round. Reversal: round sai đã settle cũ. Optional — bỏ qua khi giao dịch không gắn round. */
  roundIds?: string[];
  /** Hiển thị tenant-side. Optional — giai đoạn reversal auto adjustment có thể bỏ qua. */
  description?: string;
  /** OUTBOUND metadata gửi tenant. */
  metadata?: Record<string, unknown>;
  /** ID entity phát sinh (entryId / ticketId...). */
  sourceId: string;
  /** INTERNAL context — không gửi đi. */
  sourceContext?: Record<string, unknown>;
  batchKey: string;
}

// ─────────────────────────────────────────────
// Internal helper
// ─────────────────────────────────────────────

function baseFields(
  input: CommonBuilderInput,
): Pick<
  TenantDispatchOrderDoc,
  | "tx"
  | "tenantId"
  | "accountId"
  | "username"
  | "amount"
  | "currency"
  | "gameId"
  | "roundIds"
  | "description"
  | "metadata"
  | "sourceId"
  | "sourceContext"
  | "batchKey"
  | "status"
  | "nextAttemptAt"
  | "createdAt"
  | "updatedAt"
> {
  const now = new Date();
  return {
    tx: input.tx ?? generateId(),
    tenantId: input.tenantId,
    accountId: input.accountId,
    username: input.username,
    amount: input.amount,
    currency: input.currency ?? Currency.VND,
    gameId: input.gameId,
    roundIds: input.roundIds,
    description: input.description,
    metadata: input.metadata,
    sourceId: input.sourceId,
    sourceContext: input.sourceContext,
    batchKey: input.batchKey,
    status: DispatchOrderStatus.Pending,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

// ─────────────────────────────────────────────
// Public builders
// ─────────────────────────────────────────────

export type BuildPayoutOrderInput = CommonBuilderInput;

/**
 * Build 1 dispatch order cho trả thưởng entry (`credit` + `payout`).
 *
 * Caller: use-case `EnqueueDispatchPayoutsUseCase` của từng game.
 */
export function buildPayoutOrder(input: BuildPayoutOrderInput): TenantDispatchOrderInput {
  return {
    ...baseFields(input),
    action: TransactionAction.Credit,
    reason: TransactionReason.Payout,
    sourceKind: DispatchSourceKind.Payout,
  };
}

export type BuildRefundOrderInput = CommonBuilderInput;

/**
 * Build 1 dispatch order cho hoàn tiền entry khi void draw (`credit` + `refund`).
 *
 * Caller: use-case `EnqueueDispatchRefundsUseCase` của từng game.
 */
export function buildRefundOrder(input: BuildRefundOrderInput): TenantDispatchOrderInput {
  return {
    ...baseFields(input),
    action: TransactionAction.Credit,
    reason: TransactionReason.Refund,
    sourceKind: DispatchSourceKind.Refund,
  };
}

export type BuildReversalOrderInput = CommonBuilderInput;

/**
 * Build 1 dispatch order cho thu hồi payout sai (`debit` + `adjustment` + `force=true`).
 *
 * Dùng cho re-settle Giai đoạn 2. `force=true` cho phép tenant trừ tiền
 * ngay cả khi player đã rút (balance âm).
 *
 * Caller: use-case `EnqueueDispatchReversalsUseCase` (Giai đoạn 2).
 */
export function buildReversalOrder(input: BuildReversalOrderInput): TenantDispatchOrderInput {
  return {
    ...baseFields(input),
    action: TransactionAction.Debit,
    reason: TransactionReason.Adjustment,
    force: true,
    sourceKind: DispatchSourceKind.Reversal,
  };
}
