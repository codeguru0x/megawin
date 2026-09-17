# p1-01 — Visual Regression Component tự host (Playwright chụp Storybook story)

Chụp screenshot của TỪNG STORY (không phải trang) bằng Playwright, dùng đúng
`toHaveScreenshot()` + threshold config đã chốt ở
[`ui-visual-regression/p0-01`](../ui-visual-regression/p0-01-playwright-foundation.plan.md) — tái
dùng convention, KHÔNG phát minh threshold/reporter khác cho `packages/ui`.

## Vì sao Playwright, không phải `@chromatic-com/playwright` hay Storybook Test's built-in visual addon

Storybook 9+ có "Visual tests addon" nhưng **addon đó chính là Chromatic** (theo doc chính thức:
*"Storybook supports cross-browser visual testing natively using Chromatic"*) — không phải addon
tự host độc lập. Vì `p2-01` (Chromatic) là CÓ ĐIỀU KIỆN, cần user tự chốt trả phí, phase này dùng
Playwright thuần chụp trực tiếp `iframe.html?id=<story-id>` mà `build-storybook` sinh ra — hoạt
động ngay, không cần quyết định vendor.

## Thay đổi

### 1. Cài đặt

```bash
pnpm --filter @megawin/ui add -D @playwright/test
pnpm --filter @megawin/ui exec playwright install chromium
```

### 2. `packages/ui/playwright.config.ts` — MỚI

```typescript
import { defineConfig, devices } from "@playwright/test";

/**
 * Visual regression cho TỪNG STORY của packages/ui (khác apps/backoffice/playwright.config.ts —
 * đó chụp TRANG Next.js thật, cái này chụp Storybook iframe tĩnh, không cần webServer Next.js).
 */
export default defineConfig({
  testDir: "./test/e2e",
  fullyParallel: true,
  retries: 0,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    baseURL: "http://localhost:6200",
  },
  expect: {
    // Threshold giống ui-visual-regression/p0-01 — nhất quán 1 chuẩn cho toàn repo, không tự
    // đặt số khác cho packages/ui.
    toHaveScreenshot: { maxDiffPixelRatio: 0.001 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Storybook build tĩnh + serve — KHÔNG dùng `storybook dev` (dev server có HMR/websocket,
    // không cần cho chụp ảnh tĩnh, chỉ làm chậm/flaky hơn).
    command: "pnpm build-storybook && pnpm exec http-server storybook-static -p 6200 -s",
    url: "http://localhost:6200",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
```

**Cổng `6200`** — khác cổng dev Storybook (`6100`, [p0-01](p0-01-storybook-foundation.plan.md)) và
mọi cổng Playwright khác của `apps/backoffice` (`3100`). Cần thêm `http-server` vào devDependencies
(nhẹ, chỉ serve static — hoặc dùng `serve`/`sirv-cli` nếu đã có sẵn convention repo, kiểm tra trước
khi thêm dependency mới trùng chức năng).

### 3. `packages/ui/test/e2e/visual.spec.ts` — MỚI

**Không viết tay danh sách story id** — đọc `storybook-static/index.json` (sinh ra sau
`build-storybook`) để tự động lấy toàn bộ story, tránh quên story mới thêm sau:

```typescript
import { expect, test } from "@playwright/test";
import storyIndex from "../../storybook-static/index.json" with { type: "json" };

const stories = Object.values(storyIndex.entries).filter((e) => e.type === "story");

for (const story of stories) {
  test(`visual — ${story.title} / ${story.name}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=${story.id}&viewMode=story`);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveScreenshot(`${story.id}.png`);
  });
}
```

**Xác nhận đúng shape `index.json` tại version Storybook thật đã cài** ([p0-01](p0-01-storybook-foundation.plan.md))
trước khi copy đoạn trên — field `entries`/`type`/`title`/`name` là hiểu biết tại thời điểm research,
Storybook đổi format `index.json` giữa major version. Mở file thật, `console.log` cấu trúc, rồi viết
lại nếu lệch.

### 4. `packages/ui/package.json` — script

```json
{
  "scripts": {
    "test:visual": "playwright test",
    "test:visual:update": "playwright test --update-snapshots"
  }
}
```

`test:visual:update` — **chỉ người review chạy tay**, cùng nguyên tắc guardrail đã chốt ở
[`ui-visual-regression/p1-02`](../ui-visual-regression/p1-02-review-workflow-and-agent-guardrail.plan.md)
mục 3. Rule `.cursor/rules/visual-regression-baseline.mdc` hiện có glob
`apps/backoffice/test/e2e/**` — **mở rộng glob** sang `packages/ui/test/e2e/**` trong phase này (sửa
1 rule, không tạo rule mới trùng nội dung).

## Verify

- `pnpm --filter @megawin/ui test:visual` — lần đầu tạo baseline cho mọi story hiện có.
- **Người review** mở từng ảnh trong `packages/ui/test/e2e/visual.spec.ts-snapshots/`, xác nhận
  đúng theme/token (đặc biệt kiểm tra bug đã lường ở `p0-01` — nếu ảnh baseline có màu/border sai do
  thiếu import `globals.css`, PHẢI sửa `.storybook/preview.ts` trước, không chốt baseline sai).
- Chạy lại lần 2 ngay sau commit — phải pass (không flaky).

## Không làm

- Không chụp lại toàn bộ page `apps/backoffice` ở đây — đó thuộc `ui-visual-regression/p1-01`,
  KHÔNG trùng lặp.
- Không setup Chromatic ở phase này (đó là `p2-01`).
- Không thêm `retries` > 0 (lý do giống `ui-visual-regression/p0-01`: chưa có CI, retry chỉ che
  flake).
