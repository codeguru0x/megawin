import { execSync } from "node:child_process";

export function setup() {
  console.log("[globalSetup] Building workspace dependencies...");
  execSync("turbo build --filter=@megawin/game-max3dpro-application^...", {
    cwd: new URL("../../", import.meta.url).pathname,
    stdio: "inherit",
  });
  console.log("[globalSetup] Dependencies built.");
}
