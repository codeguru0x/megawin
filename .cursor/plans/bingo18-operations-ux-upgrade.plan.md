---
name: ""
overview: ""
todos: []
isProject: false
---

# Bingo 18 Operations — UX/Vận hành Upgrade Plan

> **Trạng thái:** In progress.
> **Phạm vi:** `apps/backoffice/src/app/(main)/games/bingo18/operations/**`.
> **Baseline:** Kế thừa pattern từ [`keno-operations-ux-upgrade.plan.md`](./keno-operations-ux-upgrade.plan.md) (plan mẫu đã hoàn tất cho Keno).
> **Đặc thù Bingo 18:** Chu kỳ **6 phút/kỳ** (~160 kỳ/ngày — cao nhất hệ thống), KHÔNG Jackpot, KHÔNG payout caps, 3 xúc xắc (1-6). Unified boards (3 basic + 2 side bet).

---

## 0. Audit hiện trạng (đã đối chiếu code với plan Keno)

| Hạng mục | Trạng thái Bingo18 | Hành động |
|---|---|---|
| **P0-A** Financial Summary (P&L 4 dòng) | ✅ Đã đạt — ledger 4 dòng, profit = revenue − commission − prizes, màu theo dấu + banner lỗ | Không đụng |
| **P1-A** Countdown + Overdue banner | 🔴 Thiếu hoàn toàn — chỉ có chip "Đóng lúc HH:mm" tĩnh; shared `draw-countdown.tsx` đã tồn tại nhưng chưa import | **Làm** |
| **P2-4** Stepper 4 timestamps | 🟡 Thiếu 2/4 (Mở bán, Công bố KQ không có time; Kết sổ dùng `result.settledAt` thay `draw.settledAt`) | **Làm** |
| **P2-3** Highlight cược lớn (live feed) | 🟡 Thiếu — border-l chỉ theo màu playType, không có ngưỡng LARGE_BET | **Làm** |
| **P2-2** KPI labels đồng bộ | 🟡 Label hardcode ("Doanh thu", "Entries"…) — cần dùng label language chung | **Làm** |
| **P1-C** Hydration fix sidebar | ⚪ Fix chung toàn app (đã làm ở Keno) — Bingo18 hưởng lợi | Verify only |
| **P2-6** Heatmap empty-hint | ✅ Bingo18 dùng DiceHistogram, đã có empty state | Không đụng |

---

## 1. Label Language — nguồn chân lý dùng chung (quyết định đã chốt)

**Quyết định (feedback):** KHÔNG rename. Dùng thẳng `REPORT_COLUMN_LABELS` từ `@megawin/game-core/labels`
làm "label language" cho KPI operations của mọi game. Object này đã dùng ở toàn bộ report 7 game →
đã là source-of-truth trung tâm, chứa sẵn các key cần thiết:

| Key | Value | Dùng cho KPI |
|---|---|---|
| `totalStake` | "Tiền cược" | (doanh thu operations = tiền cược) |
| `entryCount` | "Phiếu cược" | thay "Entries" |
| `playerCount` | "Người chơi" | card Người chơi |
| `totalCommission` | "Hoa hồng đại lý" | card Hoa hồng ĐL |
| `ggr` | "Doanh thu thuần" | card Doanh thu thuần (nếu có) |
| `lineCount` / `board` | "Bộ số" / "Bảng" | (game có lines) |

**Nguyên tắc áp dụng:** KPI operations import `REPORT_COLUMN_LABELS`, KHÔNG hardcode chuỗi tiếng Việt.
Card đặc thù per-game (VD "Boards cơ bản", "Side bets" của Bingo18) chưa có trong label language →
giữ nguyên (đặc thù game, không phải metric chung), nhưng các card metric chung (Doanh thu, Người chơi,
Hoa hồng, Phiếu cược) BẮT BUỘC dùng label language.

> Rollout: khi làm max3d/max3dpro và các game khác, cùng dùng `REPORT_COLUMN_LABELS` cho KPI operations →
> đồng bộ 100% với report, tránh lệch chữ ("Entries" vs "Phiếu cược" vs "Đơn cược").

---

## 2. P1-A — Countdown & cảnh báo quá hạn (ưu tiên cao nhất)

**File:** `_lib/sections/draw-management/draw-command-center.tsx`.
**Shared component:** `components/games/shared/draw-countdown.tsx` (đã có, Keno đang dùng).

**Thay đổi (mirror Keno dòng 515–636):**

1. Import `Countdown`, `OverdueBanner`, `useOverdue`, `DEFAULT_OVERDUE_GRACE` từ shared.
2. Thay chip tĩnh "Đóng lúc HH:mm" (dòng ~528–533) → `<Countdown target={draw.salesCloseAt} prefix="Đóng bán sau" />` (amber; <60s tự đỏ + pulse).
3. Thêm `<Countdown target={draw.scheduledDrawAt} prefix="Quay số sau" />` cho `SalesClosed` (violet). `scheduledDrawAt` đã có trong `DrawSelectorItem` bingo18.
4. `useOverdue` cho 2 trạng thái kẹt, dùng `DEFAULT_OVERDUE_GRACE` mặc định (Bingo18 chu kỳ ngắn → 30s/2m):
   - `SalesOpen` quá `salesCloseAt` + 30s → `OverdueBanner "Quá giờ đóng bán, hãy đóng kỳ này."`
   - `SalesClosed` quá `scheduledDrawAt` + 2m chưa Published → `OverdueBanner "Quá giờ quay số nhưng chưa công bố kết quả."`
   - Render banner dưới stepper; ẩn countdown tương ứng khi overdue (`!closeOverdue`, `!publishOverdue`).

**Acceptance:** Người trực ca thấy đếm ngược thay vì giờ tĩnh; banner cảnh báo khi scheduler/worker kẹt.

---

## 3. P2-4 — Stepper 4 timestamps đầy đủ

**File:** `draw-command-center.tsx` (`getSteps`).

**Thay đổi (mirror Keno `getSteps` dòng 96–134):**

1. Bước "Mở bán": thêm `time: draw.salesOpenAt ? displayVNTime(draw.salesOpenAt) : undefined`.
2. Bước "Công bố KQ": thêm `time: draw.drawResultAt ? displayVNTime(draw.drawResultAt) : displayVNTime(draw.scheduledDrawAt)`.
3. Bước "Kết sổ": đổi từ `result?.settledAt` → `draw.settledAt` (luôn có từ selector sau settle, không cần load detail).

**Acceptance:** Kỳ đã settle hiển thị đủ 4 mốc giờ trên stepper.

---

## 4. P2-3 — Highlight cược lớn (Live Feed)

**File:** `_lib/sections/analytics/live-feed.tsx`.

**Thay đổi (mirror Keno):**

1. Thêm const `LARGE_BET_THRESHOLD = 1_000_000` với JSDoc guideline đầy đủ (Bingo18 chu kỳ ngắn → giữ 1 triệu như Keno; công thức ~100 × unitPrice 10.000đ).
2. `isLargeBet = e.amount >= LARGE_BET_THRESHOLD` → nền `bg-red-500/5`, border-l đỏ `#ef4444`, chip "Cược lớn".

**Acceptance:** Entry ≥ 1 triệu nổi bật border đỏ + chip trong feed.

---

## 5. P2-2 — Đồng bộ KPI labels

**File:** `_lib/sections/kpi/kpi-strip.tsx`.

**Quyết định (feedback):** Giữ 6 card hiện tại, chỉ đổi text metric chung sang `REPORT_COLUMN_LABELS`.

| Card | Trước | Sau (label language) |
|---|---|---|
| Doanh thu | "Doanh thu" (hardcode) | `REPORT_COLUMN_LABELS.totalStake` = "Tiền cược" |
| Entries | "Entries" | `REPORT_COLUMN_LABELS.entryCount` = "Phiếu cược" |
| Boards cơ bản | "Boards cơ bản" | giữ (đặc thù game) |
| Side bets | "Side bets" | giữ (đặc thù game) |
| Người chơi | "Người chơi" | `REPORT_COLUMN_LABELS.playerCount` = "Người chơi" |
| Hoa hồng ĐL | "Hoa hồng ĐL" | `REPORT_COLUMN_LABELS.totalCommission` = "Hoa hồng đại lý" |

**Acceptance:** Card metric chung đọc từ label language; không còn hardcode chuỗi metric chung.

---

## 6. Thứ tự & Verify

1. P1-A Countdown + Overdue → mirror Keno.
2. P2-4 Stepper timestamps.
3. P2-3 Large bet highlight.
4. P2-2 KPI labels.
5. Verify: `pnpm --filter @megawin/backoffice check-types` + lint.

---

## 7. Rollout tiếp theo: max3d / max3dpro (plan riêng sau)

Sau khi hoàn tất Bingo18, khảo sát max3d + max3dpro operations, đối chiếu cùng checklist:
Financial Summary, Countdown/Overdue (reuse shared, grace theo lịch quay), Stepper timestamps,
Large bet threshold (~100 × unitPrice, quan sát thực tế), KPI labels dùng `REPORT_COLUMN_LABELS`.
Ghi plan phụ riêng, tham chiếu plan này + plan Keno làm baseline.
