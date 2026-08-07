# P0-05 — Retire ESLint tooling

> Thuộc: `.cursor/plans/biome-monorepo-migration/` — xem [00-overview.md](00-overview.md). **Cần [p0-03](p0-03-frontend-configs.plan.md) xong trước** (`packages/ui` phải rời ESLint, nếu không sẽ vỡ install).

## Dấu chân ESLint hiện tại (đã kiểm kê đầy đủ)

```
tooling/eslint-config/            ← package @megawin/eslint-config (base.js, next.js, react-internal.js, README.md)
packages/ui/eslint.config.mjs     ← consumer DUY NHẤT (xử lý ở p0-03)
packages/ui/package.json          ← dep @megawin/eslint-config + eslint (xử lý ở p0-03)
packages/game-lotto535-application/package.json  ← script lint hỏng (xử lý ở p0-04)
```

`tooling/eslint-config/next.js` **không có consumer nào** — `apps/backoffice` đã dùng Biome từ trước. Toàn bộ 6 dependency ESLint (`eslint`, `eslint-config-prettier`, `eslint-plugin-only-warn`, `eslint-plugin-react`, `eslint-plugin-react-hooks`, `eslint-plugin-turbo`) chỉ tồn tại để phục vụ 10 file trong `packages/ui`.

## Thay đổi

1. Xoá thư mục `tooling/eslint-config/` (bao gồm `node_modules` của nó).
2. Xoá luôn `tooling/class-arrangement/` — thư mục **rỗng** (không có `package.json`), rác còn sót trong workspace glob `tooling/*`.
3. Chạy `pnpm install` để cập nhật `pnpm-lock.yaml` (workspace glob `tooling/*` trong `pnpm-workspace.yaml` tự nhận biết package mất).
4. Verify `packages/ui/turbo/generators` (nếu có template `react-component`) không chèn `eslint.config.mjs` vào component mới.
5. **Cập nhật `.cursor/rules/code-quality-standards.mdc` §6** — đoạn "Lưu ý hạ tầng" đang viết *"ESLint rule `curly` (`tooling/eslint-config/base.js`) đã enforce..."* sẽ trỏ vào file không còn tồn tại. Sửa thành: Biome `style/useBlockStatements` (root `biome.json`) enforce toàn repo. Đây là một phần của việc giữ Cursor rules đồng bộ với tooling thật — phần còn lại xử lý ở [p1-03](p1-03-cursor-rules-ai-sync.plan.md).

## Ghi lại rule ESLint bị mất và cách bù

Trước khi xoá, chốt bảng đối chiếu để không mất kiến thức:

| Rule ESLint đang có ở `tooling/eslint-config/base.js` | Trạng thái sau migration |
|---|---|
| `curly: "warn"` | ✅ `style/useBlockStatements: "warn"` (p0-01) — **mở rộng từ 10 file lên 3.122 file** |
| `js.configs.recommended` | ✅ Biome `recommended: true` phủ tương đương |
| `tseslint.configs.recommended` | ✅ Biome recommended (nhóm `suspicious`/`correctness`/`style` cho TS) |
| `eslint-plugin-react` (recommended) | ✅ domain `react` (auto-detect) |
| `eslint-plugin-react-hooks` | ✅ `useExhaustiveDependencies`, `useHookAtTopLevel` (domain `react`) |
| `eslint-config-prettier` | ✅ Không còn cần — Biome là formatter, không có xung đột formatter/linter |
| `eslint-plugin-only-warn` | ✅ Thay bằng `level: "warn"` tường minh từng rule (rõ ràng hơn: trước đây plugin này hạ **mọi** error thành warn, che mất rule thật sự nghiêm trọng) |
| `turbo/no-undeclared-env-vars: "warn"` | ✅ **Có tương đương từ Biome 2.5.0**: `suspicious/noUndeclaredEnvVars` (promoted, recommended trong domain Turborepo). Lưu ý `turbo.json` có `globalPassThroughEnv: ["*"]` → rule gần như không bắt được gì; giá trị thực do `style/noProcessEnv: "warn"` (p0-01) đảm nhận — đẩy env access về `env.ts` tập trung đã validate bằng Zod (`packages/shared/src/utils/env.ts`, `apps/backoffice/src/env.ts`). |

## Acceptance criteria

- `rg -n "eslint" --glob '!node_modules' --glob '!pnpm-lock.yaml' .` chỉ còn kết quả trong `.cursor/plans/`, `.cursor/analysis/`, `.cursor/rules/` (tài liệu) — không còn trong code/config/package.json.
- `pnpm install` thành công, `pnpm-lock.yaml` giảm entry (6 dependency ESLint + transitive rời khỏi lock).
- `pnpm check-types` vẫn xanh (không phụ thuộc ESLint).
- `pnpm lint` (Biome) chạy được toàn repo.
- `.cursor/rules/code-quality-standards.mdc` §6 không còn nhắc `tooling/eslint-config/base.js`.
- `tooling/class-arrangement/` không còn tồn tại.

## Phương án review sau thực thi

**1. Diff review — file/thư mục được phép đổi:**

```
tooling/eslint-config/            (XOÁ toàn bộ thư mục)
tooling/class-arrangement/        (XOÁ — thư mục rỗng)
pnpm-lock.yaml                    (giảm entry)
.cursor/rules/code-quality-standards.mdc   (sửa §6 "Lưu ý hạ tầng")
```

Lưu ý: `packages/ui` và `packages/game-lotto535-application` KHÔNG đổi ở plan này (đã xử lý ở p0-03/p0-04) — nếu diff có chúng nghĩa là thứ tự thực thi sai.

**2. Lệnh verify:**

| Lệnh | Kỳ vọng |
|---|---|
| `pnpm install` | thành công, không warning missing workspace package |
| `rg -n "eslint" -g '!node_modules' -g '!pnpm-lock.yaml' -g '!.cursor' .` | 0 kết quả trong code/config |
| `rg -c "eslint" pnpm-lock.yaml` | 0 hoặc chỉ transitive không liên quan (ghi lại nếu có) |
| `pnpm check-types` | xanh |
| `pnpm lint` | Biome chạy toàn repo |
| `ls tooling/` | chỉ còn `typescript-config`, `vitest-config` |
| `cat packages/ui/turbo/generators/config.ts 2>/dev/null \| rg -i eslint` | 0 kết quả (generator không chèn lại ESLint) |

**3. Negative test:** không cần — plan này chỉ xoá; verify quan trọng nhất là `pnpm install` + `check-types` xanh chứng minh không package nào còn phụ thuộc thứ vừa xoá.

**4. Rollback:** ESLint config đã nằm trong git history — `git revert` commit xoá là khôi phục đủ. KHÔNG cần backup thủ công.
