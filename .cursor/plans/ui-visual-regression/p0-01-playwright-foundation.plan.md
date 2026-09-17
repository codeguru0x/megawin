# p0-01 — Playwright Foundation cho `apps/backoffice`

Cài Playwright vào `apps/backoffice` (KHÔNG cài root — chỉ app UI cần, giống cách `vitest` hiện
đã scope theo package qua `@megawin/vitest-config`), cấu hình `toHaveScreenshot()` self-hosted +
1 mock helper tái dùng cho các trang lấy data qua React Query.

> **Convention thư mục (chốt 17/09/2026):** toàn repo dùng chung 1 gốc `test/` cho MỌI loại test,
> chia theo **subfolder theo loại** — `test/unit/`, `test/integration/`, `test/e2e/` — xem
> [`monorepo-test-setup/p2-01-unit-integration-e2e-convention.plan.md`](../monorepo-test-setup/p2-01-unit-integration-e2e-convention.plan.md).
> Playwright của plan này dùng `testDir: "test/e2e"`, KHÔNG dùng dir riêng `visual-test/` như bản
> nháp trước — tránh 2 gốc test song song cho cùng 1 app.

`backoffice` đã có script `"test": "vitest run"` (Vitest, unit/component, chạy trên `test/unit/**`
sau khi restructure). Playwright PHẢI dùng tên script khác (`test:e2e`) để không đụng lẫn 2 loại
test khác bản chất (Vitest = logic/render jsdom; Playwright = browser thật + screenshot).

## Thay đổi

### 1. `apps/backoffice/package.json` — devDependencies + script

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:update": "playwright test --update-snapshots"
  },
  "devDependencies": {
    "@playwright/test": "^1.63.0"
  }
}
```

`test:e2e:update` chỉ được **người review chạy tay** sau khi xem diff — KHÔNG bao giờ nằm
trong script agent tự gọi (xem rule agent guardrail ở
[p1-02](p1-02-review-workflow-and-agent-guardrail.plan.md)).

### 2. `apps/backoffice/playwright.config.ts` — MỚI

```typescript
import { defineConfig, devices } from "@playwright/test";

/**
 * Cấu hình Playwright CHỈ cho visual regression (screenshot diff), KHÔNG phải E2E hành vi.
 * `testDir` nằm trong gốc `test/` chung của app — subfolder `e2e/` phân biệt với `unit/` (Vitest,
 * xem `monorepo-test-setup/p2-01-unit-integration-e2e-convention.plan.md`).
 */
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  // Free tier CI chưa tồn tại (repo chưa có .github/workflows) — retries chỉ có ý nghĩa khi có CI.
  // Giữ 0 để dev thấy fail ngay, không che giấu flake.
  retries: 0,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:3100",
    // Threshold pixel — bắt đầu chặt (0.1%), nới nếu font rendering gây false positive thật
    // (xem ghi chú Docker base image bên dưới trước khi nới).
  },
  expect: {
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Backoffice là internal tool cho staff — mặc định 1 browser (Chrome) là đủ, khác quyết định
  // với @shadcn/lint (packages/ui, public-facing sau này). Thêm project khi có lý do cụ thể.
  webServer: {
    command: "pnpm dev -- --port 3100",
    url: "http://localhost:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

**Cổng `3100` cố định, khác cổng dev thường (`3000`)** — tránh việc chạy `test:e2e` giết dev
server đang mở của người khác trên máy chia sẻ.

### 3. `apps/backoffice/test/e2e/support/mock-hub-snapshot.ts` — MỚI, helper tái dùng

Mọi trang Ops Hub gọi qua 1 query duy nhất
([`use-hub-query.ts`](<../../../apps/backoffice/src/app/(main)/games/keno/operations-hub/_lib/use-hub-query.ts>)
— `fetchOpsHubSnapshot()` gọi `GET /keno/operations/hub-snapshot`, route thật tại
[`apps/backoffice/src/app/api/keno/operations/hub-snapshot/route.ts`](<../../../apps/backoffice/src/app/api/keno/operations/hub-snapshot/route.ts>)).
Đây là **điểm chặn duy nhất** cần mock cho toàn trang — không cần chặn từng API con.

```typescript
import type { Page } from "@playwright/test";

/**
 * Chặn request `hub-snapshot` của Ops Hub, trả fixture JSON cố định — KHÔNG chạm route thật /
 * DB thật. Dùng `page.route()`, KHÔNG dùng MSW (thêm dependency mới không cần thiết cho scope này).
 *
 * `fixture` là raw response shape của `OpsHubSnapshotOutput` — copy 1 lần từ response thật (đã che
 * số liệu nhạy cảm nếu có), sau đó SỬA TAY để cố định mọi giá trị đổi theo thời gian (đồng hồ, id
 * kỳ quay) — không generate lại từ DB mỗi lần chạy.
 */
export async function mockOpsHubSnapshot(page: Page, gameSlug: "keno" | "bingo18", fixture: unknown): Promise<void> {
  await page.route(`**/api/${gameSlug}/operations/hub-snapshot**`, async (route) => {
    await route.fulfill({ json: fixture });
  });
}
```

### 4. `apps/backoffice/test/e2e/fixtures/keno-hub-snapshot.fixture.json` — MỚI

Fixture tĩnh cho `OpsHubSnapshotOutput` (`@megawin/game-keno-application/use-cases/operations`).
**Lấy 1 lần response thật từ dev/staging**, sửa tay:

- Mọi timestamp → giá trị cố định trong quá khứ xa (VD `"2026-01-15T06:08:00.000Z"`), không dùng
  `new Date()`.
- `drawId` → sentinel dễ nhận biết (VD `"2999-01-01.001"`, theo convention
  [`test-data-safety.mdc`](../../rules/test-data-safety.mdc) §1 dù đây không chạm DB thật — giữ
  quy ước để không nhầm với data thật nếu sau này log lẫn vào đâu).
- Số tiền/exposure → giá trị tròn, dễ nhận biết khi review diff (VD `12345600` không phải số random
  nhìn giống thật).

Tương tự cho `bingo18-hub-snapshot.fixture.json` (P1).

## Verify

- `pnpm --filter @megawin/backoffice exec playwright install chromium` (cài browser lần đầu, chỉ
  chạy 1 lần trên máy dev — KHÔNG thêm vào `postinstall` root, tránh mọi máy dev phải tải browser
  dù không làm việc trên backoffice).
- Viết 1 test smoke tối thiểu (`test/e2e/smoke.spec.ts`) mở trang login hoặc 1 trang tĩnh không
  cần mock, chụp `toHaveScreenshot()` lần đầu để tạo baseline, xác nhận pipeline chạy được trước khi
  viết test thật ở `p1-01`.
- `pnpm --filter @megawin/backoffice test:e2e` chạy xanh với ít nhất 1 test.

## Không làm

- Không viết test case thật cho Ops Hub ở phase này (đó là `p1-01`) — phase này chỉ dựng hạ tầng.
- Không cài Storybook, không đăng ký Chromatic (đó là `p2-01`, có điều kiện).
- Không tạo `.github/workflows/` (repo chưa có CI — quyết định riêng, ngoài scope plan này).
- Không đụng `.env*` — `baseURL`/port cấu hình thẳng trong `playwright.config.ts`, không cần env
  mới.
