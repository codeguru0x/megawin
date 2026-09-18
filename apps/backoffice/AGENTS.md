# Backoffice — Agent Notes

Hướng dẫn cho agent khi sửa `apps/backoffice`. Root `AGENTS.md` bị GitNexus chiếm (gitignore) —
file này là nguồn chân lý cho app.

## Trước khi sửa UI

1. Mở trang bằng `cursor-ide-browser` (`browser_navigate` + `browser_snapshot`) — lấy accessible
   name thật, không đoán từ `.tsx`.
2. Màu/spacing: dùng token trong `src/app/globals.css` (`profit`, `loss`, `warning`, `info`,
   `game-<key>`). KHÔNG raw Tailwind palette — `oxlint` `@shadcn/no-raw-colors` chặn.
3. KHÔNG áp skill “frontend-design” kiểu landing/marketing vào app này — đã có design system
   shadcn + token.

## Sau khi sửa

```bash
pnpm --filter @megawin/backoffice check-types
pnpm exec oxlint <paths-đã-sửa>
pnpm exec prettier --write <paths-đã-sửa>
```

Nếu có spec E2E liên quan: `pnpm --filter @megawin/backoffice test:e2e`.
Fail vì screenshot → đọc `.cursor/rules/e2e-baseline-and-flaky.mdc`, **KHÔNG** tự
`--update-snapshots`. Baseline PNG **gitignore** (local-only); CI skip visual.

## E2E Ops Hub

- Auth: `mint-session.ts` + `e2e-auth.ts` (minimal better-auth — **không** import `@/lib/auth`/
  t3-env). Secret: `resolveBetterAuthSecret()` → `process.env.BETTER_AUTH_SECRET` trước, fallback
  chỉ đọc **1 key** từ `.env.local`. CI: inject secret **riêng E2E** (≠ production).
- Persona admin/staff → `storageState` trong `.auth/` (gitignore).
- Determinism: `freezeClock` + `mockOpsHubSnapshot` + fixture `2999-01-15.*`
  (`test/e2e/support/hub-fixtures.ts`). Thứ tự bắt buộc: clock → route → goto.
- URL tab: `?gate=` với giá trị `HubGateTab` (`pending_open` | `ended` | `awaiting_result` |
  `awaiting_settle` | `all`) — **không** dùng `?tab=` / `needs_action`.
- `DrawIdLabel` compact hiện `#NNN · DD/MM`, không phải drawId đầy đủ trên bảng.

## Cấu hình dễ hiểu sai

- `staleTimes: { dynamic: 1800 }` trong `next.config.ts` là **có chủ đích** — hạ về `0` tái phát
  sự cố “load liên tục” 04/09. Bảo vệ bằng `test/e2e/navigation-regression.spec.ts`.
- `partialPrefetching: true` + `cacheComponents: true` — chỉ `/guides` dùng `'use cache'` hiện tại.
- E2E chạy `next dev` port **3100** với `NEXT_PUBLIC_SITE_URL` khớp (không tạo `.env*`).
- Dev server nặng (Mongo driver + 7 game package) — đừng bật chạy nền vô hạn không cần thiết.

## Vòng lặp thiết kế (MCP)

1. **Quan sát** — cursor-ide-browser: snapshot + screenshot
2. **Đo** — chrome-devtools: network / console / perf
3. **Sửa** — code + token theme
4. **Xác minh** — Next.js MCP `get_errors` + snapshot lại
5. **Khoá** — Playwright behaviour + screenshot (chỉ quyết định thiết kế đáng bảo vệ)

Chi tiết: `.cursor/plans/ui-visual-regression/p2-01-design-authoring-loop.plan.md`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
