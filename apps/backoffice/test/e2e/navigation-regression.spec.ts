/**
 * Navigation regression — khoá thành quả `backoffice-nav-performance`.
 *
 * Sidebar game dùng Collapsible: submenu chỉ mount khi mở. Trên `/dashboard` click
 * `Keno` không ổn định mở submenu trong E2E → neo từ trang Ops Hub (submenu
 * `defaultOpen` vì `isSubmenuOpen` theo pathname).
 */
import { expect, test } from "@playwright/test";

test.describe("navigation regression", () => {
  /**
   * Chống tái phát sự cố "load liên tục" 04/09/2026
   * (`backoffice-nav-performance/p0-01`: `staleTimes.dynamic` default 0 → request storm khi hover).
   *
   * Đo 18/09/2026 (admin, `staleTimes.dynamic = 1800`, partialPrefetching on):
   * - Hover 5 lần link Ops Hub Keno (submenu đã mở vì đang ở route đó) → `_rsc` ≤ 2.
   * Ngưỡng: `< 5`. Hạ `staleTimes.dynamic` về 0 → thường ≥ 5.
   */
  test("hover lặp lại KHÔNG sinh request storm (staleTimes.dynamic > 0)", async ({ page }) => {
    await page.goto("/games/keno/operations-hub", { waitUntil: "domcontentloaded" });
    const opsLink = page.locator('a[href="/games/keno/operations-hub"]');
    await expect(opsLink).toBeVisible({ timeout: 30_000 });

    const rscRequests: string[] = [];
    page.on("request", (req) => {
      const url = req.url();
      if (url.includes("_rsc=") && url.includes("/games/keno/operations-hub")) {
        rscRequests.push(url);
      }
    });

    for (let i = 0; i < 5; i++) {
      await opsLink.hover();
      await page.locator("main").hover({ position: { x: 20, y: 20 } });
    }

    await page.waitForTimeout(500);
    expect(
      rscRequests.length,
      `RSC requests=${rscRequests.length}; kỳ vọng < 5 khi staleTimes.dynamic=1800. URLs=${rscRequests.join(" | ")}`,
    ).toBeLessThan(5);
  });

  /**
   * Chống hồi quy `backoffice-nav-performance/p0-02` — `loading.tsx` → `data-slot="skeleton"`.
   *
   * Soft nav + `staleTimes`/`partialPrefetching` dễ HIT cache → không hiện skeleton.
   * Chặn MỌI request tới `/games/keno/draws` (kể cả prefetch) TRƯỚC khi vào Ops Hub,
   * rồi mới click — buộc hiện `loading.tsx`.
   */
  test("điều hướng hiện skeleton, không trắng trang", async ({ page }) => {
    await page.route("**/games/keno/draws**", async (route) => {
      await new Promise((r) => setTimeout(r, 2000));
      await route.continue();
    });

    await page.goto("/games/keno/operations-hub", { waitUntil: "domcontentloaded" });
    await expect(page.locator('a[href="/games/keno/operations-hub"]')).toBeVisible({ timeout: 30_000 });

    const skeletonVisible = page.locator("[data-slot='skeleton'], .animate-pulse").first().waitFor({
      state: "visible",
      timeout: 10_000,
    });
    await Promise.all([skeletonVisible, page.locator('a[href="/games/keno/draws"]').click()]);
  });

  /**
   * Thu hẹp Keno + Bingo18 (plan §4). Collect href khi submenu đã mở (đứng trên Ops Hub).
   */
  test("link sidebar Keno + Bingo18 không 404/error", async ({ page }) => {
    const hrefs = new Set<string>();

    for (const hub of ["/games/keno/operations-hub", "/games/bingo18/operations-hub"] as const) {
      await page.goto(hub, { waitUntil: "domcontentloaded" });
      await expect(page.locator(`a[href="${hub}"]`)).toBeVisible({ timeout: 30_000 });
      const found = await page.evaluate(() => {
        const prefix = location.pathname.startsWith("/games/bingo18") ? "/games/bingo18" : "/games/keno";
        return Array.from(document.querySelectorAll(`a[href^='${prefix}']`))
          .map((a) => (a as HTMLAnchorElement).getAttribute("href"))
          .filter((h): h is string => !!h);
      });
      for (const h of found) {
        hrefs.add(h);
      }
    }

    expect(hrefs.size, "sidebar Keno/Bingo18 phải có link").toBeGreaterThan(0);

    for (const href of hrefs) {
      const res = await page.goto(href, { waitUntil: "domcontentloaded" });
      expect(res?.status() ?? 0, `${href} status lỗi`).toBeLessThan(400);
      await expect(page.getByText(/Đã xảy ra lỗi|Something went wrong/i)).toHaveCount(0);
    }
  });
});
