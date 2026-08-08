/**
 * Lotto 5/35 Resettle – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: {
 *    drawId, resettleId, lockOwnerToken, lockKey,
 *    resettleContext: {
 *      resettleId, scenario, openingJp, cycleContributionBefore,
 *      cycleDrawCountBefore, skipCycleUpdate, cascadeOpeningUpdate,
 *      isSplitCycleAtSettle, didSplit
 *    }
 *  }
 *  (BO API đã: publish result mới, transition Published→Settling,
 *   sinh resettleId, build resettleContext từ ledger, acquire lock)
 *         │
 *         ▼
 *  ┌──────────────────────────────┐
 *  │  1. PrepareResettle          │  • Validate draw = Settling.
 *  │     (Lambda Task)            │  • clearReversalSnapshot phiên cũ.
 *  │                              │  • bulkSetReversal entries có payout > 0.
 *  │                              │  • deleteByDrawId (wipe lines) trước re-settle
 *  │                              │    ($setOnInsert không ghi đè matchResult).
 *  │                              │  • resetEntries Settled→Scheduled.
 *  │                              │  → output: { drawId, resettleId,
 *  │                              │     lockOwnerToken, lockKey }
 *  └────────┬─────────────────────┘
 *           ▼
 *  ┌──────────────────────────────┐
 *  │  2. EnqueueReversals         │  Cursor-paginate entries có reversal,
 *  │     (Lambda Task)            │  build + bulk insert debit orders vào outbox.
 *  │                              │  No-op nếu không có entry nào có payout.
 *  │                              │  ENQUEUE_RETRY + Catch → Wait 60s.
 *  │                              │  → output: { drawId, resettleId,
 *  │                              │     lockOwnerToken, lockKey }
 *  └────────┬─────────────────────┘
 *           ▼
 *  ┌──────────────────────────────┐
 *  │  3. StartSettleExecution     │  Nested Settle SFN sync:2.
 *  │     (Task .sync:2)           │  Pass resettleContext (đọc từ state var
 *  │                              │  $resettleContext, snapshot tại PrepareResettle)
 *  │                              │  vào settle input → PrepareSettle đọc
 *  │                              │  openingJp từ resettleContext thay vì
 *  │                              │  activeCycle → FinalizeSettle dùng
 *  │                              │  skipCycleUpdate + isSplitCycleAtSettle để
 *  │                              │  quyết định update cycle và apply split.
 *  └────────┬─────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  ResettleSucceeded      │
 *  └─────────────────────────┘
 *
 * KEY DIFFERENCES vs Mega 6/45 Resettle:
 *   - Lotto 5/35 là SINGLE JACKPOT nhưng có thêm **Split Cycle** —
 *     khi drawNo===Evening && ledger(T).opening >= splitThreshold &&
 *     !hasNewJpWinner → jackpot tích lũy split xuống giải thường thay
 *     vì tiếp tục tăng (theo thể lệ Vietlott Lotto 5/35).
 *   - `resettleContext` chứa thêm `isSplitCycleAtSettle` + `didSplit`
 *     (ngoài `openingJp`, `cycleContributionBefore`, `cascadeOpeningUpdate`).
 *   - `FinalizeSettle` đọc `isSplitCycleAtSettle` để apply split bonus
 *     và `skipCycleUpdate` để bỏ qua updateCycle khi TYPE_B1/B2.
 *   - `PrepareResettle` thêm bước `deleteByDrawId` để wipe lines cũ
 *     trước khi re-expand — `$setOnInsert` không ghi đè matchResult.
 *
 * SCENARIO DETECTION:
 *   jpOrSplitAffected = hasNewJpWinner || hadOldJpWinner || newWouldSplit || hadOldSplit
 *   TYPE_B2: (jpOrSplitAffected && chainLength>0) || chainHasWinnerOrSplit
 *   TYPE_B1: jpOrSplitAffected && chainLength===0
 *   TYPE_A : ngược lại (jp/split không thay đổi, chain sạch)
 *
 * KEY INVARIANTS:
 *   - resettleId sinh tại BO API, propagate xuyên SFN.
 *   - EnqueueReversals chạy 1 lần tới khi hết entries (không self-loop).
 *   - KHÔNG Wait giữa EnqueueReversals và StartSettleExecution — tin outbox FIFO.
 *   - resettleContext snapshot vào state var `$resettleContext` tại PrepareResettle.
 *     JSONata mode không passthrough input (output Task = Lambda result), nên phải
 *     Assign để giữ resettleContext xuyên suốt — StartSettleExecution đọc lại.
 *
 * USAGE: npx tsx -e "import { RESETTLE_STATE_MACHINE } from './resettle'; console.log(JSON.stringify(RESETTLE_STATE_MACHINE, null, 2))" > resettle.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-lotto535";
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
 * Retry riêng cho EnqueueReversals — transient errors chỉ.
 * Outer-loop: Catch (States.ALL) → Wait 60s → retry full.
 * Idempotent tuyệt đối qua outbox unique index `tx`.
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
  Comment: "Lotto 5/35 Resettle Step Function – Kết sổ lại kỳ quay (crash-safe, single JP + Split Cycle)",
  QueryLanguage: "JSONata",
  StartAt: "PrepareResettle",
  States: {
    // Snapshot `resettleContext` từ SFN input gốc vào state variable `$resettleContext`.
    // JSONata mode KHÔNG passthrough input — output mỗi Task = Lambda result, ghi đè
    // `$states.input`. PrepareResettle/EnqueueReversals chỉ trả { drawId, resettleId,
    // lockOwnerToken, lockKey } → `resettleContext` (openingJp, scenario,
    // skipCycleUpdate, cascadeOpeningUpdate, isSplitCycleAtSettle, didSplit…) sẽ MẤT
    // ở các step sau nếu không Assign. State variable persist xuyên suốt execution →
    // StartSettleExecution đọc lại.
    PrepareResettle: {
      Type: "Task",
      Resource: lambdaArn("resettle-prepare"),
      Assign: { resettleContext: "{% $states.input.resettleContext %}" },
      Next: "EnqueueReversals",
      Retry: LAMBDA_RETRY,
    },

    EnqueueReversals: {
      Type: "Task",
      Resource: lambdaArn("resettle-enqueue-reversals"),
      Next: "StartSettleExecution",
      Retry: ENQUEUE_RETRY,
      Catch: [{ ErrorEquals: ["States.ALL"], Next: "EnqueueRetryWait" }],
    },

    EnqueueRetryWait: {
      Type: "Wait",
      Seconds: 60,
      Next: "EnqueueReversals",
    },

    // Nested Settle SFN (sync:2) nhận:
    // - drawId: kỳ cần re-settle.
    // - resettleContext: đọc từ state variable `$resettleContext` (snapshot tại
    //   PrepareResettle) — KHÔNG đọc `$states.input.resettleContext` vì output
    //   EnqueueReversals đã ghi đè input, mất `resettleContext`. PrepareSettle đọc
    //   openingJp; FinalizeSettle đọc skipCycleUpdate + isSplitCycleAtSettle + didSplit.
    // Lock release xảy ra TRONG nested Settle SFN (FinalizeSettle dùng lockOwnerToken).
    StartSettleExecution: {
      Type: "Task",
      Resource: "arn:aws:states:::states:startExecution.sync:2",
      Arguments: {
        StateMachineArn: SETTLE_SFN_ARN,
        Input: {
          drawId: "{% $states.input.drawId %}",
          resettleContext: "{% $resettleContext %}",
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
