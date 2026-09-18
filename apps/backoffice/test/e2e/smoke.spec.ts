import { expect, test } from "@playwright/test";

/**
 * Smoke test — chứng minh hạ tầng Playwright chạy được. KHÔNG kiểm nghiệp vụ.
 *
 * Chọn `/login` vì đó là route công khai duy nhất render UI thật (`src/proxy.ts`
 * `PUBLIC_ROUTES`); mọi route khác cần session cookie — xem
 * `.cursor/plans/ui-visual-regression/p0-02-auth-storage-state.plan.md`.
 */
test.describe("smoke", () => {
  // Smoke không cần session — override storageState của project admin.
  test.use({ storageState: { cookies: [], origins: [] } });

  test("trang login render và ổn định", async ({ page }) => {
    // BẮT BUỘC: `/login` tự gọi signIn.social({ provider: "cognito" }) sau 1 giây
    // (`AUTO_REDIRECT_SECONDS = 1`) khi `document.visibilityState === "visible"` — và
    // headless Chromium LÀ "visible". Không đóng băng clock thì test đua với redirect
    // sang Cognito hosted UI (domain ngoài, không kiểm soát) → flaky 100%.
    // `clock.install()` cài fake timer không tự chạy → `setInterval` đếm countdown
    // không bao giờ fire → countdown giữ nguyên 1, redirect không xảy ra.
    await page.clock.install();
    await page.goto("/login");

    await expect(page.getByRole("button", { name: "Đăng nhập" })).toBeVisible();
    await expect(page).toHaveURL(/\/login/);

    // Baseline PNG gitignore (local-only). CI chỉ giữ assertion hành vi phía trên.
    if (!process.env.CI) {
      await expect(page).toHaveScreenshot("login.png", { fullPage: true });
    }
  });
});
