/**
 * Max 3D Pro Resettle – Step Function Definition (ASL)
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
 *   layer — đúng nguyên tắc, SFN orchestration đơn giản.
 * - KHÔNG có Wait state chờ reversal Dispatched giữa Step 2 và 3. Tin tưởng
 *   outbox FIFO per tenant đảm bảo Reversal (createdAt T0) đi trước Payout
 *   (createdAt T1>T0, enqueue trong nested Settle SFN).
 * - SFN dùng default state input passthrough ($states.input giữa các Lambda
 *   Task). KHÔNG dùng `Arguments` mapping nếu input shape match exactly.
 * - Convention naming batchKey centralize hoàn toàn ở use case (Lambda) —
 *   KHÔNG build ở SFN ASL JSONata để giữ type-safety.
 *
 * USAGE: chạy `./generate-asl.sh` để re-generate `resettle.asl.json`.
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-max3dpro";
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
  Comment: "Max 3D Pro Resettle Step Function – Kết sổ lại kỳ quay (crash-safe)",
  QueryLanguage: "JSONata",
  StartAt: "PrepareResettle",
  States: {
    PrepareResettle: {
      Type: "Task",
      Resource: lambdaArn("resettle-prepare"),
      Next: "EnqueueReversals",
      Retry: LAMBDA_RETRY,
    },

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
