import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "apps/api-player/vitest.config.ts",
  "packages/shared/vitest.config.ts",
  "packages/identity-application/vitest.config.ts",
  "packages/game-keno-application/vitest.config.ts",
  "packages/game-lotto535-application/vitest.config.ts",
  "packages/player-sdk/vitest.config.ts",
]);
