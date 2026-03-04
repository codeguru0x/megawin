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
 *  ┌─────────────────────────┐
 *  │  5. SyncTicketSummaries │  Recompute ticket summaries
 *  └────────┬────────────────┘
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
 * DATA FLOW:
 *   context = PrepareSettle output, truyền xuyên suốt.
 *   Lambda nhận context trực tiếp, tự destructure fields cần thiết.
 *   batchSize cố định 500 trong use-case, không truyền từ step function.
 *   FinalizeSettle cần cả context + financials → dùng $merge.
 *   ApplySplitBonuses cần context + splitDetails từ financials → dùng $merge.
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
      Output: "{% { 'context': $states.result } %}",
      Next: "SettleEntries",
      Retry: LAMBDA_RETRY,
    },

    SettleEntries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-entries",
      Arguments: "{% $states.input.context %}",
      Output:
        "{% { 'context': $states.input.context, 'settleResult': $states.result } %}",
      Next: "CheckSettleDone",
      Retry: LAMBDA_RETRY,
    },

    CheckSettleDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $states.input.settleResult.done %}",
          Next: "CalculateFinancials",
        },
      ],
      Default: "SettleEntries",
    },

    CalculateFinancials: {
      Type: "Task",
      Resource:
        "arn:aws:lambda:REGION:ACCOUNT:function:settle-calculate-financials",
      Arguments: "{% $states.input.context %}",
      Output:
        "{% { 'context': $states.input.context, 'financials': $states.result } %}",
      Next: "ApplySplitBonuses",
      Retry: LAMBDA_RETRY,
    },

    ApplySplitBonuses: {
      Type: "Task",
      Resource:
        "arn:aws:lambda:REGION:ACCOUNT:function:settle-apply-split-bonuses",
      Arguments:
        "{% $merge($states.input.context, { 'splitDetails': $states.input.financials.splitDetails }) %}",
      Output:
        "{% { 'context': $states.input.context, 'financials': $states.input.financials, 'splitBonusResult': $states.result } %}",
      Next: "SyncTicketSummaries",
      Retry: LAMBDA_RETRY,
    },

    SyncTicketSummaries: {
      Type: "Task",
      Resource:
        "arn:aws:lambda:REGION:ACCOUNT:function:settle-sync-ticket-summaries",
      Arguments: "{% $states.input.context %}",
      Output:
        "{% { 'context': $states.input.context, 'financials': $states.input.financials, 'syncResult': $states.result } %}",
      Next: "BuildReport",
      Retry: LAMBDA_RETRY,
    },

    BuildReport: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-build-report",
      Arguments:
        "{% $merge($states.input.context, { 'financials': $states.input.financials }) %}",
      Output:
        "{% { 'context': $states.input.context, 'financials': $states.input.financials, 'reportResult': $states.result } %}",
      Next: "FinalizeSettle",
      Retry: LAMBDA_RETRY,
    },

    FinalizeSettle: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:settle-finalize",
      Arguments:
        "{% $merge($states.input.context, $states.input.financials) %}",
      Output:
        "{% { 'context': $states.input.context, 'finalizeResult': $states.result } %}",
      Next: "DispatchPayouts",
      Retry: LAMBDA_RETRY,
    },

    DispatchPayouts: {
      Type: "Task",
      Resource:
        "arn:aws:lambda:REGION:ACCOUNT:function:settle-dispatch-payouts",
      Arguments: "{% $states.input.context %}",
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
