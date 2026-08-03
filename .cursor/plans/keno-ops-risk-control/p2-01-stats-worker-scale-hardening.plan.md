---
name: ""
overview: ""
todos: []
isProject: false
---

# p2-01 — Scale-hardening worker stats (Keno) + tài liệu tham chiếu cho 3 game

> **Nguồn:** review sâu 01/08/2026 trên `SyncBettingStatsUseCase` + `DrawStatsAccumulator` (Keno).
> **Phase:** P2 · **Phụ thuộc:** p0-03 (stats doc), p0-04 (combo-stats), p0-06 (alerts) đã chạy production.
> **Blocks:** — (nhưng là **tài liệu chuẩn** cho bingo18 / max3d / max3dpro — xem §7).
> **Trạng thái Keno:** ✅ **ĐÃ IMPLEMENT** (01/08/2026) — xem §8 để biết chính xác cái gì đã vào code
> và những chỗ **thiết kế trong plan bị đảo lại khi implement** (đọc trước khi port sang 3 game).

## Mục tiêu

Worker stats hiện **đúng nghiệp vụ nhưng không scale**. Ba lỗ hổng mang tính kiến trúc (không phải tinh chỉnh) sẽ **im lặng ở tải thấp và sập ở tải cao** — kiểu lỗi tệ nhất cho một hệ thống kiểm soát rủi ro, vì nó biến mất đúng lúc cần nhất. Thêm một sai số hệ thống **tỷ lệ thuận với số người chơi** trên đúng 2 bảng xếp hạng dùng để phát hiện dồn cược.

Plan này (1) định lượng chi phí, (2) chốt phương án sửa, (3) ghi lại bài học để 3 game còn lại — vốn copy skeleton của Keno — không lặp lại.

**KHÔNG phải mục tiêu:** đổi kiến trúc "worker pre-aggregate + FE đọc `findOne` O(1)". Hướng đó **đúng** (hot path place-bet không bị ảnh hưởng, backoffice đọc rẻ). Chỉ sửa phần **ghi**.

## 1. Mô hình chi phí mỗi tick (nền tảng định lượng)

Ký hiệu: **D** = số kỳ `SalesOpen` đồng thời · **A** = số kỳ có cược mới trong tick · tick = `ops.stats.tickSeconds` (Keno default **10s**).

**D KHÔNG phải 1.** Keno có ~120 kỳ/ngày (`sync-outstanding.ts:59`) và `create-draw.ts` cho phép staff tạo hàng loạt kỳ với `openNow: true` → D thực tế **vài chục đến >100**.

| Bước trong `runTick` | Round-trip | Dữ liệu |
|---|---|---|
| `getUnfinishedDraws(SalesOpen)` | 1 | nhỏ |
| `statsRepo.getManyByDrawIds` | 1 | **D × ~35KB** (full doc, KHÔNG projection) |
| `getEntriesForStatsAfter` mỗi kỳ | **≥ D** (kể cả 0 entry mới) | delta |
| `upsertFull` mỗi kỳ có delta | A | **A × ~35KB ghi đè toàn doc** |
| `comboRepo.findMany` + `bulkUpsertDelta` | 2A | mảng `accounts` full |
| `findConcentrated` (khi rule bật) | A | **COLLSCAN theo kỳ** |
| `alertRepo.bulkUpsertByDedupe` | ≤ A | nhỏ |
| `recomputeClosedDraws` | 2 | closed × 35KB (chỉ để đọc 1 boolean `final`) |

**Chi phí IDLE (không ai cược), D=120:** ~245 query/tick = **24 query/giây** + **4,2MB đọc mỗi 10s ≈ 25MB/phút** — không phụ thuộc lượng cược. Chi phí cố định này bị bỏ qua trong thiết kế ban đầu.

**Chi phí cao điểm (A=D=120):** thêm ~4,2MB **ghi**/tick → **25MB/phút oplog ≈ 36GB/ngày** chỉ riêng stats. Write amplification: 1 entry mới (~1KB) → rewrite doc 35KB = **35×**.

**Kích thước doc `keno_draw_betting_stats`** (default `topCombosK=100, topPotentialK=50, topAccountsK=50`):
`topCombos` ~20KB + `numberFreq` ~2,5KB + `topPotential` ~5KB + `topAccounts` ~4,5KB + `byPlayType` ~1KB ≈ **33KB**. Config max (200/100/100) ≈ **60KB**.

## 2. Bảng rủi ro (xếp theo mức nghiêm trọng)

| # | Rủi ro | Kích hoạt khi | Hậu quả | Mức |
|---|---|---|---|:---:|
| R1 | `keno_draw_combo_stats.accounts` là **mảng object không trần**, read-modify-write mỗi tick | 1 combo được rất nhiều account cược (số hot / KOL / syndicate) | ~90–110B/account → 100k account ≈ 10MB, chạm **BSON 16MB** → `bulkWrite` fail → throw → **abort invocation → mất stats + alert toàn game** | 🔴 |
| R2 | `findConcentrated` dùng `$expr: { $gte: [{ $size: "$accounts" }, n] }` — `$size` **không index được** | Kỳ có nhiều combo cappable | Load **mọi** combo doc của kỳ mỗi tick: 200k combo × ~1KB = **200MB đọc/tick** | 🔴 |
| R3 | `recomputeClosedDraws` giữ **full state RAM** + **không resumable** (`cursor` khởi tạo `undefined` mỗi lần, không watermark riêng) | Kỳ >~500k entry | `potentials` 1 object/entry (1M entry ≈ 250MB) + `combos` kèm `Set<accountId>` → **OOM**; timeout = mất sạch → full-scan lại → **livelock: kỳ lớn không bao giờ `final`** | 🔴 |
| R4 | Vòng `for(;;)` đọc entries **không trần** + `extendLock()` gọi **SAU** tick (dòng 125) chứ không trong vòng đọc | Burst cược (500k entry → 500 round-trip trong 1 tick) | Tick vượt `ttlSeconds=120` → lock hết hạn giữa tick → invocation khác chen vào → 2 writer cùng `upsertFull` từ 2 baseline → **lost-update** (watermark chống double-count nhưng KHÔNG chống ghi đè full-doc) | 🟠 |
| R5 | **Drift topK tích lũy:** accumulator tạo lại **mỗi tick** (`sync-betting-stats.ts:186`), `seed()` chỉ nạp lại top-K (`stats-accumulator.ts:185-207`) | Số account/combo > K | Phần tử rơi khỏi top-K **mất toàn bộ lịch sử**, lần cược sau tính lại từ 0 → tổng hụt, xếp hạng sai, **không tự sửa** đến khi recompute final. **Càng nhiều người chơi càng sai** | 🟠 |
| R6 | `upsertFull` `$set` **toàn doc** mỗi tick mỗi kỳ | D lớn | ~36GB oplog/ngày → replication + backup + WiredTiger cache churn | 🟠 |
| R7 | `getManyByDrawIds` **không projection** (kéo cả `numberFreq`/`byPlayType`) | D lớn | 25MB/phút đọc idle + GC pressure trong Lambda | 🟠 |
| R8 | Lock đơn `keno:stats-sync` cho **mọi** kỳ | tick time > tickSeconds | Trần throughput = 1 core; **alert trễ** = rủi ro nghiệp vụ thật. Recompute nằm chung tick loop → 1 kỳ lớn đóng băng cập nhật **tất cả** kỳ đang mở bán | 🟠 |
| R9 | Vòng `for (const drawId of openDrawIds)` **không try/catch** | 1 kỳ lỗi | Throw ra `runLocked` → cả invocation chết, kỳ còn lại không được xử lý/evaluate alert | 🟡 |
| R10 | `recomputeClosedDraws` đọc **full** stats docs chỉ để lấy `final` | closed draws nhiều | Đọc thừa vài trăm KB/tick | 🟡 |
| R11 | Kỳ void **sau** khi `final: true` không recompute lại (check `final` → skip) | Void sau đóng bán | Stats giữ doanh thu/exposure của entry đã void. **Đánh giá lại khi implement: KHÔNG phải bug** — entry `Void` bị loại tại nguồn đọc nên không có gì để trừ, và số đã tích là dấu vết audit hợp lệ (quyết định A). Rủi ro tồn dư: entry bị **sửa** sau final → ops stats của kỳ đó lệch **vĩnh viễn**. CHẤP NHẬN (02/08): ops stats là dữ liệu tham khảo, số chính thức từ `DrawDoc.financial` (settle, đường độc lập, tự đúng khi resettle). KHÔNG dùng `resetFinal` — xem D2 | 🟢 |

### Ghi chú R5 — chính xác phạm vi drift

Seed **đầy đủ** (→ **chính xác**): `totals`, `byPlayType`, `byTenant`, `numberFreq`, `exposure.worstCaseByPlayType`, `capSets`.

Drift **CHỈ** ở 2 list **tích lũy**: `topAccounts` (amount cộng dồn/account) và `topCombos` (sets/amount cộng dồn/combo).

`topPotential` **KHÔNG** drift: `potentialWin` của 1 entry là **bất biến** — entry rớt khỏi top-K thì mãi mãi không cần quay lại. Đây là tiêu chí phân loại quan trọng: **top-K theo metric bất biến per-item thì an toàn; top-K theo metric tích lũy thì KHÔNG**.

## 3. Phương án sửa — Keno (xếp theo ROI)

### Nhóm A — chặn 3 rủi ro 🔴 (BẮT BUỘC)

**A1. Bỏ mảng `accounts` không trần → tách collection (R1)**

- Tạo `keno_draw_combo_accounts`: **1 doc / `{drawId, comboKey, accountId}`**, ghi bằng `$inc` upsert (`sets`, `amount`) → **không RMW, không giới hạn kích thước, idempotent**.
- Trên doc combo giữ 2 field **vô hướng**: `accountCount` + `sets`/`amount` (đã có).
- `accountCount` là **counter phái sinh**: đếm distinct từ `keno_draw_combo_accounts` (`$group` giới hạn ở các combo vừa bị chạm trong batch) rồi `$set` **giá trị tuyệt đối**.
  - ❌ Bản đầu của plan này đề xuất `$inc` theo `upsertedIds` ("số account mới trong tick"). **Đã bác bỏ khi implement:** crash giữa lệnh ghi `combo_accounts` và lệnh cộng counter thì lần retry không còn thấy account nào là "mới" → counter **thiếu vĩnh viễn**. `$set` tuyệt đối idempotent và tự hội tụ (§3.5.7).
- Xoá `mergeComboAccounts` + phần đọc `findMany` để merge trong `bulkUpsertDelta`.
- TTL index `createdAt` 90 ngày (cùng chuẩn `keno_draw_combo_stats` — xem `mongodb.mdc` §7).

**A2. `$expr $size` → field `accountCount` + index (R2)**

- Index `{ drawId: 1, accountCount: -1 }` → `findConcentrated` thành **IXSCAN range**, độ phức tạp O(số combo vượt ngưỡng) thay vì O(toàn bộ combo của kỳ).
- Đây là nguyên tắc chung: **không bao giờ filter theo `$size`/`$expr` trên field mảng — luôn duy trì counter vô hướng song song.**

**A3. Recompute resumable + bounded RAM (R3)**

Chọn 1 trong 2 (ưu tiên (a)):
- **(a) Đẩy aggregation xuống Mongo:** `$match {drawId, status: {$ne: Void}}` → `$group` theo từng chiều cần thiết (playType, number, tenant, account, combo) → app chỉ nhận kết quả đã gộp. RAM app ~O(K), không O(entries). `allowDiskUse: true`.
- **(b) Nếu vẫn cần loop app-side:** thêm **watermark riêng cho recompute** (`recomputeCursorId` + state trung gian persist) để resume sau timeout, + trần `maxEntriesPerTick`.

Kèm theo: `extendLock()` gọi **trong** vòng đọc (mỗi N batch), không chỉ sau tick (**đồng thời fix R4**).

**A4. Tách recompute khỏi tick loop (R8 phần nghiêm trọng nhất)**

Recompute kỳ đã đóng **không cùng nhịp** với cập nhật kỳ đang mở bán. Tách handler/lock riêng để 1 kỳ lớn không đóng băng alert của toàn bộ kỳ đang chạy.

### Nhóm B — giảm ~90% IO thường xuyên

**B1. `$inc` theo path cố định thay "đọc full baseline + ghi full doc" (R6)** — áp cho phần schema **cố định**: `totals`, `byPlayType` (15×3 path), `numberFreq` (80×2 path), `exposure.worstCaseByPlayType` (12 path), `capSets`. Không cần đọc baseline, không rewrite 33KB. **Chỉ** các array topK còn cần đọc-ghi.

**B2. Projection cho `getManyByDrawIds` (R7)** — khi chỉ cần watermark + topK thì bỏ `numberFreq`/`byPlayType` (~4KB/doc); riêng nhánh recompute chỉ cần `{ drawId, final }` (**fix R10**).

**B3. Ghi topK arrays theo nhịp thưa hơn counters** — VD mỗi 3–6 tick, hoặc chỉ khi thứ hạng **thực sự** đổi. Giảm oplog mà không ảnh hưởng số liệu chính (counters vẫn realtime).

### Nhóm C — sửa drift topK (R5)

**C1. `topAccounts`:** nuôi từ collection tích lũy `{drawId, accountId}` bằng `$inc` (cùng pattern A1) rồi query top-K bằng index → **hết drift**. Bonus: có luôn dữ liệu cho "outstanding theo player/kỳ" mà UI alert `large_bet` đang cần link tới.

**C2. `topCombos`:** pick 8/9/10 đã có `keno_draw_combo_stats` **chính xác** → derive từ đó, bỏ mảng drift trong stats doc. Pick 1–7 (không cappable, không phải nguồn rủi ro cap) → bỏ khỏi `topCombos` **hoặc** giữ gần đúng nhưng **ghi chú rõ trên UI**.

**C3.** Nếu vẫn giữ topK in-memory: thay `sort()` full bằng bounded heap / partial selection.

### Nhóm D — độ bền

**D1.** try/catch **per-draw** trong vòng lặp: log + tiếp kỳ sau, không abort invocation (R9).
**D2.** ~~Khi void kỳ → set `final: false`~~ — **ĐẢO khi implement.** Entry `Void` bị loại ngay tại
nguồn đọc (`getEntriesForStatsAfter`) nên reset chỉ khiến worker quét lại với delta = 0; số đã tích là
**dấu vết audit hợp lệ** ("trước khi huỷ đã cược bao nhiêu"), khớp quyết định A của user. KHÔNG gắn vào
`finalize-void.ts`.

> **Cập nhật 02/08/2026 — `resetFinal` đã bị XOÁ khỏi repo, KHÔNG khôi phục.** Bản gốc mục này giữ lại
> `resetFinal` "dành cho vận hành (Tính lại kỳ này khi entry bị *sửa*)". Sai: trong kiến trúc `$inc` +
> watermark của chính plan này (nhóm B2), flip `final` là **no-op** — `findNotFinal` trả kỳ đó kèm
> `lastEntryId` cũ ở mức cao nhất → 0 entry → `drained` → `stampFinal` lại. Không tính lại được gì.
> Tệ hơn: người bảo trì thấy no-op sẽ reset luôn `lastEntryId` → counter `$inc` chưa xoá ⇒ **cộng đôi
> cả kỳ**, sai âm thầm. Recompute thật cần zero counter + reset watermark trong CÙNG 1 update + xoá doc
> 3 collection phụ + chống loop → phải là use-case riêng có audit log, không phải 1 method repo.
> Chi tiết: `keno-stats-worker-simplification.analysis.md` §5.3.1. Đây là **API sót lại từ mô hình `$set`
> full snapshot** (nơi rescan-từ-đầu tự ghi đè nên `final:false` là đủ) — chính plan này đổi mô hình
> nhưng không rà lại các method public còn nghĩa hay không.
**D3.** Lock **per-draw** (`keno:stats-sync:<drawId>`) hoặc shard theo hash để scale ngang khi D lớn (R8).

### File Keno cần sửa

| Nhóm | File |
|---|---|
| A1 A2 | `packages/game-keno-application/src/infras/repos/combo-stats-repo.ts` (bỏ `mergeComboAccounts`, `accountCount`) |
| A1 | **mới** `packages/game-keno-application/src/infras/repos/combo-accounts-repo.ts` |
| A1 A2 | `packages/game-keno/src/entities/combo-stats.ts` (`accounts[]` → `accountCount`), `packages/game-keno/src/indexes/index.ts` (index `accountCount`, TTL collection mới) |
| A3 A4 D1 B2 | `packages/game-keno-application/src/use-cases/operations/sync-betting-stats.ts` |
| A3 C1 C2 C3 | `packages/game-keno-application/src/use-cases/operations/stats-accumulator.ts` |
| B1 B2 | `packages/game-keno-application/src/infras/repos/betting-stats-repo.ts` (`$inc` paths, projection, `stampFinal`) |
| A3 B2 | `packages/game-keno-application/src/infras/repos/entry-repo.ts` (`getEntriesForStatsAfter` trần đọc / aggregation) |
| A1 C1 | `packages/game-keno-application/src/infras/repos/types/betting-stats.types.ts` |
| A2 | `packages/game-keno-application/src/use-cases/operations/evaluate-alerts.ts` (`combo_concentration` đọc `accountCount`) |
| A1 | `packages/game-keno-application/src/use-cases/operations/get-combo-lookup.ts`, `use-cases/player/get-combo-popularity.ts` (nguồn `accounts`) |
| B2 | `packages/game-keno-application/src/use-cases/operations/get-ops-snapshot.ts` |
| — | `packages/game-keno-application/src/use-cases/void/finalize-void.ts` — **không sửa** (xem D2) |
| A4 D3 | `apps/worker-keno/src/handlers/stats/stats-sync.ts`, `apps/worker-keno/src/functions/stats.yml` |
| — | `packages/game-keno/src/entities/betting-stats.ts` nếu bỏ/đổi `topCombos` (C2) |

## 3.5. ĐƠN GIẢN HOÁ GỐC: xoá `recomputeClosedDraws` — 1 thuật toán thay vì 2

> **Chốt sau thảo luận 01/08/2026.** Mục này **THAY THẾ** A3/A4/C1/C2 ở §3, không phải bổ sung:
> thay vì "làm recompute an toàn hơn", ta **xoá lý do tồn tại** của nó.

### 3.5.1. Chuỗi nhân quả — vì sao recompute tồn tại

Comment `seed()` trong `stats-accumulator.ts` tự khai lý do: *"Counters chính xác; combo/account/
potential chỉ seed top-K từ doc (phần ngoài top-K không có → **gần đúng, recompute sửa**)"*.

```text
upsertFull dùng $set TOÀN doc
  → mỗi tick phải seed lại full state từ doc
    → nhưng doc chỉ lưu top-K (không thể lưu hết account/combo)
      → seed "gần đúng" → DRIFT (R5)
        → cần recompute full để sửa
          → recompute giữ full state trong RAM
            → OOM + livelock kỳ lớn (R3)
```

**Cắt mắt đầu (`$inc` thay `$set` — B1) thì cả chuỗi sụp.** Recompute không phải nhu cầu nghiệp vụ —
nó là **thuế** trả cho quyết định ghi full doc.

Lý do thứ 3 (ẩn): recompute **không phải safety-net, nó đang gánh việc chính**. Nhánh incremental chỉ
lấy `SalesOpen` → kỳ vừa đóng bán rơi khỏi tập ngay tick sau → **phần entry đặt những giây cuối trước
giờ đóng CHỈ được đếm bởi recompute**. Nên không thể xoá recompute mà không mở rộng nhánh incremental.

### 3.5.2. `final` đang mang nghĩa SAI — bug nghiêm trọng nhất

`OpenSalesUseCase` cho phép **`SalesClosed → SalesOpen`**:

```typescript
// packages/game-keno-application/src/use-cases/draws/open-sales.ts:18
const allowedFrom: DrawStatus[] = [DrawStatus.Scheduled, DrawStatus.SalesClosed];
```

Nhưng `POST_CLOSE_STATUSES` stamp `final: true` ngay tại `SalesClosed` → doc có `final: true`
**trong khi kỳ đang nhận cược lại**.

`final` được định nghĩa là *"đã đóng bán"* (trạng thái **tạm thời, quay lại được**) nhưng tên + cách
dùng là *"đã xong hẳn"* (**terminal**). Sai nghĩa ngay từ định nghĩa.

Hôm nay chưa mất data **nhờ may mắn**: nhánh incremental ghi `toSnapshot(..., false)` nên vô tình
reset `final`. Nhưng bất kỳ tối ưu dạng "bỏ kỳ đã final khỏi hàng đợi" sẽ **lập tức thành mất data
thật**.

**Chốt:** `final: true` **CHỈ** khi `draw.status ∈ {Settled, Void}` — hai status không thể quay lại
nhận cược. `SalesClosed`/`Published`/`Settling`/`Voiding` **KHÔNG** stamp final.

### 3.5.3. Ba bug được sửa cùng lúc

| Bug | Hiện tại | Sau sửa |
|---|---|---|
| **B-a** Mở bán lại sau `SalesClosed` | `final: true` khi kỳ vẫn nhận cược → bom hẹn giờ | `SalesClosed` chưa final → vẫn trong hàng đợi → drain tiếp bình thường |
| **B-b** Kỳ nhảy `SalesClosed→…→Settled` **nhanh hơn 1 tick** | Không bắt được trong `POST_CLOSE_STATUSES` (`Settled` không phải unfinished) → **mất delta cuối + không bao giờ final** | Hàng đợi dựa `final` (bền), không phụ thuộc bắt kịp cửa sổ status |
| **B-c** `Voiding` ∈ `POST_CLOSE_STATUSES` | Recompute đọc tập entry **void dở** → số sai → stamp `final` → **sai vĩnh viễn** | Không recompute; `Void` chỉ stamp final, **giữ nguyên số cuối đã tích** |

**Quyết định void (chốt):** kỳ `Void` → stamp `final`, **giữ nguyên số**, KHÔNG zero-out, KHÔNG cần
cờ `voided`. UI chỉ hiển thị số cuối cùng. Entry void đã bị filter tại nguồn nên không có số mới cộng
vào; số đã tích trước khi void là **dấu vết audit hợp lệ** ("trước khi huỷ đã cược bao nhiêu").

### 3.5.4. Thiết kế mới — 1 vòng lặp

Nguồn điều phối **không phải `draw.status`** mà là **chính stats doc** (`final: false`):

```text
1. candidates = statsRepo.findNotFinal()          // index {final:1}, projection {drawId,lastEntryId}
              ∪ SalesOpen chưa có stats doc       // kỳ vừa có cược đầu tiên
2. draws      = drawRepo.getByDrawIds(ids)        // cần status để quyết định stamp final
3. for each candidate:                            // try/catch RIÊNG mỗi kỳ (R9)
     drain entries _id > lastEntryId              // bounded + extendLock BÊN TRONG (R4)
     if delta:  $inc counters + $set lastEntryId + evaluate alerts
     if drained-hết && status ∈ {Settled, Void}:  $set final: true   // tick sau tự rời hàng đợi
```

`final` **đổi vai**: từ *cờ chống chạy lại thuật toán thứ hai* → *điều kiện thoát của vòng lặp duy
nhất*. "Đếm hết" thành **bất biến của vòng lặp**, không cần thuật toán khác kiểm lại.

Giá phải trả (nhỏ, có chủ đích): kỳ `SalesClosed → Settled` nằm trong hàng đợi vài phút, mỗi tick tốn
1 query trả **0 row** (index-only). Đổi lấy tính đúng đắn — chấp nhận.

### 3.5.5. Xoá được gì

| Xoá | File | ~Dòng |
|---|---|---|
| `recomputeClosedDraws` | `sync-betting-stats.ts` | 34 |
| `RECOMPUTE_PAGE_SIZE`, `POST_CLOSE_STATUSES`, `finalized` | `sync-betting-stats.ts` | 12 |
| `seed()` + `baselineAccounts` + tham số `final` của `toSnapshot` | `stats-accumulator.ts` | 50 |
| `getManyByDrawIds` full-doc (thay bằng `findNotFinal` projection) | `betting-stats-repo.ts` | — |

**~100 dòng biến mất, 5 rủi ro mất NGUYÊN NHÂN** (R3, R5, R6, R7, R11) thay vì được vá.

Sau `$inc` + bỏ `seed()`, `DrawStatsAccumulator` thành **delta builder thuần per-tick**: không
baseline, không state cross-invocation, **không drift**. Đây là lý do C1/C2 trở nên đơn giản — không
còn "top-K bị drift" để sửa vì không còn seed top-K.

### 3.5.6. Thay thế giá trị "tự chữa lành" của recompute

Recompute có **một** giá trị thật: nếu incremental có bug thì nó dựng lại từ nguồn. Giữ giá trị đó,
bỏ cái giá (OOM/livelock):

| | Cách cũ | Cách mới |
|---|---|---|
| Phát hiện sai | recompute full **mọi kỳ, mỗi lần đóng bán, phòng hờ** | `countDocuments({drawId, status:{$ne:Void}})` vs `totals.entries` — **1 query index-only** |
| Khi lệch | sửa **âm thầm**, không ai biết từng sai | **phát alert vận hành** → sai số thầm lặng thành **quan sát được** |
| Sửa | trong tick loop realtime | `$group` aggregation **phía Mongo** (`allowDiskUse`), **on-demand** (nút "Tính lại kỳ này") |
| RAM app | O(entries) → OOM | O(K) |
| Ảnh hưởng | 1 kỳ lớn đóng băng alert **mọi** kỳ | không |

### 3.5.7. Nhất quán cross-collection — watermark THEO TỪNG DOCUMENT

`$inc` **không idempotent**, và Mongo **không** cho nguyên tử qua nhiều collection (trừ transaction).
Worker ghi 3 collection mỗi batch (`betting_stats` + `combo_stats` + `account_stats`) nên crash giữa
2 lệnh ghi luôn hỏng theo 1 trong 2 kiểu:

- Cursor đã tiến trước → delta của collection ghi sau **mất vĩnh viễn**.
- Đọc lại batch → collection đã ghi bị **cộng đôi**.

Đảo thứ tự ghi chỉ **đổi loại lỗi**, không hết lỗi. `recomputeClosedDraws` cũng **không** cứu được:
nó chỉ gọi `toSnapshot` → `upsertFull`, **chưa bao giờ** chạm `combo_stats` (không gọi
`drainComboDeltas`). Đây là lỗ hổng **đang tồn tại**, không phải hồi quy do plan này gây ra.

**Cách chặn — không cần transaction, không cần recompute:** mọi doc tích luỹ counter tự mang
watermark của chính nó (`DeltaAccumulatedDoc.lastEntryId`), và update luôn có điều kiện trên nó:

```ts
updateOne(
  { ...key, lastEntryId: { $lt: batchMaxId } },               // batch đã áp → KHÔNG khớp
  { $inc: { ...delta }, $set: { lastEntryId: batchMaxId } },  // cùng 1 lệnh, cùng 1 doc
  { upsert: true },
)
```

`$inc` và `$set lastEntryId` nằm trong **cùng một lệnh trên cùng một document** → nguyên tử. Batch
đã áp rồi thì filter không khớp → no-op.

| Crash ở đâu | Hôm nay | Với per-doc watermark |
|---|---|---|
| Sau khi ghi stats, trước khi ghi combo | Combo **mất vĩnh viễn** | Cursor chưa tiến → tick sau đọc lại → combo áp được, stats **skip** |
| Sau khi ghi combo, trước khi ghi stats | Combo **cộng đôi** | Tick sau đọc lại → combo **skip**, stats áp được |
| Giữa các combo trong cùng batch | Một phần mất | Doc chưa áp thì áp, doc áp rồi thì skip |

Cursor đọc vẫn là `lastEntryId` của stats doc và được tiến **cuối cùng**. Detail doc có thể "đi
trước" cursor nhưng **không bao giờ áp hai lần** → hệ thống **tự hội tụ sau mọi crash**.

**⚠️ Cạm bẫy khi implement:** `upsert:true` + filter có `lastEntryId:{$lt}` → khi doc đã tồn tại VÀ
đã áp batch, filter không khớp nên Mongo cố **insert** → lỗi **duplicate key 11000** trên unique
index. Đó là hành vi **đúng như thiết kế**, nghĩa là "đã áp rồi". Phải `bulkWrite({ordered:false})`
và **coi 11000 là no-op**. Tuyệt đối **không** "sửa" bằng cách bỏ điều kiện `lastEntryId` — bỏ là mất
luôn tính idempotent.

Vì hệ thống đã tự hội tụ, đối chiếu `countDocuments` ở §3.5.6 **hạ cấp từ cơ chế đúng đắn xuống công
cụ giám sát**: vẫn giữ (1 query rẻ, biến sai số thầm lặng thành alert) nhưng tính đúng đắn **không
còn phụ thuộc** vào nó. Nút "Tính lại kỳ này" thành phương án cuối, hiếm dùng.

**Áp cho 3 game còn lại:** bất kỳ collection nào worker `$inc` (kể cả doc stats chính) đều phải có
`lastEntryId` riêng + filter `$lt`. `DeltaAccumulatedDoc` đặt ở `@megawin/game-core/types` để dùng
chung.

#### Counter PHÁI SINH — `$set` tuyệt đối, KHÔNG `$inc` (chốt khi implement 01/08)

Per-doc watermark chỉ bảo vệ được counter mà delta của nó nằm **trong cùng doc** với watermark.
`accountCount` (trên `combo_stats`) là **counter phái sinh**: giá trị của nó suy ra từ số doc trong
`combo_accounts` — một collection KHÁC. Không watermark nào cứu được nó:

| Cách ghi | Crash giữa "ghi combo_accounts" và "cộng counter" | Kết luận |
|---|---|---|
| `$inc` theo `upsertedIds` (số account MỚI trong tick) | Retry thấy doc account đã tồn tại → không còn "account mới" → counter **thiếu vĩnh viễn** | ❌ không vá được |
| `$set` = `countDocuments`/`$group` distinct (giá trị tuyệt đối) | Retry đếm lại → ghi đúng giá trị thật | ✅ tự hội tụ |

**Quy tắc chung:** counter suy ra từ collection khác thì **ghi tuyệt đối** (idempotent theo bản chất,
không cần watermark). Chỉ counter cộng dồn từ **chính delta của batch** mới dùng `$inc` + watermark.
Chi phí đếm lại được chặn bằng cách chỉ đếm các key **vừa bị chạm trong batch** (`$in comboKeys`), nên
tỷ lệ với `READ_BATCH`, không với tổng số combo của kỳ.

#### Chi phí IDLE phải là O(1) round-trip, không O(D)

`ensureDoc` gọi từng kỳ trong vòng lặp = D round-trip **mỗi tick** chỉ để no-op (Keno ~120 kỳ/ngày,
6 tick/phút → ~43k round-trip/giờ ghi 0 byte). Gom `bulkWrite` 1 lệnh (`ensureDocs(drawIds)`).
Nguyên tắc: **mọi việc "chạm mọi kỳ mỗi tick" phải là 1 round-trip.**

## 4. Đối chiếu 3 game còn lại (bingo18 / max3d / max3dpro)

Cả 3 **đã implement đầy đủ** worker stats và là **bản copy gần 1:1 skeleton của Keno** (cùng `BUDGET_MS=55_000`, `READ_BATCH=1_000`, `RECOMPUTE_PAGE_SIZE=2_000`, `ttlSeconds=120`, cùng thứ tự `extendLock`, cùng `upsertFull`).

| # | Rủi ro | bingo18 | max3d | max3dpro |
|---|---|:---:|:---:|:---:|
| R1 | Mảng object không trần + RMW | N/A | ❌ | ❌ |
| R2 | `$expr` + `$size` | N/A | ❌ | ❌ |
| R3 | Recompute không resumable + full RAM | ✅ | ✅ | ✅ **nặng nhất** |
| R4 | Vòng đọc không trần + `extendLock` ngoài vòng | ✅ | ✅ | ✅ |
| R5 | Drift topK tích lũy | ✅ `topAccounts` | ✅ `topAccounts`+`topPairs` | ✅ `topAccounts`+`topPairs` |
| R6 | `upsertFull` ghi đè full doc | ✅ | ✅ **nặng hơn Keno** | ✅ **nặng hơn Keno** |
| R7 | Baseline không projection | ✅ | ✅ | ✅ |
| R8 | Lock đơn toàn kỳ | ✅ | ✅ | ✅ |
| R9 | Không try/catch per-draw | ✅ | ✅ | ✅ |
| R11 | Void sau `final` không recompute | ✅ | ✅ | ✅ |

### Tin tốt — 3 game TRÁNH được 2 rủi ro 🔴 nặng nhất

**R1 + R2 không lặp lại** vì thiết kế chọn `accounts: number` (chỉ đếm) thay vì mảng object, và **không có collection stats phụ**:
- bingo18: **N/A** — không có khái niệm combo/pair. Dùng **full-bucket map 38 key** `byPlayType` → stats **exact**, không cần top-K cho playType. Alert là `bucket_concentration`, tính **thuần in-memory**, không query.
- max3d/max3dpro: `topPairs` nằm **trong chính doc stats**, field đếm là `accounts: number`; `accountIds: Set<string>` chỉ tồn tại **trong RAM**, không persist. Không có `merge*Accounts`, không có RMW. Alert tính từ `topPairs`/`tripletStakes` sẵn trong doc.
- Grep `$expr` + `$size` trong 3 package application: **0 kết quả**. Grep `mergeComboAccounts`: **chỉ Keno**.

→ **Bài học ngược:** `accounts: number` + Set in-RAM là lựa chọn **đúng hơn** Keno. Khi Keno sửa (A1), đích đến chính là mô hình này (cộng collection phụ để hết drift `accountCount`).

### Tin xấu — 3 game NẶNG HƠN Keno ở R6 và R3

- **max3d/max3dpro:** `tripletStakes` là Record **bounded 1000 key** (000–999), mỗi key là object nhiều field → worst-case **~80KB**, cộng `topPairs`(≤100, Zod cho tới 200) + `topPotential`(50) + `topAccounts`(50) → **doc ~80–100KB bị `$set` ghi lại TOÀN BỘ mỗi 30s**. → **B1 (`$inc` theo path) là ưu tiên cao hơn ở 2 game này so với Keno.**
- **max3dpro (R3, nghiêm trọng nhất toàn bộ 4 game):** mỗi board `multiNumber` expand thành **380 ordered pair**; map `pairs` theo `pairKey` **có thứ tự** → không gian khoá 1000×1000 = **10⁶ key**, giữ nguyên trong RAM suốt recompute, **mỗi key kèm `Set<string> accountIds`**. Ordered là **bắt buộc** theo luật Pro (chiều đúng ×`special`, chiều ngược ×`specialSub`) → không thể giảm bằng cách bỏ thứ tự.
- **bingo18 (CPU, không phải RAM):** exposure tính **chính xác tuyệt đối** bằng enumerate **216 outcome × số board** mỗi entry. Đúng hơn Keno (Keno dùng proxy Σ max per board) nhưng CPU per-entry cao → recompute kỳ lớn tốn CPU thay vì RAM. `byPlayType` 38 key nên doc **nhẹ nhất** (~10–20KB).
- **max3d/max3dpro dùng `tickSeconds` default 30** (Keno/bingo18 = 10) → áp lực IO/phút thấp hơn 3×, nhưng alert trễ hơn.
- **max3d/max3dpro:** `topCombosK` bị **tái dụng** làm giới hạn cho `topPairs` — tên config lệch nghĩa, cần đổi tên hoặc ghi chú.

### `band-aid` đã tồn tại ở max3d/max3dpro — KHÔNG đủ

`accounts: Math.max(p.baselineAccounts, p.accountIds.size)` cứu **riêng** field `accounts` khỏi tụt số khi pair rơi khỏi top-K, nhưng `units`/`amount` **vẫn drift** y như Keno. Đây là dấu hiệu drift đã được **nhận ra một phần** rồi vá tạm thay vì sửa gốc → cần fix C1/C2 thật.

### Thứ tự fix đề xuất cho 3 game

1. **R4** (`extendLock` trong vòng đọc + trần entries/tick) — rủi ro cao nhất, sửa rẻ nhất, code **giống nhau** cả 3 game.
2. **R3 + R6 cho max3d/max3dpro** — doc 80–100KB `$set` mỗi 30s + `tripletStakes` 1000 key trong RAM + max3dpro 380 pair/board.
3. **R9** try/catch per-draw — 3 dòng/game, chặn cascade failure.
4. ~~**R11** reset `final` khi void~~ — **bỏ**, không phải bug (xem R11 §1 và §2 D2).
5. **R5** drift topK — bỏ band-aid `Math.max`, thiết kế lại.
6. **R8** lock đơn — chỉ cần khi lượng kỳ/entries tăng.

### Config default hiện tại (đối chiếu)

| Game | file default | `tickSeconds` | `topCombosK` | `topPotentialK` | `topAccountsK` |
|---|---|:---:|:---:|:---:|:---:|
| keno | `game-keno/src/rules/financials.ts` | 10 | 100 | 50 | 50 |
| bingo18 | `game-bingo18/src/rules/financials.ts:156-160` | 10 | **không có** | 50 | 50 |
| max3d | `game-max3d/src/rules/defaults.ts:85-90` | 30 | 100 (→`topPairs`) | 50 | 50 |
| max3dpro | `game-max3dpro/src/rules/defaults.ts:70-75` | 30 | 100 (→`topPairs` ordered) | 50 | 50 |

Type dùng chung: `packages/game-core/src/types/betting-stats.ts` — `OpsStatsConfigBase` (bingo18) / `OpsStatsConfig` (max3d, max3dpro, keno).
Zod range: `apps/backoffice/src/app/api/{game}/config/_lib/schema.ts` — `tickSeconds` 5–300, `topCombosK` 10–200, `topPotentialK`/`topAccountsK` 10–500.

## 5. File cần sửa — 3 game (thay `{game}` = bingo18 | max3d | max3dpro)

Cấu trúc **đồng nhất** cả 3 game nên dùng chung 1 bảng. Cột "Rủi ro" chỉ rõ vì sao file đó bị đụng.

| File | Rủi ro |
|---|---|
| `packages/game-{game}-application/src/use-cases/operations/sync-betting-stats.ts` | R3 R4 R6 R7 R8 R9 R11 |
| `packages/game-{game}-application/src/use-cases/operations/stats-accumulator.ts` | R3 R5 |
| `packages/game-{game}-application/src/use-cases/operations/evaluate-alerts.ts` | nếu đổi shape stats |
| `packages/game-{game}-application/src/use-cases/operations/get-ops-snapshot.ts` | R7 (đọc full doc, cần projection) |
| `packages/game-{game}-application/src/infras/repos/betting-stats-repo.ts` | R6 R7 R11 (`$inc` path, projection; XOÁ `upsertFull`/`recomputeFull`/`resetFinal` — xem D2) |
| `packages/game-{game}-application/src/infras/repos/entry-repo.ts` | R3 R4 (`getEntriesForStatsAfter`) |
| `packages/game-{game}-application/src/infras/repos/types/betting-stats.types.ts` | R5 R6 |
| `packages/game-{game}-application/src/infras/repos/ops-alert-repo.ts` | nếu đổi alert payload |
| `packages/game-{game}-application/src/use-cases/void/finalize-void.ts` | — (R11 đã đánh giá lại: không sửa) |
| `packages/game-{game}/src/entities/betting-stats.ts` | R5 R6 |
| `packages/game-{game}/src/entities/types.ts` | config ops |
| `packages/game-{game}/src/indexes/index.ts` | index mới |
| `apps/worker-{game}/src/handlers/stats/stats-sync.ts` | R8 |
| `apps/worker-{game}/src/functions/stats.yml` | R8 (shard lock / schedule) |
| `apps/backoffice/src/app/api/{game}/config/_lib/schema.ts` | config range |
| `apps/backoffice/src/app/api/{game}/operations/snapshot/route.ts` | nếu đổi DTO |

**Riêng từng game (khác đường dẫn / khác nội dung):**

| Game | File | Ghi chú |
|---|---|---|
| bingo18 | `packages/game-bingo18/src/rules/financials.ts:139-161` | default `ops.stats` |
| bingo18 | `packages/game-bingo18/src/rules/exposure.ts:227-232` | 216 outcome × board — tối ưu CPU recompute |
| max3d | `packages/game-max3d/src/rules/defaults.ts:69-91` | default `ops.stats` |
| max3d | `packages/game-max3d/src/rules/exposure.ts:112,147` | `computeBasicWorstCase`, `computePairLiabilities` — phụ thuộc shape `tripletStakes`/`topPairs` |
| max3dpro | `packages/game-max3dpro/src/rules/defaults.ts:54-76` | default `ops.stats` |
| max3dpro | `packages/game-max3dpro/src/rules/exposure.ts:77,140` | `computeProPairLiabilities` (ordered pair), `computeMax3dproExposure` |
| max3dpro | `packages/game-max3dpro-application/src/use-cases/operations/stats-accumulator.ts:202-254` | **ưu tiên #1**: `expandSelectionToPairs` 380 pair/board |

**Dùng chung (sửa 1 lần, ảnh hưởng cả 4 game):**
- `packages/game-core/src/types/betting-stats.ts` — `OpsStatsConfigBase` / `OpsStatsConfig`.
- `packages/worker-core/src/use-cases/locked-worker.use-case.ts` — `extendLock` / `ttlSeconds` / `resolveLockKey` (R4 R8) **nếu** chọn fix ở tầng base thay vì từng worker. Ưu tiên fix ở base: 4 game cùng bug thì cùng nghiệm.

## 6. Không làm (trong plan này)

- Không đổi kiến trúc pre-aggregate. Hot path place-bet **không** được đụng.
- Không đổi công thức exposure/cap của bất kỳ game.
- Không bỏ `topPotential` — list này **không** drift (metric bất biến per-entry).
- Không tăng `tickSeconds` để "chữa" IO — đó là đổi rủi ro nghiệp vụ (alert trễ) lấy chi phí hạ tầng. Sửa gốc bằng `$inc` + projection.
- Không thêm Redis/cache tầng đọc: FE đọc đã O(1), nút thắt nằm ở **ghi**.

## 7. Bài học — checklist BẮT BUỘC khi thêm worker stats cho game mới

Đây là phần **quan trọng nhất** của plan: 4 lỗi dưới đây đã được **copy sang 3 game** trước khi ai phát hiện. Mọi game mới PHẢI qua checklist này trước khi merge.

1. **Không bao giờ dùng mảng object không trần trong document.** Nếu số phần tử phụ thuộc **số người chơi** (không phải hằng số nghiệp vụ) → **tách collection riêng, ghi bằng `$inc` upsert**. Giữ trên doc cha chỉ counter vô hướng. (BSON 16MB là hard limit, và RMW mảng lớn còn chết trước đó vì băng thông.)
2. **Không filter theo `$size`/`$expr` trên field mảng** — không index được → COLLSCAN. Luôn duy trì counter vô hướng song song + index trên counter.
3. **Phân loại top-K trước khi implement:** metric **bất biến per-item** (`potentialWin`) → top-K an toàn. Metric **tích lũy** (amount/sets cộng dồn) → top-K **KHÔNG** an toàn, sai số tỷ lệ thuận số người chơi. Phải nuôi từ nguồn đầy đủ (collection `$inc` + index) rồi mới lấy top-K khi đọc. **`Math.max(baseline, current)` là band-aid, không phải fix.**
4. **Mọi vòng lặp đọc dữ liệu trong worker có lock phải: (a) gọi `extendLock()` BÊN TRONG vòng lặp, (b) có trần số item/tick, (c) resumable bằng watermark persist.** Thiếu 1 trong 3 → livelock hoặc 2 writer song song ở tải cao.
5. **Vòng lặp per-entity trong worker phải có try/catch riêng** — 1 entity lỗi không được kéo sập cả invocation.
6. **Job recompute/backfill KHÔNG chạy chung tick loop với job realtime.** Tách lock + tách handler, nếu không 1 entity lớn sẽ đóng băng toàn bộ cập nhật realtime.
7. **Ghi document lớn thì dùng `$inc` theo path cố định**, không `$set` toàn doc. `$set` full doc là write amplification cỡ (kích thước doc / kích thước delta).
8. **Mọi `find` trong worker chạy theo chu kỳ phải có projection.** Đọc idle × D kỳ × 6 lần/phút cộng dồn rất nhanh.
9. **Cờ `final`/`completed` phải có đường reset** khi dữ liệu nguồn bị **sửa**, nếu không sai số là **vĩnh viễn**. (Với *huỷ* thì không cần, nếu bản ghi huỷ đã bị loại ngay tại nguồn đọc.)
10. **Ước lượng D (số entity đồng thời) trước khi thiết kế, không giả định D=1.** Chi phí idle = D × (số query cố định) và tồn tại **dù không có giao dịch nào**.
11. **Định lượng kích thước document tối đa từ config Zod max**, không từ default. Config max của Keno cho doc **60KB** (gần 2× default 33KB).
12. **Cờ trạng thái phải khớp CHÍNH XÁC ngữ nghĩa terminal.** Trước khi đặt cờ "đã xong", **đọc
    use-case chuyển status** để biết trạng thái đó có **quay lại được** không — `SalesClosed →
    SalesOpen` là **hợp lệ** trong Keno! Cờ "xong" đặt trên trạng thái tạm thời = bom hẹn giờ.
13. **Nguồn điều phối hàng đợi công việc phải là TRẠNG THÁI CÔNG VIỆC, không phải trạng thái đối
    tượng nghiệp vụ.** `findNotFinal()` bền với mọi tốc độ chuyển status; `getUnfinishedDraws(status)`
    phụ thuộc việc bắt kịp một cửa sổ tạm thời → **mất dữ liệu khi status nhảy nhanh hơn nhịp worker**.
14. **Hai code path cùng tính một con số = một trong hai sẽ sai.** Nếu path B tồn tại để "sửa" path A,
    hãy hỏi **vì sao A gần đúng** — thường A gần đúng do một **quyết định lưu trữ có thể đảo được**
    (ở đây: `$set` full doc → phải seed → seed chỉ có top-K), và đảo nó thì B **biến mất**.
15. **Trạng thái "đang xử lý dở" (VD `Voiding`) KHÔNG được là đầu vào của phép tính chốt số.** Đọc
    dữ liệu giữa lúc nó đang bị biến đổi → số sai, mà nếu kèm cờ "đã chốt" thì sai **vĩnh viễn**.
16. **Ghi `$inc` sang N collection trong 1 batch thì MỖI collection phải có watermark riêng.** Không
    có nguyên tử cross-collection: crash giữa 2 lệnh ghi → mất delta (cursor đã tiến) hoặc cộng đôi
    (đọc lại). Đảo thứ tự ghi chỉ đổi loại lỗi. Fix: filter `lastEntryId:{$lt:batchMaxId}` + `$inc`
    và `$set lastEntryId` **cùng 1 lệnh trên cùng 1 doc** → tự hội tụ sau mọi crash, không cần
    transaction. Xem `DeltaAccumulatedDoc` và §3.5.7.
17. **Idempotency phải là thuộc tính của LỆNH GHI, không phải của job dọn dẹp.** Nếu tính đúng đắn
    phụ thuộc "recompute sẽ sửa sau", thì mọi lúc chưa recompute là **đang sai mà không ai biết**.
    Ưu tiên: lệnh ghi tự an toàn → recompute/đối chiếu hạ cấp thành **giám sát**, không phải cơ chế.
18. **Counter PHÁI SINH từ collection khác thì ghi `$set` TUYỆT ĐỐI, không `$inc` theo delta.**
    Watermark chỉ bảo vệ counter mà delta nằm cùng doc với nó. `accountCount` suy ra từ số doc ở
    collection khác → `$inc` theo "số doc mới trong tick" mất vĩnh viễn khi crash giữa 2 lệnh; `$set`
    giá trị đếm lại thì tự hội tụ. Chặn chi phí đếm bằng cách chỉ đếm key **vừa bị chạm trong batch**.
19. **Việc "chạm mọi entity mỗi tick" phải là 1 round-trip (`bulkWrite`), không N.** `ensureDoc` trong
    vòng `for` = D round-trip/tick chỉ để no-op — chi phí cố định tồn tại **dù không ai cược**.
20. **Đọc kỹ signature thật của driver trước khi dựa vào nó.** `MongoBulkWriteError.writeErrors` khai
    `OneOrMore<WriteError>` (có thể là object đơn, không phải luôn là mảng) và `error.code` chỉ là lỗi
    ĐẦU TIÊN — kiểm tra "toàn bộ lỗi đều là 11000" phải normalize về mảng trước.
21. **Rà projection theo ĐƯỜNG THỰC THI, không theo collection đang sửa.** Tối ưu doc stats rồi vẫn
    còn `getUnfinishedDraws()` + `getDrawsByIds()` kéo full `DrawDoc` mỗi tick chỉ để đọc `status`, và
    `get-ops-snapshot` (FE poll 10s) gọi `getDrawById` cũng chỉ để đọc `status`. Cách rà: liệt kê **mọi
    lệnh Mongo trong 1 tick / 1 request**, với mỗi lệnh hỏi "dùng bao nhiêu field trong kết quả?".
    Nếu ≤ 2–3 field → thêm method thin có projection, **đừng tái dùng method full-doc** cho đường nóng
    (đặt tên khác nhau để lần sau không ai dùng lẫn).

### Cập nhật tài liệu liên quan

- `.cursor/analysis/keno-operations-risk-control.analysis.md` §11 — thêm risk mới + checklist cho game sau.
- `.cursor/rules/mongodb.mdc` — bổ sung quy tắc (1)(2)(7)(8) thành mục riêng về document growth & projection.
- `00-overview.md` — trỏ tới plan này ở phần Risk.

## 8. Trạng thái implement Keno (01/08/2026)

### Đã vào code

| Việc | File |
|---|---|
| `DeltaAccumulatedDoc` (watermark chuẩn) | `packages/game-core/src/types/betting-stats.ts` |
| Bỏ `topCombos`/`topAccounts` khỏi stats doc; `final` = terminal | `packages/game-keno/src/entities/betting-stats.ts` |
| `combo_stats`: bỏ `accounts[]` → `accountCount`; thêm `playType`/`numbers`; **mọi** play type | `packages/game-keno/src/entities/combo-stats.ts` |
| Entity mới `combo_accounts`, `account_stats` | `entities/combo-stats.ts`, `entities/account-stats.ts` |
| 7 index mới (`final`, `drawId+sets`, `drawId+accountCount`, unique + TTL cho 2 collection mới) | `packages/game-keno/src/indexes/index.ts` |
| Factory `createEmptyByPlayType` (seed đủ 15 slot) | `packages/game-keno/src/rules/stats-shape.ts` |
| `applyDelta` (`$inc` theo path + `$push/$sort/$slice`), `findNotFinal` (projection mỏng), `ensureDocs` (1 bulkWrite), `stampFinal` (KHÔNG có `resetFinal` — xoá 02/08, xem D2) | `infras/repos/betting-stats-repo.ts` |
| `getTopCombos`, `findConcentrated` theo `accountCount`, `syncAccountCounts` (`$set` tuyệt đối) | `infras/repos/combo-stats-repo.ts` |
| Repo mới: `combo-accounts-repo.ts` (`countAccountsByCombo` + `$inc` upsert), `account-stats-repo.ts` (`getTopAccounts`/`countPlayers`/`getByAccount`) | `infras/repos/` |
| Helper `runDeltaBulkWrite` (11000 = no-op) | `infras/repos/delta-write.ts` |
| Accumulator **delta-only** (bỏ `seed()`, `ComboState`, `baselineAccounts`, `toSnapshot`) | `use-cases/operations/stats-accumulator.ts` |
| Worker 1 vòng lặp; **xoá `recomputeClosedDraws`**; `extendLock` trong vòng đọc; trần entries/kỳ + kỳ/tick; try/catch per-draw | `use-cases/operations/sync-betting-stats.ts` |
| `uniquePlayers` thật + top-K derive lúc đọc; `drawStatus` đọc bằng projection thay full DrawDoc | `use-cases/operations/get-ops-snapshot.ts`, `dto/snapshot.dto.ts` |
| Thin read cho đường nóng: `getStatusesByDrawIds` (projection `{drawId,status}`), `listUnfinishedDrawIds` (covered query) | `infras/repos/draw-repo.ts` |
| FE đọc `topCombos`/`topAccounts`/`uniquePlayers` từ cấp snapshot | `apps/backoffice/.../keno/operations/_lib/adapters.ts` + `sections/{kpi,analytics}` |

### Phát sinh khi review: R7 còn sót ở collection KHÁC

Nhóm B2 chỉ sửa projection cho `keno_draw_betting_stats`, nhưng worker mỗi tick còn gọi
`getUnfinishedDraws()` + `getDrawsByIds()` — cả hai **đọc full `DrawDoc`** (có `financial`,
`settleSummary`, `vietlottRef`, `stats`…) chỉ để lấy `drawId` và `status`. `get-ops-snapshot`
(FE poll 10s) cũng gọi `getDrawById` chỉ để đọc `status`.

Đã thêm 2 method thin ở `draw-repo`: `listUnfinishedDrawIds()` (covered query trên
`idx_status_drawId_desc`) và `getStatusesByDrawIds()` (IXSCAN + projection 2 field). **Bài học
tổng quát:** rà projection theo **đường thực thi** (mọi repo mà tick/route chạm), không theo
collection mình đang sửa — xem checklist §7 mục 24.

### Thiết kế bị ĐẢO khi implement (đọc trước khi port)

1. **`accountCount`: `$inc` theo `upsertedIds` → `$set` tuyệt đối.** Lý do ở §3.5.7 ("Counter PHÁI
   SINH"). Đây là thay đổi **ngữ nghĩa**, không phải tinh chỉnh: `$inc` không thể idempotent vì delta
   nằm ở collection khác với watermark.
2. **`ensureDoc(drawId)` → `ensureDocs(drawIds)` (1 bulkWrite).** Chi phí idle O(D) round-trip/tick là
   không chấp nhận được với D ~ vài chục.
3. **Nhóm A3(b)/A4/D3 KHÔNG làm** — mất lý do tồn tại sau khi xoá recompute: không còn job full-scan
   nên không cần watermark riêng cho recompute, không cần tách lock/handler, chưa cần shard lock.
4. **Nhóm B3 (ghi topK nhịp thưa) KHÔNG làm** — `topCombos`/`topAccounts` không còn là mảng trong doc;
   `topPotential` cắt K ngay trong lệnh `$push` nên không có gì để giãn nhịp.

5. **Nhóm D2 KHÔNG làm** — xem lý do đã cập nhật ở §2 nhóm D. Entry `Void` bị loại tại nguồn nên reset
   `final` sau khi void là no-op tốn round-trip, và số đã tích là dấu vết audit hợp lệ.

### Còn lại

- Tạo 7 index mới trên MongoDB (thủ công theo `KENO_INDEXES`) **trước khi** deploy worker.
- Đối chiếu `countDocuments` vs `totals.entries` (§3.5.6, giám sát) chưa implement.
- Port sang bingo18 / max3d / max3dpro theo §4–§5.