# p0-02 — Auth: `storageState` cho E2E (BLOCKER)

**Đây là blocker mà bản plan 17/09 bỏ sót hoàn toàn.** Không có phase này, mọi test của `p1-01` sẽ
chụp screenshot **trang `/login`** thay vì Ops Hub, và có thể "pass" ở lần chạy đầu (baseline sai từ
gốc) — kiểu fail tệ nhất.

Phụ thuộc [p0-01](p0-01-playwright-foundation.plan.md).

---

## 1. Cơ chế auth thật (đọc trước khi chọn giải pháp)

Ba fact quyết định toàn bộ thiết kế phase này, đã verify trên code:

### 1.1 Proxy chặn mọi thứ

[`apps/backoffice/src/proxy.ts`](../../../apps/backoffice/src/proxy.ts):

```typescript
const PUBLIC_ROUTES = ["/login", "/api/auth", "/auth/error", "/unauthorized"];
matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|eve/).*)"]
```

Không có `better-auth.session_token` → `redirectToLogin()`. Cookie **bắt buộc** là `session_token`
(qua `getSessionCookie(request)`); `better-auth.session_data` chỉ là **cache optional** — proxy dùng
nó để early-exit chặn `accountType !== "company"`, nhưng vắng mặt nó KHÔNG bị coi là invalid (có
comment giải thích rõ: nếu coi là invalid sẽ gây redirect loop sau OAuth callback).

### 1.2 KHÔNG có form username/password — chỉ Cognito OAuth

[`login-client.tsx`](../../../apps/backoffice/src/app/login/_components/login-client.tsx) chỉ có
đúng 1 nút gọi `signIn.social({ provider: "cognito" })`. `auth.ts` **không khai
`emailAndPassword`** — chỉ có `socialProviders.cognito`.

→ **Không thể** viết test "fill username + password + submit". Đây là lý do phải dùng `storageState`,
không phải lựa chọn tiện lợi.

### 1.3 Session là STATELESS, cookie-only — DB-less

[`src/lib/auth.ts:123-138`](../../../apps/backoffice/src/lib/auth.ts), nguyên văn comment trong code:

> *App này chạy DB-less (không có `database` config) → better-auth dùng stateless cookie-only
> session. Trong chế độ này `cookieCache.maxAge` CHÍNH LÀ thời gian sống thực của session (không có
> DB để fallback).*

```typescript
session: {
  expiresIn: 60 * 60 * 24,              // 24h — cookie session_token
  cookieCache: { enabled: true, maxAge: 60 * 60 * 24 },  // 24h — cookie session_data
},
```

**Hệ quả quan trọng cho E2E:** không có DB session nào cần tồn tại. Cookie **chính là** session
(ký bằng `BETTER_AUTH_SECRET`). Nghĩa là:

- ✅ `storageState` tái dùng được **không cần Cognito online** khi chạy test.
- ⚠️ Nhưng cookie **hết hạn sau 24h** → không thể commit 1 lần rồi dùng mãi.
- ⚠️ Cookie chứa **claim thật của staff thật** (`accountId`, `roles`, `username`, `sub`) → **không
  bao giờ được commit vào Git**.

## 2. Phương án — mint cookie (A) là chính; login tay (B) chỉ để xác thực luồng OAuth

Bạn đã chốt: **ưu tiên tự sign cookie, không qua Cognito**. §2 dưới đây là phương án đó, và **đã
verify khả thi trên chính version đang cài**.

### Phương án A (ƯU TIÊN) — mint session cookie trong `globalSetup`, không cần Cognito

Vì session stateless (§1.3), có thể tạo cookie hợp lệ ngay trong Node bằng chính `auth` instance của
app — không mở browser, không gọi Cognito, chạy trong ~ms.

**ĐÃ VERIFY KHẢ THI** (đọc thẳng `node_modules/better-auth@1.7.5/dist/`, 18/09) — không còn là giả
thiết:

| Thứ cần | Có sẵn ở đâu | Public export? |
|---|---|---|
| Context thật của app (secret, tên cookie, attributes) | `auth.$context` → `Promise<AuthContext>` | ✅ khai trong `dist/types/auth.d.mts` |
| Hàm set **cả 2** cookie đúng chuẩn | `setSessionCookie(ctx, { session, user })` | ✅ `better-auth/cookies` |
| Giải mã để tự kiểm chứng | `decodeCookieCache`, `getCookieCache` | ✅ `better-auth/cookies` |
| Ký thô (nếu phải tự làm) | `makeSignature(value, secret)` | ✅ `better-auth/crypto` |

**Dùng `setSessionCookie`, KHÔNG tự ký bằng `makeSignature`.** Lý do: `session_token` và
`session_data` dùng **hai** scheme khác nhau — `session_token` là `${token}.${makeSignature(...)}`
(base64 chuẩn), còn `session_data` (strategy `compact`, default) là
`base64url(JSON({ session, expiresAt, signature }))` với `signature` ký bằng
`createHMAC("SHA-256", "base64urlnopad")` — hàm này **không** nằm trong export public của
`better-auth`. Tự ký = copy thuật toán nội bộ, và sẽ **vỡ âm thầm** khi better-auth đổi encoding.
Gọi `setSessionCookie` thì mọi thứ (tên cookie, chunking, TTL, strategy) do chính better-auth quyết.

⚠️ `createTestCookie` trong `dist/plugins/test-utils/cookie-builder.mjs` **KHÔNG** phải public export
(`better-auth/test` chỉ xuất `getTestInstance`, `createHttpTestServer`, `convertSetCookieToCookie`),
và nó **chỉ** tạo `session_token` — thiếu `session_data`. Không dùng.

Nếu có: viết `test/e2e/support/mint-session.ts` + `global-setup.ts`.

### 2.1 Claims phải khai đủ — bảng đối chiếu Cognito → session

Đây là phần dễ sai nhất: thiếu 1 claim thì UI render nhưng phân quyền/hiển thị lệch, và test sẽ
"pass" trên baseline sai. Nguồn chân lý: [`ClaimKey`](../../../packages/identity/src/entities/claim.ts)
+ `mapProfileToUser` trong [`auth.ts`](../../../apps/backoffice/src/lib/auth.ts) +
`resolveAuthSession` trong [`auth-session.ts`](../../../apps/backoffice/src/lib/auth-session.ts).

| Cognito ID token claim | → field trên `user` | Kiểu thật | Ghi chú |
|---|---|---|---|
| `sub` | `sub` | `string` | UUID Cognito |
| `cognito:username` | `username` | `string` | Company: username lowercase; Player: `tenantId:subject` |
| `custom:account_type` | `accountType` | `string` | **PHẢI `"company"`** cho backoffice (§2.2) |
| `custom:account_id` | `accountId` | `string` | ULID/UUID portable |
| `custom:account_status` | `accountStatus` | `string` | `active` \| `read_only` \| `suspended` |
| `custom:roles` | `roles` | **`string` CSV** | ⚠️ **KHÔNG phải array** — xem dưới |
| `custom:tenant_id` | `tenantId` | `string` | Company: **rỗng** (`tenantId?: never` trong entity) |

⚠️ **`roles` là chuỗi CSV, không phải array.** `auth.ts` khai `roles: { type: "string", defaultValue: "" }`
và `mapProfileToUser` gán `raw[ClaimKey.Roles] as string`. `parseAccountRoles` chấp nhận **cả hai**
(array hoặc CSV) nên fixture sai kiểu vẫn chạy — nhưng sẽ lệch so với production. Fixture phải dùng
`"admin"` / `"staff"` (chuỗi), nhiều role thì `"admin,staff"`.

Ngoài 7 field trên, `user` còn cần field chuẩn của better-auth: `id`, `email`, `name`,
`emailVerified`, `image`, `createdAt`, `updatedAt`. Và `session` cần: `id`, `token`, `userId`,
`expiresAt`, `createdAt`, `updatedAt`, `ipAddress`, `userAgent`.

### 2.2 ⚠️ CHỈNH LẠI MÔ HÌNH: "staff" là ROLE, không phải loại tài khoản

Yêu cầu ban đầu ghi *"2 loại tài khoản staff và company"*. Đọc code thì mô hình thật **không phải
vậy** — và hiểu sai chỗ này sẽ dựng sai toàn bộ fixture:

[`packages/identity/src/entities/account.ts`](../../../packages/identity/src/entities/account.ts):

```typescript
AccountType = { Company: "company", Agent: "agent", Player: "player" }  // ← 3 loại, KHÔNG có "staff"
CompanyRole = { Admin: "admin", Staff: "staff" }                        // ← "staff" nằm ở ĐÂY
SUPER_ROLES = [CompanyRole.Admin]                                      // ← admin bypass mọi role check
```

[`auth-guard.ts`](../../../apps/backoffice/src/lib/auth-guard.ts) — backoffice **chỉ** nhận 1 loại:

```typescript
if (user.accountType !== AccountType.Company) {
  redirect("/unauthorized");
}
```

→ **Cả 2 tài khoản đăng nhập backoffice đều là `accountType: "company"`.** Thứ phân biệt 2 mức quyền
là `roles`: `"admin"` vs `"staff"`.

Bằng chứng số lượng (đếm trên `apps/backoffice/src/app/api`):

| Gate | Số route | Ai vào được |
|---|---|---|
| `.auth({ roles: [CompanyRole.Staff] })` | **338** | staff ✅, admin ✅ (bypass qua `superRoles`) |
| `.auth({ roles: [CompanyRole.Admin] })` | **13** | admin ✅, staff ❌ **403** |

13 route admin-only: `/api/tenants/*` (3), `/api/system/workers/*` (2), `/api/resultfeed/*` (8).

Và [`sidebar-items.ts`](../../../apps/backoffice/src/navigation/sidebar/sidebar-items.ts) ẩn đúng 3
mục với staff (`roles: [CompanyRole.Admin]`): **Ứng dụng đối tác** (`/tenants`), **Workers**
(`/system/workers`), **Kết quả** (`/resultfeed` + subItems).

Quyền được thực thi ở **3 tầng độc lập** — mỗi tầng là một chỗ có thể vỡ riêng:

| Tầng | File | Kiểm gì |
|---|---|---|
| 1. Proxy (edge) | `proxy.ts` | có cookie? `accountType === "company"`? |
| 2. API route | `packages/next/src/server/api-route.ts` §180-220 | `suspended` → 403; `read_only` + method ghi → 403; `roles` + `superRoles` |
| 3. UI | `nav-main.tsx`, `search-dialog.tsx` → `hasAnyRole` | ẩn/hiện mục sidebar |

Tầng 3 **không** bảo vệ gì (chỉ ẩn UI) — nhưng nếu nó lệch tầng 2 thì user thấy menu rồi bấm vào ăn
403. Đó chính là bug đáng test nhất, và chỉ E2E bắt được.

### 2.3 `mint-session.ts` — dùng `auth.$context` + `setSessionCookie`

Mấu chốt: `setSessionCookie` cần một `GenericEndpointContext` có `setCookie`. Ta **tự dựng** context
tối thiểu đó, thu cookie vào mảng thay vì ghi vào HTTP response.

```typescript
// test/e2e/support/mint-session.ts
import { setSessionCookie } from "better-auth/cookies";
import { AccountStatus, AccountType, type CompanyRole } from "@megawin/identity/entities";

import { auth } from "@/lib/auth";

/** Cookie theo shape Playwright `storageState` yêu cầu. */
interface StateCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number;
  httpOnly: boolean;
  secure: boolean;
  sameSite: "Strict" | "Lax" | "None";
}

export interface Persona {
  /** `"admin"` hoặc `"staff"` — CSV nếu nhiều: `"admin,staff"` (§2.1). */
  roles: string;
  username: string;
  accountId: string;
  /** Mặc định `Company`. Truyền `Agent` để test nhánh `/unauthorized` (§3). */
  accountType?: AccountType;
  accountStatus?: AccountStatus;
}

/**
 * Ký ra cặp cookie `session_token` + `session_data` cho 1 persona — KHÔNG gọi Cognito.
 *
 * Hợp lệ vì session của app là STATELESS cookie-only (`src/lib/auth.ts` §session: DB-less,
 * `cookieCache.maxAge` là TTL thật) → không có record DB nào phải khớp.
 *
 * Dùng `setSessionCookie` của better-auth thay vì tự ký: `session_data` (strategy `compact`)
 * encode bằng `createHMAC("SHA-256","base64urlnopad")` — KHÔNG public export. Tự ký sẽ vỡ âm
 * thầm khi better-auth đổi encoding.
 */
export async function mintSessionCookies(persona: Persona, baseURL: string): Promise<StateCookie[]> {
  const ctx = await auth.$context;
  const cookies: StateCookie[] = [];
  const host = new URL(baseURL).hostname;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  // Context tối thiểu cho setSessionCookie: chỉ cần `context` + `setCookie`.
  // `setCookie` thu vào mảng thay vì ghi header — đây là lý do không dùng được API HTTP thật.
  const endpointCtx = {
    context: ctx,
    setCookie: (name: string, value: string, attrs: Record<string, unknown>) => {
      cookies.push({
        name,
        value,
        domain: host,
        path: (attrs.path as string) ?? "/",
        expires: Math.floor(expiresAt.getTime() / 1000),
        httpOnly: (attrs.httpOnly as boolean) ?? true,
        // secure PHẢI false: Playwright chạy http://localhost, cookie secure sẽ bị browser bỏ.
        secure: false,
        sameSite: "Lax",
      });
    },
    // setSessionCookie đọc `headers`/`getCookie` ở nhánh storeAccountCookie (app không bật).
    headers: new Headers(),
    getCookie: () => null,
  };

  await setSessionCookie(
    // oxlint-disable-next-line typescript/no-explicit-any: GenericEndpointContext là type nội bộ của better-auth, không export; ta chỉ cung cấp đúng 4 field setSessionCookie thực dùng.
    endpointCtx as any,
    {
      session: {
        id: `e2e-session-${persona.roles}`,
        token: `e2e-token-${persona.roles}`,
        userId: persona.accountId,
        expiresAt,
        createdAt: now,
        updatedAt: now,
        ipAddress: "127.0.0.1",
        userAgent: "playwright-e2e",
      },
      user: {
        id: persona.accountId,
        email: `${persona.username}@e2e.local`,
        emailVerified: true,
        name: persona.username,
        image: null,
        createdAt: now,
        updatedAt: now,
        // ── 7 custom field từ Cognito claims (§2.1) ──
        sub: `e2e-sub-${persona.roles}`,
        username: persona.username,
        accountId: persona.accountId,
        accountType: persona.accountType ?? AccountType.Company,
        accountStatus: persona.accountStatus ?? AccountStatus.Active,
        roles: persona.roles,
        tenantId: "", // Company KHÔNG có tenantId (entity: `tenantId?: never`)
      },
    } as Parameters<typeof setSessionCookie>[1],
  );

  return cookies;
}
```

### 2.4 `global-setup.ts` — sinh 2 state file cho 2 persona

```typescript
// test/e2e/support/global-setup.ts
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { CompanyRole } from "@megawin/identity/entities";

import { mintSessionCookies, type Persona } from "./mint-session";

const AUTH_DIR = path.join(import.meta.dirname, ".auth");

/** 2 mức quyền thật của backoffice — cùng `accountType: "company"`, khác `roles` (§2.2). */
export const PERSONAS = {
  admin: {
    roles: CompanyRole.Admin,
    username: "e2e-admin",
    accountId: "e2e-admin-000000000000000000",
  },
  staff: {
    roles: CompanyRole.Staff,
    username: "e2e-staff",
    accountId: "e2e-staff-000000000000000000",
  },
} as const satisfies Record<string, Persona>;

export type PersonaKey = keyof typeof PERSONAS;

export function statePath(key: PersonaKey): string {
  return path.join(AUTH_DIR, `${key}.json`);
}

export default async function globalSetup(): Promise<void> {
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3100";
  await mkdir(AUTH_DIR, { recursive: true });

  for (const key of Object.keys(PERSONAS) as PersonaKey[]) {
    const cookies = await mintSessionCookies(PERSONAS[key], baseURL);
    await writeFile(statePath(key), JSON.stringify({ cookies, origins: [] }, null, 2), "utf8");
  }
}
```

⚠️ `global-setup.ts` import `@/lib/auth` → kéo theo `env.ts` (t3-env) → **cần `BETTER_AUTH_SECRET`
có trong môi trường**, nếu không sẽ throw ở bước validate env. Đây là biến **đã có** trong
`.env.local` của dev. **KHÔNG tạo/ghi `.env*`** ([`no-env-file-modification.mdc`](../../rules/no-env-file-modification.mdc))
— nếu thiếu, báo user tự thêm. Trên CI: GitHub secret (§4).

### 2.5 Đăng ký trong `playwright.config.ts` — project theo persona

```typescript
export default defineConfig({
  globalSetup: "./test/e2e/support/global-setup.ts",
  projects: [
    // Mặc định: admin (thấy full sidebar) — dùng cho p1-01/p1-02.
    {
      name: "admin",
      use: { ...devices["Desktop Chrome"], storageState: "./test/e2e/support/.auth/admin.json" },
      testIgnore: /rbac\.spec\.ts$/,
    },
    // Chỉ chạy spec RBAC — không nhân đôi toàn bộ test cho staff (xem §3.2).
    {
      name: "staff",
      use: { ...devices["Desktop Chrome"], storageState: "./test/e2e/support/.auth/staff.json" },
      testMatch: /rbac\.spec\.ts$/,
    },
  ],
});
```

**Vì sao KHÔNG chạy toàn bộ test cho cả 2 persona:** nhân đôi thời gian và nhân đôi baseline
screenshot (admin/staff thấy sidebar khác → mọi ảnh full-page đều khác), trong khi chỉ 3 mục sidebar
+ 13 API route là khác nhau. Test đúng chỗ khác nhau, không phủ mù.

**Ưu điểm quyết định:** deterministic, chạy được trên CI (`p2-02`) mà không cần credential Cognito
thật, và không phụ thuộc TTL 24h.

### Phương án B (CHỈ dùng khi cần xác thực chính luồng Cognito) — login tay 1 lần

Phương án A **đã verify khả thi** (§2), nên B **không còn là fallback về tính khả thi**. Giữ lại cho
đúng một việc: xác nhận luồng OAuth thật vẫn chạy (VD sau khi đổi config Cognito). Không dùng cho
test thường ngày, **không dùng được trên CI**.

```bash
# Người dev chạy TAY, 1 lần / 24h:
pnpm --filter @megawin/backoffice exec playwright open \
  --save-storage=test/e2e/support/.auth/company.json http://localhost:3000/login
```

Đăng nhập bằng tài khoản staff thật qua Cognito hosted UI, đóng browser → Playwright ghi state.

**Ràng buộc bắt buộc kèm theo:**

- Thêm guard vào `globalSetup`: nếu file không tồn tại **hoặc** `mtime` > 20h → **fail ngay với
  message hướng dẫn chạy lệnh trên**. KHÔNG để test chạy tiếp rồi fail mù mờ ở assertion UI.

```typescript
// Guard cho phương án B — fail SỚM và RÕ, không để lỗi lộ ra ở tầng assertion UI.
const MAX_AGE_MS = 20 * 60 * 60 * 1000; // < 24h TTL của cookieCache, chừa biên an toàn
const stat = await import("node:fs/promises").then((fs) => fs.stat(STATE_PATH).catch(() => null));

if (stat === null || Date.now() - stat.mtimeMs > MAX_AGE_MS) {
  throw new Error(
    "storageState thiếu hoặc đã quá 20h (session cookie TTL 24h).\n" +
      "Chạy lại: pnpm --filter @megawin/backoffice exec playwright open " +
      "--save-storage=test/e2e/support/.auth/company.json http://localhost:3000/login",
  );
}
```

## 3. Test phân quyền — đây là giá trị chính của việc có 2 persona

### 3.1 Ba trạng thái auth ở tầng proxy

| Trạng thái | Kỳ vọng | Cách dựng |
|---|---|---|
| Không cookie | redirect `/login?callbackUrl=...` | `test.use({ storageState: { cookies: [], origins: [] } })` |
| `accountType: "agent"` | redirect `/unauthorized` | `mintSessionCookies({ ...persona, accountType: AccountType.Agent })` |
| `accountType: "company"` | vào được | `storageState` của project |

```typescript
// test/e2e/auth-guard.spec.ts — E2E hành vi thật, KHÔNG screenshot.
test.describe("proxy guard", () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test("chưa đăng nhập → redirect /login kèm callbackUrl", async ({ page }) => {
    await page.clock.install(); // /login auto-redirect Cognito sau 1s — xem p0-01 §5
    await page.goto("/games/keno/operations-hub");
    await expect(page).toHaveURL(/\/login\?callbackUrl=%2Fgames%2Fkeno%2Foperations-hub/);
  });
});
```

**Kiểm tra encoding thật của `callbackUrl` trước khi chốt regex** — `proxy.ts` dùng
`loginUrl.searchParams.set("callbackUrl", pathname)`, `URLSearchParams` encode `/` thành `%2F`. Xác
nhận bằng `browser_snapshot`/URL thật, không đoán.

### 3.2 `rbac.spec.ts` — staff KHÔNG thấy 3 mục admin-only

Đây là bug loại "UI hiện menu nhưng API trả 403" — chỉ E2E bắt được (§2.2 tầng 3 vs tầng 2).

```typescript
// test/e2e/rbac.spec.ts — chạy ở CẢ 2 project (admin + staff), kỳ vọng khác nhau theo project.
import { expect, test } from "@playwright/test";

/** 3 mục sidebar gate `roles: [CompanyRole.Admin]` — nguồn: sidebar-items.ts. */
const ADMIN_ONLY_NAV = [
  { name: /Ứng dụng đối tác/, url: "/tenants" },
  { name: /Workers/, url: "/system/workers" },
  { name: /Kết quả/, url: "/resultfeed" },
] as const;

test.describe("phân quyền sidebar", () => {
  test("mục admin-only hiện/ẩn đúng theo persona", async ({ page }, testInfo) => {
    const isAdmin = testInfo.project.name === "admin";
    await page.goto("/dashboard");
    const nav = page.getByRole("navigation");

    for (const item of ADMIN_ONLY_NAV) {
      await expect(
        nav.getByRole("link", { name: item.name }),
        `${item.url} với persona ${testInfo.project.name}`,
      ).toHaveCount(isAdmin ? 1 : 0);
    }
  });

  // API 403 là hợp đồng bảo mật thật (tầng 2) — phải test riêng, không suy ra từ UI.
  test("API admin-only trả 403 cho staff", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name === "admin", "Chỉ kiểm nhánh staff.");
    const res = await request.get("/api/system/workers");
    expect(res.status()).toBe(403);
  });
});
```

⚠️ **Xác minh accessible name trước khi chốt regex** — dùng `browser_snapshot`
([p0-04](p0-04-mcp-toolchain.plan.md)) trên sidebar thật. Tên trong `sidebar-items.ts` là
`title`, nhưng DOM có thể bọc thêm (badge "Mới", icon) làm accessible name khác.

### 3.3 `accountStatus` — 2 nhánh bị bỏ quên

`api-route.ts` §190-205 xử 2 trạng thái mà UI hầu như không ai test:

| `accountStatus` | Hành vi | Cách dựng |
|---|---|---|
| `suspended` | mọi API → **403** `ACCOUNT_SUSPENDED` | `mintSessionCookies({ ...PERSONAS.staff, accountStatus: AccountStatus.Suspended })` |
| `read_only` | GET/HEAD/OPTIONS OK; POST/PUT/DELETE → **403** `ACCOUNT_READ_ONLY` | tương tự với `AccountStatus.ReadOnly` |

`read_only` đáng test nhất: user **vào được trang, thấy đủ nút**, nhưng bấm là 403. Nếu UI không
disable nút theo `accountStatus` thì đó là bug UX thật — và test này sẽ phát hiện.

Hai state file này sinh **theo yêu cầu trong test** (không thêm vào `PERSONAS` mặc định, tránh phình
`globalSetup`):

```typescript
// Trong spec: mint tại chỗ rồi đổi context.
const cookies = await mintSessionCookies(
  { ...PERSONAS.staff, accountStatus: AccountStatus.ReadOnly },
  baseURL!,
);
await context.addCookies(cookies);
```

## 4. Bảo mật — cookie session KHÔNG được commit

`storageState` chứa cookie ký hợp lệ bằng `BETTER_AUTH_SECRET` **thật**. Dù user là giả (`e2e-admin`),
cookie vẫn được app chấp nhận đầy đủ — ai lấy được file là **đăng nhập được backoffice với quyền
admin** trong 24h. Nguy hiểm hơn phương án B (session của staff thật) ở một điểm: nó **không** xuất
hiện trong log đăng nhập Cognito nào.

Thêm vào `apps/backoffice/.gitignore`:

```gitignore
# Playwright storage state — cookie ký bằng BETTER_AUTH_SECRET thật. TUYỆT ĐỐI không commit.
test/e2e/support/.auth/
```

**Không dùng `.env*`** để chứa gì cho phase này. `BETTER_AUTH_SECRET` đã có sẵn trong `.env.local` của
dev; `globalSetup` đọc qua `@/env` như code production. Tuân
[`no-env-file-modification.mdc`](../../rules/no-env-file-modification.mdc).

Trên CI ([p2-02](p2-02-rollout-and-ci.plan.md)): `BETTER_AUTH_SECRET` lấy từ **GitHub Actions
secret**. ⚠️ Cân nhắc dùng secret **riêng cho CI** (khác production) — nếu secret production lọt vào
log CI thì mọi session production bị forge được. Đây là lý do `p2-02` đề xuất hoãn CI đến khi chốt
được điểm này.

## Verify

1. `globalSetup` sinh **2** file: `.auth/admin.json` + `.auth/staff.json`, mỗi file chứa **2** cookie
   (`better-auth.session_token`, `better-auth.session_data`). Nếu `session_data` bị **chunk** (giá trị
   dài) sẽ thấy `better-auth.session_data-0`, `-1` — đó là bình thường, `getChunkedCookie` ghép lại.
2. **Kiểm chứng cookie giải mã đúng, KHÔNG chỉ tin là đã ký:**
   ```typescript
   // Chạy 1 lần trong spec tạm để xác nhận claim khớp §2.1 — đây là bước dễ bị bỏ.
   const ctx = await auth.$context;
   const decoded = await decodeCookieCache(fakeCtx, sessionDataValue);
   expect(decoded?.session.user.accountType).toBe("company");
   expect(decoded?.session.user.roles).toBe("admin");
   ```
3. `git status --porcelain test/e2e/support/.auth/` → **rỗng** (đã ignore đúng ở §4).
4. `page.goto("/dashboard")` với project `admin` → **KHÔNG** redirect `/login`, thấy heading thật.
   Đây là bằng chứng duy nhất chứng minh phase này xong.
5. `auth-guard.spec.ts` (§3.1) xanh — cả nhánh "chưa đăng nhập" và nhánh `accountType: "agent"` →
   `/unauthorized`.
6. `rbac.spec.ts` (§3.2) xanh ở **cả 2** project: admin thấy 3 mục, staff không thấy mục nào, và API
   `/api/system/workers` trả 403 cho staff.
7. Chạy `test:e2e` **2 lần liên tiếp** → cả 2 xanh (state tái dùng được, không bị invalidate).
8. `oxlint` + `prettier --write` các file mới.

## Không làm

- Không viết test tự động điền form Cognito hosted UI — đó là trang của AWS, ngoài kiểm soát, đổi
  bất kỳ lúc nào, và cần credential thật trong CI. Mint cookie là cách đúng.
- **Không tự ký `session_data` bằng `makeSignature`/`createHMAC`** — dùng `setSessionCookie` (§2).
  Tự ký là copy thuật toán nội bộ, vỡ âm thầm khi better-auth đổi encoding.
- **Không import từ `better-auth/dist/plugins/test-utils/cookie-builder`** — không phải public
  export, và chỉ tạo `session_token` (thiếu `session_data`).
- **Không tạo `AccountType` mới kiểu `"staff"`** — `staff` là **role** của `accountType: "company"`
  (§2.2). Thêm account type mới là đổi mô hình identity của cả hệ thống.
- Không tắt/nới `proxy.ts` để test dễ hơn (VD thêm route vào `PUBLIC_ROUTES`) — làm vậy là sửa
  production code để phục vụ test, và vô tình mở lỗ phân quyền thật.
- Không thêm env flag kiểu `E2E_BYPASS_AUTH` vào `proxy.ts` — cùng lý do; một flag bypass auth lọt
  lên production là sự cố bảo mật, không phải bug test.
- Không chạy toàn bộ test cho cả 2 persona — chỉ `rbac.spec.ts` (§2.5).
- Không commit `storageState`.
- Không chạy test thật của `p1-01` ở phase này (chặn bởi `p0-03` — determinism).
