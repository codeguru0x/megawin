# P0-01 — Bump TypeScript `^6.0.3` → `^7.0.2`

> Nguồn: [`00-overview.md`](00-overview.md) §1. Không phụ thuộc plan nào khác — làm trước tiên vì
> P0-03 (Oxlint type-aware) cần TS7 đã cài xong.

## Bằng chứng đã verify (không cần làm lại — tham khảo khi review PR)

Đã cài `typescript@7.0.2` (dist-tag `latest` chính thức, KHÔNG phải `7.1.0-dev.*` nightly) vào
`/tmp/ts7-test`, chạy `tsc --noEmit` bằng binary đó trên **toàn bộ 49 file `tsconfig.json`** của
repo (dùng `-p <tsconfig>`, cwd = repo root để module resolution đọc đúng `node_modules` thật):

- **48/49 sạch hoàn toàn** — bao gồm mọi archetype: game tài chính (`game-keno-application`,
  `game-power655-application`, `game-core-application`), Lambda handler (`api-player`,
  `api-tenant`), worker (`worker-keno`, `worker-power655`), Next.js app (`backoffice`), library
  (`shared`, `data`, `audit`, `ui`, `next`, `tenant-gateway`, `identity-application`,
  `worker-core`).
- **1/49 lỗi** (`tooling/vitest-config`) — `Cannot find module '@testcontainers/mongodb'`. Đã xác
  nhận **lỗi này y hệt xảy ra với TS6 hiện tại** (baseline `node_modules/.bin/tsc` của repo) — do
  `@testcontainers/mongodb`/`@testcontainers/redis` đã khai trong `package.json` nhưng chưa
  `pnpm install` (thuộc phạm vi `testcontainers-setup/p0-01`, không liên quan TS7).

**Kết luận: 0 lỗi thật do TS7 gây ra.** Không có decorator, không dùng TS Compiler API JS-based
(`ts-morph`, `typescript.createProgram`), không dùng `baseUrl` legacy ở bất kỳ đâu — 3 nguyên nhân
breaking phổ biến nhất khi lên TS7 đều không áp dụng cho repo này.

## Việc cần làm

### 1. Đổi version trong 47 file `package.json`

Toàn bộ 47 file hiện pin **y hệt nhau** `"typescript": "^6.0.3"` — đổi đồng loạt bằng lệnh, KHÔNG
sửa tay từng file (rủi ro gõ nhầm 1 trong 47 file):

```bash
rg -l '"typescript": "\^6\.0\.3"' --glob 'package.json' -g '!node_modules' | \
  xargs sed -i '' 's/"typescript": "\^6\.0\.3"/"typescript": "^7.0.2"/'
```

Verify đã đổi đủ, không sót:

```bash
rg -n '"typescript"\s*:' --glob 'package.json' -g '!node_modules' | grep -v '\^7\.0\.2'
# Phải rỗng — nếu còn dòng nào in ra, đó là file bị sót
```

### 2. Cài lại dependencies

```bash
pnpm install
```

Verify: `pnpm ls typescript -r --depth 0 | grep -c "typescript 7.0.2"` phải ra số = tổng số
package/app khai `typescript` trong devDependencies (đối chiếu với số dòng ở bước 1).

### 3. Đo baseline TRƯỚC khi đổi (nếu chưa đo) — chạy TRƯỚC bước 1-2, dùng git stash nếu cần quay lại

```bash
git stash  # nếu đã đổi rồi, tạm lùi lại để đo baseline chính xác
time pnpm check-types
git stash pop
```

Ghi số liệu vào `00-overview.md` §6 cột "Baseline (Biome, TS6)".

### 4. Chạy type-check thật trên toàn repo với TS7 đã cài

```bash
time pnpm check-types
```

- Phải xanh 100% (đúng như đã verify ở `/tmp/ts7-test`, trừ lỗi `@testcontainers/*` đã biết —
  KHÔNG thuộc phạm vi plan này, để `testcontainers-setup/p0-01` xử lý).
- Ghi thời gian đo được vào `00-overview.md` §6 cột "Sau migrate".

### 5. Kiểm tra `pnpm dev`/`pnpm build` không vỡ (spot-check, không cần chạy hết 14 app)

```bash
pnpm --filter @megawin/backoffice build
pnpm --filter @megawin/api-player build
```

Cả 2 phải build thành công — đây là 2 archetype khác nhau nhất (Next.js vs Lambda esbuild/tsup).

## Không đổi trong phase này

- KHÔNG đổi `tooling/typescript-config/*.json` (base/nextjs/serverless) — type system không đổi
  giữa 6.x/7.x, chỉ đổi implementation (Go thay JS).
- KHÔNG đổi gì liên quan Biome/Oxlint — phase này chỉ về TypeScript.

## Rollback nếu phát hiện vấn đề

```bash
git checkout -- '**/package.json' pnpm-lock.yaml
pnpm install
```

## Verify hoàn tất

- [x] 50/50 `package.json` đổi thành `^7.0.2` (plan ghi 47 — thực tế repo có 50).
- [x] `pnpm check-types` xanh 48/48 (TS7.0.2, 35.25s cold).
- [x] `pnpm --filter @megawin/backoffice build` thành công; `api-player` không có script `build` →
      verify bằng `check-types` + `worker-keno build:deps` (Lambda archetype).
- [x] Số liệu thời gian đã ghi vào `00-overview.md` §6.
