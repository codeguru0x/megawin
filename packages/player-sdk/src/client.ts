/**
 * MegaWin Player SDK Client
 *
 * Entry point chính — tạo client instance để gọi MegaWin API.
 *
 * **Auth flow:**
 * 1. Tenant server gọi MegaWin server-to-server API lấy tokens
 * 2. Tenant server trả tokens về cho client app
 * 3. Client truyền tokens vào `createPlayerClient({ tokens })` hoặc `client.auth.setTokens()`
 * 4. SDK tự động refresh accessToken trước khi hết hạn 5 phút
 * 5. SDK gửi ID token (Bearer) mỗi request, API Gateway HTTP API v2 JWT authorizer verify
 *
 * @module
 */

import type { ApiClientError } from "./api-types";
import { type Bingo18Api, createBingo18Api } from "./apis/bingo18";
import { createKenoApi, type KenoApi } from "./apis/keno";
import { createLotto535Api, type Lotto535Api } from "./apis/lotto535";
import { createMax3dApi, type Max3dApi } from "./apis/max3d";
import { createMax3dproApi, type Max3dproApi } from "./apis/max3dpro";
import { createMega645Api, type Mega645Api } from "./apis/mega645";
import { createPlayerApi, type PlayerApi } from "./apis/player";
import { createPower655Api, type Power655Api } from "./apis/power655";
import { type AuthApi, createAuthApi } from "./auth/auth-api";
import { SessionStorageTokenStorage, TokenManager } from "./auth/token-manager";
import type { AuthTokens, TokenStorage } from "./auth/types";
/// <reference lib="dom" />
import { createHttpClient, type HttpClient, type RequestConfig } from "./http-client";

// ============ Config ============

/**
 * Cấu hình khởi tạo Player SDK.
 *
 * @example
 * ```ts
 * // Cơ bản — set tokens sau
 * const client = createPlayerClient({
 *   baseUrl: "https://api.domain.com",
 * });
 * await client.auth.setTokens(tokensFromServer);
 *
 * // Đầy đủ — truyền tokens ngay khi tạo
 * const client = createPlayerClient({
 *   baseUrl: "https://api.domain.com",
 *   tokens: {
 *     accessToken: "eyJ...",
 *     refreshToken: "abc...",
 *     expiresAt: Date.now() + 3600_000,
 *   },
 *   onSessionExpired: () => redirectToLogin(),
 * });
 * ```
 */
export interface PlayerSdkConfig {
  /**
   * Base URL của API Gateway.
   *
   * @example "https://api.domain.com"
   */
  baseUrl: string;

  /**
   * Tokens nhận từ tenant server.
   *
   * Nếu truyền ở đây, SDK sẵn sàng gọi API ngay mà không cần `client.auth.setTokens()`.
   * SDK sẽ tự động refresh accessToken trước khi hết hạn 5 phút.
   *
   * @example
   * ```ts
   * // Tokens nhận từ tenant server
   * const tokens = await yourServer.getPlayerTokens(playerId);
   * const client = createPlayerClient({
   *   baseUrl: "https://api.domain.com",
   *   tokens,
   * });
   * ```
   */
  tokens?: AuthTokens;

  /**
   * Token storage adapter.
   *
   * Mặc định: {@link SessionStorageTokenStorage} — dùng `sessionStorage` (browser only).
   * Tokens tồn tại qua page reload, mất khi đóng tab.
   *
   * **Lựa chọn built-in:**
   *
   * | Storage                        | Persist qua reload? | Môi trường       |
   * |-------------------------------|---------------------|------------------|
   * | `SessionStorageTokenStorage`   | Có (trong tab)      | Browser          |
   * | `MemoryTokenStorage`           | Không               | Mọi môi trường   |
   *
   * Hoặc tự implement {@link TokenStorage} cho `localStorage`, `AsyncStorage`, v.v.
   *
   * @example
   * ```ts
   * import { createPlayerClient, MemoryTokenStorage } from "@megawin/player-sdk";
   *
   * // Node.js / React Native — dùng MemoryTokenStorage
   * const client = createPlayerClient({
   *   baseUrl: "...",
   *   tokenStorage: new MemoryTokenStorage(),
   * });
   *
   * // Custom localStorage adapter
   * const client = createPlayerClient({
   *   baseUrl: "...",
   *   tokenStorage: {
   *     getTokens: () => JSON.parse(localStorage.getItem("mw_tokens") ?? "null"),
   *     setTokens: (t) => localStorage.setItem("mw_tokens", JSON.stringify(t)),
   *     clearTokens: () => localStorage.removeItem("mw_tokens"),
   *   },
   * });
   * ```
   */
  tokenStorage?: TokenStorage;

  /**
   * Request timeout (milliseconds).
   *
   * @default 30000
   */
  timeout?: number;

  /**
   * Default headers gửi kèm mọi request.
   *
   * @example
   * ```ts
   * { headers: { "X-Tenant-Id": "tenant-abc" } }
   * ```
   */
  headers?: Record<string, string>;

  /**
   * Callback khi session hết hạn.
   *
   * Được gọi khi refresh token thất bại hoặc server trả 401.
   * Dùng để redirect về trang login hoặc lấy token mới.
   *
   * @example
   * ```ts
   * onSessionExpired: () => {
   *   window.location.href = "/login";
   * }
   * ```
   */
  onSessionExpired?: () => void;

  /**
   * Callback lỗi chung cho mọi API request.
   *
   * Dùng để log, hiển thị toast, tracking, ...
   *
   * @example
   * ```ts
   * onError: (error) => {
   *   console.error(`[MegaWin] ${error.code}: ${error.message}`);
   *   Sentry.captureException(error);
   * }
   * ```
   */
  onError?: (error: ApiClientError) => void | Promise<void>;
}

// ============ Client Interface ============

/**
 * MegaWin Player SDK Client.
 *
 * Facade tổng hợp tất cả API modules.
 * Tạo bằng {@link createPlayerClient}.
 *
 * @example
 * ```ts
 * import { createPlayerClient } from "@megawin/player-sdk";
 *
 * // 1. Tạo client với tokens từ tenant server
 * const client = createPlayerClient({
 *   baseUrl: "https://api.domain.com",
 *   tokens: tokensFromServer,
 *   onSessionExpired: () => redirectToLogin(),
 * });
 *
 * // 2. Gọi API
 * const balance = await client.player.getBalance();
 * const kenoResult = await client.keno.placeBet({ ... });
 * const lottoResult = await client.lotto535.placeBet({ ... });
 *
 * // 3. Logout khi cần
 * await client.auth.logout();
 * ```
 */
export interface PlayerClient {
  /**
   * Raw HTTP client đã bind auth.
   */
  readonly api: HttpClient;

  /** Auth API — quản lý token lifecycle. */
  readonly auth: AuthApi;

  /** Keno API */
  readonly keno: KenoApi;

  /** Lotto 5/35 API */
  readonly lotto535: Lotto535Api;

  /** Mega 6/45 API */
  readonly mega645: Mega645Api;

  /** Power 6/55 API */
  readonly power655: Power655Api;

  /** Max 3D API */
  readonly max3d: Max3dApi;

  /** Max 3D Pro API */
  readonly max3dpro: Max3dproApi;

  /** Bingo 18 API */
  readonly bingo18: Bingo18Api;

  /**
   * Player API — số dư, lịch sử cược, kết quả game.
   */
  readonly player: PlayerApi;
}

// ============ Factory ============

/**
 * Tạo MegaWin Player SDK client.
 *
 * @param config - Cấu hình SDK
 * @returns {@link PlayerClient} instance sẵn sàng gọi API
 *
 * @example
 * ```ts
 * import { createPlayerClient } from "@megawin/player-sdk";
 *
 * // Tokens nhận từ tenant server (server-to-server call)
 * const tokens = await yourServer.getPlayerTokens(playerId);
 *
 * const client = createPlayerClient({
 *   baseUrl: "https://api.domain.com",
 *   tokens,
 *   onSessionExpired: () => {
 *     window.location.href = "/login";
 *   },
 * });
 *
 * // Sẵn sàng gọi API
 * const balance = await client.player.getBalance();
 * ```
 */
export function createPlayerClient(config: PlayerSdkConfig): PlayerClient {
  const {
    baseUrl,
    tokens: initialTokens,
    tokenStorage = new SessionStorageTokenStorage(),
    timeout,
    headers: defaultHeaders,
    onSessionExpired,
    onError,
  } = config;

  const tokenManager = new TokenManager(tokenStorage);

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

  async function injectBearerToken(reqConfig: RequestConfig): Promise<RequestConfig> {
    if (reqConfig.headers["Authorization"] === "") {
      const { Authorization: _, ...rest } = reqConfig.headers;
      return { ...reqConfig, headers: rest };
    }

    const bearerToken = await tokenManager.getIdToken();
    if (bearerToken) {
      return {
        ...reqConfig,
        headers: {
          ...reqConfig.headers,
          Authorization: `Bearer ${bearerToken}`,
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

  // ---- Build API modules ----

  const auth = createAuthApi({
    publicHttp: publicClient,
    authedHttp: authedClient,
    tokenManager,
    onSessionExpired,
  });

  const keno = createKenoApi(authedClient);
  const lotto535 = createLotto535Api(authedClient);
  const mega645 = createMega645Api(authedClient);
  const power655 = createPower655Api(authedClient);
  const max3d = createMax3dApi(authedClient);
  const max3dpro = createMax3dproApi(authedClient);
  const bingo18 = createBingo18Api(authedClient);
  const player = createPlayerApi(authedClient);

  // ---- Set initial tokens if provided ----

  if (initialTokens) {
    void auth.setTokens(initialTokens);
  }

  return {
    api: authedClient,
    auth,
    keno,
    lotto535,
    mega645,
    power655,
    max3d,
    max3dpro,
    bingo18,
    player,
  };
}
