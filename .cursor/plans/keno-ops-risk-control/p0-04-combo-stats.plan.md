# p0-04 — Collection `keno_draw_combo_stats` + tra cứu combo (staff)

> **Nguồn:** `.cursor/analysis/keno-operations-risk-control.analysis.md` §3.8, verdict #14.
> **Phase:** P0 · **Phụ thuộc:** p0-02, p0-03 (chung worker) · **Blocks:** p0-06 (rule combo_concentration), p0-07 (ô tra cứu), p1-01 (player).

## Mục tiêu

Thống kê chi tiết từng combo pick 8/9/10 (cappable) để: (1) phát hiện dồn cược 1 bộ số (syndicate); (2) drill-down `capSets`; (3) nền cho minh bạch player (p1-01). Cùng worker với p0-03 — thêm 1 bulkWrite, KHÔNG đụng place-bet, KHÔNG index mới trên entries.

## Pattern tham chiếu

| Phần | File mẫu |
|---|---|
| Entity Doc | `packages/game-keno/src/entities/draw.ts`; hằng `CAPPABLE_PICK_COUNTS` đã có trong `entities/entry.ts` |
| Enum/Index | `KenoCollections`, `KENO_INDEXES` (`packages/game-keno/src/indexes/index.ts`) |
| Repo bulkWrite upsert | `entry-repo.ts` (`bulkWrite`, ops `updateOne` upsert) |
| Worker | dùng chung `SyncBettingStatsUseCase` (p0-03) |
| API route | `apps/backoffice/src/app/api/keno/operations/summary/route.ts` (`withApi().auth().query().handler()`), `_lib/schema.ts` |

## Việc cần làm

### 1. Entity (`packages/game-keno/src/entities/combo-stats.ts`)

- `KenoDrawComboStatsDoc` — shape analysis §3.8 (`_id: unknown`, `drawId`, `comboKey`, `sets`, `amount`, `createdAt`, `updatedAt`, **`accounts: Array<{ accountId; username; sets; amount }>`**).
- **`accounts` lưu đầy đủ (chốt 28/07/2026):** mỗi phần tử có `accountId` + `username` (snapshot từ entry — KHÔNG query bảng account riêng; tên field ĐỔI từ `accountName` sang `username` ngày 29/07/2026 để đồng nhất với `TicketEntryDoc.username`) + `sets`/`amount` của account đó, để staff hiển thị tên đầy đủ + drill-down. `players = accounts.length` (không lưu field đếm riêng — derive). Cappable combo trùng nhiều account là hiếm (vài chục) → mảng chấp nhận được; đa số combo 1 phần tử.
- `comboKey = `${playType}:${sortedNumbers.join(",")}`` — helper build key đặt trong `packages/game-keno/src/rules/` hoặc `helpers/` (pure, tái dùng cho worker + lookup + player). Tìm helper sort số hiện có trước khi viết mới.
- Entity + barrel như p0-03.

### 2. Enum + Index

- `ComboStats = "keno_draw_combo_stats"` vào `KenoCollections`.
- Index `{ drawId: 1, comboKey: 1 } unique` vào `KENO_INDEXES`.
- **Retention — TTL index (đảo quyết định 30/07/2026, xem "Review sau triển khai" cuối file):**
  ban đầu chốt cleanup batch (KISS, "không có TTL tiền lệ") — SAI, `packages/game-core/src/indexes/index.ts`
  (`TX_INTENT_INDEXES`) và `packages/audit/src/indexes/index.ts` đã dùng TTL từ trước. Đổi
  sang TTL thật: `IndexSpec.options` thêm `expireAfterSeconds?: number`, thêm entry
  `{ key: { createdAt: 1 }, options: { name: "idx_createdAt_ttl", expireAfterSeconds: 90*24*60*60 } }`
  vào `KENO_INDEXES`. Index TTL PHẢI single-field ascending, KHÔNG gộp vào unique compound
  index phía trên.

### 3. Repo (`combo-stats-repo.ts`)

- `ComboStatsRepository extends BaseRepo`. Methods:
  - `bulkUpsertDelta(ops)` — với mỗi combo trong batch delta: cộng `sets`/`amount` tổng **và merge từng account**. Vì `accounts` là mảng object (không thể `$inc` mù), cách chuẩn: worker đọc doc combo hiện có trong batch context (hoặc gom in-memory theo comboKey trong tick, biết trọn delta) → tính mảng `accounts` mới (merge accountId đã có = cộng dồn, mới = push) → `$set: { accounts, sets, amount, updatedAt }`, `$setOnInsert: { createdAt }`, `upsert: true`. KHÔNG cần `$inc` vì worker đã có tổng.
  - `getByCombo(drawId, comboKey): findOne`. **KHÔNG có method cleanup xoá thủ công** — retention do TTL index đảm nhiệm (§2).

### 4. Tích hợp worker (sửa `SyncBettingStatsUseCase` từ p0-03)

- Trong cùng vòng xử lý delta: với entry có board pick 8/9/10, build `comboKey`, gom delta `sets/amount` **và accountId+username** theo comboKey (in-memory trong tick), rồi `bulkUpsertDelta`.
- **KHÔNG recompute lúc salesClosed cho combo (chốt 28/07/2026):** vì worker theo watermark insert-stream (mỗi entry đúng 1 lần) + lưu mảng accountId đầy đủ → `accounts` chính xác realtime, không phải approximate. Sau salesClosed hết entry mới → mảng tự đóng băng. (Safety-net recompute của stats doc §3.3 bước 3 vẫn giữ cho stats tổng, nhưng combo accounts không phụ thuộc.)
- **KHÔNG cleanup batch trong worker (đảo quyết định 30/07/2026)** — retention là TTL index (§2), worker không cần gọi gì cả.

### 5. API tra cứu combo cho staff

- Route `apps/backoffice/src/app/api/keno/operations/combo-lookup/route.ts`: `withApi().auth({roles:[CompanyRole.Staff]}).query(schema).handler(...)`. Query: `drawId` + `numbers` (8–10 số). Handler build `comboKey`, gọi use-case → `getByCombo` → trả `{ sets, amount, accounts: [{accountId, username, sets, amount}] }`.
- Zod schema trong `operations/_lib/schema.ts`: validate `numbers` là 8–10 phần tử `"01".."80"` distinct.
- Use-case `GetComboLookupUseCase extends NextApiUseCase` trong `use-cases/operations/`.

## Quyết định cần chốt trong plan

- **`accounts` chính xác realtime, KHÔNG chốt salesClosed:** worker cập nhật liên tục + lưu mảng accountId đầy đủ → không còn approximate. Bỏ recompute combo lúc salesClosed.
- **Retention: TTL index** (đảo quyết định ban đầu — xem §2 + "Review sau triển khai" cuối file). KHÔNG cleanup batch tự viết.

## Không làm

- KHÔNG track combo cho pick <8 (không cappable, cardinality nổ). KHÔNG index mới trên entries.
- KHÔNG cleanup batch tự viết trong app code cho retention — dùng TTL index (đảo so với bản gốc, xem "Review sau triển khai").

## Verify

`check-types` cả 2 package + backoffice. Test: draw có nhiều board pick10 trùng → combo doc `sets`/`accounts` tăng đúng; combo-lookup trả đúng số.

## Định nghĩa Done

Combo stats cập nhật trong worker, staff tra cứu được 1 bộ số bất kỳ. Cập nhật `00-overview.md`.

## Review sau triển khai (30/07/2026) — TTL index thay cleanup batch, ÁP DỤNG CHO 4 GAME

**Sai lầm ban đầu:** plan gốc viết "không có TTL tiền lệ trong dự án" nên chốt cleanup batch
(`deleteOlderThan(cutoff)` gọi từ worker mỗi invocation). **SAI** — grep lại repo thấy TTL index
đã dùng ở `packages/game-core/src/indexes/index.ts` (`TX_INTENT_INDEXES`, `resolvedAt` TTL 14 ngày)
và `packages/audit/src/indexes/index.ts` (`AUDIT_LOG_INDEXES`, `ts` TTL 90 ngày) — có tiền lệ rõ
ràng, chỉ là người viết plan p0-04 không tra trước khi kết luận.

**Vì sao TTL đúng hơn cleanup batch ở đây:**
- Doc combo-stats **immutable sau khi draw settle xong** (không update field khác ngoài
  worker đang chạy) — đúng use case kinh điển của TTL (tự xoá theo tuổi document, không cần app
  logic biết "cutoff" là gì).
- Cleanup batch tốn 1 query `deleteMany` MỖI invocation worker (mỗi ~1 phút, 24/7) dù 99.9% lần
  chạy không có gì để xoá (chỉ có tác dụng khi qua mốc 90 ngày) — lãng phí, thêm code phải
  test/maintain (hằng số retention, gọi đúng chỗ, đơn vị ngày→ms).
- TTL index: Mongo background task tự quét + xoá (~60s/lần theo tài liệu Mongo), KHÔNG tốn
  request/connection nào từ app, KHÔNG cần nhớ gọi ở đâu.

**Đã sửa:**
- `IndexSpec` (cả 4 game: Keno/Bingo18/Max3D/Max3D Pro — dù hiện chỉ Keno có combo-stats) thêm
  `options.expireAfterSeconds?: number` để hỗ trợ khai TTL trong tương lai nếu game khác có
  collection tương tự.
- `KENO_INDEXES` thêm entry TTL `{ createdAt: 1 }, expireAfterSeconds: 90*24*60*60` riêng
  (không gộp compound — TTL bắt buộc single-field).
- Xoá `ComboStatsRepository.deleteOlderThan` + `SyncBettingStatsUseCase.cleanupOldCombos` +
  hằng `COMBO_RETENTION_DAYS` — dead code sau khi chuyển sang TTL.
- JSDoc `combo-stats-repo.ts` cập nhật mục "Retention" trỏ về TTL index.

**Migration:** DBA tạo index TTL bằng Compass/Atlas UI/mongosh (repo KHÔNG có script tự tạo index —
đúng convention hiện tại của `KENO_INDEXES`, chỉ là source-of-truth để copy):

```js
db.keno_draw_combo_stats.createIndex(
  { createdAt: 1 },
  { name: "idx_createdAt_ttl", expireAfterSeconds: 90 * 24 * 60 * 60 },
);
```

**Quy tắc cho game sau (BẮT BUỘC đọc trước khi thiết kế retention cho collection mới):**
1. **TRƯỚC khi kết luận "không có TTL tiền lệ" → PHẢI grep `expireAfterSeconds` toàn repo.**
   Plan gốc kết luận sai vì không tra — 2 nơi đã dùng TTL (`game-core`, `audit`) từ trước p0-04.
2. Collection có doc **immutable sau 1 mốc thời gian rõ ràng** (draw settled, tx resolved, log
   ghi xong) + muốn tự xoá theo tuổi → **TTL index là lựa chọn ĐẦU TIÊN**, không phải cleanup
   batch. Cleanup batch chỉ hợp lý khi: (a) điều kiện xoá phức tạp hơn 1 field Date đơn giản
   (VD "xoá nếu field A cũ VÀ field B đã null"), hoặc (b) cần log/audit số lượng đã xoá mỗi lần
   (TTL xoá âm thầm, không có hook để log).
3. TTL index luôn **single-field ascending**, không gộp vào compound index khác — tạo index
   riêng dù đã có index khác chứa field đó.
4. `partialFilterExpression` (xem `TX_INTENT_INDEXES.idx_resolvedAt_ttl`) dùng khi chỉ muốn TTL
   áp dụng cho doc thoả điều kiện (VD field còn `null` thì giữ vĩnh viễn, có giá trị Date mới tính
   TTL) — không phải mọi TTL cần field này, nhưng cân nhắc nếu doc có thể ở trạng thái "chưa đến
   lúc xoá" dù field Date đã tồn tại.
