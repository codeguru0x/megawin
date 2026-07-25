---
name: ""
overview: ""
todos: []
isProject: false
---

# Max 3D & Max 3D Pro Operations — UX/Vận hành Upgrade Plan

> **Trạng thái:** ✅ Đã implement xong (check-types pass cho 3 package; lint bị block bởi lỗi
> môi trường Biome tiền tồn tại — không liên quan thay đổi trong plan này, xem mục 8).
> **Phạm vi:** `apps/backoffice/src/app/(main)/games/max3d/operations/**` + `max3dpro/operations/**`
> + backend DTO/use-case draw-selector 2 game (bổ sung `scheduledDrawAt`).
> **Baseline:** [`keno-operations-ux-upgrade.plan.md`](./keno-operations-ux-upgrade.plan.md) +
> [`bingo18-operations-ux-upgrade.plan.md`](./bingo18-operations-ux-upgrade.plan.md).
> **Đặc thù:** Max3D quay **T2/T4/T6 18:00**, Max3DPro quay **T3/T5/T7 18:00** — đều **1 kỳ/ngày**
> (chu kỳ RẤT dài, ngược Keno 8'/Bingo18 6'). Không Jackpot. Có lines/triplet 000-999.
> **Gộp 1 plan:** command center / DTO / KPI layout / financial layout của 2 game **đồng nhất từng dòng** →
> mirror cùng bộ thay đổi, chỉ khác vài label đặc thù + màu Live badge.

---

## 0. Audit hiện trạng (subagent đã khảo sát, có file:line bằng chứng)

| Hạng mục | max3d | max3dpro | Hành động |
|---|---|---|---|
| **P0-A** Financial Summary | ✅ Đạt chuẩn (P&L 4 dòng, không bug) | ✅ Đạt chuẩn | Không đụng |
| **P1-A** Countdown + Overdue | 🔴 Thiếu (chip tĩnh) | 🔴 Thiếu (chip tĩnh) | **Làm** |
| **P2-4** Stepper 4 timestamps | 🟡 Thiếu 2/4 + dùng `result?.settledAt` | 🟡 Giống | **Làm** |
| **P2-3** Large bet highlight | 🔴 Thiếu | 🔴 Thiếu | **Làm** |
| **P2-2** KPI label language | 🔴 Hardcode | 🔴 Hardcode | **Làm** |
| **Blocker** DTO `scheduledDrawAt` | 🔴 Thiếu | 🔴 Thiếu | **Làm trước P1-A** |

---

## 1. P0-Blocker — Bổ sung `scheduledDrawAt` vào DrawSelectorItem DTO (backend)

**Vì sao:** Countdown "Quay số sau" (trạng thái `SalesClosed`) và overdue publish check cần mốc giờ quay
theo lịch. Keno/Bingo18 DTO đã có `scheduledDrawAt`; max3d/max3dpro **thiếu**.

**File mỗi game:**
- `packages/game-max3d-application/src/use-cases/operations/dto/draw-selector.dto.ts` — thêm field `scheduledDrawAt: string`.
- `packages/game-max3d-application/src/use-cases/operations/get-draw-selector.ts` — map `scheduledDrawAt: draw.drawTime.toISOString()` (mirror Bingo18 `get-draw-selector.ts` dòng 48).
- Tương tự cho `game-max3dpro-application`.

**JSDoc field** (copy pattern Bingo18 DTO dòng 23-27): "Thời điểm quay theo lịch (ISO 8601) — luôn có,
lấy từ DrawDoc.drawTime, không phụ thuộc trạng thái kỳ."

**Verify:** `pnpm --filter @megawin/game-max3d-application check-types` + `--filter @megawin/game-max3dpro-application`.

---

## 2. P1-A — Countdown & Overdue (command center)

**File:** `{game}/operations/_lib/sections/draw-management/draw-command-center.tsx` (2 game, mirror Keno dòng 50-55, 515-636).

1. Import `Countdown`, `OverdueBanner`, `useOverdue`, `DEFAULT_OVERDUE_GRACE` từ `@/components/games/shared/draw-countdown`.
2. Thay chip tĩnh "Đóng bán lúc HH:mm" (dòng ~515-520) → `<Countdown target={draw.salesCloseAt} prefix="Đóng bán sau" />`.
3. Thêm `<Countdown target={draw.scheduledDrawAt} prefix="Quay số sau" />` cho `SalesClosed`.
4. **Grace overdue lớn hơn nhiều (1 kỳ/ngày):** KHÔNG dùng `DEFAULT_OVERDUE_GRACE` (30s/2m — quá ngắn).
   - `close`: 5 phút (đóng bán trễ 5' mới cảnh báo — không gấp như game 6-8').
   - `publish`: 15 phút (quay số 1 kỳ/ngày, publish có thể chậm vài phút do quy trình đối chiếu Vietlott).
   - **Quyết định implement (đổi so với đề xuất ban đầu theo phản hồi):** KHÔNG dùng 1 hằng số
     `LONG_CYCLE_OVERDUE_GRACE` chung. Thay bằng **preset theo từng game** —
     `GAME_OVERDUE_GRACE: Partial<Record<GameProduct, OverdueGrace>>` + hàm `getOverdueGrace(game)`
     trong `draw-countdown.tsx`. Game không có entry riêng tự fallback `DEFAULT_OVERDUE_GRACE`.
     Max3d/Max3dpro hiện có cùng giá trị `{ close: 300_000, publish: 900_000 }` nhưng khai báo tách
     theo từng key — cho phép tinh chỉnh riêng từng game sau khi quan sát vận hành thực tế (VD: 1 game
     đổi nguồn đối soát Vietlott chậm hơn game khác) mà không đụng tới game còn lại. Xem JSDoc chi tiết
     tại `GAME_OVERDUE_GRACE` trong file shared.
5. `useOverdue` + `OverdueBanner` cho SalesOpen/SalesClosed như Keno.
6. `Timer` import gỡ nếu không còn dùng.

**Cân nhắc:** vì chu kỳ dài, cân nhắc bỏ `animate-pulse` <60s (không hữu ích khi countdown hàng giờ) —
nhưng shared Countdown đã tự xử lý (chỉ pulse khi <60s), không cần đổi. Giữ nguyên.

---

## 3. P2-4 — Stepper 4 timestamps

**File:** `draw-command-center.tsx` (`getSteps`, 2 game).

1. "Mở bán": `time: draw.salesOpenAt ? displayVNTime(draw.salesOpenAt) : undefined`.
2. "Công bố KQ": `time: draw.drawResultAt ? displayVNTime(draw.drawResultAt) : displayVNTime(draw.scheduledDrawAt)`.
3. "Kết sổ": đổi `result?.settledAt` → `draw.settledAt`.

---

## 4. P2-3 — Large bet highlight (live feed)

**File:** `{game}/operations/_lib/sections/analytics/live-feed.tsx` (2 game, mirror Keno/Bingo18).

1. Thêm const `LARGE_BET_THRESHOLD` + JSDoc guideline.
   **Ngưỡng đề xuất:** Max3D/Max3DPro giải ĐB tới 1-2 tỷ, cược multiNumber tới ~3.8tr/kỳ → cược lớn thực tế
   cao hơn game khác. Đặt **2_000_000** làm baseline (game doanh thu/kỳ lớn per plan Keno §8 "2-5 triệu"),
   ghi rõ trong JSDoc là quan sát thực tế rồi tinh chỉnh.
2. `isLargeBet = e.amount >= LARGE_BET_THRESHOLD` → nền `bg-red-500/5`, border-l đỏ `#ef4444`, chip "Cược lớn".
   Lưu ý giữ nguyên label đặc thù mỗi game (max3d combo label; max3dpro `playModeLabel` + "(N cặp)").

---

## 5. P2-2 — KPI label language

**File:** `{game}/operations/_lib/sections/kpi/index.tsx` (2 game — LƯU Ý: gộp data+UI trong `index.tsx`,
KHÔNG tách `kpi-strip.tsx` như Keno/Bingo18).

Import `REPORT_COLUMN_LABELS` từ `@megawin/game-core/labels`, đổi label metric chung:

| Card | Trước | Sau |
|---|---|---|
| Doanh thu | "Doanh thu" | `REPORT_COLUMN_LABELS.totalStake` = "Tiền cược" |
| Entries | "Entries" | `REPORT_COLUMN_LABELS.entryCount` = "Phiếu cược" |
| Bet Units (max3d) / Cặp (max3dpro) | giữ (đặc thù đơn vị game) | giữ — không có key metric chung tương ứng |
| Người chơi | "Người chơi" | `REPORT_COLUMN_LABELS.playerCount` |
| Hoa hồng ĐL | "Hoa hồng ĐL" | `REPORT_COLUMN_LABELS.totalCommission` |

> **Cân nhắc refactor (optional):** tách `kpi-strip.tsx` khỏi `index.tsx` để đồng nhất kiến trúc với
> Keno/Bingo18. KHÔNG bắt buộc trong plan này (tránh scope creep) — chỉ đổi label. Nếu muốn nhất quán
> kiến trúc toàn bộ, làm 1 commit refactor riêng sau.

---

## 6. Thứ tự & Verify

1. **P0-Blocker** DTO `scheduledDrawAt` (backend 2 game) → check-types application packages.
2. **P1-A** Countdown + Overdue + `LONG_CYCLE_OVERDUE_GRACE` shared.
3. **P2-4** Stepper timestamps.
4. **P2-3** Large bet (threshold 2 triệu).
5. **P2-2** KPI labels.
6. Verify: `pnpm --filter @megawin/backoffice check-types` + lint.

**Làm max3d trước, xong mirror sang max3dpro** (đồng nhất, chỉ khác label/màu đặc thù).

---

## 7. Khác biệt max3d vs max3dpro cần lưu khi mirror

1. KPI card 3: max3d "Bet Units"/`Hash`; max3dpro "Cặp (Pairs)" — giữ nguyên, chỉ đổi label chung.
2. Financial: max3d tính `netProfit` tay; max3dpro dùng `f.profit` — không đụng (đều đạt).
3. Live feed nhãn: max3d combo (3D+/Tổ hợp); max3dpro `playModeLabel` + "(N cặp)" — giữ, chỉ thêm large-bet.
4. Màu Live badge: max3d violet; max3dpro pink — giữ.
5. Result tiers khác nhau (Basic+Plus vs 8 hạng specialSub) — không thuộc scope plan này.

---

## 8. Kết quả verify (sau implement)

- `pnpm --filter @megawin/game-max3d-application --filter @megawin/game-max3dpro-application
  --filter @megawin/backoffice check-types` → **Done, 0 lỗi** cho cả 3 package.
- `pnpm --filter @megawin/backoffice lint` → **fail ở tầng môi trường**, không phải lỗi code:
  `Biome couldn't find an ignore file in the following folder`. Đã xác nhận lỗi này xảy ra ngay cả
  trên cây git sạch (chưa áp dụng bất kỳ thay đổi nào của plan này) — tái hiện bằng `git stash` rồi
  chạy lại lint. Đây là vấn đề cấu hình Biome 2.4.6 + `vcs.useIgnoreFile` trong monorepo (biome.json
  ở `apps/backoffice/` không tìm thấy `.gitignore` cùng cấp — file này nằm ở root repo), không liên
  quan tới các file đã sửa. Đã lint trực tiếp qua `biome lint` scoped vào từng file đã đổi và review
  thủ công (`ReadLints`) — chỉ có 2 warning `tailwindcss` tiền tồn tại (`h-[2px]` → nên viết `h-0.5`),
  giống pattern đã có ở Keno, không phải lỗi mới.
