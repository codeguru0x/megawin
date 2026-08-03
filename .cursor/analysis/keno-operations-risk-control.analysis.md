# Keno — Operations & Risk Control (Analysis)

> **Status:** `approved (P0)` · **Ngày:** 28/07/2026 — scope P0 (7 hạng mục §5) user đã chốt toàn bộ; P1/P2 giữ trạng thái đề xuất.
> **Nguồn tham chiếu:**
> - Canvas trình bày: `~/.cursor/projects/Users-cuongvu-Working-Source-Projects-megawin/canvases/keno-operations-review.canvas.tsx`
> - Source đã đọc: `packages/game-keno` (entities, rules, indexes), `packages/game-keno-application/src/infras/repos/entry-repo.ts`, `apps/backoffice/src/app/(main)/games/keno/operations/`, `.cursor/rules/operations-page-ui.mdc`, `.cursor/rules/keno-game-rules.mdc`
> - Đây là analysis mẫu — kết luận ở đây làm cơ sở nhân rộng cho 6 game còn lại.
> - **Đã cập nhật tên class 03/08/2026** (theo `.cursor/plans/worker-core-usecase-restructure/`) — doc
>   này DÙNG tên canonical mới. Ánh xạ nếu đọc code cũ: `LockedWorkerUseCase → SingleRunWorker`,
>   `TickLoopWorkerUseCase → TickLoopWorker`, `BusinessLockCoordinator → DistributedMutex`; file chuyển vào
>   `use-cases/lock/`, import qua subpath `@megawin/worker-core/workers` (base class) hoặc `/locks`.

## 1. Bối cảnh & mục tiêu

Trang vận hành Keno (`/games/keno/operations`) cần cho staff **một nơi duy nhất** để giám sát draw đang diễn ra: dòng tiền cược vào, rủi ro trả thưởng, bất thường. Ràng buộc từ vận hành:

- **Hàng trăm nghìn entries mỗi draw**, draw quay mỗi 10 phút → thời gian phản ứng ngắn.
- **Không được làm chậm luồng đặt cược** (place-bet là hot path, không thêm write đồng bộ).
- **Số staff tối thiểu** → hệ thống phải alert-driven, không dashboard-watching.
- Backoffice render mượt: poll nhanh nhưng không giật, không re-render thừa.

## 2. Hiện trạng (đọc trực tiếp source, 27–28/07/2026)

### 2.1. Trang ops hiện có 4 zone (theo `operations-page-ui.mdc`)

| Zone | Đang có | Thiếu |
|---|---|---|
| Quản lý kỳ quay | DrawSelector, lifecycle stepper, actions | Settle-progress khi settling |
| KPI | 6 KPI từ `aggregateOpsSummary` | Exposure trần, payout ratio so baseline |
| Kết quả | 20 số + prize summary | Flag payout-cap-đã-kích-hoạt |
| Phân tích Cược | PlayTypeCard, Heatmap 80 số, TopCombos, LiveFeed | Query trực tiếp entries (không scale), side bet chưa tách hướng |

### 2.2. Ba phát hiện kỹ thuật quan trọng

1. **Index lệch field (BUG):** `packages/game-keno/src/indexes/index.ts` khai 3 index dùng `drawDate` trên `keno_ticket_entries` (`idx_tenant_account_drawDate`, `idx_tenant_drawDate_status`, `idx_drawDate_status`) nhưng `TicketEntryDoc` chỉ có `financialDate`; toàn bộ ops aggregation (`aggregateOpsSummary`, `aggregateNumberFrequency`, `aggregatePlayTypeDistribution`, `aggregateTenantBreakdown`) `$match` theo `financialDate` → index vô dụng, query theo ngày COLLSCAN.
2. **`payout-exposure` là placeholder trống** trong `apps/backoffice/src/app/api/keno/operations/` — chức năng kiểm soát rủi ro quan trọng nhất chưa tồn tại.
3. **Aggregation on-demand không scale:** heatmap `$unwind` 2 tầng (boards → numbers) trên toàn bộ entries của draw, poll 10s/lần × số staff mở trang. 300k entries × ~2 board × ~5 số ≈ 3 triệu doc trung gian mỗi lần chạy. Ngoài ra `aggregateNumberFrequency` chia revenue đơn giản hoá (giả định 1 số/board) → doanh thu quy cho từng số sai lệch.

### 2.3. Rủi ro theo luật chơi (từ `DEFAULT_BASIC_PRIZE_TABLE`, mệnh giá 10.000đ/board)

| Kiểu chơi | Giải cao nhất | Nhân | Cap |
|---|---|---|---|
| Pick 10 | 2 tỷ (10/10) | ×200.000 | 10 tỷ/kỳ, >5 bộ chia đều |
| Pick 9 | 800tr (9/9) | ×80.000 | 10 tỷ/kỳ, >12 bộ chia đều |
| Pick 8 | 200tr (8/8) | ×20.000 | 10 tỷ/kỳ, >50 bộ chia đều |
| Pick 7 → 5 | 40tr / 12,5tr / 4,4tr | ×4.000 / ×1.250 / ×440 | không cap |
| Chẵn/Lẻ ≥15 | 200k | ×20 | không cap |
| Lớn/Nhỏ ≥13, Hoà | 26k | ×2,6 | không cap |

Ma trận rủi ro vận hành:

| Rủi ro | Cơ chế | Mức độ | Kiểm soát hiện có |
|---|---|---|---|
| 1 vé nhỏ → liability khổng lồ | Board Pick 10 mệnh giá 10k, potential win 2 tỷ; `betCount` nhân thêm | Cao | Cap khi settle; KHÔNG có exposure view trước quay |
| Cược dồn 1 cụm số (syndicate) | Nhiều account cùng tổ hợp → cap chia đều kích hoạt, khiếu nại + nghi gian lận | Cao | Heatmap + top combo, chưa có cảnh báo ngưỡng |
| Kỳ quay 10 phút | Staff chỉ có vài phút phát hiện bất thường trước đóng cược | Cao | Polling 10s nhưng query nặng |
| Side bet lệch một phía | Tiền đổ vào 1 hướng Lớn/Chẵn → kết quả cực đoan (≥15 chẵn ×20) trả đồng loạt | Trung bình | Phân bố kiểu chơi chưa tách hướng cược |
| Pick 8/9/10 trúng 0 số có thưởng | Match 0 → 10.000đ, tần suất trả nhỏ rất dày | Trung bình | Settle đúng luật, chưa có view giám sát |
| Vé multi-draw | `TicketDoc.drawPlan` trải exposure nhiều kỳ tương lai vô hình | Trung bình | Chưa có view |

## 3. Thiết kế database — chi tiết

### 3.1. Nguyên tắc bất biến

1. **Place-bet không thêm write đồng bộ nào.** Mọi thống kê vận hành đi qua đường async (worker), luồng tiền không bao giờ chờ luồng thống kê.
2. **Dashboard không bao giờ aggregate trực tiếp entries.** Backoffice chỉ đọc document pre-aggregated.
3. **Stats là derived data** — mất/lệch thì recompute từ entries được, không phải source of truth tài chính (số tài chính chính thức vẫn từ settle pipeline, `DrawDoc.financial`).

### 3.2. Collection `keno_draw_betting_stats` — 1 document / draw

```ts
interface KenoDrawBettingStatsDoc {
  _id: unknown;                      // MongoDB ObjectId (convention codebase: _id: unknown, KHÔNG ObjectId)
  drawId: string;                    // unique index
  updatedAt: Date;

  // ── Watermark cho worker (xem 3.3) ──
  lastEntryId: unknown;              // ObjectId lớn nhất đã cộng (insert stream, đã loại status:void)

  // ── Totals — thay aggregateOpsSummary cho draw đang mở ──
  totals: {
    revenue: number; entries: number; boards: number;
    commission: number;
    largeBetCount: number;           // số entry vượt ngưỡng cấu hình
  };

  // ── Phân bố kiểu chơi — thay aggregatePlayTypeDistribution ──
  // Side bet TÁCH HƯỚNG CƯỢC — nhìn lệch một phía là thấy ngay
  byPlayType: {
    pick1: PlayTypeStat; /* … */ pick10: PlayTypeStat;
    bigSmall: { big: PlayTypeStat; small: PlayTypeStat; draw: PlayTypeStat };
    evenOdd: { even: PlayTypeStat; even1112: PlayTypeStat; draw: PlayTypeStat;
               odd1112: PlayTypeStat; odd: PlayTypeStat };
  };

  // ── Phân bố theo đại lý — thay hook tenant-breakdown (poll 30s riêng hiện tại) ──
  // Số tenant nhỏ (vài chục) → Record không phình
  byTenant: Record<string, { amount: number; entries: number; commission: number }>;

  // ── Heatmap — thay aggregateNumberFrequency, 80 key cố định ──
  // amount tính ĐÚNG tại thời điểm ghi: cộng boardAmount cho TỪNG số trong board
  // (sửa luôn lỗi chia đơn giản hoá của pipeline hiện tại)
  // potentialWin: Σ potentialWin của các board CHỨA số này — lớp "liability heat"
  // cho heatmap (xem 3.7 vì sao dùng cái này thay vì xác suất có điều kiện)
  numberFreq: Record<string, { boards: number; amount: number; potentialWin: number }>; // "01".."80"

  // ── Top combos — bộ số bị cược trùng nhiều nhất (phát hiện syndicate) ──
  // accounts = số account DISTINCT trong batch merge — tín hiệu chính:
  // 1 combo × nhiều account khác nhau = nghi vấn syndicate / share tips
  // K = ops.stats.topCombosK (default 100, xem 3.9); UI phân trang client-side 20/lần
  topCombos: Array<{ playType: string; numbers: string[];
                     sets: number; accounts: number; amount: number }>;

  // ── Exposure proxies (xem 3.4) ──
  // ⚠️ worstCaseByPlayType/worstCaseTotal lưu RAW (CHƯA cap) — cap chỉ áp lúc BUILD
  // RESPONSE / eval alert qua capExposureByPlayType (xem 3.4 + Risk #4 §11). Lưu RAW để
  // cộng/trừ delta void compensation không lệch do baseline đã bị cap.
  exposure: {
    worstCaseByPlayType: Record<string, number>; // RAW Σ(units × maxPrize), CHƯA cap pick8/9/10
    worstCaseTotal: number;                       // RAW = Σ worstCaseByPlayType
    capSets: { pick8: number; pick9: number; pick10: number }; // số bộ cược trọn bậc
  };

  // ── Top-K bounded — không phình document ──
  // K riêng từng loại: ops.stats.topPotentialK / topAccountsK (default 50). UI load 20, "xem thêm" client-side.
  // username = username snapshot lúc cược (ưu tiên hiển thị trước accountId — xem 4.5).
  // Field đặt tên "username" (KHÔNG "accountName") — đồng nhất với TicketEntryDoc.username.
  topPotential: Array<{ entryId: string; accountId: string; username: string;
                        amount: number; potentialWin: number }>;   // sorted desc
  topAccounts: Array<{ accountId: string; username: string; amount: number; entries: number }>;
}

interface PlayTypeStat { amount: number; boards: number; entries: number }
```

> **Convention entity (khảo sát 28/07/2026):** theo `entity-typesafe-mongodb.mdc` — mọi `*Doc` dùng `_id: unknown` (JSDoc `/** MongoDB ObjectId. */`), kèm 1 interface `KenoDrawBettingStatsEntity extends Omit<KenoDrawBettingStatsDoc, "_id"> { id: string }` (giống `DrawEntity`/`TicketEntryEntity`). Embedded (`PlayTypeStat`…) là named interface, không inline. File: `packages/game-keno/src/entities/betting-stats.ts`, re-export barrel `entities/index.ts`.

**Kích thước:** với default topCombosK=100, topPotentialK/topAccountsK=50: ~25–40KB/doc (80 key numberFreq + topCombos là mảng nặng nhất ~150 bytes/phần tử). Vẫn rất nhỏ so với giới hạn 16MB; Keno ~144 draw/ngày → ~50k docs/năm, không đáng kể. Draw đã settled → doc bất biến, cache vĩnh viễn phía backoffice.

**Index:** duy nhất `{ drawId: 1 } unique`, khai trong `KENO_INDEXES` (`packages/game-keno/src/indexes/index.ts`) với `purpose` mô tả. Đọc luôn là findOne theo drawId → O(1). Collection mới cần thêm vào enum `KenoCollections`.

### 3.3. Mini-batch worker — thuật toán cập nhật

**Vị trí & cadence (chốt lại 28/07/2026 sau khi đọc `feed-sync` + `SingleRunWorker`):** handler mới `apps/worker-keno/src/handlers/stats/stats-sync.ts`; logic trong use-case `SyncBettingStatsUseCase extends SingleRunWorker` (`packages/game-keno-application/src/use-cases/operations/`), handler chỉ `useCase.run()`.

**Về worker_lock thực tế:** source-of-truth là abstract class `SingleRunWorker<I,O>` (`packages/worker-core`) — subclass implement `ttlSeconds`, `resolveLockKey`, `runLocked`; base lo acquire/checkpoint (`setCursor`)/release; có `extendLock()` gia hạn TTL giữa chừng.

**Cadence <1 phút — GIẢI PHÁP (chốt 28/07/2026):** Keno quay mỗi 6–8 phút → cập nhật mỗi 1 phút là quá thưa để monitor. EventBridge min schedule = 1 phút, NHƯNG invocation được sống lâu (feed-sync đặt `timeout: 900`, loop tới 10 phút). Dùng **intra-invocation loop có `sleep`**:

- EventBridge trigger `stats-sync` mỗi 1 phút (`src/functions/stats.yml`), Lambda `timeout: ~120s`.
- `runLocked` chạy vòng lặp: mỗi vòng xử lý delta entries → update stats/combo/alerts → `setCursor` → `sleep(tickMs)` → lặp, cho đến khi gần hết budget invocation (vd ~55s) thì thoát. Lock TTL = timeout Lambda → invocation kế tiếp (1 phút sau) takeover liền mạch, KHÔNG chồng lấn.
- **`tickMs` cấu hình động** trong `GlobalConfig.ops.stats.tickSeconds` (default **10s**, zod 5–60) — staff chỉnh nhịp monitor không cần deploy. Đây là nhịp cập nhật thực tế của stats doc.
- **Tiền lệ:** feed-sync đã dùng "EventBridge 1 phút + invocation loop tới 10 phút + `extendLock` heartbeat"; điểm mở rộng duy nhất là thêm `sleep` giữa vòng (feed-sync loop hết việc thì thoát, stats loop chờ delta mới nên cần sleep). Đây là mở rộng nhỏ, không phải cơ chế mới.
- **`extendLock` mỗi vòng** vì runtime (loop 55s) < TTL (120s) — thực tế không bắt buộc, nhưng gọi cho an toàn nếu tăng loop budget sau này.

FE poll khớp `tickSeconds` (mặc định 10s) — poll không nhanh hơn nguồn.

Mỗi vòng:

1. **Insert stream (nguồn chính) — WATERMARK PER-DRAW (sửa Risk #1/#2 §11):** entries insert-only tại place-bet → mỗi DRAW có watermark `_id` riêng (`lastEntryId` trong stats doc của draw đó). **Lặp từng draw đang mở**, query `{ drawId, status: { $ne: void }, _id > lastEntryId[draw] }` sort `_id:1` limit batch (dùng index `{drawId:1,_id:1}`). KHÔNG dùng `_id > min(watermark)` toàn cục — global min ép đọc lại entry đã cộng của draw khác (lãng phí I/O + rủi ro double-count). Aggregate delta in-memory, `$inc` counter + `$set` watermark, `$max` updatedAt.
2. **Loại void NGAY TẠI NGUỒN đọc (chốt 30/07/2026, thay "void compensation"):** filter `status: { $ne: void }` nằm ngay trong query insert-stream (bước 1) — entry đã huỷ **KHÔNG BAO GIỜ** được cộng vào accumulator, dù void toàn kỳ (cơ chế hiện tại — `VoidEntriesBatchUseCase` void mọi entry `status=Scheduled` của draw) hay void per-entry (nếu tương lai làm). Bỏ hẳn cơ chế "cộng rồi trừ bù" (`applyVoidCompensation` + watermark `lastVoidCheckAt` riêng) vì có 1 khoảng hở: draw đang `Voiding` (SFN void theo batch, có thể kéo dài) → nếu `recomputeClosedDraws` (bước 4) trúng tick giữa lúc void chưa xong, code cũ vẫn cộng nhầm các entry CHƯA kịp void làm doanh thu thật rồi đóng dấu `final: true` VĨNH VIỄN sai. Lọc tại nguồn đơn giản hơn + không có khoảng hở đó (đã sửa `EntryRepository.getEntriesForStatsAfter`, `SyncBettingStatsUseCase`, `DrawStatsAccumulator` — bỏ `subtractEntry`/`lastVoidCheckAt`/`VoidedEntryForStats`).
3. **Conditional write (sửa Risk #6 §11):** CHỈ ghi stats doc khi có thay đổi thật (`applied > 0`). Tick không có bet mới → KHÔNG ghi → `updatedAt` giữ nguyên → ETag/304 hoạt động → FE 0 re-render. Ghi vô điều kiện mỗi tick làm `updatedAt` nhảy liên tục, phá 304.
4. ~~**Safety-net recompute — MỌI draw chưa final ≥ salesClosed**~~ — **ĐÃ XOÁ 01/08/2026** (p2-01 §3.5). Recompute chỉ tồn tại vì đường ghi realtime là "gần đúng" (`$set` full doc + seed một phần → drift). Sau khi đường ghi thành **delta-only + `$inc` + watermark per-document**, mỗi entry được cộng đúng 1 lần và **không có gì để tự chữa** → giữ recompute là giữ 2 thuật toán cho 1 con số. Worker giờ có **1 vòng lặp duy nhất**: hàng đợi = `findNotFinal()`; `final: true` chỉ đóng khi draw ở trạng thái **terminal thật** (`Settled`/`Void`) **và** đã đọc cạn entries. Bù lại giá trị "tự chữa lành" đã mất: đối chiếu rẻ (`countDocuments` vs `totals.entries` → alert vận hành) + `resetFinal(drawId)` khi staff cần tính lại (p2-01 §3.5.6).

**Index bắt buộc cho watermark per-draw:** `{ drawId: 1, _id: 1 }` trên `keno_ticket_entries` (`idx_draw_id`) — equality prefix `drawId` + range `_id`, index-only cursor. Đây là index MỚI có chủ đích cho ops (khác §3.6 — chỉ cấm multikey trên `boards.numbers`).

**Top-K:** `topPotential` cắt K **ngay trong lệnh ghi** (`$push` + `$sort` + `$slice`) — không đọc-sửa-ghi. `topCombos`/`topAccounts` **không còn là mảng trong stats doc**: derive lúc đọc từ `keno_draw_combo_stats` / `keno_draw_account_stats` bằng index sort (p2-01 §3.5) → hết drift, thêm `uniquePlayers` chính xác.

**Tại sao không `$inc` ngay trong place-bet:** thêm write vào hot path cược (vi phạm nguyên tắc 1), hot-document contention khi peak TPS, và fail giữa chừng gây lệch vĩnh viễn không có điểm tự sửa. Mini-batch: 1 write/batch bất kể TPS, crash-safe theo watermark, độ trễ = `tickSeconds` (default 10s) — thừa đủ cho chu kỳ draw 6–8 phút.

### 3.4. Exposure — công thức cụ thể

Keno không thể tính liability per-outcome (C(80,20) ≈ 3,5×10¹⁸ tổ hợp). Dùng 3 proxy:

| Proxy | Công thức | Trả lời |
|---|---|---|
| Worst-case theo kiểu chơi | Lưu RAW `Σ(boardAmount/10.000 × maxPrize[playType] × betCount)`; cap `min(RAW, capMaxPerDraw)` cho pick8/9/10 **CHỈ áp lúc build response/eval alert** qua `capExposureByPlayType` (`packages/game-keno/src/rules/max-prize.ts`) | Kỳ này tệ nhất trả bao nhiêu? |
| Top potential payouts | Top 20 entry theo `potentialWin` (tính lúc worker xử lý entry, dùng prize table snapshot) | Ai cầm vé nguy hiểm nhất? Có phải 1 nhóm? |
| Cap headroom | `capSets.pickN` so với `maxSetsForFixed` (50/12/5) | Trúng thì cap chia đều có kích hoạt không? |

Lưu ý: worst-case của side bet là con số CÓ THỂ xảy ra đồng loạt (mọi vé cùng hướng thắng cùng lúc với 1 kết quả) — đây là con số đáng giám sát nhất với side bet, khác bản chất với basic (các board khác nhau hiếm khi cùng trúng max).

> **Tại sao lưu RAW (chưa cap) trong doc (chốt Risk #4, review 29/07/2026):** cap `maxPerDraw` là non-linear (`min`). Nếu lưu giá trị ĐÃ cap làm baseline rồi `$inc` delta void (âm), kết quả lệch — vd baseline capped = 10 tỷ (đã đụng trần), void 1 board trị giá 500tr → baseline RAW đúng phải giảm còn dưới cả trần cũ, nhưng trừ trên số đã cap ra 9,5 tỷ SAI (thực tế vẫn có thể ≥ 10 tỷ nếu RAW ban đầu là 15 tỷ). Lưu RAW → delta cộng/trừ tuyến tính đúng; cap là hàm thuần idempotent áp ở tầng đọc, gọi lại bao nhiêu lần cũng cho cùng kết quả.

### 3.5. Collection `keno_ops_alerts` — nền tảng alert-driven ops

```ts
interface KenoOpsAlertDoc {
  _id: unknown;                       // MongoDB ObjectId
  drawId: string;
  type: "large_bet" | "exposure_threshold" | "sidebet_skew"
      | "cap_sets_near" | "combo_concentration"
      | "revenue_anomaly" | "settle_stuck";   // settle_stuck: để dành (xem verdict #8)
  severity: "info" | "warning" | "critical";
  payload: Record<string, unknown>;   // context: entryId, giá trị, ngưỡng…
  dedupeKey: string;                  // unique+drawId — không bắn lại alert cùng loại/kỳ
  status: "new" | "ack" | "resolved";
  createdAt: Date; ackBy?: string; ackAt?: Date;
}
// Indexes: { status: 1, createdAt: -1 }, { drawId: 1, dedupeKey: 1 } unique
```

- **Evaluator chạy ngay trong stats worker** (sau khi update stats doc — data đã có sẵn trong memory, chi phí ≈ 0): so các chỉ số với ngưỡng trong `GlobalConfigDoc.ops.alerts` (xem 3.9). Thêm rule `combo_concentration` đọc từ combo stats (3.8): 1 combo pick8/9/10 có `sets` hoặc `accounts` vượt ngưỡng.
- Đây là hạ tầng then chốt cho mục tiêu **ít người vận hành**: staff không cần dán mắt vào dashboard — hệ thống chủ động báo, dashboard dùng để điều tra khi có alert. Và là điểm cắm cho AI sau này (mục 6).

### 3.9. Cấu hình vận hành — `GlobalConfigDoc.ops`, tab mới trên trang config game (P0)

**Quyết định (28/07/2026):** cấu hình động ngay từ P0, staff sửa trên chính trang cấu hình game hiện có — **thêm 1 tab "Vận hành"** vào `<Tabs>` sẵn có (nuqs `?tab=ops` theo rule `game-config-ui` §14). Đặt tên section là `ops` (không phải `opsAlerts`) vì chứa cả ngưỡng cảnh báo LẪN cấu hình hiển thị stats — 1 tab, 1 đường update.

```ts
// Thêm section vào GlobalConfigDoc (packages/game-keno/src/entities/global-config.ts)
export interface OpsConfig {
  alerts: {
    /** Ngưỡng 1 entry bị coi là cược lớn (VND). */
    largeBetAmount: number;              // default 5_000_000
    /** % worstCaseTotal / capMaxPerDraw kích hoạt cảnh báo exposure. */
    exposureWarnPct: number;             // default 60
    /** % lệch một phía side bet (theo amount) kích hoạt cảnh báo. */
    sidebetSkewPct: number;              // default 70
    /** Số bộ cược cùng 1 combo pick8/9/10 kích hoạt combo_concentration. */
    comboSetsWarn: { pick8: number; pick9: number; pick10: number }; // default 40/10/4 (~80% maxSetsForFixed)
    /** Số account distinct cùng 1 combo kích hoạt nghi vấn syndicate. */
    comboAccountsWarn: number;           // default 5
    /** Bật/tắt từng loại alert. */
    enabled: Record<KenoOpsAlertType, boolean>;
  };
  stats: {
    /** Nhịp cập nhật stats doc trong worker (giây) — cũng là nhịp FE poll. Zod: int 5–60. */
    tickSeconds: number;                 // default 10
    /** Số combo giữ trong topCombos. Zod: int 20–200. Cao nhất vì là danh sách điều tra syndicate chính. */
    topCombosK: number;                  // default 100
    /** Số entry giữ trong topPotential (vé nguy hiểm nhất theo potentialWin). Zod: int 20–100. */
    topPotentialK: number;               // default 50
    /** Số account giữ trong topAccounts (concentration theo người chơi). Zod: int 20–100. */
    topAccountsK: number;                // default 50
  };
}
```

**Top-K vì sao tách riêng từng loại (chốt 28/07/2026):** ba danh sách phục vụ ba mục đích khác nhau — `topCombos` là công cụ điều tra chính (cần sâu, default 100); `topPotential`/`topAccounts` là danh sách cảnh giới (top 50 đã thừa — vé/account nguy hiểm thật luôn nằm trong top đầu). Trộn chung 1 field topK ép cả ba cùng độ sâu → phình doc vô ích ở 2 danh sách sau. UI thống nhất: render 20 dòng đầu + "xem thêm" client-side (data đã trong response, không thêm request).

**Vì sao đặt trong GlobalConfigDoc thay vì collection riêng:** (1) đi theo hạ tầng có sẵn — `version` tăng + audit log mỗi lần sửa, trang config game đã có pattern tab + section, thêm tab "Vận hành" là khớp `game-config-ui`; (2) worker vốn đã đọc GlobalConfig (prize table cho potentialWin) — không thêm query, ngưỡng mới có hiệu lực trong 1 chu kỳ worker (~1 phút) không cần deploy; (3) `UpdateGameConfigInput` thêm `ops?: Partial<OpsConfig>` là xong đường ghi.

**Tooltip bắt buộc cho mọi field cấu hình:** mỗi field trong tab Vận hành PHẢI có tooltip ghi rõ: ý nghĩa cấu hình, tác động khi thay đổi, khoảng giá trị hợp lệ, giá trị mặc định. Yêu cầu này đã được ghi thành quy tắc chung trong `game-config-ui.mdc` §16 (28/07/2026) — áp dụng cho MỌI trang cấu hình sau này, không riêng ops.

**Kiểm chứng không rò dữ liệu thừa (đã đọc code 28/07/2026):**

- **Player an toàn theo thiết kế sẵn có:** `GetGameConfigPlayerUseCase` (`packages/game-keno-application/src/use-cases/player/get-game-config-player.ts`) build DTO **liệt kê field tường minh** (allowlist), không spread entity — thêm `ops` vào doc thì player DTO không tự lộ. Giữ nguyên kỷ luật này: MỌI field mới thêm vào GlobalConfigDoc mặc định KHÔNG đến player trừ khi chủ động map.
- **Backoffice lộ toàn bộ theo chủ đích:** `GetGlobalConfigUseCase` trả nguyên `GlobalConfigEntity` — staff cần thấy hết, `ops` tự xuất hiện ở API config. UI thêm tab render tương ứng.
- **Quy tắc chốt cho mọi lần mở rộng entity sau này:** field mới trên Doc → tự hỏi "player DTO có đang allowlist không?" — với Keno câu trả lời là có, pattern này phải giữ khi nhân rộng sang game khác.

### 3.6. Sửa index hiện có

Đổi 3 index `drawDate` → `financialDate` trên `keno_ticket_entries` (bug ở mục 2.2). Thêm **1 index mới có chủ đích cho ops**: `{ drawId: 1, _id: 1 }` (`idx_draw_id`) phục vụ watermark per-draw insert-stream + recompute cursor (§3.3). Đây KHÔNG phải multikey (chỉ `drawId` + `_id`), write amplification tối thiểu (ObjectId tăng đơn điệu, insert append cuối index). Vẫn giữ nguyên tắc: KHÔNG tạo multikey index trên `entrySummary.boards.numbers` (nổ index entries trên hot path).

### 3.7. Rủi ro theo từng số trên heatmap — phân tích toán học & quyết định

**Câu hỏi:** có tính được "rủi ro" cho từng con số 01–80 không, và có đáng hiển thị không?

**Toán học Keno:** mỗi số có P(được quay) = 20/80 = 25%, độc lập về mặt cảm nhận nhưng payout thì KHÔNG per-number — payout là sự kiện **đồng thời** trên tổ hợp (board pick10 cần cả 10 số cùng ra, P = 1/8,9 triệu). Ba mức "rủi ro per-number" xếp theo độ chính xác:

| Mức | Định nghĩa | Tính được? | Đáng làm? |
|---|---|---|---|
| (a) Stake concentration | Σ boardAmount các board chứa số n | ✅ đã có (`numberFreq.amount`) | ✅ **GIỮ** — "tiền đặt vào đâu", heat nền theo giá trị này |
| (b) Liability concentration per-number | Σ `potentialWin` các board chứa số n | ✅ incremental | ❌ **BỎ (đảo quyết định 29/07)** — xem dưới |
| (c) Conditional expected liability | E[payout \| n được quay] qua hypergeometric per board | ✅ về lý thuyết | ❌ **KHÔNG** — số tuyệt đối rất nhỏ, staff không hành động được |
| (entry) Per-entry worst-case | Σ maxPrize board của 1 entry | ✅ (`topPotential`) | ✅ **CHỌN** — đúng đơn vị, không double-count |

**Quyết định (đảo lại 29/07/2026 — trước đây chọn mức b):** **BỎ HẲN mức (b) per-number liability** khỏi cả data (`KenoNumberStat.potentialWin`) lẫn UI ô heatmap. Lý do:

- Worst-case (`maxPrize`) là thuộc tính của **BOARD** — board pick-N chỉ trả thưởng khi trúng **đủ ngưỡng** số của nó, KHÔNG phải khi "1 số cụ thể ra". Keno quay 20 số/kỳ.
- Cộng worst-case của board vào **từng số** trong board → 1 board pick10 (2 tỷ) cộng 2 tỷ vào cả 10 ô → tổng liability heatmap **nhân ~10 lần** giá trị thật. Con số vô nghĩa để ra quyết định + gây hiểu nhầm "số này ra thì lỗ".
- Rủi ro chi trả có ý nghĩa được đo **ở cấp entry** (mức entry): `topPotential` = Σ worst-case các board của 1 entry — mỗi entry đếm đúng 1 lần, không double-count. Đây là bảng "Top phải trả tiềm năng" (giữ).

**Heatmap ô còn:** Dòng tiền (mức a — heat nền) + số lượt. **Game sau không thêm lại per-number liability.**

### 3.8. Combo stats + tra cứu bộ số ownership-gated (minh bạch cap 8/9/10)

**Nhu cầu:** (1) staff phát hiện nhiều người/tiền dồn vào đúng 1 bộ số; (2) player tự kiểm tra "bộ số tôi định mua đang có bao nhiêu người cược" → khi cap chia đều kích hoạt, con số công bố là kiểm chứng được, hệ thống chứng minh không gian lận.

**Thiết kế — collection `keno_draw_combo_stats`, CHỈ cho pick 8/9/10 (cappable):**

```ts
interface KenoDrawComboStatsDoc {
  _id: unknown;            // MongoDB ObjectId
  drawId: string;
  comboKey: string;        // `${playType}:${sorted numbers.join(",")}` — vd "pick10:01,05,...,79"
  sets: number;            // tổng bộ (board × betCount)
  amount: number;          // tổng tiền vào combo này
  /**
   * Danh sách account distinct đã cược combo này — lưu ĐẦY ĐỦ để staff hiển thị
   * tên + accountId (không chỉ đếm). `username` snapshot lúc ghi (từ entry.tenant/account
   * snapshot đã có sẵn — KHÔNG query bảng account riêng). players = accounts.length.
   * Chốt 28/07/2026: cappable combo trùng nhiều account là hiếm (vài chục), lưu mảng
   * chấp nhận được; đa số combo chỉ 1 account. accountId dùng cho drill-down entries.
   * Đổi tên field 29/07/2026: `accountName` → `username` (đồng nhất `TicketEntryDoc.username`).
   */
  accounts: Array<{ accountId: string; username: string; sets: number; amount: number }>;
  createdAt: Date;
  updatedAt: Date;
}
// Indexes: { drawId: 1, comboKey: 1 } unique
// TTL: KHÔNG có tiền lệ TTL index trong codebase (IndexSpec chỉ có unique/name/sparse).
//      Retention combo-stats xử lý bằng cleanup batch trong stats worker (xoá doc của
//      draw đã settled > N ngày) — chốt trong plan p0-04, KHÔNG tự thêm TTL.
```

- **Nguồn ghi:** chính worker mini-batch ở 3.3 — cùng insert stream, thêm 1 bulkWrite upsert. Với mỗi entry mới: cộng `sets`/`amount` vào combo, và **merge account vào mảng `accounts`** (nếu accountId đã có → cộng dồn `sets`/`amount` của account đó; chưa có → push phần tử mới với `username` snapshot). KHÔNG thêm gì vào place-bet, KHÔNG index mới trên entries.
- **Cardinality kiểm soát được:** đại đa số combo là duy nhất (1 doc/combo, `accountCount = 1`), combo trùng nhiều mới là đối tượng quan tâm. Retention bằng **TTL index** trên `createdAt` (không phải cleanup batch trong worker — xem risk #12).
- **`topCombos` trong stats doc** — **ĐÃ BỎ 01/08/2026:** derive lúc đọc từ `keno_draw_combo_stats` bằng index `{drawId, sets:-1}` (p2-01 §3.5). Nuôi mảng top-K trong doc bằng seed một phần gây drift.
- **Số người chơi 1 combo = `accountCount` (counter), chi tiết ở collection riêng (sửa 01/08/2026):** thiết kế 28/07 lưu **mảng `accounts` đầy đủ** trong combo doc — không có trần, combo hot đủ người chơi sẽ chạm giới hạn BSON 16MB và mọi query "combo tập trung" phải `$expr $size` (không index được → COLLSCAN). Nay: 1 doc/(combo,account) ở `keno_draw_combo_accounts` + `accountCount` trên combo doc `$set` **tuyệt đối** từ `$group` (idempotent — risk #21). Vẫn chính xác realtime, không cần bước "chốt distinct lúc salesClosed": worker cộng mỗi entry đúng 1 lần theo watermark per-document, và sau `salesClosed` không còn entry mới nên con số tự đóng băng.

**Hai mặt API — khác quyền, khác điều kiện truy cập (chốt 28/07/2026):**

| | Staff (backoffice) | Player (đã cược combo đó) |
|---|---|---|
| Endpoint | `GET /api/keno/operations/combo-lookup?drawId=&numbers=` | `GET /games/keno/draws/{id}/combo-popularity?numbers=` (player-sdk, auth bắt buộc) |
| Điều kiện | không — thấy mọi combo | **CHỈ combo mà account đang có entry chứa nó trong draw đó** — verify bằng cách đọc entries của chính account (query `accountId + drawId` sẵn index, vài doc) rồi so combo app-side. KHÔNG index mới. |
| Độ tươi | ✅ realtime trong lúc mở bán | ✅ realtime luôn — vì đã gate bằng ownership, không cần chờ đóng cược |
| Trả gì | sets, amount, mảng accounts (accountId + username + sets + amount/account) → hiển thị tên đầy đủ | CHỈ `sets` + `players` (= accounts.length), tuyệt đối không amount/accountId/username |

**Vì sao ownership-gate giải quyết trọn bài toán probing (thay cho phương án chốt salesClosed):**

1. **Dò thông tin phải trả tiền thật:** muốn xem combo nào phải mua đúng combo đó (board pick 8/9/10, tối thiểu 10.000đ/bộ). Không gian combo là thiên văn (C(80,10) ≈ 1,6×10¹²) — dò diện rộng bất khả thi về chi phí, dò 1 combo thì tự thêm mình vào chính số liệu đó.
2. **Minh bạch đến đúng người cần:** người quan tâm "combo tôi có bao nhiêu người cùng cược" chính là người sẽ bị chia cap — họ thấy ngay sau khi mua, theo dõi realtime đến lúc quay. Đây là trải nghiệm minh bạch mạnh hơn bản công bố tĩnh.
3. **Không cần cơ chế chốt riêng:** sau `salesClosed` không còn entry mới → con số tự đóng băng một cách tự nhiên (worker cộng mỗi entry đúng 1 lần theo watermark per-document, `accountCount` chính xác realtime).
4. **Trade-off chấp nhận:** player KHÔNG xem được độ đông của combo TRƯỚC khi mua (phải cược rồi mới thấy). Đây là chủ đích — chặn dùng thông tin cộng đồng để né cap trước khi xuống tiền; đổi lại đúng logic "chơi rồi thì được giám sát giải của mình".

**Chuỗi minh bạch hoàn chỉnh khi cap kích hoạt:** player mua combo → theo dõi realtime `sets`/`players` của combo mình → đóng cược, số tự đóng băng → quay → settle ApplyPayoutCaps chia đều → trang kết quả public hiển thị: "Bậc Pick 10 trúng 10/10: X bộ — vượt 5 bộ, quỹ 10 tỷ chia đều, mỗi bộ nhận Y" — X khớp với con số player đã tự theo dõi trước quay. Staff nhìn cùng con số ở Exposure panel (`capSets` drill-down xuống từng combo). Ba góc nhìn (player, public result, staff) cùng đọc từ MỘT nguồn `keno_draw_combo_stats` — không thể lệch.

## 4. Thiết kế UI & render performance (backoffice)

### 4.1. Data-fetching — từ 7 timer polling về 2 timer (chốt 28/07/2026)

**Hiện trạng đo được (`use-operations.ts`):** trang Vận hành đang chạy **7 timer độc lập** — draw selector 15s, summary 15s, tenant breakdown 30s, number frequency 60s, play type 60s, live entries 15s, top combos 60s. Mỗi timer = 1 aggregation server-side + 1 chu kỳ re-render riêng → trang "giật" lệch pha, server chịu 7 loại query lặp.

**Đề xuất: gom về đúng 2 timer. Chu kỳ poll khớp cadence worker (chốt 28/07/2026):** worker cập nhật stats doc mỗi `ops.stats.tickSeconds` (default 10s, xem 3.3) → poll khớp con số đó. Chọn **10s** cho snapshot và live-feed (đủ mượt cho draw 6–8 phút; ETag 304 khi stats chưa đổi nên không phí request). Poll không bao giờ nên nhanh hơn nhịp worker — nếu staff hạ `tickSeconds` thì FE đọc cùng giá trị để đồng bộ (truyền qua snapshot response).

| Timer | Endpoint | Thay thế cho | Nội dung |
|---|---|---|---|
| **Timer 1 — snapshot** (10s) | `GET /api/keno/operations/snapshot?drawId=` | summary + tenant + numberFreq + playType + topCombos + selector-refresh (6 timer cũ) | `{ drawStatus, stats: <nguyên stats doc — đã chứa byTenant, numberFreq, byPlayType, topCombos, exposure, top lists>, alertCounts: { new, critical } }`. Server: 1 findOne stats + 1 count alerts (index-only) — vẫn O(1). |
| **Timer 2 — live feed** (10s, CHỈ khi tab Phân tích mở) | `GET .../live-feed?drawId=` | live entries 15s cũ | find `{drawId} sort _id desc limit 20` — index-only. |

Chi tiết:

- **Vì sao nhét `alertCounts` vào snapshot thay vì query riêng:** tránh timer thứ 3. Count trên `{status:"new"}` index-only gần như miễn phí, đi kèm response giúp alert badge cập nhật cùng nhịp với số liệu — không bao giờ lệch pha "số đã nhảy mà badge chưa đỏ".
- **Draw selector không cần timer riêng:** danh sách draw đổi rất chậm (10 phút/kỳ); dùng `drawStatus` trong snapshot để invalidate query selector khi status chuyển — selector chỉ refetch khi có chuyển pha thật.
- **Poll có điều kiện theo trạng thái draw:** `refetchInterval` = 10s khi `salesOpen`/`salesClosed` chưa settle, **tắt hẳn khi `settled`** (doc bất biến → `staleTime: Infinity`). Xem draw cũ = 0 request.
- **Chặn re-render khi không có bet mới:** route handler trả `ETag = updatedAt`; client gửi `If-None-Match` → 304 thì React Query giữ nguyên reference data → **0 re-render** toàn trang. Đêm vắng cược, trang đứng yên tuyệt đối dù timer vẫn chạy.
- **Live feed tách riêng** vì bản chất khác (danh sách sự kiện, không phải thống kê), và chỉ chạy khi tab Phân tích đang mở — tab Giám sát chỉ có đúng 1 timer.
- **Realtime push (SSE/WebSocket): KHÔNG làm giai đoạn này** (chốt 28/07/2026) — polling 10s trên findOne O(1) đủ tốt; push để dành khi có nhu cầu thật.

### 4.2. Render — quy tắc cho trang ops

- **Heatmap 80 cell:** component cell memoized (`memo`), props chỉ gồm primitives (`num`, `boards`, `amount`, `heatLevel`) → poll mới chỉ re-render những cell có số đổi. 80 cell × shallow compare ≈ 0 chi phí.
- **Chia zone theo query:** mỗi section subscribe đúng slice của nó (`select` của React Query) — KPI đổi không kéo Analytics render lại.
- **Số đếm nhảy mượt:** không animation phức tạp; `tabular-nums` (đã có trong rule UI) đủ để số nhảy không giật layout.
- **Alert bar:** badge đỏ trên header đọc `alertCounts` từ chính snapshot (không timer riêng). Click mở panel danh sách alert (query on-demand, chỉ fetch khi panel mở) → ack. KHÔNG toast tự bung — staff ngồi 8 tiếng, toast liên tục là tra tấn; badge + âm thanh tuỳ chọn cho `critical`.
- Tuân `operations-page-ui.mdc` sẵn có: zone order, `text-xs` minimum, NumberBadge tokens — các panel mới (Exposure, Alert) theo cùng hệ thống.

### 4.3. Bố cục trang Vận hành — tách 2 tab, không nhồi thêm vào 1 trang (chốt hướng 28/07/2026)

Trang hiện tại (theo screenshot 28/07) đã dài: timeline → 6 KPI card → Kết quả & Tài chính → Phân bố kiểu chơi → Heatmap 80 số + Cược gần nhất → Bộ số phổ biến → Đại lý. Nhồi thêm Exposure + Alert + combo lookup + top lists vào cùng dòng chảy sẽ vượt ngưỡng "1 màn hình quét được" và tăng chi phí render mỗi lần poll.

**Đề xuất: tách thành 2 tab (nuqs `?tab=`, cùng pattern trang config §14 `game-config-ui`):**

| Tab | Nội dung | Nguyên tắc |
|---|---|---|
| **Giám sát** (default) | Timeline lifecycle → **panel Alerts** (ngay dưới, đầu trang — tín hiệu cần hành động) → KPI strip (6 card + **Exposure card**) → Kết quả & Tài chính | Màn hình "đứng nhìn" — trả lời *có chuyện gì không* trong 1 lần quét. Poll 10s. |
| **Phân tích cược** | Phân bổ kiểu chơi (side bet: card gộp phân bổ + hướng lệch) → Heatmap 2 chỉ số/ô + chọn số tuỳ ý + action menu ⋯ (dialog tra cứu P8/9/10) → **cụm 3 cột rủi ro [Top người chơi \| Top phải trả \| Bộ số phổ biến]** → [Cược gần nhất \| Đại lý] | Màn hình "đào sâu" — chỉ mount khi mở tab (TabsContent unmount inactive → heatmap 80 cell + các bảng không render khi staff đang ở tab Giám sát). |

- **Không tốn thêm request:** cả 2 tab đọc cùng 1 query `snapshot` (React Query cache chung, `select` slice riêng từng panel) + 1 query `live-feed` chỉ chạy khi tab Phân tích mở — tổng đúng 2 timer, xem 4.1.
- **Alert badge đặt ở header trang** (cạnh draw selector) — nhìn thấy từ mọi tab; click mở panel/tab Giám sát. Panel Alerts đặt **ngay dưới timeline** (đầu tab Giám sát); empty state là **1 dòng mảnh** (border-dashed), chỉ dựng Card đầy đủ khi có alert.
- **Draw selector — sort + auto-select đúng kỳ vận hành (fix 29/07):** nhóm `active` (đang diễn ra) PHẢI sort `drawId` **ASC** — kỳ SỚM nhất (gần giờ hiện tại nhất, cần xử lý trước) lên đầu. `getUnfinishedDraws()` trả `drawId DESC` nên use-case `GetDrawSelectorUseCase` phải **re-sort active ASC** trước khi build list; nếu không auto-select + selector hiện kỳ XA nhất trước (vd 16:00 thay vì 14:48 đang chạy) — sai kỳ thực tế. Auto-select mặc định = `active[0]` (kỳ sớm nhất sau khi sort). **Bài học cho game sau:** mọi selector nhiều kỳ/ngày phải sort active theo thời gian tăng dần, không dựa thứ tự trả về từ repo.
- **Exposure card** trong KPI strip tab Giám sát: gauge `worstCaseTotal / cap` + 3 dòng pick8/9/10 capSets (click → nhảy sang tab Phân tích, cuộn tới danh sách combo). Màu: xanh <30%, amber 30–60%, đỏ >60% (ngưỡng từ `ops.alerts`).
- **Heatmap 2 chỉ số/ô (bỏ toggle):** mỗi ô hiện đồng thời Dòng tiền (giá trị chính, quyết định heat nền) + Rủi ro chi trả (số nhỏ góc dưới, đỏ nhạt). Cùng grid, cùng NumberBadge tokens. Xem §4.6(c).
- **Chọn số tuỳ ý + action menu ⋯ + dialog tra cứu (staff):** bảng 80 số **LUÔN cho click chọn**, chọn bao nhiêu số tuỳ ý (phục vụ nhiều thao tác, không riêng combo). **Action menu ⋯** (góc phải header Card) → "Tra cứu P8/9/10" (enable khi đã chọn ≥ 1 số) → **mở dialog riêng** (input CSV editable sync 2 chiều + chips + validate đúng 8/9/10 + kết quả). Play type tự suy theo số lượng. Kết quả sets/accounts/amount qua 1 findOne `{drawId, comboKey}` — tức thời, on-demand, không poll. **KHÔNG render component tra cứu inline dưới bảng** — mọi thao tác đi qua menu ⋯ + dialog, thiết kế để mở rộng (export, so sánh kỳ…). Xem §4.6.
- **Side bet — card gộp:** mỗi cặp (Lớn↔Nhỏ, Chẵn↔Lẻ) là 1 card compact gộp phân bổ tiền + split bar hướng lệch (bỏ donut + progress bar full-width tách rời — dư diện tích). Hướng lệch ≥ `sidebetSkewPct` → amber. Xem §4.6(d).
- **Side bet direction:** trong PlayTypeCard hiện có, cặp progress bar đối xứng Lớn↔Nhỏ, Chẵn↔Lẻ — lệch quá `sidebetSkewPct` tự đổi màu amber.
- **Tab Cấu hình game — thêm tab "Vận hành"** (`?tab=ops`): form ngưỡng alert + 3 field top-K riêng (`topCombosK`/`topPotentialK`/`topAccountsK`), mỗi field có tooltip đầy đủ (§3.9); khu vực "Bật / tắt loại alert" giàu thông tin, KHÔNG list phẳng (§4.9); pattern card/section theo `game-config-ui`.
- ~~Settle progress~~ — hoãn theo quyết định 28/07/2026 (DBA giám sát qua Step Functions).

### 4.4. Ngưỡng UI đến từ snapshot, KHÔNG hardcode client (chốt Risk #9, 29/07/2026)

Ban đầu FE tô màu gauge exposure / progress bar side-bet bằng hằng số hardcode (`EXPOSURE_WARN_PCT_DEFAULT=60`, `SIDEBET_SKEW_PCT_DEFAULT=70`) + `maxSetsForFixed` cứng (50/12/5). Rủi ro: staff chỉnh ngưỡng trong `GlobalConfig.ops.alerts` thì màu UI lệch với alert thật worker sinh — "gauge xanh nhưng alert đỏ".

**Sửa:** snapshot response thêm block `thresholds` (server đọc thẳng `GlobalConfig`):

```ts
thresholds: {
  exposureWarnPct: number;      // ops.alerts.exposureWarnPct — tô gauge Exposure card
  sidebetSkewPct: number;       // ops.alerts.sidebetSkewPct — tô progress bar side-bet
  comboSetsWarn: { pick8; pick9; pick10 };
  maxSetsForFixed: { pick8; pick9; pick10 };  // payoutCaps.pickNMaxSetsForFixed — mẫu số ratio capSets
}
```

Đồng thời snapshot thêm `cappedExposure` (worst-case ĐÃ cap) tách khỏi `stats.exposure` (RAW). FE lấy `worstCaseTotal` từ `cappedExposure`, ngưỡng từ `thresholds` — hằng số client chỉ còn là fallback lúc slice chưa về (loading). **Nguyên tắc nhân rộng: mọi ngưỡng tô màu UI phải đến từ response, không hardcode — hằng số client chỉ được phép là fallback loading.**

### 4.5. Hiển thị tài khoản — ưu tiên username, luôn kèm accountId (chốt 29/07/2026)

Mọi chỗ hiển thị tài khoản (Top người chơi, Top phải trả tiềm năng, combo lookup accounts) tuân quy tắc:

- **Ưu tiên `username` (snapshot lúc cược)** làm nhãn chính; rỗng `""` → fallback `accountId`.
- **LUÔN kèm `accountId`** ở dòng phụ / `title` tooltip để staff link tới hồ sơ tài khoản khi cần điều tra.
- `username` là **snapshot** từ `entry.username` lúc worker xử lý (KHÔNG query bảng account riêng) — nhất quán với cách combo-stats lưu tên. Username đổi giữa các entry thì "cái mới nhất thắng".
- **Đặt tên field là `username` (KHÔNG `accountName`)** — đồng nhất với `TicketEntryDoc.username`/`kenoTickets.username` (nguồn dữ liệu gốc). Tránh 2 tên khác nhau cho cùng 1 khái niệm trên cùng pipeline (soát lại 29/07/2026, đổi từ `accountName` ban đầu).
- Data pipeline: `EntryForStats.username` (mapper đọc `d.username`) → `TopAccountStat.username` (`game-core`) / `KenoTopPotential.username` / `KenoComboAccountStat.username` → DTO snapshot/combo-lookup → UI adapter → component `AccountLabel`.
- **Game sau (áp dụng chung):** mọi shape account stat mới PHẢI dùng tên field `username` cho username snapshot, không tự đặt tên khác (`accountName`, `playerName`, …).

### 4.6. Thao tác trên bảng số + heatmap 2 chỉ số (chốt 29/07/2026, cập nhật lần 2)

Bảng số của game (Keno 80 số; game khác: grid số tương ứng) là **bề mặt tương tác chính** để staff thao tác, KHÔNG chỉ để xem heat. Pattern chốt để mọi game follow:

**a) Bảng số — chọn số tuỳ ý:**
- **Bảng số LUÔN cho click chọn** — mỗi cell render `<button>` (accessibility: `aria-pressed`, keyboard), số đã chọn có ring nổi bật (sky). **KHÔNG** có nút bật/tắt "select mode". Chọn là hành vi mặc định, luôn sẵn sàng.
- **Chọn BAO NHIÊU số tuỳ ý** — KHÔNG giới hạn 8/9/10 ở bảng. Selection phục vụ **nhiều thao tác** (không riêng tra cứu combo): export, so sánh, các thao tác tương lai. Ràng buộc 8/9/10 chỉ áp dụng bên trong dialog tra cứu combo, không ở bảng.

**b) Action menu ⋯ + dialog thao tác (không render inline):**
- **Action menu ⋯** ở **góc phải header Card**, dùng `DropdownMenu` — chứa các **thao tác trên bảng số**. Điểm mở rộng chuẩn: hiện tại "Tra cứu P8/9/10" (enable khi đã chọn ≥ 1 số); về sau thêm export, so sánh 2 kỳ, v.v. ("Bỏ chọn tất cả" chuyển ra ngoài menu — xem c2.)
- **Mỗi thao tác mở dialog riêng** (`Dialog`) với nội dung chuyên biệt — **KHÔNG render inline dưới bảng** như component tách rời. Dialog tra cứu chứa: input CSV editable (đồng bộ 2 chiều với selection) + chips số đã chọn (click chip = bỏ) + counter "Đã chọn N số · pickN / cần 8/9/10" + kết quả. Dialog **tự validate** đúng 8/9/10 (nút Tra cứu disabled nếu sai), play type suy theo số lượng.
- **State `selected` lift lên component cha** (`NumberHeatmap`) làm nguồn sự thật duy nhất; grid + dialog cùng đọc/ghi (§2.3 composition — decouple state khỏi UI con). `useComboLookup` khởi tạo ở cha để menu và dialog dùng chung một mutation.

**c) Heatmap ô — chỉ Dòng tiền + số lượt (BỎ per-number liability, cập nhật lần 3 — 29/07):**
- Mỗi ô hiện: badge số (góc trên trái) · **Dòng tiền** (giá trị chính, giữa) + số lần `Nx`. **Heat intensity nền theo Dòng tiền** — số nóng = số bị dồn tiền nhiều nhất.
- **BỎ HẲN "Rủi ro chi trả" per-number** (cả UI ô lẫn field `KenoNumberStat.potentialWin` ở data). Lý do (xem §3.7 đã sửa): worst-case là thuộc tính của **BOARD** (trả khi trúng đủ ngưỡng), gán vào từng số → 1 board pick10 = 2 tỷ cộng vào cả 10 ô → tổng liability nhân ~10 lần, **vô nghĩa + hiểu nhầm**. Keno quay 20 số/kỳ, "số X ra thì trả Y" là mệnh đề sai. Rủi ro chi trả đo **ở cấp entry** — bảng "Top phải trả tiềm năng" (`topPotential`, per-entry, đúng, không double-count).
- Nhãn UI việt hoá: "Liability" → **"Rủi ro chi trả"** (giữ `liability`/`potentialWin` trong code/data). Các game sau dùng đúng nhãn + **không thêm lại per-number liability**.

**c2) Nút "Bỏ chọn tất cả" ra NGOÀI menu (29/07):** đặt cạnh counter "Đã chọn N số" (nút X), không giấu trong action menu ⋯ — thao tác hay dùng phải nằm sẵn, ít click.

**d) Side bet — gộp phân bổ + hướng lệch vào 1 card compact:**
- **KHÔNG tách** "card số liệu side bet" (donut) và "progress bar hướng lệch full-width" thành 2 khối riêng (dư diện tích, trùng thông tin). Gộp thành **1 card mỗi cặp** (Lớn↔Nhỏ, Chẵn↔Lẻ): header nhãn + badge "lệch X%" khi skew · 2 hướng (nhãn + tiền) 2 đầu · split bar đối xứng · % + hoà ở dưới.
- Hướng chiếm ≥ `sidebetSkewPct` (từ config, không hardcode) → tô amber, khớp ngưỡng alert `sidebet_skew` worker sinh. Bỏ `MiniDonut` cho side bet (split bar đã thể hiện tỷ lệ trực quan hơn).

### 4.7. Alerts panel — format payload theo type, không lộ JSON (chốt 29/07/2026)

Payload alert là `Record<string, unknown>` có field nested (vd `large_bet.top` là mảng entry). Render thô `k=v · k=v` lộ JSON + sinh `[object Object]` — xấu, khó đọc.

- **Formatter `describeAlert(type, payload)`** → `{ summary, chips }`: 1 câu tiếng Việt + các chip số liệu nổi bật, riêng cho từng `KenoOpsAlertType` (large_bet / exposure_threshold / sidebet_skew / cap_sets_near / combo_concentration). Loại chưa có formatter → fallback liệt kê field **primitive** (bỏ object/array, tránh `[object Object]`).
- **Severity trực quan:** chấm màu + viền trái item (đỏ/amber/sky), critical thêm icon ⚠️ ở accordion header. Accordion **mở sẵn** mọi nhóm (`defaultValue`). Chip số cần chú ý (tiền/% rủi ro) tô đỏ (`danger`). Item Ack → mờ.
- **Game sau follow:** mỗi game có bộ alert type riêng nhưng CÙNG pattern — formatter theo type, không render payload thô.

### 4.8. Layout panel số liệu — compact, bao quát, ít trống trải (chốt 29/07/2026, cập nhật lần 3)

Rút kinh nghiệm Keno (nhiều card full-width 1 dòng → trống bên phải, "Bộ số phổ biến"/"Cược gần nhất" cắt số còn 7, đại lý bảng trống, username bất nhất):

- **Hiển thị đủ số** ở "Bộ số phổ biến" (wrap) và "Cược gần nhất" (wrap mỗi entry) — KHÔNG collapse "+N" ở panel có không gian.
- **Cụm rủi ro 3 cột (chốt v3):** [**Top người chơi** | **Top phải trả tiềm năng** | **Bộ số phổ biến**] gom 1 grid (`@1000px:grid-cols-3`, `@640px:grid-cols-2`). Lý do: 3 panel **cùng bản chất "bảng xếp hạng rủi ro/concentration"** (ai dồn tiền / entry trả nặng / bộ nào bị dồn = combo_concentration). Trước đây "Bộ số phổ biến" bị **chôn trong Card heatmap** → heatmap lẫn lộn 2 mục đích (tương tác chọn số vs. bảng xếp hạng). Tách ra → heatmap thuần tương tác, cụm rủi ro đủ 3 chiều + lấp cân đối 3 cột.
- **Thứ tự macro giữ nguyên — rủi ro TRƯỚC, monitoring SAU (chốt v3, cân nhắc đảo → giữ):** cân nhắc đưa Cược gần nhất + Đại lý lên trước cụm rủi ro. **Bác bỏ** — trang này là **giám sát rủi ro**, nguyên tắc "thứ giúp ra quyết định lên đầu". Top phải trả / Top người chơi là mục đích trang → phải thấy trước. Live feed là dòng chảy (cao, cuộn) đưa lên trên sẽ đẩy rủi ro xuống xa; Đại lý (1–2 tenant, ít biến động) giá trị thấp nhất, không lên cao. Live feed sinh động chỉ là giá trị **cảm giác**, không phải giá trị **quyết định**.
- **[Cược gần nhất (rộng `1fr`) | Đại lý (hẹp `24rem`)] 2 cột:** Live feed là dữ liệu live hữu ích nhất → cột **rộng chính**; đại lý (RGS B2B thường 1–2 tenant) → cột **hẹp phải**.
- **Live feed chia 2 CỘT LỆCH theo luật chơi** (gợi ý user, chốt v2): Pick cơ bản cột rộng (`1.7fr`) — cần bề ngang cho nhiều số; Side bet cột hẹp (`1fr`) — chỉ 1 chip. Mỗi cột header (icon + count) + cuộn độc lập → thấy 2 nhóm cùng lúc, không cuộn tuần tự. Container query stack dọc khi hẹp. Cược lớn tô đỏ + chip.
- **Đại lý thích ứng số lượng:** ≤ 3 tenant → mỗi tenant 1 **card giàu thông tin** (rank + % share + bar doanh thu + 3 ô: doanh thu / hoa hồng / người chơi+lượt) thay bảng 1 dòng trống; > 3 → bảng compact cuộn.
- **Top người chơi:** rank badge, tiền cược tô emerald (dòng tiền vào). **Top phải trả:** `potentialWin` (per-entry) trong ô nền đỏ nhạt nhãn "Phải trả". **Bộ số phổ biến:** medal + đủ số (wrap) + boardCount/entryCount. Mỗi dòng người chơi `PlayerOutstandingLink` → drill outstanding player kỳ này.
- **Username nhất quán:** mọi nơi hiển thị `<primary> · <tenant>` qua `PlayerName`/`splitBackofficeUsername`; KHÔNG raw `@`, KHÔNG show accountId (rule `player-display-username.mdc`). accountId chỉ dựng link.
- **Alert account-related → link outstanding:** `large_bet` list entry lớn (`payload.top`) + link `buildOutstandingHref(drawId, accountId, username)` tới trang outstanding (có entry detail dialog) — minh bạch ai/cược gì/bao nhiêu mà không cần endpoint mới.

### 4.9. Tab Config "Vận hành" — khu vực "Bật / tắt loại alert" giàu thông tin (chốt 29/07/2026)

Rút kinh nghiệm Keno: thiết kế đầu tiên của khu vực toggle alert trong tab Config Vận hành chỉ là **list phẳng** `label + Switch`. Vấn đề: không đồng nhất với các field ngưỡng phía trên (vốn đều có tooltip 4 phần), người vận hành không biết mỗi alert nghĩa gì, dựa ngưỡng nào, và **tắt đi thì mất giám sát rủi ro gì**.

**Chốt: mỗi loại alert là 1 hàng giàu thông tin** (`AlertToggleRow` trong `ops-section.tsx`):
- **Icon + badge severity** (đỏ=Critical / amber=Warning / sky=Info) — quét nhanh; palette gom `SEVERITY_STYLES`, `severity` dùng `OpsAlertSeverity` (game-core, không string trần §5.3).
- **Tooltip** (đồng nhất field ngưỡng): *Ý nghĩa · Ngưỡng liên quan (trỏ đúng tên field cột trái) · **Tác động khi TẮT***.
- **Mô tả 1 dòng inline** dưới tên + **cả hàng click được** (`<label htmlFor>`).
- **Trạng thái tắt nhìn thấy rõ:** border-dashed + nền mờ + icon opacity thấp (tắt ≠ ẩn).
- **Header:** badge đếm `N/M đang bật` + banner amber (`BellOff`) khi tắt hết ("worker sẽ không sinh cảnh báo nào").
- Metadata gom 1 mảng `ALERT_META` (type/label/icon/severity/summary/tip), sort severity giảm dần.

**Nhân rộng:** đây là khuôn bắt buộc cho tab Config Vận hành của 6 game còn lại — KHÔNG dùng list phẳng. Guideline layout + checklist đầy đủ: `.cursor/plans/keno-ops-risk-control/ops-config-page-layout.guideline.md` §3.



Đánh giá lại 12 hạng mục đã đề xuất, theo tiêu chí: *giá trị vận hành / chi phí xây / có làm chậm cược không / có thay được bằng thứ đã có không*.

| # | Chức năng | Verdict | Lý do & mục đích cụ thể |
|---|---|---|---|
| 1 | Sửa index `financialDate` | ✅ **KEEP — P0** | Bug thật. 1 file + migration. Mọi query báo cáo theo ngày hưởng lợi ngay. |
| 2 | `keno_draw_betting_stats` + worker | ✅ **KEEP — P0** | Nền móng của mọi thứ khác. Không có nó thì exposure, alert, AI đều không có data rẻ để đọc. |
| 3 | Exposure panel | ✅ **KEEP — P0** | Chức năng duy nhất trả lời "kỳ này tệ nhất mất bao nhiêu" TRƯỚC khi quay. Với nhân ×200.000, đây là khác biệt giữa biết trước và biết sau khi đã trả 10 tỷ. |
| 4 | Cảnh báo cược lớn | ✅ **KEEP — P0**, gộp vào alert framework | Không làm UI riêng — là 1 rule trong `keno_ops_alerts`. |
| 5 | Tách hướng side bet | ✅ **KEEP — P0** | Gần như miễn phí (đã nằm trong schema stats doc), giá trị phát hiện lệch cược tức thì. |
| — | **Alert framework** (trước ở P2 "alert center") | ⬆️ **PROMOTE — P0** | Quyết định lại quan trọng nhất của lần review này: mục tiêu "ít staff nhất" chỉ đạt được khi hệ thống chủ động báo thay vì người nhìn màn hình. Evaluator ở trong worker nên chi phí ≈ 0. UI chỉ là badge + panel ack. |
| 6 | Baseline so sánh draw | ✅ **KEEP — P1**, thu gọn | Chỉ 2 con số: revenue & entries hiện tại so trung bình 12 kỳ gần nhất cùng khung giờ (đọc từ 12 stats doc đã final — rẻ). KHÔNG xây hệ thống baseline phức tạp. Là input cho rule `revenue_anomaly`. |
| 7 | Player concentration | ✅ **KEEP — P1** | `topAccounts` đã nằm sẵn trong stats doc (P0), P1 chỉ là hiển thị + rule alert khi 1 account >X% doanh thu draw. Công cụ chính phát hiện syndicate. |
| 8 | Settle progress monitor | ⏸️ **DEFER** (28/07/2026) | User quyết: DBA giám sát riêng qua AWS Step Functions worker — không trùng việc. Giữ alert type `settle_stuck` trong schema để dành, làm sau nếu thực tế cần. |
| 9 | Drill-down heatmap → entries | ⬇️ **DEMOTE — P2** | Dùng khi điều tra (ít), on-demand aggregation theo `drawId` index chấp nhận được. KHÔNG tạo multikey index cho nó. Chỉ xây sau khi thấy nhu cầu điều tra thật. |
| 10 | RTP realtime theo ngày | ❌ **CUT** (gộp) | Không cần trang riêng: payout ratio đã có sau settle; RTP lý thuyết từ `rules/odds.ts` chỉ là 1 đường reference vẽ thêm vào KPI. Trang RTP riêng là chức năng dư thừa điển hình. |
| 11 | Exposure multi-draw | ✅ **KEEP — P2** | Giá trị thật (liability tương lai vô hình) nhưng cần aggregation trên tickets `drawPlan` — để sau khi P0 vận hành ổn và có số liệu vé multi-draw thực tế. |
| 12 | Alert center | — **MERGED** vào #P0 alert framework | Không còn là hạng mục riêng. |
| 13 | Heatmap lớp Liability (`potentialWin` per số) | ❌ **CUT (đảo 29/07)** | Ban đầu thêm mức (b). Sau phát hiện SAI: worst-case là của board, gán per-number double-count ~10 lần → vô nghĩa + hiểu nhầm. Đã bỏ khỏi data + UI. Rủi ro chi trả đo ở cấp entry (topPotential) là đủ. Xem §3.7 (đã sửa). |
| 14 | Combo stats pick 8/9/10 + tra cứu staff | ✅ **NEW — P0** | Cùng insert stream worker, thêm 1 bulkWrite. Nguồn của rule `combo_concentration` (phát hiện syndicate) và drill-down `capSets`. Xem 3.8. |
| 15 | Tra cứu combo cho player (ownership-gated) | ✅ **NEW — P1** | Data đã có từ #14; P1 chỉ là endpoint player + UI + player-sdk. **Chốt 28/07/2026: realtime nhưng CHỈ cho player đã cược đúng combo đó** — probing phải trả tiền thật, không cần cơ chế chốt salesClosed. Giá trị thương hiệu: cap chia đều kiểm chứng được → "hệ thống không cheat". |

**Kết quả sau review (cập nhật 29/07/2026): 7 hạng mục P0, 3 hạng mục P1, 2 hạng mục P2, cắt 2 (thêm #13 per-number liability), hoãn 1.** Tổng bề mặt UI mới chỉ gồm: 1 exposure card, 1 alert badge+panel (format payload theo type), heatmap ô hiển thị Dòng tiền + số lượt (KHÔNG per-number liability), **chọn số tuỳ ý trên bảng 80 số + action menu ⋯ + dialog tra cứu** (không component inline), 2 bảng top nhỏ (top phải trả = per-entry), side bet card gộp phân bổ + hướng lệch, 1 section config "Cảnh báo vận hành" — còn lại là nâng cấp ngầm (data layer).

## 6. Ứng dụng AI vào vận hành — đánh giá thực tế

Nguyên tắc: **AI không bao giờ tự ra quyết định tài chính** (void, đổi cap, khoá account) — AI đề xuất, người duyệt. Và AI chỉ hữu ích khi có data nền tốt: stats doc + alerts (P0) chính là "cảm biến" cho AI — làm P0 trước, AI sau.

| Giai đoạn | Ứng dụng | Bản chất | Đánh giá |
|---|---|---|---|
| **A. Ngay sau P0** | **Anomaly detection thống kê** (không cần LLM) | z-score/EWMA trên chuỗi stats doc theo khung giờ: revenue, entries, tỉ lệ playType, skew side-bet. Chạy trong worker, bắn alert `revenue_anomaly`. | ⭐ Giá trị/chi phí tốt nhất. Đừng gọi nhầm là "AI project" — là statistics, vài trăm dòng code, không phụ thuộc vendor. |
| **A. Ngay sau P0** | **Báo cáo ca trực tự động (LLM)** | Cuối ngày/ca: LLM nhận JSON các stats doc + alerts → viết báo cáo tiếng Việt: tổng quan, kỳ bất thường, top rủi ro, việc cần theo dõi. Batch, không realtime, sai không gây hại tiền. | ⭐ Điểm bắt đầu LLM an toàn nhất. Tiết kiệm giờ viết báo cáo mỗi ngày, dễ nghiệm thu. |
| **B. Khi A ổn** | **Alert enrichment (LLM + tool-calling)** | Alert `critical` bắn ra → agent tự gom context (lịch sử account, các draw gần đây, vé liên quan) → đính "incident card" tóm tắt + gợi ý hành động vào alert. Staff mở alert là có sẵn bức tranh, không phải tự đi query. | ⭐⭐ Nhân sức 1 staff lên nhiều lần — đúng mục tiêu ít người vận hành. Cần API đọc nội bộ + prompt kỹ. |
| **B. Khi A ổn** | **Trợ lý điều tra hỏi-đáp** | Chat trong backoffice: "kỳ này account nào cược pick10 nhiều nhất?" → LLM gọi tool đọc stats/entries (READ-ONLY, qua use-case có sẵn). | ⭐⭐ Hữu ích khi 1 staff coi 7 game. Rủi ro thấp vì read-only. Làm sau enrichment vì cần bộ tool đọc giống nhau. |
| **C. Dài hạn** | **Phát hiện syndicate bằng ML** | Clustering account theo hành vi (tổ hợp số trùng, timing, tenant, mệnh giá) — batch job hằng ngày, output là điểm nghi ngờ đưa vào alert. | Cần vài tháng data thật + người hiểu ML để nuôi. KHÔNG làm sớm — rule-based (top combo + topAccounts + alert ngưỡng) đã bắt được 80% case đơn giản. |
| — | Tự động void/chặn cược bằng AI | — | ❌ **Không làm.** Quyết định tiền bạc phải có người. Sai 1 lần mất uy tín hơn mọi chi phí staff tiết kiệm được. |

**Lộ trình khuyến nghị:** P0 (data nền) → A (statistics + báo cáo LLM) → B (enrichment + trợ lý) → C (ML) — mỗi bước đứng được một mình, dừng ở đâu cũng có giá trị.

> **Quyết định (28/07/2026):** Giai đoạn A chỉ bắt đầu **sau khi hoàn tất toàn bộ P0–P2**, không chạy song song P1.

## 7. Câu hỏi mở

- ~~Ngưỡng cảnh báo đặt ở đâu, tĩnh hay động?~~ → **Đã chốt (28/07/2026): section `ops` (alerts + stats) trong GlobalConfigDoc, tab "Vận hành" trên trang config game, động ngay từ P0** (thiết kế 3.9).
- ~~Worker stats chạy chung infra worker hiện có hay Lambda riêng?~~ → **Đã chốt (28/07/2026): handler `apps/worker-keno/src/handlers/stats/`, use-case extends `SingleRunWorker` (`packages/worker-core`), EventBridge cron 1 phút (`src/functions/stats.yml`). Cadence <1 phút giải bằng intra-invocation loop có `sleep(tickSeconds)` (default 10s, cấu hình động) — invocation sống ~55s như feed-sync (timeout 900s), lock TTL chống chồng lấn. Tiền lệ feed-sync đã dùng loop dài + extendLock; thêm sleep giữa vòng là mở rộng nhỏ có chủ đích.**
- ~~Trang minh bạch combo: sau đóng cược hay realtime?~~ → **Đã chốt (28/07/2026): realtime nhưng ownership-gated — chỉ player đã cược combo đó mới tra được** (thiết kế 3.8).
- ~~Top-K bao nhiêu?~~ → **Đã chốt (28/07/2026): tách riêng từng loại — `ops.stats.topCombosK` (default 100, zod 20–200), `topPotentialK`/`topAccountsK` (default 50, zod 20–100); UI phân trang 20 client-side.**
- ~~Có cần realtime push (SSE/WebSocket) không?~~ → **Đã chốt (28/07/2026): KHÔNG giai đoạn này — polling 10s (khớp cadence worker 1 phút + ETag 304), gom cả trang về 2 timer (snapshot + live-feed), xem 4.1.**
- ~~Scope P0~~ → **Đã chốt (28/07/2026): user approve toàn bộ 7 hạng mục P0** (bảng verdict §5). Plans chưa tạo — còn điểm user muốn thảo luận thêm trước khi lên plan.

## 8. Nguyên tắc nhân rộng sang 6 game còn lại

- Toàn bộ pattern (stats collection / worker / alerts / exposure) generalize được: `{game}_draw_betting_stats`, `{game}_ops_alerts`. Phần khác nhau duy nhất là **shape của `byPlayType`/`numberFreq`/công thức exposure** — đúng chỗ mỗi game vốn đã khác nhau trong analytics UI hiện tại.
- Game có Jackpot (mega645/power655/lotto535): exposure đơn giản hơn Keno rất nhiều — liability giải cố định tính chính xác được per-outcome không cần proxy; jackpot đã có cơ chế riêng.
- Thứ tự triển khai đề xuất: Keno (khó nhất, chứng minh pattern) → Bingo18 (chu kỳ nhanh tương tự) → nhóm jackpot → Max3D/Pro.
- **Types/interfaces dùng chung đặt vào `@megawin/game-core/types` NGAY TỪ P0** (chốt 28/07/2026 — đảm bảo DRY cho game thứ 2 trở đi):
  - `DrawBettingStatsBase<TByPlayType>` — khung stats doc chung (`drawId`, `updatedAt`, `totals`, `byTenant`, `topAccounts`, `lastEntryId`…); phần shape riêng từng game (`byPlayType`, `numberFreq`, exposure) là generic param / extend ở package game.
  - `OpsAlertBase`, `OpsAlertStatus`, `OpsAlertSeverity` — khung alert doc + lifecycle (`new`/`ack`/`resolved`).
  - `OpsAlertsConfigBase`, `OpsStatsConfig` (3 field top-K) — khung section `ops` trong GlobalConfig; ngưỡng đặc thù game (vd `comboSetsWarn` của Keno) extend ở `game-keno`.
  - Mỗi game **re-export qua entity barrel** đúng tiền lệ `DrawSales`/`DrawVietlottRef`/`DrawTenantFinancial` hiện có (rule `code-quality-standards` §5.1 — import named type từ game-core, KHÔNG indexed-access).
- Phần **code thực thi** (worker evaluator, use-cases, aggregation): viết trong `game-keno-application` ở P0, chỉ tách skeleton chung vào `game-core` khi triển khai game thứ 2 — types chia sẻ sớm là DRY đúng chỗ, còn abstraction logic khi mới có 1 use case là đoán mò (KISS).

## 9. Kỷ luật triển khai — đồng bộ hệ thống hiện có (BẮT BUỘC cho mọi plan phái sinh)

> Chốt 28/07/2026: **KHÔNG tự sinh code/kiến trúc mới ở bất kỳ tầng thiết kế nào.** Mọi thứ trong analysis này đều có tiền lệ trong codebase — plan và code phải trỏ về pattern sẵn có, tuân đúng rules/skills của project. KISS & DRY.

### 9.1. Bảng rule/skill ràng buộc theo tầng

| Tầng | Rule / Skill phải tuân | Áp dụng cụ thể cho feature này |
|---|---|---|
| **Entity + MongoDB** | `mongodb.mdc`, `entity-typesafe-mongodb.mdc`, `cache-design.mdc` | Stats/combo/alert doc khai báo entity + index theo pattern `packages/game-keno/src/entities` + `indexes` hiện có; query dùng `docPath` type-safe, KHÔNG string dot-notation trần; bulkWrite/aggregation theo pattern repo hiện hữu. |
| **Type dùng chung** | `code-quality-standards.mdc` §5 (DRY, checklist tìm type trước khi tạo), §5.1 (named type từ game-core, cấm indexed-access) | Base types vào `@megawin/game-core/types`, re-export qua entity barrel từng game — đúng tiền lệ `DrawSales`/`DrawTenantFinancial` (§8). |
| **Layering package** | `operator-monorepo-structure.mdc` §6 (domain pure / application infra), pattern `game-*` ↔ `game-*-application` | Domain (entities/rules) trong `game-keno`; repos/use-cases/worker logic trong `game-keno-application` (`use-cases/<group>/`, `infras/repos/`, barrel index.ts, subpath exports). Handler mỏng trong `apps/worker-keno` — logic nằm ở use-case, không nằm ở handler. |
| **Worker** | `SingleRunWorker` (`packages/worker-core`) + handlers `apps/worker-keno/src/handlers/{feed,outstanding}` + `serverless.yml`/`src/functions/*.yml` | Use-case extends `SingleRunWorker` (implement `ttlSeconds`/`resolveLockKey`/`runLocked`, checkpoint qua `setCursor`) — copy `SyncEntryFeedUseCase`. Handler thin `useCase.run()`. Schedule = EventBridge cron `src/functions/stats.yml`. KHÔNG dùng `withLock` (plan `.md` cũ lỗi thời), KHÔNG intra-invocation sleep. |
| **API backoffice** | Builder `withApi()` (`@/lib/api`) + route mẫu `apps/backoffice/src/app/api/keno/operations/snapshot/route.ts` + `_lib/schema.ts` | Route dùng `withApi().auth({roles:[CompanyRole.Staff]}).query(zodSchema).handler(...)` — KHÔNG viết `export async function GET` thủ công. Use-case khởi tạo module scope, handler return plain object. |
| **Data-fetching FE** | `kenoKeys` (`apps/backoffice/src/lib/query-keys/keno.ts`) + hooks `operations/_lib/use-operations.ts` + skill `vercel-react-best-practices` | Mở rộng `kenoKeys` + hooks — `apiClient.get<T>(`${BASE}/route`, {params})`, `refetchInterval: isSettled ? false : 10_000`, `staleTime`, `select` slice. KHÔNG tạo fetcher/query-key system mới. |
| **UI components** | `operations-page-ui.mdc` (zone order, `game-number-tokens.ts`, NumberBadge inline mỗi game, `text-xs`/`tabular-nums`), `game-config-ui.mdc` (§14 nuqs tab, §16 tooltip), skill `shadcn`, `web-design-guidelines` | Component per-game trong `sections/analytics/` (NumberHeatmap, PlayTypeCard, LiveFeed) — mở rộng tại chỗ, dùng token `game-number-tokens.ts`. Tooltip: `Tooltip` từ `components/ui/tooltip.tsx`; `HeaderTooltip` là local helper copy trong section (không shared). Thiếu primitive → shadcn registry. |
| **Composition React** | Skill `vercel-composition-patterns` (compound components, không boolean-prop proliferation), React 19 (`use()`, không `forwardRef`) | Panel mới nhận data qua props/context slice — không thêm boolean prop chế độ vào component cũ. |
| **Business rules** | `keno-game-rules.mdc` (play types, prize table, caps, lifecycle) | Công thức exposure/potentialWin/capSets phải đọc từ `rules/odds.ts` + config caps hiện có — KHÔNG hardcode lại bảng thưởng ở tầng nào khác. |
| **Comment/JSDoc** | `code-quality-standards.mdc` §1–4 | JSDoc `/** */` cho entity field (đơn vị VND, công thức), class use-case (pipeline position, idempotency); `//` giải thích business step trong worker. |
| **Typing tập giá trị đóng** | `code-quality-standards.mdc` §5.3 (const object as const + type dẫn xuất) | MỌI union (`KenoOpsAlertType`, `OpsAlertStatus`, `OpsAlertSeverity`, playType…) khai `const {...} as const` + `type = typeof[keyof typeof]`, so sánh qua member — KHÔNG string literal trần. Base chung → game-core; đặc thù → entity game. |

### 9.2. Quy tắc bắt buộc trong từng plan file

- Mỗi plan **PHẢI có mục "Pattern tham chiếu"**: liệt kê file hiện hữu làm mẫu cho từng phần (vd: entity mẫu, repo mẫu, hook mẫu, section UI mẫu) — người/agent thực thi copy pattern, không sáng tác.
- Trước khi khai báo type/component/helper mới: chạy checklist tìm-trước-khi-tạo (`code-quality-standards` §5) trong `game-core`, `game-keno*`, `apps/backoffice/src/components` — có rồi thì import.
- Không đổi `pnpm-workspace.yaml`/`turbo.json`; không thêm dependency mới khi codebase đã có thứ tương đương.
- UI/UX mới phải không phân biệt được về "chất liệu" so với trang hiện có (màu, spacing, token, typography) — staff không nhận ra đây là phần mới ghép vào.

### 9.3. Kỷ luật xoá dead code khi migrate on-demand aggregation → pre-aggregated snapshot

> Phát hiện thực tế (review 28/07/2026 sau khi p0-07 đã "done"): chuyển 1 trang từ nhiều
> aggregation on-demand sang 1 snapshot pre-aggregated **luôn để lại dead code ở tầng
> backend** — vì FE hết gọi route cũ nhưng route/use-case/repo method cũ **không lỗi
> compile**, `check-types` xanh dù không ai dùng. Route đã xoá minh chứng:
> `get-ops-summary.ts`/`get-tenant-breakdown.ts`/`get-number-frequency.ts`/
> `get-playtype-distribution.ts`/`get-top-combos.ts` + 5 route Next.js + 5 aggregation
> method nặng trong `entry-repo.ts` (unwind boards/numbers toàn bộ entries) + 2 Zod schema +
> 5 query key — tất cả sống sót qua build xanh nhiều ngày.

**Checklist BẮT BUỘC trước khi đóng plan "migrate sang snapshot" (Keno hoặc game sau):**

1. Liệt kê TOÀN BỘ route/use-case/hook cũ mà section sắp thay bằng snapshot slice.
2. Sau khi FE chuyển xong sang `select` slice từ snapshot — **grep tên use-case cũ + tên
   route path cũ trên TOÀN REPO** (không chỉ trong folder game đang sửa). 0 kết quả ngoài
   plan/analysis doc (lịch sử) → an toàn xoá.
3. Xoá theo thứ tự ngược dependency graph (outer → inner), mỗi bước grep lại xác nhận 0
   consumer trước khi xoá bước sau: **Route Next.js/Hook FE → Query key → Use-case → DTO →
   Repo aggregation method** (repo method luôn ở sâu nhất, dễ sót nhất vì không FE nào gọi
   trực tiếp).
4. Xoá luôn thư mục route rỗng còn sót (`rmdir` sau khi xoá `route.ts`).
5. Verify `check-types` + lint TOÀN BỘ package application + `apps/backoffice` (xoá `.next/`
   cache trước nếu backoffice báo lỗi module không tồn tại — đó là type cache stale của
   route đã xoá, không phải lỗi thật).
6. Ghi lại vào plan (`p0-07` tương ứng) + `00-overview.md` phần "Dead code cleanup" — để
   review lần sau (hoặc game khác copy pattern) biết chính xác cái gì đã bị thay, không lặp
   lại việc giữ 2 nguồn dữ liệu song song (on-demand cũ + pre-aggregated mới) vô thời hạn.

## 10. Plans phái sinh — ĐÃ TẠO (28/07/2026)

Thư mục `.cursor/plans/keno-ops-risk-control/` đã được tạo theo quy ước `.cursor/plans/README.md`. Trạng thái chi tiết ở `00-overview.md`.

```
.cursor/plans/keno-ops-risk-control/
├── 00-overview.md                        # master: bảng trạng thái + thứ tự thực thi + định nghĩa Done
├── p0-01-entry-indexes-fix.plan.md       # sửa 3 index drawDate → financialDate + migration
├── p0-02-game-core-ops-types.plan.md     # base types §8 vào @megawin/game-core/types
├── p0-03-draw-betting-stats.plan.md      # collection stats + worker (SingleRunWorker, cron 1 phút + intra-invocation loop sleep tickSeconds)
├── p0-04-combo-stats.plan.md             # keno_draw_combo_stats (pick 8/9/10) + tra cứu staff
├── p0-05-ops-config.plan.md              # GlobalConfigDoc.ops + tab "Vận hành" trang config (tooltip §16)
├── p0-06-ops-alerts.plan.md              # alert framework: collection + evaluator (trong worker) + đọc/ack
├── p0-07-operations-page.plan.md         # snapshot endpoint (7→2 timer) + tách 2 tab + exposure/heatmap 2 lớp/combo lookup/side-bet bars/alert
└── p1-01-combo-transparency.plan.md      # endpoint player ownership-gated + player-sdk + UI
```

Mọi plan tuân §9 (kỷ luật triển khai) và có mục "Pattern tham chiếu" trỏ file mẫu thực tế trong codebase.

**Cập nhật 28/07/2026 (sau khi cả 8 plan đã "done"):** review riêng phát hiện dead code sót
lại ở tầng backend khi p0-07 chuyển sang snapshot (§9.3) — đã xoá sạch, chi tiết ghi ở
`p0-07-operations-page.plan.md` §"Dead code cleanup" và `00-overview.md` §"Review sau triển
khai" mục 9.

## 11. Review rủi ro sau triển khai — 29/07/2026 (BẮT BUỘC đọc trước khi nhân rộng)

Review kỹ toàn bộ code đã implement phát hiện & sửa các rủi ro kỹ thuật/dữ liệu sau. **Mọi game sau PHẢI tránh lặp lại — đã đưa vào thiết kế chuẩn §3.3/§3.4/§4.4/§4.5.**

| # | Rủi ro | Triệu chứng | Sửa | Nơi ghi thiết kế |
|---|---|---|---|---|
| **1** | Watermark GLOBAL `min(lastEntryId)` cho mọi open draw | Query `_id > globalMin` đọc lại hàng loạt entry đã cộng của draw có watermark cao hơn → lãng phí I/O, rủi ro double-count | Watermark **per-draw**, lặp từng draw query `{drawId, _id>lastEntryId[draw]}` | §3.3 bước 1 |
| **2** | Thiếu index cho query per-draw watermark | Query `{drawId,_id>X}` COLLSCAN nếu không có compound index | Thêm `{drawId:1,_id:1}` (`idx_draw_id`) | §3.3 + §3.6 |
| **3** | Recompute CHỈ target `salesClosed` | Draw nhảy `salesClosed→Published→Settling` giữa 2 tick → miss recompute cuối → số chốt sai | **Đã giải quyết bằng cách XOÁ recompute (01/08)**: hàng đợi việc là `findNotFinal()` — trạng thái *công việc*, không phải status draw → không thể "miss" khi draw nhảy status | p2-01 §3.5 |
| **4** | Lưu exposure ĐÃ cap trong doc | Void compensation trừ trên baseline đã cap → worst-case lệch (cap là hàm `min` non-linear) | Lưu RAW, cap `capExposureByPlayType` chỉ lúc build response/eval alert | §3.2 + §3.4 |
| **5** | `topCombos.accounts` reset mỗi invocation | Non-cappable combo không cross-invocation distinct → đếm player thiếu | Seed `baselineAccounts` từ doc; report `max(baseline, live.size)`. (Cappable combo dùng `keno_draw_combo_stats` chính xác tuyệt đối) | §3.8 |
| **6** | Ghi stats doc vô điều kiện mỗi tick | `updatedAt` nhảy liên tục dù không có bet mới → phá ETag/304 → FE re-render thừa | Conditional write: chỉ ghi khi `applied>0 \|\| voidApplied>0` | §3.3 bước 3 |
| **8** | Indexed-access type `OpsConfig["alerts"]["comboSetsWarn"]` trong DTO/use-case | Vi phạm `code-quality-standards` §5.4, che tên type | Tạo `UpdateOpsInput` interface tường minh | §9.1 (typing) |
| **9** | Ngưỡng UI hardcode client (`EXPOSURE_WARN_PCT_DEFAULT`…) | Staff chỉnh config → màu UI lệch alert thật | `snapshot.thresholds` từ `GlobalConfig`; hằng số client chỉ là fallback loading | §4.4 |
| **11** | Zod `z.enum(["new","ack",...])` string literal trần | Vi phạm §5.3, gõ nhầm không bị compiler bắt | `z.enum(Object.values(OpsAlertStatus))` derive từ const-as-const | §9.1 (typing tập giá trị đóng) |
| **12** | Retention combo-stats chốt cleanup batch vì kết luận "không có TTL tiền lệ" mà KHÔNG grep trước (30/07) | `packages/game-core` (`TX_INTENT_INDEXES.idx_resolvedAt_ttl`) và `packages/audit` (`AUDIT_LOG_INDEXES.ts_ttl`) đã dùng TTL — kết luận sai, sinh thêm code (`deleteOlderThan`, `cleanupOldCombos`, hằng retention) tốn 1 query/invocation dù 99.9% lần chạy không xoá gì | Đổi sang TTL index `{createdAt:1}, expireAfterSeconds` trong `KENO_INDEXES`; xoá method/hằng cleanup batch | p0-04 §"Review sau triển khai" |
| **13** | **`keno_draw_combo_stats.accounts` là mảng object KHÔNG TRẦN + read-modify-write mỗi tick** (01/08) | Số phần tử = số account cược combo đó (~90–110B/account). 100k account ≈ 10MB → chạm **BSON 16MB** → `bulkWrite` throw → abort invocation → **mất stats + alert toàn game**. Băng thông RMW chết trước cả limit | Tách `keno_draw_combo_accounts` (1 doc/`{drawId,comboKey,accountId}`, `$inc` upsert); doc combo giữ counter vô hướng `accountCount` | p2-01 §3 A1 |
| **14** | **`findConcentrated` dùng `$expr: {$gte:[{$size:"$accounts"},n]}`** (01/08) | `$size` **không index được** → load MỌI combo doc của kỳ mỗi tick (200k combo × 1KB = **200MB/tick**) | Field vô hướng `accountCount` + index `{drawId:1,accountCount:-1}` → IXSCAN range | p2-01 §3 A2 |
| **15** | **`recomputeClosedDraws` giữ full state RAM + không resumable** (01/08) | `cursor` khởi tạo `undefined` mỗi lần chạy, không watermark riêng; `potentials` 1 object/entry (1M entry ≈ 250MB) + `combos` kèm `Set<accountId>` → OOM; timeout = mất sạch → full-scan lại → **livelock: kỳ lớn không bao giờ `final`** | **XOÁ hẳn `recomputeClosedDraws`** (~100 dòng) — không tối ưu nó. Đường ghi realtime đã chính xác thì không còn gì để recompute | p2-01 §3.5 |
| **16** | **Vòng `for(;;)` đọc entries không trần + `extendLock()` gọi SAU tick** (01/08) | Burst cược → tick vượt `ttlSeconds=120` → lock hết hạn **giữa** tick → invocation khác chen vào → 2 writer `upsertFull` từ 2 baseline → **lost-update** (watermark chống double-count nhưng KHÔNG chống ghi đè full-doc) | `extendLock()` **bên trong** vòng đọc (mỗi N batch) + trần entries/tick | p2-01 §3 A3 |
| **17** | **Drift topK trên metric TÍCH LŨY** (01/08) | Accumulator tạo lại mỗi tick, `seed()` chỉ nạp top-K → phần tử rơi khỏi top-K **mất toàn bộ lịch sử**, lần cược sau tính từ 0. Sai ở `topAccounts`/`topCombos` (amount/sets cộng dồn), **KHÔNG** sai ở `topPotential` (metric bất biến per-entry). Sai số **tỷ lệ thuận số người chơi** | **Bỏ mảng top-K khỏi stats doc**: nuôi `keno_draw_account_stats` / `keno_draw_combo_stats` bằng `$inc` upsert (1 doc/phần tử, không cần seed) rồi lấy top-K lúc đọc bằng index sort. Kèm lợi ích: có `uniquePlayers` thật + drill-down 1 account | p2-01 §3.5 |
| **18** | **`upsertFull` `$set` toàn doc + `getManyByDrawIds` không projection** (01/08) | Doc ~33KB (config max 60KB). 1 entry mới 1KB → rewrite 33KB = **write amplification 35×**; D=120 kỳ → ~36GB oplog/ngày. Đọc baseline 25MB/phút **kể cả khi không ai cược** (chi phí idle = D × query cố định, bị bỏ qua vì giả định D=1 — thực tế Keno ~120 kỳ/ngày) | `$inc` theo path cố định cho `totals`/`byPlayType`/`numberFreq`/`exposure`/`capSets`; projection mọi `find` chu kỳ; ghi topK nhịp thưa hơn counters | p2-01 §3 B1 B2 B3 |
| **19** | ~~**Cờ `final: true` không có đường reset khi void**~~ (01/08) — **đánh giá lại cùng ngày: KHÔNG phải bug.** Entry `Void` bị loại **tại nguồn đọc** (§4.2 điểm 2) nên sau void không có gì để trừ; số đã tích là **dấu vết audit hợp lệ** ("trước khi huỷ đã cược bao nhiêu" — quyết định A của user). Rủi ro thật thu hẹp còn: entry bị **SỬA** (không phải huỷ) sau khi final | Giữ `resetFinal(drawId)` ở repo cho **vận hành** ("Tính lại kỳ này"), **KHÔNG** gắn vào `finalize-void.ts` | p2-01 §2 D2 |
| **20** | **Không có nguyên tử cross-collection: watermark tiến TRƯỚC khi ghi combo delta** (01/08) | `upsertFull` (ghi `lastEntryId` vào stats doc) chạy **trước** `bulkUpsertDelta`. Crash giữa 2 lệnh → watermark đã tiến, combo delta **mất vĩnh viễn**. `recomputeClosedDraws` **KHÔNG** cứu được vì nó chỉ gọi `toSnapshot`, chưa bao giờ chạm `combo_stats`. Đảo thứ tự → **cộng đôi** (`$inc` không idempotent). Thiết kế mới thêm `account_stats` → áp cho **3 collection** | Watermark **theo từng document** (`DeltaAccumulatedDoc.lastEntryId`): filter `{...key, lastEntryId:{$lt:batchMaxId}}` + `$inc` và `$set lastEntryId` **cùng 1 lệnh trên cùng 1 doc** → nguyên tử, idempotent, tự hội tụ sau mọi crash. `bulkWrite({ordered:false})` + coi lỗi 11000 là no-op | p2-01 §3.5.7 |
| **21** | **Counter PHÁI SINH cộng bằng `$inc` theo delta** (01/08, phát hiện khi implement) | `accountCount` (trên `combo_stats`) suy ra từ số doc ở `combo_accounts` — **collection khác**. Bản thiết kế đầu định `$inc` theo `upsertedIds` ("số account mới trong batch"): crash giữa 2 lệnh → retry thấy doc account đã tồn tại → không còn "account mới" → counter **thiếu vĩnh viễn**. Watermark KHÔNG cứu được vì delta không nằm cùng doc với watermark | Đếm lại distinct (`$group` giới hạn ở các key **vừa bị chạm trong batch**) rồi `$set` **giá trị tuyệt đối** → idempotent theo bản chất, tự hội tụ | p2-01 §3.5.7, mongodb.mdc §8.7 |
| **22** | **Chi phí IDLE O(D) round-trip: `ensureDoc` gọi trong vòng `for`** (01/08) | Mỗi tick (10s) phải "chạm" mọi kỳ chưa hoàn thành để kỳ mới vào hàng đợi `final:false`. D≈120 kỳ × 6 tick/phút = **43k round-trip/giờ ghi 0 byte** (gần như luôn no-op) | Gom 1 `bulkWrite` (`ensureDocs(drawIds)`). Nguyên tắc: việc "chạm mọi entity mỗi tick" phải là **1 round-trip** | mongodb.mdc §8.8 |
| **23** | **`isOnlyDuplicateKeyError` dựa vào shape `MongoBulkWriteError` không đúng** (01/08, phát hiện khi implement) | Code giả định `writeErrors` luôn là mảng, nhưng driver khai `OneOrMore<WriteError>` (có thể là 1 object) và `error.code` chỉ là lỗi ĐẦU TIÊN → lỗi thật (VD write conflict) có thể bị nuốt thành "đã áp rồi" | Normalize `writeErrors` về mảng rồi `every(code === 11000)`; chỉ khi không có `writeErrors` mới xét `error.code` | `infras/repos/delta-write.ts` |
| **24** | **Tối ưu projection theo COLLECTION thay vì theo ĐƯỜNG THỰC THI** (01/08, phát hiện khi review) | Đã siết `keno_draw_betting_stats` xuống projection mỏng, nhưng cùng tick worker vẫn gọi `getUnfinishedDraws()` + `getDrawsByIds()` **đọc full `DrawDoc`** (`financial`, `settleSummary`, `vietlottRef`, `stats`…) chỉ để lấy `drawId`/`status`; `get-ops-snapshot` (FE poll 10s) gọi `getDrawById` cũng chỉ để đọc `status` | Thêm method **thin, tên riêng** (`listUnfinishedDrawIds` — covered query; `getStatusesByDrawIds` — IXSCAN + projection 2 field) rồi dùng ở đường nóng. KHÔNG tái dùng method full-doc cho hot path | p2-01 §7 mục 21 |

**Đối chiếu 3 game khác (01/08/2026):** bingo18/max3d/max3dpro là bản copy gần 1:1 skeleton Keno →
**lặp lại #15–#19** (8/11 rủi ro của p2-01). **Tránh được #13 #14** nhờ chọn `accounts: number` +
`Set` in-RAM thay mảng object persist — đây là thiết kế **đúng hơn** Keno, và là đích đến khi sửa #13.
Ngược lại max3d/max3dpro **nặng hơn** ở #18 (`tripletStakes` 1000 key ~80KB rewrite mỗi 30s) và
max3dpro nặng nhất ở #15 (expand **380 ordered pair/board**, key space 10⁶, mỗi key kèm `Set`).
Chi tiết + danh sách file: `p2-01-stats-worker-scale-hardening.plan.md` §4–§5.

**Checklist rủi ro BẮT BUỘC cho worker stats game sau (tổng hợp từ bảng trên):**

1. Watermark **per-draw** (không global min). Có compound index `{drawId,_id}` trước khi code query.
2. **KHÔNG viết job recompute full-scan.** Nó chỉ tồn tại để "chữa" đường ghi gần đúng — sửa gốc đường
   ghi (delta-only + `$inc` + watermark per-doc) thì recompute **biến mất** (p2-01 §3.5). Hàng đợi việc
   là `findNotFinal()` (trạng thái công việc), không phải danh sách status hậu-chốt.
3. Giá trị phi tuyến (cap, min/max) → lưu **RAW**, biến đổi ở tầng đọc bằng **hàm thuần idempotent**.
4. **Conditional write** — chỉ ghi khi có delta thật, giữ `updatedAt` ổn định cho ETag/304.
5. Distinct count cross-invocation → **collection detail 1 doc/entity** (`$inc` upsert) rồi
   `countDocuments`. KHÔNG dùng `max(baseline, live)` — đó là band-aid, vẫn drift ở các field tích luỹ
   khác của cùng phần tử (đã bỏ khi implement p2-01).
6. Type: KHÔNG indexed-access (§5.4), KHÔNG string literal trần cho tập đóng (§5.3), Zod `z.enum` derive từ const object.
7. Ngưỡng UI từ response (`thresholds`), KHÔNG hardcode client.
8. Hiển thị account: **username ưu tiên, luôn kèm accountId** (§4.5).
9. **Retention collection stats/combo: TTL index là lựa chọn ĐẦU TIÊN** — PHẢI grep
   `expireAfterSeconds` toàn repo trước khi kết luận "không có tiền lệ". Chỉ cleanup batch tự
   viết khi điều kiện xoá phức tạp hơn 1 field Date, hoặc cần log số lượng đã xoá mỗi lần.
10. **KHÔNG mảng object không trần trong document.** Nếu số phần tử phụ thuộc **số người chơi**
    (không phải hằng số nghiệp vụ) → tách collection riêng ghi bằng `$inc` upsert, doc cha giữ
    counter vô hướng. BSON 16MB là hard limit; RMW mảng lớn chết trước đó vì băng thông.
11. **KHÔNG filter theo `$size`/`$expr` trên field mảng** — không index được → COLLSCAN. Luôn
    duy trì counter vô hướng song song + index trên counter.
12. **Phân loại top-K TRƯỚC khi code:** metric **bất biến per-item** (`potentialWin`) → top-K an
    toàn. Metric **tích lũy** (amount/sets cộng dồn) → top-K **KHÔNG** an toàn, phải nuôi từ nguồn
    đầy đủ rồi lấy top-K khi đọc. `Math.max(baseline, current)` là band-aid, không phải fix.
13. **Vòng lặp đọc dữ liệu trong worker có lock phải đủ 3 điều kiện:** (a) `extendLock()` gọi
    **BÊN TRONG** vòng lặp, (b) có trần số item/tick, (c) resumable bằng watermark persist. Thiếu
    1 trong 3 → livelock hoặc 2 writer song song ở tải cao.
14. **Vòng lặp per-entity phải có try/catch riêng** — 1 entity lỗi không kéo sập cả invocation.
15. **Nếu vẫn buộc phải có job backfill/one-off** (VD nhập dữ liệu lịch sử) — **KHÔNG chạy chung tick
    loop với job realtime**: tách lock + handler, nếu không 1 entity lớn đóng băng toàn bộ cập nhật
    realtime (alert trễ = rủi ro nghiệp vụ). Nhưng ưu tiên là **không có job đó** (mục 2).
16. **Document lớn thì `$inc` theo path cố định, KHÔNG `$set` toàn doc.** Write amplification =
    kích thước doc / kích thước delta. Ước lượng doc size từ **config Zod max**, không từ default.
17. **Mọi `find` chạy theo chu kỳ phải có projection.** Chi phí idle = D (số entity đồng thời) ×
    số query cố định × tần suất — tồn tại **dù không có giao dịch nào**. Ước lượng D thực tế
    trước khi thiết kế, **không giả định D=1**.
18. **Cờ `final`/`completed` phải có đường reset** khi dữ liệu nguồn bị **sửa**, nếu không sai số là
    **vĩnh viễn**. (Riêng *huỷ* thì không cần, nếu bản ghi huỷ đã bị loại tại nguồn đọc — xem risk #19.)
    Và cờ phải đặt trên trạng thái **terminal THẬT** — đọc use-case chuyển status để biết trạng thái đó
    có quay lại được không (`SalesClosed → SalesOpen` là **hợp lệ** trong Keno!). Cờ "xong" trên trạng
    thái tạm = bom hẹn giờ.
19. **Ghi `$inc` sang N collection trong 1 batch → MỖI collection phải có watermark riêng.** Không
    có nguyên tử cross-collection: crash giữa 2 lệnh ghi → mất delta (nếu cursor đã tiến) hoặc
    cộng đôi (nếu đọc lại). Đảo thứ tự ghi chỉ đổi loại lỗi. Fix: filter
    `lastEntryId:{$lt:batchMaxId}` + `$inc` và `$set lastEntryId` **cùng 1 lệnh trên cùng 1 doc**
    → tự hội tụ sau mọi crash, không cần transaction. Cạm bẫy: upsert với filter `$lt` sẽ sinh lỗi
    **11000 khi batch đã áp** — đó là no-op đúng thiết kế, phải `bulkWrite({ordered:false})` và bỏ
    qua 11000, KHÔNG bỏ điều kiện watermark.
20. **Idempotency phải là thuộc tính của LỆNH GHI, không phải của job dọn dẹp.** Nếu tính đúng đắn
    phụ thuộc "recompute sẽ sửa sau" thì mọi lúc chưa recompute là **đang sai mà không ai biết**.
    Lệnh ghi tự an toàn → recompute/đối chiếu hạ cấp thành **giám sát**, không phải cơ chế.
21. **Hai code path cùng tính một con số = một trong hai sẽ sai.** Nếu path B tồn tại để "sửa"
    path A, hãy hỏi **vì sao A gần đúng** — thường do một **quyết định lưu trữ có thể đảo được**
    (`$set` full doc → phải seed → seed chỉ có top-K); đảo nó thì B **biến mất**.
22. **Counter PHÁI SINH từ collection khác thì `$set` TUYỆT ĐỐI, không `$inc` theo delta.** Watermark
    chỉ bảo vệ counter mà delta nằm cùng doc với nó. Đếm lại (giới hạn ở các key **vừa bị chạm trong
    batch**) rồi ghi tuyệt đối → idempotent theo bản chất.
23. **Việc "chạm mọi entity mỗi tick" phải là 1 round-trip (`bulkWrite`), không N.** `ensureDoc` trong
    vòng `for` = D round-trip/tick chỉ để no-op — chi phí cố định tồn tại dù không ai cược.
24. **Đọc kỹ signature thật của driver trước khi dựa vào nó.** `MongoBulkWriteError.writeErrors` khai
    `OneOrMore<WriteError>` (có thể là object đơn, không phải luôn là mảng); `error.code` chỉ là lỗi
    ĐẦU TIÊN. Kiểm tra "toàn bộ lỗi đều là 11000" phải normalize về mảng trước.
25. **Rà projection theo ĐƯỜNG THỰC THI, không theo collection đang sửa.** Liệt kê **mọi lệnh Mongo
    trong 1 tick / 1 request**, mỗi lệnh hỏi "dùng bao nhiêu field trong kết quả?". ≤ 2–3 field →
    thêm method **thin có projection và TÊN RIÊNG**; đừng tái dùng method full-doc cho hot path (tên
    riêng để lần sau không ai dùng lẫn). Tối ưu 1 collection rồi bỏ sót collection kế bên trên cùng
    đường chạy là lỗi rất dễ mắc (risk #24).
