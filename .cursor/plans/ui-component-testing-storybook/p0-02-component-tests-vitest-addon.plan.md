# p0-02 — Component Tests qua `@storybook/addon-vitest` + Accessibility

Biến story đã có ([p0-01](p0-01-storybook-foundation.plan.md)) thành test thật (interaction test qua
`play` function), chạy được cả trong Storybook UI lẫn CLI/Vitest — không viết 1 bộ test RTL riêng
trùng lặp với story.

## Vì sao dùng `addon-vitest` thay vì Vitest+RTL thuần cho phần này

`monorepo-test-setup/p1-01` đã chốt Vitest+RTL+jsdom cho **unit/pure logic** (`src/lib/*`, hooks) —
plan đó vẫn đúng, KHÔNG đổi. `addon-vitest` giải quyết một việc khác: chạy **story đã viết** (khai
báo props/state cho từng biến thể UI) như test, tái dùng chính story đó — tránh viết 2 lần "render
`MoneyInput` với `value=1_500_000`" (1 lần cho story hiển thị, 1 lần cho RTL test).

**Khác biệt kỹ thuật quan trọng:** `addon-vitest` mặc định chạy Vitest **browser mode** qua
Playwright Chromium (không phải jsdom) — chính xác hơn cho component có thể đụng browser API thật.
`packages/ui/vitest.config.ts` hiện tại (`jsdomConfig`) **giữ nguyên cho `test/unit/**`**; project
Storybook test là 1 **project Vitest riêng** (pattern `projects: [...]` giống
`game-power655-application/vitest.config.ts` đã tách `unit`/`integration` — dùng lại đúng pattern
này, không phát minh cấu trúc khác).

## Thay đổi

### 1. Cài đặt

```bash
pnpm --filter @megawin/ui exec npx storybook add @storybook/addon-vitest
pnpm --filter @megawin/ui exec npx storybook add @storybook/addon-a11y
```

Lệnh `storybook add` tự cập nhật `.storybook/main.ts` (thêm vào `addons`), tự thêm devDependency,
và với `addon-vitest` sẽ hỏi cài Playwright browser binary — chọn **Yes** (cần cho browser mode).

### 2. `packages/ui/vitest.config.ts` — thêm project `storybook`

```typescript
import { jsdomConfig } from "@megawin/vitest-config";
import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // Unit/pure — giữ nguyên hành vi cũ (monorepo-test-setup/p1-01), KHÔNG đổi.
        plugins: [react()],
        test: {
          name: "unit",
          ...jsdomConfig.test,
          include: ["test/unit/**/*.test.{ts,tsx}"],
        },
      },
      {
        // Storybook component test — chạy story .stories.tsx như test, browser mode qua Playwright.
        plugins: [storybookTest({ configDir: ".storybook" }), react()],
        test: {
          name: "storybook",
          browser: { enabled: true, provider: "playwright", instances: [{ browser: "chromium" }] },
          setupFiles: [".storybook/vitest.setup.ts"],
          include: ["src/**/*.stories.tsx"],
        },
      },
    ],
  },
});
```

**Đọc kỹ output thật của `storybook add @storybook/addon-vitest`** trước khi copy khối trên — addon
tự sinh `vitest.setup.ts` và có thể chọn cấu trúc `workspace`/`projects` khác theo version cụ thể tại
thời điểm cài (Storybook 10.x đang phát triển nhanh, API `projects` là hiểu biết tại 09/2026, verify
lại bằng doc chính thức lúc thực thi, không tin tưởng tuyệt đối bản trên).

### 3. `packages/ui/package.json` — script

```json
{
  "scripts": {
    "test:storybook": "vitest run --project=storybook",
    "test": "vitest run"
  }
}
```

`"test"` hiện tại (`vitest run`) sẽ tự chạy CẢ 2 project (`unit` + `storybook`) nếu dùng cấu trúc
`projects` — xác nhận điều này khi verify (mục dưới), vì nó đổi hành vi `pnpm --filter @megawin/ui test`
đang được `turbo.json` task `test` gọi. Nếu muốn tách riêng (không để CI/turbo mặc định chạy browser
test nặng hơn), thêm `"test:unit": "vitest run --project=unit"` và cân nhắc đổi turbo task — đây là
quyết định vận hành, hỏi lại user trước khi đổi default `"test"` nếu ảnh hưởng turbo pipeline hiện có.

### 4. Viết interaction test — thêm `play` function vào story đã có

Sửa `money-input.stories.tsx` ([p0-01](p0-01-storybook-foundation.plan.md)) thêm `play`:

```tsx
import { expect, userEvent, within } from "@storybook/test";
import type { Meta, StoryObj } from "@storybook/react-vite";

import { MoneyInput } from "./money-input";

const meta: Meta<typeof MoneyInput> = {
  title: "Components/MoneyInput",
  component: MoneyInput,
};
export default meta;

type Story = StoryObj<typeof MoneyInput>;

export const TypingFormatsNumber: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByRole("textbox");
    await userEvent.type(input, "1500000");
    // NumericFormat của react-number-format tự chèn separator — xác nhận format thật
    // (dấu phân cách nghìn) bằng cách đọc component thật trước khi assert giá trị cụ thể,
    // không đoán format string.
    await expect(input).toHaveValue(/* giá trị đã format, đọc từ props locale thật */);
  },
};
```

**Đọc `money-input.tsx` đầy đủ trước khi viết assertion cụ thể** — `NumericFormatProps` có thể nhận
`thousandSeparator`/`decimalScale` từ props truyền vào tại nơi dùng thật (VD form nào trong
`apps/backoffice`), không phải property cố định trong component — story cần set đúng props đó để
test có ý nghĩa với cách component THẬT được dùng.

### 5. Accessibility check

`@storybook/addon-a11y` tự chạy `axe-core` trên mọi story khi mở Storybook UI (panel "Accessibility")
— không cần viết code thêm. Khi chạy qua `addon-vitest` (CLI), có thể enable a11y test tự động theo
cấu hình addon (đọc doc addon để lấy đúng flag `test: { a11y: true }` tại version cài — không đoán
tên option).

## Verify

- `pnpm --filter @megawin/ui test:storybook` (hoặc `test` nếu gộp) — pass với ít nhất `MoneyInput` +
  `Toaster` story có `play` function.
- Mở Storybook UI (`pnpm --filter @megawin/ui storybook`), tab "Accessibility" không có violation
  nghiêm trọng (`critical`/`serious`) trên story hiện có — nếu có, ghi nhận, KHÔNG tự "fix" component
  ngoài scope story test (đó là việc sửa code UI, khác việc viết test).
- Xác nhận `turbo run test --filter=@megawin/ui` (nếu có gọi tới) vẫn xanh sau khi đổi cấu trúc
  `vitest.config.ts` — browser mode cần Playwright browser binary đã cài trên máy CI/dev (ghi chú
  vận hành mới, tương tự yêu cầu Docker của `testcontainers-setup`).

## Không làm

- Không viết lại các test đã có ở `packages/ui/test/unit/get-initials.test.ts` bằng story — giữ
  nguyên unit test thuần cho pure function, chỉ dùng story test cho **component có render**.
- Không bật `addon-vitest` coverage report trong plan này (tính năng riêng, thêm khi cần đo coverage
  thật, không mặc định bật để tránh chậm CI mà chưa ai đọc số liệu).
- Không đổi `turbo.json` task `test` mà không hỏi user (mục 3, nếu tách `test:unit`/`test:storybook`).
