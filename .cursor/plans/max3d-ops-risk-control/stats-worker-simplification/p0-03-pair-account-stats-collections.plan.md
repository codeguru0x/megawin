# p0-03 — Tách `max3d_draw_pair_stats` + `max3d_draw_account_stats`

> **Phase:** P0 · **Phụ thuộc:** p0-01 (`writeBatch`/`drain*`/watermark) · **PR:** riêng.
> **Nguồn:** analysis §5.7 (đã APPROVE tạo 2 collection) · bản chuẩn Keno `account-stats.ts`/`account-stats-repo.ts`
> + combo collection (pair mượn pattern combo nhưng key khác). **Merge TRƯỚC p0-02** (00-overview §thứ tự).

## 1. Mục tiêu

Xoá 2 field top-K theo metric **TÍCH LUỸ** khỏi stats doc — `topPairs` (`units`/`accounts` cộng dồn) và
`topAccounts` (`amount` cộng dồn) — vì nuôi top-K trong doc gây **drift** (item rơi khỏi top-K mất baseline,
lần sau tính từ 0). Thay bằng 2 collection 1-doc-per-item, `$inc` upsert idempotent, derive top-K bằng
`sort().limit(K)` trên index lúc ĐỌC → chính xác tuyệt đối (nguyên tắc `mongodb.mdc` §8 + Keno `account-stats.ts`).

Đồng thời xoá band-aid `Math.max(baselineAccounts, accountIds.size)` (analysis §7) — `pair_stats` đếm distinct
account bằng collection phụ giống Keno combo/combo_accounts, hoặc bằng `accountCount` field `$set` phái sinh.

## 2. Sửa cái gì, ở file nào

### 2.1. Entity mới

**`packages/game-max3d/src/entities/pair-stats.ts`** — `Max3dDrawPairStatsDoc extends DeltaAccumulatedDoc`:
`drawId`, `pairKey` (unique cùng drawId), `triplet1`, `triplet2`, `units` (`$inc`), `amount` (`$inc`),
`accountCount` (số account distinct — `$set` phái sinh, xem §2.4), `createdAt`, `updatedAt`. + Entity `id` string.

**`packages/game-max3d/src/entities/account-stats.ts`** — copy Keno `KenoDrawAccountStatsDoc` đổi tên
`Max3dDrawAccountStatsDoc`: `drawId`, `accountId` (unique cùng drawId), `username` (`$set`), `amount`,
`entries`, `sets` (`$inc`), timestamps. Giữ nguyên JSDoc "vì sao collection riêng".

> **Distinct account cho pair:** 2 lựa chọn (chốt khi implement, ghi rõ PR):
> - **(A) Đơn giản — `accountCount` field:** pair doc giữ `accountCount`, worker `$set` lại bằng count distinct
>   từ 1 collection phụ `max3d_draw_pair_accounts` (giống Keno combo_accounts). Chính xác, nhưng thêm collection thứ 3.
> - **(B) Chấp nhận xấp xỉ:** bỏ `accountCount`, ComboConcentration đổi ngưỡng theo `units` thay `accounts`.
>   NHƯNG `evaluate-alerts.ts:127` hiện dùng `p.accounts` → đổi rule = đổi nghiệp vụ (cần xác nhận).
>
> **Khuyến nghị (A)** — bám sát Keno (combo + combo_accounts), giữ nguyên nghĩa alert `combo_concentration`
> (syndicate = N account distinct). Analysis §5.7 approve "collection phụ" số nhiều. Thêm `max3d_draw_pair_accounts`
> `{drawId, pairKey, accountId}` unique + `countAccountsByPair` + `syncAccountCounts` như Keno combo.

### 2.2. Collections enum + indexes

**`entities/enums.ts`** (`Max3dCollections`): thêm `PairStats:"max3d_draw_pair_stats"`,
`AccountStats:"max3d_draw_account_stats"` (+ `PairAccounts:"max3d_draw_pair_accounts"` nếu chọn A).

**`indexes/index.ts`** (nợ vận hành — tạo tay Atlas trước deploy):
- `pair_stats`: `{drawId:1, pairKey:1}` unique (`idx_drawId_pairKey`); `{drawId:1, units:-1}` (top-K); TTL `{createdAt:1}` 90d.
- `account_stats`: `{drawId:1, accountId:1}` unique; `{drawId:1, amount:-1}` (top-K); TTL `{createdAt:1}` 90d.
- (A) `pair_accounts`: `{drawId:1, pairKey:1, accountId:1}` unique; TTL 90d.

### 2.3. Repo mới

**`pair-stats-repo.ts`**: `getTopPairs(drawId, k)` (`sort:{units:-1}, limit:k`) → nguồn `topPairs` cho
exposure/evaluator/snapshot; `bulkUpsertDelta(deltas, batchMaxId)` (`$inc units/amount` + `$set` triplet1/2/username
+ watermark filter `$lt`, idempotent qua `runDeltaBulkWrite` 11000=no-op); (A) `syncAccountCounts(drawId, counts)` `$set accountCount`.

**`account-stats-repo.ts`**: copy Keno nguyên (`getTopAccounts`, `countPlayers`, `getByAccount`, `bulkUpsertDelta`).

**(A) `pair-accounts-repo.ts`**: copy Keno combo-accounts (`bulkUpsertDelta`, `countAccountsByPair`).

Mapper cho mỗi collection (ObjectId→id) — copy Keno mapper pattern.

### 2.4. Accumulator: `drainPairDeltas` + `drainAccountDeltas`, XOÁ top-K in-doc

`stats-accumulator.ts`:
- XOÁ `PairState.baselineAccounts`; `PairState` giữ `triplet1/2/units/amount/accountIds:Set`.
- Thêm `drainPairDeltas(): PairStatsDelta[]` (từ `this.pairs`: pairKey/triplet1/2/units/amount + accountIds cho pair_accounts nếu A).
- Thêm `drainAccountDeltas(): AccountStatsDelta[]` (từ `this.accounts`).
- `drainStatsDelta` (p0-01) KHÔNG còn `topPairs`/`topAccounts`.
- XOÁ nhánh build `topPairs`/`topAccounts` trong (đã bỏ) `toSnapshot`.

### 2.5. `writeBatch` trong sync worker

Thêm trước `applyDelta` (thứ tự: phụ trước, betting-stats CUỐI vì giữ watermark đọc — như Keno):
```
const pairDeltas = acc.drainPairDeltas();
if (pairDeltas.length > 0) {
  await pairAccountsRepo.bulkUpsertDelta(...);        // (A)
  await pairStatsRepo.bulkUpsertDelta(pairDeltas, batchMaxId);
  const counts = await pairAccountsRepo.countAccountsByPair(drawId, keys);  // (A)
  await pairStatsRepo.syncAccountCounts(drawId, counts);                    // (A)
}
await accountStatsRepo.bulkUpsertDelta(acc.drainAccountDeltas(), batchMaxId);
await statsRepo.applyDelta(drawId, acc.drainStatsDelta(), batchMaxId, stats);
```

### 2.6. Đổi nguồn `topPairs` ở TẤT CẢ reader (grep `stats.topPairs`)

`computeMax3dExposure(tripletStakes, topPairs, plusUnits, prizes)` giữ signature — chỉ đổi CALLER truyền
`topPairs` từ `pairStatsRepo.getTopPairs` thay `stats.topPairs`:
- **`get-ops-snapshot.ts:57`**: thêm `pairStatsRepo.getTopPairs(drawId, ops.stats.topCombosK)` vào `Promise.all`, truyền vào `computeMax3dExposure`. `accountCount`→map `Max3dTopPair.accounts`.
- **`evaluate-alerts.ts`**: `EvaluateAlertsInput` thêm field `topPairs: Max3dTopPair[]`; ComboConcentration (`:126`) đọc `input.topPairs` thay `stats.topPairs`. p0-02 evaluator truyền vào.
- Bất kỳ reader nào khác — grep `\.topPairs|\.topAccounts` trong `game-max3d*` + `apps/backoffice/**/max3d/**`.

### 2.7. XOÁ field khỏi entity + DTO

`betting-stats.ts`: XOÁ `topPairs` + `topAccounts` khỏi `Max3dDrawBettingStatsDoc`. Kiểm DTO snapshot
(`dto/snapshot.dto.ts`) + FE type có tham chiếu → cập nhật. `Max3dTopPair` type GIỮ (dùng cho pair_stats
entity + exposure), chỉ bỏ khỏi betting-stats doc.

## 3. Đánh giá & verify

1. `check-types`: `@megawin/game-max3d`, `@megawin/game-max3d-application`, `@megawin/worker-max3d`, `@megawin/backoffice`.
2. Grep: `rg "stats\.topPairs|stats\.topAccounts|topAccounts|baselineAccounts" packages/game-max3d* apps/backoffice/**/max3d` → 0 (trừ `Max3dTopPair` type name + pair_stats).
3. Luồng dọc (staging): cược nhiều account vào 1 cặp plus → `pair_stats` 1 doc/cặp, `units`/`accountCount` đúng; `account_stats` 1 doc/account, `amount` đúng. Kill+restart giữa batch → không double (idempotent watermark).
4. Operations page: top pairs + top accounts render đúng, click-through alert `pair_liability`/`combo_concentration` mở đúng cặp.
5. So top-K với aggregate trực tiếp entries (bằng nhau — hết drift).

## 4. Ngoại lệ & rủi ro khi review

| # | Rủi ro | Mức | Kiểm |
|---|---|---|---|
| 1 | Reader còn đọc `stats.topPairs`/`topAccounts` sau khi xoá field → crash `undefined` | 🔴 | Grep §3.2 = 0. check-types 4 package. `evaluate-alerts` + `get-ops-snapshot` đổi nguồn |
| 2 | `bulkUpsertDelta` thiếu filter `lastEntryId:{$lt}` → `$inc` cộng đôi khi retry | 🔴 | Đọc filter; test chạy 2 lần cùng batch → lần 2 no-op (11000) |
| 3 | `accountCount` `$inc` thay `$set` phái sinh → drift trở lại | 🟠 | (A) `syncAccountCounts` `$set` từ `countAccountsByPair` (đếm distinct từ pair_accounts), KHÔNG `$inc` |
| 4 | Thứ tự `writeBatch`: betting-stats KHÔNG ghi cuối → crash giữa chừng làm watermark tiến trước collection phụ ⇒ mất delta pair/account | 🔴 | betting-stats (`applyDelta`) LÀ lệnh cuối; phụ ghi trước → tick sau đọc lại batch, phụ thấy watermark ≥ → no-op, tự hội tụ |
| 5 | Thiếu index top-K → COLLSCAN + sort in-memory mỗi lần đọc snapshot | 🟠 | Tạo `{drawId, units:-1}`/`{drawId, amount:-1}` trên Atlas trước deploy; explain IXSCAN |
| 6 | Thiếu TTL → 2 collection phình vô hạn | 🟡 | TTL `{createdAt:1}` 90d cả 3 collection |
| 7 | `pairKey` dùng ordered (nhầm Max3dPro) | 🔴 | `toPairKey` giữ UNORDERED (t1≤t2). KHÔNG copy từ max3dpro |
| 8 | Xoá `Max3dTopPair` type (dùng nhầm "xoá field" thành "xoá type") | 🟠 | Type GIỮ — pair_stats entity + exposure dùng. Chỉ bỏ 2 field khỏi betting-stats DOC |

## 5. Định nghĩa Done (p0-03)

- `max3d_draw_pair_stats` + `max3d_draw_account_stats` (+ `pair_accounts` nếu A) là nguồn top-K chính xác; hết drift.
- Entity `betting-stats.ts` KHÔNG còn `topPairs`/`topAccounts`; band-aid `baselineAccounts` xoá sạch.
- Mọi reader (`get-ops-snapshot`, evaluator, FE) lấy top-K từ collection phụ; check-types 4 package xanh; grep 0.
- Index + TTL tạo Atlas trước deploy; luồng dọc staging số liệu khớp aggregate.
