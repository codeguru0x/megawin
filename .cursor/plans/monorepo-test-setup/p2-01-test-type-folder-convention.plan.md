# p2-01 — Convention thư mục test theo loại: `unit/` `integration/` `e2e/`

> Quyết định mới, chốt 17/09/2026 — SUPERSEDE cách tổ chức `test/` phẳng đã dùng ở
> [p0-01](p0-01-vitest-config-centralize.plan.md)..[p1-02](p1-02-group-d-workers.plan.md). Không
> rewrite các phase đó (record lịch sử), chỉ bổ sung phase này lên trên.

Mọi package/app trong monorepo hiện gom **tất cả** loại test vào 1 thư mục `test/` phẳng, phân
biệt loại chỉ ở tầng preset Vitest (`nodeConfig`/`integrationConfig`/`jsdomConfig`), KHÔNG phân
biệt ở tầng thư mục. Quyết định mới: mỗi package/app dùng **1 gốc `test/` duy nhất**, chia theo
**subfolder theo loại** — `test/unit/`, `test/integration/`, `test/e2e/` — để nhìn tên thư mục biết
ngay chi phí chạy (unit: tức thì, không I/O; integration: cần Docker; e2e: cần browser + dev
server).

## Bằng chứng — cách tổ chức hiện tại đang trộn lẫn 2 loại chi phí rất khác nhau

Khảo sát trực tiếp (không suy diễn) một số package "Nhóm B" (application/infra, đang gán
`integrationConfig`):

| Package | File test PHẲNG hiện có | Loại thật (đọc code) |
|---|---|---|
| `tenant-gateway` | `test/tx-log-classifier.test.ts` | **unit** — test 1 classifier pure, không import Mongo client |
| `tenant-dispatch` | `test/build-dispatch-order.test.ts` | **unit** — build object thuần, không I/O |
| `audit` | `test/audit-cursor-codec.test.ts` | **unit** — encode/decode cursor, pure |
| `game-core-application` | `test/feed-sync-cursor-mapper.test.ts` | **unit** — mapper thuần |
| `identity-application` | `test/use-cases/create-company-account.test.ts` | **integration** — gọi use-case → repo → Mongo thật (qua Testcontainers sau [testcontainers-setup](../testcontainers-setup/00-overview.md)) |
| `game-power655-application` | `test/use-cases/*.test.ts`, `test/infras/*.test.ts` | **integration** — toàn bộ chạm `GameConfigRepository`/Mongo |
| `resultfeed-application` | `test/integration/oxylabs-real.test.ts` | Đã tự phát sinh subfolder `integration/` ad-hoc — **đúng tinh thần convention này**, nhưng chỉ 1 file, phần còn lại (`test/use-cases/`, `test/infras/`) vẫn phẳng và mixed |

→ Cả 5 package "Nhóm B" đang gán `integrationConfig` cho TOÀN BỘ file test, kể cả file `unit` pure
không chạm DB — nghĩa là 1 test thuần (`tx-log-classifier.test.ts`) hiện phải chờ
`globalSetup` (build workspace deps) + (sau migrate) chờ Testcontainers container sẵn sàng, dù bản
thân nó không cần Docker. Tách thư mục cho phép chạy `test:unit` không cần Docker daemon — hữu ích
khi máy dev không có Docker hoặc muốn feedback loop nhanh.

`apps/backoffice/test/` cũng mixed tương tự: `chart-format.test.ts`/`game-labels.test.ts` (pure) và
`ai-chat-navigate-card.test.tsx`/`search-dialog-ask-ai.test.tsx` (component render, cần jsdom) —
cả hai đều "unit" theo nghĩa Vitest (không cần server thật), nhưng khi thêm Playwright
([ui-visual-regression](../ui-visual-regression/00-overview.md)) cần `test/e2e/` tách biệt để
Playwright `testDir` không quét nhầm vào Vitest.

## Convention

```
<package-or-app>/
└── test/
    ├── unit/           — Vitest, pure logic + component render (jsdom nếu UI). KHÔNG DB,
    │                      KHÔNG globalSetup Testcontainers. Chạy được không cần Docker.
    ├── integration/     — Vitest, chạm Mongo/Redis thật qua Testcontainers. CẦN Docker daemon,
    │                      globalSetup start container 1 lần cho cả run (xem
    │                      testcontainers-setup/p0-01).
    └── e2e/              — (chỉ app có UI) Playwright, browser thật + dev server thật. Xem
                            ui-visual-regression/p0-01.
```

### Heuristic phân loại 1 file test đã có (dùng khi migrate)

1. File import trực tiếp Mongo/Redis client, `*Repository`, hoặc use-case gọi xuống repo thật →
   **`integration/`**.
2. File chỉ test pure function/class (mapper, classifier, codec, calculator, validator, entity
   rule) hoặc component render với mock hoàn toàn (không network thật) → **`unit/`**.
3. File dùng `@playwright/test`, mở browser thật → **`e2e/`**.
4. Không chắc → đọc `beforeAll`/`beforeEach` của file: có gọi `getMongoClient()`/`getRedisClient()`
   (trực tiếp hoặc qua repo) → `integration/`; không có → `unit/`.

**Không tự đoán theo tên file** — `oxylabs-real.test.ts` nghe giống integration nhưng gọi API HTTP
thật ra ngoài (Oxylabs), không chạm Mongo/Redis; xác nhận đúng phân loại bằng cách đọc code, không
suy từ tên.

## Cấu hình Vitest — dùng `test.projects` (Vitest 5), KHÔNG tách 2 file config riêng

Vitest 5 hỗ trợ nhiều "project" đặt tên trong **1 file `vitest.config.ts`** (`test.projects`),
lọc chạy riêng bằng `--project <name>`. Ưu tiên cách này hơn 2 file `vitest.config.ts` riêng —
giữ đúng tinh thần hiện tại của monorepo (1 file config/package).

```typescript
import { integrationConfig, nodeConfig } from "@megawin/vitest-config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        // `extends: true` là default ở Vitest 5 — project kế thừa root config (plugin, alias...).
        test: {
          name: "unit",
          ...nodeConfig.test,
          include: ["test/unit/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "integration",
          ...integrationConfig.test,
          include: ["test/integration/**/*.test.ts"],
          globalSetup: ["@megawin/vitest-config/global-setup-mongo"],
        },
      },
    ],
  },
});
```

> Cú pháp trên đã xác minh qua Vitest docs (`test.projects`, `--project <name>`, `extends: true`
> mặc định ở v5) — KHÔNG phải phác thảo chưa kiểm chứng. Package UI (jsdom) chỉ có project `unit`
> (không có `integration`), thêm `test/e2e` bằng `playwright.config.ts` riêng (Playwright không
> nằm trong `test.projects` của Vitest).

### Scripts — giữ `pnpm test` chạy TẤT CẢ, thêm script chạy riêng từng loại

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run --project unit",
    "test:integration": "vitest run --project integration"
  }
}
```

`turbo.json` task `test` **không đổi** — vẫn gọi `pnpm test` per package, nay chạy cả 2 project
trong 1 lệnh `vitest run` (Vitest tự chạy hết `projects` không filter). Package UI/app có thêm
`test:e2e` (Playwright, xem `ui-visual-regression`) — KHÔNG gộp vào `pnpm test` mặc định vì cần
Docker/dev-server thật, khác chi phí với `vitest run`.

## Migrate — CHƯA THỰC THI, cần approve riêng do khối lượng lớn

Khảo sát nhanh: **46 package/app** hiện có `test/`. Đây là restructure thật (di chuyển file +
sửa `vitest.config.ts` + `include` glob) trên toàn bộ, không phải chỉ đổi tài liệu. Đề xuất thứ tự
thực thi theo rủi ro, KHÔNG làm tất cả trong 1 lần:

1. **13 package Mongo** của [testcontainers-setup](../testcontainers-setup/00-overview.md)
   (`p0-02`) — làm CÙNG LÚC với migrate Testcontainers (đằng nào cũng sửa `vitest.config.ts`,
   tách thư mục không thêm round-trip riêng).
2. **`packages/cache`** — làm cùng [p0-03](../testcontainers-setup/p0-03-cache-redis-integration.plan.md)
   (đang thêm test Redis mới, viết thẳng vào `test/integration/` từ đầu, không cần di chuyển).
3. **`apps/backoffice`** — làm cùng lúc thêm Playwright
   ([ui-visual-regression/p0-01](../ui-visual-regression/p0-01-playwright-foundation.plan.md)):
   di chuyển 8 file `test/*.test.{ts,tsx}` hiện có vào `test/unit/`, `playwright.config.ts` đã trỏ
   `test/e2e` sẵn.
4. **5 package Nhóm B còn lại** (`game-core-application`, `identity-application`, `tenant-gateway`,
   `tenant-dispatch`, `audit`) — tách file unit ra khỏi integration theo bảng bằng chứng ở trên.
5. **Phần còn lại** (Nhóm A domain pure, Nhóm D workers) — hầu hết ĐÃ 100% unit (không DB) → chỉ
   cần đổi `test/**/*.test.ts` → `test/unit/**/*.test.ts` trong `include`, di chuyển file vào
   `test/unit/`, không có phần `integration/` nào.

## Không làm

- Không di chuyển file thật trong plan này — đây là plan kiến trúc + heuristic, việc di chuyển
  46 package/app thực thi ở các phase tương ứng đã liệt kê trên (gắn với công việc khác đang làm,
  tránh 1 PR khổng lồ chỉ để đổi vị trí file).
- Không đổi `turbo.json`.
- Không bắt buộc app không có UI (`workers`, `resultfeed`, ...) phải có `test/e2e/` — chỉ app có
  UI thật mới cần.
