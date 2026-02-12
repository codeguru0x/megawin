/**
 * Better Auth – Client-side instance.
 *
 * Import từ "better-auth/react" để có reactive hooks (useSession, v.v.).
 * Client tự detect baseURL từ window.location nếu không set.
 *
 * @see https://better-auth.com/docs/integrations/next#create-a-client
 */

import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient();

/**
 * Convenience exports – destructure các methods thường dùng.
 */
export const {
  signIn,
  signOut,
  useSession,
} = authClient;
