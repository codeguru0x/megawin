# System Worker Health — Master Plan (00-overview)

> **Nguồn:** `.cursor/analysis/system-worker-health.analysis.md` (status `approved`, user duyệt 03/08/2026).
> **Scope chốt:** 03/08/2026 — dời tín hiệu "item lỗi lặp lại" từ `ops_alerts` (per-game) xuống
> `worker_locks` (`worker-core`, dùng chung 9 worker), kèm trang BO đọc sức khoẻ worker.
> **Quan hệ:** THAY THẾ Q4 (`worker_stuck`) của cả 4 game — xem analysis §8 cho danh sách doc bị ảnh hưởng.

Feature này lấp lỗ hổng: worker bắt lỗi **per-item** để 1 item bẩn không làm chết cả tick, nên
`runLocked` không throw ⇒ `worker_locks.lastError`/`lastSuccessAt` **báo khoẻ trong khi 1 kỳ kẹt vĩnh
viễn** (analysis §2.2). Giải bằng `stalledItems` trên chính lock doc + 2 method ở
`SingleRunWorker`, flush ghép vào `finalizeAndRelease` đã có ⇒ **0 DB call thêm**.

Đồng thời trả nợ: `lastError`, `lastSuccessAt`, kill-switch `isEnabled` của **cả 9 worker** hiện chỉ
xem/sửa được bằng mongo shell — chưa có UI nào đọc `worker_locks` (analysis §2.3).

## Bảng trạng thái

Tách 2 cột như thư mục `keno-ops-risk-control/stats-worker-simplification/`: **Code** (implement theo
mô tả plan, trừ mục "Review & rủi ro") và **Review & rủi ro** (task riêng SAU KHI code xong).

| Plan | Phase | Code | Review & rủi ro | Phụ thuộc | Ghi chú |
|---|---|---|---|---|---|
| p0-01-worker-core-item-failure | P0 | ✅ done | ✅ done | — | `WorkerStalledItem` + `recordStalledItem`/`clearStalledItem` (đổi tên từ `recordItemFailure`/`clearItemFailure`) + flush trong `finalizeAndRelease`; `description`/`kind`/`listByKind`; mapper tường minh + `satisfies`; file `indexes/`. **2 điểm khác plan (đều tốt hơn):** (1) `kind` **required** + DB backfill migration thủ công → mapper/repo đọc thẳng `doc.kind`, `listByKind` filter `{ kind }` thuần (rủi ro #10 `$in:[null]` không còn áp dụng); (2) TTL business (`idx_acquiredAt_ttl_business`, `partialFilterExpression:{kind:"business"}`, anchor `acquiredAt`) đã làm luôn trong `indexes/` — giải "nợ TTL" §Nợ. Bonus: `evictLowestFailCount` cap Map ngay trong RAM. `check-types` worker-core + tenant-dispatch + worker-keno = pass. |
| p0-02-keno-drop-worker-stuck-alert | P0 | ✅ done | ✅ done | p0-01 | Xoá sạch `worker_stuck`/`WorkerStuck`/`WORKER_STUCK`/`consecutiveFails`/`stuckStreak` khỏi `packages`+`apps` (grep = 0, chỉ còn trong analysis/plan). 2 worker Keno nối `recordStalledItem`/`clearStalledItem`, guard `LockTakenOverError` re-throw TRƯỚC, không try/catch bọc; `alertRepo` giữ ở alert worker, bỏ ở sync worker; JSDoc class 2 worker đã sửa (hết stale); `description` khai đủ 2 worker. Default config + zod (`z.record`) + FE sạch. `check-types` game-keno + game-keno-application = pass. |
| p1-01-backoffice-workers-health-page | P1 | ✅ done | ✅ done | p0-01 | Use-case admin **trong `worker-core`** (`list-workers-health`, `set-worker-enabled` + audit) + labels ở package + route mỏng + trang `/system/workers` (Pattern A, không leak `WorkerLockRepository` ra app, không hardcode label/ngưỡng, `calcRelativeTime`, confirm dialog, sort trong render) + sidebar nhóm "Hệ thống". **Quyền toggle = `Staff+`** (quyết định 03/08/2026 — Staff cần quản lý worker; mọi lần đổi ĐÃ ghi audit log truy vết). FE bỏ gate role (`canToggle`/`useSession`) — Switch chỉ disable khi mutation chạy. Verify: app không import repo, không Pattern B, worker Lambda không kéo `next`; `check-types` backoffice + worker-keno = pass. |

Status: ⏳ pending · 🔨 in-progress · ✅ done · ⏸️ blocked.

## Kết quả review (03/08/2026)

Toàn bộ 3 plan đã implement đúng đặc tả và tuân các nguyên tắc chung. Chi tiết:

- **Chất lượng cao, bám sát plan:** JSDoc đầy đủ class/method/field, const-as-const, curly, import
  đầu file, `$set` (không `$setOnInsert`) cho `description`/`kind`, mapper `satisfies` tường minh,
  "0 DB call thêm" (flush ghép `finalizeAndRelease`), derive state ở server, không leak `ownerToken`.
- **Khác biệt so với plan (đều là cải tiến, không phải regression):**
  1. Method đổi tên `recordItemFailure`/`clearItemFailure` → `recordStalledItem`/`clearStalledItem`
     (nhất quán toàn bộ caller + JSDoc).
  2. `kind` chọn **required** + backfill DB thủ công thay vì optional + `$in:[null]` — nhất quán
     entity/mapper/repo/JSDoc, đơn giản hơn, và loại bỏ rủi ro filter sót doc cũ.
  3. TTL business lock (`idx_acquiredAt_ttl_business`) làm luôn — giải "nợ vận hành" §Nợ trong đợt này.
- **Quyền toggle worker (quyết định 03/08/2026):** PATCH `/api/system/workers/enabled` = `CompanyRole.Staff`
  (không phải `Admin`). Staff cần được quản lý worker, và mọi lần toggle ĐÃ ghi audit log (ai/lúc nào/
  before-after) nên vẫn truy vết đầy đủ. FE gỡ gate role (`canToggle`/`useSession`) — Switch chỉ disable
  khi mutation chạy. Route vẫn chặn ở server bằng `.auth`, không dựa ẩn UI.
- **Verify đã chạy:** `check-types` pass cho worker-core, game-keno, game-keno-application,
  tenant-dispatch, backoffice, worker-keno. Grep sạch: `worker_stuck`=0 trong code, app không
  import `WorkerLockRepository`, không Pattern B, label/ngưỡng không hardcode ở FE.
- **Chưa chạy (cần môi trường DB/deploy):** smoke test §4.4 của từng plan — đặc biệt bước xác nhận
  `$set` propagate `description` (bẫy `$setOnInsert`). `kind` là **required** và **DB đã được cập nhật
  (backfill) bên ngoài** (xác nhận 03/08/2026) nên `listByKind` filter `{ kind }` thuần chạy đúng; index
  `lockKey_unique` + `idx_acquiredAt_ttl_business` vẫn cần tạo thủ công qua Compass/mongosh trước deploy.

## Thứ tự phụ thuộc

```
p0-01 (worker-core: field + 2 method + flush)
  ├──► p0-02 (Keno gọi 2 method mới, xoá alert cũ)  ← BẮT BUỘC sau p0-01
  └──► p1-01 (trang BO đọc stalledItems)            ← đọc được sau p0-01
```

Khuyến nghị merge: **p0-01 → p0-02 → p1-01**.

Vì sao p1-01 nên sau p0-02 (dù chỉ cần p0-01): nếu trang BO lên trước khi Keno bỏ `worker_stuck`, hệ
thống có **2 kênh tín hiệu song song** cho cùng 1 sự cố (badge đỏ trang Operations + dòng đỏ trang
Workers) — staff không biết kênh nào là nguồn thật, và defect D1 (badge đỏ vĩnh viễn, analysis §3) vẫn
còn hiệu lực trong giai đoạn giữa.

Nếu buộc phải đảo (trang BO gấp hơn): chấp nhận giai đoạn giữa, nhưng PR p0-02 phải theo **trong cùng
sprint** — không để 2 kênh sống chung quá 1 tuần.

## Nguyên tắc chung (áp cho MỌI plan trong thư mục)

1. **Ranh giới `ops_alerts` vs `worker_locks`** (analysis §5.1) là luật, không phải gợi ý: tín hiệu
   *tự hết khi hệ thống hồi phục* và *không thuộc 1 kỳ quay* → thuộc `worker_locks`. KHÔNG được thêm
   member alert type mới cho sức khoẻ worker ở bất kỳ game nào.
2. **KHÔNG tác động tự động** (tiền lệ `RETRY_ALERT_THRESHOLD`, analysis §4): ngưỡng chỉ để BO filter.
   Không dừng worker, không đổi hành vi retry, không skip item vì `failCount` cao — 1 kỳ bẩn không
   được phép làm dừng cập nhật các kỳ còn lại (K7 của keno analysis §3).
3. **0 DB call thêm** là ràng buộc thiết kế, không phải tối ưu tuỳ chọn: `recordItemFailure` /
   `clearItemFailure` chỉ đụng RAM; mọi ghi DB ghép vào `finalizeAndRelease` sẵn có. PR thêm bất kỳ
   `updateOne` mới trong đường lỗi = red flag khi review.
4. **Không throw từ đường tín hiệu**: 2 method mới không có I/O nên không thể throw ⇒ caller KHÔNG bọc
   try/catch. Đây là điểm sửa được defect #2/#3 trong bảng review của
   `keno-ops-risk-control/stats-worker-simplification/00-overview.md`.
5. **`worker-core` được có use-case admin, KHÔNG được leak repo ra app** (SỬA 03/08 — bản đầu của
   nguyên tắc này nói ngược lại và **sai**). Use-case cho route BO đặt **trong `worker-core`**
   (`use-cases/admin/`, subpath export riêng), app chỉ có route ~20 dòng. Tiền lệ:
   `packages/tenant-dispatch` — package worker, dep `@megawin/next`, có 8 `NextApiUseCase` ở
   `use-cases/admin`. Lý do: use-case ở app buộc `apps/backoffice` import `WorkerLockRepository` ⇒ leak
   `ownerToken`/`expiresAt`, đúng điều `lock/distributed-mutex.ts:29-31` đã phê phán (analysis §5.5.1).
6. **`worker_locks` có 2 loại doc — mọi query phải phân biệt** (analysis §2.4): `kind: "worker"` (lock
   worker, `lockKey` tĩnh, sống vĩnh viễn) vs `kind: "business"` (`DistributedMutex`, `lockKey`
   động per-resource, tăng theo nghiệp vụ). Query cho UI/health **luôn** filter `kind`, và với `Worker`
   phải `$in: [Worker, null]` để không bỏ sót doc cũ thiếu field.
7. **`description` là của CODE, không phải dữ liệu vận hành**: worker tự khai qua
   `protected readonly description`; ghi DB bằng `$set` (KHÔNG `$setOnInsert`) để sửa text là propagate.
   Không có đường sửa từ UI — nếu không, DB và code sẽ lệch nhau.
8. **MongoDB — 4 điểm chốt** (`mongodb.mdc`, chi tiết p0-01 §2.8):
   - `stalledItems` là mảng nhúng **bounded bằng CODE** (`MAX_STALLED_ITEMS = 20`) — đó là điều kiện duy
     nhất khiến nó không vi phạm §8.1 "KHÔNG mảng object không trần". Nâng cap = phải tính lại doc size.
   - Không query nào được filter/sort theo `stalledItems.*` (§8.2). Lọc "worker đáng chú ý" làm ở client.
   - Route **chỉ** gọi Use Case; `apps/backoffice` **không** được import `WorkerLockRepository` (§4/§10).
   - Field cấp 1 (`description`/`kind`/`stalledItems`) viết object literal — **không** bọc `docPath`
     (§1.2). `docPath` chỉ cho path lồng.
9. **UI theo tiền lệ thật, không theo trí nhớ** (chi tiết p1-01 §2.5): bảng dùng **Pattern A** (`Table`
   thuần như `audit-logs`/`dispatch`), KHÔNG `DataTable`/TanStack (kéo theo text tiếng Anh hardcode);
   fetch bằng `apiClient` + React Query với queryKey ở `src/lib/query-keys/`; label/badge variant khai
   ở **package** (`worker-core/src/shared/labels/`) chứ không trong component; thời gian tương đối dùng
   `calcRelativeTime` có sẵn — **không** thêm lib.
10. **Hành động phá hoại phải có confirm + chặn ở server**: toggle kill-switch đi qua `AlertDialog`
    (Switch chỉ mở dialog, không mutate), và route tự kiểm role (`Staff+`) — ẩn UI **không phải** phân
    quyền. Staff được toggle (quyết định 03/08/2026) vì mọi lần đổi ĐÃ ghi audit log truy vết.
11. Tuân `code-quality-standards.mdc` (§5.3 const-as-const, §6 curly, §7 import đầu file, JSDoc cho
    class/method/field), `frontend-dev.mdc`, `web-design-guidelines`, plans README.
12. **Verify tối thiểu mỗi plan:** `pnpm --filter <package> check-types` cho MỌI package chạm tới +
    grep dead code/import sót + mục "Review & rủi ro" của chính plan đó.

## Định nghĩa "Done" cho toàn bộ thư mục

- `SingleRunWorker` có `recordItemFailure`/`clearItemFailure`; `stalledItems` persist **qua các
  invocation** (khác bản cũ chỉ đếm trong 1 invocation — analysis §3 D4), tự rỗng khi item hồi phục.
- Không còn `worker_stuck` ở bất kỳ đâu: grep `worker_stuck|WorkerStuck` toàn repo chỉ còn trong
  analysis/plan (tài liệu lịch sử), 0 kết quả trong `packages/`+`apps/`.
- 3 game chưa port (bingo18/max3d/max3dpro) **không phải** thêm member alert type nào cho việc này —
  port guide đã ghi rõ dùng base class.
- Trang `/system/workers` hiển thị đủ 9 worker: trạng thái Idle/Running/Crashed, tuổi `lastSuccessAt`,
  `lastError`, `stalledItems`, toggle `isEnabled`; **không** lẫn doc `kind: business`.
- Mỗi worker Keno hiện **mô tả tiếng Việt** thay vì chỉ `lockKey`; sửa mô tả trong code → deploy → doc
  đổi theo (chứng minh dùng `$set`).
- Sự cố kẹt rồi tự khỏi ⇒ tín hiệu **tự tắt**, không staff nào phải ack (giải D1 tận gốc).

## Nợ vận hành mở ra — ✅ ĐÃ GIẢI (không còn nợ)

**Nợ gốc:** doc `kind: business` không bao giờ được xoá (`release()` chỉ set `ownerToken = null`),
mỗi kỳ resettle sinh 1 doc rác vĩnh viễn, 7 game. Phát hiện lúc rà `kind` — analysis §2.4 hệ quả 2.

**Đã giải trong đợt này** (khác plan gốc — plan để đây làm nợ mở): `packages/worker-core/src/indexes/index.ts`
đã có TTL index `idx_acquiredAt_ttl_business`:

```js
{
  key: { acquiredAt: 1 },
  name: "idx_acquiredAt_ttl_business",
  expireAfterSeconds: 7 * 24 * 60 * 60,
  partialFilterExpression: { kind: "business" },
}
```

Hai quyết định đúng đã ghi trong JSDoc file: (1) `partialFilterExpression: { kind: "business" }`
BẮT BUỘC — không có nó TTL xoá nhầm doc worker lúc idle > 7 ngày, mất `cursor`/`isEnabled`/`stalledItems`;
(2) anchor `acquiredAt` (KHÔNG `expiresAt`) — `expiresAt` là lock-expiry ngắn hạn (vài trăm giây),
TTL theo nó sẽ xoá doc gần như ngay sau release, không còn thời gian audit `lastError` khi op fail.

**Còn phải làm khi deploy** (thao tác DBA, không phải code): tạo 2 index này THỦ CÔNG qua
Compass/mongosh (`mongodb.mdc` §7.4 — repo không có script tự chạy `createIndex`; file `indexes/`
chỉ là source of truth), gồm cả `lockKey_unique`. Đồng thời chạy migration backfill `kind` cho doc
cũ (xem ghi chú p0-01 — `kind` đã đổi sang required).

## Sau khi hoàn thành

- Cập nhật bảng "Plans phái sinh" trong `.cursor/analysis/system-worker-health.analysis.md`.
- Cập nhật `.cursor/plans/keno-ops-risk-control/stats-worker-simplification/00-overview.md`: defect #5
  (`enabled[worker_stuck]`) chuyển sang "đã giải quyết bằng system-worker-health p0-02".
- Xác nhận `p2-01-port-guide-bingo18-max3d-max3dpro.md` đã bỏ `worker_stuck` khỏi checklist port trước
  khi bất kỳ game nào bắt đầu port.
