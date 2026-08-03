# p0-07 — Trang Vận hành: snapshot endpoint + tách 2 tab + panel mới

> **Nguồn:** `.cursor/analysis/keno-operations-risk-control.analysis.md` §4 (4.1/4.2/4.3), verdict #3/#5/#13/#14.
> **Phase:** P0 · **Phụ thuộc:** p0-03 (stats), p0-04 (combo lookup), p0-06 (alerts) · **Blocks:** p1-01.

## Mục tiêu

Chuyển FE từ 7 timer aggregation on-demand → **2 timer đọc pre-aggregated** (snapshot + live-feed). Tách trang thành 2 tab (Giám sát / Phân tích cược). Thêm: Exposure card, alert badge+panel (format payload theo type), heatmap ô hiển thị Dòng tiền + số lượt, tra cứu combo qua **chọn số trực tiếp trên bảng 80 số + action menu ⋯**, side-bet direction bars. Không nhồi 1 trang, không lệch chất liệu UI. **Guideline layout đầy đủ: `operations-page-layout.guideline.md`.**

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Snapshot route | `apps/backoffice/src/app/api/keno/operations/summary/route.ts` (`withApi().auth().query().handler()`), `_lib/schema.ts` |
| Repo đọc | `BettingStatsRepository.getByDrawId` (p0-03), `OpsAlertRepository.countByStatus` (p0-06) |
| ETag/304 | tìm helper response trong `@/lib/api` (nếu chưa có → set header `ETag` thủ công trong handler, client React Query so `updatedAt`) |
| Query keys | `apps/backoffice/src/lib/query-keys/keno.ts` (`kenoKeys`) |
| Hooks | `operations/_lib/use-operations.ts` (`useOpsSummary` — `refetchInterval: isSettled ? false : N`, `select`, `enabled`) |
| Draw context | `operations/_lib/use-draw-context.tsx` (`useDrawContext`, `opsParams`, `isSettled`) |
| Tab nuqs | `config/game/page.tsx` (`useQueryState("tab", parseAsStringEnum([...]))`), rule `game-config-ui` §14 |
| Sections | `operations/_lib/sections/{kpi,result,analytics,draw-management}/` |
| Heatmap/PlayType/LiveFeed | `sections/analytics/number-heatmap.tsx`, `analytics-panels.tsx`, `live-feed.tsx`; token `components/games/shared/game-number-tokens.ts` |
| Zone order/UI rule | `operations-page-ui.mdc` (§2 zone, §3 NumberBadge, §11 text-xs/tabular-nums) |

## Việc cần làm

### 1. Snapshot endpoint (backoffice)

- Route `api/keno/operations/snapshot/route.ts`: `withApi().auth({roles:[CompanyRole.Staff]}).query(opsQuerySchema).handler(...)`. Use-case `GetOpsSnapshotUseCase` (`use-cases/operations/`): `Promise.all([getGlobalConfig, bettingStats.getByDrawId, alertRepo.countByStatus×2, drawRepo.status])` → `{ drawStatus, stats, cappedExposure, alertCounts: { new, critical }, thresholds, pollSeconds }`. `pollSeconds = ops.stats.tickSeconds`.
  - **`cappedExposure` (sửa Risk #4):** `capExposureByPlayType(stats.exposure.worstCaseByPlayType, payoutCaps)` — worst-case ĐÃ cap; `stats.exposure` giữ RAW. FE lấy `worstCaseTotal` từ `cappedExposure`, KHÔNG từ `stats.exposure` (là RAW).
  - **`thresholds` (sửa Risk #9):** `{ exposureWarnPct, sidebetSkewPct, comboSetsWarn, maxSetsForFixed }` đọc thẳng `GlobalConfig.ops.alerts` + `payoutCaps` — FE tô màu gauge/progress bar KHỚP config, KHÔNG hardcode client (analysis §4.4).
- **ETag**: set `ETag = stats.updatedAt` (+ alertCounts hash), trả 304 khi `If-None-Match` khớp → React Query giữ reference, 0 re-render (analysis §4.1). Nếu `@/lib/api` builder chưa hỗ trợ ETag → xác nhận cách set header, KHÔNG tự dựng cơ chế cache mới ngoài chuẩn HTTP.

### 2. Query keys + hooks (FE)

- `kenoKeys`: thêm `opsSnapshot(params)`, `opsAlerts(drawId, status)`, `opsComboLookup(drawId, numbers)`. **Deprecate** (giữ lại tạm hoặc xoá) các key cũ `opsSummary/opsTenantBreakdown/opsNumberFrequency/opsPlayTypeDistribution/opsTopCombos` sau khi section chuyển sang snapshot.
- `use-operations.ts`:
  - `useOpsSnapshot(params, isSettled)`: `refetchInterval: isSettled ? false : pollMs`, `staleTime: isSettled ? Infinity : pollMs * 0.8`, `enabled: !!drawId`. **`pollMs` = `ops.stats.tickSeconds × 1000` đọc từ chính snapshot response** (worker cadence, default 10s) — poll khớp nhịp worker, không hardcode; staff hạ `tickSeconds` thì FE tự đọc theo. Đây là **timer 1 duy nhất** cho mọi số liệu.
  - Mỗi section dùng `select` slice từ snapshot (KPI select `totals`+`exposure`, heatmap select `numberFreq`, playtype select `byPlayType`, tenant select `byTenant`) — KPI đổi không kéo Analytics render (analysis §4.2).
  - `useLiveFeed(drawId, enabled)`: **timer 2**, `refetchInterval: pollMs` (cùng nhịp), `enabled: onAnalyticsTab && !isSettled` — chỉ chạy khi tab Phân tích mở.
  - `useComboLookup` (on-demand, `enabled:false` + refetch thủ công khi bấm Check), `useAlerts(drawId,status)` (`enabled: panelOpen`), `useAckAlert` (mutation + invalidate).
  - Xoá `useOpsSummary/useTenantBreakdown/useNumberFrequency/usePlayTypeDistribution/useTopCombos/useLiveEntries` cũ sau khi hết consumer.

### 3. Tách 2 tab (`operations/page.tsx` + sections)

- `useQueryState("tab", parseAsStringEnum(["monitor","analysis"]).withDefault("monitor"))`.
- **Tab Giám sát** (default): draw-management (giữ) → **Alerts panel** (ngay dưới command center — tín hiệu cần hành động, ưu tiên đọc trước) → KPI strip (6 card + **Exposure card**) → Result & Financial.
- **Tab Phân tích cược**: PlayTypeCard (side bet card gộp phân bổ + hướng lệch) → NumberHeatmap (2 chỉ số/ô + chọn số tuỳ ý + action menu ⋯ dialog tra cứu) → Bộ số phổ biến (topCombos, phân trang 20 client-side) → Top potential + Top accounts → LiveFeed → Tenant breakdown.
- `<TabsContent>` inactive **unmount** → heatmap 80 cell + bảng không render khi ở tab Giám sát (analysis §4.3).
- **Draw selector — sort + auto-select đúng kỳ (fix 29/07):** `GetDrawSelectorUseCase` phải **re-sort nhóm active theo `drawId` ASC** (kỳ sớm nhất/gần giờ hiện tại lên đầu) vì `getUnfinishedDraws()` trả `drawId DESC`. Auto-select mặc định = kỳ active đầu tiên sau sort. Nếu không: selector + auto-select nhảy vào kỳ xa nhất (vd 16:00 thay vì 14:48 đang chạy) — sai kỳ vận hành. **Game sau follow:** mọi selector nhiều kỳ/ngày sort active thời gian tăng dần, không dựa thứ tự repo (analysis §4.3).

### 4. Component mới (trong `sections/`, theo token + NumberBadge hiện có)

- **Exposure card** (`sections/kpi/exposure-card.tsx`): worst-case (từ `cappedExposure.worstCaseTotal`) + ngưỡng cảnh báo (`thresholds.exposureWarnPct`, prop `warnPct` — KHÔNG hardcode) + 3 dòng pick8/9/10 capSets (mẫu số `thresholds.maxSetsForFixed`), click → chuyển `?tab=analysis` cuộn tới combo list. `tabular-nums`.
- **Alerts panel** (`sections/alerts/alerts-panel.tsx`): đặt **ngay dưới draw-management** trong tab Giám sát (đầu trang) vì alert là tín hiệu cần hành động. Empty state = **1 dòng mảnh** (border-dashed + icon shield xanh), KHÔNG dựng card lớn — tránh chiếm chỗ vô ích khi kỳ chưa có cảnh báo. Chỉ dựng Card đầy đủ (accordion gộp theo type + Ack) khi thật sự có alert.
- **Heatmap ô — Dòng tiền + số lượt** (sửa `number-heatmap.tsx`): mỗi ô hiển thị Dòng tiền (giá trị chính, heat nền theo `amount`) + số lượt `Nx`. **KHÔNG per-number liability** (đã BỎ `KenoNumberStat.potentialWin` khỏi data + UI — worst-case là thuộc tính board, gán per-number double-count ~10 lần → vô nghĩa; rủi ro chi trả đo ở cấp entry qua Top phải trả tiềm năng). Legend header: lượt đặt + dòng tiền. Cùng grid/NumberBadge/token (analysis §3.7 đã sửa, §4.6c).
- **Chọn số tuỳ ý + action menu ⋯ + dialog tra cứu** (trong Card heatmap): bảng 80 số **LUÔN cho click chọn** (cell render `<button>`, số đã chọn có ring sky), **chọn bao nhiêu số tuỳ ý** (không giới hạn 8/9/10 — phục vụ nhiều thao tác tương lai). Header Card có **action menu ⋯** (`DropdownMenu`) chứa "Tra cứu P8/9/10" (enable khi đã chọn ≥ 1 số) + "Bỏ chọn tất cả". **Tra cứu mở Dialog riêng** (`components/ui/dialog`) — KHÔNG render inline dưới bảng: dialog chứa input CSV editable (sync 2 chiều selection) + chips số đã chọn + counter "Đã chọn N số · pickN / cần 8/9/10" + nút Tra cứu (disabled khi ≠ 8/9/10, play type tự suy) + bảng kết quả accounts (username + accountId + sets/amount). `useComboLookup` khởi tạo ở cha, dùng chung. Menu ⋯ là nơi mở rộng thao tác bảng số về sau (export, so sánh kỳ…) — mỗi thao tác 1 dialog. (analysis §4.6)
- **Side-bet card gộp** (sửa `analytics-panels.tsx` PlayTypeCard): mỗi cặp (Lớn↔Nhỏ, Chẵn↔Lẻ) là 1 card compact gộp phân bổ tiền 2 đầu + split bar đối xứng + % + hoà, từ `sideBetPairs` (`byPlayType.bigSmall/evenOdd`). Lệch ≥ `sidebetSkewPct` → amber + badge "lệch X%". **BỎ** SideBetCard (donut) + SideBetBars (progress bar full-width) tách rời — dư diện tích, trùng info (analysis §4.6d).
- **Alert badge** (header trang, cạnh draw selector): đọc `alertCounts` từ snapshot (không timer riêng), badge đỏ khi `critical>0`; click mở **Alert panel** (tab Giám sát) — mặc định **hiển thị gộp theo `type`** ("N combo_concentration…", `grouped=true`), mỗi nhóm expand xem raw + nút Ack (analysis/p0-06 §5). KHÔNG toast tự bung; âm thanh tuỳ chọn cho critical (analysis §4.2).

### 5. Adapter DTO → UI type

- Tái dùng pattern adapter `useMemo` trong `analytics/index.tsx` hiện có. Map slice snapshot → UI type trong `_lib/types.ts` (bổ sung type mới: `ExposureView`, `ExposureViewWithThreshold`, `ComboLookupResult`, `AlertRow`). KHÔNG đổi shape component render nếu không cần.
- **Hiển thị account (sửa, analysis §4.5):** bảng Top người chơi / Top phải trả tiềm năng / combo lookup dùng helper `AccountLabel` — ưu tiên `username`, fallback `accountId`, LUÔN kèm `accountId` (dòng phụ/`title`) để link hồ sơ. UI type `TopAccountRow`/`TopPotentialRow` + adapter mang cả `username` + `accountId` (tên field ĐỔI từ `accountName` sang `username` ngày 29/07/2026 để đồng nhất với `TicketEntryDoc.username`).
- **Ngưỡng UI từ snapshot, không hardcode (sửa Risk #9):** side-bet skew coloring nhận `sidebetSkewPct` từ `thresholds` (slice snapshot) truyền xuống `PlayTypeCard`; hằng số `SIDEBET_SKEW_PCT_DEFAULT` chỉ còn fallback loading. Đã xoá `EXPOSURE_WARN_PCT_DEFAULT`/`KENO_MAX_SETS_FOR_FIXED` (dead const sau khi dùng `thresholds`).

## Không làm

- KHÔNG >2 timer. KHÔNG toast alert tự bung. KHÔNG viết `export async function GET` thủ công (dùng `withApi`). KHÔNG hardcode token size (dùng `game-number-tokens.ts`). KHÔNG tạo NumberBadge/primitive mới (dùng cái có). KHÔNG jackpot zone (Keno không có).

## Verify

`pnpm --filter @megawin/backoffice check-types` + lint. Đo: trang chạy đúng 2 timer (DevTools Network), 304 khi stats không đổi (không re-render — React Profiler), tab Phân tích unmount khi ở Giám sát, settled draw = 0 request. UI review theo `web-design-guidelines` + `operations-page-ui`.

## Định nghĩa Done

Trang Vận hành 2 tab, 2 timer, đủ panel mới, đồng nhất chất liệu UI, poll khớp cadence worker + 304. Cập nhật `00-overview.md`.

## Dead code cleanup (28/07/2026) — soát lại sau khi snapshot đã 100% thay chỗ aggregation cũ

Bước 3 "Xoá `useOpsSummary/...` cũ sau khi hết consumer" ở mục 2 trên **đã bị bỏ sót** khi
implement (chỉ xoá hook + FE, KHÔNG xoá backend). Review sau (yêu cầu riêng: "kiểm tra dead
code sau khi áp dụng cách lấy dữ liệu mới") phát hiện + xoá toàn bộ chuỗi dead code sau —
đã confirm 0 consumer trước khi xoá (route/hook/query-key/repo-method):

**Đã xoá (game-keno-application):**
- Use-case: `get-ops-summary.ts`, `get-tenant-breakdown.ts`, `get-number-frequency.ts`,
  `get-playtype-distribution.ts`, `get-top-combos.ts`.
- DTO: `dto/operations.dto.ts` (OpsSummaryOutput/TenantBreakdownOutput/NumberFrequencyOutput/
  PlayTypeDistributionOutput), `dto/top-combos.dto.ts`.
- Helper: `helpers.ts` (`getFinancialDateToday` — chỉ 5 use-case trên gọi).
- Repo aggregation methods (`infras/repos/entry-repo.ts`): `aggregateOpsSummary`,
  `aggregateTenantBreakdown`, `aggregateNumberFrequency`, `aggregatePlayTypeDistribution`,
  `aggregateTopCombos` — đây là các pipeline aggregation ON-DEMAND nặng (unwind boards/numbers
  trên toàn bộ entries) mà snapshot (p0-03/p0-07) đã thay bằng pre-aggregated `findOne`.

**Đã xoá (backoffice):**
- Route: `api/keno/operations/{summary,tenants,number-frequency,playtype-distribution,
  top-combos}/route.ts` (+ xoá luôn thư mục rỗng).
- Zod schema: `opsQuerySchema`, `topCombosQuerySchema` (`_lib/schema.ts`).
- Query keys: `kenoKeys.opsSummary/opsTenantBreakdown/opsNumberFrequency/
  opsPlayTypeDistribution/opsTopCombos` (`lib/query-keys/keno.ts`) — các hook FE tương ứng
  (`useOpsSummary`...) đã xoá đúng lúc ở p0-07 gốc, chỉ backend còn sót.

**Bài học cho game khác khi migrate sang snapshot pattern (analysis §8):** xoá theo
THỨ TỰ ngược dependency graph để tránh sót — Route/Hook (FE, consumer ngoài cùng) →
Query key → Use-case → DTO → Repo aggregation method (nguồn sâu nhất). Sau khi tách
2 timer + snapshot, **BẮT BUỘC** grep tên use-case cũ + tên method repo cũ trên toàn repo
trước khi coi plan "Done" — không chỉ xoá phần FE rồi dừng. Method aggregation on-demand
(`aggregate{X}` unwind nặng) là nơi dễ sót nhất vì nằm sâu trong repo, không lỗi compile khi
quên xoá.
