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
 *  ┌──────────────────────────────────────────┐
 *  │  3. SyncTicketSummaries (loop)          │
 *  │     Recompute ticket progress           │
 *  │     done = true khi hết tickets         │
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
 *  │     done = true khi hết pending payouts  │
 *  └──────────────────────────────────────────┘
 *
 * DATA FLOW (Assign-based):
 *   $settleCtx  = PrepareSettle result, persisted via Assign across all states.
 *   $financials = CalculateFinancials result, used by BuildReport & FinalizeSettle.
 *   Lambda nhận data qua Arguments, tự destructure fields cần thiết.
 *   batchSize cố định 500 trong use-case, không truyền từ step function.
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
          Next: "SyncTicketSummaries",
        },
      ],
      Default: "SettleEntries",
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
          Next: "CalculateFinancials",
        },
      ],
      Default: "SyncTicketSummaries",
    },

    CalculateFinancials: {
      Type: "Task",
      Resource: lambdaArn("settle-calculate-financials"),
      Arguments: "{% $settleCtx %}",
      Assign: { financials: "{% $states.result %}" },
      Next: "BuildReport",
      Retry: LAMBDA_RETRY,
    },

    BuildReport: {
      Type: "Task",
      Resource: lambdaArn("settle-build-report"),
      Arguments: "{% $merge($settleCtx, { 'financials': $financials }) %}",
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
