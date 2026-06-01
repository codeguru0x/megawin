---
name: Keno Resettle Implementation
overview: Plan chi tiết cho việc implement chức năng resettle game Keno — kết sổ lại 1 kỳ Keno đã Settled khi phát hiện kết quả quay sai.
todos: []
isProject: false
---

# Keno Resettle — Plan Implementation Chi Tiết

> **Scope**: Game Keno duy nhất.
> **Kế thừa**: `resettle-non-jackpot.plan.md` (Keno là 1 trong 4 game không jackpot).
> **Mục đích**: Cụ thể hoá từng file path, từng method, từng dòng code thay đổi để có thể implement trực tiếp mà không phải suy luận thêm.
> **Game-specific Keno**:
> - Có `apply-payout-caps` step (giới hạn trả thưởng bậc 8/9/10).
> - Có `hasCappablePrize` flag trên entry (cần `$unset` khi reset).
> - Tần suất quay 8 phút/kỳ → ít khả năng dồn nhiều resettle/draw cùng lúc, nhưng plan vẫn giả định resettle nhiều phiên qua `resettleId`.
> - KHÔNG có jackpot, KHÔNG có companyRate, KHÔNG có split cycle.

## Convention codebase đã verify

1. **`generateId()`**: Sẵn ở `@megawin/shared/utils` → `uuidv7()`. Dùng cho `resettleId`, `reversalTx`, `lockOwnerToken`.
2. **`buildReversalOrder` shape**: Dùng `CommonBuilderInput` chuẩn — `{ tx, tenantId, accountId, username, amount, currency?, gameId, roundIds?, description?, metadata?, sourceId, sourceContext?, batchKey }`. KHÔNG có `sequence` field. `sourceContext` là `Record<string, unknown>` thoải mái — đặt `{ drawId, resettleId, ticketNo }`.
3. **Pattern use case có sẵn ở `keno-application`**:
   - **BO route**: `NextApiUseCase` — file route `apps/backoffice/src/app/api/keno/draws/[drawId]/.../route.ts` chỉ làm 3 việc: zod validate, instantiate `new UseCase()` ở module scope, gọi `useCase.run({ ... })`.
   - **Worker Lambda**: `InternalUseCase` — handler instantiate `new UseCase()` ở module scope, `useCase.run(event)`.
4. **KHÔNG DI container** — repo/use-case dùng `new XxxRepository()` làm instance property trực tiếp.
5. **Audit log**: KHÔNG làm trong scope plan này, chờ hệ thống audit chung.
6. **Repository chỉ chứa query/update DB** — tuyệt đối KHÔNG sinh UUID, KHÔNG ghép business string, KHÔNG quyết định lifecycle data ở repo. Logic đó thuộc use case.
7. **Use case BO KHÔNG validate format/regex/range** — toàn bộ input format check do zod ở route handler đảm nhận. Use case chỉ check business state (status không hợp lệ, balance, lock, conflict...).

## Quyết định thiết kế chuẩn — áp dụng cho mọi game resettle

Các quyết định dưới đây ÁP DỤNG CHUNG cho tất cả game (jackpot lẫn non-jackpot). Khi clone plan này cho game khác, GIỮ NGUYÊN các quyết định này — chỉ thay đổi tên use case/file/prefix.

### A. Sinh `resettleId` ở BO API, propagate xuôi SFN — KHÔNG sinh ở Lambda

**Lý do**:
- `resettleId` là session key cho 1 phiên resettle. Phải ổn định qua mọi retry/replay của Lambda.
- Nếu sinh ở `PrepareResettle` Lambda với fallback `input.resettleId ?? generateId()`, mỗi lần Lambda crash + SFN retry sẽ ra `resettleId` khác → snapshot reversal corrupt, batchKey lệch, tracing gãy.
- BO API `TriggerResettleUseCase` là single point sinh `resettleId`, propagate qua SFN execution input.

**Pattern bắt buộc**:
- `PrepareResettleInput.resettleId: string` — required, KHÔNG optional.
- `PrepareResettleUseCase.execute()` validate `if (!resettleId) throw badRequest(...)`.
- SFN `PrepareResettle` Task có `Arguments` rõ ràng để forward `$states.input.resettleId` (không dựa vào default state input).

### B. `reversalTx` sinh MỚI ở `PrepareResettle` — KHÔNG copy từ `payout.payoutTx`

**Lý do**:
- `payout.payoutTx` là idempotency key của transaction PAYOUT đã dispatch xong (đã nằm trong outbox với `tx` unique).
- Reversal là transaction MỚI (Debit), độc lập với payout cũ. Nếu copy `payoutTx` cũ làm `reversalTx`, outbox unique index `tx` sẽ reject reversal order → enqueue fail.
- `EntryReversal` chỉ snapshot `payoutAmount` (số tiền cần đảo ngược) + `resettleId` (session) + `reversalTx` (idempotency key MỚI).

**Pattern bắt buộc**:
- JSDoc trên `EntryReversal.reversalTx` ghi rõ "sinh MỚI", "KHÔNG copy từ payout.payoutTx".
- Use case sinh `reversalTx: generateId()` per entry trong `bulkSetReversal` items.

### C. Clear `reversal` field bằng `$unset` (không phải `$set: null`) — CHỈ ở `PrepareResettle`

**Lý do dùng `$unset`**:
- `$unset` xoá hẳn field khỏi BSON document → tiết kiệm storage (~25 bytes/field × N entries; với draw 50k entries là đáng kể).
- Filter `$exists: true/false` là semantic chuẩn cho "có/không có data". `$set: null` ép filter dùng `$ne: null` — dễ nhầm.
- Sparse index trên `reversal.reversalTx` (nếu có) chỉ index docs có field tồn tại — `$unset` mới đúng.
- Filter dispatch (`getEntriesWithReversalForDispatch`) đã dùng `"reversal.reversalTx": { $exists: true }` → đồng bộ với `$unset`.

**Lý do CHỈ gọi 1 lần ở `PrepareResettle` step 1** (KHÔNG gọi ở `FinalizeSettle`):
- `bulkSetReversal` filter chỉ là `{ _id, status: Settled }` — `$set` overwrite reversal cũ với reversal mới → KHÔNG cần clear trước cho entries thắng cả 2 phiên.
- **NHƯNG** cần wipe trước cho entries thắng phiên N-1 mà KHÔNG thắng phiên N: `bulkSetReversal` phiên N chỉ snapshot entries thắng phiên N → entries cũ lingers reversal phiên N-1 → `EnqueueReversals` query `$exists: true` sẽ trả CẢ 2 set → **DOUBLE-DEBIT**. Đây là vấn đề CORRECTNESS, bắt buộc clear ở `PrepareResettle.step1`.
- Sau resettle hoàn tất (`FinalizeSettle`): KHÔNG clear → `reversal` field giữ làm **audit trail của phiên gần nhất** (xem Decision Principle 28 — semantic kép: dispatch payload trong phiên + audit snapshot sau phiên).

**Pattern bắt buộc**:
- `EntryResettleRepository.clearReversalSnapshot` dùng `$unset: { reversal: "" }`.
- CHỈ gọi 1 lần ở `PrepareResettle` step 1 (replay-safe wipe trước `bulkSetReversal`).
- KHÔNG gọi ở `FinalizeSettle` resettle path.

### D. SFN dùng default state input/output passthrough — TỐI THIỂU `Arguments`/`Assign`

JSONata mode: nếu không khai báo `Arguments`, Lambda Task tự động nhận `$states.input` (output của state trước). Output của Task tự động trở thành `$states.input` cho state kế tiếp. Khi `EnqueueReversalsInput` shape KHỚP với output của `PrepareResettle`, KHÔNG cần `Arguments` mapping field-by-field cũng KHÔNG cần `Assign` lại context.

**Pattern bắt buộc**:
- `PrepareResettleOutput` shape khớp `EnqueueReversalsInput` shape khớp `StartSettleExecution.Input` shape → mỗi state chỉ cần `Resource + Next + Retry`, KHÔNG `Arguments`/`Assign`.
- `Arguments` CHỈ cần khi cross-SFN boundary cần wrap input vào nested struct (xem `StartSettleExecution` ở Decision J).
- `Assign` CHỈ cần khi cần persist context xuyên nhiều state với Choice rẽ nhánh (xem Settle SFN — `$settleCtx` Assign 1 lần ở `PrepareSettle`).

```typescript
PrepareResettle: {
  Type: "Task",
  Resource: lambdaArn("resettle-prepare"),
  Next: "EnqueueReversals",
  Retry: LAMBDA_RETRY,
  // Không Arguments/Assign — input tự pass-through từ SFN execution input,
  // output tự pass-through tới EnqueueReversals.
},

EnqueueReversals: {
  Type: "Task",
  Resource: lambdaArn("resettle-enqueue-reversals"),
  Next: "StartSettleExecution",
  Retry: ENQUEUE_RETRY,
  Catch: [{ ErrorEquals: ["States.ALL"], Next: "EnqueueRetryWait" }],
},
```

### E. Acquire WorkerLock ở BO API, KHÔNG ở Lambda

**Lý do**:
- 2 staff click `/resettle` cùng lúc → cần 1 thắng + 1 fail HTTP rõ ràng để staff biết. Acquire ở Lambda thì cả 2 request đều "OK" (status 200), staff confused.
- Acquire ở BO API → nếu lock fail, KHÔNG transition status, KHÔNG StartExecution → state sạch.
- Nếu acquire ở Lambda: BO API đã transition `Published → Settling` + StartExecution OK, nhưng Lambda fail acquire → status kẹt `Settling` mà SFN không thực sự chạy → cần rollback phức tạp (race với draw status).
- Pattern đồng nhất với `TriggerSettleUseCase`.

**Pattern bắt buộc**:
- `TriggerResettleUseCase` (BO API) acquire lock TRƯỚC `triggerSettle()` (transition status) và TRƯỚC `startExecution()`.
- `try/catch` quanh transition + StartExecution → rollback lock (`lockCoordinator.releaseOnRollback`) nếu fail.
- Lambda chỉ TIN TƯỞNG lock đã được acquire ngoài; `FinalizeSettle` cuối SFN release lock dùng `lockOwnerToken` từ SFN context.

### F. SFN execution name DETERMINISTIC theo `(drawId, settledAt)` — chống `ExecutionAlreadyExists` VÀ tự idempotent ở retry

**Lý do**:
- AWS SFN giữ execution name unique trong **90 ngày**. Nếu chỉ dùng `{drawId}-resettle`, resettle lần 2 cùng draw sẽ throw `ExecutionAlreadyExists` → cần token phân tách 2 phiên.
- Nhưng nếu token là `resettleId` SINH MỚI mỗi request, mỗi lần BO API retry sau khi `startExecution` fail sẽ tạo execution mới → vừa tốn AWS quota vừa có thể có 2 SFN cùng chạy nếu lần fail thực ra đã start xong (network blip).
- Pattern đối xứng với `TriggerSettleUseCase`: dùng name DETERMINISTIC, để AWS lo idempotent ở mức StartExecution (cùng name + cùng input → trả execution hiện tại).

**Token tách phiên**: `settledAt.getTime()`.
- `settledAt` chỉ thay đổi khi `FinalizeSettle` ghi lại lúc kết thúc 1 phiên resettle → trong 1 phiên dở dang nó không đổi → execution name ổn định qua các retry BO API.
- 2 phiên resettle khác nhau (phiên trước đã FinalizeSettle xong, staff republish lần nữa) → `settledAt` khác → execution name khác → không xung đột name 90 ngày.

**Pattern bắt buộc**:
```typescript
const settledAtToken = draw.settledAt.getTime();
name: `${toExecutionName(drawId)}-resettle-${settledAtToken}`,
```

`resettleId` (UUIDv7) vẫn được sinh và đưa vào SFN INPUT để Lambda dùng làm snapshot key / tracing — KHÔNG dùng để build execution name.

### G. KHÔNG check `aggregateBatchProgress` của batch dispatch trước

**Lý do**:
- Outbox FIFO per tenant tự đảm bảo Reversal (createdAt T0) chạy TRƯỚC Payout (createdAt T1>T0) cùng player. Reversal mới enqueue chỉ xếp SAU order cũ chưa dispatch — vẫn FIFO đúng, không double-debit.
- Tenant offline → check pending sẽ block resettle vô thời hạn → staff không action được gì → deadlock không tự giải.
- Trách nhiệm xử lý order stuck thuộc ops dispatch dashboard, KHÔNG phải BO API resettle.
- Đồng nhất với `TriggerSettleUseCase` (settle lần đầu cũng không check pending).

**Pattern bắt buộc**:
- `TriggerResettleUseCase` KHÔNG inject `DispatchOrderRepository`.
- Bỏ method `findRecentBatchKeyByDraw` khỏi `DispatchOrderRepository` (nếu chỉ phục vụ resettle preflight).

### H. KHÔNG bump `version` ở 3 update của Resettle (`bulkSetReversal`, `resetEntriesForResettle`, `clearReversalSnapshot`)

**Lý do**:
- `version` field trên entries là **change-feed cho tenant**, không phải audit log cho ops. Worker `sync-entry-feed` mirror business state (status, result, outcome, payout) lên collection `entryFeed` cho tenant đọc qua API.
- 3 update của Resettle tạo ra trạng thái TRUNG GIAN VÔ NGHĨA với tenant:
  - `bulkSetReversal`: set `reversal` snapshot → field internal cho outbox dispatch.
  - `resetEntriesForResettle`: $unset payout/result/outcome → entry tạm "không có kết quả".
  - `clearReversalSnapshot`: $unset `reversal` → cleanup internal field.
- Nếu bump version ở 3 update này → tenant feed nhận event "vé thắng 100K → payout=0, không có result" trong vài phút → UI flicker, webhook gửi player notification mâu thuẫn (`won 100K → reverted to pending → won 80K`), CDC stream/audit ghi nhận trạng thái không có ý nghĩa nghiệp vụ.

**Tenant CHỈ nên thấy 1 event sạch khi resettle xong**:
- `bulkSettleEntries` (re-settle path) ghi payout/result/outcome MỚI và bump version 1 lần per entry.
- `bulkApplyPayoutCap` (nếu game có top prize cap) bump version lần nữa khi điều chỉnh payout — VẪN CÓ ý nghĩa nghiệp vụ với tenant nên bump là đúng.
- Tenant feed nhận đúng "payout cũ → payout mới" không có phase trung gian.

**Đảm bảo không entry nào kẹt version cũ**:
- `SettleEntriesBatchUseCase` query `getScheduledEntries(drawId)` — KHÔNG filter outcome → fetch toàn bộ entries Scheduled (cả thắng và thua).
- `bulkSettleEntries` ghi cho TẤT CẢ entries trong batch (bump version đồng nhất 1 lần per entry).

**Edge case "crash giữa reset và bulkSettleEntries"**:
- Entries kẹt ở Scheduled mà tenant feed vẫn thấy version cũ (Settled với payout cũ) → đây là điều MONG MUỐN: tenant không cần biết phase trung gian.
- Resettle SFN có retry + alarm; ops can thiệp nếu kẹt > threshold; cuối cùng `bulkSettleEntries` chạy xong → 1 event sạch lên feed.

**Nguyên tắc tổng quát cho mọi game resettle**:
- Update nào tạo ra **business state có ý nghĩa với tenant** → bump version (e.g. `bulkSettleEntries`, `bulkApplyPayoutCap`, `voidEntry`).
- Update nào là **phase trung gian** hoặc **internal mechanic** (snapshot dispatch, reset prep, cleanup field nội bộ) → KHÔNG bump version.
- Câu test: "Nếu tenant nhận event này, họ có làm gì khác đi không?". Nếu KHÔNG → đừng bump.

**Pattern bắt buộc**:
- `EntryResettleRepository` KHÔNG inject/import `EntryRepository` để lấy `nextVersion()`.
- 3 method `bulkSetReversal`, `resetEntriesForResettle`, `clearReversalSnapshot` chỉ `$set updatedAt` (cho audit log Mongo) + payload chính, KHÔNG `$set version`.

### I. SFN context tối thiểu — KHÔNG propagate metric/runtime fields

**Lý do**:
- SFN state context (`$states.input`, `$states.result`, Assigned variables) là channel orchestration. Mỗi field thừa làm payload nặng hơn (giới hạn 256KB), comment khó đọc, mapping JSONata phức tạp.
- Metric (`reversalCount`, `resetCount`, `enqueuedTotal`) chỉ phục vụ **observability**, không quyết định flow → log CloudWatch (`console.info`) thay vì trả về SFN state.
- Sau khi metric ra CloudWatch Logs Insights, ops query bằng `fields @timestamp, drawId, resettleId, reversalCount` thay vì xem state machine execution history.

**Test cụ thể cho mỗi field trong output**: "State kế tiếp có DESTRUCTURE field này không? Có dùng cho Choice condition / Arguments mapping / Catch error không?" Nếu KHÔNG → bỏ.

**Pattern bắt buộc**:
- `PrepareResettleOutput`: chỉ `{ drawId, resettleId, lockOwnerToken }`. KHÔNG `reversalCount`, `resetCount`, `reversalBatchKey`.
- `EnqueueReversalsOutput`: chỉ `{ drawId, resettleId, lockOwnerToken }` (= input shape — pure pass-through). KHÔNG `enqueuedTotal`, `reversalBatchKey`, `done`.
- Metric ghi qua `console.info({ event, drawId, resettleId, reversalCount, resetCount })` đầu/cuối use case.
- `EnqueueReversalsUseCase` chạy hết entries trong 1 invocation (không self-loop) → `done` field là dead → bỏ. Lambda timeout (15min) đủ cho draw realistic; SFN retry policy bao outer-loop nếu thực sự cần.

**Hệ quả**: Choice state `CheckEnqueueDone` và `CheckHasReversals` cũng KHÔNG cần — `EnqueueReversalsUseCase` handle 0 entries graceful (1 query trả empty, return ngay) với cost 1 Lambda invocation (~$0.0000002) thay vì 1 Choice state phức tạp.

### J. Convention naming `batchKey` centralize 100% ở use case (Lambda) — KHÔNG build ở SFN ASL

**Lý do**:
- `batchKey` là **derived value** từ `(gameKey, drawId, resettleId, kind)`. Build ở 2 chỗ (SFN ASL JSONata + use case TS) tạo 2 source of truth → bug khi convention đổi.
- SFN ASL JSONata không có type-check → đổi convention quên 1 chỗ → silent corruption (orders ghi sai batchKey).
- Use case TS có type-check + unit test → đổi convention compiler bắt ngay.

**Pattern bắt buộc**:
- Convention: `${gameKey}:resettle:${drawId}:${resettleId}:${kind}` với `kind ∈ { reversal, payout }`.
- `EnqueueReversalsUseCase` derive `reversalBatchKey` từ `drawId + resettleId` ngay trong `execute()`.
- `EnqueueDispatchPayoutsUseCase` (nested Settle SFN, resettle path) derive `batchKey` từ `drawId + resettleContext.resettleId` ngay trong `execute()`.
- `ResettleContext` **KHÔNG** chứa `payoutBatchKey` field — derive được từ `resettleId + drawId` đã có trong context.
- `StartSettleExecution.Input.resettleContext` chỉ pass `{ resettleId, lockOwnerToken }` — KHÔNG build `payoutBatchKey` qua JSONata.

```typescript
// ❌ KHÔNG dùng pattern này — JSONata build derived value
StartSettleExecution: {
  Arguments: {
    Input: {
      resettleContext: {
        resettleId: "{% $states.input.resettleId %}",
        payoutBatchKey: "{% 'keno:resettle:' & $states.input.drawId & ... %}", // BAD
        lockOwnerToken: "{% $states.input.lockOwnerToken %}",
      },
    },
  },
}

// ✓ Pattern đúng — context tối thiểu, use case tự derive
StartSettleExecution: {
  Arguments: {
    Input: {
      drawId: "{% $states.input.drawId %}",
      resettleContext: {
        resettleId: "{% $states.input.resettleId %}",
        lockOwnerToken: "{% $states.input.lockOwnerToken %}",
      },
    },
  },
}
```

### K. Fail-fast ở repository mapper — KHÔNG silent fallback (`?? 0`, `?? ""`) cho trường financial

**Lý do**:
- `EnqueueDispatchOrdersUseCase.validateOrder` log error nhưng KHÔNG throw khi `tx`/`amount` invalid → order bị **silently dropped** khỏi outbox.
- Nếu mapper repo dùng `reversalAmount: d.reversal?.reversalAmount ?? 0` cho data corrupt: order bị validate ra với `amount=0` → `validateOrder` log + skip → reversal mất → balance player lệch → traceback gãy (không có log nào ngoài CloudWatch insights raw).
- Repository mapper là defense layer cuối cùng giữa BSON document và domain object. Phải FAIL FAST khi data corrupt — throw để SFN catch/retry/escalate, KHÔNG cho corrupt data lan xuống outbox.

**Pattern bắt buộc**:
- Repository mapper **KHÔNG** dùng `?? 0`, `?? ""` cho field business-critical (id, tx, amount, financial values).
- Throw `Error` với message rõ ràng kèm `entryId + drawId + field name + value` cho ops debug.
- Field optional UI-only (e.g. `description`, `metadata.label`) thì OK fallback.

```typescript
// ❌ Silent fallback — corrupt data lan xuống outbox
return docs.map((d) => ({
  reversalAmount: d.reversal?.reversalAmount ?? 0,    // BAD
  reversalTx: d.reversal?.reversalTx ?? "",           // BAD
}));

// ✓ Fail-fast — corrupt data dừng tại mapper
return docs.map((d) => {
  const reversal = d.reversal;
  if (!reversal || typeof reversal.reversalTx !== "string" || reversal.reversalTx.length === 0) {
    throw new Error(
      `[EntryResettleRepo] reversal.reversalTx missing trên entry ${d._id.toHexString()} (drawId=${drawId}) — data corrupt`,
    );
  }
  if (typeof reversal.reversalAmount !== "number" || !Number.isFinite(reversal.reversalAmount) || reversal.reversalAmount <= 0) {
    throw new Error(
      `[EntryResettleRepo] reversal.reversalAmount không hợp lệ trên entry ${d._id.toHexString()} (drawId=${drawId}, value=${String(reversal.reversalAmount)})`,
    );
  }
  return { reversalAmount: reversal.reversalAmount, reversalTx: reversal.reversalTx };
});
```

### L. `resettleContext` propagate xuyên Settle SFN qua `$settleCtx` — KHÔNG cần thay đổi Settle SFN ASL

**Lý do**:
- Settle SFN dùng pattern `Assign: { settleCtx: $states.result }` ở `PrepareSettle` → `$settleCtx` persist xuyên mọi state.
- `PrepareSettleUseCase` thêm `resettleContext` vào output `SettleContext` → tự động có trong `$settleCtx`.
- `CalculateFinancials` step dùng `Assign: { settleCtx: $merge([$settleCtx, { financials: $states.result }]) }` — `$merge` shallow → giữ nguyên `resettleContext`.
- Hai consumer cuối (`FinalizeSettle`, `EnqueueDispatchPayouts`) destructure `{ drawId, resettleContext }` từ `$settleCtx` → đọc đúng giá trị.

**Pattern bắt buộc**:
- `PrepareSettleInput` thêm field `resettleContext?: ResettleContext` → use case propagate vào output `SettleContext`.
- `SettleContext` thêm field `resettleContext?: ResettleContext`.
- `FinalizeSettleUseCase` destructure `resettleContext` → `if (resettleContext) lockCoordinator.release(...)`.
- `EnqueueDispatchPayoutsUseCase` destructure `resettleContext` → derive batchKey resettle nếu present.
- Settle SFN ASL **KHÔNG** đổi gì — pattern đã chuẩn.

**Verify khi review PR Settle propagate**:
1. PrepareSettle output có chứa `resettleContext`? (nếu input present)
2. CalculateFinancials Assign dùng `$merge` shallow? (giữ field khác ngoài `financials`)
3. FinalizeSettle handler `event: SettleContext` (không phải subset interface)?
4. EnqueueDispatchPayouts `EnqueueDispatchPayoutsInput` chấp nhận extra field từ SettleContext (TS structural typing OK)?

## FIFO outbox & quyết định KHÔNG chờ reversal dispatch xong

**Quan điểm thiết kế đã chốt** (thay đổi so với draft trước):

`@megawin/tenant-dispatch` chạy FIFO theo `nextAttemptAt ASC` per tenant. Với cùng 1 player trong cùng 1 tenant:

```
[Reversal order — Debit, force=true]   ← createdAt T0, nextAttemptAt T0
[Payout order — Credit]                ← createdAt T1 > T0
```

Worker dispatch tuần tự: Debit chạy xong (success / fail) MỚI tới Credit. Nếu Debit fail → order Debit ở status `Pending`/`Failed` đang giữ slot; Credit cùng player sẽ bị block ở `Pending` cho tới khi ops can thiệp tay.

→ **Megawin KHÔNG cần SFN block**. Trách nhiệm chia rõ:

| Lớp | Trách nhiệm |
|---|---|
| Megawin orchestration (SFN) | Enqueue Reversal TRƯỚC, Payout SAU. Đúng thứ tự là đủ. |
| Outbox (`tenant_dispatch_orders`) | FIFO per tenant — đảm bảo Reversal chạy trước Payout cùng tenant. |
| Tenant API | Idempotency theo `tx`, error handling. |
| Ops | Xử lý order stuck (force retry / huỷ / điều chỉnh balance thủ công). |

**Hệ quả**:
- Resettle SFN KHÔNG có state `WaitReversalsDispatched`. Sau `EnqueueReversals` xong → start nested Settle SFN ngay.
- Settle SFN nested `EnqueueDispatchPayouts` enqueue payout với `createdAt` muộn hơn reversal → outbox tự xử thứ tự.
- Megawin "đã xong việc của mình" sau khi enqueue đủ 2 nhóm order vào outbox. Không bị delay vì 1 tenant lỗi.
- Tenant lỗi → ops xử lý ở dispatch dashboard, KHÔNG block resettle/settle pipeline toàn cục.

**KHÔNG check `aggregateBatchProgress` ở `TriggerKenoResettleUseCase`** (xem decision G ở section "Quyết định thiết kế chuẩn"):
- Outbox FIFO per tenant tự đảm bảo thứ tự dispatch — reversal mới enqueue chỉ xếp sau order cũ chưa dispatch, vẫn FIFO đúng, không double-debit.
- Tenant offline → check pending sẽ block resettle vô thời hạn → staff không action được gì → deadlock.
- Đồng nhất với `TriggerSettleUseCase` (settle lần đầu cũng không check pending).
- Tenant lỗi → ops xử lý ở dispatch dashboard, KHÔNG block resettle pipeline.

→ SFN nội bộ KHÔNG có Wait state. BO API KHÔNG có preflight pending check.

## Mục đích `lockOwnerToken`

Truyền `lockOwnerToken` qua SFN có **2 mục đích cụ thể**:

1. **Ownership cho `BusinessLockCoordinator.release`**: coordinator wrap
   `WorkerLockRepository.finalizeAndRelease(lockKey, ownerToken, ...)` — chỉ
   release lock nếu `lockKey + ownerToken` khớp. Khi `FinalizeSettle` (cuối
   nested Settle SFN) gọi `lockCoordinator.release({ lockKey, ownerToken })`,
   phải truyền đúng token đã acquire ở BO API để:
   - Tránh release nhầm khi TTL hết → token mới đã acquire bởi phiên resettle khác → release không match → coordinator log warning, lock của owner mới vẫn an toàn.
   - Không release lock của owner khác (staff khác đã trigger phiên mới sau khi TTL hết).
2. **Trace request → execution**: `lockOwnerToken` đi cùng SFN execution. Khi debug 1 SFN execution ID, query `worker_locks` theo ownerToken biết được:
   - Phiên đó acquire lúc nào (`acquiredAt` qua `lastSuccessAt` hoặc `expiresAt - TTL`).
   - Có release thành công không (`lastSuccessAt` set khi `release` thành công).

KHÔNG dùng cho idempotency của reversal — đó là việc của `reversalTx` (UUIDv7 per entry).
KHÔNG dùng làm SFN execution name — execution name là `{drawId}-{shortToken}` để tránh trùng tên khi staff trigger 2 lần (lần 2 fail ở lock acquire trước khi tới startExecution).

---

## 1. Bối cảnh & nguyên tắc

### 1.1. Khi nào trigger resettle Keno?

Resettle Keno xảy ra khi staff phát hiện **20 số trúng (`winningNumbers`)** đã được nhập sai cho 1 kỳ đã `Settled`. Hậu quả phải xử lý:

1. Thu hồi tiền thưởng đã trả sai cho người chơi.
2. Settle lại entries với kết quả mới → trả thưởng theo bảng giải đúng.
3. Re-aggregate financial reports (draw + tenant + system daily) — totalRevenue, totalPrizes, totalAgentCommission, companyTake.
4. Re-trigger payout cap logic với set winners mới (số bộ trúng top prize bậc 8/9/10 thay đổi → cap khác).

### 1.2. Nguyên tắc thiết kế

| Nguyên tắc | Áp dụng cho Keno |
|---|---|
| **DRY tuyệt đối** | Resettle SFN chỉ "chuẩn bị data + enqueue reversal" rồi gọi nested Settle SFN nguyên bản. Zero duplicate match/cap/financial logic. |
| **KISS tuyệt đối** | 2 use case mới ở worker (`PrepareKenoResettleUseCase`, `EnqueueKenoReversalsUseCase`); 2 use case mới ở BO (`RepublishKenoResultUseCase`, `TriggerKenoResettleUseCase`); 2 Lambda mới; 1 SFN mới. |
| **Idempotent đa tầng** | Filter-based update + unique `tx` ở outbox + `WorkerLock` per drawId. |
| **Resettle N lần an toàn** | `resettleId` UUIDv7 mỗi phiên, batchKey phân tách hoàn toàn, clear reversal snapshot trước phiên mới. |
| **KHÔNG ảnh hưởng Settle SFN khi không có resettleContext** | Settle SFN giữ nguyên hành vi cho settle lần đầu — `resettleContext` optional trong `SettleContext`. |
| **`Published` only** | BO API và `PrepareKenoResettleUseCase` BẮT BUỘC `draw.status === Published` mới được resettle. Không accept `Settled` để tránh chạy lại settle với kết quả cũ chưa sửa. |
| **Transition do BO triggers, SFN tin tưởng** | Giống pattern `TriggerSettleUseCase`: BO API tự transition `Published → Settling` (qua `triggerSettle`) RỒI mới `StartExecution`. Settle SFN tin tưởng `draw.status === Settling` khi nhận event — KHÔNG transition lại. |
| **Audit log out-of-scope** | Chức năng audit log riêng sẽ làm sau, không tích hợp ad-hoc trong resettle. |
| **Không DI container** | Tuân theo pattern hiện tại — `new Repo()`/`new UseCase()` trực tiếp. |
| **FIFO outbox tin tưởng** | Megawin enqueue đúng thứ tự (reversal trước, payout sau) là đủ. KHÔNG SFN block. Tenant lỗi → ops xử lý outbox. |
| **Repo chỉ DB ops** | Repository methods chỉ query/update DB. Sinh UUID, ghép business string, build snapshot object → use case. |
| **Validation chia tầng** | Format input (regex, length, type) → zod ở route. Business state (status, lock, balance) → use case. |

### 1.3. Constants cho Keno

| Constant | Giá trị | Vị trí dùng |
|---|---|---|
| `gameId` | `GameProduct.Keno` (= `"keno"`) | batchKey prefix, lockKey, dispatch metadata |
| `lockKey` | `"keno:resettle:{drawId}"` | `BusinessLockCoordinator` (wrap `WorkerLockRepository`) |
| `batchKey` (resettle reversal) | `"keno:resettle:{drawId}:{resettleId}:reversal"` | reversal dispatch orders |
| `batchKey` (resettle payout) | `"keno:resettle:{drawId}:{resettleId}:payout"` | payout dispatch orders trong phiên resettle |
| `batchKey` (settle lần đầu) | `"keno:settle:{drawId}:payout"` | giữ nguyên hiện tại |
| Lock TTL | 300s (5 phút) | đủ thời gian reversal enqueue + nested settle complete; SFN crash → tự release nhanh |

---

## 2. Flow tổng quan (3 bước nghiệp vụ)

```
┌─────────────────────────────────────────────────────────────────────┐
│ BƯỚC 1 — Sửa kết quả (staff thao tác BO)                            │
│                                                                     │
│ POST /api/keno/draws/{drawId}/republish-result                      │
│   - Zod validate body (winningNumbers regex + length).              │
│   - Use case: precondition draw.status === Settled.                 │
│   - Atomic: status Settled → Published                              │
│             result = newResult (winningNumbers + bigCount/...)      │
│             $unset financial, stats, settleSummary (giữ settledAt) │
│   - KHÔNG đụng entries. KHÔNG enqueue.                              │
│   - Idempotent qua status filter (chạy 2 lần → 409 lần thứ 2).      │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BƯỚC 2 — Trigger Resettle (staff bấm nút riêng)                     │
│                                                                     │
│ POST /api/keno/draws/{drawId}/resettle                              │
│   - Zod validate params (drawId regex).                             │
│   - Use case TriggerKenoResettleUseCase:                            │
│     1. Precondition draw có result + status ∈ {Published, Settling}.│
│        Settling = retry sau lần startExecution fail trước.          │
│     2. settledAt != null && publishedAt > settledAt → đảm           │
│        bảo có republish kết quả mới sau lần settle gần nhất.        │
│     3. Sinh resettleId = generateId() (UUIDv7) — session key cho    │
│        SFN INPUT (snapshot key, tracing). KHÔNG dùng để build       │
│        execution name.                                              │
│     4. Acquire WorkerLock lockKey="keno:resettle:{drawId}",         │
│        ownerToken=generateId(), TTL 300s. PHẢI acquire TRƯỚC        │
│        transition status + StartExecution.                          │
│     5. Transition Published → Settling qua drawRepo.triggerSettle.  │
│        Skip step này nếu status đã Settling (retry case).           │
│        (Cùng pattern với TriggerSettleUseCase.)                     │
│     6. StartExecution Resettle SFN với name DETERMINISTIC theo      │
│        (drawId, settledAt): `{drawId}-resettle-{settledAt.getTime}` │
│        → AWS idempotent ở mức execution: retry cùng phiên trả về    │
│        execution hiện tại thay vì throw ExecutionAlreadyExists.     │
│     - Truyền {drawId, resettleId, lockOwnerToken, lockKey} vào      │
│       SFN execution input.                                          │
│   - Rollback: nếu (5) hoặc (6) fail → lockCoordinator.releaseOnRollback. │
│     KHÔNG rollback transition Settling → retry tiếp theo rơi vào    │
│     nhánh "đã Settling, skip" + execution name deterministic →      │
│     idempotent end-to-end.                                          │
│   - KHÔNG check aggregateBatchProgress của batch dispatch trước     │
│     (xem decision G — outbox FIFO tự xử lý thứ tự).                 │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ BƯỚC 3 — Resettle SFN (3 state thẳng, nested Settle SFN)            │
│                                                                     │
│  Input: { drawId, resettleId, lockOwnerToken }                       │
│         (resettleId sinh ở BO API TriggerResettle, propagate xuôi)   │
│     │                                                               │
│     ▼                                                               │
│  1. PrepareResettle (Lambda)                                        │
│    - Validate draw.status === Settling (đã transition ở BO).        │
│    - Validate input.resettleId tồn tại — KHÔNG sinh ở Lambda để     │
│      đảm bảo retry/replay dùng cùng resettleId.                     │
│    - Step 1: clearReversalSnapshot(drawId): $unset reversal cũ      │
│      (replay-safe + xoá reversal phiên N-1 trên entries thắng       │
│      phiên N-1 nhưng KHÔNG thắng phiên N → tránh double-debit).     │
│    - Step 2: Loop snapshot reversal cho mọi entries có winAmount>0: │
│        → use case sinh MỚI reversalTx (UUIDv7) per entry, ghép       │
│          { reversalTx, reversalAmount=payoutAmount, resettleId }    │
│          rồi gọi repo bulk update. KHÔNG copy payout.payoutTx cũ.   │
│    - Step 3: resetEntriesForResettle(drawId): $set status=Scheduled,│
│      $unset payout, outcome, result, hasCappablePrize.              │
│    - reversalCount/resetCount → console.info CloudWatch (không      │
│      propagate qua SFN state — xem Decision I).                     │
│    - Output: { drawId, resettleId, lockOwnerToken } (= input shape) │
│     │                                                               │
│     ▼                                                               │
│  2. EnqueueReversals (Lambda, single invocation)                    │
│    - Cursor entries có reversal.reversalTx, chunk 500.              │
│    - reversalBatchKey derive từ drawId + resettleId trong use case  │
│      (xem Decision J — convention naming centralize).               │
│    - buildReversalOrder + EnqueueDispatchOrdersUseCase.run().       │
│    - description: "Thu hồi Keno kỳ {drawId} (resettle, vé X)"       │
│    - 0 entries → return ngay (xem Decision I — không cần Choice     │
│      CheckHasReversals).                                            │
│    - enqueuedTotal → console.info CloudWatch.                       │
│    - Output: { drawId, resettleId, lockOwnerToken } (pure pass-through)│
│     │                                                               │
│     ▼                                                               │
│  3. StartSettleExecution (Task: states:startExecution.sync:2)       │
│    - Input: { drawId, resettleContext: { resettleId,                │
│              lockOwnerToken } } — KHÔNG payoutBatchKey (xem         │
│              Decision J — use case tự derive).                      │
│    - Settle SFN cùng game, chạy nguyên bản (đã đang Settling):      │
│        PrepareSettle (propagate resettleContext vào SettleContext)  │
│        → SettleEntries → ApplyPayoutCaps → CalculateFinancials      │
│        → SyncTicketSummaries → BuildSettleReport                    │
│        → PublishSettleDaily → PublishPlayerDaily                    │
│        → FinalizeSettle (release WorkerLock khi resettleContext     │
│          present)                                                   │
│        → EnqueueDispatchPayouts (đọc resettleContext → derive       │
│          batchKey "keno:resettle:{drawId}:{resettleId}:payout";     │
│          description suffix " (resettle)")                          │
│    - Outbox FIFO per tenant → đảm bảo reversal Debit chạy trước     │
│      payout Credit cùng player.                                     │
│    - End: Resettle SFN succeed khi nested complete.                 │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Quy tắc nghiệp vụ — Bảng quyết định

| Rule | Chi tiết |
|---|---|
| **R-BO-1** | `republishResultAfterSettled` accept `status === Settled`, transition về `Published`, `$unset` financial/stats/settleSummary. **Giữ** `settledAt` làm high-water mark. |
| **R-BO-2** | API `/resettle` reject nếu `status ∈ {Void, Voiding, Scheduled, SalesOpen, SalesClosed, Settled}`. Accept `Published` (lần đầu trigger sau republish) HOẶC `Settling` (retry sau khi `startExecution` fail trước đó). |
| **R-BO-3** | API `/resettle` accept `status ∈ {Published, Settling}`. Phải gọi `/republish-result` (Settled→Published) trước khi gọi `/resettle` lần đầu. |
| **R-BO-4** | API `/resettle` tự transition `Published → Settling` qua `drawRepo.triggerSettle` TRƯỚC khi `StartExecution`. SKIP transition này nếu draw đã ở `Settling` (retry case) — cùng pattern `TriggerSettleUseCase` hiện tại. SFN nhận draw đã ở `Settling`. |
| **R-BO-5** | API `/resettle` PHẢI phân biệt với "Settle lần đầu". Cả 2 đều có `status === Published` + `result.publishedAt` ≠ null. Phân biệt qua `settledAt`: <br/>• `settledAt == null` → chưa từng settle → BẮT BUỘC dùng `/trigger-settle`, reject `/resettle` với code `DRAW_NEVER_SETTLED`. <br/>• `settledAt != null && result.publishedAt > settledAt` → có republish mới sau settle gần nhất → `/resettle` hợp lệ. <br/>• `settledAt != null && result.publishedAt <= settledAt` → chưa republish kết quả mới → reject với code `DRAW_NO_NEW_RESULT`. |
| **R-DISPATCH-1** | KHÔNG check `aggregateBatchProgress` ở BO API. Outbox FIFO per tenant tự đảm bảo Reversal dispatch trước Payout cùng player. Tenant offline → ops xử ở dispatch dashboard, KHÔNG block resettle pipeline. Đồng nhất với `TriggerSettleUseCase`. |
| **R-DISPATCH-2** | Megawin enqueue Reversal TRƯỚC, Payout SAU. Outbox FIFO per tenant đảm bảo thứ tự dispatch. SFN KHÔNG block chờ reversal dispatched. |
| **R-DISPATCH-3** | Mỗi phiên `resettleId` riêng → 2 batchKey riêng (reversal + payout). Mỗi entry có `reversal.reversalTx` UUIDv7 mỗi phiên. Unique `tx` ở outbox. |
| **R-LOCK-1** | Dùng `BusinessLockCoordinator` từ `@megawin/worker-core` (wrap `WorkerLockRepository`) với `lockKey = "keno:resettle:{drawId}"`, TTL 300s. BO API `lockCoordinator.acquire(...)` TRƯỚC transition + StartExecution (KHÔNG ở Lambda); SFN `FinalizeSettle` (nested) gọi `lockCoordinator.release(...)` khi xong. SFN crash → TTL tự release sau 5 phút. |
| **R-EXEC-1** | SFN execution name = `${toExecutionName(drawId)}-resettle-${draw.settledAt.getTime()}`. Token là `settledAt` (KHÔNG phải `resettleId`) → DETERMINISTIC trong cùng phiên dở dang → AWS idempotent ở mức `StartExecution` cho retry sau lần fail. 2 phiên resettle khác nhau có `settledAt` khác (FinalizeSettle ghi lại) → tên khác → không xung đột name 90 ngày. `resettleId` chỉ đi vào SFN INPUT để Lambda dùng làm snapshot key/tracing. |
| **R-EXEC-2** | Khi retry sau `startExecution` fail, status đã là `Settling` → use case skip `drawRepo.triggerSettle` và gọi lại `startExecution` với cùng deterministic name → AWS trả execution hiện tại nếu có, hoặc tạo mới nếu chưa có (cùng pattern `TriggerSettleUseCase`). KHÔNG rollback status về `Published`. |
| **R-VOID-1** | `VALID_TRANSITIONS[Settled]` chỉ cho `Published` (resettle path). KHÔNG cho `Voiding` — kỳ đã settle xong là final, void chỉ áp dụng ở giai đoạn `Scheduled / SalesClosed / Published`. |
| **R-CAP-1** | Khi reset entries, `$unset hasCappablePrize` (Keno-specific). `SettleEntries` ghi lại flag này theo set winners mới. `ApplyPayoutCaps` recalc cappedPrize idempotent. |
| **R-RESET-1** | `resetEntriesForResettle` $unset đầy đủ field do settle ghi: `payout, outcome, result, hasCappablePrize`. KHÔNG để sót field cũ làm settle phiên mới đọc nhầm. |
| **R-RESET-2** | `resetEntriesForResettle` + `bulkSetReversal` + `clearReversalSnapshot` đều **KHÔNG bump version**. Đây là phase trung gian / internal field — tenant feed chỉ cần thấy 1 event sạch khi `bulkSettleEntries` re-settle xong (xem Decision Principle về version bump). |
| **R-REPO-1** | `EntryResettleRepository` chỉ query/update DB. Use case sinh UUIDv7, build snapshot, ghép batchKey rồi truyền data thuần vào repo. |
| **R-VALID-1** | Format validation (regex 20 số, drawId pattern) → zod ở route handler. Use case CHỈ check business state. |

---

## 4. Thay đổi entity schema

### 4.1. `EntryReversal` interface — file `packages/game-keno/src/entities/entry.ts`

Thêm interface và field `reversal?` **cùng cấp với `payout`**.

**Vị trí trong file**: Sau `EntryVoidInfo`, trước section `Entry Document`.

```typescript
/**
 * Snapshot REVERSAL transaction cho entry trong phiên resettle.
 *
 * Sinh ở `PrepareKenoResettleUseCase` BEFORE entries reset về Scheduled.
 * `EnqueueKenoReversalsUseCase` đọc snapshot này để build reversal order qua
 * `buildReversalOrder` và bulk insert vào outbox.
 * `FinalizeSettle` (resettle path) **KHÔNG** clear field này — giữ làm audit
 * trail của phiên resettle gần nhất (xem Decision Principle 28). Phiên resettle
 * KẾ TIẾP overwrite via `bulkSetReversal` (entries thắng cả 2 phiên) hoặc
 * wipe via `clearReversalSnapshot` ở `PrepareResettle.step1` (entries thắng
 * phiên cũ nhưng không thắng phiên mới).
 *
 * @example `{ reversalTx: "01907a12-...", reversalAmount: 200000, resettleId: "01907abc-..." }`
 */
export interface EntryReversal {
  /**
   * UUIDv7 — idempotency key cho REVERSAL order trong outbox.
   * Sinh MỚI trong `PrepareKenoResettleUseCase` (per entry).
   * KHÔNG copy từ `payout.payoutTx` cũ — payoutTx cũ là transaction đã
   * dispatch xong (FIFO outbox); reversal là transaction MỚI, độc lập, có
   * idempotency key riêng để outbox không trùng với payout cũ.
   */
  reversalTx: string;

  /**
   * Số tiền cần thu hồi (VND) = `payout.payoutAmount` TRƯỚC khi reset entry.
   * Invariant: reversalTx != null ⇒ reversalAmount > 0.
   */
  reversalAmount: number;

  /**
   * ID phiên resettle (UUIDv7) — sinh tại `TriggerResettleUseCase` (BO API),
   * propagate xuyên SFN tới đây. Trùng với batchKey suffix.
   * Dùng cho debug + tracing + truy vết qua `tenant_dispatch_orders.sourceContext.resettleId`.
   */
  resettleId: string;
}
```

Cập nhật `TicketEntryDoc` (sau field `payout?: EntryPayout;`):

```typescript
  /** Snapshot reversal transaction — chỉ có khi entry đang trong/đã qua phiên resettle. */
  reversal?: EntryReversal;
```

Export `EntryReversal` qua barrel `packages/game-keno/src/entities/index.ts`.

### 4.2. `DrawStatus` — KHÔNG thêm status mới

Dùng flow hiện có: `Settled → Published → Settling → Settled`.

Cập nhật `VALID_TRANSITIONS` trong `DrawRepository` (file `packages/game-keno-application/src/infras/repos/draw-repo.ts`):

```typescript
const VALID_TRANSITIONS: Record<string, Set<string>> = {
  [DrawStatus.Scheduled]: new Set([DrawStatus.SalesOpen, DrawStatus.Voiding]),
  [DrawStatus.SalesOpen]: new Set([DrawStatus.SalesClosed]),
  [DrawStatus.SalesClosed]: new Set([
    DrawStatus.SalesOpen,
    DrawStatus.Published,
    DrawStatus.Voiding,
  ]),
  [DrawStatus.Published]: new Set([DrawStatus.Settling, DrawStatus.Voiding]),
  [DrawStatus.Settling]: new Set([DrawStatus.Settled]),
  [DrawStatus.Voiding]: new Set([DrawStatus.Void]),

  // ─── MỚI: Resettle path. CHỈ cho Published, KHÔNG cho Voiding. ───
  // Khi đã Settled, kỳ là final state cho mọi quy trình void.
  // Sửa kết quả sai → republish → resettle để chỉnh data.
  [DrawStatus.Settled]: new Set([DrawStatus.Published]),
};
```

**Lý do KHÔNG cho `Settled → Voiding`**: Kỳ đã settle có nghĩa entries đã match + payout enqueue. Nếu cần void, phải xử lý ở giai đoạn trước khi `Settled` (tức là ở `Scheduled / SalesClosed / Published`). Một khi đã `Settled`, void không có ý nghĩa nghiệp vụ rõ ràng vì payout đã đi đến tenant.

### 4.3. `DrawDoc` — KHÔNG thêm `DrawResettleInfo`

Audit trail đầy đủ ở:
- `tenant_dispatch_orders` (batchKey prefix `keno:resettle:*`).
- `worker_locks` (lastSuccessAt + cursor cho debug).

Query "số lần resettle đã chạy cho 1 draw":

```javascript
db.tenant_dispatch_orders.distinct(
  "sourceContext.resettleId",
  { gameId: "keno", "sourceContext.drawId": "2026-03-07.045" }
).length
```

### 4.4. Resettle lock — KHÔNG tạo collection mới

Tận dụng `BusinessLockCoordinator` từ `@megawin/worker-core` — abstraction trên `WorkerLockRepository` (collection `worker_locks`) cho pattern **BO API acquire / Worker release**. KHÔNG cần migration / index mới — `worker_locks` đã sẵn sàng trong production.

**Vì sao là `BusinessLockCoordinator`, không phải `LockedWorkerUseCase`?**

`LockedWorkerUseCase` thiết kế cho **single-invocation lifecycle**: acquire → run → release trong cùng 1 Lambda. Resettle cần **cross-process lifecycle**: acquire ở BO API → SFN nhiều Lambda → release ở `FinalizeSettle` (Lambda khác). Hai pattern không thể gộp.

`BusinessLockCoordinator` cung cấp 3 method ngắn gọn cho pattern này:

```typescript
// BO API (TriggerResettleUseCase):
const ownerToken = await coordinator.acquire({
  lockKey: "keno:resettle:{drawId}",
  ttlSeconds: 300,
  heldErrorCode: "RESETTLE_LOCK_HELD",
  heldErrorMessage: "Kỳ quay đang được resettle ...",
});
// → throw AppException(heldErrorCode, heldErrorMessage) trực tiếp nếu held
//   → Next.js middleware tự render HTTP 409.

try {
  await drawRepo.triggerSettle(drawId);
  await startExecution({ ..., input: { drawId, lockOwnerToken: ownerToken, lockKey } });
} catch (err) {
  await coordinator.releaseOnRollback(lockKey, ownerToken, err);
  throw err;
}

// Worker (FinalizeSettleUseCase):
await coordinator.release({
  lockKey: resettleContext.lockKey,
  ownerToken: resettleContext.lockOwnerToken,
});
// → coordinator tự log warning nếu released = false, KHÔNG throw
```

**Ưu điểm:**

- Business layer chỉ thấy semantic `acquire`/`release`/`releaseOnRollback`, không lộ `tryAcquire`/`finalizeAndRelease`/`expiresAt` detail.
- Throw `AppException(heldErrorCode, ...)` trực tiếp khi acquire fail — caller không phải catch + wrap, error đi thẳng qua Next.js middleware HTTP 409.
- Reusable cho 6 game khác — đổi prefix `"keno:resettle:"` → `"{game}:resettle:"`.
- Underlying vẫn là `WorkerLockRepository` — không có 2 source-of-truth.

Convention `lockKey` cho Keno resettle:

```
keno:resettle:{drawId}
```

Ví dụ: `"keno:resettle:2026-03-07.045"`.

`ownerToken` random per acquire (`generateId()`) → truyền qua `resettleContext.lockOwnerToken` để `FinalizeSettle` release đúng owner.

### 4.5. MongoDB indexes mới

```javascript
// kenoTicketEntries — cho cursor query entries có payout > 0 + chưa snapshot reversal
db.kenoTicketEntries.createIndex(
  { drawId: 1, status: 1, "payout.winAmount": 1 },
  { name: "draw_status_payout_win_idx" },
);

// kenoTicketEntries — cho getEntriesWithReversalForDispatch (cursor reversalTx)
db.kenoTicketEntries.createIndex(
  { drawId: 1, "reversal.reversalTx": 1 },
  { name: "draw_reversal_tx_idx", sparse: true },
);
```

`worker_locks` đã có sẵn unique `{ lockKey: 1 }` — KHÔNG cần thêm.

---

## 5. Repository methods mới (chỉ DB ops, KHÔNG business logic)

> **Quy tắc R-REPO-1**: Repository chỉ làm query/update DB. KHÔNG sinh UUID, KHÔNG ghép business string, KHÔNG quyết định lifecycle data. Logic đó thuộc use case.
>
> Tách file `entry-resettle-repo.ts` riêng theo pattern `entry-void-repo.ts` đã có. KHÔNG mix vào `entry-repo.ts` (đã rất lớn — hơn 1500 dòng).

### 5.1. `EntryResettleRepository` (FILE MỚI)

**File**: `packages/game-keno-application/src/infras/repos/entry-resettle-repo.ts`

```typescript
/**
 * Keno – Entry Resettle Repository
 *
 * Collection: kenoTicketEntries (resettle-only DB operations)
 *
 * Tách riêng khỏi entry-repo.ts theo pattern entry-void-repo.ts:
 * - entry-repo.ts: insert, update, settle, financial aggregates (đã >1500 dòng)
 * - entry-void-repo.ts: read-only drill-down aggregates (voided)
 * - entry-resettle-repo.ts: query/update DB cho resettle flow
 *
 * RULE R-REPO-1: file này CHỈ chứa DB operations.
 * - KHÔNG sinh UUIDv7 (use case sinh).
 * - KHÔNG ghép business string (use case build).
 * - KHÔNG quyết định transition logic (use case đảm nhận).
 * - Repo nhận data đã chuẩn hoá từ use case rồi $set/bulkWrite.
 */

import { ObjectId } from "mongodb";
import { KenoCollections } from "@megawin/game-keno/entities";
import type { TicketEntryEntity, EntryReversal } from "@megawin/game-keno/entities";
import { EntryStatus } from "@megawin/game-core/entities";
import { BaseRepo } from "./base-repo";
import { EntryMapper } from "../mappers/entry-mapper";
import type { ReversalCandidate, ReversalEntryForDispatch } from "./types";

export class EntryResettleRepository extends BaseRepo<TicketEntryEntity, EntryMapper> {
  constructor() {
    super({
      collName: KenoCollections.TicketEntries,
      dataMapper: new EntryMapper(),
    });
  }

  // ─── Query 1: Liệt kê entries cần snapshot reversal ──────────────────

  /**
   * Cursor-paginated query entries cần snapshot reversal cho 1 draw.
   *
   * Filter:
   *   { drawId, status: Settled,
   *     "payout.winAmount": { $gt: 0 },
   *     "payout.payoutTx": { $exists: true },
   *     reversal: { $exists: false } }
   *
   * Sort: `{ _id: 1 }` để pagination ổn định.
   * Index dùng: `{ drawId: 1, status: 1, "payout.winAmount": 1 }`.
   *
   * @param afterId - cursor `_id` (hex string) của entry cuối batch trước
   * @returns Mảng candidate đủ data cho use case sinh `EntryReversal`.
   *          Use case sẽ sinh `reversalTx` UUIDv7 + ghép `resettleId` rồi gọi `bulkSetReversal`.
   */
  async listCandidatesForReversal(params: {
    drawId: string;
    afterId?: string;
    limit: number;
  }): Promise<ReversalCandidate[]> {
    const { drawId, afterId, limit } = params;

    const filter: Record<string, unknown> = {
      drawId,
      status: EntryStatus.Settled,
      "payout.winAmount": { $gt: 0 },
      "payout.payoutTx": { $exists: true },
      reversal: { $exists: false },
    };
    if (afterId) filter._id = { $gt: new ObjectId(afterId) };

    const docs = await this.findManyAsDocuments(filter, {
      sort: { _id: 1 },
      limit,
      projection: { _id: 1, "payout.payoutAmount": 1 },
    });

    return docs.map((d) => ({
      id: (d._id as ObjectId).toHexString(),
      payoutAmount: d.payout?.payoutAmount ?? 0,
    }));
  }

  // ─── Update 1: Bulk ghi reversal snapshot (data đã sẵn từ use case) ──

  /**
   * Bulk $set field `reversal` cho list entries — data đầy đủ do use case build.
   *
   * Idempotent qua filter `reversal: { $exists: false }` — replay sau crash an toàn.
   *
   * KHÔNG bump version: reversal là internal field cho dispatch (outbox đọc),
   * không phải business state mà tenant feed quan tâm. Tenant chỉ thấy
   * "payout cũ → payout mới" 1 lần khi resettle xong (bump ở `bulkSettleEntries`).
   *
   * @param items - mỗi item gồm entryId + EntryReversal đã build sẵn
   * @returns modifiedCount
   */
  async bulkSetReversal(
    items: Array<{ entryId: string; reversal: EntryReversal }>,
  ): Promise<{ modifiedCount: number }> {
    if (items.length === 0) return { modifiedCount: 0 };

    const now = new Date();

    const ops = items.map((item) => ({
      updateOne: {
        filter: { _id: new ObjectId(item.entryId), reversal: { $exists: false } },
        update: { $set: { reversal: item.reversal, updatedAt: now } },
      },
    }));

    const result = await this.bulkWrite(ops);
    return { modifiedCount: result.modifiedCount };
  }

  // ─── Update 2: Reset entries Settled → Scheduled ─────────────────────

  /**
   * Reset toàn bộ entries đã settled về Scheduled để Settle SFN replay với kết quả mới.
   *
   * Idempotent qua filter `status: Settled` — entries đã reset không match lần sau.
   *
   * Filter: `{ drawId, status: Settled }`
   * Update:
   *   $set: { status: Scheduled, updatedAt: now }
   *   $unset: { payout: "", outcome: "", result: "", hasCappablePrize: "" }
   *
   * **Đầy đủ field do `bulkSettleEntries` ghi (xem entry-repo.ts dòng 147-160)**:
   *   - `payout` (EntryPayout — boardPayouts, winAmount, payoutAmount, payoutTx, ...)
   *   - `outcome` ("win" | "loss")
   *   - `result` (EntryResult — snapshot draw result gắn vào entry)
   *   - `hasCappablePrize` (Keno-specific flag, chỉ có khi true → unset xoá là đúng)
   *
   * KHÔNG đụng:
   *   - `reversal`: đã snapshot trước đó, giữ nguyên cho `EnqueueReversals` đọc.
   *   - `updatedAt`: cập nhật ở `$set`.
   *   - Các field gốc place-bet (boards, tenant, account, ...) giữ nguyên.
   *
   * KHÔNG bump version: reset chỉ là phase TRUNG GIAN của workflow resettle.
   * Entry tạm thời ở Scheduled không có result/payout/outcome trong vài phút
   * cho đến khi `bulkSettleEntries` re-settle xong. Đây KHÔNG phải business
   * state có ý nghĩa với tenant; bump version ở đây sẽ:
   *   - Tenant feed nhận event "vé thắng 100K → payout=0, không có result"
   *     → UI flicker, webhook gửi player notification mâu thuẫn.
   *   - CDC stream/audit của tenant ghi nhận trạng thái vô nghĩa.
   *
   * Tenant CHỈ thấy 1 event sạch khi `bulkSettleEntries` re-settle ghi
   * payout/result/outcome mới (bump version ở đó). `SettleEntriesBatch` query
   * toàn bộ entries Scheduled (cả thắng và thua) → mọi entry được bump version
   * đúng 1 lần ở re-settle, không có entry nào kẹt version cũ.
   *
   * @returns modifiedCount
   */
  async resetEntriesForResettle(drawId: string): Promise<{ modifiedCount: number }> {
    const now = new Date();

    const result = await this.updateMany(
      { drawId, status: EntryStatus.Settled },
      {
        $set: {
          status: EntryStatus.Scheduled,
          updatedAt: now,
        },
        $unset: {
          payout: "",
          outcome: "",
          result: "",
          hasCappablePrize: "",
        },
      },
    );

    return { modifiedCount: result.modifiedCount };
  }

  // ─── Update 3: Clear reversal snapshot phiên cũ ──────────────────────

  /**
   * $unset field `reversal` cho entries của draw — chuẩn bị phiên resettle mới.
   *
   * **CHỈ gọi ở `PrepareResettle` step 1** (replay-safe wipe trước
   * `bulkSetReversal`). KHÔNG còn gọi ở `FinalizeSettle` resettle path —
   * `reversal` field giữ làm audit trail (xem Decision Principle 28).
   *
   * Bắt buộc cho correctness: entries thắng phiên N-1 nhưng KHÔNG thắng phiên
   * N sẽ lingers reversal phiên N-1 nếu không wipe trước → `EnqueueReversals`
   * phiên N query `$exists: true` trả set sai → DOUBLE-DEBIT.
   *
   * Idempotent — không có doc match thì 0 modified, OK.
   * KHÔNG ảnh hưởng outbox (orders reversal phiên cũ đã dispatch xong nếu chạy phiên kế).
   *
   * KHÔNG bump version: cùng lý do với `bulkSetReversal` — reversal là internal
   * field cho dispatch, không phải business state quan tâm với tenant.
   *
   * @returns modifiedCount
   */
  async clearReversalSnapshot(drawId: string): Promise<{ modifiedCount: number }> {
    const now = new Date();

    const result = await this.updateMany(
      { drawId, reversal: { $exists: true } },
      {
        $set: { updatedAt: now },
        $unset: { reversal: "" },
      },
    );

    return { modifiedCount: result.modifiedCount };
  }

  // ─── Query 2: Cursor query entries có reversal cho dispatch ──────────

  /**
   * Cursor query entries có `reversal.reversalTx` — input cho `EnqueueKenoReversalsUseCase`.
   *
   * Sort/cursor theo `reversal.reversalTx` ASC (UUIDv7 time-sortable).
   *
   * Filter:
   *   { drawId,
   *     "reversal.reversalTx": afterTx ? { $gt: afterTx } : { $exists: true } }
   *
   * Index dùng: `{ drawId: 1, "reversal.reversalTx": 1 }` (sparse).
   */
  async getEntriesWithReversalForDispatch(params: {
    drawId: string;
    afterTx?: string;
    limit: number;
  }): Promise<ReversalEntryForDispatch[]> {
    const { drawId, afterTx, limit } = params;

    const docs = await this.findManyAsDocuments(
      {
        drawId,
        "reversal.reversalTx": afterTx ? { $gt: afterTx } : { $exists: true },
      },
      {
        sort: { "reversal.reversalTx": 1 },
        limit,
        projection: {
          _id: 1,
          tenantId: 1,
          accountId: 1,
          username: 1,
          "entrySummary.ticketNo": 1,
          "reversal.reversalAmount": 1,
          "reversal.reversalTx": 1,
        },
      },
    );

    return docs.map((d) => ({
      id: (d._id as ObjectId).toHexString(),
      tenantId: d.tenantId,
      accountId: d.accountId,
      username: d.username,
      ticketNo: d.entrySummary?.ticketNo ?? "",
      reversalAmount: d.reversal?.reversalAmount ?? 0,
      reversalTx: d.reversal?.reversalTx ?? "",
    }));
  }
}
```

**Quyết định KHÔNG bump `version` ở 3 update của Resettle** (reversed từ design ban đầu sau khi review impact với tenant feed):

`version` là **change-feed cho tenant**, không phải audit log cho ops. Worker `sync-entry-feed` mirror business state (status, result, outcome, payout) lên `entryFeed` để tenant đọc. Mỗi version bump = 1 event tenant nhìn thấy.

**3 update của Resettle KHÔNG được bump version**:

1. **`bulkSetReversal`** — set `reversal` snapshot (internal field cho outbox dispatch).
2. **`resetEntriesForResettle`** — reset Settled → Scheduled ($unset payout/result/outcome).
3. **`clearReversalSnapshot`** — $unset `reversal` (cleanup internal field).

**Lý do**:
- 3 update này tạo ra trạng thái TRUNG GIAN VÔ NGHĨA với tenant: vé từng "thắng 100K" tạm thời mất result/payout/outcome trong vài phút cho đến khi `bulkSettleEntries` re-settle xong.
- Bump version ở đây → tenant feed nhận event "vé thắng 100K → payout=0 không có result" → UI flicker, webhook gửi player notification mâu thuẫn, CDC stream ghi nhận trạng thái không có ý nghĩa nghiệp vụ.

**Tenant CHỈ thấy 1 event sạch**:
- Sau khi `bulkSettleEntries` re-settle ghi payout/result/outcome MỚI (bump version ở đó).
- Tenant feed nhận **1 event duy nhất** mirror đúng "payout cũ → payout mới".

**Đảm bảo không entry nào kẹt version cũ**:
- `SettleEntriesBatchUseCase` query `getScheduledEntries(drawId)` — không filter outcome → fetch toàn bộ entries Scheduled (cả thắng và thua).
- `bulkSettleEntries` ghi cho TẤT CẢ entries trong batch (bump version đồng nhất 1 lần per entry).
- `bulkApplyPayoutCap` (nếu có) bump version lần nữa khi cap top prize → tenant nhận event "payout amount điều chỉnh" — VẪN CÓ ý nghĩa nghiệp vụ với tenant nên bump là đúng.

**Edge case "crash giữa reset và bulkSettleEntries"**:
- Entries kẹt ở Scheduled mà tenant feed vẫn thấy version cũ (Settled với payout cũ) → đây là điều MONG MUỐN: tenant không cần biết phase trung gian.
- Resettle SFN có retry + alarm; ops can thiệp nếu kẹt > threshold; cuối cùng `bulkSettleEntries` chạy xong → 1 event sạch lên feed.

### 5.2. Aggregate result types

**File**: `packages/game-keno-application/src/infras/repos/types/entry.types.ts`

Thêm 2 interface:

```typescript
/**
 * Shape tối thiểu cho `listCandidatesForReversal` — input cho use case sinh
 * `EntryReversal { reversalTx, reversalAmount, resettleId }`.
 */
export interface ReversalCandidate {
  id: string;
  /** Số tiền cần thu hồi (VND) = `payout.payoutAmount` snapshot. */
  payoutAmount: number;
}

/**
 * Shape tối thiểu cho `getEntriesWithReversalForDispatch` — dùng bởi
 * `EnqueueKenoReversalsUseCase` để build `TenantDispatchOrderInput` qua
 * `buildReversalOrder`.
 */
export interface ReversalEntryForDispatch {
  id: string;
  tenantId: string;
  accountId: string;
  username: string;
  ticketNo: string;
  /** Số tiền cần thu hồi (VND). */
  reversalAmount: number;
  /** UUIDv7 idempotency key — seed vào `tenant_dispatch_orders.tx`. */
  reversalTx: string;
}
```

Re-export qua `repos/types/index.ts`:

```typescript
export type { ReversalCandidate, ReversalEntryForDispatch } from "./entry.types";
```

### 5.3. `DrawRepository` — Methods `republishResultAfterSettled` + `updateVietlottRef`

**File**: `packages/game-keno-application/src/infras/repos/draw-repo.ts`

Thêm 2 method mới sau `publishResult`:

```typescript
  /**
   * Atomic transition Settled → Published khi staff sửa kết quả (winningNumbers) sai.
   *
   * Yêu cầu: `VALID_TRANSITIONS[Settled]` phải include `Published` (xem sect 4.2).
   *
   * Atomic — chỉ thực thi nếu draw thực sự đang ở Settled.
   * Clear snapshot settle để Settle SFN tạo lại từ đầu khi resettle:
   *   $unset: financial, stats, settleSummary
   *
   * KHÔNG $unset `settledAt` — đây là high-water mark lịch sử settle, dùng để
   * phân biệt "Settle lần đầu" vs "Resettle". Sẽ được overwrite khi resettle xong.
   *
   * KHÔNG đụng `vietlottRef` — sửa metadata tham chiếu thuộc endpoint riêng
   * `updateVietlottRef` (xem method dưới), không gộp vào republish vì sửa
   * vietlottRef KHÔNG yêu cầu resettle.
   *
   * KHÔNG đụng entries — entries reset bởi `PrepareKenoResettleUseCase`.
   *
   * Return null nếu draw không ở Settled → use case trả 409 Conflict.
   *
   * @param drawId - Format `YYYY-MM-DD.NNN`
   * @param result - Kết quả quay mới (use case đã compute stats)
   */
  async republishResultAfterSettled(
    drawId: string,
    result: DrawResult,
  ): Promise<DrawEntity | null> {
    const allowed = VALID_TRANSITIONS[DrawStatus.Settled];
    if (!allowed?.has(DrawStatus.Published)) return null;

    return await this.findOneAndUpdate(
      { drawId, status: DrawStatus.Settled },
      {
        $set: {
          status: DrawStatus.Published,
          result,
          updatedAt: new Date(),
        },
        $unset: {
          financial: "",
          stats: "",
          settleSummary: "",
        },
      },
      { returnDocument: "after" },
    );
  }

  /**
   * Update CHỈ `vietlottRef` — không đụng status / result / settle data.
   *
   * `vietlottRef` là metadata tham chiếu sang Vietlott (drawPeriod, drawDate),
   * KHÔNG tham gia matching / payout → sửa field này KHÔNG yêu cầu resettle.
   *
   * Cho phép ở `Published` / `Settling` / `Settled` (sau publish trở đi).
   * Trước publish staff dùng `publishResult` để nhập cả vietlottRef cùng result.
   *
   * Atomic, idempotent — gọi nhiều lần với cùng giá trị OK.
   * Return null nếu draw status không nằm trong scope cho phép.
   */
  async updateVietlottRef(
    drawId: string,
    vietlottRef: DrawVietlottRef,
  ): Promise<DrawEntity | null> {
    return await this.findOneAndUpdate(
      {
        drawId,
        status: { $in: [DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled] },
      },
      {
        $set: { vietlottRef, updatedAt: new Date() },
      },
      { returnDocument: "after" },
    );
  }
```

### 5.4. `DispatchOrderRepository` — KHÔNG cần method mới

Theo decision G ("KHÔNG check `aggregateBatchProgress` của batch dispatch trước"), `TriggerResettleUseCase` không inject `DispatchOrderRepository` và không cần method `findRecentBatchKeyByDraw`. Outbox FIFO per tenant đã tự đảm bảo thứ tự dispatch — block ở BO API chỉ tạo deadlock khi tenant offline.

→ KHÔNG thêm method mới. KHÔNG thêm index `{ gameId, "sourceContext.drawId", createdAt }`.

### 5.5. Repo barrel export

**File**: `packages/game-keno-application/src/infras/repos/index.ts`

Thêm vào sau `EntryVoidRepository` export:

```typescript
export { EntryResettleRepository } from "./entry-resettle-repo";
```

### 5.6. WorkerLock — KHÔNG cần repo riêng

Import `BusinessLockCoordinator` từ `@megawin/worker-core` ở 2 nơi:
- `TriggerKenoResettleUseCase` (BO API) — `acquire` + `releaseOnRollback` khi transition/StartExecution fail.
- `FinalizeSettleUseCase` (worker, chỉ resettle path) — `release` qua `lockOwnerToken` đã propagate qua `ResettleContext`.

### 5.7. Package dependencies

**File**: `packages/game-keno-application/package.json`

Thêm dependency:

```json
{
  "dependencies": {
    "@megawin/worker-core": "workspace:*"
  }
}
```

---

## 6. Use Cases — BO API (operator)

> **Vị trí**: `packages/game-keno-application/src/use-cases/draws/` — cùng chỗ với `publish-result.ts`, `trigger-settle.ts`, `void-draw.ts` đã có.
>
> **Base class**: `NextApiUseCase`.
>
> **Pattern**: `private readonly xxxRepo = new XxxRepository();` instance property, KHÔNG DI container.
>
> **R-VALID-1**: Use case CHỈ check business state (status, lock, balance). Format input (regex 20 số, drawId pattern) đã được zod validate ở route handler.

### 6.0. `UpdateVietlottRefUseCase` — sửa CHỈ vietlottRef không cần resettle

**Vấn đề cần giải quyết:** `vietlottRef` chỉ là metadata tham chiếu (drawPeriod, drawDate hiển thị cross-link sang Vietlott), KHÔNG tham gia matching numbers / payout calculation. Nếu staff phát hiện `vietlottRef` nhập sai sau khi đã settle, **không có lý do gì phải resettle** — resettle sẽ chạy lại reverse + payout transactions cho cả tenant, lãng phí outbox slot.

**Quyết định thiết kế (đã chốt):**

- **Endpoint riêng** `POST /api/{game}/draws/{drawId}/vietlott-ref` — single responsibility, REST endpoint dành riêng.
- **Method `POST`** — đồng bộ với toàn bộ BO API (`publish-result`, `republish-result`, `trigger-settle`, `trigger-resettle` đều POST).
- **Scope status**: cho phép sửa khi draw `Published` / `Settling` / `Settled` (sau publish trở đi). Trước publish (`Scheduled`/`SalesOpen`/`SalesClosed`) staff dùng `publish-result` luôn — không cần endpoint riêng vì lúc đó còn chưa có result.
- **Bỏ `vietlottRef` khỏi `RepublishResultUseCase`** — single responsibility cao hơn, tránh staff click "Sửa kết quả" chỉ để fix vietlottRef.

**File**: `packages/game-keno-application/src/use-cases/draws/update-vietlott-ref.ts`

```typescript
/**
 * Use Case: Cập nhật `vietlottRef` cho 1 draw đã publish trở đi.
 *
 * `vietlottRef` là metadata tham chiếu sang Vietlott (drawPeriod, drawDate),
 * KHÔNG tham gia matching numbers / payout calculation → sửa field này
 * KHÔNG yêu cầu resettle.
 *
 * Cho phép ở status `Published`, `Settling`, `Settled`. Trước đó (chưa có
 * result) → staff dùng `publish-result` để nhập cả `winningNumbers` lẫn
 * `vietlottRef` cùng lúc.
 *
 * Atomic. Idempotent — gọi nhiều lần với cùng giá trị OK.
 *
 * INPUT FORMAT đã được zod validate ở route handler.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { DrawRepository } from "../../infras/repos/draw-repo";

const UPDATABLE_STATUSES = new Set<string>([
  DrawStatus.Published,
  DrawStatus.Settling,
  DrawStatus.Settled,
]);

export interface UpdateVietlottRefInput {
  drawId: string;
  vietlottRef: {
    drawPeriod: string;
    drawDate: string;
  };
}

export interface UpdateVietlottRefOutput {
  drawId: string;
  vietlottRef: {
    drawPeriod: string;
    drawDate: string;
  };
}

export class UpdateVietlottRefUseCase extends NextApiUseCase<
  UpdateVietlottRefInput,
  UpdateVietlottRefOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: UpdateVietlottRefInput): Promise<UpdateVietlottRefOutput> {
    const draw = await this.drawRepo.getDrawById(input.drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
    }

    if (!UPDATABLE_STATUSES.has(draw.status)) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể sửa vietlottRef – draw đang ở "${draw.status}". ` +
          `Chỉ sửa được sau khi đã publish kết quả.`,
      );
    }

    const updated = await this.drawRepo.updateVietlottRef(input.drawId, input.vietlottRef);
    if (!updated) {
      throw AppException.internal(
        `Cập nhật vietlottRef kỳ ${input.drawId} thất bại — draw status đã thay đổi đồng thời.`,
      );
    }

    return {
      drawId: input.drawId,
      vietlottRef: input.vietlottRef,
    };
  }
}
```

**Repo method tương ứng** trong `DrawRepository`:

```typescript
/**
 * Update CHỈ `vietlottRef` — không đụng status, không unset settle data.
 *
 * Filter: cho phép ở `Published` / `Settling` / `Settled` (sau publish trở đi).
 * Atomic, idempotent.
 */
async updateVietlottRef(
  drawId: string,
  vietlottRef: DrawVietlottRef,
): Promise<DrawEntity | null> {
  return await this.findOneAndUpdate(
    {
      drawId,
      status: { $in: [DrawStatus.Published, DrawStatus.Settling, DrawStatus.Settled] },
    },
    {
      $set: { vietlottRef, updatedAt: new Date() },
    },
    { returnDocument: "after" },
  );
}
```

**Route handler** `apps/backoffice/src/app/api/keno/draws/[drawId]/vietlott-ref/route.ts`:

```typescript
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { UpdateVietlottRefUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { vietlottRefSchema } from "../_lib/schema";

const useCase = new UpdateVietlottRefUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(vietlottRefSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return useCase.run({ drawId, vietlottRef: body });
  });
```

**Schema mới** trong `apps/backoffice/src/app/api/keno/draws/[drawId]/_lib/schema.ts`:

```typescript
/**
 * Schema cho endpoint `vietlott-ref` — sửa CHỈ vietlottRef không kèm winningNumbers.
 */
export const vietlottRefSchema = z.object({
  drawPeriod: z.string().min(1),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export type VietlottRefBody = z.infer<typeof vietlottRefSchema>;
```

**Frontend integration:**

- Hook mới `useUpdateVietlottRef` trong `apps/backoffice/src/app/(main)/games/keno/operations/_lib/use-operations.ts` — pattern y `useRepublishResult`.
- Trong `publish-result-action.tsx`: ở chế độ "Republish" (status = Settled), **ẩn input `vietlottRef`** (không cho sửa cùng winningNumbers).
- Thêm action button riêng "Sửa tham chiếu Vietlott" mở dialog mỏng chỉ có 2 input `drawPeriod` + `drawDate` → call `useUpdateVietlottRef`. Hiển thị khi status `Published`/`Settling`/`Settled`.

### 6.1. `RepublishKenoResultUseCase`

**File**: `packages/game-keno-application/src/use-cases/draws/republish-result.ts`

```typescript
/**
 * Use Case: Republish kết quả Keno cho 1 kỳ đã Settled.
 *
 * Bước 1 trong flow resettle (xem keno-resettle.plan.md Section 2).
 *
 * CHỈ sửa `winningNumbers` — `vietlottRef` đã được tách thành endpoint riêng
 * `UpdateVietlottRefUseCase` (Section 6.0) vì sửa metadata tham chiếu KHÔNG
 * yêu cầu resettle.
 *
 * Atomic. Idempotent qua filter `status === Settled` (chạy 2 lần lần 2 throw).
 * KHÔNG đụng entries / outbox — chỉ chuyển trạng thái draw.
 *
 * INPUT FORMAT đã được zod validate ở route handler — use case KHÔNG re-check
 * regex/length của winningNumbers.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { computeDrawStats } from "@megawin/game-keno/helpers";
import { nowVN } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";

export interface RepublishKenoResultInput {
  drawId: string;
  /** 20 số trúng — đã được zod validate (regex `^(0[1-9]|[1-7]\d|80)$`, length 20). */
  winningNumbers: string[];
}

export interface RepublishKenoResultOutput {
  drawId: string;
  status: string;
  result: {
    winningNumbers: string[];
    publishedAt: string;
  };
}

export class RepublishKenoResultUseCase extends NextApiUseCase<
  RepublishKenoResultInput,
  RepublishKenoResultOutput
> {
  private readonly drawRepo = new DrawRepository();

  protected async execute(input: RepublishKenoResultInput): Promise<RepublishKenoResultOutput> {
    const publishedAt = nowVN();
    const stats = computeDrawStats(input.winningNumbers);

    const resultData = {
      winningNumbers: input.winningNumbers,
      ...stats,
      publishedAt,
    };

    const updated = await this.drawRepo.republishResultAfterSettled(input.drawId, resultData);

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(input.drawId);
      if (!draw) {
        throw AppException.notFound(`Kỳ quay ${input.drawId} không tồn tại.`);
      }
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể republish – draw đang ở "${draw.status}", chỉ republish được khi "settled".`,
      );
    }

    return {
      drawId: input.drawId,
      status: updated.status,
      result: {
        winningNumbers: input.winningNumbers,
        publishedAt: publishedAt.toISOString(),
      },
    };
  }
}
```

> **Đồng bộ với repo**: `republishResultAfterSettled(drawId, result)` — bỏ tham số `vietlottRef`, signature 2 args (xem Section 5.3).

### 6.2. `TriggerKenoResettleUseCase`

**File**: `packages/game-keno-application/src/use-cases/draws/trigger-resettle.ts`

```typescript
/**
 * Use Case: Trigger Keno Resettle SFN.
 *
 * Bước 2 trong flow resettle.
 *
 * Flow (cùng pattern với TriggerSettleUseCase — accept retry, deterministic name):
 *   1. Validate draw exists + có result.
 *   2. Validate đây là RESETTLE thực sự (không phải Settle lần đầu):
 *        - draw.settledAt PHẢI tồn tại (đã settle ít nhất 1 lần).
 *        - draw.result.publishedAt > draw.settledAt (có republish kết quả mới sau lần settle gần nhất).
 *      → Chặn case staff nhấn nhầm "Kết sổ lại" trên draw vừa publish lần đầu chưa từng settle.
 *   3. Validate `status ∈ {Published, Settling}`. Settling = retry sau lần
 *      `startExecution` fail trước. Mọi status khác → reject.
 *   4. Sinh resettleId (UUIDv7) — đi vào SFN INPUT để Lambda dùng làm snapshot
 *      key/tracing. KHÔNG dùng để build execution name.
 *   5. Acquire WorkerLock lockKey="keno:resettle:{drawId}", TTL 300s.
 *      PHẢI acquire TRƯỚC transition status + StartExecution.
 *   6. Transition Published → Settling qua drawRepo.triggerSettle.
 *      Skip nếu status đã Settling (retry case).
 *   7. StartExecution Resettle SFN với name DETERMINISTIC theo (drawId, settledAt):
 *      `{toExecutionName(drawId)}-resettle-{settledAt.getTime()}`.
 *      AWS idempotent ở mức StartExecution: retry cùng phiên trả về execution
 *      hiện tại thay vì throw ExecutionAlreadyExists. settledAt chỉ đổi sau khi
 *      FinalizeSettle ghi lại → 2 phiên resettle khác có 2 execution name khác.
 *   8. Rollback CHỈ release lock nếu (6) hoặc (7) fail. KHÔNG rollback transition
 *      Published → Settling: retry tiếp theo rơi vào nhánh "đã Settling, skip
 *      transition" + cùng deterministic name → idempotent end-to-end.
 *
 * KHÔNG check `aggregateBatchProgress` của batch dispatch trước (xem decision G):
 *   - Outbox FIFO per tenant tự đảm bảo Reversal trước Payout cùng player.
 *   - Tenant offline → block resettle vô thời hạn → deadlock không tự giải.
 *   - Đồng nhất với TriggerSettleUseCase.
 *
 * IDEMPOTENT:
 *   - Status filter cho phép retry an toàn (Published lần đầu, Settling lần retry).
 *   - SFN execution name deterministic theo (drawId, settledAt) → AWS idempotent.
 *   - BusinessLockCoordinator chống 2 staff click cùng lúc → 1 thắng, 1 fail 409.
 *
 * INPUT FORMAT đã được zod validate ở route handler — drawId regex.
 */

import { NextApiUseCase } from "@megawin/next/server";
import { AppException } from "@megawin/shared/errors";
import { DrawStatus } from "@megawin/game-core/entities";
import { toExecutionName } from "@megawin/game-core/utils";
import { startExecution } from "@megawin/app-core/aws/sf";
import { generateId, logError } from "@megawin/shared/utils";
import { BusinessLockCoordinator } from "@megawin/worker-core";
import { DrawRepository } from "../../infras/repos/draw-repo";

const LOCK_TTL_SECONDS = 300;

export interface TriggerKenoResettleInput {
  drawId: string;
  /** ARN của Step Function resettle Keno. */
  KENO_RESETTLE_SFN_ARN: string;
}

export interface TriggerKenoResettleOutput {
  drawId: string;
  status: string;
  resettleId: string;
  lockOwnerToken: string;
}

export class TriggerKenoResettleUseCase extends NextApiUseCase<
  TriggerKenoResettleInput,
  TriggerKenoResettleOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly lockCoordinator = new BusinessLockCoordinator();

  protected async execute(input: TriggerKenoResettleInput): Promise<TriggerKenoResettleOutput> {
    const { drawId } = input;

    // ── Step 1: validate draw + result ───────────────────────────────
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Kỳ quay ${drawId} không tồn tại.`);
    }
    if (!draw.result) {
      throw AppException.badRequest("Chưa có kết quả quay – phải republish result trước khi resettle.");
    }

    // ── Step 2: phân biệt Settle lần đầu vs Resettle ─────────────────
    if (!draw.settledAt) {
      throw new AppException(
        "DRAW_NEVER_SETTLED",
        `Kỳ quay ${drawId} chưa từng được kết sổ. Vui lòng dùng "Kết sổ" (trigger-settle) thay vì "Kết sổ lại".`,
      );
    }
    const resultPublishedAt = draw.result.publishedAt;
    if (!resultPublishedAt || resultPublishedAt.getTime() <= draw.settledAt.getTime()) {
      throw new AppException(
        "DRAW_NO_NEW_RESULT",
        `Không thể resettle – chưa có kết quả mới sau lần kết sổ gần nhất.`,
      );
    }

    // ── Step 3: validate status ──────────────────────────────────────
    // Cho phép `Published` (lần đầu) HOẶC `Settling` (retry sau lần startExecution
    // fail). Mọi status khác → invalid.
    if (draw.status !== DrawStatus.Published && draw.status !== DrawStatus.Settling) {
      throw new AppException(
        "DRAW_INVALID_TRANSITION",
        `Không thể resettle – draw đang ở "${draw.status}", yêu cầu phải cập nhật kết quả mới trước khi resettle.`,
      );
    }

    // ── Step 4: sinh resettleId (session key cho SFN INPUT) ──────────
    // Sinh ở đây để propagate xuyên SFN — PrepareResettle Lambda KHÔNG sinh mới
    // (mỗi retry/replay sẽ ra resettleId khác → phá idempotent snapshot).
    // LƯU Ý: KHÔNG dùng resettleId để build execution name (xem step 7).
    const resettleId = generateId();

    // ── Step 5: acquire business lock TRƯỚC mọi side-effect ──────────
    const lockKey = `keno:resettle:${drawId}`;
    const lockOwnerToken = await this.lockCoordinator.acquire({
      lockKey,
      ttlSeconds: LOCK_TTL_SECONDS,
      heldErrorCode: "RESETTLE_LOCK_HELD",
      heldErrorMessage:
        `Kỳ quay ${drawId} đang được resettle bởi phiên khác. ` +
        `Vui lòng đợi ~5 phút hoặc liên hệ admin.`,
    });

    // ── Step 6+7: transition status (skip nếu đã Settling) + start SFN ─
    try {
      // Skip transition nếu đã Settling (retry case): drawRepo.triggerSettle
      // filter strict status = Published, đã Settling thì returns null → tránh
      // false positive "DRAW_INVALID_TRANSITION".
      if (draw.status !== DrawStatus.Settling) {
        const updated = await this.drawRepo.triggerSettle(drawId);
        if (!updated) {
          throw new AppException(
            "DRAW_INVALID_TRANSITION",
            `Không thể transition draw ${drawId} Published → Settling (đã đổi status?).`,
          );
        }
      }

      // Execution name DETERMINISTIC theo (drawId, settledAt) để AWS idempotent
      // ở mức StartExecution: retry cùng phiên trả về execution hiện tại thay
      // vì throw ExecutionAlreadyExists.
      //
      // KHÔNG dùng resettleId vì sinh mới mỗi request → execution name khác →
      // retry sau startExecution fail tạo execution mới với resettleId mới,
      // input bất nhất với snapshot có thể đã ghi.
      //
      // settledAt chỉ đổi khi FinalizeSettle ghi lại sau khi 1 phiên hoàn tất
      // → trong 1 phiên dở dang nó không đổi → execution name ổn định.
      const settledAtToken = draw.settledAt.getTime();
      await startExecution({
        stateMachineArn: input.KENO_RESETTLE_SFN_ARN,
        name: `${toExecutionName(drawId)}-resettle-${settledAtToken}`,
        input: { drawId, resettleId, lockOwnerToken, lockKey },
      });

      return {
        drawId,
        status: DrawStatus.Settling,
        resettleId,
        lockOwnerToken,
      };
    } catch (err) {
      // Rollback CHỈ release lock — owner sau retry ngay (không đợi TTL).
      // KHÔNG rollback transition Published → Settling: retry tiếp theo rơi vào
      // nhánh "đã Settling, skip transition" + cùng deterministic name → AWS
      // idempotent end-to-end. Rollback ngược về Published chỉ thêm DB write
      // thừa, không tăng safety.
      await this.lockCoordinator.releaseOnRollback(lockKey, lockOwnerToken, err);
      logError("TriggerKenoResettle", err, { drawId, resettleId });
      if (err instanceof AppException) throw err;
      throw new AppException(
        "SFN_START_FAILED",
        "Không thể khởi chạy Keno resettle worker.",
      );
    }
  }
}
```

### 6.3. Cập nhật barrel `use-cases/draws/index.ts`

Thêm exports:

```typescript
export { UpdateVietlottRefUseCase } from "./update-vietlott-ref";
export type {
  UpdateVietlottRefInput,
  UpdateVietlottRefOutput,
} from "./update-vietlott-ref";

export { RepublishKenoResultUseCase } from "./republish-result";
export type {
  RepublishKenoResultInput,
  RepublishKenoResultOutput,
} from "./republish-result";

export { TriggerKenoResettleUseCase } from "./trigger-resettle";
export type {
  TriggerKenoResettleInput,
  TriggerKenoResettleOutput,
} from "./trigger-resettle";
```

---

## 7. Use Cases — Worker (resettle SFN steps)

> **Vị trí**: `packages/game-keno-application/src/use-cases/resettle/` — folder mới, song song với `settle/`, `void/`.
>
> **Base class**: `InternalUseCase`.
>
> **Pattern**: instance property `new XxxRepository()`, KHÔNG DI container.
>
> **R-REPO-1**: Use case sinh UUIDv7, build snapshot object, ghép batchKey. Repo chỉ DB ops.

### 7.1. `PrepareKenoResettleUseCase`

**File**: `packages/game-keno-application/src/use-cases/resettle/prepare-resettle.ts`

Logic chính nằm ở use case (sinh `reversalTx` UUIDv7, ghép batchKey). Repo chỉ list candidates, bulk set, reset, clear. **`resettleId` BẮT BUỘC truyền từ caller** — KHÔNG sinh ở Lambda để retry/replay idempotent:

```typescript
/**
 * Use Case: Prepare Keno Resettle (Step 1 của Resettle SFN).
 *
 * Trách nhiệm:
 *   - Validate `resettleId` từ caller (BO API TriggerResettle đã sinh và
 *     propagate qua SFN input). KHÔNG sinh ở Lambda — sinh mới mỗi lần
 *     replay sẽ phá idempotent snapshot.
 *   - Cursor-loop list candidates → sinh MỚI `reversalTx` (UUIDv7) per entry
 *     → bulk set `EntryReversal { reversalTx, reversalAmount=payoutAmount, resettleId }`.
 *     KHÔNG copy `payout.payoutTx` cũ — reversal là transaction mới độc lập.
 *   - Reset entries Settled → Scheduled (full $unset).
 *   - Clear reversal phiên cũ TRƯỚC khi snapshot phiên mới.
 *
 * NOTE: `reversalBatchKey` KHÔNG build ở đây — `EnqueueReversalsUseCase` tự
 * derive từ `drawId + resettleId` (theo cùng convention naming với
 * `payoutBatchKey` ở settle path) để giảm field thừa trong SFN ctx (xem
 * Decision I + J).
 *
 * IDEMPOTENT đa tầng:
 *   - status filter: chỉ Settling mới qua check (BO API đã transition).
 *   - clearReversalSnapshot: $unset reversal cũ — phiên mới ghi lại.
 *   - bulkSetReversal: filter `status: Settled` → entries đã reset bị skip.
 *   - resetEntriesForResettle: filter `status: Settled` → entries đã reset bỏ qua.
 *
 * NOTE replay edge case: nếu Lambda crash giữa `bulkSetReversal` (một số
 * entries đã ghi `reversalTx_v1`, một số chưa), replay sẽ:
 *   1. `clearReversalSnapshot` xoá hết → re-snapshot với `reversalTx_v2`.
 *   2. Outbox unique index `tx` đảm bảo không enqueue trùng nếu `reversalTx_v1`
 *      đã được dispatch trước đó.
 *
 * CRASH-SAFE: SFN retry chạy lại toàn bộ, không corrupt data.
 *
 * @throws AppException nếu draw không tồn tại, không ở Settling, hoặc thiếu `resettleId`.
 */

import { InternalUseCase, AppException } from "@megawin/app-core/use-cases";
import { DrawStatus } from "@megawin/game-core/entities";
import { generateId } from "@megawin/shared/utils";
import { DrawRepository } from "../../infras/repos/draw-repo";
import { EntryResettleRepository } from "../../infras/repos/entry-resettle-repo";

const SNAPSHOT_BATCH = 500;

export interface PrepareKenoResettleInput {
  drawId: string;
  /**
   * ID phiên resettle (UUIDv7) — sinh tại `TriggerResettle` BO API, BẮT BUỘC
   * propagate qua SFN input. Không optional vì retry/replay phải dùng cùng
   * giá trị; sinh mới ở Lambda sẽ phá idempotency snapshot.
   */
  resettleId: string;
  /** Owner token `WorkerLock` — propagate để `FinalizeSettle` release. */
  lockOwnerToken: string;
}

export interface PrepareKenoResettleOutput {
  drawId: string;
  /** Echo từ input để propagate xuôi SFN. */
  resettleId: string;
  /** Echo từ input để propagate xuôi SFN. */
  lockOwnerToken: string;
}

export class PrepareKenoResettleUseCase extends InternalUseCase<
  PrepareKenoResettleInput,
  PrepareKenoResettleOutput
> {
  private readonly drawRepo = new DrawRepository();
  private readonly entryResettleRepo = new EntryResettleRepository();

  protected async execute(
    input: PrepareKenoResettleInput,
  ): Promise<PrepareKenoResettleOutput> {
    const { drawId, resettleId, lockOwnerToken } = input;

    // ── Validate input ───────────────────────────────────────────────
    if (!resettleId) {
      throw AppException.badRequest(
        `PrepareResettle yêu cầu \`resettleId\` từ caller — không sinh ở đây để đảm bảo idempotent qua replay.`,
      );
    }

    // ── Validate draw status ─────────────────────────────────────────
    // BO API đã transition Published → Settling trước khi StartExecution.
    // SFN nhận draw đã ở Settling. (Cùng contract với Settle SFN.)
    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }
    if (draw.status !== DrawStatus.Settling) {
      throw AppException.badRequest(
        `Draw ${drawId} status = "${draw.status}", expected "settling".`,
      );
    }

    // ── Step 1: Clear reversal snapshot phiên cũ (idempotent) ────────
    // Cũng đảm bảo idempotent với chính phiên hiện tại khi Lambda replay
    // giữa chừng — entries đã ghi `reversalTx_v1` sẽ bị clear, sau đó
    // re-snapshot với `reversalTx_v2`. Outbox unique index `tx` đảm bảo
    // không enqueue trùng nếu v1 đã được dispatch.
    await this.entryResettleRepo.clearReversalSnapshot(drawId);

    // ── Step 2: Cursor-loop snapshot reversal phiên mới ───────────────
    // PHẢI chạy TRƯỚC reset để đọc payout.payoutAmount.
    let reversalCount = 0;
    let cursorId: string | undefined;
    while (true) {
      const candidates = await this.entryResettleRepo.listCandidatesForReversal({
        drawId,
        afterId: cursorId,
        limit: SNAPSHOT_BATCH,
      });
      if (candidates.length === 0) break;

      // Use case sinh MỚI `reversalTx` UUIDv7 per entry — đây là idempotency
      // key cho dispatch transaction MỚI, độc lập với `payout.payoutTx` cũ
      // (transaction cũ đã dispatch xong, không liên quan).
      const items = candidates.map((c) => ({
        entryId: c.id,
        reversalTx: generateId(),
        reversalAmount: c.payoutAmount,
        resettleId,
      }));

      const result = await this.entryResettleRepo.bulkSetReversal(items);
      reversalCount += result.modifiedCount;
      cursorId = candidates[candidates.length - 1]!.id;

      if (candidates.length < SNAPSHOT_BATCH) break;
    }

    // ── Step 3: Reset entries Settled → Scheduled (full $unset) ──────
    const reset = await this.entryResettleRepo.resetEntriesForResettle(drawId);

    // ── Metric → CloudWatch (KHÔNG propagate qua SFN state, xem Decision I) ──
    console.info({
      event: "keno.resettle.prepare.completed",
      drawId,
      resettleId,
      reversalCount,
      resetCount: reset.modifiedCount,
    });

    return {
      drawId,
      resettleId,
      lockOwnerToken,
    };
  }
}
```

### 7.2. `EnqueueKenoReversalsUseCase`

**File**: `packages/game-keno-application/src/use-cases/resettle/enqueue-reversals.ts`

```typescript
/**
 * Use Case: Enqueue Keno Reversal Orders (Step 2 của Resettle SFN).
 *
 * Flow (chunk-based, cursor theo reversalTx ASC, chạy hết trong 1 invocation):
 *   1. Cursor-paginate entries có reversal — batch 500.
 *   2. Build `TenantDispatchOrderInput` qua `buildReversalOrder` (use case build).
 *   3. `EnqueueDispatchOrdersUseCase.run({ orders })` (validate + bulk insert outbox).
 *   4. Lặp đến khi hết entries → return.
 *
 * **KHÔNG có app-level time cap** (MAX_EXECUTION_MS): function CHỈ làm Mongo
 * bulk insert vào `tenant_dispatch_orders` — KHÔNG gọi HTTP tenant API. Scale
 * worst-case (~5K reversals = 10 batches) chạy ~3-10 giây. Defense layer là
 * SFN/Lambda timeout policy: nếu DB lag bất thường gây timeout, SFN tự retry
 * từ đầu, idempotent qua outbox unique index `tx`.
 *
 * IDEMPOTENT: replay an toàn, duplicate `tx` bị skip ở outbox.
 * Reversal order: `action = Debit`, `reason = Adjustment`, `force = true`,
 *                 `sourceKind = Reversal`. (Tất cả set bởi `buildReversalOrder`.)
 */

import { InternalUseCase } from "@megawin/app-core/use-cases";
import { GameProduct } from "@megawin/game-core/entities";
import { buildReversalOrder } from "@megawin/tenant-dispatch/builders";
import { EnqueueDispatchOrdersUseCase } from "@megawin/tenant-dispatch/use-cases/enqueue";
import { EntryResettleRepository } from "../../infras/repos/entry-resettle-repo";

const BATCH_SIZE = 500;

export interface EnqueueKenoReversalsInput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
}

export interface EnqueueKenoReversalsOutput {
  drawId: string;
  resettleId: string;
  lockOwnerToken: string;
}

export class EnqueueKenoReversalsUseCase extends InternalUseCase<
  EnqueueKenoReversalsInput,
  EnqueueKenoReversalsOutput
> {
  private readonly entryResettleRepo = new EntryResettleRepository();
  private readonly enqueueUseCase = new EnqueueDispatchOrdersUseCase();

  protected async execute(
    input: EnqueueKenoReversalsInput,
  ): Promise<EnqueueKenoReversalsOutput> {
    const { drawId, resettleId, lockOwnerToken } = input;

    // Build batchKey theo convention `{game}:resettle:{drawId}:{resettleId}:reversal`.
    // Centralize ở use case (Lambda layer) thay vì SFN ASL JSONata để giữ
    // type-safety và đồng nhất với convention `payoutBatchKey` ở settle path
    // (xem Decision J).
    const reversalBatchKey = `${GameProduct.Keno}:resettle:${drawId}:${resettleId}:reversal`;

    let cursor: string | undefined;
    let enqueuedTotal = 0;

    while (true) {
      const entries = await this.entryResettleRepo.getEntriesWithReversalForDispatch({
        drawId,
        afterTx: cursor,
        limit: BATCH_SIZE,
      });

      if (entries.length === 0) {
        break;
      }

      const orders = entries.map((e) =>
        buildReversalOrder({
          tx: e.reversalTx,
          tenantId: e.tenantId,
          accountId: e.accountId,
          username: e.username,
          amount: e.reversalAmount,
          gameId: GameProduct.Keno,
          roundIds: [drawId],
          description: `Thu hồi Keno kỳ ${drawId} (resettle, vé ${e.ticketNo})`,
          metadata: { entryId: e.id, ticketNo: e.ticketNo, resettleId },
          sourceId: e.id,
          sourceContext: { drawId, resettleId, ticketNo: e.ticketNo },
          batchKey: reversalBatchKey,
        }),
      );

      await this.enqueueUseCase.run({ orders });

      cursor = entries[entries.length - 1]!.reversalTx;
      enqueuedTotal += entries.length;

      if (entries.length < BATCH_SIZE) {
        break;
      }
    }

    // ── Metric → CloudWatch (KHÔNG propagate qua SFN state, xem Decision I) ──
    console.info({
      event: "keno.resettle.enqueue-reversals.completed",
      drawId,
      resettleId,
      enqueuedTotal,
    });

    return {
      drawId,
      resettleId,
      lockOwnerToken,
    };
  }
}
```

→ `EnqueueReversalsOutput` shape KHỚP với `EnqueueReversalsInput` shape — pure pass-through. Không còn `reversalBatchKey`, `enqueuedTotal`, `done`. Output này tự động trở thành `$states.input` cho `StartSettleExecution` (xem Decision D).

### 7.3. Use case barrel

**File MỚI**: `packages/game-keno-application/src/use-cases/resettle/index.ts`

```typescript
/** Keno – Resettle Use Cases barrel export. */

export { PrepareKenoResettleUseCase } from "./prepare-resettle";
export type {
  PrepareKenoResettleInput,
  PrepareKenoResettleOutput,
} from "./prepare-resettle";

export { EnqueueKenoReversalsUseCase } from "./enqueue-reversals";
export type {
  EnqueueKenoReversalsInput,
  EnqueueKenoReversalsOutput,
} from "./enqueue-reversals";
```

### 7.4. Re-export package entry point

**File**: `packages/game-keno-application/package.json` exports map cần thêm subpath:

```json
{
  "exports": {
    "./use-cases/resettle": {
      "types": "./dist/use-cases/resettle/index.d.ts",
      "default": "./dist/use-cases/resettle/index.js"
    }
  }
}
```

(Verify thực tế ở repo — nếu pattern hiện tại dùng tsconfig path map thay vì exports, làm theo pattern đó.)

---

## 8. Sửa các Settle Use Case hiện có

> **Quan điểm**: Pattern `TriggerSettleUseCase` (BO API tự transition Published→Settling rồi mới StartExecution) áp dụng nguyên xi cho Resettle. SFN nhận draw đã ở `Settling` cho cả 2 path → `PrepareSettleUseCase` KHÔNG cần branch logic theo resettle.
>
> Chỉ cần propagate `resettleContext` qua `SettleContext` cho 2 use case dưới dòng đọc:
> 1. `EnqueueDispatchPayoutsUseCase` — derive batchKey resettle từ `drawId + resettleId` + description suffix.
> 2. `FinalizeSettleUseCase` — release WorkerLock.
>
> `PrepareSettleUseCase` chỉ thêm `resettleContext` vào input và pass-through ra ctx — KHÔNG đụng status check.
>
> **Cách `resettleContext` propagate xuyên Settle SFN** (xem Decision L):
> - `PrepareSettleUseCase` set `resettleContext` vào output `SettleContext`.
> - SFN `PrepareSettle.Assign: { settleCtx: $states.result }` → `$settleCtx` chứa `resettleContext` xuyên mọi state.
> - `CalculateFinancials.Assign: { settleCtx: $merge([$settleCtx, { financials: $states.result }]) }` — `$merge` shallow giữ nguyên `resettleContext`.
> - 2 consumer cuối destructure từ `$settleCtx` → đọc đúng giá trị.
> - **Settle SFN ASL KHÔNG đổi gì** — pattern Assign hiện tại đã chuẩn.

### 8.1. `SettleContext` — thêm `resettleContext?`

**File**: `packages/game-keno-application/src/use-cases/settle/types.ts`

Thêm interface và field optional:

```typescript
/**
 * Marker indicating Settle SFN này được nested từ Resettle SFN.
 *
 * Khi present:
 *   - `EnqueueDispatchPayouts` derive `batchKey` resettle (`keno:resettle:
 *     {drawId}:{resettleId}:payout`) thay vì batchKey settle mặc định
 *     `keno:settle:{drawId}:payout`.
 *   - `FinalizeSettle` release `WorkerLock` qua `lockOwnerToken`.
 *   - `description` của dispatch order suffix " (resettle)".
 *
 * Khi absent: Settle SFN chạy bình thường cho lần settle đầu — không đụng lock,
 * không đổi batchKey.
 *
 * NOTE: `payoutBatchKey` KHÔNG có trong context — convention naming
 * centralize ở `EnqueueDispatchPayoutsUseCase` (derive từ `drawId +
 * resettleId`), đồng nhất với pattern `reversalBatchKey` ở resettle path.
 * Bỏ field này giúp SFN ASL không build batchKey qua JSONata, contract
 * cross-SFN gọn hơn (xem Decision J).
 */
export interface ResettleContext {
  /** UUIDv7 phiên resettle hiện tại — dùng tracing + sourceContext.resettleId. */
  resettleId: string;
  /** ownerToken business lock — `FinalizeSettle` truyền vào `lockCoordinator.release`. */
  lockOwnerToken: string;
}

export interface SettleContext {
  drawId: string;
  drawDate: string;
  drawNo: number;
  financialDate: string;
  result: KenoDrawResult;
  config: KenoSettleConfig;
  financials?: SettleFinancials;

  /** Marker resettle path. Absent = settle lần đầu. */
  resettleContext?: ResettleContext;
}
```

### 8.2. `PrepareSettleUseCase` — propagate resettleContext (KHÔNG đụng status logic)

**File**: `packages/game-keno-application/src/use-cases/settle/prepare-settle.ts`

Chỉ thêm `resettleContext` vào input shape + propagate ra ctx output. Status check giữ nguyên `Settling`:

```typescript
import type { ResettleContext } from "./types";

export interface PrepareSettleInput {
  drawId: string;
  /** Resettle marker — propagate xuống mọi state SFN từ đây. Absent = settle lần đầu. */
  resettleContext?: ResettleContext;
}

export class PrepareSettleUseCase extends InternalUseCase<PrepareSettleInput, SettleContext> {
  private readonly drawRepo = new DrawRepository();
  private readonly getGlobalConfig = new GetGlobalConfigInternalUseCase();

  protected async execute(input: PrepareSettleInput): Promise<SettleContext> {
    const { drawId, resettleContext } = input;

    const draw = await this.drawRepo.getDrawById(drawId);
    if (!draw) {
      throw AppException.notFound(`Draw ${drawId} không tồn tại.`);
    }

    // GIỮ NGUYÊN: Cả settle lần đầu và resettle đều có draw ở Settling khi tới đây.
    // - Settle lần đầu: TriggerSettleUseCase đã transition Published → Settling.
    // - Resettle: TriggerKenoResettleUseCase đã transition Published → Settling.
    if (draw.status !== DrawStatus.Settling) {
      throw AppException.badRequest(
        `Draw ${drawId} status = "${draw.status}", expected "settling".`,
      );
    }

    if (!draw.result) {
      throw AppException.notFound(`Draw ${drawId} chưa có kết quả quay.`);
    }

    const globalConfig = await this.getGlobalConfig.run();

    return {
      drawId,
      drawDate: draw.drawDate,
      drawNo: draw.drawNo,
      financialDate: draw.financialDate,
      result: {
        winningNumbers: draw.result.winningNumbers,
        bigCount: draw.result.bigCount,
        smallCount: draw.result.smallCount,
        evenCount: draw.result.evenCount,
        oddCount: draw.result.oddCount,
      },
      config: {
        basicPrizes: globalConfig.basicPrizes,
        bigSmallPrizes: globalConfig.bigSmallPrizes,
        evenOddPrizes: globalConfig.evenOddPrizes,
        payoutCaps: globalConfig.payoutCaps,
      },
      resettleContext, // propagate xuyên flow
    };
  }
}
```

→ Thay đổi tối thiểu, KHÔNG đụng logic status hay branch theo path. Tin tưởng BO đã transition đúng — đồng nhất với pattern Settle SFN hiện tại.

### 8.3. `EnqueueDispatchPayoutsUseCase` — derive batchKey + description

**File**: `packages/game-keno-application/src/use-cases/settle/enqueue-dispatch-payouts.ts`

Lambda nhận nguyên `$settleCtx` → có thể đọc `resettleContext`. Convention naming centralize ở use case (xem Decision J):

```typescript
import type { ResettleContext } from "./types";

export interface EnqueueDispatchPayoutsInput {
  drawId: string;
  /** Resettle marker — propagate từ SettleContext. Absent = settle lần đầu. */
  resettleContext?: ResettleContext;
}

protected async execute(input: EnqueueDispatchPayoutsInput): Promise<EnqueueDispatchPayoutsOutput> {
  const { drawId, resettleContext } = input;

  // Resettle path dùng batchKey riêng để separate metrics + audit so với
  // settle lần đầu. Cùng draw có thể có nhiều resettleId qua nhiều phiên.
  // Convention naming KHỚP với `EnqueueReversalsUseCase.reversalBatchKey`
  // (chỉ khác kind suffix `payout` vs `reversal`).
  const batchKey = resettleContext
    ? `${GameProduct.Keno}:resettle:${drawId}:${resettleContext.resettleId}:payout`
    : `${GameProduct.Keno}:settle:${drawId}:payout`;
  const descSuffix = resettleContext ? " (resettle)" : "";

  const startTime = Date.now();
  let cursor: string | undefined;

  while (Date.now() - startTime < MAX_EXECUTION_MS) {
    const entries = await this.entryRepo.getWinningEntriesForDispatch({
      drawId,
      afterTx: cursor,
      limit: BATCH_SIZE,
    });

    if (entries.length === 0) {
      return { drawId, batchKey, done: true };
    }

    const orders = entries.map((e) =>
      buildPayoutOrder({
        tx: e.payoutTx,
        tenantId: e.tenantId,
        accountId: e.accountId,
        username: e.username,
        amount: e.payoutAmount,
        gameId: GameProduct.Keno,
        roundIds: [drawId],
        description: `Trả thưởng Keno kỳ ${drawId}${descSuffix}`,
        metadata: { entryId: e.id, ticketNo: e.ticketNo },
        sourceId: e.id,
        sourceContext: {
          drawId,
          ...(resettleContext ? { resettleId: resettleContext.resettleId } : {}),
        },
        batchKey,
      }),
    );

    await this.enqueueUseCase.run({ orders });
    cursor = entries[entries.length - 1]!.payoutTx;

    if (entries.length < BATCH_SIZE) {
      return { drawId, batchKey, done: true };
    }
  }

  return { drawId, batchKey, done: false };
}
```

### 8.4. `FinalizeSettleUseCase` — release business lock khi resettle

**File**: `packages/game-keno-application/src/use-cases/settle/finalize-settle.ts`

```typescript
import { BusinessLockCoordinator } from "@megawin/worker-core";

export class FinalizeSettleUseCase extends InternalUseCase<
  SettleContext,
  FinalizeSettleResult
> {
  private readonly drawRepo = new DrawRepository();
  private readonly lockCoordinator = new BusinessLockCoordinator();

  protected async execute(input: SettleContext): Promise<FinalizeSettleResult> {
    const { drawId, resettleContext } = input;

    const updated = await this.drawRepo.settleComplete(drawId);

    if (!updated) {
      const draw = await this.drawRepo.getDrawById(drawId);
      if (draw?.status === DrawStatus.Settled) {
        // Replay sau crash — đã transition rồi, OK.
      } else {
        throw AppException.internal(
          `Cannot finalize draw ${drawId}. Current status: ${draw?.status}`,
        );
      }
    }

    // ── Release business lock CHỈ khi resettle path ─────────────────
    // Coordinator wrap finalizeAndRelease — tự log warning nếu released = false
    // (lock takeover/owner sai), KHÔNG throw nếu DB error → không block finalize.
    if (resettleContext) {
      await this.lockCoordinator.release({
        lockKey: `keno:resettle:${drawId}`,
        ownerToken: resettleContext.lockOwnerToken,
      });
    }

    return {
      drawId,
      status: DrawStatus.Settled,
      completedAt: new Date().toISOString(),
    };
  }
}
```

### 8.5. Lambda handlers — KHÔNG đổi gì

3 handler `apps/worker-keno/src/handlers/settle/{prepare-settle, enqueue-dispatch-payouts, finalize-settle}.ts` đã forward nguyên `event` vào use case. SFN truyền nguyên `$settleCtx` (có `resettleContext` nếu nested) → use case tự destructure.

**KHÔNG cần đổi handler nào.**

### 8.6. Settle SFN — KHÔNG đổi gì

`apps/worker-keno/src/step-functions/settle.ts` đã dùng JSONata `$settleCtx` xuyên suốt + `Arguments: "{% $settleCtx %}"` ở mọi state. Khi Resettle SFN truyền nested `Input` có `resettleContext`, `PrepareSettle` output đã include sẵn `resettleContext` (do code mới ở 8.2 propagate), `Assign: { settleCtx: "{% $states.result %}" }` ghi vào `$settleCtx` → mọi state sau đều thấy `resettleContext` qua `$settleCtx`.

**KHÔNG cần đổi settle SFN.**

---

## 9. Step Function — Keno Resettle SFN

### 9.1. SFN definition file

**File MỚI**: `apps/worker-keno/src/step-functions/resettle.ts`

Tuân theo pattern `settle.ts` (JSONata + Assign + comment USAGE). KHÔNG có Wait state — orchestration chỉ enqueue đúng thứ tự, outbox FIFO tự đảm bảo dispatch order.

```typescript
/**
 * Keno Resettle – Step Function Definition (ASL)
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FLOW (CRASH-SAFE):
 * ═══════════════════════════════════════════════════════════════════════
 *
 *  Input: { drawId, resettleId, lockOwnerToken }
 *         │ (BO API đã transition Published → Settling)
 *         ▼
 *  ┌──────────────────────────────┐
 *  │  1. PrepareResettle          │  Snapshot reversal, reset entries
 *  │                              │  Settled → Scheduled. Output =
 *  │                              │  { drawId, resettleId, lockOwnerToken }
 *  │                              │  (= input shape, pure pass-through).
 *  └────────┬─────────────────────┘
 *           ▼
 *  ┌──────────────────────────────┐
 *  │  2. EnqueueReversals         │  Single invocation — chunk loop nội bộ
 *  │     (Lambda)                 │  500/lần. KHÔNG có time cap; SFN/Lambda
 *  │                              │  timeout là defense layer. Use case
 *  │                              │  derive `reversalBatchKey` nội bộ. 0
 *  │                              │  entries → return ngay (không cần Choice
 *  │                              │  CheckHasReversals — xem Decision I).
 *  │                              │  Output = input shape (pass-through).
 *  └────────┬─────────────────────┘
 *           ▼
 *  ┌──────────────────────────────┐
 *  │  3. StartSettleExecution     │  Nested Settle SFN sync:2 với
 *  │     (Task .sync:2)           │  resettleContext propagate (resettleId,
 *  │                              │  lockOwnerToken). batchKey được nested
 *  │                              │  Settle SFN's use case tự derive từ
 *  │                              │  drawId + resettleId (xem Decision J).
 *  └────────┬─────────────────────┘
 *           ▼
 *  ┌─────────────────────────┐
 *  │  ResettleSucceeded      │
 *  └─────────────────────────┘
 *
 * KEY INVARIANTS:
 * - KHÔNG có Wait state chờ reversal Dispatched. Tin tưởng outbox FIFO per tenant
 *   đảm bảo Reversal (createdAt T0) chạy trước Payout (createdAt T1>T0).
 * - PrepareResettle/EnqueueReversals output shape KHỚP input shape của state kế →
 *   default state input/output passthrough; KHÔNG cần `Arguments`/`Assign` field-
 *   by-field (xem Decision D).
 * - Convention naming `batchKey` centralize 100% ở use case (Lambda) — KHÔNG build
 *   ở SFN ASL JSONata. `EnqueueReversals` tự build `reversalBatchKey`,
 *   `EnqueueDispatchPayouts` (nested Settle SFN) tự derive `payoutBatchKey` từ
 *   `drawId + resettleId`. SFN ASL không động tới convention naming (Decision J).
 * - Metric (reversalCount, resetCount, enqueuedTotal) log qua console.info →
 *   CloudWatch, KHÔNG propagate qua SFN state (Decision I).
 *
 * USAGE (chạy từ thư mục step-functions, cùng pattern settle.ts):
 *   npx tsx -e "import { RESETTLE_STATE_MACHINE } from './resettle'; console.log(JSON.stringify(RESETTLE_STATE_MACHINE, null, 2))" > resettle.asl.json
 */

const REGION = "ap-southeast-1";
const ACCOUNT_ID = "YOUR_ACCOUNT_ID";
const SERVICE = "mw-worker-keno";
const STAGE = "dev";

function lambdaArn(functionName: string): string {
  return `arn:aws:lambda:${REGION}:${ACCOUNT_ID}:function:${SERVICE}-${STAGE}-${functionName}:$LATEST`;
}

const SETTLE_SFN_ARN = `arn:aws:states:${REGION}:${ACCOUNT_ID}:stateMachine:${SERVICE}-${STAGE}-settle`;

const LAMBDA_RETRY = [
  {
    ErrorEquals: [
      "Lambda.ServiceException",
      "Lambda.AWSLambdaException",
      "Lambda.SdkClientException",
      "Lambda.TooManyRequestsException",
      "States.TaskFailed",
      "States.Timeout",
    ],
    IntervalSeconds: 10,
    MaxAttempts: 3,
    BackoffRate: 2.0,
  },
];

/**
 * Retry riêng cho EnqueueReversals — cùng pattern settle.ts ENQUEUE_RETRY.
 * Chỉ retry transient errors. Outer-loop qua Catch + Wait 60s.
 */
const ENQUEUE_RETRY = [
  {
    ErrorEquals: [
      "Lambda.ServiceException",
      "Lambda.AWSLambdaException",
      "Lambda.SdkClientException",
      "Lambda.TooManyRequestsException",
      "States.TaskFailed",
      "States.Timeout",
    ],
    IntervalSeconds: 10,
    MaxAttempts: 10,
    BackoffRate: 2.0,
    MaxDelaySeconds: 120,
    JitterStrategy: "FULL",
  },
];

export const RESETTLE_STATE_MACHINE = {
  Comment: "Keno Resettle Step Function – Kết sổ lại kỳ quay (crash-safe)",
  QueryLanguage: "JSONata",
  StartAt: "PrepareResettle",
  States: {
    PrepareResettle: {
      Type: "Task",
      Resource: lambdaArn("resettle-prepare"),
      Next: "EnqueueReversals",
      Retry: LAMBDA_RETRY,
      // Không Arguments/Assign: SFN execution input → $states.input → default
      // pass-through. Output sẽ tự pass-through tới EnqueueReversals (Decision D).
    },

    EnqueueReversals: {
      Type: "Task",
      Resource: lambdaArn("resettle-enqueue-reversals"),
      Next: "StartSettleExecution",
      Retry: ENQUEUE_RETRY,
      Catch: [
        {
          ErrorEquals: ["States.ALL"],
          Next: "EnqueueRetryWait",
        },
      ],
      // Không Arguments/Assign: input shape khớp PrepareResettle output, output
      // shape khớp StartSettleExecution input → default pass-through. 0 entries
      // → use case return ngay, không cần Choice CheckHasReversals (Decision I).
    },

    EnqueueRetryWait: {
      Type: "Wait",
      Seconds: 60,
      Next: "EnqueueReversals",
    },

    // Cross-SFN boundary: build resettleContext wrap. KHÔNG pre-build
    // payoutBatchKey vì nested Settle SFN's EnqueueDispatchPayoutsUseCase tự
    // derive từ drawId + resettleId (xem Decision J — convention naming
    // centralize ở use case).
    StartSettleExecution: {
      Type: "Task",
      Resource: "arn:aws:states:::states:startExecution.sync:2",
      Arguments: {
        StateMachineArn: SETTLE_SFN_ARN,
        Input: {
          drawId: "{% $states.input.drawId %}",
          resettleContext: {
            resettleId: "{% $states.input.resettleId %}",
            lockOwnerToken: "{% $states.input.lockOwnerToken %}",
          },
        },
      },
      Next: "ResettleSucceeded",
      Retry: LAMBDA_RETRY,
    },

    ResettleSucceeded: {
      Type: "Succeed",
    },
  },
};
```

### 9.2. Build script — tạo `resettle.asl.json`

Pattern theo `settle.ts` USAGE comment. Trong `apps/worker-keno/package.json` thêm script:

```json
{
  "scripts": {
    "build:sfn:settle": "cd src/step-functions && npx tsx -e \"import { SETTLE_STATE_MACHINE } from './settle'; console.log(JSON.stringify(SETTLE_STATE_MACHINE, null, 2))\" > settle.asl.json",
    "build:sfn:resettle": "cd src/step-functions && npx tsx -e \"import { RESETTLE_STATE_MACHINE } from './resettle'; console.log(JSON.stringify(RESETTLE_STATE_MACHINE, null, 2))\" > resettle.asl.json",
    "build:sfn": "pnpm build:sfn:settle && pnpm build:sfn:resettle"
  }
}
```

Generated `resettle.asl.json` ở `apps/worker-keno/src/step-functions/resettle.asl.json` được commit vào repo (giống settle.asl.json) để serverless.yml reference.

### 9.3. Lambda handlers MỚI

**File MỚI**: `apps/worker-keno/src/handlers/resettle/prepare-resettle.ts`

```typescript
import {
  PrepareKenoResettleUseCase,
  type PrepareKenoResettleInput,
} from "@megawin/game-keno-application/use-cases/resettle";

const useCase = new PrepareKenoResettleUseCase();

export async function handler(event: PrepareKenoResettleInput) {
  return useCase.run(event);
}
```

**File MỚI**: `apps/worker-keno/src/handlers/resettle/enqueue-reversals.ts`

```typescript
import {
  EnqueueKenoReversalsUseCase,
  type EnqueueKenoReversalsInput,
} from "@megawin/game-keno-application/use-cases/resettle";

const useCase = new EnqueueKenoReversalsUseCase();

export async function handler(event: EnqueueKenoReversalsInput) {
  return useCase.run(event);
}
```

(KHÔNG cần `check-reversals-dispatched` — đã bỏ Wait state.)

### 9.4. Serverless functions config

**File MỚI**: `apps/worker-keno/src/functions/resettle.yml`

```yaml
resettlePrepare:
  handler: src/handlers/resettle/prepare-resettle.handler
  name: ${self:service}-${self:provider.stage}-resettle-prepare
  timeout: 60
  memorySize: 512

resettleEnqueueReversals:
  handler: src/handlers/resettle/enqueue-reversals.handler
  name: ${self:service}-${self:provider.stage}-resettle-enqueue-reversals
  timeout: 900 # 15 phút — chunk loop tới khi done
  memorySize: 1024
```

### 9.5. Cập nhật `serverless.yml`

**File**: `apps/worker-keno/serverless.yml`

Thêm vào `functions`:

```yaml
functions:
  - ${file(./src/functions/settle.yml)}
  - ${file(./src/functions/resettle.yml)}  # ← MỚI
  # ... các function khác
```

Thêm SFN resource (theo pattern hiện tại của `settle` SFN):

```yaml
resources:
  Resources:
    KenoResettleStateMachine:
      Type: AWS::StepFunctions::StateMachine
      Properties:
        StateMachineName: ${self:service}-${self:provider.stage}-resettle
        DefinitionString: ${file(./src/step-functions/resettle.asl.json)}
        RoleArn: !GetAtt StepFunctionsRole.Arn
```

IAM permission cho `StepFunctionsRole` start nested Settle SFN:

```yaml
- Effect: Allow
  Action:
    - states:StartExecution
    - states:DescribeExecution
    - states:StopExecution
  Resource:
    - !Ref KenoSettleStateMachine

- Effect: Allow
  Action:
    - events:PutTargets
    - events:PutRule
    - events:DescribeRule
  Resource: "*"
```

---

## 10. BO API Routes (Next.js) — zod validate đầy đủ

> **R-VALID-1**: Toàn bộ format validation (regex, length, pattern) ở route handler qua zod. Use case CHỈ check business state.
>
> **R-VALID-2 (Single Responsibility)**: Tách 3 endpoint với 3 schema khác nhau — KHÔNG share schema chung như trước:
> - `publish-result` — `winningNumbers` + optional `vietlottRef` (publish lần đầu, staff thường nhập cả 2 cùng lúc).
> - `republish-result` — CHỈ `winningNumbers` (sửa kết quả sai sau settle → kéo theo resettle).
> - `vietlott-ref` — CHỈ `vietlottRef` (sửa metadata tham chiếu, KHÔNG cần resettle).

### 10.0. Schemas

**File MỚI**: `apps/backoffice/src/app/api/keno/draws/[drawId]/_lib/schema.ts`

```typescript
import { z } from "zod";
import { KENO_DRAW_COUNT } from "@megawin/game-keno/entities";

const kenoNumberSchema = z.string().regex(/^(0[1-9]|[1-7][0-9]|80)$/);

const winningNumbersSchema = z
  .array(kenoNumberSchema)
  .length(KENO_DRAW_COUNT, `Phải có đúng ${KENO_DRAW_COUNT} số.`)
  .refine((arr) => new Set(arr).size === arr.length, {
    message: "Các số phải khác nhau.",
  });

const vietlottRefObjectSchema = z.object({
  drawPeriod: z.string().min(1),
  drawDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * Schema cho `publish-result` — publish kết quả lần đầu.
 *
 * Cho phép gửi cả `vietlottRef` cùng lúc vì lúc publish lần đầu staff
 * thường nhập đồng thời số trúng + tham chiếu Vietlott.
 */
export const publishResultSchema = z.object({
  winningNumbers: winningNumbersSchema,
  vietlottRef: vietlottRefObjectSchema.optional(),
});
export type PublishResultBody = z.infer<typeof publishResultSchema>;

/**
 * Schema cho `republish-result` — sửa kết quả sau settle (kéo resettle).
 *
 * KHÔNG nhận `vietlottRef` — sửa metadata tham chiếu thuộc endpoint riêng
 * `vietlott-ref` để không kéo theo resettle không cần thiết.
 */
export const republishResultSchema = z.object({
  winningNumbers: winningNumbersSchema,
});
export type RepublishResultBody = z.infer<typeof republishResultSchema>;

/**
 * Schema cho `vietlott-ref` — sửa CHỈ metadata tham chiếu Vietlott.
 *
 * Cho phép sau khi đã publish (`Published`/`Settling`/`Settled`).
 * KHÔNG yêu cầu resettle vì không tham gia matching/payout.
 */
export const vietlottRefSchema = vietlottRefObjectSchema;
export type VietlottRefBody = z.infer<typeof vietlottRefSchema>;
```

**File CẦN SỬA**: `apps/backoffice/src/app/api/keno/draws/[drawId]/publish-result/route.ts`

```typescript
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { PublishResultUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { publishResultSchema } from "../_lib/schema";

const publishResultUseCase = new PublishResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(publishResultSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return publishResultUseCase.run({ drawId, ...body });
  });
```

### 10.1. Republish Result Route

**File MỚI**: `apps/backoffice/src/app/api/keno/draws/[drawId]/republish-result/route.ts`

```typescript
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { RepublishKenoResultUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { republishResultSchema } from "../_lib/schema";

const republishResultUseCase = new RepublishKenoResultUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(republishResultSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return republishResultUseCase.run({ drawId, ...body });
  });
```

> **Tại sao 3 endpoint riêng?** Mỗi endpoint một intent + một status precondition + một set side effects:
> - `publish-result` — `SalesClosed`/`Published` → `Published`. Set result, optional vietlottRef.
> - `republish-result` — `Settled` → `Published`. Set new result, $unset financial/stats/settleSummary. Kéo resettle.
> - `vietlott-ref` — `Published`/`Settling`/`Settled` → giữ nguyên status. CHỈ set vietlottRef. KHÔNG kéo resettle.
>
> Tách 3 endpoint giúp BO UI gọi đúng intent + audit trail rõ ràng (log riêng từng action) + chống misuse (staff sửa nhầm vietlottRef không bị kéo resettle).

### 10.2. Update Vietlott Ref Route

**File MỚI**: `apps/backoffice/src/app/api/keno/draws/[drawId]/vietlott-ref/route.ts`

```typescript
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { UpdateVietlottRefUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { vietlottRefSchema } from "../_lib/schema";

const useCase = new UpdateVietlottRefUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .body(vietlottRefSchema)
  .handler(async ({ params, body }) => {
    const { drawId } = params as { drawId: string };
    return useCase.run({ drawId, vietlottRef: body });
  });
```

### 10.3. Trigger Resettle Route

**File MỚI**: `apps/backoffice/src/app/api/keno/draws/[drawId]/resettle/route.ts`

```typescript
import { withApi } from "@/lib/api";
import { CompanyRole } from "@megawin/identity/entities";
import { TriggerKenoResettleUseCase } from "@megawin/game-keno-application/use-cases/draws";
import { env } from "@/env";

const triggerResettleUseCase = new TriggerKenoResettleUseCase();

export const POST = withApi()
  .auth({ roles: [CompanyRole.Staff] })
  .handler(async ({ params, session }) => {
    const { drawId } = params as { drawId: string };
    return triggerResettleUseCase.run({
      drawId,
      KENO_RESETTLE_SFN_ARN: env.KENO_RESETTLE_SFN_ARN!,
      startedBy: session?.userId,
    });
  });
```

> Note: `drawId` regex được validate qua dynamic segment + `withApi` middleware (theo pattern các route hiện tại). Nếu cần regex strict thì có thể thêm `params: z.object({ drawId: z.string().regex(/^\d{4}-\d{2}-\d{2}\.\d{3}$/) })` — nhưng các route hiện tại như `trigger-settle/route.ts` không làm điều này, giữ thống nhất.

### 10.3. Cập nhật env validation

**File**: `apps/backoffice/src/env.ts`

Thêm:

```typescript
const env = createEnv({
  server: {
    // ... có sẵn ...
    KENO_SETTLE_SFN_ARN: z.string().min(1),
    KENO_RESETTLE_SFN_ARN: z.string().min(1), // ← MỚI
  },
});
```

---

## 11. Backoffice UI/UX — Sửa kết quả + Resettle (Frontend)

> **Tuân thủ rule `frontend-dev.mdc`**: shadcn Card spacing chuẩn, font-size chuẩn (`text-xs` minimum), KPI/icon layout, dialog form pattern (RHF + Zod + useMutation), KHÔNG inline schema hoặc hardcode label.

> **Vị trí**: Trang chi tiết kỳ Keno — `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/`. Đây là vùng đã có sẵn `DrawCommandCenter` + action buttons + dialog flow.

> **Code đã có cần tái dùng**:
> - `PublishResultAction` dialog (`draw-actions/publish-result-action.tsx`) — đã hỗ trợ cả 2 mode `publish` và `republish` qua flag `isRepublish = draw.status === "published" || draw.status === "settled"`. Pre-fill `currentResult` khi mở mode republish.
> - `DrawCommandCenter` đã có nút **"Sửa kết quả"** (`canRepublish = status === Published || status === Settled`) chạy `onRepublishResult`. Hiện tại nó cũng mở `PublishResultAction` (cùng dialog).
> - `DrawCommandCenter` đã có nút **"Re-settle"** (`disabled` placeholder khi `isSettled`) — cần wire-up.

### 11.1. Phân nhánh dialog: dùng đúng endpoint theo status

`PublishResultAction` hiện chỉ gọi `usePublishResult` (POST `/publish-result`). Endpoint này CHỈ chấp nhận `SalesClosed`/`Published`. Khi `draw.status === Settled`, phải gọi POST `/republish-result`. Riêng việc sửa CHỈ `vietlottRef` (sau publish) → endpoint thứ 3 `vietlott-ref` qua dialog riêng.

**File CẦN SỬA**: `apps/backoffice/src/app/(main)/games/keno/operations/_lib/use-operations.ts`

Thêm 2 hooks `useRepublishResult` + `useUpdateVietlottRef`:

```typescript
/** POST /api/keno/draws/{drawId}/republish-result — Settled → Published (CHỈ winningNumbers). */
export function useRepublishResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ drawId, body }: { drawId: string; body: RepublishResultBody }) =>
      apiClient.post(`/keno/draws/${drawId}/republish-result`, body),
    onSuccess: (_, { drawId }) => {
      queryClient.invalidateQueries({ queryKey: kenoOperationsKeys.drawDetail(drawId) });
      queryClient.invalidateQueries({ queryKey: kenoOperationsKeys.drawSelector });
      toast.success("Đã cập nhật kết quả. Bạn có thể nhấn 'Kết sổ lại' để chạy resettle.");
    },
    onError: (error) => {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Không thể cập nhật kết quả.");
    },
  });
}

/** POST /api/keno/draws/{drawId}/vietlott-ref — sửa CHỈ vietlottRef, KHÔNG kéo resettle. */
export function useUpdateVietlottRef() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ drawId, body }: { drawId: string; body: VietlottRefBody }) =>
      apiClient.post(`/keno/draws/${drawId}/vietlott-ref`, body),
    onSuccess: (_, { drawId }) => {
      queryClient.invalidateQueries({ queryKey: kenoOperationsKeys.drawDetail(drawId) });
      toast.success("Đã cập nhật tham chiếu Vietlott.");
    },
    onError: (error) => {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Không thể cập nhật tham chiếu Vietlott.");
    },
  });
}
```

**File CẦN SỬA**: `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions/publish-result-action.tsx`

Branch theo status — gọi đúng endpoint:

```typescript
const publishResult = usePublishResult();
const republishResult = useRepublishResult();

const isSettledRepublish = draw.status === DrawStatus.Settled;
const mutation = isSettledRepublish ? republishResult : publishResult;

// Khi republish (Settled → Published) chỉ submit winningNumbers, KHÔNG gửi vietlottRef.
// Sửa vietlottRef có endpoint riêng `vietlott-ref` (xem 11.1bis) để không kéo resettle.
const submitBody = isSettledRepublish
  ? { winningNumbers: form.winningNumbers }
  : { winningNumbers: form.winningNumbers, vietlottRef: form.vietlottRef };

mutation.mutate({ drawId: draw.drawId, body: submitBody }, { onSuccess: () => setIsOpen(false) });
```

Trong form UI: ẩn 2 input `drawPeriod` + `drawDate` của `vietlottRef` khi `isSettledRepublish === true` — tránh staff nhầm lẫn rằng phải sửa kèm vietlottRef ở đây.

**Title dialog cập nhật rõ ý**:

```tsx
<DialogTitle className="flex items-center gap-2">
  <ClipboardCheck className="size-4.5 text-orange-500" />
  {isSettledRepublish
    ? "Sửa kết quả (sau kết sổ)"
    : isRepublish
      ? "Sửa kết quả"
      : "Công bố kết quả"} — Kỳ {String(draw.drawNo).padStart(3, "0")} · {draw.drawDate} {draw.drawTime}
</DialogTitle>
<DialogDescription className="text-xs">
  {isSettledRepublish
    ? "Sửa kết quả sẽ chuyển kỳ về Published. Bạn cần nhấn 'Kết sổ lại' để hoàn nguyên payouts cũ và kết sổ với kết quả mới. Để sửa CHỈ tham chiếu Vietlott (không kết sổ lại) — dùng nút 'Sửa tham chiếu Vietlott' bên ngoài."
    : `Nhập ${KENO_DRAW_COUNT} số trúng (${pad2(KENO_NUMBER_MIN)}–${pad2(KENO_NUMBER_MAX)}). Thứ tự nhập là thứ tự quay chính thức.`}
</DialogDescription>
```

> **Lý do tách hook + branch trong dialog (thay vì 2 dialog riêng)**: form/validation/UI giống hệt nhau — chỉ khác endpoint + toast text. KISS + DRY.

### 11.1bis. Action riêng "Sửa tham chiếu Vietlott" (UpdateVietlottRefAction)

**Vấn đề**: dialog `PublishResultAction` ở mode republish đã ẩn input `vietlottRef`. Cần action mới cho phép sửa CHỈ vietlottRef mà không phải nhập lại 20 số.

**File MỚI**: `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions/update-vietlott-ref-action.tsx`

Dialog mỏng chỉ có 2 input `drawPeriod` + `drawDate`. Pre-fill từ `draw.vietlottRef` nếu đã có.

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link as LinkIcon } from "lucide-react";
import { useUpdateVietlottRef } from "../../../../use-operations";
import type { KenoDrawDetail } from "../../../../use-operations";

interface Props {
  draw: KenoDrawDetail["draw"];
}

export function UpdateVietlottRefAction({ draw }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [drawPeriod, setDrawPeriod] = useState(draw.vietlottRef?.drawPeriod ?? "");
  const [drawDate, setDrawDate] = useState(draw.vietlottRef?.drawDate ?? draw.drawDate);
  const mutation = useUpdateVietlottRef();

  const handleSubmit = () => {
    mutation.mutate(
      { drawId: draw.drawId, body: { drawPeriod, drawDate } },
      { onSuccess: () => setIsOpen(false) },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <LinkIcon className="size-3.5" />
          Sửa tham chiếu Vietlott
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="size-4.5 text-blue-500" />
            Sửa tham chiếu Vietlott — Kỳ {String(draw.drawNo).padStart(3, "0")}
          </DialogTitle>
          <DialogDescription className="text-xs">
            Chỉ cập nhật metadata tham chiếu sang Vietlott. KHÔNG ảnh hưởng tới
            kết quả trúng thưởng hay số dư người chơi — không cần kết sổ lại.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div className="grid gap-1.5">
            <Label htmlFor="drawPeriod">Mã kỳ Vietlott (drawPeriod)</Label>
            <Input
              id="drawPeriod"
              value={drawPeriod}
              onChange={(e) => setDrawPeriod(e.target.value)}
              placeholder="VD: 123456"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="drawDate">Ngày quay (drawDate)</Label>
            <Input
              id="drawDate"
              type="date"
              value={drawDate}
              onChange={(e) => setDrawDate(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setIsOpen(false)}>Huỷ</Button>
          <Button
            onClick={handleSubmit}
            disabled={!drawPeriod || !drawDate || mutation.isPending}
          >
            {mutation.isPending ? "Đang lưu…" : "Lưu"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

**File CẦN SỬA**: `draw-command-center.tsx` — render `<UpdateVietlottRefAction draw={draw} />` khi `status` ∈ {`Published`, `Settling`, `Settled`}. Không hiển thị ở `Scheduled`/`SalesOpen`/`SalesClosed` (lúc đó chưa có result, dùng `publish-result` để nhập cả vietlottRef cùng lúc).

### 11.2. Nút "Kết sổ" (lần đầu) vs "Kết sổ lại" — logic hiển thị + confirm dialog

**Yêu cầu nghiệp vụ** (theo R-BO-5):
- "Kết sổ" (Settle lần đầu): hiển thị khi draw vừa publish kết quả lần đầu, **chưa từng** settle.
- "Kết sổ lại" (Resettle): hiển thị khi draw đã settle, sau đó staff sửa kết quả qua "Sửa kết quả" → có republish mới chờ resettle.

Cả 2 trường hợp đều có `status === Published` + `result.publishedAt != null`. **PHẢI** tránh để staff bấm nhầm 1 trong 2 nút khi vừa publish lần đầu (chưa settle).

**Phân biệt qua `settledAt` (high-water mark)** — set bởi `FinalizeSettleUseCase`, **KHÔNG** unset bởi `republishResultAfterSettled`:

| Trạng thái draw | `status` | `result.publishedAt` | `settledAt` | Nút hiển thị |
|---|---|---|---|---|
| Vừa publish kết quả lần đầu | `Published` | có | `null` | **"Kết sổ"** (trigger-settle) |
| Settle lần đầu thành công | `Settled` | có | có (= settledAt) | (không có nút action — đã hoàn tất) |
| Sửa kết quả sau settle | `Published` | mới (> settledAt) | có (cũ) | **"Kết sổ lại"** (trigger-resettle) |
| Resettle thành công | `Settled` | (= settledAt) | mới | (không có nút action) |
| Settling đang chạy | `Settling` | có | (cũ hoặc null) | (loading state, không nút action) |

**Quy tắc cài đặt**:
- Nút "Kết sổ" CHỈ hiện khi `status === Published && settledAt == null`.
- Nút "Kết sổ lại" CHỈ hiện khi `status === Published && settledAt != null && result.publishedAt > settledAt`.
- 2 nút **MUTUALLY EXCLUSIVE** — không bao giờ hiện cùng lúc (đảm bảo bằng điều kiện `settledAt == null` vs `!= null`).
- Backend `TriggerKenoResettleUseCase` cũng enforce cùng điều kiện (R-BO-5) → defense in depth: kể cả khi UI bug, BO API vẫn từ chối resettle trên draw chưa từng settle với code `DRAW_NEVER_SETTLED`.

**File CẦN SỬA**: `packages/game-keno/src/entities/draw.ts`

```typescript
export interface DrawDoc {
  // ... (existing fields) ...

  /**
   * High-water mark thời điểm settle GẦN NHẤT thành công.
   *
   * - `FinalizeSettleUseCase` ghi field này CUỐI settle (cả lần đầu và resettle).
   * - `republishResultAfterSettled` KHÔNG unset (giữ làm dấu so sánh).
   * - UI dùng để so sánh với `result.publishedAt`:
   *     `result.publishedAt > settledAt` → có republish mới chưa resettle → hiển thị nút "Kết sổ lại".
   */
  settledAt?: Date;
}
```

**File CẦN SỬA**: `packages/game-keno-application/src/infras/repos/draw-repo.ts`

Trong method `settleComplete` (set status `Settling → Settled`), thêm `settledAt: now`. Đây là cùng method đang `$set: { status: Settled, updatedAt: now }` — chỉ thêm 1 field:

```typescript
async settleComplete(drawId: string): Promise<DrawEntity | null> {
  const allowed = VALID_TRANSITIONS[DrawStatus.Settling];
  if (!allowed?.has(DrawStatus.Settled)) return null;

  const now = new Date();
  return await this.findOneAndUpdate(
    { drawId, status: DrawStatus.Settling },
    {
      $set: {
        status: DrawStatus.Settled,
        settledAt: now,        // ← high-water mark, overwrite mỗi lần settle
        updatedAt: now,
      },
    },
    { returnDocument: "after" },
  );
}
```

**File CẦN SỬA**: `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-command-center.tsx`

Thay đổi logic hiển thị 2 nút Settle/Resettle — phân biệt qua `settledAt`:

```tsx
const status = drawDetail?.draw?.status;
const settledAt = drawDetail?.draw?.settledAt;
const resultPublishedAt = drawDetail?.draw?.result?.publishedAt;

// Nút "Kết sổ" (lần đầu): Published + chưa từng settle
const canTriggerSettle =
  status === DrawStatus.Published && !settledAt;

// Nút "Kết sổ lại" (resettle): Published + đã từng settle + có republish mới
const canRetriggerSettle =
  status === DrawStatus.Published &&
  !!settledAt &&
  !!resultPublishedAt &&
  new Date(resultPublishedAt).getTime() > new Date(settledAt).getTime();

// Hai nút mutually exclusive — bảo đảm ở runtime cho an toàn:
// canTriggerSettle === true requires settledAt == null
// canRetriggerSettle === true requires settledAt != null
// → Hai cờ KHÔNG bao giờ cùng true.

// ── trong action bar ─────────────────────────────────────────────
{canTriggerSettle && (
  <Button
    size="sm"
    className="gap-1.5"
    onClick={onTriggerSettle}
  >
    <PlayCircle className="size-3.5" /> Kết sổ
  </Button>
)}

{canRetriggerSettle && (
  <Button
    size="sm"
    className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white"
    onClick={onTriggerResettle}
  >
    <RotateCcw className="size-3.5" /> Kết sổ lại
  </Button>
)}
```

Đồng thời **bỏ hẳn** nút disabled "Re-settle" hiện tại (đang `disabled={isSettled}`):

```tsx
{/* TRƯỚC — bỏ */}
{isSettled && (
  <Button variant="outline" size="sm" className="gap-1.5" disabled>
    <RotateCcw className="size-3.5" /> Re-settle
  </Button>
)}

{/* SAU — chỉ giữ canTriggerSettle + canRetriggerSettle ở trên */}
```

> **Cách user dùng — flow Settle lần đầu**: kỳ ở `Published` (mới publish kết quả) → `settledAt == null` → nút **"Kết sổ"** hiện → click → POST `/trigger-settle` → backend chuyển `Published → Settling` → SFN settle → `Settled` + set `settledAt` → nút "Kết sổ" tự ẩn.
>
> **Cách user dùng — flow Resettle**: kỳ đã `Settled` → nhấn "Sửa kết quả" → backend chuyển `Settled → Published` (republish-result) qua API → `settledAt` GIỮ NGUYÊN, `result.publishedAt` cập nhật mới → nút **"Kết sổ lại"** hiện (vì `result.publishedAt > settledAt`) → click → confirm → POST `/resettle` → backend validate `settledAt != null && publishedAt > settledAt` (R-BO-5) → chuyển `Published → Settling`, start Resettle SFN → khi xong status về `Settled`, `settledAt` cập nhật mới → nút "Kết sổ lại" tự ẩn.

### 11.3. Hook `useTriggerResettle` + Confirm dialog

**File CẦN SỬA**: `apps/backoffice/src/app/(main)/games/keno/operations/_lib/use-operations.ts`

```typescript
/** POST /api/keno/draws/{drawId}/resettle — Published → Settling, start Resettle SFN. */
export function useTriggerResettle() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ drawId }: { drawId: string }) =>
      apiClient.post(`/keno/draws/${drawId}/resettle`, {}),
    onSuccess: (_, { drawId }) => {
      queryClient.invalidateQueries({ queryKey: kenoOperationsKeys.drawDetail(drawId) });
      queryClient.invalidateQueries({ queryKey: kenoOperationsKeys.drawSelector });
      toast.success("Đã khởi chạy resettle. Theo dõi status badge để biết khi hoàn tất.");
    },
    onError: (error) => {
      if (error instanceof ApiClientError) toast.error(error.message);
      else toast.error("Không thể khởi chạy resettle.");
    },
  });
}
```

**File CẦN SỬA**: `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/index.tsx`

Wire-up confirm dialog (cùng pattern với `settleConfirm` đã có):

```tsx
const [resettleConfirm, setResettleConfirm] = useState(false);
const triggerResettle = useTriggerResettle();

// ... trong DrawCommandCenter props ...
<DrawCommandCenter
  draw={draw}
  result={result}
  voidInfo={voidInfo}
  // ... existing ...
  onTriggerResettle={() => setResettleConfirm(true)}
/>

{/* Confirm: Kết sổ lại */}
<AlertDialog open={resettleConfirm} onOpenChange={setResettleConfirm}>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Xác nhận kết sổ lại?</AlertDialogTitle>
      <AlertDialogDescription>
        Kỳ <strong>{draw.drawDate} · Kỳ {String(draw.drawNo).padStart(3, "0")}</strong> sẽ được
        kết sổ lại với kết quả mới. Hệ thống sẽ tự động:
        <ul className="mt-2 list-disc pl-5 space-y-1 text-xs">
          <li>Hoàn nguyên (Debit) toàn bộ payout của phiên settle trước.</li>
          <li>Tính lại giải thưởng theo kết quả vừa cập nhật.</li>
          <li>Phát payout mới (Credit) cho người chơi trúng.</li>
        </ul>
        <p className="mt-2 text-xs font-medium text-amber-600 dark:text-amber-400">
          Thao tác KHÔNG thể hoàn tác. Đảm bảo kết quả đã đúng trước khi xác nhận.
        </p>
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Huỷ bỏ</AlertDialogCancel>
      <AlertDialogAction
        onClick={() => triggerResettle.mutate({ drawId: effectiveDrawId })}
        disabled={triggerResettle.isPending}
        className="bg-orange-600 hover:bg-orange-700"
      >
        Xác nhận kết sổ lại
      </AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

### 11.4. UI khi `status === Settling` (resettle đang chạy)

`DrawCommandCenter` đã có sẵn block `isSettling` — hiển thị "Đang kết sổ..." với spinner. Không cần code mới — nhánh resettle dùng chung block này (cả 2 đều kết thúc ở `Settled`).

### 11.5. Query invalidation strategy

Sau republish/resettle, các UI section sau phụ thuộc data — cần invalidate:

| Mutation | Invalidate keys |
|---|---|
| `useRepublishResult` | `drawDetail(drawId)` + `drawSelector` |
| `useTriggerResettle` | `drawDetail(drawId)` + `drawSelector` |

**Polling status**: dùng React Query `refetchInterval` trên `useDrawDetail` khi `status === Settling`:

```typescript
export function useDrawDetail(drawId?: string) {
  return useQuery({
    queryKey: kenoOperationsKeys.drawDetail(drawId ?? ""),
    queryFn: () => apiClient.get(`/keno/draws/${drawId}`),
    enabled: !!drawId,
    refetchInterval: (query) => {
      const status = query.state.data?.draw?.status;
      return status === DrawStatus.Settling ? 3000 : false;
    },
  });
}
```

3000ms = đủ rapid feedback, không nặng DB.

### 11.6. Frontend Checklist

- [ ] `apps/backoffice/src/app/(main)/games/keno/operations/_lib/use-operations.ts`:
  - Thêm hook `useRepublishResult` (body type `RepublishResultBody` — không có `vietlottRef`).
  - Thêm hook `useUpdateVietlottRef` (body type `VietlottRefBody`).
  - Thêm hook `useTriggerResettle`.
  - Thêm `refetchInterval` cho `useDrawDetail` khi `Settling`.
- [ ] `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions/publish-result-action.tsx`:
  - Branch endpoint theo `draw.status === Settled` → `useRepublishResult` else `usePublishResult`.
  - Khi republish (Settled): submit body CHỈ gồm `winningNumbers`, ẩn 2 input `vietlottRef.drawPeriod` + `drawDate`.
  - Title + description đổi text khi `isSettledRepublish`, ghi rõ "để sửa CHỈ vietlottRef dùng action 'Sửa tham chiếu Vietlott'".
- [ ] `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions/update-vietlott-ref-action.tsx` (FILE MỚI):
  - Dialog mỏng 2 input `drawPeriod` + `drawDate`, pre-fill từ `draw.vietlottRef`.
  - Gọi `useUpdateVietlottRef`.
- [ ] `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-command-center.tsx`:
  - Bỏ nút disabled "Re-settle" khi `isSettled`.
  - Thêm nút "Kết sổ lại" hiển thị khi `canRetriggerSettle`.
  - Render `<UpdateVietlottRefAction draw={draw} />` khi `status` ∈ {`Published`, `Settling`, `Settled`}.
- [ ] `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/index.tsx`:
  - Thêm `resettleConfirm` state + `useTriggerResettle` + AlertDialog xác nhận.
  - Wire `onTriggerResettle={() => setResettleConfirm(true)}`.
- [ ] `apps/backoffice/src/lib/query-keys/keno.ts` (hoặc tương đương): không thêm key mới — tái dùng `drawDetail`, `drawSelector`.
- [ ] Smoke test BO — flow Settle lần đầu: draw vừa `Published` (chưa từng settle, `settledAt = null`) → CHỈ thấy nút "Kết sổ" (KHÔNG thấy "Kết sổ lại") → click → `Settling` → `Settled`, `settledAt` được set.
- [ ] Smoke test BO — flow Resettle: settle xong → sửa kết quả → status đổi `Published`, `settledAt` GIỮ NGUYÊN (cũ) → CHỈ thấy nút "Kết sổ lại" (KHÔNG thấy "Kết sổ") → click → status `Settling` → polling 3s → quay về `Settled`, `settledAt` cập nhật mới → cả 2 nút biến mất, balance cập nhật đúng.
- [ ] Smoke test BO — flow CHỈ vietlottRef: draw đã `Settled`, click "Sửa tham chiếu Vietlott" → đổi `drawPeriod` → submit → status GIỮ `Settled`, `settledAt` GIỮ NGUYÊN, KHÔNG có nút "Kết sổ lại" xuất hiện. Tức KHÔNG kéo resettle.
- [ ] Smoke test BO — defensive: thử curl POST `/resettle` thẳng vào draw chưa từng settle (`settledAt = null`) → BO API trả lỗi `DRAW_NEVER_SETTLED` → đảm bảo backend defense-in-depth nếu UI bug.
- [ ] Smoke test BO — defensive: thử curl POST `/vietlott-ref` lên draw `Scheduled`/`SalesOpen` → BO API trả lỗi `DRAW_INVALID_TRANSITION`.

---

## 12. Environment & Deploy Variables

### 12.1. BO API `.env.example`

Thêm:

```bash
KENO_RESETTLE_SFN_ARN=arn:aws:states:ap-southeast-1:ACCOUNT:stateMachine:mw-worker-keno-dev-resettle
```

> **NHẮC LẠI rule**: KHÔNG agent tự ghi đè `.env.local`. Chỉ thêm vào `.env.example` để dev tự copy giá trị.

### 12.2. Worker `serverless.yml` env

Worker `mw-worker-keno` đã có sẵn `MONGODB_URI`, `MONGODB_DB_NAME`. KHÔNG cần thêm env mới cho worker — `KENO_RESETTLE_SFN_ARN` chỉ BO API cần để `StartExecution`.

---

## 13. Test Matrix

### 13.1. Unit tests

| Use case / repo method | Scenario | Expected |
|---|---|---|
| Route `republish-result` (zod) | winningNumbers chỉ 19 số | 400 — zod validation fail |
| Route `republish-result` (zod) | winningNumbers có duplicate | 400 — zod refine fail |
| Route `republish-result` (zod) | winningNumbers có "00" hoặc "81" | 400 — zod regex fail |
| Route `republish-result` (zod) | Request có thêm field `vietlottRef` | 400 — zod strict fail (schema không cho phép) |
| Route `vietlott-ref` (zod) | Body thiếu `drawPeriod` | 400 — zod validation fail |
| Route `vietlott-ref` (zod) | `drawDate` sai format `YYYY-MM-DD` | 400 — zod regex fail |
| `RepublishKenoResultUseCase` | Draw không tồn tại | `AppException.notFound` |
| `RepublishKenoResultUseCase` | Draw status = Published (lần 2 click) | `DRAW_INVALID_TRANSITION` |
| `RepublishKenoResultUseCase` | Draw status = Settled | OK, status → Published, `$unset` financial/stats/settleSummary (giữ `settledAt` + `vietlottRef`) |
| `UpdateVietlottRefUseCase` | Draw không tồn tại | `AppException.notFound` |
| `UpdateVietlottRefUseCase` | Draw status = Scheduled / SalesOpen / SalesClosed | `DRAW_INVALID_TRANSITION` (chưa publish) |
| `UpdateVietlottRefUseCase` | Draw status = Published | OK, KHÔNG đổi status, KHÔNG đụng result/settle data |
| `UpdateVietlottRefUseCase` | Draw status = Settled | OK, KHÔNG đổi status, `settledAt` GIỮ NGUYÊN, KHÔNG kéo resettle |
| `UpdateVietlottRefUseCase` | Draw status = Voided / Voiding | `DRAW_INVALID_TRANSITION` (đã huỷ thì lock) |
| `DrawRepo.updateVietlottRef` | status không trong scope cho phép | return null |
| `TriggerKenoResettleUseCase` | Draw status = Settled | `DRAW_INVALID_TRANSITION` (phải republish trước) |
| `TriggerKenoResettleUseCase` | **Draw vừa publish lần đầu** (status=Published, settledAt=null) | **`DRAW_NEVER_SETTLED`** — chặn nhầm Settle vs Resettle |
| `TriggerKenoResettleUseCase` | **Draw đã settled, chưa republish** (publishedAt <= settledAt) | **`DRAW_NO_NEW_RESULT`** — chặn click Resettle thừa |
| `TriggerKenoResettleUseCase` | **Draw đã settled, đã republish** (publishedAt > settledAt) | OK — pass tới preflight |
| `TriggerKenoResettleUseCase` | lastBatchKey progress.pending > 0 | `DISPATCH_BATCH_PENDING` |
| `TriggerKenoResettleUseCase` | Lock đã held | `RESETTLE_LOCK_HELD` |
| `TriggerKenoResettleUseCase` | triggerSettle fail (race condition) | Lock được rollback |
| `TriggerKenoResettleUseCase` | StartExecution fail | Lock được rollback (lastError set) |
| `TriggerKenoResettleUseCase` | Happy path | `executionArn` returned, draw → Settling, lock acquired |
| `PrepareKenoResettleUseCase` | Draw không Settling (race) | throw |
| `PrepareKenoResettleUseCase` | Replay sau crash (reversal đã snapshot) | Idempotent — clearReversal + snapshot lại với resettleId mới |
| `PrepareKenoResettleUseCase` | Không có entry payout > 0 (kỳ no winners) | reversalCount = 0, resetCount > 0 |
| `EnqueueKenoReversalsUseCase` | 1500 entries có reversal | Chunk loop nội bộ 3 batches × 500, return `enqueuedTotal=1500` |
| `EnqueueKenoReversalsUseCase` | Replay sau crash (cursor reset) | Duplicate `tx` skip ở outbox unique index — total enqueued vẫn đúng |
| `EnqueueKenoReversalsUseCase` | 0 entries | return `enqueuedTotal=0` ngay batch đầu |
| `EntryResettleRepo.listCandidatesForReversal` | Entry có reversal rồi | Filter loại bỏ → không trả lại |
| `EntryResettleRepo.bulkSetReversal` | Replay khi entry đã có reversal | Filter loại bỏ → modifiedCount giảm |
| `EntryResettleRepo.resetEntriesForResettle` | Replay khi entries đã Scheduled | modifiedCount=0 |
| `EntryResettleRepo.resetEntriesForResettle` | Verify $unset đầy đủ | payout/outcome/result/hasCappablePrize đều bị xoá |
| `EntryResettleRepo.resetEntriesForResettle` | Verify KHÔNG bump version | entries giữ nguyên `version` cũ sau reset (để tenant feed không thấy phase trung gian) |
| `EntryResettleRepo.bulkSetReversal` | Verify KHÔNG bump version | entries có reversal mới nhưng `version` không đổi |
| `EntryResettleRepo.clearReversalSnapshot` | Replay khi không còn reversal | modifiedCount=0 |
| `EntryResettleRepo.clearReversalSnapshot` | Verify KHÔNG bump version | entries sau clear reversal giữ nguyên `version` cũ |
| **`reversal` field sau `FinalizeSettle` (audit trail)** | Resettle xong → query entry doc | Field `reversal` GIỮ NGUYÊN với `resettleId/reversalTx/reversalAmount` của phiên gần nhất (KHÔNG bị clear ở FinalizeSettle) |
| **`reversal` field giữa 2 phiên — entries thắng cả 2** | Resettle phiên 1 (entry thắng) → resettle phiên 2 (vẫn thắng) | Sau phiên 2: `reversal` chứa data phiên 2 (overwrite phiên 1 qua `bulkSetReversal` $set) |
| **`reversal` field giữa 2 phiên — entries thắng phiên 1 NHƯNG KHÔNG thắng phiên 2** | Resettle phiên 1 (entry thắng 100K) → republish kết quả mới → resettle phiên 2 (entry KHÔNG thắng) | `PrepareResettle.step1.clearReversalSnapshot` wipe reversal phiên 1; `bulkSetReversal` phiên 2 KHÔNG snapshot entry này (vì payout=0); `EnqueueReversals` phiên 2 KHÔNG enqueue duplicate reversal phiên 1 → **KHÔNG double-debit** |
| **`getEntriesWithReversalForDispatch` ngoài scope SFN** | Sau `FinalizeSettle`, gọi function này standalone trên drawId | Trả entries phiên cũ — đây là vi phạm assumption (xem JSDoc); audit data không phải dispatch payload. Outbox unique index `tx` reject duplicate là defense layer cuối |
| Tenant feed sau resettle hoàn tất | Entries thắng từng có payout cũ → resettle với kết quả mới | Tenant feed nhận ĐÚNG 1 event (payout cũ → payout mới), KHÔNG có event trung gian "payout=0" |
| `DrawRepo.republishResultAfterSettled` | status != Settled | return null |
| `DrawRepo.VALID_TRANSITIONS[Settled]` | Settled → Voiding | NOT allowed (assert) |
| `DrawRepo.VALID_TRANSITIONS[Settled]` | Settled → Published | allowed |

### 13.2. Integration tests (SFN local)

| Scenario | Expected |
|---|---|
| Happy path: 100 entries, 30 winners (10 cap-eligible), tenant OK | Resettle SFN succeed, balance đúng cuối cùng |
| Happy path: outbox FIFO order check | Reversal `createdAt` < Payout `createdAt` cho cùng player → tenant nhận đúng thứ tự |
| Crash sau PrepareResettle | SFN retry from PrepareResettle → idempotent, không double-snapshot reversal |
| Crash giữa EnqueueReversals (batch 2 đang insert) | SFN retry toàn bộ EnqueueReversals từ đầu → cursor reset, batch 1+2 đã insert bị duplicate `tx` skip ở outbox, batch 3+ enqueue tiếp → total đúng |
| Crash trong nested Settle SFN | Nested SFN tự retry, lock vẫn held qua TTL |
| Tenant lỗi: Reversal Debit fail | Order ở `Pending`/`Failed` outbox; Payout cùng player block ở `Pending` chờ ops; Resettle SFN VẪN succeed (đã enqueue đủ); ops can thiệp dispatch dashboard |
| Trigger resettle 2 lần liên tiếp (chưa hoàn tất) | Lần 2 fail `RESETTLE_LOCK_HELD` |
| Trigger resettle với draw status Settled | `DRAW_INVALID_TRANSITION` từ BO API |
| Trigger resettle với phiên trước còn pending | `DISPATCH_BATCH_PENDING` từ BO API |
| Resettle 2 phiên liên tiếp | Phiên 2: `clearReversalSnapshot` xóa reversal phiên 1, snapshot lại với resettleId mới |
| Cap recalc sau resettle | `ApplyPayoutCaps` recalc cap đúng theo set winners mới |

### 13.3. End-to-end (smoke)

1. Settle bình thường 1 kỳ Keno có winners.
2. Verify wallet tenant đã credit đúng tổng.
3. Republish kết quả với `winningNumbers` khác hoàn toàn.
4. Resettle.
5. Verify:
   - `tenant_dispatch_orders` có 2 nhóm batchKey: reversal (action=Debit) + payout mới (action=Credit), `createdAt` reversal < payout.
   - Tenant wallet final balance = initial − totalReversal + totalNewPayout.
   - `kenoTicketEntries[].payout.payoutTx` thay đổi (resettle ID mới).
   - `kenoTicketEntries[].reversal.resettleId` ghi đúng phiên.
   - `kenoTicketEntries[].hasCappablePrize` chỉ tồn tại nếu set winners mới có top prize.
   - `kenoDraws[drawId].financial` overwrite hoàn toàn.
   - `worker_locks[lockKey="keno:resettle:{drawId}"]` có `lastSuccessAt` khớp thời điểm `FinalizeSettle`.

---

## 14. Implementation Checklist (theo thứ tự PR)

### PR 1 — Schema + Repo (no behavior change)
- [ ] `packages/game-keno/src/entities/entry.ts`: Thêm `EntryReversal` interface + field `reversal?` trong `TicketEntryDoc` + barrel export.
- [ ] `packages/game-keno-application/src/infras/repos/types/entry.types.ts`: Thêm `ReversalCandidate` + `ReversalEntryForDispatch` + barrel.
- [ ] `packages/game-keno-application/src/infras/repos/entry-resettle-repo.ts`: New file (chỉ DB ops, KHÔNG bump version cho 3 update của resettle — xem Decision Principle).
- [ ] `packages/game-keno-application/src/infras/repos/index.ts`: Export `EntryResettleRepository`.
- [ ] `packages/game-keno-application/src/infras/repos/draw-repo.ts`:
  - Thêm `republishResultAfterSettled`.
  - Update `VALID_TRANSITIONS[Settled]` = `new Set([DrawStatus.Published])` (KHÔNG cho Voiding).
- [ ] `packages/tenant-dispatch/src/infras/repos/dispatch-order-repo.ts`: KHÔNG cần thêm method mới (decision G — không check pending preflight).
- [ ] `packages/game-keno-application/package.json`: Thêm dep `@megawin/worker-core`.
- [ ] MongoDB indexes (sect 4.5) — script migration hoặc manual `db.createIndex`.
- [ ] Unit tests cho 5 repo methods mới + VALID_TRANSITIONS assertions.

### PR 2 — Settle propagate `resettleContext`
- [ ] `packages/game-keno-application/src/use-cases/settle/types.ts`: Thêm `ResettleContext { resettleId, lockOwnerToken }` (KHÔNG `payoutBatchKey` — Decision J) + field optional vào `SettleContext`.
- [ ] `packages/game-keno-application/src/use-cases/settle/prepare-settle.ts`: Thêm `resettleContext?` vào input + propagate ra ctx (KHÔNG đụng status logic, xem Decision L).
- [ ] `packages/game-keno-application/src/use-cases/settle/enqueue-dispatch-payouts.ts`: Đọc `resettleContext` → derive batchKey nội bộ (`${gameKey}:resettle:${drawId}:${resettleId}:payout`) + description suffix.
- [ ] `packages/game-keno-application/src/use-cases/settle/finalize-settle.ts`: Inject `BusinessLockCoordinator`, release lock khi `resettleContext` present. KHÔNG clear `reversal` field (Decision C — dual semantic audit).
- [ ] **Verify SFN propagation**: PrepareSettle output có `resettleContext` ✓; CalculateFinancials Assign dùng `$merge` shallow ✓; FinalizeSettle/EnqueueDispatchPayouts handler `event: SettleContext` ✓ (Decision L).
- [ ] **Settle SFN ASL KHÔNG đổi gì** — pattern Assign hiện tại đã chuẩn.
- [ ] Unit tests (settle vẫn pass + thêm test cho resettle path).
- [ ] Smoke test: settle lần đầu vẫn hoạt động bình thường.

### PR 3 — Resettle Use Cases + Lambda + SFN
- [ ] `packages/game-keno-application/src/use-cases/resettle/prepare-resettle.ts`: New file. Output shape `{ drawId, resettleId, lockOwnerToken }` (KHÔNG `reversalBatchKey`/`reversalCount`/`resetCount` — Decision I); metric → `console.info`.
- [ ] `packages/game-keno-application/src/use-cases/resettle/enqueue-reversals.ts`: New file. Input/Output shape KHỚP nhau (pure pass-through). Use case derive `reversalBatchKey` nội bộ (Decision J). KHÔNG `MAX_EXECUTION_MS` time cap. Mapper `getEntriesWithReversalForDispatch` fail-fast (Decision K).
- [ ] `packages/game-keno-application/src/use-cases/resettle/index.ts`: Barrel export.
- [ ] `packages/game-keno-application/package.json` exports map `./use-cases/resettle`.
- [ ] `apps/worker-keno/src/handlers/resettle/prepare-resettle.ts`: New handler.
- [ ] `apps/worker-keno/src/handlers/resettle/enqueue-reversals.ts`: New handler.
- [ ] `apps/worker-keno/src/step-functions/resettle.ts`: New file. 3 state thẳng (PrepareResettle → EnqueueReversals → StartSettleExecution). KHÔNG `Arguments`/`Assign` cho 2 state đầu (default passthrough — Decision D). `StartSettleExecution.Input.resettleContext` chỉ pass `{ resettleId, lockOwnerToken }` (KHÔNG `payoutBatchKey` — Decision J).
- [ ] `apps/worker-keno/package.json` script `build:sfn:resettle` + tổ hợp `build:sfn`.
- [ ] Generate `resettle.asl.json` qua script + commit.
- [ ] `apps/worker-keno/src/functions/resettle.yml`: New file (2 functions).
- [ ] `apps/worker-keno/serverless.yml`: Thêm `resettle.yml` + `KenoResettleStateMachine` resource + IAM permissions.
- [ ] Deploy worker-keno staging.
- [ ] Integration test toàn bộ resettle SFN.

### PR 4 — BO API
- [ ] `apps/backoffice/src/app/api/keno/draws/[drawId]/_lib/schema.ts`: 3 schema riêng — `publishResultSchema` (winningNumbers + optional vietlottRef), `republishResultSchema` (CHỈ winningNumbers), `vietlottRefSchema` (CHỈ vietlottRef).
- [ ] `apps/backoffice/src/app/api/keno/draws/[drawId]/publish-result/route.ts`: Import `publishResultSchema` từ `_lib/schema.ts` (không đổi behavior).
- [ ] `apps/backoffice/src/app/api/keno/draws/[drawId]/republish-result/route.ts`: New route — dùng `republishResultSchema` (KHÔNG có vietlottRef).
- [ ] `apps/backoffice/src/app/api/keno/draws/[drawId]/vietlott-ref/route.ts`: New route — POST `UpdateVietlottRefUseCase` với `vietlottRefSchema`.
- [ ] `apps/backoffice/src/app/api/keno/draws/[drawId]/resettle/route.ts`: New route.
- [ ] `apps/backoffice/src/env.ts`: Thêm `KENO_RESETTLE_SFN_ARN`.
- [ ] `apps/backoffice/.env.example`: Thêm placeholder.
- [ ] Smoke test 4 endpoint mới (publish vẫn hoạt động, republish chỉ Settled, vietlott-ref chỉ sau publish, resettle chỉ Published có `settledAt`).

### PR 5 — BO Frontend (UI/UX trang operator)
- [ ] `packages/game-keno/src/entities/draw.ts`: Cập nhật JSDoc field `settledAt` — semantic high-water mark, KHÔNG bị unset khi republish.
- [ ] `packages/game-keno-application/src/infras/repos/draw-repo.ts`:
  - `settleComplete` ghi `settledAt: now` mỗi lần settle.
  - `republishResultAfterSettled` bỏ tham số `vietlottRef`, signature 2 args.
  - Thêm method mới `updateVietlottRef(drawId, vietlottRef)`.
- [ ] `packages/game-keno-application/src/use-cases/draws/update-vietlott-ref.ts` (FILE MỚI): `UpdateVietlottRefUseCase`.
- [ ] `packages/game-keno-application/src/use-cases/draws/republish-result.ts`: Bỏ field `vietlottRef` khỏi `RepublishKenoResultInput`.
- [ ] `packages/game-keno-application/src/use-cases/draws/index.ts`: Export `UpdateVietlottRefUseCase`.
- [ ] `apps/backoffice/src/app/(main)/games/keno/operations/_lib/use-operations.ts`: Thêm `useRepublishResult`, `useUpdateVietlottRef`, `useTriggerResettle`, polling `useDrawDetail` khi `Settling`.
- [ ] `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions/publish-result-action.tsx`: Branch endpoint theo `draw.status === Settled`; ẩn input `vietlottRef` khi republish.
- [ ] `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-actions/update-vietlott-ref-action.tsx` (FILE MỚI): Dialog mỏng sửa CHỈ vietlottRef.
- [ ] `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/draw-command-center.tsx`: Bỏ nút disabled "Re-settle"; thêm nút "Kết sổ lại" với điều kiện `result.publishedAt > settledAt`; render `<UpdateVietlottRefAction>` khi sau publish.
- [ ] `apps/backoffice/src/app/(main)/games/keno/operations/_lib/sections/draw-management/index.tsx`: Wire AlertDialog xác nhận resettle + `useTriggerResettle.mutate`.
- [ ] Smoke test toàn bộ flow BO: settle → sửa kết quả → kết sổ lại → balance đúng; sửa CHỈ vietlottRef không kéo resettle.

### PR 6 — Documentation
- [ ] `apps/backoffice/README.md` (hoặc docs riêng): Quy trình resettle Keno cho ops.
- [ ] CHANGELOG entry cho `@megawin/game-keno-application`.

---

## 15. Out of Scope (làm sau)

- **Audit log riêng**: Hệ thống audit chung cho toàn ecosystem (login, BO action, financial change). Sẽ tích hợp event emit chung trong `RepublishKenoResultUseCase`, `TriggerKenoResettleUseCase`, `PrepareKenoResettleUseCase`, `FinalizeSettleUseCase` — nhưng theo plan riêng, không ad-hoc trong resettle.
- **Resettle Jackpot games**: `Lotto535`, `Mega645`, `Power655`. Có plan riêng `resettle-jackpot.plan.md` — phức tạp hơn vì jackpot cycle, companyTake, split.
- **Tenant retry tự động khi reversal stuck**: Hiện tại stuck thì ops xử lý tay (force=true đẩy lại, hoặc `force=null` stop). Cơ chế retry tự động + alert là feature riêng.
- **Metrics/dashboard cho resettle**: Số lần resettle/tháng/game, total reversal amount, MTTR — Grafana/CloudWatch dashboard riêng.

---

## 16. Template cho các game non-jackpot khác

Plan này được thiết kế làm **template cho resettle ở các game không có jackpot** (`Max3D`, `Max3DPro`, `Bingo18`). Khi áp dụng cho game mới:

### 16.1. Phần GIỮ NGUYÊN (template)

- Cấu trúc 3 bước flow nghiệp vụ (Sect 2): Republish → Trigger → Resettle SFN.
- Pattern `BusinessLockCoordinator` per drawId (Sect 6.2) — chỉ đổi prefix `keno:resettle:` → `{game}:resettle:`.
- Pattern `EntryResettleRepository` chỉ DB ops (Sect 5.1), KHÔNG bump version cho 3 update của resettle (xem Decision Principle về version bump).
- **Pattern 3 schema riêng cho publish/republish/vietlott-ref (Sect 10.0)** — KHÔNG share schema giữa republish và publish. Republish CHỈ winningNumbers; vietlott-ref CHỈ vietlottRef.
- **Pattern endpoint riêng `vietlott-ref` (Sect 6.0 + 10.2)** — sửa metadata tham chiếu Vietlott KHÔNG kéo resettle. Áp dụng cho mọi game có `vietlottRef` field.
- Pattern BO UI: `settledAt` high-water mark + nút "Kết sổ lại" so sánh `result.publishedAt > settledAt`.
- Pattern BO UI: Action riêng `<UpdateVietlottRefAction>` cho status `Published`/`Settling`/`Settled`.
- `VALID_TRANSITIONS[Settled] = new Set([Published])` — KHÔNG cho Voiding (Sect 4.2).
- `EntryReversal` cùng cấp với `payout` trên `TicketEntryDoc` (Sect 4.1).
- SFN không có `WaitReversalsDispatched` — tin FIFO outbox (Sect "FIFO outbox").
- `resettleContext { resettleId, lockOwnerToken }` propagate qua `SettleContext` (Sect 8). KHÔNG có `payoutBatchKey` field — derive ở use case (Decision J).
- **3-state SFN thẳng**: `PrepareResettle → EnqueueReversals → StartSettleExecution`. KHÔNG `CheckHasReversals` Choice, KHÔNG `CheckEnqueueDone` Choice — use case handle gracefully (Decision I).
- **Default state passthrough**: Use case input/output shape khớp nhau → không cần `Arguments`/`Assign` field-by-field trên SFN (Decision D).
- **Convention naming `batchKey` centralize ở use case** — `EnqueueReversalsUseCase` derive `reversalBatchKey`, `EnqueueDispatchPayoutsUseCase` derive `payoutBatchKey`. SFN ASL KHÔNG dùng JSONata build derived strings (Decision J).
- **Metric → CloudWatch logs, KHÔNG SFN state**: `console.info({ event, drawId, resettleId, count })` thay vì propagate qua SFN (Decision I).
- **Repository mapper fail-fast**: `getEntriesWithReversalForDispatch` throw nếu `reversalTx`/`reversalAmount`/`ticketNo` invalid — KHÔNG silent fallback `?? 0`/`?? ""` (Decision K).

### 16.2. Phần CẦN ĐIỀU CHỈNH theo game

| Mục | Keno | Non-jackpot game khác |
|---|---|---|
| **Game-specific flag reset** | `$unset: hasCappablePrize` | Bỏ — game khác không có cap top-prize |
| **Settle SFN steps** | Có `ApplyPayoutCaps` step trước `EnqueueDispatchPayouts` | Bỏ step này |
| **Số quay/draw schema** | 20 số `01-80` unique | Theo game (3 số `0-9` cho Max3D, 27 số cho Bingo18, ...) |
| **Validation route Zod** | `kenoNumberSchema` regex `^(0[1-9]|[1-7]\d|80)$` | Đổi regex theo game |
| **Lock prefix** | `keno:resettle:{drawId}` | `{game}:resettle:{drawId}` |
| **batchKey prefix** | `keno:resettle:{drawId}:{resettleId}:reversal` | `{game}:resettle:{drawId}:{resettleId}:reversal` |
| **SFN ARN env var** | `KENO_RESETTLE_SFN_ARN` | `{GAME}_RESETTLE_SFN_ARN` |
| **Use case package paths** | `@megawin/game-keno-application/...` | `@megawin/game-{game}-application/...` |
| **Game brand color UI** | orange (Keno) | Theo `GAME_COLORS[GameProduct.X]` |

### 16.3. Checklist khi clone plan cho game mới

1. Replace `keno` → `{game}` (lowercase) ở mọi paths/imports.
2. Replace `Keno` → `{Game}` (PascalCase) ở mọi class name.
3. Replace `KENO` → `{GAME}` (UPPER) ở mọi env var.
4. Bỏ tham chiếu `hasCappablePrize`, `CAPPABLE_PICK_COUNTS`, `ApplyPayoutCaps`.
5. Đổi `winningNumbers` schema (length, regex) theo game.
6. Đổi UI brand color theo `GAME_COLORS[GameProduct.{Game}]` (Sect 11).
7. Verify `bulkSettleEntries` của game mới ghi field nào → cập nhật `$unset` của `resetEntriesForResettle` đầy đủ. Verify rằng `bulkSettleEntries` query toàn bộ entries Scheduled (cả thắng + thua) — đây là điều kiện để bỏ bump version ở `resetEntriesForResettle` mà không kẹt entry version cũ (xem Decision Principle H).
8. Verify `EntryPayout` shape của game mới — adjust `ReversalCandidate.payoutAmount` source.
9. **KHÔNG bump version** ở 3 update của `EntryResettleRepository` (`bulkSetReversal`, `resetEntriesForResettle`, `clearReversalSnapshot`) — xem Decision Principle H. Nếu game mới phá invariant "bulkSettleEntries query toàn bộ entries Scheduled" (e.g. chỉ query entries thắng) thì PHẢI bump version ở `resetEntriesForResettle` để entries thua không kẹt — flag rõ trong code review.
10. **KHÔNG dùng app-level `MAX_EXECUTION_MS`** trong `EnqueueReversalsUseCase` của game mới — xem Decision Principle 29. Function CHỈ làm Mongo bulk insert, không gọi tenant API. Pattern: `while (true) { fetch batch; if empty break; bulk insert; if (entries.length < BATCH_SIZE) break; }`. Single Lambda invocation chạy hết. SFN flow: 1 Task state, no Choice loop. Áp dụng cùng nguyên tắc cho `EnqueueDispatchPayouts` / `EnqueueDispatchRefunds` của game mới khi PR liên quan.
11. **Bỏ `clearReversalSnapshot` ở `FinalizeSettle`** — xem Decision Principle 28. Field `reversal` giữ làm audit trail của phiên resettle gần nhất. Apply consistent cho mọi game non-jackpot.
12. **SFN context tối thiểu — KHÔNG metric/derived field** (Decision I + J): `PrepareResettleOutput` và `EnqueueReversalsOutput` chỉ chứa `{ drawId, resettleId, lockOwnerToken }`. KHÔNG `reversalCount`, `resetCount`, `enqueuedTotal`, `reversalBatchKey`. Metric log qua `console.info` → CloudWatch. `payoutBatchKey` KHÔNG có trong `ResettleContext` cross-SFN — `EnqueueDispatchPayoutsUseCase` (nested Settle SFN) tự derive.
13. **SFN 3-state thẳng — KHÔNG `CheckHasReversals`/`CheckEnqueueDone` Choice** (Decision I): `PrepareResettle → EnqueueReversals → StartSettleExecution`. `EnqueueReversalsUseCase` handle 0 entries graceful (1 query trả empty, return ngay). PrepareResettle/EnqueueReversals KHÔNG `Arguments`/`Assign` — default passthrough (Decision D).
14. **Repository mapper fail-fast — KHÔNG silent fallback** (Decision K): `getEntriesWithReversalForDispatch` mapper THROW khi `reversal.reversalTx`/`reversal.reversalAmount`/`entrySummary.ticketNo` invalid hoặc missing. KHÔNG dùng `?? 0`, `?? ""` cho field business-critical. SFN catch + retry; ops nhận alert qua CloudWatch.
15. **Settle SFN ASL KHÔNG đổi gì** (Decision L): `resettleContext` propagate qua `$settleCtx` (Assign ở `PrepareSettle`, $merge shallow ở `CalculateFinancials`). `FinalizeSettleUseCase` + `EnqueueDispatchPayoutsUseCase` destructure `resettleContext` từ `SettleContext`. PR Settle propagate KHÔNG động vào file `apps/worker-{game}/src/step-functions/settle.ts`.

---

## 17. Quan điểm thiết kế đã chốt

1. **KHÔNG chờ reversal Dispatched trong SFN**: Megawin enqueue đúng thứ tự (reversal trước, payout sau) là đủ. Outbox FIFO per tenant đảm bảo dispatch order. Tenant lỗi → ops xử lý dispatch dashboard, KHÔNG block resettle/settle pipeline. SFN báo xong khi enqueue đủ.
2. **`Published` only**: Mọi resettle bắt buộc đi qua `republish-result` để sửa kết quả trước. Tránh chạy lại settle với kết quả cũ.
3. **BO API tự transition Published → Settling**: Cùng pattern `TriggerSettleUseCase`. SFN nhận draw đã ở `Settling` cho cả settle lần đầu và resettle. `PrepareSettleUseCase` KHÔNG branch logic theo path.
4. **WorkerLock per drawId**: Một drawId chỉ có thể đang resettle 1 phiên duy nhất. TTL 300s (5 phút). SFN crash → TTL tự release.
5. **`lockOwnerToken` mục đích kép**: (a) Ownership cho `lockCoordinator.release` đúng owner, tránh release nhầm khi TTL hết; (b) Trace SFN execution → worker_locks doc qua ownerToken.
6. **No DI container**: Tuân theo pattern hiện tại của codebase (`new Repo()` instance property). Không introduce `tsyringe`/`inversify`.
7. **No `audit_logs` collection**: Hệ thống audit chung sẽ làm sau.
8. **No `sequence` field ở dispatch order**: Outbox không enforce thứ tự qua sequence. Orchestration enqueue đúng thứ tự + outbox FIFO per tenant đảm bảo dispatch order.
9. **`Settled` là final cho Voiding**: `VALID_TRANSITIONS[Settled]` chỉ có `Published` (resettle path), KHÔNG có `Voiding`. Void chỉ áp dụng giai đoạn trước `Settled`.
10. **Repo chỉ DB ops**: `EntryResettleRepository` không sinh UUID, không ghép batchKey, không build snapshot — toàn bộ logic ở use case. Repo nhận data đã chuẩn hoá.
11. **Validation chia tầng**: zod ở route handler validate format. Use case chỉ check business state.
12. **Settle SFN không đổi**: Resettle = nested gọi Settle SFN nguyên bản. Chỉ `SettleContext` thêm `resettleContext?` optional propagate qua state.
13. **Resettle N lần an toàn**: `clearReversalSnapshot` + `resettleId` UUIDv7 mỗi phiên + batchKey unique.
14. **`reversal` cùng cấp với `payout`**: KHÔNG nest vào `payout` — `bulkSettleEntries` ghi lại toàn bộ `payout` qua `$set` sẽ overwrite nếu nest. Đặt cùng cấp giúp giữ snapshot reversal độc lập với mọi lần re-settle.
15. **`reset` $unset đầy đủ**: `payout, outcome, result, hasCappablePrize` — toàn bộ field do `bulkSettleEntries` ghi. KHÔNG để sót.
16. **`settledAt` high-water mark**: `DrawDoc.settledAt` set bởi `FinalizeSettleUseCase` mỗi lần settle thành công, KHÔNG bị unset bởi `republishResultAfterSettled`. UI dùng so sánh `result.publishedAt > settledAt` → biết đã có republish mới chưa resettle → hiển thị nút "Kết sổ lại".
17. **Tách 3 schema riêng cho publish + republish + vietlott-ref**: KHÔNG share `publishResultSchema` giữa publish và republish nữa. `republishResultSchema` CHỈ nhận `winningNumbers` (bỏ `vietlottRef`); endpoint riêng `vietlott-ref` xử lý sửa metadata tham chiếu. Single Responsibility per endpoint, không gộp 2 việc khác nhau vào 1 endpoint.
18. **BO UI tái dùng dialog `PublishResultAction`**: 1 dialog phục vụ cả 3 case (publish, republish khi Published, republish khi Settled). Branch endpoint qua `useRepublishResult` vs `usePublishResult` theo `draw.status`. Khi republish: ẩn input `vietlottRef`. Sửa CHỈ vietlottRef → action riêng `UpdateVietlottRefAction`.
19. **Plan này là template cho non-jackpot games**: Sect 16 liệt kê phần GIỮ NGUYÊN (template) và phần CẦN ĐIỀU CHỈNH (game-specific). Áp dụng cho Max3D, Max3DPro, Bingo18 chỉ thay prefix + bỏ `hasCappablePrize`/`ApplyPayoutCaps`.
20. **Resettle KHÔNG bump `version` ở 3 update phụ trợ** (`bulkSetReversal`, `resetEntriesForResettle`, `clearReversalSnapshot`): version là change-feed cho tenant qua `entryFeed`, không phải audit log. 3 update này tạo trạng thái trung gian / internal field — không có ý nghĩa với tenant. Chỉ `bulkSettleEntries` và `bulkApplyPayoutCap` bump version vì ghi business state mới (payout/result/outcome). Tenant nhận đúng 1 event sạch "payout cũ → payout mới" thay vì 3 event mâu thuẫn. Câu test cho mọi update sau này: "Tenant nhận event này có làm gì khác đi không?". Nếu KHÔNG → đừng bump. Xem Decision Principle H.
20. **Phân biệt Settle lần đầu vs Resettle (R-BO-5)**: Cả 2 đều có `status === Published` + `result.publishedAt != null`. Phân biệt qua `settledAt`: <br/>• `settledAt == null` → chưa từng settle → CHỈ được dùng Settle (`/trigger-settle`). <br/>• `settledAt != null && publishedAt > settledAt` → có republish mới sau settle gần nhất → CHỈ được dùng Resettle (`/resettle`). <br/>Backend `TriggerKenoResettleUseCase` enforce strict (codes `DRAW_NEVER_SETTLED`, `DRAW_NO_NEW_RESULT`) để defense-in-depth nếu UI bug. Frontend hiển thị 2 nút mutually exclusive theo cùng điều kiện.
21. **`resettleId` sinh ở BO API, propagate xuôi SFN — KHÔNG sinh ở Lambda**: `PrepareResettleInput.resettleId` REQUIRED. Sinh ở Lambda với fallback `?? generateId()` sẽ phá idempotent qua replay (mỗi retry ra resettleId khác → snapshot/batchKey corrupt). SFN `PrepareResettle` Task có `Arguments` rõ ràng forward `$states.input.resettleId`.
22. **`reversalTx` sinh MỚI ở `PrepareResettle`, KHÔNG copy `payout.payoutTx` cũ**: payoutTx cũ là idempotency key của transaction PAYOUT đã dispatch xong trong outbox. Reversal là transaction MỚI (Debit) độc lập — phải có `tx` mới để outbox unique index không reject.
23. **Clear `reversal` field bằng `$unset`, CHỈ ở `PrepareResettle` step 1**: Tiết kiệm BSON storage; sparse index hoạt động đúng; semantic `$exists` đồng bộ với filter `getEntriesWithReversalForDispatch`. CHỈ gọi 1 lần ở `PrepareResettle` step 1 (replay-safe wipe trước `bulkSetReversal`) — bắt buộc để xoá reversal phiên N-1 trên entries thắng phiên N-1 nhưng KHÔNG thắng phiên N (tránh `EnqueueReversals` query `$exists: true` trả set sai → DOUBLE-DEBIT). KHÔNG gọi ở `FinalizeSettle` resettle path — field giữ làm audit trail của phiên gần nhất (xem Principle 28).
24. **Acquire WorkerLock ở BO API, KHÔNG ở Lambda**: 2 staff click cùng lúc → 1 thắng + 1 fail HTTP rõ ràng. Acquire ở Lambda thì cả 2 đều OK ở BO, vài giây sau Lambda mới fail → state đã transition `Settling` mà SFN không chạy → kẹt phức tạp. Pattern đồng nhất với `TriggerSettleUseCase`.
25. **SFN execution name DETERMINISTIC theo `(drawId, settledAt)` — KHÔNG dùng `resettleId`**: Cùng pattern với `TriggerSettleUseCase` (deterministic `toExecutionName(drawId)`). AWS giữ name unique 90 ngày + idempotent ở mức StartExecution: cùng name + cùng input → trả execution hiện tại thay vì throw `ExecutionAlreadyExists`. Token là `settledAt.getTime()` vì: (a) DETERMINISTIC trong cùng phiên dở dang (settledAt chỉ thay đổi khi `FinalizeSettle` ghi lại sau khi 1 phiên hoàn tất); (b) phân tách 2 phiên resettle khác nhau (republish lần 2 → settledAt mới → name mới). Hệ quả: retry sau `startExecution` fail an toàn end-to-end. KHÔNG dùng `resettleId` vì sinh mới mỗi request → name khác mỗi retry → có thể tạo nhiều execution chồng. `resettleId` chỉ đi vào SFN INPUT để Lambda dùng làm snapshot key/tracing.
26. **KHÔNG check `aggregateBatchProgress` của batch dispatch trước**: Outbox FIFO per tenant tự đảm bảo Reversal trước Payout cùng player. Tenant offline → block resettle vô thời hạn → deadlock không tự giải. Tenant lỗi là việc của ops dispatch dashboard, KHÔNG phải BO API. Đồng nhất với `TriggerSettleUseCase`.
27. **`vietlottRef` tách endpoint riêng — KHÔNG kéo resettle**: `vietlottRef` chỉ là metadata tham chiếu (drawPeriod, drawDate hiển thị cross-link sang Vietlott), KHÔNG tham gia matching/payout calculation. Sửa field này qua endpoint `vietlott-ref` riêng giữ nguyên status, KHÔNG `$unset` financial/stats/settleSummary, KHÔNG kéo resettle. Tránh staff click "Sửa kết quả" chỉ để fix vietlottRef → tạo orphan resettle workflow vô lý. Áp dụng cho mọi game non-jackpot có `vietlottRef`.
28. **`reversal` field giữ làm audit trail sau `FinalizeSettle` — semantic kép theo lifecycle**: Field có 2 vai trò theo thời điểm:
    - **(a) Dispatch payload** (giữa `PrepareResettle.bulkSetReversal` và `FinalizeSettle`): `EnqueueReversals` đọc field để build dispatch order Debit. Phải hợp lệ và khớp 1-1 với phiên resettle hiện tại.
    - **(b) Audit snapshot** (sau `FinalizeSettle`, trước phiên resettle kế tiếp): Field giữ snapshot phiên resettle GẦN NHẤT — CS/forensic query trực tiếp trên entry doc: `reversal.resettleId` (trace nhóm phiên), `reversal.reversalTx` (join `tenant_dispatch_orders` xem trạng thái dispatch), `reversal.reversalAmount` (so với `payout.payoutAmount` mới — biết phiên resettle giảm/tăng bao nhiêu).
    
    **Audit chỉ giữ phiên gần nhất** — phiên N+1 overwrite phiên N. Cần audit đầy đủ chuỗi phiên → query `tenant_dispatch_orders` với `sourceKind=Reversal, sourceId=entryId`.
    
    **Lifecycle correctness giữa 2 phiên**:
    - Entry thắng cả phiên N và N+1: `bulkSetReversal` overwrite (filter chỉ là `{_id, status: Settled}`, `$set` overwrite hoàn toàn — KHÔNG có `$exists: false` skip).
    - Entry thắng phiên N nhưng KHÔNG thắng N+1: `clearReversalSnapshot` ở `PrepareResettle.step1` của phiên N+1 wipe reversal phiên N → bắt buộc để tránh double-debit.
    
    **Storage cost**: Per resettle ~10K winners × 100B = 1MB. Per năm (36 draws/ngày × 365 × ~1% draws resettle): ~130MB — trivial vs toàn DB.
    
    **Defense quan trọng**: `getEntriesWithReversalForDispatch` CHỈ được gọi bởi `EnqueueReversalsUseCase` trong scope SFN ĐANG CHẠY. Sau finalize field lingers — nếu function được gọi LẠI ngoài scope SFN (cron, replay tool, ad-hoc query) sẽ trả entries phiên cũ → re-enqueue duplicate → DOUBLE-DEBIT. Outbox unique index `tx` reject duplicate là defense layer thứ 2; KHÔNG dựa vào đó. JSDoc của function ghi rõ assumption này; future devs muốn replay/audit phải implement function khác.
29. **KHÔNG dùng app-level time cap (`MAX_EXECUTION_MS`) cho use case CHỈ làm DB I/O** — `EnqueueReversals`, `EnqueueDispatchPayouts`, `EnqueueDispatchRefunds` của TẤT CẢ games:
    - Function CHỈ làm Mongo bulk insert vào `tenant_dispatch_orders` — KHÔNG gọi HTTP tenant API (worker dispatch riêng lo). Worst-case 5K entries = 10 batches × 500 = ~3-10 giây.
    - App-level cap (`while (Date.now() - startTime < MAX_EXECUTION_MS)`) tạo phức tạp KHÔNG cần thiết: phải thêm `cursor`/`enqueuedTotal` vào input/output, thêm `done` flag, thêm SFN Choice state self-loop → tăng surface area cho bug, làm flow khó đọc.
    - Defense layer ĐÚNG: SFN/Lambda timeout policy. Nếu DB lag bất thường gây timeout (cluster failover, network hiccup), SFN tự retry từ đầu — idempotent qua outbox unique index `tx`. Cursor reset không gây vấn đề: batch đã insert bị skip duplicate.
    - Pattern bắt buộc: `while (true) { fetch batch; if empty break; bulk insert; if (entries.length < BATCH_SIZE) break; }`. Single Lambda invocation chạy hết toàn bộ. SFN flow đơn giản: 1 Task state, no Choice loop.
    - **CẢNH BÁO khi áp dụng cho game khác**: nếu future PR thêm HTTP call hoặc compute nặng vào use case này (e.g. fetch tenant config từ external API per entry), MỚI cần re-evaluate. Còn pure DB I/O — KHÔNG cần cap.
30. **SFN context tối thiểu — chỉ propagate field destructure ở state kế tiếp** (xem Decision I): `PrepareResettleOutput` và `EnqueueReversalsOutput` chỉ chứa `{ drawId, resettleId, lockOwnerToken }`. Metric (`reversalCount`, `resetCount`, `enqueuedTotal`) log qua `console.info({ event, drawId, resettleId, count })` → CloudWatch Logs Insights. Lý do: SFN state context là channel orchestration (256KB limit), mỗi field thừa làm payload nặng + JSONata mapping phức tạp + comment khó đọc. Test cụ thể cho mỗi field: "State kế tiếp DESTRUCTURE field này hay không? Có dùng cho Choice condition / Arguments mapping / Catch error không?" Nếu KHÔNG → bỏ. Hệ quả phụ: Choice state `CheckHasReversals` và `CheckEnqueueDone` cũng bỏ — `EnqueueReversalsUseCase` handle 0 entries graceful (1 query trả empty, cost ~$0.0000002), gọn hơn 1 Choice state.
31. **Convention naming `batchKey` centralize ở use case (Lambda) — KHÔNG SFN ASL** (xem Decision J): Convention `${gameKey}:resettle:${drawId}:${resettleId}:${kind}` với `kind ∈ { reversal, payout }` build 100% trong TypeScript use case (`EnqueueReversalsUseCase` cho reversal, `EnqueueDispatchPayoutsUseCase` cho payout). Lý do: build ở 2 chỗ (SFN ASL JSONata + use case TS) tạo 2 source of truth → bug khi convention đổi. SFN ASL JSONata không type-check → silent corruption. Hệ quả: `ResettleContext` KHÔNG chứa `payoutBatchKey` field — derive được từ `resettleId + drawId` đã có trong context. `StartSettleExecution.Input.resettleContext` chỉ pass `{ resettleId, lockOwnerToken }`.
32. **SFN dùng default state input/output passthrough — TỐI THIỂU `Arguments`/`Assign`** (xem Decision D): JSONata mode auto-passthrough input/output giữa Task states. Khi use case input/output shape KHỚP nhau, KHÔNG cần `Arguments` mapping field-by-field cũng KHÔNG cần `Assign`. Pattern Resettle SFN mới: `PrepareResettle → EnqueueReversals` chỉ có `Resource + Next + Retry`, KHÔNG `Arguments`/`Assign`. `Arguments` CHỈ cần khi cross-SFN boundary cần wrap input vào nested struct (`StartSettleExecution`); `Assign` CHỈ cần ở Settle SFN (Choice rẽ nhánh `CheckSettleDone` + `CheckSyncDone` cần persist `$settleCtx`). Quy tắc: nếu input/output shape khớp → bỏ mapping. Nếu cần wrap/unwrap → giữ.
33. **Repository mapper fail-fast — corrupt data dừng tại mapper, KHÔNG silent fallback** (xem Decision K): Field business-critical (`id`, `tx`, `amount`, financial values) trong repo mapper PHẢI throw nếu missing/invalid — KHÔNG `?? 0`, `?? ""` fallback. Lý do: `EnqueueDispatchOrdersUseCase.validateOrder` log error nhưng KHÔNG throw khi `tx`/`amount` invalid → order bị silently dropped khỏi outbox → balance lệch + traceback gãy. Repository là defense layer cuối giữa BSON document và domain object. Throw error với message kèm `entryId + drawId + field name + value` để ops debug. Field optional UI-only (description, metadata.label) thì OK fallback. Apply consistent cho mọi `getEntriesWith*ForDispatch` mapper của mọi game.
34. **`resettleContext` propagate xuyên Settle SFN qua `$settleCtx`, KHÔNG đổi Settle SFN ASL** (xem Decision L): `PrepareSettleUseCase` thêm `resettleContext` vào output `SettleContext`. Settle SFN Assign `{ settleCtx: $states.result }` ở PrepareSettle persist xuyên mọi state. `CalculateFinancials.Assign` dùng `$merge` shallow → giữ nguyên `resettleContext` khi merge `financials`. Hai consumer cuối (`FinalizeSettleUseCase`, `EnqueueDispatchPayoutsUseCase`) destructure từ `SettleContext` → đọc đúng. PR Settle propagate KHÔNG động vào file `apps/worker-{game}/src/step-functions/settle.ts` — pattern Assign hiện tại đã chuẩn.
