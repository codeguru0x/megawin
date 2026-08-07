# p0-03 — Operations API + UI + Config Tab + Dead-code Cleanup

> **Nguồn:** `.cursor/analysis/mega645-operations-risk-control.analysis.md` §3.8 (get-config default), §5 (API/UI), §5.3 (dead-code)
> **Phase:** P0 · **Thứ tự:** 03 · **Phụ thuộc:** p0-01 (entities), p0-02 (data đã đầy).
> **Package đích:** `packages/game-mega645-application` (use-case đọc) + `apps/backoffice`.

## Mục tiêu

Chuyển tầng đọc sang snapshot model: 3 nhóm API mới (snapshot / alerts / combo-lookup), get-config merge default `ops`, tab config "Vận hành", trang ops refactor về **1 nhịp chung `tickSeconds`** (chuẩn chốt tại Power 6/55 §5.2), thêm exposure-card + alerts panel, và xoá sạch dead code aggregation on-demand (analysis §5.3).

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File mẫu (Power 6/55 — ưu tiên; Keno production khi Power 6/55 chưa xong p0-03) |
|---|---|
| Use-case đọc snapshot/alerts/combo | `packages/game-power655-application/src/use-cases/operations/{get-ops-snapshot,list-alerts,ack-alert,get-combo-lookup}.ts` + `dto/ops.dto.ts` |
| API routes | `apps/backoffice/src/app/api/power655/operations/{snapshot,alerts,combo-lookup}/` |
| UI trang ops (hooks, sections, adapters) | `apps/backoffice/src/app/(main)/games/power655/operations/_lib/` (`use-operations.ts`, `ops-constants.ts`, `adapters.ts`, `sections/`) |
| Tab config "Vận hành" | `apps/backoffice/src/app/(main)/games/power655/config/game/_lib/ops-section.tsx` + Zod `apps/backoffice/src/app/api/power655/config/_lib/schema.ts` |
| Guideline layout | `../keno-ops-risk-control/operations-page-layout.guideline.md` + `ops-config-page-layout.guideline.md` |

## File & thay đổi

### 1. Use-cases đọc mới — `packages/game-mega645-application/src/use-cases/operations/`

- TẠO `get-ops-snapshot.ts` — `GetOpsSnapshotUseCase`: gộp 1 response từ 5 nguồn pre-aggregated (analysis §5.1): `statsRepo.findByDrawId` (findOne) + `numberStatsRepo.findByDrawId` (≤45 docs) + `accountStatsRepo.findTopByAmount(K)` + `comboStatsRepo.findTopBySets(K)` + `alertRepo.countByStatus`. Chạy các query **`Promise.all`** (độc lập — không waterfall). Response kèm:
  - `thresholds` từ `config.ops.alerts` (UI KHÔNG hardcode ngưỡng) + `tickSeconds` (UI dùng làm nhịp poll chung).
  - `exposure`: `fixedWorstCase` từ stats doc + `jackpotExposure` = **1 số duy nhất** (analysis §3.6, adapt so với Power 6/55 JP1+JP2): draw đã settle → `DrawJackpotSnapshot.closingAmount`; draw active → `jackpotCycle.currentAmount`. JSDoc use-case ghi rõ công thức 2 phần + nguồn per trạng thái draw.
  - `uniquePlayers` từ `accountStatsRepo.countByDrawId`.
  - Đối chiếu Power 6/55: nếu có ETag/304 conditional response → copy nguyên cơ chế.
- TẠO `list-alerts.ts` + `ack-alert.ts` + `get-combo-lookup.ts` — copy Power 6/55; combo-lookup trả combo doc + danh sách account từ `combo-accounts` (`listByCombo`).
- TẠO `dto/ops.dto.ts` — DTO named types (KHÔNG indexed-access §5.4), export barrel.
- KHÔNG use-case nào đụng aggregation trên `mega645_ticket_entries` — snapshot đọc thuần `findOne`/`find` + limit.

### 2. Get-config merge default `ops` (analysis §3.8)

SỬA `GetGameConfigUseCase` (mega645, đường đọc cho BO) + mapper global-config: khi (a) chưa có config doc, hoặc (b) doc cũ thiếu section `ops` → merge `DEFAULT_MEGA645_CONFIG.ops` tại tầng đọc (mapper normalize — §7.4). BO vào tab "Vận hành" lần đầu KHÔNG lỗi, form hiện default sẵn để lưu. Worker p0-02 `beforeLoop` dùng chung đường này (đóng rủi ro R8 của p0-02). JSDoc method ghi: "Merge default cho section `ops` — schema evolution, doc cũ trước p0-01 không có `ops`".

SỬA `UpdateGameConfigUseCase`: nhận và persist section `ops` (merge partial theo pattern update hiện hành); KHÔNG viết `validateInput` lặp Zod (rule §8 code-quality).

### 3. API routes — `apps/backoffice/src/app/api/mega645/operations/`

| Route | Việc |
|---|---|
| `snapshot/route.ts` | TẠO — `withApi()` + query schema `{drawId}`, gọi `GetOpsSnapshotUseCase` |
| `alerts/route.ts` + `alerts/[id]/ack/route.ts` | TẠO — list (filter status/severity qua Zod) + ack (audit-log theo tiền lệ Power 6/55/Keno) |
| `combo-lookup/route.ts` | TẠO — query `{drawId, comboKey}` |
| `summary`, `tenant-breakdown`, `number-frequency`, `playtype-distribution`, `top-combos` | **XOÁ** (mục 6) |
| `draw-selector`, `live-entries`, `winning-entries` | GIỮ nguyên |

SỬA `apps/backoffice/src/app/api/mega645/config/_lib/schema.ts`: thêm `opsSchema` (Zod) — range: các ngưỡng VND `positive().int()`, `comboAccountsWarn` int ≥ 2, `tickSeconds` int 5–60, `enabled` record theo `z.enum(Object.values(Mega645OpsAlertType))`. Bảng defaults phải nằm TRONG range: 30tr / 500tr / 5 / 30tr (đóng rủi ro R4 của p0-01).

### 4. UI trang ops — `apps/backoffice/src/app/(main)/games/mega645/operations/`

Refactor `_lib/use-operations.ts` về **2 nhịp** (analysis §5.2):

- `useDrawSelectorList` — 15s.
- `useOpsSnapshot` — poll `snapshot` theo `tickSeconds` TRẢ VỀ TỪ SERVER (default khi chưa có response: hằng `ops-constants.ts`); dừng khi draw TERMINAL.
- `useLiveFeed` — **DÙNG CHUNG nhịp `tickSeconds`** với snapshot; chỉ chạy khi tab analytics mở; dừng khi TERMINAL.
- Badge alert đọc từ snapshot (KHÔNG timer riêng); panel alerts fetch chi tiết on-demand khi mở.
- GIỮ `useJackpotCurrent` hiện có (KPI jackpot 1 pool — analysis §5.2).
- Best practice bắt buộc: 1 query snapshot + `select` slice per-section (`vercel-react-best-practices` §4.3/§5); compound components cho sections (`vercel-composition-patterns`); conditional rendering tường minh (`count > 0 ? … : null`); shadcn primitives từ registry — đọc skill `.cursor/skills/shadcn` + `frontend-design` TRƯỚC khi dựng component mới.

Sections (`_lib/sections/`), theo `operations-page-ui.mdc` + guideline layout:

- SỬA `kpi/` — thêm **exposure-card**: fixed worst-case (badge vượt ngưỡng theo `thresholds` server) + **jackpot pool 1 số** (khác Power 6/55 hiển thị JP1/JP2); GIỮ KPI jackpot hiện có.
- TẠO `alerts/` — panel + badge, format payload theo TYPE (không lộ JSON thô); action Ack; alert đã ack hiển thị dạng disclosure.
- SỬA `analytics/` — heatmap **45 số** đọc từ `snapshot.numberStats` với toggle `sets`/`amount`; phân bố 12 playType nhấn nhóm Bao cao (bao13–18); topCombos hiển thị `numbers + playType + sets + accountCount` + drill-down combo-lookup; topAccounts ưu tiên `username` fallback `accountId`.
- **Heatmap tra combo trực tiếp — BẮT BUỘC theo chuẩn analysis §3.10(7), copy Power 6/55 `number-heatmap.tsx` (gốc Keno)**:
  - Mọi ô số là `<button aria-pressed>` LUÔN click chọn/bỏ chọn được (multi-select) — ô selected có ring brand màu Mega 6/45 (`GAME_COLORS[GameProduct.Mega645]`), badge tô đậm.
  - Menu `DropdownMenu` (icon `MoreHorizontal`) trên header card heatmap → mở Dialog tra cứu combo. **Menu và item mở dialog LUÔN bật — KHÔNG check điều kiện enable/disable theo số đã chọn.**
  - Dialog: bộ số đang chọn làm input; CSV input editable + chips **đồng bộ 2 chiều** với grid (state `selected` lift lên cha); nút "Bỏ chọn tất cả"; counter "Đã chọn N số".
  - PlayType **TỰ SUY theo số lượng đã chọn** — Mega 6/45: 5 = bao5, 6 = standard, 7–15 = baoN, 18 = bao18 (16/17 số không map → hint nhẹ client-side; vẫn cho bấm tra thì API trả 400 — API là chốt chặn cuối).
  - Tra → gọi route `combo-lookup` (staff — kèm danh sách account, khác endpoint player p1-01); kết quả kèm **giá 1 lần cược bộ số** (`unitPrice × BAO_COMBINATIONS[playType]`; bao5 = 40 lines = 400k — KHÔNG copy 500k của Power 6/55); hiển thị người chơi qua `PlayerName` (rule `player-display-username.mdc`).
- GIỮ `draw-management/` (có `resettle-action` sẵn), `result/`.
- SỬA `adapters.ts`/`types.ts` — map DTO snapshot → props section; XOÁ types của 5 hook cũ.

### 5. Tab config "Vận hành" — `(main)/games/mega645/config/game/_lib/`

TẠO `ops-section.tsx` — copy `power655/config/game/_lib/ops-section.tsx` + guideline `ops-config-page-layout.guideline.md`: nhóm ngưỡng (4 field VND/số) + `AlertToggleRow` cho 4 alert P0 (label + mô tả điều kiện bật lấy từ JSDoc §3.7, tooltip 4 phần theo `game-config-ui.mdc` §16) + nhóm stats (tickSeconds, topK). SỬA `use-game-config.ts` + `page.tsx` đăng ký tab (nuqs theo §14 `game-config-ui.mdc`). 2 alert để-dành (`revenue_anomaly`, `settle_stuck`) KHÔNG hiện toggle.

### 6. Dead-code cleanup (BẮT BUỘC — analysis §5.3, xoá theo chuỗi phụ thuộc)

Thứ tự: hook → component props → route → use-case → repo method → query-keys.

- Hooks trong `use-operations.ts`: `useOpsSummary`, `useOpsTenantBreakdown`, `useOpsNumberFrequency`, `useOpsPlayTypeDistribution`, `useOpsTopCombos`.
- Query-keys tương ứng trong `apps/backoffice/src/lib/query-keys/mega645.ts`.
- Routes: `summary/`, `tenant-breakdown/`, `number-frequency/`, `playtype-distribution/`, `top-combos/` (+ `_lib` schema của chúng).
- Use-cases: `get-ops-summary`, `get-number-frequency`, `get-playtype-distribution`, `get-tenant-breakdown`, `get-top-combos` + DTO phần tương ứng trong `operations.dto.ts` + barrel `operations/index.ts` + `helpers.ts` nếu 0 caller còn lại.
- Repo methods `entry-repo.ts`: `aggregateOpsSummary` (dòng ~1072), `aggregateTenantBreakdown` (~1120), `aggregateNumberFrequency` (~1171), `aggregateTopCombos` (~1239), `aggregatePlayTypeDistribution` (~1332) + `buildOpsFilter` (~1059) nếu 0 caller còn lại.
- GIỮ: `get-draw-selector`, `get-live-entries`, `get-winning-entries` + repo methods chúng dùng (`getLatestEntriesByDrawId`, `countEntriesByDrawId`, `getWinningEntries`…).

Mỗi mục xoá: grep toàn repo 0 consumer TRƯỚC khi xoá (match còn lại thuộc game khác chưa migrate là hợp lệ — ghi rõ trong PR).

## Cách review (sau khi implement)

1. Diff đối chiếu từng mục; UI so với guideline layout + trang Power 6/55 thật (mở 2 trang cạnh nhau).
2. Kiểm nhịp poll: đúng 2 nguồn nhịp (`15s` selector + `tickSeconds` chung snapshot/live) — grep `setInterval|refetchInterval` trong `_lib/` chỉ còn 2 nguồn (+ `useJackpotCurrent` giữ nguyên hiện trạng — ghi rõ nếu có nhịp riêng sẵn); badge alert KHÔNG timer riêng.
3. Kiểm thresholds: grep số ngưỡng hardcode (`30_000_000|500_000_000`) trong `apps/backoffice/src/app/(main)/games/mega645/operations` = 0 match (chỉ được nằm ở defaults domain package).
4. Kiểm read path: use-case snapshot không gọi method `aggregate*` nào trên entry-repo (grep) — chỉ findOne/find/count trên collection stats.
5. Dead-code: grep từng tên hook/use-case/route đã xoá toàn repo = 0 consumer mega645.
6. Kiểm giá bao5 hiển thị = 400k (KHÔNG 500k) — điểm copy-nhầm dễ nhất từ Power 6/55.
7. UI checklist: chạy skill `web-design-guidelines` review component mới (exposure-card, alerts panel); `tabular-nums` cho số tiền; a11y label cho toggle.
8. Đối chiếu bảng verdict §6 analysis — phát sinh diverge mới → thêm dòng vào bảng D của Power 6/55.

## Cách test

```bash
pnpm --filter @megawin/game-mega645-application check-types && pnpm --filter @megawin/game-mega645-application test
pnpm --filter @megawin/backoffice check-types && pnpm --filter @megawin/backoffice lint
```

Unit tests viết mới (vitest sẵn có; tuân quy tắc staging DB 00-overview — **KHÔNG deleteMany, KHÔNG upsert đè global config staging**):

1. `test/use-cases/global-config.test.ts` (mở rộng file sẵn có) — test merge-default qua **MAPPER thuần** (truyền doc object, không đụng DB): (a) doc KHÔNG có `ops` → merge defaults đủ field; (b) doc có `ops` một phần → field thiếu lấp default, field có giữ nguyên; (c) `DEFAULT_MEGA645_CONFIG.ops` qua mapper → giữ nguyên giá trị (ép defaults đúng shape — thay cho test Zod tự động, xem ghi chú dưới). Phần đọc DB thật: CHỈ ĐỌC config staging và assert shape (`ops` tồn tại sau merge), KHÔNG ghi.
2. `test/use-cases/get-ops-snapshot.test.ts` — seed stats/number/account/combo/alert docs với `TEST_DRAW_ID` duy nhất per-run → snapshot đúng shape; **logic ngược:** draw chưa có stats doc (worker chưa chạy) → snapshot zero-value KHÔNG throw (mapper normalize); thresholds + tickSeconds có mặt trong response; draw settled có `DrawJackpotSnapshot` → `jackpotExposure = closingAmount`, draw active → `cycle.currentAmount`.

> **Zod `opsSchema` không có test tự động** — backoffice KHÔNG có test runner, và test app không được import ngược BO (dependency boundary). Verify bằng: (1) test 1c ép defaults qua mapper; (2) test thủ công form BO tab "Vận hành" (lưu default → không lỗi Zod). Đây là quyết định đã chốt tại Power 6/55 p0-03 — áp dụng nguyên.

Test thủ công trên browser (dev, sau khi p0-02 worker chạy seed data):

1. Trang ops: chọn draw active → KPI/heatmap 45 số/topCombos/topAccounts hiển thị; DevTools Network xác nhận chỉ 2 nhịp poll (+ jackpot hiện trạng); đặt vé mới qua API player → sau ≤ 1 tick worker + 1 tick poll, số liệu nhích.
2. Alert flow: hạ `largeBetAmount` xuống 10k qua tab config → đặt vé 500k → alert `large_bet` xuất hiện ≤ 2 phút → Ack → alert chuyển trạng thái, không quay lại New ở tick sau.
3. Tab config "Vận hành" trên môi trường DB CHƯA từng lưu `ops` → form hiện defaults (30tr/500tr/5/30tr), không lỗi console; lưu → reload → giá trị giữ.
4. Draw settled: mở trang → cả 2 nhịp poll DỪNG (Network im lặng).
5. Heatmap: chọn 6 số → dialog tự suy `standard`, tra ra kết quả kèm giá 10k; chọn 5 số → `bao5` giá 400k; chọn 16 số → hint không map playType, bấm tra → lỗi 400 hiển thị lịch sự.

## Rủi ro & cách test rủi ro

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | **BO trắng trang khi worker chưa chạy/stats doc chưa có** | Test unit 2 (logic ngược) + thủ công: tắt worker, mở trang ops draw mới → snapshot zero-value, UI hiện trạng thái trống lịch sự, KHÔNG crash. |
| R2 | **Get-config thiếu merge default → tab Vận hành lỗi lần đầu** | Test unit 1a/1b + thủ công 3 trên DB không có `ops`. |
| R3 | Xoá nhầm repo method còn caller (settle/report dùng chung helper) | Grep từng method TRƯỚC khi xoá; check-types toàn workspace sau xoá. |
| R4 | Nhịp poll không dừng khi settled → phí request vô hạn | Test thủ công 4 + đọc code điều kiện `enabled` của query. |
| R5 | Ngưỡng hardcode client lệch config runtime | Review mục 3 (grep = 0) + thủ công: đổi ngưỡng qua config → badge exposure đổi trạng thái không cần deploy. |
| R6 | `jackpotExposure` đọc sai nguồn theo trạng thái draw (draw cũ vs cycle hiện hành) | Test unit 2: draw settled → `closingAmount` từ snapshot; draw active → `cycle.currentAmount`. Đối chiếu nguồn jackpot của trang ops hiện tại (`useJackpotCurrent`). |
| R7 | Copy nhầm hằng Power 6/55 vào UI (55 số, bao5 500k, JP2 card) | Review mục 1/6: heatmap render đúng 45 ô; giá bao5 400k; exposure-card chỉ 1 jackpot pool. |
| R8 | Ack race: 2 staff ack cùng alert | `ackById` filter `{_id, status: New}` — người sau nhận notFound/no-op êm; test unit ack 2 lần (drawId test riêng, không cleanup). |
| R9 | Test ghi đè global config staging | Quy tắc 00-overview mục 4: test merge-default chạy trên mapper thuần; phần DB chỉ ĐỌC. Review grep `upsertGlobalConfig` trong test mới = 0 match (helper seed chỉ dùng khi doc chưa tồn tại — giữ nguyên hành vi file test cũ, không mở rộng). |
