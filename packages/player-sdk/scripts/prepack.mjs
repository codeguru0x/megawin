#!/usr/bin/env node
/**
 * prepack: Strip internal scripts from package.json before pnpm pack.
 * Saves original to .package.json.bak — restored by postpack.mjs.
 */
import { readFileSync, writeFileSync } from "fs";

const pkgPath = new URL("../package.json", import.meta.url).pathname;
const original = readFileSync(pkgPath, "utf8");

// Backup original
writeFileSync(pkgPath + ".bak", original, "utf8");

// Strip scripts for publishing
const pkg = JSON.parse(original);
pkg.scripts = {};
delete pkg.publishConfig; // publishConfig không cần thiết sau khi đã strip

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n", "utf8");

console.log("prepack: scripts stripped from package.json");
