import "./src/env";

import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  transpilePackages: [
    "@megawin/app-core",
    "@megawin/game-bingo18",
    "@megawin/game-bingo18-application",
    "@megawin/game-core",
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
    "@megawin/identity",
    "@megawin/identity-application",
    "@megawin/next",
    "@megawin/shared",
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
};

export default nextConfig;
