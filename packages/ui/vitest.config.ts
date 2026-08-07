import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { jsdomConfig } from "@megawin/vitest-config";

export default defineConfig({
  ...jsdomConfig,
  plugins: [react()],
  test: {
    ...jsdomConfig.test,
    include: ["test/**/*.test.{ts,tsx}"],
  },
});
