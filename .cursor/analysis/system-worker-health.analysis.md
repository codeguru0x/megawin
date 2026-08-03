# System — Worker Health & Item Failure Tracking (Analysis)

> **Status:** `approved` · **Ngày:** 03/08/2026
> **Nguồn tham chiếu:**
> - Analysis liên quan: `.cursor/analysis/keno-stats-worker-simplification.analysis.md` (§5.4 Q4 — nơi
>   `worker_stuck` được đề xuất lần đầu, và §5.7 nơi quyết định này thay thế nó)
> - Source đã đọc (03/08/2026): `packages/worker-core/src/**` (toàn bộ 17 file),
>   `packages/game-keno-application/src/use-cases/operations/{sync-betting-stats,evaluate-ops-alerts}.ts`,
>   `packages/game-keno/src/entities/ops-alert.ts`, `packages/game-core/src/types/ops-alert.ts`,
>   `packages/game-keno-application/src/{infras/repos/ops-alert-repo.ts,use-cases/operations/{list-alerts,get-ops-snapshot}.ts}`,
>   `packages/tenant-dispatch/src/{config/constants.ts,infras/repos/dispatch-order-repo.ts,use-cases/process/process-dispatch-batch.ts}`,
>   `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/alerts/alerts-panel.tsx`,
>   `apps/backoffice/src/navigation/sidebar/sidebar-items.ts`
> - Phạm vi: **hạ tầng chung cho cả 9 worker app** (`apps/worker-*`), KHÔNG riêng Keno.
> - **Đã cập nhật tên class 03/08/2026** (theo `.cursor/plans/worker-core-usecase-restructure/`) —
>   toàn bộ doc này DÙNG tên canonical mới. Nếu đọc git history/code cũ, ánh xạ:
>   `LockedWorkerUseCase → SingleRunWorker`, `TickLoopWorkerUseCase → TickLoopWorker`,
>   `BusinessLockCoordinator → DistributedMutex`, `isLockedWorkerSkipped → isWorkerRunSkipped`,
>   `LockedWorkerResult/LockedWorkerSkipped → WorkerRunResult/WorkerRunSkipped`. File cũng chuyển vào
>   `use-cases/lock/`; import qua subpath `@megawin/worker-core/workers` (base class để `extends`) hoặc
>   `/locks` (`DistributedMutex` để `new`).

## 1. Bối cảnh — câu hỏi khởi nguồn

Trong lúc review `p1-01-keno-stats-code-quality` (Q4), user đặt câu hỏi về đoạn code bắn alert
`worker_stuck` trong `sync-betting-stats.ts:206-210`:

> *"Có cần thiết hoặc nhất thiết làm chức năng này không, hay sẽ có 1 chức năng quản lý worker lỗi
> riêng? Investigate ở đây và ở worker-core xem thêm vào đâu hợp lý hơn."*

Câu hỏi đúng chỗ. Kết luận sau khi đọc code: **nhu cầu là THẬT nhưng đặt sai tầng** — nó là năng
lực hạ tầng của `worker-core`, không phải một loại alert nghiệp vụ của kỳ quay Keno.

Analysis này chốt thiết kế đúng và thay thế Q4 của cả 4 game.

## 2. Hiện trạng — cái gì đang có, cái gì đang mù

### 2.1. `worker_stuck` đã bị cài 2 bản LỆCH NHAU trong cùng 1 game

| | `sync-betting-stats.ts` | `evaluate-ops-alerts.ts` |
|---|---|---|
| State đếm | `Map<drawId, number>` (`:136-137`) — nhiều kỳ song song | `stuckDrawId` + `stuckStreak` (`:85-87`) — 1 kỳ tại 1 thời điểm |
| Hằng số ngưỡng | `WORKER_STUCK_THRESHOLD = 3` (`:95`) | **copy-paste** cùng giá trị (`:61`) |
| Hành vi sau lỗi | skip kỳ lỗi, chạy kỳ tiếp | `break` cả tick (cursor global không nhảy được) |
| Ghi alert | `recordFailAndMaybeAlert` (`:224-248`) | `recordStuckAndMaybeAlert` (`:163-190`) |
| dedupeKey/payload | `worker_stuck:{drawId}` | y hệt |

Cùng 1 khái niệm, 2 cách cài, 2 hằng số song sinh. Nếu port theo
`p2-01-port-guide-bingo18-max3d-max3dpro.md` sang 3 game còn lại → **6–8 bản**, mỗi bản kéo theo 1
member enum riêng của game + 1 label FE + 1 nhánh render.

### 2.2. Lỗ hổng thật: `worker_locks` báo "khoẻ" trong khi kỳ kẹt vĩnh viễn

`SingleRunWorker.execute` chỉ ghi `lastError` khi **`runLocked` throw**:

```
lock/single-run-worker.ts:305-325
  try { value = await this.runLocked(input) } catch (err) { error = err }
  await this.lockRepo.finalizeAndRelease(key, token, {
    lastSuccessAt: error ? undefined : new Date().toISOString(),
    lastError:     error ? truncateErrorMessage(error) : null,
  })
```

Nhưng cả 2 worker Keno **bắt lỗi per-item** (`sync-betting-stats.ts:197-211`) để 1 kỳ data bẩn không
làm chết cả tick (K7). Hệ quả: `runLocked` **không bao giờ throw** ⇒ mỗi invocation vẫn ghi
`lastSuccessAt = now`, `lastError = null`. Một kỳ kẹt 6 tiếng mà lock doc **hoàn toàn xanh**.

Trong khi JSDoc của chính field đó tuyên bố ngược lại:

```
worker-lock.ts:84-91
  /**
   * ISO 8601 timestamp lần `runLocked` chạy thành công gần nhất.
   * Ops dùng để detect stuck worker ("lần cuối thành công cách đây bao lâu?").
```

→ **Tín hiệu là cần thật** (không phải YAGNI). Nhưng khoảng trống nằm ở tầng health
(`worker_locks`), còn ta đang vá nó ở tầng alert nghiệp vụ của kỳ quay. Hai việc khác nhau.

### 2.3. `worker_locks` chưa có UI nào đọc — cho cả 9 worker

Grep `worker_locks|lastSuccessAt|WorkerLockRepository` trong `apps/backoffice`: **0 kết quả**.
Nghĩa là `lastError`, `lastSuccessAt`, `cursor`, và kill-switch `isEnabled` (`worker-lock.ts:56-66`)
hiện chỉ xem/sửa được bằng **mongo shell** — đúng như JSDoc của field `isEnabled` hướng dẫn.

Repo cũng KHÔNG có convention CloudWatch alarm / metric filter nào cho worker (grep
`CloudWatch|MetricFilter|Alarm` chỉ trúng docs operator không liên quan). Tức là ngoài
`console.error`, hệ thống hiện **không có kênh nào** báo worker hỏng.

9 worker app đang trong tình trạng này: `worker-keno`, `worker-bingo18`, `worker-max3d`,
`worker-max3dpro`, `worker-mega645`, `worker-power655`, `worker-lotto535`, `worker-game-core`,
`worker-tenant-dispatch`.

### 2.4. 🔴 `worker_locks` chứa **HAI loại doc** khác bản chất — phát hiện 03/08/2026

Phát hiện khi rà câu hỏi "field mô tả worker lấy từ đâu". `DistributedMutex`
(`worker-core/src/use-cases/lock/distributed-mutex.ts`) dùng **cùng** `WorkerLockRepository`, cùng
`tryAcquire`, cùng collection — nhưng với `lockKey` **động** per-resource:

```55:58:packages/worker-core/src/use-cases/lock/distributed-mutex.ts
 * const mutex = new DistributedMutex();
 * const ownerToken = await mutex.acquire({
 *   lockKey: `keno:resettle:${drawId}`,
 *   ttlSeconds: 300,
```

| | Worker lock (`SingleRunWorker`) | Business lock (`DistributedMutex`) |
|---|---|---|
| `lockKey` | **Tĩnh**, 1 per worker (`"keno:stats-sync"`) | **Động** per resource (`"keno:resettle:2026-08-03.042"`) |
| Số doc | Hằng số ~10–15, tăng theo số worker | **Tăng theo nghiệp vụ** — mỗi kỳ resettle 1 doc mới, 7 game |
| Vòng đời | Vĩnh viễn (giữ `cursor`/`isEnabled`) | 1 lần dùng, xong là rác |
| Có `cursor`/`stalledItems`? | Có | Không bao giờ |
| Kill-switch có nghĩa? | Có | Không |

**Hệ quả 1 — plan p1-01 (bản đầu) SAI.** Nó khẳng định *"không phân trang: số worker là hằng số nhỏ
(~10–15 lockKey), tăng theo số game chứ không theo dữ liệu"*. Sai: `listAll()` trả cả doc resettle.
Sau vài tháng trang "Workers health" chìm trong hàng trăm dòng `keno:resettle:*` — đúng loại "badge/panel
vô dụng vì nhiễu" mà cả feature này sinh ra để diệt.

**Hệ quả 2 — nợ vận hành có sẵn (không do plan này gây ra).** Doc business lock **không bao giờ được
xoá**: entity JSDoc khẳng định *"Doc tồn tại vĩnh viễn sau lần acquire đầu — KHÔNG tự xoá qua TTL"* và
index duy nhất là `{lockKey:1}` unique. `release()` chỉ set `ownerToken = null`, doc vẫn ở lại.

Đáng chú ý: plan hạ tầng gốc `.cursor/plans/worker_lock_infrastructure.plan.md:194,726` **có** đề xuất
`createIndex({expiresAt:1}, {expireAfterSeconds:0})` nhưng bản implement đã bỏ — **và bỏ là ĐÚNG**: TTL
trên `expiresAt` sẽ xoá luôn doc worker lúc idle ⇒ mất `cursor` (redo work), mất `isEnabled` (kill-switch
tự bật lại), mất `stalledItems`. Cái cần là TTL **chỉ cho business lock**, không phải cho cả collection —
nên nó phải chờ có field phân loại (§5.7) mới làm được.

⇒ Cần field phân loại tường minh. Xem §5.7.

## 3. Bốn defect do đặt `worker_stuck` vào `ops_alerts`

### D1 — Lẫn EVENT với STATE ⇒ badge đỏ vĩnh viễn (🟠)

`ops_alerts` thiết kế cho **sự kiện nghiệp vụ đã xảy ra** ("kỳ X có cược 50 triệu"): sự kiện không
tự biến mất, nên `status: new → ack` bằng tay là ĐÚNG. `worker_stuck` là **trạng thái hạ tầng**:
worker hồi phục thì tín hiệu phải tự tắt.

Nhưng `OpsAlertStatus.Resolved` (`game-core/src/types/ops-alert.ts:21`) **không có bất kỳ nơi nào
set** — grep toàn repo chỉ ra đúng 1 match là chính dòng khai báo. Đường duy nhất là `ack(alertId,
ackBy)` (`ops-alert-repo.ts:104-115`), tức thao tác tay của staff.

⇒ Worker khỏi rồi, alert vẫn `status: new` ⇒ `countActiveCritical()` (`ops-alert-repo.ts:80-85`) vẫn
đếm ⇒ badge đỏ tới khi có người ack một sự cố **đã tự khỏi**. Điều này huấn luyện staff phản xạ "cứ
ack cho hết đỏ", làm mòn giá trị badge cho alert nghiệp vụ thật (`large_bet`,
`exposure_threshold`…). Đây là cái giá đắt nhất, vì nó phá thứ mà cả feature ops-risk-control dựa vào.

### D2 — Sai scope hiển thị: badge global, panel per-draw (🟠)

| Đường | Phạm vi | Ở đâu |
|---|---|---|
| Badge đếm | **GLOBAL** — toàn collection, không lọc `drawId` | `get-ops-snapshot.ts:68-69` → `countByStatus` + `countActiveCritical` |
| Panel list | **PER-DRAW** — `drawId` là input bắt buộc | `list-alerts.ts:24-27` → `listByDrawAndStatus(drawId, status)` |

Worker kẹt gần như luôn ở kỳ **cũ nhất** — `findNotFinal` sort `drawId` asc có chủ đích để ưu tiên kỳ
sắp settle (`sync-betting-stats.ts:77-83`) — trong khi staff mở trang Operations của kỳ **đang chạy**.
Kết quả: badge đỏ nhưng mở panel không thấy gì, không có đường tra. Đây là hệ quả trực tiếp của
`OpsAlertBase.drawId` là field **bắt buộc** (`game-core/src/types/ops-alert.ts:42-44`): mọi thứ vào
collection này buộc phải thuộc về một kỳ quay, còn sức khoẻ worker thì không thuộc kỳ nào.

### D3 — Type nói dối về chính miền của nó (🟡)

`OpsAlertsConfig.enabled` là `Record<KenoOpsAlertType, boolean>` — thêm member vào enum thì compiler
BẮT phải điền key. Nên `worker_stuck: true` phải có mặt trong default config
(`game-keno/src/rules/financials.ts:259`) và trong zod schema backoffice, dù **không consumer nào
đọc key đó** (worker bắn trực tiếp, không qua gate). Phải viết JSDoc 8 dòng để bào chữa:

```35:43:packages/game-keno/src/entities/ops-alert.ts
  /**
   * Worker stats/alert kẹt: 1 kỳ lỗi lặp lại nhiều tick liên tiếp — cần người xem log.
   *
   * Alert **VẬN HÀNH của chính worker** (p1-01 Q4), khác 5 loại nghiệp vụ ở trên: worker
   * bắn TRỰC TIẾP, KHÔNG qua gate `OpsConfig.alerts.enabled` — sức khoẻ worker không phải
   * thứ để staff tắt cho "đỡ nhiễu". Key `worker_stuck` vẫn tồn tại trong `enabled` (do
   * `Record<KenoOpsAlertType, boolean>`) nhưng KHÔNG có consumer nào đọc, và UI ops-config
   * cố ý không render toggle cho nó.
   */
```

Đây đã được ghi nhận là defect #5 trong bảng review của `00-overview.md` (mức 🟡) và "fix" bằng cách
viết thêm JSDoc. Khi phải viết JSDoc dài để giải thích vì sao một member không tuân luật của chính
enum chứa nó, gốc vấn đề là member đó **không thuộc enum đó**.

### D4 — Streak không persist được nên đo sai thứ cần đo (🟡)

`Map` reset ở `beforeLoop` (`sync-betting-stats.ts:148`) vì Lambda container reuse. Nên ngưỡng đo được
chỉ là *"3 tick liên tiếp TRONG 1 invocation"* (~30s), và JSDoc tự nhận là YAGNI:

```88:95:packages/game-keno-application/src/use-cases/operations/sync-betting-stats.ts
/**
 * Ngưỡng lỗi LIÊN TIẾP (trong-invocation) của cùng 1 drawId để bắn alert `worker_stuck`.
 *
 * Chỉ đếm trong 1 invocation (Map reset ở `beforeLoop`) — kỳ kẹt THẬT sẽ kẹt mọi
 * invocation nên ngưỡng trong-invocation là đủ, không cần persist state cross-invocation
 * (p1-01 Q4, YAGNI).
 */
```

Lập luận "kỳ kẹt thật sẽ kẹt mọi invocation" đúng, nhưng **không phân biệt được** "lỗi thoáng qua 3
lần" với "kẹt 6 tiếng" — cả hai đều cho `failCount = 3`. Trong khi đó `worker_locks` là chỗ **đã
persist** state qua invocation sẵn (`cursor`, `lastError`, `lastSuccessAt`) — chỉ cần dùng.

## 4. Repo đã có tiền lệ ĐÚNG cho loại tín hiệu này — `tenant-dispatch`

`tenant-dispatch` gặp đúng bài toán "item lỗi lặp lại trong loop" và giải KHÔNG bằng alert doc:

```25:30:packages/tenant-dispatch/src/config/constants.ts
/**
 * Số lần retry trước khi đánh "stuck" — surface lên BO UI để staff check tenant.
 * Không gây tác động tự động lên order (không đổi status, không dừng retry);
 * chỉ là ngưỡng để filter/alert. 50 ≈ tenant đã fail nhiều giờ tới 1 ngày tuỳ backoff.
 */
export const RETRY_ALERT_THRESHOLD = 50;
```

- `retryCount` persist trên **chính item doc** (`dispatch-order.ts`), không sinh doc phụ.
- BO đọc qua **query theo ngưỡng**: `listStuck({minRetryCount})` sort `retryCount DESC`
  (`dispatch-order-repo.ts:288-307`).
- Ngưỡng "không gây tác động tự động" — chỉ để filter. Không có gì phải ack.
- Item thành công ⇒ `markDispatched` ⇒ tự rời khỏi tập "stuck". **Không cần Resolved, không cần ack.**

Ba tính chất này chính là 3 defect D1/D2/D4 ở trên. Tiền lệ đã có, chỉ chưa được áp dụng cho worker
tick-loop.

## 5. Quyết định — dời xuống `worker-core` (USER DUYỆT 03/08/2026)

### 5.1. Nguyên tắc phân tuyến (ranh giới phải rõ để không lặp lại)

| | `ops_alerts` (per-game) | `worker_locks` (worker-core) |
|---|---|---|
| Bản chất | **Sự kiện nghiệp vụ** đã xảy ra trong 1 kỳ | **Trạng thái sức khoẻ** hạ tầng |
| Thuộc về | 1 `drawId` cụ thể | 1 `lockKey` (worker) |
| Tự hết? | KHÔNG — cần staff ack | CÓ — item thành công là hết |
| Ai xem | Staff trực ca kỳ quay (trang Operations) | Ops/dev (trang Workers health) |
| Cấu hình tắt | Có (`ops.alerts.enabled`) | KHÔNG — không ai được tắt cảnh báo sức khoẻ |
| Số bản cài | 1/game (khác nhau thật) | **1 bản duy nhất** cho 9 worker |

**Luật:** nếu tín hiệu *tự hết khi hệ thống hồi phục* và *không thuộc về một kỳ quay* → nó thuộc
`worker_locks`, KHÔNG được vào `ops_alerts`.

### 5.2. Thiết kế: `stalledItems` trên lock doc + 2 method ở base class

`WorkerLockDoc` thêm 1 field:

```typescript
/**
 * Các đơn vị công việc đang lỗi lặp lại trong worker này — trạng thái, KHÔNG phải sự kiện.
 *
 * Worker bắt lỗi per-item (để 1 item bẩn không làm chết cả tick) nên `runLocked` không
 * throw ⇒ `lastError`/`lastSuccessAt` KHÔNG phản ánh được. Field này lấp đúng lỗ đó.
 *
 * Item thành công → biến mất khỏi mảng (tự hết, không cần ack). Mảng cap `MAX_STALLED_ITEMS`
 * để doc không phình khi sự cố diện rộng.
 */
stalledItems: WorkerStalledItem[];
```

```typescript
export interface WorkerStalledItem {
  /** Khoá đơn vị công việc — worker tự quyết ngữ nghĩa. Vd Keno: `drawId`. */
  itemKey: string;
  /** Số lần lỗi LIÊN TIẾP, tích luỹ QUA các invocation (khác bản cũ chỉ đếm trong 1 invocation). */
  failCount: number;
  /** Lần lỗi đầu của streak hiện tại — cho phép tính "kẹt bao lâu" (điều D4 không làm được). */
  firstFailedAt: Date;
  /** Lần lỗi gần nhất. */
  lastFailedAt: Date;
  /** Message lỗi gần nhất, đã `truncateErrorMessage` (500 ký tự) như `lastError`. */
  lastError: string;
}
```

`SingleRunWorker` thêm 2 protected method (đối xứng, đặt cạnh `setCursor`/`extendLock`):

> **Tên thực tế khi implement:** `recordStalledItem` / `clearStalledItem` (khớp field `stalledItems`).
> Các mục dưới viết `recordItemFailure`/`clearItemFailure` là tên ĐỀ XUẤT ban đầu — code đã ship dùng
> `*StalledItem`. Đọc `packages/worker-core/src/use-cases/lock/single-run-worker.ts` làm nguồn chân lý.

| Method | Việc | DB cost |
|---|---|---|
| `recordStalledItem(itemKey, error)` | Cộng streak **trong RAM** (merge với `stalledItems` đọc lúc acquire) | **0** |
| `clearStalledItem(itemKey)` | Xoá khỏi map trong RAM | **0** |

Cả hai **không ghi DB ngay**. Flush 1 lần duy nhất, ghép vào `finalizeAndRelease` — lệnh update đã
tồn tại ở cuối mọi invocation (`lock/single-run-worker.ts:317-325`):

```
finalizeAndRelease(key, token, { lastSuccessAt, lastError, stalledItems })
```

⇒ **0 DB call thêm** so với hiện tại. Bản `ops_alerts` hiện tại tốn 1 `bulkWrite` mỗi lần chạm
ngưỡng, mỗi tick, mỗi kỳ lỗi.

### 5.3. Vì sao flush ở finalize là ĐÚNG (khác `setCursor` phải persist ngay)

`setCursor` cố tình KHÔNG buffer (JSDoc `lock/single-run-worker.ts:58-71`): mất cursor ⇒ **redo work
đã làm**. `stalledItems` khác bản chất:

- Nó là **tín hiệu quan sát**, không phải checkpoint tiến độ. Mất nó không gây redo, không gây sai số.
- Kill cứng (timeout/OOM) mất streak của **1 invocation** ⇒ chỉ làm cảnh báo chậm ~1 phút. Item kẹt
  thật sẽ kẹt invocation sau và streak lại tăng.
- Ngược lại nếu Lambda bị kill cứng thì `lastError`/`lastSuccessAt` cũng không ghi được — nhất quán
  với mọi meta khác của lock doc, không tạo bảo đảm nửa vời.

Đánh đổi này là có chủ đích: **0 DB call thêm** đổi lấy "mất tối đa 1 invocation streak khi kill cứng".

### 5.4. Ngưỡng chỉ để BO filter — KHÔNG sinh alert, KHÔNG chặn gì

Theo đúng tiền lệ `RETRY_ALERT_THRESHOLD` (§4): `worker-core` khai
`STALLED_ALERT_THRESHOLD` (đề xuất 3) nhưng nó **không gây tác động tự động** — không đổi hành vi
worker, không dừng retry, không sinh doc. Chỉ là tham số mặc định để trang BO lọc "worker nào đang có
item kẹt đáng chú ý".

Nhờ vậy: worker hồi phục ⇒ `clearItemFailure` ⇒ item rời mảng ⇒ BO tự hết cảnh báo. **Giải D1 tận gốc**
(không cần `Resolved`, không cần ack tay).

### 5.5. Trang BO "Workers health" — trả nợ cho cả 9 worker

Đọc `worker_locks`, không phụ thuộc game nào:

| Cột | Nguồn | Ý nghĩa vận hành |
|---|---|---|
| Worker | `lockKey` | `keno:stats-sync`, `tenant-dispatch:main`… |
| Trạng thái | `ownerToken` + `expiresAt` | Idle / Running / **Crashed** (`ownerToken != null` && `expiresAt <= now`) — bảng trạng thái đã có trong `worker-lock.ts:14-20` nhưng chưa ai render |
| Thành công gần nhất | `lastSuccessAt` | "cách đây bao lâu" — đúng mục đích JSDoc field này tuyên bố |
| Lỗi gần nhất | `lastError` | Hiện chỉ xem được bằng mongo shell |
| Item kẹt | `stalledItems` | itemKey + failCount + kẹt bao lâu + lastError |
| Kill-switch | `isEnabled` | Toggle thay cho `db.worker_locks.updateOne(...)` bằng tay |

Đặt trong sidebar nhóm **"Hệ thống"** (`sidebar-items.ts:73-91`, cạnh "Lịch sử thao tác"), route
`/system/workers`, quyền `CompanyRole.Admin` cho toggle (`isEnabled` dừng worker = tác động vận hành
thật; đọc thì `Staff` đủ).

Trang **chỉ hiện `kind: worker`** — xem §2.4/§5.7.

### 5.5.1. Use-case đặt ở `worker-core`, app chỉ có route mỏng (SỬA 03/08/2026)

> Bản đầu của §5.5 khuyên đặt use-case ở tầng app (`apps/backoffice/src/app/api/system/workers/_lib/`)
> với lý do *"`worker-core` không có `@megawin/next`"*. **Lập luận đó sai** — "hiện chưa có dep" không
> phải "không được có dep". User chất vấn đúng.

**Tiền lệ quyết định — `packages/tenant-dispatch`:** đây là package **worker** (dep
`@megawin/worker-core`) và nó dep luôn `@megawin/next`, có `use-cases/admin/` gồm **8 NextApiUseCase**
cho BO đọc, export qua subpath `./use-cases/admin`. Route BO chỉ 20 dòng:

```1:20:apps/backoffice/src/app/api/tenant-dispatch/stuck-orders/route.ts
import { CompanyRole } from "@megawin/identity/entities";
import { ListStuckOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/admin";

import { withApi } from "@/lib/api";

import { listStuckOrdersQuerySchema } from "../_lib/schema";

const useCase = new ListStuckOrdersUseCase();

export const GET = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .query(listStuckOrdersQuerySchema)
  .handler(async ({ query }) =>
    useCase.run({ minRetryCount: query.minRetryCount, ... }),
  );
```

**Lý do mạnh nhất để KHÔNG đặt ở app** — chính JSDoc của `DistributedMutex` đã phê phán đúng
điều mà bản đầu của plan định làm:

```29:31:packages/worker-core/src/use-cases/lock/distributed-mutex.ts
 * - Gọi trực tiếp `WorkerLockRepository` từ business layer làm **leak
 *   infrastructure detail** (`ownerToken`, `expiresAt`, `tryAcquire`) ra
 *   BO use case → 6 game khác sẽ copy-paste cùng pattern.
```

Use-case ở tầng app buộc `apps/backoffice` import `WorkerLockRepository` trực tiếp ⇒ leak
`ownerToken`/`expiresAt` ra app, trái cả `mongodb.mdc` (repo chỉ gọi trong package sở hữu nó).

**Vì sao `get-dashboard-draws.ts` (app-level) KHÔNG phải tiền lệ cho ca này:** nó orchestrate repo của
**7 game khác nhau** — không package nào là chủ sở hữu tự nhiên, nên app là nơi đúng. `worker_locks` thì
có chủ rõ ràng: `worker-core`.

**Chốt cấu trúc:**

```
packages/worker-core/
├── src/use-cases/admin/
│   ├── list-workers-health.ts       # NextApiUseCase — listByKind + derive state
│   ├── set-worker-enabled.ts        # NextApiUseCase — toggle isEnabled + audit
│   ├── types.ts                     # WorkerHealthRow, WorkerRunState
│   └── index.ts
├── src/shared/labels/               # theo tiền lệ tenant-dispatch ./shared/labels
│   ├── worker-labels.ts             # WORKER_RUN_STATE_LABELS + badge variant
│   └── index.ts
└── package.json                     # + dep @megawin/next, @megawin/audit
                                     # + subpath ./use-cases/admin, ./shared/labels

apps/backoffice/src/app/api/system/workers/
├── _lib/schema.ts                   # zod cho PATCH/GET
└── route.ts                         # GET + PATCH, ~20 dòng, gọi use-case
```

Lợi ích kèm theo: `WorkerHealthRow`/`WorkerRunState`/labels tái dùng được nếu sau này có app ops riêng,
và mọi thay đổi shape sức khoẻ worker nằm **1 chỗ** cùng nơi định nghĩa `WorkerLockDoc`.

### 5.6. Cái gì BỊ XOÁ ở Keno

| Xoá | Ở đâu |
|---|---|
| `KenoOpsAlertType.WorkerStuck` | `game-keno/src/entities/ops-alert.ts:35-44` (cả JSDoc 8 dòng bào chữa) |
| `worker_stuck: true` trong default config | `game-keno/src/rules/financials.ts:259` |
| `recordFailAndMaybeAlert` + `WORKER_STUCK_THRESHOLD` + `consecutiveFails` + field `alertRepo` | `sync-betting-stats.ts` (~40 dòng) |
| `recordStuckAndMaybeAlert` + `WORKER_STUCK_THRESHOLD` + `stuckDrawId`/`stuckStreak` | `evaluate-ops-alerts.ts` (~35 dòng) |
| `case KenoOpsAlertType.WorkerStuck` | `alerts-panel.tsx:176-186` |
| Label "Worker kẹt" | `ops-constants.ts:28` |

Thay bằng: `this.recordItemFailure(cursor.drawId, error)` / `this.clearItemFailure(cursor.drawId)` —
2 dòng, không try/catch bọc ngoài (không có I/O nên **không thể throw** — xoá luôn cả 2 khối
try/catch phòng-hộ ở `sync-betting-stats.ts:206-210` và `evaluate-ops-alerts.ts:134-138`, chính là
defect #2 và #3 trong bảng review `00-overview.md`).

### 5.7. Field `description` + `kind` trên lock doc (chốt 03/08/2026)

Xuất phát từ 2 câu hỏi của user: (a) thêm field mô tả optional để BO hiểu worker làm gì, default =
`lockKey`; (b) use-case nên ở `worker-core` (§5.5.1). Trong lúc kiểm (a) mới phát hiện §2.4.

#### `description?: string` — ĐỒNG Ý, nguồn là base class

```typescript
/**
 * Mô tả worker làm gì — để BO hiển thị thay cho `lockKey` kỹ thuật.
 *
 * Optional: doc tạo trước khi có field này, và business lock (§2.4) không khai.
 * Tầng đọc fallback `description ?? lockKey`.
 */
description?: string;
```

Vì sao **KHÔNG** dùng registry `Record<lockKey, string>` (kiểu `DISPATCH_ORDER_STATUS_LABELS`):

1. `lockKey` **động** (`keno:resettle:${drawId}`) — registry tĩnh không enumerate được.
2. Registry ở `worker-core` = hạ tầng phải biết danh sách consumer ⇒ coupling ngược chiều.
3. Thêm worker mà quên thêm label = drift ở **2 chỗ** — đúng loại lỗi vừa diệt ở D3. Worker tự khai về
   chính nó thì không thể lệch.

Ba điểm implement quan trọng:

- **Nguồn:** `protected readonly description?: string` trên `SingleRunWorker` (không phải method —
  mô tả thuộc *class worker*, không phụ thuộc input). Nếu tương lai cần động, đổi thành
  `resolveDescription(input)` cho đối xứng với `resolveLockKey(input)` — chưa cần bây giờ.
- **Ghi bằng `$set`, KHÔNG `$setOnInsert`.** Đây là bẫy thật: `tryAcquire` hiện init mọi field khác bằng
  `$setOnInsert` nên copy theo là bản năng — nhưng `$setOnInsert` sẽ **đóng băng mô tả cũ vĩnh viễn**,
  sửa text trong code không bao giờ propagate lên doc đã tồn tại.
- **Fallback `?? lockKey` ở tầng ĐỌC (use-case admin), KHÔNG ở mapper.** Nếu mapper tự điền `lockKey`
  thì mất khả năng phân biệt *"worker chưa khai mô tả"* (cần nhắc dev bổ sung) với *"khai đúng bằng
  lockKey"*. Khác `stalledItems` (normalize `?? []` ở mapper là đúng vì `[]` và "thiếu field" đồng nghĩa).

#### `kind` — giải §2.4, const-as-const

```typescript
export const WorkerLockKind = {
  /** Lock của worker chạy theo lịch — `lockKey` TĨNH, doc sống vĩnh viễn, có cursor/stalledItems/kill-switch. */
  Worker: "worker",
  /** Lock nghiệp vụ per-resource — `lockKey` ĐỘNG (`keno:resettle:{drawId}`), dùng 1 lần rồi thành rác. */
  Business: "business",
} as const;
export type WorkerLockKind = (typeof WorkerLockKind)[keyof typeof WorkerLockKind];
```

- `SingleRunWorker` ghi `kind: Worker`; `DistributedMutex` ghi `kind: Business` — cả 2 qua
  cùng param mới của `tryAcquire` ⇒ **0 DB call thêm**.
- Trang BO filter `{ kind: Worker }` ⇒ không bị flood.
- Doc cũ thiếu field: tầng đọc coi `kind === undefined` là `Worker` (mọi doc trước 03/08 đều là worker —
  business lock của resettle chưa deploy). Ghi rõ trong JSDoc để không ai đoán.

Vì sao **không** dùng `description: {$exists:true}` làm cờ phân loại thay cho `kind`: đó là lấy field
**trình bày** làm cờ **ngữ nghĩa** — 1 field 2 nghĩa, đúng loại nhập nhằng (event vs state) mà cả analysis
này sinh ra để diệt. Rẻ hơn 1 field nhưng đắt hơn nhiều khi debug.

#### Nợ mở ra (KHÔNG giải trong đợt này)

Sau khi có `kind`, TTL cho business lock trở nên khả thi: index partial
`{expiresAt:1}, expireAfterSeconds: <grace>, partialFilterExpression: {kind: "business"}` — dọn rác mà
không đụng doc worker. Đây là **nợ có sẵn** (§2.4 hệ quả 2), không do feature này gây ra; ghi vào
`00-overview.md` §Nợ vận hành, làm khi resettle thực sự chạy production. **KHÔNG** thêm TTL không có
`partialFilterExpression` — sẽ xoá doc worker lúc idle và mất `cursor`/`isEnabled`/`stalledItems`.

## 6. Phương án đã cân nhắc và LOẠI

| Phương án | Vì sao loại |
|---|---|
| **Giữ nguyên trong `ops_alerts`** | 4 defect §3 còn nguyên; port p2-01 nhân thành 6–8 bản; D1 làm mòn badge của alert nghiệp vụ thật |
| **Collection riêng `worker_health`** | `worker_locks` đã là 1 doc/worker, tồn tại vĩnh viễn, đã có `lastError`/`lastSuccessAt`/`cursor` — thêm collection thứ 2 cùng khoá `lockKey` là chia state 2 nơi, và mất được "0 DB call thêm" (§5.2) vì phải ghi lệnh riêng |
| **Chỉ dựa `logError` + CloudWatch alarm** | Phải xây convention alarm/metric filter chưa từng có trong repo (grep: 0); ops không thấy trong backoffice; không trả nợ `lastError`/kill-switch đang mù |
| **Ghi `stalledItems` ngay mỗi lần lỗi (không buffer)** | Sự cố diện rộng (D kỳ cùng lỗi) ⇒ D update/tick chỉ để ghi tín hiệu quan sát. Buffer + flush ở finalize đạt cùng mục tiêu với 0 call thêm (§5.3) |
| **Đặt `recordItemFailure` ở `TickLoopWorker`** | Lỗi per-item KHÔNG chỉ có ở worker tick-loop — `tenant-dispatch` (`extends SingleRunWorker`) cũng loop item. Đặt ở `SingleRunWorker` để cả 2 nhánh dùng được |
| **Tự động dừng worker khi item kẹt quá N lần** | Trái tiền lệ đã chốt (`RETRY_ALERT_THRESHOLD`: "không gây tác động tự động"). 1 kỳ bẩn không được phép dừng cập nhật các kỳ còn lại (K7) |
| **Registry `Record<lockKey, description>` ở `worker-core`** | `lockKey` động (`keno:resettle:${drawId}`) không enumerate được; hạ tầng phải biết danh sách consumer (coupling ngược); drift 2 chỗ khi thêm worker — xem §5.7 |
| **Use-case admin đặt ở tầng app** (bản đầu của plan p1-01) | Buộc `apps/backoffice` import `WorkerLockRepository` ⇒ leak `ownerToken`/`expiresAt` ra app — chính điều JSDoc `DistributedMutex:29-31` đã phê phán. Tiền lệ `tenant-dispatch/use-cases/admin` (8 NextApiUseCase trong package worker) là mẫu đúng — §5.5.1 |
| **Dùng `description: {$exists}` thay `kind` để lọc trang BO** | Lấy field *trình bày* làm cờ *ngữ nghĩa* — 1 field 2 nghĩa, đúng loại nhập nhằng feature này sinh ra để diệt (§5.7) |
| **TTL `{expiresAt:1}, expireAfterSeconds:0` cho cả collection** (như plan hạ tầng gốc đề xuất) | Xoá luôn doc worker lúc idle ⇒ mất `cursor` (redo work), `isEnabled` (kill-switch tự bật lại), `stalledItems`. Bản implement đã bỏ TTL này là ĐÚNG. Muốn dọn rác business lock phải có `partialFilterExpression: {kind:"business"}` (§5.7, nợ mở) |

## 7. Rủi ro của chính đề xuất này

| Rủi ro | Mức | Giảm nhẹ |
|---|---|---|
| Mảng `stalledItems` phình khi sự cố diện rộng | 🟡 | Cap `MAX_STALLED_ITEMS` (20), giữ item `failCount` cao nhất — cùng cách `topPotential` bị cap |
| Mất streak khi Lambda kill cứng | 🟢 | Có chủ đích (§5.3) — chỉ trễ cảnh báo ~1 phút, tín hiệu quan sát không phải checkpoint |
| Đổi shape `WorkerLockDoc` ảnh hưởng 9 worker | 🟢 | Field mới + đọc `?? []` ở mapper (nguyên tắc normalize-phía-đọc, keno analysis §5.5). Doc cũ thiếu field vẫn chạy |
| Trang BO là scope mới (chi phí lớn nhất) | 🟠 | Tách plan riêng; trả nợ luôn `lastError`/`lastSuccessAt`/kill-switch của **9 worker**, không phải chi phí riêng cho `worker_stuck` |
| Mất cảnh báo ngay trên trang Operations của kỳ | 🟡 | Nếu cần: thêm 1 boolean `statsWorkerStalled` vào ops-snapshot (đọc `worker_locks` theo `lockKey` cố định) — KHÔNG cần alert doc. Để P1, chỉ làm nếu staff thật cần |
| `description` ghi bằng `$setOnInsert` ⇒ mô tả đóng băng, sửa code không propagate | 🟠 | Ghi bằng `$set` trong `tryAcquire`. Nghiệm thu: sửa text → chạy lại → doc phải đổi (§5.7) |
| `worker-core` thêm dep `@megawin/next` ⇒ worker Lambda bundle to hơn | 🟢 | `use-cases/admin` là subpath export riêng — worker import `./use-cases` không kéo `next` vào bundle. Đúng cách `tenant-dispatch` đang làm (dep `next` + 9 worker vẫn deploy bình thường) |
| Trang BO bị flood doc `keno:resettle:*` khi resettle chạy production | 🟠 | `kind` + filter `{kind: Worker}` ở repo (§5.7). Nếu thiếu bước này thì đúng cái D2 (badge/panel nhiễu) tái sinh dưới hình thức khác |

## 8. Ảnh hưởng tới các analysis/plan đã có

Q4 của **cả 4 game** bị thay thế bởi analysis này:

| Doc | Mục | Thay đổi |
|---|---|---|
| `keno-stats-worker-simplification.analysis.md` | §5.4 Q4 | Q4 → SUPERSEDED, trỏ tới analysis này (§5.7 mới) |
| `bingo18-stats-worker-simplification.analysis.md` | §4.2 Q4, §5.6 | "alert `worker_stuck`" → "dùng `recordItemFailure` của worker-core" |
| `max3d-stats-worker-simplification.analysis.md` | §5.6 | y trên |
| `max3dpro-stats-worker-simplification.analysis.md` | §5.7 | y trên |
| `p1-01-keno-stats-code-quality.plan.md` | Q4 | Q4 → SUPERSEDED (code đã ship, plan mới hoàn nguyên) |
| `p2-01-port-guide-bingo18-max3d-max3dpro.md` | §1.1, §5 | Bỏ `worker_stuck` khỏi checklist port; thêm mục "worker health dùng base class, KHÔNG khai alert type mới" |

**Quan trọng cho 3 game chưa port:** vì Q4 bị bỏ, 3 game **KHÔNG** cần thêm member `worker_stuck` vào
`{Game}OpsAlertType`, **KHÔNG** cần key trong `enabled` default/zod, **KHÔNG** cần label + nhánh render
FE. Đây là phần tiết kiệm lớn nhất của quyết định này (3 game × 4 điểm chạm).

## 9. Plans phái sinh

Đặt tại `.cursor/plans/system-worker-health/`:

- `p0-01-worker-core-item-failure.plan.md` — §5.2–5.4 + §5.7: `WorkerStalledItem` +
  `recordItemFailure`/`clearItemFailure` + flush trong `finalizeAndRelease` + mapper normalize +
  `description`/`kind` + `listByKind`.
- `p0-02-keno-drop-worker-stuck-alert.plan.md` — §5.6: xoá `worker_stuck` khỏi 2 worker Keno + enum +
  config default + FE; nối vào API mới.
- `p1-01-backoffice-workers-health-page.plan.md` — §5.5 + §5.5.1: use-case admin **trong `worker-core`**
  + route mỏng ở app + trang `/system/workers` + sidebar.

Thứ tự: p0-01 → p0-02 (cần base method) → p1-01 (đọc được ngay sau p0-01, nhưng ưu tiên sau p0-02 để
không có 2 kênh tín hiệu song song).

---

*Analysis này là living document — cập nhật khi plan phái sinh đổi trạng thái, theo
`.cursor/analysis/README.md`.*
