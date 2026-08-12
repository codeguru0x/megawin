# Phân tích & Giải pháp nâng cấp trang Dashboard Backoffice

> Ngày khảo sát: 2026-08-09 · Phạm vi: `apps/backoffice/src/app/(main)/dashboard` + toàn bộ hệ ops/risk per-game đã xây xong (7 game)
> Mục tiêu: Dashboard trở thành **System Health & Risk Command Center** — màn hình đầu tiên staff nhìn khi login để monitor toàn hệ thống.

---

## 1. Tóm tắt điều hành (Executive Summary)

Trang Dashboard hiện tại được thiết kế theo "Phương án C — today-only monitoring" với 5 zone: Hero KPIs, Outstanding, Jackpot Pools, Hiệu suất game, Lịch quay số. Chất lượng code và visual tốt, nhưng **đã lỗi thời so với năng lực hệ thống**: sau khi hoàn thành 7 bộ ops/risk-control per-game (alerts, exposure, betting stats, combo stats, live feed…), Dashboard tổng **không hiển thị bất kỳ tín hiệu risk/alert nào**. Staff login vào chỉ thấy số liệu tài chính — muốn biết "có gì cần xử lý không" phải tự mở lần lượt 7 trang operations.

**3 kết luận chính:**

1. **Gap nghiêm trọng nhất là chức năng, không phải visual**: chưa có zone Alerts/Risk cross-game, chưa có exposure tổng hợp, chưa có tín hiệu worker health / settle stuck — trong khi backend đã có đủ nguyên liệu (`OpsAlertRepository` × 7 với schema đồng nhất 100% qua `OpsAlertBase`).
2. **UX đầu ngày bị "chết"**: 5 Hero KPI đều `0 đ` (ảnh chụp thực tế) vì KPI chỉ tính từ dữ liệu đã settle — dù Outstanding đang có 47,6 triệu pending. Zone nổi bật nhất màn hình không mang thông tin trong nhiều giờ đầu ngày.
3. **Hiệu năng có 1 điểm nóng**: route `/api/dashboard/draws` chạy **21 DB query mỗi 30s cho MỖI client** đang mở dashboard, không cache/ETag — nhân theo số staff. Các route còn lại chấp nhận được.

Giải pháp đề xuất chia 3 phase: **P0 quick-wins** (sửa KPI đầu ngày, stuck-draw flag, cache draws), **P1 Risk Command Center** (zone System Status + API `/api/dashboard/alerts` cross-game), **P2 nâng cao** (exposure tổng hợp, kích hoạt `settle_stuck`/`revenue_anomaly`).

---

## 2. Hiện trạng — kiến trúc trang Dashboard

### 2.1 Cấu trúc code

```
apps/backoffice/src/app/(main)/dashboard/
├── page.tsx                    # RSC wrapper — chỉ requireSession()
├── dashboard-content.tsx       # Client Component chính, orchestrate 4 queries
├── _components/
│   ├── hero-kpis.tsx           # Zone 1 — 5 KPI cards (hôm nay + hôm qua + trend)
│   ├── outstanding-strip.tsx   # Zone 2 — exposure strip (6 metric + stacked bar + 7 game cards)
│   ├── jackpot-pools.tsx       # Zone 3 — 3 jackpot cards (Mega645/Power655/Lotto535)
│   ├── game-performance.tsx    # Zone 4 — PayoutRatioChart (donut recharts) + GameOverview table
│   ├── draw-timeline.tsx       # Zone 5 — 3 cột: Đang diễn ra / Vừa hoàn thành / Sắp diễn ra
│   └── skeletons.tsx
└── _lib/
    ├── compute.ts              # computeDayKpis — client-side aggregate từ per-game data
    ├── use-dashboard-filters.ts # todayFd / yesterdayFd / compareFd (cùng thứ tuần trước)
    └── use-dashboard-queries.ts # 4 React Query hooks
```

### 2.2 Data layer hiện tại

| Query | Route | Backend | Refetch | Độ nặng |
|---|---|---|---|---|
| `useDashboardKpis` | `GET /api/dashboard/kpis?fd=&compare=` | `GetDashboardKpisUseCase` — collection `SystemSettleGameDaily`, 1 query `$in` gộp 3 ngày | 2 phút | ✅ Nhẹ, tối ưu |
| `useDashboardOutstanding` | `GET /api/dashboard/outstanding` | `GetSystemOutstandingUseCase` — `SystemOutstandingGameDaily` (worker per-game pre-aggregate mỗi phút) | 30s | ✅ Nhẹ |

> ⚠️ Lưu ý nhỏ: comment trong `outstanding-strip.tsx` ghi "TTL 5 phút trên server" nhưng Lambda sync outstanding thực tế chạy cron **mỗi 1 phút** — comment lệch với hành vi thật, cần sửa lại khi refactor (rule `code-quality-standards` §4: comment sai tệ hơn không có comment).
| `useDashboardJackpots` | `GET /api/dashboard/jackpots` | Orchestrator `_lib/get-dashboard-jackpots.ts` — 3 game | 30s | ⚠️ Trung bình, không cache |
| `useDashboardDraws` | `GET /api/dashboard/draws` | Orchestrator `GetDashboardDrawsUseCase` — **7 game × 3 query = 21 DB call** | 30s | 🔴 Nặng nhất, không cache/ETag |

Điểm cộng của thiết kế hiện tại:

- KPIs route gộp 3 financial dates vào 1 query `$in` — client compute lại bằng `computeDayKpis` cho 3 ngày từ cùng 1 response. Đúng tinh thần "1 fetch, nhiều zone".
- Outstanding đọc từ snapshot pre-aggregated (worker Lambda per-game sync mỗi phút) — FE không aggregate on-demand.
- `Promise.allSettled` trong draws orchestrator — 1 game lỗi không sập cả timeline.
- Skeleton đầy đủ cho mọi zone; live-dot refresh thủ công invalidate toàn bộ query keys.

### 2.3 Quan sát từ ảnh chụp màn hình thực tế (2026-08-09 14:44)

| # | Quan sát | Ý nghĩa |
|---|---|---|
| S1 | **Cả 5 Hero KPI = `0 đ` / `0`** trong khi Outstanding có 47,6 triệu pending, 92 vé, 31 người chơi | KPI chỉ đếm dữ liệu **đã settle** trong financial date hôm nay (cutoff 11:00 VN) → đầu ngày zone quan trọng nhất trống rỗng, staff không đọc được "hôm nay đang bán được bao nhiêu" |
| S2 | Zone 4 (Payout ratio + Hiệu suất game) **biến mất hoàn toàn** | Điều kiện render `todayKpis.totalStake > 0` ở `dashboard-content.tsx:113` → layout co giãn theo giờ trong ngày, không ổn định |
| S3 | Cột "Đang diễn ra" chứa các kỳ Max 3D Pro với ngày **24/03, 09/07, 30/07…** (quá khứ xa) | Đây là **kỳ quay kẹt (stuck draws)** — dashboard hiển thị nhưng KHÔNG cảnh báo, hòa lẫn với kỳ bình thường. Staff không nhận ra có sự cố |
| S4 | Cột "Sắp diễn ra" trống ("Không có kỳ sắp tới") | 1/3 chiều ngang zone 5 lãng phí; đồng thời là tín hiệu vận hành (thiếu lịch kỳ mới) nhưng chỉ hiển thị như empty state trung tính |
| S5 | 3 jackpot cards chiếm ~1/4 chiều cao màn hình | Mật độ thông tin thấp cho mục đích monitor — jackpot thay đổi chậm, không cần diện tích lớn như vậy |
| S6 | Không có bất kỳ badge/indicator alert nào trên toàn trang | Không phân biệt được "hệ thống bình thường" vs "có 5 alert critical đang chờ ack" |

---

## 3. Bối cảnh mới — hệ ops/risk per-game đã hoàn thành

Đây là phần thay đổi lớn nhất kể từ khi Dashboard được thiết kế. Cả 7 game đã có đủ bộ ops/risk-control theo pattern chuẩn hoá từ Keno (plans `{game}-ops-risk-control/` — P0 đã done toàn bộ 7 game):

### 3.1 Năng lực đã có ở từng game

- **Trang Operations** (`/games/{game}/operations`) 2 tab: Giám sát (DrawManagement + AlertsPanel + KpiStrip + ExposureCard + ResultSection) và Phân tích cược (top combos/accounts, heatmap, live-feed, pair liability cho Max3D/Pro, dice histogram cho Bingo18).
- **Worker stats-sync** per-game (tick 10–30s) pre-aggregate vào `{game}_draw_betting_stats`, `{game}_draw_combo_stats`, `{game}_draw_account_stats`, `{game}_ops_alerts`.
- **API per-game**: `snapshot` (có ETag/304, `pollSeconds` động), `alerts` (grouped), `alerts/{id}/ack`, `live-entries`, `winning-entries`, `combo-lookup`, `draw-selector`.
- **Alert evaluator** idempotent (dedupeKey + upsert) với ngưỡng cấu hình được trong tab "Vận hành" của trang config.

### 3.2 Bảng alert types theo game

| Alert type | keno | lotto535 | mega645 | power655 | max3d | max3dpro | bingo18 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `large_bet` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `exposure_threshold` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `combo_concentration` | ✅ | ✅ | ✅ | ✅ | ✅ (cặp) | ✅ (cặp ordered) | — |
| `sidebet_skew` | ✅ | — | — | — | — | — | ✅ |
| `cap_sets_near` | ✅ | — | — | — | — | — | — |
| `bao_high_stake` | — | — | ✅ | ✅ | — | — | — |
| `cover_high_stake` | — | ✅ | — | — | — | — | — |
| `special_skew` | — | ✅ | — | — | — | — | — |
| `pair_liability` | — | — | — | — | ✅ (luôn critical) | ✅ | — |
| `bucket_concentration` | — | — | — | — | — | — | ✅ |
| `revenue_anomaly` / `settle_stuck` | 📦 khai báo cả 7 game nhưng **CHƯA có evaluator bắn** | | | | | | |

### 3.3 Nguyên liệu cross-game tái dùng được ngay

| Sẵn có | Nguồn | Giá trị cho Dashboard tổng |
|---|---|---|
| `OpsAlertBase` + `OpsAlertStatus`/`OpsAlertSeverity` chung | `packages/game-core/src/types/ops-alert.ts` | Schema alert **đồng nhất 100%** → gộp cross-game không cần adapter |
| `OpsAlertRepository.countByStatus()` / `countActiveCritical()` / `listByDrawAndStatus()` × 7 | `packages/game-{game}-application/src/infras/repos/ops-alert-repo.ts` | Nguyên liệu trực tiếp cho use-case "system alerts summary" |
| `GetOpsSnapshotUseCase` × 7 (có `alertCounts`, `exposure`, `thresholds`) | `game-{game}-application/use-cases/operations` | Tái dùng phần đếm alert + exposure per-draw |
| Orchestrator pattern `GetDashboardDrawsUseCase` | `apps/backoffice/src/app/api/dashboard/draws/_lib/get-dashboard-draws.ts` | Template chuẩn để viết orchestrator alerts (fan-out 7 repo, `Promise.allSettled`) |
| ETag/304 pattern | `api/{game}/operations/snapshot/route.ts` | Áp dụng lại cho draws/jackpots/alerts |
| UI components: `AlertsPanel`, `AlertHeaderBadge`, `ExposureCard`, `PlayerName` | `games/{game}/operations/_lib/sections`, `components/player-name.tsx` | Generalize cho dashboard |
| Trang `/system/workers` (worker health) | plan `system-worker-health` | Nguồn dữ liệu cho tín hiệu "worker chết" trên dashboard |

### 3.4 Khoảng trống (gap) đã xác nhận

1. **Không có API tổng hợp alerts cross-game** — grep toàn bộ `api/dashboard/` và `game-core-application`: không route/use-case nào đụng tới ops alerts. Mỗi game 1 collection `{game}_ops_alerts` riêng → bắt buộc fan-out 7 query (giống pattern draws).
2. **Không có exposure tổng hợp** — exposure hiện chỉ tồn tại trong snapshot per-draw per-game. Outstanding strip trên dashboard hiển thị **stake pending** (tiền đã thu), KHÔNG phải **worst-case liability** (tiền có thể phải trả) — hai khái niệm rủi ro rất khác nhau.
3. **Không có tín hiệu worker health / settle stuck trên dashboard** — draw kẹt từ 24/03 vẫn hiện như kỳ "đang diễn ra" bình thường (quan sát S3).
4. **Sidebar không có mục "ops toàn hệ thống"** — Dashboard là trang duy nhất mang tính cross-game nhưng nội dung chưa gánh vai trò đó.

---

## 4. Phân tích vấn đề chi tiết

### 4.1 Vấn đề UX / hiệu quả sử dụng

**U1 — Dashboard không trả lời được câu hỏi số 1 của staff monitor: "Có gì cần xử lý NGAY không?"**
Toàn trang là số liệu tài chính mô tả (descriptive). Không có tín hiệu actionable: alert mới/critical, kỳ kẹt, worker chết, exposure vượt ngưỡng. Staff muốn biết phải mở tuần tự 7 trang operations (mỗi trang lại phải chọn draw). Với vai trò "màn hình đầu tiên khi login", đây là thiếu sót lớn nhất.

**U2 — Hero KPIs "chết" nửa ngày đầu (S1, S2)**
`computeDayKpis` chỉ đọc `SystemSettleGameDaily` (dữ liệu đã settle). Financial date cutoff 11:00 sáng — nghĩa là từ 11:00 đến khi kỳ đầu tiên trong ngày settle xong, cả 5 card hiển thị `0 đ`. Trong khi đó dữ liệu **doanh số đang bán** đã có sẵn trong `SystemOutstandingGameDaily` (fetch cùng trang!) nhưng không được đưa vào KPI. Hệ quả kép: zone 4 cũng biến mất (S2) vì cùng điều kiện `totalStake > 0`.

**U3 — Kỳ quay kẹt hoà lẫn kỳ bình thường (S3)**
`DrawTimeline` render mọi active draw như nhau. Kỳ `drawAt` đã qua nhiều giờ/nhiều tháng mà chưa settle là sự cố vận hành (settle stuck / quên publish result) — cần nổi bật đỏ + đếm riêng, thậm chí đẩy lên đầu trang. Đây chính là lý do alert type `settle_stuck` đã được khai báo sẵn cả 7 game.

**U4 — Số liệu có thể gây hiểu nhầm**
- `totalPlayers` = sum unique players per-game → **double-count** người chơi nhiều game (đã ghi chú trong code `compute.ts:20` nhưng UI không disclose).
- Outstanding strip label "Tổng tiền pending" — dễ đọc nhầm thành exposure. Thực chất là stake (doanh thu đang treo), không phải liability.
- Trend % so "hôm qua vs cùng thứ tuần trước" — logic tốt nhưng không có tooltip giải thích, staff mới dễ hiểu nhầm là "hôm nay vs hôm qua".

**U5 — Phân bổ diện tích không tương xứng tầm quan trọng (S5)**
Thứ tự hiện tại: KPI → Outstanding → **Jackpot (to nhất)** → Performance → Timeline. Jackpot đổi chậm (mỗi kỳ ~vài ngày với lottery) nhưng chiếm nhiều đất nhất; alerts (thay đổi từng phút, cần hành động) không có chỗ nào.

**U6 — Refresh UX kín đáo quá mức**
Nút refresh là live-dot 6px cạnh subtitle — discoverability thấp. Không hiển thị "cập nhật lúc HH:mm:ss" (trang operations per-game đã có pattern `Live · HH:mm:ss` tốt hơn).

**U7 — Điều hướng drill-down chưa tận dụng hết**
Đã có link tốt: game card → outstanding, draw row → `operations?draw=`, jackpot card → trang jackpot. Nhưng thiếu: KPI card không link tới report tương ứng; không có lối tắt tới `/system/workers`; không có link "xem tất cả alerts".

### 4.2 Vấn đề hiệu năng

**P1 — Route `/api/dashboard/draws`: 21 DB query / 30s / client 🔴**
7 game × 3 nhóm status (`getUnfinishedDraws` active, `getRecentCompletedDraws`, `getUnfinishedDraws` scheduled). Không cache server, không ETag. 5 staff mở dashboard = 105 query/30s = ~210 query/phút chỉ cho timeline. So sánh: route `snapshot` per-game đã có ETag/304 — pattern có sẵn không được áp dụng.

**P2 — Route `/api/dashboard/jackpots`: orchestrate 3 game / 30s / client, không cache ⚠️**
Nhẹ hơn draws nhưng cùng bệnh. Jackpot đổi chậm — TTL 30–60s server-side là an toàn.

**P3 — Client bundle: `recharts` chỉ để vẽ 1 donut ⚠️**
`game-performance.tsx` import `recharts` (Pie/PieChart/ResponsiveContainer/Sector) trực tiếp — kéo cả thư viện vào first load của trang đầu tiên sau login. Donut phân bổ doanh thu hoàn toàn thay được bằng stacked bar thuần CSS (Outstanding strip đã làm) hoặc `next/dynamic`.

**P4 — Mỗi `DrawEventRow` 1 `setInterval` 15s (minor)**
`useRelativeTime` tạo timer riêng per-row (~10–20 rows). Nên dùng 1 timer chung (context hoặc `useSWRSubscription`-style dedupe). Ảnh hưởng nhỏ nhưng là pattern xấu khi list dài.

**P5 — 4 query keys nhưng invalidate cả cây khi bấm refresh (chấp nhận được)**
`qc.invalidateQueries({ queryKey: dashboardKeys.all })` — hành vi đúng cho nút "làm mới toàn trang".

**Điểm hiệu năng ĐÃ TỐT (giữ nguyên):** kpis 1 query `$in`; outstanding đọc snapshot worker; skeleton per-zone; React Query mặc định không refetch khi tab ẩn.

---

## 5. Giải pháp — thiết kế mục tiêu

### 5.1 North star

Dashboard phải trả lời **3 câu hỏi trong 5 giây đầu**, theo đúng thứ tự ưu tiên từ trên xuống:

1. **"Có gì cần xử lý ngay?"** → System Status Bar (alerts + stuck draws + worker health)
2. **"Hệ thống đang chịu rủi ro bao nhiêu?"** → Outstanding + Exposure
3. **"Kinh doanh hôm nay thế nào?"** → KPIs + Performance + Jackpot

### 5.2 Layout đề xuất (thứ tự zone mới)

```
┌──────────────────────────────────────────────────────────────────┐
│ Header: Dashboard · Live HH:mm:ss · nút refresh rõ ràng          │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 0 (MỚI) — SYSTEM STATUS BAR                                 │
│ [🔴 3 Critical] [🟡 7 New alerts] [⏱ 2 kỳ kẹt] [⚙ Workers OK]   │
│ → mỗi pill click được: mở panel alerts / scroll tới timeline /   │
│   link /system/workers. Trạng thái sạch = 1 dòng xanh mỏng.      │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 1 — HERO KPIs (sửa: thêm tầng "đang bán" từ outstanding)    │
│ Doanh thu: [Đã settle 0đ] + [Đang bán 47,6tr] → không còn "0 đ"  │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 2 — OUTSTANDING & RISK (nâng cấp từ Outstanding strip)      │
│ Giữ 6 metric + stacked bar + game cards; game card thêm dòng     │
│ alert count + exposure warn nếu có                               │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 3 — PERFORMANCE (payout ratio + game table, luôn render     │
│ với empty-state thay vì biến mất)                                │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 4 — JACKPOT (compact: 3 card 1 hàng thấp hơn ~40%,          │
│ giữ progress bar + badge Hot/Overflow)                           │
├──────────────────────────────────────────────────────────────────┤
│ ZONE 5 — LỊCH QUAY SỐ (thêm stuck-flag đỏ, cột trống co lại)     │
└──────────────────────────────────────────────────────────────────┘
```

Nguyên tắc: **alert lên đầu, tài chính ở giữa, lịch ở cuối**. Khi hệ thống sạch, Zone 0 chỉ là 1 dòng mỏng màu xanh — không chiếm đất.

### 5.3 Backend mới: `GET /api/dashboard/alerts` (hạng mục quan trọng nhất)

Theo đúng template `GetDashboardDrawsUseCase` (orchestrator đặt tại `api/dashboard/alerts/_lib/`, không đặt ở `game-core-application` vì vi phạm dependency direction):

- Fan-out 7 × `OpsAlertRepository` qua `Promise.allSettled`:
  - `countByStatus()` → tổng `new` / `ack` per-game, tách `critical`.
  - Top N (5–10) alert critical/new mới nhất cross-game (sort `createdAt` desc sau khi merge) — đủ field để render: `gameProduct`, `drawId`, `type`, `severity`, `payload` tóm tắt, `createdAt`.
- Output đề xuất:

```typescript
interface GetDashboardAlertsOutput {
  perGame: Array<{ gameProduct: GameProduct; newCount: number; criticalCount: number }>;
  totalNew: number;
  totalCritical: number;
  topAlerts: DashboardAlertItem[]; // 5–10 alert nổi bật nhất, có link drill-down
  snapshotAt: string;
}
```

- **Bắt buộc kèm chống nhân tải**: LRU cache server-side TTL 15–30s (theo pattern `lru-cache` — N staff chỉ tốn 1 lượt fan-out mỗi TTL) + ETag/304 (copy từ `snapshot/route.ts`). Ack alert vẫn làm ở trang operations per-game (không ack từ dashboard — giữ dashboard read-only, tránh ack nhầm thiếu context).
- FE: hook `useDashboardAlerts` refetch 30s, render Zone 0 + badge trên game cards Zone 2.

### 5.4 Sửa Hero KPIs — hết cảnh "0 đ" đầu ngày

Không cần API mới: `dashboard-content.tsx` đã fetch outstanding. Đưa vào `computeDayKpis` (hoặc component) tầng thứ 2:

- Card "Doanh thu": giá trị chính = `settled + outstandingStake` (label "hôm nay, gồm đang bán") hoặc 2 dòng "Đã settle / Đang bán".
- GGR/Lợi nhuận: giữ settle-only (không thể tính trước khi quay) nhưng thêm trạng thái rõ ràng "Chưa có kỳ settle hôm nay" thay vì `0 đ` trần.
- Số vé / Người chơi: cộng thêm từ outstanding (`totalEntryCount`, `totalPlayerCount`) với chú thích. Sửa luôn tooltip disclose double-count của `totalPlayers`.
- Zone Performance: bỏ điều kiện ẩn hoàn toàn — render card với empty-state "Chưa có dữ liệu settle hôm nay" để layout ổn định (S2).

### 5.5 Stuck-draw detection ở DrawTimeline (quick-win giá trị cao)

Thuần FE, không cần backend: active draw có `drawAt < now - X` (đề xuất X = 2h cho lottery, 15 phút cho high-freq) → row nền đỏ nhạt + badge "Kẹt {relative time}", sort lên đầu cột, đồng thời đếm vào pill "⏱ kỳ kẹt" ở Zone 0. Về dài hạn thay bằng alert `settle_stuck` từ evaluator (5.7).

### 5.6 Hiệu năng

1. **Cache route draws + jackpots**: LRU TTL 15–30s + ETag (copy pattern snapshot). Ước giảm >90% DB load khi ≥2 staff online.
2. **Bỏ hoặc lazy-load recharts**: thay donut bằng stacked bar CSS (đồng bộ với Outstanding strip) hoặc `next/dynamic` cho `PayoutRatioChart`/`GameOverview` chart phần.
3. **1 timer chung cho relative time**: context 15s tick ở `DrawTimeline`, các row đọc từ context.
4. Giữ nguyên nhịp refetch hiện tại (30s live / 2 phút KPI) — hợp lý sau khi có cache server.

### 5.7 Kích hoạt 2 alert "để dành" (P2 — backend)

`settle_stuck` và `revenue_anomaly` đã khai báo ở entity cả 7 game nhưng chưa có evaluator bắn. Ưu tiên `settle_stuck` trước (giá trị vận hành cao nhất, logic đơn giản: draw quá hạn X phút chưa settled). Khi có, Zone 0 pill "kỳ kẹt" đọc từ alerts thay vì FE tự suy — nhất quán với ack workflow.

### 5.8 Lộ trình thực hiện

| Phase | Hạng mục | Effort | Impact |
|---|---|---|---|
| **P0 — quick wins** (1–2 ngày) | 5.4 Hero KPI 2 tầng + empty-state Zone Performance; 5.5 stuck-flag FE; 5.6.1 cache draws/jackpots; header `Live · HH:mm:ss` | Nhỏ | Cao — sửa ngay 3 quan sát S1/S2/S3 |
| **P1 — Risk Command Center** (3–5 ngày) | 5.3 API `/api/dashboard/alerts` + Zone 0 System Status Bar + alert badge trên game cards Zone 2; compact jackpot (5.2); 5.6.2 recharts | Vừa | Rất cao — dashboard thành trang monitor thật sự |
| **P2 — nâng cao** | 5.7 evaluator `settle_stuck`/`revenue_anomaly`; exposure tổng hợp cross-game (mở rộng `SystemOutstandingGameDaily` hoặc collection snapshot mới do worker ghi — KHÔNG fan-out 7 snapshot on-demand); tín hiệu worker health từ `/system/workers` lên Zone 0 | Lớn | Cao, làm sau khi P1 chạy ổn |

### 5.9 Rủi ro & lưu ý triển khai

- **Không ack alert từ dashboard** (giai đoạn đầu) — thiếu context draw dễ ack nhầm; drill-down về trang operations là đủ.
- **Exposure cross-game phải do worker pre-aggregate** — fan-out 7 `GetOpsSnapshotUseCase` on-demand cho mọi active draw là quá nặng (mỗi snapshot đã là aggregate nhiều collection). Theo đúng triết lý hiện tại: FE chỉ đọc snapshot.
- Alert collections per-game (`{game}_ops_alerts`) — orchestrator cần `Promise.allSettled` + degrade gracefully (1 game lỗi vẫn hiện 6 game còn lại), giống draws.
- Zone 0 khi sạch phải thật mỏng — tránh "alert fatigue" và tránh chiếm đất của KPI.
- Mọi hiển thị player trên alerts/top-risk dùng `PlayerName`/`PlayerOutstandingLink` từ `@/components/player-name` (rule `player-display-username`).

---

## 6. Phụ lục — inventory file liên quan

| Nhóm | File |
|---|---|
| Trang dashboard | `apps/backoffice/src/app/(main)/dashboard/{page,dashboard-content}.tsx`, `_components/*`, `_lib/*` |
| API dashboard | `apps/backoffice/src/app/api/dashboard/{kpis,draws,jackpots,outstanding}/route.ts` (+ `_lib/`) |
| Use-case reports cross-game | `packages/game-core-application/src/use-cases/reports/{get-dashboard-kpis,get-system-outstanding}.ts` |
| Alert base types | `packages/game-core/src/types/ops-alert.ts` |
| Alert per-game | `packages/game-{game}/src/entities/ops-alert.ts` + `packages/game-{game}-application/src/infras/repos/ops-alert-repo.ts` |
| Snapshot per-game (ETag pattern) | `apps/backoffice/src/app/api/{game}/operations/snapshot/route.ts` |
| Trang operations mẫu | `apps/backoffice/src/app/(main)/games/keno/operations/` (guideline: `.cursor/plans/keno-ops-risk-control/operations-page-layout.guideline.md`) |
| Sidebar | `apps/backoffice/src/navigation/sidebar/sidebar-items.ts` |
| Worker health | `/system/workers` (plan `system-worker-health`) |

