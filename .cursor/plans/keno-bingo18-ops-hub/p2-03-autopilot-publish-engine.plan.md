# p2-03 — Engine tự động nhận kết quả (giai đoạn 3)

> **Phase:** P2 · **Status:** ⏳ pending · **Phụ thuộc:** p2-01 · **Chặn:** p2-04
> **PHỤ THUỘC BÊN NGOÀI CỨNG:** [`resultfeed/00-overview.md`](../resultfeed/00-overview.md) phải đạt
> **G5** ("MegaWin core PULL, manual approve mỗi kỳ") TRƯỚC khi plan này có thể chạy thật. Plan này
> CHÍNH LÀ phần core-side của **G6** ("Auto-publish có ngưỡng exposure + kill-switch") trong roadmap
> ResultFeed — không phải một thiết kế song song, độc lập.
> **Nguồn:** [`p2-01-autopilot-config.plan.md`](./p2-01-autopilot-config.plan.md) §0, §3.3

## 1. Việc này KHÔNG làm — ranh giới với ResultFeed

Plan này **không** đụng bất kỳ phần fetch/parse/consensus/verify nào — đó là việc của
`apps/worker-resultfeed` + `.cursor/plans/resultfeed/`. Plan này chỉ làm **phía core PULL**, đúng D7
của ResultFeed: *"MegaWin core PULL, ResultFeed không biết gì về MegaWin."*

Việc DUY NHẤT plan này thêm: 1 use-case core đọc `VietlottResultClient.getResult()` (interface ĐÃ CÓ,
đang dùng bởi `GetVietlottResultUseCase` cho autofill tay) theo lịch, và nếu đủ điều kiện tin cậy +
exposure, tự gọi publish — thay vì chờ staff bấm "Dùng gợi ý" trên dialog.

**Nếu ResultFeed chưa đạt G5 khi PR này review:** merge được (code không hoạt động gây hại — `enabled`
mặc định `false`, và dù `true`, `getResult()` sẽ luôn trả `found: false` nếu chưa có consensus nào),
nhưng **không được set `enabled: true` ở bất kỳ môi trường nào** cho tới khi ResultFeed xác nhận G5
xong với dữ liệu thật.

## 2. Vì sao KHÔNG tái dùng thẳng `PublishResultUseCase`

Đọc lại comment trong chính `publish-result.ts` (dòng ~113-115):

```typescript
// `source: Manual` — form này chỉ dùng cho staff nhập tay qua backoffice (0 caller
// tự động hiện tại). Auto-import (chưa triển khai) sẽ set `Import`/`Vietlott` qua
// use-case riêng, KHÔNG đi qua đường này.
```

Đây là quyết định **đã có sẵn trong code**, không phải quyết định mới của plan này — `PublishResultUseCase`
hard-code `source: DrawResultSource.Manual` ở CẢ HAI nhánh (publish lần đầu và republish). Auto-Pilot
giai đoạn 3 cần `source: DrawResultSource.Vietlott` (giá trị enum đã tồn tại sẵn, xem
`game-core.enums.ts`) để audit trail phân biệt được "máy tự nhận kết quả" với "staff nhập tay".

**Quyết định: viết `AutoPublishResultUseCase` mới**, KHÔNG sửa `PublishResultUseCase` để nhận thêm
param `source` — 2 lý do:

1. `PublishResultUseCase` phục vụ CẢ publish-lần-đầu VÀ republish (resettle) — 2 nhánh dùng chung 1
   class vì UI dialog dùng chung. Auto-Pilot **chỉ được** publish lần đầu (§0.1 của `p2-01`, không
   bao giờ resettle) — nếu thêm `source` param vào `PublishResultUseCase`, phải cẩn thận chặn nhánh
   republish khỏi nhận `source: Vietlott` từ auto, dễ để hở 1 đường resettle tự động ngoài ý muốn.
2. `AutoPublishResultUseCase` riêng cho phép ràng buộc CỨNG ngay trong type: input KHÔNG có field nào
   liên quan tới republish, và bản thân class chỉ implement code path publish-lần-đầu (mirror đúng
   nhánh `publish()` private method của `PublishResultUseCase`, KHÔNG mirror nhánh `hasSettledBefore`).

**File:** `packages/game-keno-application/src/use-cases/draws/auto-publish-result.ts`

```typescript
/**
 * Tự nhận kết quả từ ResultFeed cho kỳ `SalesClosed` CHƯA CÓ `result` — KHÔNG BAO GIỜ
 * republish/resettle (khác `PublishResultUseCase`, class này KHÔNG có nhánh đó, xem
 * `p2-03-autopilot-publish-engine.plan.md` §2).
 *
 * `source` LUÔN là `DrawResultSource.Vietlott` — phân biệt audit trail với `Manual` (staff
 * nhập tay qua `PublishResultUseCase`).
 */
export class AutoPublishResultUseCase extends UseCase<AutoPublishResultInput, AutoPublishResultOutput> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: AutoPublishResultInput): Promise<AutoPublishResultOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    // Hard rule 1: CHỈ publish lần đầu — kỳ phải đang SalesClosed, CHƯA có result.
    if (draw.status !== DrawStatus.SalesClosed) {
      throw AppException.badRequest(
        `Kỳ ${input.drawId} không ở trạng thái SalesClosed (đang "${draw.status}") — Auto-Pilot ` +
          "không tự publish cho kỳ đã có kết quả hoặc chưa đóng bán.",
      );
    }

    const stats = computeDrawStats(input.winningNumbers);
    const resultData = { winningNumbers: input.winningNumbers, ...stats, publishedAt: new Date(), source: DrawResultSource.Vietlott };
    const updated = await this.drawRepo.publishResult(input.drawId, resultData, input.vietlottRef);
    // ... build output, audit riêng (auditAutoPublishResult — actor hệ thống, xem §5 điểm 4)
  }
}
```

**Trùng lặp code với `PublishResultUseCase.publish()` là CÓ CHỦ Ý, không phải DRY vi phạm cần sửa** —
tách class ép compiler + review giữ nguyên ranh giới "auto chỉ publish lần đầu" mà không phải nhớ tự
kiểm tra branch mỗi lần đọc code. Nếu 2 class trôi khác nhau về cách tính `stats`/`resultData` sau này
(VD field mới), đó là dấu hiệu cần factor ra 1 helper CHUNG PURE (`buildResultData()`), KHÔNG factor
ra use-case chung.

## 3. `EvaluateAutoPublishListUseCase` — lọc kỳ đủ điều kiện

**File:** `packages/game-keno-application/src/use-cases/operations/evaluate-auto-publish-list.ts`

```typescript
/**
 * Lọc kỳ `SalesClosed` (chưa có result) có kết quả ResultFeed ĐỦ TIN CẬY theo config — THUẦN
 * RULE, KHÔNG mutation, KHÔNG gọi `AutoPublishResultUseCase`.
 *
 * PHẢI gọi `VietlottResultClient.getResult()` cho MỖI kỳ trong danh sách `SalesClosed` — đây
 * là N lệnh gọi ra ResultFeed (khác 4 query cố định của Hub, §00-overview nguyên tắc #2 KHÔNG
 * áp dụng ở worker nội bộ này, chỉ áp dụng cho Hub UI). Chấp nhận vì N ở đây là số kỳ
 * `SalesClosed` cùng lúc — thực tế nhỏ (Keno ~1-3 kỳ đang chờ kết quả tại mọi thời điểm, không
 * phải backlog hàng trăm kỳ như settle).
 *
 * TỐI ƯU BẮT BUỘC: lọc `now > drawTime + minMinutesAfterDrawTime` **TRƯỚC** khi gọi
 * `getResult()`. Kỳ chưa tới giờ quay chắc chắn chưa có kết quả — gọi ResultFeed cho nó là
 * lãng phí thuần, và nó là phần lớn số kỳ nếu grid dày. Lọc trước cắt N xuống gần đúng số kỳ
 * thực sự đang chờ kết quả.
 *
 * KHÔNG đọc `keno_draw_betting_stats` — giai đoạn 3 không dùng exposure (§3 bên dưới).
 */
export class EvaluateAutoPublishListUseCase extends UseCase<EvaluateAutoPublishInput, AutoPublishEvaluation> {
  // ...
}
```

Output:

```typescript
export interface AutoPublishEvaluation {
  eligible: AutoPublishDecision[];
  skipped: AutoPublishDecision[];
  evaluatedAt: Date;
}

export interface AutoPublishDecision {
  drawId: string;
  eligible: boolean;
  reasons: AutoPublishSkipReason[];
  /** `null` khi ResultFeed chưa có kết quả — KHÔNG phải lỗi. */
  resultFound: boolean;
}
```

```typescript
export const AutoPublishSkipReason = {
  NotSalesClosed: "not_sales_closed",
  AlreadyHasResult: "already_has_result",
  /** `getResult()` trả `null` — ResultFeed chưa publish kết quả cho kỳ này. KHÔNG phải lỗi. */
  ResultNotFound: "result_not_found",
  /** Chưa tới giờ quay (+ `minMinutesAfterDrawTime`) — sanity check nguồn ngoài. */
  DrawTimeNotReached: "draw_time_not_reached",
  /** Kết quả trả về sai định dạng game (số lượng số, range, trùng lặp). */
  InvalidResultShape: "invalid_result_shape",
  RunLimitReached: "run_limit_reached",
} as const;
export type AutoPublishSkipReason = (typeof AutoPublishSkipReason)[keyof typeof AutoPublishSkipReason];
```

**Đã bỏ 3 lý do so với bản đầu** (`NotHumanVerified`, `SourceCountTooLow`, `ExposureTooHigh`) — cùng lý
do đã bỏ 3 field config tương ứng, xem [`p2-01`](./p2-01-autopilot-config.plan.md) §3.3. Ngắn gọn: quy
trình verify là quy tắc **nội bộ ResultFeed** (`getResult()` non-null ĐÃ nghĩa là "dùng được"), và
exposure thuộc giai đoạn settle vì publish không chi đồng nào.

**Thêm 2 lý do MỚI** — cả hai là kiểm tra **tính hợp lệ cơ học** của dữ liệu nguồn ngoài, khác hẳn việc
đánh giá lại độ tin cậy nghiệp vụ:

- `DrawTimeNotReached` — kỳ chưa tới giờ quay thì mọi "kết quả" đều không thể đúng, dù nguồn trả gì.
- `InvalidResultShape` — Keno phải đúng 20 số, mỗi số `"01"`–`"80"`, không trùng. Sai shape → **dừng và
  bắn alert**, không ghi rồi sửa sau.

**Thu thập mọi lý do, không short-circuit** — cùng nguyên tắc §2.1 của `p2-04` (settle engine). Sort
`drawId` tăng trước khi cắt `maxDrawsPerRun` — cùng pattern `RunLimitReached`.

**Giai đoạn 3 KHÔNG đọc exposure.** Bản đầu có đoạn hướng dẫn lấy `stats.exposure.worstCaseTotal` — đã
bỏ cùng field `maxExposure` (`p2-01` §3.3). `EvaluateAutoPublishListUseCase` **không** cần chạm
`keno_draw_betting_stats` chút nào: nó chỉ cần `status`, `drawTime`, `vietlottRef.drawPeriod` từ draw doc
+ kết quả `getResult()`. Điều này làm use-case rẻ và độc lập hơn hẳn — không phụ thuộc worker stats-sync,
không phụ thuộc câu hỏi mở #1 của `00-overview.md` (RAW vs đã cap).

## 4. Worker

**File:** `apps/worker-keno/src/handlers/auto-pilot/auto-publish.ts`

```typescript
/**
 * Worker Auto-Pilot giai đoạn 3 — tự nhận kết quả ResultFeed đã xác minh cho kỳ đang chờ.
 *
 * Chạy mỗi 1 phút (khớp nhịp fetch của `worker-resultfeed`, xem `fetch.yml` — kết quả có thể
 * sẵn sàng ngay sau khi consensus chốt, chờ tới nhịp cron dài hơn là trễ không cần thiết).
 *
 * LUÔN đánh giá và LUÔN ghi log (dry-run pattern giống settle) — quan sát được "ResultFeed đã
 * có kết quả cho kỳ X nhưng máy CHƯA publish vì lý do Y" là điều kiện để tin tưởng trước khi
 * bật `enabled`.
 */
```

Điểm phải làm đúng — mirror mọi nguyên tắc của `p2-04` §3:

1. Đọc `enabled` TƯƠI.
2. LUÔN đánh giá + ghi log kể cả `enabled: false` (dry-run).
3. KHÔNG retry mù khi `AutoPublishResultUseCase` throw — cron phút sau tự đánh giá lại từ DB thật
   (kỳ đã publish sẽ tự bị loại vì không còn `SalesClosed`).
4. Mỗi game 1 handler riêng.
5. Log có cấu trúc.
6. **Không gọi `VietlottResultClient` trực tiếp từ nhiều nơi** — chỉ qua `EvaluateAutoPublishListUseCase`
   + `AutoPublishResultUseCase`, đúng như `GetVietlottResultUseCase` (autofill tay) đang làm — 1 client
   instance, wiring qua constructor injection giống pattern đã có.

## 5. Test

### 5.1 Unit rule engine

| Case | Kỳ vọng |
|---|---|
| Kỳ `SalesClosed`, ResultFeed trả kết quả hợp lệ, đã qua giờ quay | `eligible: true` |
| Kỳ `SalesClosed`, `getResult()` trả `null` | `eligible: false`, `ResultNotFound` |
| Kết quả có `verifiedByHuman: false`, `sourceCount: 1` | **`eligible: true`** — core KHÔNG đánh giá lại độ tin cậy của ResultFeed (`p2-01` §3.3) |
| Kỳ chưa tới `drawTime` nhưng ResultFeed đã trả kết quả | `eligible: false`, `DrawTimeNotReached` |
| ResultFeed trả 19 số (thiếu) hoặc có số `"81"` hoặc số trùng | `eligible: false`, `InvalidResultShape` + bắn alert |
| Kỳ đã có `result` (Published/Settled) | `eligible: false`, `AlreadyHasResult` — kể cả khi ResultFeed có kết quả khớp |
| Kỳ đang `SalesOpen` (chưa đóng bán) | `eligible: false`, `NotSalesClosed` |
| Kỳ exposure rất cao, kết quả hợp lệ | **`eligible: true`** — exposure KHÔNG chặn publish, chỉ chặn settle (`p2-01` §3.3) |
| Chạy 2 lần cùng input | Output giống hệt (deterministic) |
| `config.enabled = false` | Vẫn trả `eligible` đầy đủ (dry-run) |

Hai case in đậm là **test ranh giới thiết kế** — chúng khẳng định giai đoạn 3 cố ý KHÔNG có 2 loại kiểm
tra mà bản đầu từng có. Nếu ai đó thêm lại `requireHumanVerified`/`maxExposure`, 2 case này fail ngay.

### 5.2 `AutoPublishResultUseCase`

| Case | Kỳ vọng |
|---|---|
| Kỳ `SalesClosed`, chưa có result | Publish thành công, `source: Vietlott` |
| Kỳ đã `Published`/`Settled` | Throw `badRequest`, KHÔNG ghi đè |
| Kỳ `SalesOpen` | Throw `badRequest` |
| So sánh với `PublishResultUseCase` cho CÙNG input | `winningNumbers`/`stats` giống hệt, chỉ khác `source` |

### 5.3 Worker integration (staging, cần ResultFeed đã có dữ liệu thật ở G5)

| Bước | Kỳ vọng |
|---|---|
| `enabled: false`, ResultFeed có 2 kỳ verified | Log ghi 2 kỳ eligible, **0** publish |
| `enabled: true` | 2 kỳ publish, đúng `source: Vietlott`, kiểm tra `PUBLISHABLE_STATUSES` transition đúng |
| Chạy cron lần 2 ngay sau | **0** kỳ publish thêm (đã `Published`) |
| Kỳ ResultFeed sửa lại kết quả SAU KHI đã auto-publish | Auto-Pilot **không** tự cập nhật — đây LÀ nhánh resettle, phải người xử lý (§0.1 của `p2-01`) |

Case cuối cùng là test ranh giới quan trọng nhất của plan này — **bắt buộc pass**.

## 6. Review checklist

- [ ] `AutoPublishResultUseCase` là class RIÊNG, KHÔNG sửa `PublishResultUseCase` để nhận `source`.
- [ ] `AutoPublishResultUseCase` **không có** code path nào xử lý republish/resettle.
- [ ] `source` luôn `DrawResultSource.Vietlott`, không bao giờ `Manual`/`Import`.
- [ ] Đánh giá **tách hoàn toàn** khỏi hành động; `EvaluateAutoPublishListUseCase` không mutation.
- [ ] Dry-run hoạt động: `enabled: false` vẫn đánh giá + log, không publish.
- [ ] `enabled` đọc tươi.
- [ ] **KHÔNG** có `requireHumanVerified`/`minSourceCount`/`maxExposure` — 3 field đã bỏ có lý do (`p2-01` §3.3).
- [ ] **KHÔNG** đọc `keno_draw_betting_stats` — giai đoạn 3 không cần exposure.
- [ ] Có validate shape kết quả (Keno: 20 số, `"01"`–`"80"`, không trùng) + bắn alert khi sai.
- [ ] Có sanity check `now > drawTime` (+ `minMinutesAfterDrawTime`).
- [ ] Hard rule "chỉ publish kỳ CHƯA có result" — test §5.1 case `AlreadyHasResult` pass.
- [ ] KHÔNG retry mù khi publish lỗi.
- [ ] `AutoPublishSkipReason` là `const as const` + type dẫn xuất.
- [ ] Không import gì từ `@megawin/resultfeed*` trực tiếp — chỉ qua interface `VietlottResultClient`
      (đã có, D7 boundary của `resultfeed`).
- [ ] KHÔNG dùng LLM/eve ở bất kỳ bước quyết định nào.
- [ ] Test deterministic pass.
- [ ] `pnpm check-types` + `pnpm lint` xanh.

## 7. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| **Publish sai kết quả → mọi settle sau đó sai theo** | 🔴 | Kế thừa bất biến D6 của ResultFeed (nguồn đã tự chốt độ tin cậy) + validate shape + sanity `now > drawTime` + dry-run ≥ 1 tuần |
| Bật `publish.enabled` trước khi ResultFeed đạt G5 | 🔴 | Vô hại về mặt kỹ thuật (`found: false` mãi) nhưng gây hiểu nhầm — banner UI (`p2-01` §5.2) + checklist review |
| Auto-Pilot vô tình publish đè kết quả cũ | 🔴 | Hard rule "chỉ `SalesClosed`, chưa có result" ở CẢ `EvaluateAutoPublishListUseCase` VÀ `AutoPublishResultUseCase` (2 lớp, không chỉ 1) |
| `AutoPublishResultUseCase` và `PublishResultUseCase` trôi logic khác nhau theo thời gian | 🟡 | Nếu phát hiện lệch, factor `buildResultData()` pure helper CHUNG, không factor use-case |
| Gọi ResultFeed N lần/nhịp cron làm chậm worker | 🟢 | N nhỏ (kỳ `SalesClosed` đang chờ, thực tế 1-3 kỳ cùng lúc) |
| ResultFeed publish kết quả sai (nguồn sai/consensus sai) | 🟡 | **Không chống được ở tầng này** — core tin quyết định của ResultFeed. Phòng thủ đúng chỗ là ở ResultFeed (D6, consensus nhiều nguồn). Core chỉ chống sai **cơ học**: shape + `drawTime`. Ghi rõ ranh giới này để không ai tưởng core đang kiểm tra hộ |

## 8. Rollback

**Kill switch trước, revert sau** — giống `p2-04` §8:

1. Set `publish.enabled: false` (Game Config).
2. Xác nhận log không còn kỳ nào được auto-publish.
3. Revert commit / xoá EventBridge schedule.

Kỳ đã auto-publish **vẫn đúng** dữ liệu — chỉ khác `source: Vietlott` trong audit trail so với staff
publish tay. KHÔNG cần sửa dữ liệu draw đã publish khi rollback.
