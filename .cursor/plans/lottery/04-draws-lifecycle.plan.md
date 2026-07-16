---
name: "Lottery 04 — Draws Lifecycle"
overview: "Use-cases quản lý kỳ quay: create-draw (seed markets), open/close sales, update-market-status, publish-result (staff nhập tay + validate cơ cấu giải), scheduler."
todos: []
isProject: false
---

# Plan 04 — Draws Lifecycle & Publish Result

> **Agent instruction**: Đọc plan này và thực hiện từng Phase theo thứ tự.
> **Dependency**: Plan 02. **Chặn bởi câu hỏi mở** #5 (cơ cấu giải chính xác MB27/MN18 để validate PublishResult).

---

## Tham chiếu bắt buộc — ĐỌC TRƯỚC KHI CODE

### Docs & Rules

1. `docs/game/lottery/new/01-domain-model.md` §5 — DrawDoc + 2 lớp status × markets — ĐỌC ĐẦU TIÊN
2. `docs/game/lottery/new/04-result-settle.md` §1 — cấu trúc result MB 27 bộ / MN 18 bộ
3. `.cursor/rules/mongodb.mdc`, `.cursor/rules/code-quality-standards.mdc`

### Template

- `packages/game-bingo18-application/src/use-cases/draws/` — create-draw, open-sales, close-sales, preview-draws, update-schedule, publish-result, get-current-draw, get-draw-detail, list-draws — COPY PATTERN
- `packages/game-bingo18-application/src/infras/repos/draw-repo.ts` — state transition guard
- Scheduler/cron hiện có của các game 1-kỳ-chậm (xem worker mega645/power655 tạo kỳ theo lịch — khác keno/bingo18 high-frequency)

---

## Tổng quan

Mỗi đài 1 kỳ/ngày, `drawId = YYYY-MM-DD.NNN` (thường `.001`), unique `{region, drawDate}`.
Lifecycle lớp 1 = `DrawStatus` game-core; lớp 2 = `draw.markets` per marketKey.
Result nhập tay bởi staff (Phase 1 roadmap), validate cơ cấu giải trước khi publish.

---

## Phase 1: Use-cases draws cơ bản

Thư mục `use-cases/draws/`:

- `create-draw.ts` — tạo kỳ cho (region, drawDate): drawNo từ counter; **seed `markets`** từ `listMarkets(region)` + config `marketRules[viewKey].isEnabled` (closed nếu disabled); `loLive.*` luôn khởi tạo `closed` (01 §5.1). Idempotent theo unique index.
- `preview-draws.ts` / `create-draws-batch.ts` — tạo trước N ngày × 4 đài.
- `open-sales.ts` / `close-sales.ts` — transition có guard; ghi `sales.openAt/closeAt`.
- `update-schedule.ts` — đổi drawTime/salesCloseAt kỳ chưa đóng.
- `get-current-draw.ts`, `get-draw-detail.ts`, `list-draws.ts` — query cho backoffice/player API.

## Phase 2: Market status (lớp 2)

- `update-market-status.ts` — đổi status 1 market (open/suspended/closed) kèm `reason`/`updatedBy` audit; hỗ trợ **suspend hàng loạt theo playType** (mọi marketKey prefix `${playType}.`).
- Guard: không đổi market khi draw đã `published`/`settling`/`settled`; `loLive.*` chỉ đổi qua use-cases live (plan 07) — chặn ở đây.
- Audit log đầy đủ (ai, bảng nào, lý do).

## Phase 3: Publish result (staff nhập tay)

- `publish-result.ts` — nhận result union theo đài:
  - MB: 27 bộ số đúng cơ cấu (special 1×5d, first 1×5d, second 2×5d, third 6×5d, fourth 4×4d, fifth 6×4d, sixth 3×3d, seventh 4×2d) — **xác nhận với product (câu hỏi #5)**.
  - MN: 18 bộ đúng cơ cấu (eighth 1×2d … special 1×6d).
- `validate-result.ts` — pure validate: đủ số bộ, đúng độ dài từng hạng, toàn chữ số; tách riêng để unit test.
- Transition `salesClosed → published`, set `result` + `drawResultAt`. Cho phép sửa result khi CHƯA settle (re-publish có audit); sau settle → đi đường resettle (plan 10).
- `trigger-settle.ts` — enqueue SFN settle (implement thật ở plan 06; ở đây chỉ tạo use-case gọi service).

## Phase 4: Scheduler worker (tạo kỳ + auto open/close)

- Trong `apps/worker-lottery` (scaffold tối thiểu nếu plan 06 chưa chạy): cron tạo kỳ N ngày tới, auto open-sales đầu ngày, auto close-sales trước giờ quay từng đài (giờ quay per region đọc từ GlobalConfig playRules).
- Mirror pattern functions yml của worker hiện có.

## Phase 5: API routes backoffice

- `apps/backoffice/src/app/api/lottery/draws/` — list/detail/create/open/close/update-schedule/publish-result/market-status — mirror `api/bingo18/draws`.
- UI draws page đầy đủ làm ở plan 09; plan này chỉ cần API hoạt động (test qua curl/vitest).

## Phase 6: Verify

- [ ] Unit test validate-result đủ case sai cơ cấu.
- [ ] Test transition guard (không mở bán kỳ đã published, v.v.).
- [ ] Test seed markets: region MB có `loLive.*` closed, marketRules disabled → closed.
