# p0-01 — Tách `max3dpro_draw_pair_stats` (ORDERED) + `max3dpro_draw_account_stats`

> **Nguồn:** `.cursor/analysis/max3dpro-stats-worker-simplification.analysis.md` §5.1 + §4.1 (đặc thù nặng
> nhất) · **Phase:** P0 · **Phụ thuộc:** — (ưu tiên #1 riêng của Pro, làm TRƯỚC p0-02).
> **Blocks:** p0-02 (accumulator drain đã đổi interface), p0-03 (worker alert đọc `pair_stats`).
> **Bản chuẩn tham chiếu:** Keno đã tách combo/account thành 2 collection phụ (xem
> `p2-01-port-guide-bingo18-max3d-max3dpro.md` §3.5). Pro KHÁC Keno/Max3D: **pairKey ORDERED**.

## Mục tiêu

Xoá điểm nặng nhất trong 4 game: accumulator giữ `Set<accountId>` cho MỖI pairKey trong không gian
ORDERED 10⁶ (`stats-accumulator.ts:67` `accountIds: Set<string>`), cộng với `topPairs`/`topAccounts`
tích luỹ in-doc bị drift (rơi khỏi top-K mất baseline). Giải pháp đồng thời 3 vấn đề:

1. **Hạ RAM tận gốc** — bỏ `Set<accountId>` per-pair; số account distinct đếm qua `upsertedCount` của
   `$inc` upsert per-pair-delta vào collection phụ.
2. **Hết drift top-K** — `pair_stats`/`account_stats` là source of truth per-key; đọc top-K bằng
   `sort().limit(K)` theo index lúc ĐỌC, không giữ trong doc chính.
3. **Doc chính nhẹ đi** — bỏ `topPairs`/`topAccounts` khỏi `Max3dproDrawBettingStatsDoc`.

**ORDERED tuyệt đối:** pairKey = `toOrderedPairKey(first, second)` = `"first>second"` ở CẢ ghi + đọc +
eval. (A,B) ăn ĐB, (B,A) ăn phụ ĐB — 2 key khác nhau. Audit: `rg "sort\\(|normalize|Math.min.*Math.max"`
quanh mọi chỗ build pairKey → 0 match. Đây là rủi ro số 1 khi port (người port dễ "tiện tay" sort dedupe).

**KHÔNG thuộc plan này:** đổi mô hình ghi doc chính sang `$inc` (đó là p0-02); xoá `recomputeClosedDraws`
(p0-02). Plan này CHỈ: (a) 2 collection + repo + index + entity, (b) accumulator drain pair/account ra
collection phụ thay vì giữ Set/top-K in-doc, (c) `evaluate-alerts` + `get-ops-snapshot` đọc top-K từ
collection phụ. Doc chính vẫn ghi qua `upsertFull` cho tới p0-02.

## Pattern tham chiếu

- `stats-accumulator.ts:59-68` (`PairState` + `Set<string> accountIds` — cái bị xoá), `:202-255`
  (`applyBoard` build pair/triplet — GIỮ logic expand, chỉ đổi đích drain), `:285-311` (`toSnapshot`
  top-K — chuyển sang collection phụ).
- `packages/game-max3dpro/src/rules/exposure.ts:77-126` (`computeProPairLiabilities` đọc `Max3dproTopPair[]`
  — đổi input sang đọc từ `pair_stats`; GIỮ logic ordered forward/reverse + duplicate).
- `betting-stats-repo.ts` (mẫu BaseRepo + docPath); `ops-alert-repo.ts:24` (`const f = docPath<Doc>()`).
- Keno account-stats collection (nếu còn trong repo) làm mẫu `$inc` + `sort().limit(K)`.

## 1. Entity + enums — collection mới (game-max3dpro)

### 1.1. `enums.ts` — thêm 2 collection

`Max3dproCollections` thêm 2 key (const-as-const, đặt cạnh `BettingStats`/`OpsAlerts`):

```typescript
PairStats: "max3dpro_draw_pair_stats",
AccountStats: "max3dpro_draw_account_stats",
```

### 1.2. `entities/pair-stats.ts` — MỚI (named interface, 1 field/dòng)

Doc `max3dpro_draw_pair_stats` — 1 doc / (draw × pairKey ORDERED). Field: `_id`, `drawId`, `pairKey`
(`"first>second"`), `first`, `second`, `units` (Σ betCount chiều này), `amount` (VND), `accountCount`
(distinct — tăng qua `upsertedCount`), `createdAt` (TTL), `updatedAt`. Entity `Max3dproDrawPairStatsEntity`
= `Omit<Doc,"_id"> & { id: string }`. JSDoc GHI RÕ ordered: `pairKey` KHÔNG sort — (A,B)≠(B,A).

### 1.3. `entities/account-stats.ts` — MỚI

Doc `max3dpro_draw_account_stats` — 1 doc / (draw × accountId). Field: `_id`, `drawId`, `accountId`,
`username`, `amount`, `entries`, `createdAt`, `updatedAt`. Dùng `TopAccountStat` shape (game-core) cho
phần trả về top-K.

### 1.4. `entities/betting-stats.ts` — XOÁ `topPairs` + `topAccounts`

- Xoá field `topPairs: Max3dproTopPair[]` + `topAccounts: TopAccountStat[]` (`@deprecated`) khỏi
  `Max3dproDrawBettingStatsDoc`.
- GIỮ interface `Max3dproTopPair` (vẫn là shape trả về khi ĐỌC top-K từ `pair_stats` — dùng ở exposure/
  snapshot). Xoá import `TopAccountStat` nếu không còn ai dùng trong file.
- GIỮ `topPotential` (tính in-memory per-invocation, không drift theo cùng cách — vé nguy hiểm nhất
  theo potentialWin, chấp nhận gần đúng như Max3D).

### 1.5. `entities/index.ts` — export 2 entity mới.

## 2. Repo mới — `pair-stats-repo.ts` + `account-stats-repo.ts`

### 2.1. `PairStatsRepository` (game-max3dpro-application/infras/repos)

```typescript
const f = docPath<Max3dproDrawPairStatsDoc>();

/**
 * Upsert delta 1 batch pair per-draw — $inc units/amount, đếm account distinct qua upsertedCount.
 *
 * pairKey ORDERED "first>second" — KHÔNG sort. Filter {drawId, pairKey} equality → Mongo tự điền
 * khi insert. $setOnInsert first/second/createdAt/accountCount. accountCount tăng KHÔNG ở đây —
 * xem incAccountCountForNewPairs (chỉ +1 khi CẶP (draw×account×pairKey) lần đầu xuất hiện).
 */
async bulkIncPairDeltas(drawId: string, deltas: PairDelta[]): Promise<void>
```

Quyết định `accountCount` (ordered): đếm account distinct PER pairKey. Cách Keno/analysis §5.1: 1
collection phụ `pair_account` (draw×pairKey×accountId) unique, `upsertedCount > 0` ⇒ account mới cho pair
đó ⇒ `$inc accountCount` trên `pair_stats`. **Chốt khi implement:** nếu chi phí 1 collection thứ 3 quá
cao cho 10⁶ pair, chấp nhận `accountCount` = XẤP XỈ (bỏ, để combo_concentration đọc từ account_stats cấp
draw thay vì per-pair) — GHI RÕ trade-off trong JSDoc + hỏi lại trong review. Mặc định plan: theo Keno
(collection phụ đếm chính xác) vì combo_concentration cần accounts/pair.

- `getTopByUnits(drawId, k)`: `sort({units:-1}).limit(k)` → `Max3dproTopPair[]` (map entity→shape).
- `getManyByKeys(drawId, keys)`: đọc chiều ngược cho liability (forward+reverse cùng outcome).
- `deleteByDrawId(drawId)`: dùng khi resettle (đối chiếu `republishResultAfterSettled` $unset stats).

### 2.2. `AccountStatsRepository`

- `bulkIncAccountDeltas(drawId, deltas)`: `$inc amount/entries`, `$set username` (mới nhất),
  `$setOnInsert createdAt`.
- `getTopByAmount(drawId, k)`: `sort({amount:-1}).limit(k)` → `TopAccountStat[]`.
- `deleteByDrawId(drawId)` cho resettle.

Cả 2 repo: mapper riêng (KHÔNG spread mù — field-by-field theo mẫu p0-04). Barrel `repos/index.ts` export.

## 3. Accumulator — bỏ `Set<accountId>` + drain pair/account ra collection phụ

File: `stats-accumulator.ts`.

- **Xoá** `accountIds: Set<string>` + `baselineAccounts` khỏi `PairState` (interface `:59-68`); `PairState`
  còn `first/second/units/amount`. **Xoá** dòng `state.accountIds.add(accountId)` (`:238`).
- **Xoá** `accounts: Map<string, AccountState>` khỏi RAM top-K seed (không giữ để drift) — thay bằng gom
  DELTA per-account trong invocation (Map draw-local chỉ sống 1 lần drain, KHÔNG seed từ baseline).
- `applyBoard`: GIỮ NGUYÊN `expandSelectionToPairs` + `toOrderedPairKey` + build tripletStakes. Chỉ đổi:
  pair delta gom vào `Map<pairKey, {first,second,units,amount}>` (không Set); account delta gom vào
  `Map<accountId, {username,amountDelta,entriesDelta}>`.
- **`toSnapshot`**: BỎ `topPairs`/`topAccounts` khỏi object trả về (2 field đã xoá khỏi entity §1.4).
- **Thêm** getter `drainPairDeltas(): PairDelta[]` + `drainAccountDeltas(): AccountDelta[]` để worker ghi
  ra collection phụ SAU khi drain entries. Đơn vị delta = TỔNG trong invocation này (accumulator vẫn cộng
  dồn từ baseline entries đã đọc — nhưng với pair/account ta chỉ ghi phần MỚI thêm trong invocation, khớp
  `$inc`). ⚠️ Điểm tinh tế: doc chính p0-01 CÒN dùng `upsertFull` (full overwrite) nên baseline seed vẫn
  cần cho totals/byPlayType/tripletStakes; nhưng pair/account KHÔNG seed (chỉ $inc delta invocation). Để
  tránh double-count khi doc chính vẫn full-overwrite mà pair_stats là $inc: **pair/account drain CHỈ tính
  entries ĐỌC MỚI trong invocation này** (không gồm baseline) — accumulator tách riêng "pairDelta" khỏi
  "pair state đầy đủ". GHI RÕ trong JSDoc; đây là mấu chốt review (rủi ro #3).

> Vì mấu chốt trên phức tạp, cân nhắc GỘP p0-01 ghi doc chính bằng $inc luôn (kéo p0-02 §applyDelta vào).
> Chốt: GIỮ tách 2 plan nhưng ở p0-01, pair/account $inc chỉ cộng entries-mới-invocation; totals doc chính
> vẫn full. Sau p0-02 (doc chính cũng $inc delta-invocation) thì 2 đường ghi ĐỒNG NHẤT mô hình. Reviewer
> p0-01 phải xác nhận KHÔNG có đường nào seed pair/account từ baseline (grep `baselineAccounts` = 0).

## 4. Worker sync — ghi collection phụ trong `syncOpenDraws`

File: `sync-betting-stats.ts` (`syncOpenDraws` `:159-204`). Sau `acc.toSnapshot` + `upsertFull`, thêm:

```typescript
await this.pairStatsRepo.bulkIncPairDeltas(drawId, acc.drainPairDeltas());
await this.accountStatsRepo.bulkIncAccountDeltas(drawId, acc.drainAccountDeltas());
```

Conditional write giữ nguyên (`applied === 0 && baseline` → continue). `recomputeClosedDraws`
(`:236-270`): TẠM THỜI cũng phải drain pair/account (recompute từ đầu → deltas = toàn bộ; nhưng vì
`$inc` sẽ CỘNG ĐÔI với những gì đã ghi ⇒ **phải `deleteByDrawId` pair/account TRƯỚC recompute** rồi ghi
lại). Đây là 1 lý do nữa để p0-02 XOÁ hẳn `recomputeClosedDraws`. Ở p0-01 GHI RÕ: recompute path xoá +
ghi lại pair/account để tránh cộng đôi. Nếu thấy rối, ưu tiên làm p0-02 (xoá recompute) TRƯỚC — nhưng
analysis §7 chốt thứ tự p0-01 trước; chấp nhận đoạn cầu tạm này sống 1 PR.

## 5. Đường đọc — exposure + snapshot đọc từ `pair_stats`/`account_stats`

### 5.1. `exposure.ts` — `computeProPairLiabilities` đổi nguồn

Hiện nhận `topPairs: Max3dproTopPair[]` (đọc từ doc). Sau tách, caller truyền `Max3dproTopPair[]` lấy từ
`pairStatsRepo.getTopByUnits(drawId, k)`. Hàm GIỮ NGUYÊN logic ordered (forward×special + reverse×specialSub,
duplicate 1 key). Điểm cần: chiều ngược (`reverseKey`) hiện lookup trong chính `topPairs` (top-K) — sau
tách, để chính xác hơn có thể `getManyByKeys(drawId, reverseKeys)`; nhưng GIỮ hành vi cũ (lookup trong
top-K) là ĐỦ cho P0 (chốt analysis §3.4 "cặp ngoài top-K units nhỏ, chấp nhận sai số đuôi"). KHÔNG đổi
signature nếu không cần — caller build `topPairs` từ repo rồi truyền vào như cũ.

### 5.2. `get-ops-snapshot.ts` — đọc top-K từ collection phụ

`:56-62` hiện dùng `stats.topPairs`. Đổi: đọc song song trong `Promise.all` thêm
`pairStatsRepo.getTopByUnits(drawId, ops.stats.topCombosK)` → truyền vào `computeMax3dproExposure`. Nếu
snapshot DTO trả `topPairs`/`topAccounts` cho FE → lấy từ `pairStatsRepo`/`accountStatsRepo` thay vì
`stats.*`. Kiểm DTO `snapshot.dto.ts` + adapters FE: field `topPairs`/`topAccounts` giờ đến từ nguồn khác
nhưng CÙNG shape → FE không đổi. `totalUnits` vẫn `byPlayType.multiNumber.units + multiDigit.units`.

### 5.3. `evaluate-alerts.ts` — `combo_concentration` + `pair_liability` đọc pair_stats

`:126` quét `stats.topPairs` → đổi nhận `topPairs` qua input (worker/snapshot truyền từ repo). `pair_liability`
đã đọc `exposure.topPairLiabilities` (từ §5.1) — không đổi. GHI RÕ input `EvaluateAlertsInput` thêm
`topPairs: Max3dproTopPair[]` (thay vì đọc `stats.topPairs`). Ordered giữ nguyên.

## 6. Index — `packages/game-max3dpro/src/indexes/index.ts`

Thêm vào `MAX3D_PRO_INDEXES` (tạo THỦ CÔNG trên Atlas TRƯỚC deploy — repo không có runner):

```typescript
// max3dpro_draw_pair_stats (ORDERED)
{ collection: Max3dproCollections.PairStats, key: { drawId: 1, pairKey: 1 },
  options: { unique: true, name: "idx_pair_drawId_pairKey_unique" },
  purpose: "Upsert delta per-pair ORDERED (drawId×pairKey)" },
{ collection: Max3dproCollections.PairStats, key: { drawId: 1, units: -1 },
  options: { name: "idx_pair_drawId_units" }, purpose: "getTopByUnits top-K lúc đọc" },
{ collection: Max3dproCollections.PairStats, key: { createdAt: 1 },
  options: { name: "idx_pair_createdAt_ttl", expireAfterSeconds: 7776000 }, purpose: "TTL 90d" },
// max3dpro_draw_account_stats
{ collection: Max3dproCollections.AccountStats, key: { drawId: 1, accountId: 1 },
  options: { unique: true, name: "idx_acc_drawId_accountId_unique" }, purpose: "Upsert delta per-account" },
{ collection: Max3dproCollections.AccountStats, key: { drawId: 1, amount: -1 },
  options: { name: "idx_acc_drawId_amount" }, purpose: "getTopByAmount top-K lúc đọc" },
{ collection: Max3dproCollections.AccountStats, key: { createdAt: 1 },
  options: { name: "idx_acc_createdAt_ttl", expireAfterSeconds: 7776000 }, purpose: "TTL 90d" },
```

(Nếu chọn collection thứ 3 `pair_account` cho accountCount chính xác §2.1 → thêm index unique
`{drawId,pairKey,accountId}` + TTL.)

## 7. Danh sách file

| File | Việc |
|---|---|
| `game-max3dpro/src/entities/enums.ts` | +2 collection (§1.1) |
| `game-max3dpro/src/entities/pair-stats.ts` | **MỚI** (§1.2) |
| `game-max3dpro/src/entities/account-stats.ts` | **MỚI** (§1.3) |
| `game-max3dpro/src/entities/betting-stats.ts` | xoá `topPairs`/`topAccounts` (§1.4) |
| `game-max3dpro/src/entities/index.ts` | export mới |
| `game-max3dpro/src/rules/exposure.ts` | đổi nguồn `topPairs` (§5.1) |
| `game-max3dpro/src/indexes/index.ts` | +6 index (§6) |
| `game-max3dpro-application/.../repos/pair-stats-repo.ts` | **MỚI** (§2.1) |
| `game-max3dpro-application/.../repos/account-stats-repo.ts` | **MỚI** (§2.2) |
| `game-max3dpro-application/.../mappers/{pair,account}-stats-mapper.ts` | **MỚI** field-by-field |
| `game-max3dpro-application/.../repos/index.ts` + `types/betting-stats.types.ts` | export + `PairDelta`/`AccountDelta` |
| `.../operations/stats-accumulator.ts` | xoá Set/baselineAccounts, drain delta (§3) |
| `.../operations/sync-betting-stats.ts` | ghi collection phụ (§4) |
| `.../operations/evaluate-alerts.ts` | input `topPairs` (§5.3) |
| `.../operations/get-ops-snapshot.ts` + `dto/snapshot.dto.ts` | đọc top-K từ repo (§5.2) |
| adapters/UI FE nếu DTO đổi | kiểm (shape giữ nguyên → thường không đổi) |

KHÔNG chạm: matching/prize rules, `finalize-void`, đường ghi hot path place-bet.

## 8. Đánh giá & verify

1. `pnpm --filter @megawin/game-max3dpro check-types && pnpm --filter @megawin/game-max3dpro-application check-types`
   + `@megawin/worker-max3dpro` + `@megawin/backoffice` (nếu DTO/adapters đổi).
2. **Audit ORDERED (bắt buộc):** `rg -n "sort\\(|\\.sort|normalize|Math.min.*Math.max" packages/game-max3dpro`
   quanh mọi chỗ build pairKey → chỉ được có `sort` cho top-K desc (`{units:-1}`/`{amount:-1}`), TUYỆT ĐỐI
   không sort trên `(first,second)`. Grep `baselineAccounts|accountIds` → 0 (đã xoá).
3. **So top-K trước/sau (dev/staging):** với 1 kỳ có cược, so `topPairs`/`topAccounts` đọc từ collection
   phụ với giá trị doc cũ (trước tách) — units/amount/accounts khớp (sai lệch chỉ ở account rơi ngoài
   top-K cũ, giờ chính xác hơn).
4. **Explain index** trên Atlas: `getTopByUnits` → IXSCAN `idx_pair_drawId_units`; `bulkIncPairDeltas`
   upsert → IXSCAN unique. Tương tự account.
5. **Click-through Operations dev:** panel pair liability + combo concentration + top accounts render đúng;
   ordered forward/reverse hiển thị đúng chiều (không bị gộp (A,B)+(B,A)).
6. **Không cộng đôi:** chạy 2 invocation liên tiếp trên cùng kỳ (không cược mới giữa 2 lần) → pair_stats
   units KHÔNG tăng (delta = 0). Nếu tăng ⇒ đang seed lại từ baseline (bug §3).

## 9. Review code & rủi ro — từng bước

| # | Rủi ro | Mức | Kiểm khi review |
|---|---|---|---|
| 1 | **Sort/normalize pairKey** phá ordered → (A,B) gộp (B,A) → liability ĐB/phụ ĐB sai (rủi ro số 1 khi port) | 🔴 | Audit §8.2 = 0 match. Đọc từng chỗ `toOrderedPairKey`/build pairKey. Test: cược (A,B) → chỉ key `"A>B"` tăng, `"B>A"` = 0 |
| 2 | Xoá `topPairs` khỏi entity còn reader chưa chuyển nguồn → runtime undefined | 🔴 | check-types dẫn hết; grep `\.topPairs\|\.topAccounts` trong app + FE → chỉ còn nguồn repo mới |
| 3 | **Cộng đôi pair/account** — accumulator seed baseline pair rồi lại $inc → units gấp bội | 🔴 | §8.6 test 2 invocation delta=0. Grep `baselineAccounts` = 0. Xác nhận drain CHỈ entries-mới-invocation |
| 4 | `recomputeClosedDraws` không xoá pair/account trước recompute → cộng đôi lúc final | 🟠 | §4: recompute phải `deleteByDrawId` pair+account trước khi ghi lại. Hoặc làm p0-02 (xoá recompute) trước |
| 5 | `accountCount` per-pair đếm sai (nếu bỏ collection thứ 3) → combo_concentration lệch | 🟠 | Chốt §2.1: theo Keno (collection phụ chính xác) hoặc GHI RÕ xấp xỉ + hỏi review |
| 6 | Mapper spread mù cho entity mới → lỗ type | 🟡 | 2 mapper mới field-by-field, KHÔNG `as Entity`; return type tường minh |
| 7 | Index chưa tạo trên Atlas → COLLSCAN 10⁶ pair mỗi getTopByUnits | 🟠 | Checklist deploy: 6 index TRƯỚC worker. Explain xác nhận |
| 8 | TTL 90d xoá pair_stats của kỳ đang tra soát | 🟢 | 90d đủ dài; số chính thức ở `DrawDoc.financial` (ops-only) |

Quy trình review: (a) audit ordered §8.2 trước tiên; (b) đọc accumulator diff — xác nhận không seed
pair/account; (c) test cộng-đôi §8.6; (d) explain index; (e) click-through UI.

## 10. Rollback

Revert code. Collection `pair_stats`/`account_stats` để lại vô hại (TTL tự dọn) hoặc `drop` tay. Doc chính
sau revert vẫn có `topPairs`/`topAccounts` (entity cũ) — nhưng doc tạo trong lúc chạy bản mới THIẾU 2 field
đó → reader cũ đọc `stats.topPairs` sẽ `undefined`. An toàn: revert cả code đọc (exposure/snapshot) trong
CÙNG commit. Vì doc chính p0-01 vẫn `upsertFull`, revert không để lại doc dị mô hình ghi.






