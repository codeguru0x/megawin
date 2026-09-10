system: keno-bingo18-multi-draw-ops-autopilot-plan (Analysis)

> Status: discussing · Ngày tạo: 06/09/2026
> Đây là bản lưu đầy đủ nội dung plan (Phase 0-4) vào `.cursor/analysis/` — tách biệt khỏi file plan
> quản lý bởi tool (`.cursor/plans/keno_bingo18_multi-draw_ops_+_autopilot_6d402339.plan.md`) để đảm
> bảo toàn bộ nghiên cứu/quyết định nằm trong `.cursor/analysis/` theo đúng yêu cầu.

## Tổng quan

Bỏ guard settle/void tuần tự cho Keno/Bingo18, thêm bulk settle/void API, xây trang Multi-Draw
Monitor (`operations-hub`), rồi thêm Auto-Pilot rule engine tái dùng cùng nền tảng — Mira/eve chỉ
đóng vai giải thích, không ra quyết định tài chính.

## Bối cảnh đã xác nhận (2 file phân tích liên quan)

- [`keno-bingo18-sequential-settle-guard.analysis.md`](./keno-bingo18-sequential-settle-guard.analysis.md):
  guard `DRAW_SETTLE_ORDER`/`DRAW_VOID_ORDER` là ràng buộc VẬN HÀNH, không phải ràng buộc tài chính
  thật cho Keno/Bingo18 (không jackpot). Rủi ro thật duy nhất khi bỏ guard: race TOCTOU ở
  `system_settle_game_daily`/`system_settle_tenant_daily` — bị ghi bởi CẢ 3 nguồn (settle lần đầu,
  resettle, void), không chỉ settle. File này còn có §5 nghiên cứu thiết kế chi tiết trang
  Multi-Draw Monitor (đối chiếu 2 trang hiện có, khối backend tái dùng được, khối cần xây mới,
  layout 4 zone).
- [`keno-bingo18-autopilot-eve-feasibility.analysis.md`](./keno-bingo18-autopilot-eve-feasibility.analysis.md):
  eve/Mira đã cài thật nhưng hiện chỉ read-only (30 tool `get*/list*`, không mutation, không cron).
  Auto-Pilot decision engine nên là deterministic use-case, KHÔNG dùng LLM. Auto-Pilot và Monitor
  nên là 1 initiative nhưng tuần tự theo thời gian (Monitor ổn định trước, Auto-Pilot sau).

## Danh sách việc cần làm (todos)

| ID | Nội dung | Trạng thái |
|---|---|---|
| `phase0-daily-rollup-lock` | Vá optimistic lock cho `system_settle_game_daily`/`tenant_daily` (chịu 3 nguồn ghi: settle/resettle/void) | pending |
| `phase1-remove-guard` | Xoá `DRAW_SETTLE_ORDER` + `DRAW_VOID_ORDER` khỏi Keno và Bingo18 (chỉ 2 game này) | pending |
| `phase2-bulk-api` | Thêm `TriggerSettleBatchUseCase`/`VoidDrawBatchUseCase` + endpoint, concurrency cap 5 | pending |
| `phase3-monitor-page` | Xây trang `/games/{game}/operations-hub`: Queue table + bulk action + slide-in Detail Panel | pending |
| `phase4-autopilot-config` | Thiết kế `OpsAutoSettleConfig` + `EvaluateAutoSettleEligibilityUseCase` (deterministic) | pending |
| `phase4-autopilot-worker` | Worker/cron auto-settle trong `apps/worker-{keno,bingo18}`, log quyết định, nối `AutoPilotToggle` thật | pending |

## Phase 0 — Vá race daily rollup (bắt buộc, làm trước tất cả)

Thêm optimistic lock/version cho `upsertGameDaily`/`upsertTenantDaily` trong
[`system-settle-game-daily-repo.ts`](../../packages/game-core-application/src/infras/repos/system-settle-game-daily-repo.ts)
và repo tenant tương ứng — chịu được ghi đồng thời từ settle/resettle/void cùng `financialDate`.

## Phase 1 — Bỏ guard tuần tự (Keno + Bingo18 CHỈ)

Xoá `DRAW_SETTLE_ORDER` khỏi `trigger-settle.ts` và `DRAW_VOID_ORDER` khỏi `void-draw.ts` của 2
package `game-keno-application` và `game-bingo18-application`. KHÔNG đụng 5 game jackpot còn lại.

## Phase 2 — Bulk settle/void API

Use-case mới `TriggerSettleBatchUseCase`/`VoidDrawBatchUseCase` (per game), concurrency cap 5,
chạy cả settle-batch và void-batch. Endpoint mới trong `apps/backoffice/src/app/api/games/{game}/draws/`.

## Phase 3 — Multi-Draw Monitor page (`/games/{game}/operations-hub`)

Thiết kế chi tiết ở [`keno-bingo18-sequential-settle-guard.analysis.md`](./keno-bingo18-sequential-settle-guard.analysis.md)
§5. Tóm tắt:

- **2 trang hiện có KHÔNG đủ**: `/draws` chỉ có 1 card kỳ đang mở + bảng lịch sử đã settle (không
  bulk, không checkbox); `/operations` thiết kế cho đúng 1 draw. Cần trang thứ 3 thật.
- **Tái dùng backend tối đa**: `GetDrawSelectorUseCase`/`getUnfinishedDraws()` (danh sách N draw
  active), `GetOpsSnapshotUseCase` (exposure/alertCounts theo draw), `OpsAlertBase.drawId`
  (alert model đã đúng cấu trúc per-draw), `DrawCommandCenter` + `LifecycleStepper` (dùng lại
  nguyên cho Detail Panel, chỉ đổi container full-page → Sheet/Drawer).
- **Cần xây mới**: DTO `MonitorDrawRow` (mở rộng `DrawSelectorItem` thêm `entryCount`,
  `totalStakeAmount`, `exposureTotal`, `alertCounts`), use-case batch `GetMonitorQueueUseCase`,
  mở rộng `ListAlertsInput` nhận `drawId[]`.
- **Layout 4 zone**: PageHeader → KPI Strip tổng hợp toàn hệ thống → Queue Table (checkbox chọn
  nhiều dòng + bulk action bar nổi lên gọi API Phase 2 + badge alert/exposure mỗi dòng) → Detail
  Panel slide-in khi click 1 dòng.

Theo `operations-page-ui.mdc` cho token màu/spacing/font-size ở Zone KPI/badge; Queue Table là
pattern mới, cần thêm rule riêng lúc implement (không tự chế token ngoài spacing scale đã quy định).

## Phase 4 — Auto-Pilot (sau khi Phase 3 chạy ổn định thực tế)

- `OpsAutoSettleConfig` (per-game, giống `OpsAlertsConfig`): ngưỡng stake, entry count, cho phép
  alert severity nào, thời gian chờ tối thiểu sau sales-closed.
- `EvaluateAutoSettleEligibilityUseCase` — thuần rule deterministic, KHÔNG gọi LLM.
- Worker/cron nhỏ trong `apps/worker-{keno,bingo18}` (EventBridge, không dùng eve schedule vì đây
  là mutation tài chính) gọi use-case trên rồi gọi bulk-settle API ở Phase 2.
- Log quyết định (`{game}_auto_settle_decisions`) hiển thị ngay trong Monitor table (badge
  "Auto-settled" / "Cần review — {lý do}").
- Nối lại `AutoPilotToggle` hiện có (đổi từ local state sang gọi API cấu hình thật).
- Mira/eve (nếu mở rộng) chỉ thêm tool read-only để giải thích quyết định — không tự ra quyết định
  mới, không mutation.

## Câu hỏi cần chốt trước khi code

1. Ngưỡng cụ thể cho Auto-Pilot (stake tối đa, entry tối đa, thời gian chờ tối thiểu) — cần user
   cung cấp số thật hoặc để giá trị mặc định an toàn rồi tinh chỉnh sau.
2. Có cần dialog xác nhận khi BẬT Auto-Pilot lần đầu (giao quyền trên đường tiền) như comment cũ
   trong `auto-pilot-toggle.tsx` đã gợi ý không?
