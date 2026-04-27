/**
 * Keno Settle – Step Function Definition (ASL)
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
 *  │  2. SettleEntries (loop)                 │
 *  │     Match boards + side bets → bulk      │
 *  │     settle batch=500. Time-bounded       │
 *  │     (13 min). done=true khi hết.         │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  3. ApplyPayoutCaps                      │
 *  │     Giới hạn trả thưởng bậc 8/9/10.     │
 *  │     Nếu số bộ trúng vượt ngưỡng →       │
 *  │     chia đều tổng 10 tỷ.                 │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌────────────────────────────┐
 *  │  4. CalculateFinancials    │  Tính từ DB (no jackpot)
 *  └────────┬───────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  5. SyncTicketSummaries (loop)           │
 *  │     Recompute ticket progress.           │
 *  │     Time-bounded (13 min).               │
 *  │     done=true khi hết tickets.           │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  6. BuildSettleReport   │  Per-game financial reports
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  7. PublishSettleDaily  │  System daily reports
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  7b. PublishPlayerDaily │  Player daily reports
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  8. FinalizeSettle      │  settling → settled
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  9. EnqueueDispatchPayouts               │
 *  │     Bulk insert tenant_dispatch_orders.  │
 *  │     Worker-tenant-dispatch chạy thật.    │
 *  └──────────────────────────────────────────┘
 *
 * DATA FLOW (Assign-based):
 *   $settleCtx  = PrepareSettle result, persisted via Assign across all states.
 *   CalculateFinancials result merged into $settleCtx.financials.
 *   Lambda nhận data qua Arguments, tự destructure fields cần thiết.
 *   batchSize cố định 500 trong use-case, không truyền từ step function.
 *
 * USAGE (chạy từ thư mục step-functions):
 *   npx tsx -e "import { SETTLE_STATE_MACHINE } from './settle'; console.log(JSON.stringify(SETTLE_STATE_MACHINE, null, 2))" > settle.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-keno";
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

/**
 * Retry riêng cho state EnqueueDispatch* — bọc kín mọi lỗi.
 * Inner: 10 attempt, 10→120s (cap), backoff 2, FULL jitter.
 * Ngoài Retry, Catch chuyển sang EnqueueRetryWait (Wait 5 phút) rồi vòng lại
 * chính state enqueue — tạo outer-loop retry không giới hạn đến khi thành công.
 * Idempotent: bulkEnqueue dùng unique `tx`, gọi lại chỉ skip duplicate.
 */
const ENQUEUE_RETRY = [
  {
    ErrorEquals: ["States.ALL"],
    IntervalSeconds: 10,
    MaxAttempts: 10,
    BackoffRate: 2.0,
    MaxDelaySeconds: 120,
    JitterStrategy: "FULL",
  },
];

export const SETTLE_STATE_MACHINE = {
  Comment: "Keno Settle Step Function – Kết sổ kỳ quay (crash-safe, no jackpot)",
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
          Next: "ApplyPayoutCaps",
        },
      ],
      Default: "SettleEntries",
    },

    ApplyPayoutCaps: {
      Type: "Task",
      Resource: lambdaArn("settle-apply-payout-caps"),
      Arguments: "{% $settleCtx %}",
      Next: "CalculateFinancials",
      Retry: LAMBDA_RETRY,
    },

    CalculateFinancials: {
      Type: "Task",
      Resource: lambdaArn("settle-calculate-financials"),
      Arguments: "{% $settleCtx %}",
      Assign: { settleCtx: "{% $merge([$settleCtx, { 'financials': $states.result }]) %}" },
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
    // Aggregate keno_ticket_entries WHERE { financialDate, status ∈ [settled, void] }
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
    // Lambda timeout 10 phút cho mỗi lần, state function loop lại nếu còn.
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
    // Wait 5 phút rồi vòng lại EnqueueDispatchPayouts. Không giới hạn số vòng —
    // chạy đến khi thành công. Idempotent nhờ unique `tx` tại tenant_dispatch_orders.
    EnqueueRetryWait: {
      Type: "Wait",
      Seconds: 300,
      Next: "EnqueueDispatchPayouts",
    },
  },
};
