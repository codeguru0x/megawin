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
 *  ┌─────────────────────────┐
 *  │  4. ApplySplitBonuses   │  Patch bonus nếu split cycle
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  5. SyncTicketSummaries (loop)         │  Recompute ticket summaries
 *  │     done = true khi hết tickets        │
 *  └────────┬───────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  6. BuildReport         │  Daily reports (idempotent upsert)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  7. FinalizeSettle      │  settling → settled + jackpot chain
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  8. DispatchPayouts (loop, async)        │
 *  │     done = true khi hết pending payouts  │
 *  └──────────────────────────────────────────┘
 *
 * DATA FLOW (Assign-based):
 *   $settleCtx  = PrepareSettle result, persisted via Assign across all states.
 *   $financials = CalculateFinancials result, used by ApplySplitBonuses/BuildReport/FinalizeSettle.
 *   Lambda nhận data qua Arguments, tự destructure fields cần thiết.
 *   batchSize cố định 500 trong use-case, không truyền từ step function.
 *   FinalizeSettle cần cả $settleCtx + $financials → dùng $merge.
 *   ApplySplitBonuses cần $settleCtx + splitDetails từ $financials → dùng $merge.
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Step Function retry-safe.
 *
 * JACKPOT SOURCE OF TRUTH:
 *   Active draws: jackpot từ `mega645_jackpot_cycles.currentAmount`
 *   Settled draws: snapshot jackpot ghi lúc finalize-settle
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
  Comment: "Mega 6/45 Settle Step Function – Kết sổ kỳ quay (crash-safe)",
  QueryLanguage: "JSONata",
  StartAt: "PrepareSettle",
  States: {
    PrepareSettle: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-prepare",
      Assign: { settleCtx: "{% $states.result %}" },
      Next: "SettleEntries",
      Retry: LAMBDA_RETRY,
    },

    SettleEntries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-entries",
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
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-calculate-financials",
      Arguments: "{% $settleCtx %}",
      Assign: { financials: "{% $states.result %}" },
      Next: "ApplySplitBonuses",
      Retry: LAMBDA_RETRY,
    },

    ApplySplitBonuses: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-apply-split-bonuses",
      Arguments: "{% $merge($settleCtx, { 'splitDetails': $financials.splitDetails }) %}",
      Next: "SyncTicketSummaries",
      Retry: LAMBDA_RETRY,
    },

    SyncTicketSummaries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-sync-ticket-summaries",
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
          Next: "BuildReport",
        },
      ],
      Default: "SyncTicketSummaries",
    },

    BuildReport: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-build-report",
      Arguments: "{% $merge($settleCtx, { 'financials': $financials }) %}",
      Next: "FinalizeSettle",
      Retry: LAMBDA_RETRY,
    },

    FinalizeSettle: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-finalize",
      Arguments: "{% $merge($settleCtx, $financials) %}",
      Next: "DispatchPayouts",
      Retry: LAMBDA_RETRY,
    },

    DispatchPayouts: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-dispatch-payouts",
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
