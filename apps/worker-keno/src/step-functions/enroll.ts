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

export const AUTO_ENROLL_STATE_MACHINE = {
  Comment: "Keno Auto-Enroll – Tự động tạo entries cho kỳ mới mở bán",
  QueryLanguage: "JSONata",
  StartAt: "AutoEnrollEntries",
  States: {
    AutoEnrollEntries: {
      Type: "Task",
      Resource: "arn:aws:lambda:REGION:ACCOUNT:function:enroll-auto-entries",
      Arguments: {
        drawId: "{% $states.input.drawId %}",
      },
      Output: "{% $states.result %}",
      Next: "EnrollComplete",
      Retry: LAMBDA_RETRY,
    },

    EnrollComplete: {
      Type: "Pass",
      End: true,
    },
  },
};
