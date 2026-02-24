/**
 * Lotto 5/35 Settle – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId: "2026-02-24-001" }
 *         │
 *         ▼
 *  ┌─────────────────────────┐
 *  │  1. PrepareSettle       │  Load context (accepts "settling" status)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  2. InitSettleLoop      │  Set batchSize = 500
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  3. SettleEntries (loop, always page 1)  │
 *  │     Filter: status = "drawn"             │
 *  │     done = true khi 0 drawn entries left │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌────────────────────────────┐
 *  │  4. CalculateFinancials    │  Tính TỪ DB (not accumulator)
 *  └────────┬───────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  5. BuildReport         │  Daily reports (idempotent upsert)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  6. FinalizeSettle      │  settling → settled + jackpot chain
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  7. DispatchPayouts (loop, async)        │
 *  │     Batch 200, chunk 50/API call         │
 *  └─────────────────────────────────────────-┘
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Step Function retry-safe.
 *
 * JACKPOT CHAIN:
 *   draw.jackpot.openingAmount → tính → closingAmount
 *   → next_draw.openingAmount = this_draw.closingAmount
 */

export const SETTLE_STATE_MACHINE = {
  Comment: "Lotto 5/35 Settle Step Function – Kết sổ kỳ quay (crash-safe)",
  StartAt: "PrepareSettle",
  States: {
    PrepareSettle: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-prepare",
      ResultPath: "$.context",
      Next: "InitSettleLoop",
    },

    InitSettleLoop: {
      Type: "Pass",
      Result: { batchSize: 500 },
      ResultPath: "$.settleLoop",
      Next: "SettleEntries",
    },

    SettleEntries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-entries",
      Comment: "Always queries page 1. Settled entries auto-excluded by status filter.",
      Parameters: {
        "drawId.$": "$.context.drawId",
        "result.$": "$.context.result",
        "prizeAmounts.$": "$.context.prizeAmounts",
        "isSplitCycle.$": "$.context.isSplitCycle",
        "batchSize.$": "$.settleLoop.batchSize",
      },
      ResultPath: "$.settleResult",
      Next: "CheckSettleDone",
    },

    CheckSettleDone: {
      Type: "Choice",
      Choices: [
        {
          Variable: "$.settleResult.done",
          BooleanEquals: true,
          Next: "CalculateFinancials",
        },
      ],
      Default: "SettleEntries",
    },

    CalculateFinancials: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-calculate-financials",
      Parameters: {
        "drawId.$": "$.context.drawId",
        "jackpotOpeningAmount.$": "$.context.jackpotOpeningAmount",
        "isSplitCycle.$": "$.context.isSplitCycle",
        "totalLines.$": "$.context.totalLines",
        "config.$": "$.context.config",
      },
      ResultPath: "$.financials",
      Next: "BuildReport",
    },

    BuildReport: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-build-report",
      Parameters: {
        "drawId.$": "$.context.drawId",
        "drawDate.$": "$.context.drawDate",
        "financialDate.$": "$.context.financialDate",
        "financials.$": "$.financials",
      },
      ResultPath: "$.reportResult",
      Next: "FinalizeSettle",
    },

    FinalizeSettle: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-finalize",
      Parameters: {
        "drawId.$": "$.context.drawId",
        "closingJackpot.$": "$.financials.closingJackpot",
        "nextJackpotOpening.$": "$.financials.nextJackpotOpening",
      },
      ResultPath: "$.finalizeResult",
      Next: "DispatchPayouts",
    },

    DispatchPayouts: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-dispatch-payouts",
      Parameters: {
        "drawId.$": "$.context.drawId",
      },
      ResultPath: "$.payoutResult",
      Next: "CheckPayoutDone",
      Catch: [
        {
          ErrorEquals: ["States.ALL"],
          Next: "PayoutFailed",
        },
      ],
    },

    CheckPayoutDone: {
      Type: "Choice",
      Choices: [
        {
          Variable: "$.payoutResult.done",
          BooleanEquals: true,
          Next: "PayoutComplete",
        },
      ],
      Default: "PayoutWait",
    },

    PayoutWait: {
      Type: "Wait",
      Seconds: 5,
      Next: "DispatchPayouts",
    },

    PayoutComplete: {
      Type: "Pass",
      End: true,
    },

    PayoutFailed: {
      Type: "Pass",
      Comment: "Payout error – settle vẫn hoàn tất, admin retry thủ công",
      End: true,
    },
  },
};
