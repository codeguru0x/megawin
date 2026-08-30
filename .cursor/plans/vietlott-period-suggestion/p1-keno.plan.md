---
name: Vietlott Period — Keno
overview: "Áp gợi ý mã kỳ Vietlott cho Keno (lưới 8', 119 kỳ/ngày) — game ưu tiên số 1. Thêm section vietlott vào game config (neo = kỳ bất kỳ), gợi ý + prefill trong dialog publish, thông báo riêng cho từng trường hợp không suy được, cảnh báo lệch ở mọi kỳ. ĐÂY LÀ PLAN THAM CHIẾU cho 6 game còn lại."
todos:
  - id: config-type
    content: "packages/game-keno/src/entities/types.ts — thêm field vietlott?: VietlottPeriodAnchor (type CHUNG từ @megawin/game-core/types, P0.0.2) vào GlobalConfig + re-export qua entity barrel. KHÔNG tạo KenoVietlottAnchor riêng"
    status: pending
  - id: config-default
    content: "packages/game-keno/src/rules/financials.ts — DEFAULT_KENO_CONFIG.vietlott để UNDEFINED (chưa cấu hình = chưa bật). TUYỆT ĐỐI không hardcode mã kỳ"
    status: pending
  - id: config-zod
    content: "apps/backoffice/src/app/api/keno/config/_lib/schema.ts — Zod cho section vietlott: anchorDrawDate YYYY-MM-DD, anchorDrawTime HH:mm khớp lưới, anchorPeriod ^\\d+$. KHÔNG validate lại ở use-case"
    status: pending
  - id: config-usecase
    content: "update-game-config.ts (keno) — merge section vietlott mới, giữ pattern merge sẵn có"
    status: pending
  - id: config-ui
    content: "apps/backoffice/.../keno/config/game/_lib/vietlott-anchor-section.tsx — section UI RIÊNG (không nhét vào play-rules-section). Nhập {ngày, giờ quay, mã kỳ} của kỳ bất kỳ"
    status: pending
  - id: config-ui-warning
    content: "play-rules-section.tsx (keno) — cảnh báo khi đổi firstDrawTime/drawIntervalMinutes/lastDrawTime rằng neo mã kỳ hiện tại sẽ vô hiệu"
    status: pending
  - id: suggest-wire
    content: "Nối gợi ý vào dialog publish Keno: đọc neo + LỊCH TỪ CONFIG DB (GetGlobalConfigUseCase, KHÔNG DEFAULT_KENO_CONFIG) + drawTime kỳ → helper game-core. Theo P0.5"
    status: pending
  - id: ui-prefill
    content: "publish-result-action.tsx (keno) — prefill drawPeriod khi suy được; để trống + thông báo đúng nguyên nhân khi null (5 trường hợp overview §7.1)"
    status: pending
  - id: ui-mismatch-warning
    content: "Cảnh báo khi staff nhập ≠ gợi ý — hiện ở MỌI kỳ, nêu cả 2 giá trị + yêu cầu cập nhật neo. Vẫn cho lưu (không chặn cứng)"
    status: pending
  - id: ui-notice-line
    content: "1 dòng lưu ý dưới nhóm field Vietlott nhắc đối chiếu mã kỳ với trang Vietlott. KHÔNG được gộp vào đợt bỏ hint trước đó — đây là detector duy nhất"
    status: pending
  - id: create-draw-date
    content: "create-draw-action.tsx (keno) — nếu form CÓ ô Vietlott thì điền sẵn drawDate của kỳ. TUYỆT ĐỐI không ghi drawPeriod. Verify trước, chưa có ô thì bỏ qua"
    status: pending
  - id: verify-e2e
    content: "Kiểm thủ công: nhập neo từ 1 kỳ giữa ngày → mở kỳ khác cùng ngày và ngày sau, so mã kỳ gợi ý với trang Vietlott thật"
    status: pending
---

# Plan P1 — Keno (plan tham chiếu)

Thiết kế + lý do các quyết định: [`00-overview.md`](00-overview.md).
Helper + fix dùng chung: [`p0-shared.plan.md`](p0-shared.plan.md) — **phải xong trước**.

> **Đây là plan tham chiếu.** 6 game còn lại chỉ ghi phần **khác biệt** so với file này.

Keno: kiểu lịch **A** — lưới `06:08` + `8'` → `21:52`, **119 kỳ/ngày**. Ưu tiên số 1 vì số kỳ nhiều
nhất cùng Bingo18.

---

## P1.1 — Section `vietlott` trong game config

### Type — dùng type CHUNG, không tạo `KenoVietlottAnchor`

Neo dùng `VietlottPeriodAnchor` ở `@megawin/game-core/types` (định nghĩa tại
[P0.0.2](p0-shared.plan.md)) — 7 game shape giống hệt nhau, nhân bản là vi phạm
`code-quality-standards.mdc` §5.

`packages/game-keno/src/entities/types.ts`:

```ts
import type { VietlottPeriodAnchor } from "@megawin/game-core/types";

// GlobalConfig — optional, chưa cấu hình = chưa bật gợi ý.
vietlott?: VietlottPeriodAnchor;
```

Re-export qua entity barrel để UI/route import từ `@megawin/game-keno/entities` như các type khác
(cùng cách `DrawVietlottRef` đang được re-export).

### Default

`packages/game-keno/src/rules/financials.ts` — `DEFAULT_KENO_CONFIG.vietlott` để **undefined**.
⚠️ **Tuyệt đối không** hardcode mã kỳ vào code: nó là dữ liệu vận hành, không phải hằng số nghiệp vụ.

### Zod (route)

`apps/backoffice/src/app/api/keno/config/_lib/schema.ts`:

- `anchorDrawDate`: `YYYY-MM-DD`.
- `anchorDrawTime`: `HH:mm` (dùng `HHMM_PATTERN` sẵn có).
- `anchorPeriod`: `^\d+$` — **string**, không `number` (giữ zero-pad).
- `.refine()`: `anchorDrawTime` phải nằm **đúng trên lưới** `firstDrawTime + k×interval` và
  `≤ lastDrawTime`. Đây là chỗ bắt lỗi nhập neo sớm nhất và rẻ nhất.

⚠️ **Base object schema (3 field) giống nhau ở cả 7 game — chỉ `.refine()` khác theo kiểu lịch.** Giữ
3 field đúng tên/kiểu/pattern như trên ở mọi game; đừng game này dùng `anchorPeriod: z.number()`, game
kia `z.string()`.

Theo `code-quality-standards.mdc` §8: **không** validate lại ở use-case.

### Use-case

`update-game-config.ts` (keno) — merge section `vietlott`, theo đúng pattern merge sẵn có.

---

## P1.2 — UI cấu hình

File mới `apps/backoffice/src/app/(main)/games/keno/config/game/_lib/vietlott-anchor-section.tsx`.
Section **riêng**, KHÔNG nhét vào `play-rules-section.tsx` (`play` là cấu hình gameplay).

3 ô: **Ngày quay · Giờ quay · Mã kỳ Vietlott** — của **một kỳ bất kỳ** staff đang nhìn thấy trên trang
Vietlott. Kèm mô tả ngắn: lấy từ kỳ nào cũng được, càng gần hiện tại càng tốt.

⚠️ **Không** cần bộ đếm read-only để staff tự kiểm phép tính — vì staff không còn phải tính gì
([overview §4.0](00-overview.md)). Bản plan trước có mục này, đã bỏ.

### P1.2.1 Cảnh báo ở section lịch quay

`play-rules-section.tsx` (keno): khi staff đổi `firstDrawTime` / `drawIntervalMinutes` /
`lastDrawTime` → cảnh báo **neo mã kỳ hiện tại sẽ vô hiệu**, cần cập nhật lại. Lưới đổi ⇒ `slotIndex`
đổi ⇒ mọi phép suy sai.

---

## P1.3 — Nối gợi ý vào dialog publish

Theo [P0.5](p0-shared.plan.md): ưu tiên gộp vào use-case đang nuôi `PublishResultAction`; không có thì
tạo route riêng.

Input cho helper: `config.vietlott` (neo) + `config.play` (lịch) + `drawTime`/`drawDate` của kỳ.
**Không** query `vietlottRef` của kỳ khác.

---

## P1.4 — Dialog publish: prefill + thông báo

`apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions/publish-result-action.tsx`

### Prefill

- Suy được → prefill `drawPeriod`.
- `null` → **để trống** + thông báo đúng nguyên nhân (bảng dưới).
- `drawDate` luôn = `drawDate` của kỳ (fix ở [P0.1](p0-shared.plan.md)), độc lập có neo hay không.

### 5 trạng thái, 5 thông báo khác nhau

Chốt 29/08: **không gộp** thành một câu chung chung — nguyên nhân khác nhau thì việc cần làm khác nhau
([overview §7.1](00-overview.md)).

| Trạng thái | Thông báo phải nói |
| --- | --- |
| Chưa cấu hình neo | "Chưa cấu hình neo mã kỳ" + link tới cấu hình game |
| Kỳ trước ngày neo | Neo chỉ suy được từ ngày neo trở đi → nhập tay, hoặc đổi neo về mốc sớm hơn |
| Giờ quay lệch lưới | Giờ quay không nằm trên lịch chuẩn (thường do sửa giờ tay) → nhập tay |
| Lịch đã đổi sau ngày neo | Neo cũ không còn hiệu lực → cập nhật neo |
| **Staff nhập ≠ gợi ý** | Nêu **cả 2 giá trị** + **yêu cầu cập nhật neo** để các kỳ sau tự tính đúng |

### Cảnh báo lệch — hiện ở MỌI kỳ

Chốt 29/08. Lý do: mọi kỳ đều suy từ **cùng một neo**, nên một kỳ lệch ⇒ neo đã cũ ⇒ **tất cả** kỳ sau
sẽ lệch. Không giới hạn ở kỳ đầu ngày.

Cảnh báo **mềm** — vẫn cho lưu. Vietlott nhảy số là tình huống thật, chặn cứng sẽ khoá vận hành.

### Dòng lưu ý

1 dòng dưới nhóm field Vietlott: nhắc đối chiếu mã kỳ với trang Vietlott.

⚠️ **Không phải hint trang trí.** Đây là **detector duy nhất** của thiết kế
([overview §4.3](00-overview.md)) — không được gộp vào đợt "bỏ hint" đã làm cho Max3D/Bingo18/Keno
trước đó.

---

## P1.5 — Tạo kỳ

`create-draw-action.tsx` (keno): nếu form tạo kỳ **có** ô Vietlott thì điền sẵn `drawDate` = `drawDate`
của kỳ.

⚠️ Verify trước — nếu form tạo kỳ chưa có ô Vietlott thì **không thêm ô mới**, bỏ qua bước này.

⚠️ **Tuyệt đối không** ghi `vietlottRef.drawPeriod` suy đoán vào DB
([overview §8](00-overview.md)) — sai hàng loạt không ai đối chiếu + hỏng tính chọn lọc index sparse.

---

## P1.6 — Kiểm thủ công

1. Cấu hình neo từ **một kỳ giữa ngày** (vd `07:04`), không phải kỳ đầu ngày → xác nhận suy đúng.
2. Mở kỳ khác **cùng ngày** → so mã kỳ gợi ý với trang Vietlott thật.
3. Mở kỳ **ngày sau** → so tiếp (kiểm phép bắc cầu qua ngày).
4. Nhập giá trị **khác** gợi ý → xác nhận cảnh báo nổ + nội dung nhắc cập nhật neo.
5. Mở kỳ có ngày **trước** ngày neo → xác nhận để trống + thông báo đúng loại.

---

## Checklist

- [ ] `biome check` sạch trên file đã sửa.
- [ ] Dùng `VietlottPeriodAnchor` chung — **không** có `KenoVietlottAnchor` trong repo.
- [ ] Lịch quay lấy từ `GlobalConfigDoc` (DB), **không** `DEFAULT_KENO_CONFIG` — xem [P0.0.1](p0-shared.plan.md).
- [ ] Zod `.refine()` chặn `anchorDrawTime` lệch lưới.
- [ ] `anchorPeriod` là `string`, zero-pad không bị mất.
- [ ] Dòng lưu ý đối chiếu **có mặt** (không bị coi là hint để xoá).
- [ ] Cảnh báo lệch hiện ở mọi kỳ, không chỉ kỳ đầu ngày.
- [ ] Không ghi `drawPeriod` lúc tạo kỳ.
