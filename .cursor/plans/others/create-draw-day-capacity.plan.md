# Tạo Kỳ Quay Theo Ngày Chỉ Định + Trần Số Kỳ/Ngày — Keno & Bingo 18

**Trạng thái:** đã implement + review xong
**Phạm vi:** `game-core` (helper chung), `game-keno-application`, `game-bingo18-application`, `apps/backoffice` (2 dialog + 2 API route)
**Không đụng tới:** 5 game còn lại (lotto535/mega645/power655/max3d/max3dpro) — lịch quay của chúng không phải grid dày đặc.

---

## 0. Điều chỉnh SAU review — shape cuối cùng khác plan bên dưới

Plan gốc (mục 2–4) mô tả `DrawDayCapacity` gồm `elapsedCount` / `occupiedCount` /
`offGridCount` / `remainingCount`. Sau review, **các field đó đã bị bỏ** — bản đang chạy chỉ
còn `{ maxPerDay, availableMinutes }`:

- 3 count kia chỉ nuôi **một câu chữ** trong panel "hết kỳ", trong khi hành động của staff ở
  mọi nguyên nhân đều giống nhau (chọn ngày khác). UI phân biệt bằng `drawDate === todayVN()`
  là đủ, không cần server đếm hộ.
- `remainingCount` trùng nghĩa với `availableMinutes.length`.
- Bất biến `elapsed + occupied + remaining === maxPerDay` được thay bằng test bất biến mạnh
  hơn và ít giả định hơn: `availableMinutes` luôn là **tập con sort tăng, không trùng** của lưới
  giờ và không vượt `maxPerDay`.

`PreviewDrawsOutput` tương ứng cũng chỉ còn `{ drawDate, maxPerDay, draws }`.

Ngoài ra: `minutesToHHmm` + 2 helper `minutesOfDayVN` / `secondsOfDayVN` nằm ở
`@megawin/shared/utils` (không phải private method trong use-case), và guard của
`CreateDrawUseCase` gom vào private `validateBatch()`.

---

## 1. Vấn đề hiện tại

Keno có ~119 kỳ/ngày, Bingo 18 ~158 kỳ/ngày. Dialog "Tạo kỳ quay" hiện tại thiết kế cho game
quay chậm nên sai bản chất với 2 game này:

| # | Vấn đề | Bằng chứng trong code |
|---|---|---|
| 1 | `count` mặc định cứng **10** — staff phải tự gõ 119/158 mỗi lần | `create-draw-action.tsx` L182 `useState(10)` |
| 2 | Không chọn được **ngày tạo kỳ**. Preview luôn bắt đầu từ "bây giờ" và **tự rollover sang ngày mai** giữa lô → 1 lô trộn 2 ngày mà staff không chủ động | `calcDrawSlots()` L94–98, L102–107 |
| 3 | Không biết ngày đó **còn bao nhiêu kỳ** được tạo → tạo trùng/thiếu, chỉ phát hiện khi lỗi | Không có logic nào đếm `existing` |
| 4 | Keno cho **sửa `drawNo`** — sai, vì `drawNo` do atomic counter cấp. Field này bị Zod **strip im lặng** | `_lib/schema.ts` `createDrawSlotSchema` không có key `drawNo`; UI vẫn gửi (L273) |
| 5 | Chú thích dialog mô tả sai hành vi ("staff có thể chỉnh sửa bất kỳ ô nào", "Số kỳ (drawNo) phải duy nhất trong ngày") | Keno L295–298 |
| 6 | Server **không chặn 2 kỳ cùng (drawDate, drawTime)** giữa 2 lần submit khác nhau — counter cấp `drawNo` khác nhau → `drawId` khác nhau → DB tạo cả 2 → **kỳ song sinh cùng giờ quay** | `create-draw.ts` L62–69 chỉ chặn trùng TRONG LÔ |
| 7   | Server **không chặn giờ quay lệch grid** (VD 20:03 khi grid là 20:00/20:08)                                                                                                                            | `create-draw.ts` không validate `drawTime` theo `drawIntervalMinutes`                              |
| 7b  | Server **không chặn kỳ đã quá giờ / sắp đóng bán**: payload cũ (dialog mở lâu) tạo ra kỳ mở bán vài giây rồi đóng, hoặc kỳ đã quá giờ quay                                                              | `create-draw.ts` chỉ chặn `drawDate < today`, không xét `drawTime` vs `now`                        |
| 8   | `PreviewDrawsUseCase` N+1: 1 `findOne` counter cho **mỗi ngày** xuất hiện trong slots                                                                                                                   | `preview-draws.ts` L34–37                                                                          |

Vấn đề 6, 7 và 7b là **bug nghiệp vụ thật**, không phải UX — sửa trong cùng lần này vì logic
"slot còn trống của ngày" chính là thứ chặn được cả ba.

---

## 2. Mục tiêu

1. Công thức "số kỳ tối đa/ngày" + "slot còn trống của 1 ngày" là **hàm thuần dùng chung**, có unit test.
2. Dialog có **1 ô chọn ngày** cho cả lô (mặc định hôm nay, giờ VN). Không rollover ngầm.
3. Ô "số kỳ tạo" **để rỗng = tạo tất cả kỳ còn lại**; staff nhập số thì cắt bớt, clamp vào
   `[1, số kỳ còn lại]`. Không prefill, không `useEffect` đồng bộ.
4. Preview chỉ trả **slot còn trống thật** của ngày đó: grid − (slot không còn đủ **1 phút**
   trước giờ đóng bán) − (slot đã có kỳ chiếm, **chỉ xét từ mốc cắt trở đi**).
5. Ngày đã đủ kỳ → thông báo rõ + nút "Chọn ngày tiếp theo", chặn submit.
6. `drawNo` **read-only** ở cả 2 game; bỏ gửi `drawNo` khỏi payload Keno.
7. Server chặn: lô đa-ngày, off-grid, hết cửa sổ bán, trùng slot đã có trong DB, vượt trần kỳ/ngày.
8. Chú thích dialog viết lại ngắn, đúng hành vi.

---

## 3. Quyết định thiết kế (đọc trước khi code)

### 3.1 Helper chung đặt ở `game-core`, KHÔNG ở `game-keno`

User yêu cầu "tính công thức đó chung ở trong package game của keno". **Đề xuất khác có lý do:**
công thức đã tồn tại tại `packages/game-core/src/utils/draw-schedule.ts` —
`computeDrawsPerDay(firstDrawTime, lastDrawTime, intervalMinutes)` — và đang được dùng bởi
**cả 2 game** (`keno/config/game/_lib/play-rules-section.tsx` L103, `update-game-config.ts` L165)
cùng `game-core/src/utils/vietlott-period.ts` L108.

Đặt vào `packages/game-keno/src/rules/` sẽ buộc Bingo 18 duplicate → vi phạm
`code-quality-standards.mdc` §5 (tìm-trước-khi-tạo). Vì vậy: **mở rộng
`game-core/src/utils/draw-schedule.ts`**. Export sẵn qua `@megawin/game-core/utils`
(`utils/index.ts` đã có `export * from "./draw-schedule"`) → **không cần sửa `package.json`**.

### 3.2 Preview trả **toàn bộ** slot còn trống, client tự slice theo `count`

Hiện tại query key là `["...", "preview", count]` → đổi `count` là **refetch** → nhấp nháy, race.
Đổi thành: API nhận `drawDate` (không nhận `count`), trả **tất cả** slot còn trống của ngày
(cắt trần ở `{GAME}_CREATE_DRAW_BATCH_MAX`). Client tự slice theo số kỳ staff nhập (rỗng = tất cả).

Hệ quả: 1 request/ngày, đổi số kỳ phản hồi tức thì, `applyPreview` (nút RefreshCw) chỉ còn là
`refetch()`.

### 3.3 Nguồn chân lý "slot nào đã bị chiếm" = **draws thật**, chỉ TỪ MỐC CẮT trở đi

`DrawCounterDoc.lastDrawNo` là `$inc` monotonic, **không reset khi xoá kỳ** → dùng nó để tính
"còn lại" sẽ thiếu hụt sai. Phải đọc `drawTime` của các kỳ đã tồn tại (kể cả `void` — kỳ void
vẫn chiếm slot giờ quay, không được tạo kỳ mới cùng giờ).

**Chỉ lấy kỳ từ mốc cắt trở đi, không lấy cả ngày.** Kỳ đã quay xong đầu ngày *không thể* trùng
với kỳ ta đang định tạo (ta chỉ tạo được slot còn đủ cửa sổ bán) → lấy về là payload chết (~100
kỳ với Keno buổi tối). Kỳ **duy nhất** có `drawTime` trong quá khứ mà vẫn nằm trong DB là kỳ
staff tự sửa giờ (VD bù kỳ thiếu) — kỳ đó đã quá giờ quay, đã có kết quả, không cược được, và
cũng không nằm trong tập slot ta gợi ý ⇒ không cần đối chiếu.

### 3.4 Slot phải còn tối thiểu **1 phút** cửa sổ bán mới được tạo

Điều kiện: `closeAt − now ≥ MIN_SALES_WINDOW_SECONDS (60s)`, với
`closeAt = drawTime − salesCloseBeforeSeconds`.

Khác với `findNextSlotInDay()` L66 hiện tại (ngưỡng 0): với ngưỡng 0, bấm tạo lúc `closeAt − 3s`
vẫn sinh ra kỳ mở bán 3 giây rồi đóng — vô nghĩa nhưng vẫn phải void/settle như kỳ thật.

Ngưỡng **60s** là cân bằng có chủ đích: kỳ còn đúng 1 phút thì thực tế gần như không ai kịp cược,
nhưng **vẫn nên tạo** và mở-rồi-đóng bình thường — thà có kỳ không ai cược hơn là để trống một
mốc quay trong dãy. Thực tế staff thường tạo đủ kỳ cho ngày mai từ hôm trước, nên nhánh này chỉ
gặp khi tạo bù trong ngày.

Ngày chọn > hôm nay ⇒ `nowSecondsOfDay = undefined` ⇒ không lọc gì, đủ `maxPerDay`.

`MIN_SALES_WINDOW_SECONDS` **không** đưa vào GlobalConfig: đây là ngưỡng vận hành chung, không
phải tham số nghiệp vụ theo game — đưa vào config thì mỗi game lệch nhau mà chẳng có lý do để lệch.

### 3.5 KHÔNG dùng transaction/lock cho race 2 staff cùng tạo

Backoffice, tần suất thấp. Guard trong use-case thu hẹp cửa sổ race xuống mức chấp nhận được.
Hardening bằng unique index `(drawDate, drawTime)` để ở **Phase 6 (tuỳ chọn)** vì cần kiểm tra
dữ liệu cũ trước.

### 3.6 Giữ `calcDrawSlots` cũ hay bỏ?

`calcDrawSlots` (cross-day rollover) sau thay đổi này **không còn caller nào** ở cả 2 game.
`calcDrawSlotsForDate` (bingo18, L81–120) hiện đã là dead code.
→ **Xoá cả 2 file `helpers/calc-draw-slots.ts`** (keno + bingo18) sau khi `PreviewDrawsUseCase`
chuyển sang helper `game-core`. Grep xác nhận không còn import trước khi xoá.

### 3.8 Lô chỉ được thuộc ĐÚNG MỘT ngày (thay vì giữ vòng lặp đa-ngày)

`CreateDrawUseCase` hiện hỗ trợ lô trải nhiều ngày (group theo `drawDate`, counter riêng mỗi
ngày). Sau thay đổi này dialog **luôn** gửi 1 ngày. Giữ nhánh đa-ngày = code không có đường nào
chạm tới từ UI, mà vẫn phải nuôi logic capacity riêng cho từng ngày → dễ sai âm thầm.

→ Thêm guard tường minh "mỗi lần chỉ 1 ngày" (§3.2). Nếu tương lai cần tạo nhiều ngày, gọi
use-case nhiều lần — rẻ và rõ hơn gộp. Cấu trúc `groupsByDate`/`dateOrder` **giữ nguyên**, chỉ
thêm guard, để không refactor phần counter/transaction đã chạy production.

---

### 3.9 `BATCH_MAX` không bao giờ ràng buộc trong 1 ngày

`KENO_CREATE_DRAW_BATCH_MAX = BINGO18_CREATE_DRAW_BATCH_MAX = 400`, lớn hơn cả `maxPerDay`
(119 / 158). Vì lô giờ chỉ nằm trong **1 ngày**, trần 400 **không bao giờ chạm** → ô "số kỳ tạo"
ở UI chỉ cần clamp vào `available.length`, **không** cần so với `BATCH_MAX`. Vẫn giữ
`.slice(0, BATCH_MAX)` ở server làm chốt an toàn nếu ai đó cấu hình chu kỳ 1 phút (1440 kỳ/ngày).
**Không** hạ giá trị 400 xuống trong PR này (constant còn dùng ở Zod + use-case guard, đổi là
thay đổi hành vi ngoài scope).

---

## Phase 1 — Helper thuần ở `game-core` (không I/O, có test)

**File:** `packages/game-core/src/utils/draw-schedule.ts` (mở rộng, giữ `computeDrawsPerDay` nguyên vẹn)

### 1.1 `listDrawSlotMinutes` — grid đầy đủ của 1 ngày

```typescript
/**
 * Toàn bộ mốc giờ quay của 1 ngày, tính theo **phút trong ngày** (0–1439), tăng dần.
 *
 * Grid: `firstDrawTime + k × intervalMinutes` với `k ≥ 0`, dừng khi vượt `lastDrawTime`.
 * Đây là nguồn chân lý duy nhất cho "kỳ nào hợp lệ trong ngày" — dùng cho cả preview
 * (gợi ý slot trống) và validate lúc tạo (chặn giờ quay lệch grid).
 *
 * Trả `null` khi config chưa hợp lệ (giờ sai format, interval ≤ 0, kỳ cuối < kỳ đầu) —
 * cùng contract với {@link computeDrawsPerDay} để caller xử lý 1 kiểu.
 *
 * @example
 *   listDrawSlotMinutes("06:08", "21:52", 8) → [368, 376, …, 1312] (119 phần tử)
 */
export function listDrawSlotMinutes(
  firstDrawTime: string,
  lastDrawTime: string,
  intervalMinutes: number,
): number[] | null
```

Ràng buộc: `computeDrawsPerDay(...)` và `listDrawSlotMinutes(...)?.length` **phải luôn khớp** —
thêm test khẳng định điều này để 2 công thức không trôi khỏi nhau.

### 1.2 `MIN_SALES_WINDOW_SECONDS` + `isDrawSlotCreatable` — predicate dùng chung

```typescript
/**
 * Cửa sổ bán tối thiểu (giây) mà 1 kỳ phải còn lại **tính từ bây giờ đến giờ đóng bán**
 * để được phép tạo. Dưới ngưỡng này thì kỳ tạo ra không kịp bán cho ai cả.
 *
 * Vì sao 60s mà không phải 0: với ngưỡng 0, staff bấm tạo lúc `closeAt − 3s` vẫn sinh ra
 * kỳ mở bán 3 giây rồi đóng — vô nghĩa nhưng vẫn phải void/settle như kỳ thật.
 *
 * Vì sao 60s mà không lớn hơn: mục tiêu là **không mất kỳ** trong dãy quay. Kỳ còn đúng
 * 1 phút bán thì thực tế gần như không ai kịp cược, nhưng vẫn nên tạo + mở rồi đóng bình
 * thường — thà có kỳ không ai cược hơn là để trống 1 mốc quay trong ngày.
 *
 * KHÔNG đưa vào GlobalConfig: đây là ngưỡng vận hành chung, không phải tham số nghiệp vụ
 * theo game; đưa vào config thì mỗi game lệch nhau mà chẳng ai có lý do để lệch.
 */
export const MIN_SALES_WINDOW_SECONDS = 60;

/**
 * Slot này có còn tạo được **tại thời điểm hiện tại** không.
 *
 * Điều kiện: `closeAt − now ≥ MIN_SALES_WINDOW_SECONDS`, với
 * `closeAt = slotMinutes × 60 − salesCloseBeforeSeconds`.
 *
 * `nowSecondsOfDay === undefined` ⇒ ngày cần tạo KHÔNG phải hôm nay ⇒ luôn `true`
 * (ngày tương lai thì mọi slot đều còn nguyên).
 *
 * Đây là predicate DUY NHẤT cho câu hỏi "slot còn tạo được không" — dùng bởi cả
 * {@link computeDrawDayCapacity} (preview) và `CreateDrawUseCase` (validate lúc tạo).
 * KHÔNG viết lại điều kiện này ở chỗ khác: lệch 1 chỗ là preview gợi ý slot mà create
 * từ chối (hoặc ngược lại).
 */
export function isDrawSlotCreatable(
  slotMinutes: number,
  salesCloseBeforeSeconds: number,
  nowSecondsOfDay?: number,
): boolean {
  if (nowSecondsOfDay === undefined) {
    return true;
  }
  return slotMinutes * 60 - salesCloseBeforeSeconds - MIN_SALES_WINDOW_SECONDS >= nowSecondsOfDay;
}
```

### 1.3 `computeDrawDayCapacity` — sức chứa còn lại của 1 ngày

```typescript
/** Sức chứa kỳ quay còn lại của MỘT ngày. */
export interface DrawDayCapacity {
  /** Số kỳ tối đa/ngày theo grid config. */
  maxPerDay: number;
  /** Số slot bị loại vì không còn đủ cửa sổ bán. Luôn 0 khi ngày chọn ≠ hôm nay. */
  elapsedCount: number;
  /**
   * Số slot bị loại vì ĐÃ có kỳ chiếm mốc giờ đó.
   *
   * Chỉ đếm kỳ nằm trong **cửa sổ còn tạo được** — caller đã lọc ở tầng query
   * (xem Phase 2), nên KHÔNG bao gồm kỳ buổi sáng đã qua giờ.
   */
  occupiedCount: number;
  /** Số slot lệch grid trong cửa sổ đang xét (data cũ sửa tay) — chỉ để cảnh báo. */
  offGridCount: number;
  /** Phút trong ngày của các slot CÒN TẠO ĐƯỢC, tăng dần. */
  availableMinutes: number[];
  /** = availableMinutes.length. */
  remainingCount: number;
}

/**
 * Tính slot còn tạo được của 1 ngày = grid − (không đủ cửa sổ bán) − (đã có kỳ chiếm).
 *
 * `nowSecondsOfDay` chỉ truyền khi ngày cần tạo **là hôm nay** (giờ VN); ngày tương lai
 * truyền `undefined`. Điều kiện lọc theo giờ nằm trong {@link isDrawSlotCreatable}.
 *
 * `occupiedMinutes` PHẢI là các kỳ đã tồn tại **từ mốc cắt trở đi** (không phải cả ngày) —
 * xem `DrawRepository.listDrawTimesByDate(drawDate, fromDrawTime)`.
 *
 * Trả `null` khi config lịch quay không hợp lệ.
 */
export function computeDrawDayCapacity(input: {
  firstDrawTime: string;
  lastDrawTime: string;
  intervalMinutes: number;
  salesCloseBeforeSeconds: number;
  /** Phút trong ngày của các kỳ đã tồn tại TỪ MỐC CẮT TRỞ ĐI. Không cần sort/unique. */
  occupiedMinutes: number[];
  /** Giây trong ngày hiện tại (0–86399). `undefined` = ngày tương lai. */
  nowSecondsOfDay?: number;
}): DrawDayCapacity | null
```

Chi tiết cài đặt:

- `grid = listDrawSlotMinutes(...)`; `null` → return `null`.
- `occupied = new Set(occupiedMinutes)` (O(1) lookup — `vercel-react-best-practices` §7.11).
- `gridSet = new Set(grid)`.
- `offGridCount = [...occupied].filter((m) => !gridSet.has(m)).length` — chỉ báo cáo, không chặn.
- Một lần duyệt grid, mỗi slot vào **đúng một** nhóm (thứ tự xét quan trọng):

```typescript
for (const m of grid) {
  // Xét giờ TRƯỚC: slot không còn cửa sổ bán thì dù có kỳ chiếm hay không, nó cũng không
  // phải "slot đã dùng" theo góc nhìn tạo kỳ — tính vào elapsed để không đếm đôi.
  if (!isDrawSlotCreatable(m, salesCloseBeforeSeconds, nowSecondsOfDay)) {
    elapsedCount += 1;
    continue;
  }
  if (occupied.has(m)) {
    occupiedCount += 1;
    continue;
  }
  availableMinutes.push(m);
}
```

Bất biến (đưa vào test): `elapsedCount + occupiedCount + remainingCount === maxPerDay`.

### 1.4 ⚠️ Ba cạm bẫy PHẢI tránh khi cài đặt

**(a) Mốc cắt giờ KHÔNG phải "bỏ block hiện tại"** — phải đúng `isDrawSlotCreatable`.

Trực giác "đang ở trong block 8 phút hiện tại nên bỏ kỳ của block đó" **sai và làm mất 1 kỳ**.
Keno lúc `20:06:00`, grid `… 20:00, 20:08, 20:16 …`, `salesCloseBeforeSeconds = 60`:

| Cách tính                                                          | Kỳ đầu tạo được       |
| ------------------------------------------------------------------ | --------------------- |
| Bỏ block hiện tại `[20:00→20:08)`                                   | 20:16 ❌              |
| Đúng: `closeAt(20:08) = 20:07:00`, còn `60s ≥ MIN_SALES_WINDOW`     | **20:08** ✅          |

Cửa sổ mà kỳ kế tiếp **vẫn** tạo được là `[T − interval, T − closeBefore − 60s]` = **6/8 thời
gian** với Keno (8 phút, 60s + 60s), **9/12** với Bingo 18 (6 phút, 30s + 60s). Nên sai lệch này
xảy ra phần lớn thời gian, và kỳ bị mất thường còn 5–7 phút bán — hoàn toàn dùng được.

**(b) Trừ theo TẬP HỢP, KHÔNG trừ theo SỐ LƯỢNG.**
`remaining = (số slot còn lại theo giờ) − (số kỳ đã có)` sai vì kỳ lệch grid (tạo tay lúc 20:03)
không chiếm slot grid nào — trừ nó đi là mất oan 1 kỳ. Vì vậy `offGridCount` chỉ để **báo cáo**,
không tham gia phép trừ. Đúng là filter trên grid như snippet ở trên.

**(c) `occupiedMinutes` chỉ chứa kỳ TỪ MỐC CẮT TRỞ ĐI** — không phải cả ngày.
Nếu truyền cả ngày, các kỳ buổi sáng (đã qua giờ) rơi vào nhánh `elapsed` trước khi kịp vào
`occupied` nên **không** gây sai `remainingCount`, nhưng làm `occupiedCount` mất ý nghĩa báo
cáo và tốn payload vô ích (~100 kỳ). Lọc ở tầng query — xem Phase 2.

### 1.5 Helper format phút → `"HH:mm"`

`minutesToHHmm` hiện bị **duplicate** trong 2 file `calc-draw-slots.ts` (keno L43–47,
bingo18 L43–47). Đưa lên `game-core/src/utils/draw-schedule.ts`:

```typescript
/** Đổi phút trong ngày (0–1439) thành `"HH:mm"` zero-padded. */
export function minutesToHHmm(minutes: number): string
```

### 1.6 Test — `packages/game-core/test/utils/draw-schedule.test.ts` (mở rộng file có sẵn)

Tính tay lại **mọi** con số dưới đây khi code, đừng copy máy móc từ plan.

`listDrawSlotMinutes`:

- [ ] Keno default `("06:08","21:52",8)` → length **119**, `[0] === 368`, `at(-1) === 1312`.
- [ ] Bingo18 default `("06:06","21:53",6)` → length **158**, `[0] === 366`, `at(-1) === 1308`
      (21:48 — vì 21:54 > 21:53; khớp `bingo18-game-rules.mdc` §7.1).
- [ ] `first === last` → `[first]` (đúng 1 kỳ).
- [ ] Format sai / `interval ≤ 0` / `last < first` → `null` (3 case).
- [ ] **Bất biến:** `listDrawSlotMinutes(a,b,c)!.length === computeDrawsPerDay(a,b,c)` cho cả
      2 bộ config default + 3 bộ ngẫu nhiên cố định.

`isDrawSlotCreatable` (test riêng — đây là predicate quan trọng nhất):

- [ ] `nowSecondsOfDay === undefined` → luôn `true` (kể cả slot 06:08 của Keno).
- [ ] **Keno, slot 20:08** (`m = 1208`, `closeAt = 20:07:00 = 72420s`):
  - now `20:06:00` (`72360`) → còn `60s` ⇒ **`true`** (đúng ngưỡng tối thiểu, dùng `≥`).
  - now `20:06:01` (`72361`) → còn `59s` ⇒ **`false`**.
  - now `20:07:00` (`72420`) → còn `0s` ⇒ **`false`**.
- [ ] **Bingo 18, slot 20:06** (`m = 1206`, `closeBefore = 30s`, `closeAt = 20:05:30 = 72330s`):
  - now `20:04:30` (`72270`) → còn `60s` ⇒ **`true`**.
  - now `20:04:31` → **`false`**.
- [ ] Slot đầu ngày với `nowSecondsOfDay = 0` → `true`.

`computeDrawDayCapacity`:

- [ ] Ngày tương lai, `occupiedMinutes: []` → `remainingCount === maxPerDay`,
      `elapsedCount === 0`, `occupiedCount === 0`.
- [ ] Ngày trống, hôm nay lúc `12:00:00` (`43200`) → `elapsedCount` = số slot có
      `closeAt − 12:00 < 60s`; Keno: slot cuối bị loại là 12:00 (`closeAt 11:59` đã qua), slot
      đầu còn lại là **12:08** ⇒ `elapsedCount = 45`, `remainingCount = 74`. **Tính tay lại.**
- [ ] Ngày tương lai + 3 kỳ đúng grid → `occupiedCount === 3`,
      `remainingCount === maxPerDay − 3`, 3 phút đó **không** trong `availableMinutes`.
- [ ] Kỳ **lệch grid** (VD 20:03, ngày tương lai) → `offGridCount === 1`, `occupiedCount === 0`,
      `remainingCount === maxPerDay` (bẫy b).
- [ ] **Bất biến (chống đếm đôi):** với mọi case,
      `elapsedCount + occupiedCount + remainingCount === maxPerDay`.
- [ ] Slot vừa hết cửa sổ bán **vừa** đã có kỳ → tính vào `elapsedCount`, **không** vào
      `occupiedCount` (thứ tự xét ở snippet §1.3).
- [ ] Ngày đầy (`occupiedMinutes` = cả grid, ngày tương lai) → `remainingCount === 0`,
      `availableMinutes === []`.
- [ ] **Chống bẫy (a):** Keno, now `20:06:00` (`72360`), ngày = hôm nay, không có kỳ nào →
      `availableMinutes[0] === 1208` (**20:08**, KHÔNG phải 1216).
- [ ] **Chống bẫy (c):** Keno, now `20:00:00`, `occupiedMinutes` = 100 slot buổi sáng (đều đã
      qua giờ) → `remainingCount` **dương** và bằng đúng số slot từ 20:08→21:52; `occupiedCount`
      phải `=== 0` (mọi kỳ buổi sáng đã rơi vào `elapsed`), **không** âm.
- [ ] Sau `lastDrawTime` (now `22:30`) → `remainingCount === 0`, `elapsedCount === maxPerDay`.
- [ ] Config invalid → `null`.
- [ ] `occupiedMinutes` có phần tử trùng nhau → không ảnh hưởng `remainingCount` (Set dedupe).

`minutesToHHmm`: `368 → "06:08"`, `0 → "00:00"`, `1439 → "23:59"`, `1312 → "21:52"`.

Chạy: `pnpm --filter @megawin/game-core test`

---

## Phase 2 — Repo: đọc giờ quay đã tồn tại của 1 ngày

**File:** `packages/game-keno-application/src/infras/repos/draw-repo.ts` (+ bản Bingo 18)

Hiện **không có** method nào lấy draws theo `drawDate` (đã grep hết 30+ method của
`DrawRepository`; `listDraws` có date-range nhưng paginate + map full `DrawEntity` → không dùng).
Thêm method mới:

```typescript
/**
 * Giờ quay (`drawTime`) của các kỳ đã tồn tại trong 1 ngày, **từ `fromDrawTime` trở đi**.
 *
 * Vì sao có `fromDrawTime` thay vì lấy cả ngày: chỉ những kỳ nằm trong cửa sổ **còn tạo
 * được** mới có ý nghĩa cho việc "slot nào đã bị chiếm". Kỳ buổi sáng (đã quay xong, đã có
 * kết quả) không thể trùng với kỳ ta đang định tạo — lấy về chỉ tốn payload (~100 kỳ với
 * Keno) mà không dùng đến.
 *
 * Vì sao gồm cả kỳ `void`: kỳ đã void vẫn CHIẾM mốc giờ quay đó (đã công bố cho người chơi,
 * có vé đã hoàn). Tạo kỳ mới cùng giờ sẽ sinh 2 kỳ song sinh cùng mốc quay.
 *
 * Vì sao KHÔNG dùng `DrawCounterDoc.lastDrawNo` để suy ra số kỳ đã tạo: counter là `$inc`
 * monotonic, không giảm khi xoá kỳ → sẽ báo "hết slot" trong khi ngày vẫn còn trống.
 *
 * Projection chỉ `drawTime` + `_id: 0`, KHÔNG map `DrawEntity` — hàm này gọi trên đường
 * preview (mỗi lần staff đổi ngày), payload phải nhỏ.
 *
 * @param drawDate - Ngày quay `YYYY-MM-DD`
 * @param fromDrawTime - Chỉ lấy kỳ có `drawTime >= fromDrawTime`. Không truyền → cả ngày
 *   (dùng cho ngày tương lai: mọi slot đều còn tạo được nên cần đối chiếu toàn bộ).
 * @returns Danh sách `drawTime` tăng dần (rỗng nếu không có kỳ nào trong cửa sổ)
 */
async listDrawTimesByDate(drawDate: string, fromDrawTime?: Date): Promise<Date[]>
```

Cài đặt: filter `{ drawDate, ...(fromDrawTime ? { drawTime: { $gte: fromDrawTime } } : {}) }`,
`{ projection: { drawTime: 1, _id: 0 }, sort: { drawTime: 1 } }` — theo pattern
`getStatusesByDrawIds` (L165) đã dùng projection thô, không qua mapper.

> **Lưu ý cho caller:** `fromDrawTime` phải là **mốc slot đầu tiên còn tạo được**
> (`availableMinutes[0]` quy về `Date`), KHÔNG phải `now`. Nếu truyền `now` sẽ bỏ sót kỳ đã
> tồn tại ở slot ngay sau `now` nhưng trước mốc đó — đúng slot ta đang định tạo → tạo trùng.
> Vì phụ thuộc lẫn nhau (cần grid để biết mốc, cần occupied để biết còn slot), use-case tính
> theo 2 bước — xem §3.1.

**Index:** kiểm tra collection đã có index trên `drawDate` chưa (`listDraws` filter theo
`drawDate` range nên khả năng cao có). Filter mới là `(drawDate, drawTime)` — nếu Phase 6 tạo
unique index `{ drawDate: 1, drawTime: 1 }` thì index đó phục vụ luôn query này.
Ghi kết quả kiểm tra vào PR description.

**Test repo:** không viết test tích hợp riêng cho method này (chỉ là 1 `find` + projection);
độ phủ đến từ test use-case ở Phase 3.

---

## Phase 3 — Use-cases

### 3.1 `PreviewDrawsUseCase` — viết lại theo ngày chỉ định

**File:** `packages/game-keno-application/src/use-cases/draws/preview-draws.ts` (+ Bingo 18)

**DTO** (`use-cases/draws/dto/draw.dto.ts`) — thay `PreviewDrawsInput.count`:

```typescript
export interface PreviewDrawsInput {
  /**
   * Ngày cần tạo kỳ (`YYYY-MM-DD`, giờ VN). Không truyền → hôm nay.
   * KHÔNG rollover sang ngày khác: lô luôn nằm trong đúng ngày này.
   */
  drawDate?: string;
}

export interface PreviewDrawsOutput {
  /** Ngày đang preview (`YYYY-MM-DD`) — echo lại để client khỏi tự suy "hôm nay". */
  drawDate: string;
  /** Số kỳ tối đa/ngày theo lịch quay trong game config. */
  maxPerDay: number;
  /**
   * Số slot bị loại vì không còn đủ cửa sổ bán tối thiểu (1 phút trước giờ đóng bán).
   * Luôn 0 khi `drawDate` > hôm nay.
   */
  elapsedCount: number;
  /**
   * Số slot còn-trong-cửa-sổ nhưng ĐÃ có kỳ chiếm mốc giờ đó.
   * KHÔNG bao gồm kỳ đã quay xong đầu ngày — chúng không thể trùng nên không được đếm.
   */
  occupiedCount: number;
  /** Slot còn tạo được, đã gán `drawNo` dự kiến. Rỗng ⇒ ngày đã hết slot. */
  draws: PreviewDrawItem[];
}
```

`PreviewDrawItem` giữ nguyên shape (`drawNo`, `drawDate`, `drawTime`, `closeAt`, `status`) —
sửa JSDoc: `drawDate` giờ **luôn bằng** `PreviewDrawsOutput.drawDate` (bỏ mô tả cross-day
rollover), `drawNo` là **dự kiến** (counter cấp lại lúc tạo thật).

**Luồng execute:**

1. `drawDate = input.drawDate ?? todayVN()`.
2. Guard `drawDate < todayVN()` → `AppException.badRequest("Không thể tạo kỳ quay cho ngày đã qua: …")`
   (đồng bộ wording với `CreateDrawUseCase` L52).
3. `getGlobalConfig.run()` → `play`.
4. `nowSecondsOfDay` = `undefined` nếu `drawDate > todayVN()`, ngược lại tính từ
   `formatVN(new Date(), "HH:mm:ss")` (giờ VN, KHÔNG `getHours()` server-local).
5. **Xác định mốc cắt TRƯỚC khi query DB** — 2 bước, tránh bẫy ở cảnh báo Phase 2:

```typescript
// Bước 1: grid + lọc theo giờ, CHƯA cần biết kỳ nào đã tồn tại. Mốc cắt = slot đầu tiên
// còn đủ cửa sổ bán. Mọi kỳ TRƯỚC mốc này đã quay xong (đã có kết quả) nên không thể
// trùng với kỳ ta định tạo — không cần lấy về.
const grid = listDrawSlotMinutes(play.firstDrawTime, play.lastDrawTime, play.drawIntervalMinutes);
if (!grid) {
  throw AppException.badRequest(
    "Cấu hình lịch quay không hợp lệ (giờ kỳ đầu/kỳ cuối/chu kỳ). Vui lòng kiểm tra Cấu hình game.",
  );
}
const firstCreatable = grid.find((m) => isDrawSlotCreatable(m, play.salesCloseBeforeSeconds, nowSecondsOfDay));

// Hết slot trong ngày → khỏi query DB.
if (firstCreatable === undefined) {
  return { drawDate, maxPerDay: grid.length, elapsedCount: grid.length, occupiedCount: 0, draws: [] };
}

// Bước 2: chỉ lấy kỳ TỪ MỐC CẮT trở đi.
const fromDrawTime = toVNDate(drawDate, minutesToHHmm(firstCreatable));
const occupied = await this.drawRepo.listDrawTimesByDate(drawDate, fromDrawTime);
```

Vì sao **không** `Promise.all(config, query)`: `fromDrawTime` phụ thuộc `play` → đây là phụ thuộc
thật, không phải waterfall vô ích. Bù lại tiết kiệm ~100 doc payload mỗi lần preview.

6. `occupiedMinutes` = map `drawTime` → phút trong ngày **theo giờ VN**
   (`formatVN(d, "HH:mm")` → `parseHHMMToMinutes`; KHÔNG dùng `getHours()` của server-local time).
7. `capacity = computeDrawDayCapacity({ ...play, occupiedMinutes, nowSecondsOfDay })`.
   `null` → cùng message badRequest ở bước 5 (grid đã pass nên nhánh này gần như không xảy ra,
   vẫn xử lý tường minh để không phải dùng `!`).
8. `capacity.remainingCount === 0` → **KHÔNG throw**; trả `draws: []` kèm counters.
   Lý do: đây là trạng thái bình thường (ngày đã đủ kỳ), client cần hiển thị thông báo +
   gợi ý ngày tiếp theo, không phải error toast. Throw sẽ mất luôn `maxPerDay`/`occupiedCount`.
9. `available = capacity.availableMinutes.slice(0, {GAME}_CREATE_DRAW_BATCH_MAX)` — trần lô.
10. `drawNo` dự kiến: **1 lần** `counterRepo.findOne({ drawDate })` (bỏ vòng lặp N+1 cũ L34–37,
    giờ chỉ có 1 ngày), rồi `lastDrawNo + 1 + i`.
11. `drawTime` = `toVNDate(drawDate, minutesToHHmm(m))`;
    `closeAt = drawTime − play.salesCloseBeforeSeconds × 1000`.
12. `status`: mọi slot trả về đều đã qua `isDrawSlotCreatable` ⇒ còn bán được ⇒
    `DrawStatus.SalesOpen`. Giữ đúng logic cũ để không đổi hành vi toggle "Mở/Đóng".

**Bỏ import** `calcDrawSlots`; sau đó xoá file helper (§3.6).

### 3.2 `CreateDrawUseCase` — thêm 3 guard, dùng lại cùng helper

**File:** `packages/game-keno-application/src/use-cases/draws/create-draw.ts` (+ Bingo 18)

Giữ nguyên toàn bộ logic counter/transaction hiện có. Guard mới chèn **sau** guard
trùng-trong-lô (L62–69) và **sau** khi đã group theo ngày (L76–86), **trước** vòng lặp
`getNextDrawNoBatch` (L92) — để không đốt số kỳ của counter khi lô sẽ bị từ chối.
`const globalConfig = await this.getGlobalConfig.run()` (L71) đã nằm trước đó, dùng luôn.

#### Lô chỉ được nằm trong ĐÚNG MỘT ngày

Sau thay đổi này, dialog luôn gửi 1 ngày duy nhất. Thêm guard tường minh **thay vì** giữ vòng
lặp đa-ngày: vòng lặp đa-ngày sẽ là code không có đường nào chạm tới từ UI, mà lại phải nuôi
logic capacity cho từng ngày (dễ sai âm thầm).

```typescript
// Lô chỉ được thuộc 1 ngày: preview giờ tính capacity theo TỪNG ngày, trộn nhiều ngày trong
// 1 lô làm mất ý nghĩa "còn N kỳ" mà staff thấy trên UI. Nếu tương lai cần tạo nhiều ngày,
// gọi use-case này nhiều lần (mỗi lần 1 ngày) — rẻ và rõ hơn là gộp.
const dates = [...groupsByDate.keys()];
if (dates.length > 1) {
  throw AppException.badRequest(
    `Mỗi lần chỉ tạo kỳ cho 1 ngày (lô đang gửi ${dates.length} ngày: ${dates.join(", ")}).`,
  );
}
const drawDate = dates[0]!;
const group = groupsByDate.get(drawDate)!;
```

Giữ `groupsByDate`/`dateOrder` (L76–86) nguyên vẹn — chỉ thêm guard; không refactor cấu trúc
vòng lặp bên dưới (giảm rủi ro cho phần counter/transaction đã chạy production).

#### 4 guard mới — dùng LẠI đúng `isDrawSlotCreatable` của preview

3 lỗi (b)(c)(d) dưới đây **trước đây không bị chặn ở đâu cả**: Zod chỉ validate format, guard cũ
chỉ so trùng *trong* lô. Nên staff có thể tạo kỳ lệch grid (20:03 khi chu kỳ 8 phút), kỳ trùng
giờ với kỳ **đã có trong DB** (counter cấp `drawNo` khác → `drawId` khác → DB không chặn được),
hoặc vượt trần kỳ/ngày. Cả 3 đều sinh dữ liệu không sửa được bằng UI.

```typescript
// ── Guard theo SỨC CHỨA THẬT của ngày ─────────────────────────────────────────────
// Dùng CHUNG helper với PreviewDrawsUseCase: nếu 2 bên lệch điều kiện thì preview gợi ý
// slot mà create từ chối (staff thấy "lỗi ngẫu nhiên"), hoặc ngược lại — tạo được slot mà
// preview không bao giờ đề xuất (lọt kỳ rác).
const grid = listDrawSlotMinutes(play.firstDrawTime, play.lastDrawTime, play.drawIntervalMinutes);
if (!grid) {
  throw AppException.badRequest(
    "Cấu hình lịch quay không hợp lệ (giờ kỳ đầu/kỳ cuối/chu kỳ). Vui lòng kiểm tra Cấu hình game.",
  );
}
const gridSet = new Set(grid);

// `undefined` khi tạo cho ngày tương lai ⇒ không lọc theo giờ (mọi slot còn nguyên).
const nowSecondsOfDay = drawDate > today ? undefined : vnSecondsOfDay(new Date());

// Phút-trong-ngày của từng dòng trong lô, tính theo giờ VN (KHÔNG getHours() server-local).
const requested = group.map((g) => ({ ...g, minutes: vnMinutesOfDay(new Date(g.drawTime)) }));

// (b) Lệch grid — kiểm TRƯỚC (c)(d) vì đây là lỗi nhập liệu rõ ràng nhất.
const offGrid = requested.find((r) => !gridSet.has(r.minutes));
if (offGrid) {
  throw AppException.badRequest(
    `Giờ quay ${minutesToHHmm(offGrid.minutes)} không nằm trong lịch quay của game ` +
      `(chu kỳ ${play.drawIntervalMinutes} phút, từ ${play.firstDrawTime} đến ${play.lastDrawTime}).`,
  );
}

// (c) Hết cửa sổ bán — chặn kỳ tạo ra đã quá giờ, hoặc không còn tối thiểu 1 phút để bán.
// KHÔNG bỏ qua guard này: dialog gửi payload cũ (staff mở dialog 20:00, bấm Tạo 20:10) thì
// slot đầu lô đã hết hạn — không phát hiện là tạo kỳ chết ngay lúc sinh.
const expired = requested.find((r) => !isDrawSlotCreatable(r.minutes, play.salesCloseBeforeSeconds, nowSecondsOfDay));
if (expired) {
  throw AppException.badRequest(
    `Kỳ quay ${minutesToHHmm(expired.minutes)} không còn đủ thời gian mở bán ` +
      `(cần tối thiểu ${MIN_SALES_WINDOW_SECONDS} giây trước giờ đóng bán). ` +
      "Vui lòng tải lại danh sách kỳ gợi ý.",
  );
}

// (d) Trùng kỳ ĐÃ có trong DB. Chỉ query từ slot nhỏ nhất trong lô trở đi — kỳ trước đó đã
// quay xong, không thể trùng. `Math.min` qua vòng lặp, KHÔNG spread vào Math.min (§7.10).
let minMinutes = requested[0]!.minutes;
for (const r of requested) {
  if (r.minutes < minMinutes) {
    minMinutes = r.minutes;
  }
}
const occupiedTimes = await this.drawRepo.listDrawTimesByDate(drawDate, toVNDate(drawDate, minutesToHHmm(minMinutes)));
const occupied = new Set(occupiedTimes.map((d) => vnMinutesOfDay(d)));

const clash = requested.find((r) => occupied.has(r.minutes));
if (clash) {
  throw AppException.conflict(
    `Ngày ${drawDate} đã có kỳ quay lúc ${minutesToHHmm(clash.minutes)}. Vui lòng tải lại danh sách kỳ.`,
  );
}

// (e) Vượt sức chứa còn lại của ngày. Guard cuối vì (b)(c)(d) đã loại hết dòng lỗi cụ thể;
// tới đây chỉ còn khả năng "đúng từng dòng nhưng tổng vượt trần".
const capacity = computeDrawDayCapacity({
  ...play,
  intervalMinutes: play.drawIntervalMinutes,
  occupiedMinutes: [...occupied],
  nowSecondsOfDay,
});
if (!capacity) {
  throw AppException.badRequest("Cấu hình lịch quay không hợp lệ. Vui lòng kiểm tra Cấu hình game.");
}
if (group.length > capacity.remainingCount) {
  throw AppException.badRequest(
    `Ngày ${drawDate} chỉ còn ${capacity.remainingCount} kỳ có thể tạo ` +
      `(tối đa ${capacity.maxPerDay} kỳ/ngày), lô đang gửi ${group.length} kỳ.`,
  );
}
```

**Vì sao thứ tự (b) → (c) → (d) → (e):** lỗi cụ thể nhất trước, để message chỉ đúng dòng sai.
Nếu chạy (e) trước, staff nhập 1 giờ lệch grid sẽ nhận "chỉ còn N kỳ" — sai nguyên nhân.
Guard (d) đặt sau (b)(c) còn để tiết kiệm: chỉ query DB khi lô đã sạch về format và thời gian.

**Về (c) và race giữa preview → submit:** preview dùng `nowSecondsOfDay` lúc GET, create dùng
lúc POST. Staff mở dialog lâu rồi bấm Tạo thì slot đầu có thể vừa hết hạn ⇒ (c) chặn, staff bấm
lại nút refresh. Đây là hành vi **đúng** — thà từ chối cả lô hơn là tạo kỳ đã quá giờ. Message
phải nói rõ "tải lại danh sách kỳ gợi ý" để staff biết cách xử lý.

**Helper thời gian VN:** `vnMinutesOfDay(d)` / `vnSecondsOfDay(d)` — kiểm tra
`@megawin/shared/utils` đã có chưa; nếu chưa, thêm 2 hàm nhỏ ở đó (dựa trên `formatVN`),
**không** viết inline 2 lần trong 2 use-case (và ×2 game = 4 chỗ).

Guard `MAX_DRAW_NO_PER_DAY` (999, L106) **giữ nguyên** — nó bảo vệ dải `drawId` (counter
`$inc` monotonic, không giảm khi xoá kỳ), khác bản chất với trần grid; hai guard cùng tồn tại.

### 3.3 Test use-case

`packages/game-keno-application/test/use-cases/draws/` (+ Bingo 18). Tuân
`test-data-safety.mdc`: chỉ seed/xoá bằng filter có `drawDate` của **ngày tương lai xa**
(VD `2099-01-*`) và `drawId` do chính test sinh; **cấm** `deleteMany({})`.

`PreviewDrawsUseCase`:

- [ ] Không truyền `drawDate` → output `drawDate === todayVN()`.
- [ ] `drawDate` ngày tương lai trống → `draws.length === maxPerDay`, `occupiedCount === 0`,
      `elapsedCount === 0`, `drawNo` chạy liên tục từ `lastDrawNo + 1`.
- [ ] Seed 3 kỳ ngày tương lai → `occupiedCount === 3`, `draws.length === maxPerDay − 3`,
      không slot nào trùng giờ 3 kỳ đã seed.
- [ ] Seed **đủ grid** 1 ngày tương lai → `draws === []`, **không throw**.
- [ ] `drawDate` = hôm qua → throw `badRequest`.
- [ ] Config invalid (mock `GetGlobalConfigUseCase` trả `lastDrawTime < firstDrawTime`) → `badRequest`.
- [ ] Mọi `draws[i].drawDate` đều `=== input.drawDate` (không rollover).
- [ ] **Không lấy kỳ trước mốc cắt:** mock now = 20:00 cho ngày hôm nay, seed 2 kỳ lúc 07:00 và
      21:00 → `occupiedCount === 1` (chỉ kỳ 21:00), và slot 21:00 không có trong `draws`.
      Spy `listDrawTimesByDate` để assert `fromDrawTime` được truyền `=== 20:08` (không phải
      `20:00`, không phải `undefined`).
- [ ] **Ngày tương lai không lọc:** spy `listDrawTimesByDate` → `fromDrawTime` là slot đầu ngày
      (`06:08` Keno), tức mọi kỳ trong ngày đều được đối chiếu.

`CreateDrawUseCase`:

- [ ] Tạo lô hợp lệ đúng grid → thành công, `drawNo` liên tục.
- [ ] **(b)** Lô có `drawTime` lệch grid (20:03) → `badRequest` chứa `"không nằm trong lịch quay"`,
      **DB không có kỳ nào** được tạo, counter **không** tăng.
- [ ] **(c)** Lô có slot đã hết cửa sổ bán (mock now sao cho slot đầu còn < 60s trước `closeAt`)
      → `badRequest` chứa `"không còn đủ thời gian mở bán"`, DB không đổi.
- [ ] **(c) biên:** slot còn **đúng** 60s → **thành công** (không bị chặn oan).
- [ ] **(d)** Lô trùng giờ với kỳ đã seed trong DB → `conflict`, DB không đổi.
- [ ] **(e)** Lô số kỳ > `remainingCount` → `badRequest` chứa `"chỉ còn"`, DB không đổi.
- [ ] **Thứ tự guard:** lô vừa lệch grid **vừa** vượt trần → message phải là lỗi (b), không phải (e).
- [ ] **Lô đa ngày** → `badRequest` chứa `"chỉ tạo kỳ cho 1 ngày"`.
- [ ] Lô 2 dòng cùng `(date, time)` → `badRequest` (regression guard cũ vẫn chạy).
- [ ] `drawDate` quá khứ → `badRequest` (regression).
- [ ] **Counter không bị đốt:** sau mỗi test thất bại, `counterRepo.findOne({ drawDate })` phải
      giữ nguyên `lastDrawNo` như trước khi gọi.
- [ ] Sau mỗi test **xoá đúng** các `drawId` đã tạo/seed.

---

## Phase 4 — API route + Zod schema

**Files:** `apps/backoffice/src/app/api/{keno,bingo18}/draws/_lib/schema.ts` + `preview/route.ts`

### 4.1 `previewDrawsSchema` — thay `count` bằng `drawDate`

```typescript
export const previewDrawsSchema = z.object({
  /**
   * Ngày cần tạo kỳ (`YYYY-MM-DD`, giờ VN). Không truyền → use-case dùng hôm nay.
   *
   * KHÔNG còn tham số `count`: preview trả TOÀN BỘ slot còn trống của ngày (đã cắt trần
   * batch), client tự slice theo số kỳ staff chọn. Nhờ vậy đổi số kỳ không refetch.
   */
  drawDate: z.iso.date("drawDate phải là YYYY-MM-DD.").optional(),
});
```

`preview/route.ts` → `previewDrawsUseCase.run({ drawDate: query.drawDate })`.

### 4.2 `createDrawSlotSchema` — giữ nguyên (đã đúng)

Không thêm `drawNo`. Việc UI Keno đang gửi `drawNo` sẽ được bỏ ở Phase 5 (client), schema
không cần đổi. Xác nhận lại: `createDrawSlotSchema` **không** dùng `.strict()` nên field lạ bị
strip im lặng — vẫn giữ vậy để không phá client cũ đang cache.

### 4.3 `useCreateDraw` (Keno) — bỏ `drawNo` khỏi type mutation

`apps/backoffice/.../keno/operations/_lib/use-operations.ts` L406–412: xoá `drawNo: number` khỏi
type input để compiler bắt mọi caller còn gửi. Bingo 18 đã đúng, không đổi.

### 4.4 `usePreviewDraws` — đổi tham số + query key

```typescript
/**
 * Slot còn tạo được của MỘT ngày. `drawDate` rỗng ⇒ disabled (dialog đóng).
 * KHÔNG nhận `count`: server trả hết slot trống, client slice — đổi số kỳ không refetch.
 */
export function usePreviewDraws(drawDate: string) {
  return useQuery({
    queryKey: [...kenoKeys.all, "preview", drawDate] as const,
    queryFn: () => apiClient.get<PreviewDrawsOutput>("/keno/draws/preview", { params: { drawDate } }),
    enabled: drawDate !== "",
    // Slot "đã qua giờ" phụ thuộc thời điểm gọi → không cache dài.
    staleTime: 30_000,
  });
}
```

---

## Phase 5 — UI dialog (Keno + Bingo 18)

**Files:**
- `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions/create-draw-action.tsx`
- `apps/backoffice/src/app/(main)/games/bingo18/.../create-draw-action.tsx`

Hai file gần như song sinh (khác: màu orange/amber, chu kỳ 8/6 phút, `previewDrawNo` vs
`drawNo`, `findDuplicateKey` theo `(date,drawNo)` vs `(date,time)`). **Sửa song song, giữ
cùng cấu trúc** để lần sau tách component chung dễ. KHÔNG tách component dùng chung trong PR này
(scope creep — 2 file, 7 game khác không dùng).

### 5.1 State mới — chỉ 2 state, KHÔNG derived state

```typescript
// Ngày tạo kỳ cho CẢ lô — nguồn chân lý duy nhất cho cột "Ngày quay".
const [drawDate, setDrawDate] = useState<string>(() => todayVNString());

// Ô "SỐ KỲ TẠO" giữ dạng STRING, mặc định RỖNG = "lấy tất cả kỳ còn lại".
// KHÔNG prefill maxPerDay (119/158): lúc 20:00 chỉ còn ~14 slot, ô hiện 119 mà bảng ra 14
// dòng → staff tưởng lỗi. Rỗng + placeholder "Tất cả (14)" thì không bao giờ tự mâu thuẫn.
const [limitInput, setLimitInput] = useState<string>("");
```

`todayVNString()`: dùng helper có sẵn ở `@megawin/shared/utils` (`todayVN` phía server;
client đã có `todayVNAsLocalDate()` — kiểm tra và dùng đúng helper trả `"YYYY-MM-DD"`,
**không** `new Date().toISOString().slice(0,10)` vì lệch timezone).

### 5.2 Số kỳ tạo — derive khi render, KHÔNG `useEffect`

```typescript
const available = preview.data?.draws ?? [];

// Rỗng ⇒ lấy tất cả kỳ còn lại. Có nhập ⇒ cắt bớt, nhưng clamp vào [1, available.length]
// nên KHÔNG BAO GIỜ vượt số kỳ thật còn được tạo của ngày đã chọn.
const effectiveCount =
  limitInput === ""
    ? available.length
    : Math.min(Math.max(parseInt(limitInput, 10) || 1, 1), available.length);

const rows = available.slice(0, effectiveCount);
```

Vì sao **không** dùng `useEffect` đồng bộ `count` theo `preview.data`: đó là "state derived from
props" — `vercel-react-best-practices` §5.1 cấm (thêm 1 render, dễ trôi lệch). Đây chính là gốc
của `lastPreviewCountRef` rối rắm hiện tại (L184, L202–203, L245, L258).

Hệ quả (đơn giản hơn hẳn plan trước):
- **Xoá** `lastPreviewCountRef`, `emptyRow()`, `isRowComplete()`, cảnh báo "N kỳ chưa đủ thông
  tin", `hasFewerPreviewSlots` — tất cả đều không còn xảy ra được.
- **Xoá** `useEffect` resize rows (L190–195) và `useEffect` fill preview (L198–219).
- Đổi ngày / gõ số kỳ → phản hồi **tức thì**, không refetch, không spinner.
- `rows` chỉ cần state phụ cho patch của staff (`isOpen`, và `drawTime` nếu vẫn cho sửa —
  xem 5.5); giữ dạng `Map<drawNo|index, Patch>` hoặc `Set<number>` cho "đang đóng", **không**
  copy cả mảng preview vào state.

### 5.3 Ô chọn ngày (mới) — 1 ô cho cả lô, thay cột "Ngày quay" per-row

Đặt cạnh input "SỐ KỲ TẠO" trong `Row 1`:

```
[ NGÀY TẠO KỲ  ▾ 2026-08-30 ]   [ SỐ KỲ TẠO  (Tất cả 119) ]   [badges…]
```

- Reuse `DatePickerCell` sẵn có (đã chặn `{ before: todayVNAsLocalDate() }`), nâng width.
- Thêm 2 nút phụ nhanh: `Hôm nay` / `Ngày mai` (text button nhỏ) — vì đây là 2 lựa chọn 95%
  thời gian.

**Gộp 2 cột `NGÀY QUAY` + `SỐ KỲ` thành 1 cột `MÃ KỲ` (drawId), read-only.**

Cả 2 game đã có format `drawId = "YYYY-MM-DD.NNN"` (`generateKenoDrawId` / bản Bingo 18) — chính
là ghép `drawDate` + `drawNo` zero-pad 3. Sau khi cả lô cùng 1 ngày và `drawNo` do server sinh
thì **cả 2 cột đều read-only và một cột đã hàm chứa cột kia** ⇒ tách 2 cột chỉ lặp lại cùng một
ngày trên 119 dòng.

- Bảng còn **4 cột**: `#`, `MÃ KỲ`, `GIỜ QUAY`, toggle Mở/Đóng.
  `gridTemplateColumns` đổi từ `"1.5rem 1fr 6rem 6.5rem 9rem"` → `"1.5rem 1fr 6.5rem 9rem"`
  (sửa **cả 2 chỗ**: header và row).
- Ô `MÃ KỲ` hiển thị `` `${drawDate}.${String(previewDrawNo).padStart(3, "0")}` ``, hoặc
  `` `${drawDate}.—` `` khi chưa có `previewDrawNo`. Style dashed + `bg-muted/30` +
  `title="Mã kỳ do hệ thống sinh khi tạo — không thể chỉnh sửa"`.
- Client **KHÔNG** tự ghép chuỗi bằng tay ở nhiều nơi: dùng helper `formatDrawId(drawDate, drawNo)`
  đã có trong package game (kiểm tra tên thật: `generateKenoDrawId`), import từ
  `@megawin/game-keno/helpers`. Nếu helper là server-only (không có trong export client-safe) →
  viết 1 hàm nhỏ trong `_lib` của dialog, có JSDoc nói rõ nó mirror format của `generateKenoDrawId`.
- Ngày quay vẫn hiện **1 lần** ở header bảng (VD `Ngày quay: 2026-08-31 · 119 kỳ`) để staff xác
  nhận đang tạo cho ngày nào mà không phải đọc 119 dòng.

### 5.4 `drawNo` read-only cho Keno → hiển thị trong cột `MÃ KỲ` (§5.3)

Xoá `<Input type="number">` cho `drawNo` (keno L422–436) — thay bằng ô `MÃ KỲ` read-only ở §5.3.
Bingo 18 hiện có ô `<span>` read-only cho `drawNo` (L428–436): cũng đổi sang cột `MÃ KỲ` để 2
game giống nhau.

Kéo theo ở Keno:

- `DrawRow.drawNo` → đổi tên **`previewDrawNo`** (khớp Bingo 18) + JSDoc "số dự kiến, server
  cấp lại lúc tạo".
- `findDuplicateKey`: đổi khoá từ `(date + drawNo)` → `(date + drawTime)` (copy bản Bingo 18
  L79–96, kèm JSDoc "drawNo do server sinh nên không còn là tiêu chí trùng").
- `handleCreate`: **bỏ** `drawNo: row.drawNo` khỏi payload (L273).
- `isRowComplete`: bỏ điều kiện `row.drawNo >= 1` (hoặc xoá hẳn hàm — §5.2).
- Thông báo lỗi trùng (L476–479): sửa từ "Số kỳ và ngày trùng…" → "Giờ quay trùng với kỳ khác
  trong danh sách."
- Header comment của file (L4–13): bỏ 2 dòng "nhập trực tiếp vào ô input", "Staff có thể tự điền".

### 5.5 Trạng thái "ngày đã hết kỳ"

Khi `preview.data && preview.data.draws.length === 0`, có **2 nguyên nhân khác nhau** — phải
phân biệt vì cách xử lý khác nhau:

| Điều kiện                        | Nguyên nhân                                   | Thông điệp + hành động                                       |
| -------------------------------- | --------------------------------------------- | ------------------------------------------------------------ |
| `occupiedCount + elapsedCount === maxPerDay` và `occupiedCount` lớn | Ngày đã tạo đủ kỳ | "đã tạo đủ N/N kỳ" → chọn ngày tiếp theo |
| `elapsedCount === maxPerDay`, `occupiedCount === 0` | Hôm nay đã qua `lastDrawTime` | "hôm nay đã hết giờ quay" → chọn ngày mai |
| `elapsedCount > 0` **và** `occupiedCount > 0` | Vừa qua giờ, vừa đã tạo phần còn lại | nêu cả 2 số |

```tsx
// Ngày đã dùng hết slot theo lịch quay — KHÔNG render bảng, hướng staff sang ngày kế tiếp
// thay vì để họ bấm Tạo rồi nhận lỗi từ server.
<div className="rounded-xl border border-dashed border-amber-300 bg-amber-50/50 p-4 dark:bg-amber-950/15">
  <p>
    Ngày <b>{drawDate}</b> không còn kỳ nào có thể tạo
    {occupiedCount > 0 ? ` — đã tạo ${occupiedCount} kỳ` : ""}
    {elapsedCount > 0 ? ` — ${elapsedCount}/${maxPerDay} kỳ đã qua giờ mở bán` : ""}.
  </p>
  <Button variant="outline" size="sm" onClick={() => setDrawDate(nextDay(drawDate))}>
    Chọn ngày tiếp theo ({nextDay(drawDate)})
  </Button>
</div>
```

- Nút submit `disabled` (vì `rows.length === 0` ⇒ `canSubmit === false`; assert lại điều kiện).
- `nextDay()`: cộng ngày trên **chuỗi `YYYY-MM-DD`** hoặc qua helper VN có sẵn — KHÔNG
  `new Date(drawDate)` rồi `+1` (parse UTC, lệch múi giờ ở biên ngày).
- Trường hợp hôm nay hết giờ là **bình thường và thường xuyên** (sau 21:52 Keno / 21:53 Bingo 18):
  cân nhắc khi mở dialog sau `lastDrawTime` thì mặc định `drawDate = ngày mai` luôn, đỡ 1 cú
  bấm. Quyết định khi code — nếu làm, phải đọc `lastDrawTime` từ đâu đó ở client (hiện chưa có)
  nên đơn giản hơn là: preview hôm nay trả rỗng → hiện panel, staff bấm 1 nút. **Chọn cách sau.**

### 5.6 Chú thích dialog — viết lại ngắn (đúng yêu cầu user)

User yêu cầu: *"không cần chú thích như vậy, chỉ cần viết đơn giản đại ý là cho tạo nhiều kỳ
liên tiếp trong một ngày chỉ định, lịch gợi ý tự động tính theo chu kỳ game"*.

Keno + Bingo 18 dùng **cùng một câu** (chỉ khác số phút):

> Tạo nhiều kỳ liên tiếp trong ngày được chọn. Lịch quay tự động tính theo chu kỳ {8|6} phút của game.

Xoá hẳn: "staff có thể chỉnh sửa bất kỳ ô nào", "Số kỳ (drawNo) phải duy nhất trong ngày",
"Số kỳ do hệ thống tự sinh khi tạo, không thể chỉnh sửa" (ô `drawNo` giờ đã hiển thị read-only
kèm `title` — không cần nhắc lại trong description).

### 5.7 Chi tiết còn lại

- Ô "SỐ KỲ TẠO": `type="number"`, `min={1}`, `max={available.length}`,
  `placeholder={"Tất cả (" + available.length + ")"}`, value là `limitInput` (string).
  **Không clamp lúc gõ** (gõ dở "1" trên đường tới "15" sẽ bị chặn oan) — clamp ở
  `effectiveCount` khi render (5.2). Hint dưới ô: `còn {remaining}/{maxPerDay} kỳ`.
  Thêm nút `×` xoá ô về rỗng (= tất cả) khi `limitInput !== ""`.
- `handleOpenChange(false)`: reset `drawDate = today`, `limitInput = ""`, xoá patch của staff.
- Nút `RefreshCw` (applyPreview): đổi thành `preview.refetch()` + xoá patch của staff.
- Nút submit: `Tạo {rows.length} kỳ · {openCount} mở bán` — dùng `rows.length` (đã clamp),
  không dùng `limitInput`.
- `preview.isError`: giữ badge lỗi nhưng **bỏ** "tự điền các ô bên dưới" (không còn tự điền
  được vì bảng derive từ preview) → "Lỗi tải lịch quay — thử lại." + nút retry.
- A11y: ô chọn ngày và ô số kỳ đều phải có `<Label htmlFor>` gắn đúng; nút "Chọn ngày tiếp theo"
  là `<Button>` thật (không phải div click).

---

## Phase 6 — Hardening (tuỳ chọn, làm sau khi Phase 1–5 xanh)

- [ ] Unique index `{ drawDate: 1, drawTime: 1 }` trên `kenoDraws` / `bingo18Draws`.
      **Bắt buộc kiểm tra trước:** `db.kenoDraws.aggregate([{$group:{_id:{d:"$drawDate",t:"$drawTime"},n:{$sum:1}}},{$match:{n:{$gt:1}}}])`
      trên staging. Có duplicate ⇒ phải xử lý dữ liệu cũ trước, KHÔNG tạo unique index mù.
      Nếu có duplicate và chưa thể dọn → dừng, chỉ dựa vào guard use-case (Phase 3.2).
- [ ] Index `{ drawDate: 1 }` (nếu Phase 2 phát hiện chưa có) cho `listDrawTimesByDate`.

---

## Phase 7 — Thứ tự thực thi & kiểm tra

### 7.1 Thứ tự commit (mỗi bước phải build xanh)

1. `game-core`: helper + test (độc lập, không phá gì).
2. `game-keno-application`: repo method → DTO → `PreviewDrawsUseCase` → `CreateDrawUseCase` → test.
3. `apps/backoffice` keno: schema/route → `use-operations` → dialog.
4. Lặp bước 2–3 cho `bingo18` (**diff phải đối xứng với keno**; đọc lại diff keno trước khi làm).
5. Xoá `calc-draw-slots.ts` ×2 (sau khi `rg -n "calcDrawSlots" packages apps` không còn match).
6. Phase 6 (nếu quyết định làm).

### 7.2 Lệnh kiểm tra

```bash
pnpm --filter @megawin/game-core test
pnpm --filter @megawin/game-keno-application test
pnpm --filter @megawin/game-bingo18-application test
pnpm --filter @megawin/game-core check-types
pnpm --filter @megawin/game-keno-application check-types
pnpm --filter @megawin/game-bingo18-application check-types
cd apps/backoffice && npx tsc --noEmit     # KHÔNG tạo .env.local (no-env-file-modification.mdc)
biome check packages/game-core packages/game-keno-application packages/game-bingo18-application "apps/backoffice/src/app/(main)/games/keno" "apps/backoffice/src/app/(main)/games/bingo18" apps/backoffice/src/app/api/keno apps/backoffice/src/app/api/bingo18
rg -n "calcDrawSlots" packages apps    # phải rỗng sau bước 5
```

### 7.3 Test tay trên backoffice (cả 2 game)

| # | Bước | Kỳ vọng |
|---|---|---|
| 1 | Mở dialog buổi sáng, ngày = hôm nay | Ô số kỳ **rỗng**, placeholder `Tất cả (N)`, hint `còn N/119`; bảng ra đủ N dòng |
| 2 | Mở dialog buổi tối (sau `lastDrawTime`) | Hiện panel "hết kỳ" + nút "Chọn ngày tiếp theo" |
| 3 | Bấm "Ngày mai" | Bảng ra **119** dòng (Keno) / **158** (Bingo 18), ô số kỳ vẫn rỗng |
| 4   | Kiểm tra header bảng                                               | Ghi rõ `Ngày quay: <ngày> · N kỳ`; mọi `MÃ KỲ` cùng prefix ngày đó, không row nào rơi sang ngày kế tiếp |
| 5   | Gõ `5` vào ô số kỳ                                                 | Bảng còn 5 row **ngay lập tức**, không spinner/refetch. Xoá ô → về đủ N                        |
| 6   | Gõ `9999` vào ô số kỳ                                              | Bảng ra đúng N row (clamp), nút submit ghi `Tạo N kỳ`                                          |
| 7   | Cột MÃ KỲ                                                          | Hiện `YYYY-MM-DD.NNN` liên tục; read-only (dashed, không focus/gõ được) ở **cả 2** game        |
| 8   | **Kiểm mốc cắt giờ**: lúc `20:06:00` (Keno) mở dialog ngày hôm nay | Slot đầu tiên là **20:08** (còn đúng 60s trước `closeAt 20:07`), KHÔNG phải 20:16 (bẫy §1.4a) |
| 8b  | Lúc `20:06:30` (Keno) mở dialog ngày hôm nay                       | Slot đầu là **20:16** — 20:08 chỉ còn 30s < ngưỡng 60s                                        |
| 9 | Tạo lô đủ kỳ ngày mai | Thành công; `drawNo` liên tục 001→119, không kỳ nào trùng giờ |
| 10 | Mở lại dialog, chọn cùng ngày mai | Panel "hết kỳ" (`119/119 đã tạo`), submit disabled |
| 11 | Tạo 5 kỳ → mở lại dialog | Bảng ra `114` dòng, và **không** slot nào trùng 5 kỳ vừa tạo |
| 12 | **Kiểm không lấy kỳ quá khứ**: buổi tối, ngày hôm nay đã có ~100 kỳ buổi sáng | Số kỳ còn lại là số slot chưa qua giờ (dương); mở DevTools Network xem response — **không** chứa 100 kỳ buổi sáng (bẫy §1.4c) |
| 12b | Để dialog mở ~5 phút rồi bấm Tạo (ngày hôm nay) | Server chặn với lỗi "không còn đủ thời gian mở bán", gợi ý tải lại — **không** tạo kỳ đã quá giờ |
| 13 | Sửa 1 `GIỜ QUAY` lệch grid (VD 20:03) rồi Tạo | Server trả lỗi rõ "không nằm trong lịch quay của game" |
| 14 | 2 tab cùng tạo cùng ngày (race) | Tab thứ 2 nhận `conflict` "đã có kỳ quay lúc …", DB **không** có kỳ song sinh |
| 15 | Chọn ngày quá khứ trong picker | Bị disable ở UI; nếu gọi API trực tiếp → `badRequest` |
| 16 | Đọc lại description dialog | Đúng 1 câu ngắn, không còn nói staff sửa được số kỳ |

### 7.4 Rà soát trước khi mở PR

- [ ] `drawNo` không còn xuất hiện trong payload create của **cả 2** game (grep `drawNo:` trong dialog).
- [ ] Không dùng string literal trần cho status — dùng `DrawStatus.*` (`code-quality-standards.mdc` §5.3).
- [ ] Không dùng indexed-access `DrawDoc["..."]` trong signature mới (§5.1, §5.4).
- [ ] Mọi `if` có `{}` (§6); import gộp đầu file (§7).
- [ ] Class/method/interface field mới đều có `/** JSDoc */` (§1, §2).
- [ ] Không có `biome-ignore` mới.
- [ ] Test không có `deleteMany({})` / filter rỗng (`test-data-safety.mdc`).
- [ ] `player-sdk` **không** bị ảnh hưởng (draw creation là BO-only, không có DTO player-facing
      nào đổi) — xác nhận bằng grep, ghi vào PR description.

---

## 8. Rủi ro & cách chặn

| Rủi ro                                                                                    | Chặn bằng                                                                                                                                             |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Lệch timezone khi map `drawTime` → phút trong ngày                                        | Bắt buộc qua `formatVN` của `@megawin/shared/utils` (`vnMinutesOfDay`); test có case slot 00:0x và 23:5x                                               |
| Preview và create lệch điều kiện lọc giờ → gợi ý slot mà create từ chối                   | Cả 2 gọi **cùng** `isDrawSlotCreatable` (§1.2); tuyệt đối không viết lại điều kiện; test (c)-biên 60s ở cả 2 use-case                                 |
| Truyền `now` (thay vì `availableMinutes[0]`) làm `fromDrawTime` → bỏ sót kỳ ngay sau `now` | Cảnh báo in đậm ở Phase 2 + luồng 2 bước §3.1 + test spy assert `fromDrawTime === 20:08`                                                               |
| Đổi shape `PreviewDrawsOutput` phá caller khác                                            | Grep `usePreviewDraws` / `PreviewDrawsUseCase` — chỉ 2 dialog + 2 route dùng (đã xác nhận)                                                             |
| Xoá `calcDrawSlots` phá game khác                                                         | 5 game còn lại có helper riêng trong package của chúng; grep trước khi xoá (bước 5)                                                                    |
| Số kỳ mặc định nhảy từ 10 lên 119/158 làm tăng payload/thời gian tạo                      | `createDraws` đã là **1** `bulkWrite` trong transaction (L91–122) — batch lớn đã được thiết kế cho; `BATCH_MAX` vẫn là trần                            |
| Bingo 18 làm sau, dễ lệch so với Keno                                                     | Bước 4 yêu cầu đọc lại diff Keno; checklist 7.4 chạy cho **cả 2**                                                                                     |
| Cài `elapsed` bằng "bỏ block hiện tại" → mất 1 kỳ mỗi lần tạo trong ngày                  | §1.4(a) + test bắt cứng `availableMinutes[0] === 1208` lúc 20:06 (Keno)                                                                               |
| Cài `remaining` bằng phép trừ số lượng → âm / báo hết kỳ sai                              | §1.4(b) + bất biến `elapsed + occupied + remaining === maxPerDay`                                                                                      |
| Guard (c) chặn oan lô hợp lệ khi staff bấm Tạo chậm vài giây                               | Ngưỡng `MIN_SALES_WINDOW_SECONDS = 60` cho biên an toàn; message chỉ rõ "tải lại danh sách kỳ gợi ý"; test biên **đúng 60s vẫn pass**                  |
| Counter bị đốt số kỳ khi lô bị từ chối                                                    | Mọi guard chạy **trước** `getNextDrawNoBatch`; test assert `lastDrawNo` không đổi sau mỗi case fail                                                    |
| Cài `remaining` bằng phép trừ số lượng → âm / báo hết kỳ sai | §1.4(b) + test 100 kỳ buổi sáng |
