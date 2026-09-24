---
name: ""
overview: ""
todos: []
isProject: false
---

# Lotto 5/35, Mega 6/45 & Power 6/55 Operations — UX/Vận hành Upgrade Plan

> **Trạng thái:** ✅ Đã implement xong (trừ §7 — KPI card Jackpot, bỏ theo yêu cầu vì đã có
> component Jackpot ở đầu trang). Verify: `check-types` 3 application package + backoffice đều PASS;
> lint không phát sinh lỗi mới (xem §8).
> **Phạm vi:** `apps/backoffice/src/app/(main)/games/{lotto535,mega645,power655}/operations/**`
> + backend DTO/use-case draw-selector 3 game (bổ sung `scheduledDrawAt`).
> **Baseline:** [`max3d-max3dpro-operations-ux-upgrade.plan.md`](./max3d-max3dpro-operations-ux-upgrade.plan.md)
> (đã implement xong) + [`keno-operations-ux-upgrade.plan.md`](./keno-operations-ux-upgrade.plan.md).
> **Đặc thù chung 3 game:** đều có **Jackpot** (Lotto535: JP + split cycle; Mega645: JP đơn; Power655:
> **JP kép JP1+JP2 + overflow**). KPI đều **tách 2 file** (`index.tsx` data + `kpi-strip.tsx` UI) và có
> **6 card giống hệt nhau** → khác Max3D (gộp 1 `index.tsx`, 5 card). Financial summary **cả 3 đã hoàn
> thiện, xử lý jackpot đầy đủ, KHÔNG có bug → KHÔNG đụng.**
> **Gộp 1 plan:** 3 game đồng nhất gần như từng dòng ở command-center / DTO / KPI layout → mirror cùng bộ
> thay đổi, chỉ khác lịch quay, màu Live badge, ngưỡng large-bet và chi tiết jackpot.

---

## 0. Audit hiện trạng (3 subagent đã khảo sát, có file:line bằng chứng)

| Hạng mục | lotto535 | mega645 | power655 | Hành động |
|---|---|---|---|---|
| **P0** DTO `scheduledDrawAt` | 🔴 Thiếu | 🔴 Thiếu | 🔴 Thiếu | **Làm trước P1-A** |
| **P1-A** Countdown + Overdue | 🔴 Countdown local, không Overdue | 🔴 Countdown local (bug: không tick), không Overdue | 🔴 Countdown local (bug: không tick), không Overdue | **Làm** |
| **P2-4** Stepper 4 timestamps | 🟡 Thiếu 2/4 + `result?.settledAt` | 🟡 Giống | 🟡 Giống | **Làm** |
| **P2-3** Large bet highlight | 🔴 Thiếu | 🔴 Thiếu | 🔴 Thiếu | **Làm** |
| **P2-2** KPI label language | 🔴 Hardcode (6 card) | 🔴 Hardcode (6 card) | 🔴 Hardcode (6 card) | **Làm** |
| **P0-A** Financial Summary | ✅ Đạt (JP + split) | ✅ Đạt (JP đơn) | ✅ Đạt (JP kép + overflow) | Không đụng |
| **(mở rộng)** KPI card Jackpot | 🔴 Không có (có JP) | 🔴 Không có (có JP) | 🔴 Không có (JP1+JP2) | **Optional — xem §7** |

**Điểm khác biệt lớn nhất với baseline Max3D:** cả 3 game này **có Jackpot** (Max3D không có). Financial
summary vì thế phức tạp hơn nhiều và **đã được làm hoàn chỉnh từ trước** — plan này KHÔNG chạm vào, chỉ
nâng cấp các hạng mục UX vận hành (countdown/overdue/stepper/large-bet/kpi-label) cho ngang chuẩn Max3D.

---

## 1. P0-Blocker — Bổ sung `scheduledDrawAt` vào DrawSelectorItem DTO (backend, 3 game)

**Vì sao:** Countdown "Quay số sau" (trạng thái `SalesClosed`) và overdue-publish check cần mốc **giờ quay
theo lịch** — luôn có, độc lập trạng thái kỳ. Keno/Bingo18/Max3D DTO đã có `scheduledDrawAt`; 3 game này
**thiếu hẳn**.

**File mỗi game** (`{game}` = lotto535 | mega645 | power655):
- `packages/game-{game}-application/src/use-cases/operations/dto/draw-selector.dto.ts` — thêm field
  `scheduledDrawAt: string` (required, non-optional). JSDoc copy pattern Max3D DTO:
  *"Thời điểm quay theo lịch (ISO 8601) — luôn có, lấy từ `DrawDoc.drawTime`, không phụ thuộc trạng thái kỳ.
  Dùng cho countdown 'Quay số sau' và overdue-publish check (khác `drawResultAt` — mốc quay thực tế)."*
- `packages/game-{game}-application/src/use-cases/operations/get-draw-selector.ts` — thêm
  `scheduledDrawAt: drawTimeDate.toISOString()` (biến `drawTimeDate = d.drawTime` đã có sẵn ở cả 3 use-case).
  DrawDoc dùng field `drawTime: Date` cho giờ quay theo lịch (đã xác nhận cả 3 game).

> ⚠️ **KHÔNG đổi ngữ nghĩa `drawResultAt`/`resultPublishedAt` hiện có.** 3 game này dùng `resultPublishedAt`
> (hoặc `drawResultAt` gán = giờ lịch) cho `ScheduleChips` + logic resettle. Chỉ **THÊM** `scheduledDrawAt`
> mới, không refactor field cũ (tránh vỡ `ScheduleChips`/resettle). Đây là khác biệt so với Max3D —
> Max3D được tách sạch từ đầu, còn 3 game này giữ nguyên field cũ để an toàn.

**Verify:** `pnpm --filter @megawin/game-lotto535-application --filter @megawin/game-mega645-application
--filter @megawin/game-power655-application check-types`.

---

## 2. P0-Blocker (tiếp) — `use-draw-context.tsx` (3 game)

Cả 3 game **construct `DrawSelectorItem` thủ công** cho historical draw (`drawFromRemote`). Vì `scheduledDrawAt`
là required, PHẢI thêm vào block này, nếu không TS báo thiếu field:

```typescript
scheduledDrawAt: remoteDraw.drawTime as unknown as string,
```

(mirror Max3D `use-draw-context.tsx`). Bỏ sót bước này → countdown/overdue của kỳ historical vỡ + fail check-types.

---

## 3. P1-A — Countdown & Overdue (command center, 3 game)

**File:** `{game}/operations/_lib/sections/draw-management/draw-command-center.tsx`.

**Hiện trạng cả 3 game:** tự viết `Countdown` **local** (mega645/power655 có **bug**: chỉ tính `Date.now()`
1 lần lúc render, **không `setInterval`** → không đếm ngược realtime). Chỉ countdown "Đóng bán", **không** có
"Quay số sau", **không** có `OverdueBanner`. Import `Timer` từ lucide cho Countdown local.

**Thay đổi:**
1. Import `Countdown`, `OverdueBanner`, `useOverdue`, `getOverdueGrace` từ
   `@/components/games/shared/draw-countdown` + `GameProduct` từ `@megawin/game-core/entities`.
2. **Xoá** hàm `Countdown` local (thay bằng shared — fix luôn bug không-tick của mega645/power655).
3. `SalesOpen` → `<Countdown target={draw.salesCloseAt} prefix="Đóng bán sau" />` (thay Countdown local).
4. `SalesClosed` → `<Countdown target={draw.scheduledDrawAt} prefix="Quay số sau" />` (MỚI).
5. `useOverdue` + 2 `OverdueBanner` (close + publish) như Max3D, dùng `getOverdueGrace(GameProduct.{Game})`.
6. Gỡ import `Timer` nếu không còn dùng chỗ khác.

**Grace overdue per-game — thêm entry vào `GAME_OVERDUE_GRACE`** (`draw-countdown.tsx`, hiện chỉ có
Max3d/Max3dpro):

| Game | close | publish | Lý do |
|---|---|---|---|
| `Lotto535` | 300_000 (5') | 900_000 (15') | 2 kỳ/ngày (13h + 21h) nhưng vẫn phụ thuộc đối soát Vietlott → không dùng DEFAULT 30s/2m |
| `Mega645` | 300_000 (5') | 900_000 (15') | 3 kỳ/tuần (T4/T6/CN 18h), đối soát Vietlott |
| `Power655` | 300_000 (5') | 900_000 (15') | 3 kỳ/tuần (T3/T5/T7 18h), đối soát Vietlott |

> Cùng giá trị `{close: 300_000, publish: 900_000}` như Max3d/Max3dpro nhưng **khai báo tách theo từng
> `GameProduct` key** (theo quyết định preset per-game đã chốt ở plan Max3D §2) — cho phép tinh chỉnh riêng
> từng game sau khi quan sát vận hành, không đụng game khác. Cập nhật JSDoc của `GAME_OVERDUE_GRACE` liệt kê
> thêm 3 game này.

**Lưu ý Lotto535 (2 kỳ/ngày):** shared `Countdown`/`useOverdue` nhận thẳng `target` (ISO string) của kỳ đang
chọn nên tự động đúng cho cả kỳ 13h lẫn 21h — không cần logic riêng cho 2 khung giờ.

---

## 4. P2-4 — Stepper 4 timestamps (3 game)

**File:** `draw-command-center.tsx` (`getSteps`). Cả 3 game hiện chỉ có `time` cho "Đóng bán"; "Mở bán" và
"Công bố KQ" thiếu, "Kết sổ" dùng sai nguồn `result?.settledAt`.

1. "Mở bán": `time: draw.salesOpenAt ? displayVNTime(draw.salesOpenAt) : undefined`.
2. "Công bố KQ": `time: draw.drawResultAt ? displayVNTime(draw.drawResultAt) : displayVNTime(draw.scheduledDrawAt)`.
3. "Kết sổ": đổi `result?.settledAt` → `draw.settledAt` (cả 3 DTO đều đã có `settledAt?`).

---

## 5. P2-3 — Large bet highlight (live feed, 3 game)

**File:** `{game}/operations/_lib/sections/analytics/live-feed.tsx` (mirror Max3D/Keno).

1. Thêm const `LARGE_BET_THRESHOLD` + JSDoc guideline.
   **Ngưỡng đề xuất (cao hơn Max3D vì Bao lớn):**

   | Game | Threshold | Lý do (tiền cược/kỳ tối đa qua Bao) |
   |---|---|---|
   | `lotto535` | **5_000_000** | Bao 15 = 3.003 lines × 10k = ~30tr/kỳ |
   | `mega645` | **5_000_000** | Bao lớn nhiều lines |
   | `power655` | **5_000_000** | Bao 18 = ~185tr/kỳ |

   Ghi rõ trong JSDoc: đây là baseline theo quan sát, tinh chỉnh sau. (Max3D dùng 2tr; 3 game này Bao lớn
   hơn → nâng lên 5tr để tránh chip "Cược lớn" hiện quá dày.)
2. `isLargeBet = e.amount >= LARGE_BET_THRESHOLD` → nền `bg-red-500/5`, border-l đỏ `#ef4444`, chip "Cược lớn".
   **Giữ nguyên** nhãn đặc thù mỗi game: cả 3 dùng `e.playTypeLabel` + `NumbersWithTooltip` (main/special
   numbers + `suffix` kiểu bao). Chỉ THÊM highlight, không đổi layout số.

---

## 6. P2-2 — KPI label language (3 game)

**File:** `{game}/operations/_lib/sections/kpi/kpi-strip.tsx` (cả 3 game **tách 2 file**: giữ `index.tsx`
lo data, sửa label ở `kpi-strip.tsx` — KHÁC Max3D gộp 1 file). Cả 3 có **6 card giống hệt nhau**.

Import `REPORT_COLUMN_LABELS` từ `@megawin/game-core/labels`, đổi label:

| Card | Label hiện tại | Sau | Key |
|---|---|---|---|
| Doanh thu | "Doanh thu" | "Tiền cược" | `REPORT_COLUMN_LABELS.totalStake` |
| Entries | "Entries" | "Phiếu cược" | `REPORT_COLUMN_LABELS.entryCount` |
| Lines | "Lines" | "Bộ số" | `REPORT_COLUMN_LABELS.lineCount` |
| Người chơi | "Người chơi" | (giữ) | `REPORT_COLUMN_LABELS.playerCount` |
| Hoa hồng ĐL | "Hoa hồng ĐL" | "Hoa hồng đại lý" | `REPORT_COLUMN_LABELS.totalCommission` |
| Doanh thu thuần | "Doanh thu thuần" + sub | **GIỮ HARDCODE** | — (xem lưu ý) |

> **Lưu ý card "Doanh thu thuần":** `REPORT_COLUMN_LABELS.ggr` cũng = "Doanh thu thuần" nhưng ngữ nghĩa GGR
> = `totalStake − totalPayout`, trong khi card này là `netRevenue = totalStake − commission` (sub: "Sau hoa
> hồng đại lý"). Hai khái niệm KHÁC nhau → **KHÔNG map vào `ggr`** để tránh gán nhầm ngữ nghĩa. Giữ hardcode
> "Doanh thu thuần" + sub như cũ.
>
> Khác Max3D: Max3D không có card "Lines"/"Doanh thu thuần"; 3 game này có thêm nên map được `lineCount`
> cho card Lines, còn "Doanh thu thuần" giữ nguyên.

---

## 7. (Optional / mở rộng) — KPI card Jackpot

Cả 3 game có Jackpot nhưng KPI strip **không** hiển thị giá trị quỹ hiện tại (staff phải vào tab Jackpot
hoặc chờ FinancialSummary sau settle). Có thể thêm card Jackpot vào strip:
- Lotto535/Mega645: 1 card "Jackpot" (quỹ hiện tại).
- Power655: 2 card "JP1" + "JP2" (jackpot kép).

> **KHÔNG bắt buộc trong plan này** (tránh scope creep + cần data source jackpot hiện tại vào KPI DTO —
> khác nguồn với `OpsKpi` hiện có). Ghi nhận là hạng mục mở rộng riêng cho game có jackpot, làm commit
> riêng sau nếu muốn. Baseline Max3D không có nên phần này ngoài chuẩn chung.

---

## 8. Thứ tự & Verify

1. **P0** DTO `scheduledDrawAt` (backend 3 game) + `use-draw-context.tsx` (3 game) →
   check-types 3 application package.
2. **P1-A** Countdown + Overdue + thêm 3 entry vào `GAME_OVERDUE_GRACE`.
3. **P2-4** Stepper timestamps.
4. **P2-3** Large bet (threshold 5tr).
5. **P2-2** KPI labels.
6. Verify: `pnpm --filter @megawin/backoffice check-types` + `biome lint` (lint chạy được sau khi đã có
   `apps/backoffice/.gitignore` — xem note bên dưới).

**Làm lotto535 trước, xong mirror sang mega645 rồi power655** (đồng nhất, chỉ khác lịch quay / màu Live
badge / ngưỡng / chi tiết jackpot).

> **Note lint:** `apps/backoffice/.gitignore` đã được thêm (fix bug Biome 2.4.6 không tìm thấy ignore file
> khi `vcs.useIgnoreFile: true` — xem lịch sử). Nhờ đó `biome lint` giờ chạy được thật. 67 lỗi + 647 warning
> tiền tồn tại trên toàn app KHÔNG liên quan các file trong plan này (đã xác nhận qua reporter JSON) — không
> xử lý ở plan này.

---

## 9. Khác biệt giữa 3 game cần lưu khi mirror

| Điểm | lotto535 | mega645 | power655 |
|---|---|---|---|
| Lịch quay | 2 kỳ/ngày (13h + 21h), T2–CN | 3 kỳ/tuần T4/T6/CN 18h | 3 kỳ/tuần T3/T5/T7 18h |
| Số | 5/35 + ĐB 1/12 | 6/45 | 6/55 + bonus |
| Jackpot | JP đơn + **split cycle** (kỳ 21h) | JP đơn (không split) | **JP kép** JP1+JP2 + **overflow** |
| Màu Live badge | (theo hiện trạng — giữ) | teal | (theo hiện trạng — giữ) |
| `resultPublishedAt` | có (dùng resettle) | có (dùng resettle) | có (dùng resettle) |
| Financial summary | JP + split (giữ) | JP đơn (giữ) | JP kép + overflow (giữ) |

Các điểm khác biệt trên **KHÔNG** thuộc phạm vi thay đổi UX của plan (chỉ giữ nguyên) — liệt kê để tránh
"mirror mù" gây lệch label/màu/logic jackpot vốn đã đúng.

---

## 10. Kết quả verify (sau implement)

- ✅ `pnpm --filter @megawin/game-lotto535-application --filter @megawin/game-mega645-application
  --filter @megawin/game-power655-application check-types` → PASS (exit 0).
- ✅ `pnpm --filter @megawin/backoffice check-types` → PASS (exit 0).
- ✅ Lint các file đã sửa: chỉ còn 1 warning `h-[2px]` → `h-0.5` trên stepper connector ở cả 3
  `draw-command-center.tsx` — **pre-existing** (giống baseline Keno/Max3D), KHÔNG do thay đổi lần này,
  giữ nguyên cho nhất quán cross-game. Không phát sinh lỗi/unused import mới.

**Đã làm (§1–§6, bỏ §7):**
- §1–§2 (P0): thêm `scheduledDrawAt: string` vào DTO + `get-draw-selector.ts` 3 game; thêm vào
  `drawFromRemote` trong `use-draw-context.tsx` 3 game.
- §3 (P1-A): thay Countdown local (fix bug không-tick mega645/power655) bằng shared `Countdown`;
  thêm "Quay số sau" (SalesClosed) + 2 `OverdueBanner`; thêm 3 game vào `GAME_OVERDUE_GRACE`
  ({close: 5', publish: 15'}) với JSDoc giải thích tách preset per-game.
- §4 (P2-4): stepper 4 timestamps (Mở bán / Đóng bán / Công bố KQ / Kết sổ), đổi nguồn "Kết sổ" sang
  `draw.settledAt`. Gỡ param `result` không dùng khỏi `getSteps` + destructure component.
- §5 (P2-3): large bet highlight, `LARGE_BET_THRESHOLD = 5_000_000` (JSDoc baseline, tinh chỉnh sau).
- §6 (P2-2): KPI label qua `REPORT_COLUMN_LABELS` (totalStake/entryCount/lineCount/playerCount/
  totalCommission); giữ hardcode "Doanh thu thuần" (khác ngữ nghĩa GGR).
- §7: **BỎ** — đã có component Jackpot ở đầu trang (theo yêu cầu).
