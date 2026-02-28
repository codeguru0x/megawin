/**
 * Keno Void Draw – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId: "...", reason: "...", voidedBy?: "..." }
 *         │
 *         ▼
 *  ┌─────────────────────────┐
 *  │  1. PrepareVoid         │  Validate draw, transition → void
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  2. VoidEntries (loop)                   │
 *  │     Batch void: scheduled/active/drawn   │
 *  │     done = true khi hết voidable entries │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  3. DispatchRefunds (loop)               │
 *  │     Gửi refund qua TenantGateway API    │
 *  │     done = true khi hết pending refunds  │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  4. FinalizeVoid        │  Ghi summary lên draw
 *  └─────────────────────────┘
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Entries đã void/refund tự filter ra.
 *
 * Keno KHÔNG có Jackpot → không cần rollback jackpot chain.
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

export const VOID_STATE_MACHINE = {
  Comment:
    "Keno Void Draw Step Function – Huỷ kỳ quay (crash-safe, no jackpot)",
  QueryLanguage: "JSONata",
  StartAt: "PrepareVoid",
  States: {
    PrepareVoid: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:void-prepare",
      Output: "{% { 'context': $states.result } %}",
      Next: "VoidEntries",
      Retry: LAMBDA_RETRY,
    },

    VoidEntries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:void-entries",
      Comment: "Batch void entries. Voided entries auto-excluded.",
      Arguments: {
        drawId: "{% $states.input.context.drawId %}",
        reason: "{% $states.input.context.reason %}",
        voidedBy: "{% $states.input.context.voidedBy %}",
      },
      Output:
        "{% { 'context': $states.input.context, 'voidResult': $states.result } %}",
      Next: "CheckVoidDone",
      Retry: LAMBDA_RETRY,
    },

    CheckVoidDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $states.input.voidResult.done %}",
          Next: "SyncTicketSummaries",
        },
      ],
      Default: "VoidEntries",
    },

    SyncTicketSummaries: {
      Type: "Task",
      Resource:
        "arn:aws:lambda:REGION:ACCOUNT:function:void-sync-ticket-summaries",
      Arguments: {
        drawId: "{% $states.input.context.drawId %}",
      },
      Output:
        "{% { 'context': $states.input.context, 'syncResult': $states.result } %}",
      Next: "DispatchRefunds",
      Retry: LAMBDA_RETRY,
    },

    DispatchRefunds: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:void-dispatch-refunds",
      Arguments: {
        drawId: "{% $states.input.context.drawId %}",
      },
      Output:
        "{% { 'context': $states.input.context, 'refundResult': $states.result } %}",
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
          Condition: "{% $states.input.refundResult.done %}",
          Next: "FinalizeVoid",
        },
      ],
      Default: "RefundWait",
    },

    RefundWait: {
      Type: "Wait",
      Seconds: 5,
      Next: "DispatchRefunds",
    },

    FinalizeVoid: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:void-finalize",
      Arguments: {
        drawId: "{% $states.input.context.drawId %}",
      },
      End: true,
      Retry: LAMBDA_RETRY,
    },

    RefundFailed: {
      Type: "Pass",
      Comment:
        "Refund error – void hoàn tất, entries đã void. Admin retry thủ công.",
      End: true,
    },
  },
};
