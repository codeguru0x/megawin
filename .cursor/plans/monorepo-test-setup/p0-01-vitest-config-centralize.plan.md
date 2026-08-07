# p0-01 — Tập trung `@megawin/vitest-config` + `db-guard`

Nâng cấp package tooling `@megawin/vitest-config` thành NGUỒN CHÂN LÝ DUY NHẤT cho mọi cấu hình
test trong monorepo. Xoá copy-paste `db-guard`, cung cấp 3 preset rõ ràng, thêm lớp phòng thủ
runtime chặn lệnh xoá không-scope (vì DB = staging chung).

## Vì sao

- Hiện `@megawin/vitest-config` chỉ export `sharedConfig` trần
  ([tooling/vitest-config/src/index.ts](../../../tooling/vitest-config/src/index.ts)):

```ts
export const sharedConfig = {
  test: { globals: true, environment: "node" },
};
```

- `db-guard` bị copy-paste per-package
  ([packages/game-power655-application/test/setup-db-guard.ts](../../../packages/game-power655-application/test/setup-db-guard.ts)).
  Mỗi package mới phải nhớ copy → dễ sót → rủi ro xoá data staging.

## Thay đổi

### 1. `tooling/vitest-config/src/index.ts` — export 3 preset

- `nodeConfig` — domain pure + workers: `environment: "node"`, `globals: true`, không setupFiles.
- `integrationConfig` — application Node+Mongo: kế thừa `nodeConfig` + `testTimeout: 30_000` +
  `setupFiles: [<db-guard path>]`. KHÔNG hardcode `globalSetup` (mỗi package tự khai báo vì turbo
  filter khác nhau theo tên package).
- `jsdomConfig` — UI/Next.js: `environment: "jsdom"`, `globals: true`,
  `setupFiles: ["@testing-library/jest-dom/vitest"]`.

Giữ `sharedConfig` như alias của `nodeConfig` (backward-compat cho các config đang dùng).

### 2. `tooling/vitest-config/src/setup-db-guard.ts` — MỚI (di chuyển từ power655)

Bê nguyên logic hiện có (chỉ cho phép `localhost`/`127.0.0.1` hoặc `ALLOW_DB_TESTS=true`), BỔ SUNG
lớp phòng thủ runtime: monkey-patch `Collection.prototype` của driver `mongodb` để THROW khi phát
hiện filter rỗng ở lệnh ghi/xoá:

- Chặn: `deleteMany({})`, `deleteMany()`, `deleteOne({})`, `updateMany({}, ...)`,
  `updateOne({}, ...)`, `drop()`, `findOneAndDelete({})`.
- Điều kiện "filter rỗng" = `undefined`/`null`/`{}` (không có key).
- Thông báo lỗi dẫn chiếu Cursor rule `test-data-safety.mdc`.

Lý do đặt ở runtime: rule + lint là phòng thủ tĩnh; DB staging chung cần thêm chốt chặn động
phòng khi filter được build động thành `{}`.

### 3. `tooling/vitest-config/package.json` — subpath exports + deps

- Thêm exports: `"./setup-db-guard"` → `dist/setup-db-guard.js` (+ types).
- devDeps cho preset jsdom: `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`,
  `@testing-library/user-event`, `vite`.
- Giữ dep `mongodb` (peer/optional) cho runtime guard — chỉ import động trong setup, tránh kéo
  mongodb vào bundle preset node thuần.

### 4. Các package integration hiện có — trỏ về db-guard tập trung

`game-*-application`, `cache`, `data`, `audit`, `identity-application`, `api-player`:
- `vitest.config.ts`: đổi `setupFiles: ["test/setup-db-guard.ts"]` → import path từ
  `@megawin/vitest-config/setup-db-guard`.
- Xoá file `test/setup-db-guard.ts` local sau khi đã trỏ về tập trung.

## Verify

- `pnpm --filter @megawin/vitest-config build`.
- `pnpm --filter @megawin/game-power655-application test` (đảm bảo preset mới không phá test cũ).
- Test cố tình `deleteMany({})` trong 1 file scratch → phải THROW (rồi xoá file scratch).

## Không làm

- Không đổi `turbo.json` (task `test` đã depend `@megawin/vitest-config#build`).
- Không đụng `.env*`.
