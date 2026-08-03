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
2. Chạy `pnpm install` để cập nhật `pnpm-lock.yaml` (workspace glob `tooling/*` trong `pnpm-workspace.yaml` tự nhận biết package mất).
3. Verify `packages/ui/turbo/generators` (nếu có template `react-component`) không chèn `eslint.config.mjs` vào component mới.

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
| `turbo/no-undeclared-env-vars: "warn"` | ❌ **Mất** — không có tương đương. Bù: `style/noProcessEnv: "warn"` (p0-01) đẩy env access về `env.ts` tập trung, nơi đã validate bằng Zod (`packages/shared/src/utils/env.ts`, `apps/backoffice/src/env.ts`). Rủi ro chấp nhận được vì rule này trước đây cũng chỉ chạy trên 10 file. |

## Acceptance criteria

- `rg -n "eslint" --glob '!node_modules' --glob '!pnpm-lock.yaml' .` chỉ còn kết quả trong `.cursor/plans/`, `.cursor/analysis/`, `.cursor/rules/` (tài liệu) — không còn trong code/config/package.json.
- `pnpm install` thành công, `pnpm-lock.yaml` giảm entry (6 dependency ESLint + transitive rời khỏi lock).
- `pnpm check-types` vẫn xanh (không phụ thuộc ESLint).
- `pnpm lint` (Biome) chạy được toàn repo.
