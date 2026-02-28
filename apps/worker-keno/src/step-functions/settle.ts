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

const LAMBDA_RETRY = [
  {
    ErrorEquals: [
      "Lambda.ServiceException",
      "Lambda.AWSLambdaException",
      "Lambda.SdkClientException",
      "Lambda.TooManyRequestsException",
      "States.TaskFailed",
      "States.Timeout",
    ],
    IntervalSeconds: 10,
    MaxAttempts: 3,
    BackoffRate: 2.0,
  },
];

export const SETTLE_STATE_MACHINE = {
  Comment:
    "Keno Settle Step Function – Kết sổ kỳ quay (crash-safe, no jackpot)",
  QueryLanguage: "JSONata",
  StartAt: "PrepareSettle",
  States: {
    PrepareSettle: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-prepare",
      Output:
        "{% { 'context': $states.result, 'drawId': $states.input.drawId } %}",
      Next: "InitSettleLoop",
      Retry: LAMBDA_RETRY,
    },

    InitSettleLoop: {
      Type: "Pass",
      Output:
        "{% { 'context': $states.input.context, 'settleLoop': { 'batchSize': 500 } } %}",
      Next: "SettleEntries",
    },

    SettleEntries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-entries",
      Arguments: {
        drawId: "{% $states.input.context.drawId %}",
        result: "{% $states.input.context.result %}",
        config: "{% $states.input.context.config %}",
        batchSize: "{% $states.input.settleLoop.batchSize %}",
      },
      Output:
        "{% { 'context': $states.input.context, 'settleLoop': $states.input.settleLoop, 'settleResult': $states.result } %}",
      Next: "CheckSettleDone",
      Retry: LAMBDA_RETRY,
    },

    CheckSettleDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $states.input.settleResult.done %}",
          Next: "SyncTicketSummaries",
        },
      ],
      Default: "SettleEntries",
    },

    SyncTicketSummaries: {
      Type: "Task",
      Resource:
        "arn:aws:lambda:REGION:ACCOUNT:function:settle-sync-ticket-summaries",
      Arguments: {
        drawId: "{% $states.input.context.drawId %}",
      },
      Output:
        "{% { 'context': $states.input.context, 'syncResult': $states.result } %}",
      Next: "CalculateFinancials",
      Retry: LAMBDA_RETRY,
    },

    CalculateFinancials: {
      Type: "Task",
      Resource:
        "arn:aws:lambda:REGION:ACCOUNT:function:settle-calculate-financials",
      Arguments: {
        drawId: "{% $states.input.context.drawId %}",
        config: "{% $states.input.context.config %}",
      },
      Output:
        "{% { 'context': $states.input.context, 'financials': $states.result } %}",
      Next: "BuildReport",
      Retry: LAMBDA_RETRY,
    },

    BuildReport: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-build-report",
      Arguments: {
        drawId: "{% $states.input.context.drawId %}",
        financialDate: "{% $states.input.context.financialDate %}",
        financials: "{% $states.input.financials %}",
      },
      Output:
        "{% { 'context': $states.input.context, 'financials': $states.input.financials, 'reportResult': $states.result } %}",
      Next: "FinalizeSettle",
      Retry: LAMBDA_RETRY,
    },

    FinalizeSettle: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-finalize",
      Arguments: {
        drawId: "{% $states.input.context.drawId %}",
      },
      Output:
        "{% { 'context': $states.input.context, 'finalizeResult': $states.result } %}",
      Next: "DispatchPayouts",
      Retry: LAMBDA_RETRY,
    },

    DispatchPayouts: {
      Type: "Task",
      Resource:
        "arn:aws:lambda:REGION:ACCOUNT:function:settle-dispatch-payouts",
      Arguments: {
        drawId: "{% $states.input.context.drawId %}",
      },
      Output:
        "{% { 'context': $states.input.context, 'payoutResult': $states.result } %}",
      Next: "CheckPayoutDone",
      Retry: LAMBDA_RETRY,
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
          Condition: "{% $states.input.payoutResult.done %}",
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
