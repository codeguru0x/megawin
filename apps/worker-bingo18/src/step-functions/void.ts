/**
 * Bingo 18 Void Draw – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Precondition: void-draw API đã transition draw → voiding + ghi voidInfo
 *
 *  Input: { drawId }
 *         │
 *         ▼
 *  ┌─────────────────────────┐
 *  │  1. PrepareVoid         │  Verify status = voiding, load context
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  2. VoidEntries (loop, batch=500)        │
 *  │     Batch void scheduled entries         │
 *  │     done = true khi hết voidable entries │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  3. SyncTicketSummaries │  Recompute ticket progress (loop)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  4. BuildVoidReport                                      │
 *  │     Cleanup settle reports (nếu void-after-settle)       │
 *  │     + build bingo18_void_draw_reports                    │
 *  └────────┬─────────────────────────────────────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  5. PublishSettleDaily                                   │
 *  │     Re-aggregate system daily reports                    │
 *  │     Settle totals tự giảm khi settle reports đã xoá     │
 *  └────────┬─────────────────────────────────────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────────────────────┐
 *  │  5b. PublishPlayerDaily                                  │
 *  │     Re-aggregate player daily reports                    │
 *  │     Players hết entry → doc bị xoá                      │
 *  └────────┬─────────────────────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  6. FinalizeVoid        │  Transition voiding → void + ghi voidSummary
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  7. EnqueueDispatchRefunds               │
 *  │     Bulk insert tenant_dispatch_orders.  │
 *  │     Worker-tenant-dispatch gửi thật.     │
 *  └──────────────────────────────────────────┘
 *
 * DATA FLOW (Assign-based):
 *   $voidCtx = PrepareVoid result, persisted via Assign across all states.
 *   Lambda nhận data qua Arguments, tự destructure fields cần thiết.
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Entries đã void/refund tự filter ra.
 *
 * ENQUEUE SAU FINALIZE:
 *   EnqueueDispatchRefunds chạy sau FinalizeVoid — void nội bộ hoàn tất
 *   độc lập với tenant API. Worker-tenant-dispatch xử lý outbox orders.
 *
 * Bingo 18 KHÔNG có Jackpot → không cần rollback jackpot chain.
 *
 * USAGE (chạy từ thư mục step-functions):
 *   npx tsx -e "import { VOID_STATE_MACHINE } from './void'; console.log(JSON.stringify(VOID_STATE_MACHINE, null, 2))" > void.asl.json
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

export const VOID_STATE_MACHINE = {
  Comment: "Bingo 18 Void Draw Step Function – Huỷ kỳ quay (crash-safe, no jackpot)",
  QueryLanguage: "JSONata",
  StartAt: "PrepareVoid",
  States: {
    PrepareVoid: {
      Type: "Task",
      Resource: lambdaArn("void-prepare"),
      Assign: { voidCtx: "{% $states.result %}" },
      Next: "VoidEntries",
      Retry: LAMBDA_RETRY,
    },

    VoidEntries: {
      Type: "Task",
      Resource: lambdaArn("void-entries"),
      Arguments: "{% $voidCtx %}",
      Assign: { voidResult: "{% $states.result %}" },
      Next: "CheckVoidDone",
      Retry: LAMBDA_RETRY,
    },

    CheckVoidDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $voidResult.done %}",
          Next: "SyncTicketSummaries",
        },
      ],
      Default: "VoidEntries",
    },

    SyncTicketSummaries: {
      Type: "Task",
      Resource: lambdaArn("void-sync-ticket-summaries"),
      Arguments: "{% $voidCtx %}",
      Assign: { syncResult: "{% $states.result %}" },
      Next: "CheckSyncDone",
      Retry: LAMBDA_RETRY,
    },

    CheckSyncDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $syncResult.done %}",
          Next: "BuildVoidReport",
        },
      ],
      Default: "SyncTicketSummaries",
    },

    BuildVoidReport: {
      Type: "Task",
      Resource: lambdaArn("void-build-void-report"),
      Arguments: "{% $voidCtx %}",
      Next: "PublishSettleDaily",
      Retry: LAMBDA_RETRY,
    },

    PublishSettleDaily: {
      Type: "Task",
      Resource: lambdaArn("void-publish-settle-daily"),
      Arguments: "{% $voidCtx %}",
      Next: "PublishPlayerDaily",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 5b: Publish player daily ──
    // Re-aggregate ticket_entries cho financialDate → player_settle_game_daily.
    // Entries void → player metrics tự giảm. Players hết entry → doc bị xoá.
    PublishPlayerDaily: {
      Type: "Task",
      Resource: lambdaArn("void-publish-player-daily"),
      Arguments: "{% $voidCtx %}",
      Next: "FinalizeVoid",
      Retry: LAMBDA_RETRY,
    },

    FinalizeVoid: {
      Type: "Task",
      Resource: lambdaArn("void-finalize"),
      Arguments: "{% $voidCtx %}",
      Next: "EnqueueDispatchRefunds",
      Retry: LAMBDA_RETRY,
    },

    EnqueueDispatchRefunds: {
      Type: "Task",
      Resource: lambdaArn("void-enqueue-dispatch-refunds"),
      Arguments: "{% $voidCtx %}",
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

    // Loop cho đến khi use-case trả done=true (đã enqueue hết voided entries).
    CheckEnqueueDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $enqueueResult.done %}",
          Next: "VoidSucceeded",
        },
      ],
      Default: "EnqueueDispatchRefunds",
    },

    VoidSucceeded: {
      Type: "Succeed",
    },

    // Outer-loop retry: sau khi inner Retry (10 lần, 10→120s) vẫn fail,
    // Wait 5 phút rồi vòng lại EnqueueDispatchRefunds. Không giới hạn số vòng —
    // chạy đến khi thành công. Idempotent nhờ unique `tx` tại tenant_dispatch_orders.
    EnqueueRetryWait: {
      Type: "Wait",
      Seconds: 300,
      Next: "EnqueueDispatchRefunds",
    },
  },
};
