# Keno Operations — UX/Vận hành Upgrade Plan

> **Trạng thái:** Draft — chờ approve để implement.
> **Phạm vi:** `apps/backoffice/src/app/(main)/games/keno/operations/**` + backend operations use-cases Keno.
> **Vai trò tài nguyên:** Đây là plan MẪU. Sau khi hoàn thành Keno, các game còn lại (mega645, power655, lotto535, max3d, max3dpro, bingo18) sẽ được phân tích riêng và áp dụng pattern tương ứng — xem §7 "Rollout cho game khác".

---

## 0. Bối cảnh & Quyết định

- **Không tách trang.** Giữ 1 trang vận hành duy nhất (đã phân tích: Keno chu kỳ 8 phút, ~120 kỳ/ngày — tách trang phân tích cược làm tăng context-switching cost cho người trực ca).
- Nâng cấp theo 3 mức ưu tiên đã thống nhất:
  - **P0**: Sửa sai lệch tài chính. ~~Giám sát rủi ro payout cap~~ (đã loại bỏ hoàn toàn theo feedback — xem §2).
  - **P1**: Countdown & cảnh báo quá hạn (shared component cho mọi game) + Fix hydration error sidebar. ~~Auto-follow kỳ mới~~ (đã gỡ theo feedback — staff tự chọn kỳ).
  - **P2**: Polish UX nhỏ (pick labels, KPI 6 cards chuẩn label, live feed highlight, stepper timestamps, heatmap empty-hint). ~~Side bets collapse~~ (đã revert theo feedback).
- Tuân thủ rule `operations-page-ui.mdc` (zones, font tiers, badge tokens) và `code-quality-standards.mdc` (JSDoc, comment, DRY types).

## Kiến trúc hiện trạng (đã audit)

| Layer | File | Ghi chú |
|---|---|---|
| Page | `operations/page.tsx` | 4 zones, `DrawContextProvider` + nuqs `?draw=` |
| Context | `_lib/use-draw-context.tsx` | Auto-select active→future→first; `isActiveForRefresh` |
| Hooks | `_lib/use-operations.ts` | React Query, refetch 15–60s, dừng khi settled |
| Command center | `_lib/sections/draw-management/draw-command-center.tsx` | Stepper 4 bước, ScheduleChips giờ tĩnh |
| KPI | `_lib/sections/kpi/kpi-strip.tsx` | 6 cards, số tuyệt đối (có Doanh thu thuần). Không có panel payout exposure (đã gỡ) |
| Result | `_lib/sections/result/index.tsx` | `FinancialSummary` có bug "Thu thuần" = 0 |
| Analytics | `_lib/sections/analytics/*` | PlayTypeCard 5×2 + side bets, heatmap 80 số, live feed |
| Backend DTO | `packages/game-keno-application/src/use-cases/operations/dto/*` | summary/tenants/number-frequency/playtype/top-combos/live-entries |
| Financial rules | `packages/game-keno/src/rules/financials.ts` | `companyTake = revenue − prizes − commission`; `calculateCappedPrize` |
| Payout caps | `packages/game-keno/src/entities/global-config.ts` → `payoutCaps` | pick8/9/10: 10 tỷ/kỳ, maxSets 50/12/5 |

---

## 1. P0-A — Sửa panel "Tài chính kỳ" (FinancialSummary)

**File:** `_lib/sections/result/index.tsx` (component `FinancialSummary`, dòng ~452–576).

**Bug hiện tại:**

```453:453:apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/result/index.tsx
  const netAfterAll = f.totalRevenue - f.totalAgentCommission - f.totalPrizes - f.companyTake;
```

Vì `companyTake = totalRevenue − totalPrizes − totalAgentCommission` (định nghĩa trong `financials.ts`), `netAfterAll` **luôn = 0**. Thêm nữa "Công ty thu" đang render đỏ + dấu `-` như chi phí trong khi nó là lợi nhuận. Rule `operations-page-ui.mdc` §12 cũng yêu cầu: game KHÔNG Jackpot chỉ có `profit = revenue − prizes − commission`, **KHÔNG có dòng companyTake riêng**.

**Thay đổi:**

1. Xoá biến `netAfterAll` và dòng "Công ty thu" (sign `-`, màu destructive).
2. Dòng tổng kết cuối đổi thành **"Lợi nhuận"** (`=`), value = `f.companyTake`:
   - `companyTake >= 0` → màu emerald (`text-emerald-700 dark:text-emerald-400`), icon `TrendingUp`.
   - `companyTake < 0` → màu destructive, icon `TrendingDown`, thêm hint "Kỳ này chi trả vượt doanh thu" (Keno có thể âm khi trúng giải lớn — cảnh báo đỏ lúc này mới có ý nghĩa).
3. Cập nhật `_lib/types.ts`: đổi JSDoc `KenoDrawFinancialDisplay.companyTake` → mô tả rõ "Lợi nhuận công ty = revenue − prizes − commission, có thể âm". KHÔNG đổi tên field (giữ khớp `DrawDoc.financial.companyTake`).
4. ~~Giữ note "Keno không có Jackpot tích luỹ"~~ → **ĐÃ BỎ theo feedback** — note thừa, đã xoá khỏi `FinancialSummary`.

**Acceptance:** Ledger 4 dòng: Doanh thu gộp (+) / Hoa hồng ĐL (−) / Chi trả giải (−) / **Lợi nhuận (=)** với màu theo dấu. Không còn dòng nào luôn bằng 0.

---

## 2. P0-B — Panel "Rủi ro chi trả" (Payout Cap Exposure) — **ĐÃ LOẠI BỎ**

> **Quyết định:** Sau khi cân nhắc lại (feedback: đủ khả thi về performance nhưng độ phức tạp/giá trị vận
> hành chưa đủ để duy trì thêm 1 aggregation + index + card riêng), tính năng này đã bị **gỡ hoàn toàn**
> khỏi codebase — không chỉ tạm ẩn UI.
>
> Đã xoá:
> - FE: `_lib/sections/kpi/payout-exposure.tsx` (component `PayoutExposureCard`), hook
>   `useOpsPayoutExposure` + type re-export trong `use-operations.ts`, query key `opsPayoutExposure`
>   trong `query-keys/keno.ts`, và render trong `_lib/sections/kpi/index.tsx`.
> - API: route `apps/backoffice/src/app/api/keno/operations/payout-exposure/route.ts`,
>   schema `payoutExposureQuerySchema` trong `_lib/schema.ts`.
> - Backend: use-case `GetPayoutExposureUseCase` (`get-payout-exposure.ts`), DTO
>   `payout-exposure.dto.ts`, export trong `use-cases/operations/index.ts`.
> - Repo: method `aggregateHighTierBoardCounts` trong `entry-repo.ts`.
> - Index: `idx_draw_boards_playType` trong `packages/game-keno/src/indexes/index.ts`.
>
> **Ghi chú tham khảo (đã archive, không còn trong code):** trước khi gỡ, đã phân tích performance
> ở scale hàng trăm nghìn entries/kỳ và xác nhận khả thi — pre-match `$match` trước `$unwind` (multikey
> index trên `entrySummary.boards.playType`) giữ pipeline bounded, không cần `allowDiskUse`. Nếu tương
> lai cần lại panel dạng này (ở Keno hoặc game khác), tham khảo pattern pre-match + multikey index này
> làm baseline thay vì thiết kế lại từ đầu.
>
> Rủi ro payout cap vẫn được kiểm soát ở tầng settle pipeline (`ApplyPayoutCapsUseCase`) — chỉ mất phần
> hiển thị cảnh báo sớm real-time trên dashboard vận hành.

---

## 3. P1-A — Countdown & cảnh báo quá hạn (Command Center)

**File:** `_lib/sections/draw-management/draw-command-center.tsx` + component shared `apps/backoffice/src/components/games/shared/draw-countdown.tsx` (**dùng chung cho mọi game** — theo feedback).

**Thay đổi:**

1. **Component `Countdown`** (client, tick 1s): nhận `target: string (ISO)` + `label`. Dùng pattern DOM-ref + `setInterval` như `LastUpdatedBadge` (tránh re-render mỗi giây — rule react-best-practices §5.12). Format `mm:ss` khi < 1h.
2. Áp vào các trạng thái:
   - `SalesOpen`: thay chip tĩnh "Đóng lúc HH:mm" → `Đóng bán sau mm:ss` (amber; < 60s → đỏ + pulse).
   - ~~`Scheduled` có `salesOpenAt` tương lai: "Mở bán sau mm:ss"~~ → **ĐÃ BỎ theo feedback**: `salesOpenAt` được set ngay khi mở bán, không có đặt lịch mở bán → countdown này không bao giờ hiển thị, đã gỡ khỏi code.
   - `SalesClosed`: "Quay số lúc HH:mm · còn mm:ss" (dựa `scheduledDrawAt`).
3. **Cảnh báo quá hạn (overdue):** khi `now > mốc + ngưỡng trễ` mà status chưa chuyển:
   - `SalesOpen` quá `salesCloseAt` + 30s → banner amber "Quá giờ đóng bán — kiểm tra scheduler".
   - `SalesClosed` quá `scheduledDrawAt` + 2 phút mà chưa Published → banner "Chưa công bố kết quả".
   - Banner render trong command center (dưới stepper), icon `TriangleAlert`, không dùng toast (tránh spam khi refetch).
4. **Cấu hình dùng chung cho mọi game (theo feedback):** `Countdown`, `useOverdue`, `OverdueBanner` sống ở `components/games/shared/draw-countdown.tsx`, export `DEFAULT_OVERDUE_GRACE = { close: 30s, publish: 2m }`. Game chu kỳ ngắn (keno/bingo18) dùng default; game chu kỳ dài (mega645/power655/lotto535) truyền grace riêng khi gọi `useOverdue` — không hardcode per-game trong shared component.

**Acceptance:** Người trực ca không cần nhìn đồng hồ; trạng thái kẹt được báo ngay trên card.

---

## 4. P1-B — Auto-follow kỳ đang diễn ra — **ĐÃ GỠ theo feedback**

> **Quyết định:** Không cần chức năng này — staff tự chọn chuyển kỳ qua `DrawSelector`.
> Đã gỡ toàn bộ: Switch "Tự động theo kỳ" trong `page.tsx`, `isAutoFollow`/`onToggleAutoFollow`/toast chuyển kỳ trong `use-draw-context.tsx`.
> Hành vi giữ lại: khi URL không có `?draw=`, trang vẫn tự chọn kỳ active→future→first lúc load (auto-select ban đầu — không phải auto-follow liên tục).

---

## 5. P1-C — Fix hydration error sidebar (ảnh hưởng mọi trang)

**File:** `apps/backoffice/src/components/sidebar/nav-main.tsx`.

**Chẩn đoán:** Lỗi tại dòng 75 — `<Link>` trong `SidebarMenuButton asChild` bên trong `CollapsibleTrigger asChild`. 2 nghi phạm chính cần verify khi implement:
1. `NavItemCollapsed` (dòng ~141): `DropdownMenuItem asChild` nhận **2 children** khi `subItem.sectionLabel` tồn tại (`<p>` + `SidebarMenuSubButton`) — `asChild` (Radix Slot) yêu cầu đúng 1 child → runtime/hydration mismatch. Fix: tách `sectionLabel` ra ngoài `DropdownMenuItem` (render như sibling), bỏ `asChild` sai.
2. `isActive`/`defaultOpen` phụ thuộc `usePathname()` + `useSidebar()` state — kiểm tra SSR/CSR mismatch khi sidebar state đọc từ cookie; nếu mismatch từ attr `data-active`, đảm bảo server render cùng giá trị (sidebar provider đã hỗ trợ cookie — chỉ verify).

**Cách verify:** chạy dev, mở console tại `/games/keno/operations`, xác nhận hết warning hydration; kiểm tra cả trạng thái sidebar collapsed.

---

## 6. P2 — Polish UX (làm sau khi P0/P1 xong, mỗi mục 1 commit nhỏ)

| # | Vị trí | Thay đổi | File |
|---|---|---|---|
| P2-1 | PickCard | Label responsive: container hẹp → `P1`…`P10` (dùng `@container` query đã có `@container/main`), tooltip full label | `analytics/analytics-panels.tsx` |
| P2-2 | KPI strip | ~~Delta "so với kỳ trước ±%"~~ → **ĐÃ GỠ theo feedback** (chưa cần thiết). Thay bằng review dữ liệu + label chuẩn: 6 cards — Doanh thu (gộp) / Đơn cược / Bộ số / Người chơi / Hoa hồng ĐL / **Doanh thu thuần** (mới, = revenue − commission). Labels khớp rule `operations-page-ui.mdc` | `get-ops-summary.ts`, `operations.dto.ts`, `kpi-strip.tsx`, `kpi/index.tsx` |
| P2-3 | Live feed | Highlight cược lớn: `amount ≥ LARGE_BET_THRESHOLD` → border-l đỏ + chip "Cược lớn". **Giá trị per-game (theo feedback):** công thức gợi ý `~100 × unitPrice` (Keno = 1.000.000đ); game chu kỳ dài (mega645/power655/lotto535) nâng 2–5 triệu; game chu kỳ ngắn (keno/bingo18) giữ 1 triệu. Mỗi game đặt const riêng trong `live-feed.tsx` của game đó, JSDoc đầy đủ guideline | `analytics/live-feed.tsx` |
| P2-4 | Stepper | Hiện đủ timestamp 4 bước cho kỳ đã settle: map `salesOpenAt`/`salesCloseAt`/`drawResultAt`/`settledAt` vào `Step.time` | `draw-command-center.tsx` (`getSteps`) |
| P2-5 | Side bets | ~~Collapse khi rỗng~~ → **ĐÃ REVERT theo feedback**: giữ layout 2 cột như hiện tại, cột Side Bets luôn hiển thị (rỗng → text "Chưa có dữ liệu") | `analytics/analytics-panels.tsx` (`PlayTypeCard`) |
| P2-6 | Heatmap | Data thưa (tổng count < 10) → overlay hint "Dữ liệu còn ít — heatmap sẽ rõ hơn khi có thêm cược" | `analytics/number-heatmap.tsx` |

---

## 7. Thứ tự thực hiện & Verify

1. **P0-A** FinancialSummary (FE-only, nhỏ nhất) → verify bằng kỳ đã settle. ✅ DONE
2. **P1-C** hydration fix (độc lập, ảnh hưởng toàn app). ✅ DONE
3. ~~**P0-B** payout exposure~~ → implement xong, sau đó **GỠ HOÀN TOÀN** theo feedback (xem §2).
4. **P1-A** countdown + overdue (tách shared `draw-countdown.tsx`). ✅ DONE
5. ~~**P1-B** auto-follow + toast~~ → ĐÃ GỠ theo feedback.
6. **P2-1 → P2-6** lần lượt. ✅ DONE (P2-2 đổi thành KPI 6 cards không delta; P2-5 revert giữ layout cũ)

**Trạng thái:** Hoàn tất toàn bộ P0-A/P1/P2 cho Keno + đã điều chỉnh theo vòng feedback review (gỡ P0-B,
P1-B; revert P2-5). `check-types` pass (backoffice + game-keno-application + game-keno + shared), không
có linter error.

**Sau mỗi bước:** `pnpm --filter @megawin/backoffice check-types` (+ `--filter @megawin/game-keno-application` khi sửa backend); xem UI qua dev server; kiểm tra lint.

## 8. Rollout cho game khác (làm sau — cần phân tích riêng từng game)

| Hạng mục | mega645/power655/lotto535 | max3d/max3dpro | bingo18 |
|---|---|---|---|
| P0-A Financial fix | KHÁC: có Jackpot → giữ companyTake + jackpotContribution, chỉ sửa nếu có bug tương tự | Giống Keno (profit đơn giản) | Giống Keno |
| ~~P0-B Payout exposure~~ | ĐÃ GỠ khỏi Keno — không rollout sang game khác. Nếu cần lại, tham khảo pattern pre-match + multikey index đã archive trong §2 | — | — |
| P1-A Countdown | Reuse `components/games/shared/draw-countdown.tsx`, truyền grace dài hơn (chu kỳ 1 kỳ/ngày) | Reuse shared, grace tuỳ lịch quay | Reuse shared, grace mặc định (chu kỳ rất ngắn) |
| P2-2 KPI 6 cards | Áp dụng (thêm cards Jackpot nếu phù hợp) | Áp dụng | Áp dụng |
| P2-3 Large bet threshold | 2–5 triệu (doanh thu/kỳ lớn) — const riêng per-game | ~100 × unitPrice, quan sát thực tế | 1 triệu (như Keno) |
| P2 còn lại | Áp dụng chọn lọc | Áp dụng chọn lọc | Áp dụng chọn lọc |

Mỗi game sẽ có plan phụ riêng khi bắt đầu, tham chiếu plan này làm baseline.
