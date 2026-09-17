import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths({ projects: ["./tsconfig.json"] })],
  test: {
    globals: true,
    environment: "node",
    include: ["test/unit/**/*.test.ts"],
    setupFiles: ["test/setup.ts"],
    testTimeout: 10_000,
    passWithNoTests: true,
  },
});
