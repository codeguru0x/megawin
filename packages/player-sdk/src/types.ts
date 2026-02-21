/**
 * Player SDK types.
 *
 * Auth flow (JWKS assertion):
 * 1. Server khách hàng tạo signed JWT bằng private key
 * 2. SDK gửi JWT assertion lên MegaWin API Gateway
 * 3. Cognito custom auth trigger verify bằng JWKS public key của khách hàng
 * 4. Thành công → trả Cognito tokens (access, refresh, id)
 * 5. SDK gửi access token (Bearer) mỗi request, API Gateway verify qua Cognito JWKS
 * 6. Token hết hạn → SDK dùng refresh token lấy token mới
 */

export interface AuthTokens {
  /** Cognito Access Token (JWT) – gửi qua Bearer header. */
  accessToken: string;
  /** Cognito Refresh Token – dùng lấy access token mới khi hết hạn. */
  refreshToken: string;
  /** Cognito ID Token (JWT) – chứa user claims. */
  idToken?: string;
  /** Thời điểm access token hết hạn (epoch ms). */
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
 * Response từ server sau khi Cognito custom auth trigger verify thành công.
 */
export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  idToken?: string;
  /** Thời gian sống của access token (giây). */
  expiresIn: number;
}

/**
 * Adapter lưu trữ token – consumer tự chọn storage.
 *
 * - Browser: localStorage / sessionStorage
 * - React Native: AsyncStorage / SecureStore
 * - Node.js: file / memory
 *
 * Mặc định: MemoryTokenStorage (in-memory).
 */
export interface TokenStorage {
  getTokens(): AuthTokens | null | Promise<AuthTokens | null>;
  setTokens(tokens: AuthTokens): void | Promise<void>;
  clearTokens(): void | Promise<void>;
}
