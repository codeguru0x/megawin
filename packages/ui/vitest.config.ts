import { jsdomConfig } from "@megawin/vitest-config";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  ...jsdomConfig,
  plugins: [react()],
  test: {
    ...jsdomConfig.test,
    include: ["test/unit/**/*.test.{ts,tsx}"],
  },
});
