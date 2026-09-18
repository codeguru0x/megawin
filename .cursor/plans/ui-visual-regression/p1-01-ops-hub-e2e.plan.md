# p1-01 — Ops Hub E2E: Keno + Bingo18 (hành vi + screenshot)

Viết bộ test thật đầu tiên. **Khác bản 17/09 ở trọng tâm:** screenshot là *một* assertion, không phải
mục đích. Mỗi tab phải có assertion **hành vi** (lọc đúng dòng, nút action đúng) trước khi chụp —
screenshot một mình không bắt được lỗi logic, mà lỗi logic mới là loại đã xảy ra thật trên trang này.

Phụ thuộc [p0-03](p0-03-determinism-and-testids.plan.md) (clock + fixture + mock đã ổn định).

---

## 1. Hợp đồng URL — nguồn chân lý, và cái bản cũ ghi SAI

Bản 17/09 ghi `?tab=needs_action` với label "Cần xử lý". **Cả param lẫn giá trị đều sai.**

**Param là `gate`**, không phải `tab` — xem
[`use-hub-url-params.ts`](<../../../apps/backoffice/src/app/(main)/games/keno/operations-hub/_lib/use-hub-url-params.ts>)
(`useQueryStates({ gate, sort, dir, focus, span })`, `history: "replace"`, `clearOnDefault: true`).

**Giá trị là 5 id của `HubGateTab`** — xem
[`queue-types.ts`](<../../../apps/backoffice/src/app/(main)/games/bingo18/operations-hub/_lib/sections/queue/queue-types.ts>),
JSDoc ghi rõ đây là *"NGUỒN DUY NHẤT của 5 tab bảng 5A"*:

| `?gate=` | Label (`HUB_GATE_TAB_LABELS`) | Điều kiện dòng (JSDoc `HubGateTab`) |
|---|---|---|
| `pending_open` | **Chờ mở bán** | `gate ∈ {PendingOpen, Halted}` ∪ `stage = NeverOpened` |
| `ended` | **Chờ đóng bán** | `stage = PendingClose` |
| `awaiting_result` | Chưa có KQ | `stage ∈ {AwaitingDraw, AwaitingResult}` |
| `awaiting_settle` | Chờ kết sổ | `stage ∈ {AwaitingSettle, NeedsResettle}` |
| `all` | Tất cả | toàn bộ dòng 5A, không lọc chặng |

**Tab "Cần xử lý" ĐÃ BỊ XOÁ** (p1-08 §7). Lý do ghi trong `queue-types.ts` — và nó chính là ví dụ
hoàn hảo cho việc vì sao phase này phải test hành vi:

> *tab cũ gộp `health≠ok` ∪ `stage∈{AwaitingSettle,NeedsResettle,NeverOpened}` ∪
> `gate∈{PendingOpen,Halted}` ∪ `alertsCritical>0` — 4 điều kiện KHÔNG cùng action (1 dòng cần "Mở
> bán", dòng khác cần "Kết sổ lại"), chọn nhiều dòng trong tab này rồi bấm bulk RẤT DỄ áp sai action.*

Bug đó **screenshot không bắt được** (trang vẫn đẹp, vẫn render đúng pixel). Chỉ assertion hành vi
"tab X chỉ chứa dòng có action Y" mới bắt được.

**Đọc `HUB_GATE_TAB_LABELS` từ code, KHÔNG hardcode label trong test:**

```typescript
// ĐÚNG — import từ nguồn chân lý; đổi label ở code, test tự theo
import { HUB_GATE_TAB_LABELS, HUB_GATE_TAB_ORDER } from "@/app/(main)/games/keno/operations-hub/_lib/sections/queue/queue-types";
```

Nếu alias `@/` không resolve trong Playwright context (khác `tsconfig` runtime của Next), khai lại
**một** hằng trong `test/e2e/support/` và ghi comment trỏ về file gốc — nhưng ưu tiên import thật.
Hardcode rải trong từng spec là cách bản cũ đã sai.

## 2. Cấu trúc file

```
apps/backoffice/test/e2e/
├── support/
│   ├── global-setup.ts          (p0-02)
│   ├── freeze-clock.ts          (p0-03)
│   ├── mock-hub-snapshot.ts     (p0-03)
│   └── hub-fixtures.ts          (p0-03 — test.extend)
├── fixtures/
│   ├── keno-hub-snapshot.fixture.json
│   └── bingo18-hub-snapshot.fixture.json
├── smoke.spec.ts                (p0-01)
├── auth-guard.spec.ts           (p0-02)
├── ops-hub-behaviour.spec.ts    ← §3 — assertion hành vi, KHÔNG screenshot
└── ops-hub-visual.spec.ts       ← §4 — screenshot 5 tab × 2 game
```

**Tách 2 file có chủ đích:** test hành vi chạy nhanh, không cần baseline, không bao giờ cần
`--update-snapshots`. Test visual cần baseline và có quy trình review riêng
([p1-03](p1-03-review-workflow-and-guardrail.plan.md)). Gộp 1 file thì mỗi lần sửa label lại phải
duyệt cả ảnh — ma sát vô ích.

## 3. `ops-hub-behaviour.spec.ts` — phần bản cũ KHÔNG có

```typescript
import { HUB_GATE_TAB_LABELS, HUB_GATE_TAB_ORDER } from "…/queue-types";

import { expect, test } from "./support/hub-fixtures";

const GAMES = ["keno", "bingo18"] as const;

for (const game of GAMES) {
  test.describe(`${game} Ops Hub — hành vi`, () => {
    /**
     * 5 tab PHẢI hiện đúng label của `HUB_GATE_TAB_LABELS`, đúng thứ tự `HUB_GATE_TAB_ORDER`.
     *
     * Bắt được regression thật: `nav-registry.ts` khai `HUB_GATE_TABS` riêng và PHẢI khớp
     * `queue-types.ts` (JSDoc cảnh báo "tránh 2 mảng lệch nhau"). Test này là ràng buộc runtime
     * cho lời cảnh báo đó — compiler không kiểm được vì 2 mảng ở 2 file.
     */
    test("5 tab đúng label và đúng thứ tự", async ({ page, opsHub }) => {
      await opsHub(game);

      const tabs = page.getByRole("tab");
      await expect(tabs).toHaveCount(HUB_GATE_TAB_ORDER.length);
      await expect(tabs).toHaveText(HUB_GATE_TAB_ORDER.map((t) => HUB_GATE_TAB_LABELS[t]));
    });

    /**
     * `?gate=` trên URL PHẢI chọn đúng tab khi load trực tiếp (deep link).
     *
     * Đây là hợp đồng chia sẻ link giữa staff ("xem tab Chờ kết sổ này") — vỡ là mất tính năng,
     * nhưng screenshot của tab mặc định vẫn xanh nên không ai biết.
     */
    for (const gate of HUB_GATE_TAB_ORDER) {
      test(`deep link ?gate=${gate} chọn đúng tab`, async ({ page, opsHub }) => {
        await opsHub(game, gate);

        await expect(page.getByRole("tab", { name: HUB_GATE_TAB_LABELS[gate], selected: true })).toBeVisible();
      });
    }

    /**
     * Click tab PHẢI ghi `?gate=` vào URL (nuqs `history: "replace"`, `clearOnDefault: true`).
     *
     * `clearOnDefault` nghĩa là tab MẶC ĐỊNH sẽ KHÔNG có param — assertion phải tính tới điều đó,
     * đừng kỳ vọng mọi tab đều xuất hiện trên URL.
     */
    test("click tab đồng bộ vào URL", async ({ page, opsHub }) => {
      await opsHub(game);

      await page.getByRole("tab", { name: HUB_GATE_TAB_LABELS.awaiting_settle }).click();
      await expect(page).toHaveURL(/[?&]gate=awaiting_settle/);
    });

    /**
     * Mỗi tab chỉ chứa dòng có ĐÚNG 1 loại action — bất biến cốt lõi của thiết kế 5 tab
     * (`queue-types.ts` §header: lý do xoá tab "Cần xử lý"). Nếu bất biến này vỡ, bulk action
     * áp sai lên dòng — bug tiền thật, không phải bug hiển thị.
     */
    test("tab Chờ mở bán chỉ có action mở bán", async ({ page, opsHub }) => {
      await opsHub(game, "pending_open");

      // Tên nút thật PHẢI đọc từ `getNextAction`/`OPS_STAGE_LABEL` — xem §5 trước khi chốt.
      const rows = page.getByRole("row");
      await expect(rows).not.toHaveCount(0); // fixture phải có dòng ở tab này (p0-03 §5)
    });
  });
}
```

**Ba assertion cuối là phác thảo** — tên nút/cấu trúc dòng chưa verify. Bắt buộc chạy bước §5 trước
khi viết bản cuối. KHÔNG commit assertion đoán.

## 4. `ops-hub-visual.spec.ts` — screenshot

```typescript
import { HUB_GATE_TAB_LABELS, HUB_GATE_TAB_ORDER } from "…/queue-types";

import { expect, test } from "./support/hub-fixtures";

const GAMES = ["keno", "bingo18"] as const;

for (const game of GAMES) {
  test.describe(`${game} Ops Hub — visual`, () => {
    for (const gate of HUB_GATE_TAB_ORDER) {
      test(`tab ${HUB_GATE_TAB_LABELS[gate]}`, async ({ page, opsHub }) => {
        await opsHub(game, gate);

        // Chờ NỘI DUNG, không chờ networkidle (p0-03 §7 — poll khiến network không bao giờ idle).
        await expect(page.getByRole("tab", { name: HUB_GATE_TAB_LABELS[gate], selected: true })).toBeVisible();
        await expect(page.getByRole("table")).toBeVisible();
        // Chứng minh mock ĐÃ ăn — nếu route glob sai, dòng này fail thay vì chụp baseline sai.
        await expect(page.getByText("2999-01-15.001")).toBeVisible();

        await expect(page).toHaveScreenshot(`${game}-hub-${gate}.png`, { fullPage: true });
      });
    }
  });
}
```

10 baseline (`2 game × 5 tab`). Đặt tên `{game}-hub-{gate}.png` — đọc tên file biết ngay đang xem gì
khi review diff.

**`fullPage: true` có đánh đổi:** trang Ops Hub dài (Zone 1→5B), ảnh full-page lớn và **1 pixel lệch
ở Zone 1 làm đỏ cả ảnh** → review phải mở diff mới biết đổi ở đâu. Nếu thực tế thấy noise cao, đổi
sang chụp **theo zone** dùng `data-testid="hub-zone-*"` (đã dự trù ở
[p0-03](p0-03-determinism-and-testids.plan.md) §3):

```typescript
// Phương án zone — diff khu trú, dễ review hơn. Cân nhắc sau khi có số liệu thật.
await expect(page.getByTestId("hub-zone-queue")).toHaveScreenshot(`${game}-hub-${gate}-queue.png`);
```

Chọn `fullPage` trước vì nó bắt được cả lỗi layout **giữa** các zone (VD zone chồng nhau) mà chụp
từng zone bỏ qua. Ghi lại quyết định nếu đổi.

## 5. BẮT BUỘC làm trước khi commit — verify selector bằng MCP

Đây là bước bản cũ bỏ qua và **đã dẫn tới ghi sai `gate`**. Quy trình
[p0-04](p0-04-mcp-toolchain.plan.md) §3.3:

```
1. get_routes                  → xác nhận /games/{keno,bingo18}/operations-hub tồn tại
2. compile_route               → 2 route compile sạch
3. dev server + browser_navigate "/games/keno/operations-hub?gate=pending_open"
4. browser_snapshot            → lấy a11y tree:
   - tab có role="tab" thật không? accessible name khớp HUB_GATE_TAB_LABELS?
   - bảng có role="table" / role="row"?
   - nút action tên chính xác là gì ("Mở bán"? "Mở bán ngay"?)
5. get_errors                  → trang có hydration/runtime error đang ẩn?
```

Bước 5 quan trọng: nếu đang có hydration error, baseline sẽ **hợp lệ hoá trạng thái lỗi**.

## 6. Sửa bug TRƯỚC khi chốt baseline

Nguyên tắc từ bản cũ, **giữ nguyên vì đúng**: baseline chụp trên UI đang lỗi sẽ **khoá cứng cái lỗi
đó** thành "trạng thái đúng" — mọi lần sửa sau sẽ bị test báo đỏ, người sửa dễ kết luận ngược.

Kiểm tra [`ui-review-2026-09-07.md`](../keno-bingo18-ops-hub/ui-review-2026-09-07.md) và các bug đã
biết của Ops Hub. Với mỗi bug: **sửa xong** → mới `--update-snapshots`. Nếu chưa sửa được, `test.fixme()`
kèm comment trỏ tới issue/plan — KHÔNG chụp baseline rồi tính sửa sau.

## Verify

1. `pnpm --filter @megawin/backoffice test:e2e ops-hub-behaviour` → xanh. Đây là phần **không** cần
   baseline, phải xanh trước.
2. `pnpm --filter @megawin/backoffice test:e2e ops-hub-visual` lần 1 → sinh 10 baseline.
3. **Mở từng ảnh bằng mắt** trước khi commit — xác nhận: có dữ liệu fixture (không phải skeleton /
   empty state / trang login), tab đúng đang active, không có vùng loading.
4. Chạy lại → xanh. Rồi `--repeat-each=3` → xanh cả 3.
5. Test chống hồi quy của chính test: tạm đổi 1 label trong `HUB_GATE_TAB_LABELS` → behaviour spec
   PHẢI đỏ. Revert. (Chứng minh test thật sự assert, không phải luôn xanh.)
6. `oxlint apps/backoffice/test/e2e` + `prettier --write` — theo
   [`oxlint-lint-conventions.mdc`](../../rules/oxlint-lint-conventions.mdc) §g.
7. Commit baseline (`*-snapshots/`) **cùng PR** với spec.

## Không làm

- Không hardcode label tiếng Việt rải trong spec — import từ `queue-types.ts` (§1).
- Không dùng `?tab=` hay giá trị `needs_action` (§1 — không tồn tại).
- Không `waitForLoadState("networkidle")` (p0-03 §7).
- Không chụp baseline khi UI đang có bug đã biết (§6).
- Không mở rộng sang 5 game còn lại (đó là `p2-02`) — 5 game kia **không có** trang `operations-hub`
  (chỉ Keno + Bingo18 có route và API `hub-snapshot`).
- Không test bulk action thật (gọi API mutation) ở phase này — cần seed data thật, thuộc `p2-02` §2.
