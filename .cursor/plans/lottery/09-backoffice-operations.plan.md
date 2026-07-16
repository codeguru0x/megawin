---
name: "Lottery 09 — Backoffice Operations & Draws"
overview: "Trang Operations (live entries, winning entries, tenant breakdown) và trang Draws (danh sách kỳ, chi tiết, nhập kết quả, đóng/mở market) cho lottery."
todos: []
isProject: false
---

# Plan 09 — Backoffice Operations & Draws Pages

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 06 (settle chạy được để có data đầy đủ). API draws đã có từ plan 04.

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Rules & Skills

1. `.cursor/rules/operations-page-ui.mdc` — ĐỌC ĐẦU TIÊN
2. `.cursor/rules/frontend-dev.mdc`, `.cursor/rules/code-quality-standards.mdc`
3. Skill `frontend-design`, `shadcn`

### Template

- Plan mẫu: `.cursor/plans/bingo18_operations_draws.plan.md` — cấu trúc phase chuẩn
- Operations page: `apps/backoffice/src/app/(main)/games/keno/operations/` (draw-selector, use-draw-context, use-operations hooks) — COPY STRUCTURE
- Operations use-cases: `packages/game-bingo18-application/src/use-cases/operations/` + `dto/draw-selector.dto.ts`
- Draws page: `apps/backoffice/src/app/(main)/games/bingo18/draws/`
- API: `apps/backoffice/src/app/api/bingo18/operations/`, `api/bingo18/draws/`

---

## Tổng quan

Khác keno/bingo18 (high-frequency): lottery chỉ 4 kỳ/ngày (1 per đài) → draw selector nhóm theo
**region + ngày**, không cần selector 160 kỳ. Điểm đặc thù: cột `region`, breakdown theo
playType × betMode (marketKey), trạng thái markets trong kỳ, picks hiển thị dạng token.

---

## Phase 1: Use-cases operations (`use-cases/operations/`)

- `dto/draw-selector.dto.ts` — thêm `region` vào DrawSelectorItem; group `active|upcoming|recent` per region.
- `get-draw-selector.ts`, `get-ops-summary.ts` (KPI kỳ: tổng vé/entries/point/tiền, breakdown per marketKey), `list-live-entries.ts` (entries pending, filter pick/playType/tenant, cursor), `list-winning-entries.ts` (sau settle, sort winAmount), `list-tenant-breakdown.ts`.

## Phase 2: API routes (`api/lottery/operations/`)

- Mirror `api/bingo18/operations` (summary, live-entries, winning-entries, tenant-breakdown, draw-selector).

## Phase 3: Operations page (`(main)/games/lottery/operations/`)

- `_lib/`: `use-draw-context.tsx` (thêm chiều region), `draw-selector.tsx` (chọn đài + ngày), `use-operations.ts` hooks.
- Tabs: Tổng quan (KPI + breakdown marketKey) / Entries đang chờ / Entries trúng / Tenant breakdown.
- Hiển thị board: badge playType + position + betMode, picks token, point, tiền. Dùng labels từ `@megawin/game-lottery/labels`.
- Link nhanh sang trang Risk (plan 08) và Live (plan 07) khi xem kỳ MB.

## Phase 4: Draws page (`(main)/games/lottery/draws/`)

- Danh sách kỳ theo ngày × 4 đài; trạng thái lifecycle + số markets open/suspended/closed.
- Chi tiết kỳ: **panel markets** — bảng marketKey (label catalog) + status + reason + actions suspend/resume/close (per market và per playType hàng loạt).
- **Form nhập kết quả** (publish-result): layout theo cơ cấu MB 27 / MN 18, validate client mirror `validate-result`, confirm 2 bước trước publish.
- Actions: tạo kỳ batch, open/close sales, update schedule, trigger settle — với guard trạng thái + confirm dialog.
- Components tái sử dụng đặt tại `apps/backoffice/src/components/games/lottery/` (result-display, market-status-badge, region-badge, stat-card).

## Phase 5: Đăng ký game vào backoffice registry (touchpoints hệ thống)

Khảo sát bingo18 — các file registry PHẢI chạm khi thêm game mới:

- `src/navigation/sidebar/sidebar-items.ts` (~dòng 308) — menu "Xổ Số" với 7 sub-items: operations, draws, reports/settle, reports/outstanding, reports/void, config/game, config/tenant (+ live, risk riêng của lottery).
- `src/lib/query-keys/` — tạo `lottery.ts` (`lotteryKeys`), đăng ký vào `index.ts` và `modules.ts`.
- `src/lib/game-labels.ts` + `src/lib/game-colors.ts` — label + màu riêng cho lottery.
- `src/app/globals.css` — CSS vars `--game-lottery`, `--game-lottery-muted` (cả light + dark theme).
- `src/app/api/dashboard/draws/_lib/get-dashboard-draws.ts` — đăng ký `LotteryDrawRepository` vào danh sách game của dashboard. Lottery 1 kỳ/ngày/đài → KHÔNG thêm vào `HIGH_FREQ_GAMES`.
- `dashboard/_components/draw-timeline.tsx` — kiểm tra timeline render đúng với game mới.

## Phase 6: Verify

- [ ] check-types/lint pass; UI verify bằng browser với data seed dev, screenshot các tab.
- [ ] Test nhập kết quả sai cơ cấu → lỗi rõ ràng từng ô.
- [ ] Sidebar, query-keys, game-colors, dashboard draws hiển thị đúng game mới.
