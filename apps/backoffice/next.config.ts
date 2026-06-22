import "./src/env";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: [
    "@megawin/app-core",
    "@megawin/data",
    "@megawin/game-bingo18",
    "@megawin/game-bingo18-application",
    "@megawin/game-core",
    "@megawin/game-core-application",
    "@megawin/game-keno",
    "@megawin/game-keno-application",
    "@megawin/game-lotto535",
    "@megawin/game-lotto535-application",
    "@megawin/game-max3d",
    "@megawin/game-max3d-application",
    "@megawin/game-max3dpro",
    "@megawin/game-max3dpro-application",
    "@megawin/game-mega645",
    "@megawin/game-mega645-application",
    "@megawin/game-power655",
    "@megawin/game-power655-application",
    "@megawin/http-client",
    "@megawin/identity",
    "@megawin/identity-application",
    "@megawin/next",
    "@megawin/ops-docs",
    "@megawin/shared",
    "@megawin/tenant-gateway",
  ],
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
  // Turbopack (dev): dùng raw-loader. Webpack (production build): asset/source.
  turbopack: {
    rules: {
      "*.md": {
        loaders: ["raw-loader"],
        as: "*.js",
      },
    },
  },
  webpack: (config) => {
    config.module.rules.push({
      test: /\.md$/,
      type: "asset/source",
    });
    return config;
  },
};

export default nextConfig;
