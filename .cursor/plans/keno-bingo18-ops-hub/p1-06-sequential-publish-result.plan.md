# P1-06 — Sequential Publish Result (Nhập kết quả liên tiếp — Keno + Bingo18)

> **Tách từ:** [`p1-05-ui-redesign.plan.md#b3b`](./p1-05-ui-redesign.plan.md#b3b-nhập-kết-quả-trong-hub--không-làm-bulk-publish-đã-điều-tra-code)
> (08/09/2026, theo yêu cầu tách file ở [`p1-08-tab-redesign-polish-round3.plan.md`](./p1-08-tab-redesign-polish-round3.plan.md)
> §9 Q7). **CHƯA CODE.**
>
> Liên quan: [`00-overview.md`](./00-overview.md).

## 1. Bối cảnh — vì sao KHÔNG làm bulk publish

Câu hỏi gốc: *"Trong UI đã cho phép nhập kết quả chưa? Nếu duyệt kết quả nhiều draw liên tục có
nên làm thế không?"*

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
| `KENO_DRAW_COUNT = 20` vs `BINGO18_DRAW_COUNT = 3` | 6 kỳ = **120 ô input** trong 1 dialog — không ai kiểm được bằng mắt |
| `useVietlottSuggestion(drawId)` — gợi ý **mã kỳ Vietlott riêng từng kỳ** | Bulk phải fetch N suggestion, mỗi kỳ 1 mã khác → không thể nhập 1 lần |
| `useVietlottResult(drawId, period)` + autofill Rule A | Autofill chỉ chạy khi **toàn bộ 20 ô rỗng**, có chủ đích chống kết quả "lai". Nhân N kỳ thì quy tắc này vô nghĩa |
| `diffResultNumbers` + highlight ô lệch + nút "Áp dụng" | Cơ chế **đối chiếu người-vs-nguồn** từng ô. Bulk sẽ phải bỏ → mất lớp kiểm tra cuối |
| `periodMismatch` — cảnh báo mềm khi mã kỳ lệch gợi ý | Comment trong code ghi rõ đây là *"detector duy nhất phát hiện neo đã cũ"* |
| `defaultVietlotDate = displayVNDate(draw.scheduledDrawAt)` + comment *"đã xảy ra thực tế"* | Từng có bug lệch 1 ngày. Bulk làm rủi ro này nhân N |
| `handleGridPaste` — dán sai số lượng thì **từ chối**, không đoán | Comment: *"đường tiền không cho phép đoán"* |

Kết quả xổ số là **input gốc của toàn bộ dòng tiền** — sai 1 số ở 1 kỳ là trả sai tiền cho toàn
bộ vé kỳ đó. Đây là chỗ duy nhất trong hệ thống mà **chậm lại là tính năng, không phải nhược điểm**.

## 2. Giải pháp — luồng "nhập liên tiếp" (sequential), CHỈ Keno + Bingo18

**⚠️ Sửa lại nhận định SAI ở bản plan trước:** đã có nhận định _"sửa component dùng chung 7
game"_. Điều đó **SAI**. Đã verify bằng `wc -l` từng file — mỗi game có **file riêng biệt**,
không share:

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

**Phạm vi — chỉ 2 game (chốt theo yêu cầu):**

| Game           | Kỳ/ngày  | Có luồng nhập liên tiếp?                              |
| -------------- | -------- | ----------------------------------------------------- |
| **Keno**       | ~119–128 | ✅ Có                                                 |
| **Bingo18**    | ~119     | ✅ Có                                                 |
| 5 game còn lại | 1–2      | ❌ Không — nhập 1 kỳ là xong, thêm nút chỉ gây rối    |

## 3. Thiết kế dialog

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

Phân tầng 3 nút theo mức độ chú ý:

| Nút                            | Variant                    | Hành vi                                              | Khi nào hiện             |
| ------------------------------ | -------------------------- | ---------------------------------------------------- | ------------------------ |
| `Huỷ bỏ`                       | `ghost`                    | đóng dialog, không lưu                               | luôn                     |
| `Xác nhận`                     | **`outline`** (ít chú ý)   | lưu → **đóng** dialog (hành vi cũ)                   | luôn                     |
| **`Xác nhận & Kỳ tiếp ▶`**     | **`default`** (main)       | lưu → **giữ** dialog → load kỳ chưa có KQ tiếp theo  | chỉ khi `queue.length>1` |

Khi ở **kỳ cuối** hàng đợi: `[Xác nhận & Kỳ tiếp]` tự ẩn, `[Xác nhận]` **đổi sang
`variant="default"`** (thành main button) — không để dialog rơi vào trạng thái không có nút chính.

## 4. Hành vi "Xác nhận & Kỳ tiếp" — chi tiết bắt buộc

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

## 5. Hàng đợi lấy từ đâu

- **Trang `operations`:** lọc `draws` (đã có sẵn từ `useDrawSelectorList`) theo
  `status === SalesClosed`, sort `drawTime` tăng dần.
- **Hub:** hàng đợi = `state.rows5A` tab "Chưa có KQ" (đã sort sẵn).

## 6. Điểm kỹ thuật phát hiện khi đọc code

`PublishResultAction` hiện nhận `draw: DrawSelectorItem` — type thuộc DTO trang `operations`, **Hub
không có** (Hub dùng `DerivedRow` từ `hub-snapshot`). Dialog thực tế chỉ dùng 3 field: `drawId`,
`scheduledDrawAt`, `drawTime`.

→ Tách type hẹp
`PublishResultDraw = Pick<DrawSelectorItem, "drawId" | "scheduledDrawAt" | "drawTime">`
để Hub tái dùng dialog mà không phải fetch cả `DrawSelectorItem`. Đây là điều kiện tiên quyết nếu
sau này muốn mở dialog **ngay trong Hub** thay vì mở tab mới.

## 7. Props thêm vào (tương thích ngược 100%)

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

## 8. Phạm vi & thứ tự

Chỉ sửa 2 file (`keno/…/publish-result-action.tsx`, `bingo18/…/publish-result-action.tsx`). Code
đường tiền, cần review riêng, không trộn vào PR redesign UI Hub.

Trong Hub (đã làm ở p1-05/p1-07/p1-08): expand panel của kỳ `SalesClosed`/"Chưa có KQ" chỉ có nút
**"Nhập kết quả ↗" / "Công bố kết quả ↗"** → mở tab mới sang `operations?draw=<drawId>` (pattern
đã có). Khi P1-06 code xong, nút này có thể **thay** bằng mở dialog sequential ngay trong Hub
(không cần mở tab mới) — nhưng đó là việc của lúc code P1-06, không phải trước đó.

## 9. Phụ thuộc

`p1-07` (đã done) — dùng lại style nút/dialog đồng bộ đã chuẩn hoá ở đó.
