import { defineConfig } from "tsdown";

/**
 * Library build (CJS + ESM + dts) + browser IIFE.
 *
 * Artifact names phải khớp package.json exports / upload-s3.sh:
 * - `dist/{name}.{js,cjs,d.ts,d.cts}`
 * - `dist/megawin-player-sdk-browser.global.js` (window.MegaWin)
 *
 * `fixedExtension: false` + `"type": "module"` → ESM `.js`/`.d.ts` (không `.mjs`/`.d.mts`).
 */
export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      keno: "src/keno/index.ts",
      lotto535: "src/lotto535/index.ts",
      mega645: "src/mega645/index.ts",
      power655: "src/power655/index.ts",
      max3d: "src/max3d/index.ts",
      max3dpro: "src/max3dpro/index.ts",
      bingo18: "src/bingo18/index.ts",
      game: "src/game/index.ts",
    },
    format: ["esm", "cjs"],
    dts: true,
    clean: true,
    sourcemap: true,
    minify: false,
    target: "es2022",
    outDir: "dist",
    // `"type": "module"` → ESM `.js`/`.d.ts` (không `.mjs`/`.d.mts`).
    // Giữ hash mặc định — shared dts chunk không chiếm tên entry `index.d.ts`.
    fixedExtension: false,
  },
  {
    entry: { "megawin-player-sdk-browser": "src/index.ts" },
    format: ["iife"],
    globalName: "MegaWin",
    platform: "browser",
    target: "es2020",
    minify: true,
    sourcemap: true,
    clean: false,
    outDir: "dist",
    outputOptions: {
      entryFileNames: "[name].global.js",
    },
  },
]);
