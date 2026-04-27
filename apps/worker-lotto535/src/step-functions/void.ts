/**
 * Lotto 5/35 Void Draw – Step Function Definition (ASL)
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
 *  │     + build lotto535_void_draw_reports                   │
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
 *  │  7. EnqueueDispatchRefunds (outbox)      │
 *  │     Bulk insert tenant_dispatch_orders   │
 *  │     Worker tenant-dispatch gửi async     │
 *  └──────────────────────────────────────────┘
 *
 * DATA FLOW (Assign-based):
 *   $voidCtx = PrepareVoid result, persisted via Assign across all states.
 *   Lambda nhận data qua Arguments, tự destructure fields cần thiết.
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Entries đã void/refund tự filter ra.
 *
 * REFUND SAU FINALIZE:
 *   EnqueueDispatchRefunds chạy sau FinalizeVoid — nhất quán với settle (EnqueueDispatchPayouts sau FinalizeSettle).
 *   Nếu tenant API down → draw vẫn = void (không treo ở voiding). Admin retry thủ công.
 *
 * REFUND LOGIC:
 *   - Multi-draw ticket: 1 kỳ void → partial refund (entry amount)
 *   - Single-draw ticket: kỳ duy nhất void → full refund, ticket status = refunded
 *
 * USAGE (chạy từ thư mục step-functions):
 *   npx tsx -e "import { VOID_STATE_MACHINE } from './void'; console.log(JSON.stringify(VOID_STATE_MACHINE, null, 2))" > void.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-lotto535";
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

export const VOID_STATE_MACHINE = {
  Comment: "Lotto 5/35 Void Draw Step Function – Huỷ kỳ quay (crash-safe)",
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

    // ── STEP 4: Build void report ──
    // Cleanup settle reports (nếu void-after-settle) + build void report.
    // Phase 0: snapshot + delete settle reports (idempotent).
    // Phase 1: aggregate voided entries + upsert lotto535_void_draw_reports.
    BuildVoidReport: {
      Type: "Task",
      Resource: lambdaArn("void-build-void-report"),
      Arguments: "{% $voidCtx %}",
      Next: "PublishSettleDaily",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 5: Publish settle daily ──
    // Re-aggregate lotto535_settle_draw/tenant_reports → upsert system daily.
    // Settle reports đã xoá → aggregate giảm → system daily tự giảm.
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

    // ── STEP 6: Finalize void ──
    // Transition voiding → void. Sau bước này draw status = void (hoàn tất nội bộ).
    FinalizeVoid: {
      Type: "Task",
      Resource: lambdaArn("void-finalize"),
      Arguments: "{% $voidCtx %}",
      Next: "EnqueueDispatchRefunds",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 7: Enqueue dispatch refunds (outbox) ──
    // Bulk insert voided entries vào `tenant_dispatch_orders` — idempotent qua `refundTx`.
    // Dispatch thực tế sang tenant do `worker-tenant-dispatch` chạy async.
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
    // Wait 60s rồi vòng lại EnqueueDispatchRefunds. Không giới hạn số vòng —
    // chạy đến khi thành công. Idempotent nhờ unique `tx` tại tenant_dispatch_orders.
    EnqueueRetryWait: {
      Type: "Wait",
      Seconds: 60,
      Next: "EnqueueDispatchRefunds",
    },
  },
};
