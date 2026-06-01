import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    /** Better Auth */
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url(),

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
  },

  client: {
    NEXT_PUBLIC_SITE_URL: z.url(),
    /** Môi trường deploy: `"development"` | `"staging"` | `"production"`. */
    NEXT_PUBLIC_APP_ENV: z.enum(["development", "staging", "production"]),
  },

  experimental__runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
    NEXT_PUBLIC_APP_ENV: process.env.NEXT_PUBLIC_APP_ENV,
  },
});
