---
name: "Lottery 11 — Reports"
overview: "Phase 2: outstanding reports, settle daily reports, void reports + financial reports UI cho lottery, tích hợp system reports."
todos: []
isProject: false
---

# Plan 11 — Reports (Outstanding / Settle Daily / Void) & UI

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 06 (settle + report scaffolds), Plan 10 (void reports).

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Rules & Plans mẫu

1. `.cursor/rules/financial-reporting-system.mdc` — ĐỌC ĐẦU TIÊN (report docs, sync pipeline)
2. `.cursor/rules/financial-report-ui.mdc` — UI chuẩn báo cáo
3. `.cursor/plans/bingo18_financial_reports.plan.md` + `bingo18_financial_reports_ui.plan.md` + `bingo18-outstanding-drill-down.md` — plan mẫu

### Template

- `packages/game-bingo18-application/src/use-cases/reports/*` — COPY TOÀN BỘ PATTERN (18 use-cases: outstanding/settle/void × system/tenant/player/entry drill-down)
- `apps/worker-bingo18/src/handlers/outstanding/`, `functions/outstanding.yml`
- `apps/backoffice/src/app/(main)/games/bingo18/reports/`, `api/bingo18/reports/`
- System reports tích hợp: `.cursor/plans/lotto535_+_system_reports_4768b6a5.plan.md`

---

## Tổng quan

3 nhóm báo cáo chuẩn MegaWin, drill-down 4 cấp: system → tenant → player → entry.
- **Outstanding**: tiền đang treo (entries pending) per game/tenant/player — sync worker định kỳ.
- **Settle daily**: doanh thu/trả thưởng/hoa hồng/profit theo financialDate — ghi từ settle pipeline (plan 06 đã scaffold publish-settle-daily/publish-player-daily).
- **Void**: refund reports theo kỳ/tenant/player.

Đặc thù lottery cho mọi báo cáo: thêm chiều **region** và breakdown **per marketKey/viewKey** (label từ Report View Catalog) ở cấp drill-down kỳ.

---

## Phase 1: Report use-cases (`use-cases/reports/`)

- Mirror 18 use-cases bingo18 (get-outstanding-reports, sync-outstanding, list-outstanding-* 3 cấp, list-settle-draw-reports, list-tenant-reports, list-draw-tenants, list-player-breakdown, list-entry-breakdown, get-draw-summary, list-tenant-draws, list-void-* 4 files, types.ts).
- Report repos đã scaffold plan 02/06 — bổ sung field region + marketBreakdown vào report docs (entities plan 01 `report.ts`).

## Phase 2: Worker sync

- `functions/outstanding.yml` + handlers sync-outstanding (rate theo pattern bingo18).
- Settle daily/player daily đã nằm trong SFN settle (plan 06) — verify ghi đúng.

## Phase 3: API + UI

- `api/lottery/reports/*` mirror bingo18.
- `(main)/games/lottery/reports/`: tabs Outstanding / Settle / Void theo `financial-report-ui.mdc`; drill-down system → tenant → player → entries; filter region + date range; cột breakdown marketKey ở draw summary.
- Tích hợp gameKey `lottery` vào **system financial reports** tổng (pattern system_financial_reports_ui) + dashboard tổng nếu dashboard đã aggregate per game.

## Phase 4: Verify

- [ ] Đối soát số: settle daily = Σ DrawFinancial các kỳ cùng financialDate; outstanding khớp Σ entries pending.
- [ ] Drill-down đủ 4 cấp không lệch tổng giữa cấp.
- [ ] UI screenshot đủ 3 tab; test filter region.
