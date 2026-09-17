import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Build mọi workspace dependency của package đang chạy test (turbo `^...`).
 * Đọc tên package từ `package.json` của `process.cwd()` — generic cho MỌI
 * package gọi global-setup này, không hardcode tên như bản cũ per-package.
 */
export function buildWorkspaceDeps(): void {
  const pkgJsonPath = path.join(process.cwd(), "package.json");
  const { name } = JSON.parse(readFileSync(pkgJsonPath, "utf-8")) as { name: string };

  console.log(`[globalSetup] Building workspace dependencies for ${name}...`);
  // cwd() bên trong monorepo turbo đủ để turbo tự tìm root — không cần "../../" path math.
  execSync(`turbo build --filter=${name}^...`, { cwd: process.cwd(), stdio: "inherit" });
  console.log("[globalSetup] Dependencies built.");
}
