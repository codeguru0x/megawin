import "./src/env";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  serverExternalPackages: [
    "@aws-sdk/client-cognito-identity-provider",
    "@aws-sdk/client-sfn",
    "mongodb",
  ],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "@radix-ui/react-icons"],
  },
  // Cho phép import nội dung file .md dạng raw string (bản staff ops-docs).
  // Next 16 dùng Turbopack cho cả `next dev` lẫn `next build` → rule .md ở đây
  // áp dụng cho mọi môi trường.
  turbopack: {
    rules: {
      "*.md": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
};

export default nextConfig;
