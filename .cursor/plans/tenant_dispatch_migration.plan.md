# Tenant Dispatch Migration — Áp dụng outbox pattern cho 6 game còn lại

## Mục tiêu

Thay thế cơ chế dispatch payout/refund nội bộ trong từng game (lưu `payoutStatus`/`refundStatus` trên `entry`, loop trong Step Function) bằng **outbox pattern trung tâm**:

- Mọi dispatch order ghi vào `megawin-tenant.tenant_dispatch_orders`.
- Worker `apps/worker-tenant-dispatch` (EventBridge `rate(1 minute)`) polling, gọi `TenantGateway.batchTransaction` với retry + exponential backoff + jitter.
- Game worker chỉ còn 1 bước duy nhất: `EnqueueDispatchPayouts` / `EnqueueDispatchRefunds` — bulk insert rồi return ngay (không chờ tenant).

Keno đã migrate xong, đóng vai trò **pilot** + reference implementation. Plan này áp dụng y chang cho 6 game còn lại.

## Phạm vi game

| Game     | GameProduct    | Có jackpot | Ghi chú đặc thù                                   |
|----------|---------------|------------|---------------------------------------------------|
| Bingo18  | `bingo18`     | Không      | Structure gần nhất với Keno                       |
| Max3D    | `max3d`       | Không      | Pattern giống hệt Keno                            |
| Max3DPro | `max3dpro`    | Không      | Pattern giống hệt Keno                            |
| Lotto535 | `lotto535`    | Có         | `patch-jackpot-prize`, `apply-split-bonuses` vẫn giữ nguyên — không liên quan dispatch |
| Mega645  | `mega645`     | Có         | `patch-jackpot-prize` vẫn giữ nguyên              |
| Power655 | `power655`    | Có         | `patch-jackpot-prize` vẫn giữ nguyên              |

Jackpot không ảnh hưởng plan — `payoutTx` đã có trên entry (sinh ở `settle-entries`), `dispatch-payout` cũ đọc field này. Migration chỉ thay hướng flow: thay vì loop dispatch trực tiếp, bulk enqueue vào outbox.

## Rules bắt buộc (reference Keno implementation)

Tuân thủ nghiêm ngặt các rule dưới đây cho TẤT CẢ 6 game, không được sai khác:

### R1. Schema Entry

- GIỮ `payoutTx?: string` trong `EntryPayout` — vẫn là idempotency seed, sinh tại settle time.
- GIỮ `refundTx: string` (required) trong `EntryVoidInfo` — sinh tại void time, mọi entry bị void đều phát sinh refund.
- XOÁ các field dispatch-status khỏi entity doc:
  - Khỏi `EntryPayout`: `payoutStatus`, `payoutDispatchedAt`, `payoutRetryCount`, `payoutLastError`.
  - Khỏi `EntryVoidInfo`: `refundStatus`, `refundedAt` (nếu có).
- Comment JSDoc cho `payoutTx` / `refundTx` giải thích rõ: "Trạng thái dispatch lưu tại `tenant_dispatch_orders` — KHÔNG còn lưu trên entry."
- JSDoc `payoutTx` nêu thêm **lifecycle resettle** (dự phòng Giai đoạn 2): "Resettle sẽ overwrite field này bằng UUIDv7 mới atomic cùng `reversalTx` + `reversalAmount` snapshot giá trị cũ. Giá trị cũ đã được record trong `tenant_dispatch_orders` — không mất."
- **KHÔNG thêm** `reversalTx` / `reversalAmount` ở Giai đoạn 1 — để Giai đoạn 2 (Re-settle) thêm cùng lúc với use case resettle để tránh schema mới mà chưa có code dùng.

### R2. Enums

- XOÁ `PayoutStatus` và `RefundStatus` trong `packages/game-<name>/src/entities/enums.ts`. Kiểm tra các `export *` / imports để bỏ reference.

### R3. Settle/Void use cases

- `settle-entries.ts`: KHÔNG còn set `payoutStatus = Pending` / `payoutDispatchedAt`. Giữ nguyên logic sinh `payoutTx` UUIDv7.
- `void-entries.ts`: KHÔNG còn set `refundStatus = Pending`. Giữ nguyên logic sinh `refundTx` UUIDv7.

### R4. Entry repo

- XOÁ các dispatch-related methods:
  - `getPendingPayoutEntries`, `countPendingPayoutEntries`, `batchMarkPayoutDispatched`, `batchMarkPayoutFailed`.
  - `getPendingRefundEntries`, `markRefundDispatched`, `markRefundFailed`.
- THÊM 2 method mới (shape giống Keno):
  - `getWinningEntriesForDispatch(drawId: string, limit: number): Promise<WinningEntryForDispatch[]>` — projection chỉ fields cần cho outbox.
  - `getVoidedEntriesForDispatch(drawId: string, limit: number): Promise<VoidedEntryForDispatch[]>`.
- TÁCH types vào `infras/repos/types/entry.types.ts`, export qua `infras/repos/types/index.ts`.
- XOÁ imports `PayoutStatus` / `RefundStatus`.

### R5. Application use cases

- TẠO `use-cases/settle/enqueue-dispatch-payouts.ts` — `EnqueueDispatchPayoutsUseCase extends InternalUseCase`.
- TẠO `use-cases/void/enqueue-dispatch-refunds.ts` — `EnqueueDispatchRefundsUseCase extends InternalUseCase`.
- XOÁ toàn bộ thư mục `use-cases/payout/` (gồm `dispatch-payout.ts`, `index.ts`).
- XOÁ file `use-cases/void/dispatch-refunds.ts`.
- Cập nhật `use-cases/settle/index.ts` và `use-cases/void/index.ts` exports.

### R6. Package.json

- THÊM `"@megawin/tenant-dispatch": "workspace:*"` vào `dependencies`.
- XOÁ `exports` entry cho `./use-cases/payout` (nếu có).

### R7. Step Functions ASL

- `settle.ts`: thay loop `DispatchPayouts` → `CheckPayoutDone` → `PayoutWait` → `PayoutComplete`/`PayoutFailed` bằng single state `EnqueueDispatchPayouts` (End: true) + `EnqueueFailed` Pass state trong `Catch`.
- `void.ts`: tương tự — thay loop `DispatchRefunds` → `CheckRefundDone` → ... bằng `EnqueueDispatchRefunds`.
- Sau khi sửa `.ts`, CHẠY script generator để regenerate `.asl.json` tương ứng.
- Cập nhật ASL-level comment (phần header JSDoc + inline comment).

### R8. Handlers & functions.yml

- XOÁ `handlers/settle/dispatch-payouts.ts`.
- XOÁ `handlers/void/dispatch-refunds.ts`.
- TẠO `handlers/settle/enqueue-dispatch-payouts.ts` — import `EnqueueDispatchPayoutsUseCase`, return `useCase.run({ drawId })`.
- TẠO `handlers/void/enqueue-dispatch-refunds.ts` — tương tự.
- Trong `functions/settle.yml`: xoá `settle-dispatch-payouts`, thêm `settle-enqueue-dispatch-payouts`.
- Trong `functions/void.yml`: xoá `void-dispatch-refunds`, thêm `void-enqueue-dispatch-refunds`.
- Thêm `@megawin/tenant-dispatch: "workspace:*"` vào `apps/worker-<game>/package.json`.

### R9. Backoffice void-report UI

- Trong `apps/backoffice/src/app/(main)/games/<game>/reports/void/_lib/void-content.tsx`: bỏ dòng `refundStatus: entry.voidInfo?.refundStatus` trong `mapEntryRow`. `VoidEntryRow.refundStatus` vẫn optional ở shared type nên không break.

### R10. Comments & docs

- Mọi file được tạo/sửa PHẢI có JSDoc header nêu rõ vai trò, flow đầu–cuối, mối liên hệ với outbox.
- Cập nhật các comment chéo trong `types.ts` / `build-void-report.ts` của void flow nơi nhắc đến "DispatchRefunds" — đổi sang "EnqueueDispatchRefunds" và vẽ lại flow diagram trong JSDoc.
- Cập nhật `.cursor/rules/<game>-game-rules.mdc` đoạn mô tả flow settle/void cho thống nhất với pattern mới.
- Cập nhật `apps/worker-<game>/README.md` (nếu có) — đổi bảng bước, đổi cây thư mục.

## Reference patterns từ Keno (phải copy đúng)

Khi viết code cho mỗi game, copy shape & style từ các file Keno sau. Thay `keno`/`Keno`/`KenoCollections` thành tên game tương ứng:

| Reference                                                                          | Vai trò                                |
|------------------------------------------------------------------------------------|----------------------------------------|
| `packages/game-keno-application/src/use-cases/settle/enqueue-dispatch-payouts.ts`  | Template cho `EnqueueDispatchPayoutsUseCase` |
| `packages/game-keno-application/src/use-cases/void/enqueue-dispatch-refunds.ts`    | Template cho `EnqueueDispatchRefundsUseCase` |
| `packages/game-keno-application/src/infras/repos/types/entry.types.ts`             | Template cho `WinningEntryForDispatch` + `VoidedEntryForDispatch` |
| `packages/game-keno-application/src/infras/repos/entry-repo.ts` (methods mới)      | Template cho `getWinningEntriesForDispatch` / `getVoidedEntriesForDispatch` |
| `apps/worker-keno/src/handlers/settle/enqueue-dispatch-payouts.ts`                 | Template cho settle handler            |
| `apps/worker-keno/src/handlers/void/enqueue-dispatch-refunds.ts`                   | Template cho void handler              |
| `apps/worker-keno/src/step-functions/settle.ts`                                    | Template cho settle Step Function      |
| `apps/worker-keno/src/step-functions/void.ts`                                      | Template cho void Step Function        |

## Thứ tự thực thi khuyến nghị

Migrate **từng game một**, không song song nhiều game cùng lúc. Mỗi game đi theo 10 bước dưới (xem phần chi tiết mỗi game bên dưới):

1. Cập nhật `packages/game-<name>/src/entities/entry.ts` (R1).
2. Cập nhật `packages/game-<name>/src/entities/enums.ts` (R2).
3. Cập nhật `packages/game-<name>-application/src/use-cases/settle/settle-entries.ts` và `.../void/void-entries.ts` (R3).
4. Cập nhật `packages/game-<name>-application/src/infras/repos/entry-repo.ts` + tạo `types/entry.types.ts` (R4).
5. Tạo `use-cases/settle/enqueue-dispatch-payouts.ts` + `use-cases/void/enqueue-dispatch-refunds.ts`. Xoá `use-cases/payout/` + `use-cases/void/dispatch-refunds.ts` (R5).
6. Cập nhật `package.json` của 2 package game (R6).
7. Cập nhật `apps/worker-<name>/src/step-functions/settle.ts` + `void.ts` + regenerate `.asl.json` (R7).
8. Xoá/tạo handlers + cập nhật `functions.yml` (R8).
9. Cập nhật `apps/backoffice/src/app/(main)/games/<name>/reports/void/_lib/void-content.tsx` (R9).
10. Cập nhật rules/README (R10).

Sau mỗi game: chạy `pnpm check-types` (kỳ vọng 41/41 pass). Chỉ chuyển qua game tiếp theo khi sạch.

## Verification checklist (sau mỗi game)

- `pnpm check-types` → 41/41 successful.
- `rg -n "payoutStatus|refundStatus|PayoutStatus|RefundStatus" packages/game-<name>* apps/worker-<name> apps/backoffice/src/app/\(main\)/games/<name>` → 0 match.
- `rg -n "dispatch-payouts|dispatch-refunds|DispatchPayouts|DispatchRefunds" apps/worker-<name>` → chỉ match các comment nói về state cũ đã thay (nếu có), không còn handler file thực.
- Kiểm tra thủ công `functions/settle.yml` và `functions/void.yml` — không còn `settle-dispatch-payouts` / `void-dispatch-refunds`, có `settle-enqueue-dispatch-payouts` / `void-enqueue-dispatch-refunds`.
- Kiểm tra thủ công `settle.asl.json` / `void.asl.json` — state cuối là `EnqueueDispatch*` + `EnqueueFailed`, không còn `CheckPayoutDone` / `PayoutWait`.

---

## Game 1 — Bingo 18

### Bước 1 — `packages/game-bingo18/src/entities/entry.ts`

- Imports: bỏ `PayoutStatus`, `RefundStatus` khỏi `./enums`.
- `EntryPayout`:
  - XOÁ: `payoutStatus?: PayoutStatus`, `payoutDispatchedAt?: Date`, `payoutRetryCount?: number`, `payoutLastError?: string`.
  - GIỮ `payoutTx?: string`. Cập nhật JSDoc theo mẫu Keno (xem `packages/game-keno/src/entities/entry.ts` dòng 76-88): nêu rõ `EnqueueDispatchPayouts` seed vào `TenantDispatchOrderDoc.tx` và trạng thái dispatch lưu tại `tenant_dispatch_orders`.
- `EntryVoidInfo`:
  - XOÁ: `refundStatus: RefundStatus`.
  - GIỮ `refundTx: string` (required). JSDoc nêu rõ: mọi entry void đều có refundTx, dispatch state lưu tại outbox.

### Bước 2 — `packages/game-bingo18/src/entities/enums.ts`

- XOÁ `PayoutStatus` và `RefundStatus` (cả `const` object và `type`).
- Chạy `rg "PayoutStatus|RefundStatus" packages/game-bingo18` để chắc không còn reference nội bộ.

### Bước 3 — Settle/Void use cases

**`packages/game-bingo18-application/src/use-cases/settle/settle-entries.ts`**:

- Bỏ import `PayoutStatus`.
- Trong phần build `EntryPayout` fields: bỏ `payoutStatus: PayoutStatus.Pending` (và `payoutDispatchedAt` nếu có set). GIỮ `payoutTx: generateId()` cho entry thắng.

**`packages/game-bingo18-application/src/use-cases/void/void-entries.ts`**:

- Bỏ import `RefundStatus`.
- Trong bulk void update: bỏ `refundStatus: RefundStatus.Pending`. GIỮ `refundTx: generateId()`.

### Bước 4 — Entry repo + types

**TẠO/MỞ RỘNG `packages/game-bingo18-application/src/infras/repos/types/entry.types.ts`**:

Thêm 2 interface `WinningEntryForDispatch` và `VoidedEntryForDispatch` với shape: `{ id, tenantId, accountId, username, ticketNo, payoutAmount|refundAmount, payoutTx|refundTx }`. Copy y chang từ `packages/game-keno-application/src/infras/repos/types/entry.types.ts`.

**`packages/game-bingo18-application/src/infras/repos/types/index.ts`**: export 2 interface mới.

**`packages/game-bingo18-application/src/infras/repos/entry-repo.ts`**:

- Bỏ imports `PayoutStatus`, `RefundStatus`.
- XOÁ methods: `getPendingPayoutEntries`, `countPendingPayoutEntries`, `batchMarkPayoutDispatched`, `batchMarkPayoutFailed`, `getPendingRefundEntries`, `markRefundDispatched`, `markRefundFailed`.
- THÊM 2 methods (copy từ Keno `entry-repo.ts`, giữ collection `Bingo18Collections.TicketEntries`):
  - `getWinningEntriesForDispatch(drawId, limit)` — filter `{ drawId, status: EntryStatus.Settled, "payout.payoutAmount": { $gt: 0 }, "payout.payoutTx": { $exists: true } }`, projection tối thiểu.
  - `getVoidedEntriesForDispatch(drawId, limit)` — filter `{ drawId, status: EntryStatus.Void, "voidInfo.refundTx": { $exists: true } }`.
- JSDoc phải ghi: "Thay thế `getPendingRefundEntries` cũ. Không filter theo `refundStatus` vì status đã rời khỏi entry — dispatch state lưu tại `tenant_dispatch_orders`. Idempotency qua unique `tx` ở outbox."

### Bước 5 — Application use cases

**TẠO `packages/game-bingo18-application/src/use-cases/settle/enqueue-dispatch-payouts.ts`**:

Copy từ `packages/game-keno-application/src/use-cases/settle/enqueue-dispatch-payouts.ts`, thay:
- `GameProduct.Keno` → `GameProduct.Bingo18`.
- `batchKey` prefix `"keno:"` → `"bingo18:"`.
- `description` đổi sang `` `Trả thưởng Bingo 18 kỳ ${drawId}` ``.

**TẠO `packages/game-bingo18-application/src/use-cases/void/enqueue-dispatch-refunds.ts`**:

Copy từ Keno void enqueue, thay prefix/description tương tự: `` `Hoàn tiền Bingo 18 kỳ ${drawId} (kỳ huỷ)` ``.

**XOÁ**:
- Thư mục `packages/game-bingo18-application/src/use-cases/payout/` toàn bộ.
- File `packages/game-bingo18-application/src/use-cases/void/dispatch-refunds.ts`.

**Cập nhật `use-cases/settle/index.ts`**: thêm export `EnqueueDispatchPayoutsUseCase` + types.

**Cập nhật `use-cases/void/index.ts`**:
- Thêm export `EnqueueDispatchRefundsUseCase` + types.
- Xoá `export ... from "./dispatch-refunds"`.
- Cập nhật JSDoc header của file liệt kê các use cases (nêu flow mới).

### Bước 6 — `packages/game-bingo18-application/package.json`

- Thêm `"@megawin/tenant-dispatch": "workspace:*"`.
- Xoá entry `"./use-cases/payout"` trong `exports` (nếu có).

### Bước 7 — Step Functions

**`apps/worker-bingo18/src/step-functions/settle.ts`**:

- Cập nhật JSDoc header trên cùng: đổi bullet `8. DispatchPayouts (loop)` thành `8. EnqueueDispatchPayouts (outbox)`; giải thích sau step này flow End, dispatch thực tế do `worker-tenant-dispatch` đảm nhận.
- `FinalizeSettle.Next`: đổi thành `"EnqueueDispatchPayouts"`.
- XOÁ states: `DispatchPayouts`, `CheckPayoutDone`, `PayoutWait`, `PayoutComplete`, `PayoutFailed`.
- THÊM states `EnqueueDispatchPayouts` (Task, `lambdaArn("settle-enqueue-dispatch-payouts")`, End: true, Retry + Catch → EnqueueFailed) và `EnqueueFailed` (Pass, comment giải thích settle đã hoàn tất, admin retry qua BO). Copy đúng shape từ Keno `settle.ts` cuối file.

**`apps/worker-bingo18/src/step-functions/void.ts`**:

- JSDoc header: đổi `DispatchRefunds (loop)` → `EnqueueDispatchRefunds (outbox)`.
- `FinalizeVoid.Next`: đổi thành `"EnqueueDispatchRefunds"`.
- XOÁ: `DispatchRefunds`, `CheckRefundDone`, `RefundWait`, `RefundComplete`, `RefundFailed`.
- THÊM `EnqueueDispatchRefunds` + `EnqueueFailed` copy shape từ Keno `void.ts`.

**Regenerate ASL JSON**: dùng script sẵn có của worker-bingo18 để build `settle.asl.json` + `void.asl.json`. Kiểm tra tay:
- State cuối là `EnqueueDispatchPayouts` / `EnqueueDispatchRefunds`.
- Không còn `Type: "Wait"` state nào trong flow dispatch.

### Bước 8 — Handlers & functions.yml

**XOÁ** `apps/worker-bingo18/src/handlers/settle/dispatch-payouts.ts` và `apps/worker-bingo18/src/handlers/void/dispatch-refunds.ts`.

**TẠO `apps/worker-bingo18/src/handlers/settle/enqueue-dispatch-payouts.ts`** — copy từ Keno handler, đổi import package sang `@megawin/game-bingo18-application`. JSDoc ghi rõ đây là step cuối Bingo 18 Settle, idempotent qua `tx`, dispatch thực tế do worker-tenant-dispatch đảm nhận.

**TẠO `apps/worker-bingo18/src/handlers/void/enqueue-dispatch-refunds.ts`** — tương tự.

**`apps/worker-bingo18/src/functions/settle.yml`**:
- XOÁ `settle-dispatch-payouts`.
- THÊM `settle-enqueue-dispatch-payouts` với `handler: src/handlers/settle/enqueue-dispatch-payouts.handler`, timeout 300, memory 512.

**`apps/worker-bingo18/src/functions/void.yml`**:
- XOÁ `void-dispatch-refunds`.
- THÊM `void-enqueue-dispatch-refunds`.

**`apps/worker-bingo18/package.json`**: thêm `"@megawin/tenant-dispatch": "workspace:*"` vào deps.

### Bước 9 — Backoffice

**`apps/backoffice/src/app/(main)/games/bingo18/reports/void/_lib/void-content.tsx`**:
Trong `mapEntryRow`: bỏ dòng `refundStatus: entry.voidInfo?.refundStatus`.

### Bước 10 — Rules & docs

**`.cursor/rules/bingo18-game-rules.mdc`**:
- Đổi bước cuối flow settle: `... → dispatch-payouts` → `... → enqueue-dispatch-payouts`.
- Đổi bước cuối flow void: `... → dispatch-refunds → finalize-void` → `... → finalize-void → enqueue-dispatch-refunds`.
- Thêm đoạn ngắn về Tenant Dispatch outbox pattern (giải thích outbox + worker trung tâm).

**`apps/worker-bingo18/README.md`** (nếu có): cập nhật bảng bước + cây thư mục handler.

### Verify

```bash
pnpm check-types
rg -n "payoutStatus|refundStatus|PayoutStatus|RefundStatus" packages/game-bingo18 packages/game-bingo18-application apps/worker-bingo18 apps/backoffice/src/app/\(main\)/games/bingo18
rg -n "dispatch-payouts|dispatch-refunds" apps/worker-bingo18/src apps/worker-bingo18/src/functions
```

(Tiếp: Max3D, Max3DPro, Lotto535, Mega645, Power655.)

---

## Game 2 — Max 3D

Cấu trúc settle/void hoàn toàn giống Bingo18. Lặp 10 bước với các thay đổi sau:

### File đường dẫn

- Entry: `packages/game-max3d/src/entities/entry.ts`
- Enums: `packages/game-max3d/src/entities/enums.ts`
- Settle entries: `packages/game-max3d-application/src/use-cases/settle/settle-entries.ts`
- Void entries: `packages/game-max3d-application/src/use-cases/void/void-entries.ts`
- Entry repo: `packages/game-max3d-application/src/infras/repos/entry-repo.ts`
- Types barrel: `packages/game-max3d-application/src/infras/repos/types/`
- Use cases: `packages/game-max3d-application/src/use-cases/{settle,void,payout}`
- Worker: `apps/worker-max3d/`
- BO content: `apps/backoffice/src/app/(main)/games/max3d/reports/void/_lib/void-content.tsx`
- Rule: `.cursor/rules/max3d-game-rules.mdc`

### Thay đổi khác Bingo18

- `GameProduct.Bingo18` → `GameProduct.Max3d`.
- `batchKey`: `"max3d:settle:<drawId>:payout"` / `"max3d:void:<drawId>:refund"`.
- `description`:
  - Payout: `` `Trả thưởng Max 3D kỳ ${drawId}` ``.
  - Refund: `` `Hoàn tiền Max 3D kỳ ${drawId} (kỳ huỷ)` ``.
- Collection reference: `Max3dCollections.TicketEntries` (check actual const name trong `packages/game-max3d/src/entities/enums.ts`).

### Đặc thù Max 3D cần lưu ý

- Max 3D có play types `straight`, `combo`, `plus` — ảnh hưởng shape `EntryBoardPayout` nhưng KHÔNG liên quan dispatch. Chỉ đọc `payout.payoutTx` và `payout.payoutAmount` từ entry, không đụng vào board logic.
- `settle-entries.ts`: có thể split thành nhiều step loop tuỳ implementation; kiểm tra tất cả nhánh set `payoutStatus` để xoá.

### Các bước còn lại

Theo đúng 10 bước + rules R1-R10 của Bingo18. Kết quả mong đợi:
- 2 use case mới: `EnqueueDispatchPayoutsUseCase` (Max3D), `EnqueueDispatchRefundsUseCase` (Max3D).
- 2 handler mới trong `apps/worker-max3d/src/handlers/`.
- 2 lambda function mới trong `settle.yml` + `void.yml`.
- Step Function ASL: state cuối là `EnqueueDispatchPayouts` / `EnqueueDispatchRefunds`.

### Verify

```bash
pnpm check-types
rg -n "payoutStatus|refundStatus|PayoutStatus|RefundStatus" packages/game-max3d packages/game-max3d-application apps/worker-max3d apps/backoffice/src/app/\(main\)/games/max3d
rg -n "dispatch-payouts|dispatch-refunds" apps/worker-max3d/src
```

---

## Game 3 — Max 3D Pro

Pattern giống hệt Max3D. Lặp đúng 10 bước.

### File đường dẫn

- Entry: `packages/game-max3dpro/src/entities/entry.ts`
- Enums: `packages/game-max3dpro/src/entities/enums.ts`
- Use cases: `packages/game-max3dpro-application/src/use-cases/{settle,void,payout}`
- Worker: `apps/worker-max3dpro/`
- BO content: `apps/backoffice/src/app/(main)/games/max3dpro/reports/void/_lib/void-content.tsx`
- Rule: `.cursor/rules/max3dpro-game-rules.mdc`

### Thay đổi khác Bingo18/Max3D

- `GameProduct.Max3dpro`.
- `batchKey`: `"max3dpro:settle:<drawId>:payout"` / `"max3dpro:void:<drawId>:refund"`.
- `description`:
  - Payout: `` `Trả thưởng Max 3D Pro kỳ ${drawId}` ``.
  - Refund: `` `Hoàn tiền Max 3D Pro kỳ ${drawId} (kỳ huỷ)` ``.
- Collection: `Max3dproCollections.TicketEntries` (check actual name).

### Đặc thù Max 3D Pro

- Chỉ 1 play type chính (cặp bộ ba so khớp đúng/ngược thứ tự), logic ít nhánh hơn Max3D. Payout/void logic về dispatch vẫn giống.

### Verify

```bash
pnpm check-types
rg -n "payoutStatus|refundStatus|PayoutStatus|RefundStatus" packages/game-max3dpro packages/game-max3dpro-application apps/worker-max3dpro apps/backoffice/src/app/\(main\)/games/max3dpro
rg -n "dispatch-payouts|dispatch-refunds" apps/worker-max3dpro/src
```

(Tiếp: Lotto535, Mega645, Power655.)

---

## Game 4 — Lotto 5/35

Cấu trúc settle/void phức tạp hơn (có jackpot + split cycle bonus) NHƯNG các bước liên quan dispatch vẫn giống Keno. `PatchJackpotPrize` và `ApplySplitBonuses` là 2 bước RIÊNG BIỆT trong settle flow — chúng chỉ patch `payout.payoutAmount` và `payout.payoutTx` vào entry. Sau đó mới chạy `EnqueueDispatchPayouts` (thay cho `DispatchPayouts`). Do vậy migration **không đụng** jackpot/split logic.

### File đường dẫn

- Entry: `packages/game-lotto535/src/entities/entry.ts`
- Enums: `packages/game-lotto535/src/entities/enums.ts`
- Settle entries: `packages/game-lotto535-application/src/use-cases/settle/settle-entries.ts`
- Patch jackpot: `packages/game-lotto535-application/src/use-cases/settle/patch-jackpot-prize.ts` (KHÔNG SỬA LOGIC — chỉ verify set `payoutTx` đúng như Keno).
- Apply split bonuses: `packages/game-lotto535-application/src/use-cases/settle/apply-split-bonuses.ts` (KHÔNG SỬA LOGIC — verify set `payoutTx` cho entry bonus).
- Void entries: `packages/game-lotto535-application/src/use-cases/void/void-entries.ts`
- Entry repo: `packages/game-lotto535-application/src/infras/repos/entry-repo.ts`
- Types barrel: `packages/game-lotto535-application/src/infras/repos/types/`
- Use cases: `packages/game-lotto535-application/src/use-cases/{settle,void,payout}`
- Worker: `apps/worker-lotto535/`
- BO content: `apps/backoffice/src/app/(main)/games/lotto535/reports/void/_lib/void-content.tsx`
- Rule: `.cursor/rules/lotto535-game-rules.mdc`

### Thay đổi khác Bingo18

- `GameProduct.Lotto535`.
- `batchKey`: `"lotto535:settle:<drawId>:payout"` / `"lotto535:void:<drawId>:refund"`.
- `description`:
  - Payout: `` `Trả thưởng Lotto 5/35 kỳ ${drawId}` ``.
  - Refund: `` `Hoàn tiền Lotto 5/35 kỳ ${drawId} (kỳ huỷ)` ``.

### Điều cần KIỂM TRA RIÊNG cho Lotto535

1. **`patch-jackpot-prize.ts`**: verify rằng sau khi patch jackpot amount vào entry, nó có sinh `payoutTx` cho entry jackpot winner không. Nếu CÓ — ổn. Nếu KHÔNG (vì `settle-entries` trước đó không sinh tx cho entry jackpot do amount=0), cần thêm đoạn set `payout.payoutTx = generateId()` đúng lúc patch amount > 0. `EnqueueDispatchPayouts` sẽ đọc tất cả entry có `payoutAmount > 0 && payoutTx != null` → nếu entry jackpot thiếu `payoutTx`, nó sẽ bị bỏ qua.
2. **`apply-split-bonuses.ts`**: tương tự — verify entry bonus có `payoutTx`. Cập nhật nếu cần.
3. **`settle-entries.ts`**: entry jackpot ban đầu có `payoutAmount = 0`. Logic hiện tại có thể đang `if (payoutAmount > 0) set payoutTx`. Sau migration: vẫn giữ điều kiện này, nhưng `patch-jackpot-prize.ts` và `apply-split-bonuses.ts` PHẢI tự sinh `payoutTx` khi patch amount > 0.

### 10 bước thường quy

R1-R10 giống Bingo18. Điểm đặc biệt:

- **Entry repo**: query `getWinningEntriesForDispatch` cần điều kiện `"payout.payoutAmount": { $gt: 0 }` — entry jackpot đã được patch amount > 0 trước đó nên sẽ match.
- **Step Function settle**: flow hiện tại `... → FinalizeSettle → DispatchPayouts` sau khi jackpot/split đã patch xong. Migration chỉ đổi state cuối cùng, không đụng nhánh `PatchJackpotPrize` / `ApplySplitBonuses`.
- **Bước 3 phụ**: đọc kỹ `patch-jackpot-prize.ts` và `apply-split-bonuses.ts`, nếu có set `payoutStatus = Pending` thì bỏ. GIỮ `payoutTx` sinh tại đây.

### Các handler Lambda liên quan

Không đổi: `settle-patch-jackpot-prize`, `settle-apply-split-bonuses`, `settle-calculate-financials`, `settle-build-settle-report`, ... Chỉ thay:
- XOÁ: `settle-dispatch-payouts`, `void-dispatch-refunds`.
- THÊM: `settle-enqueue-dispatch-payouts`, `void-enqueue-dispatch-refunds`.

### Verify

```bash
pnpm check-types
rg -n "payoutStatus|refundStatus|PayoutStatus|RefundStatus" packages/game-lotto535 packages/game-lotto535-application apps/worker-lotto535 apps/backoffice/src/app/\(main\)/games/lotto535
rg -n "dispatch-payouts|dispatch-refunds" apps/worker-lotto535/src

# Verify jackpot vẫn tạo đúng payoutTx
rg -n "payoutTx" packages/game-lotto535-application/src/use-cases/settle/
```

Expect: mọi entry trúng giải (cả thường và jackpot/bonus) đều có `payoutTx` sau khi settle hoàn tất.

---

## Game 5 — Mega 6/45

Pattern gần giống Lotto535 (có jackpot, không có split bonuses).

### File đường dẫn

- Entry: `packages/game-mega645/src/entities/entry.ts`
- Enums: `packages/game-mega645/src/entities/enums.ts`
- Settle entries: `packages/game-mega645-application/src/use-cases/settle/settle-entries.ts`
- Patch jackpot: `packages/game-mega645-application/src/use-cases/settle/patch-jackpot-prize.ts`
- Void entries: `packages/game-mega645-application/src/use-cases/void/void-entries.ts`
- Entry repo: `packages/game-mega645-application/src/infras/repos/entry-repo.ts`
- Types barrel: `packages/game-mega645-application/src/infras/repos/types/`
- Use cases: `packages/game-mega645-application/src/use-cases/{settle,void,payout}`
- Worker: `apps/worker-mega645/`
- BO content: `apps/backoffice/src/app/(main)/games/mega645/reports/void/_lib/void-content.tsx`
- Rule: `.cursor/rules/mega645-game-rules.mdc`

### Thay đổi khác

- `GameProduct.Mega645`.
- `batchKey`: `"mega645:settle:<drawId>:payout"` / `"mega645:void:<drawId>:refund"`.
- `description`:
  - Payout: `` `Trả thưởng Mega 6/45 kỳ ${drawId}` ``.
  - Refund: `` `Hoàn tiền Mega 6/45 kỳ ${drawId} (kỳ huỷ)` ``.

### KIỂM TRA RIÊNG

1. `patch-jackpot-prize.ts`: verify `payoutTx` được sinh cho entry jackpot sau khi patch amount > 0.
2. Không có `apply-split-bonuses.ts` → chỉ jackpot thôi.

### 10 bước thường quy R1-R10

### Verify

```bash
pnpm check-types
rg -n "payoutStatus|refundStatus|PayoutStatus|RefundStatus" packages/game-mega645 packages/game-mega645-application apps/worker-mega645 apps/backoffice/src/app/\(main\)/games/mega645
rg -n "dispatch-payouts|dispatch-refunds" apps/worker-mega645/src
```

---

## Game 6 — Power 6/55

Pattern giống Mega645 (có jackpot, có bonus number). Khác biệt chính là jackpot có 2 tier (Jackpot 1 và Jackpot 2).

### File đường dẫn

- Entry: `packages/game-power655/src/entities/entry.ts`
- Enums: `packages/game-power655/src/entities/enums.ts`
- Settle entries: `packages/game-power655-application/src/use-cases/settle/settle-entries.ts`
- Patch jackpot: `packages/game-power655-application/src/use-cases/settle/patch-jackpot-prize.ts`
- Void entries: `packages/game-power655-application/src/use-cases/void/void-entries.ts`
- Entry repo: `packages/game-power655-application/src/infras/repos/entry-repo.ts`
- Types barrel: `packages/game-power655-application/src/infras/repos/types/`
- Use cases: `packages/game-power655-application/src/use-cases/{settle,void,payout}`
- Worker: `apps/worker-power655/`
- BO content: `apps/backoffice/src/app/(main)/games/power655/reports/void/_lib/void-content.tsx`
- Rule: `.cursor/rules/power655-game-rules.mdc`

### Thay đổi khác

- `GameProduct.Power655`.
- `batchKey`: `"power655:settle:<drawId>:payout"` / `"power655:void:<drawId>:refund"`.
- `description`:
  - Payout: `` `Trả thưởng Power 6/55 kỳ ${drawId}` ``.
  - Refund: `` `Hoàn tiền Power 6/55 kỳ ${drawId} (kỳ huỷ)` ``.

### KIỂM TRA RIÊNG

1. `patch-jackpot-prize.ts`: có thể patch 2 tier (JP1 + JP2). Verify `payoutTx` được sinh cho cả hai loại.
2. Entry trúng JP1 và entry trúng JP2 đều phải có `payoutTx` riêng biệt (1 entry = 1 tx).

### 10 bước thường quy R1-R10

### Verify

```bash
pnpm check-types
rg -n "payoutStatus|refundStatus|PayoutStatus|RefundStatus" packages/game-power655 packages/game-power655-application apps/worker-power655 apps/backoffice/src/app/\(main\)/games/power655
rg -n "dispatch-payouts|dispatch-refunds" apps/worker-power655/src
```

---

## Tổng kết sau khi 6 game hoàn tất

### Verify toàn cục

```bash
# Type check toàn repo
pnpm check-types

# Không còn dispatch status trên entry của bất kỳ game nào
rg -n "payoutStatus|refundStatus|PayoutStatus|RefundStatus" packages/game-* apps/worker-* apps/backoffice

# Không còn handler dispatch cũ
rg --files apps/worker-*/src/handlers | rg "dispatch-payouts|dispatch-refunds"

# Tất cả use-cases/payout đã bị xoá
rg --files packages/game-*-application/src/use-cases/payout

# Tất cả use-cases/void/dispatch-refunds đã bị xoá
rg --files packages/game-*-application/src/use-cases/void/dispatch-refunds.ts
```

Kỳ vọng: 4 rg cuối trả 0 file/match.

### Deployment order

1. Deploy `apps/worker-tenant-dispatch` đầu tiên (nếu chưa) — cần EventBridge + IAM role sẵn.
2. Tạo indexes cho `megawin-tenant.tenant_dispatch_orders` (đã liệt kê trong `DispatchOrderRepository` JSDoc).
3. Deploy các game worker theo thứ tự ưu tiên — không phụ thuộc lẫn nhau.
4. Không cần migration data backfill — game mới, không có entry tồn đọng. Với game đang chạy production (nếu có), viết migration riêng (ngoài phạm vi plan này).

### Khi có game mới (tương lai)

Lặp đúng 10 bước + R1-R10. Không cần sửa gì trong `@megawin/tenant-dispatch` hoặc `apps/worker-tenant-dispatch` — chúng đã thiết kế dùng chung.

Thêm game mới cần làm 3 việc ở package dispatch trung tâm:

- Nếu có loại dispatch mới (ngoài `payout`/`refund`/`reversal`) → thêm enum value + builder + điều chỉnh `MAX_RETRY_BY_KIND` trong `packages/tenant-dispatch/src/`.
- Nếu cần thêm mapping special `TransactionReason` → cập nhật builder tương ứng.
- Nếu tenant API có thay đổi contract → cập nhật `BatchTransactionItem` ở `@megawin/tenant-gateway` trước.

### Giai đoạn 2 — Re-settle (sau plan này)

Thiết kế chi tiết: xem `.cursor/plans/tenant_dispatch_resettle.plan.md`.

Tóm tắt:

- Mở rộng `EntryPayout` thêm `reversalTx?` + `reversalAmount?`.
- Mỗi game tạo `ResettleEntriesBatchUseCase` + `EnqueueDispatchResettleOrdersUseCase`.
- Step Function `resettle`: 5 bước (PreflightCheck → PatchDrawResult → ResettleEntriesBatch loop → EnqueueResettleOrders → EnqueueFailed).
- Worker `worker-tenant-dispatch` không cần sửa — `sequence=0 reversal` trước `sequence=1 payout` mới đã có sẵn logic.
- Game có jackpot (Lotto535, Mega645, Power655): bonus bước `RecomputeJackpot` trước resettle entries — thiết kế cụ thể per-game khi implement.

