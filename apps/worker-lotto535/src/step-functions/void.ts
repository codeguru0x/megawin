/**
 * Lotto 5/35 Void Draw – Step Function Definition (ASL)
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
 *  │     Batch void: scheduled                │
 *  │     → entry.status = void, ghi voidInfo  │
 *  │     → update ticket voidSummary          │
 *  │     done = true khi hết voidable entries │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  3. SyncTicketSummaries │  Recompute ticket summaries from entries
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  4. DispatchRefunds (loop)               │
 *  │     Gửi refund qua TenantGateway API    │
 *  │     done = true khi hết pending refunds  │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  5. FinalizeVoid        │  Aggregate summary, ghi lên draw
 *  └─────────────────────────┘
 *
 * DATA FLOW:
 *   PrepareVoid → context (full PrepareVoidResult)
 *   Each step receives context directly via Arguments.
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Entries đã void/refund tự filter ra.
 *
 * REFUND LOGIC:
 *   - Multi-draw ticket: 1 kỳ void → partial refund (entry amount)
 *   - Single-draw ticket: kỳ duy nhất void → full refund, ticket status = refunded
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
  Comment: "Lotto 5/35 Void Draw Step Function – Huỷ kỳ quay (crash-safe)",
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
      Comment:
        "Batch void entries. Always queries voidable entries. Voided entries auto-excluded.",
      Arguments: "{% $states.input.context %}",
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
      Arguments: "{% $states.input.context %}",
      Output:
        "{% { 'context': $states.input.context, 'syncResult': $states.result } %}",
      Next: "DispatchRefunds",
      Retry: LAMBDA_RETRY,
    },

    DispatchRefunds: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:void-dispatch-refunds",
      Arguments: "{% $states.input.context %}",
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
      Arguments: "{% $states.input.context %}",
      End: true,
      Retry: LAMBDA_RETRY,
    },

    RefundFailed: {
      Type: "Pass",
      Comment:
        "Refund error – void vẫn hoàn tất, entries đã void. Admin retry refund thủ công.",
      End: true,
    },
  },
};
