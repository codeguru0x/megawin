import { expect, test } from "@playwright/test";

/**
 * Phân quyền sidebar + API — chạy ở CẢ 2 project (admin + staff).
 *
 * 3 mục gate `roles: [CompanyRole.Admin]` — nguồn: sidebar-items.ts.
 * "Kết quả" là CollapsibleTrigger (button); submenu đóng trên /dashboard nên
 * `a[href="/resultfeed"]` không có trong DOM — assert button name thay vì href.
 */
test.describe("phân quyền sidebar", () => {
  test("mục admin-only hiện/ẩn đúng theo persona", async ({ page }, testInfo) => {
    const isAdmin = testInfo.project.name === "admin";
    await page.goto("/dashboard");

    // Sidebar shadcn không có landmark `navigation` — dùng `data-slot="sidebar"`.
    const sidebar = page.locator('[data-slot="sidebar"]').first();
    const expected = isAdmin ? 1 : 0;

    await expect(sidebar.locator('a[href="/tenants"]'), `/tenants · ${testInfo.project.name}`).toHaveCount(expected);
    await expect(
      sidebar.locator('a[href="/system/workers"]'),
      `/system/workers · ${testInfo.project.name}`,
    ).toHaveCount(expected);
    await expect(sidebar.getByRole("button", { name: "Kết quả" }), `Kết quả · ${testInfo.project.name}`).toHaveCount(
      expected,
    );
  });

  // API 403 là hợp đồng bảo mật thật (tầng 2) — phải test riêng, không suy ra từ UI.
  test("API admin-only trả 403 cho staff", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name === "admin", "Chỉ kiểm nhánh staff.");
    const res = await request.get("/api/system/workers");
    expect(res.status()).toBe(403);
  });
});
