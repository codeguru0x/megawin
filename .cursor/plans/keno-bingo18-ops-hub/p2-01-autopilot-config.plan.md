# p2-01 — `OpsAutoPilotConfig` (cấu hình Auto-Pilot toàn vòng đời kỳ quay)

> **Phase:** P2 · **Status:** ⏳ pending · **Phụ thuộc:** p1-04 · **Chặn:** p2-02, p2-03, p2-04, p2-05
> **Điều kiện bắt đầu:** Hub chạy production **≥ 2 tuần**, staff đã dùng bulk-settle tay thật sự
> **Nguồn:** [`keno-bingo18-autopilot-eve-feasibility.analysis.md`](../../analysis/keno-bingo18-autopilot-eve-feasibility.analysis.md) §3.1
> **Mở rộng 06/09/2026:** scope ban đầu chỉ có auto-settle. Mở rộng sang **4 giai đoạn** vòng đời kỳ
> quay: mở bán → đóng bán → nhận kết quả → kết sổ. Void/resettle **VĨNH VIỄN** thủ công — xem §0.
> **Sửa lớn 07/09/2026** (sau khi khảo sát code thật, 3 thay đổi phá vỡ bản trước):
> 1. **§3.1 `open`** — chuyển từ cron-1-lần/ngày sang **reconcile** mỗi 5–10 phút (tự lành, bù được kỳ
>    thiếu của hôm nay). `runAtLocalTime`/`advanceDays` bị thay.
> 2. **§3.3 `publish`** — **bỏ** `requireHumanVerified`, `minSourceCount`, `maxExposure`. Quy trình
>    verify là quy tắc nội bộ ResultFeed; exposure thuộc giai đoạn settle.
> 3. **§3.4 `settle`** — **viết lại toàn bộ**. Phát hiện chặn: `DrawFinancial`/`DrawStats` là **POST-settle**
>    nên bản trước đọc field luôn `undefined`. Nguồn đúng là `keno_draw_betting_stats`. Ngưỡng đổi từ
>    "tiền tuyệt đối" sang **chỉ số rủi ro chuẩn hoá**; thêm fail-safe chống stats cũ; `minAgeMinutes` →
>    `settleDelayMinutes`; `allowWithWarningAlerts` → `alertPolicy` 3 lớp (§3.5).
>
> **Sửa lớn 07/09/2026 — LẦN 2, đổi hướng §3.4 sang "kết sổ thử":** nhận ra giai đoạn 4 chỉ xét kỳ đã
> `Published` ⇒ **đã có 20 số trúng**, và Keno 100% giải cố định ⇒ **số tiền phải trả tính được CHÍNH
> XÁC**, không cần proxy. Toàn bộ khung "4 câu hỏi + proxy exposure" của lần 1 sinh từ giả định *"chưa
> biết payout thật"* — giả định đó **sai với giai đoạn 4** (nhưng vẫn đúng với giai đoạn 1–2, nên proxy
> giữ nguyên cho monitor/alert lúc bán vé). Thay đổi:
> - Ngưỡng đổi sang **số tiền thật**: `maxPayoutRatio`, `maxPayoutAbsolute`, `minNetProfit`,
>   `maxSingleEntryPayout`, `blockOnCapTriggered`. **Bỏ** `maxExposureRatio`, `maxExposureAbsolute`,
>   `maxSingleEntryShare`, `capSetsGuardRatio`, `maxStatsStalenessSeconds`, `maxEntries`.
> - `maxStatsStalenessSeconds` (đo độ cũ bằng đồng hồ) → `preview.resultFingerprint` (so định danh kết
>   quả) — dứt khoát hơn, không còn vùng xám thời gian.
> - Hiệu chuẩn: dry-run 2 tuần → **backfill 30 ngày lịch sử (~1 ngày)**, vì số thật đối chiếu ngược về
>   quá khứ được (`draw.financial` là đáp án). Kèm 3 lớp kiểm chứng độc lập (§3.4.5).
> - **2 plan mới:** [`p2-04a`](./p2-04a-settle-payout-extract.plan.md) (extract `computeEntryPayout`,
>   refactor thuần) + [`p2-04b`](./p2-04b-settle-preview-engine.plan.md) (engine tính số thật, nhánh
>   riêng, KHÔNG chạm entries/draw/pipeline).
> - §3.4.2-OLD / §3.4.3-OLD / §3.4.4-OLD giữ lại **chỉ để tra cứu**, ⛔ **KHÔNG code theo**.

## 0. Scope mở rộng — 4 giai đoạn, ranh giới cứng

User yêu cầu (06/09/2026): Auto-Pilot không chỉ kết sổ, mà còn tự **mở kỳ** (ví dụ mở kỳ cho ngày mai
vào 23h hôm nay), tự **đóng bán** (hết giờ nhận cược), tự **nhận kết quả**, và tự **kết sổ** — nhưng
**chỉ khi đã có kết quả**; nếu chưa có kết quả thì dừng, không tự tạo ra kết quả bằng cách khác.
**Void và resettle mãi mãi là việc của con người.**

Bốn giai đoạn tương ứng 4 use-case ĐÃ CÓ, KHÔNG viết mới:

| # | Giai đoạn | Use-case đơn (đã có) | Draw status transition | Plan con |
|---|---|---|---|---|
| 1 | Mở kỳ (tạo + mở bán) | `CreateDrawUseCase` (`openNow: true`) | *(mới)* → `SalesOpen` | `p2-02` |
| 2 | Đóng bán | `CloseSalesUseCase` | `SalesOpen` → `SalesClosed` | `p2-02` |
| 3 | Nhận kết quả | `AutoPublishResultUseCase` (**PULL, không tự bịa**) | `SalesClosed` → `Published` | `p2-03` |
| 4 | Kết sổ | `BulkTriggerSettleUseCase` (p0-04) | `Published` → `Settling` → `Settled` | `p2-04` |

**Không có giai đoạn 5.** Void (`DrawStatus.Voiding/Void`) và resettle (settle lại kỳ đã `Settled`) —
**không có config `enabled`, không có worker, không bao giờ tự động** — xem §0.1.

### 0.1 Vì sao void/resettle bị loại — vĩnh viễn, không phải "chưa làm"

Ba lý do, mỗi lý do một mình đã đủ để loại:

1. **Không đối xứng rủi ro với 4 giai đoạn còn lại.** Mở kỳ/đóng bán/nhận-kết-quả-đã-verify/kết sổ
   lần đầu là hành động **tiến tới phía trước** trên đúng 1 đường — sai thì kỳ đó bị kẹt, dễ thấy, dễ
   khoanh vùng. Void/resettle là hành động **đảo ngược tiền đã tính** — sai thì tiền đã trả sai
   hướng, phải đòi lại từ người chơi/đại lý, thiệt hại lan ra ngoài hệ thống.
2. **`p2-01` (bản gốc) đã chốt điều này làm hard-coded condition** (§4 cũ, giữ nguyên ở `p2-04` §4):
   *"Kỳ đã có `settledAt` → NEVER auto-resettle."* Mở rộng lần này **không đảo lại** quyết định đó —
   chỉ thêm 3 giai đoạn TRƯỚC kết sổ, không đụng ranh giới sau kết sổ.
3. **Void luôn cần lý do nghiệp vụ do người đưa ra** (lỗi vé, gian lận, sự cố kỹ thuật) — không có
   ngưỡng số nào (`maxRevenue`, `maxExposure`...) đủ để máy "phát hiện" một kỳ cần void. Void không
   phải hàm của dữ liệu kỳ đó, mà là hàm của **một sự kiện bên ngoài** máy không quan sát được.

**Enforce bằng thiết kế, không chỉ bằng tài liệu:** `OpsAutoPilotConfig` (§3) **không có** field nào
tên `void`/`resettle`/`allowResettle`. Không có nhánh code nào trong bất kỳ worker P2 gọi
`VoidDrawUseCase`/`BulkTriggerVoidUseCase` hoặc gọi settle trên kỳ đã có `settledAt`. Review checklist
mọi plan con (`p2-02` → `p2-05`) đều có dòng "không có code đường void/resettle nào được thêm".

## 1. Nguyên tắc: rule engine deterministic, KHÔNG LLM

Auto-Pilot **không** dùng eve/Mira/LLM để quyết định bất kỳ giai đoạn nào trong 4 giai đoạn trên. Mọi
ngưỡng là **số cấu hình được**, mọi quyết định **tái lập được** — cùng input cho cùng output, mọi lần.
Nguyên tắc này áp dụng đồng nhất cho cả 4 config con (§3.1–§3.4), không riêng phần settle.

Vai trò duy nhất của AI agent (Mira): **giải thích** quyết định đã ghi trong log (`p2-05`), bằng cách
**đọc lại** log — không suy luận, không quyết định, không mutation. Ranh giới này là tuyệt đối.

Lý do (§2 analysis): đây là đường tiền. LLM không tái lập được, không audit được, và không thể trả lời
"vì sao kỳ này được auto-settle" bằng bằng chứng kiểm tra được.

## 2. Vì sao config là plan RIÊNG, làm TRƯỚC engine

Config quyết định hình dạng của engine. Nếu làm engine trước rồi mới thêm config, engine sẽ có ngưỡng
hardcode "tạm thời" — và ngưỡng hardcode trong code auto-pilot là đúng thứ không được phép tồn tại.

Thêm nữa: plan này làm được **ngay** mà không bật gì cả. Mọi config con có `enabled: false` mặc định;
UI cấu hình dựng xong, staff nhập ngưỡng, quan sát — các engine (`p2-02`→`p2-04`) chỉ **đọc** config đã
được người điền.

## 3. Entity

**File:** `packages/game-keno/src/entities/game-config.ts` (nơi `OpsAlertsConfig`/`OpsStatsConfig` đang ở)

```typescript
/**
 * Cấu hình Auto-Pilot toàn vòng đời kỳ quay — per-game, nằm trong `ops` của GameConfig.
 *
 * 4 giai đoạn ĐỘC LẬP, mỗi giai đoạn `enabled` RIÊNG — không có switch tổng "bật hết Auto-Pilot".
 * Lý do tách: rủi ro tài chính của 4 giai đoạn KHÁC NHAU hoàn toàn — mở/đóng bán gần như không có
 * rủi ro tiền (chỉ chuyển trạng thái, chưa ai được trả thưởng), nhận-kết-quả có rủi ro trung bình
 * (sai số → mọi kết sổ sau đó sai), kết sổ có rủi ro cao nhất (chi tiền thật). Ép chung 1 switch sẽ
 * buộc staff either bật cả rủi-ro-cao khi chỉ muốn tiện lợi ở rủi-ro-thấp, hoặc không bật gì cả.
 *
 * TẤT CẢ ngưỡng cấu hình được, KHÔNG hardcode. `enabled: false` là mặc định BẮT BUỘC cho cả 4 —
 * không có trạng thái "bật với ngưỡng mặc định".
 *
 * KHÔNG có field `void`/`resettle` — xem `p2-01-autopilot-config.plan.md` §0.1. Đừng thêm.
 */
export interface OpsAutoPilotConfig {
  /** Giai đoạn 1 — tự tạo + mở bán kỳ cho ngày sắp tới. */
  open: OpsAutoOpenConfig;
  /** Giai đoạn 2 — tự đóng bán khi hết cửa sổ nhận cược. */
  close: OpsAutoCloseConfig;
  /** Giai đoạn 3 — tự nhận kết quả đã được ResultFeed xác minh (KHÔNG tự "đoán" kết quả). */
  publish: OpsAutoPublishConfig;
  /** Giai đoạn 4 — tự kết sổ kỳ đã có kết quả, dưới ngưỡng rủi ro cấu hình được. */
  settle: OpsAutoSettleConfig;
}
```

Thêm `autoPilot?: OpsAutoPilotConfig` vào `ops` của GameConfig — **optional**, thiếu → coi như cả 4
`enabled: false` (fail-safe: không có config = không tự động làm gì).

> **Phải verify:** đọc `packages/game-keno/src/entities/game-config.ts` để biết chính xác `ops` chứa
> những gì hiện tại (`alerts`, `stats`) và pattern optional đang dùng. Mirror đúng, không phát minh.
> Nếu field `autoSettle` (không lồng) đã từng được thêm bởi 1 PR khác trước plan này — **migrate**
> sang `autoPilot.settle`, không giữ 2 field song song.

### 3.1 Giai đoạn 1 — `OpsAutoOpenConfig` (mô hình **reconcile**, không phải cron-1-lần/ngày)

**Đổi thiết kế 07/09/2026.** Bản đầu dùng `runAtLocalTime` + `advanceDays: 1` — chạy đúng 1 lần/ngày
vào giờ cố định, tạo trọn ngày mai. Thiết kế đó **sai mô hình** vì 3 lý do đo được:

1. **Không tự lành.** Lần chạy 23:00 lỗi (DB timeout, lock bị giữ, Lambda cold-start quá hạn) → hôm sau
   **không có kỳ nào** để cược, và không có lần chạy thứ hai để bù. Rủi ro vận hành cao nhất của giai
   đoạn 1 (§JSDoc bên dưới) lại chính là thứ thiết kế đó không chống được.
2. **Không bù được kỳ thiếu của HÔM NAY.** Nếu staff tạo tay thiếu, hoặc 1 slot bị void và cần tạo lại,
   hoặc grid giờ quay được sửa giữa ngày → không có cơ chế nào phát hiện. Phải chờ tới 23:00 hôm sau,
   mà lúc đó nó chỉ lo ngày mai.
3. **`runAtLocalTime` buộc worker phải tự so giờ** để biết "đã tới lúc chưa" — logic đó vốn là thứ cron
   sinh ra để làm, và nó tạo ra bug biên giờ (DST không có ở VN nhưng lệch đồng hồ Lambda thì có).

**Thiết kế mới: worker chạy đều mỗi 5–10 phút, mỗi lần so "grid mong muốn" với "kỳ đã có trong DB", tạo
phần thiếu.** Đây là pattern **desired-state reconciliation** (giống controller Kubernetes): idempotent,
tự lành, không phụ thuộc một lần chạy nào thành công.

```typescript
/**
 * Tự tạo + mở bán kỳ để **luôn đủ** grid giờ quay trong cửa sổ `horizonDays` — chạy ĐỀU
 * (mỗi 5–10 phút), KHÔNG phải 1 lần/ngày vào giờ cố định.
 *
 * Mô hình: **reconcile**, không phải scheduled job. Mỗi lần chạy tự hỏi "ngày D cần N slot
 * theo grid, DB đang có M slot — tạo N−M slot còn thiếu". Không có state nào giữa 2 lần chạy;
 * lần chạy lỗi được lần sau bù tự động. Đây là lý do KHÔNG có `runAtLocalTime`.
 *
 * Rủi ro tài chính GẦN NHƯ BẰNG 0: tạo kỳ chỉ sinh doc `Scheduled`/`SalesOpen` trống, chưa
 * có ai cược, chưa có tiền. Rủi ro thật là RỦI RO VẬN HÀNH — thiếu kỳ thì người chơi không
 * có gì để cược, và mô hình reconcile tồn tại chính để chống đúng rủi ro đó.
 */
export interface OpsAutoOpenConfig {
  /** Bật/tắt. Mặc định `false`. */
  enabled: boolean;

  /**
   * Số ngày TƯƠNG LAI cần đảm bảo đủ kỳ, tính từ hôm nay.
   *
   * - `0` = chỉ bù kỳ thiếu của **hôm nay** (không tạo trước cho ngày mai).
   * - `1` = hôm nay **và** ngày mai (mặc định — khớp yêu cầu "mở kỳ cho ngày hôm sau").
   * - `2`+ = tạo xa hơn. Cho phép nhưng cảnh báo ở UI: Keno chỉ cho cược tối đa 20 kỳ liên
   *   tiếp, tạo xa hơn nhu cầu chỉ làm dài danh sách kỳ tương lai mà không ai cược tới.
   *
   * Hôm nay LUÔN được reconcile bất kể giá trị này — `horizonDays` chỉ mở rộng về phía trước.
   */
  horizonDays: number;

  /**
   * Giờ VN sớm nhất (format `"HH:mm"`) được tạo kỳ cho **ngày mai trở đi**. `undefined` =
   * tạo bất cứ lúc nào trong ngày.
   *
   * Đây là thứ THAY THẾ `runAtLocalTime` cũ, nhưng với ngữ nghĩa KHÁC HẲN: không phải "giờ
   * worker chạy" (worker chạy liên tục), mà là "cổng thời gian cho phần ngày-mai của việc
   * reconcile". Đặt `"23:00"` cho ra đúng hành vi user mô tả ban đầu ("mở kỳ cho ngày hôm sau
   * vào 11h tối") — nhưng nếu 23:00 lỗi thì 23:05, 23:10… vẫn tự bù, khác hẳn cron 1 lần.
   *
   * KHÔNG áp dụng cho việc bù kỳ thiếu của HÔM NAY — thiếu kỳ hôm nay là sự cố đang diễn ra,
   * phải bù ngay, không chờ tới giờ nào cả.
   */
  nextDayFromLocalTime?: string;

  /**
   * Số kỳ tối đa tạo mỗi lần worker chạy. `0` = tạo **hết** phần thiếu trong 1 lần (worker
   * vẫn tự chunk theo `KENO_CREATE_DRAW_BATCH_MAX` vì `CreateDrawUseCase` có trần riêng).
   *
   * Giá trị dương cho phép "rót từ từ": VD `20` với grid 119 kỳ/ngày → 6 lần chạy (30–60 phút)
   * là đủ cả ngày. Dùng khi muốn giảm burst ghi DB hoặc quan sát dần lúc mới bật.
   *
   * Đây KHÔNG phải cơ chế an toàn — dù `0` (tạo hết) cũng không gây rủi ro tài chính. Chỉ là
   * van điều tiết tải.
   */
  maxDrawsPerRun: number;

  /**
   * Mở bán ngay khi tạo (`openNow: true`) hay chỉ tạo ở `Scheduled`.
   * Mặc định `true` — khớp cách multi-draw hiện tại yêu cầu kỳ tương lai phải `SalesOpen` để
   * người chơi chọn cược trước (Keno tối đa 20 kỳ liên tiếp).
   */
  openImmediately: boolean;
}
```

**Hành vi reconcile mỗi lần chạy** (chi tiết thuật toán ở `p2-02` §2):

```
Với mỗi ngày D trong [hôm nay .. hôm nay + horizonDays]:
  ├─ Nếu D > hôm nay VÀ nextDayFromLocalTime đã set VÀ giờ hiện tại < nextDayFromLocalTime → BỎ QUA D
  ├─ desired = grid giờ quay của D theo game config (VD Keno 119 slot)
  ├─ actual  = slot đã có trong DB cho D (mọi status, KỂ CẢ Void — xem bảng hard-coded)
  ├─ missing = desired − actual, sort tăng theo drawTime
  └─ Tạo min(missing.length, maxDrawsPerRun || ∞) slot, chunk theo KENO_CREATE_DRAW_BATCH_MAX
```

**Hard-coded (không cấu hình được) cho giai đoạn 1:**

| Điều kiện | Vì sao không cấu hình được |
|---|---|
| Chỉ tạo slot **CHƯA CÓ** trong DB cho ngày đó | `CreateDrawUseCase.validateBatch` guard 6 là **all-or-nothing**: 1 slot trùng làm THROW cả lô. Worker (`p2-02`) phải tự tính phần còn thiếu rồi mới gọi |
| Slot đã tồn tại ở trạng thái **`Void`** vẫn tính là "đã có" → **KHÔNG tạo lại** | Tạo lại slot đã void là hành động **đảo ngược quyết định huỷ của con người** — cùng bản chất với resettle (§0.1). Nếu cần kỳ thay thế, người tạo tay |
| KHÔNG tạo cho ngày đã qua | `CreateDrawUseCase` guard 2 đã chặn sẵn ở tầng use-case đơn |
| KHÔNG vượt trần `KENO_CREATE_DRAW_BATCH_MAX` mỗi lần gọi | Worker phải **chunk** nếu số slot thiếu > trần batch — xem `p2-02` §2.2 |
| KHÔNG tạo slot có `drawTime` đã qua (dù thuộc hôm nay) | Kỳ mà giờ quay đã trôi qua thì tạo ra chỉ để chết — không ai cược được, và nó sẽ mắc ở `SalesOpen` mãi làm nhiễu Hub |

Dòng cuối là điểm dễ bỏ nhất: reconcile "bù kỳ thiếu hôm nay" phải lọc theo `drawTime > now`, nếu không
worker sẽ liên tục cố tạo lại các slot buổi sáng khi đang là buổi chiều.

### 3.2 Giai đoạn 2 — `OpsAutoCloseConfig`

```typescript
/**
 * Tự đóng bán (`SalesOpen` → `SalesClosed`) khi kỳ đã qua `closeAt`.
 *
 * Rủi ro tài chính GẦN NHƯ BẰNG 0: `PlaceBetUseCase` đã tự chặn cược sau `closeAt` bằng so
 * sánh timestamp trực tiếp (không phụ thuộc field `status`) — xem `place-bet.ts` dòng kiểm
 * tra kép `status === SalesOpen` VÀ `now < closeAt`. Đóng bán tự động chỉ đưa `status` cho
 * KHỚP với thực tế đã xảy ra — không tạo ra hành vi nghiệp vụ mới nào.
 *
 * Nhưng KHÔNG phải vô nghĩa: `PublishResultUseCase.PUBLISHABLE_STATUSES` yêu cầu
 * `SalesClosed` trở lên — kỳ kẹt ở `SalesOpen` quá `closeAt` sẽ KHÔNG nhận được kết quả dù
 * `close.enabled = false` không chặn publish trực tiếp (client vẫn publish tay được), nhưng
 * Auto-Pilot giai đoạn 3 (`publish`) SẼ bị chặn cho tới khi có ai đóng bán — do đó giai đoạn 2
 * là điều kiện tiên quyết THỰC TẾ cho giai đoạn 3 tự động, dù không phải điều kiện cấu hình.
 */
export interface OpsAutoCloseConfig {
  /** Bật/tắt. Mặc định `false`. */
  enabled: boolean;

  /**
   * Độ trễ cho phép (giây) sau `closeAt` mới đóng bán — không đóng NGAY tại thời điểm `closeAt`.
   * Mặc định `0`. Giá trị dương chỉ có ý nghĩa nếu worker chạy không đủ dày (VD mỗi 60s thì kỳ
   * có thể bị đóng muộn tới 60s dù `graceSeconds = 0` — đây là ĐỘ TRỄ WORKER, khác `graceSeconds`
   * là ĐỘ TRỄ CHỦ ĐÍNH nếu muốn cho vài giây dự phòng đồng hồ lệch).
   */
  graceSeconds: number;

  /** Trần số kỳ đóng bán mỗi lần worker chạy. Giữ pattern giống `maxDrawsPerRun` của settle. */
  maxDrawsPerRun: number;
}
```

**Hard-coded cho giai đoạn 2:**

| Điều kiện | Vì sao không cấu hình được |
|---|---|
| Chỉ đóng kỳ đang **`SalesOpen`** VÀ `now >= closeAt + graceSeconds` | `CloseSalesUseCase` bản thân KHÔNG tự kiểm tra thời gian (chỉ kiểm `status`) — worker PHẢI tự lọc theo `closeAt`, không dựa vào use-case chặn hộ |

### 3.3 Giai đoạn 3 — `OpsAutoPublishConfig` (đã **đơn giản hoá** 07/09/2026)

**Bản đầu sai ở 3 field, đã bỏ.** Lý do bỏ — user chỉ ra đúng, và code xác nhận:

| Field đã bỏ | Vì sao là NHIỄU, không phải an toàn |
|---|---|
| `requireHumanVerified` | **Quy trình verify là quy tắc BÊN TRONG ResultFeed, không phải việc của MegaWin core.** `VietlottResultClient.getResult()` trả `null` khi ResultFeed **chưa publish** (chưa quay / chưa đạt consensus / nguồn chưa hỗ trợ) — xem JSDoc `packages/game-core/src/types/vietlott-result-client.ts`. Nghĩa là: **non-null ĐÃ LÀ tín hiệu "ResultFeed cho phép dùng kết quả này"**. Bắt thêm `verifiedByHuman === true` là MegaWin core tự dựng cổng thứ hai lên trên một cổng đã đóng đúng — và nó vô hiệu hoá luôn chính lựa chọn mà ResultFeed cung cấp (chốt bằng consensus máy) |
| `minSourceCount` | Cùng lý do. `sourceCount` là **metadata giải thích độ tin cậy để hiện cho người xem**, không phải ngưỡng để cổng thứ hai so. Nếu ResultFeed thấy 1 nguồn là chưa đủ, ResultFeed **không publish** — nó không publish rồi để consumer tự lọc |
| `maxExposure` | **Sai giai đoạn.** Publish không chi một đồng nào. Exposure là rủi ro của việc **trả tiền**, và việc trả tiền xảy ra ở giai đoạn 4. Chặn publish theo exposure tạo ra tình trạng tệ hơn: kỳ exposure cao bị treo ở `SalesClosed` **không có kết quả** — người chơi không biết mình thắng hay thua, trong khi mọi kỳ khác đã có kết quả. Kiểm soát exposure thuộc §3.4 (settle), nơi đúng chỗ |

Lập luận nền: **publish là hành động ghi lại một SỰ THẬT đã xảy ra ngoài hệ thống** (Vietlott đã quay số
đó rồi). Nó không phải quyết định nghiệp vụ có thể "cân nhắc theo rủi ro" — kết quả đúng là đúng, bất kể
kỳ đó có bao nhiêu tiền cược. Trì hoãn ghi nhận sự thật vì rủi ro tài chính là trì hoãn sai chỗ; chỗ
đúng để cân nhắc rủi ro là lúc quyết định **chi tiền** (giai đoạn 4).

```typescript
/**
 * Tự nhận kết quả kỳ (`SalesClosed` → `Published`) khi ResultFeed ĐÃ PUBLISH kết quả cho kỳ đó.
 *
 * NGUYÊN TẮC: MegaWin core KHÔNG tự đánh giá lại độ tin cậy của ResultFeed. `getResult()` trả
 * non-null nghĩa là ResultFeed đã quyết "kết quả này dùng được" — core tin quyết định đó và
 * dùng. Quy trình đạt tới quyết định đó (mấy nguồn, người verify hay máy consensus) là **quy
 * tắc nội bộ của ResultFeed**, không phải điều kiện cấu hình ở đây. Vì vậy config này CỐ TÌNH
 * rất mỏng — không có `requireHumanVerified`, không `minSourceCount`, không `maxExposure`.
 *
 * PHỤ THUỘC BÊN NGOÀI CỨNG: giai đoạn này KHÔNG THỂ hoạt động cho tới khi ResultFeed
 * (`.cursor/plans/resultfeed/00-overview.md`) đạt **G5**. `enabled: true` trước đó vô hại
 * nhưng vô nghĩa — `getResult()` luôn trả `null`.
 */
export interface OpsAutoPublishConfig {
  /** Bật/tắt. Mặc định `false`. */
  enabled: boolean;

  /**
   * Độ trễ tối thiểu (phút) sau `drawTime` mới được auto-publish. Mặc định `0`.
   *
   * KHÔNG phải cơ chế an toàn tài chính — chỉ là đệm chống trường hợp ResultFeed publish quá
   * sớm do lệch đồng hồ nguồn (kết quả kỳ 14:00 xuất hiện lúc 13:59). Giữ `0` là hợp lý ở
   * hầu hết trường hợp vì `getResult()` tra theo `drawPeriod` chính xác, không tra theo giờ.
   */
  minMinutesAfterDrawTime: number;

  /** Trần số kỳ auto-publish mỗi lần worker chạy. */
  maxDrawsPerRun: number;
}
```

**Hard-coded cho giai đoạn 3 (không cấu hình được, dưới MỌI cấu hình trên):**

| Điều kiện | Vì sao không cấu hình được |
|---|---|
| Kỳ phải đang ở **`SalesClosed`** (chưa từng có `result`) | Auto-Pilot **CHỈ publish lần đầu**. Kỳ đã `Published`/`Settled` muốn sửa kết quả (resettle) là việc CON NGƯỜI, §0.1 |
| `now > drawTime` (+ `minMinutesAfterDrawTime`) | Kỳ chưa tới giờ quay thì mọi "kết quả" đều không thể đúng — dù ResultFeed có trả gì đi nữa. Đây là kiểm tra **sanity** cuối, không tin tuyệt đối vào nguồn ngoài |
| KHÔNG BAO GIỜ ghi đè kết quả đã có, bất kể nguồn | Kế thừa bất biến D6 của `resultfeed`. Dù staff đã publish tay (`source: Manual`) hay máy publish trước, không chạm kỳ đã có `result` |
| `getResult()` phải trả **non-null** cho ĐÚNG `drawPeriod` của kỳ | `null` = ResultFeed chưa cho phép dùng. Không làm gì, KHÔNG suy luận/nội suy từ kỳ khác |
| Số lượng số trúng phải khớp game (Keno 20 số, mỗi số `"01"`–`"80"`, không trùng) | Validate shape trước khi ghi — nguồn ngoài trả sai định dạng thì dừng và **bắn alert**, không ghi rồi sửa sau |
| KHÔNG publish cho kỳ đang `Voiding`/`Void` | Kỳ đã bị huỷ không cần kết quả |

Hai dòng in đậm (`now > drawTime`, validate shape) là **toàn bộ** phần "không tin nguồn ngoài" mà giai
đoạn này cần — đó là kiểm tra tính hợp lệ **cơ học**, khác hoàn toàn với việc đánh giá lại **độ tin cậy
nghiệp vụ** (thứ đã bỏ ở bảng trên).

### 3.4 Giai đoạn 4 — `OpsAutoSettleConfig` (**viết lại toàn bộ** 07/09/2026)

#### 3.4.0 Phát hiện chặn: config bản đầu đọc field LUÔN `undefined`

Khảo sát code (07/09/2026) phát hiện lỗi thiết kế **nghiêm trọng** ở bản đầu — không phải lỗi ngưỡng
đặt sai, mà là **đọc sai nguồn dữ liệu**:

| Field config bản đầu | Định đọc từ | Sự thật |
|---|---|---|
| `maxRevenue` | `draw.financial.totalRevenue` | ❌ `DrawFinancial` **chỉ được ghi bởi `CalculateFinancialsUseCase` — một step BÊN TRONG settle pipeline** (`calculate-financials.ts:79-93`). Tại thời điểm quyết định "có nên settle không", field này là `undefined` |
| `maxEntries` | `draw.stats.ticketEntryCount` | ❌ Cùng vấn đề. `DrawStats` cũng do `CalculateFinancialsUseCase` ghi. JSDoc `DrawDoc.stats` ghi rõ *"Thống kê vận hành **sau kết sổ**"* |
| `maxExposure` | `draw.stats.exposure` | ❌ **`DrawStats` của Keno KHÔNG CÓ field `exposure`** — nó chỉ có 3 field (`ticketEntryCount`, `totalSalesAmount`, `totalPayoutAmount`) |

Tệ hơn: cả `financial` và `stats` bị **`$unset`** khi republish (`draw-repo.ts:539-540, 598-599`) — nên
chúng không chỉ "chưa có trước settle" mà còn **biến mất trở lại**.

**Hệ quả nếu code theo bản đầu:** mọi so sánh `undefined <= maxRevenue` cho `false` trong JS
(`undefined <= 25_000_000` → `false`) → **không kỳ nào đủ điều kiện, Auto-Pilot im lặng không làm gì**.
Đây là fail-safe **may mắn**, không phải fail-safe có chủ đích — và nếu ai đó "sửa" bằng `?? 0` thì
thành **fail-open**: mọi kỳ đều `0 <= maxRevenue` → settle hết bất kể rủi ro thật.

#### 3.4.1 Nguồn dữ liệu ĐÚNG cho quyết định pre-settle

Dữ liệu rủi ro pre-settle nằm ở **collection riêng** `keno_draw_betting_stats` (1 doc/draw), do worker
`keno:stats-sync` cộng `$inc` mỗi ~10s (`ops.stats.tickSeconds`), **không** tính tại place-bet:

| Trường | Đường dẫn | Ý nghĩa |
|---|---|---|
| Doanh thu | `totals.revenue` | Tổng tiền cược thật (VND) |
| Số vé | `totals.entries` | Số entry |
| Số bộ cược | `totals.sets` | Σ `betCount` — **không** phải số board |
| Hoa hồng | `totals.commission` | Hoa hồng đại lý luỹ kế |
| Cược lớn | `totals.largeBetCount` | Số entry ≥ `alerts.largeBetAmount` |
| Exposure | `exposure.worstCaseTotal` | ⚠️ **RAW, CHƯA cap** |
| Exposure/kiểu | `exposure.worstCaseByPlayType` | RAW theo playType |
| Bộ cappable | `exposure.capSets.{pick8,pick9,pick10}` | So `payoutCaps.pick{N}MaxSetsForFixed` |
| Vé nguy hiểm nhất | `topPotential[]` | `potentialWin` per entry, sort desc |
| Theo tenant | `byTenant[tenantId].{amount,entries,commission}` | |
| Đồng bộ | `updatedAt`, `lastEntryId`, `final` | Tín hiệu worker đã hút tới đâu |

**Hai cái bẫy bắt buộc biết:**

1. **`exposure.worstCaseTotal` trong doc là RAW.** Phải gọi `capExposureByPlayType(raw, payoutCaps)`
   (`packages/game-keno/src/rules/max-prize.ts:122-142`) trước khi so ngưỡng — đúng như
   `evaluate-alerts.ts:92` và `get-ops-snapshot.ts:83` đang làm. Đọc trực tiếp cho số **phóng đại nhiều
   lần** (RAW có thể vượt cap 10 tỷ/bậc rất xa).
2. **`stats.final` KHÔNG dùng được làm điều kiện pre-settle** — nó chỉ `true` khi draw đã `Settled`/`Void`.
   Tín hiệu khả dụng là `updatedAt` và `lastEntryId`.

#### 3.4.2 Chỉ số quyết định = SỐ TIỀN THẬT, không phải proxy (chốt 07/09/2026, lần 2)

> **Đổi hướng.** Bản 07/09 lần 1 (nay ở §3.4.2-OLD/§3.4.3-OLD/§3.4.4-OLD bên dưới) dùng **chỉ số
> proxy** từ `keno_draw_betting_stats`. Bản này thay bằng **số tiền thật tính từ kết quả đã publish**.
> Ba subsection cũ **KHÔNG CODE THEO** — giữ lại chỉ để tra cứu vì sao proxy bị loại.

**Nhận ra điều bản trước bỏ qua:** giai đoạn 4 chỉ xét kỳ đã `Published` ⇒ **20 số trúng đã có**. Keno
100% giải cố định (12 play type, không jackpot, không pool chia). Vậy **số tiền phải trả tính được
chính xác ngay**, không cần settle, không cần ước lượng.

Toàn bộ khung "4 câu hỏi + proxy exposure" ở §3.4.2-OLD sinh ra từ giả định *"pre-settle chưa biết
payout thật nên phải dùng proxy"*. Giả định đó **sai với giai đoạn 4**. Nó đúng với **giai đoạn 1–2**
(kỳ đang mở bán, chưa có kết quả) — nên proxy vẫn giữ nguyên giá trị cho monitor/alert lúc bán vé,
chỉ **không dùng để quyết định kết sổ**.

Engine tính số thật: [`p2-04b-settle-preview-engine.plan.md`](./p2-04b-settle-preview-engine.plan.md).
Nó ghi `keno_settle_previews`, dùng **cùng hàm** `computeEntryPayout` mà settle thật dùng
([`p2-04a`](./p2-04a-settle-payout-extract.plan.md)), **không** ghi gì vào entries/draw/pipeline.

**Năm ngưỡng, đều là số có nghĩa nghiệp vụ trực tiếp:**

| Ngưỡng | Đọc từ | Vì sao chọn |
|---|---|---|
| `maxPayoutRatio` | `financials.payoutRatio` = `totalPayout / totalStake` | **Chỉ số số 1.** Payout ratio thật của kỳ — đúng thứ ngành dùng, không phải proxy. Tự chuẩn hoá theo quy mô. Đối chiếu được với RTP lý thuyết từ `rules/odds.ts` ⇒ hiệu chuẩn có căn cứ |
| `maxPayoutAbsolute` | `financials.totalPayout` | Ràng buộc **thanh khoản**: "kỳ này phải trả X, ta có sẵn X không". Ratio một mình không đủ — kỳ nhỏ ratio cao vẫn không đáng kể |
| `minNetProfit` | `financials.netProfit` = `ggr - totalCommission` | **Bottom-line P&L.** Cho phép **ÂM** — quyết định nghiệp vụ là "lỗ bao nhiêu thì vẫn tự chốt được". Đây là con số CFO thực sự quan tâm, không phải exposure |
| `maxSingleEntryPayout` | `topEntryPayout` | Tập trung vào 1 vé. Trước là **tỷ lệ suy diễn** trên proxy; giờ là **số tiền tuyệt đối** của vé đó |
| `blockOnCapTriggered` | `caps[*].capTriggered` | Cap kích hoạt = cơ chế trả thưởng **đổi hoàn toàn** (cố định → chia đều), nhánh `ApplyPayoutCaps` ít chạy nhất, rủi ro logic cao nhất |

**Bỏ hoàn toàn** khỏi `OpsAutoSettleConfig`: `maxExposureRatio`, `maxExposureAbsolute`,
`maxSingleEntryShare`, `capSetsGuardRatio`, `maxStatsStalenessSeconds`, `maxEntries`.

**`maxStatsStalenessSeconds` được thay bằng cơ chế tốt hơn, không phải bỏ suông:**
`preview.resultFingerprint` — thay vì đo *"dữ liệu có cũ quá không"* bằng đồng hồ (luôn phải đoán
ngưỡng giây), ta so **định danh chính xác** của kết quả mà preview đã tính. Republish đổi kết quả →
fingerprint lệch → preview tự vô hiệu. Không còn vùng xám thời gian.

Còn `maxRevenue`: giữ, nhưng **đổi vai trò** — không còn là chỉ số rủi ro (§3.4.2-OLD đã chỉ ra nó là
chỉ số yếu nhất) mà là **van giới hạn quy mô**: "kỳ to hơn mức này thì luôn để người xem, bất kể số
liệu đẹp". Đọc từ `financials.totalStake` (số thật), **không** từ `draw.financial.totalRevenue` (vẫn
`undefined` — §3.4.0 vẫn đúng).

##### Sáu điều kiện hard-coded — không có công tắc tắt

Tách khỏi ngưỡng cấu hình vì đây là **điều kiện dữ liệu đáng tin**, không phải khẩu vị rủi ro:

1. Không có preview doc
2. `preview.complete === false` — **bẫy fail-open nguy hiểm nhất**: số dở dang luôn nhỏ hơn số thật ⇒ mọi ngưỡng đều "đạt" giả tạo
3. `preview.resultFingerprint` ≠ hash kết quả hiện tại của draw
4. `financials.totalStake === 0` — kỳ không cược, không cần tự động
5. Có `SettlePreviewMismatch` chưa resolved trong 7 ngày — preview đang tính sai tiền
6. `blockOnCapTriggered` bật và có bậc nào `capTriggered`

Chi tiết ở [`p2-04b`](./p2-04b-settle-preview-engine.plan.md) §6.

##### Vòng tự kiểm chứng — thứ proxy không thể có

Sau settle thật, worker so `preview.financials.totalPayout` với `draw.financial.totalPrizes` →
`verification.delta`. **Mỗi kỳ đều tự chấm điểm engine.** `delta !== 0` một lần ⇒ alert Critical
`SettlePreviewMismatch` ⇒ Auto-Pilot kết sổ dừng toàn bộ (điều kiện 5 ở trên).

Proxy không có đáp án đúng để so — không kiểm chứng được, nên không có lưới an toàn nào.

> **Ranh giới cần hiểu:** `delta === 0` chứng minh preview **khớp settle thật**, không chứng minh
> settle thật **đúng công thức**. Nếu `computeEntryPayout` sai thì cả hai sai giống nhau. Vòng này
> bắt lệch **giữa hai đường** (cap sai, sót entry, cộng trùng); đúng công thức gốc là việc của test
> `p2-04a` §5 + đối chiếu RTP lý thuyết.

---

#### 3.4.2-OLD ⛔ SUPERSEDED — KHÔNG CODE THEO. Giữ để tra cứu vì sao proxy bị loại

Trong vận hành casino/lottery online, quyết định "kỳ này có an toàn để chốt sổ tự động" quy về **4 câu
hỏi**, theo đúng thứ tự quan trọng. Ngưỡng tiền tuyệt đối (`maxRevenue`) — thứ bản đầu đặt lên đầu —
thực ra là chỉ số **yếu nhất**:

**Câu 1 (quan trọng nhất): "Kỳ này có thể làm mất bao nhiêu tiền so với thu vào?"**

Đây là **payout ratio** (còn gọi hold/margin ngược). Chỉ số ngành dùng: `payout / stake`. Nhưng
pre-settle chưa biết `payout` thật, nên dùng proxy đã có:

```
exposureRatio = cappedExposure.worstCaseTotal / totals.revenue
```

Tại sao đây là chỉ số số 1: nó **tự chuẩn hoá theo quy mô**. Kỳ 1 triệu doanh thu với exposure 500 triệu
nguy hiểm hơn nhiều kỳ 50 triệu doanh thu với exposure 200 triệu — dù số tuyệt đối ngược lại.
`maxRevenue` (tuyệt đối) không phân biệt được điều này; `exposureRatio` phân biệt được.

**Câu 2: "Nếu kịch bản xấu nhất xảy ra, số tiền tuyệt đối có vượt khả năng chi trả?"**

Ratio một mình không đủ — kỳ nhỏ có ratio cực cao nhưng số tuyệt đối vẫn không đáng kể. Cần **trần tuyệt
đối trên exposure đã cap** (không phải trên doanh thu):

```
cappedExposure.worstCaseTotal <= maxExposureAbsolute
```

Đây là ràng buộc **thanh khoản** — "kỳ này xấu nhất phải trả X, ta có sẵn X không". Đúng bản chất của
`maxPerDraw` trong `payoutCaps` nhưng ở tầng quyết định tự động.

**Câu 3: "Rủi ro có tập trung vào một chỗ bất thường?"**

Tổng an toàn không có nghĩa từng phần an toàn. Ba dạng tập trung có dữ liệu thật:

- **Tập trung vào 1 vé:** `topPotential[0].potentialWin / cappedExposure.worstCaseTotal` — 1 vé chiếm
  phần lớn exposure là dấu hiệu cần người xem (có thể đúng, có thể là gian lận/lỗi nhập).
- **Cap sắp kích hoạt:** `capSets.pickN >= payoutCaps.pickNMaxSetsForFixed` — khi cap kích hoạt, cơ chế
  trả thưởng **đổi hoàn toàn** (từ giá cố định sang chia đều pool). Đây là nhánh code ít chạy nhất trong
  settle pipeline (`ApplyPayoutCaps`), rủi ro logic cao nhất → **không nên để máy tự chốt**.
- **Tập trung theo tenant:** một tenant chiếm phần lớn doanh thu kỳ → sai số ở tenant đó ảnh hưởng toàn
  kỳ. Có dữ liệu (`byTenant`) nhưng **giá trị chẩn đoán thấp hơn** 2 dạng trên → không đưa vào bản đầu.

**Câu 4: "Dữ liệu ta đang nhìn có ĐÁNG TIN không?"**

Đây là câu hỏi **không phải về rủi ro kỳ, mà về rủi ro của chính hệ thống đo lường** — và là câu bản đầu
**bỏ hoàn toàn**. Nếu `keno_draw_betting_stats` chưa hút hết entry, mọi chỉ số ở Câu 1–3 đều là **số
thấp hơn thực tế** → mọi ngưỡng đều "đạt" một cách giả tạo. Đây là **fail-open nguy hiểm nhất** của toàn
bộ thiết kế:

```
stats.updatedAt phải mới hơn (now - maxStatsStalenessSeconds)
VÀ stats doc phải TỒN TẠI
```

Kỳ **không có** stats doc → **không** phải "kỳ không ai cược nên an toàn", mà là "worker chưa chạy tới".
Hai trường hợp này không phân biệt được từ phía consumer, nên phải xử lý theo hướng **bảo thủ: bỏ qua**.

**Những chỉ số ngành KHÔNG dùng được ở đây** (nói rõ để không ai đi tìm):

| Chỉ số | Vì sao không dùng |
|---|---|
| **RTP thực tế của kỳ** | Chỉ tính được SAU settle. `rules/odds.ts` có `payoutRatio` nhưng đó là RTP **lý thuyết tĩnh** từ prize config, không phải của kỳ cụ thể |
| **GGR / netProfit** | Ở `SettleDrawReport`, do `BuildSettleReportUseCase` ghi — cũng POST-settle |
| **Hold percentage** | Cần payout thật |
| **Expected payout (kỳ vọng xác suất)** | Hệ thống **không có** mô hình xác suất per-draw. `exposure` là worst-case cộng dồn, cực bảo thủ, KHÔNG phải kỳ vọng — xem §3.4.3 |
| **Số người chơi duy nhất** | Có ở `keno_draw_account_stats` nhưng cần query collection thứ 3; giá trị chẩn đoán thấp hơn 4 câu trên |

#### 3.4.3-OLD ⛔ SUPERSEDED — Hiểu đúng bản chất `exposure` trước khi đặt ngưỡng

> Phần này **vẫn đúng về mặt kỹ thuật** và vẫn dùng được cho monitor/alert giai đoạn bán vé. Nó chỉ
> không còn liên quan tới quyết định kết sổ (§3.4.2).

`exposure.worstCaseTotal` **không phải** dự báo tài chính. Đọc code `stats-accumulator.ts:167-223` +
`max-prize.ts:83-98`, nó là:

```
Σ (maxBoardPrize(playType, numbers.length) × betCount)  trên MỌI board của kỳ
```

Tức nó giả định **mọi board đều trúng tối đa đồng thời** — bất khả thi về mặt vật lý: hai board pick10
với bộ số khác nhau không thể cùng trúng 10/10 trong một lần quay 20 số. Nó còn cộng dồn cả **hai hướng
đối lập** của side bet (`big` + `small` cùng lúc), dù chỉ một hướng thắng được.

Code tự gọi đúng tên: JSDoc `betting-stats.ts:107` ghi **"Proxy exposure"**.

**Hệ quả thực tế cho việc đặt ngưỡng:** `exposureRatio` sẽ **luôn** lớn hơn payout ratio thật, thường
lớn hơn nhiều lần. Ngưỡng phải được **hiệu chuẩn từ dữ liệu thật** (§3.4.5), không suy từ lý thuyết —
đặt `maxExposureRatio: 1.0` ("không trả nhiều hơn thu") sẽ chặn gần như **mọi** kỳ, vì proxy này gần như
luôn vượt doanh thu.

Đây chính là lý do §3.4.5 yêu cầu **dry-run có đo phân bố** trước khi chọn số.

#### 3.4.4 Interface (**bản dùng để code** — số tiền thật)

```typescript
/**
 * Tự kết sổ kỳ đã `Published`, dưới ngưỡng SỐ TIỀN THẬT cấu hình được.
 *
 * NGUỒN DỮ LIỆU: `keno_settle_previews` (xem `p2-04b`) — số tiền phải trả tính chính xác từ
 * kết quả đã publish, bằng cùng công thức settle thật dùng. KHÔNG đọc `draw.financial`/
 * `draw.stats` (post-settle, luôn undefined — §3.4.0), KHÔNG đọc proxy exposure từ
 * `keno_draw_betting_stats` (§3.4.2).
 *
 * Mọi ngưỡng dưới đây là "trần/sàn cho phép máy tự làm" — vượt thì CHỜ NGƯỜI, không phải
 * chặn settle. Kỳ bị chặn vẫn settle bình thường khi staff bấm tay.
 *
 * Ngoài các ngưỡng này còn 6 điều kiện HARD-CODED không tắt được (§3.4.2) — quan trọng nhất:
 * `preview.complete === false` thì KHÔNG BAO GIỜ được settle, dù mọi ngưỡng đều đạt.
 */
export interface OpsAutoSettleConfig {
  /** Bật/tắt. `false` = dry-run: engine vẫn đánh giá + ghi log quyết định, KHÔNG settle. */
  enabled: boolean;

  /**
   * Trần tỷ lệ trả thưởng: `totalPayout / totalStake`. Vượt → chờ người.
   *
   * Chỉ số chính. `0.85` = "trả tới 85% tiền thu thì vẫn tự chốt". Đối chiếu RTP lý thuyết
   * (tính từ `rules/odds.ts`) khi hiệu chuẩn: ngưỡng nên nằm trên p95 phân bố thật (§3.4.5).
   * `0` = tắt tiêu chí này (KHÔNG phải "chặn hết") — xem lưu ý cuối §3.4.4.
   */
  maxPayoutRatio: number;

  /**
   * Trần tiền phải trả tuyệt đối (VND). Vượt → chờ người.
   *
   * Ràng buộc thanh khoản, độc lập với ratio: kỳ nhỏ ratio cao vẫn không đáng kể, kỳ lớn
   * ratio thấp vẫn có thể là số tiền lớn. `0` = tắt tiêu chí.
   */
  maxPayoutAbsolute: number;

  /**
   * Sàn lợi nhuận ròng (VND): `ggr - totalCommission`. Thấp hơn → chờ người.
   *
   * CHO PHÉP ÂM — đây là điểm khác biệt quan trọng. `-50_000_000` = "kỳ lỗ tới 50tr thì vẫn
   * tự chốt, lỗ hơn thì để người xem". Đặt `0` nghĩa là "chỉ tự chốt kỳ có lãi" — hợp lệ
   * nhưng sẽ chặn nhiều kỳ hơn dự đoán (kỳ lỗ là bình thường trong xổ số).
   *
   * KHÔNG validate `>= 0` (`financial-reporting-system.mdc` §4 cảnh báo `netProfit` có thể âm).
   */
  minNetProfit: number;

  /**
   * Trần payout của MỘT vé đơn lẻ (VND). Vượt → chờ người.
   *
   * Bắt tập trung rủi ro vào 1 vé: có thể hợp lệ, có thể là gian lận/lỗi nhập. Số tuyệt đối,
   * không phải tỷ lệ. `0` = tắt tiêu chí.
   *
   * `preview.topEntryPayout === null` (xảy ra khi có bậc bị cap) → tiêu chí này KHÔNG đánh giá
   * được; nhưng lúc đó `blockOnCapTriggered` đã chặn rồi (nếu bật). Nếu `blockOnCapTriggered`
   * tắt VÀ `topEntryPayout === null` → coi như KHÔNG ĐẠT (bảo thủ), chờ người.
   */
  maxSingleEntryPayout: number;

  /**
   * `true` = kỳ có payout cap kích hoạt ở bất kỳ bậc 8/9/10 thì LUÔN chờ người.
   *
   * Nên để `true`. Khi cap kích hoạt, cơ chế trả thưởng đổi từ giá cố định sang chia đều pool —
   * nhánh `ApplyPayoutCaps` ít chạy nhất trong settle pipeline, rủi ro logic cao nhất, và kỳ
   * có cap vốn là kỳ bất thường về mặt nghiệp vụ.
   */
  blockOnCapTriggered: boolean;

  /**
   * Trần doanh thu kỳ (VND): `financials.totalStake`. Vượt → chờ người. `0` = tắt.
   *
   * ĐỔI VAI TRÒ so với bản đầu: đây KHÔNG phải chỉ số rủi ro (§3.4.2-OLD chỉ ra nó là chỉ số
   * yếu nhất — không phân biệt được kỳ nhỏ rủi ro cao với kỳ lớn rủi ro thấp). Nó là VAN GIỚI
   * HẠN QUY MÔ: "kỳ to hơn mức này thì luôn để người xem, bất kể số liệu đẹp thế nào".
   *
   * Đọc từ preview (số thật), KHÔNG từ `draw.financial.totalRevenue` (undefined — §3.4.0).
   */
  maxRevenue: number;

  /**
   * Độ trễ tối thiểu (phút) từ `max(sales.closeAt, result.publishedAt)` đến lúc được settle.
   *
   * Mốc là `max(...)` vì cần trễ sau CẢ HAI: đóng cược (entry cuối đã vào DB) VÀ có kết quả.
   * Chỉ lấy `closeAt` thì kết quả publish muộn sẽ settle ngay lập tức; chỉ lấy `publishedAt`
   * thì không đảm bảo entry cuối đã vào.
   *
   * Mục đích: chừa cửa sổ cho người can thiệp trước khi máy chốt, và chừa thời gian cho
   * preview hoàn tất.
   *
   * ⚠️ SÀN BẮT BUỘC: phải LỚN HƠN thời gian preview hoàn tất ở kỳ đông nhất (p95, đo ở
   * `p2-04b` §4). Nhỏ hơn → Auto-Pilot luôn thấy `complete: false` → không bao giờ chạy.
   */
  settleDelayMinutes: number;

  /** Trần số kỳ settle mỗi nhịp worker — cap tải, tránh dồn hàng loạt sau sự cố. */
  maxDrawsPerRun: number;

  /** Chính sách alert — xem §3.5. Giữ nguyên, alert là lớp bổ sung độc lập với số tiền. */
  alertPolicy: OpsAutoSettleAlertPolicy;
}
```

##### Quy ước `0` = tắt tiêu chí — và cái bẫy của nó

`maxPayoutRatio: 0` / `maxPayoutAbsolute: 0` / `maxSingleEntryPayout: 0` / `maxRevenue: 0` nghĩa là
**tắt tiêu chí đó**, KHÔNG phải "chặn mọi kỳ". Quy ước này tiện nhưng nguy hiểm: bật `enabled: true`
với **tất cả** ngưỡng = 0 tức là **settle mọi kỳ không kiểm tra gì**.

Zod schema **phải** `.refine()` chặn: `enabled === true` mà `maxPayoutRatio === 0 && maxPayoutAbsolute
=== 0 && minNetProfit` không đặt ⇒ **reject**, thông báo rõ *"phải có ít nhất một trần tiền hiệu lực"*.

`minNetProfit` **không** theo quy ước này (`0` là giá trị có nghĩa: "chỉ kỳ có lãi"). Muốn tắt nó thì
đặt số âm rất lớn — và UI phải nói rõ điều đó, không để staff đoán.

---

#### 3.4.4-OLD ⛔ SUPERSEDED — Interface theo proxy exposure. KHÔNG CODE THEO

```typescript
/**
 * Tự kết sổ kỳ đã `Published`, dưới ngưỡng rủi ro cấu hình được.
 *
 * MỌI ngưỡng đọc từ `keno_draw_betting_stats` (pre-settle), KHÔNG từ `draw.financial`/
 * `draw.stats` — 2 field đó là OUTPUT của settle, luôn `undefined` tại thời điểm quyết định
 * (xem `p2-01-autopilot-config.plan.md` §3.4.0). Đây là lỗi đã sửa, đừng lặp lại.
 *
 * Exposure LUÔN so trên giá trị ĐÃ CAP qua `capExposureByPlayType(raw, payoutCaps)` —
 * giá trị trong doc là RAW (§3.4.1 bẫy 1).
 */
export interface OpsAutoSettleConfig {
  // ⛔ SUPERSEDED — interface này KHÔNG dùng để code. Bản hiện hành ở §3.4.4 phía trên.
  /** Bật/tắt. Mặc định `false`. Khi `false`, worker vẫn đánh giá và GHI LOG (dry-run). */
  enabled: boolean;

  // ── Câu 1: rủi ro TƯƠNG ĐỐI (chỉ số quan trọng nhất) ─────────────────────────────

  /**
   * Trần tỷ lệ `cappedExposure.worstCaseTotal / totals.revenue`.
   *
   * Chỉ số rủi ro số 1 vì nó TỰ CHUẨN HOÁ theo quy mô kỳ — kỳ 1tr doanh thu/500tr exposure
   * nguy hiểm hơn kỳ 50tr doanh thu/200tr exposure, dù số tuyệt đối ngược lại.
   *
   * ⚠️ `exposure` là **proxy worst-case cộng dồn** (giả định mọi board trúng tối đa đồng
   * thời — bất khả thi thật), nên tỷ lệ này LUÔN cao hơn payout ratio thật, thường nhiều
   * lần. PHẢI hiệu chuẩn từ phân bố thật của ≥ 2 tuần dry-run (§3.4.5), KHÔNG suy từ lý
   * thuyết. Đặt `1.0` ("không trả nhiều hơn thu") sẽ chặn gần như MỌI kỳ.
   *
   * `0` = chặn mọi kỳ (dùng để tắt mềm mà không đổi `enabled`).
   */
  maxExposureRatio: number;

  // ── Câu 2: rủi ro TUYỆT ĐỐI (ràng buộc thanh khoản) ──────────────────────────────

  /**
   * Trần `cappedExposure.worstCaseTotal` (VND) — số tuyệt đối, đã cap.
   *
   * Ràng buộc thanh khoản: "kỳ này xấu nhất phải trả X, ta có sẵn X không". Cần cả trần này
   * BÊN CẠNH `maxExposureRatio` vì kỳ nhỏ có thể có ratio rất cao nhưng số tuyệt đối không
   * đáng kể (ratio một mình sẽ chặn oan), và kỳ lớn có ratio thấp nhưng số tuyệt đối vượt
   * khả năng chi (ratio một mình sẽ cho qua).
   */
  maxExposureAbsolute: number;

  /**
   * Trần doanh thu kỳ (VND) — `totals.revenue`.
   *
   * GIỮ LẠI nhưng **hạ vai trò**: đây KHÔNG phải chỉ số rủi ro (doanh thu cao là điều TỐT),
   * chỉ là **van giới hạn mức độ tự động** — "kỳ to hơn mức này thì dù mọi chỉ số rủi ro đều
   * đẹp, vẫn muốn người nhìn qua". Đặt rất cao (hoặc bằng `Number.MAX_SAFE_INTEGER` nếu
   * không muốn dùng) là hợp lý sau khi đã tin `maxExposureRatio`.
   */
  maxRevenue: number;

  // ── Câu 3: TẬP TRUNG rủi ro ──────────────────────────────────────────────────────

  /**
   * Trần tỷ lệ `topPotential[0].potentialWin / cappedExposure.worstCaseTotal`.
   *
   * 1 vé chiếm phần lớn exposure toàn kỳ = cần người xem: có thể hợp lệ (khách VIP), có thể
   * là lỗi nhập liệu hoặc gian lận. Máy không phân biệt được → chuyển cho người.
   *
   * `1.0` = không chặn theo tiêu chí này (1 vé chiếm 100% vẫn cho qua).
   */
  maxSingleEntryShare: number;

  /**
   * Chặn auto-settle khi cap chia-đều SẮP hoặc ĐÃ kích hoạt:
   * `capSets.pickN >= payoutCaps.pickNMaxSetsForFixed × capSetsGuardRatio`.
   *
   * Khi cap kích hoạt, cơ chế trả thưởng ĐỔI HOÀN TOÀN (giá cố định → chia đều pool) — nhánh
   * `ApplyPayoutCaps` là nhánh ít chạy nhất trong settle pipeline, rủi ro logic cao nhất.
   * Không nên để máy tự chốt kỳ đi vào nhánh đó.
   *
   * `1.0` = chỉ chặn khi cap thực sự đạt. `0.8` = chặn từ 80% cap (bảo thủ hơn).
   * `0` = tắt tiêu chí này (KHÔNG khuyến nghị).
   */
  capSetsGuardRatio: number;

  // ── Câu 4: độ TIN CẬY của chính dữ liệu (fail-safe, đừng bỏ) ─────────────────────

  /**
   * Độ cũ tối đa cho phép của `stats.updatedAt` (giây). Kỳ có stats cũ hơn ngưỡng này →
   * KHÔNG auto-settle.
   *
   * Đây là fail-safe QUAN TRỌNG NHẤT của toàn config: nếu worker `keno:stats-sync` chậm/treo,
   * mọi chỉ số ở trên đều là số THẤP HƠN THỰC TẾ → mọi ngưỡng "đạt" một cách giả tạo. Không
   * có ngưỡng này, Auto-Pilot sẽ settle mạnh tay nhất đúng lúc hệ đo lường hỏng nặng nhất.
   *
   * Nên đặt ≥ 3× `ops.stats.tickSeconds` (default 10s) → gợi ý 60–120s. Kỳ đã đóng bán từ lâu
   * thì stats không đổi nữa nhưng `updatedAt` vẫn được worker cập nhật mỗi tick — verify hành
   * vi này khi code (§6), nếu worker BỎ QUA kỳ không có entry mới thì phải dùng tiêu chí khác
   * (VD so `lastEntryId` với entry mới nhất).
   */
  maxStatsStalenessSeconds: number;

  // ── Thời gian ────────────────────────────────────────────────────────────────────

  /**
   * Độ trễ tối thiểu (phút) kể từ **thời điểm MUỘN HƠN** giữa `sales.closeAt` và
   * `result.publishedAt`, trước khi được auto-settle.
   *
   * ĐỔI TÊN từ `minAgeMinutes` (bản đầu) — tên cũ mơ hồ "tuổi của cái gì", và mốc cũ chỉ tính
   * từ `closeAt` là SAI: kỳ đóng bán 14:00 nhưng kết quả chỉ về 14:20 thì "tuổi 15 phút" tính
   * từ 14:00 là 14:15 — settle khi kết quả vừa về đúng 0 phút trước, không có cửa sổ nào để
   * người kịp can thiệp. Lấy mốc MUỘN HƠN đảm bảo luôn có đủ N phút SAU KHI có đủ cả 2 điều
   * kiện (hết cược + có kết quả).
   *
   * Mục đích: cửa sổ để (a) staff kịp thấy và can thiệp nếu kết quả sai, (b) worker
   * `stats-sync` kịp hút hết entry cuối, (c) alert engine kịp quét qua kỳ này.
   *
   * `0` được phép nhưng KHÔNG khuyến nghị — mất toàn bộ cửa sổ can thiệp của con người.
   */
  settleDelayMinutes: number;

  /** Trần số kỳ auto-settle mỗi lần worker chạy. Phải ≤ `BULK_MAX_DRAWS` (50). */
  maxDrawsPerRun: number;

  /** Chính sách alert — xem §3.5. */
  alertPolicy: OpsAutoSettleAlertPolicy;
}
```

**Đối chiếu bản đầu → bản proxy (⛔ cả hai đều SUPERSEDED — bảng đối chiếu 3 bản hiện hành ở
[`p2-04`](./p2-04-autopilot-settle-engine.plan.md) §2):**

| Bản đầu (06/09) | Bản proxy (07/09 lần 1) | Lý do lúc đó |
|---|---|---|
| `maxRevenue` (đọc `draw.financial`) | `maxRevenue` (đọc `totals.revenue`) + **hạ vai trò** | Nguồn sai; và doanh thu không phải chỉ số rủi ro |
| `maxEntries` | ❌ **BỎ** | Số vé không đo rủi ro. 10.000 vé × 10k đồng an toàn hơn 5 vé pick10. `exposure` đã bao hàm |
| `maxExposure` (đọc field không tồn tại) | `maxExposureAbsolute` + `maxExposureRatio` | Nguồn sai; và cần cả tương đối lẫn tuyệt đối |
| `minAgeMinutes` | `settleDelayMinutes` | Tên mơ hồ + mốc tính sai (§interface) |
| `allowWithWarningAlerts` | `alertPolicy` (§3.5) | Boolean quá thô cho hệ alert chưa chín |
| — | `maxSingleEntryShare` **(mới)** | Tập trung 1 vé |
| — | `capSetsGuardRatio` **(mới)** | Cap chia-đều = nhánh code rủi ro nhất |
| — | `maxStatsStalenessSeconds` **(mới)** | Fail-safe chống fail-open khi hệ đo lường hỏng |

#### 3.4.5 Hiệu chuẩn ngưỡng — backfill lịch sử, KHÔNG chờ 2 tuần

> **Viết lại 07/09/2026 lần 2.** Bản trước buộc dry-run ≥ 2 tuần vì proxy exposure không có đáp án
> đúng để đối chiếu ⇒ chỉ quan sát tiến về phía trước được. Số tiền thật thì **đối chiếu ngược về
> quá khứ** được: kỳ đã settled có sẵn kết quả, entries, và `draw.financial` làm đáp án.

**Quy trình mới (~1 ngày thay vì 2 tuần):**

1. **Backfill preview 30 ngày lịch sử** ([`p2-04b`](./p2-04b-settle-preview-engine.plan.md) §7).
2. **Đối chiếu 100%:** mọi kỳ phải có `verification.delta === 0`. Bất kỳ kỳ lệch nào **phải điều tra
   xong** trước khi merge `p2-04` — không được ghi nhận là "ngoại lệ lịch sử".
3. **Vẽ phân bố `payoutRatio`** (p50/p90/p95/p99/max) từ chính số thật. Chọn `maxPayoutRatio` ở
   **p95** — đủ lỏng để tự động hoá có tác dụng, đủ chặt để bắt kỳ bất thường.
4. **Đối chiếu p50 với RTP lý thuyết** tính từ `rules/odds.ts`. Hai số phải gần nhau. Lệch xa ⇒ hoặc
   bảng giải cấu hình khác thiết kế, hoặc engine sai — **phải hiểu nguyên nhân trước khi bật**.
   *Đây là bước kiểm chứng độc lập mà cách proxy hoàn toàn không có.*
5. **Phân bố `totalPayout`, `netProfit`, `topEntryPayout`** → chọn `maxPayoutAbsolute`,
   `minNetProfit`, `maxSingleEntryPayout`. Lưu ý `netProfit` chọn ở **p5–p10** (đây là **sàn**, không
   phải trần).
6. **Đối chiếu với kỳ người ĐÃ can thiệp tay** trong 30 ngày: mọi kỳ đó **phải** nằm ngoài ngưỡng vừa
   chọn. Có kỳ người can thiệp mà ngưỡng cho qua ⇒ ngưỡng sai, chọn lại.
7. **Đo thời gian preview hoàn tất** (p50/p95/max) → chốt sàn cho `settleDelayMinutes` có margin.
8. **Dry-run `enabled: false` ≥ 3 ngày** để kiểm engine chạy đúng trên kỳ **mới** (cron, lock,
   resume) — không phải để tích luỹ dữ liệu chọn ngưỡng nữa.
9. Ghi ngưỡng đã chọn + phân bố đo được + kết quả bước 2/4 vào **PR description**.

Bước 2, 4, 6 là ba lớp kiểm chứng độc lập nhau: **2** kiểm engine khớp settle thật, **4** kiểm công
thức khớp thiết kế, **6** kiểm ngưỡng khớp phán đoán con người.

**UI phải hỗ trợ** (§5.2): cạnh mỗi input, hiện phân bố thực tế 7/30 ngày (p50/p90/p95/max) của chính
chỉ số đó, lấy từ `keno_settle_previews` — giờ là **số tiền thật**, có nghĩa trực tiếp với staff, khác
hẳn phân bố proxy trước đây (staff không có trực giác nào về "exposure ratio 47.3").

**Hard-coded cho giai đoạn 4 — cập nhật theo nguồn dữ liệu mới:**

| Điều kiện | Vì sao không cấu hình được |
|---|---|
| Kỳ đã có `settledAt` → **NEVER** auto-resettle | Ranh giới §0.1: settle lại là việc người quyết |
| Kỳ không ở `Published` → **NEVER** | Không có kết quả thì không tính được số tiền |
| **Không có** preview doc → **NEVER** | Chưa tính ⇒ không có căn cứ nào |
| `preview.complete === false` → **NEVER** | **Bẫy fail-open nguy hiểm nhất.** Số dở dang luôn NHỎ HƠN số thật ⇒ mọi trần đều "đạt" giả tạo. Đây là lý do `complete` phải là field riêng, không suy diễn từ `entriesScanned` |
| `resultFingerprint` ≠ hash kết quả hiện tại → **NEVER** | Preview tính theo kết quả đã bị republish thay |
| `financials.totalStake === 0` → **NEVER** | Kỳ 0 doanh thu settle tay rất nhanh, không cần tự động |
| Có `SettlePreviewMismatch` chưa resolved trong 7 ngày → **NEVER** (toàn bộ) | Máy đang tính sai tiền ⇒ **mọi** quyết định trước đó cũng đáng nghi |

> Bẫy phản trực giác của bản trước (*"kỳ `revenue === 0` trông an toàn nhất lại đáng nghi nhất vì có
> thể là stats chưa hút entry"*) **đã được giải quyết bằng cơ chế, không còn phải suy đoán**:
> `preview.complete` phân biệt dứt khoát "quét xong, thật sự 0 cược" với "chưa quét xong". Đây là ví
> dụ rõ nhất cho việc số thật + cờ hoàn tất tốt hơn proxy + ngưỡng thời gian.

Chi tiết engine tính số: [`p2-04b`](./p2-04b-settle-preview-engine.plan.md).
Chi tiết rule engine + worker + test: [`p2-04`](./p2-04-autopilot-settle-engine.plan.md).

### 3.5 Chính sách alert cho auto-settle — `OpsAutoSettleAlertPolicy`

#### 3.5.1 Vì sao `allowWithWarningAlerts: boolean` (bản đầu) không dùng được

Khảo sát alert engine Keno (07/09/2026) tìm ra **6 vấn đề**, mỗi vấn đề đủ để làm boolean đó sai:

| # | Phát hiện | Bằng chứng | Hệ quả với gate settle |
|---|---|---|---|
| 1 | **Keno KHÔNG CÓ test nào** cho `evaluateAlerts` | `packages/game-keno-application/test/use-cases/` chỉ có `global-config.test.ts`, `settle-entries.test.ts`. 3 game khác (`power655`/`mega645`/`lotto535`) **đều có** `evaluate-alerts.test.ts` — Keno là bản mẫu nhưng bị bỏ sót | Gate tiền thật dựa vào hàm chưa test = vi phạm nguyên tắc §7 của `00-overview` |
| 2 | **Vắng alert ≠ an toàn** (fail-open nghiêm trọng nhất) | `evaluate-ops-alerts.ts:120-127`: cursor **GLOBAL** theo `updatedAt`; 1 kỳ lỗi → `break`, **không tiến cursor** → alert **mọi kỳ sau** bị treo | `alertsCritical === 0` không phân biệt "không có rủi ro" với "evaluator chưa quét tới" |
| 3 | **Không có auto-resolve** | Grep: `OpsAlertStatus.Resolved` **chưa từng được ghi** ở Keno. Chỉ có `new → ack` thủ công (`ops-alert-repo.ts:105-116`) | Gate "còn alert mở" sẽ **khoá Auto-Pilot vĩnh viễn** nếu staff không ack |
| 4 | `status` **không reset** khi điều kiện xấu đi | `bulkUpsertByDedupe` (`ops-alert-repo.ts:47-72`) `$set` severity+payload nhưng **không** reset `status` | Alert đã `ack` rồi xấu hơn → severity lên Critical mà `status` vẫn `ack`. Gate dùng `status === new` sẽ **MỞ** dù rủi ro còn nguyên |
| 5 | **Severity hardcode**, không cấu hình được | `evaluate-alerts.ts`: `>= 10` (largeBetCount, dòng 80), `>= 100%` (exposure, 97), `>= 90%` (skew, 199), `× 2` (combo, 146) | Nếu gate = `critical`, các số này thành **ngưỡng tài chính** nhưng phải deploy mới đổi được |
| 6 | `alertCounts` trong snapshot đang **GLOBAL** | `countByStatus`/`countActiveCritical` (`ops-alert-repo.ts:74-89`) không filter `drawId`; `countByDrawIds` mới nằm trong plan `p0-03`, **chưa code** | Dùng nguyên trạng → 1 kỳ bất kỳ có alert sẽ chặn **TOÀN BỘ** kỳ |

Bạn nhận định đúng: **cùng một alert nhưng ngữ nghĩa khác nhau ở 2 ngữ cảnh.** Monitor cần **nhạy** (thà
cảnh báo thừa hơn bỏ sót — người xem rồi bỏ qua, chi phí thấp). Settle-gate cần **chính xác** (cảnh báo
thừa làm Auto-Pilot vô dụng vì chặn hết; cảnh báo thiếu làm mất tiền). Một ngưỡng không phục vụ được cả
hai.

#### 3.5.2 Giải pháp: 3 lớp, tách **ngưỡng monitor** khỏi **ngưỡng settle-gate**

**Nguyên tắc nền: gate settle KHÔNG đọc collection alert.** Nó dùng **số tiền thật từ preview** với
**bộ ngưỡng riêng** — chính là §3.4.4 (`maxPayoutRatio`, `maxPayoutAbsolute`, `minNetProfit`…).

> Cập nhật 07/09 lần 2: nguyên tắc này **mạnh hơn** sau khi đổi sang số tiền thật. Bản trước gate "tự
> tính lại chỉ số từ stats doc" — tức vẫn dùng **cùng nguồn dữ liệu** với alert engine, chỉ khác ngưỡng.
> Giờ gate dùng nguồn **hoàn toàn khác** (`keno_settle_previews` vs `keno_draw_betting_stats`) và loại
> số liệu khác (tiền thật vs proxy worst-case) ⇒ độc lập thật sự, không chỉ độc lập về ngưỡng.

Đây là điểm thiết kế quan trọng nhất của §3.5. Lý do:

- **Không phụ thuộc engine chưa test** (vấn đề 1) — gate dùng hàm pure của chính nó, test được độc lập.
- **Miễn nhiễm fail-open của cursor** (vấn đề 2) — gate không hỏi "có alert không", nó hỏi "chỉ số của kỳ
  này là bao nhiêu". Không có khái niệm "chưa quét tới".
- **Không bị `status` treo** (vấn đề 3, 4) — không đọc `status`.
- **Ngưỡng cấu hình được** (vấn đề 5) — ngưỡng của gate nằm trong `OpsAutoSettleConfig`, sửa từ UI.
- **Tự nhiên per-draw** (vấn đề 6) — stats doc vốn là 1 doc/draw.

Alert **vẫn có vai trò**, nhưng là **lớp bổ sung**, không phải nguồn quyết định chính:

```typescript
/**
 * Chính sách dùng alert làm điều kiện phụ cho auto-settle.
 *
 * QUAN TRỌNG: đây là lớp BỔ SUNG. Điều kiện CHÍNH là các ngưỡng tự tính ở
 * `OpsAutoSettleConfig` (§3.4.4) — gate KHÔNG phụ thuộc alert engine để hoạt động đúng.
 * Lý do: alert engine Keno chưa có test, cursor global có thể làm vắng alert giả tạo, và
 * không có auto-resolve (§3.5.1). Tin nó làm nguồn quyết định duy nhất là fail-open.
 *
 * Ngưỡng của alert engine (`ops.alerts.*`) phục vụ MONITOR — cần nhạy. Ngưỡng của gate
 * (`OpsAutoSettleConfig`) phục vụ QUYẾT ĐỊNH — cần chính xác. Hai bộ TÁCH BIỆT, cố ý.
 */
export interface OpsAutoSettleAlertPolicy {
  /**
   * Cách dùng alert:
   * - `ignore` — bỏ qua hoàn toàn. Chỉ dựa ngưỡng tự tính. **Mặc định** cho tới khi alert
   *   engine có test + auto-resolve.
   * - `blockOnCritical` — alert `critical` của CHÍNH kỳ đó (status `new` HOẶC `ack`) chặn
   *   auto-settle. Cần `countByDrawIds` (`p0-03`) đã code.
   * - `blockOnAny` — mọi alert `warning`/`critical` của kỳ đó đều chặn. Bảo thủ nhất, dùng
   *   giai đoạn đầu nếu muốn thận trọng tối đa; chấp nhận Auto-Pilot làm được rất ít.
   */
  mode: OpsAutoSettleAlertMode;

  /**
   * Bỏ qua alert cũ hơn N phút khi tính điều kiện chặn. `0` = không bỏ qua alert nào.
   *
   * Cần thiết vì KHÔNG CÓ auto-resolve (§3.5.1 vấn đề 3): alert `new` tồn tại vĩnh viễn tới
   * khi staff ack. Không có ngưỡng này, một alert bị quên sẽ khoá Auto-Pilot cho kỳ đó mãi.
   *
   * ⚠️ Đây là **đánh đổi có ý thức**: alert cũ có thể vẫn đang phản ánh rủi ro thật. Chỉ dùng
   * giá trị dương khi `mode !== ignore` VÀ đã hiểu rõ điều này. An toàn hơn: giữ `0` và làm
   * auto-resolve cho alert engine.
   */
  ignoreAlertsOlderThanMinutes: number;

  /**
   * Các loại alert được **miễn trừ** — có alert loại này vẫn cho auto-settle.
   *
   * Có mặt vì các loại alert có giá trị chẩn đoán RẤT khác nhau đối với việc settle:
   * `large_bet` báo "có người cược to" (đã được `maxSingleEntryPayout` xử lý chính xác hơn —
   * nó biết số tiền THẬT vé đó trả, không phải tiềm năng worst-case — nên alert này chỉ là
   * thông tin trùng lặp); `cap_sets_near` báo "cap sắp kích hoạt" (rủi ro settle logic thật —
   * KHÔNG nên miễn trừ, dù `blockOnCapTriggered` đã chặn cap ĐÃ kích hoạt).
   *
   * `settle_preview_mismatch` KHÔNG BAO GIỜ được đưa vào danh sách này — nó không nói "kỳ này
   * rủi ro", nó nói "máy đang tính sai tiền" (`p2-04b` §5.2). Việc chặn nó là hard-coded,
   * không đi qua `alertPolicy`.
   *
   * Dùng type dẫn xuất → thêm alert type mới, compiler bắt mọi chỗ liệt kê.
   */
  exemptTypes: KenoOpsAlertType[];
}

export const OpsAutoSettleAlertMode = {
  Ignore: "ignore",
  BlockOnCritical: "block_on_critical",
  BlockOnAny: "block_on_any",
} as const;
export type OpsAutoSettleAlertMode =
  (typeof OpsAutoSettleAlertMode)[keyof typeof OpsAutoSettleAlertMode];
```

#### 3.5.3 Lộ trình 3 bước cho alert (không phải chọn 1 lần rồi xong)

| Bước | `mode` | Điều kiện chuyển sang bước sau |
|---|---|---|
| **1. Bật Auto-Pilot lần đầu** | `ignore` | Chỉ dựa ngưỡng tự tính (§3.4.4). Dry-run ≥ 2 tuần + hiệu chuẩn ngưỡng (§3.4.5) xong |
| **2. Alert engine đã chín** | `blockOnCritical` | Cần **cả 3**: (a) `evaluate-alerts.test.ts` cho Keno đã có (port từ `power655`), (b) `countByDrawIds` (`p0-03`) đã code, (c) cursor global đã có cơ chế không chặn chuỗi (hoặc đã đo được là không xảy ra thật) |
| **3. Có auto-resolve** | có thể siết `blockOnAny` | Alert engine biết tự đóng alert khi điều kiện hết → gate không bị treo bởi alert bị quên |

**Bước 2 KHÔNG được bỏ qua để nhảy sang bước 3.** Và bước 1 là **mặc định xuất xưởng** — không phải "cấu
hình tạm", mà là trạng thái đúng cho tới khi 3 điều kiện của bước 2 được thoả.

#### 3.5.4 Việc phải làm ở alert engine (ngoài phạm vi plan này, nhưng phải ghi ra)

Bốn việc, **không** thuộc `p2-01`, nhưng chặn bước 2 của §3.5.3:

1. **Port `evaluate-alerts.test.ts` từ `power655` sang Keno.** Đây là việc nên làm **bất kể** Auto-Pilot —
   Keno là bản mẫu của 6 game còn lại mà lại là game duy nhất không có test cho evaluator.
2. **Implement `countByDrawIds`** — đã có code sẵn trong `p0-03` §3.3, chỉ chưa viết.
3. **Auto-resolve alert khi kỳ `Settled`/`Void`** — hoặc TTL cho alert. Không có nó, `status` là dữ liệu
   chỉ-tăng, không phản ánh trạng thái hiện tại.
4. **Sửa `alertCounts` GLOBAL → per-draw** trên trang Operations (bug đã ghi nhận ở `p0-03`).

Việc 1 nên nâng lên **điều kiện chặn của `p2-04`** (không chỉ của `mode: blockOnCritical`), vì
`p2-05` §4.1 dùng `alertsCritical` để hiện badge — badge sai cũng dẫn tới quyết định sai của người.

## 4. Cache + invalidation

`OpsAlertsConfig` đã có cơ chế cache config (đọc `GetGlobalConfigUseCase`). `autoPilot` đi cùng
`GameConfig` nên **tự động** dùng chung cache — không cần cơ chế riêng.

**Nhưng phải verify:** khi staff sửa config qua UI, cache có được invalidate không? Nếu không, worker
sẽ đọc ngưỡng cũ trong TTL — với 4 giai đoạn đều là mutation, đó là "tắt Auto-Pilot mà máy vẫn chạy
thêm N phút" ở BẤT KỲ giai đoạn nào, không riêng settle.

Đọc `cache-design.mdc` + `UpdateGameConfigUseCase` để xác nhận. Nếu invalidation chưa có → **plan này
phải thêm**, không để `p2-02`→`p2-04` xử lý riêng.

**Riêng 4 field `enabled` (`open.enabled`, `close.enabled`, `publish.enabled`, `settle.enabled`): mỗi
worker PHẢI đọc giá trị tươi**, không qua cache, hoặc cache TTL ≤ 30s. Lý do: tắt Auto-Pilot ở BẤT KỲ
giai đoạn nào là hành động khẩn cấp (kill switch) — độ trễ 5 phút là không chấp nhận được, kể cả cho
giai đoạn "rủi ro thấp" như mở/đóng bán (staff có thể cần dừng vì lý do vận hành đột xuất, không chỉ
lý do tài chính).

## 5. UI cấu hình

Theo `game-config-ui.mdc` (đọc rule đó trước khi code). Section mới trong trang Game Config Keno:
**"Auto-Pilot"**, với **4 sub-panel** — một cho mỗi giai đoạn, KHÔNG gộp thành 1 form lớn (rủi ro khác
nhau, staff cần bật/tắt độc lập, panel gộp sẽ tạo cảm giác sai "đây là 1 tính năng, bật hết hoặc không
bật gì").

### 5.1 Đối chiếu với `AutoPilotToggle` (đã tồn tại, CHỈ LÀ UI)

`apps/backoffice/.../operations/_lib/auto-pilot-toggle.tsx` đã có 1 pill toggle "Mira Auto-Pilot" trên
header trang Operations — theo comment trong file, **chưa nối chức năng thật** (state cục bộ, không
gọi API). Khi nối: pill này là **switch tổng hợp tiện lợi** (đại diện "cả 4 giai đoạn có đang bật gì
không"), KHÔNG phải nguồn chân lý — nguồn chân lý là 4 field `enabled` trong `OpsAutoPilotConfig`.

**Hành vi khi bấm pill:**
- Hiển thị: bật (màu tím) nếu **≥ 1** trong 4 giai đoạn `enabled: true`; tắt nếu cả 4 `false`.
- Bấm để TẮT (khi đang có ≥ 1 giai đoạn bật): tắt CẢ 4 — đây là kill switch tổng, hợp lý vì pill nằm
  ngay trang vận hành, staff bấm khi cần dừng NGAY, không có thời gian vào Game Config chọn từng cái.
- Bấm để BẬT (khi cả 4 đang tắt): **KHÔNG** tự bật cả 4 — mở dialog dẫn tới trang Game Config để chọn
  từng giai đoạn muốn bật với ngưỡng cụ thể. Bật cả 4 cùng lúc từ 1 click trên pill nhỏ là bỏ qua toàn
  bộ quy trình xác nhận ngưỡng (§5.2) — không được phép.
- Đổi tooltip: liệt kê rõ giai đoạn nào đang bật/tắt, không chỉ nói chung "tự giám sát và xử lý".

### 5.2 4 panel trong Game Config

Mỗi panel:
- `Switch` cho `enabled` của giai đoạn đó — kèm cảnh báo rõ khi bật.
- Input số cho từng ngưỡng của giai đoạn đó (xem §3.1–§3.5).
- **Panel con "Điều kiện luôn áp dụng"** (read-only) liệt kê hard-coded conditions của giai đoạn đó.

**Panel giai đoạn 4 (`settle`) bắt buộc có thêm cột "Số liệu thực tế".** Mỗi ngưỡng hiện phân bố 30
ngày của chính chỉ số đó, lấy từ `keno_settle_previews` — đây là **số tiền thật**, staff có trực giác
trực tiếp về nó (khác hẳn phân bố proxy của bản trước, staff không có cảm nhận nào về "exposure ratio
47.3"):

| Ngưỡng | Hiện cạnh input |
|---|---|
| `maxPayoutRatio` | `p50 / p90 / p95 / max` của `financials.payoutRatio`, **kèm RTP lý thuyết** từ `rules/odds.ts` để đối chiếu |
| `maxPayoutAbsolute` | `p90 / p95 / max` của `financials.totalPayout` (VND) |
| `minNetProfit` | **`p5 / p10 / p50 / min`** của `financials.netProfit` (VND) — đây là **sàn** nên hiện percentile THẤP, không phải cao. Hiện rõ giá trị âm |
| `maxSingleEntryPayout` | `p90 / p95 / max` của `topEntryPayout` (VND) |
| `blockOnCapTriggered` | Số kỳ đã kích hoạt cap trong 30 ngày (đếm tuyệt đối) |
| `maxRevenue` | `p50 / p90 / max` của `financials.totalStake` |
| `settleDelayMinutes` | Phân bố `publishedAt − closeAt` **và** phân bố thời gian preview hoàn tất (p50/p95/max) — ngưỡng phải trên p95 của số thứ hai (§3.4.4) |

Panel cũng phải hiện **sức khoẻ vòng kiểm chứng**: số kỳ đã verify / số kỳ `matched: false` trong 30
ngày. Có kỳ `matched: false` ⇒ hiện banner đỏ "Auto-Pilot kết sổ đang bị chặn cứng do preview lệch
settle thật" (điều kiện hard-coded §3.4.5), kèm link tới kỳ lệch.

`minNetProfit` là ngưỡng duy nhất là **sàn** giữa các ngưỡng khác đều là **trần** — UI phải nói rõ
("thấp hơn giá trị này → chờ người"), và cho nhập số âm mà không hiện lỗi validation.

**Panel giai đoạn 4 cũng phải hiện trạng thái alert engine** (§3.5.3): nếu `mode !== ignore` mà 3 điều
kiện của bước 2 chưa thoả (chưa có test Keno / chưa có `countByDrawIds` / cursor global chưa xử lý) →
banner cảnh báo rõ *"Chế độ này dựa vào alert engine chưa được kiểm chứng đầy đủ. Xem §3.5.3."*

**Panel giai đoạn 3 (`publish`) có banner trạng thái phụ thuộc ResultFeed:**
*"Auto-Pilot nhận kết quả cần ResultFeed đã publish kết quả kỳ này. Trạng thái ResultFeed: {kết nối
được / chưa có dữ liệu cho kỳ nào / lỗi}."* — banner này gọi `GetVietlottResultUseCase` cho 1 kỳ mẫu
gần nhất để staff biết ngay pipeline có hoạt động không, TRƯỚC khi bật `enabled`.

**Panel giai đoạn 1 (`open`) phải giải thích mô hình reconcile**, vì nó phản trực giác so với "cron chạy
lúc 23:00": *"Worker chạy liên tục mỗi ~5 phút, luôn bù đủ số kỳ còn thiếu. `nextDayFromLocalTime` chỉ
giới hạn thời điểm sớm nhất tạo kỳ cho ngày mai — không phải giờ worker chạy. Kỳ thiếu của hôm nay được
bù ngay, không chờ giờ này."*

Zod validate ở route (`code-quality-standards.mdc` §8 — **không** validate lại trong use-case):

```typescript
const autoOpenConfigSchema = z.object({
  enabled: z.boolean(),
  horizonDays: z.number().int().min(0).max(7),
  // `.optional()` — không set = tạo ngày mai bất cứ lúc nào (§3.1).
  nextDayFromLocalTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Định dạng HH:mm")
    .optional(),
  // `0` = tạo hết phần thiếu trong 1 lần → dùng `nonnegative`, KHÔNG `positive`.
  maxDrawsPerRun: z.number().int().nonnegative(),
  openImmediately: z.boolean(),
});

const autoCloseConfigSchema = z.object({
  enabled: z.boolean(),
  graceSeconds: z.number().int().nonnegative(),
  maxDrawsPerRun: z.number().int().positive().max(BULK_MAX_DRAWS),
});

const autoPublishConfigSchema = z.object({
  enabled: z.boolean(),
  minMinutesAfterDrawTime: z.number().int().nonnegative(),
  maxDrawsPerRun: z.number().int().positive().max(BULK_MAX_DRAWS),
});

const autoSettleAlertPolicySchema = z.object({
  mode: z.enum([
    OpsAutoSettleAlertMode.Ignore,
    OpsAutoSettleAlertMode.BlockOnCritical,
    OpsAutoSettleAlertMode.BlockOnAny,
  ]),
  ignoreAlertsOlderThanMinutes: z.number().int().nonnegative(),
  exemptTypes: z.array(z.enum(Object.values(KenoOpsAlertType))),
});

const autoSettleConfigSchema = z
  .object({
    enabled: z.boolean(),
    // Payout ratio thật = totalPayout / totalStake. KHÔNG chặn trên 1.0 — kỳ trả nhiều hơn thu
    // là hoàn toàn có thật trong xổ số (ratio > 1). `0` = tắt tiêu chí.
    maxPayoutRatio: z.number().nonnegative(),
    maxPayoutAbsolute: z.number().int().nonnegative(),
    // Sàn lợi nhuận ròng — CHO PHÉP ÂM. KHÔNG dùng nonnegative/positive ở đây
    // (`financial-reporting-system.mdc` §4: netProfit có thể âm).
    minNetProfit: z.number().int(),
    maxSingleEntryPayout: z.number().int().nonnegative(),
    blockOnCapTriggered: z.boolean(),
    maxRevenue: z.number().int().nonnegative(),
    settleDelayMinutes: z.number().int().nonnegative(),
    maxDrawsPerRun: z.number().int().positive().max(BULK_MAX_DRAWS),
    alertPolicy: autoSettleAlertPolicySchema,
  })
  .refine(
    (cfg) =>
      !cfg.enabled || cfg.maxPayoutRatio > 0 || cfg.maxPayoutAbsolute > 0,
    {
      message:
        "Không thể bật auto-settle khi cả maxPayoutRatio và maxPayoutAbsolute đều = 0 — " +
        "quy ước `0` là TẮT tiêu chí, nên cấu hình này sẽ settle mọi kỳ mà không kiểm tra tiền. " +
        "Đặt ít nhất một trần tiền theo phân bố thật (§3.4.5) trước khi bật.",
      path: ["enabled"],
    },
  )
  .refine((cfg) => !cfg.enabled || cfg.settleDelayMinutes >= 5, {
    message:
      "settleDelayMinutes phải ≥ 5 khi bật — cần đủ thời gian cho worker preview hoàn tất " +
      "(cron 2 phút, kỳ đông cần nhiều nhịp). Nhỏ hơn thì Auto-Pilot luôn thấy preview " +
      "chưa complete và không bao giờ chạy. Chốt số thật bằng đo p95 (p2-04b §4).",
    path: ["settleDelayMinutes"],
  });

export const autoPilotConfigSchema = z.object({
  open: autoOpenConfigSchema,
  close: autoCloseConfigSchema,
  publish: autoPublishConfigSchema,
  settle: autoSettleConfigSchema,
});
```

Bốn điểm phải làm đúng ở schema này:

1. **`.max(BULK_MAX_DRAWS)`** — chặn ngay ở nhập liệu, không để engine xử lý giá trị vô lý. **Trừ**
   `open.maxDrawsPerRun`: giai đoạn 1 không gọi bulk-settle, trần của nó là
   `KENO_CREATE_DRAW_BATCH_MAX` và worker tự chunk (§3.1) → chỉ cần `nonnegative`.
2. **`maxPayoutRatio` KHÔNG chặn trên 1.0.** Kỳ trả nhiều hơn thu là chuyện có thật (`ggr` âm) — chặn
   `.max(1)` sẽ khiến không cấu hình được ngưỡng nới cho kỳ như vậy.
3. **`minNetProfit` KHÔNG được `nonnegative()`/`positive()`.** Đây là lỗi dễ mắc nhất ở schema này:
   `netProfit` âm là **giá trị hợp lệ và thường gặp** (`financial-reporting-system.mdc` §4 cấm
   validate `>= 0`). Chặn âm ⇒ không cấu hình được "cho phép lỗ tới X".
4. **`.refine` chặn bật khi cả 2 trần tiền = 0.** Khác bản trước ở chỗ dùng `||` (chỉ cần **một**
   trần hiệu lực) thay vì `&&` (đòi **mọi** ngưỡng > 0). Lý do: `maxSingleEntryPayout`/`maxRevenue`
   là tiêu chí bổ trợ, tắt chúng là lựa chọn hợp lệ sau khi đã tin 2 trần chính.

**Bật `enabled` ở BẤT KỲ panel nào phải có confirm dialog** nêu rõ ngưỡng hiện tại của riêng giai đoạn
đó. Bật một tính năng tự động tác động vòng đời kỳ quay không được là 1 click, kể cả giai đoạn "rủi ro
thấp" (mở/đóng bán) — vì lỗi vận hành (VD tạo nhầm lưới kỳ do config `horizonDays` sai) vẫn cần staff ý
thức rõ trước khi bật.

**Audit:** đổi bất kỳ field nào trong `autoPilot` phải ghi audit log — ai bật/tắt, ngưỡng cũ → mới,
**và giai đoạn nào**. Đây là thay đổi quyền hạn của máy, phải tra được theo từng giai đoạn riêng.

## 6. Test

| Case | Kỳ vọng |
|---|---|
| Config chưa tồn tại (doc cũ) | Đọc ra cả 4 `enabled: false`, không crash |
| `settle.maxDrawsPerRun = 51` | Zod chặn (`400`) |
| `open.nextDayFromLocalTime = "25:00"` | Zod chặn |
| `open.nextDayFromLocalTime` không set | Hợp lệ — tạo ngày mai bất cứ lúc nào |
| `open.horizonDays = 0` | Hợp lệ — chỉ bù kỳ thiếu hôm nay |
| `open.maxDrawsPerRun = 0` | Hợp lệ — tạo hết phần thiếu 1 lần |
| `open.horizonDays = 8` | Zod chặn (`.max(7)`) |
| Số âm ở bất kỳ ngưỡng nào | Zod chặn |
| `settle.maxPayoutRatio = 2.5` | **Hợp lệ** — ratio không chặn trên 1.0 (kỳ trả nhiều hơn thu là có thật) |
| `settle.minNetProfit = -50_000_000` | **Hợp lệ** — sàn cho phép ÂM (§3.4.4). Đây là case dễ bị Zod chặn oan nhất |
| `settle.minNetProfit = 0` | Hợp lệ — nghĩa "chỉ tự chốt kỳ có lãi" |
| `settle.enabled = true` + `maxPayoutRatio = 0` + `maxPayoutAbsolute = 0` | Zod chặn qua `.refine` — không có trần tiền nào hiệu lực |
| `settle.enabled = true` + `maxPayoutRatio = 0` + `maxPayoutAbsolute > 0` | **Hợp lệ** — chỉ cần MỘT trần (dùng `\|\|`, không `&&`) |
| `settle.enabled = true` + `settleDelayMinutes = 2` | Zod chặn qua `.refine` (< 5 phút, preview không kịp) |
| `settle.blockOnCapTriggered = false` | Hợp lệ, nhưng UI phải cảnh báo rõ đây là lựa chọn rủi ro |
| `settle.enabled = false` + mọi ngưỡng `0` | **Hợp lệ** — tắt thì không cần ngưỡng đúng |
| `settle.alertPolicy.mode` giá trị lạ | Zod chặn (`z.enum`) |
| `settle.alertPolicy.exemptTypes` chứa type không tồn tại | Zod chặn |
| Bật `enabled` ở 1 giai đoạn | Confirm dialog nêu đúng ngưỡng của giai đoạn đó, KHÔNG ảnh hưởng 3 giai đoạn khác |
| Sửa config | Cache invalidate, worker đọc giá trị mới trong ≤ 30s |
| Tắt `enabled` ở 1 giai đoạn | CHỈ worker giai đoạn đó dừng trong ≤ 30s, 3 giai đoạn khác không đổi |
| Bấm pill `AutoPilotToggle` để TẮT khi có ≥1 giai đoạn bật | Cả 4 `enabled` → `false` |
| Bấm pill để BẬT khi cả 4 tắt | Mở dialog dẫn tới Game Config, KHÔNG tự bật gì |
| Đổi config | Audit log ghi ngưỡng cũ → mới + tên giai đoạn |
| Panel read-only mỗi giai đoạn | Hiện đúng hard-coded conditions của giai đoạn đó |
| Banner ResultFeed ở panel `publish` | Gọi đúng `GetVietlottResultUseCase`, hiện trạng thái thật |
| Thêm `KenoOpsAlertType` mới | Compiler bắt mọi chỗ liệt kê `exemptTypes` |

Case "tắt 1 giai đoạn không ảnh hưởng 3 giai đoạn khác" là test cách ly rủi ro — **bắt buộc**, đây là
lý do chính tách 4 config con thay vì 1 switch tổng.

**Phải verify khi code (không đoán):**

1. ~~**Worker `keno:stats-sync` có cập nhật `updatedAt` cho kỳ KHÔNG có entry mới không?**~~ — **KHÔNG
   CÒN CẦN** sau khi đổi hướng sang số tiền thật (§3.4.2). `maxStatsStalenessSeconds` đã bị bỏ; vai trò
   của nó do `preview.complete` + `preview.resultFingerprint` đảm nhiệm, cả hai đều không phụ thuộc
   hành vi `updatedAt` của stats worker. Giữ dòng này để không ai đi verify việc đã hết liên quan.
2. ~~**`capExposureByPlayType` có sẵn ở tầng nào?**~~ — **KHÔNG CÒN CẦN**: quyết định settle không đọc
   exposure nữa. Hàm này vẫn dùng cho monitor/alert giai đoạn bán vé (ngoài phạm vi plan này).
3. **`ops` section có tồn tại trong doc config production chưa?** — **VẪN CẦN.**
   `config.ops.alerts` trực tiếp → doc thiếu `ops` sẽ crash. Kiểm tra bằng Compass trước khi thêm
   `ops.autoPilot`.

## 7. Review checklist

- [ ] Cả 4 `enabled` mặc định `false`; thiếu config = cả 4 `false` (fail-safe).
- [ ] KHÔNG có field `void`/`resettle`/`allowResettle` ở bất kỳ đâu trong `OpsAutoPilotConfig` (§0.1).
- [ ] **`settle` KHÔNG đọc `draw.financial`/`draw.stats`** — đọc `keno_settle_previews` (§3.4.0 + §3.4.2).
- [ ] **`settle` KHÔNG đọc proxy exposure** từ `keno_draw_betting_stats` — không còn field nào của nó trong `OpsAutoSettleConfig` (§3.4.2).
- [ ] `minNetProfit` **KHÔNG** bị `nonnegative()`/`positive()` trong Zod — cho phép ÂM (§3.4.4 điểm 3).
- [ ] 6 điều kiện hard-coded §3.4.2 có mặt đủ, **đặc biệt `preview.complete === false`** (bẫy fail-open lớn nhất).
- [ ] `preview.complete` là **field riêng**, không suy diễn từ `entriesScanned > 0`.
- [ ] `resultFingerprint` được so với kết quả **hiện tại** của draw mỗi lần đánh giá, không tin cache.
- [ ] Kill switch tự động khi có `SettlePreviewMismatch` chưa resolved trong 7 ngày (§3.4.2).
- [ ] `settleDelayMinutes` tính từ mốc **MUỘN HƠN** giữa `closeAt` và `result.publishedAt`, không phải chỉ `closeAt`.
- [ ] `settleDelayMinutes` ≥ p95 thời gian preview hoàn tất (đo ở `p2-04b` §4) — nhỏ hơn thì Auto-Pilot không bao giờ chạy.
- [ ] `alertPolicy.mode` mặc định `ignore`; gate settle hoạt động đúng **không phụ thuộc** alert engine (§3.5.2).
- [ ] `publish` KHÔNG có `requireHumanVerified`/`minSourceCount`/`maxExposure` (§3.3 — đã bỏ có lý do).
- [ ] `open` dùng mô hình reconcile — KHÔNG có `runAtLocalTime` kiểu "giờ worker chạy" (§3.1).
- [ ] `open` KHÔNG tạo lại slot đã `Void`, KHÔNG tạo slot có `drawTime` đã qua.
- [ ] Hard-coded conditions mỗi giai đoạn có comment giải thích vì sao, không cấu hình được.
- [ ] `publish.enabled` có banner cảnh báo phụ thuộc ResultFeed G5 ở UI.
- [ ] `maxDrawsPerRun` của `close`/`publish`/`settle` ≤ `BULK_MAX_DRAWS`, enforce Zod. `open` dùng `nonnegative` (trần khác).
- [ ] `maxPayoutRatio` **không** bị `.max(1)` trong Zod (kỳ trả nhiều hơn thu là có thật).
- [ ] `.refine` chặn bật `settle.enabled` khi **cả hai** trần tiền chính = 0 (dùng `||`, không `&&`).
- [ ] Cache invalidation đã verify; cả 4 `enabled` đọc tươi hoặc TTL ≤ 30s.
- [ ] Confirm dialog khi bật BẤT KỲ giai đoạn nào, nêu ngưỡng cụ thể của riêng giai đoạn đó.
- [ ] UI hiện **phân bố số tiền thật** cạnh mỗi input; `minNetProfit` hiện percentile **THẤP** (p5/p10/min) vì là sàn (§5.2).
- [ ] UI hiện **sức khoẻ vòng kiểm chứng** (số kỳ verify / số kỳ lệch 30 ngày) + banner đỏ khi có kỳ lệch.
- [ ] Audit log cho mọi thay đổi `autoPilot`, ghi rõ giai đoạn.
- [ ] Zod validate ở route, use-case **không** validate lại (§8 code-quality).
- [ ] Panel read-only liệt kê điều kiện không thể tắt, riêng cho từng giai đoạn.
- [ ] `AutoPilotToggle` (nếu nối chức năng thật trong plan này): TẮT = tắt cả 4; BẬT = dẫn tới Game Config, không tự bật.
- [ ] `OpsAutoSettleAlertMode` khai `const as const` + type dẫn xuất (§5.3 code-quality).
- [ ] Không dùng LLM/eve ở bất kỳ đâu trong plan này.
- [ ] `pnpm check-types` + `pnpm lint` xanh.

## 8. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| **Đọc field POST-settle làm điều kiện pre-settle** (lỗi bản đầu) | 🔴 | §3.4.0 ghi rõ; checklist chặn; `undefined` không được `?? 0` |
| **Dùng preview dở dang** (`complete: false`) — số nhỏ hơn thật ⇒ mọi trần "đạt" giả tạo | 🔴 | Hard-code §3.4.2 điều kiện 2; `complete` là field riêng; test `p2-04b` §8.3. **Đây là fail-open lớn nhất của thiết kế mới** |
| **Preview tính sai tiền mà không ai biết** | 🔴 | Vòng tự kiểm chứng `verification.delta` mỗi kỳ + alert `SettlePreviewMismatch` Critical + kill switch 7 ngày (§3.4.2) |
| **Vắng alert bị hiểu là an toàn** (cursor global chặn chuỗi) | 🔴 | `alertPolicy.mode: ignore` mặc định — gate tự tính, không hỏi alert (§3.5.2) |
| Dùng preview tính theo kết quả đã bị republish | 🔴 | `resultFingerprint` so định danh kết quả, không so thời gian (§3.4.2) |
| Bật 1 giai đoạn mà ngưỡng chưa điền → máy làm sai hàng loạt | 🔴 | Mặc định `false` + `.refine` chặn bật khi cả 2 trần tiền = 0 + confirm nêu ngưỡng |
| Tắt mà máy vẫn chạy do cache | 🔴 | `enabled` đọc tươi / TTL ≤ 30s + test §6 |
| Ai đó thêm field `void`/`resettle` vào config sau này | 🔴 | Review checklist chặn cứng + §0.1 giải thích lý do |
| Zod chặn oan `minNetProfit` âm ⇒ không cấu hình được "cho phép lỗ tới X" | 🟡 | §3.4.4 điểm 3 + checklist + test case riêng; `financial-reporting-system.mdc` §4 |
| `settleDelayMinutes` nhỏ hơn thời gian preview hoàn tất ⇒ Auto-Pilot **không bao giờ** chạy | 🟡 | `.refine` sàn 5 phút; đo p95 khi hiệu chuẩn (§3.4.5 bước 7); alert nếu preview tồn `complete: false` lâu |
| Ngưỡng chọn bằng cảm giác, không hiệu chuẩn | 🟡 | §3.4.5: backfill 30 ngày + 3 lớp kiểm chứng (delta 0 / RTP lý thuyết / kỳ người đã can thiệp) + UI hiện phân bố |
| Alert cũ không auto-resolve khoá Auto-Pilot vĩnh viễn | 🟡 | `mode: ignore` mặc định; `ignoreAlertsOlderThanMinutes` khi cần; §3.5.4 việc #3 |
| `publish.enabled = true` trước khi ResultFeed đạt G5 | 🟡 | Banner trạng thái ResultFeed ở UI; vô hại (luôn `null` → không làm gì) nhưng gây hiểu nhầm |
| `open` reconcile tạo trùng do race 2 lần chạy chồng nhau | 🟡 | Distributed lock per-game (`p2-02`); `CreateDrawUseCase` guard 6 vẫn là lớp chặn cuối |
| Bấm pill `AutoPilotToggle` tưởng bật hết 4 giai đoạn cùng lúc | 🟡 | Pill BẬT không tự bật gì, chỉ dẫn tới Game Config (§5.1) |
| Không tra được ai bật giai đoạn nào | 🟡 | Audit log ghi rõ giai đoạn |
| Ngưỡng đặt quá cao vì không hiểu đơn vị | 🟡 | UI ghi rõ `(VND)` / `(tỷ lệ)` / `(phút)`, hiện phân bố thật cạnh input |
| `settle.maxRevenue` bị hiểu là chỉ số rủi ro | 🟢 | JSDoc ghi rõ nó là **van giới hạn quy mô**, không phải đo rủi ro (§3.4.2) |
| Preview bị hiểu là số liệu tài chính chính thức | 🟢 | `keno_settle_draw_reports` vẫn là số chính thức; UI nhãn "TẠM TÍNH" (`p2-04b` §1) |

**So sánh mức rủi ro trước/sau đổi hướng:** hai rủi ro 🔴 nặng nhất của bản proxy — *"fail-open khi
stats chậm/treo"* và *"so exposure RAW thay vì đã cap"* — **biến mất hoàn toàn**, vì không còn đọc
`keno_draw_betting_stats` nữa. Thay vào đó xuất hiện *"dùng preview dở dang"* — cùng bản chất fail-open
nhưng **kiểm soát được dứt khoát** bằng một cờ boolean, thay vì phải đoán ngưỡng giây.

Và có thêm một thứ bản proxy không thể có: **rủi ro "máy tính sai tiền" được tự phát hiện** qua
`verification.delta`, không cần ai đi soi.

**Gợi ý mạnh cho UI:** hiện phân bố thực tế cạnh mỗi input (VD *"payoutRatio 30 ngày: p50 = 0.58 ·
p90 = 0.79 · p95 = 0.91 · max = 2.34 — RTP lý thuyết 0.60"*). Số tiền thật thì staff có trực giác trực
tiếp, nhưng vẫn cần phân bố để biết ngưỡng mình đặt sẽ chặn bao nhiêu phần trăm số kỳ.

## 9. Rollback

Revert commit. Field `autoPilot` còn trong doc đã lưu nhưng không ai đọc → vô hại. Nếu muốn chắc chắn:
set cả 4 `enabled: false` cho mọi game **trước** khi revert.
