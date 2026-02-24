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
 *  │     Batch void: scheduled/active/drawn   │
 *  │     → entry.status = void, ghi voidInfo  │
 *  │     → update ticket voidSummary          │
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
 *  │  4. FinalizeVoid        │  Aggregate summary, ghi lên draw
 *  └─────────────────────────┘
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Entries đã void/refund tự filter ra.
 *
 * REFUND LOGIC:
 *   - Multi-draw ticket: 1 kỳ void → partial refund (entry amount)
 *   - Single-draw ticket: kỳ duy nhất void → full refund, ticket status = refunded
 */

export const VOID_STATE_MACHINE = {
  Comment: "Lotto 5/35 Void Draw Step Function – Huỷ kỳ quay (crash-safe)",
  StartAt: "PrepareVoid",
  States: {
    PrepareVoid: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:void-prepare",
      ResultPath: "$.context",
      Next: "VoidEntries",
    },

    VoidEntries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:void-entries",
      Comment:
        "Batch void entries. Always queries voidable entries. Voided entries auto-excluded.",
      Parameters: {
        "drawId.$": "$.context.drawId",
        "reason.$": "$.context.reason",
        "voidedBy.$": "$.context.voidedBy",
      },
      ResultPath: "$.voidResult",
      Next: "CheckVoidDone",
    },

    CheckVoidDone: {
      Type: "Choice",
      Choices: [
        {
          Variable: "$.voidResult.done",
          BooleanEquals: true,
          Next: "DispatchRefunds",
        },
      ],
      Default: "VoidEntries",
    },

    DispatchRefunds: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:void-dispatch-refunds",
      Parameters: {
        "drawId.$": "$.context.drawId",
      },
      ResultPath: "$.refundResult",
      Next: "CheckRefundDone",
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
          Variable: "$.refundResult.done",
          BooleanEquals: true,
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
      Parameters: {
        "drawId.$": "$.context.drawId",
      },
      ResultPath: "$.finalizeResult",
      End: true,
    },

    RefundFailed: {
      Type: "Pass",
      Comment:
        "Refund error – void vẫn hoàn tất, entries đã void. Admin retry refund thủ công.",
      End: true,
    },
  },
};
