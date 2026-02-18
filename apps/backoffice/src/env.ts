import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  server: {
    BETTER_AUTH_SECRET: z.string().min(1),
    BETTER_AUTH_URL: z.url(),
    COGNITO_CLIENT_ID: z.string().min(1),
    COGNITO_DOMAIN: z.string().min(1),
    COGNITO_REGION: z.string().min(1),
    COGNITO_USERPOOL_ID: z.string().min(1),

    MONGODB_URI: z.string().min(1),
    REDIS_URI: z.string().min(1),
  },

  client: {
    NEXT_PUBLIC_SITE_URL: z.url(),
  },

  experimental__runtimeEnv: {
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  },
});
