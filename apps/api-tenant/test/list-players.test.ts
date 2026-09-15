/**
 * Handler test (mock, KHÔNG DB) — kích hoạt suite cho apps/api-tenant.
 *
 * `list-players` hiện là stub: trả tenantId + query filters, chưa inject use-case
 * (không chạm DB). Mock `withTenantAuth` thành identity để chạy thẳng inner
 * handler với mock event đã inject sẵn `event.tenant` — verify raw return value
 * (chưa qua Middy envelope).
 */

import { describe, expect, it, vi } from "vitest";

import { createMockEvent } from "./helpers/mock-event";

// withTenantAuth bình thường verify API key qua MongoDB — mock thành identity
// (bỏ qua auth + envelope) để test chạy KHÔNG cần DB.
vi.mock("@megawin/auth/tenant", () => ({
  withTenantAuth: (fn: (event: unknown) => unknown) => fn,
}));

const { handler } = await import("../src/handlers/list-players");

describe("GET /tenant/players — list-players handler", () => {
  it("trả tenantId + filters từ query (raw handler output)", async () => {
    const event = createMockEvent({ queryStringParameters: { status: "active", page: "1" } });

    const res = (await handler(event as never, {} as never)) as {
      tenantId: string;
      players: unknown[];
      filters: unknown;
    };

    expect(res).toEqual({
      tenantId: "tenant-001",
      players: [],
      filters: { status: "active", page: "1" },
    });
  });
});
