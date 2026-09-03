/**
 * Auth types cho Player SDK.
 *
 * Auth flow:
 * 1. Server tenant gọi MegaWin server-to-server API để lấy token cho một player cụ thể.
 * 2. Server tenant truyền token đó xuống client app (qua session của chính tenant).
 * 3. Client app truyền token vào SDK — `createPlayerClient({ tokens })` hoặc `client.auth.setTokens()`.
 * 4. SDK gửi ID token qua Bearer header cho mọi request kể từ đó.
 * 5. Token gần hết hạn (trong vòng 5 phút) → SDK tự động refresh bằng refresh token, không cần
 *    tenant can thiệp.
 *
 * SDK không tự xác thực (không có flow "login" trong SDK) — token luôn được cấp bởi server tenant.
 */

export interface AuthTokens {
  /** Access Token (JWT). Không dùng trực tiếp cho request API — giữ lại để tương thích refresh flow. */
  accessToken: string;
  /** Refresh Token – dùng lấy access/id token mới khi hết hạn. */
  refreshToken: string;
  /**
   * ID Token (JWT) – gửi qua Bearer header cho mọi request API.
   *
   * Chứa thông tin định danh player/tenant cần thiết cho authorization ở phía server. Access
   * Token không đủ thông tin này nên request sẽ bị từ chối nếu gửi nhầm access token.
   */
  idToken: string;
  /** Thời điểm token hết hạn (epoch ms). */
  expiresAt: number;
}

/**
 * Response từ server khi refresh token thành công.
 */
export interface AuthResult {
  /** Access Token (JWT). */
  accessToken: string;
  /** ID Token (JWT) – dùng cho Bearer header của mọi request API. */
  idToken: string;
  /** Refresh Token mới – chỉ có ở flow login, refresh flow không trả lại. */
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
