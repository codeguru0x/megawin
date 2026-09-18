/**
 * Determinism smoke — chứng minh clock + mock ổn định (p0-03).
 * Coverage 5 tab đầy đủ nằm ở p1-01.
 */
import { expect, test } from "./support/hub-fixtures";
import { HUB_QUEUE_REGION } from "./support/hub-gate-tabs";

test.describe("ops hub determinism", () => {
  test("Keno hub mock ăn + DOM ổn định sau 3s", async ({ page, opsHub }) => {
    await opsHub("keno", "all");

    await expect(page.getByText("#005", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("table").first()).toBeVisible();

    const zone = page.getByRole("region", { name: HUB_QUEUE_REGION });
    await expect(zone).toBeVisible();

    const before = await zone.innerText();
    await page.waitForTimeout(3000);
    const after = await zone.innerText();
    expect(after, "Zone 5A text phải bất biến khi clock đóng băng").toBe(before);
  });
});
