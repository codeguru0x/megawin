# Re-settle Plan — Thiết kế chức năng resettle cho các game

## Tiền đề

Plan này là **Giai đoạn 2** nối tiếp `tenant_dispatch_migration.plan.md` (Giai đoạn 1).

Điều kiện tiên quyết:

- Tất cả 7 game (Keno + 6 game còn lại) đã migrate xong outbox pattern — xem `tenant_dispatch_migration.plan.md`.
- `payoutTx?: string` đã có sẵn trên `EntryPayout` của mọi game, làm idempotency seed cho payout dispatch.
- `@megawin/tenant-dispatch` đã có `buildReversalOrder`, `DispatchSourceKind.Reversal`, logic `sequence` + `$lookup blockingPrev` trong worker.

Plan này cung cấp thiết kế nhất quán cho 7 game.

---

## Bối cảnh & ràng buộc

Re-settle xảy ra khi **admin phát hiện draw result cũ sai** (nhập nhầm số quay, API tenant cung cấp kết quả sai...) và cần:

1. Thu hồi payout đã trả cho player trúng nhầm (`debit + adjustment + force=true` — `force` vì player có thể đã rút tiền).
2. Trả lại payout đúng dựa trên kết quả mới.

Yêu cầu nghiệp vụ:

- **Net tiền phải đúng tuyệt đối** sau khi tất cả orders dispatched xong.
- **Không gửi trùng 1 transaction** sang tenant dù worker crash-retry bất kỳ lúc nào.
- **Audit trail đầy đủ**: mọi giao dịch đều có record trong `tenant_dispatch_orders`, tra được từ entry qua `(gameId, sourceKind, sourceId)` index.
- **Không cần lịch sử resettle trên entity entry** — toàn bộ lịch sử đã có ở outbox. Entity chỉ giữ tx của **đời hiện hành + reversal gần nhất**.

---

## Nguyên lý idempotency (đọc kỹ trước khi implement)

1. **Mỗi direction tiền (debit/credit) = 1 tx riêng**. Reversal (debit) và payout mới (credit) là 2 giao dịch độc lập gửi tenant → 2 tx khác nhau. Dùng chung tx = tenant coi giao dịch thứ 2 là duplicate → mất tiền.
2. **Mọi tx phải được snapshot atomic trên entry trước khi enqueue**. Sinh `generateId()` trong enqueue handler = mất idempotency (retry sinh tx mới → outbox unique index không bảo vệ).
3. **Atomic swap là mấu chốt resettle**: 1 `updateOne` MongoDB ghi đồng thời toàn bộ field mới (`reversalTx`, `reversalAmount`, `payoutTx` mới, `payoutAmount` mới). Crash ở bất kỳ đâu sau update → retry đọc lại entry → cùng tx → unique index `{tx:1}` skip duplicate.
4. **`reversalAmount` bắt buộc đi cùng `reversalTx`**. Không thể thay bằng cross-DB lookup (`entries` ở `megawin-<game>` vs orders ở `megawin-tenant`, thêm 5000 round-trip mỗi batch). Self-contained snapshot là clean nhất.
5. **Không cần `settleVersion` / `resettleHistory[]`** — audit trail đã có đủ ở outbox, tra qua `listBySource({ gameId, sourceKind, sourceId })`.

---

## Schema change — mở rộng `EntryPayout`

Áp cho mọi game có `EntryPayout` (7 game):

```ts
export interface EntryPayout {
  winAmount: number;
  payoutAmount: number;
  boardPayouts: EntryBoardPayout[];
  settledAt: Date;

  /**
   * Idempotency key payout đời hiện hành — UUIDv7 (RFC 9562).
   *
   * Lifecycle:
   * - Settle lần đầu: sinh UUIDv7 mới (trong `settle-entries` của từng game).
   * - Resettle: overwrite bằng UUIDv7 mới atomic cùng `reversalTx` + `reversalAmount` snapshot giá trị cũ.
   *   Giá trị cũ đã được record trong `tenant_dispatch_orders` — không mất.
   * - Resettle → Loss: unset field này.
   */
  payoutTx?: string;

  /**
   * Idempotency key cho REVERSAL order — chỉ có sau lần resettle gần nhất.
   *
   * Sinh atomic cùng `reversalAmount` + `payoutTx` mới tại resettle time.
   * `EnqueueDispatchReversals` đọc field này → seed vào `TenantDispatchOrderDoc.tx`.
   *
   * Giá trị giữ nguyên sau khi reversal dispatched — không xoá, dùng audit.
   * Khi resettle lần tiếp theo: overwrite bằng UUIDv7 mới (giá trị cũ đã được
   * outbox record lại, không mất).
   */
  reversalTx?: string;

  /**
   * Số tiền cần thu hồi = `payoutAmount` TRƯỚC lần resettle gần nhất.
   *
   * Snapshot atomic tại resettle time. `EnqueueDispatchReversals` đọc để build
   * `buildReversalOrder({ amount: reversalAmount, ... })`.
   *
   * Invariant: `reversalTx != null` ⇒ `reversalAmount != null && reversalAmount > 0`.
   */
  reversalAmount?: number;
}
```

Việc cập nhật JSDoc `payoutTx` để ghi chú lifecycle resettle đã được làm sẵn ở Giai đoạn 1 (xem `packages/game-keno/src/entities/entry.ts` làm template).

---

## Use case resettle — flow 3 bước chuẩn

Mỗi game tạo `ResettleEntriesBatchUseCase` và `EnqueueDispatchResettleOrdersUseCase` (hoặc tách 2 use case cho reversal + payout mới — xem Step Function ở dưới).

### Step 1 — Preflight guard

Tránh resettle chồng lên resettle đang in-flight. Check ở tầng batch:

```ts
// ResettleDrawUseCase — use case wrapper, chạy ở ngoài Step Function hoặc step đầu tiên
const existingResettlesPending = await dispatchOrderRepo.countPendingByFilter({
  gameId,
  "sourceContext.drawId": drawId,
  sourceKind: { $in: [DispatchSourceKind.Reversal, DispatchSourceKind.Payout] },
  "sourceContext.resettleId": { $exists: true },  // chỉ xét orders từ resettle cũ
  status: DispatchOrderStatus.Pending,
});

if (existingResettlesPending > 0) {
  throw new ConflictError(
    `Draw ${drawId} còn ${existingResettlesPending} resettle orders pending — chờ worker dispatch xong hoặc cancel trước khi resettle lại.`,
  );
}
```

(Method `countPendingByFilter` có thể thêm vào `DispatchOrderRepository` nếu chưa có, hoặc dùng `aggregateBatchProgress(prevBatchKey)` nếu batchKey cũ còn biết. Khuyến nghị: lưu `batchKey` resettle cũ ở `draw.resettle.lastBatchKey` để tra nhanh.)

### Step 2 — Recompute + atomic swap per entry

Mỗi entry của draw (cả Win cũ và Loss cũ đều phải xét — vì resettle có thể đảo chiều):

```ts
// Pseudocode cho ResettleEntriesBatchUseCase
for each entry of draw:
  oldPayoutAmount = entry.payout?.payoutAmount ?? 0
  oldPayoutTx     = entry.payout?.payoutTx
  newPayoutAmount, newBoardPayouts = recompute(entry, correctedResult)

  $set: {}
  $unset: {}

  if (oldPayoutAmount > 0 && oldPayoutTx):
    // Từng trả payout → cần reversal
    $set["payout.reversalTx"]     = generateId()
    $set["payout.reversalAmount"] = oldPayoutAmount
  else:
    // Chưa từng trả → không cần reversal, clear field cũ (nếu resettle trước đó để lại)
    $unset["payout.reversalTx"]     = ""
    $unset["payout.reversalAmount"] = ""

  $set["payout.payoutAmount"] = newPayoutAmount
  $set["payout.boardPayouts"] = newBoardPayouts
  $set["payout.settledAt"]    = now

  if (newPayoutAmount > 0):
    $set["payout.payoutTx"] = generateId()
  else:
    $unset["payout.payoutTx"] = ""

  $set["outcome"] = newPayoutAmount > 0 ? Win : Loss

  bulkOps.push(updateOne({ _id: entry._id }, { $set, $unset }))
```

Bulk write atomic — toàn bộ field được ghi cùng 1 lần. Crash ở bất kỳ đâu sau update → retry đọc entry → cùng `reversalTx` / `payoutTx` → idempotent.

**Case analysis:**

| Trước resettle | Sau resettle | reversalTx | payoutTx mới | Số order enqueue |
|----------------|--------------|------------|--------------|------------------|
| Win (100k)     | Win (200k)   | có         | có           | 2 (reversal + payout) |
| Win (100k)     | Loss (0)     | có         | unset        | 1 (reversal)     |
| Loss (0)       | Win (150k)   | unset      | có           | 1 (payout)       |
| Loss (0)       | Loss (0)     | unset      | unset        | 0 (skip)         |

### Step 3 — Enqueue 2 loại orders cùng `batchKey` với `sequence` khác nhau

```ts
// EnqueueDispatchResettleOrdersUseCase (Keno example)
const batchKey = `keno:resettle:${drawId}:${resettleId}`;
// resettleId = UUIDv7 sinh 1 lần mỗi resettle session (lưu ở draw doc hoặc step function input).
// Mỗi resettle session có batchKey khác nhau → tránh conflict giữa các lần resettle.

// 3a. Reversal orders (sequence = 0)
const reversalEntries = await entryRepo.getEntriesWithReversalForDispatch(drawId, LIMIT);
const reversalOrders = reversalEntries.map((e) =>
  buildReversalOrder({
    tx:            e.reversalTx,        // từ entry — idempotent
    amount:        e.reversalAmount,    // từ entry
    tenantId:      e.tenantId,
    accountId:     e.accountId,
    username:      e.username,
    gameId:        GameProduct.Keno,
    roundIds:      [drawId],
    description:   `Thu hồi Keno kỳ ${drawId} (resettle)`,
    metadata:      { entryId: e.id, ticketNo: e.ticketNo, reason: "payoutReversal" },
    sourceId:      e.id,
    sourceContext: { drawId, resettleId, kind: "reversal" },
    batchKey,
    sequence:      0,
  }),
);

// 3b. Payout mới (sequence = 1) — chỉ entry thắng ở đời hiện hành
const newPayoutEntries = await entryRepo.getWinningEntriesForDispatch(drawId, LIMIT);
const payoutOrders = newPayoutEntries.map((e) =>
  buildPayoutOrder({
    tx:            e.payoutTx,
    amount:        e.payoutAmount,
    tenantId:      e.tenantId,
    accountId:     e.accountId,
    username:      e.username,
    gameId:        GameProduct.Keno,
    roundIds:      [drawId],
    description:   `Trả thưởng Keno kỳ ${drawId} (resettle)`,
    metadata:      { entryId: e.id, ticketNo: e.ticketNo },
    sourceId:      e.id,
    sourceContext: { drawId, resettleId, kind: "payout" },
    batchKey,
    sequence:      1,
  }),
);

await enqueueDispatchOrdersUseCase.run({ orders: [...reversalOrders, ...payoutOrders] });
```

Worker `worker-tenant-dispatch` đã có sẵn logic `$lookup blockingPrev` — reversal `sequence=0` phải dispatched hết mới cho payout `sequence=1` đi. Không cần sửa worker.

---

## Entry repo — method mới cho resettle

Mỗi `packages/game-<name>-application/src/infras/repos/entry-repo.ts` thêm:

```ts
/**
 * Entries của `drawId` có reversal cần enqueue (đã qua atomic swap ở ResettleEntriesBatch).
 *
 * Filter: `{ drawId, "payout.reversalTx": { $exists: true }, "payout.reversalAmount": { $gt: 0 } }`.
 * Projection minimal cho builder: `{ id, tenantId, accountId, username, ticketNo, reversalTx, reversalAmount }`.
 *
 * IDEMPOTENT với retry: cùng filter → cùng entries → cùng reversalTx → unique index
 * `{ tx: 1 }` trong outbox skip duplicate.
 */
getEntriesWithReversalForDispatch(drawId: string, limit: number): Promise<EntryWithReversalForDispatch[]>
```

Type interface tương ứng trong `infras/repos/types/entry.types.ts`:

```ts
export interface EntryWithReversalForDispatch {
  id: string;
  tenantId: string;
  accountId: string;
  username: string;
  ticketNo: string;
  reversalTx: string;
  reversalAmount: number;
}
```

`getWinningEntriesForDispatch` hiện tại **không cần sửa** — nó đã filter `"payout.payoutTx": { $exists: true } && payoutAmount > 0`. Sau resettle:

- `payoutTx` được overwrite bằng UUID mới → entry match filter → enqueue payout order với tx mới.
- Nếu resettle Win → Loss → `payoutTx` đã unset → entry không match → skip (đúng).

`bulkEnqueue` idempotent ở `{ tx: 1 }` level — `payoutTx` mới nên insert mới, không conflict với payout cũ.

---

## Step Function `resettle` — high-level

Giống `settle` nhưng khác vài bước:

| Step | Tên | Vai trò |
|------|-----|---------|
| 1 | `PreflightCheck` | Check không có resettle pending cho draw này. Fail → ConflictError → abort. |
| 2 | `PatchDrawResult` | Cập nhật result mới vào draw doc (nếu chưa làm ở admin action). |
| 3 | `ResettleEntriesBatch` (loop) | Recompute + atomic swap như Step 2 ở trên. Loop đến khi done. |
| 4 | `EnqueueResettleOrders` | Enqueue reversal + payout mới cùng batchKey. End: true. Catch → EnqueueFailed. |
| 5 | `EnqueueFailed` | Pass state, log cho admin retry qua BO. |

**Khuyến nghị gộp 4 thành 1 step** (thay vì 2 step reversal/payout riêng) để đảm bảo 2 loại orders vào outbox **cùng lúc** — tránh worker dispatch payout mới trước khi reversal được seed (nếu tách sẽ có khoảng thời gian giữa 2 step).

Với game có jackpot (Lotto535, Mega645, Power655): step `PatchJackpotPrize` + `ApplySplitBonuses` trong settle cần thiết kế lại khi resettle:

- Resettle có thể làm thay đổi winner jackpot → phải recompute jackpot cycle.
- Phức tạp hơn — chi tiết để lại khi implement cho từng game. Plan này chỉ cover flow đơn giản không-jackpot.

---

## Backoffice UI

- `apps/backoffice/src/app/(main)/games/<game>/reports/resettle/` — page hiển thị draws được resettle, filter theo date/batchKey.
- API endpoints hiện có trong `apps/backoffice/src/app/api/tenant-dispatch/` (`batch-progress`, `orders`, `retry-batch`, `cancel-order`) đủ để monitor. Thêm filter `batchKey` prefix `<game>:resettle:` nếu muốn view riêng.
- **Dry-run mode**: trước khi bấm nút "Resettle", BO phải hiển thị preview diff (entries nào thay đổi, từ amount nào → amount nào, tổng reversal amount, tổng payout mới) để admin confirm.
- Cảnh báo admin khi preflight guard fail: "Draw này còn resettle orders pending, chờ hoặc force cancel".

---

## Testing checklist

### Unit test `ResettleEntriesBatchUseCase`

- Win → Win (amount tăng / giảm / không đổi).
- Win → Loss.
- Loss → Win.
- Loss → Loss (no-op — skip entry).
- Crash giữa atomic swap → retry → cùng `reversalTx` / `payoutTx`.

### Integration test flow đầy đủ

1. Settle → dispatch A1 (100k).
2. Resettle lần 1 → swap + enqueue R1 (100k) + A2 (200k).
3. Verify worker dispatch R1 trước A2 (nhờ sequence).
4. Resettle tiếp khi R1+A2 chưa dispatched → `ConflictError` (preflight guard).
5. Resettle tiếp khi R1+A2 đã dispatched → enqueue R2 (200k) + A3 (150k) thành công.

### E2E với tenant mock

- Verify 6 transactions đều idempotent (duplicate `tx` bị skip).
- Player balance net đúng sau tất cả dispatched.

---

## Rủi ro & mitigations

| Rủi ro | Mitigation |
|--------|------------|
| Admin resettle lần 2 khi batch 1 chưa dispatched → orders thừa trong outbox | Preflight guard ở Step 1 — từ chối request |
| Crash giữa atomic swap và enqueue → orphan `reversalTx` trên entry chưa có order trong outbox | Handler retry sẽ đọc lại + enqueue — idempotent qua `{ tx: 1 }` unique |
| Recompute logic sai → số tiền resettle sai | Bắt buộc dry-run trước: compute diff vs original, BO hiển thị, admin confirm |
| Player đã rút tiền → reversal debit thất bại | `force=true` trong `buildReversalOrder` — tenant cho phép balance âm, audit trail đầy đủ |
| Reversal dispatched nhưng payout mới fail vĩnh viễn (MAX_RETRY) | Admin retry qua `RetryBatchUseCase`; nếu infeasible → manual settlement + ghi adjustment thủ công |
| Resettle làm đổi winner jackpot (Lotto535/Mega645/Power655) | Bonus cần phase riêng `RecomputeJackpot` trước `ResettleEntriesBatch` — implement sau per-game |

---

## Deliverables (per game)

- Schema: `EntryPayout` thêm `reversalTx?` + `reversalAmount?`.
- Entry repo: thêm `getEntriesWithReversalForDispatch`.
- Types: thêm `EntryWithReversalForDispatch` trong `infras/repos/types/entry.types.ts`.
- Use cases (application layer):
  - `ResettleEntriesBatchUseCase` — recompute + atomic swap.
  - `EnqueueDispatchResettleOrdersUseCase` — enqueue reversal + payout mới cùng batchKey.
  - `PreflightResettleCheckUseCase` (optional) — check pending resettle orders.
- Step Function `resettle`: 5 bước (PreflightCheck, PatchDrawResult, ResettleEntriesBatch loop, EnqueueResettleOrders, EnqueueFailed).
- Handlers: `handlers/resettle/resettle-entries.ts`, `handlers/resettle/enqueue-resettle-orders.ts`.
- `functions/resettle.yml`: thêm 2-3 lambda mới.
- BO UI: trang resettle + API integration + dry-run preview.
- Rules: cập nhật `.cursor/rules/<game>-game-rules.mdc` mô tả resettle flow.

Không cần sửa gì trong `@megawin/tenant-dispatch` hoặc `apps/worker-tenant-dispatch` — builders + sequence logic đã đủ. Riêng `DispatchOrderRepository` có thể thêm helper `countPendingByFilter` nếu preflight check cần.

---

## Thứ tự triển khai khuyến nghị

1. Keno làm pilot (vì đã là pilot của Giai đoạn 1).
2. Các game không jackpot (Bingo18, Max3D, Max3DPro).
3. Các game có jackpot (Lotto535, Mega645, Power655) — cần thiết kế thêm `RecomputeJackpot` step.
