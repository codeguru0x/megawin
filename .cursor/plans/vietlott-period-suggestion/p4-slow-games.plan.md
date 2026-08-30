---
name: Vietlott Period — 4 game quay chậm
overview: "Áp gợi ý mã kỳ Vietlott cho Mega645, Power655, Max3D, Max3DPro — kiểu lịch C (theo thứ trong tuần, 1 kỳ/ngày quay). Gộp 1 plan vì 4 game gần như giống nhau, chỉ khác drawDaysOfWeek."
todos:
  - id: config-source
    content: "CHẶN: drawDaysOfWeek + giờ quay lấy từ GlobalConfigDoc trong DB (GetGlobalConfigUseCase), TUYỆT ĐỐI không DEFAULT_*_CONFIG. Thiếu field → null, không fallback"
    status: pending
  - id: field-name-map
    content: "Map tên field khác nhau: Mega645 drawTime (scalar) vs Power655/Max3D/Max3DPro drawTimes (string[]). slotsPerDay = drawTimes.length, KHÔNG hardcode 1, không đọc drawsPerDay"
    status: pending
  - id: measure-dataset
    content: "P0 ĐO TRƯỚC: dataset từng game xác nhận drawPeriod tăng đúng 1 mỗi kỳ theo lịch drawDaysOfWeek. Chưa đo xong thì KHÔNG bật game đó"
    status: pending
  - id: mega645
    content: "Mega 6/45 — default drawDaysOfWeek [0,3,5] (CN, T4, T6), drawTime scalar 18:00. Áp P1.1–P1.5 kiểu lịch C, lịch đọc từ config DB"
    status: pending
  - id: power655
    content: "Power 6/55 — default [2,4,6] (T3, T5, T7), dùng drawTimes[]. Áp tương tự Mega645"
    status: pending
  - id: max3d
    content: "Max 3D — default [1,3,5] (T2, T4, T6), dùng drawTimes[]. Áp tương tự"
    status: pending
  - id: max3dpro
    content: "Max 3D Pro — default [2,4,6] (T3, T5, T7), dùng drawTimes[]. Dải period RIÊNG, không dùng chung với Max3D"
    status: pending
  - id: verify-e2e
    content: "Mỗi game: neo từ 1 kỳ → suy kỳ quay kế tiếp (Δ=1 dù cách 2-3 ngày lịch) + kỳ cách vài tuần. Kiểm cả khi đổi drawDaysOfWeek trong DB"
    status: pending
---

# Plan P4 — Mega645, Power655, Max3D, Max3DPro

Thiết kế: [`00-overview.md`](00-overview.md) · Helper: [`p0-shared.plan.md`](p0-shared.plan.md)
· **Plan tham chiếu: [`p1-keno.plan.md`](p1-keno.plan.md)**.

4 game này đều **kiểu lịch C**: `drawDaysOfWeek` + `drawTime`, **1 kỳ mỗi ngày quay**. Gộp 1 plan vì
khác biệt giữa chúng chỉ là `drawDaysOfWeek`.

## ⚠️ Đo dataset trước khi bật (chặn riêng plan này)

Vận hành xác nhận 29/08 counter 4 game này cũng tăng đều 1. Vẫn **đo bằng dataset** trước khi bật:
query kỳ đã có `vietlottRef`, sort theo `drawTime`, kiểm `Δperiod` = số **ngày quay** theo
`drawDaysOfWeek` giữa 2 mốc (không phải số ngày lịch).

Game nào chưa đo xong → **không bật** cho game đó. Không chặn Keno/Bingo18/Lotto535.

## ⚠️ Lịch PHẢI đọc từ game config trong DB, KHÔNG dùng `DEFAULT_*_CONFIG`

Chốt 29/08 (yêu cầu user): `drawDaysOfWeek` / giờ quay dùng để suggest và tính số kỳ **bắt buộc** lấy từ
`GlobalConfigDoc` trong DB qua `GetGlobalConfigUseCase` — xem [P0.0.1](p0-shared.plan.md) cho bằng chứng
default code lệch DB (case Keno `06:00` vs `06:08`).

Với kiểu C hậu quả **nặng hơn** kiểu A: `drawDaysOfWeek` sai 1 phần tử không làm lệch 1 kỳ mà làm lệch
**toàn bộ phép đếm ngày quay** từ neo trở đi, và độ lệch **tăng dần** theo khoảng cách tới neo.

Ví dụ: DB đã đổi Mega645 sang `[0, 3, 5, 6]` (thêm T7) mà code tính bằng `DEFAULT_MEGA645_CONFIG`
`[0, 3, 5]` → sau 4 tuần lệch 4 kỳ, sau 3 tháng lệch ~13 kỳ. Không ai phát hiện qua 1 kỳ đơn lẻ.

- Config DB thiếu `drawDaysOfWeek` hoặc giờ quay → trả `null` (không gợi ý). **Không** fallback default.
- ⚠️ `drawDaysOfWeek = []` (mảng rỗng) là **hợp lệ về kiểu** nhưng nghĩa là không có ngày quay nào →
  phải trả `null`, KHÔNG được chia cho 0 hay lặp vô hạn khi đếm ngày quay.

## ⚠️ Tên field giờ quay KHÔNG nhất quán giữa 4 game

Đã verify trong `entities/types.ts` — đừng giả định giống nhau:

| Game | Field giờ quay | Field phụ |
| --- | --- | --- |
| Mega 6/45 | **`drawTime: string`** (scalar) | `drawsPerWeek` |
| Power 6/55 | **`drawTimes: string[]`** | `drawsPerDay` |
| Max 3D | **`drawTimes: string[]`** | `drawsPerDay` |
| Max 3D Pro | **`drawTimes: string[]`** | `drawsPerDay` |

Hệ quả:

- Tầng gọi của **mỗi** game tự map config → `VietlottDrawSchedule` ([P0.3](p0-shared.plan.md)); helper
  `game-core` **không** đọc tên field cụ thể của game nào.
- Với 3 game dùng `drawTimes: string[]`: `slotsPerDay` = **`drawTimes.length`** khi `dow` là ngày quay,
  **không hardcode 1**. Nếu vận hành thêm giờ quay thứ 2 vào mảng mà code cứng `1` → lệch âm thầm.
  ⇒ Kiểu C thực chất là **kiểu B có thêm filter ngày quay**, không phải kiểu riêng.
- ⚠️ **Không** dùng `drawsPerDay`/`drawsPerWeek` làm nguồn tính `slotsPerDay` — đó là field khai báo rời,
  có thể lệch với `drawTimes.length`. Nguồn chân lý là danh sách giờ quay.

## Khác biệt so với Keno

| | Keno (kiểu A) | **4 game này (kiểu C)** |
| --- | --- | --- |
| Cấu hình lịch | `firstDrawTime` + `interval` + `lastDrawTime` | **`drawDaysOfWeek` + `drawTime`/`drawTimes`** |
| `slotsPerDay(date)` | 119 | **`drawTimes.length` nếu `dow ∈ drawDaysOfWeek`, ngược lại 0** |
| `slotIndexInDay` | `(phút − phútĐầu)/interval + 1` | **vị trí trong danh sách giờ quay** (null nếu không khớp giờ nào) |
| Bắc cầu ngày | `daysBetween × 119` | **đếm số NGÀY QUAY giữa 2 mốc × slotsPerDay** |
| Zod refine neo | `anchorDrawTime` khớp lưới | **`anchorDrawDate` phải là ngày quay** + `anchorDrawTime` ∈ danh sách giờ quay |

⚠️ Điểm sai dễ mắc nhất: bắc cầu bằng `daysBetween` thay vì đếm **ngày quay**. Từ T6 sang T2 là 4 ngày
lịch nhưng chỉ **1 kỳ** → `Δperiod = 1`, không phải 4.

## Bảng riêng từng game

Giá trị `drawDaysOfWeek` dưới đây là **default trong code, chỉ để tham chiếu** — runtime luôn đọc từ
config DB (xem cảnh báo đầu file). Cột cuối là **chỗ đặt `vietlott: undefined`**, không phải nguồn tính.

| Game | `drawDaysOfWeek` (default) | Ngày quay | Package | Nơi đặt `vietlott: undefined` |
| --- | --- | --- | --- | --- |
| Mega 6/45 | `[0, 3, 5]` | CN, T4, T6 | `@megawin/game-mega645` | `DEFAULT_MEGA645_CONFIG` (`rules/jackpot.ts`) |
| Power 6/55 | `[2, 4, 6]` | T3, T5, T7 | `@megawin/game-power655` | `DEFAULT_POWER655_CONFIG` (`rules/jackpot.ts`) |
| Max 3D | `[1, 3, 5]` | T2, T4, T6 | `@megawin/game-max3d` | `DEFAULT_MAX3D_CONFIG` (`rules/defaults.ts`) |
| Max 3D Pro | `[2, 4, 6]` | T3, T5, T7 | `@megawin/game-max3dpro` | `DEFAULT_MAX3D_PRO_CONFIG` (`rules/defaults.ts`) |

Type neo: `VietlottPeriodAnchor` chung ở `@megawin/game-core/types` cho cả 4 game
([P0.0.2](p0-shared.plan.md)) — không tạo type riêng per-game.

✅ **Max3D và Max3DPro có dải `drawPeriod` RIÊNG** dù Max3DPro quay cùng thứ với Power655 — xác nhận
vận hành 29/08. Mỗi game một neo riêng, không dùng chung.

## Lưu ý riêng

- Số kỳ ít (≈3 kỳ/tuần) ⇒ lợi ích prefill nhỏ hơn Keno/Bingo18 rất nhiều. **Ưu tiên thấp nhất.** Nếu
  chi phí vượt kỳ vọng thì hoãn 4 game này, không ảnh hưởng gì tới 3 game trước.
- Ngược lại, rủi ro cũng thấp hơn: staff nhập ~3 kỳ/tuần nên đối chiếu từng kỳ là khả thi thật.
- Max3D/Max3DPro publish result là **20 triplet theo 4 hạng giải** (đã có chức năng paste) → nhóm field
  Vietlott phải không phá layout đó. Đọc file trước khi sửa.

## Kiểm thủ công (mỗi game)

1. Neo từ 1 kỳ → suy kỳ quay **kế tiếp**: phải là `anchorPeriod + 1` dù cách 2–3 ngày lịch.
2. Suy kỳ cách vài tuần → so với trang Vietlott thật.
3. Mở kỳ có `drawDate` **không** phải ngày quay (nếu tồn tại do sửa lịch tay) → phải trả **null**.

## Checklist

Dùng checklist của [`p1-keno.plan.md`](p1-keno.plan.md), cộng:

- [ ] `drawDaysOfWeek` + giờ quay đọc từ **config DB**, `rg 'DEFAULT_(MEGA645|POWER655|MAX3D|MAX3D_PRO)_CONFIG'` không xuất hiện trong đường suggest.
- [ ] Config thiếu `drawDaysOfWeek` / giờ quay → `null`; `drawDaysOfWeek = []` không treo vòng lặp.
- [ ] Map đúng tên field từng game: Mega645 `drawTime` scalar, 3 game còn lại `drawTimes[]`.
- [ ] `slotsPerDay` = `drawTimes.length`, **không hardcode 1**, không đọc `drawsPerDay`/`drawsPerWeek`.
- [ ] Bắc cầu đếm **ngày quay**, KHÔNG phải `daysBetween`.
- [ ] Zod refine kiểm `anchorDrawDate` là ngày quay hợp lệ.
- [ ] Dùng `VietlottPeriodAnchor` chung; mỗi game một **giá trị** neo riêng (Max3D ≠ Max3DPro).
- [ ] Layout paste 20 triplet (Max3D/Max3DPro) không bị phá.
