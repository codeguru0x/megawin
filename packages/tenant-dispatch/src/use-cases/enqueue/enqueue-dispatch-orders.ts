import { InternalUseCase } from "@megawin/app-core/use-cases";
import { DispatchOrderRepository } from "../../infras/repos/dispatch-order-repo";
import type { TenantDispatchOrderInput } from "../../entities/dispatch-order";

export interface EnqueueDispatchOrdersInput {
  /** Orders đã được build bởi các builder (buildPayoutOrder / buildRefundOrder / buildReversalOrder). */
  orders: TenantDispatchOrderInput[];
}

/**
 * Check 1 string field trong order — phải là non-empty sau trim.
 * Push reason vào accumulator khi invalid, không throw để gom toàn bộ lỗi cùng lúc.
 */
function requireNonEmpty(
  order: TenantDispatchOrderInput,
  field: keyof TenantDispatchOrderInput,
  reasons: string[],
): void {
  const value = order[field];
  if (typeof value !== "string" || value.trim().length === 0) {
    reasons.push(`${String(field)} phải là non-empty string`);
  }
}

/**
 * Validate 1 order trước khi enqueue. Trả về danh sách reason nếu không hợp lệ.
 *
 * Chỉ check field bắt buộc để worker dispatch an toàn xuống tenant API —
 * không động đến business semantics (`action` / `reason` / `sourceKind` do builder đóng kín).
 *
 * ## Required fields
 *
 * - `tx` — idempotency key (unique index). Thiếu → outbox không dedup được retry.
 * - `tenantId` — worker group batch theo tenantId để gọi đúng endpoint.
 * - `accountId` — audit MegaWin + BO reverse lookup.
 * - `username` — worker map sang `BatchTransactionItem.playerId` gửi tenant.
 * - `gameId` — tenant API yêu cầu + index `{ gameId, sourceKind, sourceId }`.
 * - `currency` — tenant API yêu cầu (`BatchTransactionItem.currency`).
 * - `sourceId` — cặp `(gameId, sourceKind, sourceId)` làm reverse lookup audit.
 * - `amount` — finite number > 0. Refund / payout / reversal đều phải có giá trị thật.
 *
 * ## Optional (KHÔNG check)
 *
 * - `batchKey` — nhiều flow enqueue order lẻ ngoài batch (adjustment, manual fix).
 * - `roundIds`, `description`, `metadata`, `sourceContext`, `force` — đã khai báo optional trong entity.
 */
function validateOrder(order: TenantDispatchOrderInput): string[] {
  const reasons: string[] = [];

  requireNonEmpty(order, "tx", reasons);
  requireNonEmpty(order, "tenantId", reasons);
  requireNonEmpty(order, "accountId", reasons);
  requireNonEmpty(order, "username", reasons);
  requireNonEmpty(order, "gameId", reasons);
  requireNonEmpty(order, "currency", reasons);
  requireNonEmpty(order, "sourceId", reasons);

  if (typeof order.amount !== "number" || !Number.isFinite(order.amount) || order.amount <= 0) {
    reasons.push(`amount phải là số dương (nhận được: ${String(order.amount)})`);
  }

  return reasons;
}

/**
 * Use case chung: insert batch orders vào outbox.
 *
 * Idempotent qua unique index `{ tx: 1 }` — gọi lại cùng orders không tạo trùng.
 *
 * ## Validation
 *
 * Trước khi bulk insert, mỗi order phải có đủ field bắt buộc và `amount > 0`.
 * Order lỗi bị loại khỏi batch (KHÔNG throw) — log `console.error` kèm `{ reasons, order }`
 * (full shape của order) để BO / log tools truy ngược builder bị sai. Caller
 * (builder / use-case game) là bên duy nhất có thể fix, nên không raise exception
 * để tránh chặn các order hợp lệ còn lại.
 *
 * Caller: game use-cases (EnqueueDispatchPayoutsUseCase của Keno/Lotto535/...).
 * Worker: không gọi use case này, worker chỉ read + update.
 */
export class EnqueueDispatchOrdersUseCase extends InternalUseCase<
  EnqueueDispatchOrdersInput,
  void
> {
  private readonly repo = new DispatchOrderRepository();

  protected async execute(input: EnqueueDispatchOrdersInput): Promise<void> {
    const validOrders: TenantDispatchOrderInput[] = [];

    for (const order of input.orders) {
      const reasons = validateOrder(order);
      if (reasons.length > 0) {
        console.error("[EnqueueDispatchOrders] Bỏ qua order không hợp lệ", {
          reasons,
          order,
        });
        continue;
      }
      validOrders.push(order);
    }

    if (validOrders.length === 0) {
      return;
    }

    await this.repo.bulkEnqueue(validOrders);
  }
}
