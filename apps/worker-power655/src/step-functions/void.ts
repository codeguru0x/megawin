/**
 * Power 6/55 Void Draw – Step Function Definition (ASL)
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
 *  │  3. SyncTicketSummaries │  Recompute ticket progress
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  4. DispatchRefunds (loop)               │
 *  │     Gửi refund qua TenantGateway API    │
 *  │     done = true khi hết pending refunds  │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  5. BuildVoidReport     │  Cleanup settle reports + build void report
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  6. PublishSettleDaily  │  Re-aggregate system (settle totals giảm)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  7. FinalizeVoid        │  Transition voiding → void + ghi voidSummary
 *  └─────────────────────────┘
 *
 * DATA FLOW (Assign-based):
 *   $voidCtx = PrepareVoid result, persisted via Assign across all states.
 *   Lambda nhận data qua Arguments, tự destructure fields cần thiết.
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Entries đã void/refund tự filter ra.
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
const SERVICE = "mw-worker-power655";
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

export const VOID_STATE_MACHINE = {
  Comment: "Power 6/55 Void Draw Step Function – Huỷ kỳ quay (crash-safe)",
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
          Next: "DispatchRefunds",
        },
      ],
      Default: "SyncTicketSummaries",
    },

    DispatchRefunds: {
      Type: "Task",
      Resource: lambdaArn("void-dispatch-refunds"),
      Arguments: "{% $voidCtx %}",
      Assign: { refundResult: "{% $states.result %}" },
      Next: "CheckRefundDone",
      Retry: LAMBDA_RETRY,
      Catch: [
        {
          ErrorEquals: ["States.ALL"],
          Next: "RefundFailed",
        },
      ],
    },

    CheckRefundDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $refundResult.done %}",
          Next: "BuildVoidReport",
        },
      ],
      Default: "RefundWait",
    },

    RefundWait: {
      Type: "Wait",
      Seconds: 5,
      Next: "DispatchRefunds",
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
      Arguments: "{% { 'financialDate': $voidCtx.financialDate } %}",
      Next: "FinalizeVoid",
      Retry: LAMBDA_RETRY,
    },

    FinalizeVoid: {
      Type: "Task",
      Resource: lambdaArn("void-finalize"),
      Arguments: "{% $voidCtx %}",
      End: true,
      Retry: LAMBDA_RETRY,
    },

    RefundFailed: {
      Type: "Pass",
      Comment: "Refund error – void hoàn tất, entries đã void. Admin retry thủ công.",
      End: true,
    },
  },
};
