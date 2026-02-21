/// <reference lib="dom" />
import {
  createHttpClient,
  type HttpClient,
  type RequestConfig,
  ApiClientError,
} from "@megawin/http-client";
import { TokenManager, MemoryTokenStorage } from "./token-manager";
import type {
  AuthTokens,
  AuthenticateInput,
  AuthResult,
  TokenStorage,
} from "./types";

// ============ Config ============

export interface PlayerSdkConfig {
  /** Base URL của API Gateway (vd "https://api.megawin.com"). */
  baseUrl: string;
  /** Custom token storage. Mặc định: in-memory. */
  tokenStorage?: TokenStorage;
  /** Request timeout ms. Mặc định: 30000. */
  timeout?: number;
  /** Default headers gửi kèm mọi request. */
  headers?: Record<string, string>;

  /** Endpoint authenticate. Mặc định: "/auth/token". */
  authPath?: string;
  /** Endpoint refresh token. Mặc định: "/auth/refresh". */
  refreshPath?: string;
  /** Endpoint logout (revoke). Mặc định: "/auth/logout". */
  logoutPath?: string;

  /** Callback khi session hết hạn (refresh thất bại hoặc 401). */
  onSessionExpired?: () => void;
  /** Callback lỗi chung. */
  onError?: (error: ApiClientError) => void;
}

// ============ Interface ============

export interface PlayerClient {
  /** HTTP client đã bind auth – dùng cho mọi API call. */
  readonly api: HttpClient;

  /**
   * Xác thực bằng signed JWT assertion.
   *
   * Server khách hàng tạo JWT bằng private key → gửi qua SDK →
   * MegaWin Cognito custom auth trigger verify bằng JWKS →
   * trả Cognito tokens.
   *
   * Sau khi thành công, mọi request tự gửi Bearer access token.
   * Thất bại → throw ApiClientError.
   */
  authenticate(input: AuthenticateInput): Promise<AuthTokens>;

  /** Logout – revoke token trên server + xóa local. */
  logout(): Promise<void>;

  /** Access token hiện tại (null nếu chưa authenticate). */
  getAccessToken(): Promise<string | null>;

  /** Toàn bộ token info (null nếu chưa authenticate). */
  getTokens(): Promise<AuthTokens | null>;

  /** Đã authenticate và token chưa hết hạn? */
  isAuthenticated(): Promise<boolean>;
}

// ============ Factory ============

/**
 * Tạo Player SDK client.
 *
 * @example
 * ```ts
 * const client = createPlayerClient({
 *   baseUrl: "https://api.megawin.com",
 * });
 *
 * // Server khách hàng tạo signed JWT assertion bằng private key
 * const signedToken = await yourServer.createSignedJwt(playerId);
 *
 * // Gửi assertion lên MegaWin → Cognito verify → nhận tokens
 * const tokens = await client.authenticate({ token: signedToken });
 *
 * // Mọi request sau tự gửi Bearer access token (Cognito JWT)
 * const games = await client.api.get<Game[]>("/games");
 *
 * // Public route – bypass token
 * const info = await client.api.get<Info>("/public/info", {
 *   headers: { Authorization: "" },
 * });
 *
 * // Logout
 * await client.logout();
 * ```
 */
export function createPlayerClient(config: PlayerSdkConfig): PlayerClient {
  const {
    baseUrl,
    tokenStorage = new MemoryTokenStorage(),
    timeout,
    headers: defaultHeaders,
    authPath = "/auth/token",
    refreshPath = "/auth/refresh",
    logoutPath = "/auth/logout",
    onSessionExpired,
    onError,
  } = config;

  const tokenManager = new TokenManager(tokenStorage, refreshAccessToken);

  const publicClient = createHttpClient({
    baseUrl,
    timeout,
    headers: defaultHeaders,
    onError,
  });

  const authedClient = createHttpClient({
    baseUrl,
    timeout,
    headers: defaultHeaders,
    onRequest: injectBearerToken,
    onError: handleAuthError,
  });

  // ---- Token injection ----

  async function injectBearerToken(
    reqConfig: RequestConfig,
  ): Promise<RequestConfig> {
    if (reqConfig.headers["Authorization"] === "") {
      const { Authorization: _, ...rest } = reqConfig.headers;
      return { ...reqConfig, headers: rest };
    }

    const accessToken = await tokenManager.getAccessToken();
    if (accessToken) {
      return {
        ...reqConfig,
        headers: {
          ...reqConfig.headers,
          Authorization: `Bearer ${accessToken}`,
        },
      };
    }
    return reqConfig;
  }

  async function handleAuthError(error: ApiClientError): Promise<void> {
    if (error.status === 401) {
      await tokenManager.clearTokens();
      onSessionExpired?.();
    }
    if (onError) await onError(error);
  }

  // ---- Refresh ----

  async function refreshAccessToken(
    refreshToken: string,
  ): Promise<AuthTokens | null> {
    try {
      const res = await publicClient.post<AuthResult>(refreshPath, {
        refreshToken,
      });

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

  // ---- Auth actions ----

  async function authenticate(input: AuthenticateInput): Promise<AuthTokens> {
    const res = await publicClient.post<AuthResult>(authPath, {
      token: input.token,
    });

    const tokens: AuthTokens = {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      idToken: res.idToken,
      expiresAt: Date.now() + res.expiresIn * 1000,
    };

    await tokenManager.setTokens(tokens);
    return tokens;
  }

  async function logout(): Promise<void> {
    const tokens = await tokenManager.getTokens();
    try {
      if (tokens?.refreshToken) {
        await authedClient.post(logoutPath, {
          refreshToken: tokens.refreshToken,
        });
      }
    } catch {
      // Best-effort – không block logout nếu server lỗi.
    } finally {
      await tokenManager.clearTokens();
    }
  }

  async function getAccessToken(): Promise<string | null> {
    return tokenManager.getAccessToken();
  }

  async function getTokens(): Promise<AuthTokens | null> {
    return tokenManager.getTokens();
  }

  async function isAuthenticated(): Promise<boolean> {
    const token = await tokenManager.getAccessToken();
    return token !== null;
  }

  return {
    api: authedClient,
    authenticate,
    logout,
    getAccessToken,
    getTokens,
    isAuthenticated,
  };
}
