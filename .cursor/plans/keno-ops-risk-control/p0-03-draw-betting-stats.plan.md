# p0-03 — Collection `keno_draw_betting_stats` + stats worker

> **Nguồn:** `.cursor/analysis/keno-operations-risk-control.analysis.md` §3.2, §3.3, §3.4, §3.7, verdict #2/#3/#5/#13.
> **Phase:** P0 · **Phụ thuộc:** p0-02 (base types) · **Blocks:** p0-04, p0-06, p0-07. Evaluator alert cần p0-05.

## Mục tiêu

Tạo collection pre-aggregated 1 doc/draw + worker cập nhật async (không đụng place-bet). Thay toàn bộ ops aggregation on-demand (`aggregateOpsSummary/NumberFrequency/PlayTypeDistribution/TenantBreakdown`) bằng findOne O(1). Bao gồm: totals, byPlayType (side bet tách hướng), byTenant, numberFreq (amount + potentialWin), topCombos, exposure proxies, topPotential, topAccounts.

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Entity Doc | `packages/game-keno/src/entities/draw.ts` (`_id: unknown`, embedded named interface, `{Name}Entity extends Omit<Doc,"_id">`), barrel `entities/index.ts` |
| Enum collection | `KenoCollections` (trong `game-keno` entities/enums) — thêm `BettingStats` |
| Index | `packages/game-keno/src/indexes/index.ts` (`IndexSpec`, `KENO_INDEXES`) |
| Repo | `packages/game-keno-application/src/infras/repos/entry-repo.ts` (extends `BaseRepo`, `bulkWrite`, `aggregate`), `base-repo.ts`; types kết quả → `repos/types/*.types.ts` (rule `mongodb.mdc` §2) |
| `docPath` | `packages/data/src/mongo/dot-path.ts` — `docPath<TDoc>()` |
| Worker use-case | `SyncEntryFeedUseCase` (feed-sync) extends `SingleRunWorker` (`packages/worker-core/src/use-cases/lock/single-run-worker.ts`) |
| Handler thin | `apps/worker-keno/src/handlers/feed/feed-sync.ts` |
| Schedule | `apps/worker-keno/src/functions/outstanding.yml` (`rate: cron(* * * * ? *)`) + `serverless.yml` |
| Prize table cho potentialWin | `packages/game-keno/src/rules/` (odds/prize table) — KHÔNG hardcode lại (rule `keno-game-rules.mdc`) |

## Việc cần làm

### 1. Entity (`packages/game-keno/src/entities/betting-stats.ts`)

- `KenoDrawBettingStatsDoc extends DrawBettingStatsBase (từ game-core)` — thêm `_id: unknown`, `byPlayType`, `numberFreq`, `topCombos`, `exposure` (shape đầy đủ trong analysis §3.2).
- Embedded named interfaces: `KenoPlayTypeStat`, `KenoNumberStat { boards; amount; potentialWin }`, `KenoTopCombo`, `KenoExposure`, `KenoTopPotential`.
- `KenoDrawBettingStatsEntity extends Omit<KenoDrawBettingStatsDoc, "_id"> { id: string }`.
- JSDoc từng field (đơn vị VND, công thức — vd `numberFreq.potentialWin` = Σ potentialWin các board chứa số này).
- Re-export base types từ game-core theo tiền lệ `draw.ts`. Thêm `export * from "./betting-stats"` vào `entities/index.ts`.

### 2. Enum + Index

- Thêm `BettingStats = "keno_draw_betting_stats"` vào `KenoCollections`.
- Thêm vào `KENO_INDEXES`: `{ collection: KenoCollections.BettingStats, key: { drawId: 1 }, options: { unique: true, name: "idx_drawId_unique" }, purpose: "..." }`.

### 3. Repo (`packages/game-keno-application/src/infras/repos/betting-stats-repo.ts`)

- `BettingStatsRepository extends BaseRepo<KenoDrawBettingStatsEntity, BettingStatsMapper>`, `collName: KenoCollections.BettingStats`.
- Methods: `getByDrawId(drawId): findOne`; `upsertFull(...)` ghi TOÀN BỘ snapshot đã accumulate (per-draw) + `$max` updatedAt (dùng `docPath` cho mọi key); `recomputeFull(drawId, snapshot)` set `final: true`.
- **Watermark PER-DRAW (sửa Risk #1/#2, review 29/07):** mỗi draw có `lastEntryId` riêng trong doc của nó. Aggregation delta trên entries **tái dùng** `EntryRepository.getEntriesForStatsAfter(drawId, afterId, limit)` — đọc `{ drawId, status: { $ne: void }, _id > lastEntryId[draw] }` sort `_id:1` (dùng index `{drawId:1,_id:1}` = `idx_draw_id`). KHÔNG dùng `_id > min` toàn cục (đọc lại entry đã cộng của draw khác → lãng phí + double-count). **Loại `status: void` NGAY TẠI QUERY (chốt 30/07/2026):** đơn giản + an toàn hơn "cộng rồi trừ bù" — xem lý do ở bước 4 bên dưới.
- Types kết quả → `repos/types/betting-stats.types.ts`, barrel `repos/index.ts` re-export.

### 4. Worker use-case (`packages/game-keno-application/src/use-cases/operations/sync-betting-stats.ts`)

- `SyncBettingStatsUseCase extends SingleRunWorker<void, SyncResult>`:
  - `ttlSeconds` = Lambda timeout (khớp `serverless.yml`, vd 120s).
  - `resolveLockKey()` = hằng `"keno:stats-sync"` (1 worker/toàn hệ, xử lý mọi open draw).
  - `runLocked()`: **intra-invocation loop có `sleep`** (giải pháp cadence <1 phút — analysis §3.3):
    ```
    const tickMs = opsConfig.stats.tickSeconds * 1000;  // default 10s, đọc từ GlobalConfig
    const deadline = Date.now() + BUDGET_MS;             // ~55s < ttlSeconds
    while (Date.now() < deadline) {
      const tickStart = Date.now();
      // 1 tick — LẶP TỪNG open draw (watermark per-draw, sửa Risk #1/#2):
      //   for each openDraw:
      //     - đọc getEntriesForStatsAfter(drawId, acc.lastEntryId, batch) — query ĐÃ loại
      //       status:void tại nguồn (chốt 30/07, thay "void compensation" cũ)
      //     - accumulate delta in-memory (DrawStatsAccumulator seed từ doc hiện có)
      //     - CONDITIONAL WRITE (sửa Risk #6): CHỈ upsertFull khi applied>0
      //       (không có bet mới → KHÔNG ghi → updatedAt giữ nguyên → ETag/304 hoạt động)
      //     - bulkUpsertDelta combo (p0-04) + evaluateAlerts (p0-06) → bulkUpsertByDedupe
      //     - await this.setCursor(...)   // checkpoint ngay
      // recomputeFull cho MỌI draw hậu-chốt chưa final (§3.3 bước 4, sửa Risk #3):
      //   status ∈ {SalesClosed, Published, Settling, Voiding} && !final → recompute cursor-based
      //   (cùng filter loại status:void — draw đang Voiding recompute không đếm nhầm entry
      //   chưa kịp void, tránh đóng dấu final:true sai vĩnh viễn — chốt 30/07/2026)
      const ok = await this.extendLock(); if (!ok) throw new Error("lock taken over");
      await sleep(Math.max(0, tickMs - (Date.now() - tickStart)));  // giữ nhịp đều tickMs
    }
    ```
  - EventBridge trigger mỗi 1 phút; loop chạy ~55s rồi thoát, invocation kế tiếp takeover. Lock TTL = timeout chống chồng lấn.
  - **Tiền lệ:** feed-sync đã dùng "1 phút trigger + invocation loop dài + extendLock"; điểm mở rộng duy nhất là `sleep` giữa tick (vì stats chờ delta mới, khác feed-sync loop-đến-hết-việc). Ghi rõ đây là mở rộng có chủ đích, không phải cơ chế mới.
  - **potentialWin/exposure/capSets**: tính từ prize table snapshot (đọc GlobalConfig qua cache có sẵn) + `rules/odds.ts` — công thức exposure ở analysis §3.4. **Exposure lưu RAW chưa cap (sửa Risk #4):** `worstCaseByPlayType`/`worstCaseTotal` trong doc là RAW; cap pick8/9/10 (`capExposureByPlayType`, pure/idempotent) CHỈ áp lúc build response (p0-07) / eval alert (p0-06). Cap là hàm `min` phi tuyến nên lưu RAW để cộng dồn qua nhiều tick không lệch. Comment `//` giải thích từng bước business (rule `code-quality-standards` §3).
  - **account snapshot:** mọi shape account (`topAccounts`/`topPotential`) mang `username` (snapshot từ `entry.username` — tên field ĐỔI từ `accountName` sang `username` ngày 29/07/2026 để đồng nhất với `TicketEntryDoc.username`) + `accountId` — UI ưu tiên username, fallback accountId (analysis §4.5).
  - **topPotential/topAccounts/topCombos**: merge với top hiện có, cắt theo `ops.stats.topCombosK/topPotentialK/topAccountsK` (đọc từ GlobalConfig — cần p0-05; nếu p0-05 chưa xong, tạm dùng hằng default rồi thay bằng config ở p0-05).
- `sleep` helper: tìm util sẵn có (`@megawin/shared`?) trước khi tự viết `new Promise(setTimeout)`.
- Barrel `use-cases/operations/index.ts` export use-case + DTO.

### 5. Handler + schedule

- `apps/worker-keno/src/handlers/stats/stats-sync.ts`: `const useCase = new SyncBettingStatsUseCase(); export async function handler() { return useCase.run(); }`.
- `apps/worker-keno/src/functions/stats.yml`: Lambda + `schedule: rate: cron(* * * * ? *)` (1 phút), timeout hợp lý (vd 120s). Import vào `serverless.yml`.

## Quyết định cần chốt trong plan

- **Watermark PER-DRAW (sửa Risk #1/#2, review 29/07):** mỗi draw có `lastEntryId` riêng — KHÔNG dùng global min. ObjectId tăng đơn điệu; recompute cursor-based lúc hậu-chốt tự sửa mọi lệch. Bắt buộc index `{drawId:1,_id:1}` trước khi code query.
- **Recompute mọi status hậu-chốt chưa final (sửa Risk #3):** không chỉ `salesClosed` — draw nhảy status nhanh giữa 2 tick sẽ miss. Dùng cursor (`getEntriesForStatsAfter`), KHÔNG skip/limit (O(N²)).
- **Conditional write (sửa Risk #6):** chỉ ghi doc khi có delta thật, giữ `updatedAt` ổn định cho ETag/304.
- **`byPlayType` shape cho side bet:** tách hướng (`bigSmall.big/small/draw`, `evenOdd.*`) — nguồn của rule `sidebet_skew` (p0-06).

## Không làm

- KHÔNG `$inc` trong place-bet. KHÔNG index mới trên entries. KHÔNG hardcode prize table.
- Sleep giữa tick chỉ giữ nhịp `tickSeconds` trong budget invocation (~55s) — KHÔNG sleep vượt quá budget/Lambda timeout, KHÔNG dựng cron <1 phút (EventBridge không hỗ trợ).

## Verify

`pnpm --filter @megawin/game-keno check-types` + `--filter @megawin/game-keno-application check-types`. Test worker local trên draw có entries: so stats doc với aggregation cũ (sai số chỉ do timing, recompute lúc salesClosed phải khớp tuyệt đối).

## Định nghĩa Done

Worker cập nhật stats doc cho open draw, recompute chính xác lúc salesClosed, backoffice đọc được qua repo. Cập nhật `00-overview.md`.
