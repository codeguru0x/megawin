# p0-03 — Operations API + UI + Config Tab + Dead-code Cleanup

> **Nguồn:** `.cursor/analysis/power655-operations-risk-control.analysis.md` §3.8 (get-config default), §5 (API/UI), §5.3 (dead-code)
> **Phase:** P0 · **Thứ tự:** 03 · **Phụ thuộc:** p0-01 (entities), p0-02 (data đã đầy).
> **Package đích:** `packages/game-power655-application` (use-case đọc) + `apps/backoffice`.

## Mục tiêu

Chuyển tầng đọc sang snapshot model: 3 nhóm API mới (snapshot / alerts / combo-lookup), get-config merge default `ops`, tab config "Vận hành", trang ops refactor về **1 nhịp chung `tickSeconds`** (điểm diverge D2 so với Keno), thêm exposure-card + alerts panel, và xoá sạch dead code aggregation on-demand.

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File Keno production |
|---|---|
| Use-case đọc snapshot/alerts/combo | `packages/game-keno-application/src/use-cases/operations/{get-ops-snapshot,list-alerts,ack-alert,get-combo-lookup}.ts` + `dto/` |
| API routes | `apps/backoffice/src/app/api/keno/operations/{snapshot,alerts,combo-lookup}/` |
| UI trang ops (hooks, sections, adapters) | `apps/backoffice/src/app/(main)/games/keno/operations/_lib/` (`use-operations.ts`, `ops-constants.ts`, `adapters.ts`, `sections/`) |
| Tab config "Vận hành" | `apps/backoffice/src/app/(main)/games/keno/config/game/_lib/ops-section.tsx` + Zod `apps/backoffice/src/app/api/keno/config/_lib/schema.ts` (đối chiếu path thật lúc implement) |
| Guideline layout | `../keno-ops-risk-control/operations-page-layout.guideline.md` + `ops-config-page-layout.guideline.md` |

## File & thay đổi

### 1. Use-cases đọc mới — `packages/game-power655-application/src/use-cases/operations/`

- TẠO `get-ops-snapshot.ts` — `GetOpsSnapshotUseCase`: gộp 1 response từ 5 nguồn pre-aggregated (analysis §5.1): `statsRepo.findByDrawId` (findOne) + `numberStatsRepo.findByDrawId` (≤55 docs) + `accountStatsRepo.findTopByAmount(K)` + `comboStatsRepo.findTopBySets(K)` + `alertRepo.countByStatus`. Chạy các query **`Promise.all`** (độc lập — không waterfall). Response kèm:
  - `thresholds` từ `config.ops.alerts` (UI KHÔNG hardcode ngưỡng — Keno §4.4) + `tickSeconds` (UI dùng làm nhịp poll chung).
  - `exposure`: `fixedWorstCase` từ stats doc + `jackpotExposure` đọc jackpot cycle hiện hành lúc build response (KHÔNG lưu — analysis §3.6). JSDoc use-case ghi rõ công thức 2 phần.
  - `uniquePlayers` từ `accountStatsRepo.countByDrawId`.
  - Đối chiếu Keno: nếu Keno có ETag/304 conditional response (tiền lệ Bingo18 p0-05) → copy nguyên cơ chế.
- TẠO `list-alerts.ts` + `ack-alert.ts` + `get-combo-lookup.ts` — copy Keno; combo-lookup trả combo doc + danh sách account từ `combo-accounts` (`listByCombo`).
- TẠO `dto/ops.dto.ts` — DTO named types (KHÔNG indexed-access §5.4), export barrel.
- KHÔNG use-case nào đụng aggregation trên `ticket_entries` — snapshot đọc thuần `findOne`/`find` + limit (nguyên tắc MongoDB read path).

### 2. Get-config merge default `ops` (chốt 05/08 — analysis §3.8)

SỬA `GetGameConfigUseCase` (power655, đường đọc cho BO) + mapper global-config: khi (a) chưa có config doc, hoặc (b) doc cũ thiếu section `ops` → merge `DEFAULT_POWER655_CONFIG.ops` tại tầng đọc (mapper normalize — §7.4). BO vào tab "Vận hành" lần đầu KHÔNG lỗi, form hiện default sẵn để lưu. Worker p0-02 `beforeLoop` dùng chung đường này (đóng rủi ro R7 của p0-02). JSDoc method ghi: "Merge default cho section `ops` — schema evolution, doc cũ trước p0-01 không có `ops`".

SỬA `UpdateGameConfigUseCase`: nhận và persist section `ops` (merge partial theo pattern update hiện hành); KHÔNG viết `validateInput` lặp Zod (rule §8 code-quality).

### 3. API routes — `apps/backoffice/src/app/api/power655/operations/`

| Route | Việc |
|---|---|
| `snapshot/route.ts` | TẠO — `withApi()` + query schema `{drawId}`, gọi `GetOpsSnapshotUseCase` |
| `alerts/route.ts` + `alerts/[id]/ack/route.ts` | TẠO — list (filter status/severity qua Zod) + ack (audit-log theo tiền lệ Keno) |
| `combo-lookup/route.ts` | TẠO — query `{drawId, comboKey}` |
| `summary`, `tenant-breakdown`, `number-frequency`, `playtype-distribution`, `top-combos` | **XOÁ** (mục 6) |
| `draw-selector`, `live-entries`, `winning-entries` | GIỮ nguyên |

SỬA `apps/backoffice/src/app/api/power655/config/_lib/schema.ts`: thêm `opsSchema` (Zod) — range: các ngưỡng VND `positive().int()`, `comboAccountsWarn` int ≥ 2, `tickSeconds` int 5–60, `enabled` record theo `z.enum(Object.values(Power655OpsAlertType))`. Thêm test khẳng định `opsSchema.parse(DEFAULT_POWER655_CONFIG.ops)` pass (đóng rủi ro R3 của p0-01).

### 4. UI trang ops — `apps/backoffice/src/app/(main)/games/power655/operations/`

Refactor `_lib/use-operations.ts` về **2 nhịp** (analysis §5.2 — điểm diverge D2):

- `useDrawSelectorList` — 15s (như Keno).
- `useOpsSnapshot` — poll `snapshot` theo `tickSeconds` TRẢ VỀ TỪ SERVER (default khi chưa có response: hằng `ops-constants.ts`); dừng khi draw TERMINAL.
- `useLiveFeed` — **DÙNG CHUNG nhịp `tickSeconds`** với snapshot (KHÁC Keno 10s — lý do §5.2); chỉ chạy khi tab analytics mở; dừng khi TERMINAL.
- Badge alert đọc từ snapshot (KHÔNG timer riêng); panel alerts fetch chi tiết on-demand khi mở.
- Best practice bắt buộc (chốt 05/08): 1 query snapshot + `select` slice per-section (`vercel-react-best-practices` §4.3/§5); compound components cho sections (`vercel-composition-patterns`); conditional rendering tường minh (`count > 0 ? … : null`); shadcn primitives từ registry — đọc skill `.cursor/skills/shadcn` + `frontend-design` TRƯỚC khi dựng component mới.

Sections (`_lib/sections/`), theo `operations-page-ui.mdc` + guideline layout Keno:

- SỬA `kpi/` — thêm **exposure-card**: fixed worst-case (badge vượt ngưỡng theo `thresholds` server) + jackpot pool JP1/JP2; GIỮ KPI jackpot hiện có.
- TẠO `alerts/` — panel + badge, format payload theo TYPE (không lộ JSON thô — Keno §4.7); action Ack; alert đã ack hiển thị dạng disclosure (tiền lệ Bingo18 UI v6).
- SỬA `analytics/` — heatmap 55 số đọc từ `snapshot.numberStats` với toggle `sets`/`amount` (Keno §4.6); phân bố 12 playType nhấn nhóm Bao cao (bao13–18); topCombos hiển thị `mainNumbers + playType + sets + accountCount` + drill-down combo-lookup; topAccounts ưu tiên `username` fallback `accountId`.
- **Heatmap tra combo trực tiếp — BẮT BUỘC theo chuẩn analysis §3.10(7), copy Keno `keno/operations/_lib/sections/analytics/number-heatmap.tsx`** (chuẩn cho mọi game sau này):
  - Mọi ô số là `<button aria-pressed>` LUÔN click chọn/bỏ chọn được (multi-select) — ô selected có ring brand màu Power 6/55 (`GAME_COLORS[GameProduct.Power655]`), badge tô đậm.
  - Menu `DropdownMenu` (icon `MoreHorizontal`) trên header card heatmap → mở Dialog tra cứu combo. **Menu và item mở dialog LUÔN bật — KHÔNG check điều kiện enable/disable theo số đã chọn** (user chốt 05/08: đỡ phức tạp).
  - Dialog: lấy bộ số đang chọn làm input; CSV input editable + chips số đã chọn **đồng bộ 2 chiều** với grid (state `selected` lift lên cha); nút "Bỏ chọn tất cả"; counter "Đã chọn N số".
  - PlayType **TỰ SUY theo số lượng đã chọn** — khác Keno (chỉ 8/9/10): 5 = bao5, 6 = standard, 7–15 = baoN, 18 = bao18. **Validate tại dialog (client-side) là đủ**: số lượng không khớp playType → hint nhẹ dưới input; vẫn cho bấm tra thì API trả 400 và dialog hiển thị lỗi — API là chốt chặn cuối, KHÔNG xây thêm tầng điều kiện phức tạp ở menu.
  - Tra → gọi route `combo-lookup` (staff — có kèm danh sách account, khác endpoint player p1-01); kết quả hiển thị kèm **giá 1 lần cược bộ số** (`unitPrice × BAO_COMBINATIONS[playType]` — p1-01 mục xác minh công thức (4)); hiển thị người chơi qua `PlayerName` (rule `player-display-username.mdc`).
- GIỮ `draw-management/` (có `resettle-action` — đặc thù Power 6/55), `result/`.
- SỬA `adapters.ts`/`types.ts` — map DTO snapshot → props section; XOÁ types của 5 hook cũ.

### 5. Tab config "Vận hành" — `(main)/games/power655/config/game/_lib/`

TẠO `ops-section.tsx` — copy pattern `keno/config/game/_lib/ops-section.tsx` + guideline `ops-config-page-layout.guideline.md`: nhóm ngưỡng (4 field VND/số) + `AlertToggleRow` cho 4 alert P0 (label + mô tả điều kiện bật lấy từ JSDoc §3.7, tooltip 4 phần theo `game-config-ui.mdc` §16) + nhóm stats (tickSeconds, topK). SỬA `use-game-config.ts` + page đăng ký tab (nuqs theo §14 `game-config-ui.mdc`). 2 alert để-dành (`revenue_anomaly`, `settle_stuck`) KHÔNG hiện toggle.

### 6. Dead-code cleanup (BẮT BUỘC — analysis §5.3, xoá theo chuỗi phụ thuộc)

Thứ tự: hook → component props → route → use-case → repo method → query-keys.

- Hooks trong `use-operations.ts`: `useOpsSummary`, `useOpsTenantBreakdown`, `useOpsNumberFrequency`, `useOpsPlayTypeDistribution`, `useOpsTopCombos`.
- Query-keys tương ứng trong `apps/backoffice/src/lib/query-keys/power655.ts`.
- Routes: `summary/`, `tenant-breakdown/`, `number-frequency/`, `playtype-distribution/`, `top-combos/` (+ `_lib` schema của chúng).
- Use-cases: `get-ops-summary`, `get-number-frequency`, `get-playtype-distribution`, `get-tenant-breakdown`, `get-top-combos` + DTO + barrel `operations/index.ts`.
- Repo methods `entry-repo.ts`: `aggregateOpsSummary`, `aggregateNumberFrequency`, `aggregateTopCombos`, `aggregatePlayTypeDistribution`, `aggregateTenantBreakdown` + `buildOpsFilter` nếu 0 caller còn lại.
- GIỮ: `get-draw-selector`, `get-live-entries`, `get-winning-entries` + repo methods chúng dùng.

Mỗi mục xoá: grep toàn repo 0 consumer TRƯỚC khi xoá (match còn lại thuộc game khác chưa migrate là hợp lệ — ghi rõ trong PR).

## Cách review (sau khi implement)

1. Diff đối chiếu từng mục; UI so với guideline layout + trang Keno thật (mở 2 trang cạnh nhau).
2. Kiểm nhịp poll: đúng 2 timer (`15s` selector + `tickSeconds` chung snapshot/live) — grep `setInterval|refetchInterval` trong `_lib/` chỉ còn 2 nguồn nhịp; badge alert KHÔNG timer riêng.
3. Kiểm thresholds: grep số ngưỡng hardcode (`30_000_000|2_000_000_000`) trong `apps/backoffice/src/app/(main)/games/power655/operations` = 0 match (chỉ được nằm ở defaults domain package).
4. Kiểm read path: use-case snapshot không gọi method `aggregate*` nào trên entry-repo (grep) — chỉ findOne/find/count trên collection stats.
5. Dead-code: grep từng tên hook/use-case/route đã xoá toàn repo = 0 consumer power655.
6. UI checklist: chạy skill `web-design-guidelines` review các component mới (exposure-card, alerts panel); `tabular-nums` cho số tiền; a11y label cho toggle.
7. Đối chiếu §6.1 analysis — nếu phát sinh diverge mới trong lúc implement → thêm dòng vào bảng D.

## Cách test

```bash
pnpm --filter @megawin/game-power655-application check-types && pnpm --filter @megawin/game-power655-application test
pnpm --filter @megawin/backoffice check-types && pnpm --filter @megawin/backoffice lint
```

Unit tests viết mới:

1. `test/use-cases/global-config.test.ts` (mở rộng file sẵn có) — get-config khi: (a) DB trống → trả `ops` = defaults; (b) doc cũ KHÔNG có `ops` → merge defaults; (c) doc có `ops` một phần → field thiếu lấp default, field có giữ nguyên; (d) update `ops` rồi get lại → persist đúng.
2. `test/use-cases/get-ops-snapshot.test.ts` — seed stats/number/account/combo/alert docs → snapshot đúng shape; draw chưa có stats doc (worker chưa chạy) → snapshot zero-value KHÔNG throw (mapper normalize); thresholds + tickSeconds có mặt trong response.
3. Zod: `opsSchema.parse(DEFAULT_POWER655_CONFIG.ops)` pass; giá trị ngoài range bị reject.

> **Chốt 05/08 — R3 test bằng đường khác (không viết test 3 tự động):** `opsSchema` (Zod) sống ở
> backoffice route (`apps/backoffice/.../config/_lib/schema.ts`), mà backoffice KHÔNG có test runner
> (không Vitest, không script `test`). Test suite Power655 nằm ở `game-power655-application` và KHÔNG
> được import ngược backoffice (phá dependency boundary — core/app không phụ thuộc BO). Ba lựa chọn cân
> nhắc: (a) thêm Vitest cho backoffice → scope lớn ngoài P0; (b) dựng Zod thứ 2 trong test app → vi phạm
> §8 duplicate-validation, dễ drift. Quyết định: **bỏ test 3 tự động**, verify R3 bằng: (1) test
> `global-config.test.ts` (mục 1) đã ép `DEFAULT_POWER655_CONFIG.ops` chạy qua mapper normalize + persist
> — default sai shape/thiếu field sẽ lộ ở đây; (2) test thủ công form BO tab "Vận hành" (lưu default →
> không lỗi Zod). Nếu sau này backoffice có test runner, thêm lại test 3 co-located cạnh `opsSchema`.

Test thủ công trên browser (dev, sau khi p0-02 worker chạy seed data):

1. Trang ops: chọn draw active → KPI/heatmap/topCombos/topAccounts hiển thị; DevTools Network xác nhận chỉ 2 nhịp poll; đặt vé mới qua API player → sau ≤ 1 tick worker + 1 tick poll, số liệu nhích.
2. Alert flow: hạ `largeBetAmount` xuống 10k qua tab config → đặt vé 500k → alert `large_bet` xuất hiện ≤ 2 phút → Ack → alert chuyển trạng thái, không quay lại New ở tick sau.
3. Tab config "Vận hành" trên môi trường DB CHƯA từng lưu `ops` → form hiện defaults, không lỗi console; lưu → reload → giá trị giữ.
4. Draw settled: mở trang → cả 2 nhịp poll DỪNG (Network im lặng).

## Rủi ro & cách test rủi ro

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | **BO trắng trang khi worker chưa chạy/stats doc chưa có** | Test unit (2b) + thủ công: tắt worker, mở trang ops draw mới → snapshot zero-value, UI hiện trạng thái trống lịch sự, KHÔNG crash. |
| R2 | **Get-config thiếu merge default → tab Vận hành lỗi lần đầu** | Test unit (1a/1b) + thủ công (3) trên DB không có `ops`. Đây là rủi ro user chỉ đích danh 05/08. |
| R3 | Xoá nhầm repo method còn caller (settle/report dùng chung helper) | Grep từng method TRƯỚC khi xoá; check-types toàn workspace sau xoá (`pnpm check-types` root hoặc turbo filter `...^`). |
| R4 | Nhịp poll không dừng khi settled → phí request vô hạn | Test thủ công (4) + đọc code điều kiện `enabled` của query. |
| R5 | Ngưỡng hardcode client lệch config runtime | Review mục 3 (grep = 0) + thủ công: đổi ngưỡng qua config → badge exposure đổi trạng thái không cần deploy. |
| R6 | `jackpotExposure` đọc jackpot cycle sai kỳ (draw cũ vs cycle hiện hành) | Test unit snapshot với draw đã settled có `DrawJackpot` snapshot → dùng closing của draw; draw active → dùng cycle hiện hành. Đối chiếu nguồn dữ liệu jackpot có sẵn của trang ops hiện tại. |
| R7 | Live feed chung nhịp tick làm cảm giác "chậm" khi staff theo dõi cận giờ đóng bán | Chấp nhận theo quyết định 05/08 (§6.1-D2); nếu staff phản hồi xấu → điều chỉnh `tickSeconds` runtime (không cần code). Ghi chú vào PR để CS/ops biết. |
| R8 | Ack race: 2 staff ack cùng alert | `ackById` filter `{_id, status: New}` — người sau nhận notFound/no-op êm; test unit ack 2 lần. |
