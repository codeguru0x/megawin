# p0-03 — Operations API + UI + Config Tab + Dead-code Cleanup

> **Nguồn:** `.cursor/analysis/lotto535-operations-risk-control.analysis.md` §3.8 (get-config default), §5 (API/UI), §5.3 (dead-code)
> **Phase:** P0 · **Thứ tự:** 03 · **Phụ thuộc:** p0-01 (entities), p0-02 (data đã đầy).
> **Package đích:** `packages/game-lotto535-application` (use-case đọc) + `apps/backoffice`.

## Mục tiêu

Chuyển tầng đọc sang snapshot model: 3 nhóm API mới (snapshot / alerts / combo-lookup), get-config merge default `ops`, tab config "Vận hành", trang ops refactor về **1 nhịp chung `tickSeconds`**, heatmap **2 lưới** (35 chính + 12 ĐB) có tra combo trực tiếp, exposure-card + alerts panel, và xoá sạch dead code aggregation on-demand. GIỮ đặc thù Lotto 5/35: JackpotHeroCard (single JP + cycle) và `resettle-action` — KHÔNG thêm banner/alert split (user chốt 05/08 — Q3).

## Pattern tham chiếu (copy, KHÔNG sáng tác)

| Việc | File tham chiếu |
|---|---|
| Use-case đọc snapshot/alerts/combo | `packages/game-power655-application/src/use-cases/operations/{get-ops-snapshot,list-alerts,ack-alert,get-combo-lookup}.ts` + `dto/ops.dto.ts` |
| API routes | `apps/backoffice/src/app/api/power655/operations/{snapshot,alerts,alerts/[id]/ack,combo-lookup}/route.ts` |
| Zod `opsSchema` | `apps/backoffice/src/app/api/power655/config/_lib/schema.ts` |
| UI trang ops (hooks, sections, adapters) | `apps/backoffice/src/app/(main)/games/power655/operations/_lib/` (`use-operations.ts`, `ops-constants.ts`, `adapters.ts`, `sections/kpi/exposure-card.tsx`, `sections/alerts/alerts-panel.tsx`, `sections/analytics/number-heatmap.tsx`) |
| Tab config "Vận hành" | `apps/backoffice/src/app/(main)/games/power655/config/game/_lib/ops-section.tsx` + `use-game-config.ts` + `page.tsx` |
| Get-config merge default | `packages/game-power655-application/src/use-cases/game-config/get-global-config.ts` + `infras/mappers/global-config-mapper.ts` |
| Guideline layout | `../keno-ops-risk-control/operations-page-layout.guideline.md` + `ops-config-page-layout.guideline.md` |

## File & thay đổi

### 1. Use-cases đọc mới — `packages/game-lotto535-application/src/use-cases/operations/`

- TẠO `get-ops-snapshot.ts` — `GetOpsSnapshotUseCase`: gộp 1 response từ nguồn pre-aggregated (analysis §5.1): `statsRepo.findByDrawId` (findOne) + `numberStatsRepo.findByDrawId` (≤47 docs, 2 kind) + `accountStatsRepo.findTopByAmount(K)` + `comboStatsRepo.findTopBySets(K)` + `alertRepo.countByStatus` + jackpot pool hiện hành. Các query chạy **`Promise.all`** (độc lập — không waterfall). Response kèm:
  - `thresholds` từ `config.ops.alerts` (UI KHÔNG hardcode ngưỡng) + `tickSeconds` (nhịp poll chung).
  - `exposure`: `fixedWorstCase` từ stats doc + `jackpotExposure` = jackpot cycle hiện hành (single pool — đơn giản hơn Power 6/55, không có JP2) đọc lúc build response, KHÔNG lưu. JSDoc use-case ghi công thức 2 phần + "Split KHÔNG vào exposure (§3.6)".
  - `numberStats` tách 2 mảng theo `kind` (hoặc field `kind` trong item — copy shape DTO Power 6/55 rồi thêm chiều, quyết định lúc implement và ghi lại) để UI vẽ 2 lưới không phải tự phân loại.
  - `uniquePlayers` từ `accountStatsRepo.countByDrawId`.
- TẠO `list-alerts.ts` + `ack-alert.ts` + `get-combo-lookup.ts` — copy Power 6/55; combo-lookup nhận `{drawId, comboKey}` trả combo doc (có `specialNumbers`) + danh sách account (`listByCombo`).
- TẠO `dto/ops.dto.ts` — DTO named types (KHÔNG indexed-access §5.4), export barrel.
- KHÔNG use-case nào đụng aggregation trên `ticket_entries` — snapshot đọc thuần `findOne`/`find` + limit.

### 2. Get-config merge default `ops` (analysis §3.8)

SỬA `GetGlobalConfigUseCase` (lotto535) + mapper global-config: (a) chưa có config doc, hoặc (b) doc cũ thiếu section `ops` → merge `DEFAULT_LOTTO535_CONFIG.ops` tại tầng đọc (mapper normalize — §7.4). BO vào tab "Vận hành" lần đầu KHÔNG lỗi. Worker p0-02 `beforeLoop` dùng chung đường này (đóng R7 p0-02). JSDoc method: "Merge default cho section `ops` — schema evolution, doc cũ trước p0-01 không có `ops`".

SỬA `UpdateGameConfigUseCase`: nhận và persist section `ops` (merge partial theo pattern update hiện hành); KHÔNG viết `validateInput` lặp Zod (rule §8 code-quality).

### 3. API routes — `apps/backoffice/src/app/api/lotto535/operations/`

| Route | Việc |
|---|---|
| `snapshot/route.ts` | TẠO — `withApi()` + query schema `{drawId}`, gọi `GetOpsSnapshotUseCase` |
| `alerts/route.ts` + `alerts/[id]/ack/route.ts` | TẠO — list (filter status/severity qua Zod) + ack (audit-log theo tiền lệ) |
| `combo-lookup/route.ts` | TẠO — query `{drawId, comboKey}` |
| `summary`, `tenant-breakdown`, `number-frequency`, `playtype-distribution`, `top-combos` | **XOÁ** (mục 6) |
| `draw-selector`, `live-entries`, `winning-entries` | GIỮ nguyên |

SỬA `apps/backoffice/src/app/api/lotto535/config/_lib/schema.ts`: thêm `opsSchema` (Zod) — range: các ngưỡng VND `positive().int()`; **`specialSkewRatio` là `z.number().min(0).max(1)` (thập phân — KHÔNG `positive().int()`, R3 p0-01)**; `specialSkewMinAmount` positive int; `comboAccountsWarn` int ≥ 2; `tickSeconds` int 5–60; `enabled` record theo `z.enum(Object.values(Lotto535OpsAlertType))`. Bảng defaults phải nằm TRONG range: 30tr / 500tr / 5 / 10tr / 0.35 / 50tr.

### 4. UI trang ops — `apps/backoffice/src/app/(main)/games/lotto535/operations/`

Refactor `_lib/use-operations.ts` về **2 nhịp**:

- `useDrawSelectorList` — 15s.
- `useOpsSnapshot` — poll `snapshot` theo `tickSeconds` TRẢ TỪ SERVER (default trước response: hằng `ops-constants.ts`); dừng khi draw TERMINAL.
- `useLiveFeed` — **DÙNG CHUNG nhịp `tickSeconds`** với snapshot; chỉ chạy khi tab analytics mở; dừng khi TERMINAL.
- Badge alert đọc từ snapshot (KHÔNG timer riêng); panel alerts fetch chi tiết on-demand khi mở.
- Best practice bắt buộc: 1 query snapshot + `select` slice per-section (`vercel-react-best-practices` §4.3/§5); compound components (`vercel-composition-patterns`); conditional rendering tường minh (`count > 0 ? … : null`); shadcn primitives từ registry — đọc skill `shadcn` + `frontend-design` TRƯỚC khi dựng component mới.

Sections (`_lib/sections/`), theo `operations-page-ui.mdc` + guideline layout:

- **GIỮ** `JackpotHeroCard` (single JP + trạng thái cycle — sẵn có, KHÔNG thêm banner split), `draw-management/` (có `resettle-action`), `result/`.
- SỬA `kpi/` — thêm **exposure-card**: fixed worst-case (badge vượt ngưỡng theo `thresholds` server) + jackpot pool single. Copy `power655/.../kpi/exposure-card.tsx`, bỏ chiều JP2.
- TẠO `alerts/` — panel + badge, format payload theo TYPE (không lộ JSON thô); action Ack; alert đã ack hiển thị dạng disclosure. Payload `special_skew` hiển thị: số ĐB + tỷ trọng % + tổng tiền special; `cover_high_stake` hiển thị: key mainCoverN + giá board chuẩn.
- SỬA `analytics/` — **heatmap 2 LƯỚI** (35 số chính + 12 số đặc biệt, toggle `sets`/`amount` chung) đọc từ `snapshot.numberStats`; phân bố **13 play key** (nhấn nhóm mainCover cao 13–15); topCombos hiển thị `mainNumbers + specialNumbers + playType + sets + accountCount` + drill-down combo-lookup; topAccounts ưu tiên `username` fallback `accountId`.
- **Heatmap tra combo trực tiếp — theo chuẩn analysis §3.10(7), copy `power655/.../analytics/number-heatmap.tsx` rồi mở rộng 2 lưới**:
  - Ô số là `<button aria-pressed>` multi-select ở CẢ 2 lưới — state chọn tách 2 tập (main / special); ring brand màu Lotto 5/35 (`GAME_COLORS[GameProduct.Lotto535]`).
  - Menu `DropdownMenu` trên header card → Dialog tra cứu. **Menu + item LUÔN bật — KHÔNG disable theo số đã chọn.**
  - Dialog: CSV input editable riêng cho main và special + chips đồng bộ 2 chiều với grid (state lift lên cha); nút "Bỏ chọn tất cả"; counter "Đã chọn N chính + K ĐB".
  - PlayType **TỰ SUY**: 5 chính + 1 ĐB = standard; 4 chính + 1 ĐB = mainCover4; 6–15 chính + 1 ĐB = mainCoverN; 5 chính + 2–12 ĐB = specialCover. Tổ hợp không khớp → hint nhẹ; vẫn cho bấm tra → API 400 là chốt chặn cuối.
  - Tra → route `combo-lookup` (staff — kèm danh sách account, hiển thị qua `PlayerName`); kết quả kèm **giá 1 lần cược bộ số** (`unitPrice × expandedLines[playType/N/K]` — công thức từ domain rules) ghi chú "giá theo config hiện tại".
- SỬA `adapters.ts`/`types.ts` — map DTO snapshot → props section; XOÁ types của 5 hook cũ.

### 5. Tab config "Vận hành" — `(main)/games/lotto535/config/game/_lib/`

TẠO `ops-section.tsx` — copy `power655/config/game/_lib/ops-section.tsx` + guideline `ops-config-page-layout.guideline.md`: nhóm ngưỡng (6 field — 4 VND + `specialSkewRatio` dạng %/thập phân với format riêng + `comboAccountsWarn`) + `AlertToggleRow` cho **5 alert P0** (label + mô tả điều kiện bật lấy từ JSDoc §3.7, tooltip 4 phần theo `game-config-ui.mdc` §16) + nhóm stats (tickSeconds, topK). SỬA `use-game-config.ts` + `page.tsx` đăng ký tab (nuqs theo §14). 2 alert để-dành KHÔNG hiện toggle.

### 6. Dead-code cleanup (BẮT BUỘC — analysis §5.3, xoá theo chuỗi phụ thuộc)

Thứ tự: hook → component props → route → use-case → repo method → query-keys.

- Hooks trong `use-operations.ts`: `useOpsSummary`, `useOpsTenantBreakdown`, `useOpsNumberFrequency`, `useOpsPlayTypeDistribution`, `useOpsTopCombos`.
- Query-keys tương ứng trong `apps/backoffice/src/lib/query-keys/lotto535.ts`.
- Routes: `summary/`, `tenant-breakdown/`, `number-frequency/`, `playtype-distribution/`, `top-combos/` (+ `_lib` schema của chúng).
- Use-cases: `get-ops-summary`, `get-number-frequency`, `get-playtype-distribution`, `get-tenant-breakdown`, `get-top-combos` + DTO + barrel `operations/index.ts`.
- Repo methods `entry-repo.ts`: `aggregateOpsSummary`, `aggregateNumberFrequency`, `aggregateTopCombos`, `aggregatePlayTypeDistribution`, `aggregateTenantBreakdown` + helper filter nếu 0 caller còn lại.
- GIỮ: `get-draw-selector`, `get-live-entries`, `get-winning-entries` + repo methods chúng dùng.

Mỗi mục xoá: grep toàn repo 0 consumer TRƯỚC khi xoá (match thuộc game khác chưa migrate là hợp lệ — ghi rõ trong PR).

## Cách review (sau khi implement)

1. Diff đối chiếu từng mục; UI so với guideline layout + trang Power 6/55 thật (mở 2 trang cạnh nhau).
2. Kiểm nhịp poll: đúng 2 timer (`15s` selector + `tickSeconds` chung snapshot/live) — grep `setInterval|refetchInterval` trong `_lib/` chỉ còn 2 nguồn nhịp; badge alert KHÔNG timer riêng.
3. Kiểm thresholds: grep số ngưỡng hardcode (`30_000_000|500_000_000|0.35|50_000_000|10_000_000`) trong `apps/backoffice/src/app/(main)/games/lotto535/operations` = 0 match (chỉ nằm ở defaults domain package).
4. Kiểm read path: use-case snapshot không gọi method `aggregate*` nào trên entry-repo (grep) — chỉ findOne/find/count trên collection stats.
5. Dead-code: grep từng tên hook/use-case/route đã xoá toàn repo = 0 consumer lotto535.
6. **Rà rủi ro logic đặc thù**: (a) heatmap 2 lưới KHÔNG trộn số main/special (số "07" xuất hiện cả 2 lưới là 2 ô độc lập); (b) suy playType trong dialog đúng ma trận 4 nhánh — đặc biệt 5 chính + 1 ĐB = standard vs 5 chính + 2 ĐB = specialCover (lệch 1 số ĐB đổi hẳn playType); (c) `jackpotExposure` đọc đúng cycle (draw settled dùng snapshot của draw, draw active dùng cycle hiện hành); (d) KHÔNG có banner/alert split lọt vào UI (Q3).
7. UI checklist: chạy skill `web-design-guidelines` review component mới (exposure-card, alerts panel, heatmap 2 lưới); `tabular-nums` cho số tiền; a11y label cho toggle; `specialSkewRatio` hiển thị dạng % thân thiện (0.35 → "35%").
8. Đối chiếu §6 analysis — phát sinh diverge mới → thêm dòng vào bảng verdict.

## Cách test

```bash
pnpm --filter @megawin/game-lotto535-application check-types && pnpm --filter @megawin/game-lotto535-application test
pnpm --filter @megawin/backoffice check-types && pnpm --filter @megawin/backoffice lint
```

> **QUY TẮC DB STAGING CHUNG (00-overview):** cấm delete/drop trong test; seed key ngẫu nhiên; assert theo doc vừa seed; so delta. `global-config.test.ts` hiện hữu đã thao tác trên config doc staging — MỞ RỘNG theo pattern sẵn có của file đó (upsert + đọc lại), KHÔNG thêm bước xoá/reset config.

Unit tests viết mới (`game-lotto535-application/test/`):

1. `test/use-cases/global-config.test.ts` (mở rộng file sẵn có) — **đúng logic**: (a) doc thiếu `ops` → get trả `ops` = `DEFAULT_LOTTO535_CONFIG.ops` đủ 6 ngưỡng + enabled 7 key + stats; (b) doc có `ops` một phần → field thiếu lấp default, field có giữ nguyên; (c) update `ops` rồi get lại → persist đúng. **Logic ngược**: update `ops` KHÔNG được đè mất section khác của config (jackpot/prizes giữ nguyên — so trước/sau); defaults chạy qua mapper không sinh `NaN`/`undefined` field nào (kiểm proxy cho R3 p0-01 vì backoffice không có test runner — Zod verify bằng test thủ công form, theo quyết định Power 6/55 p0-03).
2. `test/use-cases/get-ops-snapshot.test.ts` — **đúng logic**: seed stats/number(2 kind)/account/combo/alert docs với drawId random → snapshot đúng shape, numberStats phân đúng 2 kind, thresholds + tickSeconds có mặt. **Logic ngược**: draw chưa có stats doc (worker chưa chạy) → snapshot zero-value 13 play key, KHÔNG throw (mapper normalize); drawId không tồn tại → hành vi copy Power 6/55 (zero hoặc notFound — ghi kết luận); alert count = 0 khi kỳ sạch.
3. `test/use-cases/ack-alert.test.ts` — ack lần 1 OK, ack lần 2 → no-op/notFound êm (race 2 staff).

Test thủ công trên browser (staging, sau khi p0-02 worker chạy seed data):

1. Trang ops: chọn draw active → KPI/JackpotHeroCard/heatmap 2 lưới/topCombos/topAccounts hiển thị; DevTools Network xác nhận chỉ 2 nhịp poll; đặt vé mới qua API player → sau ≤ 1 tick worker + 1 tick poll, số liệu nhích đúng cả 2 lưới.
2. Alert flow: hạ `largeBetAmount` xuống 10k qua tab config → đặt vé 500k → alert `large_bet` xuất hiện ≤ 2 phút → Ack → không quay lại New. Lặp tương tự cho `special_skew`: hạ `specialSkewMinAmount` xuống 10k, đặt vé dồn 1 số ĐB → alert hiện đúng số + tỷ trọng.
3. Tra combo trên heatmap: chọn 5 chính + 1 ĐB → dialog suy `standard` → tra ra combo vừa cược (sets + giá 10k); chọn 7 chính + 1 ĐB → suy `mainCover7`, giá `C(7,5) × 10k = 210k`; chọn 4 chính + 0 ĐB → hint không khớp, bấm tra → 400 hiển thị lỗi lịch sự.
4. Tab config "Vận hành" trên DB CHƯA từng lưu `ops` → form hiện defaults (35% cho skew ratio), không lỗi console; lưu → reload → giữ giá trị; nhập `specialSkewRatio` = 1.5 → Zod reject.
5. Draw settled: mở trang → cả 2 nhịp poll DỪNG (Network im lặng).

## Rủi ro & cách test rủi ro (review đề phòng)

| # | Rủi ro | Cách test/chặn |
|---|---|---|
| R1 | **BO trắng trang khi worker chưa chạy/stats doc chưa có** | Test unit 2 (zero-value không throw) + thủ công: tắt worker, mở trang ops draw mới → UI hiện trạng thái trống lịch sự, KHÔNG crash. |
| R2 | **Get-config thiếu merge default → tab Vận hành lỗi lần đầu** | Test unit 1(a) + thủ công 4 trên DB không có `ops`. |
| R3 | Xoá nhầm repo method còn caller (report/settle dùng chung helper) | Grep từng method TRƯỚC khi xoá; check-types toàn workspace sau xoá. |
| R4 | Nhịp poll không dừng khi settled → phí request vô hạn | Test thủ công 5 + đọc code điều kiện `enabled` của query. |
| R5 | Ngưỡng hardcode client lệch config runtime | Review mục 3 (grep = 0) + thủ công: đổi ngưỡng qua config → badge exposure đổi trạng thái không cần deploy. |
| R6 | `jackpotExposure` đọc sai kỳ (draw cũ vs cycle hiện hành) | Test unit snapshot: draw settled có jackpot snapshot → dùng closing của draw; draw active → cycle hiện hành. Đối chiếu nguồn JackpotHeroCard hiện tại. |
| R7 | Suy playType SAI trong dialog (5+2 ĐB ra standard) → staff tra nhầm bộ | Unit test pure cho hàm suy playType (đặt ở `_lib`, test đủ ma trận 4 nhánh + case biên 5+1 vs 5+2, 15+1 vs 16+1) — nếu BO không chạy vitest thì hàm suy đặt ở domain `rules/` và test tại domain package (quyết định lúc implement, ghi lại). |
| R8 | Update `ops` đè mất section config khác (merge partial sai) | Test unit 1 logic ngược (so jackpot/prizes trước/sau update). |
| R9 | Ack race 2 staff | `ackById` filter `{_id, status: New}` — test unit 3. |
| R10 | Heatmap 2 lưới trộn state chọn (chọn "07" main làm sáng "07" special) | Review state tách 2 tập + test thủ công 3. |

## Định nghĩa Done

check-types + lint + test pass, 5 kịch bản thủ công pass trên staging, dead-code grep sạch, review checklist 8 mục có bằng chứng, cập nhật bảng trạng thái `00-overview.md`.
