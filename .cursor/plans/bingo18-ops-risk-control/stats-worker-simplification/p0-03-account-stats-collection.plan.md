# p0-03 — Tách `bingo18_draw_account_stats` (bỏ `topAccounts` in-doc)

> **Feature:** bingo18-ops-risk-control / stats-worker-simplification
> **Phase:** P0 · **Phụ thuộc:** p0-01 (accumulator delta-only + `writeBatch`)
> **Nguồn:** analysis H10/§5 · **Bản chuẩn Keno:** `account-stats.ts` + `account-stats-repo.ts` + `p2-01` §3.5
> **Trạng thái:** Code ⏳ · Review & rủi ro ⏳

## 1. Mục tiêu 1 câu

Chuyển `topAccounts` (top-K theo metric TÍCH LUỸ `amount`) từ mảng in-doc (drift tỷ lệ thuận số người chơi — H10) sang collection riêng `bingo18_draw_account_stats` (`$inc` upsert), derive top-K bằng `sort({amount:-1}).limit(K)` lúc đọc → chính xác tuyệt đối, không drift.

## 2. Vì sao topAccounts phải ra ngoài mà topPotential ở lại

- `topPotential`: `potentialWin` BẤT BIẾN per-entry → entry rớt top-K không cần quay lại → `$push+$sort+$slice` an toàn (giữ in-doc, p0-01 F3).
- `topAccounts`: `amount` TÍCH LUỸ → account rớt top-K rồi cược tiếp phải cộng vào baseline cũ; mảng top-K không giữ được baseline account ngoài K → drift (mẫu Keno `account-stats.ts` dòng 6-19). Bắt buộc collection đầy đủ.

Bonus: collection này là nguồn `uniquePlayers` (count distinct — KPI mà stats doc không có) + outstanding theo player/kỳ (link từ alert `large_bet`).

## 3. File đụng tới (8 file)

| # | File | Loại | Tóm tắt |
|---|---|---|---|
| H1 | `packages/game-bingo18/src/entities/enums.ts` | sửa | Thêm `AccountStats: "bingo18_draw_account_stats"` vào `Bingo18Collections` |
| H2 | `packages/game-bingo18/src/entities/account-stats.ts` | **mới** | `Bingo18DrawAccountStatsDoc/Entity` (mẫu Keno `account-stats.ts`) |
| H3 | `packages/game-bingo18/src/entities/index.ts` | sửa | `export * from "./account-stats"` |
| H4 | `packages/game-bingo18/src/entities/betting-stats.ts` | sửa | **XOÁ** field `topAccounts` + import `TopAccountStat` (nếu chỉ dùng cho field này) |
| H5 | `packages/game-bingo18/src/indexes/index.ts` | sửa | 3 index account_stats (mẫu Keno dòng 323-346) |
| H6 | `packages/game-bingo18-application/src/infras/repos/account-stats-repo.ts` + mapper | **mới** | `AccountStatsRepository` + `AccountStatsMapper` (mẫu Keno) |
| H7 | `packages/game-bingo18-application/src/infras/repos/types/betting-stats.types.ts` | sửa | Thêm `AccountStatsDelta` (mẫu Keno dòng 148-159) |
| H8 | `stats-accumulator.ts` + `sync-betting-stats.ts` + `get-ops-snapshot.ts` | sửa | accumulator thêm `accounts` Map + `drainAccountDeltas()`; worker `writeBatch` ghi account trước stats; snapshot derive topAccounts + uniquePlayers |

## 4. Chi tiết

### H1/H2/H3 — entity account-stats

`Bingo18DrawAccountStatsDoc extends DeltaAccumulatedDoc` — copy NGUYÊN VĂN Keno `account-stats.ts` đổi `Keno`→`Bingo18`, collection comment. Field: `drawId, accountId, username, amount, entries, sets, createdAt, updatedAt`. Entity `Omit<_,"_id"> & {id}`.

### H4 — xoá `topAccounts` khỏi `Bingo18DrawBettingStatsDoc`

Xoá field `topAccounts: TopAccountStat[]` (betting-stats.ts dòng 123-138) + xoá `TopAccountStat` khỏi import/re-export NẾU không còn dùng (grep trước).

> **Ngoại lệ review #H4-a — doc kỳ CŨ vẫn còn field `topAccounts`:** không backfill/migration. Doc cũ mang mảng tự hết ý nghĩa; get-ops-snapshot đọc topAccounts từ collection MỚI (H8). Reviewer xác nhận reader KHÔNG còn đọc `stats.topAccounts` (nếu còn → lỗi type sau khi xoá field, compiler bắt).

> **Ngoại lệ review #H4-b — grep MỌI reader `topAccounts`:** UI panel, dto, mapper. `rg "topAccounts" apps/backoffice packages/game-bingo18*` → mọi chỗ phải chuyển sang nguồn mới hoặc field snapshot mới. Đây là breaking — compiler + grep cùng chặn.

### H5 — 3 index account_stats (mẫu Keno dòng 323-346)

```ts
{ collection: Bingo18Collections.AccountStats, key: { drawId: 1, accountId: 1 },
  options: { unique: true, name: "idx_drawId_accountId_unique" }, purpose: "..." },
{ collection: Bingo18Collections.AccountStats, key: { drawId: 1, amount: -1 },
  options: { name: "idx_drawId_amount" }, purpose: "derive topAccounts sort limit K" },
{ collection: Bingo18Collections.AccountStats, key: { createdAt: 1 },
  options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90*24*60*60 }, purpose: "TTL 90d" },
```

> **Ngoại lệ review #H5-a — unique index là cơ chế idempotent:** batch đã áp → filter `lastEntryId:{$lt}` không khớp → upsert cố insert doc trùng → 11000 → `runDeltaBulkWrite` nuốt = no-op. Cần `{ordered:false}`. Reviewer kiểm repo dùng `runDeltaBulkWrite` (H6).

### H6 — `AccountStatsRepository` + mapper

Copy NGUYÊN VĂN Keno `account-stats-repo.ts` + `account-stats-mapper.ts`, đổi `Keno`→`Bingo18`:
- `getTopAccounts(drawId, k)`: `findMany({drawId}, {sort:{amount:-1}, limit:k})`.
- `countPlayers(drawId)`: `count({drawId})`.
- `getByAccount(drawId, accountId)`.
- `bulkUpsertDelta(deltas, batchMaxId)`: `$inc {amount,entries,sets}` + `$set {username,lastEntryId,updatedAt}` + `$setOnInsert {createdAt}`, filter `{drawId, accountId, lastEntryId:{$lt:batchMaxId}}`, upsert, `runDeltaBulkWrite` (mẫu Keno dòng 95-124).
- `const f = docPath<Bingo18DrawAccountStatsDoc>()`.

Cần helper `delta-write.ts` (`runDeltaBulkWrite`) — Bingo 18 chưa có, port từ Keno `delta-write.ts` (thêm file mới nếu chưa có; grep trước).

### H7 — `AccountStatsDelta`

Copy Keno dòng 148-159 (`drawId, accountId, username, amount, entries, sets`) vào `types/betting-stats.types.ts`.

### H8 — accumulator + worker + snapshot

**accumulator** (`stats-accumulator.ts`): thêm lại `accounts` Map<accountId, {username,amount,entries,sets}> (p0-01 đã bỏ — giờ thêm cho collection này). `addEntry` cộng account (username mới nhất thắng, `sets += Σ betCount`). Thêm `drainAccountDeltas(): AccountStatsDelta[]` (mẫu Keno dòng 365-378). **KHÔNG** thêm lại `topAccounts`/`toSnapshot`.

**worker** (`sync-betting-stats.ts` `writeBatch`): thêm dòng TRƯỚC `applyDelta`:
```ts
await this.accountStatsRepo.bulkUpsertDelta(acc.drainAccountDeltas(), batchMaxId);
await this.statsRepo.applyDelta(drawId, acc.drainStatsDelta(), batchMaxId, stats);
```
+ field `accountStatsRepo = new AccountStatsRepository()`.

**snapshot** (`get-ops-snapshot.ts`): derive topAccounts + uniquePlayers. Thêm vào `Promise.all`: `accountStatsRepo.getTopAccounts(drawId, ops.stats.topAccountsK)` + `accountStatsRepo.countPlayers(drawId)`. Trả về trong output (thêm field `topAccounts` + `uniquePlayers` vào snapshot dto — H8 chạm `snapshot.dto.ts` nữa).

> **Ngoại lệ review #H8-a — thứ tự ghi: account TRƯỚC stats (giữ watermark ĐỌC cuối):** stats doc chứa `lastEntryId` điều phối `findNotFinal`. Ghi account trước, stats sau → crash giữa: tick sau đọc lại batch, account thấy `lastEntryId ≥ batch` no-op, stats chưa ghi thì áp. Hệ tự hội tụ, KHÔNG cần transaction (mẫu Keno `writeBatch` JSDoc dòng 275-281). Reviewer kiểm `applyDelta` là lệnh CUỐI.

> **Ngoại lệ review #H8-b — `sets` account = Σ betCount, KHÔNG số board:** khớp comment Keno type. `drainAccountDeltas` gom đúng `Σ board.betCount` per account.

> **Ngoại lệ review #H8-c — topAccountsK vẫn từ `ops.stats.topAccountsK`:** không hardcode. get-ops-snapshot đọc config sẵn (dòng 53).

> **Ngoại lệ review #H8-d — snapshot.dto + UI:** thêm `topAccounts`/`uniquePlayers` vào `GetOpsSnapshotOutput` (H4 vừa bỏ khỏi `stats`). UI panel account đọc từ field mới, KHÔNG `stats.topAccounts`. Grep UI.

## 5. Đánh giá & verify

1. `pnpm --filter @megawin/game-bingo18 check-types` (H1-H5) + `pnpm --filter @megawin/game-bingo18-application check-types` (H6-H8) + backoffice (H8 UI).
2. Grep `topAccounts` toàn repo → chỉ còn ở: account collection derive (H6 getTopAccounts), snapshot dto (H8), UI panel đọc field mới. KHÔNG còn ở `betting-stats.ts` entity/accumulator/applyDelta.
3. Grep `runDeltaBulkWrite` — tồn tại (port nếu chưa).
4. Đọc "Ngoại lệ review H4/H5/H8".

## 6. Review code & rủi ro

- [ ] **#1 — drift đã hết:** topAccounts derive từ collection đầy đủ (`sort limit`), KHÔNG seed lại top-K mảng?
- [ ] **#2 — idempotent:** `bulkUpsertDelta` filter `lastEntryId:{$lt}` + unique index + `runDeltaBulkWrite` nuốt 11000 + `{ordered:false}`?
- [ ] **#3 — thứ tự ghi:** account TRƯỚC stats trong `writeBatch`?
- [ ] **#4 — index Atlas:** 3 index account_stats tạo TRƯỚC deploy worker ghi collection này? (nợ vận hành)
- [ ] **#5 — field xoá sạch:** `topAccounts` khỏi entity + accumulator + không reader nào đọc `stats.topAccounts`?
- [ ] **#6 — TTL:** `idx_createdAt_ttl` 90d — doc account tự hết hạn, không cleanup batch?
- [ ] **#7 — username:** field DUY NHẤT `$set` (mới nhất thắng); amount/entries/sets `$inc`?

## 7. Sau khi hoàn thành

- Cập nhật `00-overview.md`.
- Nợ vận hành: tạo 3 index account_stats trên Atlas.
- Ghi chú doc kỳ cũ mang `topAccounts` legacy tự hết hạn (không backfill).
