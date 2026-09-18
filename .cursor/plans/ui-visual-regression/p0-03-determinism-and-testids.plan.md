# p0-03 — Determinism: `page.clock`, tắt poll, `data-testid` có chọn lọc

Ops Hub là trang **động nhất** của backoffice: đồng hồ tick 1s, poll 10s, mọi phân loại trạng thái
dẫn xuất từ `now`. Chụp screenshot mà không xử lý 3 nguồn này thì test **flaky 100%**, không phải
"có thể flaky".

Bản plan 17/09 chỉ đề xuất `mask` một `data-testid="live-countdown"` — không đủ (đồng hồ nằm trên
**mọi dòng** bảng, và app có **0 `data-testid`**). Phase này thay cách tiếp cận: **đóng băng thời
gian** thay vì che vùng động.

Phụ thuộc [p0-02](p0-02-auth-storage-state.plan.md).

---

## 1. Ba nguồn bất định (đã verify trên code)

### 1.1 `setInterval(1000)` ghi thẳng vào DOM — bypass React

[`_lib/interval-registry.ts`](<../../../apps/backoffice/src/app/(main)/games/keno/operations-hub/_lib/interval-registry.ts>)
gom **đúng 1** `setInterval(tick, 1000)` cho toàn trang (thiết kế có chủ đích: 200 dòng × 1 timer =
200 timer). [`relative-duration.tsx`](<../../../apps/backoffice/src/app/(main)/games/keno/operations-hub/_lib/relative-duration.tsx>)
ghi `el.textContent` qua ref, **không re-render React**:

```typescript
// relative-duration.tsx — nguyên văn ý tưởng
useEffect(() => {
  const el = spanRef.current;
  return registerCounter(el, sinceMs, format);   // → interval-registry ghi textContent mỗi 1s
}, [sinceMs, format]);
```

→ `"treo 47ph12s"` sau 1 giây thành `"treo 47ph13s"`. **Mọi dòng bảng đều có**. `mask` không giải
quyết được: mask hết = che mất chính thứ cần test.

### 1.2 Clock offset neo vào `Date.now()` thật

[`use-hub-context.tsx:181-187`](<../../../apps/backoffice/src/app/(main)/games/keno/operations-hub/_lib/use-hub-context.tsx>):

```typescript
const serverNowIso = query.data?.serverNow;
if (serverNowIso !== undefined && serverNowIso !== lastServerNowRef.current) {
  lastServerNowRef.current = serverNowIso;
  clockOffsetMsRef.current = Date.parse(serverNowIso) - Date.now();
}
const getNowMs = useCallback((): number => Date.now() + clockOffsetMsRef.current, []);
```

`OpsHubSnapshotOutput.serverNow` là field **bắt buộc** (xem
[`hub-snapshot.dto.ts:131-147`](../../../packages/game-keno-application/src/use-cases/operations/dto/hub-snapshot.dto.ts) —
JSDoc ghi rõ: *"BẮT BUỘC dùng thay `Date.now()` của client... Laptop staff lệch giờ 5 phút sẽ phân
loại SAI cả trang"*).

**Đây vừa là rủi ro vừa là đòn bẩy:** nếu fixture cố định `serverNow` **và** `page.clock` cố định
`Date.now()`, thì `clockOffsetMs` trở thành **hằng số xác định** → mọi `SaleGate`/`OpsStage`/
`StageHealth`/thời lượng đều deterministic. Không cần mask gì cả.

### 1.3 React Query poll mỗi `pollSeconds`

[`use-hub-query.ts`](<../../../apps/backoffice/src/app/(main)/games/keno/operations-hub/_lib/use-hub-query.ts>):
`refetchInterval` = `data?.pollSeconds ?? DEFAULT_POLL_SECONDS (10)`, `refetchOnWindowFocus: true`.

Với `page.clock` đã đóng băng, timer của React Query cũng đóng băng → **không refetch**. Đây là hệ
quả phụ có lợi, nhưng vẫn giữ `page.route()` để test không phụ thuộc DB/Atlas.

## 2. Giải pháp: `page.clock` — đóng băng thay vì che

Playwright `page.clock` (ổn định từ 1.45; app dùng `^1.63.0`) cài fake timer trước khi trang load.

```typescript
// test/e2e/support/freeze-clock.ts
import type { Page } from "@playwright/test";

/**
 * Mốc thời gian CỐ ĐỊNH cho mọi E2E Ops Hub.
 *
 * Phải khớp `serverNow` trong fixture (xem `fixtures/*.fixture.json`) — cặp giá trị này quyết
 * định `clockOffsetMs` trong `use-hub-context.tsx`, từ đó quyết định MỌI phân loại
 * `SaleGate`/`OpsStage`/`StageHealth` và mọi thời lượng hiển thị. Lệch 1 trong 2 = baseline vô nghĩa.
 *
 * Chọn giờ trong ngày có nghiệp vụ THẬT: 14:30 ICT là giữa phiên Keno (06:08–21:52) → có đủ kỳ ở
 * mọi chặng. Chọn 03:00 thì mọi kỳ đều "chưa mở bán", test không cover được gì.
 */
export const FROZEN_NOW_ISO = "2026-01-15T07:30:00.000Z"; // = 14:30 Asia/Ho_Chi_Minh

/**
 * Đóng băng đồng hồ trang. PHẢI gọi TRƯỚC `page.goto()`.
 *
 * `setFixedTime` (không phải `install` + `pauseAt`): `Date.now()`/`new Date()` luôn trả đúng 1 giá
 * trị, nhưng `setTimeout`/`setInterval` VẪN CHẠY. Đây là lựa chọn có chủ đích cho Ops Hub:
 * - `interval-registry.ts` tick mỗi 1s → vẫn tick, nhưng mỗi tick đọc `Date.now()` bất biến nên
 *   `textContent` ghi lại ĐÚNG CÙNG chuỗi → DOM ổn định, KHÔNG cần mask.
 * - React Query `refetchInterval` vẫn chạy → nhưng `page.route()` trả cùng fixture → cùng UI.
 * - React transition/effect vẫn hoàn tất bình thường (khác `install()` — pause timer hoàn toàn,
 *   dễ làm skeleton treo vĩnh viễn nếu component chờ `setTimeout`).
 */
export async function freezeClock(page: Page): Promise<void> {
  await page.clock.setFixedTime(new Date(FROZEN_NOW_ISO));
}
```

**Vì sao `setFixedTime` mà không `install()` + `pauseAt()`:** `install()` treo cả `setTimeout` —
Radix/shadcn animation, `sonner` toast, và React `startTransition` có thể chờ timer để hoàn tất
→ nguy cơ UI treo giữa trạng thái. `setFixedTime` chỉ khoá **giá trị thời gian**, giữ timer chạy →
DOM hội tụ về trạng thái ổn định rồi đứng yên. Nếu thực nghiệm cho thấy `setFixedTime` chưa đủ ổn
định, thử `install({ time })` + `page.clock.runFor(...)` — **ghi lại kết quả đo vào plan này**, không
đổi âm thầm.

## 3. `data-testid` — thêm CÓ CHỌN LỌC, không rải bừa

App hiện có **0 `data-testid`** (`grep -rn "data-testid" apps/backoffice/src` → 0 match). Nguyên tắc:

> **Ưu tiên `getByRole`/`getByText`. Chỉ thêm `data-testid` khi KHÔNG có selector semantic ổn định.**

Lý do không rải bừa: `getByRole("tab", { name: "Chờ mở bán" })` **đồng thời test luôn a11y** — nếu
tab không có `role="tab"` hoặc mất accessible name thì test fail, đó là bug thật. `data-testid` bỏ
qua lớp đó.

| Vùng | Selector dùng | Cần `data-testid`? |
|---|---|---|
| 5 tab bảng 5A | `getByRole("tab", { name: HUB_GATE_TAB_LABELS[...] })` | ❌ |
| Nút action ("Mở bán", "Đóng bán", "Kết sổ") | `getByRole("button", { name: ... })` | ❌ |
| Bảng 5A | `getByRole("table")` / `getByRole("row")` | ❌ |
| KPI card (label + value, không role riêng) | — | ✅ `data-testid="kpi-<key>"` |
| Vùng zone để scope screenshot (Zone 4 banner, Zone 5A) | — | ✅ `data-testid="hub-zone-queue"` |

Quy ước tên: **kebab-case, tiền tố theo vùng** (`hub-zone-*`, `kpi-*`). Đặt trên phần tử **bao ngoài
cùng** của vùng, không trên từng leaf node.

Ràng buộc bổ sung khi thêm vào code production:
- KHÔNG đổi cấu trúc DOM/class chỉ để test dễ hơn (sẽ làm vỡ baseline và vi phạm
  [`frontend-dev.mdc`](../../rules/frontend-dev.mdc) §1.9 "No Surprise Changes").
- Thêm `data-testid` là thay đổi file production → PR phải nêu rõ lý do từng chỗ.

## 4. Mock HTTP — `page.route()` chặn `hub-snapshot`

> **Không dùng `next/experimental/testmode` / `@next/playwright`.** Repo không import testmode
> (0 match); `next@16.3.5` cũng không export path đó. p0-01 đã gỡ peer `@playwright/test` khỏi
> `next` bằng override — kéo lại `@next/playwright` sẽ tái kích lệch instance. Mock chỉ làm
> browser-side qua `page.route()`.

Ops Hub có **đúng 1 query duy nhất** cho toàn trang (`use-hub-query.ts` JSDoc: *"Query DUY NHẤT của
trang Ops Hub — mọi zone `select` slice từ đây"*) → chỉ cần chặn 1 endpoint.

```typescript
// test/e2e/support/mock-hub-snapshot.ts
import type { Page } from "@playwright/test";

/** Game có Ops Hub. Chỉ Keno + Bingo18 tồn tại (xác nhận: `src/app/api/*/operations/hub-snapshot/`). */
export type OpsHubGame = "keno" | "bingo18";

/**
 * Chặn `GET {baseURL}/api/{game}/operations/hub-snapshot`, trả fixture tĩnh — KHÔNG chạm route
 * handler thật / Mongo / Atlas.
 *
 * Glob dùng `**\/api/...` (không phải path tương đối) vì `apiClient` build URL TUYỆT ĐỐI từ
 * `NEXT_PUBLIC_SITE_URL` (`packages/next/src/client/api-client.ts`) — pattern tương đối sẽ không khớp.
 *
 * Route handler thật bọc response trong envelope của `withApi()`; `apiClient.get()` unwrap `data`.
 * Vì vậy fixture PHẢI là shape ĐÃ BỌC, không phải raw `OpsHubSnapshotOutput` — xem §5.
 */
export async function mockOpsHubSnapshot(page: Page, game: OpsHubGame, fixture: unknown): Promise<void> {
  await page.route(`**/api/${game}/operations/hub-snapshot**`, async (route) => {
    await route.fulfill({ json: fixture });
  });
}
```

**⚠️ Phải xác nhận shape envelope trước khi viết fixture.** Đọc
[`packages/next/src/server/response.ts`](../../../packages/next/src/server/response.ts) (`apiSuccess`)
và `apiClient.get()` để biết chính xác `{ success, data }` hay shape khác. Bản plan cũ giả định
`route.fulfill({ json: fixture })` với raw DTO — **nếu envelope có thật thì `data` sẽ là `undefined`**
và trang render empty state, test vẫn "pass" ở baseline đầu.

Cách rẻ nhất để lấy shape đúng: chạy dev server, mở DevTools Network (hoặc
`user-chrome-devtools` `list_network_requests` + `get_network_request`), copy response thật.

## 5. Fixture — `test/e2e/fixtures/keno-hub-snapshot.fixture.json`

Lấy **1 lần** response thật từ dev, rồi **sửa tay** để cố định mọi thứ đổi theo thời gian:

| Field | Sửa thành | Vì sao |
|---|---|---|
| `serverNow` | **`FROZEN_NOW_ISO`** (§2) | Cặp với `page.clock`. Lệch = mọi phân loại lệch |
| `rows[].drawId` | `"2999-01-15.001"`… | Sentinel theo [`test-data-safety.mdc`](../../rules/test-data-safety.mdc) §1 — không lẫn data thật |
| `rows[].drawTime`, `closeAt` | Offset **cố định** so với `FROZEN_NOW_ISO` | Cần đủ kỳ ở mọi `SaleGate`/`OpsStage` để 5 tab đều có dòng |
| Tiền / exposure | Số tròn dễ nhận (`12345600`) | Review diff đọc được ngay, không nhìn giống data thật |
| `pollSeconds` | Giữ giá trị thật (VD `10`) | Không cần đổi — clock đã đóng băng |
| `truncated` | `false` | `true` sẽ render banner destructive (test riêng nếu cần) |
| `thresholds`, `drawIntervalMinutes`, `salesCloseBeforeSeconds` | Giữ thật (Keno: 8 / 60) | FE dùng để tô màu + dựng trục; đổi = UI khác thật |

**Yêu cầu quan trọng — fixture phải có dòng cho CẢ 5 `gate`:** nếu fixture chỉ có kỳ `ended` thì 4
tab còn lại render empty state, và baseline của chúng **không chứng minh được gì**. Thiết kế
`drawTime`/`closeAt` sao cho mỗi tab có ≥ 1 dòng (đối chiếu định nghĩa từng tab trong
[`queue-types.ts`](<../../../apps/backoffice/src/app/(main)/games/bingo18/operations-hub/_lib/sections/queue/queue-types.ts>)
JSDoc của `HubGateTab`).

Tương tự cho `bingo18-hub-snapshot.fixture.json` (Bingo18: `drawIntervalMinutes` 6,
`salesCloseBeforeSeconds` 30) — **đọc DTO của Bingo18 trước**, không copy y nguyên Keno.

## 6. Fixture Playwright gộp — 1 nơi setup

Gom `freezeClock` + `mockOpsHubSnapshot` thành fixture để mọi spec không lặp `beforeEach`:

```typescript
// test/e2e/support/hub-fixtures.ts
import { test as base } from "@playwright/test";

import bingo18Fixture from "../fixtures/bingo18-hub-snapshot.fixture.json" with { type: "json" };
import kenoFixture from "../fixtures/keno-hub-snapshot.fixture.json" with { type: "json" };
import { freezeClock } from "./freeze-clock";
import { mockOpsHubSnapshot, type OpsHubGame } from "./mock-hub-snapshot";

const FIXTURES: Record<OpsHubGame, unknown> = { keno: kenoFixture, bingo18: bingo18Fixture };

/**
 * Fixture `opsHub(game)` — đóng băng clock + mock snapshot theo ĐÚNG thứ tự, rồi goto.
 *
 * Thứ tự BẮT BUỘC: clock → route → goto. Đảo bất kỳ cặp nào là mất tác dụng:
 * `page.clock` phải cài trước khi script trang chạy; `page.route` phải đăng ký trước request đầu.
 */
export const test = base.extend<{ opsHub: (game: OpsHubGame, gate?: string) => Promise<void> }>({
  opsHub: async ({ page }, use) => {
    await use(async (game, gate) => {
      await freezeClock(page);
      await mockOpsHubSnapshot(page, game, FIXTURES[game]);
      const query = gate === undefined ? "" : `?gate=${gate}`;
      await page.goto(`/games/${game}/operations-hub${query}`);
    });
  },
});

export { expect } from "@playwright/test";
```

`with { type: "json" }` là import attribute chuẩn — kiểm tra `tsconfig` của app có
`resolveJsonModule` / hỗ trợ attribute; nếu không, đọc file bằng `readFileSync` trong support helper
thay vì đổi `tsconfig` production.

## 7. Chờ trạng thái ổn định — KHÔNG `networkidle`

Bản plan cũ dùng `page.waitForLoadState("networkidle")`. Sai với trang này:
`refetchInterval` + `refetchIntervalInBackground: false` khiến network **không bao giờ idle** theo
định nghĩa Playwright (và chính docs Playwright khuyến nghị không dùng `networkidle`).

Thay bằng **web-first assertion trên nội dung thật**:

```typescript
// ĐÚNG — chờ dữ liệu fixture xuất hiện, không chờ network
await expect(page.getByRole("table")).toBeVisible();
await expect(page.getByRole("row")).not.toHaveCount(0);   // hết skeleton, có dòng thật
await expect(page.getByText("2999-01-15.001")).toBeVisible(); // đúng fixture, không phải data khác
```

Dòng thứ 3 quan trọng: nó chứng minh **mock đã ăn**. Nếu `page.route` không khớp glob (§4), trang
sẽ render data thật hoặc empty — assertion này bắt ngay, thay vì chụp baseline sai.

## Verify

1. **Đo lại flakiness** — bằng chứng duy nhất chấp nhận được cho phase này:
   ```bash
   pnpm --filter @megawin/backoffice test:e2e --repeat-each=5
   ```
   PHẢI xanh cả 5 lần. `--repeat-each` là công cụ đúng để chứng minh determinism.
2. Test tạm (xoá sau khi verify): chụp 2 screenshot cùng trang cách nhau 3 giây thật
   (`await page.waitForTimeout(3000)` giữa 2 lần) → **phải giống hệt**. Nếu khác → clock chưa khoá
   hết, tìm nguồn còn lại trước khi sang `p1-01`.
3. Xác nhận mock ăn: tạm đổi `serverNow` trong fixture → UI phải đổi theo (chứng minh trang đọc
   fixture, không đọc DB).
4. `grep -rn "data-testid" apps/backoffice/src` → chỉ thấy đúng các chỗ đã liệt kê ở §3, không hơn.
5. `oxlint` + `prettier --write` file mới; `pnpm --filter @megawin/backoffice check-types` xanh.

## Không làm

- Không dùng `waitForLoadState("networkidle")` (§7).
- Không `mask` tràn lan để che vùng động — đóng băng clock là cách đúng; `mask` chỉ là phương án
  cuối cho phần tử thật sự không khoá được, và phải ghi rõ lý do tại chỗ.
- Không thêm `data-testid` cho phần tử đã có role/label ổn định (§3).
- Không sửa `interval-registry.ts` / `use-hub-query.ts` để "test dễ hơn" — đó là code production đã
  được tối ưu có chủ đích (1 timer/trang, poll theo server config). Test phải thích ứng, không ngược lại.
- Không tăng `maxDiffPixelRatio` để làm xanh test flaky — sửa nguyên nhân.
- Không viết spec thật cho 5 tab ở phase này (đó là `p1-01`).
