# p0-01 — Playwright Foundation cho `apps/backoffice`

> **✅ TRẠNG THÁI: ĐÃ GỠ (18/09 chiều).** Override `"next>@playwright/test": "-"` + sửa tay
> `package.json` + `pnpm install` full → 19 package cùng 1 instance `next` → `tsc` 0 lỗi →
> smoke e2e xanh 2 lần liên tiếp. Hardening `packages/next` **không làm** (tùy chọn, tách
> lượt). Chi tiết đo: **§1**.

Cài `@playwright/test` vào `apps/backoffice`, cấu hình dev server và `testDir`. Phase này **chỉ dựng
hạ tầng + 1 smoke test không cần auth** — test thật ở `p1-01`.

**Convention thư mục:** `test/unit/` `test/integration/` `test/e2e/` theo
[`monorepo-test-setup/p2-01-test-type-folder-convention.plan.md`](../monorepo-test-setup/p2-01-test-type-folder-convention.plan.md).
`apps/backoffice/test/e2e/` **đã tồn tại** (chỉ có `.gitkeep`), `test/unit/` đã có 8 file. Không tạo
gốc test thứ hai.

---

## 1. ✅ BLOCKER ĐÃ GỠ (đo lại 18/09 chiều)

**Sáng 18/09 thử `pnpm add` và phải revert** (798 lỗi). Chiều cùng ngày gỡ bằng lớp dependency,
**không** hardening kiến trúc.

### Giải pháp đã thi hành

1. [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml) — thêm override kèm comment:

   ```yaml
   "next>@playwright/test": "-"
   ```

2. [`apps/backoffice/package.json`](../../../apps/backoffice/package.json) — sửa tay (KHÔNG
   `pnpm add` / `--filter`): `"@playwright/test": "^1.63.0"` + 3 script `test:e2e*`.

3. `pnpm install` **full** (toàn workspace).

### Kết quả đo được sau fix

| Cổng | Kết quả |
|---|---|
| readlink | 19/19 package → **1** instance `next@16.3.5_..._@playwrig_0158c639` |
| `tsc --noEmit` (`apps/backoffice`) | **0** lỗi (không còn NextRequest/NextURL) |
| `@playwright/test` | `1.63.0` resolve được |
| `playwright install chromium` | Install location dưới Playwright cache; xong không lỗi |
| `test:e2e:update` | sinh baseline `test/e2e/smoke.spec.ts-snapshots/login-chromium-darwin.png` |
| `test:e2e` lần 1 | **1 passed** |
| `test:e2e` lần 2 | **1 passed** |

Cơ chế thắng quan sát được: full install kích `dedupePeerDependents` (default `true`) gom mọi
package về **cùng** instance có `@playwright/test` — khác với các lần sáng dùng `pnpm add`
(incremental, không re-resolve đủ graph). Override giữ trong workspace như pin có chủ đích;
lockfile ghi `next>@playwright/test: '-'`.

### Hardening kiến trúc — KHÔNG làm ở lượt này

Đổi `NextRequest` → `ApiRequest` cấu trúc ở `packages/next` là **tùy chọn**, tách plan riêng.
Không cần để unblock p0-01 (đã chứng minh bằng 3 cổng xanh ở trên).

### Lỗi này có xuất phát từ design kiến trúc của mình không?

**Một phần — nhưng không phải "design sai".** Phân tầng trách nhiệm:

| Tầng | Ai chịu | Vai trò |
|---|---|---|
| **Nguyên nhân gốc (upstream)** | Next.js | `NextURL` vẫn còn `private [Internal]` sau [PR #82172](https://github.com/vercel/next.js/pull/82172) (chỉ bỏ brand của `NextRequest`). Hai bản `next` = hai type không assignable. Peer `@playwright/test` optional có từ `next@14` (~2 năm). |
| **Cơ chế kích hoạt** | pnpm | Hash instance theo *peer set đã resolve*. Cài optional peer lệch 1 package → instance thứ 2. `dedupePeerDependents` default `true` *có thể* gộp, nhưng chỉ khi full re-resolution — `pnpm add` / `--filter add` **không** trigger (đã đo: mọi lần thử sáng đều dùng `add`). |
| **Amplifier trong repo** | `@megawin/next` | Đặt `NextRequest` vào **public type** của package workspace dùng chung (`GetSessionFn`, `RouteContext`, `NextRouteHandler`). Đây là pattern layering hợp lệ (API route builder tách khỏi app), nhưng hệ quả: mọi lệch instance `next` giữa app và package đều thành 798 lỗi type. |

Kết luận thẳng: **không phải bug nghiệp vụ, cũng không phải kiến trúc "sai"**. Đây là hazard
đã biết của monorepo khi *re-export / nhận branded type của framework qua package boundary*.

### Nguyên nhân kỹ thuật (rút gọn)

`next@16.3.5` khai `@playwright/test` là optional peer. pnpm đưa peer đã resolve vào hash
`.pnpm/`. Cài lẻ bằng `pnpm add` ở `apps/backoffice` → backoffice nhận instance `next` mới;
`packages/next` giữ instance cũ. TS so `NextRequest` → đệ quy vào `nextUrl: NextURL` → gặp
`private [Internal]` → 798 lỗi.

```
error TS2345: Argument of type 'NextRequest' (…@types+no_46c01943…) is not assignable to
parameter of type 'NextRequest' (…@playwrig_0158c639…).
  Property '[Internal]' is missing in type 'NextURL' but required in type 'NextURL'.
```

### Số liệu đo được (trước khi gỡ)

| Trạng thái | `tsc --noEmit` ở `apps/backoffice` |
|---|---|
| Trước khi cài (baseline) | **0 lỗi** |
| Sau `pnpm --filter … add -D @playwright/test @next/playwright` | **798 lỗi** |
| Chỉ `@playwright/test` ở app | 798 |
| Hoist `@playwright/test` lên root (`-Dw`) | 798 (**không** giải quyết) |
| Revert + `pnpm install --frozen-lockfile` | 0 (chỉ còn 3 `TS2307` của 2 file mới) |
| **Sau fix (override + full install)** | **0 lỗi** |

Repo **không** dùng `next/experimental/testmode` (0 match) → không cài `@next/playwright`.
Mock E2E phải browser-side (`page.route`) — ghi chú ở [p0-03](p0-03-determinism-and-testids.plan.md).

### Cổng chặn khi tái hiện / review

```bash
# 1. readlink — phải cùng 1 instance
readlink apps/backoffice/node_modules/next
readlink packages/next/node_modules/next

# 2. tsc — PHẢI = 0
cd apps/backoffice && ../../node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"

# 3. e2e — xanh liên tiếp
pnpm --filter @megawin/backoffice test:e2e
```


---

## 2. `apps/backoffice/package.json`

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:update": "playwright test --update-snapshots"
  },
  "devDependencies": {
    "@playwright/test": "^1.63.0"
  }
}
```

Đã verify trên npm (18/09/2026): `@playwright/test@1.63.0`, `@next/playwright@16.3.5`.

⚠️ **BỎ `@next/playwright` khỏi kế hoạch.** Nó khai `next` là peer → chắc chắn làm trầm trọng thêm
vấn đề §1, và giá trị nó mang lại (helper `instant()` cho p1-02) không xứng với rủi ro. `p1-02`
phải dùng testing API qua `page.evaluate` hoặc bỏ phần đo navigation.

- `test:e2e:ui` — Playwright UI mode. Đáng thêm vì đây là cách xem trace/diff **tương tác** nhanh
  nhất khi debug local, không cần MCP nào.
- `test:e2e:update` — **chỉ người review chạy tay**. Rule chặn agent tự gọi:
  [p1-03](p1-03-review-workflow-and-guardrail.plan.md) §3.
- KHÔNG thêm `test:e2e` vào `pnpm test` (Turbo) — cần browser + dev server, khác bản chất Vitest.

## 3. `apps/backoffice/playwright.config.ts` — ĐÃ TẠO

**Đây là chỗ bản plan cũ (17/09) có bug thật.** Bản cũ chọn port `3100` để không giết dev server
người khác, nhưng không biết `apiClient` hardcode fallback `http://localhost:3000/api`
([`packages/next/src/client/api-client.ts`](../../../packages/next/src/client/api-client.ts)
`getDefaultBaseUrl()`). Server ở `3100` + browser fetch `3000` = mọi query fail.

Sửa bằng `webServer.env` — set `NEXT_PUBLIC_SITE_URL` khớp port, **KHÔNG tạo `.env*`** (tuân
[`no-env-file-modification.mdc`](../../rules/no-env-file-modification.mdc)).

```typescript
import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E cho backoffice — hành vi + screenshot. Xem `.cursor/plans/ui-visual-regression/`.
 *
 * PORT: `3100` cố định (khác `3000` của `next dev` thường) để `test:e2e` không giết dev server
 * đang mở. NHƯNG `apiClient` (`@megawin/next/client`) build URL TUYỆT ĐỐI từ
 * `NEXT_PUBLIC_SITE_URL`, fallback CỨNG `http://localhost:3000/api` — nếu không truyền env khớp
 * port, browser sẽ fetch `:3000` trong khi server ở `:3100` → mọi React Query fail, và
 * `page.route("**\/api/...")` khớp sai host. Vì vậy `webServer.env` là BẮT BUỘC, không phải tuỳ chọn.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./test/e2e",
  // `test/e2e/support/**` là helper (global-setup, fixtures), KHÔNG phải spec — loại khỏi discovery.
  testMatch: /.*\.spec\.ts$/,
  fullyParallel: true,
  // Chặn `.only` lọt vào CI khi CI được lập (p2-02).
  forbidOnly: !!process.env.CI,
  // 0 retry: dev thấy fail ngay, không che flake. Flake PHẢI sửa bằng p0-03 (clock/poll),
  // không bằng retry — retry chỉ làm flake khó phát hiện hơn.
  retries: 0,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    // Trace/screenshot chỉ khi fail — giữ artifact nhỏ, đủ để debug.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Viewport CỐ ĐỊNH: screenshot baseline phụ thuộc trực tiếp kích thước này, đổi = mọi
    // baseline vỡ. 1920×1080 = desktop Full HD phổ biến cho backoffice (internal tool).
    viewport: { width: 1920, height: 1080 },
    // Ép locale/timezone: `formatDurationCompact` + `displayVNTime` render theo môi trường.
    // Máy dev ở TZ khác = diff giả. `Asia/Ho_Chi_Minh` khớp nghiệp vụ (giờ quay Vietlott).
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
    // Tắt animation lúc chụp: `motion` (framer) + `tw-animate-css` đang dùng trong app.
    // Đây là option của toHaveScreenshot, set ở `expect` bên dưới.
  },
  expect: {
    toHaveScreenshot: {
      // Bắt đầu chặt. CHỈ nới nếu chứng minh được là font antialiasing, KHÔNG nới để "cho qua".
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
      // Ẩn caret nhấp nháy trong input — nguồn diff giả kinh điển.
      caret: "hide",
      scale: "css",
    },
  },
  // 1 browser (Chromium) là đủ: backoffice là internal tool cho staff, không public-facing.
  // Khác quyết định với `packages/ui` (xem ui-component-testing-storybook). Thêm project khi
  // có lý do cụ thể, không thêm "cho đủ".
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // `next dev` (không `build && start`): (a) Next.js MCP `/_next/mcp` chỉ có ở dev (p0-04);
    // (b) testing API cho `instant()` bật tự động ở dev, ở prod cần
    // `experimental.exposeTestingApiInProductionBuild` (p1-02 §5).
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Backoffice kéo 7 game package + Mongo driver → cold start Turbopack chậm. 60s là quá ngắn.
    timeout: 180_000,
    env: {
      // Lý do đầy đủ ở JSDoc đầu file.
      NEXT_PUBLIC_SITE_URL: BASE_URL,
    },
  },
});
```

**Về `pnpm dev --port`:** script hiện tại là `"dev": "next dev"`. `pnpm dev --port 3100` truyền cờ
xuống `next dev` — **không cần `--` phân cách** với pnpm 11 (bản plan cũ ghi `pnpm dev -- --port`,
cú pháp đó pnpm ≥8 cảnh báo). Verify bằng bước 1 mục Verify trước khi chốt.

## 4. `.gitignore` — ĐÃ THÊM (root, không phải app)

⚠️ **`apps/backoffice/.gitignore` KHÔNG dùng được** — file đó là stub tồn tại chỉ để Biome tìm được
VCS ignore file (bug biomejs#6964), nội dung là comment giải thích, **không có rule thật**. Git
ignore thật nằm ở **root `.gitignore`**. Bản plan cũ ghi "Kiểm tra `apps/backoffice/.gitignore` (hoặc
root)" — mơ hồ, dễ dẫn tới thêm rule vào file vô tác dụng.

Đã thêm vào **root `.gitignore`**:

```gitignore
# Playwright E2E artifacts (apps/backoffice — xem .cursor/plans/ui-visual-regression/).
# CHÚ Ý: KHÔNG ignore `**/*-snapshots/` — baseline screenshot PHẢI commit, đó là
# "bản đã được người duyệt". Đây là chỗ dễ sai nhất khi copy .gitignore mẫu.
test-results/
playwright-report/
blob-report/
playwright/.cache/
# Storage state chứa session cookie ký bằng BETTER_AUTH_SECRET thật → ai lấy được
# là đăng nhập backoffice quyền admin trong 24h. Xem p0-02 §4.
apps/backoffice/test/e2e/support/.auth/
```

Pattern **không** có `/` đầu (root `.gitignore` dùng cho cả monorepo → cần khớp ở mọi cấp).
`test/e2e/support/.auth/` ghi đường dẫn đầy đủ từ root vì nó đặc thù 1 app.

## 5. Cài browser — KHÔNG thêm vào `postinstall`

```bash
pnpm --filter @megawin/backoffice exec playwright install chromium
```

Chạy 1 lần/máy dev. **KHÔNG** thêm vào `postinstall` root: mọi dev (kể cả người chỉ làm worker/
package) sẽ phải tải ~150MB browser. Ghi bước này vào mục Verify để người thực thi biết cần chạy.

⚠️ **Trong môi trường agent/sandbox:** `PLAYWRIGHT_BROWSERS_PATH` có thể bị ép sang thư mục cache
tạm (`/var/folders/.../cursor-sandbox-cache/...`) → browser tải về **mất sau khi session kết thúc**,
và `~/Library/Caches/ms-playwright/` vẫn rỗng. Kiểm tra bằng
`pnpm --filter @megawin/backoffice exec playwright install chromium --dry-run` và đọc dòng
`Install location:` trước khi kết luận đã cài xong.

## 6. Smoke test — `test/e2e/smoke.spec.ts`

Chọn `/login` **có chủ đích**: đây là route public render UI thật
(`PUBLIC_ROUTES` trong [`src/proxy.ts`](../../../apps/backoffice/src/proxy.ts)), nên smoke test
chạy được **trước khi** `p0-02` (auth) xong → tách bạch "hạ tầng Playwright hỏng" với "auth hỏng".

### ⚠️ Bẫy: `/login` TỰ redirect sang Cognito sau 1 giây

[`login-client.tsx`](../../../apps/backoffice/src/app/login/_components/login-client.tsx):
`AUTO_REDIRECT_SECONDS = 1`, `setInterval` đếm ngược, khi `countdown === 0` **và**
`document.visibilityState === "visible"` → `handleSignIn()` → `signIn.social({ provider: "cognito" })`
→ rời khỏi origin. Headless Chromium có `visibilityState === "visible"` → **sẽ redirect**.

Test viết kiểu `goto` rồi `expect` sẽ đua với timer này: pass/fail tuỳ tốc độ máy — đúng loại flaky
phải diệt từ gốc, không phải bằng `retries`.

**Giải: `page.clock.install()` TRƯỚC `goto`.** Đóng băng đồng hồ → `setInterval` không bao giờ tick →
`countdown` giữ nguyên `1` → không auto-redirect. Đây cũng là màn "chạy thử" cho kỹ thuật dùng ở
[p0-03](p0-03-determinism-and-testids.plan.md) cho Ops Hub, nên làm ở đây để phát hiện sớm nếu
`page.clock` xung đột gì với React 19 + `reactCompiler`.

```typescript
import { expect, test } from "@playwright/test";

/**
 * Smoke — xác nhận pipeline chạy: dev server lên, browser mở, screenshot ghi được.
 *
 * `/login` là route PUBLIC (`PUBLIC_ROUTES` trong `src/proxy.ts`) → KHÔNG cần `storageState`
 * của p0-02. Cố ý: nếu test này fail thì lỗi ở hạ tầng Playwright, không phải auth.
 */
test.describe("smoke", () => {
  test("trang login render và ổn định", async ({ page }) => {
    // BẮT BUỘC trước goto: `login-client.tsx` auto-redirect sang Cognito sau AUTO_REDIRECT_SECONDS=1
    // (setInterval + visibilityState==="visible", đúng với headless). Đóng băng đồng hồ để
    // countdown không bao giờ về 0. Không có dòng này, test đua với timer → flaky theo tốc độ máy.
    await page.clock.install();

    await page.goto("/login");

    // Assertion hành vi TRƯỚC screenshot: nếu selector sai, fail với message rõ ràng thay vì
    // âm thầm chụp trang trắng rồi "pass" ở lần chạy đầu (baseline sai từ gốc).
    await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();

    // Xác nhận KHÔNG bị đẩy sang Cognito — nếu clock không chặn được, assertion này bắt ngay.
    await expect(page).toHaveURL(/\/login/);

    await expect(page).toHaveScreenshot("login.png", { fullPage: true });
  });
});
```

**Nếu `page.clock` không chặn được redirect** (khả năng thấp nhưng phải có phương án): chặn ở tầng
network thay vì tầng thời gian —

```typescript
// Fallback: chặn request khởi tạo OAuth. Trang sẽ hiện nhánh error "Đăng nhập thất bại"
// (`setError` trong catch của handleSignIn) → baseline khác, ĐẶT TÊN ẢNH KHÁC cho rõ.
await page.route("**/api/auth/sign-in/social**", (route) => route.abort());
```

### Đọc selector thật trước khi commit

`getByRole("button", { name: "Đăng nhập" })` suy ra từ
[`login-client.tsx:146-157`](../../../apps/backoffice/src/app/login/_components/login-client.tsx)
(`<Button onClick={handleSignIn}>` … `Đăng nhập`) — **đã đọc code, chưa xác nhận trên DOM thật**
(accessible name có thể gồm cả text của icon `LogIn`). Xác nhận bằng cách rẻ nhất, đúng thứ tự
(xem [p0-04](p0-04-mcp-toolchain.plan.md) §3):

1. `pnpm --filter @megawin/backoffice dev`
2. `cursor-ide-browser`: `browser_navigate` → `http://localhost:3000/login`, rồi **`browser_snapshot`**
   → đọc a11y tree, lấy đúng `role` + accessible name.
3. Viết `getByRole(...)` khớp snapshot đó.

KHÔNG đoán rồi chạy thử cho tới khi xanh — bản plan cũ đoán `?tab=needs_action` và **đã sai** (xem
[`00-overview.md`](00-overview.md) §2.5).

## Verify

**⛔ Bước 0 (CHẶN TẤT CẢ): giải quyết §1 trước.** Cài `@playwright/test` khi chưa chốt hướng A–D sẽ
lại tạo 798 lỗi type. Kiểm tra sau mỗi lần cài:

```bash
readlink apps/backoffice/node_modules/next
readlink packages/next/node_modules/next
# PHẢI giống nhau. Khác → revert ngay, không đi tiếp.
cd apps/backoffice && ../../node_modules/.bin/tsc --noEmit 2>&1 | grep -c "error TS"   # PHẢI = 0
```

1. `pnpm --filter @megawin/backoffice exec playwright install chromium` — xong không lỗi, và
   `--dry-run` cho thấy `Install location` nằm ở cache thật (không phải sandbox tạm — xem §5).
2. `pnpm --filter @megawin/backoffice test:e2e` lần 1 → tạo baseline `login.png`, PASS.
3. **Chạy lại lần 2 ngay** → PHẢI PASS (chứng minh không flaky từ gốc). Nếu fail: `/login` có phần
   tử động (animation, ảnh lazy) → xử theo [p0-03](p0-03-determinism-and-testids.plan.md) trước khi
   sang phase sau.
4. Mở `playwright-report/` xác nhận report ghi được: `pnpm --filter @megawin/backoffice exec playwright show-report playwright-report`.
5. `git status` — thấy `test/e2e/smoke.spec.ts-snapshots/login.png` là **untracked cần commit**,
   KHÔNG thấy `test-results/` hay `playwright-report/` (đã ignore đúng ở §4).
6. `cd apps/backoffice && ../../node_modules/.bin/tsc --noEmit` → **0 lỗi**. Dùng binary local, KHÔNG
   `pnpm exec tsc` (pnpm cần ghi thư mục tạm, fail trong sandbox agent).
7. `oxlint apps/backoffice/playwright.config.ts apps/backoffice/test/e2e` + `prettier --write` các
   file mới — theo [`oxlint-lint-conventions.mdc`](../../rules/oxlint-lint-conventions.mdc) §g.
   (Đã chạy 18/09: cả hai sạch.)

### Trạng thái thi hành (18/09)

| Việc | Trạng thái |
|---|---|
| `playwright.config.ts` | ✅ đã tạo, lint + format sạch |
| `test/e2e/smoke.spec.ts` | ✅ đã tạo, selector `"Đăng nhập"` đã đối chiếu code |
| root `.gitignore` | ✅ đã thêm (§4) |
| 3 script `test:e2e*` trong `package.json` | ❌ **đã revert** cùng dependency |
| `@playwright/test` | ❌ **chưa cài** — chặn bởi §1 |
| Chạy test / tạo baseline | ❌ chưa — cần §1 |

## Không làm

- **Không cài lại `@playwright/test` khi chưa giải quyết §1** — đã đo: 798 lỗi type, không phải
  rủi ro giả định. Hoist lên root KHÔNG sửa được.
- **Không thêm `@next/playwright`** — khai `next` là peer, làm vấn đề §1 nặng thêm (§2).
- Không thêm rule vào `apps/backoffice/.gitignore` — file đó là stub cho Biome, không có hiệu lực
  git (§4).
- Không viết test cho Ops Hub (đó là `p1-01`) — phase này chỉ hạ tầng + smoke.
- Không viết test cần login (chặn bởi `p0-02`).
- Không cài Storybook/Chromatic (`p3-01`, đã hoãn).
- Không tạo `.github/workflows/` (`p2-02` §3, cần user đồng ý).
- Không tạo/sửa `.env*` — dùng `webServer.env`.
- Không thêm `retries > 0` để làm xanh test flaky — sửa nguyên nhân ở `p0-03`.
