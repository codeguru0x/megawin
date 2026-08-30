---
name: Vietlott Period — Lotto 5/35
overview: "Áp gợi ý mã kỳ Vietlott cho Lotto 5/35 — kiểu lịch B (drawTimes 13:00 và 21:00, 2 kỳ mọi ngày). Khác Keno ở chỗ không có drawInterval nên slotIndex tính theo vị trí trong drawTimes."
todos:
  - id: mirror-keno
    content: "Áp P1.1–P1.5 của p1-keno cho Lotto535, thay phần lịch bằng kiểu B"
    status: pending
  - id: schedule-type-b
    content: "slotIndex = vị trí anchorDrawTime trong drawTimes (đã sort tăng) + 1. Zod refine: anchorDrawTime PHẢI là một phần tử của drawTimes, không phải khớp lưới"
    status: pending
  - id: config-ui-warning
    content: "Cảnh báo khi đổi drawTimes (thêm/bớt/đổi giờ) rằng neo mã kỳ vô hiệu — đổi drawTimes làm slotIndex của mọi kỳ đổi theo"
    status: pending
  - id: verify-e2e
    content: "Kiểm thủ công: neo từ kỳ 13:00 → suy kỳ 21:00 cùng ngày (Δ=1) và kỳ 13:00 ngày sau (Δ=2)"
    status: pending
---

# Plan P3 — Lotto 5/35

Thiết kế: [`00-overview.md`](00-overview.md) · Helper: [`p0-shared.plan.md`](p0-shared.plan.md)
· **Plan tham chiếu: [`p1-keno.plan.md`](p1-keno.plan.md)**.

Lotto535 là **kiểu lịch B** duy nhất trong 7 game: `drawTimes: ["13:00", "21:00"]` — 2 kỳ/ngày, quay
**mọi ngày**, không có `firstDrawTime`/`drawIntervalMinutes`.

## Khác biệt so với Keno

| | Keno (kiểu A) | **Lotto535 (kiểu B)** |
| --- | --- | --- |
| Cấu hình lịch | `firstDrawTime` + `drawIntervalMinutes` + `lastDrawTime` | **`drawTimes: string[]`** |
| `slotsPerDay` | `computeDrawsPerDay(...)` = 119 | **`drawTimes.length`** = 2 |
| `slotIndexInDay` | `(phút − phútĐầu) / interval + 1` | **vị trí trong `drawTimes` sort tăng, +1** |
| Zod refine neo | `anchorDrawTime` khớp lưới | **`anchorDrawTime` ∈ `drawTimes`** |
| Số kỳ/ngày | 119 | 2 |

Package: `@megawin/game-lotto535` · Chỗ đặt `vietlott: undefined`: `DEFAULT_LOTTO535_CONFIG`
(ở `src/rules/jackpot.ts`, **không** phải `financials.ts`).

⚠️ Lịch dùng để suggest/tính kỳ đọc từ `GlobalConfigDoc` trong DB, không từ `DEFAULT_LOTTO535_CONFIG` —
xem [P0.0.1](p0-shared.plan.md).

## Cấu hình `vietlott` có giống nhau ở 7 game không? — CÓ, và phải giữ giống

Chốt (29/08): **thống nhất tuyệt đối** 3 phần, chỉ khác duy nhất luật `.refine()`.

| Phần | Giống nhau? | Chi tiết |
| --- | --- | --- |
| Type neo | ✅ **một** type chung | `VietlottPeriodAnchor` ở `@megawin/game-core/types` ([P0.0.2](p0-shared.plan.md)). KHÔNG có `Lotto535VietlottAnchor` |
| Tên field trong `GlobalConfig` | ✅ giống | `vietlott?: VietlottPeriodAnchor` ở cả 7 game |
| Base Zod object | ✅ giống | `anchorDrawDate` `YYYY-MM-DD` · `anchorDrawTime` `HH:mm` · `anchorPeriod` `^\d+$` **string** |
| Giá trị neo | ❌ **riêng từng game** | Mỗi game 1 dải mã kỳ riêng trên Vietlott (chốt của user) |
| `.refine()` | ❌ khác theo kiểu lịch | A: khớp lưới · **B: ∈ `drawTimes`** · C: `anchorDrawDate` là ngày quay + khớp `drawTime` |

Lý do siết giống nhau: 7 interface cùng shape là đúng thứ `code-quality-standards.mdc` §5 cấm; khi thêm
field (vd `anchorNote`) mà mỗi game 1 type thì sẽ lệch âm thầm, và helper `game-core` phải nhận 7 shape
khác nhau.

Chỉ `.refine()` được khác — vì nó validate neo **so với lịch của chính game đó**, và 3 kiểu lịch thật sự
khác nhau ([P0.3](p0-shared.plan.md)).

## Lưu ý riêng

- ⚠️ **`drawTimes` phải sort tăng trước khi lấy index.** Nếu config lưu `["21:00","13:00"]` mà code tin
  vào thứ tự mảng thì `slotIndex` đảo ⇒ suy sai. Sort trong helper, không tin thứ tự lưu.
- `DrawDoc` Lotto535 đã có comment `Số thứ tự kỳ quay trong ngày (1 = 13h, 2 = 21h)` → khớp đúng
  `slotIndex` kiểu B. ⚠️ Nhưng **không** dùng field đó thay `slotIndex`: nó là `drawNo` (counter ta
  tạo) — đúng ở đây chỉ vì trùng hợp mở đủ 2 kỳ. Vẫn suy từ `drawTime` theo
  [overview §3](00-overview.md).
- Đổi `drawTimes` (thêm/bớt/đổi giờ) làm `slotIndex` của **mọi** kỳ đổi ⇒ neo vô hiệu. Cảnh báo trong
  UI cấu hình tương đương P1.2.1.

## Kiểm thủ công

1. Neo từ kỳ `13:00` → kỳ `21:00` cùng ngày phải là `anchorPeriod + 1`.
2. → kỳ `13:00` ngày sau phải là `anchorPeriod + 2`.
3. Neo từ kỳ `21:00` → kỳ `13:00` cùng ngày phải trả **null** (kỳ trước neo trong cùng ngày).

## Checklist

Dùng checklist của [`p1-keno.plan.md`](p1-keno.plan.md), cộng:

- [ ] Helper sort `drawTimes` trước khi lấy index, không tin thứ tự lưu.
- [ ] Zod refine kiểm `anchorDrawTime ∈ drawTimes`; base object 3 field **giống 6 game còn lại**.
- [ ] Dùng `VietlottPeriodAnchor` chung — không có `Lotto535VietlottAnchor`.
- [ ] `drawTimes` đọc từ config DB, không từ `DEFAULT_LOTTO535_CONFIG`.
- [ ] Không dùng `drawNo`/`drawIndex` của `DrawDoc` thay cho `slotIndex`.
