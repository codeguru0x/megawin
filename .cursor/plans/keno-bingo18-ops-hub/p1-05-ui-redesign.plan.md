# P1-05 — Ops Hub UI/UX Redesign (Keno → chuẩn cho Bingo18)

> **Trạng thái:** ĐỀ XUẤT — chờ thảo luận, CHƯA code.
> **Phạm vi:** toàn bộ `apps/backoffice/src/app/(main)/games/keno/operations-hub/`.
> **Mục tiêu:** sửa hết bug hiển thị + đưa UI về đúng `frontend-dev.mdc`, rồi mới port sang
> Bingo18 (P1-04) — tránh port cả lỗi sang game thứ hai.
> **Nguồn:** review nội bộ `ui-review-2026-09-07.md` + feedback trực tiếp của bạn + tôi tự
> click thử toàn bộ UI trên Cursor Browser (localhost:3000, đã login) và đo bằng CDP.

---

## A. Bug ĐO ĐƯỢC trên UI thật (không phải suy đoán)

Tôi đã mở `http://localhost:3000/games/keno/operations-hub`, click qua 5 tab, mở expand panel,
tick checkbox để hiện bulk bar, và đo bằng `Runtime.evaluate`. Đây là số liệu thật:

### A1. 🔴 CRITICAL — Expand panel: chữ đè lên nhau

**Số đo:**

```
reasonText       = "Chờ chốt sổ 273299s — vượt ngưỡng, có thể đã bỏ sót batch."
reasonRect       = { left: 41, right: 217, width: 176 }
reasonScrollW    = 408          ← nội dung cần 408px, ô chỉ có 176px
reasonWhiteSpace = "nowrap"     ← THỦ PHẠM
moneyLabels[0]   = { text: "Doanh thu", left: 424 }
```

**Nguyên nhân chính xác:** shadcn `TableCell` có class `whitespace-nowrap`. Panel render nội
dung trong `<TableCell>` → `<p>` kế thừa `nowrap` → không wrap được → tràn 232px sang cột 2
("MỐC THỜI GIAN") và cột 3 ("CHỈ SỐ TIỀN"), gây đè chữ đúng như ảnh bạn gửi.

**Fix:** panel content bọc trong `<td className="p-0">` + wrapper `whitespace-normal min-w-0`,
mọi `<p>` reason thêm `break-words`. Đồng thời `<td colSpan>` phải khớp đúng số cột (hiện
`colSpan={8}` ở empty-state nhưng header có 8 `<TableHead>` — ok — panel thì đang thiếu kiểm tra).

### A2. 🔴 Duration thô "273299s" thay vì "75g54p"

`reason` string được sinh ở `derive-draw-state.ts` bằng cách nối **số giây thô** vào câu
tiếng Việt. Trong khi cột "Tuổi/còn lại" cùng dòng lại render đúng `75g54p` qua
`formatDurationShort`. Hai chỗ, hai format, cùng một dữ liệu.

### A3. 🔴 Grid 2 cột BỊ ĐẢO TỈ LỆ (đây là gốc của "ô bên trái rất nhỏ")

**Số đo:**

```
gridTemplateColumns = "593px 1146px"   ← code viết grid-cols-[2fr_1fr]
tableWidth          = 591px            ← bảng vận hành (đáng lẽ RỘNG hơn)
```

Code là `grid-cols-[2fr_1fr]` (trái rộng gấp đôi) nhưng thực tế **trái 593 / phải 1146** —
đảo ngược hoàn toàn.

**Nguyên nhân:** `1fr` trong CSS Grid thực chất là `minmax(auto, 1fr)`. Cột phải chứa Focus
Rail (11 card `min-w-24`) → `min-content` ≈ 1146px → grid buộc phải cấp đủ, cột trái bị bóp
về `min-content`. Đây là lỗi CSS thuần, không phải do bạn cảm giác.

**Fix:** `grid-cols-[minmax(0,2fr)_minmax(0,1fr)]` + `min-w-0` trên cả 2 children. Focus Rail
phải `overflow-x-auto` với track `min-w-0`.

### A4. 🟡 Day Flow: 121/128 cột VÔ HÌNH

**Số đo:**

```
dayFlowCols       = 128
colWidth          = 12.45px
transparentStage  = 121   ← 121 cột KHÔNG có màu stage
zeroRevenue       = 128   ← toàn bộ revenue = 0 → thanh doanh thu cao 0px
```

Vậy Day Flow vẽ 128 cột nhưng chỉ 7 cột có màu → nhìn như "một vạch màu ngắn ở góc trái rồi
trống trơn". Đúng như bạn nói: *"chẳng có ý nghĩa gì"*. Kỳ `selling` (đông nhất) map sang
màu `transparent`.

### A5. 🟡 Label không đồng bộ 3 nơi cho CÙNG một trạng thái

| Nơi | Chuỗi |
|---|---|
| Tab bar | `"Hết giờ cược"` |
| Cột "Chặng" (`OPS_STAGE_LABEL`) | `"Chờ chốt sổ"` |
| Funnel Zone 2 | `"Hết giờ cược"` |
| Nút action (nguồn chân lý `draw-next-action.ts`) | `"Đóng bán"` |
| Nút trong panel hiện tại | `"Chốt sổ bán"` ❌ |

4 cách gọi cho 1 khái niệm. Nguồn chân lý là `draw-next-action.ts` → **"Đóng bán"**.

### A6. 🟡 "có thể kỳ chết" — văn không chuyên nghiệp + LOGIC SAI

Chuỗi ở `hub-selling-section.tsx`. Điều kiện ở `selling-outliers.ts`:

```ts
const isDead = row.revenue === 0 && ageSinceOpenMin > 30;
```

Bạn hoàn toàn đúng: kỳ mở bán 30 phút mà chưa có cược ở game 8 phút/kỳ với traffic thấp là
**bình thường**, không phải "chết". Và cả 121 kỳ đều `0 ₫ · 56p32s` giống nhau → danh sách
outlier vô nghĩa (screenshot của bạn: #119…#111 y hệt nhau).

### A7. Các vi phạm `frontend-dev.mdc` khác (đã verify trong code)

| # | Vi phạm | Chỗ |
|---|---|---|
| 1 | KPI **không dùng** pattern horizontal icon (§1.2a) — không có icon nào | `hub-overview-section.tsx` |
| 2 | Hardcode `from-indigo-500 to-indigo-600` thay vì `GAME_COLORS[Keno]` (= sky) | `hub-page-header.tsx` |
| 3 | Bảng 5A **không có sticky header** (§1.7) | `hub-queue-table.tsx` |
| 4 | Thiếu `pl-5`/`pr-5` cột đầu/cuối (§1.7a) | `hub-queue-table.tsx` |
| 5 | Hardcode màu `bg-amber-400/70`, `text-amber-600` | `hub-day-flow.tsx`, `queue-row.tsx` |
| 6 | `text-[10px]` ngoài heatmap/stepper (§1.2 T5) | `focus-rail.tsx` |
| 7 | Tab bar không có icon | `hub-queue-table.tsx` |
| 8 | Mã kỳ chỉ `#14` — mất ngày, sai khi có kỳ nhiều ngày | 5A, 5B, Focus Rail, Day Flow |
| 9 | `formatVNDCompact` vẫn in `₫` khi < 1 triệu → "0 ₫" khắp nơi | mọi zone |
| 10 | `formatDurationShort` khai local, không ở `@megawin/shared/utils/date` | `relative-duration.tsx` |

---

## B. Phương án thiết kế

### B0. Nền tảng chung — sửa 1 lần, dùng cho cả Keno + Bingo18

**B0.1 — Money format: bỏ `₫`, viết tắt như report**

Thêm vào `packages/shared/src/utils/number.ts`:

```ts
/**
 * Tiền cho UI vận hành mật độ cao: viết tắt, KHÔNG kèm đơn vị.
 * Đơn vị ghi 1 lần ở header cột / label KPI ("Doanh thu (VND)").
 *
 * 0 → "0" · 850_000 → "850K" · 12_500_000 → "12,5tr" · 3_200_000_000 → "3,2tỷ"
 */
export function formatMoneyCompact(amount: number | null | undefined): string;
```

Quy tắc: `< 1K` → số nguyên · `< 1tr` → `NNNK` · `< 1tỷ` → `N,Ntr` · `≥ 1tỷ` → `N,NNtỷ`.
Ops Hub dùng **duy nhất** hàm này. `formatVNDCompact` (có `₫`) giữ nguyên cho trang khác.

**B0.2 — Duration: đưa về date util chung**

Chuyển `formatDurationShort` từ `relative-duration.tsx` sang
`packages/shared/src/utils/date.ts`, đổi tên cho rõ ý:

```ts
/** Duration ngắn gọn cho UI vận hành: 45s · 12p30s · 2g14p · 3ng5g */
export function formatDurationCompact(seconds: number): string;
```

Thêm nhánh `≥ 24h → "3ng5g"` (hiện `75g54p` khó đọc). Mọi nơi trong Hub (cột Tuổi/còn,
reason string, panel, Focus Rail) gọi hàm này — **cấm** nối số giây thô vào chuỗi.

**B0.3 — Mã kỳ: luôn đủ `drawId`, có tooltip**

Component dùng chung `apps/backoffice/src/components/games/shared/draw-no-badge.tsx`:

```tsx
<DrawIdLabel drawId="2026-09-07.015" mode="compact" />
// Hiển thị: "#015 · 07/09"   → tooltip: "2026-09-07.015"
// mode="full" → "2026-09-07.015" (dùng trong expand panel, breadcrumb)
```

Quy tắc: **hôm nay** → `#015`; **khác ngày hôm nay** → `#015 · 07/09` (badge ngày nổi bật để
mắt bắt ngay kỳ tồn từ ngày trước). Tooltip **luôn** có `drawId` đầy đủ. Áp dụng cho 5A, 5B,
Focus Rail, Day Flow tooltip, panel.

**B0.4 — Label: 1 nguồn chân lý**

`OPS_STAGE_LABEL` và tab label phải **đồng bộ với `draw-next-action.ts`**:

| Stage | Label chuẩn (thay thế) | Cũ |
|---|---|---|
| `pending_close` | **Chờ đóng bán** | ~~Chờ chốt sổ~~ |
| Tab tương ứng | **Chờ đóng bán** | ~~Hết giờ cược~~ |
| Nút action | **Đóng bán** | ~~Chốt sổ bán~~ |
| `awaiting_settle` | **Chờ kết sổ** | (giữ) |
| `never_opened` | **Chưa mở bán** | ~~Kỳ trắng~~ |

Đề xuất đưa `OPS_STAGE_LABEL` vào `packages/game-core/src/labels/` (Bingo18 dùng chung, theo
`frontend-dev.mdc` §2.3) thay vì khai trong `queue-types.ts` của Keno.

---

### B1. Header — theo đúng trang `operations`

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ [🟦 Layers]  Keno — Trung tâm vận hành                                        │
│              128 kỳ hôm nay · 7 kỳ cần xử lý          [↻ 12s] [+ Tạo kỳ quay] │
└──────────────────────────────────────────────────────────────────────────────┘
```

Thay đổi cụ thể:

1. Icon gradient: `GAME_COLORS[GameProduct.Keno].iconGradient` (sky) — **bỏ** hardcode indigo.
   Bingo18 tự động ra lime, không sửa code.
2. **Bỏ "Ngày tài chính"** — đúng như bạn nói, 1 ngày Keno cắt qua 2 ngày tài chính (11:00),
   hiển thị 1 giá trị là sai lệch. Subtitle đổi thành *đếm việc*: `128 kỳ hôm nay · 7 kỳ cần xử lý`.
3. Nút "Làm mới": chỉ còn **icon `RotateCw`** + text thời gian bên phải icon, gộp thành 1
   `variant="ghost" size="sm"`: `[↻ 12s]`. Hover mới hiện tooltip "Làm mới (r)".
   Icon quay khi `isFetching`.
4. Thêm **`[+ Tạo kỳ quay]`** `variant="default"` bên phải nhất — reuse đúng dialog của trang
   `operations` (`CreateDrawDialog`), không viết mới.
5. Bỏ nút "Chi tiết kỳ" hiện tại (mơ hồ — kỳ nào?). Thay bằng nút này ở panel từng kỳ.

---

### B2. Zone 2 — KPI đúng pattern §1.2a (đây là thay đổi lớn nhất)

**Hiện tại:** 5 ô funnel phẳng, không icon, số `0 ₫` lặp lại, viền đỏ mảnh vô nghĩa dưới ô.
**Đề xuất:** **6 KPI card** chuẩn `frontend-dev.mdc` §1.2a — grid `sm:grid-cols-3 lg:grid-cols-6`.

Bạn muốn nhấn mạnh cả số liệu tài chính tổng → thêm card thứ 6 **"Tổng ngày"** đứng riêng bên
phải, ngăn bởi `lg:border-l lg:pl-3` để phân biệt *"việc cần làm"* (5 card đầu) với *"kết quả"*
(card cuối).

```
│──────────── VIỆC CẦN LÀM (đếm kỳ) ────────────│  │─ KẾT QUẢ NGÀY (tiền) ─│
┌─ 🟥 ────────┐┌─ 🟧 ────┐┌─ 🟪 ────┐┌─ 🟦 ────┐┌─ 🟩 ────┐ ┃ ┌─ 🟩 ──────────┐
│ Cần xử lý   ││Chờ đóng ││Chờ có KQ││Chờ kết sổ││Đang bán │ ┃ │ Tổng ngày     │
│ 7 kỳ        ││ 6 kỳ    ││ 1 kỳ    ││ 0 kỳ     ││121 kỳ   │ ┃ │ 148,2tr       │
│ 2 kỳ > 30p  ││sớm nhất ││1 kỳ quá ││ —        ││12,5tr   │ ┃ │ 3.204 vé · 8  │
│             ││   2p    ││   giờ   ││          ││         │ ┃ │ kỳ chưa kết sổ│
└─────────────┘└─────────┘└─────────┘└──────────┘└─────────┘ ┃ └───────────────┘
```

**B2.1 — Fix chiều cao KPI không đều (bạn phát hiện đúng)**

Nguyên nhân: card "Đang bán" hiện có **3 dòng nội dung** (`0 ₫` + `TB 0 giây` + `0 vé 0 bộ`)
cộng thêm khối `Exposure 0 ₫ (chưa cap)` ở dưới → cao hơn 4 card còn lại (2 dòng). Xem ảnh của
bạn: ô phải cao hơn hẳn.

Cách sửa — ràng buộc cứng, áp cho **mọi** KPI card:

```tsx
// Card: chiều cao cố định, không phụ thuộc số dòng nội dung
<div className="flex h-[72px] items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
  <div className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg", iconBg)}>
    <Icon className={cn("size-5", iconColor)} />
  </div>
  <div className="min-w-0 flex-1">
    <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
    <p className="text-lg font-bold tabular-nums leading-tight">{value}</p>
    {/* ĐÚNG 1 dòng sub, luôn render (dùng "—" khi trống) → mọi card cao bằng nhau */}
    <p className="truncate text-xs text-muted-foreground">{sub ?? "—"}</p>
  </div>
</div>
```

Quy tắc bất biến: **mỗi KPI card đúng 1 dòng `sub`, không bao giờ 2 dòng.** Khi trống thì render
`—` chứ không bỏ dòng (bỏ dòng = card thấp hơn = lệch hàng). `h-[72px]` + `truncate` chặn mọi
trường hợp nội dung dài làm cao thêm.

**Xử lý `Exposure`:** đây chính là thứ tạo dòng thứ 4 → **chuyển ra khỏi KPI**. Đưa vào:

- Cột `Exposure` của bảng 5A (per-kỳ, có nghĩa hơn) — đã có trong B5.
- Và sub-text của card "Tổng ngày" khi vượt ngưỡng: `⚠ Exposure 45,2tr vượt cap` (chỉ khi vượt,
  bình thường hiện `3.204 vé · 8 kỳ chưa kết sổ`).

Bảng màu icon (lấy từ §1.2a, **không** tự chọn màu mới):

| KPI | iconBg | iconColor | Icon |
|---|---|---|---|
| Cần xử lý | `bg-rose-100 dark:bg-rose-900/50` | `text-rose-600 dark:text-rose-400` | `AlertTriangle` |
| Chờ đóng bán | `bg-amber-100 dark:bg-amber-900/50` | `text-amber-600 dark:text-amber-400` | `Lock` |
| Chờ có KQ | `bg-violet-100 dark:bg-violet-900/50` | `text-violet-600 dark:text-violet-400` | `Radio` |
| Chờ kết sổ | `bg-blue-100 dark:bg-blue-900/50` | `text-blue-600 dark:text-blue-400` | `Calculator` |
| Đang bán | `bg-indigo-100 dark:bg-indigo-900/50` | `text-indigo-600 dark:text-indigo-400` | `TrendingUp` |
| **Tổng ngày** | `bg-emerald-100 dark:bg-emerald-900/50` | `text-emerald-600 dark:text-emerald-400` | `Wallet` |

Quy tắc số:

- 5 card đầu: value = **đếm kỳ** (`7 kỳ`), sub = thông tin *hành động* ("2 kỳ > 30p", "sớm nhất 2p").
- Card "Tổng ngày": value = **tiền** (`148,2tr` — `formatMoneyCompact`), sub = `3.204 vé · 8 kỳ chưa kết sổ`.
- 5 card đầu **clickable** → set tab bảng 5A (`cursor-pointer hover:bg-accent/50`), card active có
  `ring-1 ring-primary`. Card "Tổng ngày" **không** clickable (không có tab tương ứng) →
  `cursor-default`, không hover effect (tránh hứa hẹn tương tác không có).


---

### B3. Day Flow — **XOÁ, gộp vào Focus Rail** (chốt theo phản hồi 07/09)

**Quyết định:** bỏ hoàn toàn `hub-day-flow.tsx`. Lý do bạn đưa ra là đúng và tôi đồng ý:

- Day Flow và Focus Rail **cùng là timeline theo kỳ** — 2 component vẽ cùng một dữ liệu
  (`state.dayFlow`), chỉ khác mật độ. Giữ cả hai là trùng lặp.
- Gom 24 cột theo giờ **không thêm thông tin**: kỳ mở đều đặn mỗi 6–8 phút, nên "giờ này có
  bao nhiêu kỳ" là hằng số biết trước (≈8 kỳ/giờ). Đếm lại một hằng số là vô nghĩa.

**Thay thế:** một component duy nhất — **`HubTimelineRail`** — đặt **ở vị trí Day Flow cũ**
(full width, ngay dưới KPI), thay cho cả Day Flow lẫn Focus Rail ở cột phải.

```
┌─ Dải kỳ · 128 kỳ hôm nay ────────────────────  [◀] [⦿ Về kỳ hiện tại] [▶]  [– 11 kỳ +] ┐
│                                                                                         │
│  ┌──────┐┌──────┐┌──────┐╎┌══════┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐┌──────┐    │
│  │#013  ││#014  ││#015  │╎│#016  ││#017  ││#018  ││#019  ││#020  ││#021  ││#022  │    │
│  │21:04 ││21:12 ││21:20 │╎│21:28 ││21:36 ││21:44 ││21:52 ││22:00 ││22:08 ││22:16 │    │
│  │Kết sổ││⚠Chờ  ││⚠Chờ  │╎│Đang  ││Đang  ││Đang  ││Đang  ││Chưa  ││Chưa  ││Chưa  │    │
│  │      ││ đóng ││ có KQ│╎│ bán  ││ bán  ││ bán  ││ bán  ││ mở   ││ mở   ││ mở   │    │
│  │▇▇▇▇  ││▇▇    ││▇▇▇   │╎│▇     ││      ││      ││      ││      ││      ││      │    │
│  │12,5tr││ 840K ││ 2,1tr│╎│ 120K ││   0  ││   0  ││   0  ││  —   ││  —   ││  —   │    │
│  │340 vé││ 28 vé││ 61 vé│╎│  4 vé││  0 vé││  0 vé││  0 vé││  —   ││  —   ││  —   │    │
│  └──────┘└──────┘└──────┘╎└══════┘└──────┘└──────┘└──────┘└──────┘└──────┘└──────┘    │
│   ring đỏ  ring đỏ        ╎ ring primary = kỳ hiện tại                                  │
│                           ╎= biên chốt cược                                             │
│  ←──────────── kéo chuột để trượt (grab cursor) ────────────→                            │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

**Tương tác (bạn yêu cầu):**

1. **Kéo chuột để trượt** (`drag-to-scroll`): `onPointerDown` ghi `startX` + `scrollLeft`,
   `onPointerMove` set `scrollLeft`, `cursor-grab`/`cursor-grabbing`. Dùng `pointer` events (hỗ
   trợ cả trackpad/touch). Phân biệt kéo vs click bằng ngưỡng 5px — kéo thì **không** trigger
   navigate của card.
2. **Nút `⦿ Về kỳ hiện tại`** (icon `Crosshair` hoặc `LocateFixed`): xoá `focus` param
   (`setUrlParams({ focus: null })`) + `scrollIntoView({ inline: "center" })` về card biên. Nút
   này chỉ **enabled khi đang lệch** khỏi kỳ hiện tại → tự cho biết "bạn đang xem chỗ khác".
3. Giữ `[◀] [▶]` nhảy theo cửa sổ, thêm `[– 11 kỳ +]` điều chỉnh `span` (7–21) đã có sẵn.
4. Phím tắt: `Home` → về kỳ hiện tại; `←`/`→` trượt 1 kỳ (bổ sung vào `use-hub-keyboard.ts`).
5. Scroll ngang bằng `shift + wheel` (mặc định của `overflow-x-auto`) — thêm `overscroll-x-contain`
   để không kéo cả trang.

**Nội dung mỗi card (câu 3 của bạn — bổ sung thông tin):**

| Dòng | Nội dung | Ghi chú |
|---|---|---|
| 1 | `#015 · 07/09` + giờ quay | `<DrawIdLabel>` + **tooltip `drawId` đầy đủ** |
| 2 | **Trạng thái chi tiết** (`Chờ đóng bán`, không phải gate thô) | xem bug B7.2 |
| 3 | Bar doanh thu so median cùng gate | giữ logic hiện tại |
| 4 | `12,5tr` — **tiền cược** | `formatMoneyCompact` |
| 5 | `340 vé` — **tổng entries** | **MỚI** (bạn yêu cầu) |

Card cao thêm 1 dòng nhưng đây là component full-width duy nhất nên có chỗ. `min-w-24` → `min-w-28`.

**Được gì khi gộp:**

- Xoá 1 component (~200 dòng `hub-day-flow.tsx`) + xoá luôn bug 121/128 cột vô hình (§A4).
- Cột phải giải phóng → **bảng "Đang bán" được toàn bộ chiều cao**, và grid 2 cột không còn bị
  Focus Rail đẩy `min-content` (§A3 tự khỏi, không cần hack `minmax`).
- Rail full-width chứa được 14–16 card thay vì 11 → nhìn xa hơn về 2 phía.

---

### B3b. Nhập kết quả trong Hub — **KHÔNG làm bulk publish** (đã điều tra code)

Bạn hỏi: *"Trong UI đã cho phép nhập kết quả chưa? Nếu duyệt kết quả nhiều draw liên tục có nên
làm thế không?"*

**Trả lời phần 1 — Hub hiện KHÔNG cho nhập kết quả.** Đã verify:

- Hub có 4 bulk API (P0-04): `bulk-open-sales`, `bulk-close-sales`, `bulk-settle`, `bulk-void`.
  **Không có** `bulk-publish-result` — và đó là quyết định đúng.
- Nhập kết quả chỉ có ở trang `operations` từng kỳ:
  `keno/operations/_lib/sections/draw-management/draw-actions/publish-result-action.tsx`
  (**640 dòng**), Bingo18 tương ứng **574 dòng**.

**Trả lời phần 2 — KHÔNG nên làm bulk publish.** Đây là kết luận sau khi đọc hết 640 dòng đó,
không phải cảm tính. Lý do cụ thể:

| Bằng chứng trong code | Vì sao chặn bulk |
|---|---|
| `KENO_DRAW_COUNT = 20` vs `BINGO18_DRAW_COUNT = 3` | Bạn nói đúng: 20 ô/kỳ. 6 kỳ = **120 ô input** trong 1 dialog — không ai kiểm được bằng mắt |
| `useVietlottSuggestion(drawId)` — gợi ý **mã kỳ Vietlott riêng từng kỳ** | Bulk phải fetch N suggestion, mỗi kỳ 1 mã khác → không thể nhập 1 lần |
| `useVietlottResult(drawId, period)` + autofill Rule A | Autofill chỉ chạy khi **toàn bộ 20 ô rỗng**, có chủ đích chống kết quả "lai". Nhân N kỳ thì quy tắc này vô nghĩa |
| `diffResultNumbers` + highlight ô lệch + nút "Áp dụng" | Cơ chế **đối chiếu người-vs-nguồn** từng ô. Bulk sẽ phải bỏ → mất lớp kiểm tra cuối |
| `periodMismatch` — cảnh báo mềm khi mã kỳ lệch gợi ý | Comment trong code ghi rõ đây là *"detector duy nhất phát hiện neo đã cũ"* |
| `defaultVietlotDate = displayVNDate(draw.scheduledDrawAt)` + comment *"đã xảy ra thực tế"* | Từng có bug lệch 1 ngày. Bulk làm rủi ro này nhân N |
| `handleGridPaste` — dán sai số lượng thì **từ chối**, không đoán | Comment: *"đường tiền không cho phép đoán"* |

Kết quả xổ số là **input gốc của toàn bộ dòng tiền** — sai 1 số ở 1 kỳ là trả sai tiền cho toàn
bộ vé kỳ đó. Đây là chỗ duy nhất trong hệ thống mà **chậm lại là tính năng, không phải nhược điểm**.

**Thay vào đó — làm luồng "nhập liên tiếp" (sequential), CHỈ cho Keno + Bingo18:**

**⚠️ Sửa lại nhận định SAI ở bản plan trước:** tôi từng viết _"sửa component dùng chung 7 game"_.
Điều đó **SAI**. Đã verify bằng `wc -l` từng file — mỗi game có **file riêng biệt**, không share:

| Game        | File `publish-result-action.tsx` | Số ô nhập |
| ----------- | ------------------------------- | --------- |
| **keno**    | 640 dòng                        | **20**    |
| **bingo18** | 574 dòng                        | **3**     |
| lotto535    | 646 dòng                        | 6         |
| power655    | 649 dòng                        | 6         |
| max3d       | 679 dòng                        | —         |
| max3dpro    | 673 dòng                        | —         |
| mega645     | 537 dòng                        | 6         |

7 file độc lập. Phần dùng chung chỉ là helper nhỏ trong `games/_lib/operations/`
(`vietlott-result-panel.tsx`, `result-numbers-diff.ts`, `magic-fetch-result-button.tsx`…) —
**không** phải bản thân dialog. Nghĩa là sửa Keno + Bingo18 **không ảnh hưởng 5 game còn lại**.
Rủi ro thấp hơn nhiều so với tôi đánh giá ban đầu.

**Phạm vi — chỉ 2 game (chốt theo yêu cầu của bạn):**

| Game           | Kỳ/ngày  | Có luồng nhập liên tiếp?                              |
| -------------- | -------- | ----------------------------------------------------- |
| **Keno**       | ~119–128 | ✅ Có                                                 |
| **Bingo18**    | ~119     | ✅ Có                                                 |
| 5 game còn lại | 1–2      | ❌ Không — nhập 1 kỳ là xong, thêm nút chỉ gây rối    |

**Thiết kế dialog (theo đúng mô tả của bạn):**

```
┌─ Nhập kết quả · 2026-09-07.015 · 21:20                     [kỳ 2/6] ────────┐
│                                                                             │
│   (NGUYÊN dialog publish-result hiện có — 20 ô, autofill Vietlott,          │
│    diff highlight, cảnh báo lệch mã kỳ… KHÔNG đổi gì bên trong)             │
│                                                                             │
│ ─────────────────────────────────────────────────────────────────────────── │
│  Còn 4 kỳ chưa có KQ: #016 · #017 · #018 · #019                             │
│                                                                             │
│  [Huỷ bỏ]        [Xác nhận]          [Xác nhận & Kỳ tiếp ▶]                 │
│   ghost           outline              default ← MAIN, nổi bật nhất         │
└─────────────────────────────────────────────────────────────────────────────┘
```

Phân tầng 3 nút theo mức độ chú ý — đúng như bạn yêu cầu:

| Nút                            | Variant                    | Hành vi                                              | Khi nào hiện             |
| ------------------------------ | -------------------------- | ---------------------------------------------------- | ------------------------ |
| `Huỷ bỏ`                       | `ghost`                    | đóng dialog, không lưu                               | luôn                     |
| `Xác nhận`                     | **`outline`** (ít chú ý)   | lưu → **đóng** dialog (hành vi cũ)                   | luôn                     |
| **`Xác nhận & Kỳ tiếp ▶`**     | **`default`** (main)       | lưu → **giữ** dialog → load kỳ chưa có KQ tiếp theo  | chỉ khi `queue.length>1` |

Khi ở **kỳ cuối** hàng đợi: `[Xác nhận & Kỳ tiếp]` tự ẩn, `[Xác nhận]` **đổi sang
`variant="default"`** (thành main button) — không để dialog rơi vào trạng thái không có nút chính.

**Hành vi `Xác nhận & Kỳ tiếp` — chi tiết bắt buộc:**

1. Submit kỳ hiện tại. **Chỉ khi mutation thành công** mới chuyển kỳ (thất bại → giữ nguyên form
   + toast lỗi, không mất số đã nhập).
2. Reset **toàn bộ** state form: 20 ô, `vietlotPeriod`, `vietlotDate`, `validation`,
   `hasAppliedAutoResult`, `hasManualFetch`, `periodTouched`, `pasteNotice`.
3. Fetch lại `useVietlottSuggestion(nextDrawId)` + `useVietlottResult` cho kỳ mới → autofill Rule A
   chạy lại đúng (form vừa reset = 20 ô rỗng → điều kiện autofill thoả).
4. `defaultVietlotDate` tính lại theo `nextDraw.scheduledDrawAt` — **không** giữ ngày kỳ trước.
   Đây đúng là bug lệch-1-ngày mà comment trong code ghi _"đã xảy ra thực tế"_.
5. Focus về ô số 1. Bộ đếm `[kỳ 2/6]` tăng.
6. **Không** auto-submit, **không** auto-apply — staff vẫn xác nhận từng kỳ. Chỉ tiết kiệm việc
   đóng/mở dialog + tìm kỳ tiếp trong selector.

**Hàng đợi lấy từ đâu:**

- **Trang `operations`:** lọc `draws` (đã có sẵn từ `useDrawSelectorList`) theo
  `status === SalesClosed`, sort `drawTime` tăng dần.
- **Hub:** hàng đợi = `state.rows5A` tab "Chưa có KQ" (đã sort sẵn).

**Điểm kỹ thuật phát hiện khi đọc code:**

`PublishResultAction` hiện nhận `draw: DrawSelectorItem` — type thuộc DTO trang `operations`, **Hub
không có** (Hub dùng `DerivedRow` từ `hub-snapshot`). Dialog thực tế chỉ dùng 3 field: `drawId`,
`scheduledDrawAt`, `drawTime`.

→ Tách type hẹp
`PublishResultDraw = Pick<DrawSelectorItem, "drawId" | "scheduledDrawAt" | "drawTime">`
để Hub tái dùng dialog mà không phải fetch cả `DrawSelectorItem`. Đây là điều kiện tiên quyết nếu
sau này muốn mở dialog **ngay trong Hub** thay vì mở tab mới.

**Props thêm vào (tương thích ngược 100%):**

```ts
interface PublishResultActionProps {
  // … props hiện có, KHÔNG đổi
  /** Hàng đợi kỳ chưa có KQ (gồm cả kỳ hiện tại ở index 0). Bỏ trống = hành vi cũ. */
  queue?: PublishResultDraw[];
  /** Gọi khi "Xác nhận & Kỳ tiếp" thành công. Bỏ trống = nút không hiện. */
  onNext?: (nextDraw: PublishResultDraw) => void;
}
```

Không truyền `queue` → dialog chạy **y như hiện tại**. 5 game còn lại không sửa 1 dòng.

**Phạm vi plan:** tách thành **P1-06** riêng, làm **sau** P1-05 — chỉ sửa 2 file
(`keno/…/publish-result-action.tsx`, `bingo18/…/publish-result-action.tsx`). Code đường tiền, cần
review riêng, không trộn vào PR redesign UI Hub.


Trong P1-05, Hub chỉ cần: nút **"Nhập kết quả ↗"** ở expand panel của kỳ `SalesClosed` → mở tab
mới sang `operations?draw=<drawId>` (đúng pattern đã có). Không nhập kết quả tại Hub.

---

### B4. Layout trang sau khi gộp rail

Vì Focus Rail đã lên full-width (B3), cột phải chỉ còn bảng "Đang bán" → **§A3 tự hết**, không
cần hack `minmax` phức tạp. Vẫn giữ `min-w-0` để phòng nội dung dài:

```tsx
<div className="@container/main flex flex-col gap-6">
  <HubPageHeader />
  <HubKpiStrip />        {/* 6 KPI — B2 */}
  <HubTimelineRail />    {/* full width, thay CẢ Day Flow lẫn Focus Rail — B3 */}
  <HubAlertBanner />

  {/* Tỉ lệ 3:2 — 5A có 11 cột, 5B chỉ 5 cột */}
  <div className="grid grid-cols-1 gap-6 @4xl/main:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
    <div className="min-w-0"><HubQueueTable /></div>
    <div className="min-w-0"><HubSellingSection /></div>
  </div>

  <HubBulkActionBar />
</div>
```

**Cách verify:** sau khi sửa, đo lại `gridTemplateColumns` — phải ra ≈ `1043px 696px` (3:2),
không phải `593px 1146px` như hiện tại.


---

### B5. Bảng 5A — Hàng đợi vận hành

**Tab bar có icon (bạn yêu cầu):**

| Tab | Icon | Label |
|---|---|---|
| Cần xử lý | `AlertTriangle` | Cần xử lý |
| Chờ đóng bán | `Lock` | Chờ đóng bán |
| Chưa có KQ | `Radio` | Chưa có KQ |
| Chờ kết sổ | `Calculator` | Chờ kết sổ |
| Tất cả | `List` | Tất cả |

Icon `size-3.5`, badge số đếm giữ nguyên. Tab active giữ `border-b-2 border-primary`.

**Cột — bố cục mới:**

| Cột | Nội dung | Thay đổi |
|---|---|---|
| ☐ | checkbox | thêm `pl-5` |
| Kỳ | `<DrawIdLabel mode="compact">` → `#015 · 07/09` + tooltip | **đủ drawId** (B0.3) |
| Giờ quay | `21:04` | giữ |
| Chặng | ● + label | label đồng bộ B0.4 |
| Tuổi / Còn lại | `2g14p` qua `formatDurationCompact` | **date util chung** (B0.2) |
| Doanh thu | `12,5tr` | **bỏ `₫`** (B0.1) |
| Vé | `340` | **bỏ "v"** (bạn yêu cầu) |
| Bộ | `1.240` | **tách cột riêng**, bỏ "b" |
| Alert | badge số | xem B5.1 |
| Exposure | `45,2tr` | **cột MỚI** (review §A7) |

**Không có cột action inline** — theo quyết định của bạn (câu 5): action chỉ nằm trong expand
panel cho gọn. Bảng giữ 10 cột, mật độ thoáng, và tránh mis-click ở màn monitor. Muốn thao tác
→ click dòng mở panel (1 click, 0 query) hoặc chọn nhiều dòng → bulk bar.

Thêm: `sticky top-0 z-10 bg-card` cho `TableHeader` (§1.7), `pl-5` cột đầu / `pr-5` cột cuối
(§1.7a).


**B5.1 — Alert hiển thị chính xác thế nào (bạn hỏi)**

Hiện tại chỉ hiện 1 con số trần (`0 mở`) — không cho biết alert *gì*. Đề xuất:

- **Không có alert** → `—` (`text-muted-foreground`), không phải `0`.
- **Có alert** → badge `Ban`/`AlertTriangle` + số, tô theo mức cao nhất:
  - `critical > 0` → `variant="destructive"`, nội dung `⚠ 2`
  - chỉ `open` → `variant="outline"` amber, nội dung `2`
- **Hover badge** → tooltip liệt kê **loại** alert (dùng `KenoOpsAlertType` labels, đã có
  `as const` trong entity — theo `code-quality-standards.mdc` §5.3):
  `Cược lớn (2) · Lệch side bet (1)`
- **Click badge** → mở expand panel, scroll tới khối Alert (không mở dialog riêng).

**B5.2 — Bỏ nút "Huỷ" khỏi thao tác nhanh (bạn yêu cầu)**

Đồng ý hoàn toàn. VOID là hành động **không thể hoàn tác, ảnh hưởng tiền thật** → không được
đặt cạnh nút thường xuyên dùng.

- **Bỏ** `Huỷ` khỏi: bulk action bar, dòng bảng 5A.
- **Giữ** VOID **chỉ** ở expand panel, trong khối `Thao tác nguy hiểm` tách riêng dưới cùng,
  ngăn bởi `border-t` + nền `bg-destructive/5`, nút `variant="outline"` màu destructive
  (không phải nút đỏ đầy — nút đỏ đầy = mời click).
- Bulk VOID: **bỏ hẳn** khỏi UI Hub. Muốn void nhiều kỳ → vào từng kỳ. API `bulk-void` giữ
  nguyên (đã build ở P0-04) nhưng không expose ở Hub.

**Dialog xác nhận VOID (chốt: dùng CẢ HAI lớp chặn):**

```
┌─ ⚠ Huỷ kỳ 2026-09-07.015 ─────────────────────────────────────┐
│                                                                │
│ Kỳ này có 340 vé · 12,5tr đã bán. Huỷ kỳ sẽ hoàn tiền toàn bộ │
│ và không thể hoàn tác.                                         │
│                                                                │
│ Nhập mã kỳ để xác nhận:                                        │
│ ┌────────────────────────────────────────┐                     │
│ │ 2026-09-07.015                         │  ← phải khớp CHÍNH XÁC│
│ └────────────────────────────────────────┘                     │
│                                                                │
│ ☑ Tôi hiểu hành động này không thể hoàn tác.                   │
│                                                                │
│                            [Huỷ bỏ]  [Huỷ kỳ này]              │
└────────────────────────────────────────────────────────────────┘
```

Nút `[Huỷ kỳ này]` chỉ `enabled` khi **cả hai** điều kiện đúng: input khớp chính xác `drawId`
(so sánh `===`, không trim-insensitive) **và** checkbox đã tick. Ghi rõ số vé + số tiền sẽ bị
ảnh hưởng trong câu mô tả — người vận hành phải thấy hậu quả bằng con số trước khi gõ.


---

### B6. Expand panel — sửa layout + đồng bộ action

**B6.1 — Sửa bug đè chữ (§A1)**

```tsx
// SAI
<TableRow><TableCell colSpan={11}>{/* nowrap kế thừa */}</TableCell></TableRow>

// ĐÚNG
<TableRow className="hover:bg-transparent">
  <td colSpan={11} className="border-b bg-muted/30 p-0">
    <div className="grid gap-6 whitespace-normal p-5 @2xl:grid-cols-[1.5fr_1fr_1fr]">
      {/* mọi text: min-w-0 break-words */}
    </div>
  </td>
</TableRow>
```

`colSpan` phải khớp đúng tổng số `<TableHead>` sau khi thêm 2 cột mới (11) — nếu lệch, browser
tự thu cell gây lệch layout.

**B6.2 — Bố cục lại nội dung (bạn nói "dữ liệu lung tung")**

```
┌─ 2026-09-07.015  ·  Chờ đóng bán  ·  ⚠ treo 3ng5g ────────────── [Chi tiết kỳ ↗] [✕] ┐
│                                                                                       │
│ ┌─ Vì sao ở chặng này ────────────┐ ┌─ Dòng thời gian ─┐ ┌─ Tiền & rủi ro ──────────┐ │
│ │ Đã quá giờ đóng bán 3ng5g,      │ │ ● Mở bán  20:59  │ │ Doanh thu      12,5tr    │ │
│ │ vượt ngưỡng 5 phút. Nghi bỏ     │ │ ● Đóng bán 21:03 │ │ Vé / Bộ        340/1.240 │ │
│ │ sót batch tự động.              │ │ ○ Giờ quay 21:04 │ │ Cược lớn       2         │ │
│ │                                  │ │ ○ Công bố  —     │ │ Exposure       45,2tr    │ │
│ │ → Việc cần làm: Đóng bán ngay.  │ │ ○ Kết sổ   —     │ │ Alert  ⚠ Cược lớn (2)   │ │
│ └──────────────────────────────────┘ └──────────────────┘ └──────────────────────────┘ │
│                                                                                       │
│ [🔒 Đóng bán]  [📡 Công bố kết quả]  [▶ Kết sổ]              (nút không khả dụng: mờ) │
│ ─────────────────────────────────────────────────────────────────────────────────────  │
│ ⚠ Thao tác nguy hiểm:  [Huỷ kỳ này]   ← chỉ ở đây, tách riêng                          │
└───────────────────────────────────────────────────────────────────────────────────────┘
```

Thay đổi so với hiện tại:

1. **Header panel** có `drawId` đầy đủ + chặng + cảnh báo treo → biết ngay đang xem kỳ nào.
2. 3 khối rõ nghĩa: **Vì sao** (chẩn đoán) / **Dòng thời gian** (mốc, dùng dot ● đã qua ○ chưa)
   / **Tiền & rủi ro**. Hiện tại 3 cột không có tiêu đề đủ rõ và tràn vào nhau.
3. Thêm dòng **"→ Việc cần làm:"** — nói thẳng phải làm gì, không để người vận hành tự suy.
4. Reason string dùng `formatDurationCompact` (hết `273299s`).
5. **Action đồng bộ 100% với `draw-next-action.ts`** (nguồn chân lý):

| Trạng thái | Nhãn | Icon | Màu |
|---|---|---|---|
| `Scheduled` | Mở bán | `Unlock` | default |
| `SalesOpen` | Đóng bán | `Lock` | `bg-amber-600` |
| `SalesClosed` | Công bố kết quả | `Radio` | `bg-violet-600` |
| `Published` | Kết sổ | `ChevronRight` | default |
| `Published` + resettle | Kết sổ lại | `RotateCcw` | `bg-orange-600` |

→ Trả lời câu hỏi của bạn về **"Đóng" và "Close" nên 2 icon khác nhau"**: `Unlock` (mở bán) vs
`Lock` (đóng bán) — hai icon đối nghịch trực quan, đã là chuẩn ở trang `operations`. Nút "Đóng
panel" đổi thành icon `X` ở góc phải header panel (không phải nút text "Đóng" cạnh nút "Đóng
bán" — đây chính là chỗ gây nhầm trong ảnh của bạn: 2 nút cạnh nhau, một đóng panel một đóng bán).

6. Nút "Chọn kỳ này" → bỏ, thay bằng checkbox ở dòng gốc (đã có, trùng chức năng).

---

### B7. Card trong Timeline Rail — sửa "gạch xanh" + "viền đỏ hở" (đã tìm ra nguyên nhân)

Rail đã chuyển lên vị trí Day Flow (B3). Đây là chi tiết sửa từng bug bạn chỉ ra.

**B7.1 — "Gạch xanh" là gì (tôi đã đọc code, không phải gạch trang trí)**

```tsx
// focus-rail.tsx:216 — vạch dọc RIÊNG, bọc NGOÀI card
<div className={cn(isSaleBoundary && "border-primary border-l-4")}>
  <RailCard isBoundary={col.drawId === boundaryDrawId} ... />
</div>
```

Nó là **`border-l-4` màu primary bọc ngoài card**, đánh dấu "biên chốt cược". Nhưng cùng lúc
`RailCard` **cũng** có `isBoundary && "border-2 border-primary"` → **2 dấu hiệu cho cùng 1 việc**,
vẽ ở 2 layer khác nhau. Đây chính là "gạch xanh" bạn thấy dư.

**Fix:** xoá hẳn wrapper `border-l-4`, chỉ giữ **một** dấu hiệu duy nhất trên card.

**B7.2 — "Viền đỏ không đủ bo xung quanh" — nguyên nhân chính xác**

```tsx
const HEALTH_RING_CLASS = {
  [StageHealth.Stuck]: "ring-1 ring-destructive",   // ← ring, KHÔNG có ring-offset
};
className={cn("... rounded-lg border bg-card ...", HEALTH_RING_CLASS[col.health], ...)}
```

`ring-1` vẽ **sát ngoài** `border` sẵn có. Hai đường 1px sát nhau, cùng bán kính `rounded-lg`
→ ở góc bo, ring bị `border` che một phần → nhìn như **viền hở góc**. Đúng như bạn thấy.

**Fix — chuẩn hoá 1 quy tắc cho mọi trạng thái card:**

```tsx
className={cn(
  "flex min-w-28 shrink-0 flex-col gap-1 rounded-lg border bg-card px-2.5 py-2 text-left",
  "transition-colors hover:bg-muted/50",
  // Sức khoẻ chặng → ĐỔI MÀU BORDER + nền nhạt (KHÔNG dùng ring → không hở góc)
  col.health === StageHealth.Stuck && "border-destructive/50 bg-destructive/5",
  col.health === StageHealth.Warn  && "border-amber-500/50 bg-amber-500/5",
  // Kỳ hiện tại (biên chốt cược) → ring bao trọn + offset (dấu hiệu DUY NHẤT)
  isBoundary && "ring-2 ring-primary ring-offset-2 ring-offset-background",
)}
```

Nguyên tắc phân tầng — mỗi kênh thị giác 1 nghĩa, không chồng:

| Kênh | Mã hoá | Vì sao |
|---|---|---|
| **Màu border + nền nhạt** | sức khoẻ chặng (ok/warn/stuck) | Border đổi màu không bao giờ hở góc |
| **`ring-2` + `ring-offset-2`** | kỳ hiện tại (biên chốt cược) | `ring-offset` tạo khoảng trắng → ring không bị border che, bo tròn liền mạch |
| Bar + số | doanh thu | giữ nguyên |

`ring-offset-2` là chi tiết quyết định: nó đẩy ring ra ngoài 2px nên **không đè lên border** →
bo góc liền mạch 4 phía. Đây là cách sửa gốc, không phải tăng độ dày ring.

**B7.3 — Nội dung card (câu 3 của bạn)**

- Dòng trạng thái hiện dùng `gateLabel ?? label` → chỉ ra `"Đang bán"` / `"Đã hết giờ cược"`
  (gate thô, quá chung). **Đổi thành `OPS_STAGE_LABEL[col.stage]`** để ra chặng chi tiết
  (`Chờ đóng bán`, `Chờ kết quả`, `Đang kết sổ`) — cùng nhãn với cột "Trạng thái" bảng 5A.
- **Thêm dòng `340 vé`** (tổng entries) — bạn yêu cầu. `col.entries` đã có trong `DayFlowColumn`.
- Tiền: `formatMoneyCompact` (`12,5tr`, bỏ `₫`).
- Mã kỳ: `<DrawIdLabel mode="compact">` + **tooltip `drawId` đầy đủ**.
- `text-[10px]` → `text-xs` (§1.2 — `text-[10px]` chỉ dành cho heatmap/stepper).
- `min-w-24` → `min-w-28` (chứa thêm 1 dòng + mã kỳ dài hơn).
- Thêm `aria-current="true"` cho card biên.


---

### B8. Zone 5B — "Đang bán" (sửa logic + văn phong)

**B8.1 — Xoá khái niệm "kỳ chết" (§A6)**

Bỏ hoàn toàn chuỗi `"Không có cược, có thể kỳ chết"`. Kỳ mở bán chưa có cược là **trạng thái
bình thường**, không phải bất thường → không đưa vào danh sách outlier.

Định nghĩa lại "đáng chú ý" trong `selling-outliers.ts`:

| Điều kiện MỚI | Nhãn hiển thị | Tone |
|---|---|---|
| `alertsCritical > 0` | `2 cảnh báo nghiêm trọng` | destructive |
| `revenue ≥ p95` toàn ngày | `Doanh thu cao bất thường` | amber |
| `largeBetCount > 0` | `3 cược lớn` | amber |
| `exposureRaw > ngưỡng cap` | `Rủi ro chi trả cao` | destructive |
| ~~`revenue === 0 && age > 30p`~~ | **XOÁ** | — |

Nếu **thật sự** cần theo dõi kỳ không có cược → **KHÔNG thêm dòng thống kê** (chốt theo phản
hồi của bạn). Timeline Rail đã thể hiện việc này rõ hơn: card kỳ chưa có cược có bar doanh thu
rỗng + `0 vé`, xem một lượt là thấy cả dải. Không cần lặp lại bằng chữ ở 5B.


**B8.2 — Bảng đang bán**

- Mã kỳ: `<DrawIdLabel mode="compact">` + tooltip (bạn yêu cầu).
- Bỏ cột "Còn lại" khi luôn `—` → thay bằng **"Đóng bán sau"** (`formatDurationCompact` tới
  `closeAt`) — thông tin thực sự hữu ích cho kỳ đang bán.
- `Vé/Bộ` → tách 2 cột `Vé` / `Bộ`, bỏ hậu tố chữ.
- Tiền: `formatMoneyCompact` (bỏ `₫`).
---

## C. Rà soát văn phong tiếng Việt (bạn yêu cầu kiểm tra kỹ)

Tôi grep toàn bộ chuỗi tiếng Việt trong `operations-hub/`. Đây là các chỗ cần sửa:

| Hiện tại | Vấn đề | Đề xuất |
|---|---|---|
| `có thể kỳ chết` | Không tồn tại trong văn công ty vận hành. Suy đoán tiêu cực. | Xoá hẳn (B8.1) |
| `Kỳ trắng` | Tiếng lóng, người mới không hiểu | `Chưa mở bán` |
| `kỳ đang treo` | Tiếng lóng kỹ thuật | `kỳ quá thời hạn xử lý` |
| `Không cứu được, chỉ VOID` | Cảm tính + trộn tiếng Anh | `Không thể mở bán lại. Cần huỷ kỳ.` |
| `còn cứu được, đang mất doanh thu` | Cảm tính | `Vẫn có thể mở bán. Đang gián đoạn doanh thu.` |
| `có thể đã bỏ sót batch` | Trộn Anh–Việt, suy đoán | `Nghi ngờ tiến trình tự động chưa chạy.` |
| `Chờ chốt sổ` | Sai thuật ngữ (chốt sổ = settle, không phải close sales) | `Chờ đóng bán` |
| `Chốt sổ bán` | Sai + không khớp `draw-next-action.ts` | `Đóng bán` |
| `Tự bám biên chốt cược` | Không ai hiểu | `Trục thời gian theo giờ` |
| `Chặng` (tên cột) | Ổn, nhưng mơ hồ | `Trạng thái` |
| `Tuổi/còn lại` | Ghép 2 nghĩa vào 1 nhãn | `Thời gian` (nội dung tự phân biệt bằng tiền tố "còn") |
| `Doanh thu bất thường` | Không nói cao hay thấp | `Doanh thu cao bất thường` |
| `1 kỳ đã chọn` | Ổn | giữ |
| `Vượt giới hạn N kỳ — danh sách CHƯA đầy đủ` | Viết hoa nhấn mạnh hơi thô | `Danh sách chưa đầy đủ (giới hạn N kỳ). Liên hệ kỹ thuật.` |

**Nguyên tắc văn phong áp dụng chung:** mô tả **sự việc + việc cần làm**, không suy đoán, không
tiếng lóng, không trộn tiếng Anh khi đã có từ Việt tương đương (`batch` → `tiến trình`,
`VOID` → `huỷ kỳ`, `settle` → `kết sổ`).

---

## D. Bảng tổng hợp thay đổi theo file

| File | Loại | Nội dung |
|---|---|---|
| `packages/shared/src/utils/number.ts` | thêm | `formatMoneyCompact` |
| `packages/shared/src/utils/date.ts` | thêm | `formatDurationCompact` |
| `packages/game-core/src/labels/` | thêm | `OPS_STAGE_LABELS` (dùng chung Keno+Bingo18) |
| `components/games/shared/draw-id-label.tsx` | **mới** | `<DrawIdLabel>` + tooltip |
| `hub-page-header.tsx` | sửa | `GAME_COLORS`, bỏ ngày tài chính, refresh icon-only, `+ Tạo kỳ quay` |
| `hub-overview-section.tsx` | **viết lại** → đổi tên `hub-kpi-strip.tsx` | 6 KPI §1.2a, `h-[72px]`, clickable → tab |
| **`hub-day-flow.tsx`** | **XOÁ** | gộp vào rail (B3) |
| **`focus-rail.tsx`** | **viết lại** → đổi tên `hub-timeline-rail.tsx` | full-width, drag-scroll, nút "Về kỳ hiện tại", +dòng vé, fix ring/border |
| `hub-alert-banner.tsx` | sửa | văn phong (mục C) |
| `hub-queue-table.tsx` | sửa | tab icon, sticky header, `pl-5`/`pr-5`, +cột Exposure |
| `queue-row.tsx` | sửa | `DrawIdLabel`, tách Vé/Bộ, alert badge + tooltip |
| `queue-types.ts` | sửa | label → `game-core`, thêm icon map cho tab |
| `hub-expand-panel.tsx` | **viết lại** | fix `nowrap`, 3 khối có tiêu đề, action theo `draw-next-action`, VOID tách khối riêng, nút "Nhập kết quả ↗" |
| `bulk-confirm-dialog.tsx` | sửa | dialog VOID: gõ `drawId` + checkbox (B5.2) |
| `hub-selling-section.tsx` | sửa | xoá "kỳ chết", tooltip mã kỳ, tách cột, "Đóng bán sau" |
| `selling-outliers.ts` | **viết lại** | định nghĩa outlier mới (p95, cược lớn, exposure) |
| `derive-draw-state.ts` | sửa | reason dùng `formatDurationCompact`, văn phong |
| `hub-bulk-action-bar.tsx` | sửa | **bỏ nút Huỷ** |
| `partition-by-action.ts` | sửa | bỏ `void` khỏi bulk eligibility |
| `use-hub-keyboard.ts` | sửa | thêm `Home` (về kỳ hiện tại), `←`/`→` (trượt rail) |
| `hub-types.ts` | sửa | `DayFlowColumn` cần chắc chắn có `entries` cho rail |
| `page.tsx` | sửa | bỏ `HubDayFlow`, rail lên full-width, grid `3fr/2fr` |

### D2. File thuộc P1-06 (plan riêng, làm sau) — chỉ 2 game

| File | Loại | Nội dung |
|---|---|---|
| `keno/operations/…/draw-actions/publish-result-action.tsx` | sửa | thêm props `queue`/`onNext`, 3 nút phân tầng, reset state khi sang kỳ |
| `bingo18/operations/…/draw-actions/publish-result-action.tsx` | sửa | y như trên (3 ô thay vì 20) |
| `keno`/`bingo18` `…/draw-management/index.tsx` | sửa | build `queue` từ `draws` (`status === SalesClosed`), truyền vào dialog |
| `games/_lib/operations/publish-result-draw.ts` | **mới** | type hẹp `PublishResultDraw` (3 field) |

**5 game còn lại (mega645, lotto535, power655, max3d, max3dpro): KHÔNG sửa file nào.**



---

## E. Lộ trình đề xuất (chia nhỏ để review được từng bước)

| Bước | Nội dung | Rủi ro |
|---|---|---|
| **1** | Nền tảng: `formatMoneyCompact`, `formatDurationCompact`, `OPS_STAGE_LABELS`, `<DrawIdLabel>` | Thấp — thêm mới, chưa đổi UI |
| **2** | 🔴 Fix 2 bug chặn: `nowrap` panel (§A1), duration thô (§A2) | Thấp — sửa CSS/format |
| **3** | Header + 6 KPI (§1.2a, `h-[72px]`) | Trung — viết lại 1 component |
| **4** | **`HubTimelineRail`**: xoá Day Flow, rail lên full-width, drag-scroll, nút "Về kỳ hiện tại", fix ring/border, thêm dòng vé | Trung-cao — component chủ đạo mới |
| **5** | `page.tsx` layout mới (grid 3:2) + verify `gridTemplateColumns` bằng CDP | Thấp |
| **6** | Bảng 5A: tab icon, sticky, cột Exposure, alert badge, bỏ Huỷ | Trung |
| **7** | Expand panel viết lại + action theo `draw-next-action` + dialog VOID 2 lớp | Trung |
| **8** | 5B: xoá "kỳ chết", outlier mới (p95/cược lớn/exposure) | Thấp |
| **9** | Rà soát văn phong (mục C) + `pnpm lint` + `check-types` + đo lại UI bằng CDP | Thấp |
| **10** | **P1-04**: port Bingo18 — chỉ đổi `gameKey`/query/repo | Thấp nếu 1-9 xong |
| **11** | **P1-06** (plan riêng): luồng "Xác nhận & Kỳ tiếp" cho nhập kết quả (B3b) — chỉ Keno + Bingo18 | Trung — 2 file độc lập, KHÔNG dùng chung 7 game (đã verify) |

Bước 1-2 nên làm ngay bất kể quyết định thế nào về phần còn lại — đó là bug thật, đang hiển
thị sai trên môi trường có dữ liệu thật.

---

## F. Quyết định đã chốt (phản hồi 07/09 23:00)

| # | Câu hỏi | Quyết định |
|---|---|---|
| 1 | Day Flow vs Focus Rail | ✅ **Gộp thành 1** — xoá Day Flow, rail lên vị trí Day Flow (full-width). Bỏ ý tưởng 24 cột giờ (vô nghĩa vì kỳ mở đều 6–8 phút). Thêm **kéo chuột** + **nút về kỳ hiện tại** |
| 1b | Nhập kết quả trong Hub | ✅ **KHÔNG bulk publish** — Keno 20 số/kỳ, có autofill Vietlott + diff + cảnh báo lệch mã kỳ, bulk sẽ phá hết lớp kiểm tra. Thay bằng luồng **sequential "Xác nhận & Kỳ tiếp"**, tách plan P1-06 |
| 1c | Phạm vi + phân tầng nút của luồng sequential (phản hồi 08/09) | ✅ **Chỉ Keno + Bingo18** (2 game nhập nhiều kỳ). 3 nút: `Huỷ bỏ` (ghost) · `Xác nhận` (**outline**, ít chú ý) · **`Xác nhận & Kỳ tiếp ▶`** (**default = main**). Ở kỳ cuối: nút "Kỳ tiếp" ẩn, `Xác nhận` lên `default`. **Đã sửa nhận định sai trước đó**: dialog KHÔNG dùng chung 7 game — mỗi game 1 file riêng (537–679 dòng), sửa 2 game không ảnh hưởng 5 game kia |
| 2 | KPI có tiền tổng? | ✅ **Có** — thêm card thứ 6 "Tổng ngày". Fix chiều cao lệch bằng `h-[72px]` + đúng 1 dòng `sub`. `Exposure` chuyển ra cột bảng 5A (nó là thứ tạo dòng thứ 4 gây lệch) |
| 3 | Dòng "118/121 kỳ chưa có cược" | ✅ **Bỏ** — rail đã thể hiện. Card rail **thêm**: tiền cược, tổng vé, trạng thái chi tiết |
| 4 | Dialog VOID | ✅ **Cả hai** — gõ đúng `drawId` **và** tick "Tôi hiểu…". Nút enabled chỉ khi cả 2 đúng |
| 5 | Action inline trên bảng | ✅ **Không** — chỉ trong expand panel cho gọn. Bảng giữ 10 cột |
| 6 | Đổi nhãn cột | ✅ `Chặng` → `Trạng thái`, `Tuổi/còn lại` → `Thời gian` |

**Còn 1 điểm cần bạn xác nhận trước khi tôi code:**

Bước 4 (`HubTimelineRail`) là phần rủi ro nhất — component chủ đạo viết mới, có drag-scroll.
Bạn muốn tôi làm **tuần tự 1→9** (an toàn, review được từng bước), hay **làm bước 1-2 trước**
(fix bug chặn, deploy được ngay) rồi mới bàn tiếp phần redesign?




