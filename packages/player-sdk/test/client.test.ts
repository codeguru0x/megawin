import { describe, it, expect, vi, beforeEach } from "vitest";
import { createPlayerClient, type PlayerClient, type PlayerSdkConfig } from "../src";

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
    const noTokenClient = createPlayerClient({
      baseUrl: "https://api.test.com",
    });
    const isAuth = await noTokenClient.auth.isAuthenticated();
    expect(isAuth).toBe(false);
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
