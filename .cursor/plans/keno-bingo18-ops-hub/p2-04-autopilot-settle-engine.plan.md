# p2-04 — Rule engine + worker Auto-Pilot kết sổ (giai đoạn 4)

> **Phase:** P2 · **Status:** ⏳ pending · **Phụ thuộc:** p2-01 · **Chặn:** p2-05
> **Đây là plan nguy hiểm nhất của toàn initiative** — máy tự tác động tiền thật
> **Nguồn:** [`keno-bingo18-autopilot-eve-feasibility.analysis.md`](../../analysis/keno-bingo18-autopilot-eve-feasibility.analysis.md) §3.2
> **Đổi số 06/09/2026:** file này TRƯỚC là `p2-02-autosettle-engine-worker.plan.md` (giai đoạn duy
> nhất của Auto-Pilot lúc đó). Sau khi mở rộng sang 4 giai đoạn (mở/đóng bán/nhận kết quả/kết sổ —
> xem [`p2-01-autopilot-config.plan.md`](./p2-01-autopilot-config.plan.md) §0), plan này chỉ còn phụ
> trách **giai đoạn 4 — kết sổ**. Lúc đổi số, nội dung kỹ thuật giữ nguyên (chỉ đổi tham chiếu chéo) —
> nhưng đã bị viết lại ở lần sửa 07/09 bên dưới. `p2-02` (mở/đóng bán) và `p2-03` (nhận kết quả) là 2
> plan MỚI, độc lập, không phải phần mở rộng của file này.
>
> **Sửa lớn 07/09/2026 — rule engine viết lại:** khảo sát code phát hiện bản trước đọc
> `draw.financial`/`draw.stats` làm điều kiện pre-settle, nhưng 2 field đó là **OUTPUT của settle**
> (`CalculateFinancialsUseCase` ghi) nên luôn `undefined` tại thời điểm đánh giá — mọi so sánh cho
> `false`, Auto-Pilot im lặng không làm gì. Nguồn đúng là `keno_draw_betting_stats`. Kéo theo: `metrics`
> mở rộng thành `AutoSettleMetrics` (8 field), `AutoSettleSkipReason` thêm 5 lý do / bỏ 1, mốc thời gian
> đổi sang `max(closeAt, publishedAt)`, dry-run 1 → 2 tuần. Chi tiết lập luận ở
> [`p2-01`](./p2-01-autopilot-config.plan.md) §3.4.
>
> **Sửa lớn 07/09/2026 — LẦN 2, nguồn số liệu đổi sang "kết sổ thử":** kỳ đã `Published` ⇒ đã có 20 số
> trúng, và Keno 100% giải cố định ⇒ **tính được CHÍNH XÁC số tiền phải trả**, không cần proxy. Rule
> engine giờ đọc `keno_settle_previews` (engine tính: [`p2-04b`](./p2-04b-settle-preview-engine.plan.md),
> hàm tính dùng chung với settle thật: [`p2-04a`](./p2-04a-settle-payout-extract.plan.md)) —
> **KHÔNG** còn đọc `keno_draw_betting_stats`. Kéo theo:
> - `AutoSettleMetrics` thay toàn bộ 8 field → số tiền thật (`payoutRatio`, `totalPayout`, `netProfit`…).
> - `AutoSettleSkipReason` bỏ 4 lý do exposure/stats, thêm `PreviewIncomplete`,
>   `PreviewStaleResult`, `PreviewMismatchDetected`, `NetProfitTooLow`, `CapTriggered`.
> - Dry-run 2 tuần → **backfill 30 ngày + dry-run 3 ngày** (số thật đối chiếu ngược quá khứ được).
> - Thêm **kill switch tự động** khi preview lệch settle thật (`verification.delta !== 0`).
>
> **Thứ tự làm:** `p2-04a` → `p2-04b` → `p2-04` (file này). Không đảo.
>
> **Ranh giới không đổi:** giai đoạn 4 **CHỈ** kết sổ kỳ đã `Published` — không tự publish kết quả
> (đó là `p2-03`), không tự void/resettle (§0.1 của `p2-01` — vĩnh viễn thủ công).

## 1. Kiến trúc: 1 caller mới, KHÔNG pipeline mới

> *"Monitor page = con người chọn kỳ rồi bấm bulk-settle; Auto-Pilot = rule engine chọn kỳ rồi tự bấm
> bulk-settle."* — §3.2 analysis

```
EventBridge cron (mỗi N phút)
   ↓
Lambda worker-keno: autoSettleHandler
   ↓
EvaluateAutoSettleEligibilityUseCase  ← deterministic, thuần rule, KHÔNG mutation
   ↓ (danh sách drawId đủ điều kiện + lý do loại của kỳ không đủ)
Ghi log quyết định (p2-05)
   ↓ (CHỈ khi config.enabled === true)
BulkTriggerSettleUseCase  ← ĐÚNG use-case của p0-04, không phải bản riêng
```

**Tuyệt đối không** viết đường settle riêng cho Auto-Pilot. Nó gọi **cùng** `BulkTriggerSettleUseCase`
mà staff bấm tay → giữ nguyên cả 3 lớp chống double-trigger, cùng audit, cùng cap concurrency. Một
đường settle thứ hai là một tập bug thứ hai.

## 2. `EvaluateAutoSettleEligibilityUseCase` — tách đánh giá khỏi hành động

**File:** `packages/game-keno-application/src/use-cases/operations/evaluate-auto-settle-eligibility.ts`

```typescript
/**
 * Đánh giá kỳ nào đủ điều kiện auto-settle — THUẦN RULE, KHÔNG mutation, KHÔNG gọi settle.
 *
 * Tách khỏi hành động settle là quyết định thiết kế cốt lõi: use-case này chạy được ở chế độ
 * dry-run (config.enabled = false) để quan sát "nếu bật thì máy làm gì" mà KHÔNG tác động
 * gì. Không có chế độ dry-run thì không có cách nào kiểm chứng rule trước khi giao quyền.
 *
 * DETERMINISTIC: cùng input (rows + config + thời điểm) → cùng output, mọi lần. KHÔNG dùng
 * LLM, KHÔNG random, KHÔNG phụ thuộc thứ tự duyệt. Đây là code tài chính.
 *
 * NGUỒN DỮ LIỆU (sửa 07/09/2026 LẦN 2): đọc `keno_settle_previews` — số tiền phải trả tính
 * CHÍNH XÁC từ kết quả đã publish, bằng cùng công thức settle thật dùng (`p2-04b`).
 *
 * **KHÔNG** đọc `draw.financial`/`draw.stats` (OUTPUT của settle, luôn `undefined` tại đây —
 * `p2-01` §3.4.0). **KHÔNG** đọc `keno_draw_betting_stats` (proxy worst-case, không phải số
 * thật — `p2-01` §3.4.2). Đây là 2 nguồn đã bị loại qua 2 lần sửa; đừng quay lại chúng.
 *
 * ⚠️ ĐIỀU KIỆN PHẢI KIỂM TRƯỚC MỌI NGƯỠNG: `preview.complete === true`. Số dở dang luôn NHỎ
 * HƠN số thật ⇒ mọi trần tiền đều "đạt" giả tạo ⇒ fail-open. Xem `AutoSettleSkipReason.PreviewIncomplete`.
 *
 * Hub UI (`p0-03`) và rule engine phải nhìn CÙNG tập số liệu — nếu khác, staff và máy quyết
 * định trên 2 sự thật khác nhau. **Verify khi code:** snapshot DTO của `p0-03` có expose
 * `preview.financials` chưa? Thiếu thì mở rộng DTO đó, KHÔNG thêm query riêng cho worker.
 *
 * EXPOSURE PHẢI CAP: giá trị trong stats doc là RAW. Gọi
 * `capExposureByPlayType(raw, config.payoutCaps)` (`game-keno/src/rules/max-prize.ts`) trước
 * khi so ngưỡng — đúng như `evaluate-alerts.ts:92` và `get-ops-snapshot.ts:83` đang làm. Đọc
 * RAW trực tiếp cho số phóng đại nhiều lần.
 */
export class EvaluateAutoSettleEligibilityUseCase extends UseCase<
  EvaluateAutoSettleInput,
  AutoSettleEvaluation
> {
```

Output:

```typescript
/** Kết quả đánh giá 1 lần chạy — đủ để log và để UI giải thích. */
export interface AutoSettleEvaluation {
  /** Kỳ đủ MỌI điều kiện, sort `drawId` TĂNG (kỳ cũ trước — xử lý backlog theo thứ tự). */
  eligible: AutoSettleDecision[];
  /** Kỳ KHÔNG đủ, kèm lý do cụ thể để hiện badge "Auto-Pilot bỏ qua: {reason}". */
  skipped: AutoSettleDecision[];
  /** Snapshot ngưỡng đã dùng — log lại để tra "lúc đó ngưỡng là bao nhiêu". */
  configSnapshot: OpsAutoSettleConfig;
  /** Thời điểm đánh giá. */
  evaluatedAt: Date;
}

/** Quyết định cho 1 kỳ. */
export interface AutoSettleDecision {
  drawId: string;
  /** `true` = đủ điều kiện. */
  eligible: boolean;
  /**
   * MỌI lý do không đạt (không chỉ lý do đầu tiên).
   * Vì sao đủ: staff cần biết kỳ này vướng 1 điều kiện hay 4 — quyết định xử lý khác nhau.
   */
  reasons: AutoSettleSkipReason[];
  /**
   * Số liệu tại thời điểm đánh giá — để đối chiếu sau này khi ngưỡng đã đổi, VÀ để hiệu
   * chuẩn ngưỡng từ phân bố thật (`p2-01` §3.4.5). Đủ 6 chỉ số của 4 câu hỏi rủi ro.
   */
  metrics: AutoSettleMetrics;
}

/**
 * Số liệu rủi ro của 1 kỳ tại thời điểm đánh giá — nguồn `keno_draw_betting_stats`.
 *
 * Đây CHÍNH LÀ tập số liệu dùng để vẽ phân bố percentile khi hiệu chuẩn ngưỡng
 * (`p2-01` §3.4.5 bước 3) — nên phải log ĐỦ, kể cả khi kỳ đó bị skip vì lý do khác.
 */
export interface AutoSettleMetrics {
  /** `preview.financials.totalStake` (VND) — doanh thu THẬT của kỳ. */
  revenue: number;
  /** `preview.financials.totalPayout` (VND) — tiền phải trả THẬT, đã áp cap. */
  totalPayout: number;
  /** `preview.financials.payoutRatio` = totalPayout / totalStake. Chỉ số số 1. */
  payoutRatio: number;
  /** `preview.financials.netProfit` (VND) = ggr - commission. CÓ THỂ ÂM. */
  netProfit: number;
  /** `preview.financials.ggr` (VND) = totalStake - totalPayout. CÓ THỂ ÂM. */
  ggr: number;
  /** `preview.topEntryPayout` (VND). `null` khi có bậc bị cap (không xác định được). */
  topEntryPayout: number | null;
  /** `true` khi bất kỳ bậc 8/9/10 có `capTriggered`. */
  capTriggered: boolean;
  /** `preview.entriesScanned` — log để tra soát, KHÔNG dùng làm ngưỡng. */
  entriesScanned: number;
  /** Số alert `critical` của CHÍNH kỳ này. `null` khi `alertPolicy.mode = ignore`. */
  alertsCritical: number | null;
}
```

> **Đổi 07/09 lần 2:** 8 field của bản trước (`cappedExposure`, `exposureRatio`, `singleEntryShare`,
> `capSetsRatio`, `statsStalenessSeconds`, `entries`) **thay hết** bằng số tiền thật từ preview. Không
> còn field nào đọc `keno_draw_betting_stats`. Lý do đầy đủ ở [`p2-01`](./p2-01-autopilot-config.plan.md)
> §3.4.2.

`AutoSettleSkipReason` là **`const object as const`** (`code-quality-standards.mdc` §5.3), **không**
string literal trần:

```typescript
export const AutoSettleSkipReason = {
  // ── Trạng thái draw (hard-coded, không cấu hình được) ─────────────────────────
  NotPublished: "not_published",
  AlreadySettled: "already_settled",

  // ── Độ tin cậy dữ liệu (hard-coded — nhóm quan trọng nhất) ────────────────────
  /** Chưa có preview doc cho kỳ này. Chưa tính ⇒ không có căn cứ. */
  NoPreview: "no_preview",
  /**
   * `preview.complete === false` — số dở dang.
   *
   * ⚠️ FAIL-OPEN NGUY HIỂM NHẤT của toàn thiết kế: số dở dang luôn NHỎ HƠN số thật ⇒ mọi
   * trần tiền đều "đạt" một cách giả tạo. Phải chặn TRƯỚC khi so bất kỳ ngưỡng nào.
   */
  PreviewIncomplete: "preview_incomplete",
  /** `preview.resultFingerprint` ≠ hash kết quả hiện tại → preview tính theo kết quả đã bị thay. */
  PreviewStaleResult: "preview_stale_result",
  /** Có alert `settle_preview_mismatch` chưa resolved trong 7 ngày → máy đang tính sai tiền. */
  PreviewMismatchDetected: "preview_mismatch_detected",
  /** `financials.totalStake === 0` — kỳ không cược, settle tay nhanh hơn. */
  ZeroRevenue: "zero_revenue",

  // ── Ngưỡng SỐ TIỀN THẬT (cấu hình được) ──────────────────────────────────────
  /** `payoutRatio > maxPayoutRatio`. */
  PayoutRatioTooHigh: "payout_ratio_too_high",
  /** `totalPayout > maxPayoutAbsolute`. */
  PayoutAbsoluteTooHigh: "payout_absolute_too_high",
  /** `netProfit < minNetProfit`. Đây là SÀN — lưu ý chiều so sánh ngược các lý do khác. */
  NetProfitTooLow: "net_profit_too_low",
  /** `topEntryPayout > maxSingleEntryPayout`, HOẶC `topEntryPayout === null` (bảo thủ). */
  SingleEntryPayoutTooHigh: "single_entry_payout_too_high",
  /** `blockOnCapTriggered` bật và có bậc `capTriggered`. */
  CapTriggered: "cap_triggered",
  /** `totalStake > maxRevenue` — van giới hạn quy mô, không phải chỉ số rủi ro. */
  RevenueTooHigh: "revenue_too_high",

  // ── Thời gian + alert + trần chạy ─────────────────────────────────────────────
  /** Chưa đủ `settleDelayMinutes` kể từ mốc muộn hơn (`closeAt` vs `publishedAt`). */
  DelayNotElapsed: "delay_not_elapsed",
  CriticalAlert: "critical_alert",
  WarningAlert: "warning_alert",
  RunLimitReached: "run_limit_reached",
} as const;
export type AutoSettleSkipReason = (typeof AutoSettleSkipReason)[keyof typeof AutoSettleSkipReason];
```

**Đối chiếu 3 bản:**

| Bản đầu (06/09) | Bản proxy (07/09 lần 1) | Bản số thật (07/09 lần 2 — **dùng bản này**) |
|---|---|---|
| `EntriesTooMany` | ❌ bỏ | ❌ bỏ |
| `ExposureTooHigh` | `ExposureRatioTooHigh` + `ExposureAbsoluteTooHigh` | ❌ bỏ cả hai → `PayoutRatioTooHigh` + `PayoutAbsoluteTooHigh` (số thật) |
| `TooYoung` | `DelayNotElapsed` | `DelayNotElapsed` (giữ) |
| — | `NoStatsDoc` | → `NoPreview` |
| — | `StatsStale` | → `PreviewStaleResult` (so fingerprint, không so đồng hồ) |
| — | `SingleEntryConcentration` (tỷ lệ) | → `SingleEntryPayoutTooHigh` (số tiền tuyệt đối) |
| — | `CapSetsGuard` (cap **sắp** kích hoạt) | → `CapTriggered` (cap **đã** kích hoạt — biết chắc, không phải dự đoán) |
| — | — | `PreviewIncomplete`, `PreviewMismatchDetected`, `NetProfitTooLow` **(mới)** |
| `ZeroRevenue` | `ZeroRevenue` | `ZeroRevenue` (giữ, nhưng giờ là số thật — không còn nhập nhằng với "stats chưa hút entry") |

**Chú ý khi code:** `NetProfitTooLow` là lý do duy nhất so **`<`** (sàn); mọi lý do `TooHigh` so **`>`**.
Đây là chỗ dễ viết ngược dấu nhất trong toàn rule engine — phải có test riêng cho nó (§5.1).

Có type dẫn xuất → UI map sang label tiếng Việt bằng `Record<AutoSettleSkipReason, string>`, thêm lý do
mới là compiler bắt mọi chỗ thiếu.

### 2.1 Thu thập MỌI lý do, không short-circuit

```typescript
// Duyệt ĐỦ mọi điều kiện, KHÔNG `return` sớm khi gặp lý do đầu tiên.
// Lý do: badge "Auto-Pilot bỏ qua: doanh thu quá cao" khiến staff tưởng chỉ cần hạ ngưỡng
// là xong, trong khi kỳ đó còn có alert critical. Thiếu thông tin dẫn tới quyết định sai.
const reasons: AutoSettleSkipReason[] = [];

if (row.status !== DrawStatus.Published) {
  reasons.push(AutoSettleSkipReason.NotPublished);
}
// Nhóm ĐỘ TIN CẬY DỮ LIỆU đứng TRƯỚC mọi ngưỡng số: nếu dữ liệu không dùng được thì mọi so
// sánh dưới đây vô nghĩa. Vẫn PUSH lý do rồi tiếp tục (không return) để log ghi đủ bức tranh —
// nhưng khi đọc log, các lý do nhóm này làm mọi metric khác trở thành "KHÔNG ĐÁNG TIN",
// không phải "đã đạt".
if (!preview) {
  reasons.push(AutoSettleSkipReason.NoPreview);
}
// ⚠️ QUAN TRỌNG NHẤT: số dở dang luôn NHỎ HƠN số thật ⇒ mọi trần tiền "đạt" giả tạo.
if (preview && !preview.complete) {
  reasons.push(AutoSettleSkipReason.PreviewIncomplete);
}
// So ĐỊNH DANH kết quả, không so thời gian. Republish đổi kết quả → preview vô giá trị.
if (preview && preview.resultFingerprint !== currentResultFingerprint) {
  reasons.push(AutoSettleSkipReason.PreviewStaleResult);
}
// Kill switch: preview từng lệch settle thật ⇒ MỌI quyết định đều đáng nghi (`p2-04b` §5.3).
if (hasUnresolvedPreviewMismatch) {
  reasons.push(AutoSettleSkipReason.PreviewMismatchDetected);
}
if (metrics.revenue === 0) {
  reasons.push(AutoSettleSkipReason.ZeroRevenue);
}

// ── Ngưỡng số tiền thật ──
if (config.maxPayoutRatio > 0 && metrics.payoutRatio > config.maxPayoutRatio) {
  reasons.push(AutoSettleSkipReason.PayoutRatioTooHigh);
}
// SÀN — dấu `<`, ngược chiều mọi lý do TooHigh khác. KHÔNG có quy ước `0 = tắt` ở đây.
if (metrics.netProfit < config.minNetProfit) {
  reasons.push(AutoSettleSkipReason.NetProfitTooLow);
}
// `topEntryPayout === null` (có bậc bị cap) → coi như KHÔNG ĐẠT, bảo thủ (`p2-01` §3.4.4).
if (
  config.maxSingleEntryPayout > 0 &&
  (metrics.topEntryPayout === null || metrics.topEntryPayout > config.maxSingleEntryPayout)
) {
  reasons.push(AutoSettleSkipReason.SingleEntryPayoutTooHigh);
}
// ... đủ mọi điều kiện ...
```

**Thứ tự push có ý nghĩa khi đọc log**, không có ý nghĩa với logic (mọi lý do đều chặn ngang nhau). Đặt
nhóm "độ tin cậy dữ liệu" (`NoPreview`/`PreviewIncomplete`/`PreviewStaleResult`/
`PreviewMismatchDetected`/`ZeroRevenue`) ngay sau nhóm trạng thái để người đọc log thấy nó trước các
ngưỡng số — vì khi 1 trong các lý do đó xuất hiện, `metrics` còn lại **không đáng tin**, đọc chúng như
"đã đạt ngưỡng" là kết luận sai.

**Hai cái bẫy khi implement khối này:**

1. **Quy ước `0 = tắt` áp cho `maxPayoutRatio`/`maxPayoutAbsolute`/`maxSingleEntryPayout`/`maxRevenue`
   nhưng KHÔNG áp cho `minNetProfit`** (`0` ở đó nghĩa "chỉ kỳ có lãi"). Viết `if (config.minNetProfit > 0 && ...)`
   là **bug**: nó vô hiệu hoá tiêu chí đúng lúc staff cấu hình chặt nhất.
2. **`metrics.topEntryPayout === null` phải là KHÔNG ĐẠT, không phải bỏ qua.** `null || x > y` — nếu viết
   `metrics.topEntryPayout !== null && metrics.topEntryPayout > config.maxSingleEntryPayout` thì kỳ có
   cap sẽ **lọt qua** tiêu chí này (fail-open).

### 2.2 `RunLimitReached` áp SAU cùng

`maxDrawsPerRun` không phải thuộc tính của kỳ mà là trần của lần chạy. Áp sau khi đã có danh sách đủ
điều kiện, cắt phần vượt và gắn `RunLimitReached` cho phần bị cắt — để log ghi rõ "kỳ này đủ điều kiện
nhưng bị hoãn sang lần sau", khác hoàn toàn với "kỳ này không đủ điều kiện".

Sort **`drawId` tăng** trước khi cắt: kỳ cũ nhất được xử lý trước. Cắt theo thứ tự giảm sẽ để backlog cũ
tồn mãi.

### 2.3 `settleDelayMinutes` — nguồn thời gian (sửa 07/09/2026)

Tính từ **mốc MUỘN HƠN** giữa `sales.closeAt` và `result.publishedAt`:

```typescript
// Mốc bắt đầu đếm delay = thời điểm MUỘN HƠN giữa "hết nhận cược" và "có kết quả".
// Bản đầu chỉ dùng closeAt là SAI: kỳ đóng bán 14:00 nhưng kết quả về 14:20 thì với
// settleDelayMinutes = 15, mốc 14:15 đã trôi qua TRƯỚC khi kết quả về → settle ngay khi
// publish, không còn cửa sổ nào để người kịp thấy kết quả sai.
const readyAt = new Date(
  Math.max(row.salesCloseAt.getTime(), row.resultPublishedAt.getTime()),
);
if (now.getTime() - readyAt.getTime() < config.settleDelayMinutes * 60_000) {
  reasons.push(AutoSettleSkipReason.DelayNotElapsed);
}
```

**Verify khi code:** tên field thật là `sales.closeAt` và `result.publishedAt` (theo entity
`packages/game-keno/src/entities/draw.ts`) — nhưng snapshot DTO của `p0-03` có thể đã đổi tên khi
serialize. Đọc DTO thật, đừng giả định.

Dùng `Date.now()` **một lần** đầu use-case, truyền xuống — **không** gọi trong loop (2 kỳ cạnh nhau sẽ
được đánh giá theo 2 mốc thời gian khác nhau, phá tính deterministic của 1 lần chạy).

**Ràng buộc mới (07/09 lần 2):** `settleDelayMinutes` phải **lớn hơn thời gian preview hoàn tất** ở kỳ
đông nhất. Nhỏ hơn thì mọi kỳ đều bị `PreviewIncomplete` ⇒ Auto-Pilot **không bao giờ** settle gì.
Zod có sàn cứng 5 phút, nhưng số thật phải chốt bằng đo p95 (`p2-04b` §4). Đây là phụ thuộc **ngầm**
giữa 2 config không nằm cùng chỗ — dễ bỏ sót nhất khi vận hành.

## 3. Worker

**File:** `apps/worker-keno/src/handlers/auto-settle.ts` (mirror pattern worker hiện có)

```typescript
/**
 * Worker Auto-Pilot — đánh giá và (nếu bật) kết sổ tự động các kỳ đủ điều kiện.
 *
 * Chạy theo EventBridge cron. Tần suất đề xuất 3 phút: chu kỳ kỳ Keno ~6-8 phút nên 3 phút
 * đủ nhanh để không tồn đọng, đủ chậm để người kịp can thiệp trong `settleDelayMinutes`.
 *
 * LUÔN đánh giá và LUÔN ghi log, kể cả khi `enabled = false` (dry-run). Chỉ bước GỌI
 * bulk-settle mới bị chặn bởi `enabled`. Đây là cách duy nhất để kiểm chứng rule trên dữ
 * liệu thật trước khi giao quyền cho máy.
 *
 * Lỗi ở đây KHÔNG được retry mù: settle là mutation. Nếu bulk-settle throw, log rồi DỪNG —
 * lần cron sau sẽ đánh giá lại từ trạng thái thật của DB (kỳ đã settle sẽ tự bị loại).
 */
```

Điểm phải làm đúng:

1. **Đọc `enabled` TƯƠI** (p2-01 §5) — không qua cache TTL dài. Kill switch phải có hiệu lực ngay.
2. **Không `Promise.all` nhiều game trong 1 handler.** Mỗi game 1 handler riêng (Keno / Bingo18), theo
   đúng cách các worker hiện có tách. Gộp vào 1 handler làm lỗi game này chặn game kia.
3. **Không retry tự động khi bulk-settle lỗi.** Cron sau đánh giá lại từ DB thật — idempotent tự nhiên,
   không cần retry logic. Retry mù trên mutation tiền là cách tạo double-pay.
4. **Timeout Lambda phải đủ** cho `maxDrawsPerRun` kỳ × concurrency 5. Với 50 kỳ = 10 chunk × ~200ms ≈
   2s, nhưng đặt timeout ≥ 60s cho an toàn.
5. **`console.log` có cấu trúc** mỗi lần chạy: số kỳ đánh giá, số đủ điều kiện, số đã settle, `enabled`.
   CloudWatch là nơi đầu tiên người ta tìm khi có sự cố.

### 3.1 Serverless config — KHÔNG chạm Step Functions ASL

Thêm 1 function + 1 EventBridge schedule vào `serverless.yml` của `worker-keno`. **Không** sửa ASL của
Step Function settle — Auto-Pilot gọi `BulkTriggerSettleUseCase` (start SFN như bình thường), không can
thiệp vào định nghĩa state machine.

Lý do quan trọng: deploy ASL là quy trình thủ công có rủi ro (đã ghi ở các plan trước). Auto-Pilot
tuyệt đối không được là lý do phải sửa ASL.

> **Phải verify:** đọc `apps/worker-keno/serverless.yml` để biết pattern schedule hiện có (có worker nào
> dùng EventBridge chưa?). Mirror đúng, kể cả cách đặt tên và IAM role.

## 4. Hiệu chuẩn + dry-run — bắt buộc chạy trước khi bật

Đây là phần **không được bỏ** của plan này.

> **Đổi 07/09 lần 2:** bản trước buộc dry-run **≥ 2 tuần** vì proxy exposure không có đáp án đúng ⇒ chỉ
> quan sát tiến về phía trước được. Số tiền thật **đối chiếu ngược về quá khứ** được (`draw.financial`
> của kỳ đã settled là đáp án) ⇒ giai đoạn hiệu chuẩn rút xuống ~1 ngày, và dry-run chỉ còn nhiệm vụ hẹp
> là kiểm engine chạy đúng trên kỳ **mới**.

| Giai đoạn | `enabled` | Thời lượng | Việc phải làm |
|---|---|---|---|
| **0. Backfill + hiệu chuẩn** | — | ~1 ngày | Chạy backfill preview 30 ngày (`p2-04b` §7). Xác nhận **100% kỳ có `delta === 0`**. Vẽ phân bố `payoutRatio`/`totalPayout`/`netProfit`/`topEntryPayout` → chọn ngưỡng (`p2-01` §3.4.5) |
| **1. Dry-run** | `false` | **≥ 3 ngày** | Kiểm engine chạy đúng trên kỳ MỚI: cron, lock, resume nhiều nhịp, preview kịp trước `settleDelayMinutes`. **Không** còn nhiệm vụ thu dữ liệu chọn ngưỡng |
| **2. Bật hẹp** | `true`, ngưỡng **chặt hơn 1 bậc** (p75 thay p95) | ≥ 1 tuần | Kiểm tra từng kỳ máy đã settle. Đối chiếu `verification.delta` của chính các kỳ đó |
| **3. Mở rộng** | `true`, ngưỡng p90–p95 | — | Nâng dần, mỗi lần quan sát 1 tuần |

**Tiêu chí pass giai đoạn 0** (chặn cứng, không thương lượng):

1. **Mọi kỳ trong 30 ngày có `verification.delta === 0`.** Một kỳ lệch = engine preview sai ⇒ **không
   được** merge `p2-04`, phải điều tra xong. Không ghi nhận là "ngoại lệ lịch sử".
2. **`payoutRatio` p50 gần RTP lý thuyết** tính từ `rules/odds.ts`. Lệch xa ⇒ hoặc bảng giải cấu hình
   khác thiết kế, hoặc `computeEntryPayout` sai — phải hiểu nguyên nhân trước khi bật.
3. **Đã đo p95 thời gian preview hoàn tất** và `settleDelayMinutes` đặt trên nó có margin.

**Tiêu chí pass giai đoạn 1:**

1. **Rule không thiếu điều kiện:** không có kỳ nào máy đánh giá `eligible` mà staff đã xử lý tay theo cách
   khác (void, sửa kết quả, resettle). Một trường hợp = rule thiếu điều kiện → tìm ra, thêm vào, **reset
   đồng hồ 3 ngày**.
2. **Ngưỡng bắt đúng kỳ đáng bận tâm:** mọi kỳ staff **đã can thiệp tay** trong 30 ngày backfill phải nằm
   **ngoài** ngưỡng vừa chọn. Có kỳ staff can thiệp mà ngưỡng cho qua → chọn lại số (không cần reset đồng hồ).
3. **Preview luôn kịp:** không có kỳ nào bị `PreviewIncomplete` tại thời điểm `settleDelayMinutes` đã trôi
   qua. Có ⇒ hoặc nâng `settleDelayMinutes`, hoặc tăng nhịp cron preview.

Tiêu chí 2 là kiểm chứng thật sự — percentile một mình chỉ nói "kỳ này bất thường so với các kỳ khác", nó
không nói "kỳ này đáng để người xem". Chỉ có đối chiếu với hành vi thật của staff mới trả lời được.

**Lợi thế mới so với bản proxy:** giai đoạn 0 cho **bằng chứng định lượng** rằng máy tính đúng tiền
(hàng nghìn kỳ, `delta === 0`) **trước khi** bật bất cứ thứ gì. Bản proxy không có bước này — nó bật dựa
trên "ngưỡng nghe hợp lý theo phân bố", không có gì chứng minh phép tính đúng.

Giai đoạn 1 chạy được **ngay** sau khi deploy plan này, vì `enabled` mặc định `false`.

## 5. Test

### 5.1 Unit rule engine — nhóm quan trọng nhất

| Case | Kỳ vọng |
|---|---|
| Kỳ đủ mọi điều kiện | `eligible: true`, `reasons: []` |
| Kỳ đã `settledAt` | `eligible: false`, `AlreadySettled` |
| Kỳ ở `SalesOpen` | `eligible: false`, `NotPublished` |
| Kỳ vượt 3 ngưỡng | `reasons` có **đủ 3**, không chỉ 1 |
| **Không có preview doc** | `eligible: false`, `NoPreview` — kể cả khi mọi điều kiện khác trông đạt |
| **`preview.complete === false`, mọi số trong preview đều đẹp** | `eligible: false`, `PreviewIncomplete`. **Case quan trọng nhất của cả plan** — nó chứng minh không fail-open trên số dở dang |
| **`resultFingerprint` lệch kết quả hiện tại** | `eligible: false`, `PreviewStaleResult` |
| **Có `SettlePreviewMismatch` chưa resolved trong 7 ngày** | `eligible: false`, `PreviewMismatchDetected` — **mọi** kỳ, không riêng kỳ lệch |
| Alert `SettlePreviewMismatch` cũ hơn 7 ngày, đã resolved | Không chặn |
| **`financials.totalStake === 0`** | `eligible: false`, `ZeroRevenue` |
| `payoutRatio` = đúng `maxPayoutRatio` | Đạt (`<=`, không `<`) — **quyết định rõ và test** |
| `payoutRatio` vượt, `totalPayout` tuyệt đối vẫn thấp | `PayoutRatioTooHigh` — ratio một mình đủ chặn |
| `payoutRatio` thấp, `totalPayout` vượt `maxPayoutAbsolute` | `PayoutAbsoluteTooHigh` — tuyệt đối một mình đủ chặn |
| `maxPayoutRatio = 0` (tắt) + `payoutRatio` rất cao | Không push `PayoutRatioTooHigh` (quy ước `0 = tắt`) |
| **`netProfit = -10tr`, `minNetProfit = -50tr`** | **Đạt** — lỗ trong hạn mức cho phép. Case dễ sai dấu nhất |
| **`netProfit = -60tr`, `minNetProfit = -50tr`** | `NetProfitTooLow` |
| **`netProfit = -1tr`, `minNetProfit = 0`** | `NetProfitTooLow` — `0` KHÔNG phải "tắt tiêu chí" |
| `netProfit = 0`, `minNetProfit = 0` | Đạt (`>=`) |
| `topEntryPayout` vượt `maxSingleEntryPayout` | `SingleEntryPayoutTooHigh` |
| **`topEntryPayout === null`** (có bậc cap) | `SingleEntryPayoutTooHigh` — **KHÔNG** được bỏ qua (fail-open) |
| `maxSingleEntryPayout = 0` (tắt) + `topEntryPayout === null` | Không push (tiêu chí đã tắt hẳn) |
| `capTriggered: true` + `blockOnCapTriggered: true` | `CapTriggered` |
| `capTriggered: true` + `blockOnCapTriggered: false` | Không push `CapTriggered` (nhưng vẫn bị `SingleEntryPayoutTooHigh` do `topEntryPayout === null`) |
| **`closeAt` 14:00, `publishedAt` 14:20, `settleDelayMinutes` 15, `now` 14:30** | `DelayNotElapsed` — mốc là 14:35 (từ `publishedAt`), KHÔNG phải 14:15 |
| `closeAt` 14:00, `publishedAt` 13:50 (kết quả về sớm), `now` 14:16, delay 15 | Đạt — mốc là `closeAt` (muộn hơn) |
| `alertPolicy.mode = ignore` + kỳ có alert critical | `eligible: true`, `metrics.alertsCritical: null` |
| `alertPolicy.mode = ignore` + có `SettlePreviewMismatch` | **VẪN** chặn — mismatch là hard-coded, không đi qua `alertPolicy` |
| `alertPolicy.mode = blockOnCritical` + alert critical (status `new`) | `CriticalAlert` |
| `alertPolicy.mode = blockOnCritical` + alert critical (status **`ack`**) | `CriticalAlert` — `ack` KHÔNG mở gate (`p2-01` §3.5.1 vấn đề 4) |
| `alertPolicy.mode = blockOnAny` + chỉ có warning | `WarningAlert` |
| `SettlePreviewMismatch` trong `exemptTypes` | **VẪN** chặn — không được miễn trừ (`p2-04b` §5.2) |
| Alert critical thuộc **kỳ khác** | **Không** chặn kỳ đang xét (per-draw, không global) |
| Alert cũ hơn `ignoreAlertsOlderThanMinutes` | Không chặn |
| Alert type nằm trong `exemptTypes` | Không chặn |
| 20 kỳ đạt, `maxDrawsPerRun = 5` | 5 kỳ `eligible`, 15 kỳ có `RunLimitReached` |
| Sort trước khi cắt | 5 kỳ được chọn là 5 kỳ **cũ nhất** |
| Chạy 2 lần cùng input | Output **giống hệt** (deterministic) |
| `config.enabled = false` | Vẫn trả `eligible` đầy đủ (dry-run hoạt động) |
| Config thiếu (doc cũ) | `enabled: false`, không crash |
| Mọi kỳ (đạt hoặc không) | `metrics` log **đủ 9 field** — cần cho hiệu chuẩn (`p2-01` §3.4.5) |

Bốn nhóm case in đậm là nhóm quan trọng nhất:

- **`PreviewIncomplete`** — case **số một** của toàn plan. Số dở dang luôn nhỏ hơn số thật ⇒ nếu thiếu
  kiểm tra này, Auto-Pilot settle mạnh tay nhất đúng lúc dữ liệu ít đáng tin nhất. Test phải dựng preview
  có `complete: false` với **mọi số đều đẹp** để chứng minh cờ `complete` chặn được, không phải ngưỡng.
- **`minNetProfit` với giá trị âm** (4 case) — đây là chỗ dễ sai dấu nhất trong rule engine, vì nó là
  **sàn** giữa toàn các trần, và `0` ở nó **không** mang nghĩa "tắt".
- **`topEntryPayout === null`** — phải là KHÔNG ĐẠT. Viết `!== null && >` là fail-open.
- **`PreviewMismatchDetected` bỏ qua `alertPolicy`** (2 case) — chứng minh kill switch không tắt được
  bằng cấu hình alert.

Case "chạy 2 lần giống hệt" là test tính deterministic — **bắt buộc**.

> **Điều kiện chặn thêm:** `p2-04` **không được merge** nếu Keno chưa có `evaluate-alerts.test.ts` (port
> từ `power655`) — kể cả khi `alertPolicy.mode = ignore`. Lý do: `p2-05` §4.1 dùng `alertsCritical` để
> hiện badge trên Hub; badge sai dẫn tới quyết định sai của **người**, không chỉ của máy. Xem `p2-01`
> §3.5.4 việc #1.

### 5.2 Worker integration (staging)

| Bước | Kỳ vọng |
|---|---|
| `enabled: false`, có 5 kỳ đạt | Log ghi 5 kỳ eligible, **0** SFN execution mới |
| `enabled: true`, có 5 kỳ đạt | 5 kỳ settle, **đúng 5** execution |
| Chạy cron lần 2 ngay sau | **0** kỳ settle thêm (5 kỳ kia đã `settledAt`) |
| Tắt `enabled` giữa 2 nhịp | Nhịp sau **không** settle |
| Bulk-settle throw | Log lỗi, worker **không** retry, nhịp sau đánh giá lại |
| Rollup daily sau khi auto-settle 5 kỳ | Số khớp (p0-01 §6.3) |

Bước 3 là test chống double-settle qua đường tự động — **bắt buộc pass**.

## 6. Review checklist

- [ ] Gọi **đúng** `BulkTriggerSettleUseCase` của p0-04, **không** đường settle riêng. Đọc diff xác nhận.
- [ ] Đánh giá **tách hoàn toàn** khỏi hành động; use-case đánh giá **không** mutation nào.
- [ ] **`p2-04a` + `p2-04b` đã merge** trước khi bắt đầu file này.
- [ ] **KHÔNG đọc `draw.financial`/`draw.stats`** — 2 field POST-settle, luôn `undefined` (§2, `p2-01` §3.4.0).
- [ ] **KHÔNG đọc `keno_draw_betting_stats`** — nguồn duy nhất là `keno_settle_previews` (`p2-01` §3.4.2).
- [ ] **`preview.complete === true` kiểm TRƯỚC mọi ngưỡng** — test §5.1 case `PreviewIncomplete` pass.
- [ ] `resultFingerprint` so với kết quả **hiện tại** của draw mỗi lần đánh giá.
- [ ] Kill switch `PreviewMismatchDetected` hoạt động và **không** tắt được qua `alertPolicy`/`exemptTypes`.
- [ ] `metrics` log **đủ 9 field** của `AutoSettleMetrics` cho MỌI kỳ (đạt hoặc không) — cần cho hiệu chuẩn.
- [ ] `settleDelayMinutes` tính từ `max(closeAt, publishedAt)`. Test §5.1 2 case đối xứng pass.
- [ ] `settleDelayMinutes` cấu hình thực tế **> p95 thời gian preview hoàn tất** (`p2-04b` §4).
- [ ] `minNetProfit` so bằng **`<`** (sàn), và **KHÔNG** áp quy ước `0 = tắt`. Test 4 case §5.1 pass.
- [ ] `topEntryPayout === null` → **KHÔNG ĐẠT** (không phải bỏ qua). Test case pass.
- [ ] 6 điều kiện hard-coded `p2-01` §3.4.2 **không** bị cấu hình bỏ qua.
- [ ] `alertPolicy.mode` mặc định `ignore`; gate hoạt động đúng **không phụ thuộc** alert engine.
- [ ] Khi `mode = blockOnCritical`: alert status **`ack` vẫn chặn** (không chỉ `new`).
- [ ] Alert xét **per-draw** qua `countByDrawIds`, KHÔNG dùng `countByStatus`/`countActiveCritical` (global).
- [ ] Keno đã có `evaluate-alerts.test.ts` (port từ `power655`) — **điều kiện chặn merge**, xem §5.1 cuối.
- [ ] Dry-run hoạt động: `enabled: false` vẫn đánh giá + log, **không** settle.
- [ ] `enabled` đọc tươi, kill switch có hiệu lực ≤ 1 nhịp cron.
- [ ] Thu thập **mọi** lý do, không short-circuit. Test §5.1 case "vượt 3 ngưỡng".
- [ ] `AutoSettleSkipReason` là `const as const` + type dẫn xuất, **không** string trần.
- [ ] `RunLimitReached` áp sau cùng; sort `drawId` **tăng** trước khi cắt.
- [ ] `Date.now()` gọi **1 lần**, không trong loop.
- [ ] **Không** retry tự động khi bulk-settle lỗi.
- [ ] **Không** sửa Step Functions ASL.
- [ ] Mỗi game 1 handler riêng, không gộp.
- [ ] Log có cấu trúc, đủ để debug từ CloudWatch.
- [ ] **Không** dùng LLM/eve ở bất kỳ bước quyết định nào.
- [ ] Test deterministic (§5.1 case cuối) pass.
- [ ] PR description kèm: kết quả backfill (**100% `delta === 0`**), phân bố đã đo, đối chiếu RTP lý thuyết (§4).
- [ ] `pnpm check-types` + `pnpm lint` xanh.
- [ ] **Không** `biome-ignore` cho `noFloatingPromises` (code tài chính — cấm tuyệt đối).

## 7. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| **Máy kết sổ kỳ đáng lẽ phải review → trả thưởng sai** | 🔴 | Backfill chứng minh phép tính đúng (§4 gđ 0) + dry-run + bật hẹp + 6 điều kiện hard-coded |
| **Dùng preview dở dang** (`complete: false`) → mọi trần "đạt" giả tạo | 🔴 | Kiểm `complete` TRƯỚC mọi ngưỡng; test §5.1 case số 1; `complete` là field riêng không suy diễn |
| **Preview tính sai tiền mà không ai biết** | 🔴 | `verification.delta` mỗi kỳ + kill switch `PreviewMismatchDetected` 7 ngày, không tắt được qua config |
| **Vắng alert bị hiểu là an toàn** (cursor global chặn chuỗi) | 🔴 | `mode: ignore` mặc định — gate dùng số tiền thật, không hỏi alert (`p2-01` §3.5.2) |
| Dùng preview tính theo kết quả đã bị republish | 🔴 | `resultFingerprint`, không dựa vào thời gian |
| Tắt Auto-Pilot mà máy vẫn chạy | 🔴 | `enabled` đọc tươi + test §5.2 bước 4 |
| Double-settle qua đường tự động | 🔴 | Gọi đúng use-case đơn (3 lớp guard) + test §5.2 bước 3 |
| Retry mù làm settle 2 lần | 🔴 | Cấm retry; cron sau đánh giá lại từ DB |
| `minNetProfit` viết sai dấu / áp nhầm quy ước `0 = tắt` | 🟡 | 4 test case §5.1; checklist; JSDoc `p2-01` §3.4.4 |
| `topEntryPayout === null` bị bỏ qua thay vì chặn | 🟡 | Test case riêng; §2.1 bẫy #2 |
| `settleDelayMinutes` < thời gian preview ⇒ **không bao giờ** settle | 🟡 | Zod sàn 5 phút; đo p95; tiêu chí pass §4 gđ 1 #3 |
| Ngưỡng chọn bằng cảm giác | 🟡 | §4 gđ 0: backfill + 3 lớp kiểm chứng; PR phải kèm phân bố |
| Backlog lớn bị settle hàng loạt trong 1 nhịp | 🟡 | `maxDrawsPerRun` + sort cũ trước |
| Rule thiếu điều kiện mà dry-run không phát hiện | 🟡 | Tiêu chí pass §4: **1** trường hợp lệch = reset đồng hồ |
| Badge lý do thiếu thông tin → staff quyết sai | 🟡 | Thu thập mọi lý do (§2.1) |
| Ai đó thêm LLM vào bước quyết định | 🟡 | Checklist + JSDoc ghi rõ DETERMINISTIC |
| Ai đó thêm lại `maxEntries`/`exposureRatio` vì "nghe hợp lý" | 🟢 | `p2-01` §3.4.2 + bảng đối chiếu 3 bản ở §2 giải thích vì sao bỏ |
| Lambda timeout khi backlog lớn | 🟢 | `maxDrawsPerRun` ≤ 50 + timeout ≥ 60s |

**Hai rủi ro 🔴 của bản proxy đã BIẾN MẤT:** *"fail-open khi stats chậm/treo"* và *"so exposure RAW thay
vì đã cap"* — không còn đọc `keno_draw_betting_stats` nên cả hai không còn đường xảy ra. Thay bằng
*"dùng preview dở dang"*, cùng bản chất nhưng kiểm soát bằng **một cờ boolean dứt khoát** thay vì ngưỡng
giây phải đoán.

## 8. Rollback

**Kill switch trước, revert sau:**

1. Set `enabled: false` cho mọi game (qua UI Game Config — có hiệu lực ≤ 1 nhịp cron).
2. Xác nhận log không còn kỳ nào được settle tự động.
3. Revert commit / xoá EventBridge schedule.

Kỳ đã auto-settle **vẫn đúng** — chúng đi qua đúng `BulkTriggerSettleUseCase`, không khác gì staff bấm
tay. Không cần sửa dữ liệu.

**Không** revert trước khi tắt `enabled`: nếu revert code mà schedule còn, Lambda cũ có thể vẫn chạy.
