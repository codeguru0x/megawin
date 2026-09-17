# p0-01 — Storybook 10 Foundation cho `packages/ui`

Cài `@storybook/react-vite` vào `packages/ui` (KHÔNG cài root, giống cách Vitest hiện scope theo
package). Tận dụng `vite` + `@vitejs/plugin-react` đã có sẵn trong `devDependencies` — không thêm
builder mới.

> **Lưu ý version (research 17/09/2026):** `@storybook/react-vite` hiện tại là dòng **10.x**
> (`10.3.5` tại thời điểm research), hỗ trợ Vite ≥5 và Vite 8 (repo đang dùng `vite@^8.3.0`), React 19.
> Có 1 vấn đề đã biết giữa Storybook 10 + Vite 8 (Rolldown) + React 19
> (`recentlyCreatedOwnerStacks`, [zeplin/storybook-zeplin#92](https://github.com/zeplin/storybook-zeplin/issues/92))
> — ảnh hưởng addon cụ thể (Zeplin), KHÔNG phải core. Chạy `npx storybook@latest init` để lấy version
> mới nhất tại thời điểm thực thi (không pin version cứng trong plan — registry version đổi liên tục),
> verify build sạch trước khi commit.

## Thay đổi

### 1. Cài đặt

```bash
pnpm --filter @megawin/ui exec npx storybook@latest init --type react --builder vite
```

Lệnh `init` tự detect Vite + React, tự thêm devDependencies cần thiết
(`storybook`, `@storybook/react-vite`, `@storybook/addon-essentials` hoặc tương đương ở Storybook 10),
tự tạo `.storybook/main.ts` + `.storybook/preview.ts` + 1 story mẫu. **Review lại** file sinh ra theo
2 mục dưới — `init` không biết về `apps/backoffice/src/app/globals.css` (theme tokens nằm ngoài
package), phải sửa tay.

### 2. `packages/ui/.storybook/main.ts` — sửa sau khi `init`

```typescript
import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  stories: ["../src/**/*.stories.@(ts|tsx)"],
  addons: [], // addon-vitest, addon-a11y thêm ở p0-02 — KHÔNG thêm addon-essentials nặng nếu không dùng
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
```

### 3. `packages/ui/.storybook/preview.ts` — BẮT BUỘC import theme tokens

```typescript
import type { Preview } from "@storybook/react-vite";

// Theme tokens (@theme CSS variables: --background, --foreground, --game-*...) sống ở
// apps/backoffice, KHÔNG ở packages/ui (packages/ui/src/styles/ chỉ có toast.css). Không import
// file này, mọi class Tailwind semantic (bg-input, text-foreground, focus-visible:ring-ring/50...)
// trong component sẽ resolve về giá trị rỗng — Storybook hiển thị SAI màu/border, KHÔNG phải bug
// của component. Đường dẫn tương đối xuyên package — chấp nhận được vì đây là dev-only tooling
// (Storybook không build vào `dist/` của packages/ui), không phải runtime dependency thật.
import "../../../apps/backoffice/src/app/globals.css";

const preview: Preview = {
  parameters: {
    backgrounds: { default: "app" },
  },
};

export default preview;
```

**Nếu Storybook Vite build không tự chạy PostCSS/Tailwind v4 cho file CSS import xuyên package** —
kiểm tra `apps/backoffice/postcss.config.mjs`, có thể cần thêm `@tailwindcss/postcss` vào
`.storybook/main.ts` `viteFinal` hook để trỏ đúng `postcss.config`. Xác nhận bằng cách mở
Storybook, nhìn màu nút/border có đúng token theme (so với cùng component render trong
`apps/backoffice`) — KHÔNG chỉ nhìn "chạy được, không lỗi console" là đủ.

### 4. Story đầu tiên — `packages/ui/src/components/money-input.stories.tsx`

```tsx
import type { Meta, StoryObj } from "@storybook/react-vite";

import { MoneyInput } from "./money-input";

const meta: Meta<typeof MoneyInput> = {
  title: "Components/MoneyInput",
  component: MoneyInput,
};
export default meta;

type Story = StoryObj<typeof MoneyInput>;

export const Default: Story = {
  args: { placeholder: "Nhập số tiền" },
};

export const WithValue: Story = {
  args: { value: 1_500_000 },
};

export const Disabled: Story = {
  args: { value: 500_000, disabled: true },
};

export const Invalid: Story = {
  args: { value: 0, "aria-invalid": true },
};
```

### 5. Story cho `Toaster` — `packages/ui/src/components/toaster.stories.tsx`

Đọc `toaster.tsx` trước khi viết — xác nhận props thật (component này thường không có props hiển thị
trực tiếp, cần 1 trigger button trong story để gọi `toast()` từ `sonner`, xem cách `apps/backoffice`
đang gọi `toast.success(...)` để viết story tương tự đúng API thật, không đoán).

### 6. `packages/ui/package.json` — script mới

```json
{
  "scripts": {
    "storybook": "storybook dev -p 6100",
    "build-storybook": "storybook build"
  }
}
```

**Cổng `6100`** — khác cổng `apps/backoffice` dev (`3000`) và Playwright e2e (`3100`, xem
`ui-visual-regression/p0-01`) để tránh đụng nhau khi chạy song song trên máy chia sẻ.

## Verify

- `pnpm --filter @megawin/ui storybook` — mở `http://localhost:6100`, xác nhận `MoneyInput` render
  đúng theme (so sánh trực quan với cùng component trong 1 form thật của `apps/backoffice`).
- `pnpm --filter @megawin/ui build-storybook` — build tĩnh thành công, không lỗi (bước này là tiền
  đề cho [p1-01](p1-01-visual-regression-self-hosted.plan.md) chạy Playwright chụp story tĩnh).
- Oxlint: `packages/ui/.oxlintrc.json` override hiện có (`shadcn/no-restyle`...) — xác nhận file
  `*.stories.tsx` mới không bị flag (chạy `pnpm lint packages/ui`); nếu addon `shadcn/lint` áp cả lên
  story file (chỉ import, không render trực tiếp trong app), thêm exception có giải trình theo
  `oxlint-lint-conventions.mdc` mục (d) — không hạ rule chung.

## Không làm

- Không thêm `@storybook/addon-essentials` nếu không cần (nhiều addon con nặng, chỉ thêm cái dùng
  thật — `addon-vitest`, `addon-a11y` ở [p0-02](p0-02-component-tests-vitest-addon.plan.md)).
- Không viết story cho component ngoài `packages/ui` (xem `00-overview.md` mục "Không làm").
- Không cấu hình `chromatic-com/storybook` ở phase này (đó là `p2-01`, có điều kiện).
