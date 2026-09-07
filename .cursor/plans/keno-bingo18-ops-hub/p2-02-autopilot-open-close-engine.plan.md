# p2-02 — Engine mở kỳ tự động + đóng bán tự động (giai đoạn 1 + 2)

> **Phase:** P2 · **Status:** ⏳ pending · **Phụ thuộc:** p2-01 · **Chặn:** p2-03
> **Nguồn:** [`p2-01-autopilot-config.plan.md`](./p2-01-autopilot-config.plan.md) §0, §3.1, §3.2
> **Sửa lớn 07/09/2026 — giai đoạn 1 chuyển sang mô hình RECONCILE:** bản đầu là cron 1 lần/ngày tại
> `open.runAtLocalTime` cho ngày mai. Hai vấn đề: nó **không bù được kỳ thiếu của HÔM NAY** (xảy ra thật
> khi đổi `drawIntervalMinutes` giữa ngày), và cron trễ 1 nhịp = **mất trắng cả ngày**. Nay worker chạy
> mỗi 5–10 phút, mỗi nhịp bù đủ phần thiếu trong `horizonDays` ngày tới. Lập luận đầy đủ ở
> [`p2-01`](./p2-01-autopilot-config.plan.md) §3.1. Giai đoạn 2 (đóng bán) **không đổi**.

## 1. Kiến trúc — 2 worker riêng, KHÔNG gộp

Giống nguyên tắc `p2-04` (settle engine): **1 caller mới, KHÔNG pipeline mới**. Worker gọi lại use-case
đơn ĐÃ CÓ (`CreateDrawUseCase`, `CloseSalesUseCase`) — không viết logic tạo/đóng kỳ song song.

```
EventBridge cron (mỗi 5-10 phút — RECONCILE, không phải 1 lần/ngày)
   ↓
Lambda worker-keno: autoOpenHandler
   ↓
EvaluateAutoOpenPlanUseCase   ← tính slot còn THIẾU cho MỌI ngày trong horizon, KHÔNG mutation
   ↓ (chỉ khi config.enabled === true)
CreateDrawUseCase             ← ĐÚNG use-case đơn, chunk theo KENO_CREATE_DRAW_BATCH_MAX

EventBridge cron (mỗi N phút, ví dụ 2 phút)
   ↓
Lambda worker-keno: autoCloseHandler
   ↓
EvaluateAutoCloseListUseCase  ← lọc kỳ SalesOpen đã qua closeAt+grace, KHÔNG mutation
   ↓ (chỉ khi config.enabled === true)
CloseSalesUseCase (lặp, KHÔNG bulk API mới)  ← đơn giản hơn settle: đóng bán không cần
                                                concurrency cap kiểu SFN, mỗi lệnh là 1 update rẻ
```

**2 handler tách biệt**, mirror đúng cách `p2-04` tách 1 game 1 handler: lỗi giai đoạn mở kỳ không
được chặn giai đoạn đóng bán và ngược lại — chúng chạy trên 2 cron độc lập.

**Lợi ích phụ của reconcile:** 2 worker giờ có **cùng một hình dạng** — cron ngắn, đánh giá lại từ trạng
thái DB thật mỗi nhịp, idempotent tự nhiên. Thay vì 1 cái cron-ngày, 1 cái cron-phút với 2 kiểu suy luận
khác nhau. Ít hình dạng = ít chỗ sai khác nhau.

## 2. Giai đoạn 1 — Mở kỳ tự động (reconcile)

### 2.1 `EvaluateAutoOpenPlanUseCase` — tính slot còn thiếu

**File:** `packages/game-keno-application/src/use-cases/operations/evaluate-auto-open-plan.ts`

```typescript
/**
 * Tính danh sách slot giờ quay CẦN tạo cho MỌI ngày trong horizon — THUẦN RULE, KHÔNG
 * mutation, KHÔNG gọi `CreateDrawUseCase`.
 *
 * MÔ HÌNH RECONCILE (sửa 07/09/2026): quét `hôm nay` → `hôm nay + horizonDays`, mỗi ngày so
 * lưới giờ config với draw đã có trong DB, trả phần thiếu. Bản đầu chỉ xét ĐÚNG 1 ngày
 * (`hôm nay + advanceDays`) nên không bù được kỳ thiếu của hôm nay.
 *
 * Vì sao cần tách khỏi `CreateDrawUseCase`: `validateBatch` guard 6 (trùng giờ với DB) là
 * ALL-OR-NOTHING — gửi 1 lô có dù chỉ 1 slot trùng sẽ THROW toàn bộ lô. Worker chạy lại cho
 * cùng 1 ngày giờ là kịch bản THƯỜNG XUYÊN (mỗi 5-10 phút!) — gọi thẳng `CreateDrawUseCase`
 * với toàn bộ lưới giờ thì mọi nhịp sau nhịp đầu sẽ throw. Use-case này tính PHẦN CÒN THIẾU
 * trước, để nhịp nào cũng idempotent tự nhiên.
 *
 * 2 LOẠI SLOT PHẢI LOẠI (ngoài slot đã có draw):
 * 1. `drawTime` đã QUA — tạo kỳ quá khứ là rác dữ liệu, không ai cược được nữa.
 * 2. Slot từng có draw đã `Void` — VOID LÀ QUYẾT ĐỊNH CỦA NGƯỜI. Tạo lại slot đó là máy đảo
 *    ngược quyết định của người (`p2-01` §0.1). Phải phân biệt "chưa từng có draw" với "đã có
 *    nhưng bị void" → `listDrawTimesByDate` PHẢI trả cả draw đã void. **Verify khi code:** nếu
 *    method đó đang filter bỏ draw void, worker sẽ tạo lại kỳ staff vừa void — bug nghiêm trọng.
 */
export class EvaluateAutoOpenPlanUseCase extends UseCase<EvaluateAutoOpenPlanInput, AutoOpenPlan> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigUseCase();

  protected async execute(input: EvaluateAutoOpenPlanInput): Promise<AutoOpenPlan> {
    const { play } = await this.getGlobalConfig.run();
    const grid = listDrawSlotMinutes(play.firstDrawTime, play.lastDrawTime, play.drawIntervalMinutes);
    // Lặp từng ngày trong [today, today + horizonDays]:
    //  - Ngày > hôm nay: CHỈ xét nếu `nextDayFromLocalTime` không set HOẶC giờ VN hiện tại đã
    //    qua mốc đó. Đây là time gate DUY NHẤT của giai đoạn 1 — hôm nay không có gate nào.
    //  - map grid → drawTime tuyệt đối, đọc existingDrawTimes qua drawRepo.listDrawTimesByDate
    //    (method ĐÃ CÓ, dùng lại từ CreateDrawUseCase.validateBatch)
    //  - loại slot đã có draw (KỂ CẢ draw đã Void) + loại slot có drawTime đã qua
    // Gộp mọi ngày, sort tăng theo drawTime, cắt theo maxDrawsPerRun (0 = không cắt).
  }
}
```

```typescript
export interface AutoOpenPlan {
  /** Slot còn thiếu trên MỌI ngày trong horizon, sort tăng theo `drawTime`. Rỗng = đủ lưới. */
  missingSlots: AutoOpenSlot[];
  /** Đã bị cắt bởi `maxDrawsPerRun` — nhịp sau tạo tiếp. Log để biết còn tồn đọng bao nhiêu. */
  deferredCount: number;
  /** Thống kê từng ngày trong horizon — xem ghi chú bên dưới, đây KHÔNG phải log cho đẹp. */
  byDate: AutoOpenDatePlan[];
}

export interface AutoOpenSlot {
  drawTime: Date;
  minutes: number;
  /** `"YYYY-MM-DD"` — cần vì `missingSlots` giờ trộn nhiều ngày. */
  date: string;
}

export interface AutoOpenDatePlan {
  date: string;
  /** Tổng slot theo lưới config. */
  totalGridSlots: number;
  /** Đã có draw (KỂ CẢ draw đã Void). */
  existingCount: number;
  /** Bị loại vì `drawTime` đã qua. */
  pastCount: number;
  /** Còn thiếu, cần tạo. */
  missingCount: number;
}
```

`byDate` là **cách duy nhất** phát hiện tình huống "ngày mai đã đủ nhưng hôm nay thiếu 3 kỳ vì đổi
interval giữa ngày" — tức chính lý do chuyển sang reconcile. Không có nó, log chỉ nói "đã tạo N kỳ" và
staff không biết N đó thuộc ngày nào, cũng không biết còn ngày nào chưa đủ.

**KHÔNG dùng lại `CreateDrawUseCase.validateBatch` bằng cách gọi private method** — nó là `private`
có chủ đích. Thay vào đó, `EvaluateAutoOpenPlanUseCase` tự đọc `GetGlobalConfigUseCase` +
`drawRepo.listDrawTimesByDate` (2 method PUBLIC đã có), tính grid bằng ĐÚNG hàm pure
`listDrawSlotMinutes` mà `create-draw.ts` đang dùng — không phát minh lại logic lưới giờ.

### 2.2 Worker — chunk theo trần batch

**File:** `apps/worker-keno/src/handlers/auto-open.ts`

```typescript
/**
 * Worker Auto-Pilot giai đoạn 1 — reconcile lưới kỳ quay: luôn bù đủ phần còn thiếu.
 *
 * Chạy mỗi 5-10 phút theo EventBridge cron (KHÔNG phải 1 lần/ngày — xem header plan). Đọc
 * config TƯƠI trước khi quyết định — nếu `enabled = false`, log rồi thoát, KHÔNG gọi
 * `EvaluateAutoOpenPlanUseCase` (khác quy ước dry-run của settle: giai đoạn 1 không cần quan
 * sát "định tạo gì" vì hành động RẤT rẻ để verify tay — staff mở Operations Hub thấy ngay
 * thiếu kỳ nào).
 *
 * TỰ LÀNH: mọi nhịp đánh giá lại từ trạng thái DB thật. Nhịp lỗi được nhịp sau bù trong 5-10
 * phút — không cần retry logic, không cần alarm "cron hôm nay đã chạy chưa".
 *
 * CHUNK bắt buộc: `missingSlots.length` có thể vượt `KENO_CREATE_DRAW_BATCH_MAX` (VD nhịp đầu
 * sau khi bật `horizonDays: 2`, hoặc sau khi đổi `drawIntervalMinutes` 8→4 phút làm lưới giờ
 * tăng gấp đôi). Chia thành nhiều lô, gọi `CreateDrawUseCase.run()` TUẦN TỰ (không
 * `Promise.all` — mỗi lô cấp `drawNo` monotonic, chạy song song không sai nhưng khó debug log).
 *
 * KHOÁ CHỐNG CHỒNG NHỊP: cron 5 phút + 1 nhịp tạo 100+ kỳ có thể vượt 5 phút → 2 nhịp chồng
 * nhau, cùng tính ra `missingSlots` giống nhau, cùng gọi create. Guard 6 của `CreateDrawUseCase`
 * vẫn chặn được (throw), nhưng nó biến việc bình thường thành lỗi đỏ trong log. Dùng
 * distributed lock per-game, TTL ~ 2× cron interval — xem §4.
 */
```

Điểm phải làm đúng:

1. **Đọc `enabled` TƯƠI** — kill switch có hiệu lực ≤ 1 nhịp cron (5-10 phút). Reconcile làm điều này
   **quan trọng hơn** bản cron-ngày: worker chạy liên tục nên `enabled` cũ trong cache gây tác động
   liên tục, không phải mỗi ngày 1 lần.
2. **1 lô lỗi KHÔNG chặn lô sau.** `CreateDrawUseCase.createDraws` là transaction all-or-nothing
   TRONG 1 lô — nhưng giữa các lô, lỗi lô 2 (VD trùng giờ do race với staff tạo tay giữa lúc worker
   chạy) không được rollback lô 1 đã tạo thành công. Log lỗi lô, tiếp tục lô kế.
3. **KHÔNG retry tự động trong cùng nhịp.** Nhịp cron sau (5-10 phút) tự tính lại `missingSlots` (đã trừ
   phần lô 1 tạo được) — idempotent tự nhiên như thiết kế `EvaluateAutoOpenPlanUseCase`.
4. **`actor` truyền vào `CreateDrawUseCase.run()` phải đánh dấu là hệ thống**, KHÔNG để trống. Theo
   pattern `auditOpenSales`/`auditCloseSales` nhận `input.actor` optional — Auto-Pilot PHẢI truyền
   1 actor cố định dạng hệ thống (VD `{ accountId: "system:auto-pilot", displayName: "Auto-Pilot" }")
   để audit log phân biệt được "ai" tạo kỳ này, không lẫn với staff thật.

### 2.3 Test

| Case | Kỳ vọng |
|---|---|
| Ngày chưa có slot nào | `missingSlots` = toàn bộ lưới (trừ slot đã qua giờ) |
| Ngày đã có đủ slot (staff đã tạo tay trước) | `missingSlots` rỗng, worker không gọi `CreateDrawUseCase` |
| Chạy 2 lần liên tiếp | Lần 2 `missingSlots` rỗng (lần 1 đã lấp) — test idempotent |
| **Hôm nay thiếu 3 kỳ giữa lưới** (đổi interval giữa ngày) | 3 slot đó có trong `missingSlots` — đây là ca reconcile PHẢI bù, bản đầu bỏ sót |
| **Slot có `drawTime` đã qua 5 phút** | KHÔNG trong `missingSlots` |
| **Slot từng có draw, draw đó đã `Void`** | KHÔNG trong `missingSlots` — máy không đảo ngược quyết định void của người |
| **`horizonDays: 0`** | Chỉ bù hôm nay, `byDate` đúng 1 phần tử |
| **`horizonDays: 2`, `nextDayFromLocalTime` chưa tới** | `missingSlots` chỉ có slot **hôm nay**; `byDate` vẫn liệt kê 3 ngày với `missingCount` ngày mai = 0 |
| **`horizonDays: 2`, `nextDayFromLocalTime` đã qua** | Có slot của cả 3 ngày |
| **`nextDayFromLocalTime` không set** | Ngày mai được xét ngay, không cần chờ giờ nào |
| **`maxDrawsPerRun: 10`, thiếu 35 slot** | `missingSlots` đúng 10 (10 slot sớm nhất), `deferredCount: 25` |
| **`maxDrawsPerRun: 0`, thiếu 35 slot** | `missingSlots` đủ 35, `deferredCount: 0` |
| `missingSlots.length` > `KENO_CREATE_DRAW_BATCH_MAX` | Chia đúng số lô, mỗi lô ≤ trần |
| 1 lô giữa đường lỗi (VD race trùng giờ) | Lô trước đã tạo vẫn giữ, lô sau vẫn thử, log lỗi rõ |
| `enabled: false` | Không gọi `CreateDrawUseCase`, log "skipped: disabled" |
| Config thiếu (doc cũ) | `enabled: false`, không crash |
| `openImmediately: false` | Slot tạo ở `Scheduled`, không `SalesOpen` |
| Audit log sau khi tạo | `actor` là hệ thống, phân biệt được với staff |
| 2 nhịp chạy chồng nhau | Nhịp thứ 2 không lấy được lock, thoát sớm, không tạo trùng |

Nhóm case in đậm là **nhóm mới của mô hình reconcile**. Ba case quan trọng nhất:

- *"Hôm nay thiếu 3 kỳ giữa lưới"* — chính lý do tồn tại của reconcile. Bản đầu fail case này.
- *"Slot từng có draw đã `Void`"* — nếu fail, worker sẽ tạo lại kỳ staff vừa void, mỗi 5 phút một lần.
  Đây là **case nguy hiểm nhất** của giai đoạn 1.
- *"`maxDrawsPerRun: 0`"* — `0` nghĩa là **không cắt**, không phải "không tạo gì". Dễ code sai thành
  `slice(0, 0)` → worker im lặng không bao giờ tạo kỳ nào.

## 3. Giai đoạn 2 — Đóng bán tự động

### 3.1 `EvaluateAutoCloseListUseCase` — lọc kỳ cần đóng

**File:** `packages/game-keno-application/src/use-cases/operations/evaluate-auto-close-list.ts`

```typescript
/**
 * Lọc kỳ `SalesOpen` đã qua `closeAt + graceSeconds` — THUẦN RULE, KHÔNG mutation.
 *
 * TÁI DÙNG `GetOpsHubSnapshotUseCase` (p0-03) làm nguồn — không thêm query riêng. Hub đã
 * đọc toàn bộ kỳ chưa hoàn thành (bao gồm `SalesOpen`) trong 1 trong 4 query cố định.
 */
export class EvaluateAutoCloseListUseCase extends UseCase<EvaluateAutoCloseInput, AutoCloseList> {
  protected async execute(input: EvaluateAutoCloseInput): Promise<AutoCloseList> {
    const now = input.now; // truyền vào, KHÔNG Date.now() trong loop — cùng lý do p2-04 §2.3
    const due = input.rows.filter(
      (r) => r.status === DrawStatus.SalesOpen && now.getTime() >= r.closeAt.getTime() + input.config.graceSeconds * 1000,
    );
    // Sort drawId tăng, cắt theo maxDrawsPerRun — pattern giống RunLimitReached của settle,
    // nhưng KHÔNG cần AutoSettleSkipReason riêng: đóng bán không có "lý do bị chặn" phức tạp
    // như settle (không check alert/exposure) — chỉ có "đủ điều kiện" hoặc "chưa tới giờ".
    return { due: due.slice(0, input.config.maxDrawsPerRun), totalDue: due.length };
  }
}
```

### 3.2 Worker

**File:** `apps/worker-keno/src/handlers/auto-close.ts`

```typescript
/**
 * Worker Auto-Pilot giai đoạn 2 — tự đóng bán kỳ đã qua giờ nhận cược.
 *
 * Chạy mỗi 2 phút. KHÔNG cần dry-run mode: đóng bán không có ngưỡng rủi ro để quan sát trước
 * (khác settle) — hoặc kỳ đã qua `closeAt` (đóng đúng), hoặc chưa (không đóng). Không có
 * vùng xám cần staff review trước khi giao quyền.
 *
 * Gọi `CloseSalesUseCase.run()` LẶP qua từng `drawId` trong `due` — KHÔNG cần bulk API mới
 * kiểu `BulkTriggerSettleUseCase` (đóng bán là 1 update Mongo đơn, không có Step Function,
 * không cần concurrency cap 5 — rẻ hơn settle hàng trăm lần). `Promise.all` với cap đơn giản
 * (VD `pMap` concurrency 10) là đủ, KHÔNG cần thiết kế partial-success phức tạp như p0-04 vì
 * mỗi lệnh độc lập hoàn toàn, không chia sẻ transaction hay resource nào.
 */
```

Điểm phải làm đúng:

1. **Đọc `enabled` TƯƠI**, TTL ≤ 30s — giống mọi giai đoạn khác.
2. **1 kỳ lỗi không chặn kỳ khác** — mỗi `CloseSalesUseCase.run()` độc lập, bọc try/catch riêng.
3. **KHÔNG retry mù.** Cron 2 phút sau tự đánh giá lại — kỳ lỗi lần này vẫn `SalesOpen`, sẽ được thử
   lại tự nhiên ở nhịp sau.
4. Actor hệ thống — giống §2.2 điểm 4.

### 3.3 Test

| Case | Kỳ vọng |
|---|---|
| Kỳ `SalesOpen`, đã qua `closeAt` | Có trong `due` |
| Kỳ `SalesOpen`, chưa qua `closeAt` | KHÔNG trong `due` |
| Kỳ `SalesOpen`, qua `closeAt` nhưng chưa qua `closeAt + graceSeconds` | KHÔNG trong `due` |
| Kỳ đã `SalesClosed`/`Published`/... | KHÔNG trong `due` (không phải `SalesOpen`) |
| 20 kỳ due, `maxDrawsPerRun = 5` | Đúng 5 kỳ due (5 cũ nhất theo `drawId`), `totalDue = 20` |
| 1 kỳ lỗi khi đóng (race) | 19 kỳ còn lại vẫn đóng, log lỗi kỳ đó |
| `enabled: false` | Không gọi `CloseSalesUseCase` nào |
| Chạy 2 lần liên tiếp | Lần 2 không đóng lại kỳ đã đóng (đã `SalesClosed`, không còn trong `due`) |

## 4. Serverless config

Thêm 2 function vào `apps/worker-keno/serverless.yml` — mirror pattern `stats.yml`/`fetch.yml`:

```yaml
# apps/worker-keno/src/functions/auto-pilot.yml
auto-open:
  handler: src/handlers/auto-pilot/auto-open.handler
  timeout: 300
  events:
    - schedule:
        # RECONCILE: chạy mỗi 5 phút, mỗi nhịp bù đủ phần lưới còn thiếu trong horizon.
        # KHÔNG có logic "đã tới giờ chưa" ở handler — cron dày + hành động idempotent.
        rate: cron(*/5 * * * ? *)
        enabled: true

auto-close:
  handler: src/handlers/auto-pilot/auto-close.handler
  timeout: 60
  events:
    - schedule:
        rate: cron(*/2 * * * ? *)
        enabled: true
```

**`timeout: 300` cho `auto-open`** (không phải 60 như `auto-close`): nhịp đầu sau khi bật `horizonDays: 2`
có thể phải tạo 200+ kỳ = nhiều lô tuần tự × transaction Mongo mỗi lô. Nhịp thường lệ chỉ tạo 0–2 kỳ nên
chạy trong ~1s — timeout dài chỉ là biên an toàn cho nhịp đầu, không phải chi phí thường xuyên.

**Reconcile làm biến mất một vấn đề của bản đầu.** Bản đầu phải dùng cron mỗi giờ + handler tự so
`now.getHours() === configuredHour`, vì hardcode phút vào EventBridge rate sẽ khiến đổi `runAtLocalTime`
qua UI **không có hiệu lực** cho tới khi redeploy — phá nguyên tắc "cấu hình được từ UI" (`p2-01` §2).

Với reconcile, **không còn "giờ chạy" nào để cấu hình** → không còn logic so khớp giờ trong handler, không
còn rủi ro lệch giữa cron rate và config. `nextDayFromLocalTime` vẫn là time gate, nhưng nó là gate **cho
phạm vi công việc** (được xét ngày mai chưa), không phải gate **cho việc worker có chạy hay không** — sai
lệch của nó chỉ làm chậm việc tạo kỳ ngày mai vài nhịp, không làm mất cả ngày.

**Không đụng Step Functions ASL** — cả 2 giai đoạn này không dùng SFN, không có ASL nào liên quan.

## 5. Review checklist

- [ ] Gọi **đúng** `CreateDrawUseCase`/`CloseSalesUseCase` đã có, không viết logic tạo/đóng kỳ song song.
- [ ] `EvaluateAutoOpenPlanUseCase`/`EvaluateAutoCloseListUseCase` **không** mutation nào.
- [ ] Mở kỳ: tính `missingSlots` TRƯỚC khi gọi `CreateDrawUseCase` — không gọi thẳng cả lưới giờ.
- [ ] Mở kỳ: chunk đúng theo `KENO_CREATE_DRAW_BATCH_MAX`, tuần tự không `Promise.all` giữa lô.
- [ ] Đóng bán: filter theo `closeAt + graceSeconds`, KHÔNG dựa `CloseSalesUseCase` tự chặn thời gian.
- [ ] Mở kỳ: quét **MỌI ngày** trong `[today, today + horizonDays]`, KHÔNG chỉ 1 ngày (§2.1 reconcile).
- [ ] Mở kỳ: **loại slot đã có draw đã `Void`** — verify `listDrawTimesByDate` trả cả draw void (§2.1).
- [ ] Mở kỳ: **loại slot có `drawTime` đã qua**.
- [ ] Mở kỳ: `nextDayFromLocalTime` chỉ gate ngày > hôm nay; **hôm nay không có gate giờ nào**.
- [ ] Mở kỳ: `maxDrawsPerRun = 0` nghĩa là không cắt (tạo hết), không phải "không tạo gì".
- [ ] Mở kỳ: có distributed lock per-game chống 2 nhịp chồng nhau (§2.2 JSDoc).
- [ ] Mở kỳ: log `byDate` đủ để biết ngày nào còn thiếu bao nhiêu.
- [ ] Cả 2 handler đọc `enabled` TƯƠI.
- [ ] Cả 2: actor truyền vào audit là actor hệ thống cố định, phân biệt được với staff.
- [ ] **KHÔNG** có logic so khớp "đã tới giờ chạy chưa" trong `auto-open` handler — reconcile không cần (§4).
- [ ] KHÔNG retry tự động khi 1 item lỗi — dựa vào nhịp cron sau tự đánh giá lại.
- [ ] KHÔNG có code đường void/resettle nào được thêm (kế thừa `p2-01` §0.1).
- [ ] Mỗi game 1 pair handler riêng (Keno / Bingo18), không gộp.
- [ ] `pnpm check-types` + `pnpm lint` xanh.
- [ ] **Không** `biome-ignore` cho `noFloatingPromises`.

## 6. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| **Worker tạo lại kỳ staff vừa `Void`** — máy đảo ngược quyết định của người | 🔴 | Loại slot đã có draw **kể cả void**; verify `listDrawTimesByDate` không filter bỏ void (§2.1) |
| Mở kỳ lỗi làm thiếu kỳ → người chơi không có gì cược | 🟢 | **Reconcile đã hạ mức rủi ro này** (bản đầu 🟡): nhịp sau bù trong 5-10 phút, không mất cả ngày. Hub UI vẫn hiện rõ thiếu kỳ |
| Tạo kỳ có `drawTime` đã qua → rác dữ liệu | 🟡 | Loại slot quá khứ trong `EvaluateAutoOpenPlanUseCase` |
| 2 nhịp cron chồng nhau cùng tạo 1 slot | 🟡 | Distributed lock per-game; `CreateDrawUseCase` guard 6 là lớp chặn cuối (throw, không tạo trùng) |
| Race giữa staff tạo tay và worker mở kỳ cùng lúc | 🟡 | Đọc `existingDrawTimes` ngay trước khi gọi create — vẫn có khe race nhỏ, guard 6 tự chặn, lô đó throw, log lỗi, không rollback phần đã tạo trước |
| Nhịp đầu sau khi bật `horizonDays: 2` tạo 200+ kỳ → Lambda timeout | 🟡 | `timeout: 300` + `maxDrawsPerRun` cắt bớt mỗi nhịp; phần dư nhịp sau tạo tiếp |
| Đóng bán trễ vài phút do worker chạy thưa | 🟢 | `PlaceBetUseCase` tự chặn cược sau `closeAt` bằng timestamp — trễ đóng KHÔNG cho cược thêm được |
| Actor không phân biệt được máy/người trong audit | 🟡 | Actor hệ thống cố định, dễ filter trong audit log |
| Ai đó quay lại mô hình cron-1-lần/ngày vì "đơn giản hơn" | 🟢 | Header plan + `p2-01` §3.1 ghi rõ 2 lý do kỹ thuật khiến nó không đủ |

## 7. Rollback

Set cả 2 `enabled: false` (Game Config) → xác nhận không còn cron action nào chạy → revert commit /
xoá 2 EventBridge schedule. Kỳ đã tạo/đóng tự động **vẫn đúng** — đi qua đúng use-case đơn, không khác
gì staff làm tay.
