/**
 * PURE — không DB.
 *
 * Unit test cho dispatch order builders: mapping sourceKind → action/reason/force.
 * Builder thuần, không chạm DB.
 */

import { describe, it, expect } from "vitest";
import { buildPayoutOrder, buildRefundOrder, buildReversalOrder } from "../src/builders/build-dispatch-order";
import { DispatchSourceKind, DispatchOrderStatus } from "../src/entities/enums";
import { TransactionAction, TransactionReason, Currency } from "@megawin/shared/types";

const COMMON = {
  tenantId: "tenant-1",
  accountId: "acc-1",
  username: "player1",
  amount: 100_000,
  gameId: "keno",
  sourceId: "entry-1",
  batchKey: "batch-1",
};

describe("build-dispatch-order", () => {
  it("buildPayoutOrder → credit + payout, status Pending, currency mặc định VND", () => {
    const order = buildPayoutOrder(COMMON);
    expect(order.action).toBe(TransactionAction.Credit);
    expect(order.reason).toBe(TransactionReason.Payout);
    expect(order.sourceKind).toBe(DispatchSourceKind.Payout);
    expect(order.status).toBe(DispatchOrderStatus.Pending);
    expect(order.currency).toBe(Currency.VND);
    expect(order.tx).toBeTypeOf("string");
  });

  it("buildRefundOrder → credit + refund", () => {
    const order = buildRefundOrder(COMMON);
    expect(order.action).toBe(TransactionAction.Credit);
    expect(order.reason).toBe(TransactionReason.Refund);
    expect(order.sourceKind).toBe(DispatchSourceKind.Refund);
  });

  it("buildReversalOrder → debit + adjustment + force=true", () => {
    const order = buildReversalOrder(COMMON);
    expect(order.action).toBe(TransactionAction.Debit);
    expect(order.reason).toBe(TransactionReason.Adjustment);
    expect(order.sourceKind).toBe(DispatchSourceKind.Reversal);
    expect(order.force).toBe(true);
  });

  it("giữ nguyên tx override khi caller cung cấp", () => {
    const order = buildPayoutOrder({ ...COMMON, tx: "fixed-tx" });
    expect(order.tx).toBe("fixed-tx");
  });
});
