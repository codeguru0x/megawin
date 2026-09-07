# Ops Hub — Page Layout Guideline (Keno / Bingo 18)

Chuẩn UI/UX cho trang `operations-hub` — trang **giám sát N kỳ** của game tần số cao.
Áp dụng cho `keno` (119 kỳ/ngày, 8 phút/kỳ) và `bingo18` (158 kỳ/ngày, ~5 phút/kỳ).

Guideline này **không thay** [`operations-page-ui.mdc`](../../rules/operations-page-ui.mdc) —
rule đó cho trang **1 kỳ, sâu**. Hub là trang **N kỳ, mỏng**, mục tiêu khác nên nhiều
quy tắc phải khác. Chỗ nào khác đều ghi rõ lý do.

---

## 0. Bài toán thật — đọc trước khi thiết kế

Con số quyết định toàn bộ thiết kế:

### 0.1 Mô hình bán hàng thật — nguồn gốc của mọi quyết định UI

**Toàn bộ kỳ trong ngày được mở bán gần như đồng thời từ đầu ngày.** Người chơi được
chọn cược bất kỳ kỳ nào trong ~158 kỳ (Bingo18, `drawIntervalMinutes = 6`) / ~119 kỳ
(Keno, `= 8`). Mỗi 6–8 phút có **đúng 1 kỳ** vượt `sales.closeAt` và rời khỏi trạng thái
nhận cược.

Ba hệ quả bắt buộc phải thiết kế theo:

1. **`sales.closeAt` là KHOÁ CỨNG tự động**, không phải mốc mà scheduler "phải đóng sổ".
   Nó chặn cược sau khi có kết quả. `status = salesOpen` mà `now > closeAt` là **hoàn
   toàn bình thường** — chỉ nghĩa là *hết giờ cược, chưa chốt sổ bán*. Nhân viên chốt
   sổ theo **batch** (mỗi ~1 giờ, hoặc sau khi có kết quả), nên trạng thái này tồn tại
   hàng giờ theo đúng thiết kế.
2. **Hàng trăm kỳ `selling` đồng thời**, không phải 1–2. Đây là trạng thái *thường
   trực*, không phải ngoại lệ.
3. **Kỳ "tương lai" gần như không tồn tại** — vì đã mở bán hết. Không đầu tư thiết kế
   cho nhóm này (xem §3).

### 0.2 Phân bố thực tế trong ngày

| Thời điểm  | Đang nhận cược | Hết giờ cược (vùng vận hành) |
| ---------- | -------------- | ---------------------------- |
| 06:00      | ~150           | ~0                           |
| 12:00      | ~105           | ~45 (phần lớn đã settle)     |
| 22:00      | ~5             | ~150 (phần lớn đã settle)    |
| Khi backlog| ~105           | **112 chưa settle** (đã xảy ra thật) |

Vùng "hết giờ cược" tăng đều 1 kỳ / 6–8 phút. Nếu chốt sổ + settle theo kịp, số kỳ
**chưa hoàn thành** trong vùng này luôn nhỏ. **Vùng này phình ra chính là tín hiệu sự
cố** — đó là chỉ báo quan trọng nhất của cả trang.

### 0.3 Nguyên tắc gốc — hai bề mặt, không phải một bảng

Hai nhóm kỳ có **bản chất vận hành khác nhau hoàn toàn**, nên phải là **hai bề mặt UI
khác nhau**, không phải một bảng với filter:

| | **Đang nhận cược** | **Hết giờ cược** |
| --- | --- | --- |
| Số lượng | hàng trăm | vài chục |
| Có action không? | **Không** (chỉ giám sát) | **Có** (chốt sổ, publish, settle, void) |
| Quan tâm điều gì | **tiền**: doanh thu, vé, exposure, bất thường | **tiến độ pipeline**: có KQ chưa, kết sổ chưa, treo bao lâu |
| Dạng UI phù hợp | tổng hợp + **heatmap** + top-N outlier | **bảng chi tiết** + bulk action |

Nhồi cả hai vào một bảng là gốc của mọi khó dùng: 150 dòng đồng nhất không cần action
làm chìm mất vài chục dòng cần action.

---

## 1. Mô hình trạng thái — trục xương sống của cả trang

### 1.1 Hai trục độc lập — đừng trộn vào một enum

Sai lầm của bản trước: gộp tất cả vào một `DrawPhase` phẳng, trong đó `Stuck` **ăn mất**
thông tin "đang ở chặng nào". Khi thấy badge `Stuck` thì không biết là *treo lúc chờ kết
quả* hay *treo lúc đang settle* — hai sự cố khác nhau, cách xử lý khác nhau.

Mô hình đúng có **hai trục vuông góc**:

- **Trục A — `SaleGate`**: người chơi có cược được không? Quyết định bởi `status` **và**
  `now` vs `sales.closeAt`. Đây là trục **phân vùng bề mặt UI** (§0.3).
- **Trục B — `OpsStage`**: kỳ đang ở chặng nào của pipeline vận hành. **Chỉ có ý nghĩa
  sau khi hết giờ cược.**

Cộng thêm **một cờ độc lập** `health` (`ok | warn | stuck`) = "chặng hiện tại đã kéo dài
quá ngưỡng của chính chặng đó chưa". `stuck` là **thuộc tính của chặng**, không phải một
chặng riêng — nhờ vậy badge luôn đọc được là `Đang kết sổ · treo 14p`, giữ nguyên cả
"đang ở đâu" và "có vấn đề".

### 1.2 Khai báo

Field có sẵn: `drawTime`, `sales.closeAt`, `status`, `settledAt`, `result.publishedAt`
(`game-keno/src/entities/draw.ts`, `game-core/src/types/draw.ts`).

Theo §5.3 `code-quality-standards.mdc` (`const object as const`), **không** string trần:

```typescript
/** Trục A — cổng bán hàng. Quyết định kỳ thuộc bề mặt UI nào và action nào khả dụng. */
export const SaleGate = {
  /** Đang nhận cược: `salesOpen && now < closeAt`. Hàng trăm kỳ ở đây. */
  Open: "open",
  /**
   * ⚠️ CHƯA TỪNG mở bán mà vẫn còn cửa sổ bán: `scheduled && now < closeAt`.
   * Đang mất doanh thu nhưng **cứu được** → action **MỞ BÁN**.
   */
  PendingOpen: "pending_open",
  /**
   * ⚠️ ĐÃ mở rồi bị đóng tay / huỷ trước giờ: `now < closeAt` &&
   * `status ∈ {salesClosed, voiding, void}`. Cũng đang mất doanh thu.
   * `salesClosed` → **MỞ BÁN LẠI** được (`OpenSalesUseCase` cho phép từ `salesClosed`).
   * `voiding`/`void` → không cứu được, chỉ để thấy.
   */
  Halted: "halted",
  /** Hết giờ cược — khoá cứng `closeAt` đã qua. Vùng vận hành. */
  Ended: "ended",
} as const;
export type SaleGate = (typeof SaleGate)[keyof typeof SaleGate];

/** Trục B — chặng pipeline vận hành. Chỉ đầy đủ ý nghĩa khi gate ≠ Open. */
export const OpsStage = {
  /** Đang bán, chưa có gì để làm. Quan tâm duy nhất: tiền. */
  Selling: "selling",
  /** Hết giờ cược, status vẫn salesOpen — CHỜ CHỐT SỔ BÁN (batch). Bình thường. */
  PendingClose: "pending_close",
  /**
   * Đã chốt sổ bán, chưa tới giờ quay.
   * Cửa sổ này CỰC NGẮN: `closeAt = drawTime − salesCloseBeforeSeconds`
   * (Keno 60s, Bingo18 30s) → chặng này chỉ tồn tại tối đa 60s/30s.
   */
  AwaitingDraw: "awaiting_draw",
  /** Đã qua giờ quay, chưa có kết quả. */
  AwaitingResult: "awaiting_result",
  /** Có kết quả, chưa kết sổ. Tiền đang treo. */
  AwaitingSettle: "awaiting_settle",
  /** Đang chạy kết sổ. */
  Settling: "settling",
  /** Đang chạy huỷ kỳ. */
  Voiding: "voiding",
  /** ⚠️ Kết quả sửa SAU khi đã kết sổ → phải kết sổ lại. */
  NeedsResettle: "needs_resettle",
  /**
   * ⚠️ Kỳ TRẮNG: `scheduled` và đã qua `closeAt` — chưa từng mở bán, không còn
   * cứu được. Khác `PendingClose` hoàn toàn: không có gì để chốt sổ, không có
   * doanh thu, và **không** publish được. Đường ra duy nhất là **VOID**.
   */
  NeverOpened: "never_opened",
} as const;
export type OpsStage = (typeof OpsStage)[keyof typeof OpsStage];

/** Cờ sức khoẻ — chặng hiện tại đã kéo dài quá ngưỡng của CHÍNH chặng đó chưa. */
export const StageHealth = {
  Ok: "ok",
  Warn: "warn",
  Stuck: "stuck",
} as const;
export type StageHealth = (typeof StageHealth)[keyof typeof StageHealth];
```

### 1.3 Bảng dẫn xuất — nguồn chân lý (implement đúng thứ tự)

Field có sẵn để dẫn xuất: `status`, `drawTime`, `sales.closeAt`, `sales.openAt?`, `settledAt?`,
`result.publishedAt?`, `updatedAt`. Đã verify trên `packages/game-keno/src/entities/draw.ts`
(`DrawDoc` dòng 144-218) và `packages/game-core/src/types/draw.ts` (`DrawSales` dòng 20-25).

**Bước 1 — `SaleGate`** (xét từ trên xuống, match đầu tiên thắng):

| # | Điều kiện | Gate | Ghi chú |
|---|---|---|---|
| 1 | `now ≥ closeAt` | `Ended` | **Chốt trước mọi thứ khác** — hết giờ cược là hết, bất kể `status`. Vùng vận hành. |
| 2 | `status = salesOpen` | `Open` | Đang nhận cược. Trạng thái thường trực của hàng trăm kỳ. |
| 3 | `status = scheduled` | **`PendingOpen`** ⚠️ | Chưa từng mở bán, **còn cứu được** → action MỞ BÁN. |
| 4 | `status ∈ {salesClosed, voiding, void}` | **`Halted`** ⚠️ | Đóng tay / huỷ trước giờ. `salesClosed` mở lại được; `voiding`/`void` thì không. |

Đặt `now ≥ closeAt` làm **điều kiện đầu tiên** là có chủ đích: gate trở thành phép chia **theo
thời gian trước, theo status sau**. Nhờ vậy không tồn tại kỳ vừa `Ended` vừa `PendingOpen` —
điều sẽ xảy ra nếu xét `status` trước.

**Vì sao tách `PendingOpen` / `Halted` thay vì gộp `ClosedEarly` như bản trước:** hai nhóm khác
nhau ở **action** — thứ duy nhất người vận hành cần. `PendingOpen` = "chưa bấm mở bán, bấm đi";
`Halted` = "đã đóng/huỷ tay, cân nhắc mở lại". Gộp thì badge không nói được phải làm gì, và
`void` (không cứu được) nằm chung với `scheduled` (cứu được trong 1 click).

Đã verify `OpenSalesUseCase` (`packages/game-keno-application/src/use-cases/draws/open-sales.ts:19`)
nhận `allowedFrom = [Scheduled, SalesClosed]` → **cả hai gate mới đều mở bán được**, chỉ khác
nhãn nút ("Mở bán" vs "Mở bán lại"). Nó **không** kiểm tra `now < closeAt`, nên hub **phải** tự
chặn: không hiện nút cho kỳ đã qua `closeAt` (xem p0-04 §2.4).

**Bước 2 — `OpsStage`** (xét từ trên xuống, match đầu tiên thắng):

| # | Điều kiện | Stage | Ý nghĩa vận hành |
|---|---|---|---|
| 1 | `status = salesOpen` && `now < closeAt` | `Selling` | Đang bán. Chỉ quan tâm tiền, không có action. |
| 2 | `status = published` && `settledAt != null` && `result.publishedAt > settledAt` | **`NeedsResettle`** ⚠️ | KQ sửa sau kết sổ → tiền đã trả có thể sai. |
| 3 | `status = settling` | `Settling` | Đang chạy kết sổ. |
| 4 | `status = voiding` | `Voiding` | Đang chạy huỷ. |
| 5 | `status = published` && `settledAt == null` | `AwaitingSettle` | **Tiền đang treo** — chưa biết phải trả bao nhiêu. |
| 6 | `status = salesClosed` && `now ≥ drawTime` | `AwaitingResult` | Đã qua giờ quay, chưa có KQ. |
| 7 | `status = salesClosed` && `now < drawTime` | `AwaitingDraw` | Đã chốt sổ, chờ tới giờ quay. Cửa sổ ≤ 60s (Keno) / ≤ 30s (Bingo18). |
| 8 | `status = salesOpen` && `now ≥ closeAt` | `PendingClose` | **Hết giờ cược, chờ chốt sổ bán.** Bình thường theo batch. |
| 9 | `status = scheduled` && `now ≥ closeAt` | **`NeverOpened`** ⚠️ | Kỳ trắng — không chốt sổ được, không publish được. Chỉ VOID. |
| 10 | `status = scheduled` && `now < closeAt` | `Selling` | Chưa mở bán; stage không mang ý nghĩa, đọc theo **gate `PendingOpen`**. |

Ba điểm khác biệt so với bản trước:

1. **#1, #8, #9 dùng điều kiện thời gian TƯỜNG MINH**, không tham chiếu `gate = Ended`. Bảng
   stage vì vậy đọc độc lập được, không phải nhớ bảng gate. Quan trọng khi implement: hàm dẫn
   xuất stage **không** nhận `gate` làm input → không có thứ tự phụ thuộc ngầm giữa hai bảng, và
   test được từng bảng riêng.
2. **#9 là chặng riêng `NeverOpened`, không còn gộp vào `PendingClose`.** Bản trước gộp là **sai
   về action**: `PendingClose` cần bấm **CHỐT SỔ**, còn `NeverOpened` bấm chốt sổ sẽ **lỗi** —
   `CloseSalesUseCase` (`close-sales.ts:13`) filter theo `status = salesOpen`, kỳ `scheduled`
   không khớp và trả `DRAW_INVALID_TRANSITION`. Cho hai thứ cùng badge = mời người vận hành bấm
   nút chắc chắn lỗi.
3. **#8 không còn là `Stuck`/`Overdue`.** Nó là chặng hợp lệ, ngưỡng riêng rất rộng (§8.3).

**Bước 3 — `health`**: so `ageInStage` với ngưỡng **của riêng chặng đó** (§8.3).
`ageInStage` lấy mốc gần nhất có ý nghĩa cho chặng: `closeAt` cho `PendingClose`/`NeverOpened`,
`drawTime` cho `AwaitingResult`, `result.publishedAt` cho `AwaitingSettle`,
`updatedAt` cho `Settling`/`Voiding`.

Với gate `PendingOpen`/`Halted`, mốc **không phải tuổi mà là thời gian CÒN LẠI**:
`remaining = closeAt − now`. `health = stuck` khi `remaining < MIN_SALES_WINDOW_SECONDS`
(= 60, hằng số đã có tại `packages/game-core/src/utils/draw-schedule.ts:125`), `warn` khi
`remaining < 3 × MIN_SALES_WINDOW_SECONDS`.

Dùng đúng hằng số đó, **không** đặt ngưỡng riêng cho hub: nó là predicate **duy nhất** trong hệ
thống trả lời "kỳ này còn đáng mở bán không" (`isDrawSlotCreatable`, JSDoc dòng 133-137 ghi rõ
"KHÔNG viết lại điều kiện ở chỗ khác"). Hai định nghĩa lệch nhau = hub báo "còn kịp" trong khi
phần tạo kỳ đã coi slot đó là hết hạn.

**Quy tắc bắt buộc:** tính ở **1 hàm pure duy nhất**
`derive-draw-state.ts` → `(row, now, thresholds) => { gate, stage, health, ageInStage, reason }`.
Cấm rải `if (status === ...)` trong component.

Vì kết quả phụ thuộc `now`, `useMemo` theo `[rows, nowTick, thresholds]`, `nowTick` nhích
mỗi 1s qua `startTransition` (§5.11 `vercel-react-best-practices`) — **không** setState
trực tiếp mỗi giây với hàng trăm dòng.

**`now` phải là giờ SERVER, không phải `Date.now()` thô của máy staff.** Toàn bộ gate/stage dựa
trên so `now` vs `closeAt`/`drawTime`; laptop lệch giờ 5 phút phân loại sai cả trang (hiện
`Ended` cho kỳ đang bán, hoặc ngược lại) mà **không có triệu chứng nào khác**. Response mang
`serverNow`; client tính `offset = serverNow − Date.now()` một lần mỗi lần fetch rồi dùng
`Date.now() + offset` cho mọi phép dẫn xuất. Xem p0-03 §5.

### 1.4 Trục thời gian — biên chốt cược + điều hướng Overview / Brush / Focus

#### 1.4.1 Mốc phân chia là "biên chốt cược", không phải `now`

Bản trước dùng `now` làm mốc phân chia — **sai**, vì `now` cắt ngang một đám đông đang
bán chứ không cắt vào ranh giới có ý nghĩa. Mốc đúng là **biên chốt cược**: kỳ có
`closeAt` gần `now` nhất từ phía trước.

```
  Kỳ đã hết giờ cược ──────────────►│◄────── Kỳ đang nhận cược ──────────►
  (vùng vận hành, phải rỗng dần)    │ BIÊN   (hàng trăm kỳ, chỉ giám sát tiền)
                                    │ 14:07
```

Đặc tính làm nó là mốc đúng:

- **Di chuyển 1 kỳ mỗi 6–8 phút** — đúng nhịp vận hành thật (Keno `drawIntervalMinutes = 8`,
  Bingo18 `= 6`; cả hai cấu hình được nên **không** hardcode).
- **Bên phải luôn đông và luôn khoẻ.** Bên trái **phải rỗng dần** khi settle theo kịp.
- **Vùng bên trái phình ra = sự cố.** Một quan sát duy nhất, không cần đọc số.

Hệ quả cho UI: không có "sticky divider `now`" giữa bảng. Hai vùng là **hai bề mặt tách
biệt** (§0.3): bảng vận hành cho bên trái, heatmap tiền cho bên phải.

#### 1.4.2 Vấn đề điều hướng: 150 kỳ trên một trục, cần xem "lân cận"

Người vận hành cần hai thứ **cùng lúc**, và chúng xung đột nhau:

- **Toàn cảnh**: cả ngày có ổn không, khối sự cố nằm ở giờ nào. Cần **nén** 150 kỳ vào 1 màn hình.
- **Lân cận**: 3–5 kỳ trước và sau biên, đủ chi tiết để đọc số. Cần **giãn** ra.

Không có một view nào làm được cả hai. Giải pháp chuẩn cho đúng lớp bài toán này là
**Overview + Detail (focus + context)** — cụ thể là mẫu **Overview strip + Brush + Focus rail**,
thứ mà mọi công cụ time-series dày (Chrome DevTools Performance, Grafana, TradingView) đều dùng.

#### 1.4.3 Ba tầng — hình dạng

```
┌─ Tầng 1: OVERVIEW · toàn ngày, cao O(1), không cuộn ───────────────────────────┐
│ ██████░░░░░░░░░░░░████▓▓▓▓▓▓│▂▃▅▇█▅▃▂▃▅▇█▆▃▂▁▂▃▅▇▆▃▂▁▂▃▂▁▂▃▅▃▂▁▂             │
│ └ 06:00 ────────────────┘BIÊN└──────────────────────────────── 21:48 ┘         │
│        ▓▓▓▓▓▓▓▓▓▓▓▓  ← BRUSH: cửa sổ đang focus, kéo được, snap theo kỳ        │
└────────────────────────────────────────────────────────────────────────────────┘
┌─ Tầng 2: STEPPER · điều khiển ─────────────────────────────────────────────────┐
│  [⏮ đầu ngày] [◀ 10 kỳ] [◀ 1] · kỳ #101–#111 · 13:31–14:47 · [1 ▶] [10 ▶] [⏭] │
│  [◉ Về biên]  ← nút reset, hiện dấu ◉ khi đang tự bám biên                     │
└────────────────────────────────────────────────────────────────────────────────┘
┌─ Tầng 3: FOCUS RAIL · 11 card (5 trước · BIÊN · 5 sau) ────────────────────────┐
│ #101  #102  #103  #104  #105 ║ #106 ║ #107  #108  #109  #110  #111             │
│ 13:31 13:39 13:47 13:55 14:03║14:11 ║14:19 14:27 14:35 14:43 14:51             │
│ ✓kết  ✓kết  ⏳chờ  🔴treo ⏳chờ ║ hết  ║ bán   bán   bán   bán   bán            │
│  sổ    sổ   KQ    47p   chốt ║ giờ  ║                                          │
│ 12.4tr 9.8tr 11.2tr 284tr 8.1tr║3.2tr ║2.1tr 1.8tr 0.9tr 0.4tr 0.1tr           │
│ ▃▃▃▃  ▂▂▂   ▃▃▃   █████  ▂▂  ║ ▂     ║ ▂     ▂     ▁     ▁     ▁              │
│ ─────────────── median ─────────────────────────────────────────────────────    │
└────────────────────────────────────────────────────────────────────────────────┘
```

#### 1.4.4 Quy tắc — Tầng 1 (Overview)

- Chính là **Day Flow** ở §4, không phải component thứ hai. Một dải, hai tầng con (chặng / tiền).
- **1 kỳ = 1 cột**, `flex-1 min-w-[3px]`. 158 cột × ~6px ≈ 950px → vừa content width, **không
  cuộn ngang**. Đây là điều kiện tồn tại của tầng này: cuộn ngang là mất toàn cảnh.
- **Brush** = 1 khối `bg-primary/15` + 2 handle. Kéo thân để pan, kéo handle để đổi độ rộng.
- **Snap theo kỳ, không theo pixel.** Kéo xong, biên brush nhảy về mốc kỳ gần nhất. Không snap
  thì cửa sổ rơi vào "giữa hai kỳ" và tầng 3 phải quyết định làm tròn — sinh nhảy nhót 1 kỳ.
- Click bất kỳ đâu trên overview → brush **nhảy tới, giữ nguyên độ rộng** (không đổi zoom khi
  người dùng chỉ muốn đổi vị trí).

#### 1.4.5 Quy tắc — Tầng 2 (Stepper)

- Bước **1 kỳ** và **10 kỳ**, hai chiều, cộng nhảy đầu/cuối ngày. Bước cố định theo **số kỳ**,
  không theo phút: người vận hành đếm bằng kỳ, không bằng phút.
- Luôn hiện **khoảng đang xem bằng cả hai đơn vị**: `kỳ #101–#111` và `13:31–14:47`. Chỉ hiện
  một đơn vị là buộc người đọc tự quy đổi.
- Nút **`Về biên`** đưa cửa sổ về giữa biên chốt cược và **bật lại chế độ tự bám**.

#### 1.4.6 Quy tắc — Tầng 3 (Focus Rail)

- **11 card = 5 trước · biên · 5 sau.** Cửa sổ mặc định; brush đổi được độ rộng nhưng **giới hạn
  7–21 card**. Dưới 7 mất ngữ cảnh; trên 21 chữ nhỏ hơn ngưỡng đọc và mất luôn lý do tồn tại
  của tầng này.
- Vạch **`║`** đôi ở biên chốt cược — dày hơn mọi đường khác trên trang. Bên trái là vùng vận
  hành, bên phải là vùng đang bán.
- Mỗi card: `drawNo` · giờ quay · badge chặng + health · doanh thu · **mini bar doanh thu**.
- **Đường median ngang xuyên cả rail**: đây là thứ làm outlier hiện ra bằng *hình dạng*, không
  cần đọc số. Median tính **trong cùng gate** (§9.2), không phải toàn rail — kỳ mới mở bán 2
  phút không so được với kỳ đã bán 8 tiếng.
- Click card → focus dòng tương ứng ở Zone 5A/5B (scroll + highlight 2s). **Không** filter bảng.
- Card có `health ≠ ok` → viền đỏ/amber. Đây là nơi 1 kỳ treo giữa 150 kỳ khoẻ **đập vào mắt**.

#### 1.4.7 Tự bám biên — quy tắc chống "nhảy dưới tay người dùng"

| Trạng thái | Hành vi khi biên dịch sang kỳ mới |
|---|---|
| Đang tự bám (mặc định) | Cửa sổ dịch theo, giữ biên ở giữa. Có animation nhẹ để thấy được. |
| Người dùng đã pan/zoom tay | **ĐÓNG BĂNG.** Không tự dịch. Hiện chip `Biên đã sang #107 · [Về biên]`. |

Tự dịch khi người dùng đang đọc là lỗi UX nghiêm trọng nhất của loại UI này: đúng lúc họ định
bấm vào một card thì nó chạy đi. Quy tắc: **mọi tương tác tay đều tắt auto-follow**, chỉ nút
`Về biên` bật lại.

#### 1.4.8 Bàn phím

`←`/`→` = 1 kỳ · `Shift+←`/`Shift+→` = 10 kỳ · `Home`/`End` = đầu/cuối ngày · `c` = về biên.
Cùng 1 listener ở cấp trang (§4.1 `vercel-react-best-practices`), không mỗi card một listener.

#### 1.4.9 URL

`focus` (drawId ở giữa cửa sổ) và `span` (số card) vào nuqs (§6.1). Nhờ vậy gửi được link
"xem lân cận kỳ #104" cho đồng nghiệp — cách báo sự cố nhanh nhất trong ca trực.

Khi **không** có `focus` trong URL: mặc định tự bám biên. Khi **có**: auto-follow tắt ngay từ
lần render đầu (người ta mở link vì muốn xem đúng chỗ đó).

#### 1.4.10 Rail điều hướng KHÔNG filter bảng — quyết định quan trọng

Zone 5A hiện **toàn bộ** kỳ cần xử lý, **không** bị cắt theo cửa sổ đang focus. Rail chỉ để
*nhìn* và *nhảy tới*.

Lý do: backlog cần xử lý có thể nằm rải rác 8 giờ trong ngày (kỳ 07:16 treo trong khi biên đã
sang 14:11). Nếu rail filter bảng thì cửa sổ 11 kỳ quanh biên sẽ **ẩn mất đúng kỳ đang treo** —
biến công cụ điều hướng thành công cụ che thông tin.

#### 1.4.11 Các phương án đã cân nhắc và loại

| Phương án | Lý do loại |
|---|---|
| **Chỉ dùng bảng, cuộn dọc** | Không có toàn cảnh. 150 dòng = 12 màn hình; không cách nào thấy "khối sự cố ở giờ nào". |
| **Carousel/slider ngang 150 card** | Cuộn ngang là tương tác tệ nhất cho dữ liệu dày (không biết mình đang ở đâu, không có toàn cảnh, trackpad ngang khó điều khiển chính xác). |
| **Zoom liên tục (pinch/wheel) trên 1 trục** | Không có mức zoom nào đúng cho cả hai nhu cầu, và trạng thái zoom liên tục không share được qua URL một cách có ý nghĩa. |
| **Timeline có mốc phút (kiểu Gantt)** | Kỳ cách nhau đều 6/8 phút → mốc phút không thêm thông tin so với đánh số kỳ, mà chiếm chỗ. |
| **Virtual scroll ngang** | Vẫn cuộn ngang, thêm dependency, vẫn không có overview. |
| **Chart lib (recharts/visx) cho brush** | +40–80KB bundle cho brush mà ~80 dòng CSS + pointer event làm được. Vi phạm §2.1 `vercel-react-best-practices`. |

Mẫu đã chọn là **focus + context** cổ điển: overview giữ **ngữ cảnh** (không bao giờ mất toàn
cảnh), rail giữ **chi tiết** (đọc được số), brush là cầu nối duy nhất giữa hai cái.

### 1.5 Nhãn hiển thị — dùng đúng từ vận hành

Badge **không** hiện `status` thô. Hiện `stage`, và `health` là hậu tố:

| Stage | Nhãn | Màu | Hậu tố khi `health ≠ ok` |
|---|---|---|---|
| `Selling` | `Đang bán` | xám trung tính | — (không bao giờ stuck) |
| `PendingClose` | `Hết giờ cược` | slate | `· chờ chốt sổ 2g14p` |
| `AwaitingDraw` | `Chờ quay kết quả` | slate | — |
| `AwaitingResult` | `Chưa có kết quả` | amber khi warn | `· 6p` |
| `AwaitingSettle` | `Chờ kết sổ` | blue | `· treo 47p` |
| `Settling` | `Đang kết sổ` | blue + spinner | `· treo 14p` 🔴 |
| `Voiding` | `Đang huỷ` | violet | `· treo 9p` 🔴 |
| `NeedsResettle` | `Cần kết sổ lại` | **red** | — (luôn nghiêm trọng) |
| `NeverOpened` | `Chưa từng mở bán` | **red** | — (luôn nghiêm trọng, mất kỳ) |

Gate hiện thành badge riêng, chỉ khi **không** phải `Open`/`Ended` (hai gate bình thường):

| Gate | Nhãn | Màu | Hậu tố | Action |
|---|---|---|---|---|
| `PendingOpen` | `Chưa mở bán` | **amber** | `· còn 12p` (đếm ngược tới `closeAt`) | **Mở bán** |
| `Halted` | `Đã ngắt bán` | **amber** | `· còn 12p` | **Mở bán lại** (chỉ khi `salesClosed`) |

Phân biệt hai cái này quan trọng: `PendingOpen` là *quên mở*, `Halted` là *chủ động ngắt*. Cùng
màu amber vì cùng đang mất doanh thu, nhưng nguyên nhân và cách xử lý khác nhau — gộp lại thành
một nhãn `ClosedEarly` như bản trước làm người vận hành không biết đây là lỗi của mình hay là
quyết định có chủ đích của ca trước.

Nguyên tắc: nhãn trả lời được câu hỏi của người vận hành (*"kỳ này đang chờ ai làm gì"*),
không phải mô tả state machine.

---

## 2. Zone map (đã sửa)

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Zone 1  PageHeader — game, LIVE, ngày tài chính, tuổi dữ liệu           │
├─────────────────────────────────────────────────────────────────────────┤
│ Zone 2  Hai khối song song, KHÔNG phải 1 dải KPI:                       │
│         (A) VẬN HÀNH — phễu chặng của kỳ đã hết giờ cược  ~2/3 rộng     │
│         (B) ĐANG BÁN  — tiền đang vào + exposure           ~1/3 rộng     │
├─────────────────────────────────────────────────────────────────────────┤
│ Zone 3  Day Flow — 1 dải 150 kỳ theo giờ, có BIÊN chốt cược             │
├─────────────────────────────────────────────────────────────────────────┤
│ Zone 4  Alert Banner (chỉ khi bất thường / truncated)                   │
├─────────────────────────────────────────────────────────────────────────┤
│ Zone 5A  BẢNG VẬN HÀNH — kỳ đã hết giờ cược + Bulk Action Bar  ★ chính  │
├─────────────────────────────────────────────────────────────────────────┤
│ Zone 5B  BẢNG ĐANG BÁN — heatmap + top-N outlier (KHÔNG 150 dòng)       │
└─────────────────────────────────────────────────────────────────────────┘
                        Zone 6  ✗ KHÔNG có Detail Sheet → mở TAB MỚI (§7)
```

Thay đổi lớn nhất: **Zone 5 tách thành 5A / 5B** theo `SaleGate` (§0.3). Zone 5A là bề
mặt chính — nơi có action. Zone 5B thuần giám sát tiền.

---

## 3. Zone 2 — Hai khối song song (viết lại theo mô hình bán cả ngày)

Hai nhóm kỳ có bản chất khác nhau (§0.3) nên Zone 2 **không phải một dải KPI đồng nhất**.
Chia theo tỉ lệ **2 : 1** — vì bên vận hành là nơi có việc phải làm.

```
┌──────────────────────────────────────────────────┬──────────────────────────┐
│ (A) VẬN HÀNH · 23 kỳ đã hết giờ cược             │ (B) ĐANG BÁN · 105 kỳ    │
│                                                  │                          │
│ Hết giờ    Chờ    Chờ KQ   Chờ      Đang         │  Doanh thu đang vào      │
│ cược       quay            kết sổ   kết sổ       │      1.284 tỷ            │
│   4         2       1 ⚠      14 🔴     2          │  ▲ 12% so cùng giờ hôm qua│
│ 48.2tr    19.1tr   8.7tr   284.6tr  41.2tr       │                          │
│ ▓▓        ▓▓       ▓▓▓     ██████   ▓▓▓          │  312.480 vé · 41.204 bộ  │
│                                                  │  Exposure 2.1 tỷ (chưa cap)│
│ ⚠ 1 kỳ không nhận cược   ⚠ 1 cần kết sổ lại      │  ⚠ 3 kỳ doanh thu bất thường│
└──────────────────────────────────────────────────┴──────────────────────────┘
```

### 3.1 Khối (A) — Phễu vận hành

Chỉ gồm kỳ `gate = Ended`. Mỗi đoạn = 1 `OpsStage`, xếp **đúng thứ tự dòng chảy**
`PendingClose → AwaitingDraw → AwaitingResult → AwaitingSettle → Settling/Voiding`.

1. **Mỗi đoạn 3 dòng:** nhãn chặng · số kỳ (`text-2xl tabular-nums`) · **tổng doanh thu
   của chặng** (`text-xs tabular-nums`). Không bao giờ hiện count trơ.
2. **Bấm đoạn = filter Zone 5A** sang chặng đó. KPI và điều hướng là một.
3. **Chiều rộng tỉ lệ số kỳ** (`flex-grow` + `min-w`) → hình dạng phễu bất thường nhìn
   ra ngay: khúc `Chờ kết sổ` phình to = backlog, không cần đọc số.
4. **Màu chỉ cho chặng có `health ≠ ok`.** `PendingClose`/`AwaitingDraw` = slate trung
   tính **kể cả khi đông** — vì đông ở đây là bình thường. Đoạn 0 kỳ → chữ mờ, **giữ chỗ**,
   không ẩn (ẩn làm layout nhảy mỗi tick).
5. `animate-pulse` chỉ trên **icon** của đoạn có `stuck > 0`, không pulse cả khối.
6. **Dòng dưới cùng = bất thường rời rạc**: gate `PendingOpen`/`Halted`, và stage
   `NeedsResettle`/`NeverOpened`. Bốn loại này số lượng cực nhỏ nhưng nghiêm trọng, nếu để
   thành đoạn phễu thì bề rộng ~0px và biến mất. Cho ra dòng riêng dạng chip amber/red,
   bấm được. Chip `PendingOpen` kèm luôn nút **Mở bán** — đây là loại duy nhất cứu được
   bằng một cú click.

### 3.2 Khối (B) — Tiền đang vào

Nhóm đang bán **không có action**, nên không hiện count to. Hiện **tiền** to:

| Dòng | Nội dung | Ghi chú |
|---|---|---|
| 1 | **`Σ revenue` các kỳ đang bán** — `text-3xl tabular-nums` | Con số lớn nhất khối. |
| 2 | So sánh cùng giờ hôm qua (`▲12%`) | Cách duy nhất biết "hôm nay bán tốt/xấu" mà không cần nhìn 105 dòng. Cần 1 số lịch sử — xem §3.5. |
| 3 | `Σ entries` vé · `Σ sets` bộ | Khối lượng, không phải tiền. |
| 4 | `Σ worstCaseTotal` + nhãn **`(chưa cap)`** | Xem §3.4. |
| 5 | Chip `⚠ N kỳ doanh thu bất thường` | Dẫn xuống Zone 5B, danh sách top outlier (§9.2). |

Không hiện "số kỳ đang bán" ở cỡ lớn — 105 hay 103 không phải thông tin hành động.
Để nó ở tiêu đề khối (`ĐANG BÁN · 105 kỳ`).

### 3.3 Ngưỡng cảnh báo

- **`Chờ kết sổ`**: `> 0` → viền amber; có kỳ `health = stuck` → viền red + icon. Đây là
  chặng duy nhất được đổi viền theo tuổi, vì tuổi = mức nguy hiểm (tiền treo lâu hơn).
- **`Hết giờ cược` (PendingClose)**: **không** cảnh báo theo số lượng. Đông là bình
  thường (batch 1 giờ). Chỉ cảnh báo khi **kỳ cũ nhất** vượt `pendingCloseStuckSec`
  (§8.3) — tức là batch đã bỏ sót, hoặc sắp trôi qua ngày tài chính.
- **Exposure**: so `Σ payoutCaps.pickXMaxPerDraw` của các kỳ đang tính, **không** so
  doanh thu (§3.4).

### 3.5 So sánh cùng giờ hôm qua — có đáng thêm query không?

Dòng 2 của khối (B) cần 1 con số lịch sử. Nguyên tắc "4 query cố định" của p0-03 không
bị phá nếu lấy từ **`system_settle_game_daily` của ngày hôm trước** (1 doc, 1 query, đã
có sẵn collection) rồi nội suy theo tỉ lệ giờ. Chấp nhận **xấp xỉ** — mục đích là phát
hiện lệch ±30%, không phải báo cáo tài chính.

Nếu không muốn thêm query ở P1: bỏ dòng 2, thay bằng `Doanh thu TB/kỳ` (tính từ chính
`rows`, chi phí 0) — vẫn bắt được bất thường ở mức tổng.

### 3.4 ⚠️ BUG trong guideline cũ — `exposureWarnPct` so sai mẫu số

Guideline cũ §3 (KPI 5) ghi *"% so doanh thu"* và §4.2 ghi `exposurePct > exposureWarnPct`
→ **so hai mẫu số khác nhau**, ngưỡng vô nghĩa.

Sự thật trong code (`packages/game-keno/src/entities/types.ts:266-269`):

```typescript
/** Ngưỡng cảnh báo exposure — % của cap `maxPerDraw`. */
exposureWarnPct: number;
```

Và `worstCaseTotal` là **RAW, chưa cap** (`betting-stats.ts:116-117`):

> `Tổng worst-case RAW toàn kỳ (VND) = Σ worstCaseByPlayType (CHƯA cap)`
> Cap `maxPerDraw` cho pick8/9/10 **chỉ áp lúc BUILD RESPONSE / eval alert** qua
> `capExposureByPlayType`.

Hệ quả bắt buộc:

1. Hub phải phân biệt **2 tỉ lệ khác nhau**, không được trộn:
   - `exposureVsRevenuePct = worstCase / revenue` → chỉ để **đọc** (bao nhiêu lần doanh thu).
   - `exposureVsCapPct = cappedWorstCase / Σ pickXMaxPerDraw` → chỉ dùng để **so
     `exposureWarnPct`**.
2. Muốn cap được thì phải có `worstCaseByPlayType` (map theo playType). Projection
   "mỏng" của p0-03 **đang bỏ field này** → hoặc thêm vào projection, hoặc **nhãn UI
   bắt buộc ghi rõ `worst-case (chưa cap)`** và **không** so với `exposureWarnPct`.
3. Khuyến nghị: giai đoạn P1 chỉ hiện RAW + nhãn `(chưa cap)` + tooltip giải thích;
   để `exposureVsCapPct` cho P2 khi có nhu cầu thật. Hiện số sai kèm ngưỡng sai còn
   tệ hơn không hiện ngưỡng.

---

## 4. Zone 3 — Day Flow (dải 2 tầng, chìa khoá bài toán 150 kỳ)

### 4.1 Vì sao cần, và vì sao 2 tầng

Bảng cao **O(N)**: 150 kỳ = 12 màn hình cuộn. Dải cao **O(1)**: luôn vừa 1 màn hình dù
N là 119 hay 158. Đây là thứ duy nhất trả lời trong một cái nhìn: *"cả ngày có ổn không,
chỗ hỏng ở đâu trên trục giờ"*.

Phải **2 tầng** vì hai nhóm kỳ mã hoá hai loại thông tin khác nhau (§0.3): bên trái biên
mã hoá **chặng pipeline**, bên phải mã hoá **tiền**. Một tầng không thể chở cả hai.

### 4.2 Hình dạng

```
        ┌─ Kỳ đã hết giờ cược ────────────┐│┌─ Kỳ đang nhận cược ─────────────────┐
Tầng 1  ██████░░░░░░░░░░░░░░░░░░████▓▓▓▓▓▓││ (tầng 1 để trống bên phải)
chặng   └ settled ┘└ backlog 112 kỳ ┘     ││
                                          ││
Tầng 2  ▁▁▂▃▅▂▁▂▃▃▂▁▂▅█▃▂▁▂▃▂▁▁▂▃▅▃▂▁▂▃▂ ││▂▃▅▇█▅▃▂▃▅▇█▆▃▂▁▂▃▅▇▆▃▂▁▂▃▂▁▂▃▅▃▂▁▂
tiền                     ↑ đột biến 07:1x ││        ↑ đột biến 14:2x (đang bán!)
        ├────┼────┼────┼────┼────┼────┼───┤│┼────┼────┼────┼────┼────┼────┼────┤
       06:00     08:00    10:00    12:00  ││14:07 (BIÊN)  16:00    18:00   22:00
```

- **Mỗi kỳ = 1 cột dọc**, `flex-1 min-w-[3px]`, tổng cao ~48px (tầng 1: 20px, tầng 2: 28px).
  158 cột × 6px ≈ 950px → vừa content width, **không cuộn ngang**.
- **Tầng 1 — chặng**: màu theo `OpsStage` (§1.5). Chỉ vẽ cho `gate = Ended`. Bên phải
  biên để trống — vì `Selling` không có chặng nào đáng mã hoá bằng màu.
- **Tầng 2 — tiền**: chiều cao cột tỉ lệ `revenue / max(revenue)`. Đây là **sparkline
  histogram** — bắt outlier bằng *hình dạng*, nhanh hơn đọc số. Vẽ cho **cả hai** vùng.
- **BIÊN chốt cược** (§1.4): 1 vạch dọc `border-primary` cao hơn cả 2 tầng + nhãn giờ.
  Đây là mốc di chuyển 1 kỳ mỗi 6–8 phút. **Kèm brush** (§1.4.4) — Zone 3 chính là tầng
  Overview của bộ điều hướng ở §1.4, không phải component riêng.
- Cột gate `PendingOpen`/`Halted` → **viền amber cả 2 tầng**, dễ thấy dù nằm lẫn trong
  vùng đang bán. Cột `NeverOpened` → viền red.
- Hover → `HoverCard`: drawNo, giờ, stage, health, doanh thu, vé, exposure.
  Click → filter đúng kỳ đó ở Zone 5A/5B + scroll tới dòng.
- Cụm ≥3 cột cùng màu bất thường liền nhau → vẽ **1 khối** kèm nhãn `112 kỳ chờ kết sổ`.
  Sự cố là một *khối*, phải đọc như một khối, không phải 112 vạch rời.

### 4.3 Vì sao dạng này, không dùng dạng khác

Đã cân nhắc và loại:

| Phương án | Lý do loại |
|---|---|
| **Gantt / swimlane theo chặng** | Mỗi kỳ chỉ ở 1 chặng tại 1 thời điểm → Gantt trở thành 150 thanh 1-ô, tốn chiều cao O(N) mà không thêm thông tin. |
| **Calendar heatmap (grid giờ × phút)** | Ô không đều (Keno 8p, Bingo18 6p), phải padding giả → đọc sai mật độ. Trục giờ liên tục đúng hơn. |
| **Chart lib (recharts/visx)** | +40–80KB bundle cho thứ 150 `<div>` làm được. Vi phạm §2.1 `vercel-react-best-practices`. |
| **Danh sách phân trang** | Phá mục tiêu "1 cái nhìn thấy cả ngày" — cốt lõi của zone này. |
| **Virtual scroll 150 dòng** | Vẫn là O(N) chiều cao, chỉ rẻ hơn về DOM. Không giải quyết vấn đề *người đọc*. |

Dạng đã chọn là **dense pixel display** (nguyên tắc Tufte: tối đa data-ink per pixel) —
đúng loại bài toán "nhiều đơn vị đồng nhất trên một trục liên tục, cần bắt outlier".

### 4.4 Chi phí — bằng 0

Dùng đúng `rows` đã fetch cho Zone 5, không query thêm, không state riêng. Render bằng
`div` + flex, **không** SVG/canvas/chart lib. Nếu animate thì animate wrapper `div`
(§6.1 `vercel-react-best-practices`).

`memo()` theo `[rows, nowTick]` — không re-render khi selection trong bảng đổi.
Hover state giữ ở `useRef` + CSS, **không** setState (150 cột × mousemove = bão render;
§5.12 cùng rule).

---

## 5. Zone 5A — Bảng vận hành (bề mặt chính, nơi có action)

Chỉ chứa kỳ `gate ∈ {Ended, PendingOpen, Halted}` — tức mọi kỳ **không** đang bán bình
thường. Đây là bảng **duy nhất có checkbox và bulk action**. Kỳ `gate = Open` không vào
đây (§5B).

### 5.1 Tab lọc theo chặng — mặc định `Cần xử lý`

```
[ Cần xử lý (17) ] [ Hết giờ cược (4) ] [ Chưa có KQ (1) ] [ Chờ kết sổ (14) ] [ Tất cả (23) ]
    ↑ mặc định
```

`Cần xử lý` = `health ≠ ok` ∪ `stage ∈ {AwaitingSettle, NeedsResettle, NeverOpened}` ∪
`gate ∈ {PendingOpen, Halted}` ∪ `alertsCritical > 0`.

Định nghĩa này **không còn coi `PendingClose` là việc** — vì chốt sổ theo batch là bình
thường. Nó chỉ vào `Cần xử lý` khi `health ≠ ok` (batch đã bỏ sót).

**Không có tab `Đã xong`.** Query của hub chỉ lấy `DRAW_UNFINISHED_STATUSES` (p0-03) nên
`settled`/`void` **không có trong `rows`** — một tab luôn rỗng là bug hiển thị, không phải
tính năng. Hub là **bảng việc đang mở**, không phải lịch sử; xem lại kỳ đã xong thì vào
trang báo cáo/chi tiết kỳ. Số tab còn **5** → phím tắt `1`–`5` (§10).

Empty state phải mang **thông tin**, không phải hình minh hoạ:

> ✓ Không có kỳ nào cần xử lý · 4 kỳ chờ chốt sổ · 105 kỳ đang bán

Người trực cần phân biệt "không có việc" với "trang bị lỗi".

### 5.2 Sort mặc định

| Tab | Sort | Lý do |
|---|---|---|
| `Cần xử lý` | `health` desc → `ageInStage` desc | Triage: nặng nhất, treo lâu nhất lên đầu. |
| Tab chặng cụ thể | `ageInStage` desc | Trong cùng chặng, cũ nhất cần xử lý trước (FIFO). |
| `Tất cả` | `drawTime` asc | Đọc theo trục thời gian. |

**Không** mặc định `drawId` desc: kỳ mới nhất thường là kỳ **ít cấp bách nhất**.

### 5.3 Cột

| # | Cột | Align | Ghi chú |
|---|---|---|---|
| 0 | Rail | — | 3px + **icon** theo `health` (không chỉ màu — a11y §9.3) |
| 1 | Checkbox | — | Chỉ render khi kỳ có ≥1 action khả dụng |
| 2 | Kỳ | left | `#1042` + `drawNo`, `font-medium tabular-nums` |
| 3 | Giờ quay | right | `14:07` + dòng dưới `−12p` (tương đối) |
| 4 | **Chặng** | left | Badge `stage` + hậu tố `health` (§1.5) — **không** phải `status` thô |
| 5 | Trong chặng | right | `ageInStage` đã format; đỏ khi `stuck` |
| 6 | Doanh thu | right | `tabular-nums`; badge outlier (§9.2) |
| 7 | Vé / Bộ | right | 2 dòng trong 1 cột, tiết kiệm ngang |
| 8 | Exposure | right | RAW + nhãn `(chưa cap)` (§3.4) |
| 9 | Alerts | right | Badge `crit/warn`; 0 → `–` mờ |
| 10 | Actions | right | §7 |

Bỏ cột `status` thô (đã gộp vào Chặng). Mỗi cột thêm là một cột phải đọc.

### 5.4 Tô màu dòng — tối đa 1 màu, không zebra

`bg-destructive/5` cho `health = stuck`, `NeedsResettle` và `NeverOpened`; `bg-amber-500/5`
cho `health = warn` và `gate ∈ {PendingOpen, Halted}`; **không zebra striping**
(`operations-page-ui.mdc`).

Nền accent **rất nhạt** (`/5`); điểm nhấn ở **rail + icon + badge**, không ở nền. Nền đậm
với 112 dòng đỏ = cả trang đỏ = mất hết ý nghĩa "nổi bật".

### 5.5 Mật độ & chiều cao

- Toggle `Gọn / Thường` (28px / 40px), lưu ở zustand (§6.2).
- **Không** virtualization ở P1: `@tanstack/react-virtual` chưa có trong deps, và bảng
  này chỉ có vài chục dòng (đã tách phần trăm dòng sang 5B). Dùng CSS:

```css
.hub-row {
  content-visibility: auto;
  contain-intrinsic-size: 0 40px;
}
```

Trình duyệt bỏ layout/paint cho dòng ngoài viewport (§6.2 `vercel-react-best-practices`),
đủ cho trường hợp xấu nhất (backlog 112 dòng), 0 dependency mới.

### 5.6 Bulk Action Bar

Thanh dính đáy khi `selected > 0`; chỉ enable action khi **mọi** kỳ đã chọn hợp lệ; chặn
`maxDrawsPerRequest`; dialog xác nhận liệt kê từng kỳ; `Promise.allSettled` → partial
success. Bổ sung:

1. **Nút "Chọn tất cả kỳ đang lọc"** ghi rõ số **và tổng tiền**: `Chọn 14 kỳ · 284.6 tr`.
   Action tiền không được để người bấm đoán quy mô.
2. Dialog xác nhận hiện **tổng doanh thu** tập đã chọn ở đầu, cỡ lớn. Đây là thứ chặn
   được cú click sai 112 kỳ.
3. Selection là `Set<drawId>` in-memory, **tuyệt đối không persist** (§6.3).

---

## 5B. Zone 5B — Bảng đang bán (giám sát tiền, KHÔNG 150 dòng)

Chứa kỳ `gate = Open` — hàng trăm kỳ. **Không có action, không checkbox.** Vì vậy
tuyệt đối không render dạng bảng phẳng 150 dòng: sẽ không ai đọc, và làm chìm Zone 5A.

Ba lớp, thu gọn dần:

**Lớp 1 — Top-N bất thường (mặc định mở, ~5 dòng).**
Chỉ kỳ có `revenue > 3 × median` hoặc `revenue = 0 && ageSinceOpen > 30p` hoặc
`alertsCritical > 0`. Đây là **thứ duy nhất cần đọc** ở nhóm đang bán. Cột: Kỳ · Giờ ·
Doanh thu + badge `▲3.4×` · Vé/Bộ · Exposure · Alerts · `Chi tiết ↗`.

**Lớp 2 — Sparkline histogram (§4.2 tầng 2).**
Đã có ở Zone 3, không lặp lại. Bấm cột nào thì lọc Lớp 1 về kỳ đó.

**Lớp 3 — Bảng đầy đủ, mặc định ĐÓNG.**

```
▸  Xem toàn bộ 105 kỳ đang bán  ·  1.284 tỷ  ·  312.480 vé      [Mở rộng]
```

Chỉ dùng khi cần tra 1 kỳ cụ thể. Khi mở, có ô search theo `drawNo`/giờ — **tìm kiếm là
cách đúng để truy cập 105 dòng**, không phải cuộn. Trạng thái mở/đóng lưu ở zustand.

Đây là điểm thay thế cho "gom kỳ tương lai" của bản trước: nhóm cần gom **không phải**
kỳ tương lai (gần như không tồn tại — §0.1) mà là **kỳ đang bán**.

---

## 6. State — nuqs, zustand, và cái gì không được lưu

### 6.1 nuqs (URL) — thứ cần chia sẻ / khôi phục khi F5

`gate` (tab 5A), `stage`, `sort`, `dir`, `drawId` (focus 1 kỳ từ Day Flow), `focus` +
`span` (cửa sổ Focus Rail — §1.4.9).

Guideline/plan cũ (p1-02 §4) từ chối URL vì *"tạo history rác"* — **tiền đề sai**:
`nuqs` mặc định `history: "replace"`, không push entry mới. Thêm `clearOnDefault: true`
để URL sạch khi ở mặc định. Vậy phản đối đó không còn.

Lý do phải vào URL: khi mở tab mới cho trang chi tiết (§7), tab hub bị **F5 / restore
session** là chuyện thường trong ca trực 8 tiếng. Mất filter là mất ngữ cảnh sự cố. Và
gửi link `?filter=stuck` cho đồng nghiệp là cách báo sự cố nhanh nhất.

### 6.2 zustand + `persist` (localStorage) — thói quen cá nhân, không thuộc URL

`density`, `visibleColumns`, `sellingTableExpanded`, `soundOnCritical`, `dayFlowVisible`.

Đây là *preference*, không phải *view state* → không nên làm URL dài ra. Có `version`
trong `persist` để migrate an toàn (§4.4 `vercel-react-best-practices`), và **bọc
`try/catch`** khi đọc localStorage (throw trong chế độ ẩn danh).

### 6.3 KHÔNG được persist

**Selection.** Restore một selection cũ rồi người dùng bấm `Kết sổ` → kết sổ tập kỳ họ
không hề chọn trong phiên này. Với action tiền, mọi selection phải là hành động tường
minh trong phiên hiện tại. Đây là ranh giới an toàn, không phải lựa chọn UX.

---

## 7. Zone 6 — Chi tiết mở TAB MỚI (bỏ Detail Sheet)

**Thay đổi so với p1-03**: không làm Sheet/side panel.

Lý do vận hành: người trực cần **theo dõi hub liên tục** trong khi xử lý 1 kỳ. Sheet
che mất hub, đóng Sheet là mất chỗ đang xem. Chrome 2 tab cạnh nhau (hoặc 2 màn hình)
là workflow thật của phòng vận hành.

```tsx
// Dòng bảng: hàng Actions
<Button asChild variant="ghost" size="sm">
  <Link
    href={drawOperationsHref("keno", drawId)}
    target="_blank"
    rel="noopener"
    prefetch={false}
  >
    Chi tiết <ExternalLinkIcon />
  </Link>
</Button>
```

Quy tắc:

1. Dùng `<Link target="_blank" rel="noopener" prefetch={false}>`, **không** `window.open()` —
   giữ được Cmd/Ctrl+click, middle-click, "mở trong cửa sổ mới" của người dùng.
   `prefetch={false}` vì ~30 dòng × 1 link = 30 lần prefetch một trang nặng mà phần lớn
   không ai bấm (tiền lệ: `draw-command-center.tsx:308`).
2. **Param là `drawId`, KHÔNG phải `draw`** — `nav-registry.ts:213` khai
   `DRAW_ID_PARAM = { urlKey: "drawId", … }`. Href dựng qua helper `drawOperationsHref`
   (p1-03 §2.1) gọi `buildNavHref(NavPage.GameOperations, …)`, **không** nội suy string.
   Bản guideline trước ghi `?draw=` — đã sai, sửa tại đây.
3. Trang chi tiết đã đọc `drawId` từ URL nên **không cần code mới phía trang chi tiết**.
   Đây là lý do phương án này rẻ hơn Sheet. Lưu ý registry ghi rõ: URL **tự xoá** `?drawId=`
   khi kỳ đang xem là kỳ active (`nav-registry.ts:429`) — đúng thiết kế, không phải bug.
4. Click vào **dòng** (không phải nút) → **inline expand** (chevron), chỉ render dữ liệu
   **đã có trong row**: breakdown doanh thu, số alert, mốc thời gian, `reason` của
   `gate`/`stage`/`health`.
   **Zero query thêm** → giữ đúng nguyên tắc "1 endpoint, 1 timer" của 00-overview.
   Ba thứ **cấm** đưa vào expand vì cần query mới: nội dung alert, exposure theo playType,
   heatmap/live feed (p1-03 §3.1).
5. Hệ quả: **p1-03 đã viết lại** — bỏ `GetOpsSnapshot` gọi lẻ theo kỳ, bỏ lazy-load
   Sheet. Tiết kiệm một endpoint, một timer, một trạng thái loading, và xoá luôn câu hỏi
   mở *"`DrawCommandCenter` có phải tách shared?"*.

### 7.1 Hai tab → sửa cấu hình React Query

Guideline cũ tắt `refetchOnWindowFocus` để tránh burst khi alt-tab. Với workflow 2 tab
thì tắt là **sai**: quay lại tab hub thấy dữ liệu cũ vài phút.

Cấu hình đúng:

```ts
{
  refetchInterval: pollSeconds * 1000,   // từ config server (§8.3)
  refetchIntervalInBackground: false,     // tab ẩn thì ngừng — tiết kiệm
  refetchOnWindowFocus: true,             // quay lại tab thì làm mới
  staleTime: pollSeconds * 1000,          // ← chặn burst: chỉ fetch nếu đã cũ hơn 1 nhịp
}
```

`staleTime = pollSeconds` là mấu chốt: alt-tab liên tục cũng chỉ fetch tối đa 1
lần/nhịp. Vừa tươi, vừa không burst.

Thêm chỉ báo `Cập nhật 3s trước` cạnh badge LIVE; `> 3 × pollSeconds` → chuyển amber
`Dữ liệu cũ 47s`. Người trực phải luôn biết mình đang xem dữ liệu tươi hay đã đứng.

---

## 8. Zone 4 — Alert Banner & ngưỡng

### 8.1 Chỉ hiện khi có gì đó bất thường

Banner luôn hiện = banner bị bỏ qua. Điều kiện hiện:

- `stuck > 0` → destructive, kèm nút `Xem 14 kỳ` (set filter Zone 5A).
- `truncated === true` → destructive: *"Vượt giới hạn N kỳ — danh sách chưa đầy đủ"*.
  Đây là bug im lặng nguy hiểm nhất của hub (thấy 100 kỳ, tưởng chỉ có 100).
- `gate = PendingOpen` → amber: **quên mở bán**, còn cứu được, kèm nút `Mở bán N kỳ`.
- `gate = Halted` (status `salesClosed`) → amber: **đã ngắt bán**, kèm nút `Xem N kỳ`.
- `stage = NeverOpened` → destructive: kỳ trắng, **mất hẳn doanh thu**, cần `VOID` để dọn.
- `stage = NeedsResettle` → destructive: tiền đã trả có thể sai.

### 8.2 Âm thanh — có, nhưng chặt

Ca trực 8 tiếng không ai nhìn màn hình liên tục. Cho phép 1 tiếng `ping` **duy nhất khi
`stuckCount` tăng từ 0 lên > 0**, mặc định **tắt**, bật/tắt lưu ở zustand. Không lặp,
không ping cho warning. Vi phạm quy tắc này → người dùng tắt tiếng vĩnh viễn và mất
luôn kênh báo.

### 8.3 Ngưỡng lấy từ đâu — không hardcode

**Mỗi chặng có ngưỡng RIÊNG.** Một `stuckSec` dùng chung là sai, vì `PendingClose` (batch
1 giờ) và `Settling` (nên xong trong giây) khác nhau hai bậc độ lớn.

| Ngưỡng | Chặng áp dụng | Gợi ý giá trị | Nguồn |
|---|---|---|---|
| `pollSeconds` | — | `tickSeconds` | `OpsStatsConfig` (có sẵn) |
| `exposureWarnPct` | — | — | `OpsAlertsConfig` — **% của cap** (§3.4) |
| `largeBetAmount` | — | — | `OpsAlertsConfig` (có sẵn) |
| `pendingCloseWarnSec` | `PendingClose` | ~90 phút | **cần thêm** vào `OpsConfig` |
| `pendingCloseStuckSec` | `PendingClose` | ~4 giờ | **cần thêm** |
| `awaitingResultWarnSec` | `AwaitingResult` | ~2 × chu kỳ kỳ | **cần thêm** |
| `awaitingResultStuckSec` | `AwaitingResult` | ~4 × chu kỳ kỳ | **cần thêm** |
| `awaitingSettleWarnSec` | `AwaitingSettle` | ~15 phút | **cần thêm** |
| `awaitingSettleStuckSec` | `AwaitingSettle` | ~60 phút | **cần thêm** |
| `processingStuckSec` | `Settling` / `Voiding` | ~5 phút | **cần thêm** |
| ~~`closedEarlyWarnSec`~~ | gate `PendingOpen`/`Halted` | **không cần config** | Dùng `MIN_SALES_WINDOW_SECONDS` = 60s (`game-core/utils/draw-schedule.ts`) — xem §1.3 |

**Bắt buộc là config per-game**: Keno `drawIntervalMinutes = 8`, Bingo18 `= 6` → mọi ngưỡng
liên quan chu kỳ đều khác nhau. Không hardcode trong component, không dùng hằng số chung.

`pendingCloseStuckSec` cần thêm một ràng buộc cứng: **luôn cảnh báo nếu kỳ sắp trôi qua
ngày tài chính mà chưa chốt sổ** — bất kể tuổi bao nhiêu. Kỳ lọt sang ngày sau làm sai
rollup ngày (xem `p0-01`).

---

## 9. Làm cho bất thường "đập vào mắt" — 4 lớp độc lập

Một lớp thất bại thì còn lớp khác. Không dựa vào riêng màu.

### 9.1 Lớp vị trí (mạnh nhất)
Tab `Cần xử lý` mặc định + sort theo `health` → kỳ bất thường **luôn ở dòng đầu**. Và
kỳ đang bán đã bị tách sang 5B nên không thể làm chìm 5A. Vị trí đánh bại mọi thứ khác
về tốc độ nhận biết.

### 9.2 Lớp hình dạng — outlier doanh thu, chi phí 0 query
Alert type `RevenueAnomaly` có sẵn trong `KenoOpsAlertType` nhưng cần dữ liệu lịch sử.
Bản rẻ: **tính client-side** trên chính `rows` đã fetch.

Quan trọng: **so trong cùng nhóm gate**, không so toàn bộ. Kỳ đang bán mới mở 2 phút có
doanh thu thấp là bình thường; so nó với kỳ đã bán 8 tiếng sẽ ra outlier giả.

```
median = median(revenue của các kỳ CÙNG gate, revenue > 0)
revenue > 3 × median                                → badge ▲3.4×
revenue === 0 && gate === Open && ageSinceOpen > 30p → badge "chưa có vé"
```

Bắt được cả hai đầu bất thường: đột biến cược, và kỳ chết không ai cược.

### 9.3 Lớp icon (a11y — bắt buộc)
~8% nam giới mù màu đỏ-lục. Mọi tín hiệu màu **phải** kèm icon ở cột rail (§5.3 cột 0):
`health = stuck` = `AlertOctagon`, `warn` = `Clock`, `Settling`/`Voiding` = `Loader`,
`PendingOpen` = `PlayCircle`, `Halted` = `Ban`, `NeverOpened` = `XCircle`,
`NeedsResettle` = `RotateCcw`. Vi phạm là loại một phần người dùng khỏi trang.

### 9.4 Lớp tổng hợp
Phễu (§3.1) + Day Flow (§4) cho biết bất thường **ở đâu trên trục giờ và ở chặng nào** —
thứ bảng không bao giờ trả lời được trong 1 cái nhìn.

---

## 10. Bàn phím — trang trực dùng 8 tiếng/ngày

| Key | Hành động |
|---|---|
| `j` / `k` | Xuống / lên dòng |
| `x` | Toggle chọn dòng đang focus |
| `Enter` | Mở chi tiết ở tab mới |
| `1`–`5` | Nhảy tab chặng (5A) |
| `r` | Refetch ngay |
| `?` | Bảng phím tắt |

Dùng `useSWRSubscription`-style dedup hoặc 1 listener duy nhất ở cấp trang (§4.1
`vercel-react-best-practices`), không mỗi dòng một listener.

---

## 11. Việc phải sửa ở các plan liên quan

| Plan | Phải sửa |
|---|---|
| **p0-01** | Chuyển sang **CAS trên `version`** (`$eq` + `$inc`), bỏ `Date.now()` và bỏ nhánh `$exists: false`. Tenant-daily dùng `version` thắng CAS làm stamp đơn điệu. Bỏ sentinel `-1`/`rollupStale`, throw để SFN retry. |
| **p0-02** | Sửa chu kỳ kỳ quay sai (Keno `drawIntervalMinutes = 8`, Bingo18 `= 6`), cross-ref sang p0-01 bản CAS. |
| **p0-03** §3.1 | Projection dùng `salesCloseTime` — **field không tồn tại**. Đúng: `sales.closeAt` (+ `sales.openAt`). Thiếu `settledAt`, `result.publishedAt`, `updatedAt` → không tính được `gate`/`stage`/`health`. Trả **raw** + `serverNow` (§1.3), **không** derive server-side. Cân nhắc `worstCaseByPlayType` nếu muốn cap exposure. |
| **p0-03** câu hỏi mở #1 | Đã có câu trả lời trong code: `worstCaseTotal` là **RAW, chưa cap** (`betting-stats.ts:116-117`). Đóng câu hỏi. |
| **p0-03** giới hạn N | Với mô hình bán cả ngày, `rows` luôn ~150 kỳ (Bingo18 ~158). Phải xác nhận `maxDraws` ≥ 200 và **`truncated` phải hoạt động** — nếu cắt ở 100 thì hub mù một nửa ngày. |
| **p0-04** | Thêm **bulk close-sales** (chốt sổ bán theo batch — thao tác thường xuyên nhất) và **bulk open-sales** (cứu `PendingOpen`/`Halted`). Rà lại `VOIDABLE_STATUSES` thật trong `void-draw.ts` = `{Scheduled, SalesClosed, Published}`. |
| **p1-01** | Zone 2 viết lại theo §3 (hai khối 2:1, không phải dải KPI đồng nhất). Thêm Zone 3 Day Flow 2 tầng + brush (§4, §1.4). Derive `gate`/`stage`/`health` **client-side** bằng 1 hàm pure, dùng clock offset từ `serverNow`. |
| **p1-02** | **Tách 2 bảng** 5A/5B theo `gate` (§5, §5B) — không phải 1 bảng có filter. Filter/sort **vào URL** qua `nuqs` (`history:"replace"` — §6.1). Sort theo `health`, không `drawId` desc. Thêm action **Mở bán** / **Chốt sổ bán**. Bỏ tab `Đã xong`. |
| **p1-03** | **Viết lại**: bỏ Detail Sheet → mở tab mới + inline expand không query (§7). Bỏ endpoint snapshot lẻ theo kỳ. |
| **p1-04** | Cập nhật danh sách port theo cấu trúc mới (5A/5B, Day Flow + rail, bulk open/close/settle/void, inline expand, covering index). Số đã verify trong code: `drawIntervalMinutes = 6` → **158 kỳ/ngày**, `salesCloseBeforeSeconds = 30` (Keno 60 — điểm dễ copy sai nhất). |
| **Config** | Thêm **ngưỡng per-chặng** vào `OpsConfig` per-game (§8.3) — không phải một `stuckSec` dùng chung. `PendingOpen`/`Halted` dùng `MIN_SALES_WINDOW_SECONDS`, không cần config mới. |
| **p2-02** (autopilot close) | Rà lại: nếu autopilot tự đóng bán khi `now ≥ closeAt` thì chặng `PendingClose` sẽ biến mất và mô hình batch thủ công không còn đúng. Cần xác nhận đây là chủ ý. Autopilot `autoOpen` cũng phải làm cho `PendingOpen` gần như không bao giờ xuất hiện — nếu vậy, guideline này cập nhật theo. |

---

## 12. Checklist review UI hub

- [ ] `salesOpen` sau `closeAt` được hiểu là **bình thường** (`PendingClose`), **không** stuck
- [ ] Kỳ đang bán **không** nằm cùng bảng với kỳ cần action (5A / 5B tách biệt)
- [ ] Bảng 5A số dòng phụ thuộc **backlog**, không phụ thuộc N; 5B mặc định **không** render 150 dòng
- [ ] **Không có tab `Đã xong`** — `settled`/`void` không nằm trong query của hub
- [ ] Mốc phân chia là **biên chốt cược**, không phải `now`
- [ ] `now` là **giờ server** (`serverNow` + offset), không phải `Date.now()` thô
- [ ] `gate` / `stage` / `health` là **3 trục riêng**, `stuck` không ăn mất `stage`
- [ ] Gate có **4 giá trị**: `Open` / `PendingOpen` / `Halted` / `Ended` — không gộp `ClosedEarly`
- [ ] `gate = Ended` dẫn xuất bằng **`now >= closeAt`**, không bằng `status`
- [ ] `PendingOpen` có action **Mở bán**; `Halted` chỉ mở lại được khi `status = salesClosed`
- [ ] `NeverOpened` (scheduled đã qua `closeAt`) **không** hiện action mở bán, chỉ `VOID`
- [ ] Mỗi chặng có **ngưỡng riêng**, không dùng chung `stuckSec`
- [ ] `NeedsResettle` (KQ sửa sau kết sổ) có chặng riêng, màu red
- [ ] Nhãn `AwaitingDraw` = **`Chờ quay kết quả`**, `AwaitingResult` = **`Chưa có kết quả`**
- [ ] Tính ở **1 hàm pure duy nhất**, không rải `if (status)` trong component
- [ ] Mọi thẻ đếm số đều **kèm số tiền**
- [ ] Outlier so **trong cùng gate**, không so toàn bộ
- [ ] Exposure ghi rõ `(chưa cap)`, **không** so với `exposureWarnPct` khi còn là RAW
- [ ] Mọi màu **kèm icon**
- [ ] Điều hướng thời gian có **Overview + Brush + Focus rail**, brush **snap theo kỳ**
- [ ] Rail **không filter** bảng 5A (§1.4.10)
- [ ] Auto-follow biên **tắt ngay** khi người dùng pan/zoom tay, chỉ `Về biên` bật lại
- [ ] Chi tiết mở **tab mới** (`<Link target="_blank">`), không Sheet, không `window.open`
- [ ] Selection **không** persist
- [ ] `staleTime = pollSeconds` khi bật `refetchOnWindowFocus`
- [ ] Có chỉ báo tuổi dữ liệu (`Cập nhật Xs trước`)
- [ ] Banner `truncated` có, và là destructive
- [ ] Hover 150 cột Day Flow dùng `useRef`+CSS, **không** setState
- [ ] `tabular-nums` cho **mọi** số; số 0 giữ chỗ, không ẩn
- [ ] Không hardcode chu kỳ kỳ quay — đọc `drawIntervalMinutes` (Keno 8, Bingo18 6)

