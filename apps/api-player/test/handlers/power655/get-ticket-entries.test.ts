/**
 * Tests: GET /player/power655/tickets/{ticketId}/entries
 *
 * Validates path parameter parsing, ownership-check delegation to the use case,
 * and correct response shape. Also verifies 401 when auth context is missing.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { createMockEvent, parseBody } from "#test/helpers/mock-event";

const MOCK_TICKET_ID = "507f1f77bcf86cd799439011";

const mockRun = vi.fn();

vi.mock("@megawin/game-power655-application/use-cases/player", () => ({
  GetTicketEntriesPlayerUseCase: class {
    run = mockRun;
  },
}));

describe("GET /player/power655/tickets/{ticketId}/entries", () => {
  let handler: typeof import("../../../src/handlers/power655/get-ticket-entries").handler;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.resetModules();
    const mod = await import("../../../src/handlers/power655/get-ticket-entries");
    handler = mod.handler;
  });

  /** Validates the use case receives tenantId, accountId, and ticketId. */
  it("should call use case with correct params", async () => {
    mockRun.mockResolvedValue({
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        data: { ticket: {}, entries: [] },
      }),
    });

    const event = createMockEvent({
      pathParameters: { ticketId: MOCK_TICKET_ID },
    });

    const response = await handler(event as any, {} as any);
    const body = parseBody(response as any);

    expect(response).toHaveProperty("statusCode", 200);
    expect(body.success).toBe(true);
    expect(mockRun).toHaveBeenCalledWith({
      tenantId: "tenant-001",
      accountId: "acc-001",
      ticketId: MOCK_TICKET_ID,
    });
  });

  /** Validates that missing auth context returns 401. */
  it("should return 401 when auth context is missing", async () => {
    const event = {
      httpMethod: "GET",
      headers: {},
      body: null,
      pathParameters: { ticketId: MOCK_TICKET_ID },
      queryStringParameters: {},
      requestContext: {},
    };

    const response = await handler(event as any, {} as any);
    const body = parseBody(response as any);

    expect(response).toHaveProperty("statusCode", 401);
    expect(body.success).toBe(false);
  });
});
