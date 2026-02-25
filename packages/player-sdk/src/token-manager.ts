import type { AuthTokens, TokenStorage } from "./types";

const TOKEN_EXPIRY_BUFFER_MS = 5 * 60_000; // 5 phút

/**
 * In-memory token storage.
 *
 * Mặc định cho môi trường không có persistent storage.
 * Consumer có thể thay bằng localStorage, AsyncStorage, secure storage, ...
 *
 * @example
 * ```ts
 * // Sử dụng mặc định (in-memory)
 * const client = createPlayerClient({ baseUrl: "..." });
 *
 * // Hoặc custom localStorage
 * const client = createPlayerClient({
 *   baseUrl: "...",
 *   tokenStorage: {
 *     getTokens: () => JSON.parse(localStorage.getItem("tokens") ?? "null"),
 *     setTokens: (t) => localStorage.setItem("tokens", JSON.stringify(t)),
 *     clearTokens: () => localStorage.removeItem("tokens"),
 *   },
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
 * - Tự động refresh trước khi hết hạn (buffer 5 phút)
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

  async getAccessToken(): Promise<string | null> {
    const tokens = await this.storage.getTokens();
    if (!tokens) return null;

    if (!this.isExpired(tokens)) {
      return tokens.accessToken;
    }

    const refreshed = await this.refreshIfNeeded(tokens);
    return refreshed?.accessToken ?? null;
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
  private async refreshIfNeeded(
    tokens: AuthTokens,
  ): Promise<AuthTokens | null> {
    if (!this.refreshFn) return null;

    if (this.refreshPromise) return this.refreshPromise;

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
