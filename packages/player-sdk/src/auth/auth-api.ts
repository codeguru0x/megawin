/**
 * Auth API Module
 *
 * Quản lý vòng đời token: tự động refresh trước khi hết hạn.
 *
 * **Flow xác thực:**
 * 1. Server tenant gọi MegaWin server-to-server API lấy tokens (accessToken, idToken, refreshToken)
 * 2. Tenant server trả tokens về cho client
 * 3. Client truyền tokens vào `createPlayerClient({ tokens })` hoặc `auth.setTokens()`
 * 4. SDK tự động refresh trước khi hết hạn 5 phút
 * 5. Mọi request API tự gửi Bearer idToken (ID Token chứa `aud` + custom claims)
 *
 * @module
 */

import { ENDPOINTS } from "../endpoints";
import type { HttpClient } from "../http-client";
import type { TokenManager } from "./token-manager";
import type { AuthResult, AuthTokens } from "./types";

/**
 * Auth API interface.
 *
 * Quản lý token lifecycle cho player session.
 * Token được truyền trực tiếp từ tenant server — SDK không gọi authenticate.
 */
export interface AuthApi {
  /**
   * Cập nhật tokens cho session hiện tại.
   *
   * Gọi method này khi nhận được tokens từ tenant server.
   * Sau khi set, mọi request sẽ tự gửi Bearer idToken.
   * SDK tự động refresh trước khi hết hạn 5 phút.
   *
   * @param tokens - Tokens nhận từ tenant server
   *
   * @example
   * ```ts
   * // Tenant server trả tokens về client
   * const tokens = await yourServer.getPlayerTokens(playerId);
   *
   * // Set tokens vào SDK
   * await client.auth.setTokens({
   *   accessToken: tokens.accessToken,
   *   idToken: tokens.idToken,
   *   refreshToken: tokens.refreshToken,
   *   expiresAt: Date.now() + tokens.expiresIn * 1000,
   * });
   *
   * // Mọi request sau đó tự gửi Bearer token
   * const draw = await client.keno.getCurrentDraw();
   * ```
   */
  setTokens(tokens: AuthTokens): Promise<void>;

  /**
   * Lấy access token hiện tại (không trigger refresh).
   *
   * @returns Access token string hoặc `null`
   */
  getAccessToken(): Promise<string | null>;

  /**
   * Lấy toàn bộ thông tin tokens.
   *
   * @returns {@link AuthTokens} hoặc `null` nếu chưa set tokens
   */
  getTokens(): Promise<AuthTokens | null>;

  /**
   * Kiểm tra session đã có token hợp lệ chưa.
   *
   * @returns `true` nếu có ID token chưa hết hạn
   *
   * @example
   * ```ts
   * if (!(await client.auth.isAuthenticated())) {
   *   // Redirect về trang login hoặc lấy token mới từ server
   *   const tokens = await yourServer.getPlayerTokens(playerId);
   *   await client.auth.setTokens(tokens);
   * }
   * ```
   */
  isAuthenticated(): Promise<boolean>;
}

/** @internal */
export interface AuthApiDeps {
  publicHttp: HttpClient;
  authedHttp: HttpClient;
  tokenManager: TokenManager;
  onSessionExpired?: () => void;
}

/**
 * Tạo Auth API module.
 *
 * @internal
 */
export function createAuthApi(deps: AuthApiDeps): AuthApi {
  const { publicHttp, tokenManager, onSessionExpired } = deps;

  async function refreshTokens(refreshToken: string): Promise<AuthTokens | null> {
    try {
      const res = await publicHttp.post<AuthResult>(ENDPOINTS.auth.refresh, {
        refreshToken,
      });

      if (!res.idToken) {
        console.error("[MegaWin SDK] refresh: idToken missing in response");
        onSessionExpired?.();
        return null;
      }

      return {
        accessToken: res.accessToken,
        refreshToken,
        idToken: res.idToken,
        expiresAt: Date.now() + res.expiresIn * 1000,
      };
    } catch {
      onSessionExpired?.();
      return null;
    }
  }

  tokenManager.setRefreshFn(refreshTokens);

  return {
    async setTokens(tokens: AuthTokens): Promise<void> {
      if (!tokens.idToken) {
        console.warn(
          "[MegaWin SDK] setTokens: idToken is missing. " +
            "The server requires the ID Token for authorization (Bearer header). " +
            "Requests will fail with 401 until a valid idToken is provided.",
        );
      }
      await tokenManager.setTokens(tokens);
    },

    async getAccessToken(): Promise<string | null> {
      return tokenManager.getAccessToken();
    },

    async getTokens(): Promise<AuthTokens | null> {
      return tokenManager.getTokens();
    },

    async isAuthenticated(): Promise<boolean> {
      const token = await tokenManager.getIdToken();
      return token !== null;
    },
  };
}
