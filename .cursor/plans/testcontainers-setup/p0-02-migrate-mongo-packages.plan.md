# p0-02 — Migrate 13 package MongoDB sang Testcontainers

> **Làm CÙNG LÚC với restructure thư mục** — xem
> [`monorepo-test-setup/p2-01`](../monorepo-test-setup/p2-01-test-type-folder-convention.plan.md).
> `include: ["test/**/*.test.ts"]` đổi thành `include: ["test/integration/**/*.test.ts"]` khi di
> chuyển file — file pure (mapper/classifier/codec, xem bảng bằng chứng ở `p2-01`) tách ra
> `test/unit/**`, dùng `test.projects` (Vitest 5) trong CÙNG `vitest.config.ts`, KHÔNG cần
> Testcontainers/Docker để chạy `test:unit`.

## Danh sách package (đã xác nhận thực sự chạm Mongo qua test file)

`game-keno-application`, `game-lotto535-application`, `game-mega645-application`,
`game-power655-application`, `game-max3d-application`, `game-max3dpro-application`,
`game-bingo18-application`, `game-core-application`, `resultfeed-application`,
`identity-application`, `tenant-gateway`, `tenant-dispatch`, `audit`.

## Thay đổi — mỗi package

### 1. `vitest.config.ts`

Trước (VD [game-power655-application/vitest.config.ts](../../../packages/game-power655-application/vitest.config.ts)):

```typescript
import { integrationConfig } from "@megawin/vitest-config/dist";
import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

export default defineConfig(({ mode }) => ({
  ...integrationConfig,
  test: {
    ...integrationConfig.test,
    env: loadEnv(mode, import.meta.dirname, ""),
    include: ["test/**/*.test.ts"],
    globalSetup: ["test/global-setup.ts"],
  },
}));
```

Sau (dùng `test.projects` — Vitest 5, xem [`p2-01`](../monorepo-test-setup/p2-01-test-type-folder-convention.plan.md)
cho cú pháp đầy đủ + lý do):

```typescript
import { integrationConfig, nodeConfig } from "@megawin/vitest-config/dist";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
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

Nếu package CHƯA có file test pure nào cần tách (đọc bảng bằng chứng ở `p2-01` để xác nhận) — vẫn
tạo `test/unit/` rỗng với `passWithNoTests: true` (đã có sẵn trong `nodeConfig`, xem
`tooling/vitest-config/src/index.ts`) để sẵn cấu trúc cho test mới, không bắt buộc có file ngay.

**Bỏ hẳn `env: loadEnv(mode, ...)` và tham số `mode` — BẮT BUỘC, không phải dọn dẹp tuỳ chọn.**
Nếu để lại, `.env.test.local` cũ (chứa URI Atlas thật) có thể override `process.env.MONGODB_URI`
mà `global-setup-mongo` vừa set (Vitest set `test.env` lên worker khi spawn, có thể đè lên biến
đã inherit từ globalSetup) — âm thầm vô hiệu hoá toàn bộ mục tiêu migrate. Vì `.env.test.example`
của mọi package trong danh sách chỉ chứa `MONGODB_URI` (đã xác nhận đọc từng file), bỏ `loadEnv`
không mất biến nào khác.

### 2. Xoá `test/global-setup.ts`

Logic build-deps đã tập trung vào `buildWorkspaceDeps()` (gọi từ `global-setup-mongo.ts`, xem
[p0-01](p0-01-vitest-config-testcontainers.plan.md)).

### 3. Xoá `.env.test.example`

Không còn biến nào cần khai mẫu (chỉ có `MONGODB_URI`, giờ do global-setup set runtime).

### 4. KHÔNG tự xoá `.env.test.local`

Theo `no-env-file-modification.mdc` — agent không đụng `.env*`. Sau migrate, file này thành
**dead weight + rủi ro lộ credential không cần thiết**. Ghi rõ cho user: tự xoá + rotate password
Atlas trong đó (đặc biệt [game-power655-application/.env.test.local](../../../packages/game-power655-application/.env.test.local)
đã xác nhận chứa credential thật).

### 5. Test file + seed helper — di chuyển vị trí, KHÔNG sửa nội dung

File test + seed helper (VD
[game-lotto535-application/test/use-cases/helpers/seed-global-config.ts](../../../packages/game-lotto535-application/test/use-cases/helpers/seed-global-config.ts))
di chuyển từ `test/use-cases/...` → `test/integration/use-cases/...` (theo convention
[`p2-01`](../monorepo-test-setup/p2-01-test-type-folder-convention.plan.md)) — **chỉ đổi đường dẫn
file, KHÔNG sửa nội dung**. Các file này chỉ đọc `MONGODB_URI` qua `getMongoClient`
([packages/data/src/mongo/client.ts](../../../packages/data/src/mongo/client.ts)) — không quan
tâm nó trỏ đâu. Import path nội bộ (`../../src/...`) cần cập nhật số lượng `../` cho khớp độ sâu
thư mục mới (`test/integration/use-cases/` sâu hơn `test/use-cases/` 1 cấp).

File pure không chạm Mongo (xem bảng bằng chứng ở `p2-01`, VD `feed-sync-cursor-mapper.test.ts`
của `game-core-application`) di chuyển sang `test/unit/` — vẫn KHÔNG sửa nội dung, chỉ đường dẫn.

## Verify

- `pnpm --filter @megawin/game-power655-application test:integration` — xác nhận container Mongo
  tự start (lần đầu), test pass, không có `.env.test.local` nào được đọc (thử bằng cách tạm đổi
  giá trị trong đó thành rác — test vẫn phải pass vì không còn đọc file này).
- `pnpm --filter @megawin/game-power655-application test:unit` — pass, **không spawn Docker
  container nào** (`docker ps` không tăng) — xác nhận tách project đúng, `test/unit` không phụ
  thuộc Testcontainers.
- `pnpm --filter @megawin/audit test`, `pnpm --filter @megawin/tenant-gateway test` — xác nhận
  attach vào CÙNG container (không start container Mongo mới — kiểm bằng `docker ps`). Đây là
  verify bắt buộc theo ràng buộc #5 ở [`00-overview.md`](00-overview.md) ("container 1 lần/suite").
- `pnpm test` (root, chạy cả `turbo run test`) một lần cho toàn bộ 13 package — đo lại thời gian
  tổng, xác nhận không có timeout do container cold-start (globalSetup có thể cần tăng
  `testTimeout` cho lần đầu image `mongo:8.0` chưa cache local — pull ảnh lần đầu ~vài chục giây).

## Không làm

- Không sửa `Constants.Default.*DbName` trong `packages/data` — giữ nguyên hằng số, container
  dùng chung tự tách theo các DB name này (xem [00-overview.md](00-overview.md)).
- Không đổi seed helper / test body — chỉ đổi đường dẫn file + số lượng `../` trong import.
