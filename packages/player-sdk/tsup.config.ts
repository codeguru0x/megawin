import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: {
      index: "src/index.ts",
      keno: "src/keno/index.ts",
      lotto535: "src/lotto535/index.ts",
    },
    format: ["cjs", "esm"],
    dts: true,
    clean: true,
    splitting: false,
    sourcemap: true,
    treeshake: true,
    minify: false,
    target: "es2022",
    outDir: "dist",
  },
  {
    entry: { "megawin-player-sdk-browser": "src/index.ts" },
    format: ["iife"],
    globalName: "MegaWin",
    platform: "browser",
    target: "es2020",
    minify: true,
    sourcemap: true,
    treeshake: true,
    outDir: "dist",
  },
]);
