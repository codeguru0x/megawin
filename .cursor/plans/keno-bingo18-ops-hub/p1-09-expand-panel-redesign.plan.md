# P1-09 — Expand Panel Redesign + KPI Hoa Hồng

> **Nguồn:** review UI thật của bạn (08/09/2026, 21:30) — ảnh chụp panel expand kỳ
> `2026-09-07.004` + 1 góp ý format ngày + yêu cầu thêm KPI "Ước tính hoa hồng".
> Chẩn đoán dưới đây dựa trên **đọc code thật** (`hub-expand-panel.tsx`, `hub-kpi-strip.tsx`,
> `hub-snapshot.dto.ts`, `get-ops-hub-snapshot.ts`) + đo trên ảnh chụp — không đoán.
>
> Liên quan: [`p1-07`](./p1-07-ui-polish-round2.plan.md) (done) ·
> [`p1-08`](./p1-08-tab-redesign-polish-round3.plan.md) (done) · [`00-overview.md`](./00-overview.md).
> **✅ ĐÃ CODE + verify CDP (08/09)** — xem §9. Bạn chốt §8 tại §8 (bảng "Bạn đã chốt").

---

## 0. Feedback gốc

1. Chi tiết 1 kỳ khi expand cần "đúng điểm nhấn, thông tin hữu ích, đọc dễ" — cho ý kiến layout/style.
2. `20:59:13 07-09` → `20:59:13 07/09` mới đúng.
3. Thêm KPI **Ước tính hoa hồng**.

---

## 1. Chẩn đoán — 7 vấn đề đọc được từ ảnh + code

### 1.1 Format ngày dùng gạch ngang — SAI so với chính codebase (điểm 2, bug thật)

`fmtTime` (`hub-expand-panel.tsx:79-85`) gọi `toLocaleString("vi-VN", { day, month, hour, minute, second })`.
Với locale `vi-VN`, Intl trả **`07-09`** (dash) khi chỉ có `day`+`month` mà không có `year` — đúng
như ảnh. Trong khi `DrawIdLabel` (`draw-id-label.tsx:71`) tự cắt string ra **`06/09`** (slash), và
tooltip cũng `DD/MM/YYYY`. → **Cùng 1 trang, 2 format ngày khác nhau** cho cùng khái niệm ngày quay.
Bạn nhận xét đúng: slash là format đang dùng ở mọi nơi khác, dash là ngoại lệ do Intl sinh ra ngoài ý muốn.

Grep toàn `operations-hub/`: **đúng 1 chỗ** dùng pattern này (`hub-expand-panel.tsx`) — sửa 1 file là hết.

### 1.2 Ba khối ngang bằng nhau → không có điểm nhấn (điểm 1, vấn đề chính)

Code hiện tại: `grid @3xl/panel:grid-cols-3 @lg/panel:grid-cols-2 grid-cols-1` — "Vì sao" /
"Dòng thời gian" / "Tiền & rủi ro" mỗi khối **1/3 chiều rộng, cùng cỡ chữ `text-sm`, cùng kiểu
tiêu đề uppercase `text-xs`**. Hệ quả đo được trên ảnh: mắt không biết đọc đâu trước.

Nhưng 3 khối này KHÔNG cùng giá trị vận hành:

| Khối | Vai trò thật | Tần suất staff cần |
|---|---|---|
| Vì sao + Việc cần làm | **Chẩn đoán + quyết định** — lý do mở panel | 100% |
| Dòng thời gian | Kiểm chứng "treo bao lâu rồi" | ~50% |
| Tiền & rủi ro | Cân nhắc mức độ ảnh hưởng trước khi bấm | ~50%, và **0%** khi kỳ chưa có vé |

→ Thứ quan trọng nhất đang chiếm đúng 1/3 không gian và không có bất kỳ tín hiệu thị giác nào
(không màu, không viền, không cỡ chữ khác) để nói "đọc tôi trước".

### 1.3 Nút hành động cách xa dòng "Việc cần làm" (điểm 1)

`→ Việc cần làm: Đóng bán.` nằm ở **cột 1, hàng 1**; nút `Đóng bán` nằm ở **footer, dưới cả 3 khối**,
cách ~120px theo trục dọc và lệch hẳn sang trái dưới. Hai thứ này là **cùng 1 thông điệp** (chẩn đoán
→ hành động) nhưng bị 3 khối dữ liệu chen giữa. Mắt phải đi: đọc trái-trên → quét ngang 2 khối số →
xuống dưới tìm nút. Trên ảnh của bạn nút nằm dưới vùng dữ liệu toàn số `0`, tức là staff phải đi
qua vùng vô nghĩa nhất để tới thứ cần bấm nhất.

### 1.4 Với kỳ chưa có vé, khối "Tiền & rủi ro" là 5 dòng số `0` (điểm 1)

Ảnh của bạn: `Doanh thu 0` · `Vé / Bộ 0 / 0` · `Cược lớn 0` · `Rủi ro chi trả 0` · `Cảnh báo Không có`.
Đây là kỳ `Chờ đóng bán` treo 1 ngày và **chưa ai cược** — 5 dòng chiếm 1/3 panel để nói đúng 1 điều:
"không có tiền nào ở đây". Trong khi khối này lại **rất quan trọng** ở kỳ có doanh thu thật.
→ Cần khối này **tự co lại khi rỗng** và **nổi lên khi có số**, thay vì luôn chiếm cùng diện tích với
cùng độ tương phản.

### 1.5 Dòng thời gian thiếu "khoảng cách tương đối" — staff phải tự trừ trong đầu

Ảnh: `Đóng bán 21:27:00 07-09`. Panel đang mở lúc 21:30 **ngày 08/09** → mốc đó là **~1 ngày trước**.
Muốn biết điều đó, staff phải tự so ngày trên mốc với ngày hôm nay. Cột `Thời gian` của bảng ĐÃ hiện
`1ng` (qua `RelativeDuration`) nhưng panel — nơi lẽ ra chi tiết hơn — lại **chỉ có mốc tuyệt đối**.
Nghịch lý: mở panel ra để xem kỹ hơn thì mất thông tin "cách đây bao lâu".

### 1.6 Giây (`:13`, `:00`) chiếm chỗ nhưng không dùng để quyết định gì

`20:59:13` — độ chính xác giây chỉ hữu ích khi điều tra sự cố (audit), không phải khi quyết định
"có đóng bán kỳ này không". 4 mốc × 3 ký tự giây làm dòng dài thêm, ép label xuống 2 dòng ở panel hẹp
(chính lý do `FieldRow` phải bỏ `truncate`, xem JSDoc dòng 120-124).

### 1.7 Panel không mang màu sức khoẻ của dòng — mất liên tục thị giác

Dòng `#004` trong bảng có nền **đỏ nhạt** (`ACCENT_ROW_CLASS.destructive`, do `health = stuck`).
Panel mở ra thì nền chuyển **xám** (`bg-muted/30`) — tín hiệu "kỳ này đang đỏ" **biến mất** đúng lúc
staff đọc chi tiết nhất. Cảm giác trên ảnh: 4 dòng đỏ phía trên, 1 khối xám giữa, rồi lại dòng đỏ —
panel trông như "một thứ khác" chèn vào, không phải phần mở rộng của dòng đỏ đó.

---

## 2. Layout đề xuất — 2 cột bất đối xứng, không phải 3 cột đều

**Nguyên tắc:** panel expand không phải "trang chi tiết mini" mà là **1 câu trả lời cho 1 câu hỏi**:
*"kỳ này sao, tôi phải làm gì, có gì đáng lo không?"*. Layout phải phản ánh đúng thứ tự đó.

```
┌───────────────────────────────────────────────────────────────────────────────────────┐
│ ┃ ⚠ Chờ đóng bán · treo 1 ngày 2 giờ                     [ Đóng bán ]  [ Huỷ kỳ ]     │  ← A. Dải quyết định
│ ┃ Đã hết giờ nhận cược 21:27 07/09 nhưng kỳ chưa được đóng bán.                       │     (accent trái theo health)
├───────────────────────────────────────────────────┬───────────────────────────────────┤
│ B. DÒNG THỜI GIAN                                 │ C. TIỀN & RỦI RO                  │
│                                                   │                                   │
│  ● Mở bán      20:59 07/09    (1 ngày trước)      │  Doanh thu        0 ₫             │
│  ● Đóng bán    21:27 07/09    (1 ngày trước)      │  Hoa hồng         0 ₫             │
│  ○ Giờ quay    21:28 07/09    (1 ngày trước)      │  Vé / Bộ          0 / 0           │
│  ○ Có KQ       — chưa có                          │  Rủi ro (chưa cap) 0 ₫            │
│  ○ Kết sổ      — chưa kết sổ                      │                                   │
│                                                   │  Chưa có cược nào trong kỳ này.   │
└───────────────────────────────────────────────────┴───────────────────────────────────┘
     ~58% chiều rộng                                      ~42%
```

### 2.1 Dải A — "Vì sao + Việc cần làm + Nút" gộp thành 1 dải ngang trên cùng

Giải quyết §1.2 + §1.3 + §1.7 cùng lúc:

- **Gộp** 3 thứ đang rời rạc (badge trạng thái · câu "vì sao" · nút hành động) vào **1 dải duy nhất**,
  full-width, nằm trên cùng. Nút nằm **cùng dòng** với chẩn đoán, canh phải → khoảng cách mắt từ
  "đọc lý do" đến "bấm nút" giảm từ ~120px xuống ~0 (cùng hàng).
- **Accent border-left 3px** theo `health` (`destructive`/`warning`/`ok`) + nền `bg-destructive/5`
  khi stuck → kế thừa màu của dòng, panel không còn "xám lạc quẻ" (§1.7).
- Dòng 1: badge chặng + `· treo 1 ngày 2 giờ` (dùng `RelativeDuration` đã có). Dòng 2: câu "vì sao"
  đầy đủ, cỡ `text-sm` (hiện `text-xs`) — đây là câu quan trọng nhất panel, không nên nhỏ nhất.
- Bỏ footer nút hiện tại → **xoá 1 hàng** khỏi panel, bù lại chiều cao cho dải A.

### 2.2 Cột B — Dòng thời gian dạng danh sách mốc có trạng thái

- Đổi từ "grid label/value" sang **danh sách 5 mốc cố định** (Mở bán → Đóng bán → Giờ quay → Có KQ →
  Kết sổ), mỗi mốc 1 dòng: `● icon` (đã qua = filled, chưa tới = outline) + label + giờ + `(cách đây …)`.
- **Luôn hiện đủ 5 mốc**, mốc chưa có ghi `— chưa có KQ` / `— chưa kết sổ` thay vì ẩn dòng. Lý do:
  panel cao **cố định** giữa các kỳ → không nhảy layout khi bấm expand kỳ khác (đúng nguyên tắc
  "đúng 1 dòng sub" đã chốt ở P1-05 cho KPI, áp cùng logic ở đây).
- Thêm `(1 ngày trước)` bằng `RelativeDuration` — giải quyết §1.5, dùng đúng component bảng đang dùng
  nên không phát sinh format mới.

### 2.3 Cột C — Tiền & rủi ro, tự thu gọn khi rỗng

- Khi `revenue === 0 && entries === 0`: **thu về 1 dòng** `Chưa có cược nào trong kỳ này.` + 4 dòng số
  làm mờ (`text-muted-foreground/60`) — giải quyết §1.4, không xoá dữ liệu nhưng hạ tương phản để
  mắt bỏ qua.
- Khi có số: `Doanh thu` + `Hoa hồng` in `font-semibold tabular-nums`, `Rủi ro (chưa cap)` tô
  `text-amber-600` khi > 0. Cột này chỉ "sáng" khi thực sự có tiền.
- **Thêm dòng `Hoa hồng`** (mới) — cùng nguồn dữ liệu với KPI ở §4, xem lý do ở đó.
- Gộp `Vé / Bộ` 1 dòng (đang 1 dòng, giữ), gộp `Cược lớn` + `Cảnh báo` vào **1 dòng badge** ở chân cột
  (chỉ hiện khi > 0) → giảm 2 dòng luôn-luôn-`0` thành 0 dòng khi bình thường.

---

## 3. Style — 6 quyết định cụ thể

| # | Hạng mục | Hiện tại | Đổi thành | Vì sao |
|---|---|---|---|---|
| 3.1 | Format ngày | `07-09` (Intl `vi-VN` sinh dash) | `07/09` | Khớp `DrawIdLabel` + tooltip toàn trang (§1.1) |
| 3.2 | Giây trong mốc | `20:59:13` | `20:59` | Giây không dùng để quyết định; tiết kiệm 3 ký tự × 5 mốc (§1.6) |
| 3.3 | Cỡ chữ "vì sao" | `text-xs` | `text-sm font-medium` | Câu quan trọng nhất đang nhỏ nhất |
| 3.4 | Nền panel | `bg-muted/30` phẳng | Dải A có accent theo health, thân `bg-muted/20` | Giữ liên tục thị giác với dòng đỏ (§1.7) |
| 3.5 | Tiêu đề khối | 3 tiêu đề uppercase `text-xs` | Còn 2 (dải A không cần tiêu đề) | Tiêu đề "Vì sao" là thừa khi nội dung đã tự nói |
| 3.6 | Số tiền | `text-sm` đều nhau | `tabular-nums`, `font-semibold` cho doanh thu/hoa hồng | Cột số phải canh thẳng khi mở nhiều kỳ liên tiếp |

**Giữ nguyên (không đổi):** `@container/panel` + breakpoint `@lg`/`@3xl` (responsive theo panel, không
theo viewport — đang đúng); `grid` thay vì flex-wrap; `tabular-nums` ở cột số.

### 3.1.1 Cách sửa format ngày (đừng dùng `toLocaleString` cho phần ngày)

`Intl` không cho chọn separator. Muốn chắc chắn `/` thì **tự ghép**, không phụ thuộc locale:

```ts
/** `20:59 07/09` — giờ:phút + ngày/tháng, separator `/` khớp `DrawIdLabel` toàn trang. */
function fmtTime(ms: number | null): string {
  if (ms === null) {
    return "—";
  }
  const d = new Date(ms);
  const p2 = (n: number) => String(n).padStart(2, "0");
  return `${p2(d.getHours())}:${p2(d.getMinutes())} ${p2(d.getDate())}/${p2(d.getMonth() + 1)}`;
}
```

Bỏ `second` (§3.2) và bỏ `toLocaleString` cho phần ngày. Nếu sau này cần giây để audit → đưa vào
`title` attribute (tooltip hover), không đưa vào text hiển thị.

---

## 4. KPI "Hoa hồng" — dùng SỐ THẬT, không phải ước tính (điểm 3)

### 4.1 Phát hiện quan trọng: dữ liệu đã có, chỉ chưa lấy

Bạn đề nghị *"Ước tính hoa hồng"* — nhưng đọc code cho thấy **không cần ước tính**:

`KenoBettingStatsDoc.totals.commission` đã tồn tại và được worker `$inc` mỗi tick
(`betting-stats-repo.ts:191`), nguồn từ `StatsAccumulator.addEntry` → `entry.commission`, mà
`entry.tenant.commissionAmount` được tính **lúc place-bet** bằng `commissionRate` **THẬT của từng
tenant** (`place-bet.ts:142-143`, có override per-tenant từ `TenantConfigDoc`).

→ Đây là hoa hồng **cộng dồn thật**, không phải `revenue × 20%`. Cách ước tính (`revenue ×
defaultCommissionRate`) sẽ **SAI** ngay khi có 1 tenant được set rate khác 20% — mà `TenantConfigDoc.
commissionRate` tồn tại chính là để làm việc đó.

**Chi phí lấy số thật: gần bằng 0.** `getRowsByDrawIds` đã đọc đúng doc đó rồi; chỉ thêm 1 dòng vào
`projection`. **Không thêm query, không thêm round-trip** → không vi phạm RÀNG BUỘC 1 ("đúng 4 query",
`get-ops-hub-snapshot.ts:55`).

### 4.2 Chuỗi thay đổi (4 file, mỗi file 1-3 dòng)

| # | File | Thay đổi |
|---|---|---|
| 1 | `betting-stats-repo.ts` | `projection`: thêm `[f("totals.commission")]: 1` |
| 2 | `types/hub.types.ts` | `HubStatsRow`: thêm `commission: number` (JSDoc: hoa hồng đại lý cộng dồn, VND, rate thật per-tenant) |
| 3 | `betting-stats-repo.ts` (map) | `commission: d.totals?.commission ?? 0` — **BẮT BUỘC `?? 0`**, cùng lý do đã ghi ở JSDoc dòng 133-138 (kỳ vừa `ensureDocs` chưa có `totals` → `undefined` → từng crash cả snapshot) |
| 4 | `dto/hub-snapshot.dto.ts` + `get-ops-hub-snapshot.ts` | `OpsHubDrawRow.commission` + `buildRow`: `commission: stats?.commission ?? 0` |

FE: `DerivedRow` thừa hưởng `commission` tự động (spread `OpsHubDrawRow`) → không sửa `derive-draw-state.ts`.

### 4.3 Card KPI thứ 5 — và vấn đề grid nó gây ra

`hub-kpi-strip.tsx` hiện `sm:grid-cols-4` với đúng 4 card (p1-08 §4 vừa thêm card "Đang bán").
Thêm card thứ 5 → **`grid-cols-4` sẽ đẩy card 5 xuống hàng 2, để trống 3 ô** — tức tăng chiều cao
KPI strip từ 72px lên ~156px, đi **ngược** quyết định p1-08 §5 (đang tối ưu giảm chiều cao trang).

Ba phương án, kèm đánh giá thật:

**Phương án A — 5 card, `lg:grid-cols-5`** (đề xuất)
```
sm:grid-cols-2 lg:grid-cols-5
```
- Ở `lg` (≥1024px, màn hình vận hành thực tế): 5 card 1 hàng, mỗi card ~20% chiều rộng.
- Rủi ro đo được: card hẹp nhất hiện tại là "Rủi ro chi trả (chưa cap)" — label 24 ký tự, ở 20%
  chiều rộng của 1440px ≈ 270px trừ icon 40px + gap ≈ 215px → label `text-xs` (~5.5px/ký tự) cần
  ~132px → **vẫn vừa**, không `truncate`. An toàn.
- Ở `sm`-`md`: 2 cột × 3 hàng (card 5 chiếm 1 ô, trống 1 ô) — chấp nhận được vì đây không phải
  breakpoint vận hành chính.

**Phương án B — nhét hoa hồng làm `sub` của card "Tổng tiền cược"**
- 0 thay đổi grid, 0 tăng chiều cao.
- **Nhưng** đánh mất dòng `sub` hiện tại (`"X tồn đọng"`) — dòng đó là **lý do tồn tại** của card theo
  quyết định p1-07 §10 ("`value` = tổng, `sub` = phần tồn đọng"). Đổi `sub` thành hoa hồng = phá quy tắc
  vừa chốt 1 ngày trước. **Không đề xuất.**

**Phương án C — thay card "Đang bán" bằng card "Hoa hồng"**
- Giữ 4 card. Nhưng "Đang bán" vừa được chốt thêm ở p1-08 §4 Q3 (chính bạn chọn Phương án B ở đó) →
  gỡ ra ngay là tự phủ định. **Không đề xuất** trừ khi bạn muốn đổi ý.

### 4.4 Nội dung card (theo Phương án A)

```
[icon %]  Hoa hồng đại lý
          96K
          19,2K tồn đọng
```

- **Icon:** `Percent` (lucide) · `iconBg="bg-amber-100 dark:bg-amber-900/50"` ·
  `iconColor="text-amber-600 dark:text-amber-400"` — amber chưa dùng ở 4 card kia
  (emerald/blue/rose/violet), không đụng màu `destructive` của cảnh báo.
- **`value`** = `formatMoneyCompact(stats.commission.total)` — tổng toàn bộ kỳ Hub theo dõi.
- **`sub`** = `pendingSub(stats.commission.pending, formatMoneyCompact, "")` → dùng **đúng helper
  đang có**, cùng ngữ nghĩa 3 card tài chính ("tồn đọng" = `gate !== Open`). Không viết logic mới.
- **Aggregation:** thêm `const commission = emptyBreakdown()` + 1 dòng `addToBreakdown` vào vòng lặp
  `useHubKpiStats` đang có → **0 vòng lặp mới, 0 query mới**.

### 4.5 Nhãn: "Hoa hồng đại lý", KHÔNG ghi "ước tính"

Số này là **cộng dồn thật từ entry**, nên ghi "ước tính" sẽ khiến staff nghi ngờ số đúng. Nhưng cần
biết 1 giới hạn thật: đây là hoa hồng **của các vé đã bán tới thời điểm poll**, kỳ đang bán thì số
còn tăng; con số **chốt** chỉ có sau kết sổ (`financial.totalAgentCommission`, tính lại từ entries
`settled`). Vì vậy:

- Label: `Hoa hồng đại lý`.
- **Tooltip** trên card (mới — 4 card hiện tại không có tooltip): *"Hoa hồng cộng dồn từ vé đã bán,
  theo tỷ lệ thật của từng đại lý. Kỳ đang bán số còn tăng; số chốt có sau khi kết sổ."*
- → Cần thêm `tooltip?: string` optional vào `KpiCardProps`. Chỉ card này truyền, 4 card kia không
  đổi hành vi.

---

## 5. Phạm vi file & thứ tự bước

**Backend (KPI hoa hồng — làm trước, FE phụ thuộc):**

1. `packages/game-keno-application/src/infras/repos/betting-stats-repo.ts` — projection + map `?? 0`.
2. `packages/game-keno-application/src/infras/repos/types/hub.types.ts` — `HubStatsRow.commission`.
3. `packages/game-keno-application/src/use-cases/operations/dto/hub-snapshot.dto.ts` — `OpsHubDrawRow.commission`.
4. `packages/game-keno-application/src/use-cases/operations/get-ops-hub-snapshot.ts` — `buildRow`.

**FE:**

5. `_lib/hub-kpi-strip.tsx` — `commission` breakdown + card thứ 5 + `grid-cols-5` + `tooltip` prop
   (+ sửa `HubKpiStripSkeleton` từ 4 → 5 ô, **đừng quên** — skeleton lệch số ô gây nhảy layout khi load).
6. `_lib/sections/queue/hub-expand-panel.tsx` — viết lại layout (§2) + `fmtTime` (§3.1.1) + dòng
   `Hoa hồng` ở cột C.

**Không đụng:** `derive-draw-state.ts`, `queue-row.tsx`, `hub-queue-table.tsx`, `use-hub-query.ts`,
route `hub-snapshot/route.ts` (ETag không cần đổi — `commission` thay đổi kéo theo `updatedAt` stats
thay đổi, mà `updatedAt` đã nằm trong ETag).

**Bingo18:** cùng cấu trúc (`game-bingo18-application` có `stats-accumulator` với `commission` — đã
xác nhận qua graph). Áp cùng 6 bước khi Bingo18 lên Hub, KHÔNG làm trong plan này.

---

## 6. Rủi ro / cạm bẫy

| # | Rủi ro | Chặn bằng |
|---|---|---|
| 6.1 | `d.totals` `undefined` ở kỳ chưa cược → `TypeError` crash **toàn bộ** snapshot | `?? 0` (bug này ĐÃ xảy ra thật — xem JSDoc `betting-stats-repo.ts:133-138`) |
| 6.2 | Card thứ 5 làm KPI strip xuống 2 hàng, cao 156px | `lg:grid-cols-5` + đo lại chiều cao sau khi code (mục tiêu vẫn 72px ở `lg`) |
| 6.3 | Skeleton 4 ô ≠ 5 card thật → nhảy layout mỗi lần load | Sửa `HubKpiStripSkeleton` cùng lúc |
| 6.4 | Panel bỏ giây → mất khả năng audit sự cố theo giây | Đưa mốc đầy đủ (có giây + năm) vào `title` attribute |
| 6.5 | Đọc "Hoa hồng đại lý" tưởng là số đã chốt | Tooltip §4.5 |
| 6.6 | Panel 5 mốc luôn hiện → cao hơn bản hiện tại ở kỳ mới mở bán | Bù lại bằng xoá footer nút (§2.1) + bỏ 2 dòng luôn-`0` ở cột C (§2.3) → net ≈ bằng hoặc thấp hơn |

---

## 7. Kiểm chứng (thủ công, có screenshot)

1. Kỳ **chưa có cược** (`Chờ đóng bán`, như ảnh của bạn): cột C thu gọn, mọi mốc hiện `07/09` (slash),
   nút `Đóng bán` cùng hàng với câu chẩn đoán, accent đỏ ở dải A.
2. Kỳ **có doanh thu thật**: `Hoa hồng` ở cột C > 0 và **khớp** `totals.commission` đọc trực tiếp từ
   Mongo (kiểm bằng Compass — số phải bằng tuyệt đối, không xấp xỉ).
3. Kỳ có tenant **rate ≠ 20%**: KPI hoa hồng ≠ `revenue × 0.2` → chứng minh dùng số thật, không estimate.
4. KPI strip ở 1440px: 5 card **1 hàng**, không card nào `truncate` label.
5. Reload trang: skeleton 5 ô, không nhảy layout khi data về.
6. Expand liên tiếp 3 kỳ khác chặng: chiều cao panel **không đổi** (5 mốc cố định).
7. `pnpm lint` + `pnpm check-types` sạch.

---

## 9. ĐÃ CODE (08/09) — kết quả + 1 bug thật phát hiện thêm

Chốt §8: Q1 = **A** (nút canh phải), Q2 = **card thứ 5 đứng ngay sau "Tổng tiền cược"**,
Q3 = **A** (`Hoa hồng đại lý`, sub = phần tồn đọng giống "Tổng tiền cược"), Q4 = **làm ngay**
(p1-08 đã xong). Đã code đủ, verify qua CDP browser thật từng bước.

### 9.1 Bug thật phát hiện TRONG lúc verify — counter đếm sống bị "đóng băng"

Không nằm trong 7 vấn đề dự đoán ở §1 — chỉ lộ ra khi đo bằng CDP, đọc `textContent` nhiều mẫu
cách nhau vài giây (screenshot tĩnh KHÔNG phát hiện được).

**Triệu chứng đo được:** ô cột `Thời gian` bảng 5A **ĐỨNG YÊN `3h17ph` suốt 90 giây**, trong khi
mốc `Công bố KQ` của CÙNG kỳ trong panel (neo timestamp tuyệt đối) đã tới `3h23ph` — **lệch 6
phút, staff thấy cả 2 con số trong CÙNG một khung nhìn**. Bản panel đầu tiên tôi viết cũng mắc
đúng lỗi này (kẹt `59ph3xs`, dao động ±6s do jitter, lệch 44 phút so với dòng ngay dưới).

**Nguyên nhân:** `Date.now() - row.ageInStageSec * 1000` trộn 2 nguồn KHÁC NHỊP —
`Date.now()`/`getNowMs()` là đồng hồ **sống** (đọc lại mỗi render) còn `ageInStageSec` là **ảnh
chụp**, chỉ tính lại khi `deriveHubSummary` chạy (theo poll, không theo giây). Mỗi render, mốc neo
trượt về sau đúng bằng lượng thời gian đồng hồ đã chạy → **triệt tiêu việc đếm**. `RelativeDuration`
hoạt động hoàn toàn đúng; sai ở giá trị `sinceMs` truyền vào.

**Fix:** export hàm dùng chung `stageStartMs(ts, stage)` ở `derive-draw-state.ts` (nơi đã có mốc
gốc `deriveHealth` dùng để tính `ageInStageSec` — đặt cạnh nhau để không bao giờ lệch), trả
timestamp **TUYỆT ĐỐI** theo chặng: `closeAtMs` (`PendingClose`/`AwaitingDraw`/`NeverOpened`) ·
`drawTimeMs` (`AwaitingResult`) · `publishedAtMs` (`AwaitingSettle`/`NeedsResettle`) · `updatedAtMs`
(`Settling`/`Voiding`) · `null` (`Selling`). Cả bảng và panel dùng chung 1 nguồn.

**Verify sau fix:** ô bảng tăng đơn điệu `3h28→3h29→3h30→3h31ph` (đúng nhịp 60s thật, khớp số học
`publishedAt = 00:31:29`); đo đồng thời 4 lần, ô bảng và mốc panel **luôn bằng nhau và đổi phút
CÙNG LÚC** → lệch 0.

### 9.2 Sửa thêm 2 điểm sau khi xem UI thật (không có trong plan gốc)

| # | Vấn đề đo được trên UI | Fix |
|---|---|---|
| 9.2a | Dải A hiện `Chờ đóng bán · treo 15h37ph` rồi ngay dòng dưới `Chờ đóng bán 15h37ph — vượt ngưỡng.` → **cùng con số 2 lần, cách nhau 1 dòng**. Tệ hơn: `reason` chỉ đổi mỗi lần poll còn counter đếm mỗi giây → tại mốc đổi đơn vị 2 số lệch nhau, trông y như bug | Counter CHỈ hiện khi `health = Ok` (lúc đó `reason` không chứa thời lượng: "Chờ đóng bán theo batch — bình thường."), và đổi chữ `treo` → `đã` cho khớp ngữ nghĩa |
| 9.2b | Nhãn `Doanh thu (VND)` trong khi `Hoa hồng đại lý`/`Rủi ro chi trả` ngay dưới cũng là VND mà không ghi → cột trông lệch | Bỏ `(VND)`, đơn vị hiểu ngầm ở tiêu đề khối "Tiền & rủi ro" |

### 9.3 File đã sửa (7)

**Backend (0 query mới):**
`betting-stats-repo.ts` (projection + map `?? 0`) · `types/hub.types.ts` · `dto/hub-snapshot.dto.ts` ·
`get-ops-hub-snapshot.ts`.

**FE:**
`hub-kpi-strip.tsx` (breakdown + card 5 + `lg:grid-cols-5` + prop `tooltip` + skeleton 4→5 ô) ·
`sections/queue/hub-expand-panel.tsx` (layout §2 + `fmtTime`/`fmtTimeFull` + dòng hoa hồng) ·
`derive-draw-state.ts` (export `stageStartMs`) · `sections/queue/hub-queue-table.tsx`
(`getAgeAnchor` dùng `stageStartMs` — fix §9.1).

### 9.4 Kết quả verify UI thật (CDP)

- KPI: đúng **5 card 1 hàng** ở 1440px, card 2 = `Hoa hồng đại lý` `96K` / sub `96K tồn đọng`,
  tooltip đúng nội dung. Không card nào `truncate` label. Chiều cao strip giữ 72px.
- Panel: viền trái 3px đỏ ở kỳ stuck; nút `Đóng bán` **cùng hàng, canh phải** (đo DOM: overlap trục
  dọc với câu chẩn đoán, cách mép phải 13px); 2 cột đo được `612px / 443px` = đúng 58/42.
- Thời gian: `21:03 07/09` — **slash**, không giây, kèm `(1ng1h trước)`. Giây + năm nằm trong
  `title` (`21:03:39 07/09/2026`).
- 5 mốc hiện đủ; mốc chưa tới hiện `Chưa có KQ`/`Chưa kết sổ` + dot rỗng.
- Kỳ có cược (#060, doanh thu 160K): `Hoa hồng đại lý 32K`. Kỳ 0 cược: `Chưa có cược nào trong kỳ này.`
- `pnpm --filter @megawin/backoffice check-types` + `@megawin/game-keno-application` xanh; Biome sạch
  trên 7 file đã sửa (3 warning `noUnnecessaryConditions` còn lại là pre-existing, không thuộc dòng sửa).
- Console: không lỗi React/hydration.

### 9.5 Còn nợ

- **Kiểm chứng số hoa hồng với Mongo:** `32K` ở kỳ #060 CHƯA đối chiếu trực tiếp `totals.commission`
  bằng Compass (§7 mục 2). Cần làm trước khi coi con số là đáng tin tuyệt đối.
- **Kỳ có tenant rate ≠ 20%:** chưa tìm được kỳ nào để chứng minh khác `revenue × 0.2` (§7 mục 3).
- **Bingo18:** `game-bingo18-application` có `stats-accumulator` với `commission` — áp cùng 4 bước
  backend khi Bingo18 lên Hub (p1-04).

| # | Câu hỏi | Đề xuất của tôi |
|---|---|---|
| Q1 | Layout 2 cột bất đối xứng + dải A gộp nút (§2) — hay giữ 3 cột và chỉ sửa style? | **Đổi sang §2** — 3 cột đều là nguyên nhân gốc của "không có điểm nhấn" |
| Q2 | Card KPI thứ 5 (Phương án A, `grid-cols-5`) hay nhét vào `sub` card có sẵn (B)? | **A** — B phá quy tắc `sub` = tồn đọng vừa chốt ở p1-07 §10 |
| Q3 | Nhãn `Hoa hồng đại lý` (số thật) thay vì `Ước tính hoa hồng`? | **Có** — số là thật, ghi "ước tính" làm staff nghi ngờ số đúng |
| Q4 | Bỏ giây khỏi mốc thời gian (`20:59:13` → `20:59`)? | **Bỏ**, giữ bản đầy đủ trong tooltip |
| Q5 | Thêm dòng `Hoa hồng` vào cột C của panel (không chỉ ở KPI)? | **Có** — cùng dữ liệu, 0 chi phí, và panel là nơi staff quyết định huỷ/kết sổ 1 kỳ cụ thể |
| Q6 | Làm ngay sau p1-08, hay chờ p1-08 merge? | **Chờ p1-08 merge** — cả 2 sửa `hub-kpi-strip.tsx` (p1-08 thêm card 4, plan này thêm card 5) → làm song song sẽ conflict |

**Bạn đã chốt (08/09):**

| # | Quyết định |
|---|---|
| Q1 | ✅ Phương án A, **nút thao tác đưa sang phải** |
| Q2 | ✅ Card thứ 5, đặt **ngay sau "Tổng tiền cược"** |
| Q3 | ✅ Phương án A — `value` = hoa hồng tổng, `sub` = hoa hồng tồn đọng của các kỳ đã qua thời gian cược, **giống hệt cách "Tổng tiền cược" làm** |
| Q4 | ✅ Bỏ giây (nằm trong Q1 A) |
| Q5 | ✅ Có |
| Q6 | ✅ Làm p1-09 **ngay** — p1-08 đã code xong, không còn rủi ro conflict |

---

## 10. Fix vòng 4 (09/09) — phản hồi sau khi dùng bản p1-09 thật

Bạn dùng bản đã deploy, phản hồi 4 điểm cụ thể trên UI thật:

> 1) Nút action bên phải ko cân xứng ở vertical giữa
> 2) Thời gian mô tả "1ng12h trước, 1ng11h trước" là ko cần thiết, đã có ở "Chờ đóng bán 1ng11h — vượt ngưỡng."
> 3) Kết sổ: thời gian này có bao giờ còn? Khi kết sổ xong sẽ không ở đây nữa hay vẫn ở đây?
> 4) DÒNG THỜI GIAN và TIỀN & RỦI RO: 2 cột này có cách nào thiết kế rõ ràng hơn chút, hiện hơi chìm.

### 10.1 Nút action lệch vertical (điểm 1)

**Nguyên nhân đọc code:** dải A dùng `items-start` cho hàng chứa khối text (chặng + `reason`) và
khối nút. Khi `reason` xuống 2 dòng (chặng 1 dòng `text-sm` + `reason` 1 dòng `text-sm` bên dưới =
khối text cao ~40px), nút `size="sm"` (cao ~32px, 1 dòng) neo theo mép TRÊN của khối 2 dòng đó →
nút nằm cao hơn tâm khối text, lệch lên trên thấy rõ trên ảnh bạn gửi.

**Fix:** `items-start` → `items-center` trên container dải A (`hub-expand-panel.tsx`, dòng khai
báo `className` của div dải A). Đơn giản, không đổi cấu trúc.

### 10.2 `(… trước)` trùng với dải A (điểm 2)

**Xác nhận đúng phản hồi bằng đọc code:** dải A (khi `health = Warn`/`Stuck`) hiện `row.reason`
— chuỗi đã CHỨA thời lượng, vd `"Chờ đóng bán 1ng11h — vượt ngưỡng."`. Ngay dưới, khối "Dòng thời
gian" hiện mốc `Đóng bán` kèm `(1ng11h trước)` — **cùng số, 2 chỗ, cách nhau 2 khối**. Ảnh bạn gửi
cho thấy đúng cặp `1ng12h trước` (mốc Mở bán) / `1ng11h trước` (mốc Đóng bán) — số thứ 2 trùng
khớp với số trong `reason`.

**Fix:** bỏ hẳn `(… trước)` khỏi `TimelineDot` — chỉ còn absolute time (`21:11 07/09`). Giữ
`fmtTimeFull` (giây + năm) ở `title` hover cho nhu cầu audit. Bớt 1 import (`RelativeDuration`
không còn dùng trong `TimelineDot`, vẫn dùng ở dải A cho counter `· đã …`).

**Đánh đổi đã cân nhắc:** absolute time không tự nói "bao lâu" — nhưng đó chính là điều dải A ĐÃ
làm rồi (câu `reason` hoặc counter `· đã …` khi `Ok`). Timeline giờ đóng đúng 1 vai: "lúc nào",
không lặp vai "bao lâu" của dải A.

### 10.3 "Kết sổ" có luôn còn không? (điểm 3 — câu hỏi, trả lời bằng đọc code)

Đọc `game-core.enums.ts` (`DRAW_UNFINISHED_STATUSES = DRAW_STATUS_VALUES` trừ
`DRAW_COMPLETED_STATUSES = [Settled, Void]`) + `draw-repo.ts` (`listUnfinishedDrawRows` filter
`status: { $in: DRAW_UNFINISHED_STATUSES }`) + `get-ops-hub-snapshot.ts` (dùng đúng hàm đó cho
toàn bộ snapshot Hub):

**Trả lời: KHÔNG, kỳ kết sổ xong sẽ RỜI khỏi Hub ngay lần poll sau (2s TTL cache).** Hub chỉ chứa
kỳ CHƯA kết thúc — kết sổ (`Published → Settled`) đưa kỳ ra khỏi tập `DRAW_UNFINISHED_STATUSES`
ngay, không còn cách nào mở panel Hub ra để xem lại mốc `Kết sổ` của kỳ đó (muốn xem phải qua
trang `/operations?drawId=`, nơi có toàn bộ lịch sử không giới hạn theo status).

Mốc `Kết sổ` trong panel Hub **CÓ giá trị khác 0** ở đúng 1 case: `NeedsResettle` — khi KQ được
sửa SAU khi đã kết sổ lần đầu (`publishedAt > settledAt`, xem `deriveOpsStage`). Case này VẪN còn
trong Hub (status vẫn `Published`, chưa `Settled`), và mốc `Kết sổ` hiển thị là của **LẦN KẾT SỔ
TRƯỚC** — thông tin hữu ích để staff biết "đã kết sổ 1 lần rồi, giờ cần kết sổ lại".

**Hành động:** không đổi code hành vi — thêm JSDoc giải thích tại `TimelineDot` dòng `Kết sổ`
trong panel (đã thêm, xem file), tránh câu hỏi tương tự lặp lại. Đã verify bằng ảnh chụp CDP thật
(tab "Chờ kết sổ", kỳ `2026-09-07.001`): mốc `Kết sổ` hiện `Chưa kết sổ` — đúng dự đoán, kỳ này
chưa từng kết sổ lần nào (khác `NeedsResettle`).

### 10.4 2 khối "chìm" (điểm 4)

**Nguyên nhân:** 2 khối chỉ có heading `text-xs text-muted-foreground uppercase` KHÔNG khung —
so với dải A (có `border` + `border-l-[3px]` + nền màu theo `health`), 2 khối này trông như phần
tiếp diễn của nền `bg-muted/30` chung của panel, không có ranh giới thị giác rõ.

**Fix:** mỗi khối bọc `border rounded-lg bg-card p-3` (cùng ngôn ngữ hình với dải A, nhưng KHÔNG
border-l màu — 2 khối này không mang tín hiệu "cảnh báo", chỉ là "dữ liệu tham khảo") + icon
(`Clock` cho Dòng thời gian, `Wallet` cho Tiền & rủi ro) đặt cạnh heading, `font-semibold
text-foreground` thay `font-medium text-muted-foreground` cho heading — heading giờ nổi rõ hơn
nội dung dưới nó, đúng vai "tiêu đề khối" thay vì mờ đi.

### 10.5 File đã sửa

`hub-expand-panel.tsx` — 4 đổi: (a) `items-start` → `items-center` dải A; (b) bỏ prop
`RelativeDuration` khỏi `TimelineDot`/xoá `(… trước)`; (c) 2 `div` khối con bọc thêm
`border rounded-lg bg-card p-3` + icon; (d) JSDoc mới giải thích case `Kết sổ` hiếm khi có giá trị.
Không đổi backend, không đổi DTO, không query mới.

### 10.6 Verify

- `npx biome check` file đã sửa: sạch, không lỗi/warning mới.
- `pnpm --filter @megawin/backoffice check-types` (`tsc --noEmit`): xanh.
- CDP screenshot 2 kỳ thật: `2026-09-07.002` (tab Chờ đóng bán, `health=Warn`) và
  `2026-09-07.001` (tab Chờ kết sổ, `health` treo `NeedsResettle`-adjacent) — cả 2 xác nhận: nút
  canh giữa vertical với khối text 2 dòng, timeline không còn `(… trước)`, 2 khối có khung + icon
  rõ ràng, không còn "chìm" vào nền panel.

---

## 11. Nghiên cứu: có nên nâng `BULK_MAX_DRAWS = 50`? (câu hỏi mở, CHƯA implement)

Câu hỏi của bạn: *"đóng sổ cùng lúc 200 kỳ cũng đâu vấn đề gì, nếu publish kết quả liên tục thì
cũng chỉ 1 kỳ 1, khi kết sổ thì tự gửi 5 kỳ 1 lần đều đã xử lý vấn đề đó — có nên cho chọn hết
các kỳ đang tồn để làm việc 1 lần không?"*

### 11.1 Đọc lại lý do trần 50 hiện tại (`bulk-limits.ts`)

JSDoc tại chỗ ghi rõ 2 tầng giới hạn tách biệt:

- `BULK_MAX_DRAWS = 50` — trần **số kỳ mỗi REQUEST HTTP** (chặn ở Zod route, `bulkDrawIdsSchema`).
- `BULK_CONCURRENCY = 5` — trần **số kỳ chạy ĐỒNG THỜI trong 1 request** (`bulk-runner.ts`,
  `runBulkDrawAction` chia chunk rồi `Promise.all` tuần tự từng chunk).

50 kỳ ÷ 5 đồng thời = 10 chunk tuần tự. Lý do ghi trong comment: mỗi kỳ settle chỉ **start SFN**
(không chờ chạy xong) nên ~100-200ms/kỳ → 10 chunk ≈ 2s, "an toàn dưới timeout Lambda route" (số
cụ thể của timeout đó KHÔNG có trong repo — tôi không tìm thấy config Lambda/API Gateway timeout
trong `apps/backoffice` khi grep, có thể nằm ở hạ tầng ngoài repo này, xem §11.4).

### 11.2 Đúng như bạn chỉ ra — 2/4 action đã tự chia nhỏ, không cần trần request cao hơn ý nghĩa gì

Đọc thêm để xác nhận nhận định của bạn:

- **Publish kết quả:** đọc `p1-06-sequential-publish-result.plan.md` — luồng "Xác nhận & Kỳ tiếp"
  xử lý **1 kỳ/lần bấm**, không đi qua `runBulkDrawAction`/`BULK_MAX_DRAWS` nào cả. Trần 50 KHÔNG
  áp dụng ở đây — nâng trần không giúp gì cho publish.
- **Kết sổ:** JSDoc `BULK_CONCURRENCY` ghi "settle: mỗi kỳ = 1 SFN execution + 1 chuỗi Lambda + 1
  luồng ghi rollup daily" — bulk settle CHỈ **trigger** SFN theo lô 5, phần xử lý nặng thật (chuỗi
  Lambda + rollup) chạy BẤT ĐỒNG BỘ trong SFN, không nằm trong request HTTP. Bạn nói đúng: khâu
  nặng nhất đã được tách khỏi request rồi.

**Suy ra:** trần 50 hiện tại **không bảo vệ khỏi tải nặng thật** (SFN đã async) — nó chỉ bảo vệ
khỏi 1 THỨ: **request HTTP chạy quá lâu trước khi trả response** (10 chunk × ~200ms cho settle;
close/open-sales rẻ hơn nhiều vì chỉ 1 DB write/kỳ, không SFN).

### 11.3 Vậy còn gì cản nâng trần, nếu SFN đã async?

Đọc kỹ hơn 2 điểm trong code hiện tại mà JSDoc CHƯA nhắc tới:

1. **`bulk-open-sales`** (đọc use-case) đọc `closeAt` bằng 1 query `getCloseAtByDrawIds`
   TRƯỚC KHI chạy loop** — query này nhận `drawIds` là mảng, độ dài tăng theo trần. 200 kỳ vẫn là
   1 query (`$in`), không phải vấn đề lớn, nhưng cần đo `explain()` thật nếu tăng trần — đây là
   câu hỏi mở #3 đã có sẵn trong `00-overview.md` ("Có cần index `{drawId, status}`?").
2. **Partial success UI ở `BulkConfirmDialog`** (chưa đọc file này trong plan p1-09, cần đọc thêm
   ở lần triển khai) — dialog liệt kê kết quả từng kỳ theo `results[]`. 200 dòng kết quả trong 1
   dialog là câu hỏi UX riêng (list dài, cần virtualization hay không) — KHÔNG chỉ là câu hỏi
   backend.
3. **`BULK_CONCURRENCY = 5` không đổi theo `BULK_MAX_DRAWS`** — nâng trần request lên 200 mà giữ
   concurrency 5 thì vẫn ra 40 chunk tuần tự. Với settle (~200ms/kỳ) ≈ 8s cho cả request — CÓ THỂ
   vẫn nằm trong timeout, nhưng với close-sales/open-sales (rẻ hơn, có thể <50ms/kỳ) vẫn nhanh;
   rủi ro thật nằm ở **trường hợp lỗi/retry chậm phía Mongo/AWS SDK** kéo dài từng kỳ trong chunk,
   nhân với 40 chunk sẽ khác biệt rất xa so với 10 chunk.

### 11.4 Điều CHƯA đo được — cần dữ liệu thật trước khi đổi số

- **Timeout thật của route Lambda/API Gateway:** JSDoc ghi "an toàn dưới timeout" nhưng KHÔNG ghi
  số cụ thể; tôi grep `apps/backoffice` (`maxDuration`, `next.config.ts`, không tìm thấy
  `sst.config.ts` ở root hay `vercel.json`) không tìm thấy config timeout tường minh trong repo —
  hạ tầng deploy khả năng nằm ngoài phạm vi tôi đọc được lúc này. Đây CHÍNH LÀ câu hỏi #6 đã ghi
  sẵn trong `00-overview.md` bảng "Bạn đã chốt hoặc còn treo" (`BULK_MAX_DRAWS = 50` /
  `BULK_CONCURRENCY = 5` có đúng? → "Đo p95 khi settle lô thật") — câu hỏi CHƯA có câu trả lời đo
  được, không phải tôi bỏ sót, nó đã treo từ trước p1-09.
- **p95 thời gian 1 request settle 50 kỳ thật** (không phải lý thuyết `10 × 200ms`) — chưa có số
  đo trong bất kỳ plan nào tôi đọc được.

### 11.5 Đề xuất (chưa code, chờ bạn chốt)

Không đề xuất xoá trần hoàn toàn ("chọn hết mọi kỳ đang tồn" — 152 kỳ ở ảnh bạn gửi, có thể lên
đến vài trăm nếu backlog dồn nhiều ngày) vì 2 lý do:
- Chưa đo p95 thật (§11.4) — nâng trần mà không đo là đổi số dựa trên suy đoán, đúng thứ
  `code-quality-standards.mdc`/nguyên tắc "không kết luận khi chưa xác nhận" của repo này cấm.
- Dialog xác nhận + danh sách kết quả partial-success cần review riêng ở quy mô lớn hơn nhiều
  chục kỳ (câu hỏi #2 ở §11.3).

**Đề xuất theo hướng tăng CÓ ĐO, không tăng ĐỘT NGỘT:**

| Bước | Việc | Điều kiện qua |
|---|---|---|
| 1 | Đo p95 thật 1 request settle 50 kỳ (log CloudWatch hoặc `console.time` tạm ở route) | Có số thật, không phải lý thuyết |
| 2 | Nếu p95 << timeout route (còn nhiều dư địa) → nâng `BULK_MAX_DRAWS` theo BƯỚC (50→100→200), đo lại p95 mỗi bước | Mỗi bước không vượt ngưỡng an toàn (vd 50% timeout) |
| 3 | Xét riêng `BulkConfirmDialog` khi số dòng kết quả > 50 — virtualize hay tóm tắt theo status (giống outlier 5B "gộp khi >5") | UI không giật khi 200 dòng |
| 4 | KHÔNG cần đổi `BULK_CONCURRENCY` cùng lúc — 2 tầng độc lập, tăng request cap trước, đo xong mới xét tăng concurrency |

**Câu hỏi cho bạn:** bạn có quyền truy cập CloudWatch logs của route `bulk-settle` để lấy p95 thật
không, hay cần tôi hướng dẫn thêm `console.time` tạm để đo trên local/staging trước? Đây là điều
kiện chặn bước 1 — không có số thật thì mọi con số trần mới (100? 200? "không giới hạn"?) đều là
đoán, đúng cảnh báo JSDoc `bulk-limits.ts` đã ghi rõ ("200 kỳ sẽ chạm timeout và mất toàn bộ kết
quả" — con số này CŨNG là suy đoán viết lúc code p0-04, chưa có phép đo hậu thuẫn).

## 12. Client-side batch runner (09/09) — thay hẳn phương án nâng trần ở §11

Bạn đề xuất: KHÔNG nâng `BULK_MAX_DRAWS` phía server, mà client tự chia lô ≤50, gửi TUẦN TỰ,
chỉ báo tổng số thành/thất bại (không liệt kê từng kỳ thành công). Đã đánh giá và implement —
phương án này **tốt hơn** §11.5 (nâng trần server), và **không cần chờ đo p95** (điều đang treo ở
§11.4) vì không đổi gì tầng server:

- Zero rủi ro tài chính: `BULK_MAX_DRAWS`, `BULK_CONCURRENCY`, Zod schema **giữ nguyên 100%**.
- An toàn hơn cả 1 request lớn: 1 lô 50-kỳ lỗi mạng/timeout chỉ mất kết quả **lô đó**, không mất
  toàn bộ 200 kỳ (đúng rủi ro JSDoc `bulk-limits.ts` đã cảnh báo cho request khổng lồ).
- Điều kiện bắt buộc: các lô PHẢI chạy **tuần tự** (`await` xong lô này mới gửi lô kế) — song
  song sẽ nhân `BULK_CONCURRENCY` vượt thiết kế gốc (4 lô song song × 5 concurrency/lô = 20 SFN
  cùng lúc thay vì 5).

### 12.1 Quyết định đã chốt (hỏi qua `AskQuestion`, 09/09)

| Câu hỏi | Chốt |
|---|---|
| Kỳ lỗi trong 1 lô — retry sao? | **Manual** — kỳ lỗi giữ nguyên trong `validSelection` kèm `rowErrors` (hành vi cũ), staff tự bấm lại nút bulk 1 lần nữa. KHÔNG auto-retry (tránh vòng lặp retry vô hạn với kỳ lỗi permanent). |
| Trần SELECTION (không phải trần/request) | **Bỏ hẳn** — cho chọn hết mọi kỳ đang tồn trong tab, bị chặn tự nhiên bởi tổng số kỳ trong Hub (~150-300), không cần trần UI riêng. |
| Có thể tái dùng cho bingo18/game khác? | Có — xem §12.2. |

### 12.2 Đánh giá tái sử dụng (yêu cầu "suy nghĩ sâu" trước khi code)

Đã kiểm tra `packages/game-bingo18-application` + `apps/backoffice/.../games` (Grep + Glob) —
**bingo18 hiện KHÔNG có bulk draw action UI/API nào** (chỉ có `draw-management` single-draw, và
các "bulk" hit trong `game-bingo18-application` là batch-processing NỘI BỘ của settle-entries,
không liên quan HTTP bulk pattern này). Không có consumer thứ 2 tồn tại NGAY LÚC NÀY.

Nhưng bài toán lõi ("chia N ID thành lô K, gửi tuần tự, gộp kết quả") **không cần biết gì về
Keno** — chỉ cần 1 hàm `runChunk` do caller cung cấp. Theo `code-quality-standards.mdc` §5
(tìm-trước-khi-tạo, DRY) và tránh việc ops-hub tương lai (bingo18 hoặc game khác) phải viết lại
đúng logic chunk+tuần tự+gộp này, đã **tách làm 2 lớp**:

1. **`apps/backoffice/src/hooks/use-batch-runner.ts`** — engine THUẦN, domain-agnostic. Chỉ biết
   `string[]` ID + `chunkSize` + hàm `runChunk: (chunk) => Promise<{successIds, failures}>`.
   KHÔNG import gì từ `game-keno-application`. Sống ở tầng app (`hooks/`) vì dùng chung mọi
   game trong `apps/backoffice`, không phải domain logic của riêng Keno → KHÔNG đặt trong
   `game-keno-application` hay `operations-hub/_lib` (đúng ranh giới domain vs UI-orchestration,
   khác biệt với business logic phải nằm trong `packages/game-*`).
2. **`useBulkBatchAction` (`use-bulk-mutations.ts`, Keno-specific)** — adapter mỏng: biết
   `BulkDrawActionOutput`, `BULK_MAX_DRAWS`, path `/keno/draws/bulk-*`, cách áp side-effect
   (`applyBulkResult` — xoá selection, ghi `rowErrors`, invalidate query). Nếu bingo18 có
   ops-hub bulk action tương lai với hợp đồng response tương tự (`{results, successCount,
   failureCount}` — hình đã thấy ở `BulkDrawActionOutput`, khả năng cao game khác cũng theo
   pattern này vì cùng convention `bulk-draw-action.dto.ts`), chỉ cần viết 1 adapter tương tự
   ~40 dòng, TÁI DÙNG NGUYÊN `useBatchRunner` — không viết lại vòng lặp chunk/tuần tự/catch.

**Không tách UI (`BulkConfirmDialog` progress block)** — JSX gắn với `DerivedRow`/copy tiếng
Việt của Keno, chỉ 1 consumer hiện tại. Theo nguyên tắc "không over-engineer sớm" (tương tự tinh
thần §4 `operator-monorepo-structure.mdc`), khi bingo18 thực sự cần, copy pattern JSX (không copy
logic — logic đã ở hook chung) rồi chỉnh copy/type theo game đó.

### 12.3 Implement (09/09)

| File | Thay đổi |
|---|---|
| `apps/backoffice/src/hooks/use-batch-runner.ts` | **MỚI** — `useBatchRunner(chunkSize)`: chia lô, chạy tuần tự, gộp kết quả, export `BatchRunnerState`/`IDLE_BATCH_STATE`. |
| `use-bulk-mutations.ts` | Tách `applyBulkResult()` (side-effect thuần, không toast) dùng chung cho `useBulkAction` (lô đơn, hành vi CŨ không đổi) và `useBulkBatchAction` (MỚI — wrap `useBatchRunner`, adapter gọi `apiClient.post` trực tiếp thay vì `useMutation` lồng trong loop). |
| `hub-bulk-action-bar.tsx` | Bỏ `overCap`/banner "Chọn tối đa 50 kỳ". Nút hiện `(200 · 4 lô)` khi vượt `BULK_MAX_DRAWS`. `handleConfirm` rẽ nhánh: ≤50 → `useBulkAction` như cũ; >50 → `useBulkBatchAction.run()`. |
| `bulk-confirm-dialog.tsx` | Thêm prop `batchState`. Khi `totalChunks > 1`: hiện progress bar (`doneChunks/totalChunks`), đếm live thành/thất bại, khoá nút "Quay lại" lúc đang chạy, đổi footer thành "Đóng" khi xong. KHÔNG liệt kê từng kỳ lỗi trong dialog (đã có `rowErrors` inline tại dòng — đúng góp ý "chỉ báo tổng, không nhắc thành công"). |
| `hub-expand-panel.tsx` | Truyền `batchState={IDLE_BATCH_STATE}` cho dialog single-row (không bao giờ chạy batch). |

Verify: `biome check` 5 file sạch (1 lỗi sort import đã auto-fix), `tsc --noEmit` sạch. Chưa test
E2E qua browser được — DB dev hiện KHÔNG có kỳ nào (0 rows mọi tab) nên không có dữ liệu thật để
chọn >50 kỳ; cần bạn tự verify trên môi trường có dữ liệu (hoặc tôi seed dữ liệu test nếu cần).

§11 (nâng trần server) coi như **đóng, không làm nữa** — phương án §12 giải quyết đúng nhu cầu
gốc ("chọn hết kỳ đang tồn để xử lý 1 lần") mà không cần đánh đổi rủi ro/thời gian đo p95.

## 13. Fix bug perf (09/09) — "chọn hết rồi đổi tab bị delay rất lâu"

**User báo:** ở tab "Chờ đóng bán", chọn hết các kỳ rồi đổi sang tab khác HOẶC đổi về lại tab đó
bị delay rất lâu. Nghi do §12 (bỏ trần chọn 50) — trước đó không ai chọn hết vì nút bị khoá ngay,
nên workflow "select-all rồi đổi tab" chưa từng bị thử ở quy mô lớn.

**Điều tra (đọc code, KHÔNG reproduce được live — môi trường dev yêu cầu login, không có
credential):** rà toàn bộ pipeline `use-hub-context.tsx` → `deriveHubSummary` →
`buildQueueTables` → `hub-queue-table.tsx` → `hub-bulk-action-bar.tsx` → `partition-by-action.ts`
→ `hub-timeline-rail.tsx`. **Không tìm thấy vòng lặp O(n²) hay infinite loop** — mọi phép tính
đều O(n) đơn (1 lần lặp `rows`/`selectedIds`), quá nhẹ để tự nó gây "delay rất lâu" (vài trăm ms
tối đa) dù tab có vài trăm–vài nghìn kỳ.

**Tìm được 2 bug thật (không phải giả thuyết) — phá `memo` của `QueueRow` một cách không cần
thiết**, khiến TOÀN BỘ hàng re-render dù giá trị logic không đổi, ở `hub-queue-table.tsx`:

1. `handleToggleExpand` là function thường (không `useCallback`) → tạo THAM CHIẾU MỚI mỗi lần
   `HubQueueTable` render → prop `onToggleExpand` của MỌI `QueueRow` đổi reference → `memo` bail
   100% các hàng, bất kể `rowIndex`.
2. `handleToggleSelect` có `useCallback` nhưng deps chứa `nowMs` — biến này đọc `Date.now()`
   ngay tại thời điểm RENDER (không phải state/ref), nên khác giá trị ở MỌI LẦN RENDER → callback
   bị tạo mới liên tục vì lý do tương tự.

Hệ quả: MỌI re-render của `HubQueueTable` (poll 10s, gõ phím, mở/đóng panel, và quan trọng nhất —
**mỗi lô batch job xong lại re-render `HubBulkActionBar`/context, kéo theo `HubQueueTable`**) đều
làm React reconcile lại ĐẦY ĐỦ mọi `QueueRow` đang mount (kèm Radix `Checkbox`/`Tooltip`, không rẻ)
dù props logic thực chất không đổi. Với tab có hàng trăm kỳ + chọn hết + đang chạy 1 batch job
nhiều lô, số lần re-render dồn lại đúng lúc user tương tác (đổi tab) → delay dễ cảm nhận được,
NHẤT LÀ ở `pnpm dev` (React dev mode chậm hơn production 3-8x cho reconciliation lớn).

**Fix:**
- `handleToggleExpand` → bọc `useCallback(() => {...}, [])` (setState functional update, không
  cần dependency).
- `handleToggleSelect` → bỏ `nowMs` khỏi deps, gọi `meta.getNowMs()` NGAY TRONG callback (giá trị
  tại thời điểm CLICK, không phải tại thời điểm RENDER) — deps còn `[validSelection, rows5A,
  actions, meta]`, ổn định hơn nhiều (chỉ đổi khi context thật sự đổi).
- `hub-bulk-action-bar.tsx`: `selectedRows`/`totalRevenue` chuyển sang `useMemo` (trước đó tính
  lại ở MỌI render kể cả khi chỉ đổi `isPending`/`batchState`/`openDialog` — không liên quan tới
  `rows5A`/`validSelection`). `targetRowsForKind` đổi nguồn lọc từ `rows5A` (O(n) toàn tab) sang
  `selectedRows` (O(m) subset đã lọc sẵn) — hợp lệ vì `def.drawIds` luôn ⊆ `selectedRows`.

**Giới hạn của fix này (nói rõ, không giả vờ đã 100% xác nhận):** đây là fix dựa trên audit tĩnh
có căn cứ (2 bug memo thật, đã verify bằng đọc code), KHÔNG phải xác nhận bằng profiling runtime
(Performance trace/React Profiler) vì không vào được UI (login-gated, không có credential test).
Nếu sau fix user vẫn thấy delay đáng kể, nghi vấn kế tiếp là **số dòng thực tế trong tab quá lớn**
(hàng nghìn) khiến chi phí MOUNT/UNMOUNT (không phải re-render — mount vốn không tránh được khi
đổi tab, vì đổi tab luôn là đổi toàn bộ `key` của danh sách) vượt quá khả năng của bảng render
đầy đủ không ảo hoá (`content-visibility: auto` chỉ giúp PAINT, không giúp React DIFF) — lúc đó
cần cân nhắc virtualize bảng (`@tanstack/react-virtual` hoặc tương đương) cho `rows5A` khi
`length` vượt 1 ngưỡng (VD 200), CHỈ mount hàng trong viewport.

## 14. Fix bug perf vòng 2 (09/09) — root cause THẬT, xác nhận bằng CPU profile runtime

User báo bug §13 **vẫn còn** sau fix, kèm câu hỏi đúng trọng tâm: "kỳ không đổi và trạng thái nên
giữ im, sao lại phải re-render?" — câu hỏi này đã lộ ra giả định sai trong §13: đây **không phải
re-render**, mà là **unmount/mount lại toàn bộ dòng** (đổi tab → `rows5A` đổi hoàn toàn theo
`activeTab` → mọi `key={row.drawId}` của tab cũ biến mất, tab mới xuất hiện — React coi đây là
component instance MỚI, không phải update). §13 đã NHẮC tới khả năng này ở đoạn cuối nhưng dừng ở
mức nghi vấn, không đo được vì "không vào được UI".

**Lần này đo được bằng Cursor Browser (đã login sẵn từ trước, không bị chặn):**

- Đo bằng `MutationObserver` + `performance.now()`: đổi tab RỜI KHỎI tab có 173 kỳ đã chọn = 230ms
  (bình thường). Đổi tab QUAY LẠI tab đó = **3.3 giây**. Lặp lại 2 lần, kết quả ổn định (3112ms,
  3311ms) — không phải nhiễu.
- Control test loại trừ giả thuyết sai: tắt hẳn `content-visibility: auto` (nghi vấn cuối §13) →
  vẫn 3.1s, KHÔNG giảm. Bỏ chọn hết (0 kỳ) → quay lại tab chỉ mất 209ms. Vậy chi phí tỉ lệ THUẬN
  với **số checkbox đang `checked=true`**, không liên quan `content-visibility`.
- CPU profile thật (`Profiler.start/stop` qua CDP, sampling 200µs) trong lúc quay lại tab: hàm
  tốn self-time NHIỀU NHẤT sau `(idle)`/`(program)` là **`getAnimationName`**
  (`@radix-ui/react-checkbox` → `react-presence`, file `usePresence`) — **2.47 giây / 3.3 giây
  tổng**, gấp ~24x hàm tốn thứ 2 (`SellingFullTable[filtered.map()]`, 41ms).

**Root cause thật:** `Checkbox` (`@/components/ui/checkbox.tsx`, wrap `@radix-ui/react-checkbox`)
dùng `CheckboxIndicator` bên trong bọc bởi `Presence` (Radix animation state machine). Mỗi khi
1 checkbox `checked=true` **MOUNT** (không phải update — mount), `usePresence` chạy
`useEffect(() => { getAnimationName(stylesRef.current) })` gọi `getComputedStyle(node)` —
**forced synchronous style recalculation** (đọc layout ngay sau khi vừa viết DOM, xem
`vercel-react-best-practices` §7.1 "Avoid Layout Thrashing"). Với 1 checkbox thì rẻ; với 173-200+
checkbox MOUNT LẠI CÙNG LÚC (đổi tab = remount toàn bảng), trình duyệt phải trả giá forced reflow
173-200 lần liên tiếp trong 1 commit — đúng bằng số giây quan sát được.

Đây LÀ đúng câu hỏi user đặt ra: "kỳ không đổi sao phải re-render" — thực ra không phải re-render
(prop logic của `QueueRow` đúng là không đổi, `memo` từ §13 hoạt động đúng), mà là **mount lại từ
đầu do đổi tab luôn đổi hết `key`** — cái tốn tiền là **side-effect mount của Radix `Checkbox`**,
nằm NGOÀI phạm vi kiểm soát của `memo`/`useCallback` (2 fix ở §13 xử lý đúng bug re-render nhưng
không chạm được bug mount này — 2 bug độc lập, không phải fix sai, chỉ là chưa đủ).

**Fix:** đổi checkbox chọn dòng trong `queue-row.tsx` từ `<Checkbox>` (Radix) sang **native
`<input type="checkbox">`** — không có `Presence`/animation state machine nên không có forced
style read khi mount. Style tái tạo bằng `accent-primary` (Tailwind `accent-color`, browser tự vẽ
đúng theme primary) + class `size-4 shrink-0 rounded-[4px] border-input`. Giữ nguyên Radix
`Checkbox` ở header "Chọn tất cả" (`hub-queue-table.tsx`, chỉ 1 instance/trang — cần
`indeterminate` state, native input không hỗ trợ qua prop; chi phí 1 instance không đáng kể).

**Verify sau fix (đo lại đúng kịch bản, cùng phương pháp):**

| Kịch bản | Trước fix | Sau fix |
|---|---|---|
| Rời tab có 176 kỳ đã chọn | 230ms | 229ms (không đổi — vốn đã nhanh) |
| **Quay lại tab có 176 kỳ đã chọn** | **3.1 – 3.3s** | **128 – 229ms** |
| CPU profile: self-time `getAnimationName` | 2.47s / 3.3s tổng | **biến mất khỏi top 40** (`usePresence.useEffect` còn lại chỉ 20ms — từ 1 instance header) |

Cải thiện ~14-25x, về đúng baseline "không chọn gì". Đã verify Shift+Click range-select (round 4)
vẫn hoạt động đúng với native input (dispatch `mousedown` + `click`, kiểm tra 5 dòng đầu được
chọn đúng theo range) — logic `onCheckboxMouseDown`/`onToggleSelect` không đổi, chỉ đổi element
phát ra event.

`biome check` + `tsc --noEmit` sạch trên `queue-row.tsx` sau khi bỏ import `Checkbox`.

**Bài học quy trình:** §13 dừng ở audit tĩnh vì tưởng không vào được UI (login-gated) — thực ra
Cursor Browser đã có session login sẵn từ lần trước, chỉ cần list tab (`browser_tabs`) là thấy.
Lần sau nghi ngờ performance bug, ưu tiên kiểm tra tab đang mở TRƯỚC khi kết luận "không test được
live" — đo bằng CPU profile thật luôn nhanh hơn và chính xác hơn suy luận từ đọc code, đặc biệt
với bug nằm trong library bên thứ 3 (Radix) mà code của mình không gọi trực tiếp.
