/**
 * Handler test (mock, KHÔNG DB) — kích hoạt suite cho apps/api-tenant.
 *
 * `list-players` hiện là stub: trả tenantId + query filters, chưa inject use-case
 * (không chạm DB). Mock `withTenantAuth` thành identity để chạy thẳng inner
 * handler với mock event đã inject sẵn `event.tenant` — verify envelope response.
 */

import { describe, it, expect, vi } from "vitest";
import { createMockEvent, parseBody } from "./helpers/mock-event";

// withTenantAuth bình thường verify API key qua MongoDB — mock thành identity
// (bỏ qua auth) để test chạy KHÔNG cần DB.
vi.mock("@megawin/auth/tenant", () => ({
  withTenantAuth: (fn: (event: unknown) => unknown) => fn,
}));

const { handler } = await import("../src/handlers/list-players");

describe("GET /tenant/players — list-players handler", () => {
  it("trả 200 + tenantId + filters từ query", async () => {
    const event = createMockEvent({ queryStringParameters: { status: "active", page: "1" } });

    const res = (await handler(event as never)) as { statusCode: number; body: string };

    expect(res.statusCode).toBe(200);
    const parsed = parseBody<{ tenantId: string; players: unknown[]; filters: unknown }>(res);
    expect(parsed.success).toBe(true);
    expect(parsed.data?.tenantId).toBe("tenant-001");
    expect(parsed.data?.players).toEqual([]);
    expect(parsed.data?.filters).toEqual({ status: "active", page: "1" });
  });
});
