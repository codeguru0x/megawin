/**
 * Auth types cho Player SDK.
 *
 * Auth flow:
 * 1. Server khách hàng tạo signed JWT bằng private key
 * 2. SDK gửi JWT assertion lên MegaWin API Gateway
 * 3. Cognito custom auth trigger verify bằng JWKS public key của khách hàng
 * 4. Thành công → trả Cognito tokens (access, refresh, id)
 * 5. SDK gửi ID token (Bearer) mỗi request, API Gateway HTTP API v2 JWT authorizer verify
 *    qua Cognito JWKS — ID Token chứa `aud` (= Client ID) và custom attributes cần thiết
 * 6. Token hết hạn → SDK dùng refresh token lấy token mới
 */

export interface AuthTokens {
  /** Cognito Access Token (JWT) – dùng cho Cognito user APIs (getUserInfo, etc.). */
  accessToken: string;
  /** Cognito Refresh Token – dùng lấy access/id token mới khi hết hạn. */
  refreshToken: string;
  /**
   * Cognito ID Token (JWT) – gửi qua Bearer header cho API Gateway.
   *
   * ID Token chứa `aud` claim (= Client ID) match với `audience` của JWT authorizer,
   * và custom attributes (`custom:tenant_id`, `custom:account_id`, `custom:roles`...)
   * cần thiết cho authorization. Access Token không có `aud` nên sẽ bị reject.
   */
  idToken: string;
  /** Thời điểm token hết hạn (epoch ms). */
  expiresAt: number;
}

/**
 * Input cho authenticate – chuỗi JWT assertion đã signed bởi server khách hàng.
 */
export interface AuthenticateInput {
  /** Signed JWT assertion (tạo bởi server khách hàng bằng private key). */
  token: string;
}

/**
 * Response từ server khi login hoặc refresh token thành công.
 *
 * Map 1:1 với Cognito `AuthenticationResult`:
 * - `accessToken`  → `AccessToken`
 * - `idToken`      → `IdToken`
 * - `refreshToken` → `RefreshToken` (chỉ có khi login, refresh flow không trả lại)
 * - `expiresIn`    → `ExpiresIn` (giây)
 * - `tokenType`    → `TokenType` (luôn là `"Bearer"`)
 */
export interface AuthResult {
  /** Cognito Access Token (JWT). */
  accessToken: string;
  /** Cognito ID Token (JWT) – chứa custom attributes và `aud` claim. */
  idToken: string;
  /** Cognito Refresh Token – chỉ có khi login, refresh flow không trả lại. */
  refreshToken?: string;
  /** Thời gian sống của token (giây). Mặc định 3600. */
  expiresIn: number;
  /** Loại token — luôn là `"Bearer"`. */
  tokenType: string;
}

/**
 * Adapter lưu trữ token — consumer tự chọn storage.
 *
 * **Built-in implementations:**
 * - {@link SessionStorageTokenStorage} — `sessionStorage` (browser only, **mặc định**)
 * - {@link MemoryTokenStorage} — in-memory (mọi môi trường, mất khi reload)
 *
 * Hoặc tự implement cho `localStorage`, `AsyncStorage`, `SecureStore`, v.v.
 *
 * @example
 * ```ts
 * // Custom localStorage adapter
 * const storage: TokenStorage = {
 *   getTokens: () => JSON.parse(localStorage.getItem("mw_tokens") ?? "null"),
 *   setTokens: (t) => localStorage.setItem("mw_tokens", JSON.stringify(t)),
 *   clearTokens: () => localStorage.removeItem("mw_tokens"),
 * };
 * ```
 */
export interface TokenStorage {
  getTokens(): AuthTokens | null | Promise<AuthTokens | null>;
  setTokens(tokens: AuthTokens): void | Promise<void>;
  clearTokens(): void | Promise<void>;
}
