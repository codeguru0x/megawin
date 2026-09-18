/**
 * Mock `GET /api/{game}/operations/hub-snapshot` — browser-side `page.route`.
 *
 * Không dùng `@next/playwright` / testmode (p0-01 đã gỡ peer; kéo lại sẽ lệch instance next).
 * Glob `**\/api/...` vì `apiClient` build URL tuyệt đối từ `NEXT_PUBLIC_SITE_URL`.
 */
import type { Page } from "@playwright/test";

/** Game có Ops Hub. Chỉ Keno + Bingo18 tồn tại. */
export type OpsHubGame = "keno" | "bingo18";

/**
 * Chặn hub-snapshot, trả fixture đã bọc envelope `{ success, data }` của `apiSuccess`.
 *
 * Fixture truyền vào là **raw** `OpsHubSnapshotOutput` — helper tự bọc envelope.
 * `apiClient.get()` unwrap `data` → FE nhận đúng DTO.
 */
export async function mockOpsHubSnapshot(page: Page, game: OpsHubGame, data: unknown): Promise<void> {
  await page.route(`**/api/${game}/operations/hub-snapshot**`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, data }),
    });
  });
}
