import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    globals: true,
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 10_000,
    // Cho phép scaffold config trước khi viết *.test.ts (test case viết sau) — tránh chặn CI.
    passWithNoTests: true,
  },
});
