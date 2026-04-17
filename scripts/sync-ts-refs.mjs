#!/usr/bin/env node
/**
 * sync-ts-refs.mjs
 *
 * Tự động sync "references" trong tsconfig.json của mỗi package/app
 * dựa trên workspace dependencies trong package.json.
 *
 * Chạy tất cả:
 *   node scripts/sync-ts-refs.mjs
 *
 * Chạy 1 hoặc nhiều package (tên package hoặc path tương đối từ root):
 *   node scripts/sync-ts-refs.mjs packages/game-core-application
 *   node scripts/sync-ts-refs.mjs @megawin/game-core-application
 *   node scripts/sync-ts-refs.mjs packages/game-core-application apps/backoffice
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { resolve, relative, dirname } from "path";
import { execSync } from "child_process";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");

// Lấy tất cả workspace packages từ pnpm
function getWorkspacePackages() {
  const output = execSync("pnpm list -r --depth -1 --json", {
    cwd: ROOT,
    encoding: "utf-8",
  });
  return JSON.parse(output);
}

// Map: packageName → absolute path
function buildNameToPathMap(packages) {
  const map = new Map();
  for (const pkg of packages) {
    if (pkg.name && pkg.path) {
      map.set(pkg.name, pkg.path);
    }
  }
  return map;
}

function readJson(filePath) {
  return JSON.parse(readFileSync(filePath, "utf-8"));
}

function writeJson(filePath, data) {
  writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8");
}

function syncPackage(pkgPath, nameToPath) {
  const pkgJsonPath = resolve(pkgPath, "package.json");
  const tsconfigPath = resolve(pkgPath, "tsconfig.json");

  if (!existsSync(pkgJsonPath) || !existsSync(tsconfigPath)) return;

  const pkgJson = readJson(pkgJsonPath);
  const tsconfig = readJson(tsconfigPath);

  const allDeps = {
    ...pkgJson.dependencies,
    ...pkgJson.devDependencies,
    ...pkgJson.peerDependencies,
  };

  const newRefs = [];

  for (const [depName, depVersion] of Object.entries(allDeps)) {
    // Chỉ xét workspace dependencies
    if (depVersion !== "workspace:*" && !String(depVersion).startsWith("workspace:")) continue;

    const depPath = nameToPath.get(depName);
    if (!depPath) continue;

    const depTsconfig = resolve(depPath, "tsconfig.json");
    if (!existsSync(depTsconfig)) continue;

    const relPath = relative(pkgPath, depPath).replace(/\\/g, "/");
    newRefs.push({ path: relPath });
  }

  // Sắp xếp để diff ổn định
  newRefs.sort((a, b) => a.path.localeCompare(b.path));

  const currentRefs = tsconfig.references ?? [];
  const currentSorted = [...currentRefs].sort((a, b) => a.path.localeCompare(b.path));

  const isSame = JSON.stringify(currentSorted) === JSON.stringify(newRefs);

  if (isSame) return;

  tsconfig.references = newRefs.length > 0 ? newRefs : undefined;

  writeJson(tsconfigPath, tsconfig);

  const rel = relative(ROOT, tsconfigPath);
  console.log(`updated  ${rel}`);
}

async function main() {
  const filters = process.argv.slice(2);

  const packages = getWorkspacePackages();
  const nameToPath = buildNameToPathMap(packages);

  // Resolve filter thành absolute path (hỗ trợ cả tên package và relative path)
  const filterPaths = filters
    .map((f) => {
      // Nếu là package name (bắt đầu bằng @)
      if (f.startsWith("@") || nameToPath.has(f)) return nameToPath.get(f);
      // Nếu là relative path từ root
      return resolve(ROOT, f);
    })
    .filter(Boolean);

  const targets = packages.filter((pkg) => {
    if (!pkg.path || pkg.path === ROOT) return false;
    if (filterPaths.length === 0) return true;
    return filterPaths.includes(pkg.path);
  });

  if (filterPaths.length > 0 && targets.length === 0) {
    console.error(`không tìm thấy package nào khớp với: ${filters.join(", ")}`);
    process.exit(1);
  }

  const label = filterPaths.length === 0 ? "tất cả packages" : filters.join(", ");
  console.log(`syncing TypeScript project references (${label})...\n`);

  for (const pkg of targets) {
    syncPackage(pkg.path, nameToPath);
  }

  console.log(`\ndone — checked ${targets.length} packages`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
