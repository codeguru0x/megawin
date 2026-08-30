---
name: Vietlott Period — Bingo18
overview: "Áp gợi ý mã kỳ Vietlott cho Bingo18 (lưới 6', 158 kỳ/ngày). Cùng kiểu lịch A với Keno nên gần như copy p1-keno; file này chỉ ghi phần khác biệt."
todos:
  - id: mirror-keno
    content: "Áp toàn bộ P1.1–P1.5 của p1-keno cho Bingo18: config type/default/Zod/use-case, section UI neo, cảnh báo đổi lịch, nối gợi ý, prefill + 5 thông báo, cảnh báo lệch mọi kỳ, dòng lưu ý, tạo kỳ chỉ drawDate"
    status: pending
  - id: schedule-values
    content: "Dùng lưới Bingo18: firstDrawTime 06:06, drawIntervalMinutes 6, lastDrawTime 21:48 → 158 kỳ/ngày (KHÔNG phải 159)"
    status: pending
  - id: verify-e2e
    content: "Kiểm thủ công như P1.6 nhưng với dữ liệu Bingo18 thật (dataset đã verify: kỳ 183496 → 183654 = 158 kỳ)"
    status: pending
---

# Plan P2 — Bingo18

Thiết kế: [`00-overview.md`](00-overview.md) · Helper dùng chung: [`p0-shared.plan.md`](p0-shared.plan.md)
· **Plan tham chiếu: [`p1-keno.plan.md`](p1-keno.plan.md)**.

Bingo18 cùng **kiểu lịch A** với Keno → áp nguyên P1.1–P1.6, chỉ đổi các giá trị dưới đây.

## Khác biệt so với Keno

| | Keno | **Bingo18** |
| --- | --- | --- |
| `firstDrawTime` | `06:08` | **`06:06`** |
| `drawIntervalMinutes` | `8` | **`6`** |
| `lastDrawTime` | `21:52` | **`21:48`** |
| Số kỳ/ngày | 119 | **158** (không phải 159) |
| Package domain | `@megawin/game-keno` | `@megawin/game-bingo18` |
| Type neo | `VietlottPeriodAnchor` (chung) | **giống hệt** — không tạo type riêng |
| Default config | `DEFAULT_KENO_CONFIG` | `DEFAULT_BINGO18_CONFIG` |

⚠️ Cột `Default config` chỉ là **chỗ đặt `vietlott: undefined`**. Khi suggest/tính số kỳ, lịch phải đọc
từ `GlobalConfigDoc` trong DB — xem [P0.0.1](p0-shared.plan.md). Bốn số ở bảng trên là giá trị default
để tham chiếu, **không** phải nguồn tính toán.

Đường dẫn file: thay `keno` → `bingo18` trong mọi path của [`p1-keno.plan.md`](p1-keno.plan.md).

## Lưu ý riêng

- ⚠️ `DEFAULT_BINGO18_CONFIG` khai báo bằng `Pick<...>` (giống Keno) → thêm `vietlott` phải cập nhật cả
  danh sách key trong `Pick`, nếu không TS không thấy field mới.
- Dataset đã verify: kỳ `183496` → `183654` = **158 kỳ** ⇒ dùng chính khoảng này để kiểm thủ công.
- Dialog publish Bingo18 vừa được đổi từ `Select` sang `Input` + có phần Tổng/Lớn-Nhỏ/Chẵn-Lẻ → thêm
  nhóm field Vietlott phải **không** phá layout đó. Đọc file trước khi sửa.

## Checklist

Dùng checklist của [`p1-keno.plan.md`](p1-keno.plan.md), cộng:

- [ ] `Pick<>` trong `DEFAULT_BINGO18_CONFIG` đã có key `vietlott`.
- [ ] Layout phần Tổng / Lớn-Nhỏ / Chẵn-Lẻ không bị phá.
