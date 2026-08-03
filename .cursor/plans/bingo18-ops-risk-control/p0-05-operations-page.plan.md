# p0-05 — Trang Vận hành: snapshot endpoint (7→2 timer) + 2 tab + exposure card + dead-code cleanup

> **Nguồn:** `.cursor/analysis/bingo18-operations-risk-control.analysis.md` §4, §2.2.3, verdict #8/#11, §7 Q4 (bảng 6 ô thuần hiển thị — đã chốt).
> **Phase:** P0 · **Phụ thuộc:** p0-02, p0-03, p0-04 · **Blocks:** —.
> **Guideline BẮT BUỘC:** `../keno-ops-risk-control/operations-page-layout.guideline.md` (checklist §7 — trừ mục bảng số tương tác, xem Khác biệt bên dưới).

## Mục tiêu

Chuyển trang `/games/bingo18/operations` từ 7 timer on-demand aggregation về **2 timer** (snapshot + live-feed) đọc pre-aggregated; tách 2 tab Giám sát/Phân tích; exposure card chính xác per-outcome; alert badge+panel; fix draw selector; xoá sạch dead code cũ.

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Snapshot route + ETag/304 | `apps/backoffice/src/app/api/keno/operations/snapshot/route.ts` + use-case `get-ops-snapshot.ts` + `dto/snapshot.dto.ts` |
| Hooks 2 timer + `select` slice | `apps/backoffice/src/app/(main)/games/keno/operations/_lib/use-operations.ts` + `lib/query-keys/keno.ts` |
| UI 2 tab + sections | `.../games/keno/operations/page.tsx` + `_lib/sections/{kpi,analytics,alerts}/` (exposure-card, kpi-strip, analytics-panels, live-feed, alerts-panel) + `_lib/adapters.ts`, `ops-constants.ts` |
| Draw selector fix | `packages/game-keno-application/src/use-cases/operations/get-draw-selector.ts` dòng 35–41 (re-sort active ASC + comment) |
| Dead-code cleanup | Checklist Keno analysis §9.3 + `p0-07-operations-page.plan.md` §"Dead code cleanup" |
| Username | `apps/backoffice/src/components/player-name.tsx` (`PlayerName`/`PlayerOutstandingLink` — component CHUNG, nhận `gameProduct`, KHÔNG copy vào `_lib/`) |
| UI hiện có tái dùng | `.../bingo18/operations/_lib/sections/analytics/dice-histogram.tsx` (đổi nguồn data), `draw-management`, `result`, winning-entries dialog — GIỮ NGUYÊN phần ngoài scope |

## Việc cần làm

### 1. Backend — snapshot endpoint

- Use-case `get-ops-snapshot.ts` (`game-bingo18-application/use-cases/operations/`): input `drawId`; đọc `BettingStatsRepository.getByDrawId` + `DrawRepository` status + `OpsAlertRepo.countByStatus` + GlobalConfig → build:

```ts
GetOpsSnapshotOutput {
  drawStatus; updatedAt;                       // updatedAt = ETag
  stats;                                        // nguyên stats doc (totals/byPlayType/byTenant/topAccounts/topPotential)
  exposure: Bingo18ExposureResult;              // computeBingo18Exposure(byPlayType, prizes) — tính tại đây, KHÔNG lưu doc
  alertCounts: { new; critical };
  thresholds: { exposureWarnRevenuePct; exposureWarnMinAmount; sidebetSkewPct;
                bucketConcentrationAmount; largeBetAmount };   // từ GlobalConfig.ops — Risk #9, KHÔNG hardcode client
  tickSeconds;                                  // FE poll khớp nhịp worker
}
```

- Route `api/bingo18/operations/snapshot/route.ts`: copy keno — `withApi().auth().query(zod)`, **ETag = `updatedAt`**, `If-None-Match` → 304 (React Query giữ reference → 0 re-render khi vắng cược).
- Stats doc chưa tồn tại (draw mới mở) → trả zero-state (theo cách Keno).

### 2. Backend — fix draw selector (bug §2.2.3)

`get-draw-selector.ts` Bingo 18: re-sort `activeDraws` theo `drawId` ASC — copy `sortBy` + comment từ keno (dòng 35–41). Auto-select FE = active[0].

### 3. FE — hooks 7→2 timer (`_lib/use-operations.ts`)

- `useOpsSnapshot(drawId, isSettled)`: `refetchInterval = isSettled ? false : tickSeconds×1000` (đọc từ chính response, fallback 10s lúc loading), `staleTime: isSettled ? Infinity : ...`. Mỗi section subscribe qua **`select` slice** (KPI đổi không kéo Analytics render — skill `vercel-react-best-practices`).
- `useOpsLiveEntries`: giữ, đổi interval khớp tickSeconds, CHỈ enabled khi tab Phân tích mở && chưa settled.
- Xoá hooks cũ: `useOpsSummary`/`useOpsTenantBreakdown`/`useOpsDiceFrequency`/`useOpsPlayTypeDistribution`/`useOpsTopCombos` (+ query keys). GIỮ: draw detail, winning-entries, mutations draw actions, `useDrawSelectorList` (bỏ timer 15s riêng → invalidate theo `drawStatus` đổi từ snapshot — theo cách Keno).
- `bingo18Keys`: thêm `opsSnapshot(drawId)`, `opsAlerts(...)`; xoá 5 key cũ.

### 4. FE — 2 tab (`page.tsx` + `_lib/sections/`)

Tab nuqs `?tab=` (Giám sát default | Phân tích cược), `TabsContent` unmount inactive. Layout theo guideline §1/§5; các điểm RIÊNG Bingo 18 (analysis §4.2–4.3):

**Tab Giám sát:** Draw command center (giữ nguyên) → **Alerts panel** (đầu tab — copy keno `alerts-panel.tsx`, formatter 4 type theo `BINGO18_OPS_ALERT_TYPE_LABELS` p0-03; `large_bet` list entries + `PlayerOutstandingLink`; KHÔNG lộ JSON/`[object Object]`) → KPI strip (6 KPI từ `stats.totals` + **Exposure card**) → Kết quả & Tài chính (giữ nguyên).

- **Hành vi Ack (UI v6 Keno 30/07 — guideline §4, BẮT BUỘC làm ngay từ đầu):** item đã ack **KHÔNG xoá khỏi UI** (`ack` = "staff đã biết" ≠ "hết rủi ro" — dedupeKey còn, payload vẫn cập nhật mỗi tick; xoá mất audit trail ai xử lý lúc nào) nhưng **thu gọn per-group**: mỗi accordion nhóm mặc định chỉ render item `new`, item ack đẩy xuống disclosure **"Xem N đã xử lý ▾"** cuối nhóm (toggle per-group, KHÔNG global); badge count trên `AccordionTrigger` chỉ đếm `new`; nhóm còn `new` → mở sẵn, nhóm toàn ack → đóng; nhóm hết `new` → dòng phụ "Đã xử lý hết cảnh báo mới của nhóm này." Lý do đặc biệt với Bingo 18: ngưỡng nhạy (vd `bucketConcentrationAmount` thấp) + 160 kỳ/ngày → dễ sinh nhiều alert `bucket_concentration` per-bucket, panel không được dài lê thê.

- **Exposure card** (mới — KHÁC keno vì số CHÍNH XÁC): `worstCase.amount` (đỏ, `formatNumber`) + 3 dice badge outcome đạt max + tổng · `expectedPayout` so revenue (badge margin dự kiến: `revenue − expected`, âm → đỏ) · gauge `worstCase / revenue` tô theo `thresholds.exposureWarnRevenuePct` (dưới sàn `exposureWarnMinAmount` → luôn xanh, tooltip giải thích) · collapse "Top 5 outcome trả nặng" (`exposure.topOutcomes`). KHÔNG capSets.
- Alert badge header (cạnh draw selector) đọc `alertCounts` từ snapshot — không timer riêng.

**Tab Phân tích cược:**

1. **Phân bổ kiểu chơi** — card compact 5 nhóm từ `byPlayType` (aggregate bucket → tổng per playType; tripleMatch tách specific/any).
2. **Bảng xúc xắc 6 ô** — refactor `dice-histogram.tsx`: nguồn = tổng `singleNum[n] + doubleMatch[n] + tripleMatch.specific[n]` (slice snapshot); mỗi ô: badge số · **Dòng tiền** (chính, heat nền 5 cấp theo tiền) · `Nx` lượt. **THUẦN HIỂN THỊ** — KHÔNG button/chọn số/action menu/dialog (chốt §7 Q4 — lệch guideline §3 có chủ đích, ghi comment lý do trong code). KHÔNG per-number liability (guideline §3.3).
3. **Bar phân bổ sumTotal 16 cột** (mới): amount mỗi tổng 3→18; cột 3/18 + tripleMatch specific = bucket nhân cao → viền đỏ nhạt; vượt `thresholds.bucketConcentrationAmount` → amber + badge. Tooltip mỗi cột: amount/sets/prize (×120 với 3/18).
4. **Side bet card 1 khối 3 hướng** `bigSmallDraw` (small/draw/big): split bar 3 đoạn + % + tiền 2 đầu + hoà giữa; hướng ≥ `thresholds.sidebetSkewPct` → amber + badge "lệch X%". Chú thích xác suất nền 49/25/26% (không đối xứng — staff đọc skew đúng).
5. **Cụm rủi ro 2 cột** [Top người chơi (emerald) | Top phải trả (đỏ nền, nhãn "Phải trả")] — `@640px:grid-cols-2`; `PlayerOutstandingLink` từng dòng; username `<primary> · <tenant>` qua `PlayerName`.
6. **[Live feed (rộng) | Đại lý (hẹp 24rem)]** — live feed chia 2 cột lệch: Cơ bản `1.7fr` (singleNum/doubleMatch/tripleMatch) | Bổ sung `1fr` (sumTotal/bigSmallDraw), header + count + cuộn độc lập, cược lớn (≥ `thresholds.largeBetAmount`) tô đỏ + chip; đại lý ≤3 → card giàu thông tin, >3 → bảng cuộn (data từ `stats.byTenant`).

Thứ tự macro: **rủi ro TRƯỚC, monitoring SAU** (guideline §5 — không đảo).

### 5. FE — performance & code (skills bắt buộc)

- Cell/cột memoized props primitives (`memo`) — poll mới chỉ re-render phần đổi; `tabular-nums` cho số; explicit ternary (không `&&` với số 0); functional setState; state tab qua nuqs (không useState + effect sync).
- Adapter thuần `_lib/adapters.ts` (stats doc → view models: diceCells, sumBars, sideBetSplit, playTypeCards) — pure function, unit-testable, không tính trong render body mỗi component.
- Thresholds/hằng client CHỈ là fallback loading (Risk #9).

### 6. Dead-code cleanup (checklist Keno §9.3 — BẮT BUỘC, thứ tự ngược dependency)

Liệt kê trước khi xoá; sau khi FE chuyển xong → grep TOÀN REPO từng tên, 0 consumer mới xoá:

1. Routes: `api/bingo18/operations/{summary,tenants,dice-frequency,playtype-distribution,top-combos}/route.ts` (+ rmdir thư mục rỗng).
2. Query keys + hooks FE cũ (bước 3 trên).
3. Use-cases: `get-ops-summary.ts`, `get-tenant-breakdown.ts`, `get-dice-frequency.ts`, `get-playtype-distribution.ts`, `get-top-combos.ts` + DTO (`operations.dto.ts` phần liên quan, `top-combos.dto.ts`) + barrel.
4. Repo methods: `aggregateOpsSummary`, `aggregateTenantBreakdown`, `aggregateDiceFrequency`, `aggregatePlayTypeDistribution`, `aggregateTopCombos` (entry-repo.ts — sâu nhất, dễ sót nhất).
5. Zod schemas `_lib/schema.ts` ops cũ không còn dùng.
6. GIỮ: `get-live-entries`, `get-winning-entries`, `get-draw-selector`, `helpers.ts` (nếu còn consumer — grep trước).
7. Xoá xong: `check-types` + lint backoffice + application (xoá `.next/` nếu báo module ma).

## Không làm

- KHÔNG SSE/WebSocket; KHÔNG timer thứ 3; KHÔNG toast tự bung; KHÔNG per-number liability; KHÔNG chọn số/dialog trên bảng 6 ô; KHÔNG copy `PlayerName` vào `_lib/`.

## Verify

`check-types` + lint backoffice + `game-bingo18-application`. Chạy dev: (1) đúng 2 timer (Network tab), 304 khi vắng cược, 0 request khi draw settled; (2) số liệu snapshot khớp trang cũ trên cùng draw (trước khi xoá route cũ — so song song); (3) exposure card khớp tính tay fixture; (4) alert badge → panel → ack flow; (5) draw selector auto-select kỳ sớm nhất đang chạy.

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] **Logic:** adapter slices đối chiếu shape doc p0-02; exposure hiển thị = `computeBingo18Exposure` (không tự tính lại ở FE); ngưỡng tô màu = `thresholds` response.
- [ ] **Dead code:** grep lại 5 tên use-case + 5 route path + 5 repo method TOÀN REPO — 0 kết quả ngoài plans/analysis.
- [ ] **UI checklist:** guideline operations-page §7 (trừ mục bảng số tương tác — đã chốt lệch); **hành vi Ack theo guideline §4 (UI v6): ack không xoá, disclosure "Xem N đã xử lý" per-group, badge chỉ đếm `new`, nhóm toàn ack tự đóng**; web-design-guidelines pass (a11y, contrast, keyboard); re-render kiểm bằng React DevTools khi poll 304.
- [ ] Ghi kết quả review + cập nhật `00-overview.md`.

## Định nghĩa Done

Trang chạy 2 timer, đọc 100% từ snapshot, exposure/alerts/heatmap/sumTotal/side-bet đúng thiết kế, dead code sạch (grep chứng minh), draw selector đúng kỳ, review xong, overview cập nhật.
