import { execSync } from "node:child_process";

/**
 * Vitest globalSetup — build workspace dependencies trước khi chạy test.
 */
export function setup() {
  console.log("[globalSetup] Building workspace dependencies...");
  execSync("turbo build --filter=@megawin/game-max3d-application^...", {
    cwd: new URL("../../", import.meta.url).pathname,
    stdio: "inherit",
  });
  console.log("[globalSetup] Dependencies built.");
}
