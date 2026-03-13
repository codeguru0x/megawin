/**
 * Bingo 18 Settle Draw Step Function – ASL Definition
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId }
 *         │
 *         ▼
 *  ┌─────────────────────────┐
 *  │  1. PrepareSettle       │  Load context (draw, config, counts)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  2. SettleEntries (loop, batch=500)      │
 *  │     Match boards + side bets → payout    │
 *  │     done = true khi hết scheduled        │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌────────────────────────────┐
 *  │  3. CalculateFinancials    │  Tính từ DB (no jackpot)
 *  └────────┬───────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  4. SyncTicketSummaries (loop)          │
 *  │     Recompute ticket progress           │
 *  │     done = true khi hết tickets         │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  5. BuildSettleReport   │  Per-game financial reports (NEW)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  6. PublishSettleDaily  │  System daily reports (NEW)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  7. FinalizeSettle      │  settling → settled
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  7. DispatchPayouts (loop)               │
 *  │     done = true khi hết pending payouts  │
 *  └──────────────────────────────────────────┘
 *
 * DATA FLOW (single $settleCtx):
 *   $settleCtx = PrepareSettle result, enriched progressively.
 *   After CalculateFinancials: settleCtx.financials = result.
 *   All steps receive $settleCtx — destructure what they need.
 *
 * USAGE (chạy từ thư mục step-functions):
 *   npx tsx -e "import { SETTLE_STATE_MACHINE } from './settle'; console.log(JSON.stringify(SETTLE_STATE_MACHINE, null, 2))" > settle.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-bingo18";
const STAGE = "dev";

function lambdaArn(functionName: string): string {
  return `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${SERVICE}-${STAGE}-${functionName}`;
}

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
  Comment: "Bingo 18 Settle Step Function – Kết sổ kỳ quay (crash-safe, no jackpot)",
  QueryLanguage: "JSONata",
  StartAt: "PrepareSettle",
  States: {
    PrepareSettle: {
      Type: "Task",
      Resource: lambdaArn("settle-prepare"),
      Assign: { settleCtx: "{% $states.result %}" },
      Next: "SettleEntries",
      Retry: LAMBDA_RETRY,
    },

    SettleEntries: {
      Type: "Task",
      Resource: lambdaArn("settle-entries"),
      Arguments: "{% $settleCtx %}",
      Assign: { settleResult: "{% $states.result %}" },
      Next: "CheckSettleDone",
      Retry: LAMBDA_RETRY,
    },

    CheckSettleDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $settleResult.done %}",
          Next: "CalculateFinancials",
        },
      ],
      Default: "SettleEntries",
    },

    CalculateFinancials: {
      Type: "Task",
      Resource: lambdaArn("settle-calculate-financials"),
      Arguments: "{% $settleCtx %}",
      Assign: {
        settleCtx: "{% $merge($settleCtx, { 'financials': $states.result }) %}",
      },
      Next: "SyncTicketSummaries",
      Retry: LAMBDA_RETRY,
    },

    SyncTicketSummaries: {
      Type: "Task",
      Resource: lambdaArn("settle-sync-ticket-summaries"),
      Arguments: "{% $settleCtx %}",
      Assign: { syncResult: "{% $states.result %}" },
      Next: "CheckSyncDone",
      Retry: LAMBDA_RETRY,
    },

    CheckSyncDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $syncResult.done %}",
          Next: "BuildSettleReport",
        },
      ],
      Default: "SyncTicketSummaries",
    },

    BuildSettleReport: {
      Type: "Task",
      Resource: lambdaArn("settle-build-settle-report"),
      Arguments: "{% $settleCtx %}",
      Next: "PublishSettleDaily",
      Retry: LAMBDA_RETRY,
    },

    PublishSettleDaily: {
      Type: "Task",
      Resource: lambdaArn("settle-publish-settle-daily"),
      Arguments: "{% { 'financialDate': $settleCtx.financialDate } %}",
      Next: "FinalizeSettle",
      Retry: LAMBDA_RETRY,
    },

    FinalizeSettle: {
      Type: "Task",
      Resource: lambdaArn("settle-finalize"),
      Arguments: "{% $settleCtx %}",
      Next: "DispatchPayouts",
      Retry: LAMBDA_RETRY,
    },

    DispatchPayouts: {
      Type: "Task",
      Resource: lambdaArn("settle-dispatch-payouts"),
      Arguments: "{% $settleCtx %}",
      Assign: { payoutResult: "{% $states.result %}" },
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
          Condition: "{% $payoutResult.done %}",
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
