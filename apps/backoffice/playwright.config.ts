import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E cho backoffice — assertion hành vi + screenshot regression.
 *
 * Kế hoạch đầy đủ: `.cursor/plans/ui-visual-regression/`.
 *
 * PORT `3100` cố định (khác `3000` của `next dev` thường dùng) để `test:e2e` không giết dev
 * server đang mở. NHƯNG `apiClient` (`@megawin/next/client`) build URL TUYỆT ĐỐI từ
 * `NEXT_PUBLIC_SITE_URL` và fallback CỨNG `http://localhost:3000/api`
 * (`packages/next/src/client/api-client.ts` → `getDefaultBaseUrl()`). Không truyền env khớp
 * port thì browser fetch `:3000` trong khi server ở `:3100` → mọi React Query fail, và
 * `page.route("**\/api/...")` khớp sai host. Vì vậy `webServer.env` là BẮT BUỘC.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./test/e2e",
  // `test/e2e/support/**` là helper (global-setup, fixtures), KHÔNG phải spec — loại khỏi discovery.
  testMatch: /.*\.spec\.ts$/,
  globalSetup: "./test/e2e/support/global-setup.ts",
  fullyParallel: true,
  // Chặn `.only` lọt vào CI khi CI được lập (p2-02).
  forbidOnly: !!process.env.CI,
  // 0 retry có chủ đích: dev thấy fail ngay, không che flake. Flake PHẢI sửa bằng p0-03
  // (page.clock / page.route), KHÔNG bằng retry — retry chỉ làm flake khó phát hiện hơn.
  retries: 0,
  reporter: [["html", { outputFolder: "playwright-report", open: "never" }], ["list"]],
  use: {
    baseURL: BASE_URL,
    // Trace/screenshot chỉ khi fail — artifact nhỏ, đủ để debug qua trace viewer.
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    // Viewport CỐ ĐỊNH: baseline screenshot phụ thuộc trực tiếp kích thước này, đổi = mọi
    // baseline vỡ. 1920×1080 = desktop Full HD phổ biến cho backoffice (internal tool).
    viewport: { width: 1920, height: 1080 },
    // Ép locale/timezone: helper format giờ/tiền render theo môi trường. Máy dev ở TZ khác
    // sẽ tạo diff giả. `Asia/Ho_Chi_Minh` khớp nghiệp vụ (giờ quay Vietlott).
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },
  expect: {
    toHaveScreenshot: {
      // Bắt đầu chặt. CHỈ nới khi chứng minh được là font antialiasing, KHÔNG nới để "cho qua".
      maxDiffPixelRatio: 0.001,
      // Tắt animation lúc chụp (`motion` + `tw-animate-css` đang dùng trong app).
      animations: "disabled",
      // Ẩn caret nhấp nháy trong input — nguồn diff giả kinh điển.
      caret: "hide",
      scale: "css",
    },
  },
  // Project theo persona (p0-02): admin = mặc định (full sidebar); staff = chỉ rbac.spec.
  // KHÔNG nhân đôi toàn bộ suite — chỉ 3 mục sidebar + 13 API admin-only khác nhau.
  // admin VẪN chạy rbac (kỳ vọng thấy menu); staff chỉ chạy rbac (kỳ vọng ẩn + API 403).
  //
  // `devices["Desktop Chrome"]` mang sẵn viewport 1280×720 — PHẢI ghi đè SAU spread, nếu không
  // top-level `use.viewport` bị nuốt và baseline vẫn là 1280.
  projects: [
    {
      name: "admin",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        storageState: "./test/e2e/support/.auth/admin.json",
      },
    },
    {
      name: "staff",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1920, height: 1080 },
        storageState: "./test/e2e/support/.auth/staff.json",
      },
      testMatch: /rbac\.spec\.ts$/,
    },
  ],
  webServer: {
    // `next dev` (không `build && start`): (a) Next.js MCP `/_next/mcp` chỉ có ở dev (p0-04);
    // (b) testing API cho `instant()` bật tự động ở dev, ở prod cần
    // `experimental.exposeTestingApiInProductionBuild` (p1-02 §5).
    command: `pnpm dev --port ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    // Backoffice kéo 7 game package + Mongo driver → cold start Turbopack chậm. 60s quá ngắn.
    timeout: 180_000,
    env: {
      // Lý do đầy đủ ở JSDoc đầu file. KHÔNG tạo `.env*` (no-env-file-modification.mdc).
      NEXT_PUBLIC_SITE_URL: BASE_URL,
      // Kế thừa `BETTER_AUTH_SECRET` từ process.env (CI inject). Local: Next tự đọc `.env.local`.
      // Mint (`e2e-auth`) dùng cùng biến → cookie verify được. Không hardcode secret ở đây.
    },
  },
});
