/**
 * Keno Resettle – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId, resettleId, lockOwnerToken, lockKey }
 *         │ (BO API đã transition Published → Settling, sinh resettleId,
 *         │  build lockKey qua buildResettleLockKey helper)
 *         ▼
 *  ┌──────────────────────────────┐
 *  │  1. PrepareResettle          │  • Validate draw status = Settling.
 *  │     (Lambda Task)            │  • clearReversalSnapshot phiên cũ.
 *  │                              │  • bulkSetReversal cho entries có
 *  │                              │    payoutAmount > 0.
 *  │                              │  • resetEntriesForResettle Settled→Scheduled.
 *  │                              │  → output: { drawId, resettleId,
 *  │                              │     lockOwnerToken, lockKey }
 *  └────────┬─────────────────────┘
 *           ▼
 *  ┌──────────────────────────────┐
 *  │  2. EnqueueReversals         │  Chạy HẾT entries trong 1 invocation:
 *  │     (Lambda Task)            │  cursor pagination batch 500,
 *  │                              │  buildReversalOrder + bulkEnqueue outbox.
 *  │                              │  No-op nếu reversalCount=0 (use case tự
 *  │                              │  break ngay khi query đầu trả 0 docs).
 *  │                              │  KHÔNG có app-level time cap; Lambda
 *  │                              │  timeout là defense.
 *  │                              │  Retry transient errors qua ENQUEUE_RETRY
 *  │                              │  (10 lần, jitter). Catch fallback: Wait
 *  │                              │  60s → retry full (idempotent qua outbox
 *  │                              │  unique `tx`).
 *  │                              │  → output: { drawId, resettleId,
 *  │                              │     lockOwnerToken, lockKey } (echo input).
 *  └────────┬─────────────────────┘
 *           ▼
 *  ┌──────────────────────────────┐
 *  │  3. StartSettleExecution     │  Nested Settle SFN sync:2 với
 *  │     (Task .sync:2)           │  resettleContext propagate (resettleId,
 *  │                              │  lockOwnerToken, lockKey). batchKey nested
 *  │                              │  Settle SFN's use case tự derive từ
 *  │                              │  drawId + resettleId.
 *  └────────┬─────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  ResettleSucceeded      │
 *  └─────────────────────────┘
 *
 * KEY INVARIANTS:
 * - `resettleId` sinh tại BO API, propagate xuyên suốt SFN — KHÔNG sinh ở
 *   Lambda để retry/replay idempotent.
 * - `EnqueueReversals` chạy 1 lần duy nhất tới khi hết entries (không self-loop
 *   qua Choice). Refactor này thay thế pattern cũ với `CheckEnqueueDone` —
 *   timeout/crash do SFN/Lambda timeout policy xử lý, retry full idempotent.
 * - KHÔNG có Choice `CheckHasReversals` bypass cho `reversalCount = 0`. Use
 *   case tự handle empty case (1 query trả 0 docs → break) ở application
 *   layer — đúng nguyên tắc, SFN orchestration đơn giản. Edge case rất hiếm
 *   với Keno (gần như luôn có winner mỗi kỳ); cost 1 Lambda invocation no-op
 *   không đáng để thêm Choice state.
 * - KHÔNG có Wait state chờ reversal Dispatched giữa Step 2 và 3. Tin tưởng
 *   outbox FIFO per tenant đảm bảo Reversal (createdAt T0) đi trước Payout
 *   (createdAt T1>T0, enqueue trong nested Settle SFN).
 * - SFN dùng default state input passthrough ($states.input giữa các Lambda
 *   Task). KHÔNG dùng `Arguments` mapping nếu input shape match exactly,
 *   KHÔNG dùng `Assign` cho ctx propagation. Output mỗi Lambda được forward
 *   trực tiếp làm input cho step kế. Đơn giản, ít chỗ sai.
 * - Convention naming batchKey centralize hoàn toàn ở use case (Lambda) —
 *   KHÔNG build ở SFN ASL JSONata để giữ type-safety. `EnqueueReversals` tự
 *   build `reversalBatchKey`, `EnqueueDispatchPayouts` (nested Settle SFN)
 *   tự derive `payoutBatchKey` từ `drawId + resettleId`. SFN ASL không động
 *   tới convention naming.
 *
 * USAGE (chạy từ thư mục step-functions):
 *   npx tsx -e "import { RESETTLE_STATE_MACHINE } from './resettle'; console.log(JSON.stringify(RESETTLE_STATE_MACHINE, null, 2))" > resettle.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-keno";
const STAGE = "dev";

function lambdaArn(functionName: string): string {
  return `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${SERVICE}-${STAGE}-${functionName}:$LATEST`;
}

const SETTLE_SFN_ARN = `arn:aws:states:${REGION}:${ACCOUNT_ID}:stateMachine:${SERVICE}-${STAGE}-settle`;

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
 * Retry riêng cho EnqueueReversals — cùng pattern settle.ts ENQUEUE_RETRY.
 * EnqueueReversals chạy hết entries trong 1 invocation (cursor pagination
 * batch 500). Retry chỉ phục vụ transient errors (Lambda 5xx, throttling,
 * timeout). Outer-loop qua Catch + Wait 60s rồi retry full — idempotent
 * tuyệt đối qua outbox unique index `tx`.
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

export const RESETTLE_STATE_MACHINE = {
  Comment: "Keno Resettle Step Function – Kết sổ lại kỳ quay (crash-safe)",
  QueryLanguage: "JSONata",
  StartAt: "PrepareResettle",
  States: {
    // Input shape match `PrepareResettleInput` exactly → dùng default
    // passthrough, không cần `Arguments` mapping.
    PrepareResettle: {
      Type: "Task",
      Resource: lambdaArn("resettle-prepare"),
      Next: "EnqueueReversals",
      Retry: LAMBDA_RETRY,
    },

    // Output `PrepareResettle` đã là `EnqueueReversalsInput` shape → default
    // passthrough. Output `EnqueueReversals` cũng giữ shape `{ drawId,
    // resettleId, lockOwnerToken }` → forward thẳng cho `StartSettleExecution`.
    EnqueueReversals: {
      Type: "Task",
      Resource: lambdaArn("resettle-enqueue-reversals"),
      Next: "StartSettleExecution",
      Retry: ENQUEUE_RETRY,
      Catch: [
        {
          ErrorEquals: ["States.ALL"],
          Next: "EnqueueRetryWait",
        },
      ],
    },

    EnqueueRetryWait: {
      Type: "Wait",
      Seconds: 60,
      Next: "EnqueueReversals",
    },

    // `resettleContext` build trực tiếp từ `$states.input` — KHÔNG cần
    // pre-build `payoutBatchKey` vì `EnqueueDispatchPayoutsUseCase` của nested
    // Settle SFN tự derive từ `drawId + resettleId` (xem JSDoc
    // `ResettleContext`). Convention naming centralize hoàn toàn ở use case
    // TS, SFN ASL chỉ pass-through context tối thiểu.
    StartSettleExecution: {
      Type: "Task",
      Resource: "arn:aws:states:::states:startExecution.sync:2",
      Arguments: {
        StateMachineArn: SETTLE_SFN_ARN,
        Input: {
          drawId: "{% $states.input.drawId %}",
          resettleContext: {
            resettleId: "{% $states.input.resettleId %}",
            lockOwnerToken: "{% $states.input.lockOwnerToken %}",
            lockKey: "{% $states.input.lockKey %}",
          },
        },
      },
      Next: "ResettleSucceeded",
      Retry: LAMBDA_RETRY,
    },

    ResettleSucceeded: {
      Type: "Succeed",
    },
  },
};
