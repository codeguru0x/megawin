# p1-01 — Coverage: Keno + Bingo18 Ops Hub

Viết test case visual regression thật cho 2 trang case study của
[`ui-review-2026-09-07.md`](../keno-bingo18-ops-hub/ui-review-2026-09-07.md) — nơi đã xác nhận có
bug UI thật (hardcode màu icon sai `GAME_COLORS`, label lệch guideline). Phụ thuộc
[p0-01](p0-01-playwright-foundation.plan.md) (Playwright + mock helper) đã xong.

## Giới hạn quan trọng — đọc trước khi viết baseline

Screenshot diff chỉ bắt được **regression** (thay đổi ngoài ý muốn SAU khi đã có baseline đúng),
KHÔNG tự phát hiện bug đã tồn tại **tại thời điểm chụp baseline**. `ui-review-2026-09-07.md` mục 3
tìm bug hardcode màu vì so sánh code với `game-colors.ts` — nếu baseline được chụp trước khi biết bug
này, ảnh baseline sẽ "hợp lệ hoá" luôn màu sai đó. **Vì vậy: chụp baseline CHỈ sau khi đã fix 2 bug đã
biết** (label `pending_close`, hardcode gradient) — nếu chưa fix, baseline coi như chốt luôn bug làm
"đúng", vô nghĩa với chính mục tiêu review đã tìm ra.

## Test case — Keno Ops Hub

File: `apps/backoffice/test/e2e/keno-ops-hub.spec.ts`

5 tab theo `HubGateTab` (đã xác nhận qua review UI thật): **Cần xử lý / Hết giờ cược / Chưa có KQ /
Chờ kết sổ / Tất cả**. Mỗi tab là 1 snapshot riêng (state UI khác nhau — filter khác, không phải
cùng 1 view).

```typescript
import { expect, test } from "@playwright/test";

import { mockOpsHubSnapshot } from "./support/mock-hub-snapshot";
import kenoFixture from "./fixtures/keno-hub-snapshot.fixture.json";

const TABS = [
  { param: "needs_action", label: "Cần xử lý" },
  { param: "ended", label: "Hết giờ cược" },
  { param: "awaiting_result", label: "Chưa có KQ" },
  { param: "awaiting_settle", label: "Chờ kết sổ" },
  { param: "all", label: "Tất cả" },
] as const;

test.describe("Keno Ops Hub — visual", () => {
  test.beforeEach(async ({ page }) => {
    await mockOpsHubSnapshot(page, "keno", kenoFixture);
  });

  for (const tab of TABS) {
    test(`tab ${tab.label}`, async ({ page }) => {
      await page.goto(`/games/keno/operations-hub?tab=${tab.param}`);
      // Chờ query React Query settle — tránh chụp lúc còn skeleton (flaky nếu tốc độ máy đổi).
      await expect(page.getByRole("heading", { name: /Ops Hub/i })).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`keno-hub-${tab.param}.png`, { fullPage: true });
    });
  }
});
```

**Đọc `param` thật từ code trước khi commit** — giá trị trên là suy ra tên tiếng Việt từ review,
CHƯA xác nhận đúng chữ `nuqs` param key thật của `HubGateTab` enum
(`apps/backoffice/src/app/(main)/games/keno/operations-hub/_lib/`). Bước đầu tiên khi thực thi
plan này: `grep "HubGateTab" _lib/*.ts` để lấy đúng string value, không đoán.

## Test case — Bingo18 Ops Hub

File: `apps/backoffice/test/e2e/bingo18-ops-hub.spec.ts` — cấu trúc giống Keno (port theo
`p1-04` của Ops Hub, cùng component pattern tham số hoá theo `GameProduct` — xem mục 3 review).
Fixture riêng `bingo18-hub-snapshot.fixture.json`, mock endpoint `/api/bingo18/operations/hub-snapshot`.

**Không giả định tab set giống Keno 100%** — đọc code Bingo18 Ops Hub trước, vì review chỉ xác nhận
chi tiết cho Keno; Bingo18 "port theo" không nghĩa là bit-for-bit giống, có thể lệch nhỏ.

## Mask vùng động không mock được

Nếu Ops Hub có phần tử tự chạy trên client (live countdown giữa các tick poll, "vừa cập nhật Xs
trước") mà mock JSON tĩnh không chặn được (VD tính từ `Date.now()` phía client, không phải field
trong response) — dùng `mask` option của `toHaveScreenshot`:

```typescript
await expect(page).toHaveScreenshot("keno-hub-ended.png", {
  fullPage: true,
  mask: [page.getByTestId("live-countdown")],
});
```

Cần thêm `data-testid="live-countdown"` vào đúng element nếu chưa có selector ổn định — kiểm tra
trước khi viết test, không mask tràn lan (mask che luôn phần cần test nếu chọn selector quá rộng).

## Verify

- `pnpm --filter @megawin/backoffice test:e2e` — lần đầu tạo baseline (không có ảnh cũ để so),
  Playwright tự ghi `*.png` vào `test/e2e/keno-ops-hub.spec.ts-snapshots/`.
- **Người review** (không phải agent) mở từng ảnh, xác nhận đúng — commit baseline vào Git kèm PR
  riêng, mô tả rõ "baseline lần đầu, đã fix bug X/Y trước khi chụp".
- Chạy lại `test:e2e` lần 2 ngay sau khi commit — PHẢI pass (chứng minh test ổn định, không
  flaky ngay từ đầu).

## Không làm

- Không viết test cho 5 game còn lại ở phase này (rollout thuộc `p2-02`, có điều kiện).
- Không tự sửa 2 bug đã biết (label, màu) trong plan này — đó là code fix riêng, ngoài scope "viết
  test". Nếu chưa fix, plan này BỊ CHẶN (xem mục "Giới hạn quan trọng" ở trên) — báo lại cho user,
  không tự chụp baseline trên bug chưa fix.
