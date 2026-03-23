import { apiClient } from "@megawin/next/client";
import { signOut } from "@/lib/auth-client";

interface SignOutRedirectResponse {
  redirectUrl: string;
}

/**
 * Sign out khỏi better-auth session và terminate Cognito SSO session.
 *
 * Flow quan trọng:
 * 1. Fetch Cognito logout URL **trước** khi signOut (vì API route cần session).
 * 2. Gọi better-auth signOut() để xóa cookie session phía app.
 * 3. Redirect sang Cognito /logout để terminate SSO session.
 *
 * Nếu fetch thất bại, vẫn signOut và fallback về /login.
 */
export async function signOutAndRedirect(): Promise<void> {
  // Lấy Cognito logout URL trước khi xóa session — API route yêu cầu authenticated.
  let cognitoLogoutUrl: string | null = null;
  try {
    const { redirectUrl } =
      await apiClient.post<SignOutRedirectResponse>("/auth/sign-out-redirect");
    cognitoLogoutUrl = redirectUrl;
  } catch {
    // Nếu không lấy được URL, vẫn tiếp tục signOut — fallback về /login.
  }

  await signOut({
    fetchOptions: {
      onSuccess: () => {
        // Redirect sang Cognito /logout để terminate SSO session,
        // hoặc fallback về /login nếu không có URL.
        window.location.href = cognitoLogoutUrl ?? "/login";
      },
    },
  });
}
