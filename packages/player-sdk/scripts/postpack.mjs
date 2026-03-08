#!/usr/bin/env node
/**
 * postpack: Restore package.json from backup created by prepack.mjs.
 */
import { readFileSync, writeFileSync, unlinkSync, existsSync } from "fs";

const pkgPath = new URL("../package.json", import.meta.url).pathname;
const bakPath = pkgPath + ".bak";

if (existsSync(bakPath)) {
  const original = readFileSync(bakPath, "utf8");
  writeFileSync(pkgPath, original, "utf8");
  unlinkSync(bakPath);
  console.log("postpack: package.json restored");
} else {
  console.warn("postpack: no backup found, skipping restore");
}
