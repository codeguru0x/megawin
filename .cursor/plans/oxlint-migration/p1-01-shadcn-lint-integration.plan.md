# P1-01 — Tích hợp `@shadcn/lint` (best-practice contracts)

> Nguồn: [`.cursor/analysis/system-oxlint-migration.analysis.md`](../../analysis/system-oxlint-migration.analysis.md)
> §5. Phase **P1** — đã thực thi sau [`p0-07`](p0-07-retire-biome.plan.md) (17/09/2026).
> Follow-up best-practice (cùng ngày): bật đủ 5 rule + contracts + migrate palette → semantic tokens.

## Status: ✅ done (warn + contracts; palette đã migrate)

## Vì sao để P1, không làm cùng P0

`@shadcn/lint` phụ thuộc hạ tầng `jsPlugins` của Oxlint (alpha) — không kéo vào migration P0.

## Việc đã làm

1. Cài `@shadcn/lint@0.1.0` (pin exact) vào root `devDependencies`.
2. Root `.oxlintrc.json`:
   - `"jsPlugins": ["@shadcn/lint"]`
   - Override `apps/backoffice/**` **và** `packages/ui/**`: đủ **5 rule core** ở **warn**:
     - `shadcn/no-restyle` — `allow: ["layout"]` + contracts theo design system
     - `shadcn/no-raw-colors` — message trỏ `globals.css`
     - `shadcn/no-arbitrary-values` — `allow: ["layout"]`
     - `shadcn/no-inline-styles`
     - `shadcn/require-static-classes`
   - Override `apps/backoffice/src/components/ui/**`: tắt hết shadcn (primitive sở hữu style;
     cũng đã nằm trong `ignorePatterns`)
3. Theme tokens mới trong `apps/backoffice/src/app/globals.css`:
   - `--warning` / `--info` (+ foreground) trong `:root` / `.dark` / `@theme inline`
   - `--color-board-a`…`f` expose board indicators ra Tailwind
4. Codemod call-site (backoffice + `packages/ui`):
   - `text-[9|10|11|12px]` → `text-xs`
   - Raw palette → semantic: `profit` / `loss` / `warning` / `info` / `game-*` / `muted*`
   - Directional `border-l-amber-*` → `border-l-warning`, v.v.
   - `MoneyInput`: `ring-[3px]` → `ring-3`, bỏ arbitrary transition

## Backlog đo thật (17/09/2026, sau best-practice pass)

| Rule | Severity | Trước (P1 lần 1) | Sau contracts + migrate |
|---|---|---:|---:|
| `shadcn/no-restyle` | warn | ~9 729 | **~1 990** |
| `shadcn/no-raw-colors` | warn | ~4 045 | **~14** |
| `shadcn/no-arbitrary-values` | warn | (chưa bật) | **~22** |
| `shadcn/no-inline-styles` | warn | (chưa bật) | **~288** |
| `shadcn/require-static-classes` | warn | (chưa bật) | **~86** |
| Unique files có ≥1 shadcn warn | — | 436 | **~361** |

**Policy severity:** giữ **`warn`**, **KHÔNG** nâng `error` khi còn ~2k `no-restyle` + inline-styles.
`oxlint . --quiet` / CI vẫn exit 0. Nâng error khi backlog còn hàng trăm (không phải nghìn).

## Contracts chính (rút gọn)

- Default: `allow: ["layout"]`
- Card*/DialogContent/Sheet*: + `spacing`
- Title/Description/Label: + `typography` (Label thêm `color`)
- Badge/Alert: + `color` (status — raw palette vẫn bị `no-raw-colors`)
- Table*: layout + typography + spacing
- Button/Input: layout + width/margin utilities

## Semantic color map (AI phải dùng)

| Ý nghĩa | Token Tailwind | Không dùng |
|---|---|---|
| Thắng / dương | `text-profit`, `bg-profit` | `emerald-*`, `green-*` |
| Thua / âm / hot danger | `text-loss`, `bg-loss` | `red-*`, `rose-*` |
| Cảnh báo / amber UI | `text-warning`, `bg-warning` | `amber-*`, `orange-*`, `yellow-*` |
| Info / blue UI | `text-info`, `bg-info` | `blue-*`, `sky-*`, `cyan-*` |
| Brand game | `text-game-{key}`, `bg-game-{key}-muted` | raw teal/violet/fuchsia/lime theo game |
| Neutral | `text-muted-foreground`, `bg-muted`, `border-border` | `slate-*`, `gray-*`, `zinc-*` |

## Verify

- [x] `@shadcn/lint@0.1.0` pin exact + `jsPlugins`
- [x] 5 rule + contracts trên backoffice + `@megawin/ui`
- [x] Theme `warning`/`info`/`board-*` trong `globals.css`
- [x] `oxlint . --quiet` 0 error
- [ ] User chạy `pnpm install` nếu lockfile chưa sync `@shadcn/lint`

## Follow-up

- Giảm `no-restyle` (~typography/spacing còn lại trên Input/Button call-site) → rồi cân nhắc `error`.
- `no-inline-styles` (~288): đổi `style={{…}}` động sang CSS variables / class.
- Arbitrary còn lại (~22): shimmer animation, shiki CSS vars, shadow tùy chỉnh — giữ warn có chủ đích.
