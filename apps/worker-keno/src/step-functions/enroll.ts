/**
 * Keno Auto-Enroll – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW:
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId: "2026-02-24-001" }
 *         │
 *         ▼
 *  ┌─────────────────────────────────┐
 *  │  AutoEnrollEntries              │
 *  │  - fullyEnrolled = false        │
 *  │  - remainingDraws > 0           │
 *  │  - Batch 200, cursor-based      │
 *  └────────┬────────────────────────┘
 *           ▼
 *  ┌────────────────────────────┐
 *  │  EnrollComplete            │
 *  └────────────────────────────┘
 *
 * IDEMPOTENT: safe to retry.
 */

export const AUTO_ENROLL_STATE_MACHINE = {
  Comment: "Keno Auto-Enroll – Tự động tạo entries cho kỳ mới mở bán",
  StartAt: "AutoEnrollEntries",
  States: {
    AutoEnrollEntries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:enroll-auto-entries",
      Parameters: {
        "drawId.$": "$.drawId",
      },
      ResultPath: "$.enrollResult",
      Next: "EnrollComplete",
      Retry: [
        {
          ErrorEquals: ["States.TaskFailed"],
          IntervalSeconds: 10,
          MaxAttempts: 3,
          BackoffRate: 2.0,
        },
      ],
    },

    EnrollComplete: {
      Type: "Pass",
      End: true,
    },
  },
};
