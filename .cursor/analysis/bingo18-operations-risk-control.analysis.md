# Bingo 18 — Operations & Risk Control (Analysis)

> **Status:** `approved (P0)` · **Ngày:** 30/07/2026 — user đã chốt toàn bộ câu hỏi mở §7 (30/07/2026). Thứ tự triển khai đã chốt: **Bingo18 → Max3D → Max3D Pro**.
> **Nguồn tham chiếu:**
> - Analysis mẫu: `.cursor/analysis/keno-operations-risk-control.analysis.md` (status `approved (P0)`, đã triển khai xong P0+P1) — **đọc trước, doc này chỉ ghi phần GIỐNG (tham chiếu) và phần KHÁC (chi tiết)**.
> - Guideline bắt buộc follow: `.cursor/plans/keno-ops-risk-control/operations-page-layout.guideline.md` + `ops-config-page-layout.guideline.md`.
> - Checklist rủi ro worker: analysis Keno §11 + `00-overview.md` §"Review rủi ro kỹ thuật/dữ liệu" (10 mục) — áp dụng NGUYÊN VẸN từ đầu.
> - Source đã đọc (30/07/2026): `packages/game-bingo18` (entities/enums.ts, types.ts, entry.ts, global-config.ts, indexes, rules/prize-tables.ts, rules/odds.ts, rules/financials.ts, helpers/match-result.ts), `packages/game-bingo18-application` (repos/entry-repo.ts, use-cases/operations/*, use-cases/settle/settle-entries.ts), `apps/worker-bingo18/src/{handlers,functions}`, `apps/backoffice/src/app/(main)/games/bingo18/operations/_lib/use-operations.ts`, `apps/backoffice/src/app/api/bingo18/operations/`, rule `bingo18-game-rules.mdc`.
> - **Tên class đã đổi (03/08/2026)** — `LockedWorkerUseCase` → `SingleRunWorker`. Xem
>   `.cursor/plans/worker-core-usecase-restructure/00-overview.md`. Doc này viết trước khi đổi tên.

## 1. Bối cảnh & mục tiêu

Nhân rộng hệ thống **alert-driven ops đọc pre-aggregated data** (đã chứng minh ở Keno) sang trang Vận hành Bingo 18 (`/games/bingo18/operations`). Ràng buộc vận hành Bingo 18 còn CHẶT hơn Keno:

- **Tần suất cao nhất hệ thống: 6 phút/kỳ, ~160 kỳ/ngày, 7 ngày/tuần** (Keno 8 phút/~119 kỳ). Thời gian phản ứng của staff mỗi kỳ chỉ vài phút.
- **Đóng bán 30 GIÂY trước quay** (`salesCloseBeforeSeconds: 30`) — cửa sổ quan sát cuối cùng cực ngắn.
- Không được làm chậm hot path place-bet; staff tối thiểu → alert-driven; backoffice render mượt (nguyên tắc bất biến Keno §3.1 giữ nguyên).

## 2. Hiện trạng (đọc trực tiếp source, 30/07/2026)

### 2.1. Trang ops hiện tại — lặp lại đúng kiến trúc Keno CŨ (trước P0)

`use-operations.ts` của Bingo 18 đang chạy **7 timer polling độc lập**, mỗi timer 1 aggregation on-demand:

| Timer | Interval | Route | Repo method (on-demand aggregation) |
|---|---|---|---|
| Draw selector | 15s | `/draw-selector` | `getUnfinishedDraws` + `getRecentCompletedDraws` |
| KPI summary | 15s | `/summary` | `aggregateOpsSummary` (`$group` + `$filter` boards toàn bộ entries) |
| Tenant breakdown | 30s | `/tenants` | `aggregateTenantBreakdown` |
| Dice frequency | 60s | `/dice-frequency` | `aggregateDiceFrequency` (`$unwind` boards) |
| PlayType distribution | 60s | `/playtype-distribution` | `aggregatePlayTypeDistribution` (`$unwind` boards) |
| Live entries | 15s | `/live-entries` | `getLatestEntriesByDrawId` |
| Top combos | 60s | `/top-combos` | `aggregateTopCombos` (`$unwind` boards, chỉ side bet) |

→ Đúng anti-pattern Keno đã bỏ (analysis Keno §2.2 điểm 3 + §4.1). Với chu kỳ 6 phút và volume ~160 kỳ/ngày, chi phí aggregation lặp còn tệ hơn Keno.

### 2.2. Ba phát hiện kỹ thuật (đối chiếu từng dòng code)

1. **Index lệch field (BUG — y hệt Keno p0-01):** `packages/game-bingo18/src/indexes/index.ts` khai 3 index dùng `drawDate` trên `bingo18_ticket_entries` (`idx_tenant_account_drawDate` dòng 106, `idx_tenant_drawDate_status` dòng 112, `idx_drawDate_status` dòng 118) nhưng `TicketEntryDoc` (entry.ts) **chỉ có `financialDate`**, không có `drawDate`. Mọi ops aggregation `$match` theo `financialDate` → 3 index vô dụng, query theo ngày COLLSCAN. Cần sửa key + name + purpose y hệt Keno p0-01.
2. **KHÔNG có exposure view / alert nào** — thư mục `api/bingo18/operations/` không có route exposure; không có collection stats/alert. Toàn bộ giám sát là "người nhìn dashboard".
3. **Draw selector KHÔNG re-sort active ASC** (`get-draw-selector.ts` dòng 35: `activeDraws = unfinishedDraws.filter(...)` giữ nguyên DESC từ repo) — đúng bug Keno đã sửa (guideline §2): auto-select nhảy vào kỳ XA nhất thay vì kỳ đang chạy. Bingo 18 kỳ 6 phút + vé multi-draw tối đa **20 kỳ** → thường có nhiều draw active đồng thời, bug này biểu hiện rõ hơn Keno.

### 2.3. Luật chơi → cấu trúc rủi ro (đối chiếu `prize-tables.ts` + `odds.ts` + `match-result.ts` + `settle-entries.ts`)

Bingo 18: quay 3 xúc xắc {1..6}, không gian mẫu **216 outcome**, mệnh giá 10.000đ/bộ, `betCount` 1–10/board, tối đa `maxBasicBoardsPerTicket` (default 6, hard cap 100) board/vé, **KHÔNG Jackpot, KHÔNG payout cap**. 5 kiểu chơi, giải mặc định:

| Kiểu chơi | Selection space | Giải cao nhất/bộ 10k | Nhân | Xác suất trúng max |
|---|---|---|---|---|
| `singleNum` (1 số 1-6) | 6 | 30.000 (xuất hiện 3 lần) | ×3 | 1/216 |
| `doubleMatch` (cặp trùng) | 6 | 75.000 (≥2 lần) | ×7,5 | 16/216 |
| `tripleMatch.specific` | 6 | **1.200.000** | **×120** | 1/216 |
| `tripleMatch.any` | 1 | 200.000 | ×20 | 6/216 |
| `sumTotal` (tổng 3-18) | 16 | **1.200.000** (tổng 3 hoặc 18) | **×120** | 1/216 |
| `bigSmallDraw` | 3 | 20.000 (hoà) / 15.000 | ×2 / ×1,5 | 54/216 · 106/216 · 56/216 |

Settle: `payoutAmount = winAmount` trực tiếp (settle-entries.ts dòng 253 — không cap); `winAmount = unitWinAmount × betCount`; `companyTake = revenue − prizes − commission`, **có thể ÂM** (`financials.ts`).

**Khác biệt bản chất so với Keno — quyết định toàn bộ thiết kế bên dưới:**

1. **Exposure tính được CHÍNH XÁC per-outcome** — không gian mẫu chỉ 216 (Keno: 3,5×10¹⁸ phải dùng proxy). Mọi bucket cược của Bingo 18 map thẳng vào hàm payout theo outcome → tính đúng "nếu quay ra (a,b,c) thì trả bao nhiêu" cho CẢ 216 trường hợp. Không cần proxy worst-case kiểu Keno.
2. **KHÔNG có payout cap** → không có `cap_sets_near`, không có `capExposureByPlayType`, không có bài toán "chia đều cap" → **không cần combo-stats collection, không cần minh bạch combo cho player** (p0-04 + p1-01 của Keno KHÔNG áp dụng).
3. **Selection space cực nhỏ** (6+6+6+1+16+3 = 38 bucket) → khái niệm "bộ số hiếm bị cược trùng" (syndicate qua combo) vô nghĩa — ai cũng cược trùng bucket. Concentration risk đo bằng **tiền dồn vào bucket nhân cao** (sum 3/18, tripleMatch specific), không phải "N account cùng 1 combo".
4. **Nhân tối đa ×120** (Keno ×200.000) → 1 vé lẻ không thể tạo liability khổng lồ; rủi ro đến từ **KHỐI LƯỢNG dồn 1 hướng** (nhiều tiền cùng cược 1 bucket nhân cao / 1 hướng side bet) và **lặp qua nhiều kỳ** (160 kỳ/ngày — lỗ nhỏ lặp dày). `companyTake` âm là bình thường từng kỳ, bất thường khi âm sâu/liên tục.

### 2.4. Ma trận rủi ro vận hành Bingo 18

| Rủi ro | Cơ chế | Mức độ | Kiểm soát hiện có |
|---|---|---|---|
| Tiền dồn 1 bucket nhân cao | Nhiều player/1 player đặt lớn vào `sum=3/18` hoặc `tripleMatch specific N` (×120) — trúng thì kỳ đó âm sâu | Cao | Không có gì (top-combos chỉ đếm side bet, không có ngưỡng) |
| Kỳ 6 phút, đóng bán trước 30s | Staff gần như không kịp phát hiện bất thường thủ công | Cao | Polling 15s nhưng query nặng |
| Side bet lệch 1 hướng | Tiền đổ 1 phía big/small/draw — LƯU Ý: xác suất KHÔNG đối xứng (small 49,07% / draw 25% / big 25,93%) — skew về `small` nguy hiểm hơn cùng % skew về `big` | Trung bình | Chưa có view tách hướng + ngưỡng |
| Cược lớn 1 entry | betCount 10 × nhiều board; max win/board = 12tr (betCount 10 × 1,2tr) | Trung bình | Không có alert |
| `companyTake` âm kéo dài | Giải cố định, 160 kỳ/ngày — chuỗi kỳ âm là tín hiệu prize table sai/bị khai thác | Trung bình | Chỉ thấy sau settle từng kỳ, không có baseline |
| Vé multi-draw 20 kỳ | Exposure trải 20 kỳ tương lai vô hình | Thấp hơn Keno (trần thưởng nhỏ) | Chưa có view (giữ P2 như Keno #11) |

## 3. Thiết kế database

### 3.1. Nguyên tắc bất biến — GIỮ NGUYÊN Keno §3.1

(1) Place-bet không thêm write đồng bộ; (2) dashboard không aggregate trực tiếp entries; (3) stats là derived data — số tài chính chính thức vẫn từ settle pipeline (`DrawDoc.financial`).

### 3.2. Collection `bingo18_draw_betting_stats` — 1 document / draw

Extends `DrawBettingStatsBase` (`@megawin/game-core/types` — đã có từ Keno p0-02: `drawId`, `updatedAt`, `lastEntryId`, `final`, `totals`, `byTenant`, `topAccounts`). Phần đặc thù Bingo 18:

```ts
// packages/game-bingo18/src/entities/betting-stats.ts
/** Thống kê 1 bucket cược (1 lựa chọn cụ thể của 1 kiểu chơi). */
interface Bingo18BucketStat { amount: number; sets: number; entries: number }
// amount = Σ(betCount × unitPrice); sets = Σ betCount; entries = số entry chứa bucket

interface Bingo18DrawBettingStatsDoc extends DrawBettingStatsBase {
  _id: unknown;

  // ── byPlayType: FULL-BUCKET, không phải chỉ tổng theo kiểu chơi ──
  // 38 bucket cố định — vừa là "phân bổ kiểu chơi" (thay aggregatePlayTypeDistribution
  // + aggregateTopCombos + aggregateDiceFrequency), vừa là INPUT tính exposure chính
  // xác per-outcome (3.4). Key số dùng string "1".."6", "3".."18" (Mongo key luôn string;
  // number là integer 1-6 KHÔNG zero-padded — bingo18-game-rules #17).
  byPlayType: {
    singleNum:  Record<string, Bingo18BucketStat>;            // "1".."6"
    doubleMatch: Record<string, Bingo18BucketStat>;           // "1".."6"
    tripleMatch: {
      specific: Record<string, Bingo18BucketStat>;            // "1".."6"
      any: Bingo18BucketStat;
    };
    sumTotal: Record<string, Bingo18BucketStat>;              // "3".."18"
    bigSmallDraw: { big: Bingo18BucketStat; draw: Bingo18BucketStat; small: Bingo18BucketStat };
  };

  // ── Top entry nguy hiểm nhất — potentialWin per-entry (xem 3.4b) ──
  topPotential: Bingo18TopPotential[];  // shape y hệ KenoTopPotential (entryId/accountId/username/amount/potentialWin)
}
```

- **KHÔNG có `numberFreq` riêng** — heatmap 6 mặt xúc xắc dựng thẳng từ `byPlayType.singleNum` + `doubleMatch` + `tripleMatch.specific` (3 record cùng key "1".."6") ở tầng đọc. Không lưu trùng.
- **KHÔNG có `topCombos`** — 38 bucket là bảng phân bổ ĐẦY ĐỦ (không cần top-K vì không gian đã đóng và nhỏ). "Bộ phổ biến nhất" = sort bucket theo amount ở tầng đọc.
- **KHÔNG có `exposure` lưu sẵn trong doc** — exposure là **hàm thuần của `byPlayType`** (3.4), tính lúc build snapshot response. Bucket là dữ liệu RAW tuyến tính (cộng delta đúng), biến đổi phi tuyến (max over 216) áp ở tầng đọc — đúng bài học Keno Risk #4.
- Kích thước doc: 38 bucket × ~60 bytes + topAccounts/topPotential (K=50) ≈ **10–15KB** — nhỏ hơn Keno. ~160 draw/ngày → ~58k docs/năm, không đáng kể. Draw settled → doc bất biến.
- Index: `{ drawId: 1 } unique` trong `BINGO18_INDEXES`, thêm collection vào `Bingo18Collections`.
- Convention entity y hệ Keno: `_id: unknown`, `Bingo18DrawBettingStatsEntity extends Omit<Doc,"_id">`, embedded là named interface, file `entities/betting-stats.ts` re-export base từ game-core qua barrel (bài học overview #7).

### 3.3. Mini-batch worker — copy nguyên pattern Keno §3.3, khác biệt tối thiểu

- Handler mới `apps/worker-bingo18/src/handlers/stats/stats-sync.ts` + `src/functions/stats.yml` (EventBridge cron 1 phút, `timeout: 120` = lock TTL — copy `apps/worker-keno/src/functions/stats.yml`). Use-case `SyncBettingStatsUseCase extends LockedWorkerUseCase` trong `game-bingo18-application/use-cases/operations/`. Tiền lệ trong chính worker-bingo18: `handlers/feed/feed-sync.ts`.
- Intra-invocation loop ~55s + `sleep(tickSeconds)` (default 10s, config `ops.stats.tickSeconds`) — kỳ 6 phút thì tick 10s cho ~36 lần cập nhật/kỳ, đủ mượt.
- **Checklist rủi ro Keno §11 áp NGUYÊN VẸN:** (1) watermark **per-draw** `lastEntryId`; (2) index MỚI `{ drawId: 1, _id: 1 }` (`idx_draw_id`) trên `bingo18_ticket_entries` cho insert-stream + recompute cursor; (3) recompute safety-net mọi status hậu-chốt chưa `final` (SalesClosed/Published/Settling/Voiding), cursor-based không skip/limit; (4) **loại void tại nguồn đọc** — filter `status: { $ne: void }` ngay trong `getEntriesForStatsAfter` (chốt 30/07, KHÔNG "cộng rồi trừ bù"); (5) conditional write chỉ khi `applied > 0` (giữ ETag/304); (6) top-K merge baseline từ doc.
- **Lưu ý riêng Bingo 18:** nhiều draw active đồng thời (multi-draw 20 kỳ, kỳ 6 phút) → vòng lặp per-draw của worker phải giới hạn "draw đang mở bán + hậu-chốt chưa final" qua `getUnfinishedDraws()` sẵn có, không quét draw Scheduled xa.
- Accumulator (`Bingo18DrawStatsAccumulator`) đọc `entry.entrySummary.boards[]` unified, switch `playType` (đúng cách `settle-entries.ts` phân nhánh, dùng `BINGO18_BASIC_PLAY_TYPE_SET`): mỗi board cộng vào đúng 1 bucket (`singleNum[number]`, `doubleMatch[number]`, `tripleMatch.specific[number]` / `.any`, `sumTotal[sum]`, `bigSmallDraw[bet]`) với `amount = betCount × unitPrice`, `sets = betCount`.

### 3.4. Exposure — TÍNH CHÍNH XÁC per-outcome (khác Keno căn bản)

Keno phải dùng 3 proxy vì không gian outcome thiên văn. Bingo 18 chỉ có **216 outcome** → tính đúng:

```
payout(a,b,c) = Σ_{n=1..6} [ singleNum[n].sets × singleNumPrize(count_n(a,b,c))          ]
              + Σ_{n=1..6} [ doubleMatch[n].sets × (count_n ≥ 2 ? doubleMatchPrize : 0)   ]
              + Σ_{n=1..6} [ tripleSpecific[n].sets × (a=b=c=n ? specificPrize : 0)       ]
              +             tripleAny.sets × (a=b=c ? anyPrize : 0)
              +             sumTotal[a+b+c].sets × sumTotalPrize(a+b+c)
              +             bigSmallDraw[dir(a+b+c)].sets × bigSmallPrize(dir)
```

Hàm thuần `computeBingo18Exposure(byPlayType, prizes)` (đặt tại `packages/game-bingo18/src/rules/`, cạnh `odds.ts`) chạy vòng 216 outcome (6³ — chi phí ≈ 0, cùng kỹ thuật `computeSumWays()` sẵn có trong `odds.ts`), trả:

| Chỉ số | Định nghĩa | Trả lời câu hỏi |
|---|---|---|
| `worstCase` | `max_{216} payout` + outcome đạt max (`numbers`, `sum`) | Kỳ này TỆ NHẤT trả bao nhiêu, khi quay ra gì? |
| `expectedPayout` | `Σ payout(o) / 216` (mọi outcome đồng xác suất 1/216) | Kỳ này KỲ VỌNG trả bao nhiêu (so revenue = margin dự kiến) |
| `bestCase` | `min payout` | Biên dưới |
| `topOutcomes` | Top 5 outcome trả nặng nhất | Staff thấy cụm outcome nguy hiểm (thường là bộ ba trùng / tổng 3/18) |

- Prize table đọc từ `GlobalConfigDoc` (worker vốn đã đọc config) — KHÔNG hardcode (bingo18-game-rules #8).
- Vì mọi outcome đồng xác suất, `expectedPayout` là chính xác tuyệt đối, không phải ước lượng — Bingo 18 cho staff cả 2 con số worst-case LẪN expected, điều Keno không làm được.
- **Không vi phạm bài học "per-number liability" của Keno (§3.7):** ở đây liability tính theo **OUTCOME trọn vẹn** (a,b,c), không gán worst-case của board vào từng số — không double-count. Heatmap ô xúc xắc vẫn CHỈ hiển thị Dòng tiền + số lượt theo guideline (§4).

**(b) `topPotential` per-entry:** vì entry chỉ có ≤ `maxBasicBoardsPerTicket` board, worker tính **chính xác** `potentialWin(entry) = max_{216} payout_entry(o)` (không dùng Σ max per board như Keno — Σ max cộng cả các board loại trừ nhau, vd sumTotal 3 và 18 không thể cùng trúng). Chi phí 216 × boards/entry ≈ vài nghìn phép tính/entry — chấp nhận được trong worker async.

### 3.5. Collection `bingo18_ops_alerts` — copy khung Keno §3.5, đổi bộ alert type

`Bingo18OpsAlertDoc extends OpsAlertBase` (game-core). Bộ type đặc thù (const-as-const §5.3):

```ts
export const Bingo18OpsAlertType = {
  LargeBet: "large_bet",                    // entry.amount ≥ ops.alerts.largeBetAmount
  ExposureThreshold: "exposure_threshold",  // worstCase ≥ ngưỡng (xem 3.6 — KHÔNG có cap để làm mẫu số)
  SidebetSkew: "sidebet_skew",              // 1 hướng bigSmallDraw ≥ sidebetSkewPct
  BucketConcentration: "bucket_concentration", // tiền dồn 1 bucket nhân cao (sum 3/18, triple specific)
  RevenueAnomaly: "revenue_anomaly",        // để dành (như Keno)
  SettleStuck: "settle_stuck",              // để dành (như Keno)
} as const;
```

- **BỎ `cap_sets_near`** (không có cap) và **đổi `combo_concentration` → `bucket_concentration`**: bản chất rủi ro là tiền dồn vào bucket nhân cao, KHÔNG phải "N account cùng bộ số hiếm". Đếm account distinct trên bucket phổ biến không có giá trị tín hiệu (bucket chỉ có 38 cái, ai cũng trùng).
- Evaluator chạy trong stats worker (data sẵn trong memory, chi phí ≈ 0), dedupeKey unique cùng drawId, upsert idempotent — y hệ Keno. Indexes: `{status:1, createdAt:-1}`, `{drawId:1, dedupeKey:1} unique`.
- Alerts panel format payload theo type (guideline §4) — formatter riêng cho 4 type P0, `large_bet` kèm list entry + link outstanding.

### 3.6. `GlobalConfigDoc.ops` + tab "Vận hành" trang config — copy khung Keno §3.9, đổi ngưỡng

Thêm `ops: OpsConfig` vào `packages/game-bingo18/src/entities/global-config.ts` (hiện CHƯA có — Keno đã có tiền lệ tại `game-keno/entities/types.ts` `OpsConfig`/`OpsAlertsConfig`):

```ts
export interface OpsAlertsConfig {
  /** Ngưỡng 1 entry bị coi là cược lớn (VND). Default đề xuất: 1.000.000 (xem §7 Q1). */
  largeBetAmount: number;
  /**
   * Ngưỡng exposure theo % DOANH THU kỳ: cảnh báo khi worstCase ≥ pct × revenue.
   * Bingo 18 KHÔNG có cap kỳ làm mẫu số như Keno → dùng revenue làm mẫu số (xem §7 Q2).
   * Default đề xuất: 300 (%).
   */
  exposureWarnRevenuePct: number;
  /** Sàn tuyệt đối (VND): worstCase dưới mức này KHÔNG cảnh báo dù vượt %, tránh noise kỳ vắng. Default đề xuất: 50.000.000. */
  exposureWarnMinAmount: number;
  /** % lệch 1 hướng bigSmallDraw (theo amount) kích hoạt sidebet_skew. Default 70. */
  sidebetSkewPct: number;
  /** Ngưỡng tiền (VND) dồn vào 1 bucket nhân cao (sumTotal 3/18, tripleMatch specific) → bucket_concentration. Default đề xuất: 5.000.000. */
  bucketConcentrationAmount: number;
  /** Bật/tắt từng loại alert. Record<Bingo18OpsAlertType, boolean>. */
  enabled: Record<Bingo18OpsAlertType, boolean>;
}
export interface OpsConfig {
  alerts: OpsAlertsConfig;
  /**
   * Cấu hình nhịp worker + top-K — CHỈ các field Bingo 18 THẬT SỰ dùng (chốt 30/07/2026:
   * "không cấu hình thừa default"). KHÔNG dùng nguyên `OpsStatsConfig` (có `topCombosK`
   * Bingo 18 không dùng) → tách game-core: `OpsStatsConfigBase { tickSeconds;
   * topPotentialK; topAccountsK }` + `OpsStatsConfig extends OpsStatsConfigBase
   * { topCombosK }` (Keno giữ nguyên import `OpsStatsConfig`, KHÔNG đổi hành vi).
   * Bingo 18 dùng `OpsStatsConfigBase`.
   */
  stats: OpsStatsConfigBase;
}
```

- Đường ghi: `UpdateGameConfigInput` thêm `ops?` — copy pattern Keno p0-05 (merge/audit/version). Zod ở route (`api/bingo18/config/_lib/schema.ts`), **KHÔNG viết lại `validateInput` trong use-case** (rule §7 — bài học đã xoá ở cả 7 game).
- **Player DTO an toàn:** `GetGameConfigPlayerUseCase` của Bingo 18 build DTO allowlist tường minh (đã kiểm tra `get-game-config-player.ts` dòng 31–56) → thêm `ops` vào doc không tự lộ. Giữ kỷ luật này.
- Tab "Vận hành" (`?tab=ops`) trên trang config bingo18 (`config/game/page.tsx` — đã có pattern tab): follow `ops-config-page-layout.guideline.md` — 2 cột (trái ngưỡng + AlertToggleRow giàu thông tin, phải nhịp worker + Top-K), tooltip 4 phần MỌI field, `ALERT_META` sort severity, `SEVERITY_STYLES`. Pattern tham chiếu: `apps/backoffice/src/app/(main)/games/keno/config/game/_lib/ops-section.tsx`.

### 3.7. Sửa index hiện có

- Đổi 3 index `drawDate` → `financialDate` trên `bingo18_ticket_entries` (bug §2.2.1) — copy đúng plan Keno p0-01 (key + name + purpose; migration Atlas do DBA).
- Thêm `{ drawId: 1, _id: 1 }` (`idx_draw_id`) phục vụ watermark per-draw + recompute cursor (Keno Risk #2).
- KHÔNG thêm index nào khác trên entries (không có multikey nào cần — board của Bingo 18 không có mảng numbers).

## 4. Thiết kế UI (backoffice) — follow guideline Keno, khác biệt theo luật chơi

Toàn bộ follow `operations-page-layout.guideline.md` (2 tab, alerts đầu tab Giám sát, 2 timer, ETag/304, poll khớp `tickSeconds`, tắt poll khi settled, `PlayerName` username nhất quán, thresholds từ snapshot response — KHÔNG hardcode client). Chỉ ghi phần KHÁC:

### 4.1. Snapshot endpoint — 7 timer → 2 timer

`GET /api/bingo18/operations/snapshot?drawId=` trả `{ drawStatus, stats: <stats doc>, exposure: <computeBingo18Exposure output>, alertCounts, thresholds, tickSeconds }`. Server: 1 findOne stats + 1 count alerts + tính exposure thuần in-memory. Timer 2 = live-feed (chỉ khi tab Phân tích mở). Route cũ + use-case + repo aggregation on-demand **xoá theo checklist dead-code Keno §9.3** (5 use-case ops + 5 route + 4 aggregation method + query keys — grep toàn repo trước khi đóng plan).

### 4.2. Tab Giám sát

- **Exposure card** trong KPI strip — nội dung KHÁC Keno vì có số chính xác: `worstCase` (đỏ) + outcome đạt max (3 dice badge + tổng) · `expectedPayout` so revenue (margin dự kiến kỳ) · gauge `worstCase / revenue` tô theo `exposureWarnRevenuePct`. Không có capSets.
- KPI strip giữ 6 KPI hiện có (revenue/entries/boards/sideBets/players/commission) đọc từ `stats.totals` + `byPlayType`.
- Alerts panel đầu tab — formatter 4 type P0 (`large_bet`, `exposure_threshold`, `sidebet_skew`, `bucket_concentration`).

### 4.3. Tab Phân tích cược

- **Bảng xúc xắc 6 ô** (thay heatmap 80 số): mỗi ô = 1 mặt 1–6, hiển thị **Dòng tiền + số lượt** (tổng singleNum + doubleMatch + tripleMatch.specific của số đó), heat nền theo dòng tiền — đúng guideline §3.2/3.3 (KHÔNG per-number liability). 6 ô KHÔNG cần chọn số/action menu/dialog tra cứu (không có combo lookup — không gian bucket đã hiển thị đầy đủ trên trang). Đây là điểm ĐƠN GIẢN HOÁ có chủ đích so với Keno §4.6 (xem §7 Q4).
- **Phân bổ sumTotal 16 cột** (bar 3→18): amount mỗi tổng + đánh dấu bucket nhân cao (3/18 viền đỏ nhạt); vượt `bucketConcentrationAmount` → amber. Đây là panel thay thế "Bộ số phổ biến" của Keno — concentration risk của Bingo 18 nằm ở đây.
- **Side bet card gộp** (guideline §5): 1 card `bigSmallDraw` 3 hướng (small/draw/big) — split bar 3 đoạn + % + badge lệch theo `sidebetSkewPct`. LƯU Ý nhãn ghi rõ xác suất nền không đối xứng (49/25/26%) để staff đọc skew đúng.
- **Cụm rủi ro**: [Top người chơi | Top phải trả tiềm năng] — 2 cột (Bingo 18 không có panel "Bộ số phổ biến" dạng combo; phân bổ sumTotal đã đứng riêng). `topPotential` per-entry chính xác (max over 216).
- **Live feed 2 cột lệch**: Cơ bản (singleNum/doubleMatch/tripleMatch — cột rộng) | Bổ sung (sumTotal/bigSmallDraw — cột hẹp), cuộn độc lập, cược lớn tô đỏ — guideline §5.
- **Đại lý card hẹp thích ứng** (≤3 card giàu thông tin) — giữ nguyên guideline.

### 4.4. Draw selector

Sửa sort active `drawId` ASC (bug §2.2.3) — copy comment + `sortBy` từ `game-keno-application/use-cases/operations/get-draw-selector.ts` dòng 35–41.

## 5. Đề xuất đã re-review — verdict từng hạng mục (đối chiếu bảng Keno §5)

| # | Hạng mục (map từ Keno) | Verdict | Lý do |
|---|---|---|---|
| 1 | Sửa index `drawDate`→`financialDate` (≈ p0-01) | ✅ **KEEP — P0** | Bug thật y hệt Keno, 1 file + migration. |
| 2 | `bingo18_draw_betting_stats` + worker (≈ p0-03) | ✅ **KEEP — P0** | Nền móng. Shape full-bucket 38 bucket (§3.2) thay cho byPlayType+numberFreq+topCombos của Keno. |
| 3 | Exposure panel (≈ Keno #3) | ✅ **KEEP — P0, NÂNG CẤP** | Bingo 18 tính CHÍNH XÁC per-outcome (216) — worst-case + expected + top outcomes, giá trị cao hơn proxy Keno với chi phí thấp hơn. |
| 4 | Cảnh báo cược lớn (≈ Keno #4) | ✅ **KEEP — P0** | 1 rule trong alert framework, ngưỡng riêng Bingo 18 (§7 Q1). |
| 5 | Tách hướng side bet (≈ Keno #5) | ✅ **KEEP — P0** | `bigSmallDraw` 3 hướng nằm sẵn trong bucket; card gộp + skew. |
| 6 | Alert framework (≈ p0-06) | ✅ **KEEP — P0** | 4 type P0: large_bet / exposure_threshold / sidebet_skew / **bucket_concentration**. Bỏ cap_sets_near. |
| 7 | Ops config tab (≈ p0-05) | ✅ **KEEP — P0** | `ops` section mới trong GlobalConfigDoc + tab "Vận hành" theo guideline. |
| 8 | Snapshot endpoint + 2 tab + dead-code cleanup (≈ p0-07) | ✅ **KEEP — P0** | 7 timer → 2 timer; xoá 5 route/use-case/aggregation cũ theo §9.3 Keno. |
| 9 | Combo stats collection (≈ p0-04) | ❌ **CUT** | Không có payout cap + không gian bucket 38 → combo-stats vô nghĩa; bucket đã nằm trọn trong stats doc. |
| 10 | Minh bạch combo cho player (≈ p1-01) | ❌ **CUT** | Không có cap chia đều → không có gì cần player kiểm chứng. |
| 11 | Tra cứu combo staff (dialog chọn số) | ❌ **CUT** | 38 bucket hiển thị đầy đủ trên trang (bảng xúc xắc + bar sumTotal + card side bet) — không còn gì để "tra cứu". |
| 12 | Baseline so sánh kỳ (Keno #6) | ✅ **KEEP — P1** | Giá trị CAO hơn Keno: 160 kỳ/ngày → chuỗi stats doc dày, phát hiện `companyTake` âm kéo dài / revenue anomaly theo khung giờ. |
| 13 | Player concentration (Keno #7) | ✅ **KEEP — P1** | `topAccounts` có sẵn trong base P0; P1 thêm rule alert. |
| 14 | Settle progress monitor | ⏸️ **DEFER** | Giữ quyết định Keno (DBA giám sát qua SFN); `settle_stuck` để dành trong schema. |
| 15 | Exposure multi-draw (Keno #11) | ✅ **KEEP — P2** | Vé 20 kỳ nhưng trần thưởng nhỏ — ưu tiên thấp. |
| 16 | Drill-down heatmap → entries (Keno #9) | ⬇️ **P2** | On-demand theo drawId khi điều tra, index sẵn có. |

**Tổng bề mặt UI mới P0:** 1 exposure card (worst/expected/top outcomes), 1 alert badge+panel, bảng xúc xắc 6 ô (tiền + lượt), bar phân bổ sumTotal 16 cột, side bet card 3 hướng, 2 bảng top (người chơi / phải trả), tab config "Vận hành". Nhỏ hơn Keno (không combo lookup/dialog).

## 6. Kỷ luật triển khai

Áp dụng NGUYÊN VẸN Keno §9 (bảng rule/skill theo tầng, "Pattern tham chiếu" bắt buộc mỗi plan, checklist tìm-trước-khi-tạo, dead-code cleanup §9.3) + toàn bộ checklist "Review sau triển khai" trong `00-overview.md` Keno (10 rủi ro worker + mapper tách file + import đầu file + username field + AlertToggleRow…). Pattern tham chiếu chính:

| Phần | File mẫu (Keno — đã chạy production) |
|---|---|
| Entity stats/alert | `packages/game-keno/src/entities/betting-stats.ts`, `ops-alert.ts` |
| Repo + mapper | `game-keno-application/src/infras/repos/betting-stats-repo.ts`, `ops-alert-repo.ts`, `infras/mappers/*` |
| Worker | `game-keno-application/src/use-cases/operations/sync-betting-stats.ts`, `stats-accumulator.ts`, `evaluate-alerts.ts`; handler `apps/worker-keno/src/handlers/stats/stats-sync.ts` + `functions/stats.yml` |
| Exposure rule thuần | `packages/game-keno/src/rules/max-prize.ts` (vai trò tương đương `computeBingo18Exposure` — nhưng logic mới 216-outcome, đặt cạnh `odds.ts` tái dùng kỹ thuật `computeSumWays`) |
| Snapshot + alerts API | `apps/backoffice/src/app/api/keno/operations/snapshot/route.ts`, `alerts/*` |
| UI 2 tab + panels | `apps/backoffice/src/app/(main)/games/keno/operations/_lib/*` |
| Config tab ops | `apps/backoffice/src/app/(main)/games/keno/config/game/_lib/ops-section.tsx` |

Riêng Bingo 18: giữ nguyên `dice-histogram.tsx` hiện có làm cơ sở bảng 6 ô (đổi nguồn data sang snapshot slice); số 1–6 là integer KHÔNG zero-padded; `Bingo18BucketStat`/`Bingo18OpsAlertType` const-as-const, không string trần; mọi shape account dùng field `username`.

## 7. Câu hỏi mở — ĐÃ CHỐT TOÀN BỘ (user quyết 30/07/2026)

1. ~~Q1 — Ngưỡng `largeBetAmount` default?~~ → **Chốt: 1.000.000đ** (staff chỉnh qua config).
2. ~~Q2 — Mẫu số cảnh báo exposure?~~ → **Chốt: phương án kép** — `exposureWarnRevenuePct` (300% revenue kỳ) + sàn `exposureWarnMinAmount` (50tr) chống noise kỳ vắng.
3. ~~Q3 — `OpsStatsConfig` có field `topCombosK` thừa?~~ → **Chốt: KHÔNG giữ field thừa** — tách game-core thành `OpsStatsConfigBase` (tickSeconds/topPotentialK/topAccountsK) + `OpsStatsConfig extends Base { topCombosK }`; Bingo 18 dùng `OpsStatsConfigBase`, thiết kế đúng theo nhu cầu thật của game (§3.6). Keno không đổi hành vi.
4. ~~Q4 — Bỏ chọn số + dialog tra cứu trên bảng 6 ô?~~ → **Chốt: bảng 6 ô THUẦN hiển thị** (lệch guideline Keno §3 có chủ đích — 38 bucket đã hiển thị trọn trên trang).
5. ~~Q5 — `bucket_concentration` đo bằng gì?~~ → **Chốt: tiền tuyệt đối** (default 5tr/bucket nhân cao).

## 8. Plans phái sinh — ĐÃ TẠO (30/07/2026)

Thư mục `.cursor/plans/bingo18-ops-risk-control/` đã tạo theo quy ước `.cursor/plans/README.md`. Trạng thái chi tiết ở `00-overview.md` của thư mục đó (kèm khung "Review sau triển khai" bắt buộc cho từng plan).

```
.cursor/plans/bingo18-ops-risk-control/
├── 00-overview.md                       # master: bảng trạng thái + thứ tự + nguyên tắc + khung review bắt buộc
├── p0-01-entry-indexes-fix.plan.md      # 3 index drawDate→financialDate + idx_draw_id
├── p0-02-draw-betting-stats.plan.md     # entity 38 bucket + exposure rule 216 + repo/mapper/accumulator + worker stats-sync
├── p0-03-ops-config.plan.md             # tách OpsStatsConfigBase (game-core) + GlobalConfigDoc.ops + tab "Vận hành"
├── p0-04-ops-alerts.plan.md             # bingo18_ops_alerts + evaluator 4 rule + list/ack API
└── p0-05-operations-page.plan.md        # snapshot (7→2 timer) + 2 tab + exposure card + fix draw selector + dead-code cleanup
```

(Ít hơn Keno 3 plan: không có combo-stats; không có combo-transparency. Riêng p0-03 chứa 1 thay đổi nhỏ ở game-core: tách `OpsStatsConfigBase` khỏi `OpsStatsConfig` — Keno chỉ đổi nguồn extend, không đổi hành vi, verify `check-types` cả `game-keno*`.)



