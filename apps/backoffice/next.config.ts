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
  // Cache Components (PPR) — opt-in per `'use cache'`. Hiện chỉ `/guides` dùng (p2-01).
  // Không tự cache Hub/settle; data ops vẫn RQ.
  cacheComponents: true,
  // Prefetch App Shell thay vì full uncached dynamic per-link (p2-01b). Cần cacheComponents.
  // Sidebar `<Link prefetch>` → shell; `/guides` thêm vùng đã `'use cache'`.
  partialPrefetching: true,
  compiler: {
    removeConsole: process.env.NODE_ENV === "production",
  },
  serverExternalPackages: ["@aws-sdk/client-cognito-identity-provider", "@aws-sdk/client-sfn", "mongodb"],
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns", "@radix-ui/react-icons"],
    // Client Router Cache — TTL trong **tab browser** (memory), KHÔNG phải CDN Vercel.
    // Deploy Vercel KHÔNG tự xoá cache này; hard refresh / tab mới / hết TTL mới refetch shell.
    // Backoffice: shell UI ít đổi, data sống ở RQ → TTL dài OK. Giới hạn thực tế = role/nav
    // trong shell có thể cũ tối đa TTL (app nội bộ, chấp nhận được).
    // Best practice: 30 phút (1800s). Không Infinity — vẫn muốn refresh shell định kỳ.
    staleTimes: {
      dynamic: 1800,
      static: 1800,
    },
    // Giảm nhiễu overlay validate toàn app khi cacheComponents bật (p2-01 §4.1).
    // Bật lại validation tường minh khi làm Instant Navigation (p2-03/p3).
    instantInsights: { validationLevel: "manual-warning" },
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
