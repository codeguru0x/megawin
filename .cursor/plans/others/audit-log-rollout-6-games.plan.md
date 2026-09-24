# Plan: Nhân rộng Audit Log sang 6 game còn lại

> Mục tiêu: nhân rộng đúng pattern audit log Keno sang **lotto535, mega645, power655, max3d, max3dpro, bingo18**, audit các đối tượng tương tự Keno đã làm.
>
> Trạng thái hiện tại: **cả 6 game CHƯA** có `@megawin/audit`, CHƯA có `services/audit-log.ts`, route CHƯA dùng `actorFromSession`, DTO CHƯA có `actor`. Keno là bản mẫu duy nhất đã hoàn thiện.

---

## 0. Quyết định thiết kế đã chốt

| Vấn đề | Quyết định |
|---|---|
| `vietlottRef` (6 game đều có, Keno không) | **Gộp vào `metadata` của `auditPublishResult`** — KHÔNG tách action `draw.update_vietlott_ref` riêng. Không dùng action riêng ở đợt này. |
| `reopen-for-cascade` (3 game jackpot) | **Thêm action mới `draw.reopen_for_cascade`** vào registry + helper `auditReopenForCascade` cho lotto535/mega645/power655. |
| `create-draws` / `create-draw` | **KHÔNG audit** — bám đúng Keno (Keno không audit tạo kỳ). |
| Phạm vi | **Cả 6 game, đầy đủ**: package.json dep + `services/audit-log.ts` + DTO actor + gọi audit trong use-cases + `actorFromSession` trong routes. |

---

## 1. Scope audit từng game (đối tượng được ghi log)

Bám đúng scope thực tế của Keno (draws + game-config + tenant-config). System actions (settle_finalized/void_finalized) worker CHƯA tích hợp → KHÔNG làm ở đợt này.

| Action helper | Keno có | lotto535 | mega645 | power655 | max3d | max3dpro | bingo18 |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| `auditDrawVoid` (`draw.void`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auditPublishResult` (`draw.publish_result`) + vietlottRef trong meta | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auditRepublishResult` (`draw.republish_result`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auditSettle` (`draw.settle`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auditResettle` (`draw.resettle`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auditOpenSales` (`draw.open_sales`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auditCloseSales` (`draw.close_sales`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auditUpdateSchedule` (`draw.update_schedule`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auditReopenForCascade` (`draw.reopen_for_cascade`) **MỚI** | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `auditUpdateGameConfig` (`config.update_global`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `auditUpdateTenantConfig` (`config.update_tenant`) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

**Khác biệt payload `winningNumbers` theo game** (field bộ số trúng khác nhau — flatten vào `changes.after`):

| Game | Field kết quả trong PublishResultInput |
|---|---|
| lotto535 | `winningMain`, `winningSpecial` |
| mega645 | `winningNumbers` |
| power655 | `winningMain`, `bonusNumber` |
| max3d | `result: Max3dDrawResult` |
| max3dpro | `result: Max3dproDrawResult` |
| bingo18 | `numbers` |

→ `auditPublishResult` mỗi game nhận `changes.after` shape riêng (không ép chung `winningNumbers: string[]` như Keno).

---

## 2. Thay đổi ở package `@megawin/audit` (làm 1 lần, dùng chung 7 game)

### 2.1. Thêm action `draw.reopen_for_cascade`

File: `packages/audit/src/entities/audit-log.enums.ts` — thêm vào nhóm `draw`:

```ts
draw: {
  publishResult: "draw.publish_result",
  republishResult: "draw.republish_result",
  void: "draw.void",
  settle: "draw.settle",
  resettle: "draw.resettle",
  openSales: "draw.open_sales",
  closeSales: "draw.close_sales",
  updateSchedule: "draw.update_schedule",
  updateVietlottRef: "draw.update_vietlott_ref",
  reopenForCascade: "draw.reopen_for_cascade", // MỚI — mở lại kỳ khi cascade jackpot
},
```

### 2.2. Thêm label bắt buộc

File: `packages/audit/src/entities/labels.ts` — `AuditActionLabel` là `Record` ép buộc, thiếu label → lỗi compile. Thêm:

```ts
"draw.reopen_for_cascade": "Mở lại kỳ (cascade jackpot)",
```

> ⚠️ Đọc `labels.ts` trước khi sửa để dùng đúng shape (có thể là nested theo category hoặc flat map). Điều chỉnh cho khớp.

---

## 3. Mỗi game — 7 nhóm thay đổi (checklist lặp lại)

Đường dẫn dùng placeholder `{game}` ∈ {lotto535, mega645, power655, max3d, max3dpro, bingo18} và `{Game}` là PascalCase (`Lotto535`, `Mega645`, `Power655`, `Max3d`, `Max3dpro`, `Bingo18`).

### 3.1. `package.json` — thêm dependency

`packages/game-{game}-application/package.json`:

```jsonc
"dependencies": {
  "@megawin/audit": "workspace:*",
  // ...
}
```

> Verify version spec khớp cách Keno khai (`workspace:*` hay tương tự). Chạy `pnpm install` sau khi thêm cả 6.

### 3.2. Tạo mới `services/audit-log.ts`

`packages/game-{game}-application/src/services/audit-log.ts` — copy từ Keno (`packages/game-keno-application/src/services/audit-log.ts`), sửa:

1. `const GAME = GameProduct.{Game};`
2. `PublishResultArgs.winningNumbers` → thay bằng shape kết quả của game (xem bảng §1). `changes.after` chứa đúng field game đó.
3. `auditPublishResult` gộp `vietlottRef` vào `metadata.extra` (flatten): `extra: dropUndefined({ vietlottDrawPeriod: ..., vietlottDrawDate: ... })`.
4. `targetLabel` giữ `Kỳ ${drawId}` / `Cấu hình {Game} tenant ${tenantId}`.
5. **3 game jackpot** (lotto535/mega645/power655): thêm `auditReopenForCascade`:

```ts
/**
 * Audit staff mở lại kỳ quay để chạy cascade jackpot (split cycle).
 * Riêng game có jackpot — Keno/max3d/max3dpro/bingo18 không có.
 */
export function auditReopenForCascade(args: {
  actor: AuditActor;
  drawId: string;
  prevStatus: string;
  meta?: AuditHttpContext;
}): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.draw.reopenForCascade,
    category: AuditCategory.Draw,
    game: GAME,
    targetType: AuditTargetType.Draw,
    targetId: args.drawId,
    targetLabel: `Kỳ ${args.drawId}`,
    changes: { before: { status: args.prevStatus } },
    metadata: { http: args.meta },
  });
}
```

6. **3 game không jackpot** (max3d/max3dpro/bingo18): KHÔNG có `auditReopenForCascade`. Giữ nguyên `auditRepublishResult` (vẫn có luồng resettle).

### 3.3. `services/index.ts` — export

`packages/game-{game}-application/src/services/index.ts` — thêm:

```ts
export * from "./audit-log";
```

### 3.4. DTO draws — thêm `actor`

`packages/game-{game}-application/src/use-cases/draws/dto/draw.dto.ts`:

- `import type { AuditActor } from "@megawin/audit/logger";`
- `VoidDrawInput`: `actor: AuditActor` (required — thay `voidedBy`).
- `PublishResultInput`: `actor: AuditActor`.
- `TriggerSettleInput`, `TriggerResettleInput`: `actor?: AuditActor` (optional — caller nội bộ không cần).
- `DrawTransitionInput` (open/close-sales): `actor?: AuditActor`.
- `UpdateScheduleInput`: `actor?: AuditActor`.
- **3 game jackpot**: `ReopenForCascadeInput`: `actor?: AuditActor`.

> Bám đúng convention Keno: required cho void/publish (luôn từ BO), optional cho transition/settle (có caller nội bộ). Xem `draw.dto.ts` Keno làm mẫu.

### 3.5. DTO tenant-config — thêm `actor`

`packages/game-{game}-application/src/use-cases/tenant-config/dto/tenant-config.dto.ts`:

- `UpdateTenantConfigInput`: thêm `actor?: AuditActor`.

Tương tự game-config DTO (`game-config/dto/game-config.dto.ts`): `UpdateGameConfigInput` thêm `actor?: AuditActor`.

### 3.6. Use-case classes — gọi audit

Sau mỗi mutation thành công, gọi helper (fire-and-forget). Mẫu Keno: chỉ ghi 1 lần, bỏ nhánh idempotent/retry.

| Use-case file | Gọi |
|---|---|
| `draws/void-draw.ts` | `auditDrawVoid`; đổi `voidedBy: input.actor.name` (như Keno line 93) |
| `draws/publish-result.ts` | `auditPublishResult` (publish lần đầu) / `auditRepublishResult` (sau settle) — theo nhánh use case tự phân biệt. **Cả 2 truyền `vietlottRef`** vào audit (ghi vào `metadata.extra`). Nhánh chỉ-sửa-vietlottRef sau settle (kết quả không đổi) cũng gọi `auditPublishResult` với `winningNumbers` hiện tại + ref mới. |
| `draws/trigger-settle.ts` | `auditSettle` (chỉ khi `input.actor`) |
| `draws/trigger-resettle.ts` | `auditResettle` (chỉ khi `input.actor`) |
| `draws/open-sales.ts` | `auditOpenSales` (chỉ khi `input.actor`) |
| `draws/close-sales.ts` | `auditCloseSales` (chỉ khi `input.actor`) |
| `draws/update-schedule.ts` | `auditUpdateSchedule` (chỉ khi `input.actor`) |
| `draws/reopen-for-cascade.ts` (3 jackpot) | `auditReopenForCascade` (chỉ khi `input.actor`) |
| `game-config/update-game-config.ts` | `auditUpdateGameConfig` |
| `tenant-config/update-tenant-config.ts` | `auditUpdateTenantConfig` |

> Lưu ý `update-tenant-config.ts` của 6 game đang có diff refactor dang dở (đơn giản hoá formatting + zod params). Merge audit vào bản mới, KHÔNG revert refactor đó.

### 3.7. API routes — `actorFromSession`

Thư mục `apps/backoffice/src/app/api/{game}/`. Helper `actorFromSession` đã có sẵn tại `apps/backoffice/src/lib/audit-actor.ts` (import: `import { actorFromSession } from "@/lib/audit-actor";`).

| Route | Thay đổi |
|---|---|
| `draws/[drawId]/void/route.ts` | Bỏ `voidedBy: session!.user.username` → `actor: actorFromSession(session!)` |
| `draws/[drawId]/publish-result/route.ts` | Thêm `actor: actorFromSession(session!)` |
| `draws/[drawId]/open-sales/route.ts` | Thêm `actor` (bổ sung `session` vào handler destructure) |
| `draws/[drawId]/close-sales/route.ts` | Thêm `actor` |
| `draws/[drawId]/schedule/route.ts` | Thêm `actor` |
| `draws/[drawId]/trigger-settle/route.ts` | Thêm `actor` |
| `draws/[drawId]/resettle/route.ts` | Thêm `actor` |
| `draws/[drawId]/resettle-reopen/route.ts` (jackpot) | Thêm `actor` (dùng cho reopen-for-cascade) |
| `config/route.ts` | Thêm `actor` cho PUT |
| `tenant-config/[tenantId]/route.ts` | Thêm `actor` cho PUT |

> Route hiện không destructure `session` → thêm `session` vào `.handler(async ({ ..., session }) => {...})`. `withApi().auth(...)` đã đảm bảo `session!` non-null.

---

## 4. Điểm khác biệt cần lưu ý theo game

| Game | Đặc thù khi wiring |
|---|---|
| **lotto535** | Jackpot → có `auditReopenForCascade` + route `resettle-reopen`. Publish: `winningMain` + `winningSpecial`. |
| **mega645** | Jackpot → `auditReopenForCascade`. Publish: `winningNumbers`. tenant-config đang có diff refactor dang dở. |
| **power655** | Jackpot **kép (dual)** → `auditReopenForCascade`. Publish: `winningMain` + `bonusNumber`. |
| **max3d** | KHÔNG jackpot → không reopen-for-cascade. Publish: `result: Max3dDrawResult`. |
| **max3dpro** | KHÔNG jackpot. Publish: `result: Max3dproDrawResult`. |
| **bingo18** | KHÔNG jackpot. `CreateDrawUseCase` (single) — nhưng KHÔNG audit tạo kỳ nên không ảnh hưởng. Publish: `numbers`. |

---

## 5. Thứ tự thực thi đề xuất

1. **audit package** (§2): thêm action + label `draw.reopen_for_cascade`. Build `@megawin/audit`.
2. **lotto535 làm mẫu đầy đủ** (§3.1–3.7) — game jackpot đủ mọi case (reopen-for-cascade). Verify type-check.
3. Nhân sang **mega645, power655** (jackpot).
4. Nhân sang **max3d, max3dpro, bingo18** (không jackpot — bỏ reopen).
5. `pnpm install` (dep mới) → type-check toàn bộ.

---

## 6. Verify

Mỗi package sau khi sửa:

```bash
pnpm --filter @megawin/game-{game}-application check-types
```

Backoffice routes:

```bash
pnpm --filter backoffice check-types   # hoặc npx tsc --noEmit trong apps/backoffice
```

> KHÔNG tạo `.env.local`. Nếu build Next.js vướng env validation, dùng `npx tsc --noEmit` hoặc `SKIP_ENV_VALIDATION=true`.

---

## 7. Checklist tổng (đánh dấu khi làm)

**Audit package (1 lần):**
- [ ] `draw.reopen_for_cascade` vào `AUDIT_ACTIONS` (`audit-log.enums.ts`)
- [ ] Label `draw.reopen_for_cascade` (`labels.ts`)

**Mỗi game (×6):**
- [ ] `package.json` + `@megawin/audit`
- [ ] `services/audit-log.ts` (copy + sửa GAME/result shape/vietlottRef; +reopen nếu jackpot)
- [ ] `services/index.ts` export
- [ ] `draws/dto/draw.dto.ts` + `actor`
- [ ] `tenant-config/dto/tenant-config.dto.ts` + `game-config/dto/game-config.dto.ts` + `actor`
- [ ] Use-cases gọi audit (void/publish/settle/resettle/open/close/schedule/config/tenant + reopen nếu jackpot)
- [ ] API routes dùng `actorFromSession`
- [ ] `check-types` pass
