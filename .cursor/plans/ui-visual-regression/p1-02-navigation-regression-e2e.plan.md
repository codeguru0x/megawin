# p1-02 — Navigation regression E2E: bảo vệ thành quả `backoffice-nav-performance`

Khoá lại bằng test tự động những gì [`backoffice-nav-performance`](../backoffice-nav-performance/00-overview.md)
đã sửa xong. Đó là các sửa đổi **không có test nào bảo vệ** — sửa bằng config một dòng, và một
`git revert` vô ý hoặc một `<Link prefetch>` mới là tái phát, im lặng.

Phụ thuộc [p0-03](p0-03-determinism-and-testids.plan.md).

---

## 1. Đính chính quan trọng: Instant Navigation CHƯA ship

Bản nháp trước của phase này định dùng `instant()` từ `@next/playwright` làm trọng tâm. **Sai** —
đã kiểm tra status thật của plan liên quan:

| Plan | Status | Hệ quả cho phase này |
|---|---|---|
| [`p0-01` sửa gốc `staleTimes.dynamic = 0`](../backoffice-nav-performance/p0-01-fix-prefetch-loop-root-cause.plan.md) | ✅ **done** | **Có** thứ để test — §2 |
| [`p0-02` loading skeleton coverage](../backoffice-nav-performance/p0-02-loading-skeleton-coverage.plan.md) | ✅ **done** | **Có** thứ để test — §3 |
| [`p2-01b` partialPrefetching rollout](../backoffice-nav-performance/p2-01b-partial-prefetching-rollout.plan.md) | ✅ **done** | **Có** thứ để test — §4 |
| [`p2-03` cổng quyết định Instant Navigation](../backoffice-nav-performance/p2-03-instant-navigation-spike.plan.md) | ✅ done → **HOÃN `p3-01`** | — |
| [`p3-01` Cache Components hot routes](../backoffice-nav-performance/p3-01-cache-components-hot-routes.plan.md) | 📦 **deferred** | `instant()` cho hot route: **chưa có gì để test** |

`next.config.ts` xác nhận: `instantInsights: { validationLevel: "manual-warning" }` — tức
auto-validate **đã bị hạ xuống thủ công** có chủ đích (giảm nhiễu overlay khi pilot `cacheComponents`).
Chỉ `/guides` dùng `'use cache'`.

→ **Phase này KHÔNG dùng `instant()` làm trọng tâm.** Cài `@next/playwright` (p0-01) vẫn đúng để
chuẩn bị, nhưng dùng ở §5 dưới dạng **1 test thăm dò trên `/guides`**, không phải bộ test chính.

## 2. Test chống tái phát "load liên tục" — giá trị cao nhất của phase

[`p0-01`](../backoffice-nav-performance/p0-01-fix-prefetch-loop-root-cause.plan.md) ghi lại **sự cố
thật 04/09/2026**: `staleTimes.dynamic` default = 0s (Next 15+) → payload hết hạn ngay khi cache →
hover-prefetch tạo request storm. Sửa bằng `next.config.ts`:

```typescript
staleTimes: { dynamic: 1800, static: 1800 },
```

**Một dòng config. Không có test nào bảo vệ.** Ai xoá/hạ nó về 0 sẽ tái tạo sự cố, và triệu chứng
("load liên tục") chỉ lộ ra khi staff dùng thật.

E2E bắt được điều này vì nó đo **số request thật**, thứ unit test không thấy:

```typescript
// test/e2e/navigation-regression.spec.ts
import { expect, test } from "@playwright/test";

/**
 * Chống tái phát sự cố "load liên tục" 04/09/2026 (`backoffice-nav-performance/p0-01`).
 *
 * Nguyên nhân gốc: `staleTimes.dynamic` default 0s → mọi payload dynamic hết hạn NGAY sau khi
 * cache → hover lặp lại luôn thấy stale → request storm. Fix là 1 dòng trong `next.config.ts`
 * (`staleTimes: { dynamic: 1800 }`) — KHÔNG có test nào bảo vệ nó trước phase này.
 *
 * Cách đo: hover cùng 1 link N lần, đếm request RSC tới route đó. Có `staleTimes` dương thì
 * lần hover thứ 2..N phải HIT cache → không sinh request mới.
 */
test("hover lặp lại KHÔNG sinh request storm (staleTimes.dynamic > 0)", async ({ page }) => {
  await page.goto("/dashboard");

  // Đếm request RSC (Next gắn `_rsc` query param cho prefetch/navigation payload).
  const rscRequests: string[] = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("_rsc=") && url.includes("/games/keno/operations")) {
      rscRequests.push(url);
    }
  });

  const link = page.getByRole("link", { name: /Keno/ }).first();

  // Hover 5 lần, mỗi lần rời ra rồi vào lại — mô phỏng đúng hành vi gây storm.
  for (let i = 0; i < 5; i++) {
    await link.hover();
    await page.getByRole("heading").first().hover();
  }

  // Ngưỡng: cho phép vài request (prefetch shell + data), nhưng KHÔNG được ~1 request/hover.
  // Con số chính xác PHẢI đo thực tế rồi chốt — xem §2.1.
  expect(rscRequests.length).toBeLessThan(5);
});
```

### 2.1 Chốt ngưỡng bằng ĐO, không bằng đoán

Số request "bình thường" phụ thuộc `partialPrefetching` + `staleTimes` + số link trong sidebar.
Quy trình:

1. Chạy test với `console.log(rscRequests.length)`, ghi số thật ở trạng thái **hiện tại (đã fix)**.
2. Tạm hạ `staleTimes.dynamic` về `0` trong `next.config.ts`, chạy lại → ghi số thật ở trạng thái
   **lỗi**. **Đây là bước bắt buộc** — nó chứng minh test thật sự phân biệt được 2 trạng thái.
3. Đặt ngưỡng ở giữa, nghiêng về phía an toàn. Revert `next.config.ts`.
4. Ghi cả 2 con số vào comment của test, kèm ngày đo.

Nếu bước 2 cho thấy **2 trạng thái không khác nhau đáng kể** → cách đo này không hiệu quả, **bỏ test
này** và ghi lại kết luận. Đừng giữ test không phân biệt được gì.

Bổ trợ (rẻ, nên có): dùng `user-chrome-devtools` `list_network_requests` khi khảo sát tay để thấy
toàn cảnh request trước khi viết assertion.

## 3. Test loading skeleton — chống hồi quy `p0-02`

[`p0-02`](../backoffice-nav-performance/p0-02-loading-skeleton-coverage.plan.md) (✅ done) thêm
`loading.tsx` để mọi route có skeleton thay vì trắng trang. Route mới thêm sau này **rất dễ quên**
`loading.tsx` — không có gì nhắc.

```typescript
/**
 * Mọi route trong nav PHẢI có skeleton khi điều hướng — không được trắng trang.
 *
 * Chống hồi quy `backoffice-nav-performance/p0-02` (✅ done): route thêm mới rất dễ quên
 * `loading.tsx`, và không có lint rule nào bắt được.
 */
test("điều hướng hiện skeleton, không trắng trang", async ({ page }) => {
  await page.goto("/dashboard");

  // Chặn response RSC để giữ trạng thái loading đủ lâu mà quan sát — KHÔNG dùng
  // waitForTimeout đoán mò (race theo tốc độ máy).
  await page.route("**/*_rsc=*", async (route) => {
    await new Promise((r) => setTimeout(r, 2000));
    await route.continue();
  });

  await page.getByRole("link", { name: /Keno/ }).first().click();

  // Skeleton PHẢI xuất hiện. Selector thật cần verify — shadcn `Skeleton` dùng `animate-pulse`,
  // nhưng nên có `role="status"`/`aria-busy` để test theo semantic. Xem §6.
  await expect(page.locator("[data-slot='skeleton'], .animate-pulse").first()).toBeVisible();
});
```

**Cần verify:** component `Skeleton` của shadcn trong app này render attribute gì
(`data-slot="skeleton"` ở shadcn mới, hoặc chỉ class `animate-pulse`). Đọc
`apps/backoffice/src/components/ui/skeleton.tsx` trước khi chốt selector. Nếu không có attribute ổn
định → đây là ca hợp lệ để thêm `data-testid` (theo [p0-03](p0-03-determinism-and-testids.plan.md) §3),
hoặc tốt hơn: thêm `role="status"` + `aria-busy` (vừa test được vừa cải thiện a11y thật).

## 4. Test `typedRoutes` + `nav-registry` — nav không dẫn tới 404

`next.config.ts` bật `typedRoutes: true` (validate **path** lúc build), và
`nav-registry.ts` giữ cấu trúc nav. Nhưng comment trong `next.config.ts` ghi rõ giới hạn:

> *Không thay được cho `nav-registry.ts` (chỉ validate PATH, không validate query string/enum tab)*

→ Có khoảng trống thật: nav item trỏ tới path đúng nhưng **query string sai** (VD `?gate=needs_action`
— chính giá trị đã bị xoá, xem [p1-01](p1-01-ops-hub-e2e.plan.md) §1) thì build vẫn xanh.

```typescript
/**
 * Mọi link trong sidebar PHẢI dẫn tới trang render được (không 404, không error boundary).
 *
 * `typedRoutes: true` chỉ validate PATH lúc build, KHÔNG validate query string/enum tab
 * (`next.config.ts` ghi rõ giới hạn này). Test này phủ đúng khoảng trống đó.
 */
test("mọi link sidebar không dẫn tới 404/error", async ({ page }) => {
  await page.goto("/dashboard");

  const hrefs = await page.getByRole("navigation").getByRole("link").evaluateAll(
    (els) => els.map((el) => (el as HTMLAnchorElement).getAttribute("href")).filter((h): h is string => h !== null),
  );

  expect(hrefs.length).toBeGreaterThan(0); // sidebar không rỗng — nếu rỗng, test dưới vô nghĩa

  for (const href of hrefs) {
    const res = await page.goto(href);
    expect(res?.status(), `${href} trả status lỗi`).toBeLessThan(400);
    await expect(page.getByText(/Đã xảy ra lỗi|Something went wrong/i), `${href} render error boundary`).toHaveCount(0);
  }
});
```

**Cân nhắc chi phí:** 84 route × cold compile Turbopack có thể rất chậm. Nếu quá chậm, thu hẹp còn
route của Keno + Bingo18, hoặc tách thành test riêng chỉ chạy khi sửa nav (`@nav` tag +
`--grep @nav`). Ghi lại quyết định kèm thời gian đo.

## 5. `instant()` — 1 test thăm dò trên `/guides`, không hơn

`/guides` là **route duy nhất** dùng `'use cache'` (theo comment `next.config.ts`). Đây là chỗ duy
nhất `instant()` có nghĩa hiện tại.

```typescript
import { instant } from "@next/playwright";

/**
 * THĂM DÒ (không phải gate): `/guides` là route duy nhất dùng `'use cache'` (`next.config.ts`).
 *
 * Instant Navigation cho hot route đang HOÃN (`backoffice-nav-performance/p3-01` deferred, cổng
 * `p2-03`) → chưa có gì để khoá. Test này chỉ để: (a) xác nhận `@next/playwright` hoạt động với
 * setup của repo; (b) sẵn hạ tầng nếu `p3-01` được mở lại.
 *
 * Nếu nó flaky hoặc không chạy được, `test.fixme()` và ghi lý do — KHÔNG chặn phase này.
 */
test("[thăm dò] /guides có phần UI khả dụng ngay khi điều hướng", async ({ page, baseURL }) => {
  await page.goto("/dashboard");

  await instant(page, async () => {
    await page.getByRole("link", { name: /Hướng dẫn|Guides/i }).first().click();
    await page.waitForURL((url) => url.pathname.startsWith("/guides"));
    // Phần đã `'use cache'` phải có mặt NGAY. Selector cần verify (§6).
  }, { baseURL });
});
```

**Lưu ý cho tương lai (không làm bây giờ):** `instant()` trên **production build** cần
`experimental.exposeTestingApiInProductionBuild: true`. Config hiện **không có** — đúng, vì
[p0-01](p0-01-playwright-foundation.plan.md) §2 chọn `next dev` (testing API bật sẵn ở dev). Chỉ
thêm option đó nếu `p2-02` quyết chạy E2E trên prod build.

## 6. Verify selector bằng MCP trước khi commit

Cả 4 nhóm test trên đều có selector **chưa verify**: tên link sidebar, attribute skeleton, text error
boundary, link `/guides`. Theo [p0-04](p0-04-mcp-toolchain.plan.md) §3.3:

```
1. get_routes                → danh sách route thật (đối chiếu href sidebar ở §4)
2. browser_navigate /dashboard + browser_snapshot
                             → tên accessible thật của link sidebar; có role="navigation"?
3. Đọc src/components/ui/skeleton.tsx → attribute thật của Skeleton (§3)
4. get_errors                → trang có lỗi ẩn nào không
```

## Verify

1. `pnpm --filter @megawin/backoffice test:e2e navigation-regression` → xanh.
2. **§2.1 đã thực hiện đầy đủ**: có 2 con số đo (đã-fix / hạ-`staleTimes`-về-0) ghi trong comment
   test, kèm ngày. Không có 2 số này thì test §2 **chưa được chốt**.
3. Test §3: tạm xoá 1 `loading.tsx` → test PHẢI đỏ. Revert.
4. Test §4: đo thời gian chạy, ghi vào plan. Nếu > 3 phút, áp dụng phương án thu hẹp ở §4.
5. `--repeat-each=3` xanh cả 3 (test có `page.on("request")` và mock delay dễ flaky — phải chứng minh).
6. `oxlint` + `prettier --write`.

## Không làm

- Không coi `instant()` là trọng tâm — Instant Navigation chưa ship (§1).
- Không thêm `exposeTestingApiInProductionBuild` vào `next.config.ts` ở phase này (§5).
- Không bật `p3-01` của `backoffice-nav-performance` — nó đã bị hoãn qua cổng `p2-03`, quyết định đó
  không thuộc plan này.
- Không giữ test §2 nếu bước §2.1 chứng minh nó không phân biệt được trạng thái lỗi/đúng.
- Không dùng `waitForTimeout` để "chờ skeleton" — dùng route delay có kiểm soát (§3).
- Không sửa `next.config.ts` để test dễ hơn.
