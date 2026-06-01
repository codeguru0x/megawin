# Resettle Plan 2 — Game Có Jackpot

> **Scope**: Lotto 5/35, Mega 6/45, Power 6/55
> **Kế thừa**: `resettle-non-jackpot.plan.md` (TOÀN BỘ logic core)
> **Bổ sung**: DBA workflow ở MongoDB Compass/Studio 3T cho jackpot cycle
> restoration; auto-detect chain boundaries; pre-flight check escalate
> sang DBA manual mode khi cần.
> **Tiền điều kiện**: Plan 1 đã ship production ≥ 2 tuần, ổn định.

---

## 1. Tóm tắt nguyên tắc kế thừa từ Plan 1

Tất cả logic core sau **giữ nguyên** không thay đổi:

- 3 bước nghiệp vụ ở BO (Republish → Trigger → SFN).
- Status precondition `/resettle`: **CHỈ accept `Published`** (đã republish ở Bước 1). KHÔNG accept `Settled` để tránh rủi ro chạy lại settle với kết quả cũ.
- Preflight `aggregateBatchProgress(lastBatchKey).pending === 0` chạy ở **BO API** (fail-fast UX), KHÔNG ở SFN.
- Tận dụng `WorkerLockRepository` từ `@megawin/worker-core` cho lock chống double-trigger (`lockKey = "{game}:resettle:{drawId}"`, TTL 600s). KHÔNG tạo collection lock riêng.
- Tách repo: `entry-resettle-repo.ts` riêng (theo pattern `entry-void-repo.ts`), KHÔNG mix vào `entry-repo.ts`.
- Resettle SFN 4 state: `PrepareResettle → EnqueueReversalsLoop →
  EnqueueReversals → StartSettleExecution`.
- Reuse Settle SFN nested qua `states:startExecution.sync:2`.
- Entity schema thêm `EntryReversal` (cùng cấp `payout`).
- Use cases `PrepareResettle`, `EnqueueReversals`.
- Settle SFN modify minimal: `PrepareSettle` + `EnqueueDispatchPayouts`
  đọc `resettleContext` (gồm `resettleId`, `batchKey`, `lockOwnerToken`).
- DRY tuyệt đối, KISS, idempotent đa tầng.
- Feature flag.
- **Audit log: KHÔNG nằm trong scope plan** — sẽ làm chức năng audit log riêng tích hợp xuyên hệ thống.

**Phần MỚI của Plan 2**:
1. **Pre-flight chain boundary detection** — auto check trước khi cho
   phép trigger resettle.
2. **DBA Manual Mode** — workflow cho DBA chạy script ở MongoDB Compass /
   Studio 3T để restore jackpot cycle TRƯỚC khi staff trigger Resettle SFN.
3. **`preSettleCycleSnapshot`** — field mới trên DrawDoc để restore cycle
   về state TRƯỚC khi settle.
4. **Maintenance mode flag** — block scheduled settle khi đang resettle
   chain boundary phức tạp.

---

## 2. Game scope & complexity

| Game | Jackpot type | Cycle complexity | DBA workload |
|---|---|---|---|
| Mega 6/45 | Single JP | 1 cycle active | Thấp |
| Lotto 5/35 | Single + Split | 1 cycle, split khi ≥ 12 tỷ | Trung bình |
| Power 6/55 | Dual (JP1 + JP2) | 2 cycles song song | Cao |

| Game | gameId | batchKey prefix | Worker app |
|---|---|---|---|
| Mega 6/45 | `mega645` | `mega645:resettle:*` | `worker-mega645` |
| Lotto 5/35 | `lotto535` | `lotto535:resettle:*` | `worker-lotto535` |
| Power 6/55 | `power655` | `power655:resettle:*` | `worker-power655` |

---

## 3. Phân loại scenario resettle (CỐT LÕI)

Resettle game có jackpot phân thành **4 loại** theo độ phức tạp:

### Type 1 — No-cycle-change (không cần resettle, chỉ DBA fix snapshot)

**Khi nào**: Kết quả của kỳ T đổi nhưng KHÔNG ảnh hưởng tier nào tích luỹ
JP, KHÔNG ảnh hưởng winner JP. Chỉ thay đổi nhỏ về `currentAmount`,
`drawCount` của jackpot cycle.

**Hành động**:
- DBA chạy script Compass/Studio 3T update trực tiếp `jackpot_cycles`
  collection: `currentAmount`, `drawCount`.
- DBA update `draws.{T}.jackpot.openingAmount`, `closingAmount`,
  `draws.{T}.financial.jackpotContribution`.
- **KHÔNG cần chạy Resettle SFN**.

→ Chi tiết script: §6.

### Type 2 — Cascade no-boundary (Plan 1 path)

**Khi nào**: Kỳ T sai → resettle T → các kỳ T+1, T+2... cũ KHÔNG có
JP winner và sau resettle T cũng KHÔNG sinh JP winner mới.

**Hành động**:
- DBA prep cycle T: update `jackpot_cycles.currentAmount` về state
  TRƯỚC khi settle T (lấy từ `draws.{T}.preSettleCycleSnapshot`).
- Staff trigger Resettle SFN cho T → chạy Plan 1 path bình thường.
- Settle SFN nested re-calculate `financial.jackpotContribution` của T.
- `FinalizeSettle` nested re-update cycle stats.

**Cho các kỳ T+1, T+2... sau T**: nếu chỉ thay đổi cycle stats mà entries
không đổi tier → **DBA update bằng tay từng kỳ** (Type 1 logic), không
cần resettle. Vì entry payouts không đổi.

### Type 3 — Cascade with boundary OLD (DBA Manual Mode)

**Khi nào**: Trong chain T, T+1, T+2... có ít nhất 1 kỳ trong dữ liệu CŨ
có JP winner (cycle close + cycle mới tạo).

**Hành động**:
1. **DBA Manual Mode**: DBA chạy script Compass restore CHUỖI cycles
   của TẤT CẢ kỳ trong chain về state TRƯỚC khi settle T.
2. Sau đó staff trigger Resettle SFN cho từng kỳ TUẦN TỰ:
   - Resettle T trước.
   - Sau khi T xong, DBA verify cycle state, prep cho T+1.
   - Resettle T+1.
   - Lặp lại đến hết chain.
3. **KHÔNG resettle song song** — phải tuần tự.

→ Chi tiết script restore: §7.

### Type 4 — Cascade with boundary NEW (DBA Manual Mode + careful)

**Khi nào**: Sau resettle T với kết quả mới, TẠO RA JP winner mới ở T
hoặc trong chain mà cũ không có.

**Hành động**:
- Tương tự Type 3 nhưng cẩn trọng hơn — DBA cần biết trước resettle T sẽ
  tạo JP winner để prep cycle close + create new cycle.
- Resettle SFN nested `FinalizeSettle` sẽ tự handle close cycle + create
  new cycle (logic đã có trong settle path forward).
- DBA chỉ cần đảm bảo `preSettleCycleSnapshot` đúng state TRƯỚC settle T.

---

## 4. Pre-flight Chain Boundary Detection

**Quyết định đã chốt (3a)**: Auto-detect chain boundaries, hiển thị
specific request cho DBA nếu cần intervention.

### 4.1. Use case mới: `DetectResettleBoundariesUseCase`

File: `packages/game-{game}-application/src/use-cases/resettle/detect-boundaries.ts`

```typescript
export interface DetectResettleBoundariesInput {
  drawId: string;
}

export interface DetectResettleBoundariesOutput {
  /** Type 1/2/3/4 theo §3. */
  scenario: "no-cycle-change" | "cascade-no-boundary"
          | "cascade-boundary-old" | "cascade-boundary-new-suspected";

  /** Chain các draws sau drawId trong cùng cycle hoặc cycles tiếp theo. */
  chain: Array<{
    drawId: string;
    drawNo: number;
    drawDate: string;
    status: DrawStatus;
    hasJackpotWinner: boolean;
    cycleId: string;
    cycleClosedAt?: Date;
  }>;

  /** Cycles bị ảnh hưởng — DBA cần restore trước khi resettle. */
  affectedCycles: Array<{
    cycleId: string;
    cycleNo: number;
    status: "active" | "closed";
    needsRestore: boolean;
    /** Lý do cụ thể để hiển thị cho DBA. */
    reason: string;
  }>;

  /** Có thể tự động resettle (Type 2) hay cần DBA (Type 3/4)? */
  canAutoResettle: boolean;

  /** Hướng dẫn cụ thể cho DBA (markdown). */
  dbaInstructions?: string;
}
```

Logic:

```typescript
1. Load draw T = drawRepo.getDrawById(drawId).
2. Load cycle hiện tại của T qua draw.cycleId.
3. Aggregate chain — tất cả draws có drawNo > T.drawNo trong cùng game.
4. Phân tích chain:
   - Có draw nào hasJackpotWinner = true? → Type 3.
   - Cycle nào closed sau T? → cycleClosedAt — needs restore.
5. Predict resettle outcome:
   - Re-match T với result mới — có hit JP không?
   - Nếu có hit JP mà cũ không có → Type 4.
6. Generate DBA instructions theo affectedCycles.
7. Return.
```

### 4.2. API: GET pre-flight check

File: `apps/backoffice/src/app/api/{game}/draws/[drawId]/resettle-preflight/route.ts`

```typescript
export const GET = withApi()
  .auth({ roles: [CompanyRole.Admin, CompanyRole.Staff] })
  .handler(async ({ params }) => {
    return detectBoundariesUseCase.run({ drawId: params.drawId });
  });
```

### 4.3. UI: Block trigger nếu cần DBA

```
┌─ Khối "Resettle" ──────────────────────────────────────────────────┐
│ Pre-flight check (auto-fetch khi mở dialog):                       │
│                                                                     │
│ Scenario detected: cascade-boundary-old                            │
│                                                                     │
│ ⚠ Cần DBA can thiệp trước:                                         │
│   - Cycle JP1-014 đã close ở kỳ T+2 (2026-03-10.045)              │
│   - Cycle JP1-015 đã được tạo                                      │
│   - DBA cần restore chuỗi cycles trước khi resettle.               │
│                                                                     │
│ [Xem hướng dẫn DBA] [Đã thực hiện DBA — Tiếp tục]                  │
│                                                                     │
│ Submit button DISABLED cho đến khi staff tick "DBA confirmed".    │
└─────────────────────────────────────────────────────────────────────┘
```

Form schema:

```typescript
const triggerResettleJackpotSchema = z.object({
  reason: z.string().min(5).max(500),
  /** Bắt buộc khi scenario != cascade-no-boundary và != no-cycle-change. */
  dbaConfirmed: z.boolean().refine(v => v === true, {
    message: "Phải xác nhận DBA đã restore cycles.",
  }),
  /** Operator userId DBA đã thực hiện restore — audit. */
  dbaOperatorId: z.string().optional(),
});
```

Backend cross-validate: nếu pre-flight returned `canAutoResettle = false`
thì `dbaConfirmed` BẮT BUỘC phải `true`, ngược lại API trả 422.

---

## 5. Schema bổ sung

### 5.1. `DrawDoc.preSettleCycleSnapshot` (MỚI)

File: `packages/game-{game}/src/entities/draw.ts`

```typescript
/**
 * Snapshot state của jackpot cycle TẠI THỜI ĐIỂM TRƯỚC khi settle draw này.
 *
 * Ghi atomic ở `PrepareSettle` (BEFORE FinalizeSettle close/update cycle).
 * Source of truth để DBA restore cycle khi resettle Type 3/4.
 *
 * IDEMPOTENT: PrepareSettle overwrite mỗi lần settle (cả lần đầu và resettle).
 *
 * Power 6/55 lưu cả 2 jackpots.
 */
export interface PreSettleCycleSnapshot {
  /** Cycle đang active TRƯỚC khi settle. */
  cycleId: string;
  cycleNo: number;
  /** Số tiền tích luỹ (VND) TRƯỚC khi settle. */
  currentAmount: number;
  /** Số kỳ đã tích luỹ TRƯỚC khi settle. */
  drawCount: number;
  /** Cycle status TRƯỚC khi settle. */
  status: "active" | "closed";
  /** Time snapshot — debug. */
  snapshotAt: Date;
}

export interface DrawDoc {
  // ... fields hiện có ...

  /**
   * Snapshot cycle TRƯỚC khi settle draw này.
   *
   * Lotto535/Mega645: 1 snapshot.
   * Power655: { jackpot1, jackpot2 } — array hoặc nested.
   *
   * undefined cho draws cũ (trước khi feature ship).
   */
  preSettleCycleSnapshot?: PreSettleCycleSnapshot
                         | {
                             jackpot1: PreSettleCycleSnapshot;
                             jackpot2: PreSettleCycleSnapshot;
                           };
}
```

### 5.2. Modify `PrepareSettleUseCase` ghi snapshot

```typescript
protected async execute(input: PrepareSettleInput): Promise<SettleContext> {
  // ... validate draw + load config như cũ ...

  // ── MỚI: Ghi preSettleCycleSnapshot ở PrepareSettle ─────────
  // Idempotent: overwrite mỗi lần PrepareSettle chạy (lần đầu + resettle).
  const activeCycle = await this.cycleRepo.findActive();
  await this.drawRepo.updatePreSettleCycleSnapshot(input.drawId, {
    cycleId: activeCycle.id,
    cycleNo: activeCycle.cycleNo,
    currentAmount: activeCycle.currentAmount,
    drawCount: activeCycle.drawCount,
    status: activeCycle.status,
    snapshotAt: new Date(),
  });

  // ... return SettleContext như cũ ...
}
```

### 5.3. Maintenance mode flag (per game)

File: `packages/game-{game}/src/entities/global-config.ts`

Thêm field:

```typescript
export interface GlobalConfigDoc {
  // ... fields hiện có ...

  /**
   * Khi true, scheduled settle bị block — chỉ resettle SFN được phép chạy.
   *
   * Set khi DBA đang restore cycles cho resettle Type 3/4.
   * Auto-clear sau khi resettle SFN complete (FinalizeSettle nested).
   */
  resettleMaintenanceMode?: {
    enabled: boolean;
    enabledAt: Date;
    enabledBy: string;
    /** drawId đang resettle — debug. */
    resettlingDrawId?: string;
  };
}
```

Scheduler settle (worker EventBridge) check flag trước khi
`StartExecution` settle SFN:

```typescript
const config = await getGlobalConfig.run();
if (config.resettleMaintenanceMode?.enabled) {
  console.log(`Skip settle — maintenance mode active for ${config.resettleMaintenanceMode.resettlingDrawId}`);
  return;
}
```

---

## 6. DBA Workflow — Type 1 (No-cycle-change manual fix)

> **DBA chạy tất cả script ở MongoDB Compass hoặc Studio 3T**.
> KHÔNG có TypeScript CLI script. Operator phải:
> 1. Backup collection trước khi update.
> 2. Chạy query trong môi trường staging trước, verify, rồi mới chạy production.
> 3. Ghi log thao tác vào hệ thống audit log chung (sẽ làm sau, không trong scope plan này).

### 6.1. Khi nào dùng Type 1

- Kết quả T đổi nhưng:
  - Số tier hit không đổi.
  - JP winner không đổi (cả cũ lẫn mới đều không có JP winner, hoặc cùng số winners).
  - Entry payouts KHÔNG đổi.
- Chỉ thay đổi nhỏ về cycle stats do contribution recalculation.

### 6.2. Bước 1 — Snapshot trước khi sửa

```javascript
// MongoDB Compass / Studio 3T

const drawId = "2026-03-07.045";
const gameDB = db.getSiblingDB("megawin");  // hoặc DB name thực tế

// Lưu snapshot vào collection backup tự tạo:
gameDB.dba_resettle_backups.insertOne({
  _id: ObjectId(),
  type: "type1-no-cycle-change",
  drawId,
  operatorId: "dba_user_id_here",
  reason: "Sửa kết quả T do upstream sai. Không hit JP, không đổi tier.",
  before: {
    cycle: gameDB.mega645_jackpot_cycles.findOne({ status: "active" }),
    draw: gameDB.mega645_draws.findOne({ drawId }),
  },
  createdAt: new Date(),
});
```

### 6.3. Bước 2 — Update cycle (Lotto535 / Mega645 single JP)

```javascript
// Tính lại currentAmount + drawCount cho cycle:
//   - currentAmount mới = currentAmount cũ - oldContribution + newContribution
//   - drawCount KHÔNG đổi (vẫn cùng kỳ).

const oldContribution = 50_000_000;   // lấy từ draws.{T}.financial.jackpotContribution cũ
const newContribution = 52_000_000;   // tính tay theo result mới
const delta = newContribution - oldContribution;

gameDB.mega645_jackpot_cycles.updateOne(
  { status: "active" },
  {
    $inc: { currentAmount: delta },
    $set: { updatedAt: new Date() },
  }
);
```

### 6.4. Bước 3 — Update Power655 dual JP

```javascript
// Power655 có 2 cycles song song — update CẢ HAI.
const j1Delta = newJ1Contribution - oldJ1Contribution;
const j2Delta = newJ2Contribution - oldJ2Contribution;

gameDB.power655_jackpot_cycles.updateOne(
  { jackpotType: "jackpot1", status: "active" },
  { $inc: { currentAmount: j1Delta }, $set: { updatedAt: new Date() } }
);

gameDB.power655_jackpot_cycles.updateOne(
  { jackpotType: "jackpot2", status: "active" },
  { $inc: { currentAmount: j2Delta }, $set: { updatedAt: new Date() } }
);
```

### 6.5. Bước 4 — Update DrawDoc T

```javascript
gameDB.mega645_draws.updateOne(
  { drawId },
  {
    $set: {
      "result": newResult,                                  // result mới
      "financial.jackpotContribution": newContribution,
      "jackpot.openingAmount": newOpening,                  // = closing kỳ T-1
      "jackpot.closingAmount": newOpening + newContribution,
      updatedAt: new Date(),
    },
  }
);
```

### 6.6. Bước 5 — Cập nhật DrawDoc các kỳ T+1, T+2... trong cycle

Vì `jackpot.openingAmount` của T+1 = `closingAmount` của T, nếu
`closingAmount(T)` đổi thì `openingAmount(T+1)` cũng đổi (chain effect).

```javascript
// Lấy tất cả draws SAU T trong cùng cycle (status hiện tại):
const cycleId = gameDB.mega645_jackpot_cycles.findOne({ status: "active" }).id;
const subsequentDraws = gameDB.mega645_draws
  .find({ cycleId, drawNo: { $gt: 45 } })  // 45 = drawNo của T
  .sort({ drawNo: 1 })
  .toArray();

// Update từng draw — running balance:
let runningBalance = newOpening + newContribution;  // closingAmount của T

for (const d of subsequentDraws) {
  const newOpeningAmount = runningBalance;
  const contribution = d.financial?.jackpotContribution ?? 0;
  const newClosingAmount = newOpeningAmount + contribution;

  gameDB.mega645_draws.updateOne(
    { drawId: d.drawId },
    {
      $set: {
        "jackpot.openingAmount": newOpeningAmount,
        "jackpot.closingAmount": newClosingAmount,
        updatedAt: new Date(),
      },
    }
  );

  runningBalance = newClosingAmount;
}
```

### 6.7. Bước 6 — Audit log

> **Out of scope cho plan này**. Sẽ làm chức năng audit log chung tích hợp
> xuyên hệ thống (theo dõi tất cả admin/DBA action) — không tích hợp ad-hoc
> trong DBA workflow này.
>
> Tạm thời: DBA tự ghi note ở `dba_resettle_backups` collection (đã insert
> ở Bước 1 với `reason`, `operatorId`, `before` snapshot) — đủ cho audit
> trail tối thiểu cho đến khi audit system chính thức ra mắt.

### 6.8. Bước 7 — Re-aggregate financial reports

Sau khi update raw data, financial reports daily phải re-aggregate.

**Option A — Trigger lại `PublishSettleDailyUseCase` qua admin endpoint**
(KHUYẾN NGHỊ):

```
POST /api/{game}/admin/republish-settle-daily
Body: { financialDate: "2026-03-07" }
```

→ Lambda re-aggregate `system_settle_game_daily` + `system_settle_tenant_daily`
WHERE `financialDate = "2026-03-07"`. Idempotent.

**Option B — DBA chạy aggregate trực tiếp**: phức tạp hơn, không khuyến nghị.

---

## 7. DBA Workflow — Type 3/4 (Cascade boundary restore)

### 7.1. Tổng quan workflow

```
┌────────────────────────────────────────────────────────────────┐
│ 1. Staff phát hiện T sai → mở dialog Resettle ở BO.            │
│ 2. UI gọi pre-flight → server detect Type 3 hoặc Type 4.       │
│ 3. UI hiển thị "Cần DBA can thiệp" + danh sách cycles + steps. │
│ 4. Staff liên hệ DBA, gửi pre-flight report.                   │
│                                                                │
│ 5. DBA bật maintenance mode qua admin endpoint:                │
│      POST /api/{game}/admin/maintenance-mode                   │
│      Body: { enabled: true, drawId: T }                        │
│    → Scheduled settle bị block (xem §5.3).                     │
│                                                                │
│ 6. DBA chạy script Compass theo từng kỳ tuần tự (T → T+N):    │
│    a. Snapshot backup (Bước 1 §6.2).                           │
│    b. Restore cycle về state TRƯỚC khi settle T                │
│       (đọc từ draws.{T}.preSettleCycleSnapshot).               │
│    c. Reverse cycle close/create của các kỳ T+1, T+2... cũ:    │
│       - Nếu T+i cũ close cycle JP1-014 → reopen status active. │
│       - Nếu T+i cũ tạo cycle JP1-015 → DELETE doc cycle mới.   │
│    d. Update draws.{T+i}.preSettleCycleSnapshot cho phù hợp    │
│       state mới (DBA tính tay theo running balance).           │
│                                                                │
│ 7. DBA verify state qua aggregation queries (§7.5).            │
│                                                                │
│ 8. DBA notify staff đã xong.                                   │
│                                                                │
│ 9. Staff click "Đã thực hiện DBA — Tiếp tục" → trigger Resettle│
│    SFN cho T.                                                  │
│                                                                │
│ 10. Resettle SFN T xong → FinalizeSettle nested re-update      │
│     cycle. Maintenance mode auto-clear.                        │
│                                                                │
│ 11. Lặp lại bước 5-10 cho T+1, T+2... nếu cần.                │
└────────────────────────────────────────────────────────────────┘
```

### 7.2. Bước restore — đọc preSettleCycleSnapshot

```javascript
// MongoDB Compass / Studio 3T

const drawId = "2026-03-07.045";
const gameDB = db.getSiblingDB("megawin");
const draw = gameDB.mega645_draws.findOne({ drawId });

if (!draw.preSettleCycleSnapshot) {
  throw new Error(
    "Draw thiếu preSettleCycleSnapshot — không thể restore tự động. " +
    "Phải reconstruct manual từ draws kỳ trước."
  );
}

const snap = draw.preSettleCycleSnapshot;
print("Snapshot to restore:", JSON.stringify(snap, null, 2));
```

### 7.3. Bước reopen cycle đã closed (nếu có)

Nếu chain có cycle đã close do JP winner cũ, DBA phải reopen:

```javascript
// Tìm cycle JP1-014 đã close ở kỳ T+2:
const closedCycle = gameDB.mega645_jackpot_cycles.findOne({
  cycleNo: snap.cycleNo,
  status: "closed",
});

if (!closedCycle) {
  print("Cycle đã ở active — không cần reopen.");
} else {
  // Backup cycle state cũ:
  gameDB.dba_resettle_backups.insertOne({
    type: "type3-cycle-reopen",
    drawId,
    cycleId: closedCycle.id,
    before: closedCycle,
    operatorId: "dba_user_id",
    createdAt: new Date(),
  });

  // Reopen cycle với state TRƯỚC khi settle T:
  gameDB.mega645_jackpot_cycles.updateOne(
    { id: closedCycle.id },
    {
      $set: {
        status: "active",
        currentAmount: snap.currentAmount,
        drawCount: snap.drawCount,
        updatedAt: new Date(),
      },
      $unset: {
        closedAt: "",
        endDrawId: "",
        finalAmount: "",
        winnerCount: "",
      },
    }
  );

  print("Reopened cycle:", closedCycle.id);
}
```

### 7.4. Bước delete cycle mới được tạo (nếu có)

Nếu chain cũ tạo ra cycle mới sau khi close, DBA phải delete cycle đó:

```javascript
// Tìm cycle có cycleNo > snap.cycleNo và createdAt > snap.snapshotAt:
const newCycles = gameDB.mega645_jackpot_cycles
  .find({
    cycleNo: { $gt: snap.cycleNo },
    createdAt: { $gt: snap.snapshotAt },
  })
  .toArray();

for (const c of newCycles) {
  // Backup trước khi delete:
  gameDB.dba_resettle_backups.insertOne({
    type: "type3-cycle-delete",
    drawId,
    cycleId: c.id,
    before: c,
    operatorId: "dba_user_id",
    createdAt: new Date(),
  });

  gameDB.mega645_jackpot_cycles.deleteOne({ id: c.id });
  print("Deleted cycle:", c.id);
}
```

### 7.5. Bước verify state

```javascript
// Verify chỉ còn 1 cycle active:
const activeCount = gameDB.mega645_jackpot_cycles.countDocuments({
  status: "active",
});
assert(activeCount === 1, `Expected 1 active cycle, got ${activeCount}`);

// Verify cycle state khớp snapshot:
const active = gameDB.mega645_jackpot_cycles.findOne({ status: "active" });
assert(active.cycleNo === snap.cycleNo);
assert(active.currentAmount === snap.currentAmount);
assert(active.drawCount === snap.drawCount);

print("Verification passed — ready for Resettle SFN.");
```

### 7.6. Power655 dual JP — restore CẢ HAI

```javascript
// Power655 có jackpot1 + jackpot2 độc lập.
const draw = gameDB.power655_draws.findOne({ drawId });
const snap = draw.preSettleCycleSnapshot;

// snap = { jackpot1: {...}, jackpot2: {...} }

// Restore cycle jackpot1:
restoreCycle(gameDB, "power655_jackpot_cycles", "jackpot1", snap.jackpot1);

// Restore cycle jackpot2:
restoreCycle(gameDB, "power655_jackpot_cycles", "jackpot2", snap.jackpot2);

function restoreCycle(db, collName, jpType, snap) {
  // Reopen closed cycles của jpType này.
  // Delete new cycles của jpType này.
  // (Logic giống §7.3 + §7.4 nhưng filter thêm jackpotType: jpType.)
}
```

### 7.7. Lotto535 split cycle — đặc biệt

Lotto 5/35 có cơ chế split cycle khi JP ≥ 12 tỷ. Khi resettle có boundary
trong cycle đã split:

- DBA phải xác định cycle ở thời điểm T là split hay regular.
- Nếu split: restore CẢ hai sub-cycles (regular + split).
- Snapshot Lotto535 cần chứa:
  ```typescript
  {
    cycleId, cycleNo, currentAmount, drawCount, status,
    splitState?: {
      regularPortion: number;
      splitPortion: number;
      splitTriggeredAt?: Date;
    },
    snapshotAt
  }
  ```

DBA script tương ứng nâng cấp thêm bước restore split state.

---

## 8. Maintenance Mode — Admin endpoints

### 8.1. POST `/api/{game}/admin/maintenance-mode`

```typescript
// apps/backoffice/src/app/api/{game}/admin/maintenance-mode/route.ts

const schema = z.object({
  enabled: z.boolean(),
  drawId: z.string().optional(),
  reason: z.string().min(5).max(500),
});

export const POST = withApi()
  .auth({ roles: [CompanyRole.Admin] })   // CHỈ Admin
  .input(schema)
  .handler(async ({ input, user }) => {
    await globalConfigRepo.updateMaintenanceMode({
      enabled: input.enabled,
      enabledAt: input.enabled ? new Date() : null,
      enabledBy: input.enabled ? user.id : null,
      resettlingDrawId: input.drawId,
    });

    // Audit log: out of scope plan này. Khi audit system chung ra mắt,
    // hook vào đây để ghi action với operator + reason.

    return { ok: true };
  });
```

### 8.2. POST `/api/{game}/admin/republish-settle-daily`

Re-aggregate financial reports sau Type 1 manual fix. Chi tiết §6.8.

### 8.3. Auto-clear maintenance mode

Cuối Resettle SFN (sau `StartSettleExecution` complete), Lambda tự gọi:

```typescript
// Trong handler StartSettleExecution callback (post-success):
await globalConfigRepo.updateMaintenanceMode({
  enabled: false,
  resettlingDrawId: null,
});
```

---

## 9. Feature flag rollout

```typescript
{
  // Plan 1 đã ship:
  resettleNonJackpotEnabled: { mega645: false, lotto535: false, power655: false },

  // Plan 2 phases:
  resettleJackpotPreflightEnabled: { mega645: false, ... },  // Phase 1
  resettleJackpotType1ManualFixEnabled: { mega645: false, ... },  // Phase 2
  resettleJackpotType2AutoEnabled: { mega645: false, ... },  // Phase 3
  resettleJackpotType3DbaModeEnabled: { mega645: false, ... },  // Phase 4
}
```

Rollout từng phase qua từng game, test kỹ staging trước.

---

## 10. UI Backoffice — Phần Jackpot bổ sung

### 10.1. Block "Resettle" — mở rộng từ Plan 1

```
┌─ Khối "Resettle" (game có jackpot) ─────────────────────────┐
│                                                              │
│ [Auto pre-flight check khi mở dialog]                       │
│                                                              │
│ ┌─ Pre-flight result ─────────────────────────────────────┐ │
│ │ Scenario: cascade-boundary-old                          │ │
│ │ Type 3 — Cần DBA can thiệp.                            │ │
│ │                                                          │ │
│ │ Affected cycles:                                        │ │
│ │  - JP1-014 (closed at draw 2026-03-10.045) NEEDS RESTORE│ │
│ │  - JP1-015 (created after) NEEDS DELETE                 │ │
│ │                                                          │ │
│ │ Chain:                                                  │ │
│ │  T   2026-03-08.043 [SAI] [Settled]                    │ │
│ │  T+1 2026-03-09.044 [Settled, no JP]                   │ │
│ │  T+2 2026-03-10.045 [Settled, JP WINNER!] ← boundary   │ │
│ │  T+3 2026-03-11.046 [Settled, no JP]                   │ │
│ │                                                          │ │
│ │ [Tải hướng dẫn DBA (PDF/Markdown)]                     │ │
│ │ [Copy script Compass]                                   │ │
│ └──────────────────────────────────────────────────────────┘ │
│                                                              │
│ ☐ DBA đã hoàn thành restore cycles (bắt buộc tick)         │
│                                                              │
│ DBA operator (audit): [_______________________]             │
│                                                              │
│ Lý do resettle: [_____________________________]             │
│                                                              │
│ [Hủy]  [Trigger Resettle SFN] (disabled cho đến tick)       │
└──────────────────────────────────────────────────────────────┘
```

### 10.2. Component structure

```
apps/backoffice/src/app/(dashboard)/{game}/draws/[drawId]/
├── _components/
│   ├── republish-result-block.tsx         (kế thừa Plan 1)
│   ├── resettle-block.tsx                 (kế thừa Plan 1)
│   ├── resettle-preflight-card.tsx        (MỚI — Plan 2)
│   ├── dba-instructions-modal.tsx         (MỚI — Plan 2)
│   └── dba-script-copy-button.tsx         (MỚI — Plan 2)
└── _hooks/
    ├── use-resettle-preflight.ts          (MỚI)
    └── use-dba-script-templates.ts        (MỚI — load instructions)
```

### 10.3. Hooks

```typescript
// use-resettle-preflight.ts
export function useResettlePreflight(drawId: string) {
  return useQuery({
    queryKey: queryKeys.resettlePreflight({ drawId }),
    queryFn: () => api.get(`/{game}/draws/${drawId}/resettle-preflight`),
    enabled: !!drawId,
    staleTime: 0,   // Always fresh khi mở dialog.
    gcTime: 5 * 60 * 1000,
  });
}
```

Query key:

```typescript
export const queryKeys = {
  resettlePreflight: ({ drawId }: { drawId: string }) =>
    ["{game}", "resettle", "preflight", drawId] as const,
};
```

### 10.4. DBA script templates

Lưu các script Compass/Studio 3T template ở:

```
apps/backoffice/public/dba-scripts/
├── mega645/
│   ├── type1-no-cycle-change.js
│   ├── type3-cycle-reopen.js
│   ├── type3-cycle-delete.js
│   └── type3-verify.js
├── lotto535/
│   └── ... (tương tự)
└── power655/
    └── ... (tương tự, dual JP)
```

Modal "DBA Instructions" load file tương ứng với scenario, render
markdown với Prism.js syntax highlighting + nút "Copy" cho từng block.

---

## 11. Repository methods bổ sung (per game)

### 11.1. `{Game}DrawRepository`

```typescript
/**
 * Ghi snapshot jackpot cycle TRƯỚC khi settle. Idempotent: overwrite mỗi lần.
 *
 * Gọi từ PrepareSettle. Source of truth cho DBA restore.
 *
 * @param drawId Draw đang được prepare settle.
 * @param snapshot State cycle TRƯỚC khi settle.
 */
updatePreSettleCycleSnapshot(
  drawId: string,
  snapshot: PreSettleCycleSnapshot | { jackpot1: PreSettleCycleSnapshot; jackpot2: PreSettleCycleSnapshot },
): Promise<void>;

/**
 * Aggregate chain các draws sau drawId — dùng cho pre-flight check.
 *
 * Trả về danh sách drawId, drawNo, status, hasJackpotWinner, cycleId.
 */
findChainAfter(drawId: string): Promise<DrawChainItem[]>;
```

### 11.2. `{Game}JackpotCycleRepository`

```typescript
/**
 * Aggregate cycles bị ảnh hưởng — dùng cho pre-flight check.
 */
findCyclesAfterSnapshot(snapshotAt: Date, fromCycleNo: number): Promise<CycleDoc[]>;
```

### 11.3. `GlobalConfigRepository`

```typescript
updateMaintenanceMode(input: {
  enabled: boolean;
  enabledAt?: Date | null;
  enabledBy?: string | null;
  resettlingDrawId?: string | null;
}): Promise<void>;

getMaintenanceMode(): Promise<MaintenanceModeState | null>;
```

---

## 12. Edge cases & safeguards (bổ sung từ Plan 1)

### 12.1. DBA quên restore cycle trước khi staff trigger

- API trigger resettle CROSS-VALIDATE: nếu `dbaConfirmed = true` mà
  pre-flight tại thời điểm hiện tại vẫn detect Type 3/4 chưa fix
  (cycles vẫn closed/extra) → **REJECT** với 422 + error message rõ ràng.

### 12.2. DBA restore sai (over-restore)

- Verify queries §7.5 PHẢI chạy đầy đủ trước khi staff trigger.
- Nếu sai: rollback từ `dba_resettle_backups` collection (`type3-cycle-reopen`,
  `type3-cycle-delete`).

### 12.3. Settle scheduler chạy giữa lúc DBA đang restore

- Maintenance mode flag block scheduler.
- DBA bật flag trước khi chạy script đầu tiên.

### 12.4. Resettle SFN chạy khi có draws sau T chưa settle xong

- Pre-flight check chặn: trả error "Có kỳ chưa settle xong sau T —
  chờ settle xong rồi mới resettle".

### 12.5. Resettle T trong cycle hiện tại nhưng cycle đã ≥ 95% capacity

- Lotto535: nếu currentAmount ≥ 11.4 tỷ (95% of 12B threshold) → cảnh báo
  "Có thể trigger split sau resettle — DBA verify thủ công sau khi xong".

### 12.6. Power655 — chỉ 1 trong 2 JP có boundary

- Chain Power655 có thể có:
  - JP1 hit ở T+1 nhưng JP2 không.
- DBA chỉ cần restore cycle JP1, KHÔNG động vào cycle JP2.
- Pre-flight check phân biệt rõ JP1 vs JP2.

---

## 13. Migration / Rollout

### 13.1. Thứ tự deploy

1. **Phase 0** — Plan 1 đã ship + ổn định ≥ 2 tuần.
2. **Phase 1 — Schema + Snapshot writer**:
   - Thêm `preSettleCycleSnapshot` vào `DrawDoc`.
   - Modify `PrepareSettleUseCase` ghi snapshot.
   - Deploy → từ đây trở đi mọi settle đều có snapshot.
   - Backfill snapshot cho draws cũ trong cycle hiện tại (DBA script aggregate).
3. **Phase 2 — Pre-flight + Type 1 manual fix**:
   - Thêm `DetectResettleBoundariesUseCase` + endpoint.
   - Thêm UI pre-flight card.
   - Thêm admin endpoint `republish-settle-daily`.
   - DBA training Type 1 workflow.
4. **Phase 3 — Type 2 auto resettle**:
   - Bật flag `resettleJackpotType2AutoEnabled` cho từng game.
   - Test staging với scenario Type 2 (cascade no boundary).
5. **Phase 4 — Type 3/4 DBA mode**:
   - Bật flag `resettleJackpotType3DbaModeEnabled`.
   - Maintenance mode + DBA script templates.
   - DBA training Type 3/4 workflow ≥ 2 sessions với staging.

### 13.2. Backfill snapshot

```javascript
// MongoDB Compass — chạy 1 lần sau deploy Phase 1.
// Backfill cho TẤT CẢ draws Settled trong cycle active hiện tại.

const activeCycle = db.mega645_jackpot_cycles.findOne({ status: "active" });
const drawsInCycle = db.mega645_draws
  .find({ cycleId: activeCycle.id, status: "Settled" })
  .sort({ drawNo: 1 })
  .toArray();

let runningAmount = activeCycle.seedAmount;  // Từ cycle config.
let runningDrawCount = 0;

for (const d of drawsInCycle) {
  // Snapshot = state TRƯỚC khi settle d.
  db.mega645_draws.updateOne(
    { drawId: d.drawId },
    {
      $set: {
        preSettleCycleSnapshot: {
          cycleId: activeCycle.id,
          cycleNo: activeCycle.cycleNo,
          currentAmount: runningAmount,
          drawCount: runningDrawCount,
          status: "active",
          snapshotAt: d.settledAt ?? new Date(),
        },
      },
    }
  );

  runningAmount += (d.financial?.jackpotContribution ?? 0);
  runningDrawCount += 1;
}
```

---

## 14. Test matrix

### 14.1. Unit tests

- `DetectResettleBoundariesUseCase`:
  - Type 1 detection (no cycle change).
  - Type 2 detection (cascade no boundary).
  - Type 3 detection (chain has JP winner).
  - Type 4 detection (resettle predicted creates new JP winner).
- `PrepareSettleUseCase` ghi `preSettleCycleSnapshot` đúng state.
- Power655 dual JP snapshot shape.

### 14.2. Integration tests

- Snapshot ghi đúng cho Lotto535 / Mega645 / Power655.
- Pre-flight API trả đúng scenario.
- Maintenance mode block scheduler.
- Type 2 e2e: resettle T không có boundary → tự chạy hết Plan 1 path.

### 14.3. E2E tests (staging only)

- **Type 1**: DBA chạy script Compass → verify reports re-aggregate đúng.
- **Type 2**: Resettle T có cycle stats change → cycle update đúng sau resettle.
- **Type 3**: DBA restore chain có 1 cycle close → resettle T → cycle reopen + close lại đúng theo result mới.
- **Type 4**: Resettle T tạo JP winner mới → DBA verify cycle close + new cycle tạo đúng.
- **Power655**: chain có JP1 hit nhưng JP2 không → DBA chỉ restore JP1.

### 14.4. DBA dry-run

- DBA chạy TẤT CẢ script templates ở staging cluster trước production.
- Verify rollback từ `dba_resettle_backups` hoạt động.

---

## 15. Checklist implementation (per game)

### Backend

- [ ] `DrawDoc.preSettleCycleSnapshot` (entity).
- [ ] `{Game}DrawRepository.updatePreSettleCycleSnapshot`.
- [ ] `{Game}DrawRepository.findChainAfter`.
- [ ] `{Game}JackpotCycleRepository.findCyclesAfterSnapshot`.
- [ ] `GlobalConfigRepository.updateMaintenanceMode` + `getMaintenanceMode`.
- [ ] `PrepareSettleUseCase` ghi snapshot (idempotent).
- [ ] `DetectResettleBoundariesUseCase`.
- [ ] API: GET `/{game}/draws/[drawId]/resettle-preflight`.
- [ ] API: POST `/{game}/admin/maintenance-mode` (Admin only).
- [ ] API: POST `/{game}/admin/republish-settle-daily`.
- [ ] Cross-validate `dbaConfirmed` ở trigger resettle endpoint.
- [ ] Resettle SFN auto-clear maintenance mode sau success.
- [ ] Settle scheduler check maintenance mode trước `StartExecution`.

### Frontend

- [ ] `resettle-preflight-card.tsx`.
- [ ] `dba-instructions-modal.tsx`.
- [ ] `dba-script-copy-button.tsx`.
- [ ] `useResettlePreflight` hook + query key.
- [ ] DBA script templates ở `public/dba-scripts/{game}/`.
- [ ] UI cross-validate `dbaConfirmed` checkbox.
- [ ] Feature flags 4 phase.

### DBA

- [ ] Backfill snapshot script (chạy 1 lần sau Phase 1).
- [ ] Type 1 manual fix templates (Mega645, Lotto535, Power655).
- [ ] Type 3 cycle reopen + delete templates.
- [ ] Type 3 verify queries.
- [ ] Power655 dual JP templates.
- [ ] Lotto535 split cycle templates.
- [ ] Backup collection `dba_resettle_backups` setup.
- [ ] DBA training docs + dry-run staging.

---

## 16. Game-specific notes

### Mega 6/45 — đơn giản nhất

- 1 cycle active, không split.
- Chain boundary đơn giản: cycle close khi JP winner → tạo cycle mới.
- DBA workflow chuẩn nhất.

### Lotto 5/35 — split cycle

- Khi `currentAmount` ≥ 12 tỷ → split thành 2 sub-pools.
- Snapshot cần thêm `splitState`.
- DBA script Type 3 phức tạp hơn (restore cả split).
- **Khuyến nghị**: ship Lotto535 sau Mega645 ≥ 1 tháng để học từ Mega645.

### Power 6/55 — dual JP

- 2 cycles song song JP1 (≥ 30B trigger split) + JP2.
- Snapshot `{ jackpot1, jackpot2 }`.
- Pre-flight phân biệt rõ JP nào có boundary.
- **Khuyến nghị**: ship cuối cùng, sau khi Mega645 + Lotto535 ổn định.

---

## 17. Anti-patterns — KHÔNG làm

- **KHÔNG** auto-restore cycle qua code — phải DBA manual để có audit
  trail rõ và backup ngoài lề.
- **KHÔNG** cho phép trigger Resettle SFN mà bypass `dbaConfirmed` check
  cho Type 3/4.
- **KHÔNG** chạy Resettle T+1 song song với Resettle T — phải tuần tự.
- **KHÔNG** skip backfill snapshot ở Phase 1 — sẽ lock các draw cũ
  không thể resettle Type 3/4 sau này.
- **KHÔNG** tự bump version của package game-{game}-application chỉ vì
  resettle — đó là bước manual sau khi review CHANGELOG.
- **KHÔNG** dùng `cp .env.example .env.local` — credentials phải lấy từ
  vault (xem rule `no-env-file-modification`).

---

## 18. Plan kế tiếp (sau Plan 2)

- **Plan 3 (optional)** — UI cho DBA tracking: dashboard hiển thị history
  các lần restore cycle, link đến `dba_resettle_backups` để rollback nhanh.
- **Plan 4 (optional)** — Auto-detection alert: cron check inconsistency
  giữa `draws.financial` aggregate vs `tenant_dispatch_orders` totals →
  alert khi delta > X% → flag draw cần resettle.

---

**END Plan 2 — Resettle Jackpot.**



