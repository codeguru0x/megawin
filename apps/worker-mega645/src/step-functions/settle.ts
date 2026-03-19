/**
 * Mega 6/45 Settle – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId }
 *         │
 *         ▼
 *  ┌─────────────────────────┐
 *  │  1. PrepareSettle       │  Load context (draw, config, jackpot, counts)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  2. SettleEntries (loop, batch=500)      │
 *  │     Expand boards → match lines → payout │
 *  │     done = true khi hết scheduled        │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌────────────────────────────┐
 *  │  3. CalculateFinancials    │  Tính TỪ DB (not accumulator)
 *  └────────┬───────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  4. CheckJackpotWinner (Choice)                          │
 *  │     hasJackpotWinner = true → PatchJackpotPrize (4a)     │
 *  │     hasJackpotWinner = false → SyncTicketSummaries (5)   │
 *  └────────┬─────────────────────────────────────────────────┘
 *           ▼ (if winner)
 *  ┌─────────────────────────────────────────────────────┐
 *  │  4a. PatchJackpotPrize                              │
 *  │      Patch winAmount vào entries + lines trúng JP   │
 *  └────────┬────────────────────────────────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  5. SyncTicketSummaries (loop)           │  Recompute ticket summaries
 *  │     done = true khi hết tickets          │
 *  └────────┬───────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────────────────────┐
 *  │  6. BuildSettleReport                   │  Per-game financial reports
 *  └────────┬────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────────────────────┐
 *  │  7. PublishSettleDaily                  │  System daily reports (re-aggregate)
 *  └────────┬────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  8. FinalizeSettle      │  settling → settled + jackpot chain
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  7. DispatchPayouts (loop, async)        │
 *  │     done = true khi hết pending payouts  │
 *  └──────────────────────────────────────────┘
 *
 * DATA FLOW (Assign-based):
 *   $settleCtx  = PrepareSettle result, persisted via Assign across all states.
 *   Sau CalculateFinancials, merge financials vào $settleCtx.financials.
 *   Lambda nhận data qua Arguments, tự destructure fields cần thiết.
 *   batchSize cố định 500 trong use-case, không truyền từ step function.
 *   Tất cả step dùng chung $settleCtx — không cần biến riêng.
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Step Function retry-safe.
 *
 * JACKPOT SOURCE OF TRUTH:
 *   Active draws: jackpot từ `mega645_jackpot_cycles.currentAmount`
 *   Settled draws: snapshot jackpot ghi lúc finalize-settle
 *
 * USAGE (chạy từ thư mục step-functions):
 *   npx tsx -e "import { SETTLE_STATE_MACHINE } from './settle'; console.log(JSON.stringify(SETTLE_STATE_MACHINE, null, 2))" > settle.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-mega645";
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
  Comment: "Mega 6/45 Settle Step Function – Kết sổ kỳ quay (crash-safe)",
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
      Assign: { settleCtx: "{% $merge([$settleCtx, { 'financials': $states.result }]) %}" },
      Next: "CheckJackpotWinner",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 4: Route nếu có Jackpot winner → patch prize vào entries + lines ──
    CheckJackpotWinner: {
      Type: "Choice",
      Choices: [
        {
          Comment: "Có jackpot winner → patch jackpot prize vào entries + lines",
          Condition: "{% $settleCtx.financials.hasJackpotWinner %}",
          Next: "PatchJackpotPrize",
        },
      ],
      Default: "SyncTicketSummaries",
    },

    // ── STEP 4a: Patch Jackpot Prize ──
    // Merge winners vào settleCtx (top-level) để FinalizeSettle dùng — tránh re-query DB.
    PatchJackpotPrize: {
      Type: "Task",
      Resource: lambdaArn("settle-patch-jackpot-prize"),
      Arguments: "{% $settleCtx %}",
      Assign: {
        settleCtx: "{% $merge([$settleCtx, { 'jackpotWinners': $states.result.winners }]) %}",
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
      Arguments: "{% $settleCtx %}",
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
