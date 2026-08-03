# p0-02 — Collection `bingo18_draw_betting_stats` + exposure rule 216 + worker `stats-sync`

> **Nguồn:** `.cursor/analysis/bingo18-operations-risk-control.analysis.md` §3.2, §3.3, §3.4, verdict #2/#3.
> **Phase:** P0 · **Phụ thuộc:** p0-01 (`idx_draw_id`) · **Blocks:** p0-04, p0-05. Evaluator alert gắn ở p0-04; config động gắn ở p0-03.

## Mục tiêu

Tạo collection pre-aggregated 1 doc/draw (**full-bucket 38 bucket** — vừa là phân bổ kiểu chơi, vừa là input exposure) + worker mini-batch async + hàm thuần `computeBingo18Exposure` (216 outcome — CHÍNH XÁC, không proxy). Thay toàn bộ ops aggregation on-demand (`aggregateOpsSummary/DiceFrequency/PlayTypeDistribution/TenantBreakdown/TopCombos`) bằng findOne O(1).

## Pattern tham chiếu (code Keno PRODUCTION — copy, đổi shape)

| Phần | File mẫu |
|---|---|
| Entity Doc | `packages/game-keno/src/entities/betting-stats.ts` (extends `DrawBettingStatsBase`, embedded named interface, `{Name}Entity extends Omit<Doc,"_id">`, re-export base từ game-core ĐẦU file) |
| Enum collection + Index | `KenoCollections.BettingStats` + entry `idx_drawId_unique` trong `KENO_INDEXES` |
| Repo | `packages/game-keno-application/src/infras/repos/betting-stats-repo.ts` (`getByDrawId`, `upsertFull` conditional, `recomputeFull` set `final:true`; `docPath`) |
| Repo types | `packages/game-keno-application/src/infras/repos/types/betting-stats.types.ts` + barrel |
| Mapper | `infras/mappers/betting-stats-mapper.ts` + `entry-for-stats-mapper.ts` (mapper KHÔNG inline trong repo — bài học Keno #1) |
| Query watermark | `EntryRepository.getEntriesForStatsAfter` (keno `entry-repo.ts`) — filter `{ drawId, status: { $ne: void }, _id > after }` sort `_id:1` |
| Accumulator | `use-cases/operations/stats-accumulator.ts` (keno `DrawStatsAccumulator` — seed từ doc, apply entry, snapshot ra) |
| Worker use-case | `use-cases/operations/sync-betting-stats.ts` (keno `SyncBettingStatsUseCase extends LockedWorkerUseCase` — intra-invocation loop + `sleep(tickMs)` + `extendLock` + conditional write) |
| Handler + schedule | `apps/worker-keno/src/handlers/stats/stats-sync.ts` + `apps/worker-keno/src/functions/stats.yml` (cron 1 phút, `timeout: 120`) |
| Exposure rule thuần | Vai trò tương đương `packages/game-keno/src/rules/max-prize.ts` (pure, idempotent, áp ở tầng đọc) — nhưng logic MỚI 216-outcome; kỹ thuật vòng 6³ tái dùng `computeSumWays()` trong `packages/game-bingo18/src/rules/odds.ts` |
| Match/prize domain | `packages/game-bingo18/src/helpers/match-result.ts` + `rules/prize-tables.ts` (`lookupSingleNumPrize`, `lookupSumTotalPrize`) — KHÔNG viết lại logic match/prize |

## Việc cần làm

### 1. Entity (`packages/game-bingo18/src/entities/betting-stats.ts`)

- `Bingo18BucketStat { amount; sets; entries }` — JSDoc: `amount = Σ(betCount × unitPrice)` (VND), `sets = Σ betCount`, `entries` = số entry chứa bucket.
- `Bingo18ByPlayType` (named — KHÔNG inline):
  - `singleNum: Record<string, Bingo18BucketStat>` — key `"1".."6"` (integer KHÔNG zero-padded, Mongo key là string — `bingo18-game-rules` #17);
  - `doubleMatch: Record<string, Bingo18BucketStat>` — `"1".."6"`;
  - `tripleMatch: { specific: Record<string, Bingo18BucketStat>; any: Bingo18BucketStat }`;
  - `sumTotal: Record<string, Bingo18BucketStat>` — `"3".."18"`;
  - `bigSmallDraw: { big; draw; small: Bingo18BucketStat }` — key khớp `Bingo18BigSmallBet`.
- `Bingo18TopPotential` — shape y hệt `KenoTopPotential` (`entryId/accountId/username/amount/potentialWin`; field **`username`**, KHÔNG `accountName`).
- `Bingo18DrawBettingStatsDoc extends DrawBettingStatsBase { _id: unknown; byPlayType: Bingo18ByPlayType; topPotential: Bingo18TopPotential[] }` + `Bingo18DrawBettingStatsEntity`.
- **KHÔNG có** `numberFreq` (heatmap 6 ô dựng từ 3 record cùng key ở tầng đọc), **KHÔNG** `topCombos`, **KHÔNG** `exposure` trong doc (hàm thuần tầng đọc — analysis §3.2).
- Re-export `DrawBettingStatsBase`/`DrawBettingTotals`/`TenantBettingStat`/`TopAccountStat` từ game-core ở ĐẦU file (§6); `export * from "./betting-stats"` vào `entities/index.ts`.
- Enum: thêm `BettingStats: "bingo18_draw_betting_stats"` vào `Bingo18Collections`; index `{ drawId: 1 } unique` (`idx_drawId_unique`) vào `BINGO18_INDEXES`.

### 2. Exposure rule (`packages/game-bingo18/src/rules/exposure.ts`)

Hàm thuần `computeBingo18Exposure(byPlayType, prizes)` — vòng 216 outcome (a,b,c ∈ 1..6):

```
payout(a,b,c) = Σ_n singleNum[n].sets × lookupSingleNumPrize(count_n)
              + Σ_n doubleMatch[n].sets × (count_n ≥ 2 ? doubleMatchPrizes.win : 0)
              + Σ_n tripleMatch.specific[n].sets × (a=b=c=n ? specific : 0)
              + tripleMatch.any.sets × (a=b=c ? any : 0)
              + sumTotal[a+b+c].sets × lookupSumTotalPrize(a+b+c)
              + bigSmallDraw[dir(sum)].sets × bigSmallDrawPrizes[dir]
```

- Trả `Bingo18ExposureResult { worstCase: { amount; numbers: [n,n,n]; sum }; expectedPayout; bestCase; topOutcomes: Array<{numbers; sum; amount}> (top 5) }` — named interface trong cùng file rules.
- `dir(sum)` dùng hằng domain `BINGO18_SMALL_MAX`/`BINGO18_BIG_MIN` (entities/types.ts) — KHÔNG hardcode 9/12.
- Prizes nhận từ `GlobalConfigDoc` slices (`SingleNumPrizes`… — named types sẵn có) — KHÔNG default hardcode ở call site.
- `expectedPayout = Σ payout / 216` — chính xác tuyệt đối (mọi outcome đồng xác suất). Comment `//` giải thích từng nhóm cộng (§3 code-quality).
- Cùng file: `computeBingo18EntryPotentialWin(boards, prizes)` = `max_{216} payout_entry(o)` — **exact per-entry** (khác Keno dùng Σ max per board; lý do: các board loại trừ nhau, vd sumTotal 3 và 18 không cùng trúng — analysis §3.4b). Dùng cho `topPotential` trong worker.
- Export qua `rules/index.ts`.
- **Unit test** (`packages/game-bingo18/test/` — theo tiền lệ test package): case đối chứng tay — 1 bộ sumTotal 18 → worstCase = outcome (6,6,6) gồm cả tripleMatch/bigSmall nếu có; expectedPayout khớp tính tay với 1–2 bucket.

### 3. Repo + mapper (`game-bingo18-application`)

- `infras/repos/betting-stats-repo.ts`: `BettingStatsRepository extends BaseRepo` (copy keno) — `getByDrawId`, `upsertFull(snapshot)` (CHỈ gọi khi có delta — conditional write ở use-case), `recomputeFull(drawId, snapshot)` set `final: true`. `docPath<Bingo18DrawBettingStatsDoc>()` cho mọi path lồng. Format query mỗi field 1 dòng.
- `infras/repos/types/betting-stats.types.ts` + re-export barrel `repos/types/index.ts`, `repos/index.ts`.
- `infras/mappers/betting-stats-mapper.ts` + `entry-for-stats-mapper.ts` (projection `EntryForStats { id; accountId; username; tenantId; amount; betUnitCount; commissionAmount; boards }`) — trong `mappers/`, KHÔNG inline repo (bài học Keno #1).
- `EntryRepository.getEntriesForStatsAfter(drawId, afterId, limit)` — copy keno (`entry-repo.ts` dòng 128–140): `{ drawId, status: { $ne: EntryStatus.Void } }` + `_id: { $gt: afterId }` sort `_id: 1` (dùng `idx_draw_id` p0-01). **Loại void TẠI NGUỒN** (chốt 30/07 — KHÔNG "cộng rồi trừ bù").

### 4. Accumulator (`use-cases/operations/stats-accumulator.ts`)

- `Bingo18DrawStatsAccumulator`: seed từ doc hiện có (hoặc empty 38 bucket), `applyEntry(entry, prizes, largeBetAmount)`:
  - Mỗi board → đúng 1 bucket, switch `playType` **đúng cách `settle-entries.ts` phân nhánh** (dùng `Bingo18PlayType` members + `BINGO18_BASIC_PLAY_TYPE_SET`, KHÔNG string trần): `singleNum[board.number]` / `doubleMatch[board.number]` / `tripleMatch.specific[board.number]` hoặc `.any` theo `tripleKind` / `sumTotal[board.sum]` / `bigSmallDraw[board.bet]`. Cộng `amount = board.betCount × entry.unitPrice`, `sets += betCount`, `entries` (đếm entry distinct per bucket trong batch — chấp nhận xấp xỉ cross-batch như Keno `PlayTypeStat.entries`).
  - `totals` (revenue/entries/boards=Σ betCount/commission/largeBetCount) + `byTenant` + `topAccounts` (merge baseline, cắt `topAccountsK`) + `topPotential` (tính `computeBingo18EntryPotentialWin`, merge baseline, cắt `topPotentialK`).
- `snapshot()` trả object ghi thẳng vào doc. KHÔNG có `subtractEntry` (void đã loại tại nguồn).

### 5. Worker use-case (`use-cases/operations/sync-betting-stats.ts`)

Copy `SyncBettingStatsUseCase` của Keno, đổi tối thiểu:

- `resolveLockKey() = "bingo18:stats-sync"`, `ttlSeconds` = Lambda timeout (120s).
- Intra-invocation loop budget ~55s + `sleep(tickMs)`; `tickSeconds` đọc từ `GlobalConfig.ops.stats.tickSeconds` (default **10s** — kỳ 6 phút cần nhịp nhanh; p0-03 gắn; trước đó dùng hằng default) — `extendLock()` mỗi vòng.
- Mỗi tick: lặp từng draw từ `getUnfinishedDraws()` (chỉ open + hậu-chốt chưa final — Bingo 18 nhiều draw active vì multi-draw 20 kỳ, KHÔNG quét Scheduled xa — analysis §3.3); watermark **per-draw** `lastEntryId`; **conditional write** chỉ khi `applied > 0`; `setCursor` checkpoint.
- Recompute safety-net: mọi draw status ∈ {SalesClosed, Published, Settling, Voiding} && `!final` → recompute cursor-based full → `final: true`.
- Hook điểm gọi evaluator alert (p0-04) sau khi update stats — để sẵn comment TODO trỏ plan.
- Prizes đọc GlobalConfig (cache sẵn có của config repo). `sleep` dùng util `@megawin/shared/utils/async` (đã có từ Keno P0 — KHÔNG tự viết).
- Barrel `use-cases/operations/index.ts` export.

### 6. Handler + schedule

- `apps/worker-bingo18/src/handlers/stats/stats-sync.ts` — thin: `useCase.run()` (copy keno handler).
- `apps/worker-bingo18/src/functions/stats.yml` — copy nguyên `apps/worker-keno/src/functions/stats.yml` (cron 1 phút, `timeout: 120`); import vào `serverless.yml` của worker-bingo18.

## Quyết định đã chốt (không mở lại)

- Full-bucket 38 bucket thay numberFreq/topCombos; exposure KHÔNG lưu doc (hàm thuần tầng đọc — Risk #4 RAW/phi tuyến); `topPotential` exact 216 per-entry; void loại tại nguồn; watermark per-draw.

## Không làm

- KHÔNG `$inc` trong place-bet; KHÔNG index mới trên entries ngoài p0-01; KHÔNG hardcode prize/boundary (đọc GlobalConfig + hằng domain); KHÔNG viết lại logic match (dùng chung nhánh switch convention với settle).

## Verify

`pnpm --filter @megawin/game-bingo18 check-types && pnpm --filter @megawin/game-bingo18-application check-types` + lint + unit test exposure. Test local trên draw có entries: stats doc vs aggregation cũ (lệch chỉ do timing; recompute lúc salesClosed khớp tuyệt đối với `aggregateOpsSummary`).

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] **Logic:** đối chiếu accumulator vs `settle-entries.ts` từng nhánh playType (cùng field `number`/`tripleKind`/`sum`/`bet`); đối chiếu `payout(a,b,c)` vs 5 hàm `match-result.ts` (đặc biệt biên sum 9/10/11/12); `expectedPayout`/`worstCase` khớp tính tay trên fixture.
- [ ] **Checklist 10 rủi ro worker** (00-overview §nguyên tắc 2) — tick từng mục.
- [ ] **Code:** grep import giữa file / indexed-access / string trần / mapper inline repo.
- [ ] Ghi kết quả review vào đây + cập nhật `00-overview.md`.

## Định nghĩa Done

Worker cập nhật stats doc mọi open draw, recompute chính xác hậu-chốt, exposure rule có unit test pass, review xong, overview cập nhật.
