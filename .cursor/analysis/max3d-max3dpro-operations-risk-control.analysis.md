# Max 3D & Max 3D Pro — Operations & Risk Control (Analysis)

> **Status:** `approved (P0)` · **Ngày:** 30/07/2026 — user đã chốt toàn bộ câu hỏi mở §7 (30/07/2026). Thứ tự triển khai đã chốt: **Bingo18 trước → Max3D → Max3D Pro**.
> **Nguồn tham chiếu:**
> - Analysis mẫu: `.cursor/analysis/keno-operations-risk-control.analysis.md` (`approved (P0)`, đã triển khai) + `.cursor/analysis/bingo18-operations-risk-control.analysis.md` (`discussing`) — doc này chỉ ghi phần GIỐNG (tham chiếu) và phần KHÁC (chi tiết).
> - Guideline bắt buộc: `operations-page-layout.guideline.md` + `ops-config-page-layout.guideline.md` (thư mục `keno-ops-risk-control`).
> - Checklist rủi ro worker: analysis Keno §11 + `00-overview.md` Keno — áp dụng NGUYÊN VẸN.
> - Source đã đọc (30/07/2026): `packages/game-max3d{,pro}` (entities/entry.ts, indexes, rules/defaults.ts, rules mdc `max3d-game-rules.mdc`/`max3dpro-game-rules.mdc`), `packages/game-max3d{,pro}-application` (repos/entry-repo.ts aggregations, use-cases/operations/*), `apps/worker-max3d{,pro}/src/functions`, `apps/backoffice/src/app/(main)/games/max3d{,pro}/operations/_lib/use-operations.ts`, `apps/backoffice/src/app/api/max3d{,pro}/operations/`.
> - **1 doc cho CẢ 2 game** (chủ đích): pipeline/entities/aggregation của 2 game giống nhau ~90%; phần khác (play modes, hạng giải, matching) tách bảng riêng §2.4 — tránh 2 doc lệch nhau theo thời gian.
> - **Tên class đã đổi (03/08/2026)** — `LockedWorkerUseCase` → `SingleRunWorker`,
>   `BusinessLockCoordinator` → `DistributedMutex`. Xem
>   `.cursor/plans/worker-core-usecase-restructure/00-overview.md`. Doc này viết trước khi đổi tên.

## 1. Bối cảnh & mục tiêu

Nhân rộng hệ thống alert-driven ops sang Max 3D (`/games/max3d/operations`) và Max 3D Pro (`/games/max3dpro/operations`). Bối cảnh vận hành KHÁC HẲN Keno/Bingo18:

- **Tần suất THẤP: 3 kỳ/tuần** (Max 3D: T2/T4/T6 18h; Pro: T3/T5/T7 18h — không trùng ngày), 1 kỳ/ngày, **cửa sổ bán kéo dài NHIỀU NGÀY** (kỳ kế mở ngay sau kỳ trước), đóng bán trước 5 phút.
- → Staff có NHIỀU thời gian quan sát mỗi kỳ, nhưng **tiền tích luỹ trong kỳ lớn hơn nhiều** (nhiều ngày bán) và **liability KHÔNG CÓ TRẦN** (xem §2.3) — exposure view là giá trị số 1, còn quan trọng hơn Keno.

## 2. Hiện trạng (đọc trực tiếp source, 30/07/2026)

### 2.1. Trang ops hiện tại — 7 timer on-demand aggregation (cả 2 game, giống hệt nhau)

`use-operations.ts` mỗi game chạy **7 timer** (selector 30s, summary 30s, tenants 30s, triplet-frequency 60s, playtype 60s, live 30s, top-combos 60s) → 7 route → 7 aggregation on-demand trong `entry-repo.ts` (`aggregateOpsSummary` / `aggregateTenantBreakdown` / `aggregateTripletFrequency` ($unwind boards → $unwind triplets) / `aggregatePlayTypeDistribution` / `aggregateTopSingleCombos` / `aggregateTopPlusCombos` / `getLatestEntriesByDrawId`). Cùng anti-pattern Keno cũ. Kỳ bán nhiều ngày → entries tích luỹ lớn → unwind 2 tầng lặp mỗi phút càng đắt về cuối kỳ.

### 2.2. Phát hiện kỹ thuật

1. **Index lệch field (BUG — y hệt Keno/Bingo18):** cả `MAX3D_INDEXES` lẫn `MAX3DPRO_INDEXES` khai 3 index `drawDate` trên `*_ticket_entries` (`idx_tenant_account_drawDate`, `idx_tenant_drawDate_status`, `idx_drawDate_status`) nhưng `TicketEntryDoc` cả 2 game **chỉ có `financialDate`** (max3d entry.ts dòng 251–252). Lưu ý: 2 game này ĐÃ có thêm `idx_tenant_financialDate_status` đúng — nhưng 3 index sai vẫn là index chết chiếm write amplification + thiếu `{financialDate, status}` global. Sửa như Keno p0-01.
2. **Draw selector ĐÃ sửa sort active ASC** ở cả 2 game (`get-draw-selector.ts` dòng 34–39 có comment re-sort) — KHÔNG cần fix lại (khác Bingo18).
3. **Không có exposure/alert/stats collection** — như Bingo18.
4. Worker cả 2 game có tiền lệ `feed-sync` (LockedWorkerUseCase) + functions yml — thêm `stats.yml` cùng pattern.

### 2.3. Luật chơi → cấu trúc rủi ro (đối chiếu rules mdc + `defaults.ts` + `prize-tiers.ts` + entry entities)

Chung 2 game: triplet `"000"–"999"` (string zero-padded, `/^\d{3}$/`); kết quả 20 bộ ba/kỳ (2 ĐB + 4 Nhất + 6 Nhì + 8 Ba — có thể TRÙNG nhau giữa các slot); **GỘP GIẢI** (các hạng không loại trừ, lĩnh tổng); board A–D (max 4); betCount 1–10; tiền cược = `lineCount × betCount × unitPrice`; multi-draw tối đa 6 kỳ; **KHÔNG Jackpot, KHÔNG payout cap** (đã grep xác nhận không có `payoutCap|maxPerDraw` trong cả 2 package); `profit = revenue − fixedPrizes − commission`, có thể âm.

**Nhân thưởng cao nhất (per unit 10.000đ) — điểm rủi ro cốt lõi:**

| Game · mode | Giải | Giải/unit | Nhân | Xác suất |
|---|---|---|---|---|
| Max 3D basic straight | ĐB | 1.000.000 | ×100 | 2/1.000 |
| Max 3D basic combo3/combo6 | ĐB | 340.000 / 170.000 | ×34 / ×17 | per hoán vị |
| **Max 3D plus** | **ĐB (2 bộ trùng 2 slot ĐB)** | **1.000.000.000** | **×100.000** | 4/1.000.000 |
| **Max 3D Pro** | **ĐB (ordered đúng thứ tự)** | **2.000.000.000** | **×200.000** | 1/1.000.000 |
| Max 3D Pro | Phụ ĐB (ordered ngược) | 400.000.000 | ×40.000 | 1/1.000.000 |
| Max 3D Pro | Duplicate pair trúng ĐB | special + specialSub = 2,4 tỷ | ×240.000 | — |

**Kết luận rủi ro quyết định thiết kế:**

1. **Nhân ×100.000–×240.000 NGANG/HƠN Keno pick10 (×200.000) nhưng KHÔNG CÓ CAP kỳ** (Keno cap 10 tỷ/kỳ cho bậc 8/9/10). Nhiều người (hoặc syndicate) dồn cùng 1 cặp → nếu cặp đó ra ĐB, hệ thống trả **không giới hạn**. Đây là rủi ro lớn nhất toàn hệ thống 7 game — exposure + pair concentration là chức năng đáng giá nhất.
2. **Không gian outcome KHÔNG enumerate được** (1000²⁰ kết quả 20 slot) → không làm được exact per-outcome như Bingo18 (216). Nhưng **liability CÓ ĐIỀU KIỆN tính chính xác được theo từng slot**: "nếu triplet t được quay vào hạng T thì trả thêm bao nhiêu" (basic — additive theo slot) và "nếu cặp (t1,t2) là 2 slot ĐB thì trả bao nhiêu" (plus/pro) — xem §3.4.
3. **Combo/syndicate detection kiểu Keno CÓ ý nghĩa trở lại** (khác Bingo18): không gian pair 1.000.000 (pro ordered) / triplet 1.000 — cặp bị nhiều account cùng cược là tín hiệu thật. Giữ `topCombos` + `combo_concentration` (đếm account distinct).
4. **KHÔNG có side bet** ở cả 2 game → bỏ `sidebet_skew` + side-bet card.
5. Kỳ bán nhiều ngày → baseline so sánh "cùng khung giờ" kiểu Keno không áp dụng; baseline theo "cùng thứ trong tuần, N kỳ gần nhất" (P1).

### 2.4. Bảng khác biệt Max 3D vs Max 3D Pro (phần PHẢI khác nhau khi implement)

| | Max 3D | Max 3D Pro |
|---|---|---|
| Play modes | `basic` (straight/combo3/combo6 — 1 triplet) + `plus` (straight — cặp 2 triplet, KHÔNG ordered) | `multiNumber` (3–20 triplet → P(n,2) ordered pairs) + `multiDigit` (perms(front)×perms(back) ordered pairs) — LUÔN là cặp |
| Hạng giải | Basic 4 hạng (`BasicPrizeTier`) + Plus 7 hạng (`PlusPrizeTier`) — 2 enum riêng | 8 hạng, 1 enum `PrizeTier` (có `specialSub` — chỉ Pro có) |
| ĐB matching | Plus: 2 bộ ∈ 2 slot ĐB (bipartite, không thứ tự) | Ordered: đúng thứ tự = ĐB 2 tỷ, ngược = phụ ĐB 400tr |
| Duplicate ×2 | Nhất→Sáu ×2, ĐB KHÔNG ×2 | Nhất→Sáu ×2, ĐB/phụ ĐB = special + specialSub |
| EntryBoardSnapshot | `{playMode, playType, triplets, lineCount, betCount}` | + `frontDigits?/backDigits?` (multiDigit) |
| Pair key trong stats | unordered (normalize sort — tiền lệ `aggregateTopPlusCombos` dùng `$sortArray`) | **ordered** (thứ tự là bản chất giải ĐB/phụ ĐB) |
| Lịch quay | T2/T4/T6 18h | T3/T5/T7 18h |

Mọi phần còn lại (worker, collections, alert framework, config, UI skeleton) **giống nhau** — implement Max 3D trước làm mẫu, Pro copy đổi shape theo bảng này.

## 3. Thiết kế database

### 3.1. Nguyên tắc bất biến — GIỮ NGUYÊN Keno §3.1

Place-bet không thêm write đồng bộ; dashboard chỉ đọc pre-aggregated; stats là derived data.

### 3.2. Collection `max3d_draw_betting_stats` / `max3d_pro_draw_betting_stats` — 1 doc / draw

Extends `DrawBettingStatsBase` (game-core, sẵn có). Phần đặc thù (viết cho Max 3D; Pro đổi shape theo §2.4):

```ts
// packages/game-max3d/src/entities/betting-stats.ts
interface Max3dDrawBettingStatsDoc extends DrawBettingStatsBase {
  _id: unknown;

  // ── Phân bổ theo mode/playType (thay aggregatePlayTypeDistribution) ──
  byPlayType: {
    basicStraight: Max3dPlayTypeStat;   // { amount; units; boards; entries }
    basicCombo3: Max3dPlayTypeStat;
    basicCombo6: Max3dPlayTypeStat;
    plus: Max3dPlayTypeStat;
    // Pro: multiNumber / multiDigit
  };

  // ── Liability theo triplet × tier (INPUT exposure §3.4) — thay aggregateTripletFrequency ──
  // Key = triplet "000".."999" — CHỈ chứa triplet có cược (sparse, không đủ 1000 key).
  // units tách theo NHÓM GIẢI vì prize khác nhau: straight / combo3 / combo6 (per-hoán-vị).
  // Bounded: tối đa 1000 key × 3 nhóm — thực tế vài trăm. LƯU RAW tuyến tính.
  tripletStakes: Record<string, {
    straightUnits: number;   // Σ betCount board straight chứa triplet này
    combo3Units: number;     // Σ betCount board combo3 có hoán vị = triplet này
    combo6Units: number;
    amount: number;          // dòng tiền quy cho triplet (Σ tiền board chứa nó)
    boards: number;
  }>;

  // ── Cặp plus/pro bị dồn cược (topCombos — phát hiện syndicate + exposure ĐB) ──
  // Max 3D: pairKey unordered "t1,t2" (sort — tiền lệ $sortArray trong aggregateTopPlusCombos).
  // Pro: pairKey ORDERED "t1>t2" (thứ tự = bản chất ĐB/phụ ĐB).
  // Cắt theo ops.stats.topCombosK (default 100). accounts distinct — tín hiệu syndicate.
  topPairs: Array<{ pairKey: string; triplet1: string; triplet2: string;
                    units: number; accounts: number; amount: number }>;

  // ── Top entry nguy hiểm nhất (Σ worst-case per board — proxy như Keno, xem §3.4b) ──
  topPotential: Max3dTopPotential[];   // shape y hệ KenoTopPotential
}
```

- **`tripletStakes` sparse Record thay vì top-K:** không gian đóng 1000 key, thực tế thưa → doc bounded (~1000 × 80 bytes = 80KB worst, thực tế nhỏ hơn nhiều; vẫn xa 16MB). Lưu ĐỦ (không top-K) vì đây là input tính exposure per-slot (§3.4) — cắt top-K sẽ làm exposure sai. Chỉ 3 kỳ/tuần → tổng dung lượng không đáng kể.
- **`topPairs` là top-K** (không lưu đủ — không gian pair 10⁶ không bounded như triplet): dùng cho syndicate + hiển thị; exposure ĐB per-pair tính từ chính danh sách này (cặp ngoài top-K có units nhỏ → liability ĐB nhỏ, chấp nhận sai số ở đuôi — ghi rõ trên UI "top K cặp"). ⚠️ Rủi ro Keno #5 (accounts distinct cross-invocation): seed `baselineAccounts` từ doc, report `max(baseline, live)`.
- Multi-digit (Pro): board multiDigit expand thành pairs ngay khi place-bet? — KHÔNG: `EntryBoardSnapshot.triplets` của Pro đã chứa danh sách triplet sinh ra, `lineCount` = số pairs. Worker expand pairs bằng đúng hàm domain `expandSelectionToPairs()` (`game-max3dpro/rules/play-types.ts`) — KHÔNG viết lại logic hoán vị.
- Index `{ drawId: 1 } unique`; thêm collection vào `Max3dCollections`/`Max3dproCollections`. Convention entity y hệ Keno.

### 3.3. Worker stats-sync — copy nguyên pattern Keno §3.3

- `apps/worker-max3d{,pro}/src/handlers/stats/stats-sync.ts` + `functions/stats.yml` (cron 1 phút, timeout 120s); use-case extends `LockedWorkerUseCase`; tiền lệ feed-sync sẵn có trong cả 2 worker.
- Checklist rủi ro Keno §11 áp NGUYÊN VẸN: watermark per-draw, index `{drawId:1,_id:1}` mới, recompute mọi status hậu-chốt chưa final (cursor), **loại void tại nguồn đọc**, conditional write, baseline top-K.
- Kỳ bán nhiều ngày → số draw active thường 1–2 (multi-draw 6 kỳ) — vòng per-draw nhẹ. **`tickSeconds` default 30s** (chốt §7 Q3 — game 3 kỳ/tuần không cần nhịp 10s; Zod range 5–60 giữ như Keno, staff chỉnh được).
- Accumulator expand board → cộng `byPlayType` + `tripletStakes` (mỗi triplet trong board; combo: mỗi HOÁN VỊ là 1 triplet key — dùng `getUniquePermutations()` domain sẵn có) + `topPairs` (board plus/multiNumber/multiDigit → pairs) + totals/byTenant/topAccounts.
- ⚠️ Board `multiNumber` 20 bộ = 380 pairs × betCount — accumulator phải cộng per-pair theo pairs đã expand, KHÔNG cộng cả board vào 1 pair.

### 3.4. Exposure — liability CÓ ĐIỀU KIỆN chính xác theo slot + proxy tổng

Không gian 20 slot ~ 1000²⁰ → không enumerate như Bingo18. Nhưng cấu trúc giải cho phép tính chính xác 2 lớp:

**(a) Liability per-triplet-per-tier (basic Max 3D — CHÍNH XÁC, additive theo slot):**
mỗi slot quay độc lập và basic trả cộng dồn theo tier (gộp giải, `findAllTiersInResult`) →
`liability(t, tier) = tripletStakes[t].straightUnits × basicPrize[tier] + combo3Units × comboPrize.combo3[tier] + combo6Units × comboPrize.combo6[tier]`.
Từ đó **worst-case basic chính xác** = mỗi tier chọn top-k triplet **DISTINCT** theo `liability(t, tier)` (k = số slot: ĐB 2, Nhất 4, Nhì 6, Ba 8) rồi cộng. ⚠️ Đã kiểm chứng code (`findAllTiersInResult` dùng `.includes()` — trả tier duy nhất 1 lần dù triplet xuất hiện NHIỀU slot cùng pool) → cùng 1 triplet lặp trong 1 pool KHÔNG nhân thưởng, nên trong greedy mỗi tier phải lấy triplet distinct; còn CÙNG 1 triplet xuất hiện ở NHIỀU tier khác nhau thì được trả mỗi tier 1 lần (gộp giải) — greedy per-tier độc lập là đúng worst-case.

**(b) Liability per-pair ĐB (plus/pro — CHÍNH XÁC theo điều kiện "cặp này ra ĐB"):**
`liabilityĐB(pair) = topPairs[pair].units × plusPrize.special` (Max 3D — unordered, 2 slot ĐB khớp bipartite) / `units × proPrize.special` (Pro — ordered đúng; cộng thêm cặp ngược `× specialSub` nếu có trong stats). Hiển thị **top pair liability** — "cặp nào ra ĐB thì trả nặng nhất, bao nhiêu account đang cầm".

**(c) Worst-case tổng (proxy RAW như Keno):** `worstCaseByPlayType` = (a) greedy basic + max liabilityĐB (b) + đuôi giải thấp plus/pro (Nhất→Sáu ước theo Σ units × maxPrize từng nhóm — proxy). Lưu ý: đây là **hàm thuần của `tripletStakes` + `topPairs` + prize config, tính lúc build response** — KHÔNG lưu trong doc (đúng bài học RAW/phi tuyến Keno Risk #4). Hàm đặt tại `packages/game-max3d{,pro}/src/rules/` cạnh `odds.ts`.

**(b2) `topPotential` per-entry:** dùng **proxy Σ worst-case per board** như Keno (KHÔNG exact per-outcome như Bingo18 — outcome space quá lớn). `maxUnitWin` per board = prize ĐB của mode đó (basic straight 1tr; combo3 340k; combo6 170k; plus 1 tỷ; pro 2 tỷ — 2,4 tỷ nếu duplicate pair) × betCount; board plus/pro tối đa 1 pair trúng ĐB per board (chỉ 2 slot ĐB; multiNumber nhiều pair nhưng chỉ pair khớp (special[0],special[1]) — và pair ngược ăn phụ ĐB ở Pro). Công thức chi tiết chốt ở plan; nguyên tắc: **proxy đơn giản, thiên về cao (ước lượng an toàn), ghi rõ là proxy**.

### 3.5. Collection `max3d_ops_alerts` / `max3d_pro_ops_alerts` — khung Keno, bộ type riêng

```ts
export const Max3dOpsAlertType = {   // Pro: Max3dproOpsAlertType — y hệt
  LargeBet: "large_bet",                    // entry.amount ≥ largeBetAmount
  ExposureThreshold: "exposure_threshold",  // worst-case tổng ≥ ngưỡng (§3.6)
  PairLiability: "pair_liability",          // 1 cặp có liabilityĐB ≥ ngưỡng — RỦI RO SỐ 1 (không cap)
  ComboConcentration: "combo_concentration",// 1 cặp/triplet ≥ N account distinct (syndicate)
  RevenueAnomaly: "revenue_anomaly",        // để dành
  SettleStuck: "settle_stuck",              // để dành
} as const;
```

- **BỎ `sidebet_skew`** (không có side bet) và `cap_sets_near` (không có cap). **THÊM `pair_liability`** — alert đặc thù quan trọng nhất của 2 game này: 1 cặp cụ thể tích liability ĐB vượt ngưỡng VND (vd 5 tỷ) → staff biết TRƯỚC ngày quay nhiều ngày, đủ thời gian điều tra/quyết định.
- Evaluator trong worker, dedupeKey unique per draw, format payload theo type — y hệ Keno.

### 3.6. `GlobalConfigDoc.ops` + tab "Vận hành"

Khung y hệ Keno §3.9 / Bingo18 §3.6. Ngưỡng đặc thù (chung shape cho cả 2 game, giá trị default khác):

```ts
export interface OpsAlertsConfig {
  /** Ngưỡng cược lớn (VND). Default đề xuất: 5.000.000 (Max3D), 10.000.000 (Pro — multiNumber 20 bộ = 3,8tr/kỳ/betCount 1). Xem §7 Q1. */
  largeBetAmount: number;
  /** Ngưỡng worst-case tổng (VND, tuyệt đối — không có cap làm mẫu số). Default đề xuất: 5 tỷ. */
  exposureWarnAmount: number;
  /** Ngưỡng liability ĐB của 1 cặp (VND) → pair_liability. Default đề xuất: 2 tỷ (Max3D) / 4 tỷ (Pro). */
  pairLiabilityWarnAmount: number;
  /** Số account distinct cùng 1 cặp/triplet → combo_concentration. Default 5 (như Keno). */
  comboAccountsWarn: number;
  enabled: Record<Max3dOpsAlertType, boolean>;
}
// stats: OpsStatsConfig (game-core, ĐẦY ĐỦ — topCombosK dùng cho topPairs); tickSeconds default 30 (§7 Q3).
```

Player DTO: kiểm tra `GetGameConfigPlayerUseCase` từng game vẫn allowlist tường minh trước khi thêm `ops` (kỷ luật Keno §3.9).

### 3.7. Sửa index

- Đổi 3 index `drawDate` → `financialDate` trên `max3d_ticket_entries` + `max3d_pro_ticket_entries` (kiểm tra trùng lặp với `idx_tenant_financialDate_status` sẵn có — nếu trùng key thì XOÁ index sai thay vì đổi tên, quyết định chi tiết ở plan).
- Thêm `{ drawId: 1, _id: 1 }` (`idx_draw_id`) cho watermark per-draw — mỗi game.

## 4. Thiết kế UI (backoffice) — follow guideline Keno, khác biệt theo luật chơi

Follow `operations-page-layout.guideline.md` (2 tab, alerts đầu tab Giám sát, 2 timer + ETag/304, thresholds từ response, `PlayerName`, poll tắt khi settled). Phần KHÁC:

### 4.1. Snapshot endpoint

`GET /api/max3d{,pro}/operations/snapshot?drawId=` → `{ drawStatus, stats, exposure (tính thuần từ tripletStakes+topPairs), alertCounts, thresholds, tickSeconds }`. Dead-code cleanup theo Keno §9.3: xoá 5 use-case ops cũ (`get-ops-summary`/`get-tenant-breakdown`/`get-triplet-frequency`/`get-playtype-distribution`/`get-top-combos`) + route + aggregation method + query keys — grep toàn repo. Giữ `get-live-entries`, `get-winning-entries`, `get-draw-selector`.

### 4.2. Tab Giám sát

- **Exposure card**: worst-case tổng (proxy §3.4c) + **"Cặp nguy hiểm nhất"** (pairKey + liabilityĐB + số account) + basic worst-case (greedy §3.4a). Gauge tô theo `exposureWarnAmount`. Với Pro thêm dòng phụ ĐB.
- Alerts panel: formatter 4 type (`large_bet`, `exposure_threshold`, `pair_liability`, `combo_concentration`); `pair_liability`/`combo_concentration` hiển thị cặp số (2 triplet badge) + account list → link outstanding.

### 4.3. Tab Phân tích cược

- **Bảng số KHÔNG phải grid 1000 ô** — thay bằng 2 khối:
  1. **Histogram chữ số theo vị trí** (3 hàng × 10 cột = 30 ô: hàng trăm/chục/đơn vị × chữ số 0–9, dòng tiền + lượt, heat theo tiền) — dựng từ `tripletStakes` ở tầng đọc. Cho staff thấy lệch phân bố chữ số.
  2. **Top triplets** (list top-N theo amount từ `tripletStakes`, đủ 3 chữ số + tiền + units theo nhóm straight/combo).
  Không có chọn số/dialog tra cứu combo kiểu Keno — tra cứu điểm 1 triplet/cặp = search box filter client-side trên data đã có trong snapshot (xem §7 Q4).
- **Top cặp (plus/pro)** — panel riêng trong cụm rủi ro: pairKey + units + accounts + amount + **liabilityĐB** (đỏ). Đây là bảng quan trọng nhất trang.
- **Cụm rủi ro 3 cột**: [Top người chơi | Top phải trả tiềm năng | **Top cặp**] — "Top cặp" đóng vai trò "Bộ số phổ biến" của Keno (cùng bản chất concentration).
- **KHÔNG có side-bet card** (không có side bet).
- **Live feed 2 cột lệch theo mode**: Max 3D = Basic (rộng) | Plus (hẹp); Pro = MultiNumber (rộng — nhiều triplet) | MultiDigit (hẹp). Cược lớn tô đỏ.
- Phân bổ playType: card compact 4 nhóm (Max3D: straight/combo3/combo6/plus; Pro: multiNumber/multiDigit).
- Đại lý card hẹp thích ứng — giữ nguyên guideline.

### 4.4. Nhịp poll

Snapshot poll theo `tickSeconds` như Keno — **default 30s** (chốt §7 Q3). Poll tắt khi settled (`staleTime: Infinity`).

## 5. Đề xuất đã re-review — verdict (đối chiếu Keno §5 / Bingo18 §5)

| # | Hạng mục | Verdict | Lý do |
|---|---|---|---|
| 1 | Sửa index `drawDate`→`financialDate` (2 game) | ✅ **KEEP — P0** | Bug thật cả 2 game; kiểm tra dedupe với `idx_tenant_financialDate_status` sẵn có. |
| 2 | Stats collection + worker (2 game) | ✅ **KEEP — P0** | Nền móng; `tripletStakes` full-sparse + `topPairs` top-K. |
| 3 | Exposure panel (worst-case + pair liability) | ✅ **KEEP — P0, TRỌNG TÂM** | Nhân ×100.000–×240.000 KHÔNG cap — giá trị cao nhất trong 7 game. Liability per-slot/per-pair chính xác có điều kiện. |
| 4 | Alert framework (`pair_liability` mới) | ✅ **KEEP — P0** | 4 type P0; `pair_liability` là alert đặc thù quan trọng nhất. |
| 5 | Combo concentration (accounts distinct) | ✅ **KEEP — P0** | Khác Bingo18: pair space 10⁶ → syndicate detection có ý nghĩa như Keno. |
| 6 | Ops config tab (2 game) | ✅ **KEEP — P0** | Khung Keno; ngưỡng tuyệt đối VND (không có cap/revenue ổn định làm mẫu số). |
| 7 | Snapshot + 2 tab + dead-code cleanup | ✅ **KEEP — P0** | 7→2 timer mỗi game. |
| 8 | Side bet skew | ❌ **CUT** | Không có side bet. |
| 9 | Cap sets / combo-stats collection riêng / minh bạch combo player | ❌ **CUT** | Không có payout cap → không có bài toán chia cap cần kiểm chứng. `topPairs` trong stats doc đủ cho staff. |
| 10 | Fix draw selector sort | ❌ **CUT (đã xong)** | Cả 2 game đã re-sort active ASC từ trước. |
| 11 | Baseline so sánh kỳ (theo thứ trong tuần) | ✅ **KEEP — P1** | 3 kỳ/tuần — baseline "cùng thứ, 8 kỳ gần nhất". |
| 12 | Player concentration alert | ✅ **KEEP — P1** | `topAccounts` sẵn trong base. |
| 13 | Settle progress | ⏸️ **DEFER** | Như Keno. |
| 14 | Exposure multi-draw (vé 6 kỳ) | ✅ **KEEP — P2** | Như Keno #11. |
| 15 | Drill-down triplet → entries | ⬇️ **P2** | On-demand khi điều tra. |

## 6. Kỷ luật triển khai

Y hệt Keno §9 + Bingo18 §6 (bảng pattern tham chiếu Keno giữ nguyên — betting-stats/ops-alert entity, repo/mapper, worker stats-sync, snapshot route, UI 2 tab, ops-section config). Bổ sung riêng 2 game:

- **Expand pairs/hoán vị DÙNG HÀM DOMAIN SẴN CÓ**: `getUniquePermutations()`/`getPermutationCount()` (cả 2 game), `expandSelectionToPairs()` (Pro) — worker/accumulator KHÔNG viết lại logic hoán vị (nguồn sai lệch settle vs stats).
- **Triplet là string zero-padded "000"–"999"** — key trong `tripletStakes`/`pairKey` dùng nguyên string, không parse int.
- **Pro pairKey ORDERED** — không normalize sort như Max 3D plus; UI hiển thị mũi tên thứ tự (t1 → t2).
- Thứ tự triển khai: **Max 3D trước** (làm mẫu triplet-based) → **Pro copy** đổi theo bảng §2.4. 2 game 2 bộ plan riêng nhưng cùng 1 analysis này.

## 7. Câu hỏi mở — ĐÃ CHỐT TOÀN BỘ (user quyết 30/07/2026)

1. ~~Q1 — Default `largeBetAmount`?~~ → **Chốt: Max 3D 5tr, Pro 10tr** (multiNumber 20 bộ = 3,8tr/kỳ với betCount 1 — ngưỡng thấp hơn sẽ noise).
2. ~~Q2 — Ngưỡng pair_liability theo gì?~~ → **Chốt: theo LIABILITY VND** — `pairLiabilityWarnAmount` default 2 tỷ (Max3D) / 4 tỷ (Pro); bắn sớm, thiên an toàn (chỉ 20.000đ cược vào 1 cặp Pro = liability 4 tỷ — chấp nhận nhạy). `exposureWarnAmount` default 5 tỷ.
3. ~~Q3 — `tickSeconds` default?~~ → **Chốt: 30s** cho cả 2 game (3 kỳ/tuần, kỳ bán nhiều ngày — không cần 10s; staff chỉnh được). Zod range vẫn 5–60 như Keno.
4. ~~Q4 — Tra cứu điểm 1 triplet/cặp?~~ → **Chốt: search box filter client-side** trên data snapshot (`tripletStakes` + `topPairs`); KHÔNG dialog + collection riêng. Cặp ngoài top-K không tra được account — chấp nhận (liability nhỏ), UI ghi rõ "top K cặp".
5. ~~Q5 — `topPotential` proxy Σ worst-case per board?~~ → **Chốt: dùng proxy** (thiên cao, ghi rõ là proxy — nhất quán Keno).
6. ~~Q6 — Tổ chức plans?~~ → **Chốt: 2 thư mục riêng** (`max3d-ops-risk-control/` làm trước làm mẫu, `max3dpro-ops-risk-control/` copy đổi theo §2.4).

**Lưu ý kế thừa từ Bingo18 (chốt cùng ngày):** game-core tách `OpsStatsConfigBase` + `OpsStatsConfig extends Base { topCombosK }` — Max3D/Pro DÙNG `OpsStatsConfig` đầy đủ (có `topCombosK` cho `topPairs`), không bị ảnh hưởng bởi refactor; nguyên tắc "không cấu hình thừa default" áp dụng: chỉ khai field ngưỡng game thật sự dùng.

## 8. Plans phái sinh — ĐÃ TẠO (30/07/2026)

2 thư mục riêng (chốt §7 Q6) theo quy ước `.cursor/plans/README.md`; trạng thái ở `00-overview.md` từng thư mục (kèm khung "Review sau triển khai" bắt buộc). Plans Pro = plans Max 3D + delta §2.4 (bảng delta chép vào overview Pro, nhấn mạnh audit ordered pair).

```
.cursor/plans/max3d-ops-risk-control/          # làm TRƯỚC (game mẫu triplet-based, sau Bingo18)
├── 00-overview.md
├── p0-01-entry-indexes-fix.plan.md            # 2 index đổi key + 1 XOÁ (trùng idx_tenant_financialDate_status sẵn có) + idx_draw_id
├── p0-02-draw-betting-stats.plan.md           # tripletStakes full-sparse + topPairs unordered + exposure rules (greedy/pair/proxy) + worker
├── p0-03-ops-config.plan.md                   # ops (largeBet 5tr · exposure 5 tỷ · pairLiability 2 tỷ · tick 30s) + tab Vận hành
├── p0-04-ops-alerts.plan.md                   # 4 rule, pair_liability per-pair (Critical)
└── p0-05-operations-page.plan.md              # snapshot 7→2 timer + histogram chữ số 3×10 + top cặp + search box + dead-code cleanup

.cursor/plans/max3dpro-ops-risk-control/       # làm SAU — delta ordered pair / specialSub / multiDigit / defaults 10tr·4 tỷ
├── 00-overview.md                             # bảng delta §2.4 + cảnh báo "không sort/normalize pairKey"
├── p0-01-entry-indexes-fix.plan.md
├── p0-02-draw-betting-stats.plan.md           # pairKey ORDERED "t1>t2", liability 2 chiều (special + specialSub), expandSelectionToPairs
├── p0-03-ops-config.plan.md
├── p0-04-ops-alerts.plan.md                   # pair_liability dedupe theo cặp unordered, payload breakdown 2 chiều
└── p0-05-operations-page.plan.md              # UI badge t1 → t2, live feed MultiNumber|MultiDigit
```


