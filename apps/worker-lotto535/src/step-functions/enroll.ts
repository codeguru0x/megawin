/**
 * Lotto 5/35 Auto-Enroll – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW:
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId: "2026-02-24-001" }
 *         │
 *         ▼
 *  ┌─────────────────────────────────┐
 *  │  AutoEnrollEntries              │  Scan tickets multi-draw
 *  │  - fullyEnrolled = false        │  chưa enroll hết
 *  │  - remainingDraws > 0           │
 *  │  - Batch 200, cursor-based      │
 *  └────────┬────────────────────────┘
 *           ▼
 *  ┌────────────────────────────┐
 *  │  EnrollComplete            │
 *  └────────────────────────────┘
 *
 * IDEMPOTENT:
 *   - Ticket enroll: atomic $ne guard → skip nếu đã enroll
 *   - Entry insert: unique index (ticketId, drawId) → duplicate key → skip
 *   - Toàn bộ step function có thể retry an toàn
 *
 * USAGE (chạy từ thư mục step-functions):
 *   npx tsx -e "import { AUTO_ENROLL_STATE_MACHINE } from './enroll'; console.log(JSON.stringify(AUTO_ENROLL_STATE_MACHINE, null, 2))" > enroll.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-lotto535";
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

export const AUTO_ENROLL_STATE_MACHINE = {
  Comment: "Lotto 5/35 Auto-Enroll – Tự động tạo entries cho kỳ mới mở bán",
  QueryLanguage: "JSONata",
  StartAt: "AutoEnrollEntries",
  States: {
    AutoEnrollEntries: {
      Type: "Task",
      Resource: lambdaArn("enroll-auto-entries"),
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
