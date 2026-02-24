/**
 * Keno Settle – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId: "2026-02-24-001" }
 *         │
 *         ▼
 *  ┌─────────────────────────┐
 *  │  1. PrepareSettle       │  Load context
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  2. InitSettleLoop      │  Set batchSize = 500
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  3. SettleEntries (loop, always page 1)  │
 *  │     Match boards + side bets → payout    │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌────────────────────────────┐
 *  │  4. CalculateFinancials    │  Tính từ DB (no jackpot)
 *  └────────┬───────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  5. BuildReport         │  Daily reports
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  6. FinalizeSettle      │  settling → settled
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  7. DispatchPayouts (loop)               │
 *  └──────────────────────────────────────────┘
 */

export const SETTLE_STATE_MACHINE = {
  Comment: "Keno Settle Step Function – Kết sổ kỳ quay (crash-safe, no jackpot)",
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
      Parameters: {
        "drawId.$": "$.context.drawId",
        "result.$": "$.context.result",
        "config.$": "$.context.config",
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
