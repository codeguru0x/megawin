# Audit Log cho Account Operations (`@megawin/identity-application`)

> Áp dụng đúng pattern audit log đã dùng ở 7 game (xem
> `audit-log-system.plan.md` và `audit-log-rollout-6-games.plan.md`).
> Service audit đặt trong `packages/identity-application/src/services/audit-log.ts`.

## 1. Mục tiêu & Phân loại thao tác

Phân biệt **cross-account** (1 tài khoản thao tác lên tài khoản KHÁC) và
**self-account** (tài khoản thao tác lên CHÍNH nó).

| Use case | File | Loại | Audit? | Ghi gì |
|---|---|:---:|:---:|---|
| `SetAccountPasswordUseCase` | `set-account-password.ts` | CROSS | ✅ | actor (caller) + target (username bị đổi pass). KHÔNG ghi giá trị password. |
| `ChangeMyPasswordUseCase` | `change-my-password.ts` | SELF | ✅ | chỉ "đã đổi mật khẩu". KHÔNG ghi password cũ/mới. |
| `VerifyAndEnableMfaUseCase` | `verify-and-enable-mfa.ts` | SELF | ✅ | chỉ "đã bật MFA". |
| `DisableMfaUseCase` | `disable-mfa.ts` | SELF | ✅ | chỉ "đã tắt MFA". |
| `SetupMfaUseCase` | `setup-mfa.ts` | SELF | ❌ | Chỉ khởi tạo (associate token), CHƯA hoàn tất bật MFA. Terminal action là `verify-and-enable` → audit ở đó, không audit setup (tránh log nhiễu action dở dang). |
| `CreateCompanyAccountUseCase` | `create-company-account.ts` | CROSS | ❌ | Ngoài scope lần này (user không chọn). |
| `CreateAgentAccountUseCase` | `create-agent-account.ts` | CROSS | ❌ | Ngoài scope lần này (user không chọn). |

### Nguyên tắc "ghi gì"

- **CROSS (`set-password`)**: ghi đầy đủ — `actor` = caller, `targetId` = username
  của tài khoản bị đổi pass. Ghi vào `changes.after = { passwordReset: true }`
  (sự kiện, KHÔNG ghi giá trị password). Đây là hành vi nhạy cảm cần truy vết đầy đủ.
- **SELF (`change-my-password`, MFA enable/disable)**: actor CHÍNH LÀ target. Chỉ ghi
  **sự kiện đã xảy ra**, KHÔNG ghi `changes.before/after` chi tiết (không password,
  không secret). `targetId` = username của chính actor.

## 2. Quyết định thiết kế (đã chốt với user)

1. **Category mới `account`** + nhóm action `account.*` trong registry (không tái
   dùng `auth`). `auth` để dành cho login/logout/login_failed; `account` cho thao
   tác quản trị tài khoản (đổi pass, MFA).
2. **`targetId` = `username`** (không lookup accountId). Đơn giản, không thêm query.
   `AuditTargetType.Account` đã có sẵn.
3. **MFA self-only** — hiện không có route cross-account tắt MFA tài khoản khác.
4. **Actor** lấy qua `actorFromSession(session!)` ở route (đã có sẵn helper).
5. Service là **free functions stateless** trong `services/audit-log.ts`, y hệt game.

## 3. Action Registry mới

### 3.1. `packages/audit/src/entities/audit-log.enums.ts`

Thêm `Account` vào `AuditCategory`:

```ts
export const AuditCategory = {
  Draw: "draw",
  Player: "player",
  Config: "config",
  Auth: "auth",
  Account: "account", // ← mới
  Finance: "finance",
  System: "system",
} as const;
```

Thêm nhóm `account` vào `AUDIT_ACTIONS` (đặt SAU `auth`, TRƯỚC `finance`):

```ts
  /**
   * category=account, target=account. Thao tác quản trị tài khoản (đổi mật khẩu,
   * bật/tắt MFA). Phân biệt với `auth` (login/logout) — `account` là thao tác
   * QUẢN TRỊ trên tài khoản, không phải phiên đăng nhập.
   *
   * `setPassword` = 1 tài khoản đổi pass CHO tài khoản KHÁC (cross-account, ghi
   * đầy đủ actor + target). `changeOwnPassword`/`enableMfa`/`disableMfa` = thao
   * tác lên CHÍNH tài khoản mình (self, chỉ ghi sự kiện, không ghi chi tiết).
   */
  account: {
    setPassword: "account.set_password",
    changeOwnPassword: "account.change_own_password",
    enableMfa: "account.enable_mfa",
    disableMfa: "account.disable_mfa",
  },
```

### 3.2. `packages/audit/src/entities/labels.ts`

Thêm label category (`AuditCategoryLabel`):

```ts
  [AuditCategory.Account]: "Tài khoản",
```

Thêm 4 label action (`AuditActionLabel`, sau nhóm `auth`):

```ts
  // account
  [AUDIT_ACTIONS.account.setPassword]: "Đặt lại mật khẩu tài khoản",
  [AUDIT_ACTIONS.account.changeOwnPassword]: "Đổi mật khẩu của mình",
  [AUDIT_ACTIONS.account.enableMfa]: "Bật xác thực 2 lớp (MFA)",
  [AUDIT_ACTIONS.account.disableMfa]: "Tắt xác thực 2 lớp (MFA)",
```

> `Record<AuditAction, string>` ép exhaustive — quên label sẽ lỗi compile.

## 4. Service audit — `packages/identity-application/src/services/audit-log.ts`

Free functions stateless, fire-and-forget (giống Keno). Account KHÔNG thuộc game
→ `game` là field **required** trong `AuditEventInput` (`game: string`, sentinel
`""`, KHÔNG optional — đã kiểm tra `packages/audit/src/logger/types.ts`). Vì vậy
mỗi `record()` PHẢI truyền `game: ""` tường minh (game helper truyền `game: GAME`).

```ts
import { record, dropUndefined, type AuditActor } from "@megawin/audit/logger";
import {
  AUDIT_ACTIONS,
  AuditCategory,
  AuditTargetType,
  type AuditHttpContext,
} from "@megawin/audit/entities";

/**
 * Identity account audit-log helpers — free functions ghi audit cho thao tác
 * quản trị tài khoản (đổi mật khẩu, bật/tắt MFA).
 *
 * Phân tầng giống game `services/audit-log.ts`: `@megawin/audit/logger` cung cấp
 * `record()` low-level; module này đóng băng category=account + target=account
 * cho từng action. Stateless, KHÔNG class, KHÔNG DI. Mọi function fire-and-forget.
 *
 * Phân biệt SELF vs CROSS:
 * - CROSS (`auditSetAccountPassword`): actor ≠ target. Ghi đầy đủ target username.
 * - SELF (`auditChangeOwnPassword`/`auditEnableMfa`/`auditDisableMfa`): actor =
 *   target. Chỉ ghi SỰ KIỆN, KHÔNG ghi chi tiết nhạy cảm (password/secret).
 */

/** Spread 5 field actor → DRY. (giống game) */
function actorFields(a: AuditActor) {
  return {
    actorId: a.id,
    actorType: a.type,
    actorName: a.name,
    actorRoles: a.roles,
    tenantId: a.tenantId,
  };
}

/**
 * [CROSS] Audit 1 tài khoản đặt lại mật khẩu CHO tài khoản khác (Staff/Admin).
 *
 * Ghi đầy đủ: actor = caller, target = username bị đổi pass. `changes.after` chỉ
 * ghi cờ `passwordReset: true` — TUYỆT ĐỐI không ghi giá trị password.
 *
 * @param args.actor - Caller (đã normalize ở route qua actorFromSession).
 * @param args.targetUsername - Username của tài khoản bị đặt lại mật khẩu.
 * @param args.meta - Context HTTP (ip/userAgent/requestId) nếu có.
 */
export function auditSetAccountPassword(args: {
  actor: AuditActor;
  targetUsername: string;
  meta?: AuditHttpContext;
}): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.setPassword,
    category: AuditCategory.Account,
    game: "", // account không thuộc game (sentinel required)
    targetType: AuditTargetType.Account,
    targetId: args.targetUsername,
    targetLabel: `Tài khoản ${args.targetUsername}`,
    changes: { after: { passwordReset: true } },
    metadata: { http: args.meta },
  });
}

/**
 * [SELF] Audit user đổi mật khẩu CỦA CHÍNH MÌNH.
 *
 * Chỉ ghi sự kiện "đã đổi mật khẩu" — KHÔNG ghi password cũ/mới. actor = target.
 */
export function auditChangeOwnPassword(args: {
  actor: AuditActor;
  meta?: AuditHttpContext;
}): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.changeOwnPassword,
    category: AuditCategory.Account,
    game: "",
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    targetLabel: args.actor.name,
    metadata: { http: args.meta },
  });
}

/**
 * [SELF] Audit user BẬT MFA cho chính mình (verify-and-enable thành công).
 * Chỉ ghi sự kiện. actor = target.
 */
export function auditEnableMfa(args: {
  actor: AuditActor;
  meta?: AuditHttpContext;
}): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.enableMfa,
    category: AuditCategory.Account,
    game: "",
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    targetLabel: args.actor.name,
    metadata: { http: args.meta },
  });
}

/**
 * [SELF] Audit user TẮT MFA cho chính mình. Chỉ ghi sự kiện. actor = target.
 */
export function auditDisableMfa(args: {
  actor: AuditActor;
  meta?: AuditHttpContext;
}): void {
  record({
    ...actorFields(args.actor),
    action: AUDIT_ACTIONS.account.disableMfa,
    category: AuditCategory.Account,
    game: "",
    targetType: AuditTargetType.Account,
    targetId: args.actor.id,
    targetLabel: args.actor.name,
    metadata: { http: args.meta },
  });
}
```

> ✅ **Đã chốt `game` required**: `AuditEventInput.game: string` (không optional,
> không default) — mỗi `record()` phải truyền `game: ""` (sentinel). Game helper
> truyền `game: GAME`; account không thuộc game → `""`.

### 4.1. Barrel — `packages/identity-application/src/services/index.ts` (tạo mới)

```ts
export {
  auditSetAccountPassword,
  auditChangeOwnPassword,
  auditEnableMfa,
  auditDisableMfa,
} from "./audit-log";
```

## 5. `package.json` — `packages/identity-application`

Thêm dependency `@megawin/audit` (giống game):

```jsonc
"dependencies": {
  "@megawin/app-core": "workspace:*",
  "@megawin/audit": "workspace:*",   // ← mới
  "@megawin/data": "workspace:*",
  ...
}
```

Thêm export subpath `./services`:

```jsonc
"exports": {
  ...
  "./services": {
    "types": "./src/services/index.ts",
    "import": "./src/services/index.ts",
    "default": "./dist/services/index.js"
  }
}
```

## 6. Sửa Use Cases (thêm `actor` vào input, gọi audit helper)

### 6.1. `set-account-password.ts` [CROSS]

- Import `AuditActor` + `auditSetAccountPassword`.
- Thêm `actor: AuditActor` vào `SetAccountPasswordInput`.
- Sau khi `adminSetUserPassword` thành công → gọi
  `auditSetAccountPassword({ actor: input.actor, targetUsername: input.username })`.
- Fire-and-forget, đặt SAU khi thao tác Cognito thành công, TRƯỚC `return`.

### 6.2. `change-my-password.ts` [SELF]

- Import `AuditActor` + `auditChangeOwnPassword`.
- Thêm `actor: AuditActor` vào `ChangeMyPasswordInput`.
- Sau khi `adminChangeUserPassword` thành công (trong `try`, sau await, hoặc ngay
  sau block `try/catch` khi không throw) → gọi
  `auditChangeOwnPassword({ actor: input.actor })`.

### 6.3. `verify-and-enable-mfa.ts` [SELF]

- Import `AuditActor` + `auditEnableMfa`.
- Thêm `actor: AuditActor` vào `VerifyAndEnableMfaInput`.
- Sau `repo.updateMfaStatus(input.username, MfaStatus.Enabled)` → gọi
  `auditEnableMfa({ actor: input.actor })`.

### 6.4. `disable-mfa.ts` [SELF]

- Import `AuditActor` + `auditDisableMfa`.
- Thêm `actor: AuditActor` vào `DisableMfaInput`.
- Sau `repo.updateMfaStatus(input.username, MfaStatus.Disabled)` → gọi
  `auditDisableMfa({ actor: input.actor })`.

> Các Input type mới thêm field `actor` → cập nhật cả export type ở `index.ts`
> (đã export sẵn qua named export, chỉ cần đảm bảo type mới compile).

## 7. Sửa API Routes (truyền `actor` qua `actorFromSession`)

Import `actorFromSession` từ `@/lib/audit-actor` ở mỗi route và truyền vào `run()`.

### 7.1. `apps/backoffice/src/app/api/accounts/set-password/route.ts` [CROSS]

```ts
import { actorFromSession } from "@/lib/audit-actor";
...
.handler(async ({ body, session }) => {
  const callerRoles = (session?.user.roles ?? []) as CompanyRole[];
  return useCase.run({ ...body, callerRoles, actor: actorFromSession(session!) });
});
```

### 7.2. `apps/backoffice/src/app/api/me/change-password/route.ts` [SELF]

```ts
import { actorFromSession } from "@/lib/audit-actor";
...
return changeMyPasswordUseCase.run({
  username: session!.user.username,
  currentPassword: body.currentPassword,
  newPassword: body.newPassword,
  actor: actorFromSession(session!),
});
```

### 7.3. `apps/backoffice/src/app/api/me/mfa/verify/route.ts` [SELF]

```ts
import { actorFromSession } from "@/lib/audit-actor";
...
return verifyAndEnableMfaUseCase.run({
  username: session!.user.username,
  totpCode: body.totpCode,
  accessToken: body.accessToken,
  actor: actorFromSession(session!),
});
```

### 7.4. `apps/backoffice/src/app/api/me/mfa/disable/route.ts` [SELF]

```ts
import { actorFromSession } from "@/lib/audit-actor";
...
return disableMfaUseCase.run({
  username: session!.user.username,
  password: body.password,
  totpCode: body.totpCode,
  actor: actorFromSession(session!),
});
```

### 7.5. `setup/route.ts` — KHÔNG đổi (không audit setup).

> `meta` (AuditHttpContext) hiện các game route cũng không truyền (bỏ trống) →
> giữ nhất quán, không thêm `meta` trừ khi có helper extract sẵn ở route wrapper.
> Nếu về sau muốn ip/userAgent, thêm ở cả game lẫn identity cùng lúc (ngoài scope).

## 8. Thứ tự thực hiện

1. `audit-log.enums.ts`: thêm `AuditCategory.Account` + nhóm `AUDIT_ACTIONS.account`.
2. `labels.ts`: thêm label category + 4 action (fix compile exhaustive).
3. `identity-application/package.json`: thêm dep `@megawin/audit` + export `./services`.
4. Tạo `identity-application/src/services/audit-log.ts` + `services/index.ts`.
5. Sửa 4 use-case (thêm `actor` input + gọi audit helper).
6. Sửa 4 API route (truyền `actorFromSession(session!)`).
7. Verify:
   - `pnpm --filter @megawin/audit check-types`
   - `pnpm --filter @megawin/identity-application check-types`
   - `pnpm --filter backoffice check-types` (route imports)

## 9. Checklist tránh sót

- [ ] `game: ""` truyền tường minh ở mọi helper (đã chốt required, không default).
- [ ] Không ghi password/secret/totp vào `changes` hay `metadata` ở BẤT KỲ helper nào.
- [ ] SELF dùng `targetId = actor.id` (chính nó); CROSS dùng `targetId = targetUsername`.
- [ ] `setup-mfa` KHÔNG audit.
- [ ] Audit gọi SAU khi thao tác Cognito/DB thành công (không audit khi throw).
- [ ] Barrel `services/index.ts` export đủ 4 helper.
- [ ] Không xoá/sửa action game đã ship.
```
