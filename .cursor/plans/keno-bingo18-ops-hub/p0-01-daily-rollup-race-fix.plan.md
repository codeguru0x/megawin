---
name: ""
overview: ""
todos: []
isProject: false
---

# p0-01 — Vá race condition Daily Rollup bằng CAS trên `version` (điều kiện CHẶN toàn bộ feature)

> **Phase:** P0 · **Status:** ✅ code done (07/09) · review code 07/09 — CAS/`version` đúng thiết kế,
> không phát hiện rủi ro số liệu mới; test §6 (chạy thật race condition) vẫn CHƯA chạy · **Chặn:** p0-02, và gián tiếp toàn bộ P1/P2
> **Nguồn:** [`sequential-settle-guard.analysis.md`](../../analysis/keno-bingo18-sequential-settle-guard.analysis.md) §"Rủi ro thật"
> **Quyết định thiết kế:** [`keno-bingo18-daily-rollup-version-cas.analysis.md`](../../analysis/keno-bingo18-daily-rollup-version-cas.analysis.md)
> **Scope file:** `packages/game-core-application/**` + `packages/game-core/**` (shared 7 game) — **behavior-compatible**

## 0. Bản này khác bản trước ở đâu

Bản trước dùng `aggregateSeq = Date.now()` + `$lt` + nhánh `$exists: false`. Đã bị loại vì
**version phải là thuộc tính của DỮ LIỆU, không phải của ĐỒNG HỒ người đọc**. Ba lỗ hổng cụ thể
(phân tích đầy đủ ở analysis §2):

| Lỗ hổng của `Date.now()` | Hệ quả |
|---|---|
| Clock skew giữa Lambda (A nhanh hơn B 50ms) | A đọc dữ liệu CŨ nhưng có seq CAO hơn → thắng CAS → **mất đúng 1 kỳ**, chính là bug đang đi sửa |
| Độ phân giải 1ms — 119 kỳ settle song song thì trùng ms là bình thường | seq bằng nhau → `$lt` không thoả → luồng có dữ liệu MỚI HƠN bị từ chối im lặng |
| Nhánh `{ aggregateSeq: { $exists: false } }` | **Cửa hậu vô điều kiện**: lần ghi đầu của ngày — vùng cần bảo vệ nhất — lại không có bảo vệ nào |

Bản này: **CAS `$eq` trên `version` của chính document**, `$inc` khi ghi, `$ifNull → 0` cho doc cũ.
Kèm ba thay đổi hệ quả: bỏ sentinel `-1`/`rollupStale` (throw để SFN retry), giữ chữ ký repo tương
thích ngược (vòng retry đặt ở use-case), và E11000 → **retry** thay vì "coi như bị từ chối".

## 1. Vấn đề

`SystemPublishSettleDailyUseCase`
([`packages/game-core-application/src/use-cases/publish-settle-daily.ts:76-124`](../../../packages/game-core-application/src/use-cases/publish-settle-daily.ts))
chạy pattern **read-then-overwrite** không có bảo vệ đồng thời:

```
80|    const drawAgg = await gameDailyRepo.aggregateDrawsFromPerGame(financialDate);  // READ
82|    await gameDailyRepo.upsertGameDaily({ ...drawAgg });                            // WRITE overwrite
```

`upsertGameDaily`
([`system-settle-game-daily-repo.ts:63-83`](../../../packages/game-core-application/src/infras/repos/system-settle-game-daily-repo.ts))
dùng `$set: { ...report }` — **ghi đè toàn bộ document**, không `$inc`, không version check.

### 1.1 Kịch bản mất số liệu

Hai kỳ Keno settle đồng thời, cùng `financialDate = "2026-09-06"`:

| t | Luồng A (draw .118) | Luồng B (draw .119) | State DB |
|---|---|---|---|
| t0 | — | — | draw_reports: 117 doc |
| t1 | BuildSettleReport ghi doc .118 | — | 118 doc |
| t2 | `aggregate` → đọc **118** | — | 118 doc |
| t3 | — | BuildSettleReport ghi doc .119 | 119 doc |
| t4 | — | `aggregate` → đọc **119** | 119 doc |
| t5 | — | `upsert` ghi `drawCount: 119` ✅ | rollup = 119 |
| t6 | `upsert` ghi `drawCount: 118` ❌ | — | **rollup = 118** |

Luồng A ghi **sau** nhưng mang dữ liệu **cũ hơn** → mất trọn kỳ .119 khỏi rollup: `totalStake`,
`ggr`, `netProfit`, `totalCommission` đều thiếu.

### 1.2 Vì sao hôm nay chưa nổ, và vì sao p0-02 làm nó nổ

Hiện guard tuần tự khiến hai settle gần như không bao giờ chồng nhau. Kể cả khi chồng, lần settle
**kỳ kế tiếp** (Keno 8 phút, Bingo18 6 phút — `drawIntervalMinutes`) tự re-aggregate và chữa lành số.

Bỏ guard (p0-02) + bulk-settle (p0-04) đổi cả hai điều kiện:

- 10 kỳ settle đồng thời → xác suất giao nhau **rất cao**, không còn là hiếm.
- Nếu bulk-settle chính là lô **cuối ngày**, không còn "lần kế tiếp" để tự chữa → **báo cáo sai vĩnh
  viễn** cho `financialDate` đó, cho tới khi ai đó phát hiện và chạy lại tay.

Đây là lý do p0-01 đứng trước p0-02 và không được đảo.

### 1.3 Lỗi thứ hai: tenant doc stale (bug độc lập, cùng file)

`aggregateTenantsFromPerGame` chỉ trả về tenant **còn** trong per-game tenant reports.
`bulkUpsertTenantDaily`
([`system-settle-tenant-daily-repo.ts:82-107`](../../../packages/game-core-application/src/infras/repos/system-settle-tenant-daily-repo.ts))
chỉ upsert những tenant đó — **không xoá** doc của tenant đã biến mất.

Void-after-settle xoá hết `{prefix}_settle_tenant_reports` của tenant X trong ngày → X không còn
trong `tenantAggs` → doc `system_settle_tenant_daily` của X **giữ nguyên số cũ vĩnh viễn**. Báo cáo
theo đại lý tính tiền hoa hồng cho giao dịch đã bị void.

Bug này tồn tại độc lập với race, nhưng cùng file cùng use-case → vá chung 1 PR.

## 2. Ràng buộc thiết kế (đã loại 4 phương án)

| Phương án | Lý do LOẠI |
|---|---|
| MongoDB transaction | Cần replica set + đổi mọi call site repo. `ReportRepo` không nhận session. Quá rộng cho P0. |
| Tách state SFN riêng cho rollup | `serverless.yml` **không có block `stepFunctions:`**; ASL sinh bằng `generate-asl.sh` với `ACCOUNT_ID = "YOUR_ACCOUNT_ID"` hardcode → state machine deploy **thủ công qua Console**. Sửa ASL = rủi ro vận hành ngoài code. |
| `DistributedMutex` per financialDate | Có sẵn (`worker-core/src/use-cases/lock/distributed-mutex.ts`) nhưng serialize toàn bộ rollup theo ngày → đúng thứ triệt tiêu lợi ích song song vừa mở. |
| Counter document riêng + `$inc` khi đọc | 2 vấn đề: (a) **mutate-on-read** — hai reader nhận 2 token khác nhau nhưng thấy **cùng** dữ liệu, token không nói được ai mới hơn; (b) **phá idempotent re-run** — SFN retry `$inc` lần nữa → token luôn cao hơn → **mọi retry đều thắng, kể cả retry mang dữ liệu cũ**. Ngược hẳn mục tiêu. |

**Chọn: CAS (compare-and-swap) trên `version` của chính document + re-aggregate khi thua.**
Không đụng SFN, không serialize, không thêm round-trip, giữ đúng nguyên tắc P2 của
`financial-reporting-system.mdc` ("draw-level là source of truth, daily luôn re-aggregate, KHÔNG `$inc`
trường tiền").

## 3. Thiết kế

### 3.1 Vòng CAS — hình dạng

```typescript
// ── ĐỌC: version đi CÙNG aggregate trong Promise.all → 0 round-trip thêm ─────
const [drawAgg, current] = await Promise.all([
  gameDailyRepo.aggregateDrawsFromPerGame(financialDate),
  gameDailyRepo.findVersion(financialDate, gameProduct),   // projection { version: 1 }
]);
const expected = current?.version ?? 0;

// ── GHI: CAS chính xác — $eq, KHÔNG $lt ─────────────────────────────────────
filter: {
  financialDate, gameProduct,
  $expr: { $eq: [{ $ifNull: ["$version", 0] }, expected] },
}
update: { $set: { ...report, updatedAt }, $inc: { version: 1 }, $setOnInsert: { createdAt } }
upsert: true

// ── THUA (không khớp filter, hoặc E11000): quay lại bước ĐỌC, aggregate LẠI ──
```

`Promise.all` là điểm mấu chốt về chi phí: `findVersion` chạy **song song** với aggregate nên
version check **không** thêm latency vào đường tiền (§1.4 `vercel-react-best-practices`).

### 3.2 Vì sao `$eq` + `$ifNull` chặt hơn `$lt` + `$exists`

| Tiêu chí | `Date.now()` + `$lt` | CAS `version` + `$eq` |
|---|---|---|
| Phụ thuộc đồng hồ | ✗ có — skew làm ghi cũ thắng | ✓ không |
| Va chạm cùng millisecond | ✗ có — `$lt` loại cả hai chiều | ✓ không, `$eq` là so khớp chính xác |
| Doc chưa có field | ✗ cửa hậu `$exists: false` — mọi writer thắng | ✓ `$ifNull → 0` xếp thứ tự đúng, **không có cửa hậu** |
| Round-trip thêm | 0 | 0 (`findVersion` trong `Promise.all`) |
| Verify-and-retry còn là lớp chống race chính? | **có** — phải dựa vào nó | không, chỉ còn là lớp phụ |

Đọc `expected` rồi CAS `$eq` nghĩa là: **"tôi chỉ ghi nếu doc vẫn đúng như lúc tôi đọc"**. Ai đó
ghi chen vào giữa → `version` đã tăng → `$eq` không khớp → ta thua → **aggregate lại** (lúc này
đã thấy cả dữ liệu của người kia) rồi CAS lại. Đây là định nghĩa gốc của optimistic locking, và nó
không cần bất kỳ giả định nào về hạ tầng.

### 3.3 Thua CAS thì phải RE-AGGREGATE, không được chỉ ghi lại

Điểm dễ làm sai nhất. Khi thua, **không** được đơn giản đọc lại `version` rồi ghi lại `report` cũ:
`report` đó tính từ một snapshot per-game có thể đã lạc hậu. Phải quay lại **đầu vòng** — chạy lại
`aggregateDrawsFromPerGame` — vì đó là lý do duy nhất khiến vòng lặp này có tác dụng.

Đây cũng là lý do vòng lặp **phải nằm ở use-case, không ở repo**: aggregate không thuộc repo daily
(nó đọc per-game collection), nên repo không có cách nào tự retry đúng.

### 3.4 `$expr` không làm mất index

`{ financialDate, gameProduct }` là equality prefix của unique index
`{ financialDate: 1, gameProduct: 1 }` → Mongo định vị **đúng 1 doc** bằng index rồi mới eval
`$expr` trên đúng doc đó. Không cần index mới cho `version`; thêm index riêng là vô ích và làm chậm ghi.

### 3.5 E11000 → RETRY, không phải "coi như bị từ chối"

`upsert: true` + filter có `$expr` → khi doc **đã tồn tại** mà `$expr` không khớp, Mongo cố
**insert** doc mới, vướng unique index → `DuplicateKeyError (E11000)`.

Đây là **cùng một tình huống** với "CAS thua": có kẻ khác ghi trước ta. Xử lý phải giống nhau →
**quay lại đầu vòng, aggregate lại**. Bản trước xử lý là *"coi như bị từ chối, trả về ngay"* —
**sai chiều**: kẻ thua insert-race có thể đang giữ dữ liệu mới hơn kẻ thắng.

Nhận diện bằng **mã lỗi** `error.code === 11000`, **KHÔNG** so chuỗi message.

### 3.6 Idempotent khi SFN chạy lại — đến từ `$set` toàn phần, KHÔNG từ version

Phải nói rõ để không hiểu sai: **`version` chống ghi CŨ, không chống ghi LẶP.**

Tính chạy-lại-nhiều-lần đến từ tính chất khác: mọi lần ghi là **snapshot toàn phần `$set` từ một
lần re-aggregate**, không bao giờ `$inc` trường tiền. Nên khi SFN retry: đọc `version = v+1`,
aggregate lại (**cùng dữ liệu vì per-game không đổi**), ghi → **nội dung y hệt**, `version = v+2`.
Số tiền không nhân đôi. `version` nhảy số không mang ý nghĩa nghiệp vụ, không expose ra DTO/API.

> **BẤT BIẾN phải giữ bằng mọi giá:** không một trường tiền nào trong `system_settle_game_daily` /
> `system_settle_tenant_daily` được cập nhật bằng `$inc`. `$inc` **chỉ** được dùng cho `version`.
> Ngày nào phá bất biến này thì mọi lớp version bên trên đều vô nghĩa.

### 3.7 Tenant-daily — dùng `version` thắng CAS làm stamp đơn điệu

Tenant-daily là **N doc** (1/tenant), ghi bằng 1 `bulkWrite`. CAS từng doc riêng lẻ là sai bài toán:
ta không cần "doc tenant X có bị ai ghi chen không", ta cần **"cả lô tenant này có thuộc cùng một
lần aggregate mới nhất không"**.

Giải pháp: sau khi CAS game-daily **thắng** với `version = v+1`, dùng chính `v+1` làm
`rollupVersion` cho **mọi** doc tenant của lô đó:

```typescript
// filter mỗi updateOne:
{ financialDate, tenantId, gameProduct,
  $expr: { $lte: [{ $ifNull: ["$rollupVersion", 0] }, rollupVersion] } }
// update:
{ $set: { ...report, rollupVersion, updatedAt }, $setOnInsert: { createdAt } }
```

Ba điểm phải hiểu đúng:

1. **`$lte` chứ không `$eq`** — vì đây không phải CAS mà là **hàng rào đơn điệu** (monotonic guard):
   chỉ chặn ghi từ lô CŨ hơn, cho phép lô hiện tại ghi lại chính nó (idempotent khi SFN retry lô
   cùng version).
2. **`rollupVersion` lấy từ game-daily, không phải counter riêng** — nhờ đó thứ tự tenant-daily
   **luôn nhất quán** với thứ tự game-daily. Không cần đồng bộ hai nguồn version.
3. **`ordered: false`** cho `bulkWrite` — một tenant bị hàng rào chặn **không** được làm dừng các
   tenant sau. Mặc định `ordered: true` sẽ dừng ở lỗi đầu.

Chỉ khi CAS game-daily **thắng** mới ghi tenant. Thua thì quay lại đầu vòng, chưa chạm tenant.

### 3.8 Bỏ sentinel `-1` và `rollupStale` — throw để SFN retry

Bản trước tạo `MAX_ROLLUP_ATTEMPTS` + trả `drawCount: -1, rollupStale: true` khi hết lượt. Loại vì:

- SFN **đã có** retry policy với backoff. Dựng lớp retry thứ hai rồi trả một giá trị độc chảy tiếp
  vào luồng báo cáo là tự tạo một trạng thái mới mà **mọi consumer** phải biết cách xử lý.
- `-1` chìm trong return value không ai đọc, còn SFN execution history thì **có visibility**.

Bản này: **2 lượt trong process** (đủ cho race thường — CAS thua 2 lần liên tiếp là rất hiếm), hết
thì **`throw`**. `PublishSettleDailyResult` giữ nguyên shape (không thêm `rollupStale`), consumer
không phải sửa gì.

> Rollup thất bại **có** làm fail step của SFN — đây là chủ ý. Tiền người chơi đã trả đúng ở bước
> settle trước đó (draw-level là source of truth); rollup chỉ là báo cáo tổng hợp và **luôn**
> re-aggregate được. Fail rõ ràng + SFN retry backoff tốt hơn thành công giả với số sai.

---

## 4. Thay đổi code — từng file

### 4.1 Entity — thêm `version` / `rollupVersion`

**File:** [`packages/game-core/src/entities/financial-report.ts`](../../../packages/game-core/src/entities/financial-report.ts)

Thêm vào `SystemSettleGameDaily` (dòng 53):

```typescript
  /**
   * Bộ đếm CAS (compare-and-swap) chống ghi đè bằng dữ liệu cũ — optimistic lock.
   *
   * Tăng 1 mỗi lần ghi thành công (`$inc`). Writer đọc giá trị hiện tại rồi CAS
   * `$eq` khi ghi: khớp thì ghi và tăng, không khớp nghĩa là có writer khác đã
   * ghi chen → writer này phải RE-AGGREGATE rồi thử lại (xem
   * `SystemPublishSettleDailyUseCase`).
   *
   * KHÔNG mang ý nghĩa nghiệp vụ, KHÔNG expose ra DTO/API. Đây là trường DUY NHẤT
   * trong doc này được phép `$inc` — mọi trường tiền luôn `$set` snapshot toàn phần.
   *
   * Optional để tương thích doc tạo trước khi thêm field: CAS dùng
   * `$ifNull: ["$version", 0]` nên doc thiếu field xếp thứ tự đúng như `version = 0`,
   * KHÔNG cần migration và KHÔNG tạo cửa hậu `$exists: false`.
   */
  version?: number;
```

Thêm vào `SystemSettleTenantDaily` (dòng 95):

```typescript
  /**
   * Stamp đơn điệu (monotonic) đánh dấu doc này thuộc lô rollup nào.
   *
   * Giá trị = `version` của `system_settle_game_daily` cùng `{financialDate, gameProduct}`
   * SAU khi lô đó CAS thắng. Nhờ vậy thứ tự tenant-daily luôn nhất quán với game-daily,
   * không cần nguồn version thứ hai.
   *
   * Hàng rào khi ghi là `$lte` (KHÔNG phải `$eq` như game-daily): chặn ghi từ lô CŨ hơn
   * nhưng cho phép lô hiện tại ghi lại chính nó — cần thiết để SFN retry idempotent.
   *
   * Optional để tương thích doc cũ (`$ifNull → 0`). KHÔNG expose ra DTO/API.
   */
  rollupVersion?: number;
```

### 4.2 Repo game-daily — `findVersion` + CAS trong `upsertGameDaily`

**File:** [`system-settle-game-daily-repo.ts`](../../../packages/game-core-application/src/infras/repos/system-settle-game-daily-repo.ts)

**(a) Method MỚI `findVersion`** — đọc mỏng, chỉ lấy `version`:

```typescript
  /**
   * Đọc `version` hiện tại của 1 game × 1 ngày — đầu vào cho vòng CAS.
   *
   * Projection chỉ `{ version: 1 }`: doc rollup có ~13 trường số nhưng vòng CAS chỉ
   * cần đúng 1 trường. Gọi SONG SONG với `aggregateDrawsFromPerGame` trong
   * `Promise.all` → không thêm latency vào đường settle.
   *
   * @returns `undefined` nếu doc chưa tồn tại (caller coi như `version = 0`).
   */
  async findVersion(financialDate: string, gameProduct: GameProduct): Promise<number | undefined>
```

Dùng `findOne` với `projection: { version: 1 }`. Trả `undefined` cho cả hai trường hợp *doc không
có* và *doc có nhưng thiếu field* — caller ở use-case quy về `0` bằng `?? 0`, cùng đúng semantic với
`$ifNull` phía filter. **Không** trả `0` từ repo: `0` và `undefined` phải phân biệt được nếu sau này
cần log.

**(b) `upsertGameDaily` — thêm param optional, trả `boolean`:**

```typescript
  /**
   * Upsert tổng hợp settle của 1 game trong 1 ngày tài chính — CÓ optimistic lock.
   *
   * Re-aggregate từ per-game draw-level reports → overwrite toàn bộ trường tiền
   * bằng `$set` (KHÔNG `$inc` — nguyên tắc P2 `financial-reporting-system.mdc`).
   *
   * CAS: chỉ ghi khi `version` trong DB CÒN ĐÚNG bằng `expectedVersion` mà caller đã
   * đọc. Ai đó ghi chen vào giữa → `version` đã tăng → filter không khớp → trả `false`,
   * và caller BẮT BUỘC phải re-aggregate rồi thử lại (không được ghi lại report cũ).
   *
   * `$ifNull: ["$version", 0]` cho doc tạo trước khi có field này — xếp thứ tự đúng,
   * không tạo nhánh `$exists` (nhánh đó là cửa hậu: mọi writer đều thắng).
   *
   * @param expectedVersion - Version đã đọc qua {@link findVersion}. Bỏ trống = 0
   *   (doc chưa tồn tại). Optional để tương thích ngược cho caller cũ.
   * @returns `true` nếu đã ghi; `false` nếu CAS thua HOẶC E11000 (doc đã tồn tại mà
   *   `$expr` không khớp nên Mongo cố insert, vướng unique index). Cả hai đều nghĩa là
   *   "có writer khác ghi trước" → caller xử lý GIỐNG NHAU: re-aggregate và thử lại.
   */
  async upsertGameDaily(
    report: Omit<SystemSettleGameDaily, "createdAt" | "updatedAt" | "version">,
    expectedVersion = 0,
  ): Promise<boolean>
```

Thân method:

```typescript
    const now = new Date();
    try {
      const result = await this.findOneAndUpdate(
        {
          financialDate: report.financialDate,
          gameProduct: report.gameProduct,
          $expr: { $eq: [{ $ifNull: ["$version", 0] }, expectedVersion] },
        },
        {
          $set: { ...report, updatedAt: now },
          $inc: { version: 1 },
          $setOnInsert: { createdAt: now },
        },
        { upsert: true },
      );
      return result !== null;
    } catch (error) {
      // E11000: doc đã tồn tại nhưng $expr không khớp → Mongo cố insert → vướng
      // unique index { financialDate, gameProduct }. Cùng nghĩa với CAS thua.
      // Nhận diện bằng MÃ LỖI, không so chuỗi message.
      if (isDuplicateKeyError(error)) {
        return false;
      }
      throw error;
    }
```

**Ba điểm bắt buộc làm đúng:**

1. **`$inc: { version: 1 }` và `$set` không được chồng khoá.** Nếu `report` vô tình chứa `version`
   thì Mongo báo lỗi conflicting update. Vì vậy signature loại `version` ra khỏi `report` bằng
   `Omit<..., "version">` — để **compiler** chặn, không dựa vào comment.
2. **`isDuplicateKeyError` là helper dùng chung**, không viết inline 7 lần. Kiểm tra
   `packages/data` hoặc `packages/shared` xem đã có chưa (`rg -n 'code === 11000|11000'
   packages/data packages/shared`); chưa có thì thêm 1 chỗ và export.
3. **Không** đổi `findOneAndUpdate` sang `updateOne`: `updateOne` trả
   `modifiedCount === 1 || upsertedCount === 1` (xem [`repository.ts:406-417`](../../../packages/data/src/mongo/repository.ts))
   — với `$inc` thì `modifiedCount` luôn ≥ 1 khi khớp, nhưng `findOneAndUpdate` trả `null` khi
   không khớp là tín hiệu rõ ràng hơn và đang được dùng sẵn.

### 4.3 Repo tenant-daily — hàng rào `rollupVersion` + `ordered: false`

**File:** [`system-settle-tenant-daily-repo.ts`](../../../packages/game-core-application/src/infras/repos/system-settle-tenant-daily-repo.ts)

**(a) `bulkUpsertTenantDaily`** — thêm param `rollupVersion` optional:

```typescript
  /**
   * Bulk upsert nhiều tenant daily reports trong 1 DB call — CÓ hàng rào đơn điệu.
   *
   * `rollupVersion` là `version` của game-daily SAU khi lô này CAS thắng (§3.7 plan
   * p0-01) — nhờ vậy thứ tự tenant-daily luôn nhất quán với game-daily.
   *
   * Hàng rào `$lte` (KHÔNG `$eq`): chặn ghi từ lô CŨ hơn, nhưng cho phép lô hiện tại
   * ghi lại chính nó → SFN retry cùng lô vẫn idempotent.
   *
   * `ordered: false` là BẮT BUỘC: 1 tenant bị hàng rào chặn không được làm dừng các
   * tenant sau (mặc định `ordered: true` dừng ở lỗi đầu tiên).
   *
   * Noop-safe: `reports` rỗng thì không gọi DB.
   *
   * @param rollupVersion - Bỏ trống = 0 (tương thích caller cũ, không có hàng rào).
   * @returns Số doc thực sự được ghi (`modifiedCount + upsertedCount`) — lệch với
   *   `reports.length` nghĩa là có doc bị hàng rào chặn, caller nên log.
   */
  async bulkUpsertTenantDaily(
    reports: Omit<SystemSettleTenantDaily, "createdAt" | "updatedAt" | "rollupVersion">[],
    rollupVersion = 0,
  ): Promise<number>
```

Filter mỗi `updateOne` thêm `$expr: { $lte: [{ $ifNull: ["$rollupVersion", 0] }, rollupVersion] }`;
update thêm `$set: { rollupVersion }`. Gọi `this.bulkWrite(ops, { ordered: false })` —
`BaseRepo.bulkWrite` **đã** nhận `BulkWriteOptions`
([`repository.ts:563-570`](../../../packages/data/src/mongo/repository.ts)), không cần sửa base.

> Với `ordered: false`, E11000 của **một** tenant không dừng lô nhưng `bulkWrite` **vẫn throw**
> `MongoBulkWriteError` ở cuối. Phải bắt và kiểm tra: nếu **mọi** `writeError` đều là code 11000 thì
> coi như "các doc đó bị hàng rào chặn" — đọc `result.modifiedCount + result.upsertedCount` từ
> `error.result` và trả về, KHÔNG rethrow. Lỗi khác 11000 → rethrow. **Phải verify hành vi thật bằng
> test tích hợp (§6.2), không tin phán đoán về shape của error.**

**(b) Method MỚI `deleteStaleTenantDaily`** — vá bug §1.3:

```typescript
  /**
   * Xoá doc tenant-daily của tenant KHÔNG còn trong lô rollup hiện tại.
   *
   * Void-after-settle xoá hết per-game tenant reports của tenant X → X không còn trong
   * `aggregateTenantsFromPerGame` → doc system của X giữ số cũ vĩnh viễn và báo cáo đại
   * lý vẫn tính hoa hồng cho giao dịch đã void. Method này dọn đúng những doc đó.
   *
   * Filter LUÔN có scope `{ financialDate, gameProduct }` — không bao giờ xoá diện rộng.
   *
   * @param params.allowEmptyKeep - Chỉ cho phép `keepTenantIds` rỗng khi thật sự không
   *   còn draw nào (`drawCount === 0`). Nếu rỗng mà `false` (có draw nhưng không có
   *   tenant — bất thường) → log error và BỎ QUA xoá, không xoá mò.
   * @returns Số doc đã xoá.
   */
  async deleteStaleTenantDaily(params: {
    financialDate: string;
    gameProduct: GameProduct;
    keepTenantIds: string[];
    allowEmptyKeep: boolean;
  }): Promise<number>
```

Dùng `deleteMany({ financialDate, gameProduct, tenantId: { $nin: keepTenantIds } })`.

> **CẢNH BÁO:** `keepTenantIds` rỗng làm filter thành `{ financialDate, gameProduct }` — **xoá sạch
> tenant của game/ngày đó**. Đúng khi đã void hết, nhưng cũng đúng hình dạng một lệnh xoá diện rộng
> → đó là lý do có `allowEmptyKeep`. Plugin GritQL `no-unscoped-db-mutation.grit` chặn
> `deleteMany({})`; filter ở đây luôn có 2 field scope nên hợp lệ — **nhưng đừng viết thành dạng
> filter build động có thể rỗng**, GritQL không bắt được và review cũng khó thấy.

### 4.4 Use case — vòng CAS + xoá tenant stale

**File:** [`publish-settle-daily.ts`](../../../packages/game-core-application/src/use-cases/publish-settle-daily.ts)

Interface `SystemGameDailyPublisher` (dòng 32) thêm `findVersion` — nó đã extend
`SystemSettleGameDailyRepository` nên chỉ cần thêm method vào base repo là đủ, **không** phải khai
lại ở interface. Xác nhận bằng `check-types`.

Cấu trúc mới của `execute`:

```typescript
/**
 * Số lượt CAS trong process. 2 là đủ: CAS thua 2 lần liên tiếp nghĩa là tranh chấp
 * kéo dài bất thường — lúc đó throw để SFN retry với backoff tốt hơn là ta tự lặp,
 * vì SFN có visibility (execution history) còn vòng lặp trong Lambda thì không.
 */
const MAX_CAS_ATTEMPTS = 2;

  async execute(input: PublishSettleDailyInput): Promise<PublishSettleDailyResult> {
    const { gameProduct, financialDate, gameDailyRepo, tenantDailyRepo } = input;

    // Nhiều kỳ settle song song cùng rollup 1 financialDate. Thua CAS = có luồng khác
    // đã ghi snapshot mới hơn → PHẢI aggregate LẠI (không ghi lại report cũ), vì report
    // đang giữ tính từ snapshot per-game đã lạc hậu.
    for (let attempt = 1; attempt <= MAX_CAS_ATTEMPTS; attempt++) {
      // Đọc version SONG SONG với aggregate → version check không thêm latency.
      const [drawAgg, currentVersion] = await Promise.all([
        gameDailyRepo.aggregateDrawsFromPerGame(financialDate),
        gameDailyRepo.findVersion(financialDate, gameProduct),
      ]);
      const expectedVersion = currentVersion ?? 0;

      const accepted = await gameDailyRepo.upsertGameDaily(
        { gameProduct, financialDate, ...drawAgg },
        expectedVersion,
      );

      if (!accepted) {
        continue;   // ← quay lại ĐẦU vòng: aggregate lại, không chỉ ghi lại
      }

      // CAS thắng → version trong DB giờ là expectedVersion + 1. Dùng làm stamp cho
      // toàn bộ tenant doc của lô này (§3.7) → tenant-daily nhất quán với game-daily.
      const rollupVersion = expectedVersion + 1;
      const tenantCount = await this.publishTenantDaily({
        tenantDailyRepo, gameProduct, financialDate, rollupVersion,
        hasDraws: drawAgg.drawCount > 0,
      });

      return { gameProduct, financialDate, drawCount: drawAgg.drawCount, tenantCount };
    }

    // Hết lượt: throw để SFN retry với backoff (§3.8). KHÔNG trả sentinel.
    throw new Error(
      `[PublishSettleDaily] CAS thất bại sau ${MAX_CAS_ATTEMPTS} lượt: ` +
        `gameProduct=${gameProduct} financialDate=${financialDate}`,
    );
  }
```

`publishTenantDaily` (private):

```typescript
    const tenantAggs = await tenantDailyRepo.aggregateTenantsFromPerGame(financialDate);

    const written = await tenantDailyRepo.bulkUpsertTenantDaily(
      tenantAggs.map((r) => ({ financialDate, gameProduct, ...r })),
      rollupVersion,
    );
    if (written !== tenantAggs.length) {
      // Có doc bị hàng rào rollupVersion chặn = lô mới hơn đã ghi. Không phải lỗi,
      // nhưng phải log để phân biệt với bug ghi thiếu.
      console.warn("[PublishSettleDaily] tenant doc bị chặn bởi hàng rào rollupVersion", {
        gameProduct, financialDate, rollupVersion,
        expected: tenantAggs.length, written,
      });
    }

    // Tenant đã void hết vé trong ngày KHÔNG còn trong tenantAggs, nhưng doc system của
    // họ vẫn giữ số cũ → báo cáo đại lý tính hoa hồng cho giao dịch đã void (§1.3).
    await tenantDailyRepo.deleteStaleTenantDaily({
      financialDate, gameProduct,
      keepTenantIds: tenantAggs.map((r) => r.tenantId),
      allowEmptyKeep: !hasDraws,   // chỉ cho xoá sạch khi thật sự không còn draw nào
    });

    return tenantAggs.length;
```

**Không** thêm bước `countDrawReports` verify-and-retry của bản trước: với CAS `$eq`, bất kỳ writer
ghi chen đều làm `version` tăng và ta thua ngay ở CAS → không còn khe hở "cả hai đều đọc thiếu dữ
liệu của nhau" mà `$lt` để lại. Bớt được 1 method mới phải implement ở **cả 7** game repo.

### 4.5 Index

**Không cần index mới.** `version` chỉ xuất hiện trong `$expr` **cùng** khoá unique
`{ financialDate, gameProduct }` → Mongo định vị đúng 1 doc bằng unique index rồi mới eval `$expr`
(§3.4). Tương tự `rollupVersion` với `{ financialDate, tenantId, gameProduct }`.

`deleteStaleTenantDaily` dùng `{ financialDate, gameProduct, tenantId: { $nin } }`. Unique index hiện
tại là `{ financialDate: 1, tenantId: 1, gameProduct: 1 }` — thứ tự field khiến prefix dùng được chỉ
là `{ financialDate }`. Chấp nhận được vì số doc mỗi `financialDate` nhỏ (số tenant × 7 game).
**Đo `explain()` trước khi kết luận**, đừng thêm index theo cảm giác.

### 4.6 Call site — 7 game

`upsertGameDaily` đổi **return type** (`void → boolean`) và thêm param **optional**;
`bulkUpsertTenantDaily` cũng vậy (`void → number`). Param optional nên caller cũ **vẫn compile**,
nhưng return type đổi có thể vướng ở chỗ nào dùng kết quả.

**Bắt buộc chạy trước khi sửa** (theo `gitnexus-code-graph.mdc` §3 — graph là lower-bound trên repo
này, `dispatchBoundary: 598`, phải Grep xác nhận):

```bash
rg -n 'upsertGameDaily|upsertTenantDaily|bulkUpsertTenantDaily|aggregateDrawsFromPerGame' packages apps tooling
```

Dự kiến caller **duy nhất** của `upsertGameDaily`/`bulkUpsertTenantDaily` là `publish-settle-daily.ts`.
Nhưng phải chạy lại lệnh trên kể cả `apps/` và `tooling/` — script vận hành hoặc handler có thể gọi
thẳng repo. Nếu tìm thấy caller ngoài dự kiến → **dừng, báo lại**, không tự sửa.

`findVersion` là method **mới trên base repo** → cả 7 game repo kế thừa tự có, **không** phải
implement 7 lần. Đây là lý do đặt nó ở base chứ không ở interface publisher.

---

## 5. Tác động

| Vùng | Tác động | Mức |
|---|---|---|
| 7 game (cả 5 game jackpot) | Dùng chung `publish-settle-daily.ts` → **đều bị chạm** | 🔴 cao |
| Settle flow | `findVersion` chạy trong `Promise.all` → **0ms thêm** | 🟢 không |
| Void flow | Cùng use-case → cùng thay đổi; thêm bước xoá tenant stale | 🟡 vừa |
| Doc DB cũ | Không có `version`/`rollupVersion` → `$ifNull → 0`, ghi lần đầu sẽ set | 🟢 thấp |
| SFN / ASL | **Không đổi** — không thêm state, không đổi input/output shape | 🟢 không |
| `PublishSettleDailyResult` | **Không đổi shape** (không thêm `rollupStale`) → consumer không phải sửa | 🟢 không |
| Báo cáo FE | `version`/`rollupVersion` là field nội bộ, KHÔNG expose ra DTO/API | 🟢 không |
| Hành vi khi lỗi | Rollup thất bại nay **throw** (trước: trả sentinel) → SFN step fail rõ ràng | 🟡 vừa — có chủ ý (§3.8) |

**Đây là plan chạm nhiều game nhất trong feature.** Tiêu chí bắt buộc: **behavior không đổi khi
không có tranh chấp**. Với 5 game jackpot (settle tuần tự, không bao giờ tranh chấp), số liệu rollup
phải **giống hệt** trước/sau — test §6.1 phải chứng minh điều này, không phán đoán.

## 6. Test

### 6.1 Unit — behavior không đổi (bắt buộc, chạy trước)

`packages/game-core-application/test/publish-settle-daily.test.ts`

| Case | Kỳ vọng |
|---|---|
| Rollup đơn lẻ, doc chưa tồn tại | Insert, `version = 1`, số liệu đúng |
| Rollup đơn lẻ, doc đã có `version = 5` | Overwrite, `version = 6` |
| Rollup đơn lẻ, doc cũ **KHÔNG** có `version` | Ghi thành công qua `$ifNull → 0`, set `version = 1` |
| `drawCount = 0` (ngày chưa có kỳ) | Ghi zeros, **không** throw, `allowEmptyKeep = true` |
| CAS với `expectedVersion` sai | Trả `false`, doc **không đổi** (cả tiền cả `version`) |
| Ghi 2 lần liên tiếp cùng dữ liệu (SFN retry) | Nội dung y hệt, `version` tăng 2, **tiền không nhân đôi** |
| `rollupVersion` tenant = `version` game sau CAS | Đọc doc tenant, `rollupVersion` khớp |
| Hàng rào tenant `$lte` cho phép ghi lại cùng version | Lô cùng `rollupVersion` ghi lại được (idempotent) |
| Hàng rào tenant chặn version cũ hơn | Doc **không đổi**, `written < reports.length`, có `console.warn` |

### 6.2 Integration — race thật (bắt buộc, đây là lý do tồn tại của plan)

Không mock. Dùng Mongo thật (test DB riêng, tuân `test-data-safety.mdc` — chỉ mutate record do test
seed, filter phải có scope id/field; **cấm** `deleteMany({})`).

| Case | Cách làm | Kỳ vọng |
|---|---|---|
| 2 luồng đồng thời | Seed 2 draw report, gọi 2 `execute` bằng `Promise.all` | Rollup cuối = **2 draw**, không mất kỳ |
| 10 luồng đồng thời | Seed 10 draw report, `Promise.all` 10 lần | `drawCount` = 10 **chính xác**, mọi trường tiền khớp tổng per-game |
| **Clock skew — test `Date.now()` KHÔNG thể pass** | Inject clock lệch 50ms cho 1 luồng (fake timer / DI clock), luồng lệch đọc dữ liệu CŨ | Luồng đọc cũ **vẫn thua CAS** → rollup đúng. Đây là test chứng minh vì sao bỏ `Date.now()` |
| Trùng millisecond | 2 luồng khởi động cùng ms (chặn bằng barrier) | Cả hai không cùng thắng; luồng thắng có dữ liệu đầy đủ |
| E11000 khi `$expr` không khớp | Tạo doc `version = 9`, gọi `upsertGameDaily(report, 0)` | **Không throw ra ngoài**, trả `false` → use-case retry và cuối cùng đúng |
| `bulkWrite` `ordered: false` + hàng rào | Seed 3 tenant, 1 doc có `rollupVersion` cao hơn | 2 tenant còn lại **vẫn ghi**, không dừng lô; return `2` |
| **SFN re-run 3 lần** | Gọi `execute` 3 lần liên tiếp cùng input, không đổi per-game | Số tiền **y hệt** sau mỗi lần; `version` = 3; không nhân đôi |
| Void xoá tenant | Seed 3 tenant → xoá per-game report tenant B → rollup | Doc tenant B **bị xoá** khỏi system |
| Guard `allowEmptyKeep` | Có draw nhưng `tenantAggs` rỗng | **Không xoá gì**, có log error |
| Hết `MAX_CAS_ATTEMPTS` | Ép CAS thua 2 lần (ghi chen bằng hook) | **Throw**, message chứa `gameProduct` + `financialDate` |

> Test clock skew và test SFN re-run là **hai test không được skip**. Chúng là lý do bản plan này
> tồn tại thay cho bản `Date.now()`.

### 6.3 Verify trên staging bằng mongosh (bắt buộc — không tin dashboard)

Sau khi bulk-settle 10 kỳ trên staging, so trực tiếp:

```javascript
// Nguồn sự thật: per-game draw reports
db.keno_settle_draw_reports.aggregate([
  { $match: { financialDate: "2026-09-06" } },
  { $group: { _id: null, drawCount: { $sum: 1 }, totalStake: { $sum: "$totalStake" },
              ggr: { $sum: "$ggr" }, netProfit: { $sum: "$netProfit" },
              totalCommission: { $sum: "$totalCommission" } } },
]);

// Rollup — phải KHỚP CHÍNH XÁC từng con số ở trên
db.system_settle_game_daily.findOne({ financialDate: "2026-09-06", gameProduct: "keno" });

// version phải ≥ số lần rollup đã chạy, và tenant phải cùng stamp
db.system_settle_tenant_daily.find(
  { financialDate: "2026-09-06", gameProduct: "keno" },
  { tenantId: 1, rollupVersion: 1 },
);
```

Lệch 1 đồng = chưa xong. Không làm tròn, không "gần đúng".
Mọi doc tenant của lô phải có **cùng** `rollupVersion` — lệch nhau nghĩa là có lô ghi dở.

## 7. Review checklist

- [ ] `pnpm check-types` xanh toàn repo (đổi return type → phải chắc không sót call site).
- [ ] `pnpm lint` xanh. **Không** `biome-ignore` mới cho `noFloatingPromises`/`noMisusedPromises` —
      đây là code tài chính, **cấm tuyệt đối** theo `biome-lint-conventions.mdc` §d.
- [ ] Grep `upsertGameDaily|upsertTenantDaily|bulkUpsertTenantDaily` — mọi call site đã cập nhật.
- [ ] **`$inc` CHỈ chạm `version` / `rollupVersion`**, không chạm trường tiền nào:
      `rg -n '\$inc' packages/*/src/infras/repos/system-settle-*` — đọc từng match bằng mắt.
- [ ] `version` / `rollupVersion` **không** xuất hiện trong DTO/API response nào:
      `rg -n 'version|rollupVersion' apps/backoffice/src/app/api` (lọc thủ công false positive).
- [ ] `report` truyền vào `upsertGameDaily` đã `Omit<..., "version">` — compiler chặn conflicting update.
- [ ] `isDuplicateKeyError` là helper **dùng chung** (1 chỗ), nhận diện bằng `code === 11000`,
      **không** so chuỗi message.
- [ ] `bulkWrite` truyền `{ ordered: false }`, và có xử lý `MongoBulkWriteError` (chỉ 11000 → không rethrow).
- [ ] `deleteStaleTenantDaily` có guard `allowEmptyKeep`, filter **luôn** chứa `financialDate` +
      `gameProduct`, không build filter động có thể rỗng.
- [ ] Thua CAS thì **re-aggregate** (`continue` về đầu vòng), **không** ghi lại report cũ.
- [ ] Hết lượt thì **throw**, không trả sentinel; `PublishSettleDailyResult` giữ nguyên shape.
- [ ] JSDoc đầy đủ: class, method, field `version`, field `rollupVersion`, hằng `MAX_CAS_ATTEMPTS`.
- [ ] Đã đo `explain()` cho `deleteStaleTenantDaily`, dán kết quả vào PR description.
- [ ] Test §6.2 (10 luồng đồng thời, **clock skew**, **SFN re-run 3 lần**) chạy thật và pass, không skip.

## 8. Rủi ro

| Rủi ro | Mức | Xử lý |
|---|---|---|
| Chạm 7 game, gồm 5 game jackpot | 🔴 | Test §6.1 chứng minh behavior không đổi khi không tranh chấp. Deploy staging trước, quan sát 1 ngày đủ chu kỳ settle của cả 7 game |
| `$inc` vô tình lan sang trường tiền | 🔴 | Checklist grep `$inc` + `Omit<..., "version">` ở signature. Đây là bất biến §3.6 |
| `upsert` + `$expr` gây E11000 | 🟡 | Bắt code `11000` → `false` → use-case retry. Test §6.2 xác nhận. **Phải verify hành vi thật**, không giả định |
| `MongoBulkWriteError` shape khác dự đoán | 🟡 | Test §6.2 case `ordered: false`. Không code theo phán đoán về `error.result` |
| `deleteStaleTenantDaily` xoá quá tay | 🔴 | Guard `allowEmptyKeep` + filter luôn có scope. Test §6.2 case cuối |
| Rollup fail nay làm SFN step fail | 🟡 | **Có chủ ý** (§3.8). Tiền đã trả đúng ở draw-level; SFN retry backoff. Phải xác nhận SFN state của cả 7 game **có** retry policy cho step này — nếu không có thì thêm trước khi merge |
| CAS thua liên tục do burst lớn (>50 kỳ) | 🟢 | 2 lượt + SFN retry. Nếu staging cho thấy throw thường xuyên → nâng `MAX_CAS_ATTEMPTS`, **không** quay lại `$lt` |
| Doc cũ không có `version` | 🟢 | `$ifNull → 0` xử lý, không migration. Test §6.1 case 3 |

## 9. Rollback

Không có migration, không đổi shape ASL → revert commit là đủ. `version` / `rollupVersion` còn sót
trong doc là **vô hại**: code cũ không đọc field này, và `$set: {...report}` không xoá nó nhưng cũng
không dùng.

**Không cần** script dọn field. Nếu muốn sạch: `$unset` theo `financialDate`, chạy ngoài giờ cao điểm.

> **Lưu ý khi rollback:** code cũ `upsertGameDaily` **không** có CAS → nó sẽ ghi đè bất kể `version`.
> Đó là hành vi trước đây (có race), chấp nhận được khi rollback nhưng phải rollback **cả** p0-02
> (guard tuần tự quay lại) để race không nổ.