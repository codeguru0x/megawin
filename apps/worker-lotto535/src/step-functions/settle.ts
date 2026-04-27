/**
 * Lotto 5/35 Settle – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId: "2026-02-24-001" }
 *         │
 *         ▼
 *  ┌─────────────────────────┐
 *  │  1. PrepareSettle       │  Load context (accepts "settling" status)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  2. SettleEntries (loop)                 │
 *  │     Filter: status = "scheduled"          │
 *  │     done = true khi 0 scheduled entries  │
 *  │     Jackpot tier: ghi hitCount, amount=0  │
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌────────────────────────────────────────────────────────────┐
 *  │  3. CalculateFinancials                                    │
 *  │     Tính từ DB: revenue, prizes, commission, JP contrib    │
 *  │     Output: financials (merge vào $settleCtx)              │
 *  └────────┬───────────────────────────────────────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────────────────────────────┐
 *  │  4. CheckPrizeRoute (Choice) — ROUTING dựa trên financials:     │
 *  │     ├─ hasJackpotWinner = true  → 4a. PatchJackpotPrize         │
 *  │     ├─ splitDetails tồn tại    → 4b. ApplySplitBonuses          │
 *  │     └─ default (kỳ thường)     → skip → SyncTicketSummaries     │
 *  └──────────────────────────────────────────────────────────────────┘
 *           │                │                │
 *           ▼                ▼                ▼
 *  ┌─────────────────┐ ┌──────────────────┐  │
 *  │ 4a. PatchJP     │ │ 4b. SplitBonus   │  │
 *  │ Patch entries   │ │ Patch entries    │  │
 *  │ + lines + stats │ │ (split per tier) │  │
 *  └────────┬────────┘ └────────┬─────────┘  │
 *           └───────────┬───────┘             │
 *                       ▼ ◄───────────────────┘
 *  ┌──────────────────────────────────────────┐
 *  │  5. SyncTicketSummaries (loop)           │  Recompute ticket summaries
 *  │     done = true khi hết tickets          │  (bao gồm JP/split đã patch)
 *  └────────┬─────────────────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  6. BuildSettleReport   │  Per-game financial reports (idempotent upsert)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  7. PublishSettleDaily  │  System daily reports (re-aggregate)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  7b. PublishPlayerDaily │  Player daily reports (re-aggregate per player)
 *  └────────┬────────────────┘
 *           ▼
 *  ┌─────────────────────────────────────────────────────────────┐
 *  │  8. FinalizeSettle                                          │
 *  │     ├─ Transition draw: settling → settled + JP snapshot    │
 *  │     ├─ hasJackpotWinner || splitExecuted → close cycle +    │
 *  │     │    ghi winners/splitDetail + create new cycle         │
 *  │     └─ Không → update cycle stats (tích luỹ)               │
 *  └────────┬────────────────────────────────────────────────────┘
 *           ▼
 *  ┌──────────────────────────────────────────┐
 *  │  9. EnqueueDispatchPayouts (outbox)      │
 *  │     Bulk insert tenant_dispatch_orders   │
 *  │     Worker tenant-dispatch gửi async     │
 *  └──────────────────────────────────────────┘
 *
 * DATA FLOW (single $settleCtx):
 *   $settleCtx = PrepareSettle result, enriched progressively.
 *   After CalculateFinancials: settleCtx.financials = result.
 *   All steps receive $settleCtx — destructure what they need.
 *
 * CRASH RECOVERY:
 *   Mỗi step idempotent. Step Function retry-safe.
 *
 * JACKPOT SOURCE OF TRUTH:
 *   Active draws: jackpot từ `lotto535_jackpot_cycles.currentAmount`
 *   Settled draws: snapshot jackpot ghi lúc finalize-settle
 *
 * JACKPOT PRIZE FLOW:
 *   SettleEntries ghi jackpot tier amount = 0 (chưa biết tiền JP chính xác).
 *   PatchJackpotPrize (step 4a) tính jackpotPerWinner và patch ngược vào
 *   entry.payout + line.matchResult.winAmount TRƯỚC SyncTicketSummaries.
 *   FinalizeSettle (step 8) ghi cycle close record + winners info.
 *
 * USAGE (chạy từ thư mục step-functions):
 *   npx tsx -e "import { SETTLE_STATE_MACHINE } from './settle'; console.log(JSON.stringify(SETTLE_STATE_MACHINE, null, 2))" > settle.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-lotto535";
const STAGE = "dev";

function lambdaArn(functionName: string): string {
  return `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${SERVICE}-${STAGE}-${functionName}:$LATEST`;
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

/**
 * Retry riêng cho state EnqueueDispatch* — chỉ retry lỗi transient của AWS
 * Lambda / Step Functions (throttle, service exception, SDK, timeout).
 * Không retry `States.ALL` ở tầng này để bug code / permission error không
 * bị nuốt — những lỗi đó rơi thẳng xuống Catch → EnqueueRetryWait.
 *
 * Inner: 10 attempt, 10→120s (cap), backoff 2, FULL jitter.
 * Ngoài Retry, Catch (States.ALL) chuyển sang EnqueueRetryWait (Wait 60s)
 * rồi vòng lại chính state enqueue — outer-loop retry không giới hạn.
 * Idempotent: bulkEnqueue dùng unique `tx`, gọi lại chỉ skip duplicate.
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

export const SETTLE_STATE_MACHINE = {
  Comment: "Lotto 5/35 Settle Step Function – Kết sổ kỳ quay (crash-safe)",
  QueryLanguage: "JSONata",
  StartAt: "PrepareSettle",
  States: {
    // ── STEP 1: Load context ──
    PrepareSettle: {
      Type: "Task",
      Resource: lambdaArn("settle-prepare"),
      Assign: { settleCtx: "{% $states.result %}" },
      Next: "SettleEntries",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 2: Settle entries (loop) ──
    SettleEntries: {
      Type: "Task",
      Resource: lambdaArn("settle-entries"),
      Arguments: "{% $settleCtx %}",
      Assign: { settleResult: "{% $states.result %}" },
      Next: "CheckSettleDone",
      Retry: LAMBDA_RETRY,
    },

    CheckSettleDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $settleResult.done %}",
          Next: "CalculateFinancials",
        },
      ],
      Default: "SettleEntries",
    },

    // ── STEP 3: Calculate financials ──
    CalculateFinancials: {
      Type: "Task",
      Resource: lambdaArn("settle-calculate-financials"),
      Arguments: "{% $settleCtx %}",
      Assign: {
        settleCtx: "{% $merge([$settleCtx, { 'financials': $states.result }]) %}",
      },
      Next: "CheckPrizeRoute",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 4: Route — quyết định bước tiếp theo dựa trên kết quả tài chính ──
    //
    // 3 nhánh mutually exclusive:
    //   ① hasJackpotWinner = true → PatchJackpotPrize (patch JP prize vào entries + lines)
    //   ② splitDetails tồn tại   → ApplySplitBonuses (patch split bonus vào entries)
    //   ③ default (kỳ thường)    → SyncTicketSummaries (không cần patch gì thêm)
    //
    // Lý do route ở đây thay vì để Lambda tự kiểm tra:
    //   - Không gọi Lambda thừa (kỳ thường 99% → skip cả 2)
    //   - Step Function log rõ nhánh nào chạy → dễ debug
    //   - Mỗi Lambda single responsibility, code đơn giản
    CheckPrizeRoute: {
      Type: "Choice",
      Choices: [
        {
          Comment: "Có jackpot winner → patch jackpot prize vào entries + lines",
          Condition: "{% $settleCtx.financials.hasJackpotWinner %}",
          Next: "PatchJackpotPrize",
        },
        {
          Comment: "Split cycle có winner tier1-tier5 → patch split bonus vào entries",
          Condition: "{% $settleCtx.financials.splitDetails != null %}",
          Next: "ApplySplitBonuses",
        },
      ],
      Default: "SyncTicketSummaries",
    },

    // ── STEP 4a: Patch Jackpot Prize ──
    // Chỉ chạy khi có JP winner. Tính jackpotPerWinner, patch vào entries + lines.
    // Merge winners vào settleCtx (top-level) để FinalizeSettle dùng — tránh re-query DB.
    PatchJackpotPrize: {
      Type: "Task",
      Resource: lambdaArn("settle-patch-jackpot-prize"),
      Arguments: "{% $settleCtx %}",
      Assign: {
        settleCtx: "{% $merge([$settleCtx, { 'jackpotWinners': $states.result.winners }]) %}",
      },
      Next: "SyncTicketSummaries",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 4b: Apply Split Bonuses ──
    // Chỉ chạy khi split cycle có winner. Patch bonusPerWinner vào entries.
    ApplySplitBonuses: {
      Type: "Task",
      Resource: lambdaArn("settle-apply-split-bonuses"),
      Arguments: "{% $settleCtx %}",
      Next: "SyncTicketSummaries",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 5: Sync ticket summaries (loop) ──
    SyncTicketSummaries: {
      Type: "Task",
      Resource: lambdaArn("settle-sync-ticket-summaries"),
      Arguments: "{% $settleCtx %}",
      Assign: { syncResult: "{% $states.result %}" },
      Next: "CheckSyncDone",
      Retry: LAMBDA_RETRY,
    },

    CheckSyncDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $syncResult.done %}",
          Next: "BuildSettleReport",
        },
      ],
      Default: "SyncTicketSummaries",
    },

    // ── STEP 6: Build settle report (per-game financial reports) ──
    // Aggregate entries → upsert lotto535_settle_draw_reports + lotto535_settle_tenant_reports.
    // IDEMPOTENT: upsert overwrite — crash-safe, retry an toàn.
    BuildSettleReport: {
      Type: "Task",
      Resource: lambdaArn("settle-build-settle-report"),
      Arguments: "{% $settleCtx %}",
      Next: "PublishSettleDaily",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 7: Publish settle daily (system-level reports) ──
    // Re-aggregate lotto535_settle_draw/tenant_reports → upsert system_settle_game/tenant_daily.
    // IDEMPOTENT: overwrite toàn bộ — chạy lại cho kết quả giống nhau.
    PublishSettleDaily: {
      Type: "Task",
      Resource: lambdaArn("settle-publish-settle-daily"),
      Arguments: "{% $settleCtx %}",
      Next: "PublishPlayerDaily",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 7b: Publish player daily (player-level reports) ──
    // Aggregate lotto535_ticket_entries WHERE { financialDate, status ∈ [settled, void] }
    // → group by { tenantId, accountId } → delete cũ + bulk upsert player_settle_game_daily.
    // IDEMPOTENT: delete + overwrite toàn bộ — chạy lại cho kết quả giống nhau.
    PublishPlayerDaily: {
      Type: "Task",
      Resource: lambdaArn("settle-publish-player-daily"),
      Arguments: "{% $settleCtx %}",
      Next: "FinalizeSettle",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 8: Finalize settle ──
    FinalizeSettle: {
      Type: "Task",
      Resource: lambdaArn("settle-finalize"),
      Arguments: "{% $settleCtx %}",
      Next: "EnqueueDispatchPayouts",
      Retry: LAMBDA_RETRY,
    },

    // ── STEP 9: Enqueue dispatch payouts (outbox) ──
    // Bulk insert winning entries vào `tenant_dispatch_orders` — idempotent qua `payoutTx`.
    // Dispatch thực tế sang tenant do `worker-tenant-dispatch` chạy async (EventBridge 1 phút).
    EnqueueDispatchPayouts: {
      Type: "Task",
      Resource: lambdaArn("settle-enqueue-dispatch-payouts"),
      Arguments: "{% $settleCtx %}",
      Assign: { enqueueResult: "{% $states.result %}" },
      Next: "CheckEnqueueDone",
      Retry: ENQUEUE_RETRY,
      Catch: [
        {
          ErrorEquals: ["States.ALL"],
          Next: "EnqueueRetryWait",
        },
      ],
    },

    // Loop cho đến khi use-case trả done=true (đã enqueue hết winners).
    CheckEnqueueDone: {
      Type: "Choice",
      Choices: [
        {
          Condition: "{% $enqueueResult.done %}",
          Next: "SettleSucceeded",
        },
      ],
      Default: "EnqueueDispatchPayouts",
    },

    SettleSucceeded: {
      Type: "Succeed",
    },

    // Outer-loop retry: sau khi inner Retry (10 lần, 10→120s) vẫn fail,
    // Wait 60s rồi vòng lại EnqueueDispatchPayouts. Không giới hạn số vòng —
    // chạy đến khi thành công. Idempotent nhờ unique `tx` tại tenant_dispatch_orders.
    EnqueueRetryWait: {
      Type: "Wait",
      Seconds: 60,
      Next: "EnqueueDispatchPayouts",
    },
  },
};
