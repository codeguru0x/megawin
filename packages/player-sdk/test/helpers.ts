import { vi } from "vitest";
import { createPlayerClient, MemoryTokenStorage, type PlayerClient } from "../src";

export const TOKENS = {
  accessToken: "test-token",
  refreshToken: "test-refresh",
  expiresAt: Date.now() + 3600_000,
};

export function createTestClient(): PlayerClient {
  return createPlayerClient({
    baseUrl: "https://api.test.com",
    tokens: TOKENS,
    tokenStorage: new MemoryTokenStorage(),
  });
}

export function mockFetch(data: unknown) {
  return vi.fn().mockResolvedValue({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: () => Promise.resolve({ success: true, data }),
  });
}

export function mockFetchError(code: string, message: string, status = 400) {
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
