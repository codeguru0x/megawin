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

export const VOID_STATE_MACHINE = {
  Comment: "Keno Void Draw Step Function – Huỷ kỳ quay (crash-safe, no jackpot)",
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
      Comment: "Batch void entries. Voided entries auto-excluded.",
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
      Comment: "Refund error – void hoàn tất, entries đã void. Admin retry thủ công.",
      End: true,
    },
  },
};
