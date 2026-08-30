import "./src/env";

import { withEve } from "eve/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Statically Typed Links (stable từ Next 15) — compiler tự sinh union tất cả route thật từ
  // `src/app/**` vào `.next/types`, ép mọi `<Link href>`/`router.push()` khớp cấu trúc file
  // THẬT. Đổi/xoá 1 folder route → build đỏ ngay tại chỗ gọi, không phải 404 lặng lẽ lúc runtime.
  // Không thay được cho `nav-registry.ts` (chỉ validate PATH, không validate query string/enum
  // tab) — 2 lớp bổ sung nhau, không lớp nào dư.
  typedRoutes: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  serverExternalPackages: ["@aws-sdk/client-cognito-identity-provider", "@aws-sdk/client-sfn", "mongodb"],
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

// agent/ nằm ngay trong app này — cùng dev server, cùng deploy Vercel (00-overview.md
// "eve NGAY TỪ P0"). Mặc định withEve() tự tìm `agent/` ở root project, không cần eveRoot.
export default withEve(nextConfig);
