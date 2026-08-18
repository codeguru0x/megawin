import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    /** Better Auth */
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url(),

    /**
     * AI Gateway — eve agent (AI Panel, `apps/backoffice/agent/`).
     *
     * BẮT BUỘC ở local, TUỲ CHỌN trên Vercel — không phải cho gọn code mà vì hai môi trường có
     * hai cơ chế auth khác nhau:
     * - Local: không có OIDC token của project ⇒ phải có API key, thiếu là agent không gọi được model.
     * - Trên Vercel (`process.env.VERCEL` set, gồm cả `vercel dev`): deployment authenticate bằng
     *   project OIDC, eve không cần key. Nếu vẫn bắt buộc ở đây thì `import "./src/env"` trong
     *   `next.config.ts` sẽ làm FAIL BUILD dù deployment hoàn toàn đủ điều kiện chạy — tức schema
     *   này tự chặn mất đường auth chính thức của Vercel.
     *
     * ⚠️ Optional KHÔNG có nghĩa "trên Vercel khỏi cần lo": nếu project TẮT OIDC federation thì
     * không có token, và lúc đó PHẢI set biến này trong project env — nếu không agent chỉ chết lúc
     * staff gửi tin nhắn đầu tiên (runtime), không chết lúc build.
     */
    AI_GATEWAY_API_KEY: process.env.VERCEL ? z.string().min(1).optional() : z.string().min(1),
    /** Override model ID (Vercel AI Gateway) — không set thì dùng default trong `agent/agent.ts`. */
    EVE_AGENT_MODEL: z.string().optional(),

    /** Cognito Workforce */
    COGNITO_WORKFORCE_CLIENT_ID: z.string().min(1),
    COGNITO_WORKFORCE_DOMAIN: z.string().min(1),
    COGNITO_WORKFORCE_REGION: z.string().min(1),
    COGNITO_WORKFORCE_POOL_ID: z.string().min(1),

    /** Cognito Player */
    COGNITO_PLAYER_POOL_ID: z.string().min(1),

    /** MongoDB */
    MONGODB_URI: z.string().min(1),

    /** Redis */
    REDIS_URI: z.string().min(1),

    /** Step Function ARNs */

    /** Settle Step Function ARNs */
    KENO_SETTLE_SFN_ARN: z.string().min(1),
    BINGO18_SETTLE_SFN_ARN: z.string().min(1),
    LOTTO535_SETTLE_SFN_ARN: z.string().min(1),
    MEGA645_SETTLE_SFN_ARN: z.string().min(1),
    POWER655_SETTLE_SFN_ARN: z.string().min(1),
    MAX3D_SETTLE_SFN_ARN: z.string().min(1),
    MAX3DPRO_SETTLE_SFN_ARN: z.string().min(1),

    /** Void Step Function ARNs */
    KENO_VOID_SFN_ARN: z.string().min(1),
    BINGO18_VOID_SFN_ARN: z.string().min(1),
    LOTTO535_VOID_SFN_ARN: z.string().min(1),
    MEGA645_VOID_SFN_ARN: z.string().min(1),
    POWER655_VOID_SFN_ARN: z.string().min(1),
    MAX3D_VOID_SFN_ARN: z.string().min(1),
    MAX3DPRO_VOID_SFN_ARN: z.string().min(1),

    /** Resettle Step Function ARNs */
    KENO_RESETTLE_SFN_ARN: z.string().min(1),
    BINGO18_RESETTLE_SFN_ARN: z.string().min(1),
    MAX3D_RESETTLE_SFN_ARN: z.string().min(1),
    MAX3DPRO_RESETTLE_SFN_ARN: z.string().min(1),
    POWER655_RESETTLE_SFN_ARN: z.string().min(1),
    LOTTO535_RESETTLE_SFN_ARN: z.string().min(1),
    MEGA645_RESETTLE_SFN_ARN: z.string().min(1),
  },

  client: {
    NEXT_PUBLIC_SITE_URL: z.url(),
    /** Môi trường deploy: `"development"` | `"staging"` | `"production"`. */
    NEXT_PUBLIC_APP_ENV: z.enum(["development", "staging", "production"]),
    /**
     * Bật nhãn chi tiết theo tool ("Đã đọc cấu hình game · 7 lần") ở mục "Chi tiết xử lý" của AI
     * Chat — mặc định TẮT (staff chỉ thấy nhãn tĩnh "Xem dữ liệu nguồn", xem `internal-steps.tsx`).
     *
     * TÁCH KHỎI `NEXT_PUBLIC_APP_ENV` có chủ đích: đây là toggle của MỘT tính năng debug, không
     * nên tự động ăn theo môi trường deploy — dev local nhiều lúc cần xem đúng UI staff sẽ thấy
     * (tắt), còn staging đôi khi cần bật tạm để điều tra một ca staff báo lỗi (không cần đổi env
     * deploy để làm việc đó).
     */
    NEXT_PUBLIC_AI_CHAT_DEBUG: z.enum(["true", "false"]).default("false"),
  },

  experimental__runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
    NEXT_PUBLIC_AI_CHAT_DEBUG: process.env.NEXT_PUBLIC_AI_CHAT_DEBUG,
  },
});
