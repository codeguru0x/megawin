# p0-01 — worker-core: theo dõi item lỗi lặp lại (`stalledItems`)

> **Nguồn:** `.cursor/analysis/system-worker-health.analysis.md` §5.2–§5.4 + §5.7
> **Phase:** P0 · **Phụ thuộc:** — (gate cho p0-02, p1-01)
> **Phạm vi:** CHỈ `packages/worker-core`. KHÔNG chạm game nào, KHÔNG chạm FE.
> **Bổ sung 03/08:** §2.6 (`description` + `kind` + `listByKind`) — `kind` là **điều kiện chặn** p1-01,
> xem analysis §2.4.

## 1. Mục tiêu

`SingleRunWorker` chỉ ghi `lastError` khi `runLocked` **throw** (`lock/single-run-worker.ts:305-325`).
Nhưng worker tick-loop bắt lỗi **per-item** để 1 item bẩn không làm chết cả tick (K7) ⇒ `runLocked`
không throw ⇒ lock doc **báo khoẻ** trong khi 1 kỳ kẹt vĩnh viễn (analysis §2.2).

Plan này thêm năng lực: worker báo "item này lỗi" / "item này qua rồi", base class tự tích luỹ streak
**qua các invocation** và persist vào lock doc **mà không tốn thêm DB call nào**.

Sau plan này, `worker-core` cung cấp đủ nguyên liệu để p0-02 xoá `worker_stuck` khỏi Keno và p1-01 dựng
trang BO.

**Mục tiêu bổ sung (03/08):** làm cho lock doc **tự mô tả được** — `description` (worker này làm gì) và
`kind` (đây là lock worker hay lock nghiệp vụ). Không có `kind`, trang BO ở p1-01 sẽ liệt kê cả doc
`keno:resettle:{drawId}` sinh theo nghiệp vụ (analysis §2.4).

## 2. Việc phải làm

### 2.1. Entity — `WorkerStalledItem` + field `stalledItems`

File: `packages/worker-core/src/entities/worker-lock.ts`

Thêm interface `WorkerStalledItem` (JSDoc đầy đủ mọi field theo `code-quality-standards.mdc` §1–§2):

```typescript
/**
 * 1 đơn vị công việc đang lỗi LẶP LẠI trong 1 worker — TRẠNG THÁI, không phải sự kiện.
 *
 * Tự biến mất khi item thành công (`clearItemFailure`) ⇒ KHÔNG cần ai "resolve"/"ack".
 * Đây là điểm khác căn bản với `ops_alerts` của game — xem analysis §5.1.
 */
export interface WorkerStalledItem {
  /**
   * Khoá đơn vị công việc — ngữ nghĩa do worker tự quyết.
   * Vd: `drawId` (`"2026-08-03.042"`) với worker stats/alert game; `tx` với tenant-dispatch.
   */
  itemKey: string;
  /**
   * Số lần lỗi LIÊN TIẾP, tích luỹ **qua nhiều invocation**.
   *
   * Reset về 0 (xoá khỏi mảng) ngay khi item xử lý thành công. Nhờ persist trên doc,
   * phân biệt được "lỗi thoáng qua 3 lần" với "kẹt cả ngày" — điều bản đếm-trong-RAM
   * trước đây không làm được (analysis §3 D4).
   */
  failCount: number;
  /** Thời điểm lỗi ĐẦU của streak hiện tại — cho phép tính "kẹt bao lâu". */
  firstFailedAt: Date;
  /** Thời điểm lỗi gần nhất. */
  lastFailedAt: Date;
  /**
   * Message lỗi gần nhất, đã cắt qua `truncateErrorMessage` (500 ký tự).
   * Message của lỗi Mongo có thể kèm cả doc dump → không cắt thì doc phình vô hạn.
   */
  lastError: string;
}
```

Thêm field vào `WorkerLockDoc` (JSDoc phải nêu rõ vì sao field này tồn tại — nếu không, người sau sẽ
tưởng nó trùng vai `lastError`):

```typescript
  /**
   * Các đơn vị công việc đang lỗi lặp lại trong worker này.
   *
   * ## Vì sao cần, khi đã có `lastError`?
   *
   * `lastError` chỉ được ghi khi `runLocked` THROW. Worker xử lý nhiều item/tick thường bắt
   * lỗi per-item (1 item bẩn không được làm chết cả tick) ⇒ `runLocked` return bình thường ⇒
   * `lastSuccessAt` vẫn tươi, `lastError = null`, dù 1 item kẹt vĩnh viễn. Field này lấp đúng
   * lỗ mù đó.
   *
   * Ghi bởi `finalizeAndRelease` (1 lệnh, cùng lượt với `lastSuccessAt`/`lastError` — không
   * thêm DB call). Mảng cap `MAX_STALLED_ITEMS`, giữ item `failCount` cao nhất.
   *
   * Mảng RỖNG = không item nào đang kẹt. Doc cũ (trước plan này) thiếu field → mapper
   * normalize về `[]`.
   */
  stalledItems: WorkerStalledItem[];
```

`WorkerLockEntity` extends `Omit<WorkerLockDoc, "_id">` nên tự có field mới — không sửa gì.

Cập nhật cả bảng "Trạng thái lock" trong JSDoc `WorkerLockDoc` nếu cần: KHÔNG cần, `stalledItems` độc
lập với trạng thái held/idle (worker đang khoẻ vẫn có thể có item kẹt).

### 2.2. Hằng số

File: `packages/worker-core/src/use-cases/lock/single-run-worker.ts` (hoặc `constants.ts` nếu tạo mới —
chọn 1, ghi lý do trong PR; đề xuất để cạnh class dùng nó vì chỉ base class đọc).

```typescript
/**
 * Trần số item lưu trong `stalledItems`.
 *
 * Sự cố diện rộng (mọi kỳ cùng lỗi vì Mongo nghẽn) sẽ sinh D entry — D có thể >100 với game
 * multi-draw. Cap để doc không phình; giữ item `failCount` cao nhất vì đó là item kẹt LÂU
 * nhất (đáng điều tra hơn item vừa lỗi lần đầu).
 */
const MAX_STALLED_ITEMS = 20;
```

```typescript
/**
 * Ngưỡng `failCount` mặc định để BO coi item là "đáng chú ý".
 *
 * KHÔNG gây tác động tự động nào: không dừng worker, không skip item, không đổi retry —
 * chỉ là default filter của trang Workers health (cùng triết lý `RETRY_ALERT_THRESHOLD`
 * của tenant-dispatch, xem analysis §4).
 */
export const STALLED_ALERT_THRESHOLD = 3;
```

`STALLED_ALERT_THRESHOLD` phải `export` (p1-01 dùng làm default query param). `MAX_STALLED_ITEMS`
không cần export.

### 2.3. Base class — 2 method + state RAM

File: `packages/worker-core/src/use-cases/lock/single-run-worker.ts`

State: 1 field instance, reset trong `execute` cạnh `_lastPersistedCursor` (dòng ~220). **Bắt buộc
reset** — Lambda container reuse giữ instance sống qua nhiều invocation (cùng lý do
`sync-betting-stats.ts:147-148` reset counters).

```typescript
  /**
   * Streak lỗi per-item của invocation hiện tại, đã MERGE với `stalledItems` đọc từ DB lúc
   * acquire → `failCount` tích luỹ liên tục qua các invocation.
   *
   * Chỉ đụng RAM; flush 1 lần trong `finalizeAndRelease` (xem JSDoc `recordItemFailure`).
   */
  private _stalledItems = new Map<string, WorkerStalledItem>();
```

Seed từ DB: `execute` **đã đọc lock doc sẵn** ở bước kill-switch (`const existing = await
this.lockRepo.findByKey(...)`, dòng 226) → seed từ `existing.stalledItems` ngay tại đó, **không thêm
query**. Lưu ý thứ tự: seed phải sau `tryAcquire` thành công (nếu skip vì `disabled`/`locked` thì
return sớm, không cần seed) — nhưng `existing` đọc TRƯỚC `tryAcquire`, nên chỉ cần gán sau khi
`acquired === true`, dùng biến `existing` đã có.

Edge case phải xử: `existing == null` (worker chạy lần đầu, doc chưa tồn tại) → map rỗng.

2 method mới, đặt cạnh `setCursor`/`extendLock` (cùng họ "API cho subclass"):

```typescript
  /**
   * Ghi nhận 1 đơn vị công việc vừa LỖI — cộng streak, giữ trong RAM.
   *
   * ## Không có I/O ⇒ KHÔNG THROW ⇒ caller KHÔNG bọc try/catch
   *
   * Đây là điểm thiết kế, không phải chi tiết. Bản trước (alert doc) phải bọc try/catch ở
   * mọi caller vì nó ghi DB — và chính try/catch đó từng gây 2 defect: nuốt lỗi mất-lock,
   * và nhảy qua `setCursor` làm mất tiến độ.
   *
   * Toàn bộ map được flush 1 lần duy nhất trong `finalizeAndRelease` — ghép vào lệnh update
   * ĐÃ TỒN TẠI ở cuối mọi invocation ⇒ **0 DB call thêm**, kể cả khi mọi item đều lỗi.
   *
   * Buffer ở đây là ĐÚNG (khác `setCursor` phải persist ngay): đây là tín hiệu quan sát,
   * mất nó không gây redo/sai số — kill cứng chỉ làm cảnh báo trễ ~1 invocation, và item kẹt
   * thật sẽ kẹt tiếp ở invocation sau.
   *
   * @param itemKey - Khoá đơn vị công việc (vd `drawId`). Cùng khoá = cùng streak.
   * @param error   - Lỗi vừa bắt; chỉ `message` được giữ (cắt 500 ký tự).
   */
  protected recordItemFailure(itemKey: string, error: unknown): void

  /**
   * Ghi nhận item xử lý THÀNH CÔNG — xoá khỏi danh sách kẹt (reset streak).
   *
   * Gọi sau MỖI item thành công, kể cả item chưa từng lỗi (no-op, rẻ). Nhờ vậy tín hiệu
   * TỰ TẮT khi hệ thống hồi phục — không ai phải ack/resolve bằng tay.
   */
  protected clearItemFailure(itemKey: string): void
```

Hành vi `recordItemFailure`:

- Đã có trong map → `failCount += 1`, cập nhật `lastFailedAt` + `lastError`, **giữ nguyên
  `firstFailedAt`** (nó đo tuổi streak — ghi đè là mất thông tin quan trọng nhất).
- Chưa có → tạo entry `failCount: 1`, `firstFailedAt = lastFailedAt = now`.
- KHÔNG cap ở đây (map RAM không phải chỗ tốn) — cap lúc flush (§2.4).

### 2.4. Flush — mở rộng `finalizeAndRelease`

File: `packages/worker-core/src/infras/repos/worker-lock-repo.ts`

Thêm `stalledItems?: WorkerStalledItem[]` vào tham số `fields`. Giữ đúng rule 3 trạng thái mà JSDoc
method đã khai (`:149-152`): `undefined` → skip (giữ nguyên DB), giá trị → ghi.

File: `packages/worker-core/src/use-cases/lock/single-run-worker.ts`

Trong `execute` bước 4, truyền thêm. Cap + sort tại đây:

```typescript
      await this.lockRepo.finalizeAndRelease(this._lockKey, this._ownerToken, {
        lastSuccessAt: error ? undefined : new Date().toISOString(),
        lastError: error ? truncateErrorMessage(error) : null,
        // Cap giữ item kẹt LÂU nhất (failCount cao) — item mới lỗi 1 lần ít giá trị điều tra.
        stalledItems: [...this._stalledItems.values()]
          .toSorted((a, b) => b.failCount - a.failCount)
          .slice(0, MAX_STALLED_ITEMS),
      });
```

Dùng `toSorted` (không `sort`) theo `vercel-react-best-practices` §7.12 — tránh mutate.

**Luôn ghi mảng** (kể cả rỗng): worker hồi phục hết ⇒ `[]` ⇒ ghi đè mảng cũ trên DB ⇒ tín hiệu tự tắt.
Nếu truyền `undefined` khi rỗng thì mảng cũ **sống mãi** — đúng lại defect D1 (analysis §3) mà plan này
sinh ra để diệt.

### 2.5. Mapper — normalize `stalledItems`

File: `packages/worker-core/src/infras/mappers/worker-lock-mapper.ts`

Mapper hiện spread mù + `as WorkerLockEntity` (`:18-23`) — doc cũ thiếu `stalledItems` sẽ tạo entity có
field `undefined` mà compiler **không bắt được** (đúng lỗ type mà keno analysis §5.5 chỉ ra). Sửa:
normalize `stalledItems: rest.stalledItems ?? []`.

Giữ nguyên phần còn lại (không mở rộng scope sang việc bỏ hẳn `as` — ghi thành nợ nếu muốn, plan này
chỉ đảm bảo field mới không có lỗ). Cập nhật JSDoc mapper: nó đang liệt kê field và nhắc `meta` —
field **không tồn tại** trong `WorkerLockDoc` (comment stale sẵn có). Sửa luôn khi chạm file.

### 2.6. Field `description` + `kind` (bổ sung 03/08/2026 — analysis §5.7)

Hai field này **cùng chạm** `worker-lock.ts` + `tryAcquire` như §2.1–2.4 nên làm chung plan, tránh 2 PR
sửa cùng 3 file.

#### a) `description?: string` — để BO hiển thị thay `lockKey` kỹ thuật

Entity (`worker-lock.ts`):

```typescript
  /**
   * Mô tả worker làm gì — cho trang BO "Workers health" hiển thị thay `lockKey` kỹ thuật.
   *
   * Nguồn: `SingleRunWorker.description` (worker tự khai về chính nó). Optional vì
   * business lock (xem `kind`) không khai, và doc tạo trước khi có field này chưa có.
   *
   * Tầng ĐỌC fallback `description ?? lockKey` — KHÔNG fallback ở mapper, xem plan §2.7a.
   */
  description?: string;
```

Base class (`lock/single-run-worker.ts`), đặt cạnh `ttlSeconds`/`resolveLockKey`:

```typescript
  /**
   * Mô tả ngắn worker này làm gì — hiện trên trang BO Workers health.
   *
   * KHÔNG override được per-input (khác `resolveLockKey`): mô tả thuộc *class worker*.
   * Bỏ trống thì BO hiện `lockKey`.
   *
   * @example "Đồng bộ thống kê cược Keno (delta) mỗi 20s"
   */
  protected readonly description?: string;
```

Ghi vào doc trong `tryAcquire` — **BẮT BUỘC `$set`, KHÔNG `$setOnInsert`**:

```typescript
        $set: {
          ownerToken,
          expiresAt,
          acquiredAt: now,
          // description/kind dùng $set (KHÔNG $setOnInsert): sửa text trong code PHẢI
          // propagate lên doc đã tồn tại. $setOnInsert sẽ đóng băng mô tả của lần
          // acquire đầu tiên vĩnh viễn.
          ...(description !== undefined && { description }),
          kind,
        },
```

`description` là optional nên spread có điều kiện — nếu `$set: { description: undefined }` thì driver
ghi `null`, khác "không có field". `kind` luôn có (§2.7b) nên set thẳng.

`AcquireOptions` (`infras/repos/types/worker-lock.types.ts`) thêm `description?: string` + `kind`.

**Fallback ở tầng đọc, KHÔNG ở mapper.** Nếu mapper tự điền `lockKey` thì mất khả năng phân biệt
*"worker chưa khai mô tả"* (cần nhắc dev bổ sung) với *"khai đúng bằng lockKey"*. Khác `stalledItems`
(normalize `?? []` ở mapper là đúng vì `[]` và "thiếu field" đồng nghĩa) — sự khác biệt này phải ghi
trong JSDoc mapper để người sau không "sửa cho nhất quán".

#### b) `kind` — tách lock worker khỏi lock nghiệp vụ (🔴 chặn p1-01)

Phát hiện analysis §2.4: `DistributedMutex` dùng **cùng** collection với `lockKey` **động**
(`keno:resettle:${drawId}`) ⇒ số doc tăng theo nghiệp vụ. Không có field phân loại thì trang BO p1-01 sẽ
liệt kê hàng trăm doc resettle — đúng cái nhiễu mà cả feature này sinh ra để diệt.

File mới hoặc `entities/worker-core.enums.ts` (đề xuất: cùng file `WorkerCoreCollections`):

```typescript
/**
 * Phân loại doc trong `worker_locks` — 2 loại KHÁC BẢN CHẤT dùng chung collection.
 *
 * | | `worker` | `business` |
 * |---|---|---|
 * | Ghi bởi | `SingleRunWorker` | `DistributedMutex` |
 * | `lockKey` | TĨNH, 1 per worker (`"keno:stats-sync"`) | ĐỘNG per resource (`"keno:resettle:2026-08-03.042"`) |
 * | Số doc | Hằng số ~10–15 | Tăng theo nghiệp vụ |
 * | Vòng đời | Vĩnh viễn (giữ `cursor`/`isEnabled`/`stalledItems`) | 1 lần dùng rồi thành rác |
 * | `cursor`/`stalledItems`/kill-switch | Có nghĩa | KHÔNG bao giờ dùng |
 *
 * Trang BO Workers health CHỈ đọc `worker` — xem analysis §2.4/§5.7.
 */
export const WorkerLockKind = {
  Worker: "worker",
  Business: "business",
} as const;
export type WorkerLockKind = (typeof WorkerLockKind)[keyof typeof WorkerLockKind];
```

Entity — **optional** để doc cũ không vỡ, kèm quy ước đọc:

```typescript
  /**
   * Loại lock — xem {@link WorkerLockKind}.
   *
   * Optional: doc tạo trước 03/08/2026 không có field. Tầng đọc coi
   * `undefined` là `WorkerLockKind.Worker` — mọi doc trước mốc đó đều do
   * `SingleRunWorker` tạo (`DistributedMutex` chưa deploy).
   */
  kind?: WorkerLockKind;
```

Caller: `SingleRunWorker` truyền `kind: WorkerLockKind.Worker` + `description: this.description`;
`DistributedMutex` truyền `kind: WorkerLockKind.Business` (không truyền `description`). Cả 2 đi
qua `tryAcquire` đã tồn tại ⇒ **0 DB call thêm**.

#### c) `listByKind` — query cho p1-01

Thêm vào `WorkerLockRepository` (p1-01 dùng, nhưng đặt đây vì thuộc cùng nhóm "phân loại doc"):

```typescript
  /**
   * Liệt kê lock theo loại, sort `lockKey` tăng dần.
   *
   * KHÔNG phân trang: với `kind = Worker` số doc là hằng số nhỏ (~10–15, tăng theo số
   * worker chứ không theo dữ liệu). Với `kind = Business` số doc tăng theo nghiệp vụ —
   * caller PHẢI tự giới hạn nếu dùng (hiện chưa có caller nào).
   *
   * `kind` thiếu trên doc cũ được coi là `Worker` (xem `WorkerLockDoc.kind`) → filter
   * dùng `$in: [kind, null]` khi `kind === Worker`, KHÔNG dùng `{ kind }` thuần.
   */
  async listByKind(kind: WorkerLockKind): Promise<WorkerLockEntity[]>
```

Chi tiết filter — điểm dễ sai nhất của cả plan: `{ kind: "worker" }` thuần **không match** doc cũ thiếu
field. Phải `{ kind: { $in: [WorkerLockKind.Worker, null] } }` (Mongo: `$in: [null]` match cả
`undefined`/missing). Với `Business` thì `{ kind: WorkerLockKind.Business }` thuần là đúng (không có doc
cũ nào là business).

### 2.7. Barrel export

File: `packages/worker-core/src/entities/index.ts` — export `WorkerStalledItem` (type) +
`WorkerLockKind` (const **và** type).
File: `packages/worker-core/src/use-cases/index.ts` — export `STALLED_ALERT_THRESHOLD`.

Kiểm `packages/worker-core/src/index.ts` (18 dòng) có re-export gì cần thêm.

### 2.8. Chuẩn MongoDB BẮT BUỘC (bổ sung 03/08 — `mongodb.mdc`)

Mục này **không phải checklist chung chung**: mỗi điểm dưới đây là 1 quyết định cụ thể cho đúng 3 field
+ 1 query mà plan này thêm, kèm điều rule yêu cầu. Đọc hết trước khi viết dòng code đầu tiên.

#### a) Bước 0 — đọc skill `mongodb-schema-design` (rule §0, BẮT BUỘC)

`mongodb.mdc` §0 bắt buộc đọc skill khi *"Tạo/sửa `*Doc` entity, đổi cấu trúc collection"*. Plan này
sửa `WorkerLockDoc` **và** nhúng 1 mảng object → đúng phạm vi. Skill:
`~/.cursor/plugins/cache/cursor-public/mongodb/*/skills/mongodb-schema-design/SKILL.md`.

Không phải thủ tục hình thức: chính skill này là nơi có "unbounded array" và 16MB limit — hai thứ
quyết định điểm (b).

#### b) `stalledItems` vs §8.1 "KHÔNG mảng object không trần" — trả lời câu hỏi quyết định

§8.1 buộc trả lời: *"số phần tử tối đa do NGHIỆP VỤ quyết định (hằng số) hay do NGƯỜI DÙNG quyết định
(không trần)?"* — và mặc định của rule là **tách collection riêng** nếu không trần.

Trả lời trung thực: **tự nhiên nó KHÔNG trần** — `itemKey` là `drawId` của kỳ chưa xong, mà D (số kỳ
đồng thời) do lịch quay quyết định, có game >100. Vậy tại sao plan này vẫn nhúng?

| Tiêu chí §8.1 | `stalledItems` |
|---|---|
| Có trần cứng? | **CÓ, do CODE áp**: `MAX_STALLED_ITEMS = 20` cắt lúc flush (§2.4) ⇒ mảng biến thành **bounded 20**, không phụ thuộc D |
| Worst-case doc size | 20 × (~40B key + ~30B số/date + ≤500B `lastError`) ≈ **≤ 12KB** — dưới ngưỡng "an toàn <1MB" của §8.9 hai bậc |
| Ghi bằng gì | `$set` toàn mảng, **1 lần/invocation**, ghép vào `finalizeAndRelease` đã có — không phải `$inc` per-item nên không có write amplification |
| Truy vấn theo phần tử? | **KHÔNG.** Không query nào filter/sort theo `stalledItems.*`; nó chỉ được **đọc cả cục** để render. Đây là lý do §8.2 (`$size`/`$expr`) không áp dụng |

⇒ Nhúng là đúng theo nguyên tắc lõi *"data accessed together stored together"*: mảng này **luôn** được
đọc cùng lock doc và **chỉ** bởi 1 consumer.

**Điều kiện của quyết định này** (ghi để người sau biết khi nào phải đảo): nếu tương lai cần *lịch sử*
lỗi (time-series, "kỳ này đã kẹt mấy lần tuần qua") thì **PHẢI tách collection** — mảng bounded 20 giữ
**trạng thái hiện tại**, không phải log. p1-01 §3 đã chốt "không đồ thị lịch sử" đúng vì lý do này.

`MAX_STALLED_ITEMS = 20` không được biến thành số lớn (200, 1000) mà không tính lại bảng trên — cap là
thứ **duy nhất** giữ mảng này hợp lệ với §8.1.

#### c) Index — `worker-core` CHƯA có file indexes, mà JSDoc repo đang trỏ tới nó

**Defect có sẵn, phát hiện khi rà plan này:** `worker-lock-repo.ts:24-27` viết:

```24:27:packages/worker-core/src/infras/repos/worker-lock-repo.ts
 * ## Index BẮT BUỘC
 *
 * `{ lockKey: 1 }` unique — 1 doc per lockKey, enforce atomic acquire qua E11000.
 * Xem `@megawin/worker-core/indexes` để setup.
```

Nhưng `packages/worker-core/src/indexes/` **KHÔNG TỒN TẠI** (glob toàn package: 19 file, không có
`indexes/`), và `package.json` không có subpath `./indexes`. JSDoc đang trỏ vào hư không — ai đọc nó để
setup index sẽ không tìm thấy gì.

Plan này thêm query mới (`listByKind`) nên **phải** tạo file, theo mẫu `packages/audit/src/indexes/index.ts`:

```typescript
// packages/worker-core/src/indexes/index.ts
import type { IndexDescription } from "mongodb";

/**
 * Index cho collection `worker_locks` (DB `megawin`).
 *
 * **KHÔNG có script tự tạo** — index tạo THỦ CÔNG qua Compass/Atlas/mongosh
 * (`mongodb.mdc` §7.4). File này là **source of truth** để DBA copy.
 *
 * ```js
 * use("megawin");
 * db.worker_locks.createIndexes([
 *   { key: { lockKey: 1 }, name: "lockKey_unique", unique: true },
 * ]);
 * ```
 */
export const WORKER_LOCK_COLLECTION = "worker_locks";

export const WORKER_LOCK_INDEXES: readonly IndexDescription[] = [
  // Nền của toàn bộ cơ chế lock: 1 doc / lockKey. `tryAcquire` dựa vào E11000
  // của index này để 2 invocation không cùng tạo doc (worker-lock-repo.ts:24-27).
  { key: { lockKey: 1 }, name: "lockKey_unique", unique: true },
] as const;
```

**`listByKind` có cần index riêng không? KHÔNG — và đây là quyết định có căn cứ, không phải bỏ qua:**

| Yếu tố | Số thực tế |
|---|---|
| Số doc `kind: worker` | ~10–15 (hằng số theo số worker) |
| Số doc `kind: business` | Hiện **0** (resettle chưa chạy production — `00-overview.md` §Nợ) |
| Tần suất query | Chỉ khi staff mở trang BO — **không** phải hot path/chu kỳ |
| Sort | `lockKey` asc trên ≤15 doc = in-memory sort, không vượt ngưỡng 32MB |

⇒ COLLSCAN trên ~15 doc rẻ hơn chi phí bảo trì 1 index nữa. **NHƯNG** phải ghi mốc đảo quyết định vào
JSDoc method: *khi doc `business` vượt ~1000 (tức resettle đã chạy production một thời gian) thì thêm
`{ kind: 1, lockKey: 1 }`* — index này cover được cả filter và sort. Không ghi mốc thì 6 tháng sau
không ai biết vì sao thiếu index.

JSDoc `listByKind` **phải có dòng `Index:`** theo `mongodb.mdc` §6 (*"index hint nếu query phụ thuộc
index cụ thể"*) — ở đây ghi rõ **cố ý không dùng index** + lý do, vì "không có dòng nào" và "cố ý
không" là hai trạng thái khác nhau khi review.

#### d) `docPath` — 3 field mới đều cấp 1, KHÔNG cần `f`

`mongodb.mdc` §1.2: *"Field cấp 1 (`drawId`, `status`, `version`) → ❌ không cần"*. `description`,
`kind`, `stalledItems` đều là field cấp 1 của `WorkerLockDoc` ⇒ viết object literal thẳng:

```typescript
$set: { stalledItems, kind, ...(description !== undefined && { description }) }
```

**KHÔNG** khai `const f = docPath<WorkerLockDoc>()` chỉ để bọc 3 tên field cấp 1 — thêm noise, và
`docPath` sinh ra để chống typo *dot-path*, không phải để trang trí.

Ngoại lệ duy nhất phải dùng `f`: nếu ai đó (không phải plan này) cần filter/update theo path lồng như
`stalledItems.failCount` — lúc đó bắt buộc `f("stalledItems.failCount")`.

#### e) Projection cho `listByKind` — cố ý KHÔNG có, phải ghi lý do

§8.4 bắt buộc projection cho *"mọi `find` chạy theo chu kỳ"*. `listByKind` **không** theo chu kỳ (chỉ
khi staff mở trang), và use-case cần gần như **toàn bộ** field để derive `WorkerRunState`: `ownerToken`
+ `expiresAt` (phân biệt `running`/`crashed`), `isEnabled`, `lastSuccessAt`, `lastError`, `cursor`,
`stalledItems`, `description`, `lockKey`. Field không dùng chỉ còn `_id` + `acquiredAt`.

⇒ Projection ở đây sẽ liệt kê 9/11 field: tốn code, dễ quên field mới, lợi ích ~0. **Ghi quyết định này
vào JSDoc method** để reviewer không mở checklist §8.9 rồi báo "thiếu projection".

⚠️ Đừng lẫn với việc **không được trả `ownerToken` ra FE** (p1-01 rủi ro #4): cắt field diễn ra ở
use-case khi map sang `WorkerHealthRow`, **không** ở tầng projection — vì repo cần `ownerToken` để
derive state.

#### f) Mapper — bỏ `as any` / `as WorkerLockEntity`, map tường minh

§2.5 ở trên chỉ yêu cầu normalize `stalledItems ?? []`. **Không đủ** khi cùng lúc thêm 3 field:

```17:24:packages/worker-core/src/infras/mappers/worker-lock-mapper.ts
  protected mapProps(doc: Document): WorkerLockEntity {
    const { _id, ...rest } = doc as any;

    return {
      id: _id.toHexString(),
      ...rest,
    } as WorkerLockEntity;
  }
```

Ba lỗ cùng lúc: generic là `MongoMapper<Document, …>` (**không** `WorkerLockDoc` ⇒ mất type-safety từ
gốc), `doc as any` (giết mọi kiểm tra), `as WorkerLockEntity` (khẳng định kết quả đúng shape mà compiler
không kiểm được). Kết quả: `stalledItems` **required** nhưng nếu quên normalize thì compiler **im lặng**
— đúng lỗ mà `code-quality-standards.mdc` §5 và keno analysis §5.5 đã chỉ ra.

Sửa (doc chỉ ~11 field — chi phí map tường minh là nhỏ):

```typescript
export class WorkerLockMapper extends MongoMapper<WorkerLockDoc, WorkerLockEntity> {
  protected mapProps(doc: WorkerLockDoc): WorkerLockEntity {
    return {
      id: doc._id.toHexString(),
      lockKey: doc.lockKey,
      ownerToken: doc.ownerToken,
      expiresAt: doc.expiresAt,
      acquiredAt: doc.acquiredAt,
      isEnabled: doc.isEnabled,
      cursor: doc.cursor,
      lastSuccessAt: doc.lastSuccessAt,
      lastError: doc.lastError,
      // Doc tạo trước 03/08/2026 thiếu field → [] (rỗng ≡ không item nào kẹt).
      stalledItems: doc.stalledItems ?? [],
      // KHÔNG `?? lockKey` ở đây — xem §2.6a: mapper phải giữ được phân biệt
      // "worker chưa khai mô tả" vs "khai đúng bằng lockKey". Fallback ở use-case.
      description: doc.description,
      // KHÔNG `?? WorkerLockKind.Worker` — quy ước "thiếu ≡ worker" thuộc tầng
      // QUERY (`listByKind` dùng `$in: [Worker, null]`), không phải tầng map.
      kind: doc.kind,
    };
  }
}
```

Đây là **mở rộng scope có kiểm soát** và bắt buộc: không sửa thì field `required` mới không có gì bảo
vệ. Đổi generic sang `WorkerLockDoc` khiến compiler tự bắt mọi field thiếu/sai tên — chính thứ khiến
plan này an toàn.

JSDoc mapper hiện liệt kê field `meta` — **field không tồn tại** trong `WorkerLockDoc` (comment stale
sẵn có). Viết lại JSDoc theo shape thật, và ghi rõ 3 quy ước normalize khác nhau ở trên (`[]` vs giữ
`undefined` vs quy ước ở tầng query) — vì 3 field cạnh nhau xử lý khác nhau, không giải thích thì chắc
chắn bị "sửa cho nhất quán" (rủi ro #12).

#### g) Những rule KHÔNG áp dụng — ghi để review không báo sai

| Rule | Vì sao không áp |
|---|---|
| §8.6 (`$inc` nhiều collection → watermark/doc) | Plan này chỉ ghi **1** collection, và bằng `$set` toàn mảng (không `$inc`) ⇒ idempotent tự nhiên |
| §8.7 (counter phái sinh `$set` tuyệt đối) | `stalledItems` **đúng** là `$set` tuyệt đối — tuân sẵn, không phải ngoại lệ |
| §8.8 (gom `bulkWrite` cho "chạm mọi entity mỗi tick") | Flush ghép vào `finalizeAndRelease` — **1** update cho **1** lock doc/invocation, không có vòng lặp |
| §7 (TTL thay cleanup batch) | Doc worker **phải sống vĩnh viễn** (giữ `cursor`/`isEnabled`). TTL chỉ dành cho `kind: business` — nợ, xem `00-overview.md` |
| §2.1 (type ra `repos/types/`) | `listByKind` return `WorkerLockEntity[]` (entity, không phải aggregate result) ⇒ không sinh type mới. `AcquireOptions` đã đúng chỗ (`repos/types/worker-lock.types.ts`) — chỉ thêm field |
| §3/§4 (không query trong use-case / không repo ở route) | `SingleRunWorker` gọi repo method, không viết query. Plan này không có route |

## 3. Cái KHÔNG làm trong plan này

| Không làm | Vì sao |
|---|---|
| Sửa bất kỳ game nào | p0-02 lo. Plan này chỉ thêm API, chưa có caller — có chủ đích (diff review được từng phần) |
| Trang BO | p1-01 lo |
| Use-case admin (`list-workers-health`, `set-worker-enabled`) | p1-01 lo — **nhưng nó sẽ nằm TRONG `worker-core`**, xem analysis §5.5.1. Plan này chỉ chuẩn bị `listByKind` |
| Khai `description` cho 9 worker hiện có | p0-02 khai cho 2 worker Keno; các worker khác khai dần khi ai chạm tới. Field optional nên BO hiện `lockKey` — không vỡ gì |
| Dừng worker / skip item khi `failCount` cao | Nguyên tắc #2 của `00-overview.md` — không tác động tự động |
| Persist `stalledItems` ngay mỗi lần lỗi | Analysis §5.3/§6 — phá ràng buộc "0 DB call thêm" |
| TTL dọn rác doc `kind: business` | Nợ có sẵn, không do plan này gây ra. Cần `partialFilterExpression: {kind:"business"}` — làm khi resettle chạy production (analysis §5.7 "Nợ mở ra"). **TUYỆT ĐỐI KHÔNG** thêm TTL không partial: xoá doc worker lúc idle ⇒ mất `cursor`/`isEnabled`/`stalledItems` |
| Thêm `@megawin/next` vào `worker-core` | **Ở plan này** chưa cần (chưa có use-case HTTP). p1-01 sẽ thêm — và điều đó ĐÚNG, theo tiền lệ `tenant-dispatch` (analysis §5.5.1). Đây là đổi so với bản đầu của `00-overview.md` nguyên tắc #5 |
| Tạo index `{ kind: 1, lockKey: 1 }` cho `listByKind` | ~15 doc `worker` + 0 doc `business` ⇒ COLLSCAN rẻ hơn bảo trì index (§2.8c). Chỉ ghi **mốc đảo quyết định** vào JSDoc, không tạo trước |
| Viết script tự động `createIndex` | Repo KHÔNG có tiền lệ nào (`mongodb.mdc` §7.4: index tạo THỦ CÔNG qua Compass/mongosh; file `*_INDEXES` chỉ là source of truth). Dựng script ở đây = tự phát minh hạ tầng mới |
| Bỏ `as`/`Document` ở các mapper KHÁC trong repo | Chỉ sửa `WorkerLockMapper` vì plan này thêm field vào chính doc đó (§2.8f). Quét toàn repo là plan riêng |
| `$unset` `stalledItems` / backfill doc cũ | Mapper normalize `?? []` (§2.8f) đã đủ. Migration script cho 15 doc = công vô ích |

## 4. Đánh giá & verify

### 4.1. Type-check

```bash
pnpm --filter @megawin/worker-core check-types
# Không package nào khác chạm — nhưng chạy để chắc không ai import WorkerLockDoc rồi vỡ:
pnpm --filter @megawin/tenant-dispatch check-types
pnpm --filter @megawin/game-keno-application check-types
```

`stalledItems` là field **required** trong `WorkerLockDoc` → mọi nơi tự construct doc đó sẽ bị compiler
bắt. Kiểm bằng grep: `rg 'WorkerLockDoc' packages apps` — nếu chỉ có repo/mapper/entity thì an toàn
(`tryAcquire` dùng `$setOnInsert` với object literal, KHÔNG typed theo `WorkerLockDoc` → xem §5 rủi ro #2).

### 4.2. Grep sạch

```bash
rg -n 'stalledItems|recordItemFailure|clearItemFailure|STALLED_ALERT_THRESHOLD' packages/worker-core
# Kỳ vọng: entity(2) + base class(4) + repo(1) + mapper(1) + barrel(2). Không chỗ nào khác.

rg -n 'description|WorkerLockKind|listByKind' packages/worker-core
# Kỳ vọng: entity + enums + base class + coordinator + repo(tryAcquire, listByKind) + types + barrel.

# BẪY: description/kind PHẢI ở $set, KHÔNG ở $setOnInsert.
rg -n -A 10 '\$setOnInsert' packages/worker-core/src/infras/repos/worker-lock-repo.ts
# Nếu thấy `description` hoặc `kind` trong block $setOnInsert → SAI, sửa ngay (rủi ro #9).

# BẪY: filter listByKind phải match doc cũ thiếu field.
rg -n -B 2 -A 6 'listByKind' packages/worker-core/src/infras/repos/worker-lock-repo.ts
# Với Worker phải có `$in: [..., null]`, không phải `{ kind }` thuần (rủi ro #10).

# BẪY: mapper còn `as any` / `as WorkerLockEntity` → field required mới không được bảo vệ (§2.8f).
rg -n 'as any|as WorkerLockEntity|MongoMapper<Document' packages/worker-core/src
# Kỳ vọng: 0 kết quả trong worker-lock-mapper.ts sau khi sửa.

# Index file phải tồn tại thật (JSDoc repo đang trỏ tới nó — §2.8c).
ls packages/worker-core/src/indexes/index.ts
rg -n '"./indexes"' packages/worker-core/package.json
```

### 4.3. Test (nếu package có setup test — hiện `worker-core` chưa có)

Nếu thêm: 4 case tối thiểu.

1. `recordItemFailure` cùng key 3 lần → `failCount = 3`, `firstFailedAt` KHÔNG đổi.
2. `clearItemFailure` sau đó → key biến mất khỏi flush payload.
3. Seed từ doc có `failCount: 5` + `recordItemFailure` 1 lần → `6` (tích luỹ cross-invocation).
4. 25 item lỗi → flush đúng 20 item, là 20 item `failCount` cao nhất.

Nếu chưa có setup test cho package: ghi thành nợ trong PR, verify bằng §4.4 thay thế. KHÔNG dựng cả hạ
tầng test trong plan này (scope creep).

### 4.4. Smoke test (cần dev/staging — chạy ở stage deploy)

1. Chạy 1 worker bất kỳ bình thường → `db.worker_locks.findOne({lockKey})` có `stalledItems: []`.
2. Ép 1 item lỗi (sửa tạm data 1 kỳ cho `syncDraw` throw) → sau ~1 phút doc có 1 entry, `failCount`
   tăng dần **qua từng invocation** (chứng minh persist — điểm D4).
3. Sửa data về đúng → invocation sau `stalledItems` về `[]` **không cần thao tác tay** (chứng minh D1).
4. `description`/`kind`: chạy worker đã khai `description` → doc có đúng text + `kind: "worker"`. **Sửa
   text trong code → deploy → chạy lại → doc PHẢI đổi theo** (chứng minh `$set` chứ không
   `$setOnInsert` — rủi ro #9, không test được bằng unit test vì cần doc tồn tại trước).
5. `listByKind(Worker)` trên DB có doc cũ (thiếu `kind`) → **vẫn trả về doc đó** (rủi ro #10). Cách dựng:
   `db.worker_locks.updateOne({lockKey:"..."}, {$unset:{kind:""}})` rồi gọi lại.

## 5. Review code & rủi ro

> Mục này chạy ở **task riêng SAU KHI code xong** (theo quy ước `00-overview.md`).

| # | Rủi ro | Mức | Giảm nhẹ / điểm phải kiểm khi review |
|---|---|---|---|
| 1 | Quên reset `_stalledItems` trong `execute` → Lambda container reuse làm streak của invocation trước cộng dồn sai vào worker khác lane (cùng instance class) | 🔴 | Reset PHẢI ở đầu `execute` cạnh `_lastPersistedCursor = undefined`. Review đọc thẳng dòng đó; đây là bug đã từng xảy ra ở `sync-betting-stats.ts` nên có tiền lệ |
| 2 | `tryAcquire` `$setOnInsert` không init `stalledItems` → doc mới thiếu field | 🟡 | Không nguy hiểm (mapper `?? []`), nhưng NÊN init `stalledItems: []` cho nhất quán với `cursor`/`lastError` đang được init. Review kiểm `worker-lock-repo.ts:69-75` |
| 3 | Flush truyền `undefined` khi map rỗng → mảng cũ sống mãi trên DB | 🔴 | Xem §2.4 — LUÔN truyền mảng. Đây là điểm chết của cả feature: sai chỗ này thì D1 quay lại nguyên vẹn |
| 4 | `firstFailedAt` bị ghi đè mỗi lần lỗi → mất khả năng đo "kẹt bao lâu" | 🟠 | §2.3 nêu rõ; review kiểm nhánh "đã có trong map" |
| 5 | Cap 20 cắt mất item đang điều tra (sự cố diện rộng >20 item) | 🟡 | Sort `failCount` desc trước khi cắt → giữ item kẹt lâu nhất. Item mới lỗi bị cắt sẽ xuất hiện lại khi các item cũ hồi phục. Chấp nhận có chủ đích |
| 6 | `finalizeAndRelease` fail → mất cả `stalledItems` của invocation | 🟢 | Đã có `try/catch` + `console.warn` sẵn (`:264-266`); lock tự takeover qua `expiresAt`. Tín hiệu trễ 1 invocation — cùng mức chấp nhận với `lastError` |
| 7 | Doc phình dần nếu item key có cardinality cao (vd `itemKey = entryId`) | 🟡 | Cap 20 đã chặn. Nhưng JSDoc `itemKey` phải nêu rõ: dùng khoá **coarse-grained** (drawId), KHÔNG dùng khoá per-record |
| 8 | Subclass gọi `recordItemFailure` nhưng quên `clearItemFailure` → item kẹt "ảo" mãi | 🟠 | JSDoc `clearItemFailure` ghi rõ "gọi sau MỖI item thành công, kể cả item chưa từng lỗi". p0-02 review phải kiểm cặp gọi đối xứng ở cả 2 worker Keno |
| 9 | `description`/`kind` ghi bằng `$setOnInsert` (copy theo các field cạnh nó) → **mô tả đóng băng vĩnh viễn**, sửa text trong code không bao giờ lên DB | 🟠 | §2.6a. Đây là bẫy copy-paste rất dễ mắc vì `tryAcquire` đang init mọi field khác bằng `$setOnInsert`. Verify §4.2 có grep riêng; unit test KHÔNG bắt được (cần doc tồn tại trước) → phải test tay §4.4 bước 4 |
| 10 | `listByKind(Worker)` filter `{kind:"worker"}` thuần → **không match doc cũ** thiếu field ⇒ trang BO trống trơn ở lần deploy đầu | 🔴 | §2.6c: `$in: [Worker, null]`. Triệu chứng dễ chẩn sai thành "chưa có worker nào chạy" thay vì lỗi filter. Verify §4.4 bước 5 dựng đúng ca này |
| 11 | `$set: { description: undefined }` → driver ghi `null` thay vì bỏ field ⇒ tầng đọc `?? lockKey` vẫn chạy nhưng doc bẩn | 🟢 | §2.6a dùng spread có điều kiện. Hệ quả nhẹ (fallback vẫn đúng) nhưng nên sạch |
| 12 | Ai đó "sửa cho nhất quán" bằng cách fallback `description ?? lockKey` ở mapper | 🟡 | Mất khả năng phân biệt "chưa khai" vs "khai bằng lockKey". §2.6a yêu cầu ghi lý do NGAY trong JSDoc mapper, cạnh chỗ `stalledItems ?? []` — vì 2 field cạnh nhau xử lý khác nhau, không giải thích thì chắc chắn bị "sửa" |
| 13 | Mapper giữ `as any` + `as WorkerLockEntity` → `stalledItems` required nhưng compiler **im lặng** khi quên normalize | 🟠 | §2.8f: đổi generic sang `WorkerLockDoc` + map tường minh. Không sửa thì toàn bộ an toàn type của plan này là ảo. Verify §4.2 có grep |
| 14 | `MAX_STALLED_ITEMS` bị nâng lên (200/1000) mà không tính lại doc size | 🟠 | Cap là thứ **duy nhất** giữ mảng nhúng hợp lệ với `mongodb.mdc` §8.1 (§2.8b). Bảng worst-case phải tính lại nếu đổi; >1MB là vi phạm rule |
| 15 | Ai đó thêm query filter/sort theo `stalledItems.*` (vd `$size`, `$elemMatch` trên `failCount`) | 🟠 | Vi phạm `mongodb.mdc` §8.2 (`$size`/`$expr` không sargable). Lọc "worker đáng chú ý" làm ở client trên ~15 dòng (p1-01 §2.1) |
| 16 | Không tạo `src/indexes/index.ts` → JSDoc repo tiếp tục trỏ vào `@megawin/worker-core/indexes` không tồn tại | 🟡 | §2.8c. Defect có sẵn, plan này chạm repo nên trả luôn. Verify §4.2 có `ls` |
| 17 | Thêm TTL index trần trên `expiresAt` (tưởng đang dọn rác) | 🔴 | Xoá luôn doc worker lúc idle ⇒ mất `cursor`/`isEnabled`/`stalledItems` vĩnh viễn. **BẮT BUỘC** `partialFilterExpression: { kind: "business" }` — và việc đó thuộc nợ, không thuộc plan này (`00-overview.md` §Nợ) |

## 6. Rollback

Xoá 2 method + field + hằng số. Không có caller (p0-02 chưa merge) nên rollback là revert PR thuần.
Field `stalledItems` còn sót trên doc DB: vô hại (không ai đọc), không cần `$unset`.

`description`/`kind` cũng vậy — revert code là đủ, doc sót field không ảnh hưởng `tryAcquire`
(filter chỉ dùng `lockKey`/`ownerToken`/`expiresAt`).
