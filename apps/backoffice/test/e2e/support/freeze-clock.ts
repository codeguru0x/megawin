/**
 * Mốc thời gian CỐ ĐỊNH cho mọi E2E Ops Hub.
 *
 * Phải khớp `serverNow` trong fixture — cặp này quyết định `clockOffsetMs` trong
 * `use-hub-context.tsx`, từ đó quyết định mọi `SaleGate`/`OpsStage`/`StageHealth`.
 *
 * 14:30 ICT (= 07:30 UTC) nằm giữa phiên Keno (06:08–21:52).
 */
import type { Page } from "@playwright/test";

export const FROZEN_NOW_ISO = "2026-01-15T07:30:00.000Z";

/**
 * Đóng băng đồng hồ trang. PHẢI gọi TRƯỚC `page.goto()`.
 *
 * `setFixedTime` (không `install`+`pauseAt`): `Date.now()` cố định, `setTimeout`/`setInterval`
 * vẫn chạy → interval-registry tick nhưng ghi lại cùng chuỗi; React Query timer vẫn chạy
 * nhưng `page.route` trả cùng fixture.
 */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(FROZEN_NOW_ISO));
}
