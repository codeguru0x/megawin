import type { AuthTokens, TokenStorage } from "./types";

// ─────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60_000;

// ─────────────────────────────────────────────
// Session Storage Token Storage
// ─────────────────────────────────────────────
const SESSION_STORAGE_KEY = "mw_tokens";

/**
 * Token storage dùng `sessionStorage` (browser).
 *
 * **Đây là storage mặc định** khi tạo client bằng {@link createPlayerClient}.
 *
 * Đặc điểm:
 * - Tokens tồn tại qua page reload / navigation trong cùng tab
 * - Tokens **mất** khi đóng tab hoặc đóng browser
 * - Tokens **không** chia sẻ giữa các tab
 * - **Chỉ hỗ trợ browser** — không dùng được trên Node.js / React Native
 *
 * Nếu cần môi trường khác, dùng {@link MemoryTokenStorage} hoặc
 * tự implement {@link TokenStorage}.
 *
 * @example
 * ```ts
 * // Mặc định — không cần truyền, SDK tự dùng SessionStorageTokenStorage
 * const client = createPlayerClient({ baseUrl: "..." });
 *
 * // Hoặc truyền tường minh với custom key
 * import { SessionStorageTokenStorage } from "@megawin/player-sdk";
 *
 * const client = createPlayerClient({
 *   baseUrl: "...",
 *   tokenStorage: new SessionStorageTokenStorage("my_app_tokens"),
 * });
 * ```
 */
export class SessionStorageTokenStorage implements TokenStorage {
  private readonly key: string;

  /**
   * @param key - Key lưu trong sessionStorage. Mặc định: `"mw_tokens"`
   */
  constructor(key = SESSION_STORAGE_KEY) {
    this.key = key;
  }

  getTokens(): AuthTokens | null {
    const raw = sessionStorage.getItem(this.key);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as AuthTokens;
    } catch {
      return null;
    }
  }

  setTokens(tokens: AuthTokens): void {
    sessionStorage.setItem(this.key, JSON.stringify(tokens));
  }

  clearTokens(): void {
    sessionStorage.removeItem(this.key);
  }
}

/**
 * Token storage in-memory — tokens mất khi reload page.
 *
 * Dùng cho:
 * - **Node.js** / **React Native** (không có `sessionStorage`)
 * - Testing / môi trường không cần persist tokens
 *
 * @example
 * ```ts
 * import { createPlayerClient, MemoryTokenStorage } from "@megawin/player-sdk";
 *
 * // Node.js hoặc React Native
 * const client = createPlayerClient({
 *   baseUrl: "https://api.domain.com",
 *   tokenStorage: new MemoryTokenStorage(),
 * });
 * ```
 */
export class MemoryTokenStorage implements TokenStorage {
  private tokens: AuthTokens | null = null;

  getTokens(): AuthTokens | null {
    return this.tokens;
  }

  setTokens(tokens: AuthTokens): void {
    this.tokens = tokens;
  }

  clearTokens(): void {
    this.tokens = null;
  }
}

/**
 * Token Manager — quản lý lifecycle của auth tokens.
 *
 * - Tự động refresh ID Token trước khi hết hạn (buffer 5 phút)
 * - Deduplicate concurrent refresh calls
 * - Hỗ trợ async storage (React Native, browser, Node.js)
 *
 * @internal
 */
export class TokenManager {
  private storage: TokenStorage;
  private refreshPromise: Promise<AuthTokens | null> | null = null;
  private refreshFn?: (refreshToken: string) => Promise<AuthTokens | null>;

  constructor(storage: TokenStorage) {
    this.storage = storage;
  }

  /** Gán refresh function — gọi bởi AuthApi sau khi khởi tạo. */
  setRefreshFn(fn: (refreshToken: string) => Promise<AuthTokens | null>): void {
    this.refreshFn = fn;
  }

  /** Trả accessToken hiện tại từ storage, không trigger refresh. */
  async getAccessToken(): Promise<string | null> {
    const tokens = await this.storage.getTokens();
    return tokens?.accessToken ?? null;
  }

  /**
   * Lấy ID Token để gửi qua Bearer header cho API Gateway HTTP API v2.
   * Tự động refresh nếu token sắp hết hạn (< 5 phút).
   */
  async getIdToken(): Promise<string | null> {
    const tokens = await this.storage.getTokens();
    if (!tokens) return null;

    if (!this.isExpired(tokens)) {
      // idToken là bắt buộc — không fallback sang accessToken vì API Gateway
      // JWT authorizer yêu cầu aud claim chỉ có trên idToken.
      return tokens.idToken ?? null;
    }

    const refreshed = await this.refreshIfNeeded(tokens);
    if (!refreshed) return null;
    return refreshed.idToken ?? null;
  }

  async getTokens(): Promise<AuthTokens | null> {
    return this.storage.getTokens();
  }

  async setTokens(tokens: AuthTokens): Promise<void> {
    await this.storage.setTokens(tokens);
  }

  async clearTokens(): Promise<void> {
    this.refreshPromise = null;
    await this.storage.clearTokens();
  }

  private isExpired(tokens: AuthTokens): boolean {
    return Date.now() >= tokens.expiresAt - TOKEN_EXPIRY_BUFFER_MS;
  }

  /**
   * Deduplicate concurrent refresh calls — chỉ gọi refresh 1 lần
   * dù nhiều request đồng thời trigger.
   */
  private async refreshIfNeeded(tokens: AuthTokens): Promise<AuthTokens | null> {
    if (!this.refreshFn) return null;

    if (this.refreshPromise !== null) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.doRefresh(tokens.refreshToken);

    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  private async doRefresh(refreshToken: string): Promise<AuthTokens | null> {
    try {
      const newTokens = await this.refreshFn!(refreshToken);
      if (newTokens) {
        await this.storage.setTokens(newTokens);
      }
      return newTokens;
    } catch {
      await this.storage.clearTokens();
      return null;
    }
  }
}
