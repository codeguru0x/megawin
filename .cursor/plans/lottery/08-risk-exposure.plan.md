---
name: "Lottery 08 — Risk Exposure"
overview: "Risk pipeline: aggregate risk theo (viewKey, pick) batch worker, ngưỡng cảnh báo + auto-throttle market, Bảng Thao Tác Giá backoffice với Report View Catalog."
todos: []
isProject: false
---

# Plan 08 — Risk Exposure & Bảng Thao Tác Giá

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 05 (entries có picks), Plan 06 (worker infra).

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Docs & Rules

1. `docs/game/lottery/new/07-risk-exposure.md` — TOÀN BỘ — ĐỌC ĐẦU TIÊN
2. `docs/game/lottery/new/01-domain-model.md` §2.5 (viewKey), §4.1 (multikey index picks)
3. `.cursor/rules/operations-page-ui.mdc`, `.cursor/rules/frontend-dev.mdc`
4. `.cursor/rules/mongodb.mdc` — bulkWrite, aggregate

### Template

- Worker batch pattern: `apps/worker-bingo18/src/handlers/outstanding/` (sync định kỳ) — pattern gần nhất cho aggregate-risk.
- UI bảng dữ liệu lớn: financial reports UI các game (bảng + filter + drill-down).

---

## Tổng quan

Risk = tổn thất tiềm năng nếu 1 pick về, tính theo `(region, playType, position, betMode, pick)` = `(viewKey, pick)`.
Công thức: Đề theo TIỀN (`riskDe`); Lô-family theo ĐIỂM kỳ vọng với cap nháy `maxFrequenceForRisk` (07 §1).
Pipeline ĐỊNH KỲ (batch, không hot-write khi place-bet). Kết quả phục vụ: cảnh báo, auto-suspend market,
enforce `maxPointPerNumber` ở place-bet, và Bảng Thao Tác Giá.

---

## Phase 1: Use-cases risk (`use-cases/risk/`)

- `aggregate-risk.ts` — per draw đang mở bán: aggregate entries pending group theo (marketKey, pick token) từ `entrySummary.boards` (dùng multikey index); áp công thức per playType (bảng tra 07 §3, cap `maxFrequenceForRisk` 07 §1.3); bulkUpsert `lottery_risks` + totals `lottery_risk_tables`. **Idempotent — tính lại từ DB toàn bộ, không $inc tích luỹ.**
- `get-risk-view.ts` — query cho UI: filter theo viewKey/region/playType, sort risk desc, top-N pick nóng.
- `check-number-limit.ts` — cho place-bet (plan 05 Phase 1 bước 5): tổng point hiện có trên pick so `maxPointPerNumber` (đọc risk doc gần nhất + delta chấp nhận stale ngắn).
- `evaluate-thresholds.ts` — ngưỡng cảnh báo (07 §4.1): warn/critical per viewKey từ config; critical → auto `update-market-status(suspended, reason="risk_throttle")` + alert (label từ Report View Catalog).

## Phase 2: Worker

- `apps/worker-lottery/src/functions/risk.yml` — EventBridge rate (VD 1 phút khi có kỳ mở bán): aggregate-risk → evaluate-thresholds.
- Lô Live: khi LiveState open, tăng tần suất aggregate cho market loLive (giá trị config).
- Lock chống chạy chồng (pattern worker_lock hiện có).

## Phase 3: Backoffice — Bảng Thao Tác Giá

`(main)/games/lottery/risk/`:
- **Layout theo 07 §5**: mỗi viewKey 1 bảng tách (label/group từ Report View Catalog — plan 01); roll-up chọn xem theo region/playType.
- Mỗi bảng: rows = pick token, cột = tổng point, tổng tiền, risk, % so trần, trạng thái market. Highlight ngưỡng warn/critical.
- Actions inline: suspend/resume market (gọi update-market-status), chỉnh numberSurcharge nhanh (link sang config plan 03), chỉnh `maxPointPerNumber`.
- Drill-down pick → danh sách entries đang cược pick đó (query multikey index, cursor page).
- Auto-refresh (polling interval theo operations-page-ui pattern).
- API routes `api/lottery/risk/*`.

## Phase 4: Verify

- [ ] Unit test công thức riskDe / riskLo / risk3DLo / risk4DLo + cap maxFrequence (case số từ 07 §1).
- [ ] Test aggregate idempotent: chạy 2 lần cùng data → cùng kết quả.
- [ ] Test threshold → auto-suspend đúng market, không lan market khác.
- [ ] Test place-bet bị chặn khi vượt maxPointPerNumber.
