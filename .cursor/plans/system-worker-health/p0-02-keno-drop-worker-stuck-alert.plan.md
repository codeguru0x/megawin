# p0-02 — Keno: xoá `worker_stuck` khỏi `ops_alerts`, nối vào worker-core

> **Nguồn:** `.cursor/analysis/system-worker-health.analysis.md` §5.6 (+ §3 cho 4 defect được diệt, §5.7 cho `description`)
> **Phase:** P0 · **Phụ thuộc:** p0-01 (cần `recordItemFailure`/`clearItemFailure` + `description`)
> **Phạm vi:** `game-keno`, `game-keno-application`, FE backoffice Keno. KHÔNG chạm 3 game khác
> (chúng chưa từng có `worker_stuck` — xem p2-01 port guide).
> **Bổ sung 03/08:** §2.6 khai `description` cho 2 worker Keno — đây cũng là **nghiệm thu thực tế** cho
> field mới của p0-01 (bẫy `$setOnInsert` chỉ lộ khi có caller thật).

## 1. Mục tiêu

Hoàn nguyên Q4 của `p1-01-keno-stats-code-quality.plan.md`: `worker_stuck` là **trạng thái sức khoẻ
hạ tầng** nhưng đang nằm trong `keno_ops_alerts` — collection dành cho **sự kiện nghiệp vụ của 1 kỳ
quay**. Đặt sai chỗ sinh 4 defect (analysis §3):

| | Defect | Plan này diệt bằng |
|---|---|---|
| D1 | Badge đỏ vĩnh viễn — `OpsAlertStatus.Resolved` không ai set, chỉ `ack` tay | `stalledItems` tự rỗng khi item hồi phục |
| D2 | Badge đếm global (`get-ops-snapshot.ts:68-69`) nhưng panel lọc per-draw (`list-alerts.ts:27`) ⇒ đỏ mà panel trống | Tín hiệu chuyển sang trang Workers health (p1-01), không thuộc kỳ nào |
| D3 | `enabled[worker_stuck]` tồn tại vì `Record<KenoOpsAlertType, boolean>` nhưng 0 consumer đọc | Xoá member khỏi enum ⇒ key biến mất khỏi `Record` |
| D4 | Streak reset mỗi invocation (`Map` reset ở `beforeLoop`) | Base class persist streak trên lock doc |

Đồng thời xoá 2 khối `try/catch` phòng-hộ vốn là defect #2/#3 trong bảng review
`keno-ops-risk-control/stats-worker-simplification/00-overview.md` — chúng không còn cần vì API mới
không có I/O.

## 2. Việc phải làm

### 2.1. `sync-betting-stats.ts` — thay ~40 dòng bằng 2 dòng

File: `packages/game-keno-application/src/use-cases/operations/sync-betting-stats.ts`

**Xoá:**

| Xoá | Dòng hiện tại |
|---|---|
| `WORKER_STUCK_THRESHOLD` + JSDoc 8 dòng (tự nhận YAGNI) | `:88-95` |
| Field `private readonly alertRepo` + JSDoc 6 dòng bào chữa | `:123-128` |
| Field `private consecutiveFails` | `:136-137` |
| Dòng reset `this.consecutiveFails = new Map()` trong `beforeLoop` | `:148` |
| `this.consecutiveFails.delete(cursor.drawId)` | `:188` |
| Khối `try/catch` bọc `recordFailAndMaybeAlert` | `:204-210` |
| Toàn bộ method `recordFailAndMaybeAlert` + JSDoc | `:217-248` |
| Import `OpsAlertSeverity`, `OpsAlertStatus`, `KenoOpsAlertType`, `truncateErrorMessage`, `OpsAlertRepository` | `:39-50` (kiểm còn dùng ở chỗ khác không trước khi xoá) |

**Thay bằng** trong `runTick`:

```typescript
        this.counters.entriesApplied += applied.entriesApplied;
        this.clearItemFailure(cursor.drawId); // kỳ qua được → xoá streak (thay consecutiveFails.delete)
```

```typescript
      } catch (error) {
        // Mất lock KHÔNG phải "kỳ lỗi": phải thoát cả invocation, không chạy kỳ tiếp theo.
        if (error instanceof LockTakenOverError) {
          throw error;
        }
        this.counters.failed += 1;
        logError("keno:stats-sync", error, { drawId: cursor.drawId });
        // Streak lỗi per-kỳ do worker-core giữ (persist trên lock doc, tích luỹ qua invocation).
        // KHÔNG có I/O ⇒ không thể throw ⇒ không cần try/catch bọc ngoài như bản alert cũ.
        this.recordItemFailure(cursor.drawId, error);
      }
```

**Sửa JSDoc class** (`:31-34`): đoạn *"Worker này CHỈ giữ lại alert VẬN HÀNH của chính nó
(`worker_stuck` — p1-01 Q4)…"* phải viết lại — giờ worker **không bắn alert nào cả**, sức khoẻ do
`worker-core` lo. Đây là loại comment stale mà Q1 của p1-01 sinh ra để diệt; đừng tạo thêm.

### 2.2. `evaluate-ops-alerts.ts` — tương tự, ~35 dòng

File: `packages/game-keno-application/src/use-cases/operations/evaluate-ops-alerts.ts`

**Xoá:** `WORKER_STUCK_THRESHOLD` (`:57-61`), field `stuckDrawId`/`stuckStreak` (`:85-87`), 2 dòng
reset trong `beforeLoop` (`:102-103`), khối `try/catch` bọc `recordStuckAndMaybeAlert` (`:132-138`),
toàn bộ `recordStuckAndMaybeAlert` (`:157-190`), nhánh xoá streak (`:142-146`).

**Giữ:** `alertRepo` — worker này **vẫn cần** nó cho alert nghiệp vụ (`bulkUpsertByDedupe` ở
`evaluateDoc`). Chỉ sync worker mới bỏ hẳn field đó.

**Thay bằng:**

```typescript
      try {
        await this.evaluateDoc(stats);
      } catch (error) {
        logError("keno:ops-alerts", error, { drawId: stats.drawId });
        this.recordItemFailure(stats.drawId, error);
        break; // KHÔNG tiến cursor qua doc lỗi — cursor global, nhảy qua = mất đánh giá kỳ đó
      }
      this.cursor = stats.updatedAt;
      this.clearItemFailure(stats.drawId);
```

**Lưu ý ngữ nghĩa khác nhau giữa 2 worker** — phải ghi vào comment, vì nó là lý do 2 bản cũ lệch nhau:

- Sync worker: watermark **per-draw** → skip kỳ lỗi, chạy kỳ tiếp → nhiều kỳ có thể kẹt đồng thời.
- Alert worker: cursor **global** → `break` tại doc lỗi → tại 1 thời điểm chỉ 1 doc chặn.

Cả hai giờ dùng **cùng 1 API** với cùng ngữ nghĩa "item này lỗi/qua" — base class không cần biết khác
biệt trên. Đó là lý do API nhận `itemKey` chứ không phải `drawId`.

**Sửa JSDoc class** (`:23-27`): bỏ mệnh đề *"worker tự bắn alert vận hành `worker_stuck` khi CÙNG 1
drawId chặn cursor ≥3 tick liên tiếp trong invocation (p1-01 Q4)"* → thay bằng mô tả đúng: streak do
worker-core giữ, hiển thị ở trang Workers health.

### 2.3. Entity — xoá member enum

File: `packages/game-keno/src/entities/ops-alert.ts`

Xoá member `WorkerStuck` + JSDoc 8 dòng (`:35-44`). Compiler sẽ **bắt mọi nơi còn dùng** — đó là chủ
đích (`Record<KenoOpsAlertType, boolean>` sẽ báo key thừa).

Sau khi xoá, `KenoOpsAlertType` còn 7 member, tất cả đều là alert nghiệp vụ **đi qua gate**
`ops.alerts.enabled` → JSDoc enum không cần đoạn giải thích ngoại lệ nào nữa. Kiểm cả JSDoc header
file (`:15-19`) xem có nhắc `worker_stuck` không.

### 2.4. Default config

File: `packages/game-keno/src/rules/financials.ts:259`

Xoá dòng `[KenoOpsAlertType.WorkerStuck]: true,` khỏi `enabled` default. Kiểm comment quanh đó — bảng
review defect #5 nói đã thêm comment giải thích key này, phải xoá theo.

Kiểm zod schema backoffice cho ops-config (grep `enabled` trong
`apps/backoffice/src/app/api/keno/config/**/_lib/schema.ts` và trang
`config/game/_lib/ops-section.tsx`): nếu schema liệt kê key tường minh → xoá key; nếu sinh từ
`Object.values(KenoOpsAlertType)` → tự đúng.

### 2.5. FE

| File | Xoá |
|---|---|
| `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/alerts/alerts-panel.tsx` | `case KenoOpsAlertType.WorkerStuck` (`:176-186`) — nhánh render `failCount`/`lastError` |
| `apps/backoffice/src/app/(main)/games/keno/operations/_lib/ops-constants.ts` | Label `"Worker kẹt"` (`:28`) |

Kiểm thêm: map màu/severity theo type, filter dropdown theo type — grep `WorkerStuck` toàn `apps/backoffice`.

### 2.6. Khai `description` cho 2 worker Keno (bổ sung 03/08 — p0-01 §2.6a)

2 worker này là caller đầu tiên của `description`, nên cũng là **nghiệm thu thực tế** cho field đó.

`sync-betting-stats.ts` — đặt cạnh `ttlSeconds`/`resolveLockKey`:

```typescript
  protected readonly description =
    "Keno — đồng bộ thống kê cược theo delta (tick ~20s, mọi kỳ đang mở)";
```

`evaluate-ops-alerts.ts`:

```typescript
  protected readonly description =
    "Keno — đánh giá cảnh báo vận hành (ngưỡng exposure/cap/combo) cho kỳ đang mở";
```

Quy ước viết mô tả (áp cho mọi worker về sau):

- Bắt đầu bằng **tên game** (hoặc `"Hệ thống"` với worker không thuộc game) — trang BO liệt kê chung 9
  worker, không có tiền tố thì phải đọc `lockKey` mới biết của game nào.
- Nói **worker làm gì cho nghiệp vụ**, không mô tả cơ chế kỹ thuật. Ops đọc để trả lời "tắt cái này thì
  mất gì?".
- Nêu **cadence** nếu là tick-loop (`~20s`) — quyết định "bao lâu không thấy `lastSuccessAt` là bất
  thường?".
- 1 dòng, ≤ ~100 ký tự — cell bảng, không phải chỗ viết tài liệu.

### 2.7. Dữ liệu cũ trên DB

Dự án **chưa deploy** (tiền lệ đã xác lập ở p1-01 §Q5: không có doc production nào từ worker) ⇒ không có
alert `worker_stuck` nào tồn tại ⇒ **KHÔNG cần script cleanup**.

Nếu môi trường dev có alert rác từ lúc test: 1 lệnh
`db.keno_ops_alerts.deleteMany({type: "worker_stuck"})` chạy tay, ghi vào PR description. KHÔNG viết
migration script cho việc này (bài học p1-01 §Q5: đừng xây lớp xử lý cho dữ liệu không tồn tại).

## 3. Cái KHÔNG làm

| Không làm | Vì sao |
|---|---|
| Sửa 3 game còn lại | Chưa có `worker_stuck` — p2-01 port guide đã được sửa để chúng KHÔNG thêm |
| Xoá `TopAccountStat`/`OpsAlertStatus.Resolved` | Ngoài scope. `Resolved` vẫn dead nhưng đó là vấn đề riêng của alert nghiệp vụ, ghi thành nợ |
| Thêm cảnh báo thay thế trên trang Operations | Analysis §7 — chỉ làm nếu staff thật cần, sau p1-01 |
| Đổi `counters.failed` | Vẫn hữu ích (đếm trong invocation, trả về qua result → CloudWatch log) |
| Khai `description` cho 7 worker khác (bingo18/max3d/…/tenant-dispatch) | Field optional, thiếu thì BO hiện `lockKey` — không vỡ. Khai dần khi ai chạm worker đó (port guide p2-01 đã ghi). Nhồi 7 file vào PR này làm loãng review phần chính (xoá alert) |

## 4. Đánh giá & verify

### 4.1. Type-check + grep

```bash
pnpm --filter @megawin/game-keno check-types
pnpm --filter @megawin/game-keno-application check-types
pnpm --filter backoffice check-types

rg -n 'worker_stuck|WorkerStuck|WORKER_STUCK|consecutiveFails|stuckStreak|stuckDrawId' packages apps
# Kỳ vọng: 0 kết quả.
```

### 4.2. Kiểm cặp gọi đối xứng (điểm dễ sai nhất)

Với MỖI worker, mọi đường ra khỏi vòng xử lý 1 item phải gọi đúng 1 trong 2:

| Đường | Gọi |
|---|---|
| Item xử lý xong (kể cả `drained: false`) | `clearItemFailure` |
| Item throw (trừ `LockTakenOverError`) | `recordItemFailure` |
| `LockTakenOverError` | KHÔNG gọi gì — re-throw ngay (không phải lỗi của item) |

Rủi ro #8 của p0-01: thiếu `clearItemFailure` ⇒ item kẹt "ảo" mãi trên lock doc. Review đọc thẳng 2
`runTick`.

### 4.3. Smoke test (cần dev — chạy ở stage deploy)

1. Ép 1 kỳ lỗi → `db.worker_locks.findOne({lockKey:"keno:stats-sync"}).stalledItems` có entry với
   `itemKey = drawId`, `failCount` tăng qua từng invocation.
2. `db.keno_ops_alerts.countDocuments({type:"worker_stuck"})` = 0 (không sinh alert mới).
3. Sửa data → invocation sau `stalledItems` rỗng, **không ai ack gì**.
4. `db.worker_locks.find({lockKey:/^keno:/}, {description:1, kind:1})` → cả 2 doc có `description` đúng
   text vừa khai + `kind: "worker"`.
5. **Sửa 1 chữ trong `description` → deploy → chạy lại → doc đổi theo.** Đây là nghiệm thu duy nhất bắt
   được lỗi dùng `$setOnInsert` (p0-01 rủi ro #9) — unit test không bắt được vì cần doc tồn tại trước.
4. Trang Operations Keno: badge critical KHÔNG còn đỏ vì sự cố worker (chỉ đỏ vì alert nghiệp vụ thật).

## 5. Review code & rủi ro

> Chạy ở **task riêng SAU KHI code xong**.

| # | Rủi ro | Mức | Giảm nhẹ / điểm phải kiểm |
|---|---|---|---|
| 1 | Xoá `alertRepo` khỏi **alert worker** thay vì chỉ sync worker → mất luôn alert nghiệp vụ | 🔴 | §2.2 ghi rõ: `evaluate-ops-alerts.ts` GIỮ `alertRepo`. Review kiểm `evaluateDoc` vẫn `bulkUpsertByDedupe` |
| 2 | Thiếu `clearItemFailure` ở 1 nhánh → item kẹt ảo | 🟠 | §4.2 bảng cặp gọi |
| 3 | Gọi `recordItemFailure` cả với `LockTakenOverError` → lock takeover bị ghi như "kỳ lỗi" | 🟠 | Guard `if (error instanceof LockTakenOverError) throw error` phải đứng TRƯỚC. Đây là defect #1 của p0-01 keno cũ (đã sửa 1 lần) — đừng làm lại |
| 4 | JSDoc class 2 worker còn nhắc `worker_stuck` sau khi code đã xoá | 🟡 | §2.1/§2.2 nêu rõ dòng cần sửa. Đây đúng loại comment stale mà Q1 p1-01 sinh ra để diệt |
| 5 | Mất khả năng "staff thấy cảnh báo ngay trên trang kỳ đang xem" | 🟡 | Có chủ đích (analysis §7): D2 chứng minh khả năng đó vốn **không hoạt động** (kỳ kẹt là kỳ cũ, staff xem kỳ mới). Bù bằng trang Workers health (p1-01) |
| 6 | Giai đoạn giữa p0-02 và p1-01: không có UI nào hiển thị `stalledItems` | 🟠 | Chấp nhận: trước plan này cũng không ai thấy được (D2). Ngắn hạn tra bằng `db.worker_locks.find()`; p1-01 phải cùng sprint |
| 7 | Sót key `worker_stuck` trong zod schema/ops-config UI → 400 khi lưu config | 🟠 | §2.4 kiểm cả 2 nơi. Test tay: mở trang ops-config Keno, bấm lưu |
| 8 | `description` viết như comment kỹ thuật ("gọi syncDraw cho từng cursor") thay vì nghĩa nghiệp vụ | 🟡 | §2.6 có quy ước. Người đọc là **ops**, câu hỏi họ cần trả lời là "tắt cái này thì mất gì?" |
| 9 | Khai `description` nhưng doc trên DB không đổi (dev tưởng field lỗi) | 🟠 | Triệu chứng của `$setOnInsert` ở p0-01 (rủi ro #9). §4.3 bước 5 là phép thử. Nếu gặp: lỗi ở p0-01, KHÔNG workaround ở đây bằng `$unset` tay |

## 6. Rollback

Revert PR. `stalledItems` trên lock doc còn dữ liệu: vô hại (p0-01 giữ nguyên, không ai đọc nếu p1-01
chưa có). Muốn quay lại alert cũ thì phải revert cả code + thêm lại member enum + key config — nên
quyết trước khi merge, không "thử rồi lùi".
