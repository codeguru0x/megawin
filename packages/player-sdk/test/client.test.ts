import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPlayerClient, MemoryTokenStorage, type PlayerClient, type PlayerSdkConfig } from "../src";

/**
 * Mock sessionStorage cho test environment (Node.js không có sessionStorage).
 */
function createMockSessionStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, value); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); },
    get length() { return store.size; },
    key: (index: number) => [...store.keys()][index] ?? null,
  };
}

/**
 * Mock global fetch cho tất cả tests.
 */
function mockFetch(data: unknown, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ success: true, data }),
  });
}

function mockFetchError(code: string, message: string, status = 400) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    statusText: "Error",
    headers: new Headers({ "content-type": "application/json" }),
    json: () =>
      Promise.resolve({
        success: false,
        error: { code, message },
      }),
  });
}

const BASE_CONFIG: PlayerSdkConfig = {
  baseUrl: "https://api.test.com",
  tokens: {
    accessToken: "test-access-token",
    refreshToken: "test-refresh-token",
    expiresAt: Date.now() + 3600_000,
  },
};

describe("createPlayerClient", () => {
  let client: PlayerClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal("sessionStorage", createMockSessionStorage());
    client = createPlayerClient(BASE_CONFIG);
  });

  it("should create client with all API modules", () => {
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.keno).toBeDefined();
    expect(client.lotto535).toBeDefined();
    expect(client.player).toBeDefined();
    expect(client.api).toBeDefined();
  });

  it("should be authenticated when tokens are provided in config", async () => {
    const isAuth = await client.auth.isAuthenticated();
    expect(isAuth).toBe(true);
  });

  it("should not be authenticated when no tokens are provided", async () => {
    const freshStorage = createMockSessionStorage();
    vi.stubGlobal("sessionStorage", freshStorage);

    const noTokenClient = createPlayerClient({
      baseUrl: "https://api.test.com",
    });
    const isAuth = await noTokenClient.auth.isAuthenticated();
    expect(isAuth).toBe(false);
  });

  it("should work with MemoryTokenStorage", async () => {
    const memClient = createPlayerClient({
      ...BASE_CONFIG,
      tokenStorage: new MemoryTokenStorage(),
    });
    const isAuth = await memClient.auth.isAuthenticated();
    expect(isAuth).toBe(true);
    const token = await memClient.auth.getAccessToken();
    expect(token).toBe("test-access-token");
  });

  it("should return access token from config tokens", async () => {
    const token = await client.auth.getAccessToken();
    expect(token).toBe("test-access-token");
  });

  it("should return full tokens from config", async () => {
    const tokens = await client.auth.getTokens();
    expect(tokens).toEqual(BASE_CONFIG.tokens);
  });
});

describe("auth.setTokens", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createMockSessionStorage());
  });

  it("should update tokens", async () => {
    const client = createPlayerClient({ baseUrl: "https://api.test.com" });

    expect(await client.auth.isAuthenticated()).toBe(false);

    await client.auth.setTokens({
      accessToken: "new-token",
      refreshToken: "new-refresh",
      expiresAt: Date.now() + 3600_000,
    });

    expect(await client.auth.isAuthenticated()).toBe(true);
    expect(await client.auth.getAccessToken()).toBe("new-token");
  });
});

describe("auth.logout", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createMockSessionStorage());
  });

  it("should clear tokens after logout", async () => {
    vi.stubGlobal("fetch", mockFetch(null));

    const client = createPlayerClient(BASE_CONFIG);

    expect(await client.auth.isAuthenticated()).toBe(true);

    await client.auth.logout();

    expect(await client.auth.isAuthenticated()).toBe(false);
    expect(await client.auth.getAccessToken()).toBeNull();
  });

  it("should call logout endpoint", async () => {
    const fetchMock = mockFetch(null);
    vi.stubGlobal("fetch", fetchMock);

    const client = createPlayerClient(BASE_CONFIG);
    await client.auth.logout();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test.com/auth/logout");
    expect(init.method).toBe("POST");
  });

  it("should clear tokens even if server errors", async () => {
    vi.stubGlobal("fetch", mockFetchError("SERVER_ERROR", "Internal error", 500));

    const client = createPlayerClient(BASE_CONFIG);
    await client.auth.logout();

    expect(await client.auth.isAuthenticated()).toBe(false);
  });
});

describe("auth - token refresh", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", createMockSessionStorage());
  });

  it("should auto-refresh expired token", async () => {
    const fetchMock = mockFetch({
      accessToken: "refreshed-token",
      refreshToken: "test-refresh-token",
      expiresIn: 3600,
    });
    vi.stubGlobal("fetch", fetchMock);

    const client = createPlayerClient({
      baseUrl: "https://api.test.com",
      tokens: {
        accessToken: "expired-token",
        refreshToken: "test-refresh-token",
        expiresAt: Date.now() - 1000,
      },
    });

    const token = await client.auth.getAccessToken();
    expect(token).toBe("refreshed-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.test.com/auth/refresh");
  });

  it("should call onSessionExpired when refresh fails", async () => {
    const onSessionExpired = vi.fn();
    vi.stubGlobal("fetch", mockFetchError("INVALID_TOKEN", "Token expired", 401));

    const client = createPlayerClient({
      baseUrl: "https://api.test.com",
      tokens: {
        accessToken: "expired-token",
        refreshToken: "bad-refresh",
        expiresAt: Date.now() - 1000,
      },
      onSessionExpired,
    });

    const token = await client.auth.getAccessToken();
    expect(token).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
  });
});

describe("SessionStorageTokenStorage", () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockSessionStorage();
    vi.stubGlobal("sessionStorage", mockStorage);
  });

  it("should store and retrieve tokens via sessionStorage", async () => {
    const client = createPlayerClient({
      baseUrl: "https://api.test.com",
    });

    expect(await client.auth.isAuthenticated()).toBe(false);

    const tokens = {
      accessToken: "sess-token",
      refreshToken: "sess-refresh",
      expiresAt: Date.now() + 3600_000,
    };
    await client.auth.setTokens(tokens);

    expect(await client.auth.isAuthenticated()).toBe(true);
    expect(await client.auth.getAccessToken()).toBe("sess-token");

    const stored = mockStorage.getItem("mw_tokens");
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toEqual(tokens);
  });

  it("should clear tokens from sessionStorage on logout", async () => {
    vi.stubGlobal("fetch", mockFetch(null));

    const client = createPlayerClient({
      baseUrl: "https://api.test.com",
      tokens: {
        accessToken: "sess-token",
        refreshToken: "sess-refresh",
        expiresAt: Date.now() + 3600_000,
      },
    });

    expect(mockStorage.getItem("mw_tokens")).not.toBeNull();

    await client.auth.logout();

    expect(mockStorage.getItem("mw_tokens")).toBeNull();
    expect(await client.auth.isAuthenticated()).toBe(false);
  });

  it("should persist tokens across client instances (same sessionStorage)", async () => {
    const tokens = {
      accessToken: "persist-token",
      refreshToken: "persist-refresh",
      expiresAt: Date.now() + 3600_000,
    };

    const client1 = createPlayerClient({
      baseUrl: "https://api.test.com",
      tokens,
    });
    expect(await client1.auth.isAuthenticated()).toBe(true);

    const client2 = createPlayerClient({
      baseUrl: "https://api.test.com",
    });
    expect(await client2.auth.isAuthenticated()).toBe(true);
    expect(await client2.auth.getAccessToken()).toBe("persist-token");
  });

  it("should return null for corrupted sessionStorage data", async () => {
    mockStorage.setItem("mw_tokens", "invalid-json{{{");

    const client = createPlayerClient({
      baseUrl: "https://api.test.com",
    });
    expect(await client.auth.isAuthenticated()).toBe(false);
    expect(await client.auth.getAccessToken()).toBeNull();
  });
});
