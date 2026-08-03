# p0-02 — Collection `max3d_draw_betting_stats` + exposure rules + worker `stats-sync`

> **Nguồn:** `.cursor/analysis/max3d-max3dpro-operations-risk-control.analysis.md` §3.2, §3.3, §3.4, verdict #2/#3.
> **Phase:** P0 · **Phụ thuộc:** p0-01 (`idx_draw_id`) · **Blocks:** p0-04, p0-05.

## Mục tiêu

Collection pre-aggregated 1 doc/draw: `byPlayType` + **`tripletStakes` (full-sparse, bounded 1000 key — INPUT exposure)** + **`topPairs` (top-K, syndicate + liability ĐB)** + `topPotential` + base (totals/byTenant/topAccounts). Worker mini-batch async. Exposure rules thuần: greedy per-tier basic (chính xác) + pair liability ĐB (chính xác có điều kiện) + worst-case tổng (proxy RAW) — tính ở TẦNG ĐỌC.

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Toàn bộ khung entity/repo/mapper/accumulator/worker/handler/yml | Keno production: `packages/game-keno/src/entities/betting-stats.ts`, `game-keno-application/src/infras/repos/betting-stats-repo.ts` + `types/betting-stats.types.ts`, `infras/mappers/{betting-stats,entry-for-stats}-mapper.ts`, `use-cases/operations/{sync-betting-stats,stats-accumulator}.ts`, `apps/worker-keno/src/handlers/stats/stats-sync.ts` + `functions/stats.yml`. Cấu trúc plan chi tiết: `../bingo18-ops-risk-control/p0-02-draw-betting-stats.plan.md` (đọc kèm — chỉ ghi KHÁC BIỆT dưới đây) |
| Query watermark | `EntryRepository.getEntriesForStatsAfter` (keno `entry-repo.ts` dòng 128–140: `status: { $ne: EntryStatus.Void }`, sort `_id:1`) |
| Matching/hoán vị domain | `packages/game-max3d/src/rules/prize-tiers.ts` (`findAllTiersInResult`, `getUniquePermutations`), `rules/play-types.ts` (`calculateLineCount`) — KHÔNG viết lại |
| Pair normalize | `aggregateTopPlusCombos` (max3d `entry-repo.ts` dòng 1391+) — sorted pair unordered |
| Worker tiền lệ tại chỗ | `apps/worker-max3d/src/handlers/feed/` + `functions/feed.yml` |

## Việc cần làm (ghi theo KHÁC BIỆT so với plan Bingo18 p0-02 — khung giống hệt)

### 1. Entity (`packages/game-max3d/src/entities/betting-stats.ts`)

- `Max3dPlayTypeStat { amount; units; boards; entries }` — `units = Σ(lineCount × betCount)` (JSDoc phân biệt `lineCount` vs `betUnitCount` theo `max3d-game-rules` #17/#22).
- `Max3dByPlayType { basicStraight; basicCombo3; basicCombo6; plus: Max3dPlayTypeStat }`.
- `Max3dTripletStake { straightUnits; combo3Units; combo6Units; amount; boards }` — JSDoc: units tách 3 nhóm vì prize khác nhau; combo cộng theo TỪNG HOÁN VỊ (mỗi perm là 1 triplet key).
- `tripletStakes: Record<string, Max3dTripletStake>` — key `"000".."999"` **string zero-padded, sparse** (chỉ triplet có cược). LƯU RAW tuyến tính.
- `Max3dTopPair { pairKey; triplet1; triplet2; units; accounts; amount }` — pairKey **unordered** `"t1,t2"` (sort). `topPairs: Max3dTopPair[]` cắt theo `ops.stats.topCombosK` (default 100).
- `Max3dTopPotential` — y hệ `KenoTopPotential` (field `username`).
- `Max3dDrawBettingStatsDoc extends DrawBettingStatsBase { _id; byPlayType; tripletStakes; topPairs; topPotential }` + Entity. KHÔNG lưu `exposure` trong doc (hàm thuần tầng đọc — Risk #4).
- `Max3dCollections.BettingStats: "max3d_draw_betting_stats"` + index `{ drawId: 1 } unique` vào `MAX3D_INDEXES`.

### 2. Exposure rules (`packages/game-max3d/src/rules/exposure.ts`)

3 hàm thuần (analysis §3.4 — đã kiểm chứng matching code 30/07):

1. `computeBasicWorstCase(tripletStakes, prizes)` — **CHÍNH XÁC**: `liability(t, tier) = straightUnits×basicPrize[tier] + combo3Units×comboPrize.combo3[tier] + combo6Units×comboPrize.combo6[tier]`; mỗi tier chọn top-k triplet **DISTINCT** (k = 2/4/6/8 slot) rồi Σ. ⚠️ `findAllTiersInResult` dùng `.includes()` — triplet lặp trong CÙNG pool KHÔNG nhân thưởng → greedy phải distinct per tier; cùng triplet ở NHIỀU tier được cộng (gộp giải). Comment `//` ghi rõ cả 2 điều này.
2. `computePairLiabilities(topPairs, plusPrizes)` — **CHÍNH XÁC có điều kiện**: `liabilityĐB(pair) = units × plusPrizes.special` (unordered — 2 bộ khớp 2 slot ĐB bipartite; duplicate pair: ĐB KHÔNG ×2 theo luật). Trả sorted desc + max.
3. `computeMax3dExposure(...)` — worst-case tổng (proxy RAW): basic worst-case (1) + max pair liability (2) + đuôi plus Nhất→Sáu proxy `Σ plusUnits × maxTailPrize`. Output `Max3dExposureResult { basicWorstCase; topPairLiabilities; worstCaseTotal; note }` — JSDoc ghi rõ phần nào exact / phần nào proxy (UI hiển thị đúng nhãn).
- Prizes nhận từ `GlobalConfigDoc.defaultPrizes` slices (named types `BasicPrizeAmounts`/`ComboPrizeAmounts`/`PlusPrizeAmounts`) — KHÔNG hardcode.
- **Unit test** (`packages/game-max3d/test/`): fixture tay — 1 board straight "096" + 1 board plus ("096","389") → basicWorstCase/pairLiability khớp tính tay; case triplet xuất hiện 2 tier.

### 3. Repo + mapper + accumulator (`game-max3d-application`)

- Copy khung Bingo18/Keno: `betting-stats-repo.ts` (`getByDrawId`/`upsertFull`/`recomputeFull` + `docPath`), types → `repos/types/`, mappers → `infras/mappers/` (bài học Keno #1). `getEntriesForStatsAfter` trên entry-repo max3d (projection: id/accountId/username/tenantId/amount/betUnitCount/commissionAmount/`entrySummary.boards`).
- `Max3dDrawStatsAccumulator.applyEntry`:
  - Board basic straight → `tripletStakes[triplets[0]].straightUnits += betCount` (lineCount=1);
  - Board combo3/combo6 → **expand `getUniquePermutations(triplets[0])`**, mỗi perm → `combo{3,6}Units += betCount` (đúng semantics: mỗi hoán vị là 1 line dự thưởng);
  - Board plus → pairKey = sorted(triplets[0], triplets[1]) → merge `topPairs` (units += betCount, accounts distinct **seed baseline từ doc — Risk #5**, amount);
  - `amount` per triplet/pair = tiền board (`lineCount × betCount × unitPrice`) quy cho key đó (JSDoc công thức);
  - `byPlayType` + totals/byTenant/topAccounts + `topPotential` (**proxy Σ maxUnitWin per board — chốt §7 Q5**: straight `basicPrizes.special`, combo3 `comboPrizes.combo3.special`, combo6 `.combo6.special`, plus `plusPrizes.special`; × betCount; JSDoc ghi "proxy thiên cao").
- ⚠️ Đọc `board.betCount ?? 1`, `entry.betUnitCount ?? entry.lineCount` (backward compat — `max3d-game-rules` #23).

### 4. Worker + handler + schedule

Copy khung Bingo18 p0-02 §5–6, đổi: lock key `"max3d:stats-sync"`; `tickSeconds` default **30s** (chốt §7 Q3); draw active thường 1–2 (multi-draw 6 kỳ) — vòng per-draw nhẹ; recompute safety-net mọi status hậu-chốt chưa `final`; conditional write; hook evaluator (p0-04). Handler `apps/worker-max3d/src/handlers/stats/stats-sync.ts` + `functions/stats.yml` (cron 1 phút, timeout 120) + `serverless.yml`.

## Quyết định đã chốt (không mở lại)

`tripletStakes` full-sparse (KHÔNG top-K — input exposure); `topPairs` top-K (đuôi liability nhỏ, UI ghi "top K cặp"); `topPotential` proxy; exposure tầng đọc; void loại tại nguồn; watermark per-draw; tick 30s.

## Không làm

KHÔNG `$inc` place-bet; KHÔNG index mới trên entries ngoài p0-01; KHÔNG hardcode prize; KHÔNG tự viết logic hoán vị (dùng `getUniquePermutations`); KHÔNG dùng `TicketLineDoc` làm nguồn (lines chỉ tạo khi settle — stats đọc từ `entrySummary.boards`).

## Verify

`check-types` + lint `game-max3d` + `game-max3d-application` + unit test exposure. Test local: stats doc vs `aggregateOpsSummary`/`aggregateTripletFrequency`/`aggregateTopPlusCombos` cũ trên cùng draw — recompute hậu-chốt khớp tuyệt đối.

## Review sau triển khai (BẮT BUỘC — khung 00-overview)

- [ ] **Logic:** accumulator đối chiếu `settle-entries` + `calculateLineCount` từng playMode/playType (đặc biệt combo expand hoán vị — units khớp lineCount); greedy worst-case đối chiếu `findAllTiersInResult`/`matchPlus` (distinct per pool, gộp giải cross-tier, duplicate ĐB không ×2); fixture tính tay pass.
- [ ] **Checklist 10 rủi ro worker** — tick từng mục.
- [ ] **Code:** grep import giữa file / indexed-access / string trần / mapper inline.
- [ ] Ghi kết quả review + cập nhật `00-overview.md`.

## Định nghĩa Done

Worker cập nhật stats doc, recompute hậu-chốt chính xác, exposure rules có unit test pass, review xong, overview cập nhật.
