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
 *  ┌──────────────────────────────────────────┐
 *  │  2. SettleEntries (loop, always page 1)  │
 *  │     Filter: status = "scheduled"          │
 *  │     done = true khi 0 scheduled entries  │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌────────────────────────────┐
 *  │  3. CalculateFinancials    │  Tính TỪ DB (not accumulator)
 *  └────────┬───────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  4. ApplySplitBonuses   │  Patch split bonus (if isSplitCycle)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  5. SyncTicketSummaries (loop)          │  Recompute ticket summaries from entries
 *  │     done = true khi hết tickets         │
 *  └────────┬─────────────────────────────────┘
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
 *  │     Batch 200, chunk 50/API call         │
 *  └─────────────────────────────────────────-┘
 *
 * DATA FLOW (Assign-based):
 *   $settleCtx  = PrepareSettle result, persisted via Assign across all states.
 *   $financials = CalculateFinancials result, used by ApplySplitBonuses/BuildReport/FinalizeSettle.
 *   Each step receives what it needs via Arguments.
 *   FinalizeSettle receives merged $settleCtx + $financials.
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Step Function retry-safe.
 *
 * JACKPOT SOURCE OF TRUTH:
 *   Active draws: jackpot từ `lotto535_jackpot_cycles.currentAmount`
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
  Comment: "Lotto 5/35 Settle Step Function – Kết sổ kỳ quay (crash-safe)",
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
