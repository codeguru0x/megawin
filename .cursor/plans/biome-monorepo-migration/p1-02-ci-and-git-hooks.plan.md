# P1-02 — CI gate + git hooks

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md). Cần [p1-01](p1-01-typeaware-and-tsconfig.plan.md).

## Vấn đề: lint hiện tại là advisory 100%

Khảo sát cho thấy:

- **Không có `.github/workflows`** → không có CI nào chạy lint/type-check/test.
- `lint-staged` được khai báo trong `apps/backoffice/package.json` nhưng **không có `.husky/`** ở root → hook chưa từng được wire. Config đang nằm chết.

Nghĩa là dù config Biome có hoàn hảo, sẽ không có gì ngăn code vi phạm vào `main`. Đây mới là phần quyết định liệu migration có giá trị lâu dài hay không.

## Phần 1 — Git hook (pre-commit)

### Cài `husky` + `lint-staged` ở root

```bash
pnpm add -D -w husky lint-staged
pnpm exec husky init
```

`.husky/pre-commit`:

```sh
pnpm exec lint-staged
```

`package.json` (root) — chuyển `lint-staged` config từ `apps/backoffice` lên root:

```jsonc
{
  "lint-staged": {
    "*.{js,mjs,ts,tsx,json,jsonc,css}": ["biome check --write --no-errors-on-unmatched"],
    "*.{md,yml,yaml}": ["prettier --write"]
  }
}
```

Điểm quan trọng:

- `--no-errors-on-unmatched`: không fail khi staged file không thuộc phạm vi Biome (giữ nguyên flag đang dùng ở backoffice).
- **Xoá** khối `lint-staged` khỏi `apps/backoffice/package.json` — chỉ để một chỗ ở root, tránh 2 config chồng nhau.
- Chuyển `lint-staged` devDependency từ `apps/backoffice` lên root.
- **Không** chạy `tsc --noEmit` trong pre-commit: quá chậm (vài chục giây, đợi cả dependency graph) → làm dev bỏ hook bằng `--no-verify`. Type-check thuộc CI.

### Cân nhắc pre-push (tuỳ chọn)

`.husky/pre-push` với `pnpm check-types` — chậm nhưng chỉ chạy khi push. Chỉ thêm nếu team thực sự muốn; CI đã bao phủ.

## Phần 2 — CI workflow

Tạo `.github/workflows/ci.yml`:

```yaml
name: CI
on:
  pull_request:
  push:
    branches: [main]

jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v5
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v5
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile

      - name: Biome (format + lint + import sort)
        run: pnpm exec biome ci .

      - name: Type check
        run: pnpm check-types

      - name: Test
        run: pnpm test
```

### ⚠️ Ràng buộc với test infra (bắt buộc giải quyết khi thực thi)

`pnpm test` KHÔNG chạy trơn trong CI như local — hai chốt chặn từ test infra hiện tại
(xem `.cursor/plans/monorepo-test-setup/` + `.cursor/rules/test-data-safety.mdc`):

1. **db-guard runtime** (`@megawin/vitest-config/setup-db-guard`): từ chối chạy nếu `MONGODB_URI`
   không phải `localhost`/`127.0.0.1` và không set `ALLOW_DB_TESTS=true`. Test integration (Group B/D)
   hiện chạy trên **DB staging chung** — KHÔNG đưa URI staging vào CI công khai.
2. `test/global-setup.ts` của các package gọi `turbo build --filter=...^...` — cần Turbo cache trong CI
   để không build lại cả graph mỗi run.

Hướng chốt (chọn khi thực thi, khuyến nghị (a) trước):

- **(a) Giai đoạn đầu:** CI chỉ chạy nhóm test KHÔNG cần DB (Group A domain pure + C UI jsdom) —
  filter qua `turbo run test --filter=...` hoặc env flag; test integration vẫn chạy local/manual.
- **(b) Giai đoạn sau:** thêm service container `mongodb` trong workflow (`MONGODB_URI=mongodb://localhost:27017`)
  → db-guard pass tự nhiên, test integration chạy trên Mongo ephemeral, không đụng staging.

KHÔNG set `ALLOW_DB_TESTS=true` trong CI để "cho qua" — flag đó dành cho chủ đích chạy trên DB thật.

Giải trình:

| Lựa chọn | Lý do |
|---|---|
| `biome ci .` thay vì `biome check .` | `ci` **không bao giờ ghi file**, tối ưu output cho log CI, và fail nếu format lệch — đúng subcommand dành cho pipeline. |
| Không dùng `--changed` ở CI | Full check chỉ mất vài giây; `--changed` dễ bỏ sót lỗi lan từ file khác. Dùng `--changed` cho local DX, dùng full cho gate. |
| `check-types` qua Turbo | `tsc --noEmit` cần `.d.ts` của dependency → giữ trong Turbo để có cache + đúng thứ tự topological. |
| `--frozen-lockfile` | Chặn lockfile drift. |
| Một job duy nhất | 3.122 file, Biome vài giây — tách 3 job chỉ tốn thêm thời gian setup/install. Tách khi CI vượt ~5 phút. |

Cân nhắc thêm (không bắt buộc): `actions/cache` cho `.turbo` để `check-types` và `test` hưởng cache giữa các run.

## Phần 3 — Bảo vệ nhánh

Sau khi CI xanh ổn định vài ngày, bật branch protection cho `main`: require status check `quality` pass trước merge. Đây là bước duy nhất thực sự biến lint từ "gợi ý" thành "hàng rào".

## Cân nhắc bổ sung cho `player-sdk`

`packages/player-sdk` publish ra ngoài cho tenant; JSDoc là sản phẩm (TypeDoc). Biome không enforce được JSDoc. Có thể thêm job riêng:

```yaml
      - name: SDK docs validation
        run: pnpm --filter @megawin/player-sdk exec typedoc --validation.notDocumented
```

Đây là cách duy nhất tự động hoá yêu cầu "mọi public export bắt buộc có JSDoc đầy đủ" của `player-sdk-jsdoc.mdc`. Đưa vào scope này hay tách riêng — cần quyết định khi thực thi.

## Acceptance criteria

- Commit thử một file vi phạm format → pre-commit hook tự fix hoặc chặn.
- Mở PR có lỗi lint → CI đỏ với message rõ ràng từ `biome ci`.
- `apps/backoffice/package.json` không còn khối `lint-staged` (đã dồn về root).
- Thời gian job `quality` < 3 phút (chủ yếu là install).

## Phương án review sau thực thi

**1. Diff review — file được phép đổi:**

```
package.json                      (root — husky/lint-staged dep + config + script prepare)
.husky/pre-commit                 (MỚI)
.github/workflows/ci.yml          (MỚI)
apps/backoffice/package.json      (xoá lint-staged config + dep)
pnpm-lock.yaml
```

**2. Negative test hook (quan trọng nhất — hook "được cài" khác "hoạt động"):**

```bash
# a) File format sai → hook phải TỰ FIX rồi commit pass
echo 'const   x=1;;   export {x}' > packages/shared/src/probe-hook.ts
git add packages/shared/src/probe-hook.ts && git commit -m "probe" 
git show HEAD --stat && git show HEAD | rg 'const x = 1'   # file đã được format trong commit
git reset --hard HEAD~1

# b) File có lỗi KHÔNG auto-fix được (vd enum) → hook phải CHẶN commit
echo 'export enum P { A }' > packages/shared/src/probe-hook2.ts
git add . && git commit -m "probe2"    # KỲ VỌNG: exit != 0, commit không tạo
git reset --hard

# c) File .md → đi qua Prettier, không qua Biome
```

**3. Verify CI trên PR thật:** mở PR draft chứa 1 vi phạm lint cố ý → job `quality` đỏ, log chỉ đúng file/rule; push fix → xanh. Đo tổng thời gian job (< 3 phút).

**4. Verify test strategy đã chọn (mục ⚠️):** nếu chọn (a) — log CI phải cho thấy CHỈ các package Group A/C chạy test; nếu (b) — service container Mongo khởi động, `MONGODB_URI=mongodb://localhost:27017`, db-guard pass mà KHÔNG có `ALLOW_DB_TESTS`.

**5. Rollback:** xoá `.husky/` + revert package.json → hook biến mất ngay (husky không để lại global state). CI: xoá workflow file.
