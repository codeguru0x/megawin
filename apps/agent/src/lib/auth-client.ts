/**
 * Better Auth – Client-side instance.
 *
 * Import từ "better-auth/react" để có reactive hooks (useSession, v.v.).
 * Client tự detect baseURL từ window.location nếu không set.
 *
 * @see https://better-auth.com/docs/integrations/next#create-a-client
 */

import { createAuthClient } from "better-auth/react";

// Type annotation tường minh để tránh lỗi "inferred type cannot be named"
// khi TypeScript cố gắng tham chiếu đến file .mjs nội bộ của better-auth.
export const authClient: ReturnType<typeof createAuthClient> = createAuthClient();

/**
 * Convenience exports – destructure các methods thường dùng.
 */
export const { signIn, signOut, useSession } = authClient;
