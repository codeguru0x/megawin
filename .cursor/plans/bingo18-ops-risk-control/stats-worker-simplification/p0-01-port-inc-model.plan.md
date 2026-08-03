# p0-01 — Port mô hình `$inc` delta cho Bingo 18 sync worker

> **Feature:** bingo18-ops-risk-control / stats-worker-simplification
> **Phase:** P0 · **Phụ thuộc:** không (gate cho p0-02/03/04)
> **Nguồn:** analysis §5.1 · **Bản chuẩn Keno:** `keno-ops.../stats-worker-simplification/p0-01` + `p2-01` guide §3.5
> **Trạng thái:** Code ⏳ · Review & rủi ro ⏳

## 1. Mục tiêu 1 câu

Chuyển Bingo 18 sync worker từ mô hình `$set` full-doc + `recomputeClosedDraws` + `seed()` + `SingleRunWorker` sang mô hình `$inc` delta + watermark per-doc + `extends TickLoopWorker` — cùng kiến trúc Keno-đích, KHÔNG mở lại K1–K8 (overview §"Nguyên tắc chung").

## 2. Đây là ĐỔI CORRECTNESS có chủ đích, không chỉ di chuyển code

Khác Keno `p0-01` (chỉ tách vòng lặp ra `TickLoopWorker`, giữ nguyên `$inc` đã có), Bingo 18 gộp cả **p2-01 scale-hardening**: chuyển hẳn cách ghi. Vì vậy plan này đụng đồng thời 4 file lõi (accumulator, repo, worker, draw-repo). Reviewer PHẢI ý thức: diff lớn là đúng phạm vi, NHƯNG mọi thay đổi trên logic **phân nhánh board→bucket / tính exposure / potentialWin** ngoài việc "bỏ full-state, giữ delta" là RED FLAG (overview §5).

## 3. File đụng tới (7 file)

| # | File | Loại | Tóm tắt |
|---|---|---|---|
| F1 | `packages/game-bingo18-application/src/infras/repos/types/betting-stats.types.ts` | sửa | Thêm `DrawStatsCursor`, `DrawStatsDelta`, `Bingo18PartialByPlayType`; `EntryForStats` giữ nguyên |
| F2 | `packages/game-bingo18-application/src/use-cases/operations/stats-accumulator.ts` | rewrite | Delta-only: bỏ `seed()`/baseline/clone; thêm `drainStatsDelta()`; bỏ `topAccounts`/`toSnapshot` |
| F3 | `packages/game-bingo18-application/src/infras/repos/betting-stats-repo.ts` | rewrite | Bỏ `upsertFull`; thêm `findNotFinal`/`applyDelta`/`ensureDocs`/`stampFinal`; `docPath f` |
| F4 | `packages/game-bingo18-application/src/use-cases/operations/sync-betting-stats.ts` | rewrite | `extends TickLoopWorker`; bỏ `recomputeClosedDraws`/`POST_CLOSE_STATUSES`/`evaluateDrawAlerts`; `syncDraw`/`writeBatch`; `recordStalledItem` |
| F5 | `packages/game-bingo18-application/src/infras/repos/draw-repo.ts` | sửa | Thêm `listUnfinishedDrawIds()` + `getStatusesByDrawIds()` (port từ Keno draw-repo) |
| F6 | `apps/worker-bingo18/src/handlers/stats/stats-sync.ts` | sửa | Chỉ JSDoc (bỏ "recomputeFull") — chi tiết ở p1-01 Q1, có thể sửa luôn ở đây |
| F7 | `packages/game-bingo18/src/indexes/index.ts` | sửa | Thêm `{ updatedAt: 1 }` cho `bingo18_draw_betting_stats` (cursor p0-02 dùng, nhưng khai luôn ở đây) |

> **KHÔNG đụng ở plan này:** `evaluate-alerts.ts` (chuyển caller ở p0-02), `betting-stats.ts` entity `topAccounts` (xoá ở p0-03), `betting-stats-mapper.ts` (normalize ở p0-04), account-stats collection (p0-03). Giữ diff p0-01 gọn quanh "mô hình ghi".

## 4. Chi tiết từng thay đổi

### F1 — `types/betting-stats.types.ts`

Thêm 3 type (mẫu Keno `types/betting-stats.types.ts` nhưng Bingo 18 KHÔNG có `numberFreq`/`combo`/`capSets`). `EntryForStats`/`EntryBoardForStats` GIỮ NGUYÊN (đã typed `number/tripleKind/sum/bet` — hơn Keno).

```ts
/** Trạng thái hàng đợi 1 kỳ — projection SIÊU MỎNG (drawId + lastEntryId). */
export interface DrawStatsCursor {
  drawId: string;
  lastEntryId: string | undefined;
}

/**
 * Δ counters 1 kỳ trong 1 tick — mọi field là lượng CỘNG THÊM (không tuyệt đối).
 * `byPlayType` partial: chỉ bucket có delta trong tick.
 */
export interface DrawStatsDelta {
  totals: DrawBettingTotals;
  byPlayType: Bingo18PartialByPlayType;
  byTenant: Record<string, TenantBettingStat>;
  topPotential: Bingo18TopPotential[];
}
```

`Bingo18PartialByPlayType`: partial theo cấu trúc 38 bucket. KHÁC Keno (side bet 2 tầng): Bingo 18 có `singleNum`/`doubleMatch`/`sumTotal` là `Record<string, bucket>`, `tripleMatch.specific` (record) + `tripleMatch.any` (bucket), `bigSmallDraw.{big,draw,small}`. Định nghĩa partial cho phép accumulator chỉ trả bucket có cược:

```ts
export interface Bingo18PartialByPlayType {
  singleNum?: Record<string, Bingo18BucketStat>;
  doubleMatch?: Record<string, Bingo18BucketStat>;
  tripleMatch?: { specific?: Record<string, Bingo18BucketStat>; any?: Bingo18BucketStat };
  sumTotal?: Record<string, Bingo18BucketStat>;
  bigSmallDraw?: { big?: Bingo18BucketStat; draw?: Bingo18BucketStat; small?: Bingo18BucketStat };
}
```

> **Ngoại lệ review #F1-a:** import phải ở đầu file (§7 code-quality). Thêm `Bingo18BucketStat`, `Bingo18TopPotential`, `Bingo18ByPlayType` vào khối import từ `@megawin/game-bingo18/entities`. KHÔNG dùng indexed-access `Bingo18DrawBettingStatsDoc["byPlayType"]` (§5.4) — import type có tên.

### F2 — `stats-accumulator.ts` (rewrite thành delta-only)

**BỎ:** `constructor(baseline?)`, `seed()`, `cloneByPlayType()`, `emptyByPlayType()` khung đủ 38 bucket, `lastEntryId` field, `accounts` Map (chuyển sang p0-03), `potentials` Map (đổi thành mảng push), `toSnapshot()`, mọi thứ liên quan `topAccounts`. Constructor chỉ còn `(drawId, prize)` — KHÔNG baseline (mẫu Keno accumulator dòng 103-106).

**GIỮ NGUYÊN LOGIC (chỉ đổi từ "cộng vào full-state" → "cộng vào delta khởi từ 0"):**
- `resolveBucket()` phân nhánh board→bucket (F2 giữ 100% — overview §5). Nhưng bucket giờ khởi tạo lazy trong Map delta, không phải trỏ vào khung 38 bucket seed sẵn.
- `computeBingo18EntryPotentialWin()` cho topPotential (exact 216) — GIỮ.
- `largeBetCount`, `commission`, `byTenant`, `sets` cộng dồn — GIỮ.

**THÊM `drainStatsDelta(): DrawStatsDelta`** (mẫu Keno dòng 328-345, bỏ numberFreq/capSets/worstCase):

```ts
drainStatsDelta(): DrawStatsDelta {
  return {
    totals: { revenue, entries, sets, commission, largeBetCount },
    byPlayType: this.byPlayType,      // partial — chỉ bucket đã chạm
    byTenant: Object.fromEntries(this.byTenant),
    topPotential: this.potentials,    // mảng push, repo lo $push+$sort+$slice
  };
}
```

**THÊM `drainAccountDeltas()`** — CHỈ khi làm p0-03 (account collection). Ở p0-01 thuần, tạm KHÔNG có account handling; p0-03 thêm lại `accounts` Map + `drainAccountDeltas()`. Để tránh đá diff, khuyến nghị: p0-01 bỏ hẳn account khỏi accumulator, p0-03 thêm vào — HOẶC giữ account Map ngay p0-01 nhưng chưa dùng. **Chốt: p0-01 bỏ account, p0-03 thêm** (mỗi PR 1 câu chuyện; account là chuyện của collection phụ).

> **Ngoại lệ review #F2-a — bucket delta partial phải khởi lazy, KHÔNG seed 38 bucket:** mục đích `$inc` chỉ chạm bucket có cược. Nếu accumulator vẫn build đủ 38 bucket (kể cả amount 0) rồi trả hết, `applyDelta` `incBy` lọc `!== 0` vẫn cứu được (không ghi field 0), NHƯNG tốn RAM + vòng lặp vô ích mỗi tick × D kỳ. Đúng chuẩn: Map lazy, chỉ `set` bucket khi board chạm nó. Reviewer kiểm: `byPlayType` trả ra CHỈ chứa key có delta.

> **Ngoại lệ review #F2-b — `entries` per-bucket là xấp xỉ, GIỮ ngữ nghĩa cũ:** bucket cũ `entries += 1` mỗi board-hit (comment dòng 215 "xấp xỉ"). Trong mô hình delta, `$inc bucket.entries` cộng dồn qua tick vẫn cho cùng số xấp xỉ đó — KHÔNG "sửa cho đúng" thành distinct-entry (sẽ cần đọc lại doc, phá delta-only). Giữ nguyên xấp xỉ như analysis đã chấp nhận.

> **Ngoại lệ review #F2-c — `potentialWin` phải EXACT 216, KHÔNG Σ max per board:** giữ `computeBingo18EntryPotentialWin(entry.boards, prizes)` gọi 1 lần/entry trên TOÀN BỘ boards (comment dòng 193-195). Reviewer kiểm không ai "tối ưu" thành cộng max từng board (sai — board loại trừ nhau, vd sumTotal 3 vs 18).

### F3 — `betting-stats-repo.ts` (rewrite)

**BỎ `upsertFull`, `getManyByDrawIds`** (getManyByDrawIds chỉ dùng bởi worker cũ để load baseline + recompute — delta-only không cần baseline; nếu reader khác dùng, grep trước khi xoá). **GIỮ `getByDrawId`** (get-ops-snapshot dùng).

**THÊM** (mẫu Keno repo — bỏ `numberFreq`/`capSets`/`exposure`/`combo`):
- `const f = docPath<Bingo18DrawBettingStatsDoc>()` đầu file.
- `findNotFinal(limit=500)`: projection `{_id:0, drawId:1, lastEntryId:1}`, `{final:false}`, sort `drawId:1`, limit. Trả `DrawStatsCursor[]` (mẫu Keno dòng 80-91).
- `applyDelta(drawId, delta, batchMaxId, config)`: build `$inc` cho `totals.*` (5 field) + `byPlayType.*` (nested path 38 bucket — chỉ key có delta) + `byTenant.*`. `$set {lastEntryId, updatedAt}`. `$push topPotential {$each,$sort:{potentialWin:-1},$slice:topPotentialK}`. Filter `{drawId, lastEntryId:{$lt:batchMaxId}}` (idempotent). Mẫu Keno dòng 115-196.
- `ensureDocs(drawIds)`: bulkWrite `$setOnInsert {final:false, updatedAt}` upsert (mẫu Keno dòng 237-256). **CHI TIẾT normalize/minimal ở p0-04** — p0-01 chỉ cần bản seed 2 field.
- `stampFinal(drawId)`: `{drawId, final:false}` → `$set {final:true, updatedAt}` (mẫu Keno dòng 279-284).
- helper `incBy` (bỏ delta 0) + helper `$inc` cho `Bingo18BucketStat` (3 field: amount/sets/entries).

**`applyDelta` byPlayType — 5 nhánh (KHÁC Keno):**

```ts
// singleNum / doubleMatch / sumTotal — Record<string, bucket>, key có delta
for (const [num, b] of Object.entries(delta.byPlayType.singleNum ?? {})) incBucket(inc, `byPlayType.singleNum.${num}`, b);
// tripleMatch.specific (record) + tripleMatch.any (bucket đơn)
for (const [num, b] of Object.entries(delta.byPlayType.tripleMatch?.specific ?? {})) incBucket(inc, `byPlayType.tripleMatch.specific.${num}`, b);
if (delta.byPlayType.tripleMatch?.any) incBucket(inc, "byPlayType.tripleMatch.any", ...);
// bigSmallDraw.{big,draw,small}
for (const dir of ["big","draw","small"]) if (delta.byPlayType.bigSmallDraw?.[dir]) incBucket(inc, `byPlayType.bigSmallDraw.${dir}`, ...);
```

`incBucket(inc, base, b)` = `incBy(inc, base+".amount", b.amount); incBy(...".sets"); incBy(...".entries")`.

> **Ngoại lệ review #F3-a — `applyDelta` KHÔNG upsert:** doc tạo bởi `ensureDocs`. Nếu `applyDelta` để `{upsert:true}` cùng filter `$lt` → đâm unique index 11000 (mẫu Keno JSDoc dòng 100-102). Kiểm `updateOne` KHÔNG có option upsert.

> **Ngoại lệ review #F3-b — `$set lastEntryId + $inc` CÙNG 1 lệnh:** nguyên tử, không tách 2 update. Watermark tiến cùng lúc counter cộng → không có khe "đã cộng chưa tiến watermark" (mẫu Keno JSDoc dòng 96-98).

> **Ngoại lệ review #F3-c — `topPotential` an toàn với `$slice` vì `potentialWin` BẤT BIẾN per-entry:** entry rớt top-K không bao giờ cần quay lại (khác `topAccounts` tích luỹ → p0-03 tách collection). Đây là lý do topPotential ở lại doc, topAccounts phải ra ngoài. Reviewer đọc kỹ khác biệt này.

> **Ngoại lệ review #F3-d — docPath `f` cho path CỐ ĐỊNH; path ĐỘNG (num/tenantId) dùng template string:** `f("totals.revenue")` type-safe; `` `byPlayType.singleNum.${num}` `` là dynamic key không docPath được (giống Keno dùng template cho `byTenant.${tenantId}`). Chấp nhận — đúng chuẩn mongodb.mdc.

> **Ngoại lệ review #F3-e — KHÔNG thêm `resetFinal`:** Bingo 18 hiện KHÔNG có (grep xác nhận). ĐỪNG thêm "cho đối xứng" — mẫu Keno JSDoc dòng 265-277 giải thích tại sao nó là bẫy (flip final = no-op; reset lastEntryId = cộng đôi).

### F4 — `sync-betting-stats.ts` (rewrite → `extends TickLoopWorker`)

Cấu trúc bám sát Keno `sync-betting-stats.ts` (dòng 103-319), CẮT BỎ combo/account/numberFreq (Bingo 18 không có; account là p0-03):

- `extends TickLoopWorker<void, SyncBettingStatsResult>` (import `@megawin/worker-core/workers`).
- `ttlSeconds = 120`; `description = "Bingo 18 — đồng bộ thống kê cược theo delta (tick ~10s, mọi kỳ đang mở)"`.
- Field instance `prize!`, `statsConfig!`, `counters` — **reset trong `beforeLoop`** (Lambda container reuse — mẫu Keno dòng 116-121).
- `resolveLockKey() → "bingo18:stats-sync"`.
- `beforeLoop()`: đọc config 1 lần, `buildPrizeContext`, reset counters, `listUnfinishedDrawIds()` → `ensureDocs()` (enroll 1 lần/invocation — mẫu Keno dòng 127-138).
- `resolveTickMs() → statsConfig.tickSeconds * 1000`.
- `buildResult(loop)`.
- `runTick()`: `findNotFinal(MAX_DRAWS_PER_TICK)` → `getStatusesByDrawIds` → for mỗi drawCursor: try `syncDraw` → `clearStalledItem`; nếu terminal (`Settled/Void`) + `drained` → `stampFinal`; catch: `LockTakenOverError` re-throw, else `recordStalledItem` (mẫu Keno dòng 149-197).
- `syncDraw(drawId, lastEntryId, prize, stats)`: vòng đọc batch, `writeBatch` per-batch, `extendLock` trong vòng, trần `MAX_ENTRIES_PER_DRAW_PER_TICK`, trả `{entriesApplied, drained}` (mẫu Keno dòng 228-273).
- `writeBatch(drawId, acc, batchMaxId, stats)`: p0-01 CHỈ `statsRepo.applyDelta(drawId, acc.drainStatsDelta(), batchMaxId, stats)`. p0-03 thêm dòng `accountStatsRepo.bulkUpsertDelta(...)` TRƯỚC applyDelta.
- `buildPrizeContext`: GIỮ NGUYÊN từ file cũ (dòng 283-306) — đọc 5 bảng prize từ GlobalConfig.
- `LockTakenOverError` class (mẫu Keno dòng 96-101).

**Hằng số:** `READ_BATCH=1000`, `MAX_ENTRIES_PER_DRAW_PER_TICK=20000`, `MAX_DRAWS_PER_TICK=200`, `TERMINAL_STATUSES = new Set(DRAW_COMPLETED_STATUSES)`. **BỎ** `BUDGET_MS`, `RECOMPUTE_PAGE_SIZE`, `POST_CLOSE_STATUSES`.

> **Ngoại lệ review #F4-a — `getStatusesByDrawIds` KHÔNG suy status từ hàng đợi:** kỳ trong `findNotFinal` có thể đã terminal từ lâu (worker chết rồi bật). PHẢI đọc status thật (mẫu Keno dòng 156-158). Reviewer kiểm không ai "tối ưu" bỏ bước này.

> **Ngoại lệ review #F4-b — `stampFinal` CHỈ khi terminal + drained:** `SalesClosed` KHÔNG terminal (kỳ mở lại được). Đóng dấu sớm = mất cược sau. `TERMINAL_STATUSES` = `DRAW_COMPLETED_STATUSES` (Settled/Void) — KHÔNG thêm SalesClosed (mẫu Keno dòng 176-182 + JSDoc stampFinal). Đây là K-decision, tuyệt đối không đổi.

> **Ngoại lệ review #F4-c — `extendLock` TRONG vòng đọc batch, không chỉ sau tick:** kỳ tồn đọng lớn vượt TTL giữa 1 tick → lock hết hạn giữa chừng. Heartbeat mỗi batch (mẫu Keno dòng 254-261). `LockTakenOverError` re-throw qua catch per-kỳ (KHÔNG bị catch nuốt — mẫu Keno dòng 183-187).

> **Ngoại lệ review #F4-d — try/catch PER-KỲ, 1 kỳ data bẩn không giết tick:** nhưng `LockTakenOverError` phải re-throw (khác "kỳ lỗi"). `recordStalledItem`/`clearStalledItem` là API `TickLoopWorker` (composition) — KHÔNG có I/O, không throw (mẫu Keno dòng 188-192).

> **Ngoại lệ review #F4-e — ĐỔI hành vi `runTick` so với worker cũ:** worker cũ quét `[SalesOpen]` + `recomputeClosedDraws([POST_CLOSE])`. Mới quét `final:false` (mọi status). Reviewer xác nhận: kỳ `Scheduled`/`SalesClosed`/`Published`/`Settling` giờ ĐỀU được hút delta (đúng — vé multi-draw 20 kỳ, kỳ xa vẫn nhận entry). Đây là sửa H4 (analysis §3), không phải regression.

> **Ngoại lệ review #F4-f — enroll ở `beforeLoop` (1 lần/invocation), KHÔNG mỗi tick:** kỳ tạo giữa invocation chờ ≤55s vào hàng đợi — vô nghĩa với chu kỳ 6 phút. Entries kỳ mới nằm yên trong `bingo18_ticket_entries` chờ enroll sau, KHÔNG mất (mẫu Keno JSDoc dòng 17-24). KHÔNG gọi `ensureDocs` trong `runTick`.

### F5 — `draw-repo.ts` (thêm 2 method)

Port NGUYÊN VĂN từ Keno `draw-repo.ts` dòng 116-144 (Bingo 18 hiện thiếu cả 2):

- `getStatusesByDrawIds(drawIds): Promise<Map<string, DrawStatus>>` — projection `{_id:0, drawId:1, status:1}`, filter `{drawId:{$in}}`. Trả Map (mẫu Keno dòng 116-125).
- `listUnfinishedDrawIds(limit=500): Promise<string[]>` — projection `{_id:0, drawId:1}`, filter `{status:{$in:DRAW_UNFINISHED_STATUSES}}`, sort `drawId:-1`, limit (mẫu Keno dòng 137-144).

`DrawStatus` đã import sẵn ở Bingo 18 draw-repo (dòng 16). `DRAW_UNFINISHED_STATUSES` đã import (dòng 17). `findManyAsDocuments` có sẵn ở `BaseRepo`.

> **Ngoại lệ review #F5-a — `getStatusesByDrawIds` KHÔNG covered, `listUnfinishedDrawIds` covered:** khác nhau về index (mẫu Keno JSDoc giải thích: filter theo `drawId` không covered vì `idx_status_drawId_desc` prefix là status). Giữ nguyên projection, KHÔNG "gộp" 2 method.

### F6 — `stats-sync.ts` handler (chỉ JSDoc)

Sửa dòng 12-13: bỏ "seed lại và tiếp tục. `recomputeFull` lúc salesClosed sửa chính xác tuyệt đối" → thay bằng mô tả watermark per-doc + đóng sổ terminal+drained (khớp mô hình mới). Trùng p1-01 Q1 — có thể làm ở p0-01 luôn (cùng file worker đổi). Nếu để p1-01 thì ghi rõ ở đó.

### F7 — `indexes/index.ts` (thêm `{updatedAt:1}`)

Thêm vào block `bingo18_draw_betting_stats` (sau index `idx_drawId_unique` dòng 203-208):

```ts
{
  collection: Bingo18Collections.BettingStats,
  key: { updatedAt: 1 },
  options: { name: "idx_updatedAt" },
  purpose: "Ops-alerts worker cursor: findChangedSince(updatedAt) — quét kỳ có stats đổi. Sort updatedAt ASC, IXSCAN.",
},
```

> **Ngoại lệ review #F7-a — index này CHỈ khai báo, KHÔNG tự tạo:** repo indexes/index.ts không có runner (mongodb.mdc §7.4). Phải tạo THỦ CÔNG trên Atlas TRƯỚC khi deploy p0-02 (overview §"Nợ vận hành"). Khai ở p0-01 để 1 chỗ, nhưng bump `updatedAt` bắt đầu từ p0-01 (`applyDelta`/`stampFinal` `$set updatedAt`) nên index có ý nghĩa ngay.

## 5. Đánh giá & verify (task RIÊNG sau khi code xong)

1. `pnpm --filter @megawin/game-bingo18-application check-types` — 0 lỗi. Đặc biệt F1 partial type + F3 `$inc` path string.
2. `pnpm --filter @megawin/game-bingo18 check-types` (F7 index) + `pnpm --filter @megawin/worker-bingo18 check-types` (F6 handler).
3. Grep dead code: `rg "upsertFull|recomputeClosedDraws|POST_CLOSE_STATUSES|RECOMPUTE_PAGE_SIZE|BUDGET_MS|\.seed\(|toSnapshot" packages/game-bingo18-application/src` → 0 match (trừ file khác chưa port). Nếu còn match ở file ngoài scope → điều tra caller trước khi xoá.
4. Grep `SingleRunWorker` trong bingo18 sync → 0 (đã đổi TickLoopWorker). `getManyByDrawIds` → 0 caller còn lại thì xoá.
5. Đọc lại 8 "Ngoại lệ review" — mỗi cái là 1 checkbox thủ công.

## 6. Review code & rủi ro (checklist reviewer)

- [ ] **R1 — cộng đôi:** filter `applyDelta` có `lastEntryId:{$lt:batchMaxId}`? `writeBatch` ghi stats CUỐI CÙNG (sau account ở p0-03)? Crash giữa batch → tick sau đọc lại no-op.
- [ ] **R2 — bỏ sót kỳ:** hàng đợi là `final:false` (không phải status)? `findNotFinal` sort `drawId:1` + limit? kỳ vượt limit chờ tick sau (không rơi)?
- [ ] **R3 — đóng sổ sai:** `stampFinal` chỉ khi `TERMINAL_STATUSES.has(status) && drained`? KHÔNG có count-check/rebuild khi đóng sổ (overview §2)?
- [ ] **R4 — RAM/write ampl:** `byPlayType` partial (chỉ bucket có delta)? `findNotFinal` projection 2 field (không kéo doc)? enroll 1 lần/invocation?
- [ ] **R5 — void:** `getEntriesForStatsAfter` vẫn loại `status:Void` tại nguồn (dòng 105)? KHÔNG thêm bước trừ bù.
- [ ] **R6 — lock:** `extendLock` trong vòng batch? `LockTakenOverError` re-throw không bị catch per-kỳ nuốt?
- [ ] **R7 — container reuse:** `prize`/`statsConfig`/`counters` reset trong `beforeLoop`?
- [ ] **R8 — logic bucket/exposure:** phân nhánh `resolveBucket` + `computeBingo18EntryPotentialWin` GIỮ NGUYÊN? (chỉ đổi full-state→delta)
- [ ] **R9 — dead API:** `upsertFull`/`recompute*`/`seed`/`toSnapshot` xoá hết? `resetFinal` KHÔNG thêm mới?
- [ ] **R10 — số chính thức:** get-ops-snapshot vẫn đọc `getByDrawId` (giữ)? Số kỳ đã settle lấy từ `DrawDoc.financial` (không phải stats doc ops)?

## 7. Sau khi hoàn thành

- Cập nhật bảng trạng thái `00-overview.md` (Code p0-01 → done sau code; Review → done sau checklist §6).
- Mở khoá p0-02/03/04 (đều phụ thuộc p0-01).
- Nếu chưa sửa F6 handler JSDoc ở đây → ghi carry-over sang p1-01 Q1.
