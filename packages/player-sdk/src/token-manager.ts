import type { AuthTokens, TokenStorage } from "./types";

const TOKEN_EXPIRY_BUFFER_MS = 60_000;

/**
 * In-memory token storage – mặc định cho môi trường không có persistent storage.
 * Consumer có thể thay bằng localStorage, AsyncStorage, secure storage, …
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

export class TokenManager {
  private storage: TokenStorage;
  private refreshPromise: Promise<AuthTokens | null> | null = null;

  constructor(
    storage: TokenStorage,
    private onRefresh?: (refreshToken: string) => Promise<AuthTokens | null>,
  ) {
    this.storage = storage;
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
   * Deduplicate concurrent refresh calls – chỉ gọi refresh 1 lần dù nhiều request đồng thời.
   */
  private async refreshIfNeeded(
    tokens: AuthTokens,
  ): Promise<AuthTokens | null> {
    if (!this.onRefresh) return null;

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
      const newTokens = await this.onRefresh!(refreshToken);
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
