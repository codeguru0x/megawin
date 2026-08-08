import { jsdomConfig } from "@megawin/vitest-config";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

import path from "node:path";

export default defineConfig({
  ...jsdomConfig,
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    ...jsdomConfig.test,
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
