import { execSync } from "node:child_process";

/**
 * Vitest globalSetup — build workspace dependencies trước khi chạy test.
 * Đảm bảo dist/ tồn tại cho tất cả @megawin/* packages.
 * Chạy tự động khi dùng Vitest IDE extension hoặc CLI.
 */
export function setup() {
  console.log("[globalSetup] Building workspace dependencies...");
  execSync("turbo run build --filter=@megawin/worker-tenant-dispatch^...", {
    cwd: new URL("../../", import.meta.url).pathname,
    stdio: "inherit",
  });
  console.log("[globalSetup] Dependencies built.");
}
