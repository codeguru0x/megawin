# p0-02 — Nhóm A: Domain packages (pure, không DB)

Scaffold Vitest cho 7 domain package thuần logic. KHÔNG chạm DB → dùng `nodeConfig`, KHÔNG cần
`db-guard`, KHÔNG cần `global-setup` build deps (domain package thường không phụ thuộc dist của
package khác, chỉ dùng type-only).

## Package trong nhóm

`game-keno`, `game-mega645`, `game-power655`, `game-max3d`, `game-max3dpro`, `game-bingo18`, `game-core`.

(Ghi chú: `game-lotto535` domain ĐÃ có test — dùng làm mẫu.)

## Mẫu tham chiếu

[packages/game-lotto535/test/rules/combo-key.test.ts](../../../packages/game-lotto535/test/rules/combo-key.test.ts) —
test pure, có cả case thuận và case ngược (mutation, khác biệt input).

Config mẫu: [packages/game-lotto535/vitest.config.ts](../../../packages/game-lotto535/vitest.config.ts):

```ts
import { defineConfig } from "vitest/config";
import { sharedConfig } from "@megawin/vitest-config/dist";

export default defineConfig({
  ...sharedConfig,
  test: { ...sharedConfig.test, include: ["test/**/*.test.ts"], environment: "node" },
});
```

## Việc cho MỖI package

1. Thêm devDeps: `@megawin/vitest-config`, `vitest`, `vite`, `@types/node` (mirror lotto535 domain).
2. Tạo `vitest.config.ts` dùng `nodeConfig` (sau p0-01) hoặc `sharedConfig` (tạm).
3. Tạo `test/` với sample test cho unit dễ nhất, cao giá trị:
   - `game-power655`: `test/rules/jackpot.test.ts` (dual JP + overflow — logic phức tạp nhất, xem
     [packages/game-power655/src/rules/jackpot.ts](../../../packages/game-power655/src/rules/jackpot.ts)).
   - `game-mega645` / `game-keno` / `game-max3d` / `game-max3dpro` / `game-bingo18`:
     `test/rules/prize-tiers.test.ts` + `test/helpers/match-result.test.ts` (determineTier,
     matchLine — trọng tâm nghiệp vụ mỗi game).
   - `game-core`: `test/entities/ticket-counter.test.ts` (`buildTicketNo` — format ticketNo
     zero-padded theo rule player-sdk-jsdoc) + `test/utils/resettle-keys.test.ts`.
4. `package.json` scripts: `"test": "vitest run"`, `"test:watch": "vitest --watch"`.
   KHÔNG cần `pretest`/`build:deps` (pure, không phụ thuộc dist).
5. Thêm dòng config vào [vitest.workspace.ts](../../../vitest.workspace.ts).

## Trọng tâm coverage đề xuất (theo game-rules)

- Prize tier determination (mỗi line trúng hạng CAO NHẤT).
- Play type line expansion (Bao N → C(N,k) lines, Bao5 ghép bổ sung).
- Match result (main/special/bonus matching), input KHÔNG bị mutate.
- Jackpot financials + cycle transitions (đặc biệt power655 dual JP overflow, lotto535 split cycle).
- DrawId format `YYYY-MM-DD.NNN`, ticketNo format `{PREFIX}-{YYYYMMDD}-{NNNNN}`.

## Verify

- `pnpm --filter @megawin/game-power655 test` (và tương tự từng package).
