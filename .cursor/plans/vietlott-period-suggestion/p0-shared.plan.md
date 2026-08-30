---
name: Vietlott Period — Shared (helper + fix độc lập)
overview: "Phần dùng chung cho cả 7 game: helper toán thuần trong game-core xử lý 3 kiểu lịch, 2 fix độc lập (default Ngày Vietlott sai + invariant server-side), vá lỗ hổng analysis §4.3. CHẶN tất cả plan per-game."
todos:
  - id: fix-default-drawdate
    content: "FIX ĐỘC LẬP (7 game): ô Ngày Vietlott đang default todayVN() → phải là drawDate của chính kỳ đó. Kỳ 2026-06-26.019 mở ngày 28/08 đang hiện 28/08"
    status: pending
  - id: invariant-vietlottref
    content: "FIX ĐỘC LẬP (7 game): invariant server-side khi ghi vietlottRef — KHÔNG trùng drawPeriod với drawId khác (chốt 30/08: đã bỏ check đơn điệu tăng theo drawTime). Chỉ áp dụng khi input CÓ vietlottRef"
    status: pending
  - id: core-schedule-model
    content: "game-core: mô hình lịch chung slotsPerDay(date) + slotIndexInDay(time) phủ cả 3 kiểu lịch (A lưới trong ngày, B drawTimes cố định, C theo thứ tuần)"
    status: pending
  - id: core-math-helper
    content: "packages/game-core/src/utils/vietlott-period.ts — calcSlotIndex + suggestVietlottPeriod từ neo KỲ BẤT KỲ {ngày, giờ quay, mã kỳ}. Giữ zero-pad. Trả null khi không suy được. KHÔNG I/O"
    status: pending
  - id: core-math-test
    content: "Unit test: số thật analysis §4.3 (#0293476 slot 1 → #0293483 slot 8) + neo giữa ngày + mở thiếu kỳ + lệch lưới → null + kỳ trước ngày neo → null + cả 3 kiểu lịch + biên slot đầu/cuối"
    status: pending
  - id: suggest-api
    content: "API/endpoint gợi ý mã kỳ cho dialog publish. Ưu tiên gộp vào use-case đang nuôi dialog; nếu không có thì tạo route riêng"
    status: pending
  - id: source-labeling
    content: "DrawResultSource phân biệt Manual/Import (hiện 0 call site) — gợi ý KHÔNG được thành ground truth cho auto-import đối chiếu"
    status: pending
  - id: update-analysis-doc
    content: "Vá analysis §4.3: drawNo ≠ slotIndex khi mở thiếu kỳ; thay công thức bằng slotIndex suy từ drawTime. Chạy pnpm format:docs"
    status: pending
---

# Plan P0 — Shared (chặn tất cả plan per-game)

Thiết kế, dữ kiện verify, rủi ro: [`00-overview.md`](00-overview.md).

Plan này chứa **mọi thứ không phụ thuộc game cụ thể**. Xong P0 rồi mới làm
[`p1-keno.plan.md`](p1-keno.plan.md).

---

## P0.0 — HAI QUY TẮC CHẶN, đọc trước khi code bất kỳ dòng nào

### P0.0.1 Lịch quay PHẢI đọc từ config trong DB, TUYỆT ĐỐI không dùng `DEFAULT_*_CONFIG`

Mọi phép tính `slotIndex` / số kỳ / ngày quay phải lấy lịch từ **`GlobalConfigDoc` trong DB** qua
`GetGlobalConfigUseCase` — đúng pattern `create-draw.ts` đang dùng.

⚠️ **Đây không phải lo ngại lý thuyết — đã xảy ra thật.** Analysis §hỏi-đáp mục 15 ghi rõ:
`DEFAULT_KENO_CONFIG.play.firstDrawTime` đã sửa `06:00` → `06:08` trong code, nhưng
**`GlobalConfigDoc` đã seed trong DB KHÔNG tự đổi theo default code mới**. Nếu helper lấy lịch từ
`DEFAULT_*`:

| Nguồn lịch | `firstDrawTime` | `slotIndex` kỳ 07:04 | Mã kỳ suy ra |
| --- | --- | --- | --- |
| `DEFAULT_KENO_CONFIG` (code) | `06:08` | 8 | `#0293483` |
| `GlobalConfigDoc` (DB thật) | `06:00` | **9** | **`#0293484`** ← sai 1 kỳ |

Lệch 1 kỳ, **im lặng**, ở mọi kỳ. Và vì neo cũng lưu trong cùng config nên staff sẽ cập nhật neo để
"chữa", làm lệch thêm.

Quy tắc bắt buộc:

- Helper `game-core` (P0.4) **nhận lịch qua tham số**, KHÔNG import `DEFAULT_*` — đây là lý do thiết kế
  nó thành hàm thuần, không phải hàm tự đi lấy config.
- Tầng gọi (P0.5) đọc `GetGlobalConfigUseCase` rồi truyền xuống.
- Config trong DB **thiếu** field lịch → trả `null` (không gợi ý). **KHÔNG** fallback về `DEFAULT_*`
  — fallback im lặng chính là cái bẫy ở trên.

### P0.0.2 Type neo dùng CHUNG ở `game-core`, không nhân bản 7 lần

Shape neo **giống nhau tuyệt đối** ở cả 7 game (chỉ luật validate `anchorDrawTime` khác theo kiểu
lịch). Theo `code-quality-standards.mdc` §5/§5.1 và đúng tiền lệ `DrawVietlottRef`
(`packages/game-core/src/types/draw.ts:32`):

```ts
// packages/game-core/src/types/vietlott.ts
/** Neo suy mã kỳ Vietlott. Nhận KỲ BẤT KỲ, không bắt buộc kỳ đầu ngày (overview §4.0). */
export interface VietlottPeriodAnchor {
  /** Ngày quay của kỳ làm neo (YYYY-MM-DD). */
  anchorDrawDate: string;
  /** Giờ quay của kỳ làm neo (HH:mm) — phải nằm trên lịch quay của game. */
  anchorDrawTime: string;
  /** Mã kỳ Vietlott của CHÍNH kỳ đó. String để giữ zero-pad. */
  anchorPeriod: string;
}
```

Mỗi game re-export qua entity barrel và dùng `vietlott?: VietlottPeriodAnchor` trong `GlobalConfig`.
⚠️ **KHÔNG** tạo `KenoVietlottAnchor` / `Bingo18VietlottAnchor` / … — 7 interface giống hệt nhau là
đúng thứ §5 cấm, và khi thêm field sẽ lệch nhau âm thầm.

---

## P0.1 — Bug default `Ngày Vietlott` (7 game, ship ngay)

7 game đang default `todayVN()`, đúng phải là `drawDate` **của chính kỳ đang publish**.

Sửa: `apps/backoffice/src/app/(main)/games/{game}/operations/_lib/sections/draw-management/draw-actions/publish-result-action.tsx`

- ⚠️ Verify từng game xem `drawDate` đã được truyền xuống dialog chưa (`use-draw-context.tsx` /
  `use-operations.ts`); chưa có thì bổ sung prop.
- `currentResult.vietlottRef?.drawDate` (khi sửa kết quả đã publish) vẫn ưu tiên hơn default.

Không phụ thuộc gì trong plan này — làm được ngay.

---

## P0.2 — Invariant server-side (7 game)

Đặt ở **use-case** `publish-result.ts` của từng game, không nhét vào repo:

Không trùng `drawPeriod` với `drawId` khác — query qua index `idx_vietlott_drawPeriod` (sparse),
loại trừ chính `drawId` đang publish/sửa nên sửa lại `vietlottRef` của nó không tự báo trùng.
⚠️ **KHÔNG** đổi thành unique index: dữ liệu cũ có thể đã trùng.

Vi phạm → `AppException.badRequest` chỉ rõ kỳ xung đột (`drawId` + `period`).

⚠️ **Giữ `vietlottRef?` optional.** `undefined` mang ngữ nghĩa "chỉ sửa số, giữ ref cũ"
(`publish-result.ts:81`) → invariant chỉ chạy khi input **có** `vietlottRef`.

### Chốt 30/08 — BỎ check "`drawPeriod` đơn điệu tăng theo `drawTime`"

Bản đầu có thêm check đơn điệu tăng (2 query neighbor `findNearestVietlottRefBefore/After`). Đã xoá
khỏi 7 use-case + 7 repo vì:

- **Trùng vai trò với UI:** dialog publish ĐÃ cảnh báo ngay khi staff nhập lệch `suggestedPeriod`
  (P0.1/§7) — check server chỉ lặp lại việc UI làm, ở thời điểm muộn hơn.
- **Chi phí index thật:** không index nào của 7 game có `drawTime` dẫn đầu → mỗi query neighbor phải
  thêm 1 partial index `{drawTime}` × 7 game, để phục vụ 1 check đã có lớp trước.
- **Chặn sai nghiệp vụ:** backfill kỳ cũ hoặc sửa lại thứ tự sau khi Vietlott nghỉ bị chặn cứng, dù
  dữ liệu đúng.

Đánh đổi: typo ra mã kỳ **chưa ai dùng** giờ lưu được (trước đây bị chặn nếu rơi ra ngoài khoảng
neighbor). Detector còn lại: cảnh báo lệch trên dialog + staff đối chiếu trang Vietlott
([overview §6](00-overview.md)).

⚠️ Invariant còn lại bắt **trùng mã kỳ**, **KHÔNG** bắt được lệch neo ([overview §6](00-overview.md)).
Đừng nhầm là đã có lớp bảo vệ cho ngày Vietlott nghỉ.

---

## P0.3 — Mô hình lịch chung (phủ 3 kiểu)

Ba kiểu lịch ([overview §4.1](00-overview.md)) phải quy về **một** interface, không viết 3 nhánh rời:

```
slotsPerDay(date)     → 0 nếu không phải ngày quay, ngược lại số kỳ trong ngày
slotIndexInDay(time)  → vị trí kỳ trong ngày (null nếu lệch lịch)
```

| Kiểu | Game | `slotsPerDay` | `slotIndexInDay` |
| --- | --- | --- | --- |
| A | Keno, Bingo18 | `computeDrawsPerDay(first, last, interval)` | `(phút − phútĐầu) / interval + 1`, null nếu không nguyên |
| B | Lotto535 | `drawTimes.length` | index trong `drawTimes` sort tăng, +1; null nếu không khớp giờ nào |
| C | Mega645, Power655, Max3D, Max3DPro | `dow ∈ drawDaysOfWeek ? drawTimes.length : 0` | như kiểu B |

Kiểu C = **kiểu B + filter ngày quay**, không phải nhánh riêng. ⚠️ **Không hardcode `slotsPerDay = 1`**
cho kiểu C: hôm nay `drawTimes` chỉ có 1 phần tử, nhưng vận hành thêm giờ quay thứ 2 vào config là đổi
dữ liệu, không đổi code — hardcode sẽ lệch âm thầm ([P4](p4-slow-games.plan.md)).

⚠️ **Mọi giá trị lịch ở đây vào qua tham số, nguồn là config DB** ([P0.0.1](#p001)). Tên field lịch
**khác nhau giữa các game** (Mega645 `drawTime` scalar vs `drawTimes[]` ở 3 game còn lại) → tầng gọi của
từng game tự map sang interface này; helper không biết tên field của game nào.

---

## P0.4 — Helper toán thuần `game-core`

File mới `packages/game-core/src/utils/vietlott-period.ts`, export qua
`packages/game-core/src/utils/index.ts` → `@megawin/game-core/utils`.

Không I/O, **không đọc DB**, không import package application. Tái dùng `@megawin/shared/utils`:
`computeDrawsPerDay`, `parseHHMMToMinutes`, `formatVN`, `toVNDate`.

```ts
/** Vị trí kỳ trong ngày theo lịch. null khi drawTime không nằm trên lịch. */
calcSlotIndex(drawTime: Date, schedule: VietlottDrawSchedule): number | null;

/**
 * Suy mã kỳ từ neo KỲ BẤT KỲ (không phải kỳ đầu ngày — xem overview §4.0).
 * null khi: thiếu neo · lệch lịch · kỳ đích trước ngày neo.
 */
suggestVietlottPeriod(input: {
  target: { drawDate: string; drawTime: Date };
  anchor: VietlottPeriodAnchor;      // ← type chung ở P0.0.2, không nhân bản per-game
  schedule: VietlottDrawSchedule;    // ← LUÔN dựng từ config DB, không từ DEFAULT_* (P0.0.1)
}): string | null;
```

Yêu cầu bắt buộc:

- **KHÔNG import `DEFAULT_*_CONFIG`** trong file này (P0.0.1). Lịch chỉ vào qua tham số `schedule`;
  file thiếu import default là bằng chứng tĩnh cho việc không có fallback ngầm.

- **Giữ zero-pad**: `drawPeriod` là `string` (`"0293483"`). Suy độ rộng từ chính giá trị neo, KHÔNG trả
  `number` rồi format bừa.
- `slotIndex` không nguyên → `null`, **không làm tròn**.
- Thiếu neo → `null`. Chưa cấu hình = chưa bật, **không có fallback đoán**.
- Kỳ đích **trước** ngày neo → `null` (không suy ngược; nếu cần thì đổi neo về mốc sớm hơn).
- Trả **lý do** khi `null` để UI hiện thông báo đúng trường hợp
  ([overview §7.1](00-overview.md)) — dùng `const object as const`, KHÔNG string literal trần.

### P0.4.1 Test (`packages/game-core/test/vietlott-period.test.ts`)

Số thật từ [analysis §4.3](../../analysis/system-draw-result-auto-import.analysis.md): `27/08` kỳ đầu
ngày `#0293476`, kỳ `07:04` là slot 8 → `#0293483`.

- Khớp số thật (xuôi + ngược).
- **Neo là kỳ giữa ngày** (neo = `07:04`/`#0293483`) → suy đúng kỳ khác cùng ngày và ngày sau.
- **Mở thiếu kỳ** (chỉ 06:08, 12:00, 18:00) → vẫn đúng ⇒ chứng minh không phụ thuộc `drawNo`.
- Lệch lịch (07:05 với lưới 8') → `null` + lý do đúng.
- Kỳ trước ngày neo → `null` + lý do đúng.
- Biên: slot 1 và slot cuối (119 / 158).
- Bắc cầu nhiều ngày.
- **Cả 3 kiểu lịch** (A/B/C), gồm kiểu C bỏ qua ngày không quay.

Test thuần hàm, không DB → không chạm rule `test-data-safety`.

---

## P0.5 — API gợi ý

⚠️ **Verify trước:** use-case nào đang nuôi `PublishResultAction` (dialog publish). Hai lựa chọn theo
thứ tự ưu tiên:

1. **Gộp vào output use-case sẵn có** — không thêm round-trip. Ưu tiên phương án này.
2. **Không có use-case phù hợp → tạo route riêng** (chốt 29/08):
   `apps/backoffice/src/app/api/{game}/draws/[drawId]/vietlott-suggestion/route.ts`, `GET`, trả
   `{ suggestedPeriod: string | null, reason: <const> | null }`.

Input của helper lấy từ: config game (neo + lịch) + `drawTime`/`drawDate` của kỳ. **Không** query
`vietlottRef` của kỳ khác ([overview §4.4](00-overview.md)).

⚠️ **Lịch + neo đọc từ `GetGlobalConfigUseCase` (DB), KHÔNG từ `DEFAULT_*_CONFIG`** — xem P0.0.1 và
tiền lệ `create-draw.ts`. Config DB thiếu field lịch → trả `{ suggestedPeriod: null, reason: … }`,
**không** fallback default.

`suggestedDrawDate` = `drawDate` của kỳ (đã fix ở P0.1), độc lập việc có neo hay không.

---

## P0.6 — Nhãn nguồn `DrawResultSource`

`DrawResultSource` (`Manual`/`Import`) hiện **0 call site**. Trước khi
[auto-import](../draw-result-auto-import/00-overview.md) dùng `vietlottRef` để đối chiếu, phải phân
biệt ref do **staff xác nhận** vs ref do **hệ thống suy đoán** — nếu không, lớp đối chiếu tự so với
chính suy đoán của mình (an toàn giả).

⚠️ Kèm ràng buộc [overview §5](00-overview.md): `vietlottRef` chuyển sang dùng cho tài chính hoặc làm
ground truth ⇒ **phải xét lại** toàn bộ quyết định config-only.

---

## P0.7 — Vá analysis doc

`.cursor/analysis/system-draw-result-auto-import.analysis.md` §4.3: thay
`drawNo = drawPeriod − basePeriod + 1` bằng `slotIndex` suy từ `drawTime`, ghi rõ lý do (mở thiếu kỳ →
`drawNo` ≠ vị trí lưới). **Không xoá** nội dung cũ — ghi rõ sai ở đâu để không ai code lại theo nó.

`pnpm format:docs` sau khi sửa (`.md` dùng Prettier, không phải Biome).

---

## Checklist chất lượng

- [ ] `biome check` sạch; không thêm `biome-ignore`.
- [ ] Không dùng `enum` TS — `const object as const` + type dẫn xuất (kể cả enum lý do `null`).
- [ ] Không định nghĩa lại type đã có (`DrawVietlottRef` ở `@megawin/game-core/types`).
- [ ] **Neo dùng `VietlottPeriodAnchor` chung ở `game-core`** — grep `rg 'VietlottAnchor' packages` không
      được ra interface per-game (P0.0.2).
- [ ] **`rg 'DEFAULT_.*_CONFIG' packages/game-core/src/utils/vietlott-period.ts` không match** (P0.0.1).
- [ ] Mọi call site suggest đọc lịch qua `GetGlobalConfigUseCase`, không đọc `DEFAULT_*`.
- [ ] Không indexed-access `Doc["vietlottRef"]` — import named type.
- [ ] `pnpm --filter @megawin/game-core test` xanh.
- [ ] Không sửa `.env*`.
