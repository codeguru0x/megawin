/**
 * Power 6/55 Settle – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId }
 *         │
 *         ▼
 *  ┌─────────────────────────┐
 *  │  1. PrepareSettle       │  Load context (draw, config, dual JP, counts)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  2. SettleEntries (loop, batch=500)      │
 *  │     Expand boards → match lines → payout │
 *  │     done = true khi hết scheduled        │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌────────────────────────────┐
 *  │  3. CalculateFinancials    │  Tính từ DB (dual JP1/JP2 + overflow)
 *  └────────┬───────────────────┘
 *           ▼
 *  ┌─────────────────────────────────────────────────┐
 *  │  4. CheckJackpotWinner (Choice)                 │
 *  │     hasJackpot1Winner || hasJackpot2Winner?     │
 *  └──┬──────────────────────────────────┬───────────┘
 *   Yes                                  No
 *     ▼                                  │
 *  ┌──────────────────────────────┐      │
 *  │  4a. PatchJackpotPrize       │      │
 *  │      Ghi prizeAmount vào     │      │
 *  │      JP lines + entries;     │      │
 *  │      trả về winners list     │      │
 *  └────────┬─────────────────────┘      │
 *           └──────────┬─────────────────┘
 *                      ▼
 *  ┌──────────────────────────────────────────┐
 *  │  5. SyncTicketSummaries (loop)           │
 *  │     Recompute ticket progress            │
 *  │     done = true khi hết tickets          │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  6. BuildSettleReport   │  Per-game financial reports
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  7. PublishSettleDaily  │  System daily reports (re-aggregate)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  7b. PublishPlayerDaily │  Player daily reports (re-aggregate per player)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  8. FinalizeSettle      │  settling → settled + dual jackpot cycle
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  9. EnqueueDispatchPayouts               │
 *  │     Bulk insert orders vào outbox        │
 *  │     (worker-tenant-dispatch tiếp quản)   │
 *  └──────────────────────────────────────────┘
 *
 * DATA FLOW (single $settleCtx):
 *   $settleCtx = PrepareSettle result, enriched progressively.
 *   After CalculateFinancials: settleCtx.financials = result.
 *   All steps receive $settleCtx — destructure what they need.
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Step Function retry-safe.
 *
 * JACKPOT SOURCE OF TRUTH:
 *   Active draws: jackpot từ `power655_jackpot_cycles.currentAmount`
 *   Settled draws: snapshot jackpot ghi lúc finalize-settle
 *
 * USAGE (chạy từ thư mục step-functions):
 *   npx tsx -e "import { SETTLE_STATE_MACHINE } from './settle'; console.log(JSON.stringify(SETTLE_STATE_MACHINE, null, 2))" > settle.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-power655";
const STAGE = "dev";

function lambdaArn(functionName: string): string {
  return `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${SERVICE}-${STAGE}-${functionName}:$LATEST`;
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

/**
 * Retry riêng cho state EnqueueDispatch* — chỉ retry lỗi transient của AWS
 * Lambda / Step Functions (throttle, service exception, SDK, timeout).
 * Không retry `States.ALL` ở tầng này để bug code / permission error không
 * bị nuốt — những lỗi đó rơi thẳng xuống Catch → EnqueueRetryWait.
 *
 * Inner: 10 attempt, 10→120s (cap), backoff 2, FULL jitter.
 * Ngoài Retry, Catch (States.ALL) chuyển sang EnqueueRetryWait (Wait 60s)
 * rồi vòng lại chính state enqueue — outer-loop retry không giới hạn.
 * Idempotent: bulkEnqueue dùng unique `tx`, gọi lại chỉ skip duplicate.
 */
const ENQUEUE_RETRY = [
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
    MaxAttempts: 10,
    BackoffRate: 2.0,
    MaxDelaySeconds: 120,
    JitterStrategy: "FULL",
  },
];

export const SETTLE_STATE_MACHINE = {
  Comment: "Power 6/55 Settle Step Function – Kết sổ kỳ quay (crash-safe, dual JP)",
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
        settleCtx: "{% $merge([$settleCtx, { 'financials': $states.result }]) %}",
      },
      Next: "CheckJackpotWinner",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 4: Route nếu có JP1 hoặc JP2 winner → patch prize vào entries + lines ──
    CheckJackpotWinner: {
      Type: "Choice",
      Choices: [
        {
          Comment: "Có JP1 hoặc JP2 winner → patch jackpot prize vào entries + lines",
          Condition:
            "{% $settleCtx.financials.hasJackpot1Winner or $settleCtx.financials.hasJackpot2Winner %}",
          Next: "PatchJackpotPrize",
        },
      ],
      Default: "SyncTicketSummaries",
    },

    // ── STEP 4a: Patch Jackpot Prize (JP1 + JP2 độc lập) ──
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
      Next: "PublishPlayerDaily",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 7b: Publish player daily (player-level reports) ──
    // Aggregate power655_ticket_entries WHERE { financialDate, status ∈ [settled, void] }
    // → group by { tenantId, accountId } → delete cũ + bulk upsert player_settle_game_daily.
    // IDEMPOTENT: delete + overwrite toàn bộ — chạy lại cho kết quả giống nhau.
    PublishPlayerDaily: {
      Type: "Task",
      Resource: lambdaArn("settle-publish-player-daily"),
      Arguments: "{% $settleCtx %}",
      Next: "FinalizeSettle",
      Retry: LAMBDA_RETRY,
    },

    FinalizeSettle: {
      Type: "Task",
      Resource: lambdaArn("settle-finalize"),
      Arguments: "{% $settleCtx %}",
      Next: "EnqueueDispatchPayouts",
      Retry: LAMBDA_RETRY,
    },

    EnqueueDispatchPayouts: {
      Type: "Task",
      Resource: lambdaArn("settle-enqueue-dispatch-payouts"),
      Arguments: "{% $settleCtx %}",
      Assign: { enqueueResult: "{% $states.result %}" },
      Next: "CheckEnqueueDone",
      Retry: ENQUEUE_RETRY,
      Catch: [
        {
          ErrorEquals: ["States.ALL"],
          Next: "EnqueueRetryWait",
        },
      ],
    },

    // Loop cho đến khi use-case trả done=true (đã enqueue hết winners).
    CheckEnqueueDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $enqueueResult.done %}",
          Next: "SettleSucceeded",
        },
      ],
      Default: "EnqueueDispatchPayouts",
    },

    SettleSucceeded: {
      Type: "Succeed",
    },

    // Outer-loop retry: sau khi inner Retry (10 lần, 10→120s) vẫn fail,
    // Wait 60s rồi vòng lại EnqueueDispatchPayouts. Không giới hạn số vòng —
    // chạy đến khi thành công. Idempotent nhờ unique `tx` tại tenant_dispatch_orders.
    EnqueueRetryWait: {
      Type: "Wait",
      Seconds: 60,
      Next: "EnqueueDispatchPayouts",
    },
  },
};
